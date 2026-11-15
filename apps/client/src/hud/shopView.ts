import { canBuy, ECONOMY, ITEMS, priceOf, UPGRADES } from '@hookwars/sim';
import type { Player, PlayerId, Purchase, SeenPlayer, TeamView } from '@hookwars/sim';
import { SHOP_SLOTS } from '../game/bindings';

export type SlotId = Purchase['id'];
export type SlotState = 'affordable' | 'expensive' | 'maxed' | 'owned';

export type ShopSlotView = {
  readonly purchase: Purchase;
  readonly digit: string;
  readonly name: string;
  /** Null for items, which have no levels. */
  readonly level: { readonly current: number; readonly max: number } | null;
  /** Null once maxed or owned. */
  readonly price: number | null;
  readonly state: SlotState;
};

export type GrappleView =
  | { readonly kind: 'locked'; readonly price: number; readonly affordable: boolean }
  | { readonly kind: 'ready' }
  | { readonly kind: 'cooldown'; readonly seconds: number; readonly fraction: number }
  | { readonly kind: 'busy' };

/** `poor` means the price was there but the gold was not. */
export type PurchaseOutcome = 'bought' | 'maxed' | 'owned' | 'poor';
export type ResolvedPurchase = { readonly purchase: Purchase; readonly outcome: PurchaseOutcome };

const GRAPPLE: Purchase = { kind: 'item', id: 'grapple' };

export const SLOT_NAMES: Readonly<Record<SlotId, string>> = {
  damage: 'Damage',
  range: 'Range',
  speed: 'Speed',
  size: 'Size',
  grapple: 'Grapple',
  barb: 'Barb',
};

function levelOf(player: SeenPlayer, purchase: Purchase): ShopSlotView['level'] {
  if (purchase.kind === 'item') return null;
  return { current: player.upgrades[purchase.id], max: UPGRADES[purchase.id].costs.length };
}

function slotState(player: Player, purchase: Purchase, price: number | null): SlotState {
  if (price === null) return purchase.kind === 'upgrade' ? 'maxed' : 'owned';
  return canBuy(player, purchase) ? 'affordable' : 'expensive';
}

export function shopSlots(player: Player): readonly ShopSlotView[] {
  return SHOP_SLOTS.map(({ purchase, digit }) => {
    const price = priceOf(player, purchase);
    return {
      purchase,
      digit,
      name: SLOT_NAMES[purchase.id],
      level: levelOf(player, purchase),
      price,
      state: slotState(player, purchase, price),
    };
  });
}

/** Cooldown shows first, since it is the wait that matters; busy covers every state in which the sim refuses a cast. */
export function grappleView(state: TeamView, player: Player): GrappleView {
  const item = player.items.grapple;
  if (item.kind === 'unowned') return { kind: 'locked', price: ITEMS.grapple.cost, affordable: canBuy(player, GRAPPLE) };
  const seconds = Math.max(0, item.readyAt - state.time);
  if (seconds > 0) return { kind: 'cooldown', seconds, fraction: Math.min(1, seconds / ITEMS.grapple.cooldown) };
  const hookOut = state.hooks.some((h) => h.ownerId === player.id);
  return player.status.kind !== 'alive' || hookOut ? { kind: 'busy' } : { kind: 'ready' };
}

const samePurchase = (a: Purchase, b: Purchase): boolean => a.kind === b.kind && a.id === b.id;

function refusal(player: SeenPlayer | undefined, purchase: Purchase): PurchaseOutcome {
  if (player === undefined || priceOf(player, purchase) !== null) return 'poor';
  return purchase.kind === 'upgrade' ? 'maxed' : 'owned';
}

/**
 * Matches the buys sent since the last tick against the purchases that tick granted.
 * The sim drops a refused buy without an event, so an unmatched press was refused.
 */
export function resolvePurchases(pending: readonly Purchase[], state: TeamView, localId: PlayerId): readonly ResolvedPurchase[] {
  const player = state.players.find((p) => p.id === localId);
  let granted = state.events.flatMap((e) => (e.kind === 'purchase' && e.playerId === localId ? [e.purchase] : []));
  return pending.map((purchase) => {
    const match = granted.findIndex((g) => samePurchase(g, purchase));
    if (match === -1) return { purchase, outcome: refusal(player, purchase) };
    granted = granted.filter((_, i) => i !== match);
    return { purchase, outcome: 'bought' };
  });
}

export function describeOutcome(slot: ShopSlotView, outcome: PurchaseOutcome): string {
  switch (outcome) {
    case 'bought':
      return slot.level === null ? `Bought ${slot.name}.` : `Bought ${slot.name}, now level ${slot.level.current} of ${slot.level.max}.`;
    case 'maxed':
      return `${slot.name} is already maxed.`;
    case 'owned':
      return `${slot.name} is already owned.`;
    case 'poor':
      return `Not enough gold for ${slot.name}: ${slot.price} needed.`;
  }
}

/** Gold from kills and assists this tick. Passive income is left out so it never flashes the purse. */
export function bountyEarned(state: TeamView, localId: PlayerId): number {
  return state.events.reduce((sum, e) => {
    if (e.kind !== 'kill') return sum;
    if (e.killerId === localId) return sum + ECONOMY.killGold;
    return e.assistIds.includes(localId) ? sum + ECONOMY.assistGold : sum;
  }, 0);
}
