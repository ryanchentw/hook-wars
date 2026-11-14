import type { Arena } from './types';

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

  meleeRange: 90,
  meleeDamage: 110,
  meleeInterval: 0.7,

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
