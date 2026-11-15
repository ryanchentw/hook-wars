import { SCENE_IDS, type SceneId, type SceneLook } from '../../render/scenes/types';
import { KNOB_BY_ID, readKnob, refusal, writeKnob, type Knob, type KnobValue } from './knobs';

/** One scene's changed values, keyed by knob id. A colour is held as a number here and written as "#rrggbb" in JSON. */
export type SceneOverrides = Readonly<Record<string, KnobValue>>;
/** Only what differs from the shipped looks; a scene with nothing changed has no entry. */
export type LookOverrides = Readonly<Partial<Record<SceneId, SceneOverrides>>>;

const STORAGE_KEY = 'hookwars.dev.look';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const HEX_DIGITS = 6;

export function setOverride(all: LookOverrides, shipped: SceneLook, knob: Knob, value: KnobValue): LookOverrides {
  const { [knob.id]: _dropped, ...others } = all[shipped.id] ?? {};
  const scene: SceneOverrides = value === readKnob(shipped, knob) ? others : { ...others, [knob.id]: value };
  const { [shipped.id]: _old, ...rest } = all;
  return Object.keys(scene).length === 0 ? rest : { ...rest, [shipped.id]: scene };
}

export function withOverrides<L extends SceneLook>(shipped: L, all: LookOverrides): L {
  return Object.entries(all[shipped.id] ?? {}).reduce((look, [id, value]) => {
    const knob = KNOB_BY_ID.get(id);
    return knob === undefined ? look : writeKnob(look, knob, value);
  }, shipped);
}

const toHex = (value: number): string => `#${value.toString(16).padStart(HEX_DIGITS, '0')}`;

export function toJson(all: LookOverrides): string {
  const readable = Object.fromEntries(
    Object.entries(all).map(([scene, values]) => [
      scene,
      Object.fromEntries(Object.entries(values).map(([id, value]) => [id, KNOB_BY_ID.get(id)?.kind === 'color' && typeof value === 'number' ? toHex(value) : value])),
    ]),
  );
  return JSON.stringify(readable, null, 2);
}

export type Parsed = { readonly ok: true; readonly overrides: LookOverrides } | { readonly ok: false; readonly errors: readonly string[] };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isSceneId = (value: string): value is SceneId => SCENE_IDS.some((id) => id === value);

type Read = { readonly value: KnobValue } | { readonly error: string };

function readValue(scene: string, id: string, raw: unknown): Read {
  const knob = KNOB_BY_ID.get(id);
  if (knob === undefined) return { error: `${scene} ${id} is not something the panel tunes` };
  const value = knob.kind === 'color' && typeof raw === 'string' && HEX_COLOR.test(raw) ? Number.parseInt(raw.slice(1), 16) : raw;
  const why = refusal(knob, value);
  return why === null ? { value: value as KnobValue } : { error: `${scene} ${id} ${why}` };
}

/** Reads what `toJson` writes. Nothing is applied unless all of it is good, and every fault is named. */
export function parseOverrides(text: string): Parsed {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`Not JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
  if (!isRecord(raw)) return { ok: false, errors: ['Expected an object keyed by scene id'] };
  const errors: string[] = [];
  const scenes: [SceneId, SceneOverrides][] = [];
  for (const [scene, values] of Object.entries(raw)) {
    if (!isSceneId(scene)) errors.push(`"${scene}" is not a scene (${SCENE_IDS.join(', ')})`);
    else if (!isRecord(values)) errors.push(`${scene} must be an object of property paths`);
    else {
      const read = Object.entries(values).map(([id, value]) => [id, readValue(scene, id, value)] as const);
      errors.push(...read.flatMap(([, r]) => ('error' in r ? [r.error] : [])));
      const good = read.flatMap(([id, r]) => ('value' in r ? [[id, r.value] as const] : []));
      if (good.length > 0) scenes.push([scene, Object.fromEntries(good)]);
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, overrides: Object.fromEntries(scenes) };
}

export type OverrideStore = { load(): LookOverrides; save(all: LookOverrides): void };

/** Storage can be blocked, and what it holds can be from an older set of knobs: either way the panel starts clean. */
export function createOverrideStore(storage: () => Storage): OverrideStore {
  return {
    load() {
      try {
        const parsed = parseOverrides(storage().getItem(STORAGE_KEY) ?? '{}');
        return parsed.ok ? parsed.overrides : {};
      } catch {
        return {};
      }
    },
    save(all) {
      try {
        if (Object.keys(all).length === 0) storage().removeItem(STORAGE_KEY);
        else storage().setItem(STORAGE_KEY, toJson(all));
      } catch {
        // The overrides still hold for this page; they are just not there after a reload.
      }
    },
  };
}
