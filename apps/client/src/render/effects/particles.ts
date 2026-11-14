import type { GameEvent } from '@hookbrawl/sim';
import { simToWorld, type Vec3 } from '../space';
import { COLORS, SIZES } from '../theme';

export type ParticleKind = 'blood' | 'spark' | 'dust' | 'wisp';

export type Particle = {
  readonly kind: ParticleKind;
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly age: number;
  readonly life: number;
  /** World-unit diameter at birth. */
  readonly size: number;
};

export type ParticleStyle = {
  readonly color: number;
  readonly glows: boolean;
  /** Brightness multiplier at birth; above 1 burns through the tone mapping like something hot. */
  readonly intensity: number;
  /** Downward acceleration; negative makes the particle rise. */
  readonly gravity: number;
  /** Fraction of velocity lost per second. */
  readonly drag: number;
  /** Size at the end of life relative to birth. */
  readonly endScale: number;
};

export const PARTICLE_STYLES: Readonly<Record<ParticleKind, ParticleStyle>> = {
  blood: { color: COLORS.blood, glows: false, intensity: 1, gravity: 16, drag: 1.2, endScale: 0.25 },
  spark: { color: COLORS.spark, glows: true, intensity: 3, gravity: 20, drag: 2.5, endScale: 0.25 },
  dust: { color: COLORS.dust, glows: false, intensity: 1, gravity: -0.6, drag: 3, endScale: 2.4 },
  wisp: { color: COLORS.wisp, glows: true, intensity: 1, gravity: -2.6, drag: 0.8, endScale: 0.35 },
};

export const MAX_PARTICLES = 160;

type Range = readonly [number, number];
type Burst = {
  readonly kind: ParticleKind;
  readonly count: number;
  readonly height: number;
  readonly speed: Range;
  /** Upward share of the launch speed, before gravity. */
  readonly lift: Range;
  readonly life: Range;
  readonly size: Range;
  readonly spread: number;
};

const BURSTS = {
  hookHit: { kind: 'blood', count: 14, height: SIZES.chainHeight, speed: [2.5, 7], lift: [0.2, 1], life: [0.45, 0.8], size: [0.5, 0.9], spread: 0.4 },
  hookBounce: { kind: 'spark', count: 14, height: SIZES.chainHeight, speed: [4, 11], lift: [0.1, 0.9], life: [0.25, 0.5], size: [0.55, 1], spread: 0.15 },
  melee: { kind: 'dust', count: 6, height: 1.9, speed: [0.8, 2.2], lift: [0, 0.5], life: [0.3, 0.5], size: [0.9, 1.4], spread: 0.5 },
  kill: { kind: 'wisp', count: 16, height: 0.8, speed: [0.3, 1.1], lift: [0.75, 1], life: [1.3, 2.3], size: [1.1, 1.9], spread: 1.3 },
} as const satisfies Record<string, Burst>;

/** Small seeded generator (mulberry32) so effects are repeatable in tests. */
export function createRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function emit(burst: Burst, origin: Vec3, random: () => number): readonly Particle[] {
  const pick = ([lo, hi]: Range): number => lo + (hi - lo) * random();
  return Array.from({ length: burst.count }, () => {
    const heading = random() * Math.PI * 2;
    const speed = pick(burst.speed);
    const lift = pick(burst.lift);
    const flat = Math.sqrt(Math.max(0, 1 - lift * lift));
    return {
      kind: burst.kind,
      position: {
        x: origin.x + (random() - 0.5) * burst.spread,
        y: origin.y + (random() - 0.5) * burst.spread,
        z: origin.z + (random() - 0.5) * burst.spread,
      },
      velocity: { x: Math.cos(heading) * flat * speed, y: lift * speed, z: Math.sin(heading) * flat * speed },
      age: 0,
      life: pick(burst.life),
      size: pick(burst.size),
    };
  });
}

function burstOf(event: GameEvent): Burst | null {
  switch (event.kind) {
    case 'hookHit':
      return event.damage > 0 ? BURSTS.hookHit : null;
    case 'hookBounce':
      return BURSTS.hookBounce;
    case 'melee':
      return BURSTS.melee;
    case 'kill':
      return BURSTS.kill;
    case 'hookCast':
    case 'respawn':
    case 'matchEnd':
    case 'purchase':
    case 'grappleCast':
    case 'grappleLand':
    case 'grappleArrive':
      return null;
  }
}

export function burstFor(event: GameEvent, random: () => number): readonly Particle[] {
  const burst = burstOf(event);
  if (burst === null || !('at' in event)) return [];
  return emit(burst, simToWorld(event.at, burst.height), random);
}

export function stepParticles(particles: readonly Particle[], dt: number): readonly Particle[] {
  const alive = particles.flatMap((p): readonly Particle[] => {
    const age = p.age + dt;
    if (age >= p.life) return [];
    const style = PARTICLE_STYLES[p.kind];
    const keep = Math.max(0, 1 - style.drag * dt);
    const velocity = { x: p.velocity.x * keep, y: p.velocity.y * keep - style.gravity * dt, z: p.velocity.z * keep };
    const position = { x: p.position.x + velocity.x * dt, y: p.position.y + velocity.y * dt, z: p.position.z + velocity.z * dt };
    return [{ ...p, age, velocity, position }];
  });
  return alive.length > MAX_PARTICLES ? alive.slice(alive.length - MAX_PARTICLES) : alive;
}
