import type { Vec2 } from '@hookbrawl/sim';

export type Insets = { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number };

/** Maps world units to CSS pixels: screen = world * scale + offset. */
export type Camera = { readonly scale: number; readonly offsetX: number; readonly offsetY: number };

export type Size = { readonly width: number; readonly height: number };

export function fitCamera(world: Size, view: Size, insets: Insets): Camera {
  const availW = Math.max(1, view.width - insets.left - insets.right);
  const availH = Math.max(1, view.height - insets.top - insets.bottom);
  const scale = Math.min(availW / world.width, availH / world.height);
  return {
    scale,
    offsetX: insets.left + (availW - world.width * scale) / 2,
    offsetY: insets.top + (availH - world.height * scale) / 2,
  };
}

export function worldToScreen(camera: Camera, p: Vec2): Vec2 {
  return { x: p.x * camera.scale + camera.offsetX, y: p.y * camera.scale + camera.offsetY };
}

export function screenToWorld(camera: Camera, p: Vec2): Vec2 {
  return { x: (p.x - camera.offsetX) / camera.scale, y: (p.y - camera.offsetY) / camera.scale };
}
