import { describe, expect, it } from 'vitest';
import { ball, bar, block, box, footprintOf, moved, post, reachFrom, sheet } from './parts';

describe('part footprints', () => {
  it('boxes a block exactly', () => {
    expect(footprintOf(block('p', [1, 3], [0, 5], [-2, 2]))).toEqual({ label: 'p', x0: 1, x1: 3, z0: -2, z1: 2, top: 5 });
  });

  it('swaps the sides of a box turned a quarter', () => {
    const f = footprintOf(box('p', { x: 4, y: 1, z: 2 }, { x: 10, y: 0.5, z: 10 }, { yaw: Math.PI / 2 }));
    expect(f.x0).toBeCloseTo(9);
    expect(f.x1).toBeCloseTo(11);
    expect(f.z0).toBeCloseTo(8);
    expect(f.z1).toBeCloseTo(12);
    expect(f.top).toBeCloseTo(1);
  });

  it('grows the box of one turned to an odd angle, never shrinks it', () => {
    const f = footprintOf(box('p', { x: 2, y: 1, z: 2 }, { x: 0, y: 0.5, z: 0 }, { yaw: Math.PI / 4 }));
    expect(f.x1).toBeCloseTo(Math.SQRT2);
    expect(f.z1).toBeCloseTo(Math.SQRT2);
  });

  it('stands a post on its foot', () => {
    const f = footprintOf(post('p', { radius: 0.5, height: 3 }, { x: 2, y: 1, z: 2 }));
    expect(f).toEqual({ label: 'p', x0: 1.5, x1: 2.5, z0: 1.5, z1: 2.5, top: 4 });
  });

  it('uses the wider end of a tapered post', () => {
    expect(footprintOf(post('p', { radius: 0.2, topRadius: 1, height: 2 }, { x: 0, y: 0, z: 0 })).x1).toBeCloseTo(1);
  });

  it('counts stretch', () => {
    const f = footprintOf(ball('p', 1, { x: 0, y: 3, z: 0 }, { stretch: { x: 2, y: 0.5, z: 1 } }));
    expect(f.x1).toBeCloseTo(2);
    expect(f.z1).toBeCloseTo(1);
    expect(f.top).toBeCloseTo(3.5);
  });

  it('lays a sheet flat', () => {
    expect(footprintOf(sheet('p', [0, 4], [0, 6], 0.01))).toEqual({ label: 'p', x0: 0, x1: 4, z0: 0, z1: 6, top: 0.01 });
  });

  it('spans a bar from end to end, however it slopes', () => {
    const f = footprintOf(bar('p', { x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }, 0.1));
    expect(f.x0).toBeLessThanOrEqual(0);
    expect(f.x1).toBeGreaterThanOrEqual(3);
    expect(f.top).toBeGreaterThanOrEqual(4);
    expect(f.top).toBeLessThan(4.2);
    const along = footprintOf(bar('p', { x: 1, y: 2, z: 5 }, { x: 1, y: 2, z: -5 }, 0.2));
    expect(along.z0).toBeCloseTo(-5);
    expect(along.z1).toBeCloseTo(5);
    expect(along.x1 - along.x0).toBeCloseTo(0.2);
  });

  it('moves with its parts', () => {
    const [shifted] = moved([block('p', [0, 1], [0, 1], [0, 1])], { x: 10, y: 0, z: -3 });
    expect(footprintOf(shifted!)).toEqual({ label: 'p', x0: 10, x1: 11, z0: -3, z1: -2, top: 1 });
  });
});

describe('how far parts reach from a centre line', () => {
  it('is the radius of a round part standing on it', () => {
    expect(reachFrom([post('p', { radius: 2.24, height: 4 }, { x: 5, y: -1, z: 5 })], { x: 5, z: 5 })).toBeCloseTo(2.24);
  });

  it('is the corner of a box', () => {
    expect(reachFrom([box('p', { x: 2, y: 1, z: 2 }, { x: 0, y: 0, z: 0 })], { x: 0, z: 0 })).toBeCloseTo(Math.SQRT2);
  });

  it('is the furthest of several', () => {
    const parts = [post('p', { radius: 1, height: 1 }, { x: 0, y: 0, z: 0 }), post('p', { radius: 0.5, height: 1 }, { x: 2, y: 0, z: 0 })];
    expect(reachFrom(parts, { x: 0, z: 0 })).toBeCloseTo(2.5);
  });
});
