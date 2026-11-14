import { describe, expect, it } from 'vitest';
import { advancePlayout, NO_PLAYOUT, observeSnapshot, type Playout, type PlayoutRules } from './playout';

const RULES: PlayoutRules = { delay: 0.1, gain: 2, maxSpeedUp: 0.25, maxSlowDown: 0.1, snap: 0.4, drift: 0.1 };
const FRAME = 1 / 60;
const SNAPSHOT = 0.05;
/** The client's clock reads this much more than the server's. */
const SKEW = 1000;

/**
 * Draws frames for `seconds` while snapshots are sent every 50 ms and take `transit(sentAt)` seconds to arrive, in
 * order. Returns the drawn moment at every frame alongside the newest snapshot held then.
 */
function run(seconds: number, transit: (sentAt: number) => number) {
  let playout: Playout = NO_PLAYOUT;
  let newest: number | null = null;
  let lastArrival = 0;
  const arrivals: { at: number; time: number }[] = [];
  for (let t = 0; t < seconds; t += SNAPSHOT) {
    lastArrival = Math.max(lastArrival, t + transit(t));
    arrivals.push({ at: lastArrival, time: t });
  }
  const frames: { now: number; time: number; newest: number }[] = [];
  for (let now = 0; now < seconds; now += FRAME) {
    while (arrivals[0] !== undefined && arrivals[0].at <= now) {
      const arrived = arrivals.shift()!;
      playout = observeSnapshot(playout, arrived.time, SKEW + now, RULES);
      newest = arrived.time;
    }
    playout = advancePlayout(playout, FRAME, SKEW + now, newest, RULES);
    if (playout.time !== null && newest !== null) frames.push({ now, time: playout.time, newest });
  }
  return frames;
}

const neverBackwards = (frames: { time: number }[]): boolean => frames.every((f, i) => i === 0 || f.time >= frames[i - 1]!.time);
const neverAhead = (frames: { time: number; newest: number }[]): boolean => frames.every((f) => f.time <= f.newest + 1e-9);

describe('the drawn moment', () => {
  it('waits for the first snapshot', () => {
    expect(advancePlayout(NO_PLAYOUT, FRAME, 5, null, RULES)).toEqual(NO_PLAYOUT);
  });

  it('settles one delay behind the server on a steady line, whatever the two clocks read', () => {
    const frames = run(3, () => 0.04);
    const late = frames.filter((f) => f.now > 1);
    // A snapshot is only noticed at the next frame, so the measure is good to one frame.
    late.forEach((f) => expect(Math.abs(f.now - 0.04 - f.time - RULES.delay)).toBeLessThan(FRAME));
    expect(neverBackwards(frames)).toBe(true);
    expect(neverAhead(frames)).toBe(true);
  });

  it('runs smoothly through jitter: never backwards, never past what it holds, never far from real time', () => {
    const frames = run(4, (sentAt) => 0.04 + ((Math.round(sentAt / SNAPSHOT) * 7) % 5) * 0.008);
    expect(neverBackwards(frames)).toBe(true);
    expect(neverAhead(frames)).toBe(true);
    const steps = frames.slice(60).map((f, i, all) => (i === 0 ? FRAME : f.time - all[i - 1]!.time));
    expect(Math.max(...steps)).toBeLessThanOrEqual(FRAME * 1.25 + 1e-9);
    expect(Math.min(...steps)).toBeGreaterThanOrEqual(FRAME * 0.9 - 1e-9);
  });

  it('holds still on the last snapshot through a 300 ms spike, then catches up without a jump back', () => {
    const frames = run(4, (sentAt) => (sentAt >= 1 && sentAt < 1.3 ? 1.3 - sentAt + 0.04 : 0.04));
    const during = frames.filter((f) => f.now > 1.2 && f.now < 1.3);
    expect(new Set(during.map((f) => f.time.toFixed(6))).size).toBe(1);
    expect(neverBackwards(frames)).toBe(true);
    expect(neverAhead(frames)).toBe(true);
    const after = frames.filter((f) => f.now > 3);
    after.forEach((f) => expect(f.now - 0.04 - f.time).toBeCloseTo(RULES.delay, 1));
  });

  it('is not dragged back by one snapshot that arrives late', () => {
    const steady = run(3, () => 0.04);
    const oneLate = run(3, (sentAt) => (Math.abs(sentAt - 1.5) < 1e-6 ? 0.085 : 0.04));
    const at = (frames: typeof steady, now: number): number => frames.find((f) => f.now >= now)!.time;
    expect(Math.abs(at(oneLate, 2.5) - at(steady, 2.5))).toBeLessThan(0.006);
    expect(neverBackwards(oneLate)).toBe(true);
  });

  it('jumps rather than fast-forwards after a stall of seconds', () => {
    const frames = run(6, (sentAt) => (sentAt >= 1 && sentAt < 3 ? 3 - sentAt + 0.04 : 0.04));
    const justAfter = frames.find((f) => f.now > 3.1)!;
    expect(justAfter.now - 0.04 - justAfter.time).toBeLessThan(RULES.delay + 0.1);
    expect(neverBackwards(frames)).toBe(true);
  });
});
