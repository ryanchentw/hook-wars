import type { ActiveItemId, Arena, EffectKind, ItemId, PassiveItemId, PickupKind, UpgradeId } from './types';

export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;

export const TUNING = {
  playerRadius: 34,
  moveSpeed: 300,
  maxHp: 1500,
  respawnDelay: 3,

  hookRange: 1300,
  hookSpeed: 1100,
  hookRetractSpeed: 1300,
  hookRadius: 26,
  hookDamage: 350,
  /** Starts counting when the hook is back in hand, not when it is thrown. */
  hookCooldown: 1.2,

  /** Centre-to-centre distance bodies are pushed apart to. Wider than two radii so the character models do not overlap. */
  bodySpacing: 84,

  meleeRange: 110,
  meleeDamage: 110,
  meleeInterval: 0.7,
  /** How long a player set down by a hook or a grapple cannot act. Half the melee interval, so a brawl alternates blows. */
  landingStagger: 0.35,

  botThinkInterval: 0.25,
  botAimNoise: 0.1,
  botFireChance: 0.5,
  botChaseRange: 320,
  /** Under fog, a bot that sees no enemy walks to this share of its dock nearest the water, to look across. */
  botScoutDepth: 0.35,
  /** When a pickup is in reach, the share of throws a bot spends on it instead of on a fighter. */
  botPickupChance: 0.4,
} as const;

export const DEFAULT_ARENA: Arena = {
  width: 2400,
  height: 1350,
  canal: { x0: 1000, x1: 1400 },
  buoy: { pos: { x: 1200, y: 675 }, radius: 70 },
  spawns: {
    west: [
      { x: 420, y: 675 },
      { x: 420, y: 335 },
      { x: 420, y: 1015 },
    ],
    east: [
      { x: 1980, y: 675 },
      { x: 1980, y: 335 },
      { x: 1980, y: 1015 },
    ],
  },
};

export const ECONOMY = {
  startingGold: 150,
  /** Paid to every player, alive or dead, at each whole second of match time. */
  passiveGold: 5,
  killGold: 200,
  assistGold: 100,
  /** Seconds an enemy's damage keeps counting toward an assist. */
  assistWindow: 6,
} as const;

/** `costs[level]` is the price of the next level; the level is maxed once it equals `costs.length`. */
export type UpgradeSpec = { readonly costs: readonly number[]; readonly perLevel: number };

const UPGRADE_COSTS = [200, 350, 500, 700] as const;

/** `perLevel` adds to hook damage, range, speed (and retract speed) and radius respectively. */
export const UPGRADES: Readonly<Record<UpgradeId, UpgradeSpec>> = {
  damage: { costs: UPGRADE_COSTS, perLevel: 75 },
  range: { costs: UPGRADE_COSTS, perLevel: 150 },
  speed: { costs: UPGRADE_COSTS, perLevel: 150 },
  size: { costs: UPGRADE_COSTS, perLevel: 5 },
};

export const UPGRADE_IDS: readonly UpgradeId[] = ['damage', 'range', 'speed', 'size'];

/** The cooldown counts from the moment the item's use ends. */
export type ActiveItemSpec = { readonly cost: number; readonly cooldown: number };
export type PassiveItemSpec = { readonly cost: number };

export const ITEMS: { readonly [K in ActiveItemId]: ActiveItemSpec } & { readonly [K in PassiveItemId]: PassiveItemSpec } = {
  grapple: { cost: 150, cooldown: 10 },
  barb: { cost: 450 },
};

export const ITEM_IDS: readonly ItemId[] = ['grapple', 'barb'];

export const GRAPPLE = {
  range: 1500,
  flightSpeed: 1800,
  pullSpeed: 900,
} as const;

export const VISION = {
  /** How far each living fighter sees under fog, in sim units. */
  radius: 900,
} as const;

export const PICKUPS = {
  /** Seconds before the water sends the first pickup. */
  firstAt: 12,
  /** Seconds between one pickup entering and the next. */
  interval: 30,
  /** Sim units per second down the water: slow enough to cross the strip in about the interval. */
  driftSpeed: 45,
  radius: 36,
  /** Lanes keep this far from either bank and from the buoy's edge. */
  laneMargin: 50,
  /** What a Gold pickup pays its collector. */
  gold: 250,
} as const;

export const PICKUP_KINDS: readonly PickupKind[] = ['gold', 'gale', 'storm'];

/**
 * What each timed effect does while it lasts. `moveScale` multiplies walking speed; `hookScale` multiplies the flight and
 * retract speed of hooks thrown while it lasts; `pulse` is damage dealt every `interval` seconds, credited to the source.
 */
export type EffectSpec = {
  readonly duration: number;
  readonly moveScale: number;
  readonly hookScale: number;
  readonly pulse: { readonly damage: number; readonly interval: number } | null;
};

export const EFFECTS: Readonly<Record<EffectKind, EffectSpec>> = {
  gale: { duration: 8, moveScale: 1.35, hookScale: 1.3, pulse: null },
  storm: { duration: 8, moveScale: 1, hookScale: 1, pulse: { damage: 30, interval: 1 } },
};
