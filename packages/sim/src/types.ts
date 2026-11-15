export type Vec2 = { readonly x: number; readonly y: number };

export type TeamId = 'west' | 'east';

export type PlayerId = string & { readonly __brand: 'PlayerId' };
export type HookId = string & { readonly __brand: 'HookId' };
export type GrappleId = string & { readonly __brand: 'GrappleId' };
export type PickupId = string & { readonly __brand: 'PickupId' };

export type UpgradeId = 'damage' | 'range' | 'speed' | 'size';
/** Used on its own key, then cools down. */
export type ActiveItemId = 'grapple';
/** Always on once bought: no key, no cooldown. */
export type PassiveItemId = 'barb';
export type ItemId = ActiveItemId | PassiveItemId;
/** `readyAt` is the sim time at which an owned item may be used again. */
export type ActiveItemState = { readonly kind: 'unowned' } | { readonly kind: 'owned'; readonly readyAt: number };
export type PassiveItemState = { readonly kind: 'unowned' } | { readonly kind: 'owned' };
export type Items = { readonly [K in ActiveItemId]: ActiveItemState } & { readonly [K in PassiveItemId]: PassiveItemState };
export type Purchase = { readonly kind: 'upgrade'; readonly id: UpgradeId } | { readonly kind: 'item'; readonly id: ItemId };

export type HookStats = {
  readonly damage: number;
  readonly range: number;
  readonly speed: number;
  readonly retractSpeed: number;
  readonly radius: number;
  /** An empty hook on its way back catches the first enemy on its line. */
  readonly barbed: boolean;
};

export type PlayerStatus =
  | { readonly kind: 'alive' }
  | { readonly kind: 'dragged'; readonly hookId: HookId }
  | { readonly kind: 'grappling'; readonly grappleId: GrappleId }
  /** Just set down by a hook or a grapple: on their feet and hittable, but unable to act until `until`. */
  | { readonly kind: 'staggered'; readonly until: number }
  | { readonly kind: 'dead'; readonly respawnAt: number };

/** What a pickup does once it reaches the hand of whoever hooked it. */
export type PickupKind = 'gold' | 'gale' | 'storm';
/** A timed effect on a fighter. Gale on its collector, Storm on each enemy of the collector's team. */
export type EffectKind = 'gale' | 'storm';
/** `source` is the collector who caused it; `since` and `until` are sim times. */
export type Effect = { readonly kind: EffectKind; readonly source: PlayerId; readonly since: number; readonly until: number };

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
  /** A computer drives this fighter right now: a bot, or a stand-in for a member who dropped. */
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
  /** Every coin paid to this fighter this match, starting gold included; spending never lowers it. */
  readonly earned: number;
  /** Levels bought, starting at 0. */
  readonly upgrades: Readonly<Record<UpgradeId, number>>;
  readonly items: Items;
  /** The latest damage from each enemy inside the assist window. Emptied on death. */
  readonly recentDamage: readonly { readonly from: PlayerId; readonly at: number }[];
  /** At most one of each kind. Present means in force: the step that reaches `until` removes it. Emptied on death. */
  readonly effects: readonly Effect[];
};

/** What a hook can latch and carry home: one fighter or one pickup. */
export type Cargo = { readonly kind: 'fighter'; readonly id: PlayerId } | { readonly kind: 'pickup'; readonly id: PickupId };

export type HookPhase =
  | { readonly kind: 'extending'; readonly remaining: number }
  | { readonly kind: 'retracting'; readonly cargo: Cargo | null };

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

/** The two ends of the strip of water; a pickup enters at one and drifts to the other. */
export type RiverEnd = 'north' | 'south';

export type PickupState = { readonly kind: 'drifting' } | { readonly kind: 'carried'; readonly hookId: HookId };

/** Something floating down the water that a hook can catch and bring home. */
export type Pickup = {
  readonly id: PickupId;
  readonly kind: PickupKind;
  readonly pos: Vec2;
  /** The end it entered at; it drifts toward the other. */
  readonly from: RiverEnd;
  /** The x it floats at, away from the buoy; around the buoy the water carries it aside. */
  readonly lane: number;
  readonly state: PickupState;
};

/** When and what the water sends next. Null on a match played without pickups. */
export type River = { readonly rng: Rng; readonly nextAt: number };

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
  | {
      readonly kind: 'pickupCaught';
      readonly pickupId: PickupId;
      readonly pickupKind: PickupKind;
      readonly hookId: HookId;
      readonly ownerId: PlayerId;
      readonly at: Vec2;
    }
  /** No position: everyone hears of it, wherever the collector stands. `gold` is what it paid, 0 for an effect. */
  | { readonly kind: 'pickupCollected'; readonly pickupId: PickupId; readonly pickupKind: PickupKind; readonly playerId: PlayerId; readonly gold: number }
  /** One pulse of Storm damage on one fighter. */
  | { readonly kind: 'storm'; readonly sourceId: PlayerId; readonly targetId: PlayerId; readonly damage: number; readonly at: Vec2 }
  | { readonly kind: 'matchEnd'; readonly winner: TeamId };

/** Open: everyone sees everything. Fog: a team sees only what is inside `radius` of one of its living fighters. */
export type Vision = { readonly kind: 'open' } | { readonly kind: 'fog'; readonly radius: number };

export type GameState = {
  readonly tick: number;
  /** Seconds since match start. */
  readonly time: number;
  readonly arena: Arena;
  readonly players: readonly Player[];
  readonly hooks: readonly Hook[];
  readonly grapples: readonly Grapple[];
  readonly pickups: readonly Pickup[];
  readonly river: River | null;
  readonly score: Readonly<Record<TeamId, number>>;
  readonly killTarget: number;
  readonly vision: Vision;
  readonly phase: MatchPhase;
  readonly nextHookSeq: number;
  readonly nextGrappleSeq: number;
  readonly nextPickupSeq: number;
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
  /** A computer drives this fighter from the start. */
  readonly isBot: boolean;
};

export type MatchConfig = {
  readonly players: readonly MatchPlayerConfig[];
  readonly killTarget: number;
  readonly arena?: Arena;
  /** Defaults to `ECONOMY.startingGold`. */
  readonly startingGold?: number;
  /** Fog of war over the enemy, at `VISION.radius`. Off by default. */
  readonly fog?: boolean;
  /** Pickups drifting down the water. Off by default. */
  readonly pickups?: boolean;
  /** Seeds what the water sends: which end, which kind, which lane. Defaults to 0. */
  readonly seed?: number;
};

/** Opaque seeded-RNG state. Advance it with `nextRandom`. */
export type Rng = { readonly seed: number };

export type BotBrain = {
  readonly rng: Rng;
  readonly nextThinkAt: number;
};

/** A fighter as a team sees them: an enemy's purse is null under fog. */
export type SeenPlayer = Omit<Player, 'gold'> & { readonly gold: number | null };

/** What every team knows about every fighter, seen or not. */
export type PlayerCard = {
  readonly id: PlayerId;
  readonly name: string;
  readonly team: TeamId;
  /** A computer drives this fighter right now: a bot, or a stand-in for a member who dropped. */
  readonly isBot: boolean;
  readonly kills: number;
  readonly deaths: number;
  readonly assists: number;
  /** Shown under fog too: it follows from kills, assists and the clock, which every team sees. */
  readonly earned: number;
};

/** `ropeFrom` is where the visible rope starts when its owner is out of sight; null runs it from the owner's hand. */
export type SeenGrapple = Grapple & { readonly ropeFrom: Vec2 | null };

type KillEvent = Extract<GameEvent, { readonly kind: 'kill' }>;
/** A kill is always news, but where it happened is not when the victim lay out of sight. */
export type SeenEvent = Exclude<GameEvent, KillEvent> | (Omit<KillEvent, 'at'> & { readonly at: Vec2 | null });

/**
 * Everything one team is entitled to know about a match: all a client needs to draw a frame, and nothing more.
 * A hook's `path` starts where its chain comes into sight: at the owner when the owner is seen, else at the edge of vision.
 */
export type TeamView = {
  readonly viewer: TeamId;
  readonly tick: number;
  readonly time: number;
  readonly arena: Arena;
  readonly vision: Vision;
  readonly score: Readonly<Record<TeamId, number>>;
  readonly killTarget: number;
  readonly phase: MatchPhase;
  /** Only the fighters this team sees, in match order. */
  readonly players: readonly SeenPlayer[];
  /** Every fighter, in match order. */
  readonly roster: readonly PlayerCard[];
  readonly hooks: readonly Hook[];
  readonly grapples: readonly SeenGrapple[];
  /** Only the pickups this team sees: in its vision, or on a hook it sees. */
  readonly pickups: readonly Pickup[];
  readonly events: readonly SeenEvent[];
};
