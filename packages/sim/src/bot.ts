import { dockAt, walkableRect } from './arena';
import { TUNING } from './config';
import { add, distance, normalize, rotate, scale, sub } from './geometry';
import { createRng, nextRandom } from './rng';
import type { BotBrain, GameState, Player, PlayerId, PlayerInput, Rng, Vec2 } from './types';
import { findPlayer, isAlive, ownsHook } from './world';

type Decision = { readonly inputs: readonly PlayerInput[]; readonly rng: Rng };

/** Throws only at targets the hook can still reach after some sideways drift. */
const THROW_REACH = TUNING.hookRange * 0.95;

export function createBotBrain(seed: number): BotBrain {
  return { rng: createRng(seed), nextThinkAt: 0 };
}

function nearest(from: Vec2, candidates: readonly Player[]): Player | null {
  return candidates.reduce<Player | null>(
    (best, p) => (!best || distance(from, p.pos) < distance(from, best.pos) ? p : best),
    null,
  );
}

function enemies(state: GameState, bot: Player): Player[] {
  return state.players.filter((p) => p.team !== bot.team);
}

function chooseMove(state: GameState, bot: Player, rng: Rng): Decision {
  const dock = dockAt(state.arena, bot.pos);
  const prey = nearest(
    bot.pos,
    enemies(state, bot).filter(
      (p) =>
        p.status.kind !== 'dead' &&
        dockAt(state.arena, p.pos) === dock &&
        distance(bot.pos, p.pos) <= TUNING.botChaseRange,
    ),
  );
  if (prey) return { inputs: [{ kind: 'move', playerId: bot.id, target: prey.pos }], rng };
  if (bot.moveTarget !== null) return { inputs: [], rng };
  const rect = walkableRect(state.arena, dock);
  const [u, afterU] = nextRandom(rng);
  const [v, afterV] = nextRandom(afterU);
  const target = { x: rect.x0 + u * (rect.x1 - rect.x0), y: rect.y0 + v * (rect.y1 - rect.y0) };
  return { inputs: [{ kind: 'move', playerId: bot.id, target }], rng: afterV };
}

function velocity(p: Player): Vec2 {
  if (p.moveTarget === null) return { x: 0, y: 0 };
  return scale(normalize(sub(p.moveTarget, p.pos)), TUNING.moveSpeed);
}

function chooseThrow(state: GameState, bot: Player, rng: Rng): Decision {
  const canCast = state.time >= bot.hookReadyAt && !ownsHook(state, bot.id);
  const target = nearest(bot.pos, enemies(state, bot).filter(isAlive));
  if (!canCast || !target || distance(bot.pos, target.pos) > THROW_REACH) return { inputs: [], rng };
  const [roll, afterRoll] = nextRandom(rng);
  if (roll >= TUNING.botFireChance) return { inputs: [], rng: afterRoll };
  const [noise, afterNoise] = nextRandom(afterRoll);
  const lead = add(target.pos, scale(velocity(target), distance(bot.pos, target.pos) / TUNING.hookSpeed));
  const angle = (noise * 2 - 1) * TUNING.botAimNoise;
  const aim = add(bot.pos, rotate(sub(lead, bot.pos), angle));
  return { inputs: [{ kind: 'hook', playerId: bot.id, target: aim }], rng: afterNoise };
}

export function botThink(
  state: GameState,
  botId: PlayerId,
  brain: BotBrain,
): { readonly inputs: readonly PlayerInput[]; readonly brain: BotBrain } {
  const bot = findPlayer(state, botId);
  if (!bot || !isAlive(bot) || state.time < brain.nextThinkAt) return { inputs: [], brain };
  const move = chooseMove(state, bot, brain.rng);
  const thrown = chooseThrow(state, bot, move.rng);
  return {
    inputs: [...move.inputs, ...thrown.inputs],
    brain: { rng: thrown.rng, nextThinkAt: state.time + TUNING.botThinkInterval },
  };
}
