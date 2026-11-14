import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { encodeServerMessage, MAX_CLIENT_MESSAGE_BYTES, parseClientMessage, PROTOCOL_VERSION, type ClientMessage, type ClientMessageOf, type ErrorCode } from '@hookbrawl/protocol';
import type { MemberId } from '@hookbrawl/room';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { clientAddress, createAdmission, originAllowed, type Admission } from './admission';
import type { ServerConfig } from './config';
import type { Logger } from './logger';
import { fullBucket, takeToken, type Bucket, type BucketRule } from './rateLimit';
import type { Clock, Registry, Sink } from './rooms/registry';

export const WS_PATH = '/ws';
const CLOSE_POLICY = 1008;
const CLOSE_GOING_AWAY = 1001;
/** The cheapest setting: snapshots are small and alike, and the machine's CPU is worth more than the last few bytes. */
const DEFLATE_LEVEL = 1;
const DEFLATE_THRESHOLD_BYTES = 128;

type Seat = { readonly code: string; readonly member: MemberId };

type Connection = {
  readonly ws: WebSocket;
  readonly address: string;
  readonly sink: Sink;
  seat: Seat | null;
  bucket: Bucket;
  /** Messages dropped for arriving too fast. A client that keeps at it is cut off. */
  strikes: number;
  /** Cleared when a heartbeat goes out and set when its answer comes back. */
  alive: boolean;
};

export type Gateway = { connections(): number; close(code: ErrorCode): void };

type Deps = { readonly config: ServerConfig; readonly registry: Registry; readonly clock: Clock; readonly log: Logger };

function refuseUpgrade(socket: Duplex, status: string): void {
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
}

function makeSink(ws: WebSocket, maxBufferedBytes: number): Sink {
  return {
    send(message) {
      if (ws.readyState !== WebSocket.OPEN) return;
      // A snapshot is stale the moment the next exists, so a client that cannot keep up is spared the backlog.
      if (message.t === 'snap' && ws.bufferedAmount > maxBufferedBytes) return;
      ws.send(encodeServerMessage(message));
    },
    close(code) {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(encodeServerMessage({ t: 'error', code }));
      ws.close(code === 'shutdown' ? CLOSE_GOING_AWAY : CLOSE_POLICY, code);
    },
  };
}

function hello(conn: Connection, message: ClientMessageOf<'hello'>, deps: Deps, admission: Admission): void {
  const { registry, clock } = deps;
  if (conn.seat !== null) return conn.sink.close('bad-message');
  if (message.v !== PROTOCOL_VERSION) return conn.sink.close('bad-version');
  if (!admission.mayJoin(conn.address, clock.now())) return conn.sink.close('rate-limited');
  const code = message.room.kind === 'create' ? registry.create() : message.room.code;
  if (code === null) return conn.sink.close('server-full');
  const entry = registry.enter(code, message.room.kind === 'rejoin' ? { kind: 'rejoin', token: message.room.token } : { kind: 'join', name: message.name }, conn.sink);
  if (!entry.ok) return conn.sink.close(entry.code);
  conn.seat = { code, member: entry.member };
}

function dispatch(conn: Connection, message: ClientMessage, deps: Deps, admission: Admission): void {
  if (message.t === 'hello') return hello(conn, message, deps, admission);
  const { seat } = conn;
  if (seat === null) return conn.sink.close('bad-message');
  switch (message.t) {
    case 'ping':
      return conn.sink.send({ t: 'pong', id: message.id });
    case 'lobby':
      return deps.registry.lobby(seat.code, seat.member, message.action);
    case 'input':
      return deps.registry.input(seat.code, seat.member, message);
    case 'leave':
      conn.seat = null;
      deps.registry.leave(seat.code, seat.member);
      return conn.ws.close();
  }
}

function receive(conn: Connection, data: RawData, isBinary: boolean, rule: BucketRule, deps: Deps, admission: Admission): void {
  const taken = takeToken(conn.bucket, rule, deps.clock.now());
  conn.bucket = taken.bucket;
  if (!taken.allowed) {
    conn.strikes += 1;
    if (conn.strikes > rule.capacity) conn.sink.close('rate-limited');
    return;
  }
  const parsed = parseClientMessage(isBinary ? null : data.toString());
  if (!parsed.ok) {
    deps.log.warn('message.refused', { reason: parsed.error.slice(0, 80) });
    return conn.sink.close('bad-message');
  }
  dispatch(conn, parsed.value, deps, admission);
}

/** Drops connections that have gone quiet without closing, as a laptop does when its lid shuts. */
function startHeartbeat(connections: Set<Connection>, intervalMs: number): NodeJS.Timeout {
  return setInterval(() => {
    connections.forEach((conn) => {
      if (!conn.alive) return conn.ws.terminate();
      conn.alive = false;
      conn.ws.ping();
    });
  }, intervalMs);
}

/** Sockets in, typed messages to the registry, and nothing else: no rule of the game or the lobby lives here. */
export function attachGateway(server: Server, deps: Deps): Gateway {
  const { config, registry, clock, log } = deps;
  const admission = createAdmission(config);
  const connections = new Set<Connection>();
  const rule: BucketRule = { capacity: config.messageBurst, perSecond: config.messagesPerSecond };
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_CLIENT_MESSAGE_BYTES,
    perMessageDeflate: config.wsCompression ? { threshold: DEFLATE_THRESHOLD_BYTES, zlibDeflateOptions: { level: DEFLATE_LEVEL } } : false,
  });

  const accept = (ws: WebSocket, address: string): void => {
    const conn: Connection = { ws, address, sink: makeSink(ws, config.maxBufferedBytes), seat: null, bucket: fullBucket(rule, clock.now()), strikes: 0, alive: true };
    connections.add(conn);
    const helloTimer = setTimeout(() => {
      if (conn.seat === null) conn.sink.close('bad-message');
    }, config.helloTimeoutMs);
    ws.on('pong', () => (conn.alive = true));
    ws.on('message', (data, isBinary) => receive(conn, data, isBinary, rule, deps, admission));
    ws.on('error', (error) => log.warn('socket.error', { reason: error.message.slice(0, 80) }));
    ws.on('close', () => {
      clearTimeout(helloTimer);
      connections.delete(conn);
      admission.release(address);
      if (conn.seat !== null) registry.disconnect(conn.seat.code, conn.seat.member, conn.sink);
    });
  };

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (path !== WS_PATH) return refuseUpgrade(socket, '404 Not Found');
    if (!originAllowed(request, config.allowedOrigins)) return refuseUpgrade(socket, '403 Forbidden');
    const address = clientAddress(request, config.clientIpHeader);
    if (!admission.admit(address)) return refuseUpgrade(socket, '503 Service Unavailable');
    wss.handleUpgrade(request, socket, head, (ws) => accept(ws, address));
  });

  const heartbeat = startHeartbeat(connections, config.heartbeatMs);

  return {
    connections: admission.connections,
    close(code) {
      clearInterval(heartbeat);
      registry.shutdown(code);
      connections.forEach((conn) => conn.sink.close(code));
      wss.close();
    },
  };
}
