/** Checked at connect: a client and a server that disagree do not talk. Raise it with any change to a message. */
export const PROTOCOL_VERSION = 2;

/** No client message comes near this; the server's socket refuses anything longer before it is read. */
export const MAX_CLIENT_MESSAGE_BYTES = 2048;
/** A 3v3 snapshot is about 4 kB; a client that is sent more than this is not talking to this server. */
export const MAX_SERVER_MESSAGE_BYTES = 65_536;

/** No 0, O, 1, I or L: a code is read aloud and typed by hand. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** 24 random bytes, base64url. */
export const REJOIN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

/** A name as typed, before it is trimmed and checked; far past the 16 characters a name may have. */
export const RAW_NAME_MAX_LENGTH = 64;
/** Aim and walk points: well outside any arena, so a point just off the edge still counts, and nothing absurd does. */
export const COORD_LIMIT = 10_000;
/** A tick's worth of presses: a hook, a grapple and a couple of purchases. */
export const MAX_ACTS_PER_INPUT = 4;
export const MAX_SEQ = 2 ** 31 - 1;
export const MAX_ID_LENGTH = 32;
