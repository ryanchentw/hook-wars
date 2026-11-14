import { useSyncExternalStore } from 'react';
import type { TeamId } from '@hookbrawl/sim';
import type { HudStore } from './hudStore';
import type { EndView, KillFeedEntry, LocalView } from './hudView';
import './hud.css';

const TEAM_LABEL: Readonly<Record<TeamId, string>> = { west: 'West Dock', east: 'East Dock' };

function ScoreBar({ west, east, target }: { readonly west: number; readonly east: number; readonly target: number }) {
  return (
    <div className="hud-score" aria-label="score">
      <span className="hud-team hud-west">{TEAM_LABEL.west}</span>
      <span className="hud-points hud-west">{west}</span>
      <span className="hud-target">first to {target}</span>
      <span className="hud-points hud-east">{east}</span>
      <span className="hud-team hud-east">{TEAM_LABEL.east}</span>
    </div>
  );
}

function PlayerPanel({ local }: { readonly local: LocalView }) {
  const hpPct = Math.round((Math.max(0, local.hp) / local.maxHp) * 100);
  const ready = !local.hookInFlight && local.cooldownSeconds <= 0;
  const hookLabel = local.hookInFlight ? 'in flight' : ready ? 'ready' : `${local.cooldownSeconds.toFixed(1)}s`;
  return (
    <div className="hud-panel">
      <div className="hud-hp">
        <div className="hud-hp-fill" style={{ width: `${hpPct}%` }} />
        <span className="hud-hp-text">
          {Math.max(0, Math.round(local.hp))} / {local.maxHp}
        </span>
      </div>
      <div className={`hud-hook ${ready ? 'is-ready' : ''}`}>
        <div className="hud-hook-sweep" style={{ height: `${local.hookInFlight ? 100 : local.cooldownFraction * 100}%` }} />
        <span className="hud-hook-key">Q</span>
        <span className="hud-hook-label">{hookLabel}</span>
      </div>
    </div>
  );
}

function KillFeed({ entries }: { readonly entries: readonly KillFeedEntry[] }) {
  return (
    <ul className="hud-feed">
      {entries.map((e) => (
        <li key={e.key}>
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
      <div className="hud-end" role="dialog" aria-label="match over">
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
        <button type="button" onClick={onPlayAgain} autoFocus>
          Play again
        </button>
      </div>
    </div>
  );
}

export function Hud({ store }: { readonly store: HudStore }) {
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const respawnIn = view.local?.respawnIn ?? null;
  return (
    <div className="hud">
      <ScoreBar west={view.score.west} east={view.score.east} target={view.killTarget} />
      <KillFeed entries={view.killFeed} />
      {respawnIn !== null && view.end === null && (
        <div className="hud-respawn">Back on the dock in {Math.ceil(respawnIn)}</div>
      )}
      <div className="hud-bottom">
        {view.local !== null && <PlayerPanel local={view.local} />}
        <div className="hud-hint">
          <kbd>Right click</kbd> move <kbd>Q</kbd>/<kbd>Left click</kbd> hook <kbd>S</kbd> stop
        </div>
      </div>
      {view.end !== null && <EndPanel end={view.end} onPlayAgain={store.playAgain} />}
    </div>
  );
}
