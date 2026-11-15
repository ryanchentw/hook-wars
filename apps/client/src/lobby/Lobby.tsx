import { canStart, hasEmptySlot, TEAMS } from '@hookwars/room';
import type { SlotRef } from '@hookwars/room';
import { useEffect, useId, useRef } from 'react';
import type { App, AppView, LocalAction } from '../app/controller';
import { LobbyChat } from '../chat/LobbyChat';
import { CreditsLink } from '../hud/labels';
import type { QualitySetting } from '../render/quality';
import { Notice } from '../screens/Notice';
import { Settings } from '../settings/Settings';
import { LobbySettings } from './LobbySettings';
import { RoomShare } from './RoomShare';
import { TeamColumn } from './TeamColumn';
import './lobby.css';

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

/** Why the match cannot be started from here right now, or null when it can. */
function startBlocker(view: AppView): string | null {
  if (view.room.phase.kind === 'in-match') return 'A match is being played. You are in the next one.';
  if (!canStart(view.room)) return 'Each side needs at least one fighter.';
  return view.room.host === view.member ? null : 'The host starts the match.';
}

/** Fill with bots stays focusable once every seat is taken, so the keyboard is not dropped when the press that filled them hides nothing. */
function LobbyActions({ view, app, act }: Props & { readonly act: (action: LocalAction) => void }) {
  const reasonId = useId();
  const blocker = startBlocker(view);
  const full = !hasEmptySlot(view.room);
  return (
    <div className="lobby-actions">
      {view.room.host === view.member && (
        <button
          type="button"
          className="hud-button"
          aria-disabled={full}
          onClick={() => {
            if (!full) act({ kind: 'fillWithBots' });
          }}
        >
          Fill with bots
        </button>
      )}
      <button type="button" className="hud-primary" disabled={blocker !== null} aria-describedby={blocker === null ? undefined : reasonId} onClick={app.start}>
        Start match
      </button>
      {blocker !== null && (
        <p id={reasonId} className="lobby-reason">
          {blocker}
        </p>
      )}
    </div>
  );
}

/** Who fights on which side, and how the match is set up. Online, the room's code and link sit under the title. */
export function Lobby({ view, app, quality }: Props & { readonly quality: QualitySetting }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const keeper = useFocusKeeper();
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
        <div className="lobby-head-end">
          <Settings quality={quality} />
          <CreditsLink />
        </div>
      </header>
      {view.online !== null && <RoomShare code={view.online.code} link={view.online.link} />}
      <div className="lobby-teams">
        {TEAMS.map((team) => (
          <TeamColumn key={team} team={team} view={view} act={act} rowRef={keeper.rowRef} />
        ))}
      </div>
      {view.chat !== null && <LobbyChat feed={view.chat} />}
      <LobbySettings view={view} act={act} />
      <Notice text={view.notice} />
      <LobbyActions view={view} app={app} act={act} />
    </main>
  );
}
