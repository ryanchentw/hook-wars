import { describe, expect, it } from 'vitest';
import { fullBucket, takeToken, type Bucket } from '../rateLimit';

const RULE = { capacity: 3, perSecond: 2 };

function drain(bucket: Bucket, times: number, now: number): { bucket: Bucket; allowed: boolean[] } {
  const allowed: boolean[] = [];
  let current = bucket;
  for (let i = 0; i < times; i += 1) {
    const taken = takeToken(current, RULE, now);
    current = taken.bucket;
    allowed.push(taken.allowed);
  }
  return { bucket: current, allowed };
}

describe('token bucket', () => {
  it('allows a burst up to its capacity, then refuses', () => {
    expect(drain(fullBucket(RULE, 0), 5, 0).allowed).toEqual([true, true, true, false, false]);
  });

  it('refills with time, and never past its capacity', () => {
    const empty = drain(fullBucket(RULE, 0), 3, 0).bucket;
    expect(drain(empty, 2, 500).allowed).toEqual([true, false]);
    expect(drain(empty, 5, 60_000).allowed).toEqual([true, true, true, false, false]);
  });

  it('gives nothing back when the clock steps backwards', () => {
    const empty = drain(fullBucket(RULE, 1000), 3, 1000).bucket;
    expect(takeToken(empty, RULE, 0).allowed).toBe(false);
  });
});
