/** How a floating thing moves about its mooring. Amplitudes in world units and radians, rates in radians per second. */
export type Motion = {
  readonly bob: number;
  readonly bobRate: number;
  readonly tilt: number;
  readonly tiltRate: number;
  /** How far it wanders either side of its mooring along x. */
  readonly drift: number;
  readonly driftRate: number;
};

export const STILL: Motion = { bob: 0, bobRate: 0, tilt: 0, tiltRate: 0, drift: 0, driftRate: 0 };

export type Sway = { readonly x: number; readonly y: number; readonly tiltX: number; readonly tiltZ: number };

/** Where the motion has carried a thing after `elapsed` seconds, as offsets from its mooring. */
export function swayAt(motion: Motion, elapsed: number): Sway {
  return {
    x: Math.sin(elapsed * motion.driftRate) * motion.drift,
    y: Math.sin(elapsed * motion.bobRate) * motion.bob,
    tiltX: Math.sin(elapsed * motion.tiltRate) * motion.tilt,
    // Out of step with the other axis, so it rolls rather than nods.
    tiltZ: Math.cos(elapsed * motion.tiltRate * 0.76) * motion.tilt,
  };
}
