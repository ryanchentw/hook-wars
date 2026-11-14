import type { GameEvent, GrappleId, HookId, PlayerId } from '@hookbrawl/sim';
import { describe, expect, it } from 'vitest';
import { IMPACTS, impactsOf, type Fighter, type Impact } from '../impact/impacts';
import { simToWorld } from '../space';
import { MAX_PARTICLES, burstFor, createRandom, impactBursts, stepParticles, type Particle } from './particles';

const at = { x: 1200, y: 600 };
const hookId = 'h1' as HookId;
const a = 'a' as PlayerId;
const b = 'b' as PlayerId;
const hit = (damage: number): GameEvent => ({ kind: 'hookHit', hookId, ownerId: a, targetId: b, damage, ally: damage === 0, at });
const swing: GameEvent = { kind: 'melee', attackerId: a, targetId: b, damage: 110, at };
/** `a` stands west of `b`, so a blow from `a` travels along +x. */
const positionOf = (id: PlayerId): { x: number; y: number } => (id === a ? { x: at.x - 80, y: at.y } : at);
const fighterOf = (id: PlayerId): Fighter => ({ pos: positionOf(id), team: id === a ? 'west' : 'east' });
const impactOf = (event: GameEvent): Impact => impactsOf([event], fighterOf, a, IMPACTS)[0]!;

describe('burstFor', () => {
  it('answers each kind of event with its own kind of particle', () => {
    const random = createRandom(1);
    const kinds = (event: GameEvent): readonly string[] => [...new Set(burstFor(event, random).map((p) => p.kind))];
    expect(kinds({ kind: 'hookBounce', hookId, at })).toEqual(['spark']);
    expect(kinds({ kind: 'kill', killerId: a, victimId: b, assistIds: [], at })).toEqual(['wisp']);
    expect(kinds({ kind: 'grappleLand', grappleId: 'g1' as GrappleId, at })).toEqual(['dust']);
    expect(kinds({ kind: 'grappleArrive', playerId: a, at })).toEqual(['dust']);
  });

  it('puffs where a grapple head bites and kicks dust up around a landing, at ground level', () => {
    const random = createRandom(4);
    const ground = simToWorld(at);
    const near = (p: Particle): boolean => Math.hypot(p.position.x - ground.x, p.position.z - ground.z) < 1.5;
    const puff = burstFor({ kind: 'grappleLand', grappleId: 'g1' as GrappleId, at }, random);
    const dust = burstFor({ kind: 'grappleArrive', playerId: a, at }, random);
    expect(puff.length).toBeGreaterThan(0);
    expect(dust.length).toBeGreaterThan(0);
    [...puff, ...dust].forEach((p) => {
      expect(near(p)).toBe(true);
      expect(p.position.y).toBeLessThan(1);
    });
  });

  it('lifts the kill wisp from where the body falls, behind a victim who faced east', () => {
    const kill: GameEvent = { kind: 'kill', killerId: a, victimId: b, assistIds: [], at };
    const facingEast = (id: PlayerId): number | null => (id === b ? 0 : null);
    const wisps = burstFor(kill, createRandom(2), facingEast);
    const mean = wisps.reduce((sum, p) => sum + p.position.x, 0) / wisps.length;
    expect(mean).toBeLessThan(simToWorld(at).x - 0.8);
  });

  it('leaves blows to their impacts, and draws nothing for bookkeeping events', () => {
    const random = createRandom(1);
    expect(burstFor(hit(350), random)).toEqual([]);
    expect(burstFor(swing, random)).toEqual([]);
    expect(burstFor({ kind: 'hookCast', hookId, ownerId: a }, random)).toEqual([]);
    expect(burstFor({ kind: 'respawn', playerId: a }, random)).toEqual([]);
    expect(burstFor({ kind: 'matchEnd', winner: 'west' }, random)).toEqual([]);
  });

  it('keeps every burst modest', () => {
    const random = createRandom(7);
    const events: readonly GameEvent[] = [
      { kind: 'hookBounce', hookId, at },
      { kind: 'kill', killerId: a, victimId: b, assistIds: [], at },
      { kind: 'grappleLand', grappleId: 'g1' as GrappleId, at },
      { kind: 'grappleArrive', playerId: a, at },
    ];
    events.forEach((e) => expect(burstFor(e, random).length).toBeLessThanOrEqual(20));
  });

  it('is repeatable for a given seed', () => {
    const bounce: GameEvent = { kind: 'hookBounce', hookId, at };
    expect(burstFor(bounce, createRandom(3))).toEqual(burstFor(bounce, createRandom(3)));
  });
});

describe('impactBursts', () => {
  const kinds = (particles: readonly Particle[]): readonly string[] => [...new Set(particles.map((p) => p.kind))].sort();

  it('answers a melee blow with a flare, sparks and blood, and a hook with a flare and blood', () => {
    expect(kinds(impactBursts(impactOf(swing), createRandom(1)))).toEqual(['blood', 'flare', 'spark']);
    expect(kinds(impactBursts(impactOf(hit(350)), createRandom(1)))).toEqual(['blood', 'flare']);
  });

  it('starts a melee burst between the fighters, on the victim\'s near side', () => {
    const victim = simToWorld(at);
    const attacker = simToWorld(positionOf(a));
    const [flare] = impactBursts(impactOf(swing), createRandom(1)).filter((p) => p.kind === 'flare');
    expect(flare!.position.x).toBeLessThan(victim.x);
    expect(flare!.position.x).toBeGreaterThan(attacker.x);
    expect(flare!.velocity).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('throws the sparks of a melee blow onwards, the way the swing was going', () => {
    const sparks = impactBursts(impactOf(swing), createRandom(5)).filter((p) => p.kind === 'spark');
    const mean = sparks.reduce((sum, p) => sum + p.velocity.x, 0) / sparks.length;
    expect(mean).toBeGreaterThan(1);
  });

  it('stays modest enough that two brawlers trading blows never hit the particle cap', () => {
    const perBlow = impactBursts(impactOf(swing), createRandom(2));
    const longest = Math.max(...perBlow.map((p) => p.life));
    const blowsAlive = 2 * Math.ceil(longest / 0.7);
    expect(perBlow.length * blowsAlive).toBeLessThan(MAX_PARTICLES / 2);
  });

  it('is repeatable for a given seed', () => {
    expect(impactBursts(impactOf(swing), createRandom(3))).toEqual(impactBursts(impactOf(swing), createRandom(3)));
  });
});

describe('stepParticles', () => {
  const particle = (overrides: Partial<Particle>): Particle => ({
    kind: 'spark',
    position: { x: 0, y: 2, z: 0 },
    velocity: { x: 1, y: 0, z: 0 },
    age: 0,
    life: 1,
    size: 0.2,
    ...overrides,
  });

  it('moves particles, pulls sparks down and lets wisps rise', () => {
    const [spark] = stepParticles([particle({})], 0.1);
    expect(spark!.position.x).toBeGreaterThan(0);
    expect(spark!.velocity.y).toBeLessThan(0);
    const [wisp] = stepParticles([particle({ kind: 'wisp', velocity: { x: 0, y: 0, z: 0 } })], 0.1);
    expect(wisp!.velocity.y).toBeGreaterThan(0);
  });

  it('drops particles that have outlived their life and does not touch its input', () => {
    const old = particle({ age: 0.95 });
    const input = [old, particle({})];
    const out = stepParticles(input, 0.1);
    expect(out).toHaveLength(1);
    expect(old.age).toBe(0.95);
    expect(input).toHaveLength(2);
  });

  it('never keeps more than the cap, shedding the oldest first', () => {
    const many = Array.from({ length: MAX_PARTICLES + 30 }, (_, i) => particle({ size: i }));
    const out = stepParticles(many, 0.01);
    expect(out).toHaveLength(MAX_PARTICLES);
    expect(out[0]!.size).toBe(30);
  });
});
