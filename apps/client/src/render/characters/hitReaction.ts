import type { Object3D } from 'three';
import type { Impact } from '../impact/impacts';
import { flashAmount, hitStopped, lungeAmount, recoilAmount } from '../impact/timing';

export type HitReaction = {
  /** Advances by one frame; `dealt` and `taken` are the blows this fighter gave and received since the last call. */
  step(dealt: Impact | null, taken: Impact | null, dt: number): void;
  /** Whether the fighter's animation is held still by a blow that has just landed either way. */
  frozen(): boolean;
  /** Sim facing of the last blow this fighter dealt, or null if they have dealt none. */
  swingHeading(): number | null;
  /** 0 to 1: how white the fighter is lit by the blow they took. */
  flash(): number;
  /** Moves and tips `pivot` by the lunge and the recoil. Both decay to exactly nothing, so nothing accumulates. */
  pose(pivot: Object3D): void;
  reset(): void;
};

type Landed = { readonly impact: Impact; readonly since: number };

const ageOf = (landed: Landed | null, clock: number): number => (landed === null ? Number.POSITIVE_INFINITY : clock - landed.since);

/** One fighter's bodily answer to blows: the freeze, the lunge in, the knock back and the flash. */
export function createHitReaction(): HitReaction {
  let clock = 0;
  let dealt: Landed | null = null;
  let taken: Landed | null = null;

  return {
    step(dealtNow, takenNow, dt) {
      clock += dt;
      if (dealtNow !== null) dealt = { impact: dealtNow, since: clock };
      if (takenNow !== null) taken = { impact: takenNow, since: clock };
    },
    frozen: () =>
      (dealt !== null && hitStopped(ageOf(dealt, clock), dealt.impact.spec)) ||
      (taken !== null && hitStopped(ageOf(taken, clock), taken.impact.spec)),
    swingHeading: () => dealt?.impact.heading ?? null,
    flash: () => (taken === null ? 0 : flashAmount(ageOf(taken, clock), taken.impact.spec)),
    pose(pivot) {
      const lunge = dealt?.impact.spec.lunge;
      const recoil = taken?.impact.spec.recoil;
      const reach = dealt === null ? 0 : lungeAmount(ageOf(dealt, clock), dealt.impact.spec);
      const knock = taken === null ? 0 : recoilAmount(ageOf(taken, clock), taken.impact.spec);
      const forward = dealt?.impact.heading ?? 0;
      const away = taken?.impact.heading ?? 0;
      const slideIn = reach * (lunge?.distance ?? 0);
      const slideOut = knock * (recoil?.distance ?? 0);
      const leanIn = reach * (lunge?.lean ?? 0);
      const leanOut = knock * (recoil?.lean ?? 0);
      pivot.position.set(Math.cos(forward) * slideIn + Math.cos(away) * slideOut, 0, Math.sin(forward) * slideIn + Math.sin(away) * slideOut);
      // Tipping the top of an upright body towards world (x, z) is a turn about the axis (z, 0, -x).
      pivot.rotation.set(Math.sin(forward) * leanIn + Math.sin(away) * leanOut, 0, -(Math.cos(forward) * leanIn + Math.cos(away) * leanOut));
    },
    reset() {
      dealt = null;
      taken = null;
    },
  };
}
