import type { Arena, GrappleId, HookId, PickupId, PlayerId, TeamView } from '@hookwars/sim';
import { z } from 'zod';
import { idOf, purchaseSchema, teamSchema } from './common';
import { RAW_NAME_MAX_LENGTH } from './limits';

const MAX_FIGHTERS = 6;
const MAX_EVENTS = 256;
const MAX_PATH = 64;
/** One pickup enters every interval and takes about as long to cross, so a handful is already far past normal. */
const MAX_PICKUPS = 8;
const MAX_EFFECTS = 2;

const playerId = idOf<PlayerId>();
const hookId = idOf<HookId>();
const grappleId = idOf<GrappleId>();
const pickupId = idOf<PickupId>();
const pickupKind = z.enum(['gold', 'gale', 'storm']);
const num = z.number();
const count = z.number().int().min(0);
const vec = z.object({ x: num, y: num });

const statusSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('alive') }),
  z.object({ kind: z.literal('dragged'), hookId }),
  z.object({ kind: z.literal('grappling'), grappleId }),
  z.object({ kind: z.literal('staggered'), until: num }),
  z.object({ kind: z.literal('dead'), respawnAt: num }),
]);

const moveSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('idle') }),
  z.object({ kind: z.literal('toward'), target: vec }),
  z.object({ kind: z.literal('steer'), dir: vec }),
]);

const unowned = z.object({ kind: z.literal('unowned') });
const itemsSchema = z.object({
  grapple: z.discriminatedUnion('kind', [unowned, z.object({ kind: z.literal('owned'), readyAt: num })]),
  barb: z.discriminatedUnion('kind', [unowned, z.object({ kind: z.literal('owned') })]),
});

const seenPlayerSchema = z.object({
  id: playerId,
  name: z.string().max(RAW_NAME_MAX_LENGTH),
  team: teamSchema,
  isBot: z.boolean(),
  spawnIndex: count,
  pos: vec,
  facing: num,
  move: moveSchema,
  hp: num,
  status: statusSchema,
  hookReadyAt: num,
  meleeReadyAt: num,
  kills: count,
  deaths: count,
  assists: count,
  gold: count.nullable(),
  earned: count,
  upgrades: z.object({ damage: count, range: count, speed: count, size: count }),
  items: itemsSchema,
  recentDamage: z.array(z.object({ from: playerId, at: num })).max(MAX_FIGHTERS),
  effects: z.array(z.object({ kind: z.enum(['gale', 'storm']), source: playerId, since: num, until: num })).max(MAX_EFFECTS),
});

const cardSchema = z.object({
  id: playerId,
  name: z.string().max(RAW_NAME_MAX_LENGTH),
  team: teamSchema,
  isBot: z.boolean(),
  kills: count,
  deaths: count,
  assists: count,
  earned: count,
});

const cargoSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fighter'), id: playerId }),
  z.object({ kind: z.literal('pickup'), id: pickupId }),
]);

const pickupSchema = z.object({
  id: pickupId,
  kind: pickupKind,
  pos: vec,
  from: z.enum(['north', 'south']),
  lane: num,
  state: z.discriminatedUnion('kind', [z.object({ kind: z.literal('drifting') }), z.object({ kind: z.literal('carried'), hookId })]),
});

const hookSchema = z.object({
  id: hookId,
  ownerId: playerId,
  pos: vec,
  dir: vec,
  path: z.array(vec).max(MAX_PATH),
  phase: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('extending'), remaining: num }),
    z.object({ kind: z.literal('retracting'), cargo: cargoSchema.nullable() }),
  ]),
  stats: z.object({ damage: num, range: num, speed: num, retractSpeed: num, radius: num, barbed: z.boolean() }),
});

const grappleSchema = z.object({
  id: grappleId,
  ownerId: playerId,
  pos: vec,
  anchor: vec,
  phase: z.discriminatedUnion('kind', [z.object({ kind: z.literal('flying') }), z.object({ kind: z.literal('pulling') })]),
  ropeFrom: vec.nullable(),
});

const eventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hookCast'), hookId, ownerId: playerId }),
  z.object({ kind: z.literal('hookBounce'), hookId, at: vec }),
  z.object({ kind: z.literal('hookHit'), hookId, ownerId: playerId, targetId: playerId, damage: num, ally: z.boolean(), at: vec }),
  z.object({ kind: z.literal('melee'), attackerId: playerId, targetId: playerId, damage: num, at: vec }),
  z.object({ kind: z.literal('kill'), killerId: playerId, victimId: playerId, assistIds: z.array(playerId).max(MAX_FIGHTERS), at: vec.nullable() }),
  z.object({ kind: z.literal('purchase'), playerId, purchase: purchaseSchema, cost: num }),
  z.object({ kind: z.literal('grappleCast'), grappleId, ownerId: playerId }),
  z.object({ kind: z.literal('grappleLand'), grappleId, at: vec }),
  z.object({ kind: z.literal('grappleArrive'), playerId, at: vec }),
  z.object({ kind: z.literal('respawn'), playerId }),
  z.object({ kind: z.literal('pickupCaught'), pickupId, pickupKind, hookId, ownerId: playerId, at: vec }),
  z.object({ kind: z.literal('pickupCollected'), pickupId, pickupKind, playerId, gold: count }),
  z.object({ kind: z.literal('storm'), sourceId: playerId, targetId: playerId, damage: num, at: vec }),
  z.object({ kind: z.literal('matchEnd'), winner: teamSchema }),
]);

export const arenaSchema: z.ZodType<Arena> = z.object({
  width: num,
  height: num,
  canal: z.object({ x0: num, x1: num }),
  buoy: z.object({ pos: vec, radius: num }),
  spawns: z.object({ west: z.array(vec).max(MAX_FIGHTERS), east: z.array(vec).max(MAX_FIGHTERS) }),
});

/** A team's view without the arena, which never changes in a match and is sent once when it starts. */
export type SnapView = Omit<TeamView, 'arena'>;

/** Typed against the sim's `TeamView`, so a field added there fails to compile here until the wire carries it. */
export const snapViewSchema: z.ZodType<SnapView> = z.object({
  viewer: teamSchema,
  tick: count,
  time: num,
  vision: z.discriminatedUnion('kind', [z.object({ kind: z.literal('open') }), z.object({ kind: z.literal('fog'), radius: num })]),
  score: z.object({ west: count, east: count }),
  killTarget: count,
  phase: z.discriminatedUnion('kind', [z.object({ kind: z.literal('playing') }), z.object({ kind: z.literal('ended'), winner: teamSchema })]),
  players: z.array(seenPlayerSchema).max(MAX_FIGHTERS),
  roster: z.array(cardSchema).max(MAX_FIGHTERS),
  hooks: z.array(hookSchema).max(MAX_FIGHTERS),
  grapples: z.array(grappleSchema).max(MAX_FIGHTERS),
  pickups: z.array(pickupSchema).max(MAX_PICKUPS),
  events: z.array(eventSchema).max(MAX_EVENTS),
});

export const toSnapView = ({ arena: _arena, ...rest }: TeamView): SnapView => rest;
export const toTeamView = (view: SnapView, arena: Arena): TeamView => ({ ...view, arena });
