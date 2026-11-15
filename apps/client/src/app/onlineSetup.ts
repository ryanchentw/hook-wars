import type { ServerMessage } from '@hookwars/protocol';
import { createConnection, type Connection, type ConnStatus, type Timers } from '../net/connection';
import { lagRulesFromQuery } from '../net/lagSim';
import { NET } from '../net/netConfig';
import { createTokenStore } from '../net/tokenStore';
import { openWebSocket, withLag } from '../net/transport';
import type { OnlineDeps } from './onlineRoom';
import { createRoomAddress } from './roomAddress';

const WS_PATH = '/ws';

/** What a test may ask of the line to the server. Dev builds only. */
export type NetDevHook = {
  status(): ConnStatus;
  /** Every message the server has sent this client, already parsed. */
  received(): readonly ServerMessage[];
  /** Cuts the line, as a dead network would. */
  drop(): void;
  /** While blocked no attempt to connect gets through, so the reconnecting state can be looked at. */
  block(blocked: boolean): void;
};

declare global {
  interface Window {
    __hookwarsNet?: NetDevHook;
  }
}

function installNetHook(conn: Connection): void {
  window.__hookwarsNet = { status: conn.status.getSnapshot, received: conn.dev.received, drop: conn.dev.drop, block: conn.dev.block };
}

/** The server is wherever the page came from: one service serves both. */
const serverUrl = (location: Location): string => `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${WS_PATH}`;

/** How this page reaches rooms on the server. In a dev build `?netlag=` and `?netloss=` put a worse line in between. */
export function browserOnline(win: Window): OnlineDeps {
  const timers: Timers = {
    now: () => performance.now(),
    setTimeout: (run, ms) => win.setTimeout(run, ms),
    clearTimeout: (handle) => win.clearTimeout(handle as number | undefined),
  };
  const lag = import.meta.env.DEV ? lagRulesFromQuery(win.location.search, NET.lagSimRetransmitMs) : null;
  const open = lag === null ? openWebSocket : withLag(openWebSocket, lag, timers, Math.random);
  return {
    tokens: createTokenStore(() => win.sessionStorage),
    address: createRoomAddress(win),
    connect(name, room) {
      const conn = createConnection({ open, url: serverUrl(win.location), timers, name, record: import.meta.env.DEV }, room);
      if (import.meta.env.DEV) installNetHook(conn);
      return conn;
    },
  };
}
