import type { GrappleId, HookId, PickupKind, PlayerId, SeenEvent, TeamId, Vec2 } from '@hookwars/sim';
import type { SoundId } from './manifest';

/** Who an event is about, seen from the local player. */
export type Relation = 'local' | 'ally' | 'enemy';

/** One sound to play: where it happened (null for news with no place), and how loud before distance. */
export type Cue = { readonly sound: SoundId; readonly gain: number; readonly at: Vec2 | null };

/** What the cue table may ask of the local team's view. Every lookup answers only for what that team sees. */
export type CueContext = {
  readonly localId: PlayerId;
  readonly localTeam: TeamId;
  readonly teamOf: (id: PlayerId) => TeamId | undefined;
  readonly posOf: (id: PlayerId) => Vec2 | null;
  readonly hookPos: (id: HookId) => Vec2 | null;
  readonly grapplePos: (id: GrappleId) => Vec2 | null;
};

/** The parts of an event its sounds depend on. A missing relation leaves rules about it silent. */
type Facts = { readonly actor: Relation | null; readonly target: Relation | null; readonly at: Vec2 | null };

/** A gain per relation; a relation it leaves out is not heard. A plain number is heard the same by everyone. */
type Gain = number | Partial<Readonly<Record<Relation, number>>>;
type Rule = { readonly sound: SoundId; readonly about: 'actor' | 'target'; readonly gain: Gain };

const EVERYONE: Gain = { local: 1, ally: 0.8, enemy: 0.8 };
const ONLY_ME: Gain = { local: 1 };
const NEWS: Gain = { local: 1, ally: 0.5, enemy: 0.5 };
const PICKUP_SOUND: Readonly<Record<PickupKind, SoundId>> = { gold: 'gold', gale: 'gale', storm: 'storm' };

type Kind = SeenEvent['kind'];

/** The sounds each kind of event makes. A purchase is the shop's to sound, since only it knows the refused ones. */
const RULES: { readonly [K in Kind]: readonly Rule[] } = {
  hookCast: [{ sound: 'hookThrow', about: 'actor', gain: { local: 1, ally: 0.7, enemy: 0.8 } }],
  hookBounce: [{ sound: 'hookBounce', about: 'actor', gain: 1 }],
  hookHit: [
    { sound: 'hookHit', about: 'actor', gain: EVERYONE },
    { sound: 'hurt', about: 'target', gain: ONLY_ME },
  ],
  melee: [
    { sound: 'melee', about: 'actor', gain: EVERYONE },
    { sound: 'hurt', about: 'target', gain: ONLY_ME },
  ],
  kill: [{ sound: 'kill', about: 'actor', gain: EVERYONE }],
  purchase: [],
  grappleCast: [{ sound: 'grappleThrow', about: 'actor', gain: EVERYONE }],
  grappleLand: [{ sound: 'grappleBite', about: 'actor', gain: 1 }],
  grappleArrive: [{ sound: 'grappleArrive', about: 'actor', gain: EVERYONE }],
  respawn: [{ sound: 'respawn', about: 'actor', gain: ONLY_ME }],
  pickupCaught: [{ sound: 'pickupCaught', about: 'actor', gain: EVERYONE }],
  // Filled in per pickup kind by `soundsOf`.
  pickupCollected: [],
  storm: [
    { sound: 'stormBolt', about: 'actor', gain: EVERYONE },
    { sound: 'hurt', about: 'target', gain: ONLY_ME },
  ],
  // The winning side is the actor: the local side winning reads as `local`.
  matchEnd: [
    { sound: 'victory', about: 'actor', gain: ONLY_ME },
    { sound: 'defeat', about: 'actor', gain: { enemy: 1 } },
  ],
};

function relationOf(ctx: CueContext, id: PlayerId): Relation {
  if (id === ctx.localId) return 'local';
  return ctx.teamOf(id) === ctx.localTeam ? 'ally' : 'enemy';
}

/** Null for an event this team gets word of but did not see happen: it makes no sound. */
function factsOf(event: SeenEvent, ctx: CueContext): Facts | null {
  const who = (id: PlayerId): Relation => relationOf(ctx, id);
  switch (event.kind) {
    case 'hookCast':
      return { actor: who(event.ownerId), target: null, at: ctx.posOf(event.ownerId) ?? ctx.hookPos(event.hookId) };
    case 'grappleCast':
      return { actor: who(event.ownerId), target: null, at: ctx.posOf(event.ownerId) ?? ctx.grapplePos(event.grappleId) };
    case 'hookBounce':
    case 'grappleLand':
      return { actor: null, target: null, at: event.at };
    case 'hookHit':
      return { actor: who(event.ownerId), target: who(event.targetId), at: event.at };
    case 'melee':
      return { actor: who(event.attackerId), target: who(event.targetId), at: event.at };
    case 'storm':
      return { actor: who(event.sourceId), target: who(event.targetId), at: event.at };
    case 'kill':
      return event.at === null ? null : { actor: who(event.killerId), target: who(event.victimId), at: event.at };
    case 'grappleArrive':
      return { actor: who(event.playerId), target: null, at: event.at };
    case 'respawn':
      return { actor: who(event.playerId), target: null, at: ctx.posOf(event.playerId) };
    case 'pickupCaught':
      return { actor: who(event.ownerId), target: null, at: event.at };
    case 'pickupCollected':
    case 'purchase':
      return { actor: who(event.playerId), target: null, at: null };
    case 'matchEnd':
      return { actor: event.winner === ctx.localTeam ? 'local' : 'enemy', target: null, at: null };
  }
}

function soundsOf(event: SeenEvent): readonly Rule[] {
  if (event.kind === 'pickupCollected') return [{ sound: PICKUP_SOUND[event.pickupKind], about: 'actor', gain: NEWS }];
  return RULES[event.kind];
}

function gainFor(gain: Gain, relation: Relation | null): number {
  if (typeof gain === 'number') return gain;
  return relation === null ? 0 : (gain[relation] ?? 0);
}

/** The sounds one batch of the local team's events makes, in event order. */
export function cuesFor(events: readonly SeenEvent[], ctx: CueContext): readonly Cue[] {
  return events.flatMap((event) => {
    const facts = factsOf(event, ctx);
    if (facts === null) return [];
    return soundsOf(event).flatMap((rule) => {
      const gain = gainFor(rule.gain, facts[rule.about]);
      return gain > 0 ? [{ sound: rule.sound, gain, at: facts.at }] : [];
    });
  });
}
