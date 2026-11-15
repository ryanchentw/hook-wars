import type { SceneLook } from '../../render/scenes/types';

export type KnobValue = number | boolean;

type Base = {
  /** The property's path in the scene's look, dot-joined: also its key in copied JSON. */
  readonly id: string;
  readonly group: string;
  readonly label: string;
};
export type NumberKnob = Base & { readonly kind: 'number'; readonly min: number; readonly max: number; readonly step: number };
export type Knob = NumberKnob | (Base & { readonly kind: 'color' }) | (Base & { readonly kind: 'toggle' });

const num = (group: string, label: string, id: string, min: number, max: number, step: number): Knob => ({ kind: 'number', group, label, id, min, max, step });
const color = (group: string, label: string, id: string): Knob => ({ kind: 'color', group, label, id });
const toggle = (group: string, label: string, id: string): Knob => ({ kind: 'toggle', group, label, id });

/** Everything the panel can change, in the order it lists them. `knobs.test.ts` holds every id to a real property of every scene. */
export const KNOBS: readonly Knob[] = [
  num('Atmosphere', 'exposure', 'atmosphere.exposure', 0.2, 3, 0.01),
  color('Atmosphere', 'fog colour', 'atmosphere.fog.color'),
  num('Atmosphere', 'fog density', 'atmosphere.fog.density', 0, 0.03, 0.0001),
  num('Atmosphere', 'vignette', 'atmosphere.vignette', 0, 1, 0.01),
  num('Lights', 'key intensity', 'lights.key.intensity', 0, 8, 0.05),
  color('Lights', 'key colour', 'lights.key.color'),
  num('Lights', 'fill intensity', 'lights.fill.intensity', 0, 5, 0.05),
  color('Lights', 'fill sky', 'lights.fill.sky'),
  color('Lights', 'fill ground', 'lights.fill.ground'),
  color('Water', 'colour', 'water.color'),
  num('Water', 'roughness', 'water.roughness', 0, 1, 0.01),
  toggle('Water', 'reflection', 'water.reflection.on'),
  num('Water', 'reflection strength', 'water.reflection.strength', 0, 1, 0.01),
  num('Water', 'ripple distortion', 'water.reflection.distortion', 0, 0.2, 0.001),
  toggle('Bloom', 'bloom', 'bloom.on'),
  num('Bloom', 'strength', 'bloom.strength', 0, 3, 0.01),
  num('Bloom', 'radius', 'bloom.radius', 0, 1, 0.01),
  num('Bloom', 'threshold', 'bloom.threshold', 0, 3, 0.01),
  toggle('Fighter rim', 'rim light', 'fighterRim.on'),
  num('Fighter rim', 'strength', 'fighterRim.strength', 0, 6, 0.05),
  color('Fighter rim', 'colour', 'fighterRim.color'),
  num('Fighter rim', 'edge power', 'fighterRim.power', 0.5, 8, 0.05),
  num('Fighter rim', 'team colour mix', 'fighterRim.team', 0, 1, 0.01),
  num('Fog of war', 'veil opacity', 'fogOfWar.opacity', 0, 1, 0.01),
];

export const KNOB_BY_ID: ReadonlyMap<string, Knob> = new Map(KNOBS.map((knob) => [knob.id, knob]));

const MAX_COLOR = 0xffffff;

/** Why `value` cannot be this knob's, in words, or null when it can. */
export function refusal(knob: Knob, value: unknown): string | null {
  switch (knob.kind) {
    case 'toggle':
      return typeof value === 'boolean' ? null : 'must be true or false';
    case 'color':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_COLOR ? null : 'must be a colour like "#1fe0ff"';
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'must be a number';
      return value >= knob.min && value <= knob.max ? null : `must be from ${knob.min} to ${knob.max}`;
  }
}

type Bag = Readonly<Record<string, unknown>>;

function readPath(from: unknown, keys: readonly string[]): unknown {
  return keys.reduce<unknown>((at, key) => (typeof at === 'object' && at !== null ? (at as Bag)[key] : undefined), from);
}

function writePath(into: unknown, keys: readonly string[], value: unknown): unknown {
  const [key, ...rest] = keys;
  if (key === undefined) return value;
  const bag = typeof into === 'object' && into !== null ? (into as Bag) : {};
  return { ...bag, [key]: writePath(bag[key], rest, value) };
}

export function readKnob(look: SceneLook, knob: Knob): KnobValue {
  const value = readPath(look, knob.id.split('.'));
  if (typeof value !== 'number' && typeof value !== 'boolean') throw new Error(`The look of ${look.id} has no value at ${knob.id}`);
  return value;
}

/** A copy of `look` with the knob's property replaced; everything else, a scene's builders included, is carried over. */
export function writeKnob<L extends SceneLook>(look: L, knob: Knob, value: KnobValue): L {
  return writePath(look, knob.id.split('.'), value) as L;
}
