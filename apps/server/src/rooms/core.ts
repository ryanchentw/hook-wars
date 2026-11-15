import { stampLobbyAction, type ClientMessageOf, type LobbyAction } from '@hookwars/protocol';
import { createRoom, reduce, type MemberId } from '@hookwars/room';
import { dueTicks, nextTickAt, queueInput, startMatch, tick } from './match';
import { expireAway, rejoinDeadline } from './membership';
import type { Entropy, Outbound, Room, RoomRules, Step } from './types';
import { announce, findMember } from './view';

export { disconnect, join, leave, rejoin, type Seated } from './membership';
export type { Entropy, Member, Outbound, Room, RoomRules, Step } from './types';

export function createRoomCore(code: string, now: number): Room {
  return { code, lobby: createRoom(), members: [], match: null, nextMemberSeq: 1, emptySince: now };
}

/** A member's lobby action, stamped with who they are by the server. An action the room refuses changes nothing and says nothing. */
export function lobbyAction(room: Room, member: MemberId, action: LobbyAction, now: number, rules: RoomRules, entropy: Entropy): Step {
  if (findMember(room, member) === undefined) return { room, out: [] };
  const lobby = reduce(room.lobby, stampLobbyAction(action, member));
  if (lobby === room.lobby) return { room, out: [] };
  const next = { ...room, lobby };
  if (action.kind === 'startMatch') return startMatch(next, now, rules, entropy);
  return { room: next, out: announce(next) };
}

export function input(room: Room, member: MemberId, message: ClientMessageOf<'input'>, now: number, rules: RoomRules): Step {
  return { room: queueInput(room, member, message, now, rules), out: [] };
}

/** The match is over: the room is a lobby again, with everyone in the seat they had, and the host may start the next. */
function finishMatch(room: Room): Step {
  const { host } = room.lobby;
  const lobby = host === null ? room.lobby : reduce(room.lobby, { kind: 'endMatch', by: host });
  const next = { ...room, lobby, match: null };
  return { room: next, out: announce(next) };
}

function runMatch(room: Room, now: number, rules: RoomRules): Step {
  if (room.match === null) return { room, out: [] };
  const { match: started, due } = dueTicks(room.match, now, rules);
  let match = started;
  const out: Outbound[] = [];
  for (let i = 0; i < due && match.state.phase.kind === 'playing'; i += 1) {
    const ticked = tick(room, match, rules);
    match = ticked.match;
    out.push(...ticked.out);
  }
  const next = { ...room, match };
  if (match.state.phase.kind !== 'ended') return { room: next, out };
  const finished = finishMatch(next);
  return { room: finished.room, out: [...out, ...finished.out] };
}

/** Brings the room up to `now`: closes rejoin windows that have run out and runs every tick that has come due. */
export function advance(room: Room, now: number, rules: RoomRules): Step {
  const expired = expireAway(room, now, rules);
  const ran = runMatch(expired.room, now, rules);
  return { room: ran.room, out: [...expired.out, ...ran.out] };
}

/** When the room next needs `advance`, or null when only a message can change it. */
export function wakeAt(room: Room, rules: RoomRules): number | null {
  const times = [
    room.match === null ? null : nextTickAt(room.match, rules),
    ...room.members.map((m) => rejoinDeadline(m, rules)),
    room.emptySince === null ? null : room.emptySince + rules.emptyRoomGraceMs,
  ].filter((t): t is number => t !== null);
  return times.length === 0 ? null : Math.min(...times);
}

/** Nobody is in it and nobody has come back in time: the room can be forgotten. */
export function isAbandoned(room: Room, now: number, rules: RoomRules): boolean {
  return room.members.length === 0 && room.emptySince !== null && now - room.emptySince >= rules.emptyRoomGraceMs;
}
