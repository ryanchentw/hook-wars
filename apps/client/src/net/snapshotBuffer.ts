import type { TeamView } from '@hookwars/sim';

/** One snapshot as it arrived: the team's view, and the last of this client's inputs the server had applied in it. */
export type Snap = { readonly view: TeamView; readonly ack: number };

/** Ascending by tick, no tick twice. */
export type SnapshotBuffer = readonly Snap[];

/** Adds a snapshot wherever its tick belongs, so one that arrives out of order still lands in place. A tick already held is ignored. */
export function insertSnapshot(buffer: SnapshotBuffer, snap: Snap, max: number): SnapshotBuffer {
  if (buffer.some((held) => held.view.tick === snap.view.tick)) return buffer;
  const at = buffer.findIndex((held) => held.view.tick > snap.view.tick);
  const next = at === -1 ? [...buffer, snap] : [...buffer.slice(0, at), snap, ...buffer.slice(at)];
  return next.slice(-max);
}

export type Sample = { readonly from: Snap; readonly to: Snap; readonly alpha: number };

/**
 * The two snapshots either side of `time`, and how far between them it lies. Before the first it is the first; past
 * the last it is the last, held still: nothing here guesses where a fighter went after the server last said.
 */
export function sampleAt(buffer: SnapshotBuffer, time: number): Sample | null {
  const first = buffer[0];
  const last = buffer.at(-1);
  if (first === undefined || last === undefined) return null;
  if (time <= first.view.time) return { from: first, to: first, alpha: 0 };
  if (time >= last.view.time) return { from: last, to: last, alpha: 1 };
  const next = buffer.findIndex((snap) => snap.view.time > time);
  const [from, to] = [buffer[next - 1] ?? first, buffer[next] ?? last];
  return { from, to, alpha: (time - from.view.time) / (to.view.time - from.view.time) };
}

/** The snapshots the drawn moment has reached since `shownTick`, oldest first: each is announced once, when it is drawn. */
export function reached(buffer: SnapshotBuffer, shownTick: number, time: number): readonly Snap[] {
  return buffer.filter((snap) => snap.view.tick > shownTick && snap.view.time <= time);
}
