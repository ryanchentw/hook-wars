export type Vec2 = { readonly x: number; readonly y: number };

export type TeamId = 'west' | 'east';

export type PlayerId = string & { readonly __brand: 'PlayerId' };
export type HookId = string & { readonly __brand: 'HookId' };

export type PlayerStatus =
  | { readonly kind: 'alive' }
  | { readonly kind: 'dragged'; readonly hookId: HookId }
  | { readonly kind: 'dead'; readonly respawnAt: number };

export type Player = {
  readonly id: PlayerId;
  readonly name: string;
  readonly team: TeamId;
  readonly isBot: boolean;
  readonly spawnIndex: number;
  readonly pos: Vec2;
  /** Radians, 0 points along +x. */
  readonly facing: number;
  readonly moveTarget: Vec2 | null;
  readonly hp: number;
  readonly status: PlayerStatus;
  /** Sim time at which the next hook may be cast. */
  readonly hookReadyAt: number;
  readonly meleeReadyAt: number;
  readonly kills: number;
  readonly deaths: number;
};

export type HookPhase =
  | { readonly kind: 'extending'; readonly remaining: number }
  | { readonly kind: 'retracting'; readonly cargo: PlayerId | null };

export type Hook = {
  readonly id: HookId;
  readonly ownerId: PlayerId;
  readonly pos: Vec2;
  /** Unit vector. Only meaningful while extending. */
  readonly dir: Vec2;
  /** Cast origin followed by every bounce point, so the chain can be drawn as a polyline. */
  readonly path: readonly Vec2[];
  readonly phase: HookPhase;
};

export type Rect = {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
};

export type Arena = {
  readonly width: number;
  readonly height: number;
  /** Vertical strip nobody can walk on. Everything left of it is the west dock, right of it the east dock. */
  readonly canal: { readonly x0: number; readonly x1: number };
  /** Hooks reflect off it. */
  readonly buoy: { readonly pos: Vec2; readonly radius: number };
  readonly spawns: Readonly<Record<TeamId, readonly Vec2[]>>;
};

export type MatchPhase =
  | { readonly kind: 'playing' }
  | { readonly kind: 'ended'; readonly winner: TeamId };

export type GameEvent =
  | { readonly kind: 'hookCast'; readonly hookId: HookId; readonly ownerId: PlayerId }
  | { readonly kind: 'hookBounce'; readonly hookId: HookId; readonly at: Vec2 }
  | {
      readonly kind: 'hookHit';
      readonly hookId: HookId;
      readonly ownerId: PlayerId;
      readonly targetId: PlayerId;
      readonly damage: number;
      readonly ally: boolean;
      readonly at: Vec2;
    }
  | {
      readonly kind: 'melee';
      readonly attackerId: PlayerId;
      readonly targetId: PlayerId;
      readonly damage: number;
      readonly at: Vec2;
    }
  | { readonly kind: 'kill'; readonly killerId: PlayerId; readonly victimId: PlayerId; readonly at: Vec2 }
  | { readonly kind: 'respawn'; readonly playerId: PlayerId }
  | { readonly kind: 'matchEnd'; readonly winner: TeamId };

export type GameState = {
  readonly tick: number;
  /** Seconds since match start. */
  readonly time: number;
  readonly arena: Arena;
  readonly players: readonly Player[];
  readonly hooks: readonly Hook[];
  readonly score: Readonly<Record<TeamId, number>>;
  readonly killTarget: number;
  readonly phase: MatchPhase;
  readonly nextHookSeq: number;
  /** Events produced by the step that returned this state. Replaced, not accumulated. */
  readonly events: readonly GameEvent[];
};

export type PlayerInput =
  | { readonly kind: 'move'; readonly playerId: PlayerId; readonly target: Vec2 }
  | { readonly kind: 'stop'; readonly playerId: PlayerId }
  /** `target` is the aim point. The hook flies from the player towards it. */
  | { readonly kind: 'hook'; readonly playerId: PlayerId; readonly target: Vec2 };

export type MatchPlayerConfig = {
  readonly id: PlayerId;
  readonly name: string;
  readonly team: TeamId;
  readonly isBot: boolean;
};

export type MatchConfig = {
  readonly players: readonly MatchPlayerConfig[];
  readonly killTarget: number;
  readonly arena?: Arena;
};

/** Opaque seeded-RNG state. Advance it with `nextRandom`. */
export type Rng = { readonly seed: number };

export type BotBrain = {
  readonly rng: Rng;
  readonly nextThinkAt: number;
};
