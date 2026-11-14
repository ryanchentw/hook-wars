import { Color, DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three';
import { COLORS } from './theme';

const BYTE = 255;

function dataTexture(size: number, fill: (u: number, v: number) => readonly [number, number, number, number]): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const texel = fill(x / size, y / size);
      data.set(texel.map((c) => Math.round(Math.min(1, Math.max(0, c)) * BYTE)), (y * size + x) * 4);
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** A soft round dot, white with falling alpha: the sprite behind every particle and torch glow. */
export function createSoftDot(): DataTexture {
  const texture = dataTexture(64, (u, v) => {
    const r = Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2);
    const a = (1 - r) ** 2;
    return [1, 1, 1, a];
  });
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export const WATER_NORMAL_STEEPNESS = 6;

/** Lattice periods (cells per tile) and weights of the swell's octaves. Whole periods make the pattern tile. */
const SWELL_OCTAVES: readonly { readonly cells: number; readonly weight: number }[] = [
  { cells: 3, weight: 1 },
  { cells: 7, weight: 0.45 },
  { cells: 13, weight: 0.2 },
];

function latticeValue(ix: number, iy: number, cells: number): number {
  return hash(((ix % cells) + cells) % cells, (((iy % cells) + cells) % cells) + cells * 17);
}

/** Smooth value noise that repeats every `cells` lattice cells. */
function tilingNoise(u: number, v: number, cells: number): number {
  const x = u * cells;
  const y = v * cells;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const top = latticeValue(ix, iy, cells) * (1 - sx) + latticeValue(ix + 1, iy, cells) * sx;
  const bottom = latticeValue(ix, iy + 1, cells) * (1 - sx) + latticeValue(ix + 1, iy + 1, cells) * sx;
  return top * (1 - sy) + bottom * sy;
}

function swellHeight(u: number, v: number): number {
  return SWELL_OCTAVES.reduce((sum, o) => sum + tilingNoise(u, v, o.cells) * o.weight, 0);
}

/**
 * Tangent-space normals of a slow, irregular swell for the canal. The slopes are stored exaggerated by
 * `WATER_NORMAL_STEEPNESS` to use the whole 8-bit range (gentle slopes stored directly quantise into flat
 * facets that glint as blocks); the material scales them back down.
 */
export function createWaterNormals(): DataTexture {
  const size = 256;
  const step = 1 / size;
  const texture = dataTexture(size, (u, v) => {
    const dx = (swellHeight(u + step, v) - swellHeight(u - step, v)) * WATER_NORMAL_STEEPNESS * size * 0.02;
    const dy = (swellHeight(u, v + step) - swellHeight(u, v - step)) * WATER_NORMAL_STEEPNESS * size * 0.02;
    const len = Math.hypot(dx, dy, 1);
    return [0.5 - dx / len / 2, 0.5 - dy / len / 2, 0.5 + 1 / len / 2, 1];
  });
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  // Far water repeats the pattern many times per pixel; without mipmaps it shimmers into noise.
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  return texture;
}

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Blotchy rust with darker streaks running down, wrapped round the buoy. */
export function createRust(): DataTexture {
  const base = new Color(COLORS.rust);
  const dark = new Color(COLORS.rustDark);
  const bright = new Color(COLORS.rustBright);
  const size = 64;
  const texture = dataTexture(size, (u, v) => {
    const x = Math.floor(u * size);
    const y = Math.floor(v * size);
    const blotch = hash(Math.floor(x / 5), Math.floor(y / 7));
    const streak = hash(x, 0) * (1 - v);
    const grain = hash(x, y);
    const c = base.clone().lerp(bright, blotch * 0.55).lerp(dark, Math.min(1, streak * 0.9 + grain * 0.25));
    return [c.r, c.g, c.b, 1];
  });
  texture.wrapS = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
