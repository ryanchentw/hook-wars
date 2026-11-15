import type { SeenEvent, PlayerId, TeamId, Vec2 } from '@hookwars/sim';
import type { BurstName } from '../effects/particles';
import type { ImpactTiming, Pop } from './timing';

export type ImpactKind = 'melee' | 'hook';

export type ImpactSpec = ImpactTiming & {
  /** Share of the full camera shake, felt only when the local player gives or takes the blow. */
  readonly shake: number;
  /** Whether the blow draws the attacker's swing as an arc of light. */
  readonly slash: boolean;
  readonly bursts: readonly BurstName[];
  readonly pop: Pop;
};

/**
 * The one table that says what a blow looks like. Every layer of a hit reads its strength and timing from here.
 * Brawlers alternate, so the answering blow lands `TUNING.landingStagger` after this one; every layer of a melee blow
 * has to be over by then, or the two would blur into one.
 */
export const IMPACTS: Readonly<Record<ImpactKind, ImpactSpec>> = {
  melee: {
    hitStop: 0.075,
    flash: { attack: 0, hold: 0.07, release: 0.1 },
    lunge: { distance: 0.5, lean: 0.2, envelope: { attack: 0, hold: 0, release: 0.2 } },
    recoil: { distance: 0.6, lean: 0.3, envelope: { attack: 0.035, hold: 0.02, release: 0.18 } },
    shake: 0.3,
    slash: true,
    bursts: ['meleeFlare', 'meleeSparks', 'meleeBlood'],
    pop: { from: 0.5, peak: 1.6, rise: 0.06, settle: 0.16 },
  },
  hook: {
    hitStop: 0.09,
    flash: { attack: 0, hold: 0.09, release: 0.1 },
    // The chain is about to haul the victim the other way, so the hook itself moves nobody.
    lunge: { distance: 0, lean: 0, envelope: { attack: 0, hold: 0, release: 0.1 } },
    recoil: { distance: 0, lean: 0, envelope: { attack: 0.03, hold: 0, release: 0.1 } },
    shake: 1,
    slash: false,
    bursts: ['hookFlare', 'hookHit'],
    pop: { from: 0.5, peak: 1.5, rise: 0.07, settle: 0.2 },
  },
};

function calm(spec: ImpactSpec): ImpactSpec {
  return { ...spec, hitStop: 0, shake: 0 };
}

/** The same blows for people who ask their system for less motion: no freeze and no camera shake. */
export const CALM_IMPACTS: Readonly<Record<ImpactKind, ImpactSpec>> = { melee: calm(IMPACTS.melee), hook: calm(IMPACTS.hook) };

/** What a blow needs to know about someone in it. */
export type Fighter = { readonly pos: Vec2; readonly team: TeamId };

export type Impact = {
  readonly kind: ImpactKind;
  readonly spec: ImpactSpec;
  readonly attackerId: PlayerId;
  readonly targetId: PlayerId;
  readonly damage: number;
  /** The attacker's team, or null if they have left the match. */
  readonly team: TeamId | null;
  /** Sim positions of the attacker and the victim when the blow landed. */
  readonly from: Vec2;
  readonly at: Vec2;
  /** Sim facing the blow travels along, attacker to victim. */
  readonly heading: number;
  readonly involvesLocal: boolean;
};

type Blow = { readonly kind: ImpactKind; readonly attackerId: PlayerId; readonly targetId: PlayerId; readonly damage: number; readonly at: Vec2 };

function blowOf(event: SeenEvent): Blow | null {
  if (event.kind === 'melee') return { kind: 'melee', attackerId: event.attackerId, targetId: event.targetId, damage: event.damage, at: event.at };
  if (event.kind === 'hookHit' && event.damage > 0) {
    return { kind: 'hook', attackerId: event.ownerId, targetId: event.targetId, damage: event.damage, at: event.at };
  }
  return null;
}

/** The damaging blows among one tick's events, each resolved against where the fighters are standing. */
export function impactsOf(
  events: readonly SeenEvent[],
  fighterOf: (id: PlayerId) => Fighter | null,
  localId: PlayerId,
  specs: Readonly<Record<ImpactKind, ImpactSpec>>,
): readonly Impact[] {
  return events.flatMap((event): readonly Impact[] => {
    const blow = blowOf(event);
    if (blow === null) return [];
    const attacker = fighterOf(blow.attackerId);
    const at = fighterOf(blow.targetId)?.pos ?? blow.at;
    const from = attacker?.pos ?? at;
    return [
      {
        ...blow,
        spec: specs[blow.kind],
        team: attacker?.team ?? null,
        from,
        at,
        heading: Math.atan2(at.y - from.y, at.x - from.x),
        involvesLocal: blow.attackerId === localId || blow.targetId === localId,
      },
    ];
  });
}

/** Where the weapon meets the body: `inset` sim units from the victim's centre, on the attacker's side. */
export function contactPoint(impact: Impact, inset: number): Vec2 {
  return { x: impact.at.x - Math.cos(impact.heading) * inset, y: impact.at.y - Math.sin(impact.heading) * inset };
}
