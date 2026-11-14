import { createMatch, DEFAULT_ARENA, step, TICK_DT, viewFor, type GameState, type PlayerId, type PlayerInput, type SeenPlayer, type Vec2 } from '@hookbrawl/sim';
import { describe, expect, it } from 'vitest';
import { absorbCorrection, decayCorrection, reconcile, walkAhead, type PendingInput } from './prediction';

const ME = 'west-0' as PlayerId;
const FOE = 'east-0' as PlayerId;
const STRIDE = 10;
const EAST: Vec2 = { x: 1, y: 0 };
const SOUTH: Vec2 = { x: 0, y: 1 };
const STILL: Vec2 = { x: 0, y: 0 };

const newMatch = (): GameState =>
  createMatch({
    killTarget: 5,
    players: [
      { id: ME, name: 'Me', team: 'west', isBot: false },
      { id: FOE, name: 'Foe', team: 'east', isBot: false },
    ],
  });
const meIn = (state: GameState): SeenPlayer => viewFor(state, 'west').players.find((p) => p.id === ME)!;
const steerAt = (tick: number): Vec2 => (tick < 20 ? EAST : tick < 35 ? SOUTH : tick < 40 ? STILL : tick < 60 ? { x: -1, y: -1 } : STILL);

type Packet<T> = { readonly at: number; readonly body: T };

/**
 * A client and a server joined by a line with a delay each way, both stepping the real sim. `uplink(tick)` says how
 * many ticks an input sent on `tick` takes to arrive; the server applies one input a tick and folds a burst, as the
 * room does. Returns, per input, where the client predicted itself and where the server then put it.
 */
function play(ticks: number, uplink: (tick: number) => number, downlink: number) {
  let server = newMatch();
  let queue: PendingInput[] = [];
  let ack = 0;
  let toServer: Packet<PendingInput>[] = [];
  let toClient: Packet<{ me: SeenPlayer; ack: number }>[] = [];
  let pending: readonly PendingInput[] = [];
  let predicted = meIn(server);
  const predictedAt = new Map<number, Vec2>();
  const serverAt = new Map<number, Vec2>();

  for (let tick = 1; tick <= ticks; tick += 1) {
    toClient.filter((p) => p.at <= tick).forEach((p) => ({ player: predicted, pending } = reconcile(p.body.me, p.body.ack, pending, DEFAULT_ARENA)));
    toClient = toClient.filter((p) => p.at > tick);
    const input = { seq: tick, steer: steerAt(tick) };
    pending = [...pending, input];
    predicted = walkAhead(predicted, input.steer, DEFAULT_ARENA);
    predictedAt.set(tick, predicted.pos);
    toServer = [...toServer, { at: tick + uplink(tick), body: input }];

    queue = [...queue, ...toServer.filter((p) => p.at <= tick).map((p) => p.body)];
    toServer = toServer.filter((p) => p.at > tick);
    const take = queue.slice(0, Math.max(queue.length > 0 ? 1 : 0, queue.length - 1));
    queue = queue.slice(take.length);
    ack = take.at(-1)?.seq ?? ack;
    server = step(server, take.map((i): PlayerInput => ({ kind: 'steer', playerId: ME, dir: i.steer })), TICK_DT);
    take.forEach((i) => serverAt.set(i.seq, meIn(server).pos));
    toClient = [...toClient, { at: tick + downlink, body: { me: meIn(server), ack } }];
  }
  return { predictedAt, serverAt, predicted: () => predicted, server: () => meIn(server), pending: () => pending };
}

describe('reconciling against the server', () => {
  it('is the server fighter when nothing is unacknowledged', () => {
    const me = meIn(newMatch());
    expect(reconcile(me, 5, [{ seq: 4, steer: EAST }, { seq: 5, steer: EAST }], DEFAULT_ARENA)).toEqual({ player: me, pending: [] });
  });

  it('walks the unacknowledged inputs again on top of the server position, and forgets the rest', () => {
    const me = meIn(newMatch());
    const pending = [3, 4, 5, 6].map((seq) => ({ seq, steer: EAST }));
    const result = reconcile(me, 3, pending, DEFAULT_ARENA);
    expect(result.player.pos).toEqual({ x: me.pos.x + 3 * STRIDE, y: me.pos.y });
    expect(result.pending.map((i) => i.seq)).toEqual([4, 5, 6]);
  });

  it('stops at the water like the server does', () => {
    const me = { ...meIn(newMatch()), pos: { x: 960, y: 675 } };
    const pending = [1, 2, 3].map((seq) => ({ seq, steer: EAST }));
    expect(reconcile(me, 0, pending, DEFAULT_ARENA).player.pos.x).toBe(DEFAULT_ARENA.canal.x0 - 34);
  });

  it('predicts nothing for a fighter who cannot walk, and keeps their inputs for when they can', () => {
    const dragged: SeenPlayer = { ...meIn(newMatch()), status: { kind: 'staggered', until: 9 } };
    const pending = [{ seq: 2, steer: EAST }];
    expect(reconcile(dragged, 1, pending, DEFAULT_ARENA)).toEqual({ player: dragged, pending });
  });
});

describe('prediction over a line', () => {
  it('puts the fighter exactly where the server will, on a steady line of any delay', () => {
    const run = play(80, () => 3, 2);
    expect(run.serverAt.size).toBeGreaterThan(70);
    run.serverAt.forEach((pos, seq) => {
      expect(run.predictedAt.get(seq)!.x).toBeCloseTo(pos.x, 6);
      expect(run.predictedAt.get(seq)!.y).toBeCloseTo(pos.y, 6);
    });
  });

  it('ends exactly on the server after a 300 ms spike held nine inputs back and delivered them at once', () => {
    const spike = (tick: number): number => (tick >= 10 && tick < 19 ? 19 - tick + 2 : 2);
    const run = play(90, spike, 2);
    expect(run.predicted().pos.x).toBeCloseTo(run.server().pos.x, 6);
    expect(run.predicted().pos.y).toBeCloseTo(run.server().pos.y, 6);
    expect(run.pending().length).toBeLessThanOrEqual(5);
  });

  it('is never further out than the spike was long, even while inputs arrive reordered into bursts', () => {
    const jitter = (tick: number): number => 2 + ((tick * 7) % 4);
    const run = play(90, jitter, 3);
    const worst = Math.max(...[...run.serverAt].map(([seq, pos]) => Math.hypot(run.predictedAt.get(seq)!.x - pos.x, run.predictedAt.get(seq)!.y - pos.y)));
    expect(worst).toBeLessThanOrEqual(4 * STRIDE * Math.SQRT2);
    expect(run.predicted().pos.x).toBeCloseTo(run.server().pos.x, 6);
  });

  it('survives a snapshot that arrives late and out of date', () => {
    const me = meIn(newMatch());
    const pending = [1, 2, 3, 4].map((seq) => ({ seq, steer: EAST }));
    const fresh = reconcile({ ...me, pos: { x: me.pos.x + 3 * STRIDE, y: me.pos.y } }, 3, pending, DEFAULT_ARENA);
    const stale = reconcile({ ...me, pos: { x: me.pos.x + STRIDE, y: me.pos.y } }, 1, fresh.pending, DEFAULT_ARENA);
    expect(fresh.player.pos.x).toBe(me.pos.x + 4 * STRIDE);
    expect(stale.pending.map((i) => i.seq)).toEqual([4]);
  });
});

describe('smoothing a correction', () => {
  it('keeps the drawn place still when the true place moves, then lets the error go', () => {
    const offset = absorbCorrection({ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 110, y: 50 }, 150);
    expect({ x: 110 + offset.x, y: 50 + offset.y }).toEqual({ x: 100, y: 50 });
    const half = decayCorrection(offset, 0.06, 0.06);
    expect(half.x).toBeCloseTo(-5, 6);
    expect(Math.abs(decayCorrection(offset, 0.5, 0.06).x)).toBeLessThan(0.05);
  });

  it('does not smooth a jump as large as a respawn', () => {
    expect(absorbCorrection({ x: 0, y: 0 }, { x: 900, y: 600 }, { x: 420, y: 675 }, 150)).toEqual({ x: 0, y: 0 });
  });
});
