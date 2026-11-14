import { createRoom } from '@hookbrawl/room';
import { createMatch, viewFor, type PlayerId } from '@hookbrawl/sim';
import { describe, expect, it } from 'vitest';
import {
  encodeClientMessage,
  encodeServerMessage,
  MAX_CLIENT_MESSAGE_BYTES,
  parseClientMessage,
  parseRoomAction,
  parseServerMessage,
  PROTOCOL_VERSION,
  stampLobbyAction,
  toSnapView,
  type ServerMessage,
} from '../index';
import type { MemberId } from '@hookbrawl/room';

const TOKEN = 'a'.repeat(32);
const frame = (value: unknown): string => JSON.stringify(value);
const hello = (extra: object = {}) => ({ t: 'hello', v: PROTOCOL_VERSION, name: 'Ada', room: { kind: 'create' }, ...extra });
const input = (extra: object = {}) => ({ t: 'input', seq: 1, steer: { x: 1, y: 0 }, acts: [], ...extra });

describe('client messages', () => {
  it('reads every kind of message a client sends', () => {
    const messages = [
      hello(),
      hello({ room: { kind: 'join', code: 'ABCDEF' } }),
      hello({ room: { kind: 'rejoin', code: 'ABCDEF', token: TOKEN } }),
      { t: 'lobby', action: { kind: 'moveTo', slot: { team: 'east', index: 2 } } },
      input({ acts: [{ kind: 'hook', target: { x: 10, y: -4 } }, { kind: 'buy', purchase: { kind: 'item', id: 'barb' } }] }),
      { t: 'ping', id: 7 },
      { t: 'leave' },
    ];
    messages.forEach((message) => expect(parseClientMessage(frame(message))).toMatchObject({ ok: true, value: message }));
  });

  it('trims the name and capitalises the room code', () => {
    const parsed = parseClientMessage(frame(hello({ name: '  Ada  ', room: { kind: 'join', code: ' abcdef ' } })));
    expect(parsed).toMatchObject({ ok: true, value: { name: 'Ada', room: { code: 'ABCDEF' } } });
  });

  it('writes what it reads', () => {
    const sent = encodeClientMessage({ t: 'ping', id: 3 });
    expect(parseClientMessage(sent)).toEqual({ ok: true, value: { t: 'ping', id: 3 } });
  });

  it.each([
    ['a binary frame', new Uint8Array([1, 2, 3])],
    ['nothing', undefined],
    ['text that is not JSON', '{"t":'],
    ['JSON that is not an object', '[1,2,3]'],
    ['null', 'null'],
    ['an unknown kind', frame({ t: 'admin' })],
    ['a frame past the size limit', frame(hello({ name: 'x'.repeat(MAX_CLIENT_MESSAGE_BYTES) }))],
    ['an empty name', frame(hello({ name: '   ' }))],
    ['a name of 17 characters', frame(hello({ name: 'x'.repeat(17) }))],
    ['a name with a control character', frame(hello({ name: 'a\u0007b' }))],
    ['a name that is not text', frame(hello({ name: { toString: 'x' } }))],
    ['a code of the wrong length', frame(hello({ room: { kind: 'join', code: 'ABC' } }))],
    ['a code with letters no code uses', frame(hello({ room: { kind: 'join', code: 'ABCDE0' } }))],
    ['a rejoin token of the wrong shape', frame(hello({ room: { kind: 'rejoin', code: 'ABCDEF', token: '../../etc' } }))],
    ['a version that is not a whole number', frame(hello({ v: 1.5 }))],
    ['a claimed identity on hello', frame(hello({ memberId: 'm1' }))],
    ['a claimed identity on a lobby action', frame({ t: 'lobby', action: { kind: 'startMatch', by: 'm1' } })],
    ['a lobby action only the server may make', frame({ t: 'lobby', action: { kind: 'passHost', to: 'm2' } })],
    ['an ending of the match', frame({ t: 'lobby', action: { kind: 'endMatch' } })],
    ['a seat that does not exist', frame({ t: 'lobby', action: { kind: 'moveTo', slot: { team: 'east', index: 3 } } })],
    ['a kill target off the menu', frame({ t: 'lobby', action: { kind: 'setKillTarget', killTarget: 1 } })],
    ['a steer longer than a unit', frame(input({ steer: { x: 50, y: 0 } }))],
    ['a steer that is not a number', frame(input({ steer: { x: '1', y: 0 } }))],
    ['an infinite aim point', `{"t":"input","seq":1,"steer":{"x":0,"y":0},"acts":[{"kind":"hook","target":{"x":1e999,"y":0}}]}`],
    ['an aim point far outside any arena', frame(input({ acts: [{ kind: 'hook', target: { x: 1e7, y: 0 } }] }))],
    ['a null aim point', frame(input({ acts: [{ kind: 'hook', target: null }] }))],
    ['more presses than a tick can hold', frame(input({ acts: Array.from({ length: 5 }, () => ({ kind: 'buy', purchase: { kind: 'item', id: 'barb' } })) }))],
    ['a purchase of something not sold', frame(input({ acts: [{ kind: 'buy', purchase: { kind: 'item', id: 'nuke' } }] }))],
    ['an input for another fighter', frame(input({ playerId: 'east-0' }))],
    ['a sequence number of zero', frame(input({ seq: 0 }))],
    ['a fractional sequence number', frame(input({ seq: 1.5 }))],
    ['a sequence number past the limit', frame(input({ seq: 2 ** 40 }))],
    ['a prototype key', '{"t":"ping","id":1,"__proto__":{"admin":true}}'],
  ])('refuses %s without throwing', (_what, hostile) => {
    const parsed = parseClientMessage(hostile);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? '' : parsed.error).not.toBe('');
  });
});

describe('lobby actions', () => {
  it('parses an action and takes its `by` from the server alone', () => {
    const parsed = parseRoomAction({ kind: 'setFog', fog: true });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(stampLobbyAction(parsed.value, 'm3' as MemberId)).toEqual({ kind: 'setFog', fog: true, by: 'm3' });
  });

  it.each([null, 'startMatch', { kind: 'join', name: 'Eve' }, { kind: 'setFog', fog: 'yes' }, { kind: 'setFog', fog: true, by: 'm1' }])('refuses %j', (hostile) => {
    expect(parseRoomAction(hostile).ok).toBe(false);
  });
});

describe('server messages', () => {
  const state = createMatch({
    killTarget: 5,
    fog: true,
    players: [
      { id: 'west-0' as PlayerId, name: 'Ada', team: 'west', isBot: false },
      { id: 'east-0' as PlayerId, name: 'Bo', team: 'east', isBot: true },
    ],
  });
  const view = toSnapView(viewFor(state, 'west'));

  it('carries a real team view through the wire unchanged', () => {
    const messages: ServerMessage[] = [
      { t: 'snap', ack: 4, view },
      { t: 'matchStart', match: { matchId: 1, you: 'west-0' as PlayerId, scene: 'daan', startsInMs: 3000, resumed: false, arena: state.arena, view } },
      { t: 'room', lobby: { room: createRoom(), away: [] } },
      { t: 'welcome', v: PROTOCOL_VERSION, code: 'ABCDEF', you: 'm1' as MemberId, token: TOKEN, lobby: { room: createRoom(), away: [] }, match: null },
      { t: 'pong', id: 1 },
      { t: 'error', code: 'room-full' },
    ];
    messages.forEach((message) => expect(parseServerMessage(encodeServerMessage(message))).toEqual({ ok: true, value: message }));
  });

  it('refuses a snapshot whose numbers are not numbers, and an error it does not know', () => {
    expect(parseServerMessage(frame({ t: 'snap', ack: 0, view: { ...view, tick: 'now' } })).ok).toBe(false);
    expect(parseServerMessage(frame({ t: 'error', code: 'because' })).ok).toBe(false);
    expect(parseServerMessage('nonsense').ok).toBe(false);
  });
});
