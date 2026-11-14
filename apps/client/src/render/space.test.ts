import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { MODEL_FORWARD, WORLD_PER_SIM, facingToYaw, simToWorld, toWorldLength, worldToSim } from './space';

describe('sim to world mapping', () => {
  it('puts sim x on world x and sim y on world z, so screen-down stays +y', () => {
    const p = simToWorld({ x: 1000, y: 250 });
    expect(p).toEqual({ x: 1000 * WORLD_PER_SIM, y: 0, z: 250 * WORLD_PER_SIM });
  });

  it('lifts a point by a height given in world units', () => {
    expect(simToWorld({ x: 0, y: 0 }, 1.5).y).toBe(1.5);
  });

  it('round-trips a ground point', () => {
    const back = worldToSim(simToWorld({ x: 1234.5, y: 321.25 }));
    expect(back.x).toBeCloseTo(1234.5);
    expect(back.y).toBeCloseTo(321.25);
  });

  it('scales lengths with the same constant', () => {
    expect(toWorldLength(34)).toBeCloseTo(34 * WORLD_PER_SIM);
  });
});

describe('facingToYaw', () => {
  const forwardAfterYaw = (facing: number): Vector3 =>
    new Vector3(MODEL_FORWARD.x, MODEL_FORWARD.y, MODEL_FORWARD.z).applyAxisAngle(new Vector3(0, 1, 0), facingToYaw(facing));

  it.each([
    ['east (0 rad)', 0],
    ['south, towards the camera', Math.PI / 2],
    ['west', Math.PI],
    ['north', -Math.PI / 2],
    ['a diagonal', 0.7],
  ])('turns the model to look along its sim facing: %s', (_label, facing) => {
    const forward = forwardAfterYaw(facing);
    const expected = simToWorld({ x: Math.cos(facing), y: Math.sin(facing) });
    expect(forward.x).toBeCloseTo(expected.x / WORLD_PER_SIM);
    expect(forward.y).toBeCloseTo(0);
    expect(forward.z).toBeCloseTo(expected.z / WORLD_PER_SIM);
  });
});
