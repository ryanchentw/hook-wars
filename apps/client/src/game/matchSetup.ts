import type { PlayerId } from '@hookbrawl/sim';
import type { SessionSetup } from './session';

export const LOCAL_PLAYER_ID = 'west-you' as PlayerId;
export const BOT_PLAYER_ID = 'east-bot' as PlayerId;
const KILL_TARGET = 5;
const SEED_RANGE = 2 ** 31;

export type M1Options = {
  readonly botSeed: number;
  /** A practice dummy stands still at its spawn, which also gives tests a fixed target. */
  readonly idleOpponent: boolean;
};

export function createM1Setup({ botSeed, idleOpponent }: M1Options): SessionSetup {
  return {
    localPlayerId: LOCAL_PLAYER_ID,
    botSeed,
    config: {
      killTarget: KILL_TARGET,
      players: [
        { id: LOCAL_PLAYER_ID, name: 'You', team: 'west', isBot: false },
        { id: BOT_PLAYER_ID, name: idleOpponent ? 'Dummy' : 'Bot', team: 'east', isBot: !idleOpponent },
      ],
    },
  };
}

export function optionsFromQuery(search: string, now: number): M1Options {
  const params = new URLSearchParams(search);
  const raw = params.get('seed');
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  return {
    botSeed: Number.isFinite(parsed) ? parsed : Math.floor(now) % SEED_RANGE,
    idleOpponent: params.get('opponent') === 'idle',
  };
}
