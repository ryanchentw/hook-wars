import type { GameState, PlayerId } from './types';

/**
 * Records which fighters a computer drives right now; `isBot` is that fact and nothing more.
 * Whoever runs the match decides it: the config offline, the server online as members drop and return.
 */
export function withBotControl(state: GameState, bots: ReadonlySet<PlayerId>): GameState {
  if (state.players.every((p) => p.isBot === bots.has(p.id))) return state;
  return { ...state, players: state.players.map((p) => (p.isBot === bots.has(p.id) ? p : { ...p, isBot: bots.has(p.id) })) };
}
