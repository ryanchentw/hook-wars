import { toSnapView, type ClientMessageOf, type MatchStart } from '@hookbrawl/protocol';
import { toMatchConfig, type MemberId } from '@hookbrawl/room';
import { botThink, createBotBrain, createMatch, step, TICK_DT, TICK_RATE, viewFor, type GameState, type PlayerInput, type TeamId } from '@hookbrawl/sim';
import { enqueueInput, takeInputs } from './inputQueue';
import type { Entropy, Fighter, MatchRun, Outbound, QueuedInput, Room, RoomRules, Step } from './types';
import { announce, isMemberOnline } from './view';

/** Keeps a stand-in's seed clear of the seeds the room plan gives its bots. */
const STAND_IN_SEED_OFFSET = 1000;

export function matchStartFor(match: MatchRun, fighter: Fighter, now: number, resumed: boolean): MatchStart {
  return {
    matchId: match.id,
    you: fighter.id,
    scene: match.scene,
    startsInMs: Math.max(0, match.startAt - now),
    resumed,
    arena: match.state.arena,
    view: { ...toSnapView(viewFor(match.state, fighter.team)), events: [] },
  };
}

export const fighterOf = (match: MatchRun | null, member: MemberId): Fighter | undefined => match?.fighters.find((f) => f.owner === member);

/** Begins the match the lobby has just agreed to. Seeds and bots are made here and never leave the server. */
export function startMatch(room: Room, now: number, rules: RoomRules, entropy: Entropy): Step {
  const seed = entropy.seed();
  const plan = toMatchConfig(room.lobby, seed);
  if (plan === null) return { room, out: [] };
  const fighters = plan.seats.map((seat, i): Fighter => ({
    id: seat.playerId,
    team: seat.slot.team,
    owner: seat.kind === 'human' ? seat.memberId : null,
    brain: createBotBrain(seat.kind === 'bot' ? seat.seed : seed + STAND_IN_SEED_OFFSET + i),
    queue: [],
    ack: 0,
    drivenBy: seat.kind === 'human' ? 'member' : 'bot',
  }));
  const match: MatchRun = {
    id: room.lobby.matchesStarted,
    scene: plan.scene,
    state: createMatch(plan.config),
    fighters,
    startAt: now + rules.countdownMs,
    ticksRun: 0,
    pending: { west: [], east: [] },
    snapshotDebt: 0,
  };
  const next = { ...room, match };
  const starts = fighters.flatMap((f): Outbound[] =>
    f.owner !== null && isMemberOnline(next, f.owner) ? [{ kind: 'send', to: f.owner, message: { t: 'matchStart', match: matchStartFor(match, f, now, false) } }] : [],
  );
  return { room: next, out: [...announce(next), ...starts] };
}

/** Queues a member's input for their fighter. Anything sent before the first tick, or with no fighter to take it, is dropped. */
export function queueInput(room: Room, member: MemberId, input: ClientMessageOf<'input'>, now: number, rules: RoomRules): Room {
  const { match } = room;
  if (match === null || now < match.startAt) return room;
  const queued: QueuedInput = { seq: input.seq, steer: input.steer, acts: input.acts };
  const fighters = match.fighters.map((f) => (f.owner === member ? { ...f, queue: enqueueInput(f.queue, f.ack, queued, rules.inputQueueMax) } : f));
  return { ...room, match: { ...match, fighters } };
}

const asPlayerInputs = (fighter: Fighter, input: QueuedInput): readonly PlayerInput[] => [
  { kind: 'steer', playerId: fighter.id, dir: input.steer },
  ...input.acts.map((act): PlayerInput => ({ ...act, playerId: fighter.id })),
];

type Driven = { readonly fighter: Fighter; readonly inputs: readonly PlayerInput[] };

function driveByMember(fighter: Fighter, rules: RoomRules): Driven {
  const { apply, rest } = takeInputs(fighter.queue, rules.inputBufferMax);
  const takeBack: readonly PlayerInput[] = fighter.drivenBy === 'bot' ? [{ kind: 'stop', playerId: fighter.id }] : [];
  return {
    fighter: { ...fighter, queue: rest, ack: apply.at(-1)?.seq ?? fighter.ack, drivenBy: 'member' },
    inputs: [...takeBack, ...apply.flatMap((input) => asPlayerInputs(fighter, input))],
  };
}

/** A bot standing in for a dropped member fights but never shops: the gold is theirs to spend when they are back. */
function driveByBot(fighter: Fighter, state: GameState): Driven {
  const thought = botThink(state, fighter.id, fighter.brain);
  const standIn = fighter.owner !== null;
  return {
    fighter: { ...fighter, brain: thought.brain, queue: [], drivenBy: 'bot' },
    inputs: standIn ? thought.inputs.filter((input) => input.kind !== 'buy') : thought.inputs,
  };
}

function snapshots(room: Room, match: MatchRun): readonly Outbound[] {
  const views = { west: toSnapView(viewFor(match.state, 'west')), east: toSnapView(viewFor(match.state, 'east')) };
  return match.fighters.flatMap((f): Outbound[] =>
    f.owner !== null && isMemberOnline(room, f.owner)
      ? [{ kind: 'send', to: f.owner, message: { t: 'snap', ack: f.ack, view: { ...views[f.team], events: match.pending[f.team] } } }]
      : [],
  );
}

function collectEvents(match: MatchRun, state: GameState): MatchRun['pending'] {
  if (state.events.length === 0) return match.pending;
  const seen = (team: TeamId) => [...match.pending[team], ...viewFor(state, team).events];
  return { west: seen('west'), east: seen('east') };
}

/** One step of the sim, and a snapshot to every connected fighter's member when one is owed. */
export function tick(room: Room, match: MatchRun, rules: RoomRules): { readonly match: MatchRun; readonly out: readonly Outbound[] } {
  const driven = match.fighters.map((f) => (f.owner !== null && isMemberOnline(room, f.owner) ? driveByMember(f, rules) : driveByBot(f, match.state)));
  const state = step(match.state, driven.flatMap((d) => d.inputs), TICK_DT);
  const debt = match.snapshotDebt + rules.snapshotHz;
  const owed = debt >= TICK_RATE || state.phase.kind === 'ended';
  const ticked: MatchRun = {
    ...match,
    state,
    fighters: driven.map((d) => d.fighter),
    ticksRun: match.ticksRun + 1,
    pending: collectEvents(match, state),
    snapshotDebt: owed ? Math.max(0, debt - TICK_RATE) : debt,
  };
  if (!owed) return { match: ticked, out: [] };
  return { match: { ...ticked, pending: { west: [], east: [] } }, out: snapshots(room, ticked) };
}

/** How many ticks are due at `now`, and the match with its clock pulled forward past any it will never run. */
export function dueTicks(match: MatchRun, now: number, rules: RoomRules): { readonly match: MatchRun; readonly due: number } {
  const behind = Math.floor((now - match.startAt) / rules.tickMs) - match.ticksRun;
  if (behind <= rules.maxCatchUpTicks) return { match, due: Math.max(0, behind) };
  const dropped = behind - rules.maxCatchUpTicks;
  return { match: { ...match, startAt: match.startAt + dropped * rules.tickMs }, due: rules.maxCatchUpTicks };
}

export const nextTickAt = (match: MatchRun, rules: RoomRules): number => match.startAt + (match.ticksRun + 1) * rules.tickMs;
