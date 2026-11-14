/** A small seeded generator, so a painted texture comes out the same on every load. Returns values in [0, 1). */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function css(hex: number, alpha = 1): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function pick<T>(random: () => number, from: readonly T[]): T {
  const chosen = from[Math.floor(random() * from.length)];
  if (chosen === undefined) throw new Error('Cannot pick from an empty list');
  return chosen;
}

export type Ctx = CanvasRenderingContext2D;

export function fill(ctx: Ctx, w: number, h: number, color: number, alpha = 1): void {
  ctx.fillStyle = css(color, alpha);
  ctx.fillRect(0, 0, w, h);
}

/** Scatters soft-edged blots over the canvas: stains, wear, clumps of grass. */
export type Blots = {
  readonly count: number;
  /** Smallest and largest, in pixels. */
  readonly radius: readonly [number, number];
  readonly color: number;
  readonly alpha: number;
  readonly random: () => number;
};

export function blots(ctx: Ctx, w: number, h: number, spec: Blots): void {
  for (let i = 0; i < spec.count; i += 1) {
    const x = spec.random() * w;
    const y = spec.random() * h;
    const r = spec.radius[0] + spec.random() * (spec.radius[1] - spec.radius[0]);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, css(spec.color, spec.alpha));
    gradient.addColorStop(1, css(spec.color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Fine per-texel grain, so a flat colour does not look like plastic. `strength` is the largest change to a 0..255 channel. */
export function grain(ctx: Ctx, w: number, h: number, strength: number, random: () => number): void {
  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (random() - 0.5) * 2 * strength;
    data[i] = Math.min(255, Math.max(0, (data[i] ?? 0) + n));
    data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] ?? 0) + n));
    data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] ?? 0) + n));
  }
  ctx.putImageData(image, 0, 0);
}

export type Bricks = {
  /** Size of one brick or plank, in pixels. */
  readonly across: number;
  readonly along: number;
  /** Rows are offset by this fraction of a brick from the row before. */
  readonly stagger: number;
  readonly joint: number;
  readonly jointColor: number;
  readonly tones: readonly number[];
  readonly random: () => number;
};

/** Courses of bricks, pavers or planks, each a slightly different tone, with dark joints. `across` runs along x. */
export type Area = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

export function courses(ctx: Ctx, area: Area, spec: Bricks): void {
  ctx.fillStyle = css(spec.jointColor);
  ctx.fillRect(area.x, area.y, area.w, area.h);
  const rows = Math.ceil(area.h / spec.along);
  for (let row = 0; row < rows; row += 1) {
    const shift = ((row * spec.stagger) % 1) * spec.across;
    for (let x = area.x - shift; x < area.x + area.w; x += spec.across) {
      const y = area.y + row * spec.along;
      const x0 = Math.max(area.x, x + spec.joint / 2);
      const x1 = Math.min(area.x + area.w, x + spec.across - spec.joint / 2);
      const y1 = Math.min(area.y + area.h, y + spec.along - spec.joint / 2);
      if (x1 <= x0) continue;
      ctx.fillStyle = css(pick(spec.random, spec.tones));
      ctx.fillRect(x0, y + spec.joint / 2, x1 - x0, y1 - y - spec.joint / 2);
    }
  }
}
