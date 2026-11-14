import { TEAMS } from './arena';
import { TUNING } from './config';
import { distance } from './geometry';
import { interrupt } from './intent';
import type { GameEvent, GameState, Player, PlayerId, TeamId } from './types';
import type { Stage } from './world';

type Blow = { readonly attacker: Player; readonly target: Player };

const hittable = (p: Player): boolean => p.status.kind === 'alive' || p.status.kind === 'dragged';

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
    .filter((p) => p.status.kind === 'alive' && t >= p.meleeReadyAt)
    .flatMap((attacker): Blow[] => {
      const target = chooseTarget(state, attacker);
      return target ? [{ attacker, target }] : [];
    });
  const players = state.players.map((p) => {
    const taken = blows.filter((b) => b.target.id === p.id).length * TUNING.meleeDamage;
    const swung = blows.some((b) => b.attacker.id === p.id);
    return { ...p, hp: p.hp - taken, meleeReadyAt: swung ? t + TUNING.meleeInterval : p.meleeReadyAt };
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

/** The killer is whoever dealt the last damaging blow to the victim during this step. */
function killerOf(events: readonly GameEvent[], victim: PlayerId): PlayerId | null {
  const blow = events
    .filter((e) => (e.kind === 'melee' || (e.kind === 'hookHit' && e.damage > 0)) && e.targetId === victim)
    .at(-1);
  if (blow?.kind === 'melee') return blow.attackerId;
  if (blow?.kind === 'hookHit') return blow.ownerId;
  return null;
}

function die(p: Player, t: number): Player {
  return {
    ...p,
    status: { kind: 'dead', respawnAt: t + TUNING.respawnDelay },
    move: interrupt(p.move),
    deaths: p.deaths + 1,
  };
}

export const resolveDeaths: Stage = (state, { t, events: stepEvents }) => {
  const victims = state.players.filter((p) => p.status.kind !== 'dead' && p.hp <= 0);
  const kills = victims.flatMap((v) => {
    const killerId = killerOf(stepEvents, v.id);
    return killerId ? [{ killerId, victim: v }] : [];
  });
  const victimIds = new Set(victims.map((v) => v.id));
  const killerTeam = (id: PlayerId): TeamId | undefined => state.players.find((p) => p.id === id)?.team;
  const players = state.players.map((p) => {
    const credited = kills.filter((k) => k.killerId === p.id).length;
    const scored = credited === 0 ? p : { ...p, kills: p.kills + credited };
    return victimIds.has(p.id) ? die(scored, t) : scored;
  });
  const score = TEAMS.reduce(
    (acc, team) => ({ ...acc, [team]: acc[team] + kills.filter((k) => killerTeam(k.killerId) === team).length }),
    state.score,
  );
  const hooks = state.hooks.map((h) =>
    h.phase.kind === 'retracting' && h.phase.cargo !== null && victimIds.has(h.phase.cargo)
      ? { ...h, phase: { kind: 'retracting' as const, cargo: null } }
      : h,
  );
  const events: GameEvent[] = kills.map(({ killerId, victim }) => ({
    kind: 'kill',
    killerId,
    victimId: victim.id,
    at: victim.pos,
  }));
  return { state: { ...state, players, score, hooks }, events };
};

/** A simultaneous tie at or past the target keeps the match going until one team leads. */
export const checkWin: Stage = (state) => {
  const [leader, other] = [...TEAMS].sort((a, b) => state.score[b] - state.score[a]) as [TeamId, TeamId];
  if (state.score[leader] < state.killTarget || state.score[leader] === state.score[other]) {
    return { state, events: [] };
  }
  return { state: { ...state, phase: { kind: 'ended', winner: leader } }, events: [{ kind: 'matchEnd', winner: leader }] };
};
