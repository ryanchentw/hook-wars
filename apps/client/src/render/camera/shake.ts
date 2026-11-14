import { SHAKE } from '../theme';

export type ShakeOffset = { readonly right: number; readonly up: number };

const STILL: ShakeOffset = { right: 0, up: 0 };

/** Camera offset, in world units along its own right and up axes, `age` seconds after a hit. Dies away to nothing. */
export function shakeOffset(age: number): ShakeOffset {
  if (!(age >= 0) || age >= SHAKE.duration) return STILL;
  const fade = (1 - age / SHAKE.duration) ** 2;
  const phase = age * SHAKE.hz * Math.PI * 2;
  return { right: Math.sin(phase) * SHAKE.amplitude * fade, up: Math.cos(phase * 1.31) * SHAKE.amplitude * fade };
}
