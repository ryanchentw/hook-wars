import { parseRoomAction, type MatchStart, type RoomRequest, type RoomView, type ServerMessageOf } from '@hookbrawl/protocol';
import type { Connection, ConnStatus, LostReason } from '../net/connection';
import type { NetLink } from '../net/netSession';
import type { TokenStore } from '../net/tokenStore';
import type { RoomAddress } from './roomAddress';

export type OnlineDeps = {
  /** Opens a line to the server under `name`, asking for `room`. */
  readonly connect: (name: string, room: RoomRequest) => Connection;
  readonly tokens: TokenStore;
  readonly address: RoomAddress;
};

/** What a room on the server tells the app. */
export type OnlineEvents = {
  readonly onWelcome: (welcome: ServerMessageOf<'welcome'>) => void;
  readonly onRoom: (lobby: RoomView) => void;
  readonly onMatchStart: (start: MatchStart) => void;
  readonly onStatus: (status: ConnStatus) => void;
  /** The room is out of reach for good. Everything this held has been let go by the time it is called. */
  readonly onLost: (reason: LostReason) => void;
};

export type OnlineRoom = {
  readonly link: NetLink;
  /** Asks the server for a lobby action. Anything that is not one is not sent. */
  act(action: unknown): void;
  /** Gives the seat up. */
  leave(): void;
};

/**
 * The app's side of one room on the server: messages in become events, the room's code goes in the address and its
 * rejoin token in the tab's storage, and both come out again when the room is left or lost.
 */
export function openOnlineRoom(deps: OnlineDeps, name: string, request: RoomRequest, events: OnlineEvents): OnlineRoom {
  const conn = deps.connect(name, request);
  let code = request.kind === 'create' ? null : request.code;

  const forget = (): void => {
    if (code !== null) deps.tokens.forget(code);
    deps.address.set(null);
  };

  conn.listen((message) => {
    switch (message.t) {
      case 'welcome':
        code = message.code;
        deps.tokens.save(message.code, message.token);
        deps.address.set(message.code);
        return events.onWelcome(message);
      case 'room':
        return events.onRoom(message.lobby);
      case 'matchStart':
        return events.onMatchStart(message.match);
      default:
        return;
    }
  });
  conn.status.subscribe(() => {
    const status = conn.status.getSnapshot();
    if (status.kind !== 'lost') return events.onStatus(status);
    forget();
    events.onLost(status.reason);
  });

  return {
    link: conn,
    act(action) {
      const parsed = parseRoomAction(action);
      if (parsed.ok) conn.send({ t: 'lobby', action: parsed.value });
    },
    leave() {
      conn.leave();
      forget();
    },
  };
}
