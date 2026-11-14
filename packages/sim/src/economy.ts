import { ECONOMY } from './config';
import type { Player, PlayerId } from './types';
import type { Stage } from './world';

/** Summed float time lands a hair either side of a whole second, so whole seconds are counted with a little slack. */
const SLACK = 1e-6;
const wholeSeconds = (time: number): number => Math.floor(time + SLACK);

/** Pays passive income for every whole second this step crosses and forgets damage older than the assist window. */
export const settleEconomy: Stage = (state, { t, dt }) => {
  const income = (wholeSeconds(t + dt) - wholeSeconds(t)) * ECONOMY.passiveGold;
  const since = t - ECONOMY.assistWindow;
  const players = state.players.map((p) => {
    const stale = p.recentDamage.some((d) => d.at < since);
    if (income === 0 && !stale) return p;
    return { ...p, gold: p.gold + income, recentDamage: stale ? p.recentDamage.filter((d) => d.at >= since) : p.recentDamage };
  });
  return { state: { ...state, players }, events: [] };
};

/** Keeps one entry per enemy, the latest, so the log never outgrows the roster. */
export function logDamage(victim: Player, from: PlayerId, t: number): Player {
  return { ...victim, recentDamage: [...victim.recentDamage.filter((d) => d.from !== from), { from, at: t }] };
}

export type KillRecord = { readonly killerId: PlayerId; readonly victim: Player; readonly assistIds: readonly PlayerId[] };

/** The log only ever holds enemy damage, so everyone in it but the killer earned an assist. */
export function assistsOn(victim: Player, killerId: PlayerId): readonly PlayerId[] {
  return victim.recentDamage.map((d) => d.from).filter((id) => id !== killerId);
}

export function reward(player: Player, kills: readonly KillRecord[]): Player {
  const credited = kills.filter((k) => k.killerId === player.id).length;
  const assisted = kills.filter((k) => k.assistIds.includes(player.id)).length;
  if (credited === 0 && assisted === 0) return player;
  return {
    ...player,
    kills: player.kills + credited,
    assists: player.assists + assisted,
    gold: player.gold + credited * ECONOMY.killGold + assisted * ECONOMY.assistGold,
  };
}
