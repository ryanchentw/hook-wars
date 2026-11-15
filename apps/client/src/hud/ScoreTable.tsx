import type { TeamId } from '@hookbrawl/sim';
import type { Scoreboard, ScoreRow } from './hudView';
import { TEAM_LABEL } from './labels';

const SIDES: readonly TeamId[] = ['west', 'east'];

function Row({ row }: { readonly row: ScoreRow }) {
  return (
    <tr className={row.isLocal ? 'is-local' : undefined}>
      <th scope="row" className={`hud-${row.team}`}>
        {row.name}
        {row.isLocal && <span className="score-tag">you</span>}
      </th>
      <td>{row.kills}</td>
      <td>{row.deaths}</td>
      <td>{row.assists}</td>
      <td>{row.earned}</td>
    </tr>
  );
}

/** Every fighter, one block per side, so a 3v3 reads as two teams and not six names. */
export function ScoreTable({ board, caption }: { readonly board: Scoreboard; readonly caption: string }) {
  return (
    <table className="score-table">
      <caption className="hud-sr">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Fighter</th>
          <th scope="col">
            <abbr title="Kills">K</abbr>
          </th>
          <th scope="col">
            <abbr title="Deaths">D</abbr>
          </th>
          <th scope="col">
            <abbr title="Assists">A</abbr>
          </th>
          <th scope="col" title="Gold earned this match">
            <span aria-hidden="true">Earned</span>
            <span className="hud-sr">Gold earned</span>
          </th>
        </tr>
      </thead>
      {SIDES.map((side) => (
        <tbody key={side}>
          <tr className="score-side">
            <th scope="rowgroup" colSpan={5} className={`hud-${side}`}>
              {TEAM_LABEL[side]}
            </th>
          </tr>
          {board[side].map((row) => (
            <Row key={row.id} row={row} />
          ))}
        </tbody>
      ))}
    </table>
  );
}
