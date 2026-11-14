import { bar, block, post, sheet, type Part } from '../kit/parts';
import type { Vec3 } from '../../space';

/**
 * A suspension bridge in the proportions of the real one, at the scale of a harbour model: it stands close behind
 * the piers and low, so the gameplay camera, which never sees the horizon, looks down on its deck, towers and cables.
 * World units; heights are from the pier decks.
 */
export type BridgeSpec = {
  /** Centre line of the deck, north of the piers. */
  readonly z: number;
  readonly waterLevel: number;
  readonly deckTop: number;
  readonly deckWidth: number;
  readonly towers: readonly [number, number];
  readonly towerTop: number;
  /** Where each side span's cable comes down to the deck. */
  readonly anchors: readonly [number, number];
  /** Where the deck runs off into the fog. */
  readonly ends: readonly [number, number];
};

const LEG = { spread: 1.3, tiers: [{ to: 0.28, x: 0.66, z: 0.72 }, { to: 0.68, x: 0.54, z: 0.6 }, { to: 1, x: 0.44, z: 0.5 }] } as const;
/** Heights of the portal struts, as fractions of the tower above the deck. */
const STRUTS = [0.26, 0.52, 0.76, 0.97] as const;
const CABLE = { thickness: 0.1, clearance: 0.32, step: 1.5, hangerStep: 0.75, hangerThickness: 0.03 } as const;
const TRUSS_DEPTH = 0.55;

function tower(spec: BridgeSpec, x: number): readonly Part[] {
  const foot = spec.waterLevel - 1;
  const height = spec.towerTop - foot;
  const legs = [-LEG.spread, LEG.spread].flatMap((side) =>
    LEG.tiers.map((tier, i) => {
      const from = foot + height * (LEG.tiers[i - 1]?.to ?? 0);
      return block('bridgeSteel', [x - tier.x / 2, x + tier.x / 2], [from, foot + height * tier.to], [spec.z + side - tier.z / 2, spec.z + side + tier.z / 2]);
    }),
  );
  const above = spec.towerTop - spec.deckTop;
  const struts = STRUTS.map((f) => block('bridgeSteel', [x - 0.2, x + 0.2], [spec.deckTop + above * f - 0.34, spec.deckTop + above * f], [spec.z - LEG.spread, spec.z + LEG.spread]));
  const below = spec.deckTop - TRUSS_DEPTH - 0.4;
  const braces = [
    bar('bridgeSteel', { x, y: spec.waterLevel + 0.5, z: spec.z - LEG.spread }, { x, y: below, z: spec.z + LEG.spread }, 0.2),
    bar('bridgeSteel', { x, y: spec.waterLevel + 0.5, z: spec.z + LEG.spread }, { x, y: below, z: spec.z - LEG.spread }, 0.2),
  ];
  return [
    ...legs,
    ...struts,
    ...braces,
    block('concrete', [x - 1.1, x + 1.1], [foot, spec.waterLevel + 0.45], [spec.z - 2.3, spec.z + 2.3]),
    post('beacon', { radius: 0.09, height: 0.22, sides: 6 }, { x, y: spec.towerTop, z: spec.z - LEG.spread }),
    post('beacon', { radius: 0.09, height: 0.22, sides: 6 }, { x, y: spec.towerTop, z: spec.z + LEG.spread }),
  ];
}

/** Height of a cable at `x`: a parabola hung between two points, sagging to `low` at its lowest. */
function sagBetween(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }, low: number): (x: number) => number {
  const mid = (a.x + b.x) / 2;
  const half = (b.x - a.x) / 2;
  return (x) => {
    const t = (x - mid) / half;
    const chord = a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    return chord - (Math.min(a.y, b.y) - low) * (1 - t * t);
  };
}

/** One run of cable with the hangers that carry the deck from it. */
function cableRun(spec: BridgeSpec, from: number, to: number, height: (x: number) => number, z: number): readonly Part[] {
  const steps = Math.max(1, Math.round((to - from) / CABLE.step));
  const point = (i: number): Vec3 => {
    const x = from + ((to - from) * i) / steps;
    return { x, y: height(x), z };
  };
  const cable = Array.from({ length: steps }, (_, i) => bar('bridgeSteel', point(i), point(i + 1), CABLE.thickness));
  const hangers: Part[] = [];
  for (let x = from + CABLE.hangerStep; x < to - 0.01; x += CABLE.hangerStep) {
    const top = height(x);
    if (top - spec.deckTop < 0.12) continue;
    hangers.push(block('bridgeSteel', [x - CABLE.hangerThickness, x + CABLE.hangerThickness], [spec.deckTop, top], [z - CABLE.hangerThickness, z + CABLE.hangerThickness]));
  }
  return [...cable, ...hangers];
}

function cables(spec: BridgeSpec): readonly Part[] {
  const low = spec.deckTop + CABLE.clearance;
  const [west, east] = spec.towers;
  const top = spec.towerTop - 0.05;
  const main = sagBetween({ x: west, y: top }, { x: east, y: top }, low);
  const westSide = sagBetween({ x: spec.anchors[0], y: low }, { x: west, y: top }, low - 0.6);
  const eastSide = sagBetween({ x: east, y: top }, { x: spec.anchors[1], y: low }, low - 0.6);
  return [-1, 1].flatMap((side) => {
    const z = spec.z + side * (spec.deckWidth / 2 + 0.06);
    return [...cableRun(spec, west, east, main, z), ...cableRun(spec, spec.anchors[0], west, westSide, z), ...cableRun(spec, east, spec.anchors[1], eastSide, z)];
  });
}

export function bridge(spec: BridgeSpec): readonly Part[] {
  const half = spec.deckWidth / 2;
  const [from, to] = spec.ends;
  return [
    block('bridgeSteel', [from, to], [spec.deckTop - 0.16, spec.deckTop - 0.02], [spec.z - half, spec.z + half]),
    sheet('road', [from, to], [spec.z - half, spec.z + half], spec.deckTop),
    block('truss', [from, to], [spec.deckTop - TRUSS_DEPTH - 0.16, spec.deckTop - 0.16], [spec.z - half + 0.06, spec.z + half - 0.06]),
    ...[-1, 1].map((side) => block('bridgeSteel', [from, to], [spec.deckTop, spec.deckTop + 0.14], [spec.z + side * half - 0.04, spec.z + side * half + 0.04])),
    ...spec.towers.flatMap((x) => tower(spec, x)),
    ...cables(spec),
  ];
}
