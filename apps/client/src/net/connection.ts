import { encodeClientMessage, parseServerMessage, PROTOCOL_VERSION, type ClientMessageInput, type ErrorCode, type RoomRequest, type ServerMessage } from '@hookbrawl/protocol';
import { createStore, type Store } from '../app/store';
import { NET } from './netConfig';
import { backoffDelay, secondsLeft } from './reconnect';
import type { OpenTransport, Transport } from './transport';

/** Why a connection ended for good: the server's reason, or one of the client's own. */
export type LostReason = ErrorCode | 'unreachable' | 'timed-out';

export type ConnStatus =
  | { readonly kind: 'connecting' }
  | { readonly kind: 'online'; readonly pingMs: number | null }
  | { readonly kind: 'reconnecting'; readonly secondsLeft: number }
  | { readonly kind: 'lost'; readonly reason: LostReason };

export type Timers = {
  /** Milliseconds, from a clock that only runs forwards. */
  now(): number;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

export type ConnectionDeps = {
  readonly open: OpenTransport;
  readonly url: string;
  readonly timers: Timers;
  readonly name: string;
  /** Keeps every message for the dev hook, so a test can check what this client was sent. */
  readonly record: boolean;
};

export type Connection = {
  readonly status: Pick<Store<ConnStatus>, 'subscribe' | 'getSnapshot'>;
  /** Every message the server sends, already checked against the protocol. Returns the unsubscriber. */
  listen(onMessage: (message: ServerMessage) => void): () => void;
  /** Dropped unless the line is up: nothing is queued for later, since the server will have moved on. */
  send(message: ClientMessageInput): void;
  isOnline(): boolean;
  /** Gives the seat up and closes. */
  leave(): void;
  /** Closes without a word: the seat is held as for any drop. */
  dispose(): void;
  readonly dev: {
    received(): readonly ServerMessage[];
    /** Cuts the line as a dead network would. */
    drop(): void;
    /** While blocked no attempt to connect gets through. */
    block(blocked: boolean): void;
  };
};

const RECORD_LIMIT = 6000;
const COUNTDOWN_STEP_MS = 250;
const mean = (values: readonly number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * One member's line to one room, kept up across drops. It opens with `first`; once welcomed it knows the room's code
 * and its own token, and after a drop it asks for the same seat again until the server's rejoin window has passed.
 */
export function createConnection(deps: ConnectionDeps, first: RoomRequest): Connection {
  const { timers } = deps;
  const status = createStore<ConnStatus>({ kind: 'connecting' });
  const listeners = new Set<(message: ServerMessage) => void>();
  let transport: Transport | null = null;
  let seat: { readonly code: string; readonly token: string } | null = null;
  let droppedAt: number | null = null;
  let attempt = 0;
  let refusal: ErrorCode | null = null;
  let pings: readonly { readonly id: number; readonly at: number }[] = [];
  let samples: readonly number[] = [];
  let pingSeq = 0;
  let heardAt = 0;
  let closed = false;
  let blocked = false;
  let received: readonly ServerMessage[] = [];
  let timer: unknown = null;
  let heartbeat: unknown = null;

  const setStatus = (next: ConnStatus): void => status.update(() => next);
  const lose = (reason: LostReason): void => {
    closed = true;
    timers.clearTimeout(timer);
    timers.clearTimeout(heartbeat);
    transport?.close();
    setStatus({ kind: 'lost', reason });
  };

  const beat = (): void => {
    heartbeat = timers.setTimeout(beat, NET.pingIntervalMs);
    if (status.getSnapshot().kind !== 'online') return;
    if (timers.now() - heardAt > NET.silenceTimeoutMs) return void transport?.close();
    pingSeq += 1;
    pings = [...pings, { id: pingSeq, at: timers.now() }].slice(-NET.pingSamples);
    transport?.send(encodeClientMessage({ t: 'ping', id: pingSeq }));
  };

  const onPong = (id: number): void => {
    const sent = pings.find((p) => p.id === id);
    if (sent === undefined) return;
    samples = [...samples, timers.now() - sent.at].slice(-NET.pingSamples);
    if (status.getSnapshot().kind === 'online') setStatus({ kind: 'online', pingMs: Math.round(mean(samples)) });
  };

  const onFrame = (frame: unknown): void => {
    const parsed = parseServerMessage(frame);
    if (!parsed.ok) return lose('bad-message');
    const message = parsed.value;
    heardAt = timers.now();
    if (deps.record) received = [...received, message].slice(-RECORD_LIMIT);
    if (message.t === 'pong') return onPong(message.id);
    if (message.t === 'error') return void (refusal = message.code);
    if (message.t === 'welcome') {
      seat = { code: message.code, token: message.token };
      droppedAt = null;
      attempt = 0;
      setStatus({ kind: 'online', pingMs: null });
    }
    listeners.forEach((listener) => listener(message));
  };

  const countDown = (): void => {
    if (closed || droppedAt === null) return;
    const left = secondsLeft(droppedAt, timers.now(), NET.rejoinWindowMs);
    if (left === 0) return lose('timed-out');
    setStatus({ kind: 'reconnecting', secondsLeft: left });
  };

  /** The line ended. A server that said why has the last word; a seat already held is asked for again; anything else never got in. */
  const onClose = (): void => {
    transport = null;
    if (closed) return;
    if (refusal !== null) return lose(refusal);
    if (seat === null) return lose('unreachable');
    droppedAt ??= timers.now();
    countDown();
    if (closed) return;
    timer = timers.setTimeout(dial, backoffDelay(attempt, NET.reconnectFirstDelayMs, NET.reconnectMaxDelayMs));
    attempt += 1;
  };

  function dial(): void {
    if (closed) return;
    if (blocked) return onClose();
    const room: RoomRequest = seat === null ? first : { kind: 'rejoin', code: seat.code, token: seat.token };
    const line = deps.open(deps.url, {
      onOpen: () => line.send(encodeClientMessage({ t: 'hello', v: PROTOCOL_VERSION, name: deps.name, room })),
      onFrame,
      onClose,
    });
    transport = line;
  }

  const ticker = (): void => {
    if (closed) return;
    if (status.getSnapshot().kind === 'reconnecting') countDown();
    timers.setTimeout(ticker, COUNTDOWN_STEP_MS);
  };

  dial();
  beat();
  ticker();

  const shut = (): void => {
    closed = true;
    timers.clearTimeout(timer);
    timers.clearTimeout(heartbeat);
    transport?.close();
    listeners.clear();
  };

  return {
    status,
    listen(onMessage) {
      listeners.add(onMessage);
      return () => {
        listeners.delete(onMessage);
      };
    },
    send(message) {
      if (status.getSnapshot().kind === 'online') transport?.send(encodeClientMessage(message));
    },
    isOnline: () => status.getSnapshot().kind === 'online',
    leave() {
      transport?.send(encodeClientMessage({ t: 'leave' }));
      shut();
    },
    dispose: shut,
    dev: {
      received: () => received,
      drop: () => transport?.close(),
      block(next) {
        blocked = next;
      },
    },
  };
}
