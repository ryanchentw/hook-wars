import type { EffectKind, PickupKind } from '@hookwars/sim';

/** One glow per kind, the same in every scene, picked to read against each scene's water from the top-down camera. */
export const PICKUP_COLORS: Readonly<Record<PickupKind, number>> = {
  gold: 0xffc23a,
  gale: 0x5fe3ff,
  storm: 0xb07bff,
};

export const EFFECT_COLORS: Readonly<Record<EffectKind, number>> = {
  gale: PICKUP_COLORS.gale,
  storm: PICKUP_COLORS.storm,
};

/** World units unless a name says otherwise. */
export const PICKUP_SIZES = {
  /** Height of the body's centre above the water while it floats. */
  float: 0.75,
  bobHeight: 0.22,
  /** Radians per second. */
  bobRate: 2.4,
  /** Radians per second the body turns about its axis. */
  spin: 1.1,
  /** Halo sprite diameter, in body radii. */
  halo: 5.5,
  haloOpacity: 0.85,
  /** The ring of light on the water, in body radii. */
  ringInner: 1.25,
  ringOuter: 1.9,
  ringOpacity: 0.55,
  ringPulseRate: 3,
  /** How bright the body burns, so it reads in the darkest scene. */
  emissive: 1.4,
} as const;

/** Wind and lightning on fighters, in world units and seconds. */
export const AURA = {
  galeRadius: 1.6,
  galeStreaks: 3,
  galeThickness: 0.1,
  /** Radians per second the streaks wheel round the fighter. */
  galeSpin: 4.5,
  galeHeights: [0.6, 1.5, 2.4],
  galeOpacity: 0.9,
  stormHaloSize: 4.2,
  stormHaloOpacity: 0.45,
  /** How long one lightning strike stays drawn. */
  boltLife: 0.28,
  boltTop: 9,
  boltWidth: 0.32,
  boltSegments: 7,
  /** Sideways jag of each bolt segment. */
  boltJag: 0.7,
} as const;
