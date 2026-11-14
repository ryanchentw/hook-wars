import { TICK_DT } from '@hookbrawl/sim';
import type { BotBrain, GameState, MatchConfig, PlayerId, PlayerInput, TeamId, TeamView, Vec2 } from '@hookbrawl/sim';

/** The slice of `@hookbrawl/sim` a session needs, injectable so tests can use a fake stepper. */
export type SimApi = {
  readonly createMatch: (config: MatchConfig) => GameState;
  readonly step: (state: GameState, inputs: readonly PlayerInput[], dt: number) => GameState;
  readonly createBotBrain: (seed: number) => BotBrain;
  readonly botThink: (
    state: GameState,
    botId: PlayerId,
    brain: BotBrain,
  ) => { readonly inputs: readonly PlayerInput[]; readonly brain: BotBrain };
  readonly viewFor: (state: GameState, team: TeamId) => TeamView;
};

export type BotSeat = { readonly id: PlayerId; readonly seed: number };

export type SessionSetup = {
  readonly config: MatchConfig;
  readonly localPlayerId: PlayerId;
  /** The fighters a bot drives here, each with its own seed. */
  readonly bots: readonly BotSeat[];
};

export type SessionOptions = {
  /** Ticks run per `advance` call at most; excess time is dropped so a stalled tab does not spiral. */
  readonly maxTicksPerAdvance?: number;
};

/** Two ticks of the local team's view, and how far real time has run from the first towards the second. */
export type Frame = { readonly previous: TeamView; readonly current: TeamView; readonly alpha: number };

/** Called once per sim tick with the local team's view. */
export type SessionListener = (view: TeamView) => void;

export type Session = {
  readonly localPlayerId: PlayerId;
  readonly localTeam: TeamId;
  advance(realSeconds: number): void;
  /** Drops inputs sent while paused, since game controls are off then. */
  queueInput(input: PlayerInput): void;
  /** Level-triggered: the latest held direction reaches the sim at the next tick that runs, once per change. */
  setSteer(dir: Vec2): void;
  /** While paused, real time is discarded rather than banked, so resuming never fast-forwards. */
  setPaused(paused: boolean): void;
  frame(): Frame;
  /** What the local team is entitled to see: everything that draws or shows the match reads this, never the state. */
  getView(): TeamView;
  /** The whole match, as only the authority may know it: for the dev hook, and nothing that draws. */
  getState(): GameState;
  subscribe(listener: SessionListener): () => void;
};

/** The part of a session the picture and the HUD may touch, so neither can reach past the local team's view. */
export type SessionView = Pick<Session, 'localPlayerId' | 'localTeam' | 'advance' | 'frame' | 'getView' | 'subscribe' | 'queueInput'>;

type Bot = { readonly id: PlayerId; readonly brain: BotBrain };

const DEFAULT_MAX_TICKS = 5;
const STILL: Vec2 = { x: 0, y: 0 };
// Absorbs float drift so e.g. 3 x (1/30) s of real time yields exactly 3 ticks.
const TICK_EPSILON = 1e-9;

/** One match, ticked from real time. A new match is a new session. */
export function createSession(sim: SimApi, setup: SessionSetup, options: SessionOptions = {}): Session {
  const maxTicks = options.maxTicksPerAdvance ?? DEFAULT_MAX_TICKS;
  const listeners = new Set<SessionListener>();
  const localTeam = setup.config.players.find((p) => p.id === setup.localPlayerId)?.team;
  if (localTeam === undefined) throw new Error(`Player ${setup.localPlayerId} is not in this match.`);
  let current = sim.createMatch(setup.config);
  let view = sim.viewFor(current, localTeam);
  let previous = view;
  let bots: readonly Bot[] = setup.bots.map((b) => ({ id: b.id, brain: sim.createBotBrain(b.seed) }));
  let queued: readonly PlayerInput[] = [];
  let accumulator = 0;
  let paused = false;
  let desiredSteer = STILL;
  let sentSteer = STILL;

  const thinkBots = (): readonly PlayerInput[] => {
    const results = bots.map((bot) => ({ id: bot.id, ...sim.botThink(current, bot.id, bot.brain) }));
    bots = results.map((r) => ({ id: r.id, brain: r.brain }));
    return results.flatMap((r) => r.inputs);
  };

  const takeSteer = (): readonly PlayerInput[] => {
    if (desiredSteer.x === sentSteer.x && desiredSteer.y === sentSteer.y) return [];
    sentSteer = desiredSteer;
    return [{ kind: 'steer', playerId: setup.localPlayerId, dir: desiredSteer }];
  };

  const tick = (): void => {
    previous = view;
    if (current.phase.kind === 'ended') return;
    const inputs = [...takeSteer(), ...queued, ...thinkBots()];
    queued = [];
    current = sim.step(current, inputs, TICK_DT);
    view = sim.viewFor(current, localTeam);
    listeners.forEach((listener) => listener(view));
  };

  return {
    localPlayerId: setup.localPlayerId,
    localTeam,
    advance(realSeconds) {
      if (paused || !(realSeconds > 0)) return;
      accumulator += realSeconds;
      let ran = 0;
      while (accumulator + TICK_EPSILON >= TICK_DT && ran < maxTicks) {
        tick();
        accumulator = Math.max(0, accumulator - TICK_DT);
        ran += 1;
      }
      if (accumulator + TICK_EPSILON >= TICK_DT) accumulator = 0;
    },
    queueInput(input) {
      if (paused) return;
      queued = [...queued, input];
    },
    setSteer(dir) {
      desiredSteer = dir;
    },
    setPaused(next) {
      paused = next;
    },
    frame() {
      return { previous, current: view, alpha: Math.min(1, accumulator / TICK_DT) };
    },
    getView() {
      return view;
    },
    getState() {
      return current;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
