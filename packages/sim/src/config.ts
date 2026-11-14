import type { Arena, ItemId, UpgradeId } from './types';

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

export type ItemSpec = { readonly cost: number; readonly cooldown: number };

/** An item's cooldown counts from the moment its use ends. */
export const ITEMS: Readonly<Record<ItemId, ItemSpec>> = {
  grapple: { cost: 150, cooldown: 10 },
};

export const ITEM_IDS: readonly ItemId[] = ['grapple'];

export const GRAPPLE = {
  range: 1500,
  flightSpeed: 1800,
  pullSpeed: 900,
} as const;
