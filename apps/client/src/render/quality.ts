import { createStore } from '../app/store';

export const QUALITIES = ['high', 'low'] as const;
export type Quality = (typeof QUALITIES)[number];

/** The parts of the picture that cost a pass of their own. Low draws the scene once, straight to the screen. */
export const QUALITY_FEATURES: Readonly<Record<Quality, { readonly bloom: boolean; readonly reflection: boolean }>> = {
  high: { bloom: true, reflection: true },
  low: { bloom: false, reflection: false },
};

export const QUALITY_LABELS: Readonly<Record<Quality, string>> = { high: 'High', low: 'Low' };

/** What can be read off a WebGL context for nothing, before a frame is drawn. */
export type Capabilities = { readonly renderer: string; readonly maxTextureSize: number; readonly cores: number };

/** Renderers that draw on the CPU: a second pass over the scene costs them a frame each. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;
const MIN_CORES = 4;
const MIN_TEXTURE_SIZE = 4096;
const STORAGE_KEY = 'hookwars.quality';
/** In the address, `?quality=low` or `?quality=high` sets it for one visit without remembering it. */
export const QUALITY_PARAM = 'quality';

export function parseQuality(raw: string | null): Quality | null {
  return QUALITIES.find((q) => q === raw) ?? null;
}

export function autoQuality({ renderer, maxTextureSize, cores }: Capabilities): Quality {
  const weak = SOFTWARE_RENDERER.test(renderer) || cores < MIN_CORES || maxTextureSize < MIN_TEXTURE_SIZE;
  return weak ? 'low' : 'high';
}

export type QualityInputs = { readonly asked: string | null; readonly stored: string | null; readonly capabilities: Capabilities };

export function chooseQuality({ asked, stored, capabilities }: QualityInputs): Quality {
  return parseQuality(asked) ?? parseQuality(stored) ?? autoQuality(capabilities);
}

export type QualitySetting = {
  subscribe(onChange: () => void): () => void;
  getSnapshot(): Quality;
  /** The player's own choice: applied at once and remembered. */
  choose(quality: Quality): void;
};

export type QualityDeps = { readonly storage: () => Storage; readonly asked: string | null; readonly capabilities: Capabilities };

/** Storage can be blocked or full; the choice then lasts the visit. */
export function createQualitySetting({ storage, asked, capabilities }: QualityDeps): QualitySetting {
  const stored = ((): string | null => {
    try {
      return storage().getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  })();
  const store = createStore<Quality>(chooseQuality({ asked, stored, capabilities }));
  return {
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
    choose(quality) {
      store.update(() => quality);
      try {
        storage().setItem(STORAGE_KEY, quality);
      } catch {
        // Nothing to tell the player: the choice still holds for this visit.
      }
    },
  };
}
