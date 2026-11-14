import type { GameEvent, PlayerId, Vec2 } from '@hookbrawl/sim';
import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { CALM_IMPACTS, IMPACTS, impactsOf, type Impact } from '../impact/impacts';
import { createHitReaction } from './hitReaction';

const me = 'me' as PlayerId;
const foe = 'foe' as PlayerId;
/** The foe stands east of me, so my blows travel along +x and theirs along -x. */
const positionOf = (id: PlayerId): Vec2 => (id === me ? { x: 0, y: 0 } : { x: 80, y: 0 });
const blow = (attackerId: PlayerId, targetId: PlayerId, specs = IMPACTS): Impact => {
  const event: GameEvent = { kind: 'melee', attackerId, targetId, damage: 110, at: positionOf(targetId) };
  return impactsOf([event], (id) => ({ pos: positionOf(id), team: id === me ? 'west' : 'east' }), me, specs)[0]!;
};
const FRAME = 1 / 60;

function run(seconds: number, reaction: ReturnType<typeof createHitReaction>, pivot: Object3D, each?: () => void): void {
  for (let t = 0; t < seconds; t += FRAME) {
    reaction.step(null, null, FRAME);
    reaction.pose(pivot);
    each?.();
  }
}

describe('hit reaction', () => {
  it('does nothing to a fighter nobody has touched', () => {
    const reaction = createHitReaction();
    const pivot = new Object3D();
    reaction.step(null, null, FRAME);
    reaction.pose(pivot);
    expect(reaction.frozen()).toBe(false);
    expect(reaction.flash()).toBe(0);
    expect(reaction.swingHeading()).toBeNull();
    expect(pivot.position.length()).toBe(0);
  });

  it('throws the attacker forward on contact and freezes them there', () => {
    const reaction = createHitReaction();
    const pivot = new Object3D();
    reaction.step(blow(me, foe), null, FRAME);
    reaction.pose(pivot);
    expect(reaction.frozen()).toBe(true);
    expect(pivot.position.x).toBeCloseTo(IMPACTS.melee.lunge.distance);
    expect(reaction.swingHeading()).toBeCloseTo(0);
    expect(reaction.flash()).toBe(0);
  });

  it('lights the victim at once, holds them through the freeze, then knocks them away from the attacker', () => {
    const reaction = createHitReaction();
    const pivot = new Object3D();
    reaction.step(null, blow(foe, me), FRAME);
    reaction.pose(pivot);
    expect(reaction.flash()).toBe(1);
    expect(reaction.frozen()).toBe(true);
    expect(pivot.position.x).toBe(0);
    let furthest = 0;
    run(0.3, reaction, pivot, () => (furthest = Math.min(furthest, pivot.position.x)));
    expect(furthest).toBeLessThan(-IMPACTS.melee.recoil.distance * 0.8);
    expect(furthest).toBeGreaterThanOrEqual(-IMPACTS.melee.recoil.distance);
  });

  it('never drifts: after a long trade of blows the body is back exactly on its sim position, upright', () => {
    const reaction = createHitReaction();
    const pivot = new Object3D();
    let furthest = 0;
    for (let i = 0; i < 20; i += 1) {
      reaction.step(blow(me, foe), blow(foe, me), FRAME);
      reaction.pose(pivot);
      run(0.7, reaction, pivot, () => (furthest = Math.max(furthest, pivot.position.length())));
    }
    expect(furthest).toBeLessThanOrEqual(Math.max(IMPACTS.melee.lunge.distance, IMPACTS.melee.recoil.distance));
    expect(pivot.position.length()).toBe(0);
    expect(Math.abs(pivot.rotation.x)).toBe(0);
    expect(Math.abs(pivot.rotation.z)).toBe(0);
    expect(reaction.frozen()).toBe(false);
    expect(reaction.flash()).toBe(0);
  });

  it('does not freeze anyone when asked for less motion', () => {
    const reaction = createHitReaction();
    reaction.step(blow(me, foe, CALM_IMPACTS), blow(foe, me, CALM_IMPACTS), FRAME);
    expect(reaction.frozen()).toBe(false);
    expect(reaction.flash()).toBe(1);
  });

  it('forgets everything on reset', () => {
    const reaction = createHitReaction();
    const pivot = new Object3D();
    reaction.step(blow(me, foe), blow(foe, me), FRAME);
    reaction.reset();
    reaction.pose(pivot);
    expect(reaction.frozen()).toBe(false);
    expect(reaction.swingHeading()).toBeNull();
    expect(pivot.position.length()).toBe(0);
  });
});
