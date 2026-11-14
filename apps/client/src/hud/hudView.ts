import { TUNING } from '@hookbrawl/sim';
import type { GameState, PlayerId, TeamId } from '@hookbrawl/sim';

export type KillFeedEntry = {
  readonly key: string;
  readonly killer: { readonly name: string; readonly team: TeamId };
  readonly victim: { readonly name: string; readonly team: TeamId };
};

export type LocalView = {
  readonly team: TeamId;
  readonly hp: number;
  readonly maxHp: number;
  /** 0 when the hook is ready, 1 right after it came back. */
  readonly cooldownFraction: number;
  readonly cooldownSeconds: number;
  readonly hookInFlight: boolean;
  readonly respawnIn: number | null;
};

export type ScoreRow = {
  readonly id: PlayerId;
  readonly name: string;
  readonly team: TeamId;
  readonly kills: number;
  readonly deaths: number;
  readonly isLocal: boolean;
};

export type EndView = { readonly winner: TeamId; readonly localWon: boolean; readonly rows: readonly ScoreRow[] };

export type HudView = {
  readonly score: Readonly<Record<TeamId, number>>;
  readonly killTarget: number;
  readonly local: LocalView | null;
  readonly killFeed: readonly KillFeedEntry[];
  readonly end: EndView | null;
};

export const KILL_FEED_SIZE = 4;

export function appendKills(feed: readonly KillFeedEntry[], state: GameState): readonly KillFeedEntry[] {
  const fresh = state.events.flatMap((e): readonly KillFeedEntry[] => {
    if (e.kind !== 'kill') return [];
    const killer = state.players.find((p) => p.id === e.killerId);
    const victim = state.players.find((p) => p.id === e.victimId);
    if (killer === undefined || victim === undefined) return [];
    return [
      {
        key: `${state.tick}-${e.killerId}-${e.victimId}`,
        killer: { name: killer.name, team: killer.team },
        victim: { name: victim.name, team: victim.team },
      },
    ];
  });
  return fresh.length === 0 ? feed : [...fresh.reverse(), ...feed].slice(0, KILL_FEED_SIZE);
}

function localView(state: GameState, localId: PlayerId): LocalView | null {
  const me = state.players.find((p) => p.id === localId);
  if (me === undefined) return null;
  const cooldownSeconds = Math.max(0, me.hookReadyAt - state.time);
  return {
    team: me.team,
    hp: me.hp,
    maxHp: TUNING.maxHp,
    cooldownSeconds,
    cooldownFraction: Math.min(1, cooldownSeconds / TUNING.hookCooldown),
    hookInFlight: state.hooks.some((h) => h.ownerId === localId),
    respawnIn: me.status.kind === 'dead' ? Math.max(0, me.status.respawnAt - state.time) : null,
  };
}

function endView(state: GameState, localId: PlayerId): EndView | null {
  if (state.phase.kind !== 'ended') return null;
  const winner = state.phase.winner;
  const rows = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team,
    kills: p.kills,
    deaths: p.deaths,
    isLocal: p.id === localId,
  }));
  const localTeam = state.players.find((p) => p.id === localId)?.team;
  return { winner, localWon: localTeam === winner, rows };
}

export function deriveHud(state: GameState, localId: PlayerId, killFeed: readonly KillFeedEntry[]): HudView {
  return {
    score: state.score,
    killTarget: state.killTarget,
    local: localView(state, localId),
    killFeed,
    end: endView(state, localId),
  };
}
