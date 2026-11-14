import { describe, expect, it } from 'vitest';
import { fakeState } from '../game/fakeSim';
import { viewFor } from '@hookbrawl/sim';
import { insertSnapshot, reached, sampleAt, type Snap, type SnapshotBuffer } from './snapshotBuffer';

const TICK = 1 / 30;
const snap = (tick: number): Snap => ({ view: viewFor(fakeState({ tick, time: tick * TICK }), 'west'), ack: tick });
const ticks = (buffer: SnapshotBuffer): number[] => buffer.map((s) => s.view.tick);
const fill = (...order: number[]): SnapshotBuffer => order.reduce<SnapshotBuffer>((buffer, tick) => insertSnapshot(buffer, snap(tick), 8), []);

describe('the snapshot buffer', () => {
  it('keeps snapshots in tick order however they arrive, and drops a repeat', () => {
    expect(ticks(fill(2, 3, 6, 5, 3, 8))).toEqual([2, 3, 5, 6, 8]);
  });

  it('keeps only the newest when full', () => {
    expect(ticks(fill(...Array.from({ length: 12 }, (_, i) => i * 2)))).toEqual([8, 10, 12, 14, 16, 18, 20, 22]);
  });

  it('drops a snapshot older than everything it holds once full', () => {
    const full = fill(10, 11, 12, 13, 14, 15, 16, 17);
    expect(ticks(insertSnapshot(full, snap(3), 8))).toEqual([10, 11, 12, 13, 14, 15, 16, 17]);
  });
});

describe('sampling the buffer', () => {
  it('finds the two snapshots either side of a moment and how far between them it lies', () => {
    const sample = sampleAt(fill(3, 5, 6), 4 * TICK)!;
    expect([sample.from.view.tick, sample.to.view.tick]).toEqual([3, 5]);
    expect(sample.alpha).toBeCloseTo(0.5, 6);
  });

  it('spans the gap a lost snapshot leaves', () => {
    const sample = sampleAt(fill(3, 9), 4.5 * TICK)!;
    expect([sample.from.view.tick, sample.to.view.tick]).toEqual([3, 9]);
    expect(sample.alpha).toBeCloseTo(0.25, 6);
  });

  it('holds on the newest snapshot when the moment has run past it, and on the oldest before it', () => {
    const buffer = fill(3, 5);
    expect(sampleAt(buffer, 99)).toMatchObject({ from: { ack: 5 }, to: { ack: 5 }, alpha: 1 });
    expect(sampleAt(buffer, 0)).toMatchObject({ from: { ack: 3 }, to: { ack: 3 }, alpha: 0 });
    expect(sampleAt([], 1)).toBeNull();
  });

  it('uses a snapshot that arrived late between two already held', () => {
    const late = insertSnapshot(fill(3, 6), snap(5), 8);
    expect(sampleAt(late, 5.5 * TICK)).toMatchObject({ from: { ack: 5 }, to: { ack: 6 } });
  });
});

describe('announcing snapshots', () => {
  it('announces each snapshot once, when the drawn moment reaches it', () => {
    const buffer = fill(2, 3, 5, 6);
    expect(ticks(reached(buffer, 0, 3.5 * TICK))).toEqual([2, 3]);
    expect(ticks(reached(buffer, 3, 3.9 * TICK))).toEqual([]);
    expect(ticks(reached(buffer, 3, 6 * TICK))).toEqual([5, 6]);
  });
});
