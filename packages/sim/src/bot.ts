import { dockAt, spawnPoint, walkableRect } from './arena';
import { TUNING, UPGRADE_IDS } from './config';
import { add, distance, rotate, scale, sub } from './geometry';
import { grappleReady } from './grapple';
import { velocity } from './intent';
import { createRng, nextRandom } from './rng';
import { canBuy, hookStats } from './shop';
import type { BotBrain, GameState, Player, PlayerId, PlayerInput, Purchase, Rect, Rng, SeenPlayer, TeamView, Vec2 } from './types';
import { viewFor } from './view';
import { findPlayer, isAlive, ownsHook } from './world';

type Decision = { readonly inputs: readonly PlayerInput[]; readonly rng: Rng };

/** Share of its hook range a bot throws at, so the target is still reachable after some sideways drift. */
const THROW_REACH_SHARE = 0.95;

const GRAPPLE_ITEM: Purchase = { kind: 'item', id: 'grapple' };
const BARB_ITEM: Purchase = { kind: 'item', id: 'barb' };

export function createBotBrain(seed: number): BotBrain {
  return { rng: createRng(seed), nextThinkAt: 0 };
}

function nearest(from: Vec2, candidates: readonly SeenPlayer[]): SeenPlayer | null {
  return candidates.reduce<SeenPlayer | null>(
    (best, p) => (!best || distance(from, p.pos) < distance(from, best.pos) ? p : best),
    null,
  );
}

/** Only the enemies the bot's team can see: a bot plays by the same fog as everyone. */
function enemies(view: TeamView, bot: Player): readonly SeenPlayer[] {
  return view.players.filter((p) => p.team !== bot.team);
}

/** The grapple first, saving up for it; then one random upgrade or item it can afford. */
function chooseBuy(bot: Player, rng: Rng): Decision {
  const buy = (purchase: Purchase): PlayerInput => ({ kind: 'buy', playerId: bot.id, purchase });
  if (bot.items.grapple.kind === 'unowned') return { inputs: canBuy(bot, GRAPPLE_ITEM) ? [buy(GRAPPLE_ITEM)] : [], rng };
  const affordable = [...UPGRADE_IDS.map((id): Purchase => ({ kind: 'upgrade', id })), BARB_ITEM].filter((p) => canBuy(bot, p));
  if (affordable.length === 0) return { inputs: [], rng };
  const [roll, next] = nextRandom(rng);
  const pick = affordable[Math.floor(roll * affordable.length)];
  return { inputs: pick ? [buy(pick)] : [], rng: next };
}

/** Stranded on the enemy dock with nobody to fight, it pulls itself home. */
function chooseGrapple(state: GameState, view: TeamView, bot: Player): PlayerInput | null {
  if (dockAt(state.arena, bot.pos) === bot.team || !grappleReady(bot, state.time) || ownsHook(state, bot.id)) return null;
  const threatened = enemies(view, bot).some(
    (p) => p.status.kind !== 'dead' && distance(bot.pos, p.pos) <= TUNING.botChaseRange,
  );
  if (threatened) return null;
  return { kind: 'grapple', playerId: bot.id, target: spawnPoint(state.arena, bot.team, bot.spawnIndex) };
}

/** With nobody in sight under fog, the front of its own dock, where it can see across the water. */
function wanderArea(view: TeamView, bot: Player, dock: Player['team']): Rect {
  const rect = walkableRect(view.arena, dock);
  const blind = view.vision.kind === 'fog' && !enemies(view, bot).some((p) => p.status.kind !== 'dead');
  if (!blind || dock !== bot.team) return rect;
  const depth = (rect.x1 - rect.x0) * TUNING.botScoutDepth;
  return dock === 'west' ? { ...rect, x0: rect.x1 - depth } : { ...rect, x1: rect.x0 + depth };
}

function chooseMove(view: TeamView, bot: Player, rng: Rng): Decision {
  const dock = dockAt(view.arena, bot.pos);
  const prey = nearest(
    bot.pos,
    enemies(view, bot).filter(
      (p) =>
        p.status.kind !== 'dead' &&
        dockAt(view.arena, p.pos) === dock &&
        distance(bot.pos, p.pos) <= TUNING.botChaseRange,
    ),
  );
  if (prey) return { inputs: [{ kind: 'move', playerId: bot.id, target: prey.pos }], rng };
  if (bot.move.kind !== 'idle') return { inputs: [], rng };
  const rect = wanderArea(view, bot, dock);
  const [u, afterU] = nextRandom(rng);
  const [v, afterV] = nextRandom(afterU);
  const target = { x: rect.x0 + u * (rect.x1 - rect.x0), y: rect.y0 + v * (rect.y1 - rect.y0) };
  return { inputs: [{ kind: 'move', playerId: bot.id, target }], rng: afterV };
}

function chooseThrow(state: GameState, view: TeamView, bot: Player, rng: Rng): Decision {
  const stats = hookStats(bot);
  const canCast = state.time >= bot.hookReadyAt && !ownsHook(state, bot.id);
  const target = nearest(bot.pos, enemies(view, bot).filter((p) => p.status.kind === 'alive'));
  if (!canCast || !target || distance(bot.pos, target.pos) > stats.range * THROW_REACH_SHARE) return { inputs: [], rng };
  const [roll, afterRoll] = nextRandom(rng);
  if (roll >= TUNING.botFireChance) return { inputs: [], rng: afterRoll };
  const [noise, afterNoise] = nextRandom(afterRoll);
  const lead = add(target.pos, scale(velocity(target.move, target.pos), distance(bot.pos, target.pos) / stats.speed));
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
  const nextThinkAt = state.time + TUNING.botThinkInterval;
  const view = viewFor(state, bot.team);
  const bought = chooseBuy(bot, brain.rng);
  const home = chooseGrapple(state, view, bot);
  if (home) return { inputs: [...bought.inputs, home], brain: { rng: bought.rng, nextThinkAt } };
  const move = chooseMove(view, bot, bought.rng);
  const thrown = chooseThrow(state, view, bot, move.rng);
  return {
    inputs: [...bought.inputs, ...move.inputs, ...thrown.inputs],
    brain: { rng: thrown.rng, nextThinkAt },
  };
}
