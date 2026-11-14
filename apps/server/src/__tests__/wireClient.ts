import { encodeClientMessage, parseServerMessage, PROTOCOL_VERSION, type ClientMessageInput, type RoomRequest, type ServerMessage, type ServerMessageOf } from '@hookbrawl/protocol';
import { WebSocket } from 'ws';

const WAIT_MS = 5000;

export type WireClient = {
  readonly received: readonly ServerMessage[];
  send(message: ClientMessageInput): void;
  sendRaw(frame: string | Uint8Array): void;
  hello(name: string, room: RoomRequest): Promise<ServerMessageOf<'welcome'>>;
  /** The next message of this kind after the ones already taken, waiting for it if it has not come. */
  next<T extends ServerMessage['t']>(t: T, where?: (message: ServerMessageOf<T>) => boolean): Promise<ServerMessageOf<T>>;
  /** Resolves with the reason the server gave when it closes the socket. */
  closed(): Promise<string>;
  close(): void;
  /** Bytes read off the socket, as compressed on the wire. */
  bytesRead(): number;
};

/** A real WebSocket client that reads the server through the same parser the browser uses. */
export function connect(port: number, options: { origin?: string; compress?: boolean } = {}): Promise<WireClient> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { perMessageDeflate: options.compress ?? true, ...(options.origin === undefined ? {} : { origin: options.origin }) });
  const received: ServerMessage[] = [];
  const waiters = new Set<() => void>();
  let taken = 0;
  let closeReason: string | null = null;

  ws.on('message', (data) => {
    const parsed = parseServerMessage(data.toString());
    if (!parsed.ok) throw new Error(`the server sent something the protocol refuses: ${parsed.error}`);
    received.push(parsed.value);
    waiters.forEach((wake) => wake());
  });
  ws.on('close', (_code, reason) => {
    closeReason = reason.toString();
    waiters.forEach((wake) => wake());
  });

  const until = <R>(find: () => R | undefined, what: string): Promise<R> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), WAIT_MS);
      const check = (): void => {
        const found = find();
        if (found === undefined) return;
        clearTimeout(timer);
        waiters.delete(check);
        resolve(found);
      };
      waiters.add(check);
      check();
    });

  const client: WireClient = {
    received,
    send: (message) => ws.send(encodeClientMessage(message)),
    sendRaw: (frame) => ws.send(frame),
    async hello(name, room) {
      client.send({ t: 'hello', v: PROTOCOL_VERSION, name, room });
      return client.next('welcome');
    },
    next: (t, where = () => true) =>
      until(() => {
        const at = received.findIndex((m, i) => i >= taken && m.t === t && where(m as ServerMessageOf<typeof t>));
        if (at === -1) return undefined;
        taken = at + 1;
        return received[at] as ServerMessageOf<typeof t>;
      }, `a ${t} message`),
    closed: () => until(() => closeReason ?? undefined, 'the socket to close'),
    close: () => ws.close(),
    // `ws` keeps the raw socket private; its byte counter is the only place the compressed size shows.
    bytesRead: () => (ws as unknown as { _socket?: { bytesRead: number } })._socket?.bytesRead ?? 0,
  };

  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(client));
    ws.once('error', reject);
  });
}
