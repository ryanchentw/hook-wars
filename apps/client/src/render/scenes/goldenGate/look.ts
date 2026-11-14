import { TEAM_COLORS } from '../../theme';
import { glow, paint, type Paint } from '../kit/paint';
import type { Drift, OverlayInk, SceneLook } from '../types';

export const GATE_COLORS = {
  /** International orange, a little deepened: the low sun and the tone mapping lift it back. */
  bridge: 0xb5361f,
  bridgeLit: 0xd9512c,
  skyTop: 0x54708f,
  skyLow: 0xf0b98c,
  fog: 0xd8b9a0,
  fogBank: 0xf4dcc6,
  sun: 0xffbd82,
  skyFill: 0x8fa5c6,
  bounce: 0x6e5740,
  water: 0x24444a,
  timberPale: 0xb9a78d,
  pile: 0x4a3c30,
  pileCap: 0xd9d2c2,
  concrete: 0xa89f92,
  asphalt: 0x2e2f33,
  rope: 0xbfa372,
  crate: 0x7b5a3a,
  seaLion: 0x6b4c33,
  seaLionPale: 0x9a7650,
  fender: 0x1c1b1a,
  headland: 0x5a4a35,
} as const;

const C = GATE_COLORS;

/** World units. The piers stand high on their piles, so the bridge beyond them is seen from above. */
export const GATE_SIZES = {
  waterLevel: -2.6,
  apron: 1.2,
  side: 4,
  pierDepth: 4.2,
} as const;

export const GATE_PAINTS: Readonly<Record<string, Paint>> = {
  pierWest: paint({ map: 'pierWest', roughness: 0.92, castShadow: false }),
  pierEast: paint({ map: 'pierEast', roughness: 0.92, castShadow: false }),
  apron: paint({ map: 'planks', tile: { u: 4, v: 4 }, roughness: 0.92, castShadow: false }),
  piles: paint({ map: 'piles', tile: { u: 3, v: 4.2 }, roughness: 0.95 }),
  edgeBeam: paint({ color: C.timberPale, roughness: 0.85, castShadow: false }),
  pile: paint({ color: C.pile, roughness: 0.95 }),
  pileCap: paint({ color: C.pileCap, roughness: 0.8 }),
  rope: paint({ color: C.rope, roughness: 1 }),
  crate: paint({ color: C.crate, map: 'planks', tile: { u: 2, v: 2 }, roughness: 0.9 }),
  // The far side of the bridge would be in its own shadow; a little of its own colour keeps the orange from going to mud.
  bridgeSteel: paint({ color: C.bridge, roughness: 0.6, metalness: 0.1, emissive: C.bridge, emissiveIntensity: 0.35 }),
  truss: paint({ color: C.bridge, map: 'truss', tile: { u: 1.1, v: 0.55 }, cutout: true, doubleSided: true, roughness: 0.6, emissive: C.bridge, emissiveIntensity: 0.3 }),
  road: paint({ map: 'road', tile: { u: 3, v: 1.7 }, roughness: 0.9, castShadow: false }),
  concrete: paint({ color: C.concrete, roughness: 0.9 }),
  beacon: glow({ color: 0xff4030, gain: 2 }),
  // One repeat from the deck to the foot, so the weed line falls at the water and nowhere else.
  floatSide: paint({ map: 'cladding', tile: { u: 3.5, v: 5.25 }, roughness: 0.9 }),
  floatDeck: paint({ color: 0xd9cdb8, map: 'planks', tile: { u: 2.4, v: 2.4 }, roughness: 0.9, emissive: 0x8a7f6e, emissiveIntensity: 0.25 }),
  fender: paint({ color: C.fender, roughness: 0.75 }),
  seaLion: paint({ color: C.seaLion, roughness: 0.3 }),
  headland: paint({ color: C.headland, roughness: 1, castShadow: false }),
};

/** Pale text ringed in dark, so it holds on sunlit timber as well as in shade. */
const DUSK_INK: OverlayInk = {
  damage: '#fff1d6',
  damageHeavy: '#ffd2b8',
  nameShadow: '0 0 3px #000, 0 1px 2px #000, 0 0 8px #000',
  damageShadow: '0 0 2px #2a0806, 0 0 3px #2a0806, 0 2px 0 #2a0806, 0 0 10px rgba(60, 10, 6, 0.95)',
};

/** Fog lying on the water behind the bridge, and a thinner drift along the strait. All of it stays below the piers. */
const FOG_BANKS: readonly Drift[] = [
  // Wisps that cross the bridge itself, low enough that the towers stand out of them.
  { count: 14, color: C.fogBank, opacity: 0.3, size: 6.5, box: { min: { x: -30, y: -1.7, z: -7.2 }, max: { x: 108, y: 0.5, z: -3.4 } }, velocity: { x: 0.8, y: 0, z: 0 }, additive: false },
  { count: 28, color: C.fogBank, opacity: 0.34, size: 13, box: { min: { x: -40, y: -2.4, z: -36 }, max: { x: 120, y: 1.2, z: -8 } }, velocity: { x: 0.9, y: 0, z: 0 }, additive: false },
  { count: 30, color: C.fogBank, opacity: 0.4, size: 28, box: { min: { x: -90, y: -2, z: -120 }, max: { x: 170, y: 10, z: -38 } }, velocity: { x: 1.3, y: 0, z: 0 }, additive: false },
  { count: 10, color: C.fogBank, opacity: 0.15, size: 7, box: { min: { x: 33, y: -2.3, z: 4 }, max: { x: 43.8, y: -1.9, z: 60 } }, velocity: { x: 0, y: 0, z: -0.5 }, additive: false },
];

export const GATE_LOOK: SceneLook = {
  id: 'golden-gate',
  title: { name: 'The Golden Gate', caption: 'San Francisco · fog at golden hour' },
  atmosphere: {
    background: C.fog,
    sky: { zenith: C.skyTop, horizon: C.skyLow },
    fog: { color: C.fog, density: 0.0058 },
    exposure: 1.08,
    vignette: 0.55,
  },
  lights: {
    // A low sun in the west-south-west: long warm light across the planks, faces towards the viewer lit.
    key: { color: C.sun, intensity: 3.2, from: { x: -0.78, y: 0.62, z: 0.42 }, shadow: { mapSize: 2048, bias: -0.0006, normalBias: 0.05, radius: 1 } },
    rim: null,
    fill: { sky: C.skyFill, ground: C.bounce, intensity: 1.35 },
  },
  water: { level: GATE_SIZES.waterLevel, color: C.water, roughness: 0.34, metalness: 0.1, swellSize: 16, ripple: 1.3, drift: { x: 0.01, y: 0.016 } },
  fogOfWar: { color: 0x141b26, opacity: 0.6, edge: 120 },
  tints: {
    iron: 0xc3c8d0,
    chainGlow: 0.2,
    rope: 0xf1e6cd,
    ropeGlow: 0.35,
    teams: TEAM_COLORS,
    characterSelfLight: 0.12,
    overlay: DUSK_INK,
  },
  intro: {
    from: { position: { x: 3.5, y: 1.1, z: 2.6 }, target: { x: 22, y: 1.3, z: -4.6 }, fovDeg: 50 },
    to: { position: { x: 5.5, y: 1.7, z: 4.4 }, target: { x: 24, y: 1, z: -4.6 }, fovDeg: 50 },
    // The bridge runs off into the bank; the gameplay camera, looking down from close by, would only be greyed by it.
    haze: 3.4,
  },
  ambient: FOG_BANKS,
};
