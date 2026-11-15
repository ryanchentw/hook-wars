import type { Arena, TeamId, Vec2 } from '@hookwars/sim';
import { simToWorld, toWorldLength, type Vec3 } from '../space';
import { CAMERA, HUD_INSETS } from '../theme';

export type Viewport = { readonly width: number; readonly height: number };

/** The ground point the camera looks at, in world units. */
export type Focus = { readonly x: number; readonly z: number };

export type CameraPose = {
  readonly position: Vec3;
  readonly target: Vec3;
  readonly fovDeg: number;
  readonly aspect: number;
};

const DEG = Math.PI / 180;
const TAN_HALF_FOV = Math.tan((CAMERA.fovDeg / 2) * DEG);

function aspectOf(viewport: Viewport): number {
  return Math.max(1, viewport.width) / Math.max(1, viewport.height);
}

/** Distance from the camera to its look-at point. Fixed from the design aspect up; narrower screens pull back. */
function distanceFor(aspect: number): number {
  const design = CAMERA.halfView / (TAN_HALF_FOV * CAMERA.designAspect);
  const pullBack = Math.min(CAMERA.maxPullBack, Math.max(1, CAMERA.designAspect / aspect));
  return design * pullBack;
}

/**
 * How much of the player's north-south travel the camera copies. A short viewport loses a bigger share of its
 * height to the HUD, so there the camera follows more closely to keep the player between the plates.
 */
function depthFollowFor(viewport: Viewport): number {
  const height = Math.max(1, viewport.height);
  const clear = (height - HUD_INSETS.top - HUD_INSETS.bottom) / height;
  const room = (clear - CAMERA.tightClearFraction) / (CAMERA.designClearFraction - CAMERA.tightClearFraction);
  return 1 - (1 - CAMERA.depthFollow) * Math.min(1, Math.max(0, room));
}

/**
 * Stops the camera leading on past the far wall into the night, as it would for a player who has grappled onto the
 * enemy dock. It holds back no further than the framing an enemy standing there gets, so the player stays in view.
 */
function holdLeadInsideArena(playerX: number, lead: number, towardEnemy: number, arena: Arena, halfView: number): number {
  const margin = toWorldLength(CAMERA.edgeMargin);
  const led = playerX + towardEnemy * lead;
  const mirrored = playerX - towardEnemy * lead;
  if (towardEnemy > 0) return Math.max(mirrored, Math.min(led, toWorldLength(arena.width) + margin - halfView));
  return Math.min(mirrored, Math.max(led, halfView - margin));
}

/**
 * Where the camera wants to look once it has caught up with the player: ahead of them towards the enemy dock,
 * so they stand near their own side of the screen with the ground a hook can reach laid out in front.
 */
export function focusFor(arena: Arena, team: TeamId, playerPos: Vec2, viewport: Viewport): Focus {
  const aspect = aspectOf(viewport);
  const halfView = distanceFor(aspect) * TAN_HALF_FOV * aspect;
  const lead = Math.max(0, halfView - CAMERA.behindPlayer);
  const towardEnemy = team === 'west' ? 1 : -1;
  const player = simToWorld(playerPos);
  const midZ = simToWorld({ x: 0, y: arena.height / 2 }).z;
  return {
    x: holdLeadInsideArena(player.x, lead, towardEnemy, arena, halfView),
    z: midZ + (player.z - midZ) * depthFollowFor(viewport) - CAMERA.northBias,
  };
}

export function poseFor(focus: Focus, viewport: Viewport): CameraPose {
  const aspect = aspectOf(viewport);
  const distance = distanceFor(aspect);
  const tilt = CAMERA.tiltDeg * DEG;
  return {
    position: { x: focus.x, y: distance * Math.sin(tilt), z: focus.z + distance * Math.cos(tilt) },
    target: { x: focus.x, y: 0, z: focus.z },
    fovDeg: CAMERA.fovDeg,
    aspect,
  };
}

/** Exponential approach, so the result depends on elapsed time and not on how it was sliced into frames. */
export function dampFocus(current: Focus, target: Focus, dt: number): Focus {
  const keep = 0.5 ** (Math.max(0, dt) / CAMERA.followHalfLife);
  return {
    x: target.x + (current.x - target.x) * keep,
    z: target.z + (current.z - target.z) * keep,
  };
}
