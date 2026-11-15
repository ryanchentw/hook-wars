import type { Act, ChatLine, ErrorCode, ServerMessage } from '@hookwars/protocol';
import type { MemberId, PlayerName, RoomState, SceneId } from '@hookwars/room';
import type { BotBrain, GameState, PlayerId, SeenEvent, TeamId, Vec2 } from '@hookwars/sim';

/** The timings and sizes a room runs by. All of them come from the server's configuration. */
export type RoomRules = {
  readonly tickMs: number;
  readonly snapshotHz: number;
  /** How long a dropped member keeps their seat, gold and items. */
  readonly rejoinWindowMs: number;
  /** How long a room nobody is in is kept, so a link opened a moment late still finds it. */
  readonly emptyRoomGraceMs: number;
  /** From "start" to the first tick: time for every client to draw the scene. */
  readonly countdownMs: number;
  /** Ticks run at once after a stall; the rest are dropped, so a slow machine slows the match instead of spiralling. */
  readonly maxCatchUpTicks: number;
  /** Inputs held back for the ticks to come. More smooths a jittery line, and delays every press by a tick each. */
  readonly inputBufferMax: number;
  /** Inputs kept for a fighter between two ticks, whatever arrives. */
  readonly inputQueueMax: number;
};

export type Member = {
  readonly id: MemberId;
  /** Proves the seat is theirs on reconnect. */
  readonly token: string;
  readonly name: PlayerName;
  /** When their connection dropped, or null while it is up. */
  readonly awaySince: number | null;
};

export type QueuedInput = { readonly seq: number; readonly steer: Vec2; readonly acts: readonly Act[] };

export type Fighter = {
  readonly id: PlayerId;
  readonly team: TeamId;
  /** The member whose fighter this is; null for a bot's, and for one whose member has gone for good. */
  readonly owner: MemberId | null;
  /** Every fighter has one, so a bot can take over the tick its member drops. */
  readonly brain: BotBrain;
  readonly queue: readonly QueuedInput[];
  /** The last input applied, echoed in every snapshot so the client knows what to replay. */
  readonly ack: number;
  /** Who drove it last tick: a member taking it back from a bot first stops whatever walk the bot left it on. */
  readonly drivenBy: 'member' | 'bot';
};

export type MatchRun = {
  readonly id: number;
  readonly scene: SceneId;
  readonly state: GameState;
  readonly fighters: readonly Fighter[];
  /** Tick `n` is due at `startAt + n * tickMs`, counted from here and never from the last tick, so the clock cannot drift. */
  readonly startAt: number;
  readonly ticksRun: number;
  /** What each team has seen happen since its last snapshot. */
  readonly pending: Readonly<Record<TeamId, readonly SeenEvent[]>>;
  /** Snapshots owed, counted in whole units of `snapshotHz` per tick so it never rounds: one is sent each time it reaches the tick rate. */
  readonly snapshotDebt: number;
};

export type Room = {
  readonly code: string;
  readonly lobby: RoomState;
  readonly members: readonly Member[];
  readonly match: MatchRun | null;
  readonly nextMemberSeq: number;
  /** Since when the room has had no members at all. */
  readonly emptySince: number | null;
  /** The last few lines said, kept only for a member who drops and comes back. */
  readonly chat: readonly ChatLine[];
  readonly nextChatSeq: number;
};

export type Outbound =
  | { readonly kind: 'send'; readonly to: MemberId; readonly message: ServerMessage }
  /** Tells the member why, then closes their connection. */
  | { readonly kind: 'drop'; readonly member: MemberId; readonly code: ErrorCode };

export type Step = { readonly room: Room; readonly out: readonly Outbound[] };

/** Everything random a room needs, handed in so a test can say what it gets. */
export type Entropy = { token(): string; seed(): number };
