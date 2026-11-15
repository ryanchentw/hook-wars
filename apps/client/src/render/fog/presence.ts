import type { PlayerId } from '@hookwars/sim';
import type { PlayerFrame } from '../interpolate';

/** The fighters drawn last frame, each with how present they were. */
export type PresenceTrack = ReadonlyMap<PlayerId, PlayerFrame>;

export type Presence = { readonly track: PresenceTrack; readonly players: readonly PlayerFrame[] };

const step = (from: number, towards: number, by: number): number =>
  towards > from ? Math.min(towards, from + by) : Math.max(towards, from - by);

/**
 * Fades fighters in as they come into sight and out as they leave it, so nobody pops. One who has left is drawn where
 * they were last seen until gone. With no track yet, everyone in the first frame is simply there; `seconds` of 0 is instant.
 */
export function trackPresence(track: PresenceTrack | null, players: readonly PlayerFrame[], dt: number, seconds: number): Presence {
  const by = seconds > 0 ? dt / seconds : 1;
  const shown = players.map((pf): PlayerFrame => {
    const before = track?.get(pf.player.id);
    return { ...pf, presence: track === null ? 1 : step(before?.presence ?? 0, 1, by) };
  });
  const here = new Set(players.map((pf) => pf.player.id));
  const leaving = [...(track?.values() ?? [])].flatMap((pf): readonly PlayerFrame[] => {
    if (here.has(pf.player.id)) return [];
    const presence = step(pf.presence, 0, by);
    return presence > 0 ? [{ ...pf, presence }] : [];
  });
  const all = [...shown, ...leaving];
  return { track: new Map(all.map((pf) => [pf.player.id, pf])), players: all };
}
