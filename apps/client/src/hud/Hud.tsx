import { useSyncExternalStore } from 'react';
import type { TeamId } from '@hookbrawl/sim';
import { CreditsDialog } from '../credits/CreditsDialog';
import { CREDITS_HASH, type Router } from '../credits/route';
import { CRITICAL_HP_FRACTION, LOW_HP_FRACTION } from '../game/health';
import type { HudStore } from './hudStore';
import type { EndView, KillFeedEntry, LocalView } from './hudView';
import './hud.css';

const TEAM_LABEL: Readonly<Record<TeamId, string>> = { west: 'West Dock', east: 'East Dock' };

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

function PlayerPanel({ local }: { readonly local: LocalView }) {
  const hpFraction = Math.max(0, local.hp) / local.maxHp;
  const hpPct = Math.round(hpFraction * 100);
  const hpState = hpFraction <= CRITICAL_HP_FRACTION ? 'is-critical' : hpFraction <= LOW_HP_FRACTION ? 'is-low' : '';
  const ready = !local.hookInFlight && local.cooldownSeconds <= 0;
  const hookLabel = local.hookInFlight ? 'in flight' : ready ? 'ready' : `${local.cooldownSeconds.toFixed(1)}s`;
  return (
    <div className="hud-panel hud-plate">
      <div className="hud-hp">
        <div className={`hud-hp-fill ${hpState}`} style={{ width: `${hpPct}%` }} />
        <span className="hud-hp-text">
          {Math.max(0, Math.round(local.hp))} / {local.maxHp}
        </span>
      </div>
      <div className={`hud-hook ${ready ? 'is-ready' : ''}`}>
        <div className="hud-hook-sweep" style={{ height: `${local.hookInFlight ? 100 : local.cooldownFraction * 100}%` }} />
        <span className="hud-hook-key">Space</span>
        <span className="hud-hook-label">{hookLabel}</span>
      </div>
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
        </li>
      ))}
    </ul>
  );
}

function EndPanel({ end, onPlayAgain }: { readonly end: EndView; readonly onPlayAgain: () => void }) {
  return (
    <div className="hud-end-backdrop">
      <div className="hud-end hud-plate" role="dialog" aria-label="match over">
        <h1 className={`hud-${end.winner}`}>{end.localWon ? 'Victory' : 'Defeat'}</h1>
        <p>{TEAM_LABEL[end.winner]} wins the harbour</p>
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Kills</th>
              <th>Deaths</th>
            </tr>
          </thead>
          <tbody>
            {end.rows.map((r) => (
              <tr key={r.id} className={r.isLocal ? 'is-local' : ''}>
                <td className={`hud-${r.team}`}>{r.name}</td>
                <td>{r.kills}</td>
                <td>{r.deaths}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="hud-end-actions">
          <button type="button" onClick={onPlayAgain} autoFocus>
            Play again
          </button>
          <CreditsLink />
        </div>
      </div>
    </div>
  );
}

function CreditsLink() {
  return (
    <a className="hud-button" href={CREDITS_HASH}>
      Credits
    </a>
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
        {view.local !== null && <PlayerPanel local={view.local} />}
        <div className="hud-aside">
          <div className="hud-hint hud-plate">
            <kbd>WASD</kbd> move <kbd>Space</kbd>/<kbd>Click</kbd> hook
          </div>
          <CreditsLink />
        </div>
      </div>
      {view.end !== null && <EndPanel end={view.end} onPlayAgain={store.playAgain} />}
      <CreditsDialog open={route === 'credits'} onClose={router.closeCredits} />
    </div>
  );
}
