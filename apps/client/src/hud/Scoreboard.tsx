import type { Scoreboard as Board } from './hudView';
import { ScoreTable } from './ScoreTable';

/** Shown while Tab is held or the Scores button is on; it never takes focus, so the fight goes on underneath. */
export function Scoreboard({ board }: { readonly board: Board }) {
  return (
    <section className="hud-scoreboard hud-plate" aria-label="Scoreboard">
      <ScoreTable board={board} caption="Scores" />
    </section>
  );
}
