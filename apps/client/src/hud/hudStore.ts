import type { Purchase } from '@hookwars/sim';
import type { SessionView } from '../game/session';
import { appendKills, deriveHud, NO_FEEDBACK, ownPlayer, type Feedback, type HudView, type KillFeedEntry } from './hudView';
import { bountyEarned, describeOutcome, resolvePurchases, shopSlots, type ResolvedPurchase } from './shopView';

export type HudStore = {
  subscribe(onChange: () => void): () => void;
  getSnapshot(): HudView;
  /** Sends a buy for the local player; the view that answers it says whether it went through. */
  buy(purchase: Purchase): void;
};

type Tracked = { readonly feedback: Feedback; readonly seq: number };
/** A buy that has been sent, and the session's ticket for it. */
type Sent = { readonly purchase: Purchase; readonly ticket: number };

function applyOutcomes(tracked: Tracked, resolved: readonly ResolvedPurchase[], session: SessionView): Tracked {
  const me = ownPlayer(session.getView(), session.localPlayerId);
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
export function createHudStore(session: SessionView): HudStore {
  const listeners = new Set<() => void>();
  const localId = session.localPlayerId;
  let feed: readonly KillFeedEntry[] = [];
  let pending: readonly Sent[] = [];
  let tracked: Tracked = { feedback: NO_FEEDBACK, seq: 0 };
  let snapshot = deriveHud(session.getView(), localId, feed, tracked.feedback);

  session.subscribe((state) => {
    feed = appendKills(feed, state);
    // Online the answer to a buy comes a round trip later; until then it is neither bought nor refused.
    const through = session.answeredThrough();
    const answered = pending.filter((sent) => sent.ticket <= through).map((sent) => sent.purchase);
    pending = pending.filter((sent) => sent.ticket > through);
    tracked = applyBounty(applyOutcomes(tracked, resolvePurchases(answered, state, localId), session), bountyEarned(state, localId));
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
      pending = [...pending, { purchase, ticket: session.queueInput({ kind: 'buy', playerId: localId, purchase }) }];
    },
  };
}
