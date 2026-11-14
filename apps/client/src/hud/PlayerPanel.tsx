import type { Purchase } from '@hookbrawl/sim';
import { CRITICAL_HP_FRACTION, LOW_HP_FRACTION } from '../game/health';
import { cooldownLabel, type Bounty, type Feedback, type LocalView } from './hudView';
import type { GrappleView } from './shopView';
import { keepFocus, SlotFlash } from './ShopStrip';

const GRAPPLE: Purchase = { kind: 'item', id: 'grapple' };
const FULL_SWEEP = 100;

function HealthBar({ local }: { readonly local: LocalView }) {
  const hpFraction = Math.max(0, local.hp) / local.maxHp;
  const hpState = hpFraction <= CRITICAL_HP_FRACTION ? 'is-critical' : hpFraction <= LOW_HP_FRACTION ? 'is-low' : '';
  return (
    <div className="hud-hp">
      <div className={`hud-hp-fill ${hpState}`} style={{ width: `${Math.round(hpFraction * 100)}%` }} />
      <span className="hud-hp-text">
        {Math.max(0, Math.round(local.hp))} / {local.maxHp}
      </span>
    </div>
  );
}

/** Keyed by the bounty so the highlight replays on each kill or assist, and never on passive income. */
function Purse({ gold, bounty }: { readonly gold: number; readonly bounty: Bounty | null }) {
  return (
    <div className="hud-gold">
      <span className="hud-coin" aria-hidden="true" />
      <span key={bounty?.seq ?? 0} className={`hud-gold-value ${bounty === null ? '' : 'is-rising'}`}>
        {gold}
      </span>
      <span className="hud-sr"> gold</span>
      {bounty !== null && (
        <span key={bounty.seq} className="hud-bounty" aria-hidden="true">
          +{bounty.amount}
        </span>
      )}
    </div>
  );
}

type ActionSlotProps = {
  readonly keyName: string;
  readonly label: string;
  readonly sweep: number;
  readonly ready: boolean;
  readonly barbed?: boolean;
};

/** Two spurs off a shank, the shape the barbs take on the hook itself. */
function BarbMark() {
  return (
    <span className="hud-barb-mark" role="img" aria-label="Barbed hook">
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d="M3 11V1M3 4l6-3M3 8l6-3" />
      </svg>
    </span>
  );
}

function ActionSlot(props: ActionSlotProps) {
  return (
    <div className={`hud-hook ${props.ready ? 'is-ready' : ''}`}>
      <div className="hud-hook-sweep" style={{ height: `${props.sweep}%` }} />
      {props.barbed === true && <BarbMark />}
      <span className="hud-hook-key">{props.keyName}</span>
      <span className="hud-hook-label">{props.label}</span>
    </div>
  );
}

function grappleStatus(view: Exclude<GrappleView, { kind: 'locked' }>): { label: string; sweep: number } {
  switch (view.kind) {
    case 'ready':
      return { label: 'ready', sweep: 0 };
    case 'cooldown':
      return { label: cooldownLabel(view.seconds), sweep: view.fraction * FULL_SWEEP };
    case 'busy':
      return { label: 'busy', sweep: FULL_SWEEP };
  }
}

type GrappleProps = { readonly view: GrappleView; readonly feedback: Feedback; readonly onBuy: (p: Purchase) => void };

function GrappleSlot({ view, feedback, onBuy }: GrappleProps) {
  if (view.kind !== 'locked') {
    const { label, sweep } = grappleStatus(view);
    return <ActionSlot keyName="E" label={label} sweep={sweep} ready={view.kind === 'ready'} />;
  }
  return (
    <button
      type="button"
      className={`hud-hook hud-grapple is-locked ${view.affordable ? 'is-affordable' : ''}`}
      aria-label={`Grapple, locked, buy for ${view.price} gold${view.affordable ? '' : ', not enough gold'}`}
      onMouseDown={keepFocus}
      onClick={() => onBuy(GRAPPLE)}
    >
      <span className="hud-hook-key">E</span>
      <span className="hud-hook-label">{view.price}g</span>
      <SlotFlash feedback={feedback.slots.grapple} />
    </button>
  );
}

type Props = { readonly local: LocalView; readonly feedback: Feedback; readonly onBuy: (p: Purchase) => void };

export function PlayerPanel({ local, feedback, onBuy }: Props) {
  const ready = !local.hookInFlight && local.cooldownSeconds <= 0;
  const hookLabel = local.hookInFlight ? 'in flight' : ready ? 'ready' : cooldownLabel(local.cooldownSeconds);
  const hookSweep = local.hookInFlight ? FULL_SWEEP : local.cooldownFraction * FULL_SWEEP;
  return (
    <div className="hud-panel hud-plate">
      <div className="hud-vitals">
        <HealthBar local={local} />
        <Purse gold={local.gold} bounty={feedback.bounty} />
      </div>
      <ActionSlot keyName="Space" label={hookLabel} sweep={hookSweep} ready={ready} barbed={local.hookBarbed} />
      <GrappleSlot view={local.grapple} feedback={feedback} onBuy={onBuy} />
    </div>
  );
}
