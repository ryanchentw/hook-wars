import type { Arena, PlayerId } from '@hookwars/sim';
import { PerspectiveCamera, Vector3 } from 'three';
import type { Impact } from '../impact/impacts';
import type { RenderFrame } from '../interpolate';
import { SHAKE } from '../theme';
import { dampFocus, focusFor, poseFor, type CameraPose, type Focus, type Viewport } from './framing';
import { applyPose } from './projection';
import { shakeOffset } from './shake';

export type CameraRig = {
  readonly camera: PerspectiveCamera;
  /** Where the gameplay camera stands this frame: it trails the local player, framed at once on the first frame, easing after. */
  follow(frame: RenderFrame, viewport: Viewport, dt: number): CameraPose;
  place(pose: CameraPose): void;
  /** A blow the local player gives or takes jolts the camera, unless a harder jolt is still running. */
  jolt(impacts: readonly Impact[], dt: number): void;
  /** Runs `draw` with the jolt applied and puts the camera back after: aiming reads it between frames and must not see the shake. */
  shaken(draw: () => void): void;
};

export function createCameraRig(arena: Arena, localPlayerId: PlayerId): CameraRig {
  const camera = new PerspectiveCamera();
  const right = new Vector3();
  const up = new Vector3();
  const unshaken = new Vector3();
  let focus: Focus | null = null;
  let shakeAge = Number.POSITIVE_INFINITY;
  let shakeStrength = 0;

  return {
    camera,
    follow(frame, viewport, dt) {
      const local = frame.players.find((p) => p.player.id === localPlayerId);
      if (local !== undefined) {
        const wanted = focusFor(arena, local.player.team, local.pos, viewport);
        focus = focus === null ? wanted : dampFocus(focus, wanted, dt);
      }
      return poseFor(focus ?? { x: 0, z: 0 }, viewport);
    },
    place: (pose) => applyPose(camera, pose),
    jolt(impacts, dt) {
      shakeAge += dt;
      const strength = impacts.reduce((most, impact) => (impact.involvesLocal ? Math.max(most, impact.spec.shake) : most), 0);
      if (strength > 0 && (strength >= shakeStrength || shakeAge >= SHAKE.duration)) {
        shakeAge = 0;
        shakeStrength = strength;
      }
    },
    shaken(draw) {
      unshaken.copy(camera.position);
      const offset = shakeOffset(shakeAge, shakeStrength);
      camera.matrixWorld.extractBasis(right, up, new Vector3());
      camera.position.addScaledVector(right, offset.right).addScaledVector(up, offset.up);
      camera.updateMatrixWorld(true);
      draw();
      camera.position.copy(unshaken);
      camera.updateMatrixWorld(true);
    },
  };
}
