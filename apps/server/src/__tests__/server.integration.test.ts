import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@hookwars/protocol';
import { loadConfig } from '../config';
import { createLogger } from '../logger';
import { startServer, type RunningServer } from '../server';
import { connect, type WireClient } from './wireClient';

const ENV = {
  PORT: '0',
  HOST: '127.0.0.1',
  HOOKWARS_LOG_LEVEL: 'silent',
  HOOKWARS_MATCH_COUNTDOWN_MS: '50',
  HOOKWARS_REJOIN_WINDOW_MS: '400',
  HOOKWARS_EMPTY_ROOM_GRACE_MS: '200',
  HOOKWARS_HELLO_TIMEOUT_MS: '300',
  HOOKWARS_MESSAGE_BURST: '40',
  HOOKWARS_MESSAGES_PER_SECOND: '40',
  HOOKWARS_JOINS_PER_MINUTE: '12',
};

let server: RunningServer;
let clients: WireClient[] = [];

const open = async (options?: Parameters<typeof connect>[1]): Promise<WireClient> => {
  const client = await connect(server.port, options);
  clients.push(client);
  return client;
};
type Health = { ok: boolean; rooms: number; matches: number; connections: number };
const health = async (): Promise<Health> => (await (await fetch(`http://127.0.0.1:${server.port}/healthz`)).json()) as Health;
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function boot(env: Record<string, string> = {}): Promise<void> {
  server = await startServer(loadConfig({ ...ENV, ...env }), createLogger('silent'));
}

/** Two clients in one room, a side each. */
async function pair() {
  const ada = await open();
  const welcome = await ada.hello('Ada', { kind: 'create' });
  const bo = await open();
  const joined = await bo.hello('Bo', { kind: 'join', code: welcome.code });
  return { ada, bo, code: welcome.code, adaToken: welcome.token, boToken: joined.token };
}

beforeEach(() => boot());
afterEach(async () => {
  clients.forEach((client) => client.close());
  clients = [];
  await server.close();
});

describe('a match over real sockets', () => {
  it('runs from an empty server to two players walking and a hook in the air', async () => {
    const { ada, bo } = await pair();
    expect((await ada.next('room')).lobby.room.slots.east[0]).toMatchObject({ kind: 'human', name: 'Bo' });
    ada.send({ t: 'lobby', action: { kind: 'startMatch' } });
    const [mine, theirs] = [await ada.next('matchStart'), await bo.next('matchStart')];
    expect([mine.match.you, theirs.match.you]).toEqual(['west-0', 'east-0']);
    expect(await health()).toMatchObject({ ok: true, rooms: 1, matches: 1, connections: 2 });

    await ada.next('snap');
    for (let seq = 1; seq <= 10; seq += 1) {
      ada.send({ t: 'input', seq, steer: { x: 0, y: 1 }, acts: seq === 1 ? [{ kind: 'hook', target: { x: 1980, y: 675 } }] : [] });
      await wait(33);
    }
    const seen = await bo.next('snap', (snap) => snap.view.hooks.length > 0);
    expect(seen.view.hooks[0]?.ownerId).toBe('west-0');
    const acked = await ada.next('snap', (snap) => snap.ack >= 10);
    const start = mine.match.view.players.find((p) => p.id === 'west-0')!.pos;
    expect(acked.view.players.find((p) => p.id === 'west-0')!.pos.y).toBeGreaterThan(start.y + 50);
    const ticks = ada.received.flatMap((m) => (m.t === 'snap' ? [m.view.tick] : []));
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
  });

  it('answers a ping', async () => {
    const { ada } = await pair();
    ada.send({ t: 'ping', id: 9 });
    expect((await ada.next('pong')).id).toBe(9);
  });
});

describe('hostile and broken clients', () => {
  it.each([
    ['text that is not JSON', '{{{'],
    ['a message of no known kind', '{"t":"admin"}'],
    ['a binary frame', new Uint8Array([0, 1, 2])],
    ['a lobby action claiming to be the host', JSON.stringify({ t: 'lobby', action: { kind: 'startMatch', by: 'm1' } })],
  ])('closes only the sender of %s, and the room goes on', async (_what, frame) => {
    const { ada, bo } = await pair();
    bo.sendRaw(frame);
    expect(await bo.closed()).toBe('bad-message');
    expect((await ada.next('room', (m) => m.lobby.away.length === 1)).lobby.room.host).toBe('m1');
    ada.send({ t: 'ping', id: 1 });
    expect((await ada.next('pong')).id).toBe(1);
  });

  it('refuses a frame past the size limit', async () => {
    const { bo } = await pair();
    bo.sendRaw(JSON.stringify({ t: 'ping', id: 1, pad: 'x'.repeat(5000) }));
    await bo.closed();
  });

  it('refuses a client that speaks another version, or never says hello', async () => {
    const old = await open();
    old.send({ t: 'hello', v: 0, name: 'Ada', room: { kind: 'create' } });
    expect(await old.closed()).toBe('bad-version');
    const silent = await open();
    expect(await silent.closed()).toBe('bad-message');
    const eager = await open();
    eager.send({ t: 'ping', id: 1 });
    expect(await eager.closed()).toBe('bad-message');
  });

  it('refuses a missing room, a taken name and a wrong token with a reason', async () => {
    const { code } = await pair();
    const cases = [
      [{ kind: 'join', code: 'ZZZZZZ' }, 'room-not-found'],
      [{ kind: 'join', code }, 'name-taken'],
      [{ kind: 'rejoin', code, token: 'x'.repeat(32) }, 'rejoin-refused'],
    ] as const;
    for (const [room, reason] of cases) {
      const client = await open();
      client.send({ t: 'hello', v: PROTOCOL_VERSION, name: 'ada', room });
      expect((await client.next('error')).code).toBe(reason);
      expect(await client.closed()).toBe(reason);
    }
  });

  it('drops messages sent too fast, then cuts off a client that keeps at it', async () => {
    const { ada, bo } = await pair();
    for (let id = 0; id < 200; id += 1) bo.send({ t: 'ping', id });
    expect(await bo.closed()).toBe('rate-limited');
    expect(bo.received.filter((m) => m.t === 'pong').length).toBeLessThanOrEqual(41);
    ada.send({ t: 'ping', id: 1 });
    await ada.next('pong');
  });

  it('limits how often one address may knock', async () => {
    const reasons: string[] = [];
    for (let i = 0; i < 14; i += 1) {
      const client = await open();
      client.send({ t: 'hello', v: PROTOCOL_VERSION, name: 'Eve', room: { kind: 'join', code: 'ZZZZZZ' } });
      reasons.push(await client.closed());
    }
    expect(reasons.slice(0, 12).every((r) => r === 'room-not-found')).toBe(true);
    expect(reasons.slice(12)).toEqual(['rate-limited', 'rate-limited']);
  });

  it('turns away a browser page from another site', async () => {
    await expect(open({ origin: 'https://evil.example' })).rejects.toThrow(/403/);
    const ours = await open({ origin: `http://127.0.0.1:${server.port}` });
    await ours.hello('Ada', { kind: 'create' });
  });
});

describe('dropping and coming back', () => {
  it('gives a returning client its seat and its match back, and closes the connection it replaces', async () => {
    const { ada, bo, code, boToken } = await pair();
    ada.send({ t: 'lobby', action: { kind: 'startMatch' } });
    await bo.next('snap');
    const again = await open();
    const welcome = await again.hello('Bo', { kind: 'rejoin', code, token: boToken });
    expect(welcome).toMatchObject({ you: 'm2', match: { you: 'east-0', resumed: true } });
    expect(await bo.closed()).toBe('replaced');
    await again.next('snap');
    expect((await health()).connections).toBe(2);
  });

  it('frees the seat once the window has closed, and forgets a room everyone has left', async () => {
    const { ada, bo, code, boToken } = await pair();
    bo.close();
    await ada.next('room', (m) => m.lobby.away.length === 1);
    await ada.next('room', (m) => m.lobby.room.slots.east[0]?.kind === 'empty');
    const late = await open();
    late.send({ t: 'hello', v: PROTOCOL_VERSION, name: 'Bo', room: { kind: 'rejoin', code, token: boToken } });
    expect(await late.closed()).toBe('rejoin-refused');
    ada.send({ t: 'leave' });
    await ada.closed();
    await wait(350);
    expect((await health()).rooms).toBe(0);
  });
});

describe('shutting down', () => {
  it('tells every client before it goes', async () => {
    const { ada, bo } = await pair();
    const closing = server.close();
    expect(await ada.closed()).toBe('shutdown');
    expect((await bo.next('error')).code).toBe('shutdown');
    await closing;
    await boot();
  });
});

describe('the server limits', () => {
  it('holds no more rooms than it is set to', async () => {
    await server.close();
    await boot({ HOOKWARS_MAX_ROOMS: '1' });
    await pair();
    const extra = await open();
    extra.send({ t: 'hello', v: PROTOCOL_VERSION, name: 'Cy', room: { kind: 'create' } });
    expect(await extra.closed()).toBe('server-full');
  });

  it('refuses to start on a setting that makes no sense', () => {
    expect(() => loadConfig({ PORT: 'eighty' })).toThrow(/PORT/);
    expect(() => loadConfig({ HOOKWARS_SNAPSHOT_HZ: '500' })).toThrow(/HOOKWARS_SNAPSHOT_HZ/);
    expect(loadConfig({ PORT: '' }).port).toBe(8787);
  });
});
