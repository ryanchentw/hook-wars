import { KILL_TARGETS, parseName, SCENE_IDS, type MemberId, type PlayerName, type RoomAction } from '@hookwars/room';
import { z } from 'zod';
import { pointSchema, purchaseSchema, slotRefSchema } from './common';
import { MAX_ACTS_PER_INPUT, MAX_SEQ, RAW_NAME_MAX_LENGTH, REJOIN_TOKEN_PATTERN, ROOM_CODE_PATTERN } from './limits';

/** Typed in any case, with or without spaces around it; stored and compared in capitals. */
export const roomCodeSchema = z
  .string()
  .max(RAW_NAME_MAX_LENGTH)
  .transform((raw) => raw.trim().toUpperCase())
  .pipe(z.string().regex(ROOM_CODE_PATTERN));

export const playerNameSchema = z
  .string()
  .max(RAW_NAME_MAX_LENGTH)
  .transform((raw, ctx): PlayerName => {
    const parsed = parseName(raw);
    if (parsed.ok) return parsed.name;
    ctx.addIssue({ code: 'custom', message: parsed.error });
    return z.NEVER;
  });

const roomRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('create') }),
  z.strictObject({ kind: z.literal('join'), code: roomCodeSchema }),
  z.strictObject({ kind: z.literal('rejoin'), code: roomCodeSchema, token: z.string().regex(REJOIN_TOKEN_PATTERN) }),
]);

/** What a member may ask of the lobby. Who is asking is never part of it: the server knows from the connection. */
export const lobbyActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('moveTo'), slot: slotRefSchema }),
  z.strictObject({ kind: z.literal('addBot'), slot: slotRefSchema }),
  z.strictObject({ kind: z.literal('removeBot'), slot: slotRefSchema }),
  z.strictObject({ kind: z.literal('fillWithBots') }),
  z.strictObject({ kind: z.literal('setScene'), scene: z.enum(['rotate', ...SCENE_IDS]) }),
  z.strictObject({ kind: z.literal('setKillTarget'), killTarget: z.union(KILL_TARGETS.map((n) => z.literal(n))) }),
  z.strictObject({ kind: z.literal('setFog'), fog: z.boolean() }),
  z.strictObject({ kind: z.literal('startMatch') }),
]);
export type LobbyAction = z.infer<typeof lobbyActionSchema>;

/** The one place a lobby action gets its `by`: from the member the server holds for the connection. */
export function stampLobbyAction(action: LobbyAction, by: MemberId): RoomAction {
  return { ...action, by };
}

const actSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('hook'), target: pointSchema }),
  z.strictObject({ kind: z.literal('grapple'), target: pointSchema }),
  z.strictObject({ kind: z.literal('move'), target: pointSchema }),
  z.strictObject({ kind: z.literal('buy'), purchase: purchaseSchema }),
]);
/** A press: everything a fighter can do besides hold a direction. */
export type Act = z.infer<typeof actSchema>;

const axis = z.number().min(-1).max(1);

export const clientMessageSchema = z.discriminatedUnion('t', [
  z.strictObject({ t: z.literal('hello'), v: z.number().int(), name: playerNameSchema, room: roomRequestSchema }),
  z.strictObject({ t: z.literal('lobby'), action: lobbyActionSchema }),
  /** One client tick of intent: the direction held through it and whatever was pressed in it. */
  z.strictObject({
    t: z.literal('input'),
    seq: z.number().int().min(1).max(MAX_SEQ),
    steer: z.strictObject({ x: axis, y: axis }),
    acts: z.array(actSchema).max(MAX_ACTS_PER_INPUT),
  }),
  z.strictObject({ t: z.literal('ping'), id: z.number().int().min(0).max(MAX_SEQ) }),
  /** Gives the seat up for good, where closing the socket only starts the rejoin clock. */
  z.strictObject({ t: z.literal('leave') }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ClientMessageOf<T extends ClientMessage['t']> = Extract<ClientMessage, { t: T }>;
export type RoomRequest = z.infer<typeof roomRequestSchema>;
/** The same shapes before parsing, as a client writes them. */
export type ClientMessageInput = z.input<typeof clientMessageSchema>;
