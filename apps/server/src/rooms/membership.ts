import { timingSafeEqual } from 'node:crypto';
import type { ErrorCode, ServerMessage } from '@hookwars/protocol';
import { PROTOCOL_VERSION } from '@hookwars/protocol';
import { allSlots, reduce, type MemberId, type PlayerName } from '@hookwars/room';
import { fighterOf, matchStartFor } from './match';
import type { Entropy, Member, Room, RoomRules, Step } from './types';
import { announce, findMember, isMemberOnline, isOnline, roomView } from './view';

export type Seated = { readonly ok: true; readonly step: Step; readonly member: MemberId } | { readonly ok: false; readonly code: ErrorCode };

const fold = (name: string): string => name.normalize('NFKC').toLowerCase();

function sameToken(a: string, b: string): boolean {
  const [left, right] = [Buffer.from(a), Buffer.from(b)];
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The host is always someone connected, while anyone is. A host who drops loses the room at once, to the first
 * connected member in seat order, and does not get it back by returning: the lobby never waits on an absent host.
 */
function ensureHost(room: Room): Room {
  const { host } = room.lobby;
  if (host === null || isMemberOnline(room, host)) return room;
  const heir = allSlots(room.lobby)
    .flatMap(({ slot }) => (slot.kind === 'human' ? [slot.memberId] : []))
    .find((id) => isMemberOnline(room, id));
  return heir === undefined ? room : { ...room, lobby: reduce(room.lobby, { kind: 'passHost', by: host, to: heir }) };
}

function welcome(room: Room, member: Member, now: number): ServerMessage {
  const fighter = fighterOf(room.match, member.id);
  return {
    t: 'welcome',
    v: PROTOCOL_VERSION,
    code: room.code,
    you: member.id,
    token: member.token,
    lobby: roomView(room),
    match: room.match !== null && fighter !== undefined ? matchStartFor(room.match, fighter, now, true) : null,
  };
}

export function join(room: Room, name: PlayerName, now: number, entropy: Entropy): Seated {
  if (room.members.some((m) => fold(m.name) === fold(name))) return { ok: false, code: 'name-taken' };
  const id = `m${room.nextMemberSeq}` as MemberId;
  const lobby = reduce(room.lobby, { kind: 'join', by: id, name });
  if (lobby === room.lobby) return { ok: false, code: 'room-full' };
  const member: Member = { id, token: entropy.token(), name, awaySince: null };
  const next = ensureHost({ ...room, lobby, members: [...room.members, member], nextMemberSeq: room.nextMemberSeq + 1, emptySince: null });
  return { ok: true, member: id, step: { room: next, out: [{ kind: 'send', to: id, message: welcome(next, member, now) }, ...announce(next, id)] } };
}

/** Gives a returning member their seat back, and their fighter with it: its input clock starts over with the new connection. */
export function rejoin(room: Room, token: string, now: number): Seated {
  const member = room.members.find((m) => sameToken(m.token, token));
  if (member === undefined) return { ok: false, code: 'rejoin-refused' };
  const back: Member = { ...member, awaySince: null };
  const match = room.match === null ? null : { ...room.match, fighters: room.match.fighters.map((f) => (f.owner === member.id ? { ...f, queue: [], ack: 0 } : f)) };
  const next = ensureHost({ ...room, match, members: room.members.map((m) => (m.id === member.id ? back : m)) });
  return { ok: true, member: member.id, step: { room: next, out: [{ kind: 'send', to: member.id, message: welcome(next, back, now) }, ...announce(next, member.id)] } };
}

/** The connection dropped: the seat is held, and a bot plays the fighter, until the member returns or the window closes. */
export function disconnect(room: Room, id: MemberId, now: number): Step {
  const member = findMember(room, id);
  if (member === undefined || !isOnline(member)) return { room, out: [] };
  const next = ensureHost({ ...room, members: room.members.map((m) => (m.id === id ? { ...m, awaySince: now } : m)) });
  return { room: next, out: announce(next) };
}

/** Gone for good: the seat is freed for someone else, and in a match the fighter is a bot's from here on. */
export function leave(room: Room, id: MemberId, now: number): Step {
  if (findMember(room, id) === undefined) return { room, out: [] };
  const members = room.members.filter((m) => m.id !== id);
  const match = room.match === null ? null : { ...room.match, fighters: room.match.fighters.map((f) => (f.owner === id ? { ...f, owner: null } : f)) };
  const next = ensureHost({ ...room, members, match, lobby: reduce(room.lobby, { kind: 'leave', by: id }), emptySince: members.length === 0 ? now : null });
  return { room: next, out: announce(next) };
}

export const rejoinDeadline = (member: Member, rules: RoomRules): number | null => (member.awaySince === null ? null : member.awaySince + rules.rejoinWindowMs);

/** Frees the seat of every member whose window to return has closed. */
export function expireAway(room: Room, now: number, rules: RoomRules): Step {
  const gone = room.members.filter((m) => (rejoinDeadline(m, rules) ?? Infinity) <= now);
  return gone.reduce<Step>(
    (acc, member) => {
      const left = leave(acc.room, member.id, now);
      return { room: left.room, out: [...acc.out, ...left.out] };
    },
    { room, out: [] },
  );
}
