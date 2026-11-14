import { seatOf } from '@hookbrawl/room';
import { describe, expect, it } from 'vitest';
import { isAbandoned, wakeAt } from '../rooms/core';
import { duel, harness, RULES } from './roomHarness';

describe('joining', () => {
  it('seats the first member as host and tells them their code and token', () => {
    const h = harness();
    const ada = h.join('Ada');
    const welcome = h.last(ada, 'welcome');
    expect(welcome).toMatchObject({ code: 'ABCDEF', you: ada, match: null });
    expect(welcome.token).toHaveLength(32);
    expect(welcome.lobby.room.host).toBe(ada);
    expect(seatOf(h.room.lobby, ada)).toEqual({ team: 'west', index: 0 });
  });

  it('seats the second member across the water and shows both the same room', () => {
    const { h, west, east } = duel();
    expect(seatOf(h.room.lobby, east)).toEqual({ team: 'east', index: 0 });
    expect(h.last(west, 'room').lobby).toEqual(h.last(east, 'welcome').lobby);
    expect(h.last(east, 'welcome').token).not.toBe(h.last(west, 'welcome').token);
  });

  it('refuses a name already in the room, however it is capitalised, and a seventh member', () => {
    const h = harness();
    ['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Flo'].forEach((name) => h.join(name));
    expect(h.tryJoin('Gus')).toEqual({ ok: false, code: 'room-full' });
    expect(h.tryJoin('ADA')).toEqual({ ok: false, code: 'name-taken' });
  });
});

describe('the shared lobby', () => {
  it('lets anyone change seat and shows everyone', () => {
    const { h, west, east } = duel();
    h.act(east, { kind: 'moveTo', slot: { team: 'west', index: 2 } });
    expect(h.last(west, 'room').lobby.room.slots.west[2]).toMatchObject({ kind: 'human', memberId: east });
  });

  it('keeps bots, settings and starting for the host', () => {
    const { h, west, east } = duel();
    h.forget();
    h.act(east, { kind: 'addBot', slot: { team: 'east', index: 1 } });
    h.act(east, { kind: 'setFog', fog: true });
    h.act(east, { kind: 'startMatch' });
    expect(h.sentTo(west, 'room')).toEqual([]);
    expect(h.room.match).toBeNull();
    h.act(west, { kind: 'addBot', slot: { team: 'east', index: 1 } });
    h.act(west, { kind: 'setKillTarget', killTarget: 5 });
    expect(h.last(east, 'room').lobby.room).toMatchObject({ settings: { killTarget: 5 }, slots: { east: [{ kind: 'human' }, { kind: 'bot' }, { kind: 'empty' }] } });
  });
});

describe('the host', () => {
  it('passes to the next connected member the moment the host drops, and stays there when they return', () => {
    const { h, west, east } = duel();
    h.disconnect(west);
    expect(h.last(east, 'room').lobby).toMatchObject({ room: { host: east }, away: [west] });
    h.act(east, { kind: 'setFog', fog: true });
    expect(h.room.lobby.settings.fog).toBe(true);
    expect(h.rejoin(h.tokenOf(west)).ok).toBe(true);
    expect(h.room.lobby.host).toBe(east);
    expect(h.last(east, 'room').lobby.away).toEqual([]);
  });

  it('passes on when the host leaves for good', () => {
    const { h, west, east } = duel();
    h.leave(west);
    expect(h.room.lobby.host).toBe(east);
    expect(seatOf(h.room.lobby, west)).toBeNull();
  });

  it('skips a member who is away', () => {
    const h = harness();
    const [ada, bo, cy] = [h.join('Ada'), h.join('Bo'), h.join('Cy')];
    h.disconnect(cy);
    h.disconnect(ada);
    expect(h.room.lobby.host).toBe(bo);
  });
});

describe('dropping and returning in the lobby', () => {
  it('holds the seat for the window, then frees it', () => {
    const { h, west, east } = duel();
    h.disconnect(east);
    h.run(RULES.rejoinWindowMs - 1000, 1000);
    expect(seatOf(h.room.lobby, east)).not.toBeNull();
    h.run(1000, 1000);
    expect(seatOf(h.room.lobby, east)).toBeNull();
    expect(h.last(west, 'room').lobby.away).toEqual([]);
    expect(h.rejoin(h.tokenOf(east))).toEqual({ ok: false, code: 'rejoin-refused' });
  });

  it('refuses a token it never issued', () => {
    const { h } = duel();
    expect(h.rejoin('z'.repeat(32))).toEqual({ ok: false, code: 'rejoin-refused' });
  });
});

describe('an empty room', () => {
  it('is kept for the grace period after the last member leaves, then abandoned', () => {
    const { h, west, east } = duel();
    expect(wakeAt(h.room, RULES)).toBeNull();
    h.leave(west);
    h.leave(east);
    expect(wakeAt(h.room, RULES)).toBe(h.now + RULES.emptyRoomGraceMs);
    h.run(RULES.emptyRoomGraceMs - 1, RULES.emptyRoomGraceMs - 1);
    expect(isAbandoned(h.room, h.now, RULES)).toBe(false);
    h.run(1, 1);
    expect(isAbandoned(h.room, h.now, RULES)).toBe(true);
  });

  it('is not abandoned while a dropped member may still return', () => {
    const { h, west, east } = duel();
    h.disconnect(west);
    h.disconnect(east);
    h.run(RULES.rejoinWindowMs - 1, 1000);
    expect(isAbandoned(h.room, h.now, RULES)).toBe(false);
    h.run(RULES.emptyRoomGraceMs + 1000, 1000);
    expect(isAbandoned(h.room, h.now, RULES)).toBe(true);
  });
});
