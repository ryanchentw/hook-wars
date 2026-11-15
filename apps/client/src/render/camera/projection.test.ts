import { DEFAULT_ARENA } from '@hookwars/sim';
import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { simToWorld, worldToSim } from '../space';
import { focusFor, poseFor } from './framing';
import { applyPose, screenToGround, worldToScreen } from './projection';

const viewport = { width: 1366, height: 768 };

function camera(): PerspectiveCamera {
  const cam = new PerspectiveCamera();
  applyPose(cam, poseFor(focusFor(DEFAULT_ARENA, 'west', { x: 420, y: 675 }, viewport), viewport));
  return cam;
}

describe('screen and world projection', () => {
  it('round-trips ground points through the screen', () => {
    const cam = camera();
    for (const p of [{ x: 1234.5, y: 321.25 }, { x: 34, y: 34 }, { x: 2366, y: 1316 }, { x: 1200, y: 675 }]) {
      const back = worldToSim(screenToGround(cam, viewport, worldToScreen(cam, viewport, simToWorld(p))));
      expect(back.x).toBeCloseTo(p.x, 4);
      expect(back.y).toBeCloseTo(p.y, 4);
    }
  });

  it('maps the look-at point to the centre of the viewport', () => {
    const pose = poseFor({ x: 30, z: 20 }, viewport);
    const cam = new PerspectiveCamera();
    applyPose(cam, pose);
    const centre = worldToScreen(cam, viewport, pose.target);
    expect(centre.x).toBeCloseTo(viewport.width / 2);
    expect(centre.y).toBeCloseTo(viewport.height / 2);
  });

  it('casts onto the ground plane, not onto raised geometry', () => {
    const cam = camera();
    const hit = screenToGround(cam, viewport, { x: 200, y: 600 });
    expect(hit.y).toBeCloseTo(0);
  });

  it('still returns a finite ground point for a ray that never reaches the ground', () => {
    const cam = new PerspectiveCamera(40, 16 / 9, 0.1, 100);
    cam.position.set(0, 10, 0);
    cam.lookAt(0, 10, -10);
    cam.updateMatrixWorld();
    const hit = screenToGround(cam, viewport, { x: viewport.width / 2, y: 0 });
    expect(Number.isFinite(hit.x) && Number.isFinite(hit.z)).toBe(true);
    expect(hit.y).toBe(0);
  });
});
