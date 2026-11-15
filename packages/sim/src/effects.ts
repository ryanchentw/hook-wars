import { EFFECTS } from './config';
import { logDamage } from './economy';
import type { Effect, EffectKind, GameEvent, HookStats, Player, PlayerId } from './types';
import type { Stage } from './world';

/** Summed float time lands a hair either side of a pulse, so pulses are counted with a little slack. */
const SLACK = 1e-6;

/** Starts `kind` on `p` now; a second of the same kind starts it over rather than stacking. */
export function addEffect(p: Player, kind: EffectKind, source: PlayerId, t: number): Player {
  const effect: Effect = { kind, source, since: t, until: t + EFFECTS[kind].duration };
  return { ...p, effects: [...p.effects.filter((e) => e.kind !== kind), effect] };
}

const scaleOf = (effects: readonly Effect[], pick: (kind: EffectKind) => number): number =>
  effects.reduce((k, e) => k * pick(e.kind), 1);

/** Walking speed is multiplied by every effect in force. */
export const moveScale = (p: Pick<Player, 'effects'>): number => scaleOf(p.effects, (kind) => EFFECTS[kind].moveScale);

/** A hook's speeds are taken when it is thrown, like the rest of its stats, so an effect ending mid-flight changes nothing in the air. */
export function boostHook(stats: HookStats, p: Pick<Player, 'effects'>): HookStats {
  const k = scaleOf(p.effects, (kind) => EFFECTS[kind].hookScale);
  return k === 1 ? stats : { ...stats, speed: stats.speed * k, retractSpeed: stats.retractSpeed * k };
}

/** Pulses `e` has dealt by time `t`: one at every whole interval after it began, the last at `until`. */
function pulsesBy(e: Effect, interval: number, t: number): number {
  const total = Math.round((e.until - e.since) / interval);
  return Math.min(total, Math.max(0, Math.floor((t - e.since) / interval + SLACK)));
}

type Struck = { readonly player: Player; readonly events: readonly GameEvent[] };

function pulse(p: Player, e: Effect, t: number, dt: number): Struck {
  const spec = EFFECTS[e.kind].pulse;
  if (spec === null || p.status.kind === 'dead') return { player: p, events: [] };
  const due = pulsesBy(e, spec.interval, t + dt) - pulsesBy(e, spec.interval, t);
  if (due === 0) return { player: p, events: [] };
  const damage = due * spec.damage;
  const event: GameEvent = { kind: 'storm', sourceId: e.source, targetId: p.id, damage, at: p.pos };
  return { player: { ...logDamage(p, e.source, t), hp: p.hp - damage }, events: [event] };
}

/** Deals every pulse due this step, then drops each effect whose time is up by the end of it. */
function tickEffects(p: Player, t: number, dt: number): Struck {
  if (p.effects.length === 0) return { player: p, events: [] };
  const struck = p.effects.reduce<Struck>((acc, e) => {
    const next = pulse(acc.player, e, t, dt);
    return { player: next.player, events: [...acc.events, ...next.events] };
  }, { player: p, events: [] });
  const effects = struck.player.effects.filter((e) => e.until > t + dt + SLACK);
  return { player: { ...struck.player, effects }, events: struck.events };
}

export const advanceEffects: Stage = (state, { t, dt }) => {
  const ticked = state.players.map((p) => tickEffects(p, t, dt));
  return { state: { ...state, players: ticked.map((x) => x.player) }, events: ticked.flatMap((x) => x.events) };
};
