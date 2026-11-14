import { TUNING } from '@hookbrawl/sim';
import type { GameEvent, PlayerId, Vec2 } from '@hookbrawl/sim';
import { contactPoint, type Impact } from '../impact/impacts';
import { simToWorld, type Vec3 } from '../space';
import { COLORS, SIZES } from '../theme';

export type ParticleKind = 'blood' | 'spark' | 'flare' | 'wisp' | 'dust';

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
  // One still, swelling dot at the point of contact: the white of the blow itself.
  flare: { color: COLORS.flare, glows: true, intensity: 2.2, gravity: 0, drag: 0, endScale: 1.7 },
  wisp: { color: COLORS.wisp, glows: true, intensity: 1, gravity: -2.6, drag: 0.8, endScale: 0.35 },
  // Billows out and slows hard, so it hangs where it was kicked up instead of flying off like debris.
  dust: { color: COLORS.dust, glows: false, intensity: 1, gravity: -0.6, drag: 3.2, endScale: 2.2 },
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
  /** Extra speed along the blow's heading, so the spray carries on the way the weapon was going. */
  readonly along: Range;
};

const STILL: Range = [0, 0];
const CHEST = SIZES.chainHeight;

const BURSTS = {
  hookHit: { kind: 'blood', count: 14, height: CHEST, speed: [2.5, 7], lift: [0.2, 1], life: [0.45, 0.8], size: [0.5, 0.9], spread: 0.4, along: STILL },
  hookFlare: { kind: 'flare', count: 1, height: CHEST, speed: STILL, lift: STILL, life: [0.12, 0.12], size: [3.2, 3.2], spread: 0, along: STILL },
  hookBounce: { kind: 'spark', count: 14, height: CHEST, speed: [4, 11], lift: [0.1, 0.9], life: [0.25, 0.5], size: [0.55, 1], spread: 0.15, along: STILL },
  meleeFlare: { kind: 'flare', count: 1, height: CHEST, speed: STILL, lift: STILL, life: [0.1, 0.1], size: [2.3, 2.3], spread: 0, along: STILL },
  meleeSparks: { kind: 'spark', count: 10, height: CHEST, speed: [2, 6], lift: [0.2, 0.9], life: [0.22, 0.42], size: [0.9, 1.5], spread: 0.2, along: [4, 9] },
  meleeBlood: { kind: 'blood', count: 7, height: CHEST, speed: [1.5, 4], lift: [0.3, 1], life: [0.35, 0.6], size: [0.8, 1.3], spread: 0.3, along: [3, 6] },
  grappleLand: { kind: 'dust', count: 9, height: 0.3, speed: [2, 4], lift: [0.3, 0.7], life: [0.4, 0.65], size: [1.1, 1.8], spread: 0.4, along: STILL },
  grappleArrive: { kind: 'dust', count: 14, height: 0.3, speed: [3.5, 6.5], lift: [0.1, 0.45], life: [0.45, 0.75], size: [1.3, 2.2], spread: 0.6, along: STILL },
  kill: { kind: 'wisp', count: 16, height: 0.8, speed: [0.3, 1.1], lift: [0.75, 1], life: [1.3, 2.3], size: [1.1, 1.9], spread: 1.3, along: STILL },
} as const satisfies Record<string, Burst>;

export type BurstName = keyof typeof BURSTS;

/** Sim units from the victim's centre, towards the attacker, at which a blow lands: just inside the rim of the body. */
const CONTACT_INSET = TUNING.playerRadius * 0.75;

/** Sim units behind their own facing at which a body felled by the death clip ends up, chest and all. */
const DEATH_FALL = 45;

/** Who the event is about and where the burst should start, given which way each player faces. */
function originOf(event: GameEvent & { readonly at: Vec2 }, facingOf: (id: PlayerId) => number | null): Vec2 {
  if (event.kind !== 'kill') return event.at;
  const facing = facingOf(event.victimId);
  if (facing === null) return event.at;
  return { x: event.at.x - Math.cos(facing) * DEATH_FALL, y: event.at.y - Math.sin(facing) * DEATH_FALL };
}

const FACING_UNKNOWN = (): number | null => null;

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

function emit(burst: Burst, origin: Vec3, heading: number, random: () => number): readonly Particle[] {
  const pick = ([lo, hi]: Range): number => lo + (hi - lo) * random();
  return Array.from({ length: burst.count }, () => {
    const scatter = random() * Math.PI * 2;
    const speed = pick(burst.speed);
    const lift = pick(burst.lift);
    const flat = Math.sqrt(Math.max(0, 1 - lift * lift));
    const along = pick(burst.along);
    return {
      kind: burst.kind,
      position: {
        x: origin.x + (random() - 0.5) * burst.spread,
        y: origin.y + (random() - 0.5) * burst.spread,
        z: origin.z + (random() - 0.5) * burst.spread,
      },
      velocity: {
        x: Math.cos(scatter) * flat * speed + Math.cos(heading) * along,
        y: lift * speed,
        z: Math.sin(scatter) * flat * speed + Math.sin(heading) * along,
      },
      age: 0,
      life: pick(burst.life),
      size: pick(burst.size),
    };
  });
}

function burstOf(event: GameEvent): Burst | null {
  switch (event.kind) {
    case 'hookBounce':
      return BURSTS.hookBounce;
    case 'kill':
      return BURSTS.kill;
    case 'grappleLand':
      return BURSTS.grappleLand;
    case 'grappleArrive':
      return BURSTS.grappleArrive;
    // Blows are drawn from their impact, which knows where the fighters stood.
    case 'hookHit':
    case 'melee':
    case 'hookCast':
    case 'respawn':
    case 'matchEnd':
    case 'purchase':
    case 'grappleCast':
      return null;
  }
}

/** `facingOf` is the sim facing of each player, so a kill's wisp can rise from the fallen body rather than its feet. */
export function burstFor(event: GameEvent, random: () => number, facingOf: (id: PlayerId) => number | null = FACING_UNKNOWN): readonly Particle[] {
  const burst = burstOf(event);
  if (burst === null || !('at' in event)) return [];
  return emit(burst, simToWorld(originOf(event, facingOf), burst.height), 0, random);
}

/** Everything a blow throws off, from the point where the weapon met the body. */
export function impactBursts(impact: Impact, random: () => number): readonly Particle[] {
  const contact = contactPoint(impact, CONTACT_INSET);
  return impact.spec.bursts.flatMap((name) => emit(BURSTS[name], simToWorld(contact, BURSTS[name].height), impact.heading, random));
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
