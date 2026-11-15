import { describe, expect, it } from 'vitest';
import { SCENES } from '../../render/scenes/registry';
import { KNOB_BY_ID } from './knobs';
import { createOverrideStore, parseOverrides, setOverride, toJson, withOverrides, type LookOverrides } from './overrides';

const knob = (id: string) => KNOB_BY_ID.get(id)!;
const victoria = SCENES.victoria;

describe('setOverride', () => {
  it('records a value that differs from the shipped one, without touching what it was given', () => {
    const none: LookOverrides = {};
    const next = setOverride(none, victoria, knob('atmosphere.exposure'), 2);
    expect(next).toEqual({ victoria: { 'atmosphere.exposure': 2 } });
    expect(none).toEqual({});
  });

  it('forgets a value set back to the shipped one, and a scene left with none', () => {
    const changed = setOverride({}, victoria, knob('bloom.on'), !victoria.bloom.on);
    expect(setOverride(changed, victoria, knob('bloom.on'), victoria.bloom.on)).toEqual({});
  });
});

describe('withOverrides', () => {
  it('lays a scene\'s overrides over its look and leaves other scenes\' out', () => {
    const overrides: LookOverrides = { victoria: { 'atmosphere.exposure': 2, 'water.color': 0x112233 }, daan: { 'bloom.strength': 3 } };
    const tuned = withOverrides(victoria, overrides);
    expect(tuned.atmosphere.exposure).toBe(2);
    expect(tuned.water.color).toBe(0x112233);
    expect(tuned.bloom).toBe(victoria.bloom);
  });

  it('is the shipped look itself when nothing is overridden', () => {
    expect(withOverrides(victoria, { daan: { 'bloom.strength': 3 } })).toBe(victoria);
  });
});

describe('toJson and parseOverrides', () => {
  const overrides: LookOverrides = { victoria: { 'atmosphere.exposure': 1.4, 'water.color': 0x0a2233, 'bloom.on': false } };

  it('writes colours as hex strings, keyed by scene id then property path', () => {
    expect(JSON.parse(toJson(overrides))).toEqual({ victoria: { 'atmosphere.exposure': 1.4, 'water.color': '#0a2233', 'bloom.on': false } });
  });

  it('reads back what it wrote', () => {
    expect(parseOverrides(toJson(overrides))).toEqual({ ok: true, overrides });
  });

  it('refuses text that is not JSON, or not an object of scenes', () => {
    expect(parseOverrides('{nope')).toMatchObject({ ok: false });
    expect(parseOverrides('[1]')).toMatchObject({ ok: false });
    expect(parseOverrides('{"victoria": 3}')).toMatchObject({ ok: false });
  });

  it('names every unknown scene, unknown property and misfit value, and applies none of it', () => {
    const result = parseOverrides(JSON.stringify({ atlantis: {}, victoria: { 'atmosphere.exposure': 40, 'water.colour': '#fff', 'water.color': 'blue', 'bloom.on': 'yes' } }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(5);
    expect(result.errors.join('\n')).toMatch(/atlantis/);
    expect(result.errors.join('\n')).toMatch(/victoria atmosphere\.exposure must be from 0\.2 to 3/);
    expect(result.errors.join('\n')).toMatch(/water\.colour is not something the panel tunes/);
  });
});

describe('createOverrideStore', () => {
  const memory = (initial: string | null): Storage => {
    let held = initial;
    return { getItem: () => held, setItem: (_k: string, v: string) => void (held = v), removeItem: () => void (held = null) } as unknown as Storage;
  };

  it('loads what it saved', () => {
    const storage = memory(null);
    const store = createOverrideStore(() => storage);
    store.save({ daan: { 'bloom.strength': 1.5 } });
    expect(createOverrideStore(() => storage).load()).toEqual({ daan: { 'bloom.strength': 1.5 } });
  });

  it('starts empty when storage is blocked or holds something it cannot read', () => {
    expect(createOverrideStore(() => memory('{"daan":{"bloom.strength":99}}')).load()).toEqual({});
    const blocked = createOverrideStore(() => {
      throw new Error('blocked');
    });
    expect(blocked.load()).toEqual({});
    expect(() => blocked.save({})).not.toThrow();
  });
});
