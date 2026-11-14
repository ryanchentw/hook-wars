import type { Purchase } from '@hookbrawl/sim';
import type { Session } from '../game/session';
import { appendKills, deriveHud, NO_FEEDBACK, type Feedback, type HudView, type KillFeedEntry } from './hudView';
import { bountyEarned, describeOutcome, resolvePurchases, shopSlots, type ResolvedPurchase } from './shopView';

export type HudStore = {
  subscribe(onChange: () => void): () => void;
  getSnapshot(): HudView;
  /** Sends a buy for the local player; the next tick's view says whether it went through. */
  buy(purchase: Purchase): void;
};

type Tracked = { readonly feedback: Feedback; readonly seq: number };

function applyOutcomes(tracked: Tracked, resolved: readonly ResolvedPurchase[], session: Session): Tracked {
  const me = session.getState().players.find((p) => p.id === session.localPlayerId);
  if (me === undefined || resolved.length === 0) return tracked;
  const slots = shopSlots(me);
  return resolved.reduce<Tracked>((acc, { purchase, outcome }) => {
    const slot = slots.find((s) => s.purchase.id === purchase.id);
    const seq = acc.seq + 1;
    return {
      seq,
      feedback: {
        ...acc.feedback,
        slots: { ...acc.feedback.slots, [purchase.id]: { outcome, seq } },
        announcement: slot === undefined ? acc.feedback.announcement : describeOutcome(slot, outcome),
      },
    };
  }, tracked);
}

function applyBounty(tracked: Tracked, amount: number): Tracked {
  if (amount === 0) return tracked;
  const seq = tracked.seq + 1;
  return { seq, feedback: { ...tracked.feedback, bounty: { amount, seq } } };
}

/** Recomputes the HUD once per sim tick, never per animation frame, and caches it for `useSyncExternalStore`. */
export function createHudStore(session: Session): HudStore {
  const listeners = new Set<() => void>();
  const localId = session.localPlayerId;
  let feed: readonly KillFeedEntry[] = [];
  let pending: readonly Purchase[] = [];
  let tracked: Tracked = { feedback: NO_FEEDBACK, seq: 0 };
  let snapshot = deriveHud(session.getState(), localId, feed, tracked.feedback);

  session.subscribe((state) => {
    feed = appendKills(feed, state);
    tracked = applyBounty(applyOutcomes(tracked, resolvePurchases(pending, state, localId), session), bountyEarned(state, localId));
    pending = [];
    snapshot = deriveHud(state, localId, feed, tracked.feedback);
    listeners.forEach((l) => l());
  });

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    getSnapshot: () => snapshot,
    buy(purchase) {
      pending = [...pending, purchase];
      session.queueInput({ kind: 'buy', playerId: localId, purchase });
    },
  };
}
