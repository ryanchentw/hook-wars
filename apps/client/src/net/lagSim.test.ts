import { describe, expect, it } from 'vitest';
import { IDLE_LINE, lagRulesFromQuery, scheduleDelivery, type LagLine } from './lagSim';
import { backoffDelay, secondsLeft } from './reconnect';

const RULES = { latencyMs: 50, loss: 0.02, retransmitMs: 200 };

describe('the simulated line', () => {
  it('delivers each message one latency later', () => {
    expect(scheduleDelivery(IDLE_LINE, 1000, 0.5, RULES).at).toBe(1050);
  });

  it('holds a lost message for a retransmit, and everything sent behind it, in order', () => {
    const lost = scheduleDelivery(IDLE_LINE, 1000, 0.01, RULES);
    const behind = scheduleDelivery(lost.line, 1010, 0.5, RULES);
    const later = scheduleDelivery(behind.line, 1300, 0.5, RULES);
    expect([lost.at, behind.at, later.at]).toEqual([1250, 1250, 1350]);
  });

  it('never delivers out of order', () => {
    let line: LagLine = IDLE_LINE;
    const times = Array.from({ length: 200 }, (_, i) => {
      const scheduled = scheduleDelivery(line, i * 10, (i * 37 % 100) / 100, RULES);
      line = scheduled.line;
      return scheduled.at;
    });
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('is asked for by the address, and is off without it', () => {
    expect(lagRulesFromQuery('?netlag=100&netloss=2', 200)).toEqual({ latencyMs: 50, loss: 0.02, retransmitMs: 200 });
    expect(lagRulesFromQuery('?room=ABCDEF', 200)).toBeNull();
    expect(lagRulesFromQuery('?netlag=fast', 200)).toBeNull();
  });
});

describe('reconnecting', () => {
  it('waits longer each try, up to a ceiling', () => {
    expect([0, 1, 2, 3, 4, 9].map((attempt) => backoffDelay(attempt, 300, 3000))).toEqual([300, 600, 1200, 2400, 3000, 3000]);
  });

  it('counts the window down in whole seconds and stops at zero', () => {
    expect(secondsLeft(1000, 1000, 60_000)).toBe(60);
    expect(secondsLeft(1000, 31_500, 60_000)).toBe(30);
    expect(secondsLeft(1000, 99_000, 60_000)).toBe(0);
  });
});
