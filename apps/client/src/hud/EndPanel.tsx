import type { EndView, Scoreboard } from './hudView';
import { CreditsLink, TEAM_LABEL } from './labels';
import { ScoreTable } from './ScoreTable';

type Props = {
  readonly end: EndView;
  readonly board: Scoreboard;
  readonly onRematch: () => void;
  readonly onLobby: () => void;
};

export function EndPanel({ end, board, onRematch, onLobby }: Props) {
  return (
    <div className="hud-end-backdrop">
      <div className="hud-end hud-plate" role="dialog" aria-label="match over">
        <h1 className={`hud-${end.winner}`}>{end.localWon ? 'Victory' : 'Defeat'}</h1>
        <p>{TEAM_LABEL[end.winner]} wins the match</p>
        <ScoreTable board={board} caption="Final scores" />
        <div className="hud-end-actions">
          <button type="button" className="hud-primary" onClick={onRematch} autoFocus>
            Rematch
          </button>
          <button type="button" className="hud-button" onClick={onLobby}>
            Back to lobby
          </button>
          <CreditsLink />
        </div>
      </div>
    </div>
  );
}
