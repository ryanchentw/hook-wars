import { glow, paint, type Paint } from '../kit/paint';
import type { OverlayInk, SceneLook } from '../types';

export const DAAN_COLORS = {
  skyTop: 0x4d8ccc,
  skyLow: 0xcfe3ee,
  haze: 0xc9dde6,
  sun: 0xfff0d2,
  skyFill: 0xb9d4ee,
  lawnBounce: 0x6c8848,
  pond: 0x33472b,
  stone: 0xb9b6ab,
  rock: 0x8d8a80,
  bark: 0x6b5a48,
  leaf: 0x3a5f2e,
  leafLight: 0x55783a,
  leafDark: 0x284a24,
  shrub: 0x34582a,
  azalea: 0xd4487a,
  azaleaPale: 0xf2b6cc,
  benchWood: 0x8a6a48,
  iron: 0x23262a,
  lampGlobe: 0xf2efe6,
  column: 0x9c2f24,
  roofTile: 0xc47a2c,
  roofRidge: 0x7d3f1c,
  egret: 0xf7f6f0,
  egretLeg: 0x2a2a26,
  towerGlass: 0x7fa9ad,
  towerBand: 0xa9c9c6,
  city: 0xa8b6c2,
  hills: 0x7f9aa6,
} as const;

const C = DAAN_COLORS;

/** World units. The pond lies only a little below the lawns. */
export const DAAN_SIZES = {
  waterLevel: -0.7,
  /** Lawn and path beyond the playable rectangle. */
  north: 11,
  side: 12,
  south: 14,
  bankDepth: 2.4,
} as const;

export const DAAN_PAINTS: Readonly<Record<string, Paint>> = {
  lawnWest: paint({ map: 'lawnWest', roughness: 1, castShadow: false }),
  lawnEast: paint({ map: 'lawnEast', roughness: 1, castShadow: false }),
  grass: paint({ map: 'grass', tile: { u: 8, v: 8 }, roughness: 1, castShadow: false }),
  path: paint({ map: 'pavers', tile: { u: 3, v: 3 }, roughness: 0.9, castShadow: false }),
  bank: paint({ color: C.rock, map: 'rockery', tile: { u: 3, v: 2.4 }, roughness: 0.95 }),
  kerb: paint({ color: C.stone, roughness: 0.85, castShadow: false }),
  rock: paint({ color: C.rock, map: 'rockery', tile: { u: 3.5, v: 1.8 }, roughness: 0.95 }),
  bark: paint({ color: C.bark, roughness: 1 }),
  leaf: paint({ color: C.leaf, map: 'foliage', roughness: 0.95 }),
  leafFar: paint({ color: C.leaf, map: 'foliage', roughness: 0.95, castShadow: false }),
  shrub: paint({ color: C.shrub, map: 'foliage', roughness: 0.95 }),
  azalea: paint({ color: 0xffffff, map: 'blossom', roughness: 0.9 }),
  benchWood: paint({ color: C.benchWood, roughness: 0.85 }),
  iron: paint({ color: C.iron, roughness: 0.55, metalness: 0.4 }),
  lampGlobe: paint({ color: C.lampGlobe, roughness: 0.4 }),
  column: paint({ color: C.column, roughness: 0.6 }),
  roofTile: paint({ color: C.roofTile, map: 'roofTiles', tile: { u: 1.2, v: 0.6 }, roughness: 0.45 }),
  roofRidge: paint({ color: C.roofRidge, roughness: 0.6 }),
  egret: paint({ color: C.egret, roughness: 0.7, emissive: C.egret, emissiveIntensity: 0.15 }),
  egretLeg: paint({ color: C.egretLeg, roughness: 0.8 }),
  reflection: glow({ map: 'towerReflection', blend: 'alpha', opacity: 0.24, fog: false }),
  lilies: paint({ map: 'lilies', tile: { u: 4, v: 4 }, cutout: true, roughness: 0.6, castShadow: false }),
  towerGlass: glow({ color: C.towerGlass, map: 'towerFace', tile: { u: 4, v: 5.5 } }),
  towerBand: glow({ color: C.towerBand }),
  city: glow({ color: C.city, map: 'cityBlocks', tile: { u: 12, v: 12 } }),
  hills: glow({ color: C.hills }),
  /** Branches higher than the picture reaches: they are there only to throw broken shade on the lawns. */
  shade: paint({ unseen: true, receiveShadow: false }),
};

/** White text ringed heavily in dark: the only ink that holds on a sunlit lawn and a pale path alike. */
const DAY_INK: OverlayInk = {
  damage: '#fff8e6',
  damageHeavy: '#ffe0cc',
  nameShadow: '0 0 2px #000, 0 0 3px #000, 0 1px 2px #000, 0 0 6px #000, 0 0 10px rgba(0, 0, 0, 0.8)',
  damageShadow: '0 0 2px #2a0806, 0 0 3px #2a0806, 0 0 4px #2a0806, 0 2px 0 #2a0806, 0 0 10px rgba(40, 6, 4, 0.95)',
};

export const DAAN_LOOK: SceneLook = {
  id: 'daan',
  title: { name: '大安森林公園', caption: 'Daan Forest Park · Taipei · a clear afternoon' },
  atmosphere: {
    background: C.haze,
    sky: { zenith: C.skyTop, horizon: C.skyLow },
    fog: { color: C.haze, density: 0.0034 },
    exposure: 0.98,
    vignette: 0.35,
  },
  lights: {
    // Mid-afternoon sun from the south-west: faces towards the viewer lit, shadows short and thrown north-east.
    // The shadow's edge is blurred: light through leaves is soft, and so are the patches it leaves on the grass.
    key: { color: C.sun, intensity: 3.0, from: { x: -0.6, y: 0.95, z: 0.5 }, shadow: { mapSize: 2048, bias: -0.0006, normalBias: 0.05, radius: 3.5 } },
    rim: null,
    fill: { sky: C.skyFill, ground: C.lawnBounce, intensity: 1.5 },
  },
  water: { level: DAAN_SIZES.waterLevel, color: C.pond, roughness: 0.22, metalness: 0.05, swellSize: 12, ripple: 0.45, drift: { x: 0.003, y: 0.005 } },
  fogOfWar: { color: 0x22304a, opacity: 0.86, edge: 140 },
  tints: {
    // Bright steel and bleached rope: both cross the dark pond, the mid-green lawns and the grey paving, and pale holds on all three.
    iron: 0xe4e8ec,
    chainGlow: 0.2,
    rope: 0xf3e6c4,
    ropeGlow: 0.3,
    teams: {
      west: { signal: 0xd9480f, tint: 0xf0a070, glow: 0xff6a2a },
      east: { signal: 0x1857c4, tint: 0x7098ee, glow: 0x3f8fff },
    },
    characterSelfLight: 0.06,
    overlay: DAY_INK,
  },
  intro: {
    from: { position: { x: 27.5, y: 1.5, z: 45 }, target: { x: 64, y: 12, z: -90 }, fovDeg: 44 },
    to: { position: { x: 29.5, y: 2.3, z: 40 }, target: { x: 66, y: 11, z: -90 }, fovDeg: 44 },
    haze: 1.5,
  },
  ambient: [],
};
