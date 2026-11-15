import { CHAT_HISTORY_MAX, chatTextFits, sanitizeChatText, type ChatChannel, type ChatLine } from '@hookwars/protocol';
import { seatOf, type MemberId } from '@hookwars/room';
import type { TeamId } from '@hookwars/sim';
import { fighterOf } from './match';
import type { Member, Outbound, Room, Step } from './types';
import { findMember, isOnline } from './view';

/** The side a member is on now: their fighter's in a match, else their seat's. */
const teamOf = (room: Room, member: MemberId): TeamId | null => fighterOf(room.match, member)?.team ?? seatOf(room.lobby, member)?.team ?? null;

/** Every All line, and the Team lines of the side `member` is on now. */
function entitled(room: Room, member: MemberId, line: ChatLine): boolean {
  if (line.channel === 'all' || line.from === member) return true;
  return line.team !== null && teamOf(room, member) === line.team;
}

function lineFrom(room: Room, speaker: Member, channel: ChatChannel, text: string): ChatLine {
  return {
    seq: room.nextChatSeq,
    from: speaker.id,
    name: speaker.name,
    team: teamOf(room, speaker.id),
    fighter: fighterOf(room.match, speaker.id)?.id ?? null,
    channel,
    text,
  };
}

/**
 * A member said something. The speaker is the connection's member, never a field of the message. A line that comes out
 * of cleaning empty or too long is dropped without a word: the client never sends one. A Team line is sent only to the
 * speaker's side, so the other side's clients never hold it.
 */
export function chat(room: Room, member: MemberId, channel: ChatChannel, raw: string): Step {
  const speaker = findMember(room, member);
  const text = sanitizeChatText(raw);
  if (speaker === undefined || !isOnline(speaker) || text === '' || !chatTextFits(text)) return { room, out: [] };
  const line = lineFrom(room, speaker, channel, text);
  const next: Room = { ...room, chat: [...room.chat, line].slice(-CHAT_HISTORY_MAX), nextChatSeq: room.nextChatSeq + 1 };
  const out = next.members
    .filter((m) => isOnline(m) && entitled(next, m.id, line))
    .map((m): Outbound => ({ kind: 'send', to: m.id, message: { t: 'chat', line } }));
  return { room: next, out };
}

/** What a member coming back is shown of what was said while they were gone: what they would have been sent. */
export const historyFor = (room: Room, member: MemberId): readonly ChatLine[] => room.chat.filter((line) => entitled(room, member, line));
