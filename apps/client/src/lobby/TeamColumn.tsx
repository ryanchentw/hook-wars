import { fighterCount, SLOTS_PER_TEAM } from '@hookwars/room';
import type { MemberId, RoomState, Slot, SlotRef } from '@hookwars/room';
import type { TeamId } from '@hookwars/sim';
import { useId } from 'react';
import type { AppView, LocalAction } from '../app/controller';
import { TEAM_LABEL } from '../hud/labels';
import { SlotRow } from './SlotRow';

type Props = {
  readonly team: TeamId;
  readonly view: AppView;
  readonly act: (action: LocalAction) => void;
  readonly rowRef: (at: SlotRef) => (el: HTMLLIElement | null) => void;
};

const memberAt = (slot: Slot): MemberId | null => (slot.kind === 'human' ? slot.memberId : null);

function firstOpenSeat(room: RoomState, team: TeamId): SlotRef | null {
  const index = room.slots[team].findIndex((slot) => slot.kind === 'empty');
  return index === -1 ? null : { team, index };
}

/** Fills the team's next open seat. Stays focusable when the team is full, so pressing it for the last seat keeps the keyboard where it was. */
function AddBot({ team, room, act }: { readonly team: TeamId; readonly room: RoomState; readonly act: Props['act'] }) {
  const seat = firstOpenSeat(room, team);
  return (
    <button
      type="button"
      className="hud-button team-add"
      aria-label={`Add a bot to ${TEAM_LABEL[team]}`}
      aria-disabled={seat === null}
      onClick={() => {
        if (seat !== null) act({ kind: 'addBot', slot: seat });
      }}
    >
      + Bot
    </button>
  );
}

export function TeamColumn({ team, view, act, rowRef }: Props) {
  const headingId = useId();
  const { room, member, online } = view;
  const isHost = room.host === member;
  return (
    <section className={`team team-${team} hud-plate`} aria-labelledby={headingId}>
      <div className="team-head">
        <h2 id={headingId} className={`team-name hud-${team}`}>
          {TEAM_LABEL[team]}
          <span className="team-count">
            {fighterCount(room, team)} of {SLOTS_PER_TEAM}
          </span>
        </h2>
        {isHost && <AddBot team={team} room={room} act={act} />}
      </div>
      <ol className="slots">
        {room.slots[team].map((slot, index) => (
          <SlotRow
            key={index}
            ref={rowRef({ team, index })}
            at={{ team, index }}
            slot={slot}
            member={member}
            isHost={isHost}
            hosts={online !== null && memberAt(slot) === room.host}
            away={online !== null && online.away.some((id) => id === memberAt(slot))}
            act={act}
          />
        ))}
      </ol>
    </section>
  );
}
