import { createRoom, parseScene, reduce, SLOTS_PER_TEAM } from '@hookwars/room';
import type { MatchPlan, MemberId, RoomAction, RoomState, SceneChoice, SlotRef } from '@hookwars/room';
import type { TeamId } from '@hookwars/sim';
import type { SessionSetup } from '../game/session';

const SEED_RANGE = 2 ** 31;
/** Enough to max every upgrade several times over; anything above it is a typo. */
export const MAX_STARTING_GOLD = 100_000;
const WHOLE_NUMBER = /^\d+$/;
const ROSTER = /^([1-3])v([1-3])$/;
/** Any of these in the address skips the menu and the lobby, so tests and tuning open a match directly. */
const DIRECT_PARAMS = ['seed', 'opponent', 'gold', 'scene', 'intro', 'roster', 'fog'] as const;
/** Steps between the seeds of one match and the next, so a rematch is not a replay. */
const SEED_STRIDE = 7919;
const DUMMY_NAME = 'Dummy';
export const DIRECT_NAME = 'You';

/** Test and tuning switches; none of them can be set from the menu. */
export type Overrides = {
  /** Practice dummies stand still at their spawns in place of the east bots, which also gives tests fixed targets. */
  readonly idleOpponent: boolean;
  /** Null leaves the sim's default. */
  readonly startingGold: number | null;
};

export type Roster = Readonly<Record<TeamId, number>>;
/** `fog` comes from `?fog=on`. */
export type DirectMatch = { readonly roster: Roster; readonly scene: SceneChoice; readonly fog: boolean };

export type PageOptions = {
  readonly seed: number;
  /** Whether a match opens on its establishing shot; `?intro=off` turns it off. */
  readonly intro: boolean;
  readonly overrides: Overrides;
  /** Set when the address asks for a match at once instead of the menu. */
  readonly direct: DirectMatch | null;
};

function parseGold(raw: string | null): number | null {
  if (raw === null || !WHOLE_NUMBER.test(raw)) return null;
  return Math.min(MAX_STARTING_GOLD, Number(raw));
}

function parseRoster(raw: string | null): Roster {
  const match = raw === null ? null : ROSTER.exec(raw);
  return match === null ? { west: 1, east: 1 } : { west: Number(match[1]), east: Number(match[2]) };
}

export function pageOptionsFromQuery(search: string, now: number): PageOptions {
  const params = new URLSearchParams(search);
  const raw = params.get('seed');
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  const direct = DIRECT_PARAMS.some((name) => params.has(name));
  return {
    seed: Number.isFinite(parsed) ? parsed : Math.floor(now) % SEED_RANGE,
    intro: params.get('intro') !== 'off',
    overrides: { idleOpponent: params.get('opponent') === 'idle', startingGold: parseGold(params.get('gold')) },
    direct: direct ? { roster: parseRoster(params.get('roster')), scene: parseScene(params.get('scene')) ?? 'rotate', fog: params.get('fog') === 'on' } : null,
  };
}

/** A room already in play with the asked-for roster: the local player in the first west slot, bots everywhere else asked for. */
export function directRoom(direct: DirectMatch, member: MemberId): RoomState {
  const slots = (team: TeamId, count: number): readonly SlotRef[] =>
    Array.from({ length: Math.min(count, SLOTS_PER_TEAM) }, (_, index) => ({ team, index })).filter((ref) => !(ref.team === 'west' && ref.index === 0));
  const actions: readonly RoomAction[] = [
    { kind: 'join', by: member, name: DIRECT_NAME },
    ...[...slots('west', direct.roster.west), ...slots('east', direct.roster.east)].map((slot): RoomAction => ({ kind: 'addBot', by: member, slot })),
    { kind: 'setScene', by: member, scene: direct.scene },
    { kind: 'setFog', by: member, fog: direct.fog },
    { kind: 'startMatch', by: member },
  ];
  return actions.reduce(reduce, createRoom());
}

/** The seed for the room's latest match, so each rematch differs and the first one matches `seed` exactly. */
export function matchSeed(seed: number, matchesStarted: number): number {
  return seed + Math.max(0, matchesStarted - 1) * SEED_STRIDE;
}

/** What the session runs for the local member, with the test switches applied. Throws when the member has no seat. */
export function sessionSetupFor(plan: MatchPlan, member: MemberId, overrides: Overrides): SessionSetup {
  const local = plan.seats.find((s) => s.kind === 'human' && s.memberId === member);
  if (local === undefined) throw new Error('You no longer have a seat in this room.');
  const dummies = new Set(overrides.idleOpponent ? plan.seats.filter((s) => s.kind === 'bot' && s.slot.team === 'east').map((s) => s.playerId) : []);
  const players = plan.config.players.map((p) => (dummies.has(p.id) ? { ...p, name: DUMMY_NAME, isBot: false } : p));
  return {
    localPlayerId: local.playerId,
    config: { ...plan.config, players, ...(overrides.startingGold === null ? {} : { startingGold: overrides.startingGold }) },
    bots: plan.seats.flatMap((s) => (s.kind === 'bot' && !dummies.has(s.playerId) ? [{ id: s.playerId, seed: s.seed }] : [])),
  };
}
