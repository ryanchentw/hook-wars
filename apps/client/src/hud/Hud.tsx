import { Fragment, useSyncExternalStore } from 'react';
import { CreditsDialog } from '../credits/CreditsDialog';
import type { Router } from '../credits/route';
import { SHOP_SLOTS } from '../game/bindings';
import { EndPanel } from './EndPanel';
import type { HudStore } from './hudStore';
import type { KillFeedEntry } from './hudView';
import { CreditsLink, TEAM_LABEL } from './labels';
import { PlayerPanel } from './PlayerPanel';
import { ShopStrip } from './ShopStrip';
import './hud.css';
import './shop.css';

function ScoreBar({ west, east, target }: { readonly west: number; readonly east: number; readonly target: number }) {
  return (
    <div className="hud-score hud-plate" aria-label="score">
      <span className="hud-team hud-west">{TEAM_LABEL.west}</span>
      <span className="hud-points hud-west">{west}</span>
      <span className="hud-target">first to {target}</span>
      <span className="hud-points hud-east">{east}</span>
      <span className="hud-team hud-east">{TEAM_LABEL.east}</span>
    </div>
  );
}

function KillFeed({ entries }: { readonly entries: readonly KillFeedEntry[] }) {
  return (
    <ul className="hud-feed">
      {entries.map((e) => (
        <li key={e.key} className="hud-plate">
          <span className={`hud-${e.killer.team}`}>{e.killer.name}</span> decked{' '}
          <span className={`hud-${e.victim.team}`}>{e.victim.name}</span>
          {e.assisters.length > 0 && ' with '}
          {e.assisters.map((a, i) => (
            <Fragment key={a.name}>
              {i > 0 && ', '}
              <span className={`hud-${a.team}`}>{a.name}</span>
            </Fragment>
          ))}
        </li>
      ))}
    </ul>
  );
}

const FIRST_DIGIT = SHOP_SLOTS[0]?.digit;
const LAST_DIGIT = SHOP_SLOTS.at(-1)?.digit;

/**
 * Below 900px only the movement keys stay: every other key is printed on its own slot.
 * The grapple's E is already printed on its slot beside the hook's, so it is left out to keep six shop slots on one row.
 */
function Hint() {
  return (
    <div className="hud-hint hud-plate">
      <kbd>WASD</kbd> move
      <span className="hud-hint-more">
        <kbd>Space</kbd> hook{' '}
        <kbd>
          {FIRST_DIGIT}–{LAST_DIGIT}
        </kbd>{' '}
        buy
      </span>
    </div>
  );
}

export function Hud({ store, router }: { readonly store: HudStore; readonly router: Router }) {
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const route = useSyncExternalStore(router.subscribe, router.getRoute);
  const respawnIn = view.local?.respawnIn ?? null;
  return (
    <div className="hud">
      <ScoreBar west={view.score.west} east={view.score.east} target={view.killTarget} />
      <KillFeed entries={view.killFeed} />
      {respawnIn !== null && view.end === null && (
        <div className="hud-respawn hud-plate">Back on the dock in {Math.ceil(respawnIn)}</div>
      )}
      <div className="hud-bottom">
        {view.local !== null && <PlayerPanel local={view.local} feedback={view.feedback} onBuy={store.buy} />}
        <ShopStrip slots={view.shop} feedback={view.feedback} onBuy={store.buy} />
        <div className="hud-aside">
          <Hint />
          <CreditsLink />
        </div>
      </div>
      {/* aria-live without role="status": the boot screen owns the page's status role. */}
      <p className="hud-sr hud-announcer" aria-live="polite" aria-atomic="true">
        {view.feedback.announcement}
      </p>
      {view.end !== null && <EndPanel end={view.end} onPlayAgain={store.playAgain} />}
      <CreditsDialog open={route === 'credits'} onClose={router.closeCredits} />
    </div>
  );
}
