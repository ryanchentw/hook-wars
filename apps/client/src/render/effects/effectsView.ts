import type { GameEvent } from '@hookbrawl/sim';
import type { Camera, Group, Texture } from 'three';
import { burstFor, createRandom, stepParticles, type Particle } from './particles';
import { createParticlesView } from './particlesView';

export type EffectsView = {
  readonly group: Group;
  /** `events` are the sim events since the previous call, each delivered exactly once. */
  update(events: readonly GameEvent[], dt: number, camera: Camera): void;
  clear(): void;
  dispose(): void;
};

const SEED = 20240613;

/** Turns sim events into short-lived particles: blood on a hook hit, sparks on a bounce, dust on a punch, a wisp on a kill. */
export function createEffectsView(softDot: Texture): EffectsView {
  const view = createParticlesView(softDot);
  const random = createRandom(SEED);
  let particles: readonly Particle[] = [];

  return {
    group: view.group,
    update(events, dt, camera) {
      const born = events.flatMap((event) => burstFor(event, random));
      particles = stepParticles([...particles, ...born], dt);
      view.draw(particles, camera);
    },
    clear() {
      particles = [];
    },
    dispose() {
      view.dispose();
    },
  };
}
