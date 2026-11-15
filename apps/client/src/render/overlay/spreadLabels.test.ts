import { describe, expect, it } from 'vitest';
import { keepInView, spreadLabels } from './spreadLabels';

const box = { width: 70, height: 30 };
const uniform = (anchors: readonly unknown[]) => anchors.map(() => box.width);

describe('spreadLabels', () => {
  it('leaves labels alone when they do not collide', () => {
    const anchors = [{ x: 100, y: 200 }, { x: 300, y: 200 }, { x: 100, y: 260 }];
    expect(spreadLabels(anchors, uniform(anchors), box.height)).toEqual(anchors);
  });

  it('stacks a colliding label above the one lower on screen', () => {
    const [far, near] = spreadLabels([{ x: 100, y: 195 }, { x: 130, y: 200 }], [70, 70], box.height);
    expect(near).toEqual({ x: 130, y: 200 });
    expect(far).toEqual({ x: 100, y: 170 });
  });

  it('stacks three in a pile without any pair overlapping', () => {
    const out = spreadLabels([{ x: 100, y: 200 }, { x: 110, y: 198 }, { x: 120, y: 196 }], [70, 70, 70], box.height);
    const ys = out.map((p) => p!.y).sort((a, b) => a - b);
    expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(box.height);
    expect(ys[2]! - ys[1]!).toBeGreaterThanOrEqual(box.height);
  });

  it('stacks a long name over its neighbour that a short name would have cleared', () => {
    const anchors = [{ x: 100, y: 195 }, { x: 200, y: 200 }];
    expect(spreadLabels(anchors, [70, 70], box.height)).toEqual(anchors);
    const [long] = spreadLabels(anchors, [180, 70], box.height);
    expect(long).toEqual({ x: 100, y: 170 });
  });

  it('keeps hidden labels hidden and in place in the list', () => {
    expect(spreadLabels([null, { x: 5, y: 5 }, null], [70, 70, 70], box.height)).toEqual([null, { x: 5, y: 5 }, null]);
  });
});

describe('keepInView', () => {
  const view = { width: 1280, height: 720 };

  it('slides a label for a fighter at the screen edge back in, so its name is not cut off', () => {
    expect(keepInView({ x: 1270, y: 300 }, box, view)).toEqual({ x: 1280 - box.width / 2, y: 300 });
    expect(keepInView({ x: 4, y: 300 }, box, view)).toEqual({ x: box.width / 2, y: 300 });
  });

  it('leaves a label alone when it fits, and when its fighter is off screen altogether', () => {
    expect(keepInView({ x: 600, y: 300 }, box, view)).toEqual({ x: 600, y: 300 });
    expect(keepInView({ x: 1400, y: 300 }, box, view)).toEqual({ x: 1400, y: 300 });
  });
});
