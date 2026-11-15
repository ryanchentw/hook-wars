import { hookStats, ITEM_IDS, UPGRADE_IDS } from '@hookwars/sim';
import type { SeenPlayer, Purchase, Vec2 } from '@hookwars/sim';

export type Direction = 'north' | 'south' | 'west' | 'east';

export type KeyAction =
  | { readonly kind: 'steer'; readonly dir: Direction }
  | { readonly kind: 'hook' }
  | { readonly kind: 'grapple' }
  | { readonly kind: 'buy'; readonly purchase: Purchase };

/** One shop slot per digit key, upgrades in sim order and then the items. */
export type ShopSlot = { readonly purchase: Purchase; readonly digit: string; readonly code: string };

export const SHOP_SLOTS: readonly ShopSlot[] = [
  ...UPGRADE_IDS.map((id): Purchase => ({ kind: 'upgrade', id })),
  ...ITEM_IDS.map((id): Purchase => ({ kind: 'item', id })),
].map((purchase, i) => ({ purchase, digit: String(i + 1), code: `Digit${i + 1}` }));

const steer = (dir: Direction): KeyAction => ({ kind: 'steer', dir });
const HOOK: KeyAction = { kind: 'hook' };
const GRAPPLE: KeyAction = { kind: 'grapple' };

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
  ['KeyE', GRAPPLE],
  ...SHOP_SLOTS.map((slot): [string, KeyAction] => [slot.code, { kind: 'buy', purchase: slot.purchase }]),
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

/** Where a hook or grapple goes when the cursor has never been over the canvas: straight ahead. */
export function facingAim(player: SeenPlayer): Vec2 {
  const { range } = hookStats(player);
  return {
    x: player.pos.x + Math.cos(player.facing) * range,
    y: player.pos.y + Math.sin(player.facing) * range,
  };
}
