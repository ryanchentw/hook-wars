import type { RoomView, ServerMessage } from '@hookbrawl/protocol';
import type { MemberId } from '@hookbrawl/room';
import type { Member, Outbound, Room } from './types';

export const isOnline = (member: Member): boolean => member.awaySince === null;

export const findMember = (room: Room, id: MemberId): Member | undefined => room.members.find((m) => m.id === id);

export const isMemberOnline = (room: Room, id: MemberId | null): boolean => room.members.some((m) => m.id === id && isOnline(m));

export function roomView(room: Room): RoomView {
  return { room: room.lobby, away: room.members.filter((m) => !isOnline(m)).map((m) => m.id) };
}

export function toAll(room: Room, message: ServerMessage, except: MemberId | null = null): readonly Outbound[] {
  return room.members.filter((m) => isOnline(m) && m.id !== except).map((m) => ({ kind: 'send', to: m.id, message }));
}

/** Tells everyone connected how the room now stands. */
export function announce(room: Room, except: MemberId | null = null): readonly Outbound[] {
  return toAll(room, { t: 'room', lobby: roomView(room) }, except);
}
