import { DEFAULT_ARENA, ITEM_IDS, TUNING, UPGRADE_IDS, UPGRADES } from '@hookwars/sim';
import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { focusFor, poseFor } from '../render/camera/framing';
import { applyPose, worldToScreen } from '../render/camera/projection';
import { simToWorld } from '../render/space';
import { actionForKey, DIRECTION_VECTORS, facingAim, SHOP_SLOTS, steerVector } from './bindings';
import { fakePlayer, HUMAN } from './fakeSim';

describe('key bindings', () => {
  it('binds by physical key, so WASD and the arrows steer whatever the layout or IME', () => {
    expect(actionForKey('KeyW')).toEqual({ kind: 'steer', dir: 'north' });
    expect(actionForKey('ArrowUp')).toEqual({ kind: 'steer', dir: 'north' });
    expect(actionForKey('KeyS')).toEqual({ kind: 'steer', dir: 'south' });
    expect(actionForKey('ArrowDown')).toEqual({ kind: 'steer', dir: 'south' });
    expect(actionForKey('KeyA')).toEqual({ kind: 'steer', dir: 'west' });
    expect(actionForKey('ArrowLeft')).toEqual({ kind: 'steer', dir: 'west' });
    expect(actionForKey('KeyD')).toEqual({ kind: 'steer', dir: 'east' });
    expect(actionForKey('ArrowRight')).toEqual({ kind: 'steer', dir: 'east' });
  });

  it('throws the hook on Space and Q, and ignores everything else', () => {
    expect(actionForKey('Space')).toEqual({ kind: 'hook' });
    expect(actionForKey('KeyQ')).toEqual({ kind: 'hook' });
    expect(actionForKey('KeyR')).toBeNull();
    expect(actionForKey('w')).toBeNull();
    expect(actionForKey('toString')).toBeNull();
  });
});

describe('shop and grapple keys', () => {
  it('grapples on E', () => {
    expect(actionForKey('KeyE')).toEqual({ kind: 'grapple' });
  });

  it('numbers the shop slots 1 to 6, upgrades in sim order then the items', () => {
    const wanted = [...UPGRADE_IDS, ...ITEM_IDS];
    expect(SHOP_SLOTS.map((s) => s.purchase.id)).toEqual(wanted);
    expect(SHOP_SLOTS.map((s) => s.digit)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(actionForKey('Digit1')).toEqual({ kind: 'buy', purchase: { kind: 'upgrade', id: 'damage' } });
    expect(actionForKey('Digit5')).toEqual({ kind: 'buy', purchase: { kind: 'item', id: 'grapple' } });
    expect(actionForKey('Digit6')).toEqual({ kind: 'buy', purchase: { kind: 'item', id: 'barb' } });
    expect(actionForKey('Digit7')).toBeNull();
  });
});

describe('steerVector', () => {
  it('is zero with nothing held', () => {
    expect(steerVector(new Set())).toEqual({ x: 0, y: 0 });
  });

  it('adds held directions into a diagonal', () => {
    expect(steerVector(new Set(['north', 'east'] as const))).toEqual({ x: 1, y: -1 });
  });

  it('cancels opposite keys', () => {
    expect(steerVector(new Set(['west', 'east'] as const))).toEqual({ x: 0, y: 0 });
    expect(steerVector(new Set(['north', 'south', 'east'] as const))).toEqual({ x: 1, y: 0 });
  });

  it('points north up the screen and east to the right, as the camera draws the arena', () => {
    const viewport = { width: 1280, height: 720 };
    const cam = new PerspectiveCamera();
    const from = { x: 420, y: 675 };
    applyPose(cam, poseFor(focusFor(DEFAULT_ARENA, 'west', from, viewport), viewport));
    const screen = (dir: 'north' | 'east') => {
      const v = DIRECTION_VECTORS[dir];
      return worldToScreen(cam, viewport, simToWorld({ x: from.x + v.x * 100, y: from.y + v.y * 100 }));
    };
    const here = worldToScreen(cam, viewport, simToWorld(from));
    expect(screen('north').y).toBeLessThan(here.y - 10);
    // The player stands left of centre, so perspective leans a north step towards the vanishing point a little.
    expect(Math.abs(screen('north').x - here.x)).toBeLessThan((here.y - screen('north').y) / 2);
    expect(screen('east').x).toBeGreaterThan(here.x + 10);
  });
});

describe('facingAim', () => {
  it('aims a hook range ahead along the player facing', () => {
    const p = fakePlayer({ id: HUMAN, pos: { x: 100, y: 200 }, facing: Math.PI / 2 });
    const aim = facingAim(p);
    expect(aim.x).toBeCloseTo(100, 9);
    expect(aim.y).toBeCloseTo(200 + TUNING.hookRange, 9);
  });

  it('reaches as far as the upgraded hook does', () => {
    const p = fakePlayer({ id: HUMAN, pos: { x: 0, y: 0 }, facing: 0, upgrades: { damage: 0, range: 2, speed: 0, size: 0 } });
    expect(facingAim(p).x).toBeCloseTo(TUNING.hookRange + 2 * UPGRADES.range.perLevel, 9);
  });
});
