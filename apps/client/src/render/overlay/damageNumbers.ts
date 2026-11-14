import type { GameEvent, PlayerId, Vec2 } from '@hookbrawl/sim';
import { simToWorld, type Vec3 } from '../space';
import { SIZES } from '../theme';

export type DamageNumbers = {
  /** Adds a number for every damaging blow among `events`. */
  spawn(events: readonly GameEvent[]): void;
  /** `positionOf` gives a player's current ground position, so a number stays with a victim who is being hauled away. */
  update(dt: number, project: (world: Vec3) => Vec2, positionOf: (id: PlayerId) => Vec2 | null): void;
  clear(): void;
};

type Blow = { readonly amount: number; readonly heavy: boolean; readonly targetId: PlayerId; readonly fromId: PlayerId; readonly at: Vec2 };
type Floating = { readonly element: HTMLElement; readonly blow: Blow; readonly age: number };

const LIFETIME = 0.95;
const RISE_PX = 40;
/** A number starts beside the victim, on the far side from whoever struck, so two brawlers' numbers part ways and neither covers a name. */
const SIDE_PX = { from: 34, to: 52 };
const ANCHOR_HEIGHT = SIZES.labelHeight * 0.55;

function blowOf(event: GameEvent): Blow | null {
  if (event.kind === 'hookHit' && event.damage > 0) {
    return { amount: event.damage, heavy: true, targetId: event.targetId, fromId: event.ownerId, at: event.at };
  }
  if (event.kind === 'melee') return { amount: event.damage, heavy: false, targetId: event.targetId, fromId: event.attackerId, at: event.at };
  return null;
}

/** Damage figures that rise from whoever took the blow and fade, tracking the world as the camera moves. */
export function createDamageNumbers(parent: HTMLElement): DamageNumbers {
  let floating: readonly Floating[] = [];

  return {
    spawn(events) {
      const born = events.flatMap((event): readonly Floating[] => {
        const blow = blowOf(event);
        if (blow === null) return [];
        const element = document.createElement('div');
        element.className = blow.heavy ? 'damage-number damage-heavy' : 'damage-number';
        element.textContent = `-${Math.round(blow.amount)}`;
        parent.append(element);
        return [{ element, blow, age: 0 }];
      });
      floating = [...floating, ...born];
    },
    update(dt, project, positionOf) {
      const aged = floating.map((f) => ({ ...f, age: f.age + dt }));
      aged.filter((f) => f.age >= LIFETIME).forEach((f) => f.element.remove());
      floating = aged.filter((f) => f.age < LIFETIME);
      for (const f of floating) {
        const t = f.age / LIFETIME;
        const eased = 1 - (1 - t) ** 2;
        const victim = positionOf(f.blow.targetId) ?? f.blow.at;
        const striker = positionOf(f.blow.fromId);
        const side = striker !== null && striker.x > victim.x ? -1 : 1;
        const at = project(simToWorld(victim, ANCHOR_HEIGHT));
        const x = at.x + side * (SIDE_PX.from + (SIDE_PX.to - SIDE_PX.from) * eased);
        const y = at.y - RISE_PX * eased;
        f.element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${(1.25 - 0.25 * t).toFixed(3)})`;
        f.element.style.opacity = (1 - t ** 3).toFixed(3);
      }
    },
    clear() {
      floating.forEach((f) => f.element.remove());
      floating = [];
    },
  };
}
