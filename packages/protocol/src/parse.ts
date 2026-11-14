import type { z } from 'zod';
import { clientMessageSchema, lobbyActionSchema, type ClientMessage, type ClientMessageInput, type LobbyAction } from './clientMessages';
import { MAX_CLIENT_MESSAGE_BYTES, MAX_SERVER_MESSAGE_BYTES } from './limits';
import { serverMessageSchema, type ServerMessage } from './serverMessages';

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

const refuse = (error: string): Parsed<never> => ({ ok: false, error });

function describe(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue === undefined) return 'not a message';
  const where = issue.path.join('.');
  return where === '' ? issue.message : `${where}: ${issue.message}`;
}

function check<T>(schema: z.ZodType<T>, value: unknown): Parsed<T> {
  const result = schema.safeParse(value);
  return result.success ? { ok: true, value: result.data } : refuse(describe(result.error));
}

/** One text frame to one typed value, or the reason it is not one. Never throws, whatever it is handed. */
function decode<T>(schema: z.ZodType<T>, frame: unknown, maxLength: number): Parsed<T> {
  if (typeof frame !== 'string') return refuse('not a text frame');
  if (frame.length > maxLength) return refuse(`longer than ${maxLength} characters`);
  let json: unknown;
  try {
    json = JSON.parse(frame);
  } catch {
    return refuse('not JSON');
  }
  return check(schema, json);
}

/** What the server calls on every frame a client sends. */
export function parseClientMessage(frame: unknown): Parsed<ClientMessage> {
  return decode(clientMessageSchema as z.ZodType<ClientMessage>, frame, MAX_CLIENT_MESSAGE_BYTES);
}

/** What the client calls on every frame the server sends. */
export function parseServerMessage(frame: unknown): Parsed<ServerMessage> {
  return decode(serverMessageSchema as z.ZodType<ServerMessage>, frame, MAX_SERVER_MESSAGE_BYTES);
}

/** A lobby action from anything at all. It has no `by`: `stampLobbyAction` adds the member the connection belongs to. */
export function parseRoomAction(value: unknown): Parsed<LobbyAction> {
  return check(lobbyActionSchema as z.ZodType<LobbyAction>, value);
}

export const encodeClientMessage = (message: ClientMessageInput): string => JSON.stringify(message);
export const encodeServerMessage = (message: ServerMessage): string => JSON.stringify(message);
