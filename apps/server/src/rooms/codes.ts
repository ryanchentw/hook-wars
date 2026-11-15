import { randomBytes, randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@hookwars/protocol';
import type { Entropy } from './types';

const TOKEN_BYTES = 24;
const SEED_RANGE = 2 ** 31;

export function randomRoomCode(): string {
  return Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]).join('');
}

/** From the operating system's generator: a rejoin token is a secret, and a seed a client could guess is a match it could foresee. */
export const systemEntropy: Entropy = {
  token: () => randomBytes(TOKEN_BYTES).toString('base64url'),
  seed: () => randomInt(SEED_RANGE),
};
