import { KILL_TARGETS, SCENE_IDS, type MemberId, type PlayerName, type RoomState } from '@hookwars/room';
import type { PlayerId } from '@hookwars/sim';
import { z } from 'zod';
import { CHAT_CHANNELS, CHAT_HISTORY_MAX, CHAT_MAX_UNITS } from './chatText';
import { idOf, teamSchema } from './common';
import { MAX_SEQ, REJOIN_TOKEN_PATTERN, ROOM_CODE_PATTERN } from './limits';
import { arenaSchema, snapViewSchema } from './view';

const memberId = idOf<MemberId>();

const playerName = z.string().min(1).max(64) as unknown as z.ZodType<PlayerName>;

/**
 * One thing said. `team` is the speaker's side when they spoke, `fighter` their fighter when a match was on, so a bubble
 * can be drawn over it. `seq` counts the room's lines, so a line heard twice is shown once.
 */
const chatLineSchema = z.object({
  seq: z.number().int().min(1).max(MAX_SEQ),
  from: memberId,
  name: playerName,
  team: teamSchema.nullable(),
  fighter: idOf<PlayerId>().nullable(),
  channel: z.enum(CHAT_CHANNELS),
  text: z.string().min(1).max(CHAT_MAX_UNITS),
});
export type ChatLine = z.infer<typeof chatLineSchema>;

const slotSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('empty') }),
  z.object({ kind: z.literal('human'), memberId, name: playerName }),
  z.object({ kind: z.literal('bot') }),
]);
const teamSlots = z.array(slotSchema).length(3);

export const roomStateSchema: z.ZodType<RoomState> = z.object({
  host: memberId.nullable(),
  slots: z.object({ west: teamSlots, east: teamSlots }),
  settings: z.object({
    scene: z.enum(['rotate', ...SCENE_IDS]),
    killTarget: z.union(KILL_TARGETS.map((n) => z.literal(n))),
    fog: z.boolean(),
    pickups: z.boolean(),
  }),
  phase: z.discriminatedUnion('kind', [z.object({ kind: z.literal('lobby') }), z.object({ kind: z.literal('in-match') })]),
  matchesStarted: z.number().int().min(0),
});

/** The room as every member sees it. `away` are the seated members whose connection has dropped and may yet return. */
const roomViewSchema = z.object({ room: roomStateSchema, away: z.array(memberId).max(6) });
export type RoomView = z.infer<typeof roomViewSchema>;

const matchStartSchema = z.object({
  /** Counts the room's matches, so a client knows a rematch from the match it is already showing. */
  matchId: z.number().int().min(1),
  you: idOf<PlayerId>(),
  scene: z.enum(SCENE_IDS),
  /** Milliseconds until the first tick: time for every client to draw the scene and play its opening shot. */
  startsInMs: z.number().min(0),
  /** True when this client is coming back to a match already under way. */
  resumed: z.boolean(),
  arena: arenaSchema,
  view: snapViewSchema,
});
export type MatchStart = z.infer<typeof matchStartSchema>;

/** Why the server refused or dropped a client. The words shown to the player are the client's. */
export const ERROR_CODES = [
  'bad-version',
  'bad-message',
  'room-not-found',
  'room-full',
  'name-taken',
  'rejoin-refused',
  'server-full',
  'rate-limited',
  'replaced',
  'shutdown',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const serverMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('welcome'),
    v: z.number().int(),
    code: z.string().regex(ROOM_CODE_PATTERN),
    you: memberId,
    /** Proves this seat is yours when you reconnect. Never shown, never sent to anyone else. */
    token: z.string().regex(REJOIN_TOKEN_PATTERN),
    lobby: roomViewSchema,
    match: matchStartSchema.nullable(),
    /** The recent lines a returning member may read; empty for someone new to the room. */
    chat: z.array(chatLineSchema).max(CHAT_HISTORY_MAX),
  }),
  z.object({ t: z.literal('room'), lobby: roomViewSchema }),
  z.object({ t: z.literal('matchStart'), match: matchStartSchema }),
  /** `ack` is the last input `seq` the server had applied for this client when it took the snapshot. */
  z.object({ t: z.literal('snap'), ack: z.number().int().min(0).max(MAX_SEQ), view: snapViewSchema }),
  z.object({ t: z.literal('pong'), id: z.number().int().min(0).max(MAX_SEQ) }),
  z.object({ t: z.literal('chat'), line: chatLineSchema }),
  /** Your last line was dropped for coming too fast. Said once, until a line of yours gets through again. */
  z.object({ t: z.literal('chatLimited') }),
  /** The last thing said before the server closes the socket. */
  z.object({ t: z.literal('error'), code: z.enum(ERROR_CODES) }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type ServerMessageOf<T extends ServerMessage['t']> = Extract<ServerMessage, { t: T }>;
