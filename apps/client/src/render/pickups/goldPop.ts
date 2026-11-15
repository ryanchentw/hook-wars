import type { PlayerId, SeenEvent, Vec2 } from '@hookwars/sim';
import { popScale, type Pop } from '../impact/timing';
import type { RenderFrame } from '../interpolate';
import { simToWorld, type Vec3 } from '../space';
import { SIZES } from '../theme';
import './goldPop.css';

export type GoldPops = {
  /** `events` are the sim events since the last call. */
  update(events: readonly SeenEvent[], frame: RenderFrame, project: (world: Vec3) => Vec2, dt: number): void;
  clear(): void;
};

type Floating = { readonly element: HTMLElement; readonly collector: PlayerId; readonly age: number };

const LIFETIME = 1.4;
const RISE_PX = 46;
const ANCHOR_HEIGHT = SIZES.labelHeight + 0.6;
const POP: Pop = { from: 0.6, peak: 1.4, rise: 0.08, settle: 0.25 };

/**
 * The gold a Gold pickup paid, over its collector, for every team that sees them. The event carries no position, so
 * a collector out of sight gets no number: the feed line says who took it and for how much.
 */
export function createGoldPops(parent: HTMLElement, calm: boolean): GoldPops {
  let floating: readonly Floating[] = [];

  const spawn = (events: readonly SeenEvent[], frame: RenderFrame): readonly Floating[] =>
    events.flatMap((e): Floating[] => {
      if (e.kind !== 'pickupCollected' || e.gold === 0) return [];
      if (!frame.players.some((pf) => pf.player.id === e.playerId)) return [];
      const element = document.createElement('div');
      element.className = 'gold-pop';
      element.textContent = `+${e.gold}`;
      parent.append(element);
      return [{ element, collector: e.playerId, age: 0 }];
    });

  return {
    update(events, frame, project, dt) {
      const aged = [...floating.map((f) => ({ ...f, age: f.age + dt })), ...spawn(events, frame)];
      aged.filter((f) => f.age >= LIFETIME).forEach((f) => f.element.remove());
      floating = aged.filter((f) => f.age < LIFETIME);
      floating.forEach((f) => {
        const pos = frame.players.find((pf) => pf.player.id === f.collector)?.pos;
        if (pos === undefined) {
          f.element.style.opacity = '0';
          return;
        }
        const t = f.age / LIFETIME;
        const at = project(simToWorld(pos, ANCHOR_HEIGHT));
        const rise = calm ? 0 : RISE_PX * (1 - (1 - t) ** 2);
        const scale = calm ? 1 : popScale(f.age, POP);
        f.element.style.transform = `translate(${at.x.toFixed(1)}px, ${(at.y - rise).toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
        f.element.style.opacity = (1 - t ** 3).toFixed(3);
      });
    },
    clear() {
      floating.forEach((f) => f.element.remove());
      floating = [];
    },
  };
}
