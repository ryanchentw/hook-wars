import { describe, expect, it } from 'vitest';
import { VISION, viewFor } from '../index';
import type { GameState, HookId } from '../index';
import { at, fogMatch, hookOf, withPickup, withPlayer } from './helpers';

const W = at(400, 600);
const R = VISION.radius;

/** `w` at W under fog, `e` far out of its sight on the east dock. */
function fogged(): GameState {
  return withPlayer(withPlayer(fogMatch(), 'w', { pos: W }), 'e', { pos: at(2300, 1300) });
}

const seenIds = (s: GameState) => viewFor(s, 'west').pickups.map((p) => p.id);

describe('pickups under fog', () => {
  it('shows a drifting pickup only inside the team\'s vision', () => {
    expect(seenIds(withPickup(fogged(), 'gold', at(W.x + R - 1, W.y)))).toEqual(['p0']);
    const far = withPickup(fogged(), 'gold', at(W.x + R + 1, W.y));
    expect(seenIds(far)).toEqual([]);
    expect(JSON.stringify(viewFor(far, 'west'))).not.toContain(String(W.x + R + 1));
  });

  it('shows every pickup under open vision', () => {
    expect(viewFor(withPickup(fogMatch(undefined, false), 'storm', at(1300, 1300)), 'west').pickups).toHaveLength(1);
  });

  it('shows a carried pickup wherever the hook carrying it is seen, and nowhere else', () => {
    const carry = (headAt: { x: number; y: number }, owner: string): GameState => {
      const h = hookOf(owner, headAt, { phase: { kind: 'retracting', cargo: { kind: 'pickup', id: 'p0' as never } } });
      const s = withPickup(fogged(), 'gale', headAt, { state: { kind: 'carried', hookId: h.id } });
      return { ...s, hooks: [h] };
    };
    const hiddenHead = at(W.x + R + 200, W.y);
    expect(seenIds(carry(hiddenHead, 'e'))).toEqual([]);
    expect(viewFor(carry(hiddenHead, 'e'), 'west').hooks).toEqual([]);
    expect(seenIds(carry(at(W.x + 300, W.y), 'e'))).toEqual(['p0']);
    expect(seenIds(carry(hiddenHead, 'w'))).toEqual(['p0']);
    expect(viewFor(carry(hiddenHead, 'w'), 'west').hooks.map((h) => h.id)).toEqual(['w-hook' as HookId]);
  });
});
