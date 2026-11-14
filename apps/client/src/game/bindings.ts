import { TUNING } from '@hookbrawl/sim';
import type { Player, Vec2 } from '@hookbrawl/sim';

export type Direction = 'north' | 'south' | 'west' | 'east';

export type KeyAction = { readonly kind: 'steer'; readonly dir: Direction } | { readonly kind: 'hook' };

const steer = (dir: Direction): KeyAction => ({ kind: 'steer', dir });
const HOOK: KeyAction = { kind: 'hook' };

/** Keyed by `KeyboardEvent.code`, the physical key, so an IME or a non-QWERTY layout does not move the controls. */
export const KEY_BINDINGS: ReadonlyMap<string, KeyAction> = new Map([
  ['KeyW', steer('north')],
  ['ArrowUp', steer('north')],
  ['KeyS', steer('south')],
  ['ArrowDown', steer('south')],
  ['KeyA', steer('west')],
  ['ArrowLeft', steer('west')],
  ['KeyD', steer('east')],
  ['ArrowRight', steer('east')],
  ['Space', HOOK],
  ['KeyQ', HOOK],
]);

export const HOOK_POINTER_BUTTON = 0;

/** North is sim -y: the camera stands on the +y side of the arena looking towards -y (see `poseFor`). */
export const DIRECTION_VECTORS: Readonly<Record<Direction, Vec2>> = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
  east: { x: 1, y: 0 },
};

export const STILL: Vec2 = { x: 0, y: 0 };

export function actionForKey(code: string): KeyAction | null {
  return KEY_BINDINGS.get(code) ?? null;
}

/** Unnormalized: the sim takes only the heading. */
export function steerVector(held: ReadonlySet<Direction>): Vec2 {
  return [...held].reduce<Vec2>(
    (sum, dir) => ({ x: sum.x + DIRECTION_VECTORS[dir].x, y: sum.y + DIRECTION_VECTORS[dir].y }),
    STILL,
  );
}

/** Where a hook goes when the cursor has never been over the canvas: straight ahead. */
export function facingAim(player: Player): Vec2 {
  return {
    x: player.pos.x + Math.cos(player.facing) * TUNING.hookRange,
    y: player.pos.y + Math.sin(player.facing) * TUNING.hookRange,
  };
}
