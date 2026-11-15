import { createStore, type Store } from '../app/store';

export type AudioSettings = {
  /** 0 to 1, as the slider shows it. */
  readonly music: number;
  readonly effects: number;
  readonly muted: boolean;
};

export const DEFAULT_SETTINGS: AudioSettings = { music: 0.5, effects: 0.8, muted: false };

const KEY = 'hookwars.audio';
/** Loudness grows with the square of the slider, so its middle sounds like the middle. */
const VOLUME_CURVE = 2;

const clampVolume = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

/** Whatever was stored, as settings: anything missing or malformed takes its default. */
export function parseSettings(raw: string | null): AudioSettings {
  let parsed: unknown = null;
  try {
    parsed = raw === null ? null : JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SETTINGS;
  const record = parsed as Record<string, unknown>;
  return {
    music: clampVolume(record.music, DEFAULT_SETTINGS.music),
    effects: clampVolume(record.effects, DEFAULT_SETTINGS.effects),
    muted: record.muted === true,
  };
}

/** The linear gain a slider position stands for. */
export const volumeGain = (volume: number): number => volume ** VOLUME_CURVE;

export type SettingsStore = Pick<Store<AudioSettings>, 'getSnapshot' | 'subscribe' | 'update'>;

/** The settings, remembered across visits. Storage can be blocked or full; the settings then last for this visit only. */
export function createSettingsStore(storage: () => Storage): SettingsStore {
  let raw: string | null = null;
  try {
    raw = storage().getItem(KEY);
  } catch {
    raw = null;
  }
  const store = createStore(parseSettings(raw));
  store.subscribe(() => {
    try {
      storage().setItem(KEY, JSON.stringify(store.getSnapshot()));
    } catch {
      // Nothing to tell the player: the change holds for this visit.
    }
  });
  return store;
}
