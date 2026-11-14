import { MAX_ACTS_PER_INPUT, toTeamView, type Act, type ClientMessageInput, type MatchStart, type ServerMessage } from '@hookbrawl/protocol';
import { TICK_DT, type PlayerInput, type SeenPlayer, type TeamView, type Vec2 } from '@hookbrawl/sim';
import type { Frame, Session, SessionListener } from '../game/session';
import { lerp } from '../render/interpolate';
import { NET } from './netConfig';
import { advancePlayout, NO_PLAYOUT, observeSnapshot, type Playout, type PlayoutRules } from './playout';
import { absorbCorrection, decayCorrection, isPredictable, reconcile, walkAhead, type PendingInput } from './prediction';
import { insertSnapshot, reached, sampleAt, type Sample, type Snap, type SnapshotBuffer } from './snapshotBuffer';

/** The part of a connection a match needs. */
export type NetLink = {
  send(message: ClientMessageInput): void;
  isOnline(): boolean;
  listen(onMessage: (message: ServerMessage) => void): () => void;
};

export type NetSessionDeps = {
  readonly link: NetLink;
  readonly start: MatchStart;
  /** Seconds, from a clock that only runs forwards. */
  readonly now: () => number;
};

export type NetSession = Session & {
  readonly matchId: number;
  /** The connection came back mid-match: the server's input clock for this fighter has started over, so ours does too. */
  resume(): void;
  dispose(): void;
};

const STILL: Vec2 = { x: 0, y: 0 };
const MAX_TICKS_PER_ADVANCE = 5;
const TICK_EPSILON = 1e-9;
const PLAYOUT: PlayoutRules = {
  delay: NET.interpolationDelay,
  gain: NET.playoutGain,
  maxSpeedUp: NET.playoutMaxSpeedUp,
  maxSlowDown: NET.playoutMaxSlowDown,
  snap: NET.playoutSnap,
  drift: NET.clockDrift,
};

const same = (a: Vec2, b: Vec2): boolean => a.x === b.x && a.y === b.y;
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

function toAct(input: PlayerInput): Act | null {
  switch (input.kind) {
    case 'hook':
    case 'grapple':
    case 'move':
      return { kind: input.kind, target: input.target };
    case 'buy':
      return { kind: 'buy', purchase: input.purchase };
    case 'steer':
    case 'stop':
      return null;
  }
}

/** The local fighter drawn at `pos`, in a view that is otherwise the server's. */
function withLocal(view: TeamView, local: SeenPlayer | null): TeamView {
  if (local === null) return view;
  return { ...view, players: view.players.map((p) => (p.id === local.id ? { ...p, pos: local.pos, facing: local.facing } : p)) };
}

/**
 * A match the server runs, behind the interface a local match has. Other fighters, hooks and grapples are drawn a
 * moment in the past, between two snapshots. The local fighter's walk is run ahead on this side from the same code
 * the server runs, and put right against each snapshot. Hits, deaths, gold and everything else wait for the server.
 */
export function createNetSession({ link, start, now }: NetSessionDeps): NetSession {
  const { arena } = start;
  const localId = start.you;
  const listeners = new Set<SessionListener>();
  const first: Snap = { view: toTeamView(start.view, arena), ack: 0 };
  const own = (view: TeamView): SeenPlayer | undefined => view.players.find((p) => p.id === localId);

  let buffer: SnapshotBuffer = [];
  let playout: Playout = NO_PLAYOUT;
  let shown: Snap = first;
  let newest: Snap = first;
  let pending: readonly PendingInput[] = [];
  let seq = 0;
  /** The first input sent with each ticket's act in it, so the snapshot that acknowledges it answers the ticket. */
  let tickets: readonly { readonly ticket: number; readonly seq: number | null }[] = [];
  let issued = 0;
  let answered = 0;
  let acts: readonly { readonly act: Act; readonly ticket: number }[] = [];
  let desiredSteer = STILL;
  let sentSteer = STILL;
  let accumulator = 0;
  let before = own(first.view) ?? null;
  let after = before;
  let offset = STILL;
  let predicting = true;
  let drawn = before;

  /** Inputs count once the server's clock is running and the line is up; before and between, the fighter does not answer. */
  const live = (): boolean => newest.view.tick > 0 && link.isOnline() && newest.view.phase.kind === 'playing';

  const localTick = (): void => {
    before = after;
    if (!live() || after === null) return;
    const steer = desiredSteer;
    const taken = acts.slice(0, MAX_ACTS_PER_INPUT);
    if (same(steer, STILL) && same(sentSteer, STILL) && taken.length === 0) return;
    seq += 1;
    acts = acts.slice(taken.length);
    tickets = tickets.map((t) => (t.seq === null && taken.some((a) => a.ticket === t.ticket) ? { ...t, seq } : t));
    sentSteer = steer;
    pending = [...pending, { seq, steer }].slice(-NET.maxPendingInputs);
    link.send({ t: 'input', seq, steer, acts: taken.map((a) => a.act) });
    after = walkAhead(after, steer, arena);
  };

  const onSnapshot = (snap: Snap): void => {
    buffer = insertSnapshot(buffer, snap, NET.snapshotBufferSize);
    playout = observeSnapshot(playout, snap.view.time, now(), PLAYOUT);
    if (snap.view.tick <= newest.view.tick) return;
    newest = snap;
    const server = own(snap.view);
    if (server === undefined || after === null) return;
    const result = reconcile(server, snap.ack, pending, arena);
    pending = result.pending;
    if (predicting) offset = absorbCorrection(offset, after.pos, result.player.pos, NET.correctionSnap);
    // The walk between the last two ticks is kept, moved to where it now ends.
    before = before === null ? result.player : { ...before, pos: add(before.pos, { x: result.player.pos.x - after.pos.x, y: result.player.pos.y - after.pos.y }) };
    after = result.player;
  };

  const sample = (): Sample => (playout.time === null ? null : sampleAt(buffer, playout.time)) ?? { from: shown, to: shown, alpha: 0 };

  /** Where the local fighter is drawn this frame: ahead of the server while they can walk, with everyone else while they cannot. */
  const place = (dt: number): void => {
    const { from, to, alpha } = sample();
    const [a, b] = [own(from.view), own(to.view)];
    if (before === null || after === null || a === undefined || b === undefined) return void (drawn = null);
    const ahead = isPredictable(after) && isPredictable(b);
    const tickAlpha = Math.min(1, accumulator / TICK_DT);
    const base = ahead ? lerp(before.pos, after.pos, tickAlpha) : lerp(a.pos, b.pos, alpha);
    if (ahead !== predicting && drawn !== null) offset = absorbCorrection(STILL, drawn.pos, base, NET.correctionSnap);
    predicting = ahead;
    offset = decayCorrection(offset, dt, NET.correctionHalfLife);
    drawn = { ...b, pos: add(base, offset), facing: ahead ? after.facing : b.facing };
  };

  const announce = (): void => {
    if (playout.time === null) return;
    reached(buffer, shown.view.tick, playout.time).forEach((snap) => {
      shown = snap;
      answered = tickets.reduce((max, t) => (t.seq !== null && t.seq <= snap.ack ? Math.max(max, t.ticket) : max), answered);
      tickets = tickets.filter((t) => t.ticket > answered);
      const view = withLocal(snap.view, drawn);
      listeners.forEach((listener) => listener(view));
    });
  };

  const unlisten = link.listen((message) => {
    if (message.t === 'snap') onSnapshot({ view: toTeamView(message.view, arena), ack: message.ack });
  });

  return {
    matchId: start.matchId,
    localPlayerId: localId,
    localTeam: start.view.viewer,
    advance(realSeconds) {
      if (!(realSeconds > 0)) return;
      accumulator += realSeconds;
      for (let ran = 0; accumulator + TICK_EPSILON >= TICK_DT && ran < MAX_TICKS_PER_ADVANCE; ran += 1) {
        localTick();
        accumulator = Math.max(0, accumulator - TICK_DT);
      }
      if (accumulator + TICK_EPSILON >= TICK_DT) accumulator = 0;
      playout = advancePlayout(playout, realSeconds, now(), buffer.at(-1)?.view.time ?? null, PLAYOUT);
      place(realSeconds);
      announce();
    },
    queueInput(input) {
      const act = toAct(input);
      if (act === null || !live()) return issued;
      issued += 1;
      acts = [...acts, { act, ticket: issued }];
      tickets = [...tickets, { ticket: issued, seq: null }];
      return issued;
    },
    answeredThrough: () => answered,
    setSteer(dir) {
      desiredSteer = dir;
    },
    // The server's clock is not this client's to stop.
    setPaused: () => undefined,
    frame(): Frame {
      const { from, to, alpha } = sample();
      return { previous: withLocal(from.view, drawn), current: withLocal(to.view, drawn), alpha };
    },
    getView: () => withLocal(shown.view, drawn),
    getState() {
      throw new Error('An online match lives on the server: this client holds only what its team may see.');
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    resume() {
      pending = [];
      seq = 0;
      acts = [];
      tickets = [];
      answered = issued;
      sentSteer = STILL;
    },
    dispose: unlisten,
  };
}
