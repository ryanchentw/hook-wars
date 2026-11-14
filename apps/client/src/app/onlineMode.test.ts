import type { ClientMessageInput, MatchStart, RoomRequest, ServerMessage } from '@hookbrawl/protocol';
import { toSnapView } from '@hookbrawl/protocol';
import { createRoom, reduce, type MemberId, type RoomState } from '@hookbrawl/room';
import { createMatch, viewFor, type PlayerId } from '@hookbrawl/sim';
import { describe, expect, it } from 'vitest';
import type { Connection, ConnStatus } from '../net/connection';
import { createApp, type AppDeps } from './controller';
import { fakeRouter } from './fakeRouter';
import type { MatchHandle, MatchSource } from './matchHost';
import type { PageOptions } from './matchSetup';
import { createStore } from './store';

const PAGE: PageOptions = { seed: 1, intro: false, overrides: { idleOpponent: false, startingGold: null }, direct: null };
const ME = 'm1' as MemberId;
const CODE = 'ABCDEF';

const lobbyOf = (...names: string[]): RoomState => names.reduce((room, name, i) => reduce(room, { kind: 'join', by: `m${i + 1}` as MemberId, name }), createRoom());

function matchStart(matchId: number, resumed = false): MatchStart {
  const state = createMatch({
    killTarget: 5,
    players: [
      { id: 'west-0' as PlayerId, name: 'Ada', team: 'west', isBot: false },
      { id: 'east-0' as PlayerId, name: 'Bo', team: 'east', isBot: false },
    ],
  });
  return { matchId, you: 'west-0' as PlayerId, scene: 'daan', startsInMs: 0, resumed, arena: state.arena, view: toSnapView(viewFor(state, 'west')) };
}

/** The app with a server it can only reach through a connection the test holds the other end of. */
function harness(options: { roomInAddress?: string; token?: string; storedName?: string } = {}) {
  const nav = fakeRouter('menu');
  const sent: ClientMessageInput[] = [];
  const asked: { name: string; room: RoomRequest }[] = [];
  const matches: { source: MatchSource; resumed: number; destroyed: boolean; phase: 'playing' | 'ended'; leaving: boolean }[] = [];
  let address: string | null = options.roomInAddress ?? null;
  const tokens = new Map<string, string>(options.token === undefined ? [] : [[CODE, options.token]]);
  let listener: (message: ServerMessage) => void = () => undefined;
  const status = createStore<ConnStatus>({ kind: 'connecting' });
  let left = false;

  const conn: Connection = {
    status,
    listen(onMessage) {
      listener = onMessage;
      return () => undefined;
    },
    send: (message) => void sent.push(message),
    isOnline: () => status.getSnapshot().kind === 'online',
    leave: () => void (left = true),
    dispose: () => undefined,
    dev: { received: () => [], drop: () => undefined, block: () => undefined },
  };
  const deps: AppDeps = {
    router: nav.router,
    page: PAGE,
    names: { load: () => options.storedName ?? '', save: () => undefined },
    makeBackdrop: async (scene) => ({ sceneId: scene, dispose: () => undefined }),
    startMatch: async (source) => {
      const record = { source, resumed: 0, destroyed: false, phase: 'playing' as 'playing' | 'ended', leaving: false };
      matches.push(record);
      return {
        matchId: source.kind === 'online' ? source.start.matchId : null,
        session: { getView: () => ({ phase: { kind: record.phase } }) },
        resume: () => (record.resumed += 1),
        destroy: () => (record.destroyed = true),
        setLeaving: (asking: boolean) => (record.leaving = asking),
      } as unknown as MatchHandle;
    },
    focusGame: () => undefined,
    busy: () => undefined,
    online: {
      connect(name, room) {
        asked.push({ name, room });
        return conn;
      },
      tokens: { load: (code) => tokens.get(code) ?? null, save: (code, token) => void tokens.set(code, token), forget: (code) => void tokens.delete(code) },
      address: { code: () => address, set: (code) => void (address = code), linkFor: (code) => `https://game.example/?room=${code}` },
    },
  };
  const app = createApp(deps);
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
  const server = {
    say: (message: ServerMessage) => listener(message),
    welcome(room: RoomState, match: MatchStart | null = null) {
      status.update(() => ({ kind: 'online', pingMs: null }));
      listener({ t: 'welcome', v: 1, code: CODE, you: ME, token: 't'.repeat(32), lobby: { room, away: [] }, match });
    },
    lose: (reason: Extract<ConnStatus, { kind: 'lost' }>['reason']) => status.update(() => ({ kind: 'lost', reason })),
  };
  return { app, nav, sent, asked, matches, server, settle, tokens, address: () => address, left: () => left };
}

describe('getting into a room', () => {
  it('asks the server for a new room, and shows the lobby the server sends', () => {
    const { app, asked, server, tokens, address } = harness();
    expect(app.createRoom('')).toBe('Enter a name.');
    expect(app.createRoom('Ada')).toBeNull();
    expect(app.getSnapshot()).toMatchObject({ connecting: true, online: null, route: { screen: 'menu' } });
    expect(asked).toEqual([{ name: 'Ada', room: { kind: 'create' } }]);
    server.welcome(lobbyOf('Ada'));
    const view = app.getSnapshot();
    expect(view).toMatchObject({ connecting: false, member: ME, route: { screen: 'lobby' }, online: { code: CODE, link: 'https://game.example/?room=ABCDEF' } });
    expect(view.room.host).toBe(ME);
    expect(address()).toBe(CODE);
    expect(tokens.get(CODE)).toHaveLength(32);
  });

  it('tidies a typed code, and refuses one that is not a code without asking the server', () => {
    const { app, asked } = harness();
    app.joinRoom('Bo', 'nope');
    expect(app.getSnapshot().notice).toMatch(/not a room code/);
    expect(asked).toEqual([]);
    app.joinRoom('Bo', ' abcdef ');
    expect(asked).toEqual([{ name: 'Bo', room: { kind: 'join', code: CODE } }]);
  });

  it('offers the room a link names, and takes a seat still held in it straight back', () => {
    const fresh = harness({ roomInAddress: CODE });
    expect(fresh.app.getSnapshot().invite).toEqual({ code: CODE, why: 'link' });
    expect(fresh.asked).toEqual([]);
    const returning = harness({ roomInAddress: CODE, token: 'k'.repeat(32), storedName: 'Ada' });
    expect(returning.asked).toEqual([{ name: 'Ada', room: { kind: 'rejoin', code: CODE, token: 'k'.repeat(32) } }]);
  });

  it('stays on the menu with the reason when the server says no, ready to try again', () => {
    const { app, server, asked } = harness({ roomInAddress: CODE });
    app.joinRoom('Ada', CODE);
    server.lose('name-taken');
    expect(app.getSnapshot()).toMatchObject({ route: { screen: 'menu' }, connecting: false, online: null, invite: { code: CODE, why: 'link' } });
    expect(app.getSnapshot().notice).toMatch(/already has that name/);
    app.joinRoom('Bo', CODE);
    expect(asked).toHaveLength(2);
  });
});

describe('in a room', () => {
  it('sends lobby actions to the server and changes nothing until the server says', () => {
    const { app, sent, server } = harness();
    app.createRoom('Ada');
    server.welcome(lobbyOf('Ada'));
    app.act({ kind: 'setFog', fog: false });
    app.start();
    expect(sent).toEqual([{ t: 'lobby', action: { kind: 'setFog', fog: false } }, { t: 'lobby', action: { kind: 'startMatch' } }]);
    expect(app.getSnapshot().room.settings.fog).toBe(true);
    server.say({ t: 'room', lobby: { room: { ...lobbyOf('Ada', 'Bo'), settings: { scene: 'rotate', killTarget: 10, fog: false } }, away: ['m2' as MemberId] } });
    expect(app.getSnapshot()).toMatchObject({ room: { settings: { fog: false } }, online: { away: ['m2'] } });
  });

  it('gives the seat up when the player goes back to the menu', () => {
    const { app, server, left, address, tokens } = harness();
    app.createRoom('Ada');
    server.welcome(lobbyOf('Ada'));
    app.leaveLobby();
    expect(left()).toBe(true);
    expect(app.getSnapshot()).toMatchObject({ route: { screen: 'menu' }, online: null, member: 'local', invite: null });
    expect(address()).toBeNull();
    expect(tokens.size).toBe(0);
  });

  it('returns to the menu when the line is lost for good, offering the room again', () => {
    const { app, server } = harness();
    app.createRoom('Ada');
    server.welcome(lobbyOf('Ada'));
    server.lose('timed-out');
    expect(app.getSnapshot()).toMatchObject({ route: { screen: 'menu' }, online: null, invite: { code: CODE, why: 'return' } });
    expect(app.getSnapshot().notice).toMatch(/lost for over a minute/);
  });
});

describe('an online match', () => {
  async function playing() {
    const h = harness();
    h.app.createRoom('Ada');
    h.server.welcome(lobbyOf('Ada', 'Bo'));
    h.server.say({ t: 'matchStart', match: matchStart(1) });
    await h.settle();
    return h;
  }

  it('starts when the server says so, for whoever is in the room', async () => {
    const { app, matches } = await playing();
    expect(app.getSnapshot().route.screen).toBe('match');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.source).toMatchObject({ kind: 'online', start: { matchId: 1 } });
  });

  it('carries on with the match it is showing when the connection comes back, and replaces it for a rematch', async () => {
    const { server, matches, settle } = await playing();
    server.welcome(lobbyOf('Ada', 'Bo'), matchStart(1, true));
    await settle();
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ resumed: 1, destroyed: false });
    server.say({ t: 'matchStart', match: matchStart(2) });
    await settle();
    expect(matches.map((m) => m.destroyed)).toEqual([true, false]);
  });

  it('asks before the browser Back leaves a match still being played', async () => {
    const { app, nav, matches, left } = await playing();
    nav.back();
    expect(app.getSnapshot().route.screen).toBe('match');
    expect(matches[0]).toMatchObject({ leaving: true, destroyed: false });
    expect(left()).toBe(false);
  });

  it('leaves the room when the player leaves a match still being played, and only the match once it is over', async () => {
    const live = await playing();
    live.app.leaveMatch();
    expect(live.left()).toBe(true);
    expect(live.app.getSnapshot()).toMatchObject({ route: { screen: 'menu' }, match: null, online: null });

    const over = await playing();
    over.matches[0]!.phase = 'ended';
    over.app.leaveMatch();
    expect(over.left()).toBe(false);
    expect(over.app.getSnapshot()).toMatchObject({ route: { screen: 'lobby' }, match: null, online: { code: CODE } });
    expect(over.matches[0]?.destroyed).toBe(true);
  });

  it('goes to the lobby when the connection comes back to find the match over', async () => {
    const { app, server, matches } = await playing();
    server.welcome(lobbyOf('Ada', 'Bo'), null);
    expect(app.getSnapshot()).toMatchObject({ route: { screen: 'lobby' }, match: null });
    expect(matches[0]?.destroyed).toBe(true);
  });
});
