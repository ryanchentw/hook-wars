import type { SeenEvent, SeenPlayer } from '@hookwars/sim';
import { envelope } from '../impact/timing';
import { FLOURISH } from '../theme';

const SHAPE = { attack: 0, hold: 0, release: FLOURISH.life } as const;

/** Whether this tick's events hold a purchase by `player` that should light them up. */
export function startsFlourish(player: SeenPlayer, events: readonly SeenEvent[]): boolean {
  return player.status.kind !== 'dead' && events.some((e) => e.kind === 'purchase' && e.playerId === player.id);
}

/** 0 to 1, `age` seconds after the purchase: full at once, then easing out to exactly nothing. */
export function flourishGlow(age: number): number {
  return envelope(age, SHAPE);
}
