import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { encodeClientMessage, PROTOCOL_VERSION, type ClientMessageInput } from '@hookwars/protocol';
import { WebSocket } from 'ws';

/**
 * The built server in a process of its own, with six real WebSocket clients playing one 3v3. Prints what each client
 * receives per second on the wire, compressed and not, and the CPU time the server process spent, read from `ps`.
 * The clients press keys on a schedule rather than play well: they walk about and throw hooks across the water.
 *
 * Run after `pnpm build`: pnpm --filter @hookwars/server exec tsx bench/wire.ts
 */
const PORT = Number(process.env.BENCH_PORT ?? 8795);
const SECONDS = Number(process.env.BENCH_SECONDS ?? 30);
const TICK_MS = 1000 / 30;
const NAMES = ['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Flo'];
const HOOK_EVERY_TICKS = 45;
const TURN_EVERY_TICKS = 20;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const send = (ws: WebSocket, message: ClientMessageInput): void => ws.send(encodeClientMessage(message));

type Client = { readonly ws: WebSocket; snaps: number; payloadBytes: number; hooksSeen: number; closed: boolean; code: string | null; side: number };

async function connect(compress: boolean, name: string, code: string | null): Promise<Client> {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { perMessageDeflate: compress });
  const client: Client = { ws, snaps: 0, payloadBytes: 0, hooksSeen: 0, closed: false, code: null, side: 1 };
  ws.on('close', () => (client.closed = true));
  await new Promise<void>((resolve, reject) => {
    ws.once('error', reject);
    ws.on('message', (data) => {
      const text = data.toString();
      if (text.startsWith('{"t":"snap"')) {
        client.snaps += 1;
        client.payloadBytes += Buffer.byteLength(text);
        client.hooksSeen += text.split('"kind":"hookCast"').length - 1;
      } else if (text.startsWith('{"t":"welcome"')) {
        client.code = (JSON.parse(text) as { code: string }).code;
        resolve();
      } else if (text.startsWith('{"t":"matchStart"')) {
        client.side = (JSON.parse(text) as { match: { view: { viewer: string } } }).match.view.viewer === 'west' ? 1 : -1;
      }
    });
    ws.once('open', () => send(ws, { t: 'hello', v: PROTOCOL_VERSION, name, room: code === null ? { kind: 'create' } : { kind: 'join', code } }));
  });
  return client;
}

/** Walks in a slow circle and throws a hook across the water every second and a half. */
function press(client: Client, index: number, tick: number): void {
  const angle = (Math.floor(tick / TURN_EVERY_TICKS) + index) * 1.3;
  const acts = tick % HOOK_EVERY_TICKS === index * 7 ? [{ kind: 'hook' as const, target: { x: 1200 + client.side * 900, y: 200 + ((tick * 37 + index * 211) % 950) } }] : [];
  send(client.ws, { t: 'input', seq: tick, steer: { x: Math.cos(angle), y: Math.sin(angle) }, acts });
}

const cpuSeconds = (pid: number): number => {
  const [minutes = '0', seconds = '0'] = execFileSync('ps', ['-o', 'cputime=', '-p', String(pid)]).toString().trim().split(':').slice(-2);
  return Number(minutes) * 60 + Number(seconds);
};

async function run(server: ChildProcess, fog: boolean, compress: boolean): Promise<void> {
  const host = await connect(compress, NAMES[0]!, null);
  const clients = [host];
  for (const name of NAMES.slice(1)) clients.push(await connect(compress, name, host.code));
  if (fog) send(host.ws, { t: 'lobby', action: { kind: 'setFog', fog: true } });
  send(host.ws, { t: 'lobby', action: { kind: 'setKillTarget', killTarget: 20 } });
  send(host.ws, { t: 'lobby', action: { kind: 'startMatch' } });
  await wait(1000);

  const wireBefore = clients.map((c) => (c.ws as unknown as { _socket: { bytesRead: number } })._socket.bytesRead);
  clients.forEach((c) => ((c.snaps = 0), (c.payloadBytes = 0), (c.hooksSeen = 0)));
  const cpuBefore = cpuSeconds(server.pid!);
  const began = performance.now();
  for (let tick = 1; performance.now() - began < SECONDS * 1000; tick += 1) {
    clients.forEach((client, index) => press(client, index, tick));
    await wait(Math.max(0, began + tick * TICK_MS - performance.now()));
  }
  const elapsed = (performance.now() - began) / 1000;
  const cpu = cpuSeconds(server.pid!) - cpuBefore;
  const wire = clients.map((c, i) => (c.ws as unknown as { _socket: { bytesRead: number } })._socket.bytesRead - wireBefore[i]!);
  const avg = (values: readonly number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;
  process.stdout.write(
    `${JSON.stringify({
      fog,
      compress,
      seconds: +elapsed.toFixed(1),
      clientsDropped: clients.filter((c) => c.closed).length,
      hooksSeenPerClient: Math.round(avg(clients.map((c) => c.hooksSeen))),
      snapshotsPerSecond: +(avg(clients.map((c) => c.snaps)) / elapsed).toFixed(1),
      jsonBytesPerSnapshot: Math.round(avg(clients.map((c) => c.payloadBytes / Math.max(1, c.snaps)))),
      wireBytesPerSecondPerClient: Math.round(avg(wire) / elapsed),
      serverCpuPercentOfOneCore: +((cpu / elapsed) * 100).toFixed(1),
      serverCpuMsPerTick: +((cpu * 1000) / (elapsed * 30)).toFixed(3),
    })}\n`,
  );
  // Leaving, not just closing: a dropped member's seat is held and the match played on by bots, which the next run would be billed for.
  clients.forEach((c) => send(c.ws, { t: 'leave' }));
  await wait(500);
  const health = (await (await fetch(`http://127.0.0.1:${PORT}/healthz`)).json()) as { rooms: number };
  if (health.rooms !== 0) throw new Error(`the room was not closed: ${health.rooms} left`);
}

const server = spawn('node', ['dist/server.js'], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', HOOKWARS_LOG_LEVEL: 'warn', HOOKWARS_MATCH_COUNTDOWN_MS: '100', HOOKWARS_EMPTY_ROOM_GRACE_MS: '100', HOOKWARS_JOINS_PER_MINUTE: '600' },
  stdio: 'inherit',
});
try {
  await wait(800);
  for (const fog of [false, true]) for (const compress of [true, false]) await run(server, fog, compress);
} finally {
  server.kill('SIGTERM');
}
