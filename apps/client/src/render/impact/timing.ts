/** Seconds. A value that ramps up over `attack`, sits at full for `hold`, then eases back to nothing over `release`. */
export type Envelope = { readonly attack: number; readonly hold: number; readonly release: number };

export type Kick = {
  /** World units the body is pushed at the peak. */
  readonly distance: number;
  /** Radians the body tips over at the peak, about its feet. */
  readonly lean: number;
  readonly envelope: Envelope;
};

export type Pop = {
  /** Scale the number starts from, and the scale it overshoots to before settling at 1. */
  readonly from: number;
  readonly peak: number;
  readonly rise: number;
  readonly settle: number;
};

/** The timing a blow needs from its table row; `ImpactSpec` carries these and more. */
export type ImpactTiming = {
  readonly hitStop: number;
  readonly flash: Envelope;
  readonly lunge: Kick;
  readonly recoil: Kick;
};

/** 0 to 1, `age` seconds after the envelope begins. Exactly 0 before it starts and after it ends. */
export function envelope(age: number, shape: Envelope): number {
  if (!(age >= 0)) return 0;
  if (age < shape.attack) return age / shape.attack;
  const past = age - shape.attack - shape.hold;
  if (past <= 0) return 1;
  if (past >= shape.release) return 0;
  return (1 - past / shape.release) ** 2;
}

/** Whether a fighter's animation is frozen `age` seconds after the blow. */
export function hitStopped(age: number, timing: ImpactTiming): boolean {
  return age >= 0 && age < timing.hitStop;
}

/** How far into their lunge the attacker is: at full reach on contact and through the freeze, then back. */
export function lungeAmount(age: number, timing: ImpactTiming): number {
  if (!(age >= 0)) return 0;
  return envelope(Math.max(0, age - timing.hitStop), timing.lunge.envelope);
}

/** How far the victim is knocked back: nothing until the freeze lets go, then out and back. */
export function recoilAmount(age: number, timing: ImpactTiming): number {
  return envelope(age - timing.hitStop, timing.recoil.envelope);
}

export function flashAmount(age: number, timing: ImpactTiming): number {
  return envelope(age, timing.flash);
}

/** Scale of a damage number `age` seconds after it appears: up past its size, then settled at exactly 1. */
export function popScale(age: number, pop: Pop): number {
  if (!(age >= 0)) return pop.from;
  if (age < pop.rise) return pop.from + (pop.peak - pop.from) * (age / pop.rise);
  const settling = (age - pop.rise) / pop.settle;
  if (settling >= 1) return 1;
  return 1 + (pop.peak - 1) * (1 - settling) ** 2;
}
