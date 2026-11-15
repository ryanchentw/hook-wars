import type { Vec2 } from '@hookwars/sim';
import { Vector3, type PerspectiveCamera } from 'three';
import type { Vec3 } from '../space';
import { CAMERA } from '../theme';
import type { CameraPose, Viewport } from './framing';

// A ray flatter than this is treated as never reaching the ground.
const MIN_DESCENT = 1e-6;

export function applyPose(camera: PerspectiveCamera, pose: CameraPose): void {
  camera.fov = pose.fovDeg;
  camera.aspect = pose.aspect;
  camera.near = CAMERA.near;
  camera.far = CAMERA.far;
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

/** World point to CSS pixels from the viewport's top-left corner. */
export function worldToScreen(camera: PerspectiveCamera, viewport: Viewport, p: Vec3): Vec2 {
  const ndc = new Vector3(p.x, p.y, p.z).project(camera);
  return { x: ((ndc.x + 1) / 2) * viewport.width, y: ((1 - ndc.y) / 2) * viewport.height };
}

/** Casts the pixel's view ray onto the ground plane (y = 0), which is where the sim's rules live. */
export function screenToGround(camera: PerspectiveCamera, viewport: Viewport, screen: Vec2): Vec3 {
  const ndcX = (screen.x / Math.max(1, viewport.width)) * 2 - 1;
  const ndcY = 1 - (screen.y / Math.max(1, viewport.height)) * 2;
  const origin = new Vector3().setFromMatrixPosition(camera.matrixWorld);
  const direction = new Vector3(ndcX, ndcY, 0.5).unproject(camera).sub(origin).normalize();
  if (direction.y > -MIN_DESCENT) {
    // Looking at or above the horizon: answer with a far point in that direction rather than nothing.
    return { x: origin.x + direction.x * CAMERA.far, y: 0, z: origin.z + direction.z * CAMERA.far };
  }
  const t = -origin.y / direction.y;
  return { x: origin.x + direction.x * t, y: 0, z: origin.z + direction.z * t };
}
