import { describe, expect, it } from 'vitest';
import { createSettingsStore, DEFAULT_SETTINGS, parseSettings, volumeGain } from './settings';

describe('parseSettings', () => {
  it('falls back to the defaults for anything missing or malformed', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"music":"loud","effects":0.2}')).toEqual({ ...DEFAULT_SETTINGS, effects: 0.2 });
  });

  it('clamps volumes into range and reads mute only as a boolean', () => {
    expect(parseSettings('{"music":4,"effects":-1,"muted":"yes"}')).toEqual({ music: 1, effects: 0, muted: false });
    expect(parseSettings('{"muted":true}').muted).toBe(true);
  });

  it('keeps music clearly below effects by default', () => {
    expect(DEFAULT_SETTINGS.music).toBeLessThan(DEFAULT_SETTINGS.effects);
  });
});

describe('volumeGain', () => {
  it('is silent at zero and full at one, and bends towards the quiet end', () => {
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(1)).toBe(1);
    expect(volumeGain(0.5)).toBeLessThan(0.5);
  });
});

describe('createSettingsStore', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) } as unknown as Storage;
  };

  it('remembers a change for the next visit', () => {
    const storage = memory();
    createSettingsStore(() => storage).update((s) => ({ ...s, music: 0.1 }));
    expect(createSettingsStore(() => storage).getSnapshot().music).toBe(0.1);
  });

  it('carries on with defaults when storage is blocked', () => {
    const blocked = (): Storage => {
      throw new Error('blocked');
    };
    const store = createSettingsStore(blocked);
    expect(store.getSnapshot()).toEqual(DEFAULT_SETTINGS);
    expect(() => store.update((s) => ({ ...s, muted: true }))).not.toThrow();
    expect(store.getSnapshot().muted).toBe(true);
  });
});
