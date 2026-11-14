import type { QueuedInput } from './types';

export type Taken = { readonly apply: readonly QueuedInput[]; readonly rest: readonly QueuedInput[] };

/**
 * What one tick applies from a fighter's queue. One input is one tick of walking, so one is taken per tick; when more
 * than `bufferMax` would be left waiting (a burst after a stall), the oldest are applied in the same tick. Their
 * presses all count, but the fighter still walks one stride: the ticks they were meant for have been walked already.
 */
export function takeInputs(queue: readonly QueuedInput[], bufferMax: number): Taken {
  if (queue.length === 0) return { apply: [], rest: [] };
  const count = Math.max(1, queue.length - Math.max(0, bufferMax));
  return { apply: queue.slice(0, count), rest: queue.slice(count) };
}

/** Adds an input unless it is one already seen, keeping at most `max` waiting. */
export function enqueueInput(queue: readonly QueuedInput[], ack: number, input: QueuedInput, max: number): readonly QueuedInput[] {
  const newest = queue.at(-1)?.seq ?? ack;
  if (input.seq <= newest) return queue;
  return [...queue, input].slice(-max);
}
