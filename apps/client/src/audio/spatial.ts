import type { Vec2 } from '@hookwars/sim';

export const SPATIAL = {
  /** Sim units from the local fighter inside which a sound is at full gain. */
  near: 300,
  /** Sim units past `near` at which the gain has halved. */
  rolloff: 700,
  /** Furthest left or right a sound is panned, at the screen's edges. */
  panWidth: 0.8,
  /** The most a sound from beyond the screen's edge may play at. */
  offscreen: 0.35,
  /** CSS pixels past the edge at which an off-screen sound has faded out entirely. */
  offscreenFade: 400,
} as const;

export type Placement = {
  /** Where it happened in the sim; null for news with no place. */
  readonly at: Vec2 | null;
  /** The local fighter, or null when they are not on the field. */
  readonly listener: Vec2 | null;
  /** Where `at` is drawn, in CSS pixels from the canvas's top-left corner. */
  readonly screenPos: Vec2 | null;
  readonly screen: { readonly width: number; readonly height: number };
};

export type Spatial = { readonly gain: number; readonly pan: number };

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function distanceGain(at: Vec2, listener: Vec2 | null): number {
  if (listener === null) return 1;
  const beyond = Math.max(0, Math.hypot(at.x - listener.x, at.y - listener.y) - SPATIAL.near) / SPATIAL.rolloff;
  return 1 / (1 + beyond * beyond);
}

function screenGain(pos: Vec2, screen: Placement['screen']): number {
  const dx = Math.max(0, -pos.x, pos.x - screen.width);
  const dy = Math.max(0, -pos.y, pos.y - screen.height);
  const outside = Math.hypot(dx, dy);
  if (outside === 0) return 1;
  return SPATIAL.offscreen * clamp(1 - outside / SPATIAL.offscreenFade, 0, 1);
}

/** How loud and how far left or right a sound plays, from where it happened and where it is on screen. */
export function spatialize({ at, listener, screenPos, screen }: Placement): Spatial {
  if (at === null) return { gain: 1, pan: 0 };
  const onScreen = screenPos === null ? 1 : screenGain(screenPos, screen);
  const half = screen.width / 2;
  const pan = screenPos === null || half <= 0 ? 0 : clamp((screenPos.x - half) / half, -1, 1) * SPATIAL.panWidth;
  return { gain: distanceGain(at, listener) * onScreen, pan };
}
