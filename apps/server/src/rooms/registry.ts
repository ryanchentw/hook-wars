import type { ChatChannel, ClientMessageOf, ErrorCode, LobbyAction, ServerMessage } from '@hookwars/protocol';
import type { MemberId, PlayerName } from '@hookwars/room';
import type { Logger } from '../logger';
import { advance, chat, createRoomCore, disconnect, input, isAbandoned, join, leave, lobbyAction, rejoin, wakeAt, type Seated } from './core';
import type { Entropy, Room, RoomRules, Step } from './types';

/** Where a member's messages go: one connection. */
export type Sink = { send(message: ServerMessage): void; close(code: ErrorCode): void };

export type Clock = {
  now(): number;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

export type RegistryDeps = {
  readonly rules: RoomRules;
  readonly entropy: Entropy;
  readonly clock: Clock;
  readonly log: Logger;
  readonly maxRooms: number;
  readonly newCode: () => string;
};

export type Entry = { ok: true; member: MemberId } | { ok: false; code: ErrorCode };
export type EnterRequest = { readonly kind: 'join'; readonly name: PlayerName } | { readonly kind: 'rejoin'; readonly token: string };

export type Registry = {
  /** A new, empty room's code, or null when the server holds as many as it may. */
  create(): string | null;
  enter(code: string, request: EnterRequest, sink: Sink): Entry;
  /** `sink` says which connection dropped: one already replaced by a rejoin drops without the member going away. */
  disconnect(code: string, member: MemberId, sink: Sink): void;
  leave(code: string, member: MemberId): void;
  lobby(code: string, member: MemberId, action: LobbyAction): void;
  input(code: string, member: MemberId, message: ClientMessageOf<'input'>): void;
  chat(code: string, member: MemberId, channel: ChatChannel, text: string): void;
  stats(): { readonly rooms: number; readonly matches: number };
  /** Tells every member why, and stops every room's clock. */
  shutdown(code: ErrorCode): void;
};

/** `wake` is the time the pending timer was set for, or null when none is pending. */
type Live = { room: Room; readonly id: number; readonly sinks: Map<MemberId, Sink>; timer: unknown; wake: number | null };

const CODE_ATTEMPTS = 8;

/** Every room on this machine, each with its clock and its members' connections. All room logic is in `core`. */
export function createRegistry(deps: RegistryDeps): Registry {
  const { rules, clock, log, entropy } = deps;
  const rooms = new Map<string, Live>();
  let roomSeq = 0;

  const deliver = (live: Live, step: Step): void => {
    live.room = step.room;
    step.out.forEach((out) => {
      if (out.kind === 'send') live.sinks.get(out.to)?.send(out.message);
      else live.sinks.get(out.member)?.close(out.code);
    });
  };

  const wakeUp = (live: Live): void => {
    live.wake = null;
    apply(live, (room, now) => advance(room, now, rules));
  };

  const schedule = (live: Live): void => {
    if (isAbandoned(live.room, clock.now(), rules)) {
      clock.clearTimeout(live.timer);
      rooms.delete(live.room.code);
      log.info('room.closed', { room: live.id, rooms: rooms.size });
      return;
    }
    const wake = wakeAt(live.room, rules);
    // Most changes, every input among them, leave the next tick where it was: the timer already set is the right one.
    if (wake === live.wake) return;
    clock.clearTimeout(live.timer);
    live.wake = wake;
    live.timer = wake === null ? null : clock.setTimeout(() => wakeUp(live), Math.max(0, wake - clock.now()));
  };

  /** The one way a room changes: a core function is run, what it sent is delivered, and the clock is set for what comes next. */
  function apply(live: Live, change: (room: Room, now: number) => Step): void {
    try {
      deliver(live, change(live.room, clock.now()));
    } catch (error) {
      log.error('room.failed', { room: live.id, reason: error instanceof Error ? error.message : 'unknown' });
    }
    schedule(live);
  }

  const withRoom = (code: string, change: (room: Room, now: number) => Step): void => {
    const live = rooms.get(code);
    if (live !== undefined) apply(live, change);
  };

  const seat = (live: Live, seated: Seated, sink: Sink): Entry => {
    if (!seated.ok) return seated;
    const previous = live.sinks.get(seated.member);
    live.sinks.set(seated.member, sink);
    previous?.close('replaced');
    apply(live, () => seated.step);
    return { ok: true, member: seated.member };
  };

  return {
    create() {
      if (rooms.size >= deps.maxRooms) return null;
      const code = Array.from({ length: CODE_ATTEMPTS }, deps.newCode).find((candidate) => !rooms.has(candidate));
      if (code === undefined) return null;
      const live: Live = { room: createRoomCore(code, clock.now()), id: (roomSeq += 1), sinks: new Map(), timer: null, wake: null };
      rooms.set(code, live);
      schedule(live);
      log.info('room.opened', { room: live.id, rooms: rooms.size });
      return code;
    },
    enter(code, request, sink) {
      const live = rooms.get(code);
      if (live === undefined) return { ok: false, code: request.kind === 'join' ? 'room-not-found' : 'rejoin-refused' };
      const now = clock.now();
      const entry = seat(live, request.kind === 'join' ? join(live.room, request.name, now, entropy) : rejoin(live.room, request.token, now), sink);
      log.info('room.enter', { room: live.id, kind: request.kind, ok: entry.ok, members: live.room.members.length });
      return entry;
    },
    disconnect(code, member, sink) {
      const live = rooms.get(code);
      if (live === undefined || live.sinks.get(member) !== sink) return;
      live.sinks.delete(member);
      apply(live, (room, now) => disconnect(room, member, now));
      log.info('room.dropped', { room: live.id, members: live.room.members.length });
    },
    leave(code, member) {
      rooms.get(code)?.sinks.delete(member);
      withRoom(code, (room, now) => leave(room, member, now));
    },
    lobby: (code, member, action) => withRoom(code, (room, now) => lobbyAction(room, member, action, now, rules, entropy)),
    input: (code, member, message) => withRoom(code, (room, now) => input(room, member, message, now, rules)),
    chat: (code, member, channel, text) => withRoom(code, (room) => chat(room, member, channel, text)),
    stats: () => ({ rooms: rooms.size, matches: [...rooms.values()].filter((live) => live.room.match !== null).length }),
    shutdown(code) {
      rooms.forEach((live) => {
        clock.clearTimeout(live.timer);
        live.sinks.forEach((sink) => sink.close(code));
      });
      rooms.clear();
    },
  };
}
