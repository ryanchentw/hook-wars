import type { PlayerId, TeamId, TeamView } from '@hookwars/sim';
import type { SlotFeedback } from '../hud/hudView';
import type { CueContext } from './cues';
import type { SoundId } from './manifest';

/** Lookups into the local team's view, so a cue can only be placed where this team sees. */
export function cueContext(view: TeamView, localId: PlayerId, localTeam: TeamId): CueContext {
  return {
    localId,
    localTeam,
    teamOf: (id) => view.roster.find((p) => p.id === id)?.team,
    posOf: (id) => view.players.find((p) => p.id === id)?.pos ?? null,
    hookPos: (id) => view.hooks.find((h) => h.id === id)?.pos ?? null,
    grapplePos: (id) => view.grapples.find((g) => g.id === id)?.pos ?? null,
  };
}

/** Whole seconds until the local fighter is back, as the HUD counts them; null while they are up. */
export function respawnLeft(view: TeamView, localId: PlayerId): number | null {
  const status = view.players.find((p) => p.id === localId)?.status;
  return status?.kind === 'dead' ? Math.ceil(status.respawnAt - view.time) : null;
}

/** A tick each time the count goes down, but not when it first appears: the fall has its own sound. */
export const countdownTicks = (previous: number | null, next: number | null): boolean =>
  previous !== null && next !== null && next < previous && next > 0;

/** The shop's answers newer than `seen`, as sounds, and the newest answer now seen. */
export function purchaseSounds(seen: number, slots: Readonly<Partial<Record<string, SlotFeedback>>>): { readonly seq: number; readonly sounds: readonly SoundId[] } {
  const fresh = Object.values(slots)
    .filter((s): s is SlotFeedback => s !== undefined && s.seq > seen)
    .sort((a, b) => a.seq - b.seq);
  return { seq: fresh.at(-1)?.seq ?? seen, sounds: fresh.map((s) => (s.outcome === 'bought' ? 'purchase' : 'refused')) };
}
