import { ITEMS, TUNING, UPGRADES } from './config';
import type { GameEvent, HookStats, ItemId, Items, Player, Purchase } from './types';

/** What a fighter carries: all the shop needs to know besides their purse. */
type Kit = Pick<Player, 'upgrades' | 'items'>;

export function hookStats(player: Kit): HookStats {
  const { damage, range, speed, size } = player.upgrades;
  const faster = speed * UPGRADES.speed.perLevel;
  return {
    damage: TUNING.hookDamage + damage * UPGRADES.damage.perLevel,
    range: TUNING.hookRange + range * UPGRADES.range.perLevel,
    speed: TUNING.hookSpeed + faster,
    retractSpeed: TUNING.hookRetractSpeed + faster,
    radius: TUNING.hookRadius + size * UPGRADES.size.perLevel,
    barbed: player.items.barb.kind === 'owned',
  };
}

/** The price of the next level or of the item, or null when the upgrade is maxed or the item owned. */
export function priceOf(player: Kit, purchase: Purchase): number | null {
  switch (purchase.kind) {
    case 'upgrade':
      return UPGRADES[purchase.id].costs[player.upgrades[purchase.id]] ?? null;
    case 'item':
      return player.items[purchase.id].kind === 'owned' ? null : ITEMS[purchase.id].cost;
  }
}

export function canBuy(player: Kit & { readonly gold: number }, purchase: Purchase): boolean {
  const price = priceOf(player, purchase);
  return price !== null && player.gold >= price;
}

/** An active item is bought ready to use; a passive one has nothing to track. */
function own(items: Items, id: ItemId, t: number): Items {
  switch (id) {
    case 'grapple':
      return { ...items, grapple: { kind: 'owned', readyAt: t } };
    case 'barb':
      return { ...items, barb: { kind: 'owned' } };
  }
}

function grant(player: Player, purchase: Purchase, t: number): Player {
  switch (purchase.kind) {
    case 'upgrade':
      return { ...player, upgrades: { ...player.upgrades, [purchase.id]: player.upgrades[purchase.id] + 1 } };
    case 'item':
      return { ...player, items: own(player.items, purchase.id, t) };
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
