import { botName } from '@hookbrawl/room';
import type { MemberId, Slot, SlotRef } from '@hookbrawl/room';
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

/** Visible on screen as "Sit here"; a screen reader hears which slot. */
function Where({ at }: { readonly at: SlotRef }) {
  return <span className="hud-sr"> in {TEAM_LABEL[at.team]} slot {at.index + 1}</span>;
}

function Occupant({ at, slot, member, hosts, away }: Pick<Props, 'at' | 'slot' | 'member' | 'hosts' | 'away'>) {
  if (slot.kind === 'empty') return <span className="slot-name slot-empty">Open slot</span>;
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

/** One seat in a team column. The row itself takes focus when the button that was pressed goes away with the change. */
export const SlotRow = forwardRef<HTMLLIElement, Props>(function SlotRow({ at, slot, member, isHost, hosts, away, act }, ref) {
  return (
    <li ref={ref} tabIndex={-1} className={`slot slot-${slot.kind}`}>
      <Occupant at={at} slot={slot} member={member} hosts={hosts} away={away} />
      <span className="slot-actions">
        {slot.kind === 'empty' && (
          <button type="button" className="hud-button" onClick={() => act({ kind: 'moveTo', slot: at })}>
            Sit here
            <Where at={at} />
          </button>
        )}
        {slot.kind === 'empty' && isHost && (
          <button type="button" className="hud-button" onClick={() => act({ kind: 'addBot', slot: at })}>
            Add bot
            <Where at={at} />
          </button>
        )}
        {slot.kind === 'bot' && isHost && (
          <button type="button" className="hud-button" onClick={() => act({ kind: 'removeBot', slot: at })}>
            Remove
            <span className="hud-sr"> {botName(at)} from {TEAM_LABEL[at.team]}</span>
          </button>
        )}
      </span>
    </li>
  );
});
