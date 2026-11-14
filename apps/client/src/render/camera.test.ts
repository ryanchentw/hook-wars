import { describe, expect, it } from 'vitest';
import { fitCamera, screenToWorld, worldToScreen } from './camera';

const world = { width: 2400, height: 1350 };
const noInsets = { top: 0, bottom: 0, left: 0, right: 0 };

describe('fitCamera', () => {
  it('letterboxes top and bottom on a tall viewport', () => {
    const cam = fitCamera(world, { width: 1200, height: 1000 }, noInsets);
    expect(cam.scale).toBeCloseTo(0.5);
    expect(cam.offsetX).toBeCloseTo(0);
    expect(cam.offsetY).toBeCloseTo((1000 - 675) / 2);
  });

  it('pillarboxes left and right on a wide viewport', () => {
    const cam = fitCamera(world, { width: 3000, height: 675 }, noInsets);
    expect(cam.scale).toBeCloseTo(0.5);
    expect(cam.offsetX).toBeCloseTo((3000 - 1200) / 2);
    expect(cam.offsetY).toBeCloseTo(0);
  });

  it('keeps the whole arena inside the insets', () => {
    const insets = { top: 64, bottom: 72, left: 16, right: 16 };
    const view = { width: 1280, height: 720 };
    const cam = fitCamera(world, view, insets);
    const topLeft = worldToScreen(cam, { x: 0, y: 0 });
    const bottomRight = worldToScreen(cam, { x: world.width, y: world.height });
    expect(topLeft.x).toBeGreaterThanOrEqual(insets.left - 1e-9);
    expect(topLeft.y).toBeGreaterThanOrEqual(insets.top - 1e-9);
    expect(bottomRight.x).toBeLessThanOrEqual(view.width - insets.right + 1e-9);
    expect(bottomRight.y).toBeLessThanOrEqual(view.height - insets.bottom + 1e-9);
  });

  it('round-trips screen and world coordinates', () => {
    const cam = fitCamera(world, { width: 1366, height: 768 }, { top: 64, bottom: 72, left: 16, right: 16 });
    const p = { x: 1234.5, y: 321.25 };
    const back = screenToWorld(cam, worldToScreen(cam, p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it('never produces a zero or negative scale for a degenerate viewport', () => {
    const cam = fitCamera(world, { width: 0, height: 0 }, { top: 64, bottom: 72, left: 16, right: 16 });
    expect(cam.scale).toBeGreaterThan(0);
  });
});
