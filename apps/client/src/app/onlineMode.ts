import type { MatchStart, RoomRequest, RoomView, ServerMessageOf } from '@hookbrawl/protocol';
import { createRoom, parseName, type MemberId } from '@hookbrawl/room';
import type { ConnStatus, LostReason } from '../net/connection';
import { LOCAL, type AppCore } from './appCore';
import { lostMessage } from './lostMessages';
import { openOnlineRoom, type OnlineRoom } from './onlineRoom';
import { parseRoomCode } from './roomAddress';
import type { Route } from './route';

export type OnlineView = {
  readonly code: string;
  /** What a friend opens to land in this room. */
  readonly link: string;
  readonly status: ConnStatus;
  /** Seated members whose connection has dropped and may yet return. */
  readonly away: readonly MemberId[];
};

/** `link`: the page was opened on this room's link. `return`: the player had a seat in it and lost the line. */
export type Invite = { readonly code: string; readonly why: 'link' | 'return' };

export type OnlineMode = {
  /** Whether the page is in, or on its way into, a room on the server. */
  active(): boolean;
  /** At page load: takes up the room in the address again when this tab holds a seat in it, else offers it on the menu. */
  open(): void;
  enter(name: string, request: RoomRequest): void;
  join(name: string, code: string): void;
  act(action: unknown): void;
  start(): void;
  leaveMatch(): void;
  sync(route: Route): void;
};

const BAD_CODE = 'That is not a room code. A code is six letters and digits.';

/** The app while it is in a room on the server: the room, the match and the route all follow what the server says. */
export function createOnlineMode(core: AppCore): OnlineMode {
  const { deps, view, patch } = core;
  const { router } = deps;
  let room: OnlineRoom | null = null;

  const matchLive = (): boolean => view().match?.session.getView().phase.kind === 'playing';
  /** `invite` is what the menu then offers: a room lost mid-visit is offered back, a room left on purpose is not. */
  const toOffline = (notice: string | null, invite: Invite | null): void => {
    room = null;
    core.stopMatch();
    patch({ online: null, connecting: false, invite, room: createRoom(), member: LOCAL, notice });
    if (router.getRoute().screen !== 'menu') router.backTo('menu');
    core.showBackdrop();
  };

  const showLobby = (lobby: RoomView): void => {
    const { online } = view();
    patch({ room: lobby.room, ...(online === null ? {} : { online: { ...online, away: lobby.away } }) });
    core.showBackdrop();
  };

  /** Puts the server's match on screen. A match already showing is carried on: its connection came back, nothing more. */
  const enterMatch = (start: MatchStart): void => {
    const current = view().match;
    if (current !== null && current.matchId === start.matchId) return current.resume();
    const link = room?.link;
    if (link === undefined) return;
    core.stopMatch();
    patch({ starting: true });
    if (router.getRoute().screen !== 'match') router.push('match');
    void core.launch(() => ({ source: { kind: 'online', start, link }, scene: start.scene, intro: !start.resumed && core.wantsIntro(start.scene) }));
  };

  const onWelcome = (welcome: ServerMessageOf<'welcome'>): void => {
    const online: OnlineView = { code: welcome.code, link: deps.online?.address.linkFor(welcome.code) ?? '', status: { kind: 'online', pingMs: null }, away: welcome.lobby.away };
    patch({ online, connecting: false, invite: null, member: welcome.you, room: welcome.lobby.room, notice: null });
    if (router.getRoute().screen === 'menu') router.push('lobby');
    if (welcome.match !== null) return enterMatch(welcome.match);
    // Back from a drop to find the match over: there is nothing left of it to show.
    if (matchLive()) {
      core.stopMatch();
      router.backTo('lobby');
    }
    core.showBackdrop();
  };

  const events = {
    onWelcome,
    onRoom: showLobby,
    onMatchStart: enterMatch,
    onStatus(status: ConnStatus): void {
      const { online } = view();
      if (online !== null) patch({ online: { ...online, status } });
    },
    onLost(reason: LostReason): void {
      const { online, invite } = view();
      // Refused at the door, the menu stays as it was, code and all, so one more press tries again.
      toOffline(lostMessage(reason), online === null ? invite : { code: online.code, why: 'return' });
    },
  };

  const enter = (name: string, request: RoomRequest): void => {
    if (deps.online === undefined || room !== null) return;
    patch({ connecting: true, notice: null });
    room = openOnlineRoom(deps.online, name, request, events);
  };

  const leave = (): void => {
    room?.leave();
    toOffline(null, null);
  };

  return {
    active: () => room !== null,
    enter,
    join(name, raw) {
      const code = parseRoomCode(raw);
      if (code === null) return patch({ notice: BAD_CODE });
      enter(name, { kind: 'join', code });
    },
    open() {
      const address = deps.online?.address;
      const code = address?.code() ?? null;
      if (deps.online === undefined || code === null) return;
      if (router.getRoute().screen !== 'menu') router.replace('menu');
      const token = deps.online.tokens.load(code);
      const name = parseName(view().name);
      patch({ invite: { code, why: 'return' } });
      if (token !== null && name.ok) return enter(name.name, { kind: 'rejoin', code, token });
      patch({ invite: { code, why: 'link' } });
    },
    act: (action) => room?.act(action),
    start: () => room?.act({ kind: 'startMatch' }),
    leaveMatch() {
      if (matchLive()) return leave();
      router.backTo('lobby');
    },
    sync(route) {
      const { match, starting, online } = view();
      // The menu is outside every room: going back to it, by the button or the browser, gives the seat up.
      if (route.screen === 'menu' && online !== null) return leave();
      if (route.screen !== 'match' && matchLive()) {
        // Leaving a match that is still on is asked about first, even when the browser's Back did it.
        router.push('match');
        return view().match?.setLeaving(true);
      }
      if (route.screen !== 'match' && (match !== null || starting)) core.stopMatch();
      if (route.screen === 'match' && match === null && !starting) return router.replace('lobby');
      core.showBackdrop();
    },
  };
}
