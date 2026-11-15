import { PICKUPS } from './config';
import { addEffect } from './effects';
import type { GameEvent, GameState, Pickup, PickupKind, Player } from './types';
import { updatePlayer, type Outcome } from './world';

type Reward = { readonly state: GameState; readonly gold: number };

/** What each kind does for whoever brings it home, in one place. */
const ON_COLLECT: Readonly<Record<PickupKind, (state: GameState, collector: Player, t: number) => Reward>> = {
  gold: (state, collector) => ({
    state: updatePlayer(state, collector.id, (p) => ({ ...p, gold: p.gold + PICKUPS.gold, earned: p.earned + PICKUPS.gold })),
    gold: PICKUPS.gold,
  }),
  gale: (state, collector, t) => ({ state: updatePlayer(state, collector.id, (p) => addEffect(p, 'gale', collector.id, t)), gold: 0 }),
  /** Only enemies alive now are struck: one who respawns while it lasts walks out untouched. */
  storm: (state, collector, t) => ({
    state: {
      ...state,
      players: state.players.map((p) => (p.team !== collector.team && p.status.kind !== 'dead' ? addEffect(p, 'storm', collector.id, t) : p)),
    },
    gold: 0,
  }),
};

/** The pickup has reached `collector`'s hand: it leaves the water and does what its kind does. */
export function collect(state: GameState, pickup: Pickup, collector: Player, t: number): Outcome {
  const without = { ...state, pickups: state.pickups.filter((p) => p.id !== pickup.id) };
  const reward = ON_COLLECT[pickup.kind](without, collector, t);
  const event: GameEvent = { kind: 'pickupCollected', pickupId: pickup.id, pickupKind: pickup.kind, playerId: collector.id, gold: reward.gold };
  return { state: reward.state, events: [event] };
}
