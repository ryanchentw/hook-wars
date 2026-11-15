import { describe, expect, it } from 'vitest';
import { SCENES } from '../../render/scenes/registry';
import { SCENE_IDS } from '../../render/scenes/types';
import { KNOBS, readKnob, refusal, writeKnob } from './knobs';

describe('KNOBS', () => {
  it('names a property of the right kind, inside its range, in every shipped scene', () => {
    for (const id of SCENE_IDS) {
      for (const knob of KNOBS) {
        expect(refusal(knob, readKnob(SCENES[id], knob)), `${id} ${knob.id}`).toBeNull();
      }
    }
  });

  it('has no two knobs for one property', () => {
    expect(new Set(KNOBS.map((k) => k.id)).size).toBe(KNOBS.length);
  });
});

describe('writeKnob', () => {
  const exposure = KNOBS.find((k) => k.id === 'atmosphere.exposure')!;
  const fogColor = KNOBS.find((k) => k.id === 'atmosphere.fog.color')!;

  it('returns a changed copy and leaves the shipped look alone', () => {
    const shipped = SCENES.victoria;
    const before = shipped.atmosphere.exposure;
    const tuned = writeKnob(shipped, exposure, 2);
    expect(tuned.atmosphere.exposure).toBe(2);
    expect(shipped.atmosphere.exposure).toBe(before);
    expect(tuned.atmosphere.fog).toBe(shipped.atmosphere.fog);
    expect(tuned.lights).toBe(shipped.lights);
  });

  it('keeps the scene builders, so a tuned theme can still be built', () => {
    const tuned = writeKnob(SCENES.daan, fogColor, 0x123456);
    expect(tuned.atmosphere.fog.color).toBe(0x123456);
    expect(tuned.buildSet).toBe(SCENES.daan.buildSet);
  });
});

describe('refusal', () => {
  it('says why a value does not fit its knob', () => {
    const exposure = KNOBS.find((k) => k.id === 'atmosphere.exposure')!;
    const bloom = KNOBS.find((k) => k.id === 'bloom.on')!;
    const fogColor = KNOBS.find((k) => k.id === 'atmosphere.fog.color')!;
    expect(refusal(exposure, 99)).toMatch(/from 0.2 to 3/);
    expect(refusal(exposure, 'bright')).toMatch(/number/);
    expect(refusal(bloom, 1)).toMatch(/true or false/);
    expect(refusal(fogColor, 0x1000000)).toMatch(/colour/);
    expect(refusal(fogColor, 0x0b0d1c)).toBeNull();
  });
});
