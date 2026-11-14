import { TUNING } from '@hookbrawl/sim';
import type { GameState, Player, PlayerId, TeamId } from '@hookbrawl/sim';
import { grappleView, shopSlots, type GrappleView, type ShopSlotView, type SlotId, type PurchaseOutcome } from './shopView';

export type Named = { readonly name: string; readonly team: TeamId };

export type KillFeedEntry = {
  readonly key: string;
  readonly killer: Named;
  readonly victim: Named;
  readonly assisters: readonly Named[];
};

/** `seq` changes on every press, so the same outcome twice in a row still replays its flash. */
export type SlotFeedback = { readonly outcome: PurchaseOutcome; readonly seq: number };
export type Bounty = { readonly amount: number; readonly seq: number };

export type Feedback = {
  readonly slots: Readonly<Partial<Record<SlotId, SlotFeedback>>>;
  readonly bounty: Bounty | null;
  /** The latest purchase outcome in words, for the polite live region. */
  readonly announcement: string;
};

export const NO_FEEDBACK: Feedback = { slots: {}, bounty: null, announcement: '' };

export type LocalView = {
  readonly team: TeamId;
  readonly hp: number;
  readonly maxHp: number;
  /** 0 when the hook is ready, 1 right after it came back. */
  readonly cooldownFraction: number;
  readonly cooldownSeconds: number;
  readonly hookInFlight: boolean;
  /** Owns the barb, so the hook in hand catches on its way back too. */
  readonly hookBarbed: boolean;
  readonly respawnIn: number | null;
  readonly gold: number;
  readonly grapple: GrappleView;
};

export type ScoreRow = {
  readonly id: PlayerId;
  readonly name: string;
  readonly team: TeamId;
  readonly kills: number;
  readonly deaths: number;
  readonly assists: number;
  readonly isLocal: boolean;
};

export type EndView = { readonly winner: TeamId; readonly localWon: boolean; readonly rows: readonly ScoreRow[] };

export type HudView = {
  readonly score: Readonly<Record<TeamId, number>>;
  readonly killTarget: number;
  readonly local: LocalView | null;
  /** Empty when the local player is missing. */
  readonly shop: readonly ShopSlotView[];
  readonly feedback: Feedback;
  readonly killFeed: readonly KillFeedEntry[];
  readonly end: EndView | null;
};

export const KILL_FEED_SIZE = 4;

const named = (p: Player): Named => ({ name: p.name, team: p.team });

export function appendKills(feed: readonly KillFeedEntry[], state: GameState): readonly KillFeedEntry[] {
  const byId = (id: PlayerId): Player | undefined => state.players.find((p) => p.id === id);
  const fresh = state.events.flatMap((e): readonly KillFeedEntry[] => {
    if (e.kind !== 'kill') return [];
    const killer = byId(e.killerId);
    const victim = byId(e.victimId);
    if (killer === undefined || victim === undefined) return [];
    const assisters = e.assistIds.flatMap((id) => byId(id) ?? []).map(named);
    return [{ key: `${state.tick}-${e.killerId}-${e.victimId}`, killer: named(killer), victim: named(victim), assisters }];
  });
  // The store can be handed the same state more than once; a kill already listed must not be listed again.
  const seen = new Set(feed.map((entry) => entry.key));
  const unseen = fresh.filter((entry) => !seen.has(entry.key));
  return unseen.length === 0 ? feed : [...unseen.reverse(), ...feed].slice(0, KILL_FEED_SIZE);
}

const TENTHS = 10;

/** Rounds up, so the label reads 0.1s until the moment the action is ready and never a misleading 0.0s. */
export function cooldownLabel(seconds: number): string {
  return `${(Math.ceil(seconds * TENTHS) / TENTHS).toFixed(1)}s`;
}

function localView(state: GameState, me: Player): LocalView {
  const localId = me.id;
  const cooldownSeconds = Math.max(0, me.hookReadyAt - state.time);
  return {
    team: me.team,
    hp: me.hp,
    maxHp: TUNING.maxHp,
    cooldownSeconds,
    cooldownFraction: Math.min(1, cooldownSeconds / TUNING.hookCooldown),
    hookInFlight: state.hooks.some((h) => h.ownerId === localId),
    hookBarbed: me.items.barb.kind === 'owned',
    respawnIn: me.status.kind === 'dead' ? Math.max(0, me.status.respawnAt - state.time) : null,
    gold: me.gold,
    grapple: grappleView(state, me),
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
    assists: p.assists,
    isLocal: p.id === localId,
  }));
  const localTeam = state.players.find((p) => p.id === localId)?.team;
  return { winner, localWon: localTeam === winner, rows };
}

export function deriveHud(
  state: GameState,
  localId: PlayerId,
  killFeed: readonly KillFeedEntry[],
  feedback: Feedback = NO_FEEDBACK,
): HudView {
  const me = state.players.find((p) => p.id === localId);
  return {
    score: state.score,
    killTarget: state.killTarget,
    local: me === undefined ? null : localView(state, me),
    shop: me === undefined ? [] : shopSlots(me),
    feedback,
    killFeed,
    end: endView(state, localId),
  };
}
