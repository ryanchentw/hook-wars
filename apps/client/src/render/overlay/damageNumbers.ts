import type { PlayerId, Vec2 } from '@hookbrawl/sim';
import type { Impact } from '../impact/impacts';
import { popScale } from '../impact/timing';
import { simToWorld, type Vec3 } from '../space';
import { SIZES } from '../theme';

export type DamageNumbers = {
  /** Adds a number for every blow. */
  spawn(impacts: readonly Impact[]): void;
  /** `positionOf` gives a player's current ground position, so a number stays with a victim who is being hauled away. */
  update(dt: number, project: (world: Vec3) => Vec2, positionOf: (id: PlayerId) => Vec2 | null): void;
  clear(): void;
};

type Floating = { readonly element: HTMLElement; readonly impact: Impact; readonly age: number };

const LIFETIME = 0.95;
const RISE_PX = 40;
/** A number starts beside the victim, on the far side from whoever struck, so two brawlers' numbers part ways and neither covers a name. */
const SIDE_PX = { from: 34, to: 52 };
const ANCHOR_HEIGHT = SIZES.labelHeight * 0.55;

/** Damage figures that rise from whoever took the blow and fade, tracking the world as the camera moves. */
export function createDamageNumbers(parent: HTMLElement): DamageNumbers {
  let floating: readonly Floating[] = [];

  return {
    spawn(impacts) {
      if (impacts.length === 0) return;
      const born = impacts.map((impact): Floating => {
        const element = document.createElement('div');
        element.className = impact.kind === 'hook' ? 'damage-number damage-heavy' : 'damage-number';
        element.textContent = `-${Math.round(impact.damage)}`;
        parent.append(element);
        return { element, impact, age: 0 };
      });
      floating = [...floating, ...born];
    },
    update(dt, project, positionOf) {
      if (floating.length === 0) return;
      const aged = floating.map((f) => ({ ...f, age: f.age + dt }));
      aged.filter((f) => f.age >= LIFETIME).forEach((f) => f.element.remove());
      floating = aged.filter((f) => f.age < LIFETIME);
      for (const f of floating) {
        const t = f.age / LIFETIME;
        const eased = 1 - (1 - t) ** 2;
        const victim = positionOf(f.impact.targetId) ?? f.impact.at;
        const striker = positionOf(f.impact.attackerId);
        const side = striker !== null && striker.x > victim.x ? -1 : 1;
        const at = project(simToWorld(victim, ANCHOR_HEIGHT));
        const x = at.x + side * (SIDE_PX.from + (SIDE_PX.to - SIDE_PX.from) * eased);
        const y = at.y - RISE_PX * eased;
        f.element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${popScale(f.age, f.impact.spec.pop).toFixed(3)})`;
        f.element.style.opacity = (1 - t ** 3).toFixed(3);
      }
    },
    clear() {
      floating.forEach((f) => f.element.remove());
      floating = [];
    },
  };
}
