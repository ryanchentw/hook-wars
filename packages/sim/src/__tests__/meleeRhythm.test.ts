import { describe, expect, it } from 'vitest';
import { step, TICK_DT, TICK_RATE, TUNING } from '../index';
import type { GameState, PlayerInput } from '../index';
import { at, match, pid, withPlayer } from './helpers';

type Swing = { readonly tick: number; readonly attackerId: string };

function swingsOver(start: GameState, ticks: number, first: readonly PlayerInput[] = []): readonly Swing[] {
  let state = start;
  const swings: Swing[] = [];
  for (let i = 0; i < ticks; i++) {
    state = step(state, i === 0 ? first : [], TICK_DT);
    for (const e of state.events) if (e.kind === 'melee') swings.push({ tick: state.tick, attackerId: e.attackerId });
  }
  return swings;
}

function duel(): GameState {
  const s = match([
    ['w', 'west'],
    ['e', 'east'],
  ]);
  return withPlayer(withPlayer(s, 'w', { pos: at(900, 335) }), 'e', { pos: at(1500, 335) });
}

const INTERVAL_TICKS = Math.round(TUNING.meleeInterval * TICK_RATE);

describe('melee rhythm', () => {
  it('swings on exactly the interval, with no tick lost to float drift', () => {
    const close = withPlayer(duel(), 'e', { pos: at(900 + TUNING.bodySpacing, 335) });
    const mine = swingsOver(close, 200).filter((s) => s.attackerId === 'w');
    const gaps = mine.slice(1).map((s, i) => s.tick - mine[i]!.tick);
    expect(gaps.length).toBeGreaterThan(5);
    expect(new Set(gaps)).toEqual(new Set([INTERVAL_TICKS]));
  });

  it('gives the thrower the first blow on a dragged enemy, then the two alternate', () => {
    const swings = swingsOver(duel(), 240, [{ kind: 'hook', playerId: pid('w'), target: at(1500, 335) }]);
    expect(swings.length).toBeGreaterThan(6);
    expect(swings[0]!.attackerId).toBe('w');
    const sameTick = swings.filter((s, i) => i > 0 && swings[i - 1]!.tick === s.tick);
    expect(sameTick).toEqual([]);
    swings.slice(1).forEach((s, i) => expect(s.attackerId).not.toBe(swings[i]!.attackerId));
  });

  it('makes a player who lands from a grapple wait before swinging at whoever stands there', () => {
    const invader = withPlayer(duel(), 'w', {
      pos: at(960, 335),
      items: { grapple: { kind: 'owned', readyAt: 0 } },
    });
    const defended = withPlayer(invader, 'e', { pos: at(1440 + TUNING.bodySpacing, 335) });
    const swings = swingsOver(defended, 120, [{ kind: 'grapple', playerId: pid('w'), target: at(1440, 335) }]);
    expect(swings[0]!.attackerId).toBe('e');
    expect(swings[1]!.attackerId).toBe('w');
    expect(swings[1]!.tick).toBeGreaterThan(swings[0]!.tick);
  });
});
