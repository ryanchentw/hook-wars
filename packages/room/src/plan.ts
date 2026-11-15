import type { MatchPlayerConfig, PlayerId } from '@hookwars/sim';
import { allSlots, botName, sceneFor } from './selectors';
import type { MatchPlan, RoomState, Seat, SlotRef } from './types';

const playerIdOf = (ref: SlotRef): PlayerId => `${ref.team}-${ref.index}` as PlayerId;

/**
 * The match a room in play is playing, or null between matches. Bots are seeded `seed`, `seed + 1`, ... in roster
 * order, so the caller owns all randomness and the same room and seed always make the same match.
 */
export function toMatchConfig(state: RoomState, seed: number): MatchPlan | null {
  if (state.phase.kind !== 'in-match') return null;
  const filled = allSlots(state).filter(({ slot }) => slot.kind !== 'empty');
  const entries = filled.map(({ ref, slot }, i): { readonly player: MatchPlayerConfig; readonly seat: Seat } => {
    const playerId = playerIdOf(ref);
    if (slot.kind === 'human') {
      return {
        player: { id: playerId, name: slot.name, team: ref.team, isBot: false },
        seat: { kind: 'human', playerId, slot: ref, memberId: slot.memberId },
      };
    }
    const botSeed = seed + filled.slice(0, i).filter((f) => f.slot.kind === 'bot').length;
    return { player: { id: playerId, name: botName(ref), team: ref.team, isBot: true }, seat: { kind: 'bot', playerId, slot: ref, seed: botSeed } };
  });
  return {
    config: { killTarget: state.settings.killTarget, fog: state.settings.fog, players: entries.map((e) => e.player) },
    scene: sceneFor(state.settings.scene, state.matchesStarted - 1),
    seats: entries.map((e) => e.seat),
  };
}
