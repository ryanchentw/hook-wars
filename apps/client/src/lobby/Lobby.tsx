import { canStart, fighterCount, hasEmptySlot, KILL_TARGETS, SCENE_IDS, SLOTS_PER_TEAM, TEAMS } from '@hookbrawl/room';
import type { SlotRef } from '@hookbrawl/room';
import type { TeamId } from '@hookbrawl/sim';
import { useEffect, useId, useRef } from 'react';
import type { App, AppView, LocalAction } from '../app/controller';
import { TEAM_LABEL } from '../hud/labels';
import { SCENES } from '../render/scenes/registry';
import { Notice } from '../screens/Notice';
import { SlotRow } from './SlotRow';

type Props = { readonly view: AppView; readonly app: App };

const slotKey = (at: SlotRef): string => `${at.team}-${at.index}`;

/** A pressed button can vanish with the change it made (a bot removed, a seat taken); focus then goes to its row. */
function useFocusKeeper() {
  const rows = useRef(new Map<string, HTMLLIElement>());
  const lastActed = useRef<string | null>(null);
  useEffect(() => {
    const key = lastActed.current;
    if (key === null || (document.activeElement !== document.body && document.activeElement !== null)) return;
    rows.current.get(key)?.focus();
  });
  return {
    rowRef: (at: SlotRef) => (el: HTMLLIElement | null) => {
      if (el === null) rows.current.delete(slotKey(at));
      else rows.current.set(slotKey(at), el);
    },
    acted: (at: SlotRef | null) => {
      lastActed.current = at === null ? null : slotKey(at);
    },
  };
}

function TeamColumn({ team, view, act, rowRef }: { readonly team: TeamId; readonly view: AppView; readonly act: (a: LocalAction) => void; readonly rowRef: (at: SlotRef) => (el: HTMLLIElement | null) => void }) {
  const headingId = useId();
  const { room, member } = view;
  return (
    <section className={`team team-${team} hud-plate`} aria-labelledby={headingId}>
      <h2 id={headingId} className={`team-name hud-${team}`}>
        {TEAM_LABEL[team]}
        <span className="team-count">
          {fighterCount(room, team)} of {SLOTS_PER_TEAM}
        </span>
      </h2>
      <ol className="slots">
        {room.slots[team].map((slot, index) => (
          <SlotRow key={index} ref={rowRef({ team, index })} at={{ team, index }} slot={slot} member={member} isHost={room.host === member} act={act} />
        ))}
      </ol>
    </section>
  );
}

function Settings({ view, act }: { readonly view: AppView; readonly act: (a: LocalAction) => void }) {
  const ids = { scene: useId(), kills: useId() };
  const { settings } = view.room;
  const locked = view.room.host !== view.member;
  return (
    <div className="lobby-settings hud-plate">
      <label htmlFor={ids.scene} className="field-label">
        Scene
      </label>
      <select id={ids.scene} className="field-input" value={settings.scene} disabled={locked} onChange={(e) => act({ kind: 'setScene', scene: e.target.value })}>
        <option value="rotate">Rotate each match</option>
        {SCENE_IDS.map((id) => (
          <option key={id} value={id}>
            {SCENES[id].title.name}
          </option>
        ))}
      </select>
      <label htmlFor={ids.kills} className="field-label">
        Kills to win
      </label>
      <select id={ids.kills} className="field-input" value={settings.killTarget} disabled={locked} onChange={(e) => act({ kind: 'setKillTarget', killTarget: Number(e.target.value) })}>
        {KILL_TARGETS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Who fights on which side, and how the match is set up. Nothing here is a dead control: no room code until rooms are served. */
export function Lobby({ view, app }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const reasonId = useId();
  const titleId = useId();
  const keeper = useFocusKeeper();
  const ready = canStart(view.room);
  const isHost = view.room.host === view.member;
  useEffect(() => heading.current?.focus(), []);
  const act = (action: LocalAction): void => {
    keeper.acted('slot' in action ? action.slot : null);
    app.act(action);
  };

  return (
    <main className="screen lobby" aria-labelledby={titleId}>
      <header className="lobby-head">
        <button type="button" className="hud-button" onClick={app.leaveLobby}>
          ‹ Menu
        </button>
        <h1 ref={heading} id={titleId} tabIndex={-1} className="lobby-title">
          Lobby
        </h1>
        {/* Room for the room code and share link once a server can answer them. */}
        <div className="lobby-share" />
      </header>
      <div className="lobby-teams">
        {TEAMS.map((team) => (
          <TeamColumn key={team} team={team} view={view} act={act} rowRef={keeper.rowRef} />
        ))}
      </div>
      <Settings view={view} act={act} />
      <Notice text={view.notice} />
      <div className="lobby-actions">
        {isHost && (
          <button type="button" className="hud-button" disabled={!hasEmptySlot(view.room)} onClick={() => act({ kind: 'fillWithBots' })}>
            Fill with bots
          </button>
        )}
        <button type="button" className="hud-primary" disabled={!ready || !isHost} aria-describedby={ready ? undefined : reasonId} onClick={app.start}>
          Start match
        </button>
        <p id={reasonId} className="lobby-reason" hidden={ready}>
          Each side needs at least one fighter.
        </p>
      </div>
    </main>
  );
}
