import { ITEMS, TUNING, UPGRADES } from './config';
import type { GameEvent, HookStats, Player, Purchase } from './types';

export function hookStats(player: Player): HookStats {
  const { damage, range, speed, size } = player.upgrades;
  const faster = speed * UPGRADES.speed.perLevel;
  return {
    damage: TUNING.hookDamage + damage * UPGRADES.damage.perLevel,
    range: TUNING.hookRange + range * UPGRADES.range.perLevel,
    speed: TUNING.hookSpeed + faster,
    retractSpeed: TUNING.hookRetractSpeed + faster,
    radius: TUNING.hookRadius + size * UPGRADES.size.perLevel,
  };
}

/** The price of the next level or of the item, or null when the upgrade is maxed or the item owned. */
export function priceOf(player: Player, purchase: Purchase): number | null {
  switch (purchase.kind) {
    case 'upgrade':
      return UPGRADES[purchase.id].costs[player.upgrades[purchase.id]] ?? null;
    case 'item':
      return player.items[purchase.id].kind === 'owned' ? null : ITEMS[purchase.id].cost;
  }
}

export function canBuy(player: Player, purchase: Purchase): boolean {
  const price = priceOf(player, purchase);
  return price !== null && player.gold >= price;
}

function grant(player: Player, purchase: Purchase, t: number): Player {
  switch (purchase.kind) {
    case 'upgrade':
      return { ...player, upgrades: { ...player.upgrades, [purchase.id]: player.upgrades[purchase.id] + 1 } };
    case 'item':
      return { ...player, items: { ...player.items, [purchase.id]: { kind: 'owned', readyAt: t } } };
  }
}

/** Anything the player cannot buy is ignored, so a stale or forged request costs nothing. */
export function buy(player: Player, purchase: Purchase, t: number): { player: Player; event: GameEvent | null } {
  const cost = priceOf(player, purchase);
  if (cost === null || player.gold < cost) return { player, event: null };
  return {
    player: { ...grant(player, purchase, t), gold: player.gold - cost },
    event: { kind: 'purchase', playerId: player.id, purchase, cost },
  };
}
