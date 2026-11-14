export type Vec2 = { readonly x: number; readonly y: number };

export type TeamId = 'west' | 'east';

export type PlayerId = string & { readonly __brand: 'PlayerId' };
export type HookId = string & { readonly __brand: 'HookId' };
export type GrappleId = string & { readonly __brand: 'GrappleId' };

export type UpgradeId = 'damage' | 'range' | 'speed' | 'size';
export type ItemId = 'grapple';
/** `readyAt` is the sim time at which an owned item may be used again. */
export type ItemState = { readonly kind: 'unowned' } | { readonly kind: 'owned'; readonly readyAt: number };
export type Purchase = { readonly kind: 'upgrade'; readonly id: UpgradeId } | { readonly kind: 'item'; readonly id: ItemId };

export type HookStats = {
  readonly damage: number;
  readonly range: number;
  readonly speed: number;
  readonly retractSpeed: number;
  readonly radius: number;
};

export type PlayerStatus =
  | { readonly kind: 'alive' }
  | { readonly kind: 'dragged'; readonly hookId: HookId }
  | { readonly kind: 'grappling'; readonly grappleId: GrappleId }
  | { readonly kind: 'dead'; readonly respawnAt: number };

export type MoveIntent =
  | { readonly kind: 'idle' }
  /** Walk to a point, then idle. */
  | { readonly kind: 'toward'; readonly target: Vec2 }
  /** Unit vector. Walk until told otherwise, as long as a key is held. */
  | { readonly kind: 'steer'; readonly dir: Vec2 };

export type Player = {
  readonly id: PlayerId;
  readonly name: string;
  readonly team: TeamId;
  readonly isBot: boolean;
  readonly spawnIndex: number;
  readonly pos: Vec2;
  /** Radians, 0 points along +x. */
  readonly facing: number;
  readonly move: MoveIntent;
  readonly hp: number;
  readonly status: PlayerStatus;
  /** Sim time at which the next hook may be cast. */
  readonly hookReadyAt: number;
  readonly meleeReadyAt: number;
  readonly kills: number;
  readonly deaths: number;
  readonly assists: number;
  /** Always an integer. */
  readonly gold: number;
  /** Levels bought, starting at 0. */
  readonly upgrades: Readonly<Record<UpgradeId, number>>;
  readonly items: Readonly<Record<ItemId, ItemState>>;
  /** The latest damage from each enemy inside the assist window. Emptied on death. */
  readonly recentDamage: readonly { readonly from: PlayerId; readonly at: number }[];
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
  /** The owner's stats when the hook was cast, so a purchase mid-flight changes nothing in the air. */
  readonly stats: HookStats;
};

/** The head flies to the anchor, then hauls its owner there in a straight line. */
export type GrapplePhase = { readonly kind: 'flying' } | { readonly kind: 'pulling' };

export type Grapple = {
  readonly id: GrappleId;
  readonly ownerId: PlayerId;
  /** Where the head is. */
  readonly pos: Vec2;
  /** A walkable dock point; where the owner ends up. */
  readonly anchor: Vec2;
  readonly phase: GrapplePhase;
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
  | {
      readonly kind: 'kill';
      readonly killerId: PlayerId;
      readonly victimId: PlayerId;
      /** Every other enemy of the victim who damaged them inside the assist window. */
      readonly assistIds: readonly PlayerId[];
      readonly at: Vec2;
    }
  | { readonly kind: 'purchase'; readonly playerId: PlayerId; readonly purchase: Purchase; readonly cost: number }
  | { readonly kind: 'grappleCast'; readonly grappleId: GrappleId; readonly ownerId: PlayerId }
  | { readonly kind: 'grappleLand'; readonly grappleId: GrappleId; readonly at: Vec2 }
  | { readonly kind: 'grappleArrive'; readonly playerId: PlayerId; readonly at: Vec2 }
  | { readonly kind: 'respawn'; readonly playerId: PlayerId }
  | { readonly kind: 'matchEnd'; readonly winner: TeamId };

export type GameState = {
  readonly tick: number;
  /** Seconds since match start. */
  readonly time: number;
  readonly arena: Arena;
  readonly players: readonly Player[];
  readonly hooks: readonly Hook[];
  readonly grapples: readonly Grapple[];
  readonly score: Readonly<Record<TeamId, number>>;
  readonly killTarget: number;
  readonly phase: MatchPhase;
  readonly nextHookSeq: number;
  readonly nextGrappleSeq: number;
  /** Events produced by the step that returned this state. Replaced, not accumulated. */
  readonly events: readonly GameEvent[];
};

export type PlayerInput =
  | { readonly kind: 'move'; readonly playerId: PlayerId; readonly target: Vec2 }
  | { readonly kind: 'stop'; readonly playerId: PlayerId }
  /** Held movement keys. Accepted in any status; the sim normalizes `dir`, and a zero or non-finite one means stop. */
  | { readonly kind: 'steer'; readonly playerId: PlayerId; readonly dir: Vec2 }
  /** `target` is the aim point. The hook flies from the player towards it. */
  | { readonly kind: 'hook'; readonly playerId: PlayerId; readonly target: Vec2 }
  /** Accepted in any status, dead included. An unaffordable or unavailable purchase is ignored. */
  | { readonly kind: 'buy'; readonly playerId: PlayerId; readonly purchase: Purchase }
  /** `target` is the aim point. The anchor lands toward it, at most `GRAPPLE.range` away, on the nearest dock. */
  | { readonly kind: 'grapple'; readonly playerId: PlayerId; readonly target: Vec2 };

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
  /** Defaults to `ECONOMY.startingGold`. */
  readonly startingGold?: number;
};

/** Opaque seeded-RNG state. Advance it with `nextRandom`. */
export type Rng = { readonly seed: number };

export type BotBrain = {
  readonly rng: Rng;
  readonly nextThinkAt: number;
};
