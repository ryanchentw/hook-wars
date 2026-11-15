import { botName } from '@hookwars/room';
import type { MemberId, Slot, SlotRef } from '@hookwars/room';
import { forwardRef } from 'react';
import type { LocalAction } from '../app/controller';
import { TEAM_LABEL } from '../hud/labels';

type Props = {
  readonly at: SlotRef;
  readonly slot: Slot;
  readonly member: MemberId;
  readonly isHost: boolean;
  /** Online only: the member in this seat hosts the room, or has dropped and may yet return. */
  readonly hosts: boolean;
  readonly away: boolean;
  readonly act: (action: LocalAction) => void;
};

function Occupant({ at, slot, member, hosts, away }: Pick<Props, 'at' | 'slot' | 'member' | 'hosts' | 'away'>) {
  if (slot.kind === 'empty') return null;
  const isYou = slot.kind === 'human' && slot.memberId === member;
  return (
    <span className="slot-name">
      {slot.kind === 'human' ? slot.name : botName(at)}
      <span className="score-tag">{isYou ? 'you' : slot.kind === 'bot' ? 'bot' : 'player'}</span>
      {hosts && <span className="score-tag">host</span>}
      {away && <span className="score-tag slot-away">reconnecting</span>}
    </span>
  );
}

/** An open seat is one button: pressing it sits you there. A screen reader hears which seat. */
function OpenSeat({ at, act }: Pick<Props, 'at' | 'act'>) {
  return (
    <button type="button" className="slot-take" onClick={() => act({ kind: 'moveTo', slot: at })}>
      Sit here
      <span className="hud-sr">
        {' '}
        in {TEAM_LABEL[at.team]} seat {at.index + 1}
      </span>
    </button>
  );
}

/** One seat in a team column. The row itself takes focus when the button that was pressed goes away with the change. */
export const SlotRow = forwardRef<HTMLLIElement, Props>(function SlotRow({ at, slot, member, isHost, hosts, away, act }, ref) {
  return (
    <li ref={ref} tabIndex={-1} className={`slot slot-${slot.kind}`}>
      {slot.kind === 'empty' ? <OpenSeat at={at} act={act} /> : <Occupant at={at} slot={slot} member={member} hosts={hosts} away={away} />}
      {slot.kind === 'bot' && isHost && (
        <button type="button" className="slot-remove" aria-label={`Remove ${botName(at)} from ${TEAM_LABEL[at.team]}`} onClick={() => act({ kind: 'removeBot', slot: at })}>
          <span aria-hidden="true">×</span>
        </button>
      )}
    </li>
  );
});
