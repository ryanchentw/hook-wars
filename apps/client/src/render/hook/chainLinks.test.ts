import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../space';
import { layOutChain } from './chainLinks';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Distance along the polyline from its last point (the hook) back to `p`, which must lie on it. */
function arcFromEnd(polyline: readonly Vec3[], p: Vec3): number {
  let walked = 0;
  for (let i = polyline.length - 1; i > 0; i -= 1) {
    const a = polyline[i]!;
    const b = polyline[i - 1]!;
    const seg = dist(a, b);
    if (Math.abs(dist(a, p) + dist(p, b) - seg) < 1e-6) return walked + dist(a, p);
    walked += seg;
  }
  throw new Error(`point ${JSON.stringify(p)} is not on the chain`);
}

describe('layOutChain', () => {
  it('spaces links evenly along a straight chain, counted from the hook', () => {
    const line = [v(0, 1, 0), v(100, 1, 0)];
    const { links, stretch } = layOutChain(line, 10, 50);
    expect(links).toHaveLength(10);
    expect(stretch).toBe(1);
    links.forEach((link, i) => {
      expect(arcFromEnd(line, link.position)).toBeCloseTo(5 + 10 * i);
      expect(link.direction).toEqual(v(1, 0, 0));
    });
  });

  it('turns every other link a quarter turn about the chain', () => {
    const { links } = layOutChain([v(0, 0, 0), v(60, 0, 0)], 10, 50);
    expect(links.map((l) => l.quarterTurn)).toEqual([false, true, false, true, false, true]);
  });

  it('follows the chain round a bounce, keeping the spacing measured along the path', () => {
    const line = [v(0, 2, 0), v(40, 2, 0), v(40, 2, 35)];
    const { links } = layOutChain(line, 10, 50);
    expect(links).toHaveLength(7);
    links.forEach((link, i) => expect(arcFromEnd(line, link.position)).toBeCloseTo(5 + 10 * i));
    expect(links[0]!.direction).toEqual(v(0, 0, 1));
    expect(links[2]!.direction).toEqual(v(0, 0, 1));
    expect(links[4]!.direction).toEqual(v(1, 0, 0));
  });

  it('drops from the hand to the chain height along the first stretch', () => {
    const { links } = layOutChain([v(0, 3, 0), v(30, 1, 0)], 10, 50);
    const heights = links.map((l) => l.position.y);
    expect(heights[0]).toBeLessThan(heights[2]!);
    heights.forEach((h) => {
      expect(h).toBeGreaterThanOrEqual(1);
      expect(h).toBeLessThanOrEqual(3);
    });
    const d = links[0]!.direction;
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1);
    expect(d.y).toBeLessThan(0);
  });

  it('caps the link count and stretches the links to still cover the whole chain', () => {
    const line = [v(0, 0, 0), v(1000, 0, 0)];
    const { links, stretch } = layOutChain(line, 10, 40);
    expect(links).toHaveLength(40);
    expect(stretch).toBeCloseTo(2.5);
    expect(arcFromEnd(line, links[0]!.position)).toBeCloseTo(12.5);
    expect(arcFromEnd(line, links[39]!.position)).toBeCloseTo(987.5);
  });

  it('keeps links fixed relative to the hook as more chain pays out from the hand', () => {
    const short = layOutChain([v(50, 0, 0), v(100, 0, 0)], 10, 50).links;
    const long = layOutChain([v(0, 0, 0), v(100, 0, 0)], 10, 50).links;
    short.forEach((link, i) => {
      expect(long[i]!.position.x).toBeCloseTo(link.position.x);
      expect(long[i]!.quarterTurn).toBe(link.quarterTurn);
    });
  });

  it('lays nothing for a chain too short for one link or with no length at all', () => {
    expect(layOutChain([v(0, 0, 0), v(4, 0, 0)], 10, 50).links).toEqual([]);
    expect(layOutChain([v(1, 1, 1)], 10, 50).links).toEqual([]);
    expect(layOutChain([], 10, 50).links).toEqual([]);
    expect(layOutChain([v(0, 0, 0), v(100, 0, 0)], 10, 0).links).toEqual([]);
  });

  it('skips repeated points instead of producing broken directions', () => {
    const { links } = layOutChain([v(0, 0, 0), v(0, 0, 0), v(30, 0, 0), v(30, 0, 0)], 10, 50);
    expect(links).toHaveLength(3);
    links.forEach((l) => expect(l.direction).toEqual(v(1, 0, 0)));
  });
});
