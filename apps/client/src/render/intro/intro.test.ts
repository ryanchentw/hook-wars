import { describe, expect, it } from 'vitest';
import type { CameraPose } from '../camera/framing';
import type { IntroShot } from '../scenes/types';
import { INTRO_TIMING, introFrame, introHaze, introPose, playsIntro, skipIntro, startIntro, stepIntro, type IntroState } from './intro';

const FULL = INTRO_TIMING.full;
const REDUCED = INTRO_TIMING.reduced;

function run(state: IntroState, seconds: number, timing = FULL, dt = 1 / 60): IntroState {
  let current = state;
  for (let t = 0; t < seconds - 1e-9; t += dt) current = stepIntro(current, dt, timing);
  return current;
}

describe('whether a match opens on the establishing shot', () => {
  it('plays for the first match', () => {
    expect(playsIntro(true, null, 'victoria')).toBe(true);
  });

  it('plays again only when the scene changed', () => {
    expect(playsIntro(true, 'victoria', 'golden-gate')).toBe(true);
    expect(playsIntro(true, 'victoria', 'victoria')).toBe(false);
  });

  it('never plays once turned off', () => {
    expect(playsIntro(false, null, 'victoria')).toBe(false);
    expect(playsIntro(false, 'victoria', 'daan')).toBe(false);
  });
});

describe('establishing shot timing', () => {
  it('holds the shot for two to three seconds, then eases to the fight and ends', () => {
    expect(FULL.shot).toBeGreaterThanOrEqual(2);
    expect(FULL.shot).toBeLessThanOrEqual(3);
    expect(run(startIntro(), FULL.shot - 0.1).kind).toBe('shot');
    expect(run(startIntro(), FULL.shot + 0.1).kind).toBe('ease');
    expect(run(startIntro(), FULL.shot + FULL.ease + 0.1).kind).toBe('done');
  });

  it('takes the same time however the frames are sliced', () => {
    const coarse = run(startIntro(), FULL.shot + FULL.ease / 2, FULL, 1 / 20);
    const fine = run(startIntro(), FULL.shot + FULL.ease / 2, FULL, 1 / 240);
    expect(coarse.kind).toBe('ease');
    expect(fine.kind).toBe('ease');
    expect(introFrame(coarse, FULL)!.blend).toBeCloseTo(introFrame(fine, FULL)!.blend, 1);
  });

  it('carries time left over from the shot into the ease', () => {
    const state = stepIntro({ kind: 'shot', age: FULL.shot - 0.01 }, 0.05, FULL);
    expect(state).toEqual({ kind: 'ease', age: expect.closeTo(0.04, 6) });
  });

  it('is over at once when skipped', () => {
    expect(skipIntro()).toEqual({ kind: 'done' });
    expect(introFrame(skipIntro(), FULL)).toBeNull();
  });

  it('stays over', () => {
    expect(stepIntro({ kind: 'done' }, 1, FULL)).toEqual({ kind: 'done' });
  });

  it('cuts instead of flying for people who asked for less motion', () => {
    expect(REDUCED.ease).toBe(0);
    expect(REDUCED.moving).toBe(false);
    const early = introFrame(run(startIntro(), 0.5, REDUCED), REDUCED)!;
    const late = introFrame(run(startIntro(), REDUCED.shot - 0.2, REDUCED), REDUCED)!;
    expect(early.along).toBe(late.along);
    expect(early.blend).toBe(0);
    expect(late.blend).toBe(0);
    expect(run(startIntro(), REDUCED.shot + 0.05, REDUCED).kind).toBe('done');
  });
});

describe('what the establishing shot shows', () => {
  it('drifts along the shot with the title up, then blends to the fight with the title gone', () => {
    const start = introFrame(startIntro(), FULL)!;
    const mid = introFrame({ kind: 'shot', age: FULL.shot / 2 }, FULL)!;
    const easing = introFrame({ kind: 'ease', age: FULL.ease / 2 }, FULL)!;
    expect(start.along).toBe(0);
    expect(start.blend).toBe(0);
    expect(mid.along).toBeGreaterThan(start.along);
    expect(mid.title).toBe(1);
    expect(easing.blend).toBeGreaterThan(0);
    expect(easing.blend).toBeLessThan(1);
    expect(easing.title).toBeLessThan(mid.title);
    expect(introFrame({ kind: 'done' }, FULL)).toBeNull();
  });

  it('fades the title in rather than popping it', () => {
    expect(introFrame(startIntro(), FULL)!.title).toBe(0);
    expect(introFrame({ kind: 'shot', age: 0.6 }, FULL)!.title).toBe(1);
  });
});

describe('the camera during the establishing shot', () => {
  const shot: IntroShot = {
    from: { position: { x: 0, y: 2, z: 50 }, target: { x: 0, y: 2, z: 0 }, fovDeg: 40 },
    to: { position: { x: 10, y: 4, z: 40 }, target: { x: 10, y: 2, z: 0 }, fovDeg: 40 },
    haze: 3,
  };
  const gameplay: CameraPose = { position: { x: 36, y: 41, z: 52 }, target: { x: 36, y: 0, z: 20 }, fovDeg: 36, aspect: 16 / 9 };

  it('starts on the first pose and keeps the viewport aspect', () => {
    const pose = introPose(shot, gameplay, { along: 0, blend: 0, title: 0 });
    expect(pose.position).toEqual(shot.from.position);
    expect(pose.target).toEqual(shot.from.target);
    expect(pose.fovDeg).toBe(40);
    expect(pose.aspect).toBe(gameplay.aspect);
  });

  it('lands exactly on the gameplay camera', () => {
    expect(introPose(shot, gameplay, { along: 1, blend: 1, title: 0 })).toEqual(gameplay);
  });

  it('thickens the fog for the shot and thins it back as the camera comes down', () => {
    expect(introHaze(shot, { along: 0.5, blend: 0, title: 1 })).toBe(3);
    expect(introHaze(shot, { along: 1, blend: 0.5, title: 0 })).toBeCloseTo(2);
    expect(introHaze(shot, { along: 1, blend: 1, title: 0 })).toBe(1);
    expect(introHaze(shot, null)).toBe(1);
  });

  it('passes between the two on the way', () => {
    const pose = introPose(shot, gameplay, { along: 1, blend: 0.5, title: 0 });
    expect(pose.position.y).toBeCloseTo((4 + 41) / 2);
    expect(pose.fovDeg).toBeCloseTo(38);
  });
});
