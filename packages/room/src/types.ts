import type { MatchConfig, PlayerId, TeamId } from '@hookwars/sim';

/** In rotation order: a room set to rotate plays them one match after another, starting with the first. */
export const SCENE_IDS = ['victoria', 'golden-gate', 'daan', 'harbour'] as const;
export type SceneId = (typeof SCENE_IDS)[number];
export type SceneChoice = SceneId | 'rotate';

export const KILL_TARGETS = [5, 10, 15, 20] as const;
export type KillTarget = (typeof KILL_TARGETS)[number];

export const TEAMS: readonly TeamId[] = ['west', 'east'];
export const SLOTS_PER_TEAM = 3;

/** Whoever is connected to the room: the local player now, a network connection once rooms are served. */
export type MemberId = string & { readonly __brand: 'MemberId' };
/** Trimmed, 1 to 16 characters, no control characters. Only `parseName` makes one. */
export type PlayerName = string & { readonly __brand: 'PlayerName' };

export type SlotRef = { readonly team: TeamId; readonly index: number };

export type Slot =
  | { readonly kind: 'empty' }
  | { readonly kind: 'human'; readonly memberId: MemberId; readonly name: PlayerName }
  | { readonly kind: 'bot' };

export type RoomSettings = {
  readonly scene: SceneChoice;
  readonly killTarget: KillTarget;
  /** Fog of war over the enemy: each side sees only what its own fighters can see. */
  readonly fog: boolean;
  /** Pickups drifting down the water for hooks to catch. */
  readonly pickups: boolean;
};

export const DEFAULT_SETTINGS: RoomSettings = { scene: 'rotate', killTarget: 10, fog: true, pickups: true };

export type RoomPhase = { readonly kind: 'lobby' } | { readonly kind: 'in-match' };

export type RoomState = {
  /** The member allowed to change bots and settings and to start; null in an empty room. */
  readonly host: MemberId | null;
  /** Each team has exactly `SLOTS_PER_TEAM` slots. */
  readonly slots: Readonly<Record<TeamId, readonly Slot[]>>;
  readonly settings: RoomSettings;
  readonly phase: RoomPhase;
  /** Counts every start, so a rotating room knows which scene is next. */
  readonly matchesStarted: number;
};

/** `by` is the member asking. A server stamps it from the connection, never from the payload. */
export type RoomAction =
  | { readonly kind: 'join'; readonly by: MemberId; readonly name: string }
  | { readonly kind: 'leave'; readonly by: MemberId }
  /** The host hands the room to another seated member. A server sends it for a host who has dropped. */
  | { readonly kind: 'passHost'; readonly by: MemberId; readonly to: MemberId }
  | { readonly kind: 'rename'; readonly by: MemberId; readonly name: string }
  | { readonly kind: 'moveTo'; readonly by: MemberId; readonly slot: SlotRef }
  | { readonly kind: 'addBot'; readonly by: MemberId; readonly slot: SlotRef }
  | { readonly kind: 'removeBot'; readonly by: MemberId; readonly slot: SlotRef }
  | { readonly kind: 'fillWithBots'; readonly by: MemberId }
  | { readonly kind: 'setScene'; readonly by: MemberId; readonly scene: string }
  | { readonly kind: 'setKillTarget'; readonly by: MemberId; readonly killTarget: number }
  | { readonly kind: 'setFog'; readonly by: MemberId; readonly fog: boolean }
  | { readonly kind: 'setPickups'; readonly by: MemberId; readonly pickups: boolean }
  | { readonly kind: 'startMatch'; readonly by: MemberId }
  | { readonly kind: 'endMatch'; readonly by: MemberId };

export type Seat =
  | { readonly kind: 'human'; readonly playerId: PlayerId; readonly slot: SlotRef; readonly memberId: MemberId }
  | { readonly kind: 'bot'; readonly playerId: PlayerId; readonly slot: SlotRef; readonly seed: number };

/** Everything a match needs from the room: the sim's config, the scene it is played in, and who drives each fighter. */
export type MatchPlan = {
  readonly config: MatchConfig;
  readonly scene: SceneId;
  readonly seats: readonly Seat[];
};
