import { describe, expect, it } from 'vitest';
import { canStart, createRoom, reduce, seatOf, SLOTS_PER_TEAM } from '../index';
import type { MemberId, RoomAction, RoomState, SlotRef } from '../index';

const HOST = 'host' as MemberId;
const GUEST = 'guest' as MemberId;
const STRANGER = 'stranger' as MemberId;
const west = (index: number): SlotRef => ({ team: 'west', index });
const east = (index: number): SlotRef => ({ team: 'east', index });

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/** Applies actions in order to a frozen state, so any mutation throws. */
function play(state: RoomState, ...actions: readonly RoomAction[]): RoomState {
  return actions.reduce((s, a) => reduce(deepFreeze(s), a), state);
}

const hosted = (): RoomState => play(createRoom(), { kind: 'join', by: HOST, name: 'Ryan' });
const withBot = (): RoomState => play(hosted(), { kind: 'addBot', by: HOST, slot: east(0) });

describe('createRoom', () => {
  it('opens an empty lobby with three slots a side, rotating scenes and first to 10', () => {
    const room = createRoom();
    expect(room.host).toBeNull();
    expect(room.phase).toEqual({ kind: 'lobby' });
    expect(room.slots.west).toHaveLength(SLOTS_PER_TEAM);
    expect(room.slots.east.every((s) => s.kind === 'empty')).toBe(true);
    expect(room.settings).toEqual({ scene: 'rotate', killTarget: 10 });
    expect(room.matchesStarted).toBe(0);
  });
});

describe('join and leave', () => {
  it('seats the first member on the west and makes them host', () => {
    const room = hosted();
    expect(room.host).toBe(HOST);
    expect(room.slots.west[0]).toEqual({ kind: 'human', memberId: HOST, name: 'Ryan' });
  });

  it('seats the next member on the side with fewer fighters', () => {
    const room = play(hosted(), { kind: 'join', by: GUEST, name: 'Ada' });
    expect(seatOf(room, GUEST)).toEqual(east(0));
    expect(room.host).toBe(HOST);
  });

  it('trims the name it keeps', () => {
    expect(play(createRoom(), { kind: 'join', by: HOST, name: '  Ryan  ' }).slots.west[0]).toMatchObject({ name: 'Ryan' });
  });

  it('ignores a bad name, a second join and a full room', () => {
    const empty = createRoom();
    expect(reduce(empty, { kind: 'join', by: HOST, name: '   ' })).toBe(empty);
    expect(reduce(empty, { kind: 'join', by: HOST, name: 'x'.repeat(17) })).toBe(empty);
    expect(reduce(empty, { kind: 'join', by: HOST, name: 'a\u0007b' })).toBe(empty);
    const room = hosted();
    expect(reduce(room, { kind: 'join', by: HOST, name: 'Again' })).toBe(room);
    const full = play(room, { kind: 'fillWithBots', by: HOST });
    expect(reduce(full, { kind: 'join', by: GUEST, name: 'Ada' })).toBe(full);
  });

  it('frees the seat on leave and hands the host to the next human', () => {
    const room = play(hosted(), { kind: 'join', by: GUEST, name: 'Ada' }, { kind: 'leave', by: HOST });
    expect(room.slots.west[0]).toEqual({ kind: 'empty' });
    expect(room.host).toBe(GUEST);
    const empty = play(room, { kind: 'leave', by: GUEST });
    expect(empty.host).toBeNull();
    expect(reduce(empty, { kind: 'leave', by: STRANGER })).toBe(empty);
  });
});

describe('rename', () => {
  it('changes a member name and ignores a bad one or a stranger', () => {
    const room = hosted();
    expect(play(room, { kind: 'rename', by: HOST, name: 'Rye' }).slots.west[0]).toMatchObject({ name: 'Rye' });
    expect(reduce(room, { kind: 'rename', by: HOST, name: '' })).toBe(room);
    expect(reduce(room, { kind: 'rename', by: STRANGER, name: 'Eve' })).toBe(room);
  });
});

describe('moveTo', () => {
  it('moves a member to an empty slot on either side', () => {
    const room = play(hosted(), { kind: 'moveTo', by: HOST, slot: east(2) });
    expect(seatOf(room, HOST)).toEqual(east(2));
    expect(room.slots.west[0]).toEqual({ kind: 'empty' });
  });

  it('ignores an occupied slot, a slot that does not exist, a stranger and a running match', () => {
    const room = withBot();
    expect(reduce(room, { kind: 'moveTo', by: HOST, slot: east(0) })).toBe(room);
    expect(reduce(room, { kind: 'moveTo', by: HOST, slot: west(0) })).toBe(room);
    expect(reduce(room, { kind: 'moveTo', by: HOST, slot: east(3) })).toBe(room);
    expect(reduce(room, { kind: 'moveTo', by: HOST, slot: { team: 'north' as 'west', index: 0 } })).toBe(room);
    expect(reduce(room, { kind: 'moveTo', by: HOST, slot: west(0.5) })).toBe(room);
    expect(reduce(room, { kind: 'moveTo', by: STRANGER, slot: east(1) })).toBe(room);
    const running = play(room, { kind: 'startMatch', by: HOST });
    expect(reduce(running, { kind: 'moveTo', by: HOST, slot: east(1) })).toBe(running);
  });
});

describe('bots', () => {
  it('lets the host add a bot to any empty slot and remove it again', () => {
    const room = withBot();
    expect(room.slots.east[0]).toEqual({ kind: 'bot' });
    expect(play(room, { kind: 'removeBot', by: HOST, slot: east(0) }).slots.east[0]).toEqual({ kind: 'empty' });
  });

  it('fills every empty slot at once', () => {
    const room = play(withBot(), { kind: 'fillWithBots', by: HOST });
    expect([...room.slots.west, ...room.slots.east].filter((s) => s.kind === 'bot')).toHaveLength(5);
    expect(room.slots.west[0]).toMatchObject({ kind: 'human' });
  });

  it('ignores a bot on an occupied slot, removing a human or an empty slot, and anyone but the host', () => {
    const room = play(withBot(), { kind: 'join', by: GUEST, name: 'Ada' });
    expect(reduce(room, { kind: 'addBot', by: HOST, slot: west(0) })).toBe(room);
    expect(reduce(room, { kind: 'addBot', by: HOST, slot: east(0) })).toBe(room);
    expect(reduce(room, { kind: 'addBot', by: HOST, slot: west(7) })).toBe(room);
    expect(reduce(room, { kind: 'removeBot', by: HOST, slot: west(0) })).toBe(room);
    expect(reduce(room, { kind: 'removeBot', by: HOST, slot: west(2) })).toBe(room);
    expect(reduce(room, { kind: 'addBot', by: GUEST, slot: west(2) })).toBe(room);
    expect(reduce(room, { kind: 'removeBot', by: GUEST, slot: east(0) })).toBe(room);
    expect(reduce(room, { kind: 'fillWithBots', by: GUEST })).toBe(room);
    const full = play(room, { kind: 'fillWithBots', by: HOST });
    expect(reduce(full, { kind: 'fillWithBots', by: HOST })).toBe(full);
  });
});

describe('settings', () => {
  it('takes a known scene or rotate and a preset kill target from the host', () => {
    const room = play(hosted(), { kind: 'setScene', by: HOST, scene: 'daan' }, { kind: 'setKillTarget', by: HOST, killTarget: 5 });
    expect(room.settings).toEqual({ scene: 'daan', killTarget: 5 });
    expect(play(room, { kind: 'setScene', by: HOST, scene: 'rotate' }).settings.scene).toBe('rotate');
  });

  it('ignores an unknown scene, an off-preset target and a guest', () => {
    const room = play(hosted(), { kind: 'join', by: GUEST, name: 'Ada' });
    expect(reduce(room, { kind: 'setScene', by: HOST, scene: 'atlantis' })).toBe(room);
    expect(reduce(room, { kind: 'setKillTarget', by: HOST, killTarget: 7 })).toBe(room);
    expect(reduce(room, { kind: 'setKillTarget', by: HOST, killTarget: Number.NaN })).toBe(room);
    expect(reduce(room, { kind: 'setScene', by: GUEST, scene: 'daan' })).toBe(room);
    expect(reduce(room, { kind: 'setKillTarget', by: GUEST, killTarget: 5 })).toBe(room);
  });
});

describe('starting and ending', () => {
  it('needs a fighter on each side to start', () => {
    expect(canStart(hosted())).toBe(false);
    expect(canStart(withBot())).toBe(true);
    const lonely = play(hosted(), { kind: 'moveTo', by: HOST, slot: east(1) }, { kind: 'addBot', by: HOST, slot: east(0) });
    expect(canStart(lonely)).toBe(false);
  });

  it('starts and ends a match for the host, counting starts', () => {
    const running = play(withBot(), { kind: 'startMatch', by: HOST });
    expect(running.phase).toEqual({ kind: 'in-match' });
    expect(running.matchesStarted).toBe(1);
    const back = play(running, { kind: 'endMatch', by: HOST });
    expect(back.phase).toEqual({ kind: 'lobby' });
    expect(back.matchesStarted).toBe(1);
  });

  it('ignores a start with an empty side, from a guest or twice, and an end outside a match', () => {
    const solo = hosted();
    expect(reduce(solo, { kind: 'startMatch', by: HOST })).toBe(solo);
    const room = play(withBot(), { kind: 'join', by: GUEST, name: 'Ada' });
    expect(reduce(room, { kind: 'startMatch', by: GUEST })).toBe(room);
    expect(reduce(room, { kind: 'endMatch', by: HOST })).toBe(room);
    const running = play(room, { kind: 'startMatch', by: HOST });
    expect(reduce(running, { kind: 'startMatch', by: HOST })).toBe(running);
    expect(reduce(running, { kind: 'endMatch', by: GUEST })).toBe(running);
    expect(reduce(running, { kind: 'addBot', by: HOST, slot: west(1) })).toBe(running);
    expect(reduce(running, { kind: 'setScene', by: HOST, scene: 'daan' })).toBe(running);
  });

  it('ignores an action it does not know', () => {
    const room = hosted();
    expect(reduce(room, { kind: 'kick', by: HOST } as unknown as RoomAction)).toBe(room);
  });
});
