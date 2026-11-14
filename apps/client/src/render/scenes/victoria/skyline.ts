import { pick, seeded } from '../kit/canvas';
import { ball, block, post, type Part } from '../kit/parts';
import { VICTORIA_COLORS as C } from './look';

/** World units. The wall of towers stands this far north of the docks, across the open harbour. */
const SHORE_Z = -62;
const WALL = { from: -120, to: 200, rows: 3, rowDepth: 9 };
const CROWN_TONES = [C.neonPink, C.neonCyan, C.neonGold, C.neonGreen, C.neonRed, 0xffffff];
/** Tints laid over the window texture, so no two fronts are lit quite the same colour. */
const FRONT_TONES = [0xffffff, 0xffe0b8, 0xbfd8ff, 0xffd0e0, 0xc8fff0, 0x9aa4c0];

type Tower = { readonly x: number; readonly z: number; readonly width: number; readonly depth: number; readonly height: number; readonly haze: number };

/** A colour with its brightness cut by `haze` (0..1), as distance does to a lit front. */
function dimmed(color: number, haze: number): number {
  const keep = 1 - haze;
  const channel = (shift: number): number => Math.round(((color >> shift) & 0xff) * keep);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

function towerParts(t: Tower, random: () => number): readonly Part[] {
  const slide = { u: Math.floor(random() * 16) / 16, v: Math.floor(random() * 20) / 20 };
  const body = block('tower', [t.x - t.width / 2, t.x + t.width / 2], [-2, t.height], [t.z - t.depth / 2, t.z + t.depth / 2], { tint: dimmed(pick(random, FRONT_TONES), t.haze), slide });
  const crown = pick(random, CROWN_TONES);
  const band = block('crown', [t.x - t.width / 2 - 0.1, t.x + t.width / 2 + 0.1], [t.height, t.height + 0.5], [t.z - t.depth / 2 - 0.1, t.z + t.depth / 2 + 0.1], { tint: crown });
  return random() > 0.45 ? [body, band] : [body];
}

/** Three towers a visitor would look for: a stepped spire with a mast, a blade with two prongs, and a slab banded in light. */
function landmarks(): readonly Part[] {
  const z = SHORE_Z - 4;
  const spire = [0, 1, 2, 3].map((step) => {
    const half = 4 - step * 0.8;
    return block('tower', [52 - half, 52 + half], [step === 0 ? -2 : 34 + step * 6, 40 + step * 6], [z - half, z + half], { slide: { u: step * 0.31, v: step * 0.17 } });
  });
  const prongs = [
    block('tower', [14, 21], [-2, 44], [z - 3, z + 3], { tint: 0xbfd8ff }),
    post('crown', { radius: 0.18, height: 9, sides: 4 }, { x: 15, y: 44, z }, { tint: 0xffffff }),
    post('crown', { radius: 0.18, height: 9, sides: 4 }, { x: 20, y: 44, z }, { tint: 0xffffff }),
  ];
  const banded = [
    block('tower', [84, 92], [-2, 38], [z - 3.5, z + 3.5], { tint: 0xffe0b8 }),
    ...[10, 19, 28, 37].map((y) => block('crown', [83.8, 92.2], [y, y + 0.6], [z - 3.7, z + 3.7], { tint: C.neonCyan })),
  ];
  return [...spire, post('crown', { radius: 0.2, height: 12, sides: 4 }, { x: 52, y: 58, z }, { tint: C.neonRed }), ...prongs, ...banded];
}

/** The far shore: rows of lit towers, a few of them landmarks, with the dark ridge of a peak behind. */
export function skyline(): readonly Part[] {
  const random = seeded(7);
  const towers: Part[] = [];
  for (let row = 0; row < WALL.rows; row += 1) {
    for (let x = WALL.from; x < WALL.to; ) {
      const width = 4 + random() * 5.5;
      const height = 10 + random() * 20 + row * 7 + (random() > 0.85 ? 12 : 0);
      const z = SHORE_Z - row * WALL.rowDepth - random() * 3;
      towers.push(...towerParts({ x: x + width / 2, z, width, depth: 5 + random() * 3, height, haze: row * 0.28 }, random));
      x += width + 0.4 + random() * 1.6;
    }
  }
  const ridge = [-60, 10, 70, 140].map((x, i) => ball('hill', 60, { x, y: -6, z: SHORE_Z - 70 }, { stretch: { x: 1.3, y: 0.55 + (i % 2) * 0.18, z: 0.5 }, detail: 2 }));
  return [...towers, ...landmarks(), ...ridge];
}
