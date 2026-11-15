import type { MouseEvent } from 'react';
import type { Purchase } from '@hookwars/sim';
import type { Feedback, SlotFeedback } from './hudView';
import type { PurchaseOutcome, ShopSlotView } from './shopView';

const OUTCOME_TEXT: Readonly<Record<PurchaseOutcome, string>> = {
  bought: 'Bought',
  maxed: 'Maxed',
  owned: 'Owned',
  poor: 'Need gold',
};

function priceText(slot: ShopSlotView): string {
  if (slot.state === 'maxed') return 'Max';
  if (slot.state === 'owned') return 'Owned';
  return `${slot.price}g`;
}

function slotLabel(slot: ShopSlotView): string {
  const level = slot.level === null ? '' : `, level ${slot.level.current} of ${slot.level.max}`;
  const status =
    slot.state === 'maxed' || slot.state === 'owned'
      ? slot.state
      : `${slot.price} gold${slot.state === 'expensive' ? ', not enough gold' : ''}`;
  return `${slot.name}${level}, ${status}`;
}

function Pips({ level }: { readonly level: NonNullable<ShopSlotView['level']> }) {
  return (
    <span className="hud-slot-pips" aria-hidden="true">
      {Array.from({ length: level.max }, (_, i) => (
        <i key={i} className={i < level.current ? 'is-on' : ''} />
      ))}
    </span>
  );
}

/** Keyed by `seq` so React remounts it and the fade replays on every press. */
export function SlotFlash({ feedback }: { readonly feedback: SlotFeedback | undefined }) {
  if (feedback === undefined) return null;
  const tone = feedback.outcome === 'bought' ? 'is-good' : 'is-bad';
  return (
    <span key={feedback.seq} className={`hud-slot-flash ${tone}`} aria-hidden="true">
      {OUTCOME_TEXT[feedback.outcome]}
    </span>
  );
}

type Props = {
  readonly slots: readonly ShopSlotView[];
  readonly feedback: Feedback;
  readonly onBuy: (purchase: Purchase) => void;
};

/** Pressing a slot must not take focus from the game, or Space would press the slot instead of throwing. */
export const keepFocus = (e: MouseEvent): void => e.preventDefault();

export function ShopStrip({ slots, feedback, onBuy }: Props) {
  return (
    <div className="hud-shop hud-plate" role="group" aria-label="Shop">
      {slots.map((slot) => (
        <button
          key={slot.purchase.id}
          type="button"
          className={`hud-slot is-${slot.state}`}
          aria-label={slotLabel(slot)}
          aria-keyshortcuts={slot.digit}
          onMouseDown={keepFocus}
          onClick={() => onBuy(slot.purchase)}
        >
          <span className="hud-slot-head">
            <kbd>{slot.digit}</kbd>
            <span className="hud-slot-price">{priceText(slot)}</span>
          </span>
          <span className="hud-slot-name">{slot.name}</span>
          <span className="hud-slot-foot">{slot.level !== null && <Pips level={slot.level} />}</span>
          <SlotFlash feedback={feedback.slots[slot.purchase.id]} />
        </button>
      ))}
    </div>
  );
}
