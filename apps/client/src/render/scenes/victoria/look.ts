import { COLORS, GRAPPLE_LOOK, TEAM_COLORS } from '../../theme';
import { NIGHT_INK } from '../kit/ink';
import { glow, paint, type Paint } from '../kit/paint';
import type { Lamp, SceneLook } from '../types';

export const VICTORIA_COLORS = {
  night: 0x070914,
  skyGlow: 0x2a1c44,
  fog: 0x0b0d1c,
  cityLight: 0x8f9fd8,
  skyFill: 0x4a3f78,
  waterFill: 0x12303a,
  water: 0x06141c,
  neonPink: 0xff2e88,
  neonCyan: 0x1fe0ff,
  neonGold: 0xffc247,
  neonGreen: 0x3dff9a,
  neonRed: 0xff3b30,
  lampWarm: 0xffd9a0,
  quay: 0x2b2f36,
  coping: 0xa9b0ba,
  railGreen: 0x1f5a45,
  lifebuoy: 0xe8452c,
  iron: 0x1c1d21,
  junkHull: 0x3b2418,
  junkSail: 0xc0231c,
  ferryGreen: 0x1f6b4a,
  ferryWhite: 0xe9e6da,
  buoyRed: 0xb3261e,
  buoyWhite: 0xdedbd0,
  hill: 0x090b12,
} as const;

const C = VICTORIA_COLORS;

/** World units. */
export const VICTORIA_SIZES = {
  waterLevel: -1.7,
  /** Paving beyond the playable rectangle, to the railing. */
  apron: 1.6,
  side: 4,
  quayDepth: 4,
  railHeight: 1.1,
} as const;

/** Light from a neon sign: strong and close, so its colour pools on the paving under it. */
function neon(color: number): Omit<Lamp, 'glowAt'> {
  return { lift: 0.2, color, glowColor: color, glowSize: 4.5, intensity: 150, distance: 26, decay: 1.7, flicker: 0.04 };
}

export const NEON_PINK = neon(C.neonPink);
export const NEON_CYAN = neon(C.neonCyan);
/** The buoy's own lamp: enough to pick the drum out of the dark water around it. */
export const BUOY_LAMP: Omit<Lamp, 'glowAt'> = {
  lift: 0.6,
  color: C.neonGreen,
  glowColor: C.neonGreen,
  glowSize: 2,
  intensity: 26,
  distance: 15,
  decay: 2,
  flicker: 0.25,
};

export const PROMENADE_LAMP: Omit<Lamp, 'glowAt'> = {
  lift: -0.3,
  color: C.lampWarm,
  glowColor: C.lampWarm,
  glowSize: 2.2,
  intensity: 70,
  distance: 22,
  decay: 1.8,
  flicker: 0,
};

export const VICTORIA_PAINTS: Readonly<Record<string, Paint>> = {
  promenade: paint({ map: 'promenade', roughness: 0.5, castShadow: false }),
  pier: paint({ map: 'pier', roughness: 0.55, castShadow: false }),
  apron: paint({ map: 'pavers', tile: { u: 4, v: 4 }, roughness: 0.55, castShadow: false }),
  quay: paint({ color: C.quay, map: 'concrete', tile: { u: 4, v: 4 }, roughness: 0.9 }),
  coping: paint({ color: C.coping, roughness: 0.75, castShadow: false }),
  rail: paint({ color: C.railGreen, roughness: 0.45, metalness: 0.3 }),
  lifebuoy: paint({ color: C.lifebuoy, roughness: 0.6, emissive: C.lifebuoy, emissiveIntensity: 0.25 }),
  iron: paint({ color: C.iron, roughness: 0.6, metalness: 0.5 }),
  signBack: paint({ color: C.iron, roughness: 0.8 }),
  signPink: glow({ map: 'signPink', gain: 1.6 }),
  signCyan: glow({ map: 'signCyan', gain: 1.6 }),
  lampHead: glow({ color: C.lampWarm, gain: 2.2 }),
  tower: glow({ map: 'windows', tile: { u: 5, v: 5.6 }, fog: false }),
  crown: glow({ fog: false, gain: 1.5 }),
  hill: glow({ color: C.hill, fog: false }),
  sheenFar: glow({ map: 'streaks', blend: 'add', fog: false, opacity: 0.9 }),
  sheenNear: glow({ map: 'nearStreaks', blend: 'add', fog: false, opacity: 0.7 }),
  // Faint: hooks fly over this water and must stay the brightest thing on it.
  sheenStrip: glow({ map: 'stripStreaks', blend: 'add', fog: false, opacity: 0.32 }),
  junkHull: paint({ color: C.junkHull, roughness: 0.8, emissive: C.junkHull, emissiveIntensity: 0.5 }),
  junkSail: paint({ map: 'sail', cutout: true, doubleSided: true, roughness: 0.9, emissive: C.junkSail, emissiveMap: 'sail', emissiveIntensity: 0.55 }),
  ferryHull: paint({ color: C.ferryGreen, roughness: 0.6, emissive: C.ferryGreen, emissiveIntensity: 0.35 }),
  ferryWhite: paint({ color: C.ferryWhite, roughness: 0.7, emissive: C.ferryWhite, emissiveIntensity: 0.1 }),
  ferryWindows: glow({ map: 'ferryWindows', tile: { u: 2, v: 1 }, gain: 1.4 }),
  buoyRed: paint({ color: C.buoyRed, map: 'plates', tile: { u: 3.5, v: 3.5 }, roughness: 0.55, metalness: 0.3, emissive: C.buoyRed, emissiveIntensity: 0.12 }),
  buoyWhite: paint({ color: C.buoyWhite, roughness: 0.6, metalness: 0.2 }),
  buoyLamp: glow({ color: C.neonGreen, gain: 2.5 }),
};

export const VICTORIA_LOOK: SceneLook = {
  id: 'victoria',
  title: { name: 'Victoria Harbour', caption: 'Hong Kong · after dark' },
  atmosphere: {
    background: C.night,
    sky: { zenith: C.night, horizon: C.skyGlow },
    fog: { color: C.fog, density: 0.0062 },
    exposure: 1.25,
    vignette: 0.9,
  },
  lights: {
    // The glow of the city behind the viewer stands in for a moon: cool, soft, over the left shoulder.
    key: { color: C.cityLight, intensity: 2.6, from: { x: -0.5, y: 1, z: 0.55 }, shadow: { mapSize: 2048, bias: -0.0006, normalBias: 0.05, radius: 1 } },
    rim: { color: 0xc45ad0, intensity: 0.3, from: { x: 0.3, y: 0.5, z: -1 } },
    fill: { sky: C.skyFill, ground: C.waterFill, intensity: 1.5 },
  },
  water: { level: VICTORIA_SIZES.waterLevel, color: C.water, roughness: 0.36, metalness: 0.15, swellSize: 20, ripple: 1, drift: { x: 0.006, y: 0.012 }, reflection: { on: true, strength: 0.5, distortion: 0.005 } },
  fogOfWar: { color: 0x101626, opacity: 0.72, edge: 140 },
  bloom: { on: true, strength: 1.0, radius: 0.8, threshold: 0.55, limit: 0.3 },
  fighterRim: { on: true, strength: 0.6, color: 0xcfd8ff, power: 3, team: 0.85 },
  tints: {
    iron: 0xb9c0ca,
    chainGlow: 0.22,
    rope: COLORS.rope,
    ropeGlow: GRAPPLE_LOOK.ropeGlow,
    teams: TEAM_COLORS,
    characterSelfLight: 0.24,
    overlay: NIGHT_INK,
  },
  intro: {
    from: { position: { x: 20, y: 2.8, z: 41 }, target: { x: 46, y: 13, z: -66 }, fovDeg: 46 },
    to: { position: { x: 25, y: 4.4, z: 35 }, target: { x: 46, y: 12, z: -66 }, fovDeg: 46 },
    haze: 1,
  },
  ambient: [],
};
