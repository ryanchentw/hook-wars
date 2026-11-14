import type { GameEvent, PlayerId } from '@hookbrawl/sim';
import { Group, type Camera, type Texture } from 'three';
import type { Impact } from '../impact/impacts';
import { burstFor, createRandom, impactBursts, stepParticles, type Particle } from './particles';
import { createParticlesView } from './particlesView';
import { slashesFrom, stepSlashes, type Slash } from './slash';
import { createSlashView } from './slashView';

export type EffectsView = {
  readonly group: Group;
  /** `events` are the sim events since the previous call, each delivered exactly once, and `impacts` the blows among them. */
  update(events: readonly GameEvent[], impacts: readonly Impact[], dt: number, camera: Camera, facingOf: (id: PlayerId) => number | null): void;
  clear(): void;
  dispose(): void;
};

const SEED = 20240613;

/**
 * Turns what happened into short-lived light and debris: a flare, sparks, blood and a slash arc on a melee blow,
 * a flare and blood on a hook hit, sparks on a bounce, a wisp on a kill.
 */
export function createEffectsView(softDot: Texture): EffectsView {
  const particlesView = createParticlesView(softDot);
  const slashView = createSlashView();
  const group = new Group();
  group.add(particlesView.group, slashView.group);
  const random = createRandom(SEED);
  let particles: readonly Particle[] = [];
  let slashes: readonly Slash[] = [];
  let showing = false;

  return {
    group,
    update(events, impacts, dt, camera, facingOf) {
      // A quiet dock with nothing on show costs nothing; `showing` outlives a clear by one draw, which wipes the views.
      if (events.length === 0 && impacts.length === 0 && !showing) return;
      const born = [...events.flatMap((event) => burstFor(event, random, facingOf)), ...impacts.flatMap((impact) => impactBursts(impact, random))];
      particles = stepParticles([...particles, ...born], dt);
      particlesView.draw(particles, camera);
      // Aged first, so an arc born this frame is drawn at age 0, on the frame the blow lands.
      slashes = [...stepSlashes(slashes, dt), ...slashesFrom(impacts)];
      slashView.draw(slashes);
      showing = particles.length > 0 || slashes.length > 0;
    },
    clear() {
      particles = [];
      slashes = [];
    },
    dispose() {
      particlesView.dispose();
      slashView.dispose();
    },
  };
}
