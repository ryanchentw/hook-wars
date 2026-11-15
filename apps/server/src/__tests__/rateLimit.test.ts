import { describe, expect, it } from 'vitest';
import { fullBucket, openChatGate, passChat, takeToken, type Bucket } from '../rateLimit';

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

describe('the chat allowance', () => {
  const rule = { capacity: 3, perSecond: 2 / 3 };

  it('lets a burst of three through, then two every three seconds', () => {
    let gate = openChatGate(rule, 0);
    const at = (now: number) => {
      const passed = passChat(gate, rule, now);
      gate = passed.gate;
      return passed.verdict;
    };
    expect([at(0), at(10), at(20)]).toEqual(['send', 'send', 'send']);
    expect(at(30)).toBe('tell');
    expect(at(40)).toBe('drop');
    expect(at(1600)).toBe('send');
    expect(at(1700)).toBe('tell');
    expect(at(3200)).toBe('send');
  });

  it('tells the sender once per run of dropped lines', () => {
    let gate = openChatGate({ capacity: 1, perSecond: 1 }, 0);
    const verdicts = [0, 100, 200, 300, 1300, 1400, 1500].map((now) => {
      const passed = passChat(gate, { capacity: 1, perSecond: 1 }, now);
      gate = passed.gate;
      return passed.verdict;
    });
    expect(verdicts).toEqual(['send', 'tell', 'drop', 'drop', 'send', 'tell', 'drop']);
  });
});
