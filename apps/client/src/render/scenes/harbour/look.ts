import { COLORS, GRAPPLE_LOOK, TEAM_COLORS } from '../../theme';
import { NIGHT_INK } from '../kit/ink';
import type { Lamp, SceneLook } from '../types';

export const HARBOUR_COLORS = {
  night: 0x05080b,
  fog: 0x070c10,
  moon: 0xb4c2dc,
  skyFill: 0x51607c,
  groundFill: 0x2b2622,
  torch: 0xff8a3c,
  torchGlow: 0xffb45e,
  stoneTint: 0x8f9aa6,
  timberTint: 0x9a8f86,
  wallTint: 0x77818c,
  propTint: 0x8b8580,
  ledge: 0x1b1f24,
  coping: 0x8f97a3,
  water: 0x0b1a1c,
  rust: 0x7a3f26,
  rustDark: 0x3a2018,
  rustBright: 0xb5622f,
  buoyLamp: 0xff5a2a,
  buoyPaint: 0x9c8e6e,
} as const;

/** World units. */
export const HARBOUR_SIZES = {
  waterLevel: -1.7,
  quayDepth: 4,
  ledgeHeight: 1.3,
  ledgeDepth: 4,
  tile: 4,
  wallHeight: 4,
  buoyBob: 0.12,
  buoyTilt: 0.05,
} as const;

/** A wall torch. The light sits above its flame, clear of the masonry right under it, which would otherwise burn out white. */
export const TORCH: Omit<Lamp, 'glowAt'> = {
  lift: 1.1,
  color: HARBOUR_COLORS.torch,
  glowColor: HARBOUR_COLORS.torchGlow,
  glowSize: 3.4,
  intensity: 160,
  distance: 30,
  decay: 1.9,
  flicker: 0.22,
};

export const HARBOUR_LOOK: SceneLook = {
  id: 'harbour',
  title: { name: 'The Night Harbour', caption: 'Torchlight on a nameless quay' },
  atmosphere: {
    background: HARBOUR_COLORS.night,
    sky: null,
    fog: { color: HARBOUR_COLORS.fog, density: 0.0105 },
    exposure: 1.3,
    vignette: 1,
  },
  lights: {
    // Over the viewer's left shoulder, so the moon lights the faces we see and throws shadows up and to the right.
    key: {
      color: HARBOUR_COLORS.moon,
      intensity: 3.4,
      from: { x: -0.55, y: 1, z: 0.5 },
      shadow: { mapSize: 2048, bias: -0.0006, normalBias: 0.05, radius: 1 },
    },
    rim: { color: HARBOUR_COLORS.moon, intensity: 0.9, from: { x: 0.5, y: 0.7, z: -1 } },
    fill: { sky: HARBOUR_COLORS.skyFill, ground: HARBOUR_COLORS.groundFill, intensity: 1.5 },
  },
  water: {
    level: HARBOUR_SIZES.waterLevel,
    color: HARBOUR_COLORS.water,
    roughness: 0.42,
    metalness: 0,
    swellSize: 22,
    ripple: 0.9,
    drift: { x: 0.004, y: 0.011 },
  },
  tints: {
    iron: COLORS.iron,
    chainGlow: 0.16,
    rope: COLORS.rope,
    ropeGlow: GRAPPLE_LOOK.ropeGlow,
    teams: TEAM_COLORS,
    characterSelfLight: 0.22,
    overlay: NIGHT_INK,
  },
  intro: {
    from: { position: { x: 26, y: 2.6, z: 47 }, target: { x: 38.4, y: 2.2, z: 0 }, fovDeg: 38 },
    to: { position: { x: 31, y: 3.4, z: 44 }, target: { x: 38.4, y: 2, z: 0 }, fovDeg: 38 },
    haze: 1,
  },
  ambient: [],
};
