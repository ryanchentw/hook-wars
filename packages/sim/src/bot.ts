import { dockAt, spawnPoint, walkableRect } from './arena';
import { PICKUPS, TUNING, UPGRADE_IDS } from './config';
import { add, distance, rotate, scale, sub } from './geometry';
import { grappleReady } from './grapple';
import { velocity } from './intent';
import { createRng, nextRandom } from './rng';
import { canBuy, hookStats } from './shop';
import type { BotBrain, GameState, Pickup, Player, PlayerId, PlayerInput, Purchase, Rect, Rng, SeenPlayer, TeamView, Vec2 } from './types';
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

/**
 * Still on its way somewhere. Within a body's width of the target counts as there: teammates who chased the same enemy
 * share one target, and their bodies keep each other off it for good.
 */
function walking(bot: Player): boolean {
  if (bot.move.kind === 'toward') return distance(bot.pos, bot.move.target) > TUNING.bodySpacing;
  return bot.move.kind !== 'idle';
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
  if (walking(bot)) return { inputs: [], rng };
  const rect = wanderArea(view, bot, dock);
  const [u, afterU] = nextRandom(rng);
  const [v, afterV] = nextRandom(afterU);
  const target = { x: rect.x0 + u * (rect.x1 - rect.x0), y: rect.y0 + v * (rect.y1 - rect.y0) };
  return { inputs: [{ kind: 'move', playerId: bot.id, target }], rng: afterV };
}

/** Somewhere to throw at: where it is and how it moves, so the throw can lead it. */
type Mark = { readonly pos: Vec2; readonly vel: Vec2 };

const pickupVelocity = (p: Pickup): Vec2 =>
  p.state.kind === 'drifting' ? { x: 0, y: (p.from === 'north' ? 1 : -1) * PICKUPS.driftSpeed } : { x: 0, y: 0 };

/** A pickup in sight and in reach that is not already on its way to the bot's own team. */
function pickupInReach(view: TeamView, bot: Player, reach: number): Mark | null {
  const ally = new Set(view.hooks.filter((h) => view.roster.find((c) => c.id === h.ownerId)?.team === bot.team).map((h) => h.id));
  const open = view.pickups.filter((p) => !(p.state.kind === 'carried' && ally.has(p.state.hookId)) && distance(bot.pos, p.pos) <= reach);
  const near = open.reduce<Pickup | null>((best, p) => (!best || distance(bot.pos, p.pos) < distance(bot.pos, best.pos) ? p : best), null);
  return near && { pos: near.pos, vel: pickupVelocity(near) };
}

/** A fighter in reach, or a pickup: with both on offer the pickup wins only `botPickupChance` of the time. */
function chooseMark(view: TeamView, bot: Player, reach: number, rng: Rng): { readonly mark: Mark | null; readonly rng: Rng } {
  const target = nearest(bot.pos, enemies(view, bot).filter((p) => p.status.kind === 'alive'));
  const fighter = target && distance(bot.pos, target.pos) <= reach ? { pos: target.pos, vel: velocity(target.move, target.pos) } : null;
  const pickup = pickupInReach(view, bot, reach);
  if (pickup === null || fighter === null) return { mark: pickup ?? fighter, rng };
  const [roll, next] = nextRandom(rng);
  return { mark: roll < TUNING.botPickupChance ? pickup : fighter, rng: next };
}

function chooseThrow(state: GameState, view: TeamView, bot: Player, rng: Rng): Decision {
  const stats = hookStats(bot);
  const canCast = state.time >= bot.hookReadyAt && !ownsHook(state, bot.id);
  if (!canCast) return { inputs: [], rng };
  const chosen = chooseMark(view, bot, stats.range * THROW_REACH_SHARE, rng);
  if (chosen.mark === null) return { inputs: [], rng: chosen.rng };
  const [roll, afterRoll] = nextRandom(chosen.rng);
  if (roll >= TUNING.botFireChance) return { inputs: [], rng: afterRoll };
  const [noise, afterNoise] = nextRandom(afterRoll);
  const { pos, vel } = chosen.mark;
  const lead = add(pos, scale(vel, distance(bot.pos, pos) / stats.speed));
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
