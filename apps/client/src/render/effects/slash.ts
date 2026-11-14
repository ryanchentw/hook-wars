import type { TeamId, Vec2 } from '@hookbrawl/sim';
import type { Impact } from '../impact/impacts';
import { envelope } from '../impact/timing';
import { SLASH } from '../theme';

export type Slash = {
  /** Sim position of the attacker, which the arc is centred on. */
  readonly origin: Vec2;
  /** Sim facing of the blow. */
  readonly heading: number;
  readonly team: TeamId | null;
  readonly age: number;
  /** Seconds the arc stands still at the start, while the fighters are frozen. */
  readonly hold: number;
};

const DEG = Math.PI / 180;

export function slashesFrom(impacts: readonly Impact[]): readonly Slash[] {
  return impacts
    .filter((impact) => impact.spec.slash)
    .map((impact) => ({ origin: impact.from, heading: impact.heading, team: impact.team, age: 0, hold: impact.spec.hitStop }));
}

export function stepSlashes(slashes: readonly Slash[], dt: number): readonly Slash[] {
  return slashes.flatMap((slash): readonly Slash[] => {
    const age = slash.age + dt;
    return age >= slash.hold + SLASH.life ? [] : [{ ...slash, age }];
  });
}

/** 0 to 1: full while the fighters are frozen, then dying away. */
export function slashGlow(age: number, hold: number): number {
  return envelope(age, { attack: 0, hold, release: SLASH.life });
}

/** Radians the arc has carried on past where it stood at contact, following the hook through. */
export function slashTurn(age: number, hold: number): number {
  const progress = Math.min(1, Math.max(0, (age - hold) / SLASH.life));
  return SLASH.sweepDeg * DEG * (1 - (1 - progress) ** 2);
}
