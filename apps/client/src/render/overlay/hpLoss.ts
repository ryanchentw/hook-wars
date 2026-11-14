/** Fractions of a full bar. `shown` trails `hp`: it is where the bar stood before the blow, until it drains. */
export type HpLoss = { readonly hp: number; readonly shown: number; readonly heldFor: number };

export const HP_LOSS = {
  /** Seconds the lost chunk stays whole after a blow. */
  hold: 0.22,
  /** Fraction of the bar the chunk then loses per second. */
  drainPerSecond: 0.45,
} as const;

export function startLoss(hp: number): HpLoss {
  return { hp, shown: hp, heldFor: 0 };
}

/** Returns the same object when nothing is draining, so a quiet bar costs nothing per frame. */
export function stepLoss(loss: HpLoss, hp: number, dt: number): HpLoss {
  if (hp >= loss.shown) return hp === loss.hp && hp === loss.shown ? loss : startLoss(hp);
  const heldFor = hp < loss.hp ? 0 : loss.heldFor + dt;
  if (heldFor < HP_LOSS.hold) return { hp, shown: loss.shown, heldFor };
  return { hp, shown: Math.max(hp, loss.shown - HP_LOSS.drainPerSecond * dt), heldFor };
}
