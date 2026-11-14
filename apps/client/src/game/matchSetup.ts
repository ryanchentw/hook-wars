import type { PlayerId } from '@hookbrawl/sim';
import type { SessionSetup } from './session';

export const LOCAL_PLAYER_ID = 'west-you' as PlayerId;
export const BOT_PLAYER_ID = 'east-bot' as PlayerId;
const KILL_TARGET = 10;
const SEED_RANGE = 2 ** 31;
/** Enough to max every upgrade several times over; anything above it is a typo. */
export const MAX_STARTING_GOLD = 100_000;
const WHOLE_NUMBER = /^\d+$/;

export type MatchOptions = {
  readonly botSeed: number;
  /** A practice dummy stands still at its spawn, which also gives tests a fixed target. */
  readonly idleOpponent: boolean;
  /** Null leaves the sim's default. */
  readonly startingGold: number | null;
};

export function createMatchSetup({ botSeed, idleOpponent, startingGold }: MatchOptions): SessionSetup {
  return {
    localPlayerId: LOCAL_PLAYER_ID,
    botSeed,
    config: {
      killTarget: KILL_TARGET,
      ...(startingGold === null ? {} : { startingGold }),
      players: [
        { id: LOCAL_PLAYER_ID, name: 'You', team: 'west', isBot: false },
        { id: BOT_PLAYER_ID, name: idleOpponent ? 'Dummy' : 'Bot', team: 'east', isBot: !idleOpponent },
      ],
    },
  };
}

function parseGold(raw: string | null): number | null {
  if (raw === null || !WHOLE_NUMBER.test(raw)) return null;
  return Math.min(MAX_STARTING_GOLD, Number(raw));
}

export function optionsFromQuery(search: string, now: number): MatchOptions {
  const params = new URLSearchParams(search);
  const raw = params.get('seed');
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  return {
    botSeed: Number.isFinite(parsed) ? parsed : Math.floor(now) % SEED_RANGE,
    idleOpponent: params.get('opponent') === 'idle',
    startingGold: parseGold(params.get('gold')),
  };
}
