import { TICK_DT } from '@hookbrawl/sim';
import type { BotBrain, GameState, MatchConfig, PlayerId, PlayerInput } from '@hookbrawl/sim';

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
};

export type SessionSetup = {
  readonly config: MatchConfig;
  readonly localPlayerId: PlayerId;
  readonly botSeed: number;
};

export type SessionOptions = {
  /** Ticks run per `advance` call at most; excess time is dropped so a stalled tab does not spiral. */
  readonly maxTicksPerAdvance?: number;
};

export type Frame = { readonly previous: GameState; readonly current: GameState; readonly alpha: number };

export type SessionChange = 'tick' | 'reset';
export type SessionListener = (state: GameState, change: SessionChange) => void;

export type Session = {
  readonly localPlayerId: PlayerId;
  advance(realSeconds: number): void;
  queueInput(input: PlayerInput): void;
  frame(): Frame;
  getState(): GameState;
  subscribe(listener: SessionListener): () => void;
  restart(): void;
};

type Bot = { readonly id: PlayerId; readonly brain: BotBrain };

const DEFAULT_MAX_TICKS = 5;
// Absorbs float drift so e.g. 3 x (1/30) s of real time yields exactly 3 ticks.
const TICK_EPSILON = 1e-9;

export function createSession(sim: SimApi, setup: SessionSetup, options: SessionOptions = {}): Session {
  const maxTicks = options.maxTicksPerAdvance ?? DEFAULT_MAX_TICKS;
  const listeners = new Set<SessionListener>();
  let matchIndex = 0;
  let current = sim.createMatch(setup.config);
  let previous = current;
  let bots = createBots(sim, setup, matchIndex);
  let queued: readonly PlayerInput[] = [];
  let accumulator = 0;

  const emit = (change: SessionChange): void => {
    listeners.forEach((listener) => listener(current, change));
  };

  const thinkBots = (): readonly PlayerInput[] => {
    const results = bots.map((bot) => ({ id: bot.id, ...sim.botThink(current, bot.id, bot.brain) }));
    bots = results.map((r) => ({ id: r.id, brain: r.brain }));
    return results.flatMap((r) => r.inputs);
  };

  const tick = (): void => {
    previous = current;
    if (current.phase.kind === 'ended') return;
    const inputs = [...queued, ...thinkBots()];
    queued = [];
    current = sim.step(current, inputs, TICK_DT);
    emit('tick');
  };

  return {
    localPlayerId: setup.localPlayerId,
    advance(realSeconds) {
      if (!(realSeconds > 0)) return;
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
      queued = [...queued, input];
    },
    frame() {
      return { previous, current, alpha: Math.min(1, accumulator / TICK_DT) };
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
    restart() {
      matchIndex += 1;
      current = sim.createMatch(setup.config);
      previous = current;
      bots = createBots(sim, setup, matchIndex);
      queued = [];
      accumulator = 0;
      emit('reset');
    },
  };
}

function createBots(sim: SimApi, setup: SessionSetup, matchIndex: number): readonly Bot[] {
  return setup.config.players
    .filter((p) => p.isBot)
    .map((p, i) => ({ id: p.id, brain: sim.createBotBrain(setup.botSeed + matchIndex * 7919 + i) }));
}
