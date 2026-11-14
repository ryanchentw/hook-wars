import type { EndView } from './hudView';
import { CreditsLink, TEAM_LABEL } from './labels';

export function EndPanel({ end, onPlayAgain }: { readonly end: EndView; readonly onPlayAgain: () => void }) {
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
              <th>Assists</th>
            </tr>
          </thead>
          <tbody>
            {end.rows.map((r) => (
              <tr key={r.id} className={r.isLocal ? 'is-local' : ''}>
                <td className={`hud-${r.team}`}>{r.name}</td>
                <td>{r.kills}</td>
                <td>{r.deaths}</td>
                <td>{r.assists}</td>
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
