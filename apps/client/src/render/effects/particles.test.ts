import type { GameEvent, HookId, PlayerId } from '@hookbrawl/sim';
import { describe, expect, it } from 'vitest';
import { MAX_PARTICLES, burstFor, createRandom, stepParticles, type Particle } from './particles';

const at = { x: 1200, y: 600 };
const hookId = 'h1' as HookId;
const a = 'a' as PlayerId;
const b = 'b' as PlayerId;
const hit = (damage: number): GameEvent => ({ kind: 'hookHit', hookId, ownerId: a, targetId: b, damage, ally: damage === 0, at });

describe('burstFor', () => {
  it('answers each kind of event with its own kind of particle', () => {
    const random = createRandom(1);
    const kinds = (event: GameEvent): readonly string[] => [...new Set(burstFor(event, random).map((p) => p.kind))];
    expect(kinds(hit(350))).toEqual(['blood']);
    expect(kinds({ kind: 'hookBounce', hookId, at })).toEqual(['spark']);
    expect(kinds({ kind: 'melee', attackerId: a, targetId: b, damage: 110, at })).toEqual(['dust']);
    expect(kinds({ kind: 'kill', killerId: a, victimId: b, at })).toEqual(['wisp']);
  });

  it('draws no blood for a harmless hook on an ally, and nothing for bookkeeping events', () => {
    const random = createRandom(1);
    expect(burstFor(hit(0), random)).toEqual([]);
    expect(burstFor({ kind: 'hookCast', hookId, ownerId: a }, random)).toEqual([]);
    expect(burstFor({ kind: 'respawn', playerId: a }, random)).toEqual([]);
    expect(burstFor({ kind: 'matchEnd', winner: 'west' }, random)).toEqual([]);
  });

  it('keeps every burst modest', () => {
    const random = createRandom(7);
    const events: readonly GameEvent[] = [
      hit(350),
      { kind: 'hookBounce', hookId, at },
      { kind: 'melee', attackerId: a, targetId: b, damage: 110, at },
      { kind: 'kill', killerId: a, victimId: b, at },
    ];
    events.forEach((e) => expect(burstFor(e, random).length).toBeLessThanOrEqual(20));
  });

  it('is repeatable for a given seed', () => {
    expect(burstFor(hit(350), createRandom(3))).toEqual(burstFor(hit(350), createRandom(3)));
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
