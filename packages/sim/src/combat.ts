import { TEAMS } from './arena';
import { TUNING } from './config';
import { assistsOn, logDamage, reward, type KillRecord } from './economy';
import { distance } from './geometry';
import { endGrapple } from './grapple';
import { interrupt } from './intent';
import type { GameEvent, GameState, Player, PlayerId, TeamId } from './types';
import { ownsHook, type Stage } from './world';

type Blow = { readonly attacker: Player; readonly target: Player };

/** Step times are summed floats, so a swing due at exactly this step can read a hair late and slip a tick. */
const READY_SLACK = 1e-9;

const hittable = (p: Player): boolean => p.status.kind !== 'dead';

/** Melee is a swing of the hook, so it needs the hook in hand and the owner on their feet. */
const canSwing = (state: GameState, p: Player, t: number): boolean =>
  p.status.kind === 'alive' && t + READY_SLACK >= p.meleeReadyAt && !ownsHook(state, p.id);

function chooseTarget(state: GameState, attacker: Player): Player | null {
  return state.players
    .filter((q) => q.team !== attacker.team && hittable(q))
    .filter((q) => distance(q.pos, attacker.pos) <= TUNING.meleeRange)
    .reduce<Player | null>(
      (best, q) => (!best || distance(q.pos, attacker.pos) < distance(best.pos, attacker.pos) ? q : best),
      null,
    );
}

/** Every swing is chosen from the same snapshot, so adjacent enemies trade blows simultaneously. */
export const resolveMelee: Stage = (state, { t }) => {
  const blows = state.players
    .filter((p) => canSwing(state, p, t))
    .flatMap((attacker): Blow[] => {
      const target = chooseTarget(state, attacker);
      return target ? [{ attacker, target }] : [];
    });
  const players = state.players.map((p) => {
    const from = blows.filter((b) => b.target.id === p.id).map((b) => b.attacker.id);
    const struck = from.reduce((acc, id) => logDamage(acc, id, t), p);
    const swung = blows.some((b) => b.attacker.id === p.id);
    return {
      ...struck,
      hp: p.hp - from.length * TUNING.meleeDamage,
      meleeReadyAt: swung ? t + TUNING.meleeInterval : p.meleeReadyAt,
    };
  });
  const events: GameEvent[] = blows.map(({ attacker, target }) => ({
    kind: 'melee',
    attackerId: attacker.id,
    targetId: target.id,
    damage: TUNING.meleeDamage,
    at: target.pos,
  }));
  return { state: { ...state, players }, events };
};

/** Who struck each damaging blow, or null for an event that is not one. */
function strikerOf(e: GameEvent, victim: PlayerId): PlayerId | null {
  switch (e.kind) {
    case 'melee':
      return e.targetId === victim ? e.attackerId : null;
    case 'hookHit':
      return e.targetId === victim && e.damage > 0 ? e.ownerId : null;
    case 'storm':
      return e.targetId === victim ? e.sourceId : null;
    default:
      return null;
  }
}

/** The killer is whoever dealt the last damaging blow to the victim during this step; Storm's blows are its collector's. */
function killerOf(events: readonly GameEvent[], victim: PlayerId): PlayerId | null {
  return events.map((e) => strikerOf(e, victim)).filter((id) => id !== null).at(-1) ?? null;
}

function die(p: Player, t: number): Player {
  return {
    ...p,
    status: { kind: 'dead', respawnAt: t + TUNING.respawnDelay },
    move: interrupt(p.move),
    deaths: p.deaths + 1,
    recentDamage: [],
    effects: [],
  };
}

export const resolveDeaths: Stage = (state, { t, events: stepEvents }) => {
  const victims = state.players.filter((p) => p.status.kind !== 'dead' && p.hp <= 0);
  const kills = victims.flatMap((victim): KillRecord[] => {
    const killerId = killerOf(stepEvents, victim.id);
    return killerId ? [{ killerId, victim, assistIds: assistsOn(victim, killerId) }] : [];
  });
  const victimIds = new Set(victims.map((v) => v.id));
  const killerTeam = (id: PlayerId): TeamId | undefined => state.players.find((p) => p.id === id)?.team;
  const players = state.players.map((p) => {
    const rewarded = reward(p, kills);
    return victimIds.has(p.id) ? die(rewarded, t) : rewarded;
  });
  const score = TEAMS.reduce(
    (acc, team) => ({ ...acc, [team]: acc[team] + kills.filter((k) => killerTeam(k.killerId) === team).length }),
    state.score,
  );
  const hooks = state.hooks.map((h) =>
    h.phase.kind === 'retracting' && h.phase.cargo?.kind === 'fighter' && victimIds.has(h.phase.cargo.id)
      ? { ...h, phase: { kind: 'retracting' as const, cargo: null } }
      : h,
  );
  const events: GameEvent[] = kills.map(({ killerId, victim, assistIds }) => ({
    kind: 'kill',
    killerId,
    victimId: victim.id,
    assistIds,
    at: victim.pos,
  }));
  const settled = victims.reduce<GameState>((s, v) => endGrapple(s, v.id, t), { ...state, players, score, hooks });
  return { state: settled, events };
};

/** A simultaneous tie at or past the target keeps the match going until one team leads. */
export const checkWin: Stage = (state) => {
  const [leader, other] = [...TEAMS].sort((a, b) => state.score[b] - state.score[a]) as [TeamId, TeamId];
  if (state.score[leader] < state.killTarget || state.score[leader] === state.score[other]) {
    return { state, events: [] };
  }
  return { state: { ...state, phase: { kind: 'ended', winner: leader } }, events: [{ kind: 'matchEnd', winner: leader }] };
};
