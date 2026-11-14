import { describe, expect, it } from 'vitest';
import * as sim from '@hookbrawl/sim';
import { TICK_DT } from '@hookbrawl/sim';
import type { MatchConfig } from '@hookbrawl/sim';
import { BOT, createFakeSim, HUMAN } from './fakeSim';
import { createSession } from './session';

const config: MatchConfig = {
  killTarget: 5,
  players: [
    { id: HUMAN, name: 'You', team: 'west', isBot: false },
    { id: BOT, name: 'Bot', team: 'east', isBot: true },
  ],
};

function setup(endAtTick?: number, maxTicksPerAdvance?: number) {
  const sim = createFakeSim(endAtTick);
  const session = createSession(
    sim,
    { config, localPlayerId: HUMAN, bots: [{ id: BOT, seed: 1 }] },
    maxTicksPerAdvance === undefined ? {} : { maxTicksPerAdvance },
  );
  return { sim, session };
}

describe('session fixed timestep', () => {
  it('runs one tick per TICK_DT of real time, including fractional frames', () => {
    const { session } = setup();
    for (let i = 0; i < 60; i += 1) session.advance(1 / 60);
    expect(session.getState().tick).toBe(30);
  });

  it('runs exactly three ticks for three tick-lengths of time despite float drift', () => {
    const { session } = setup();
    session.advance(TICK_DT * 3);
    expect(session.getState().tick).toBe(3);
  });

  it('carries the remainder into the interpolation alpha', () => {
    const { session } = setup();
    session.advance(TICK_DT * 1.5);
    const frame = session.frame();
    expect(frame.current.tick).toBe(1);
    expect(frame.previous.tick).toBe(0);
    expect(frame.alpha).toBeCloseTo(0.5);
  });

  it('caps catch-up after a long stall and drops the backlog', () => {
    const { session } = setup(undefined, 5);
    session.advance(10);
    expect(session.getState().tick).toBe(5);
    session.advance(TICK_DT * 0.5);
    expect(session.getState().tick).toBe(5);
  });

  it('ignores non-positive and non-finite deltas', () => {
    const { session } = setup();
    session.advance(0);
    session.advance(-1);
    session.advance(Number.NaN);
    expect(session.getState().tick).toBe(0);
  });
});

describe('session inputs', () => {
  it('delivers a queued human input on the next tick exactly once, alongside bot inputs', () => {
    const { sim, session } = setup();
    session.queueInput({ kind: 'move', playerId: HUMAN, target: { x: 10, y: 20 } });
    session.advance(TICK_DT * 3);
    const human = sim.stepped.map((batch) => batch.filter((i) => i.playerId === HUMAN));
    expect(human.map((b) => b.length)).toEqual([1, 0, 0]);
    expect(sim.stepped.every((batch) => batch.some((i) => i.playerId === BOT))).toBe(true);
  });

  it('stops stepping once the match has ended', () => {
    const { sim, session } = setup(2);
    session.advance(TICK_DT * 5);
    expect(session.getState().phase.kind).toBe('ended');
    expect(sim.stepped).toHaveLength(2);
  });
});

describe('session subscribers', () => {
  it('notifies once per tick until unsubscribed', () => {
    const { session } = setup();
    let ticks = 0;
    const unsubscribe = session.subscribe(() => {
      ticks += 1;
    });
    session.advance(TICK_DT * 2);
    expect(ticks).toBe(2);
    unsubscribe();
    session.advance(TICK_DT);
    expect(ticks).toBe(2);
  });
});

describe('session pause', () => {
  it('runs no ticks while paused, however much real time passes', () => {
    const { sim, session } = setup();
    session.setPaused(true);
    for (let i = 0; i < 120; i += 1) session.advance(1 / 60);
    session.advance(10);
    expect(session.getState().tick).toBe(0);
    expect(sim.stepped).toHaveLength(0);
  });

  it('resumes at normal speed without catching up the paused time', () => {
    const { session } = setup(undefined, 5);
    session.advance(TICK_DT * 2);
    session.setPaused(true);
    session.advance(10);
    session.setPaused(false);
    session.advance(TICK_DT);
    expect(session.getState().tick).toBe(3);
  });

  it('keeps the interpolation point it had when paused', () => {
    const { session } = setup();
    session.advance(TICK_DT * 1.5);
    session.setPaused(true);
    session.advance(1);
    expect(session.frame().alpha).toBeCloseTo(0.5);
    session.setPaused(false);
    session.advance(TICK_DT * 0.5);
    expect(session.getState().tick).toBe(2);
  });

  it('drops inputs sent while paused and delivers inputs sent after resuming', () => {
    const { sim, session } = setup();
    session.setPaused(true);
    session.queueInput({ kind: 'move', playerId: HUMAN, target: { x: 1, y: 1 } });
    session.advance(TICK_DT * 3);
    session.setPaused(false);
    session.advance(TICK_DT);
    session.queueInput({ kind: 'stop', playerId: HUMAN });
    session.advance(TICK_DT);
    const human = sim.stepped.map((batch) => batch.filter((i) => i.playerId === HUMAN).map((i) => i.kind));
    expect(human).toEqual([[], ['stop']]);
  });
});

describe('session steering', () => {
  const NORTH = { x: 0, y: -1 };
  const EAST = { x: 1, y: 0 };
  const steers = (sim: ReturnType<typeof setup>['sim']) =>
    sim.stepped.map((batch) => batch.flatMap((i) => (i.playerId === HUMAN && i.kind === 'steer' ? [i.dir] : [])));

  it('sends nothing while no direction is held', () => {
    const { sim, session } = setup();
    session.advance(TICK_DT * 2);
    expect(steers(sim)).toEqual([[], []]);
  });

  it('sends a held direction once, not every tick', () => {
    const { sim, session } = setup();
    session.setSteer(NORTH);
    session.advance(TICK_DT * 3);
    expect(steers(sim)).toEqual([[NORTH], [], []]);
  });

  it('sends a change of direction, and the release', () => {
    const { sim, session } = setup();
    session.setSteer(NORTH);
    session.advance(TICK_DT);
    session.setSteer(EAST);
    session.advance(TICK_DT);
    session.setSteer({ x: 0, y: 0 });
    session.advance(TICK_DT);
    expect(steers(sim)).toEqual([[NORTH], [EAST], [{ x: 0, y: 0 }]]);
  });

  it('sends only the last direction when it changes several times between ticks', () => {
    const { sim, session } = setup();
    session.setSteer(NORTH);
    session.setSteer(EAST);
    session.advance(TICK_DT);
    expect(steers(sim)).toEqual([[EAST]]);
  });

  it('delivers a direction set while paused on the first tick after resuming', () => {
    const { sim, session } = setup();
    session.setPaused(true);
    session.setSteer(NORTH);
    session.advance(TICK_DT * 3);
    session.setPaused(false);
    session.advance(TICK_DT);
    expect(steers(sim)).toEqual([[NORTH]]);
  });

  it('delivers a release made while paused as idle on resume', () => {
    const { sim, session } = setup();
    session.setSteer(NORTH);
    session.advance(TICK_DT);
    session.setPaused(true);
    session.setSteer({ x: 0, y: 0 });
    session.advance(TICK_DT);
    session.setPaused(false);
    session.advance(TICK_DT);
    expect(steers(sim)).toEqual([[NORTH], [{ x: 0, y: 0 }]]);
  });
});

describe('session views', () => {
  /** The real sim under fog: the local west fighter at its spawn cannot see the east one at theirs. */
  function fogged() {
    const players = [
      { id: HUMAN, name: 'You', team: 'west' as const, isBot: false },
      { id: BOT, name: 'Dummy', team: 'east' as const, isBot: false },
    ];
    return createSession(sim, { config: { killTarget: 5, fog: true, players }, localPlayerId: HUMAN, bots: [] });
  }

  it('hands out only what the local team can see, every tick and in every frame', () => {
    const session = fogged();
    const seen: string[][] = [];
    session.subscribe((view) => seen.push(view.players.map((p) => p.id)));
    session.advance(TICK_DT * 2);
    expect(seen).toEqual([[HUMAN], [HUMAN]]);
    const { previous, current } = session.frame();
    expect([previous, current].map((v) => v.players.map((p) => p.id))).toEqual([[HUMAN], [HUMAN]]);
    expect(session.getView().roster.map((c) => c.id)).toEqual([HUMAN, BOT]);
    expect(session.getState().players).toHaveLength(2);
  });

  it('shows everyone with fog off', () => {
    const { session } = setup();
    session.advance(TICK_DT);
    expect(session.getView().players.map((p) => p.id)).toEqual([HUMAN, BOT]);
    expect(session.localTeam).toBe('west');
  });

  it('refuses a local player who is not in the match', () => {
    expect(() => createSession(createFakeSim(), { config, localPlayerId: 'ghost' as typeof HUMAN, bots: [] })).toThrow(/not in this match/);
  });
});
