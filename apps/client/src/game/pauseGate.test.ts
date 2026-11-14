import { describe, expect, it } from 'vitest';
import { createPauseGate } from './pauseGate';

function gate() {
  const calls: boolean[] = [];
  return { calls, gate: createPauseGate((paused) => calls.push(paused)) };
}

describe('pause gate', () => {
  it('pauses on the first reason and resumes when the last one goes', () => {
    const { calls, gate: g } = gate();
    g.set('intro', true);
    g.set('credits', true);
    g.set('intro', false);
    expect(calls).toEqual([true]);
    g.set('credits', false);
    expect(calls).toEqual([true, false]);
  });

  it('says nothing when told what it already knows', () => {
    const { calls, gate: g } = gate();
    g.set('credits', false);
    g.set('credits', true);
    g.set('credits', true);
    expect(calls).toEqual([true]);
  });
});

describe('pause policy', () => {
  it('ignores a reason the policy says does not hold the match', () => {
    const calls: boolean[] = [];
    const g = createPauseGate((paused) => calls.push(paused), { credits: false, intro: true, menu: false });
    g.set('menu', true);
    g.set('credits', true);
    expect(calls).toEqual([]);
    g.set('intro', true);
    expect(calls).toEqual([true]);
  });
});
