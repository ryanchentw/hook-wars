import { css, pick, seeded, type Ctx } from '../kit/canvas';
import type { TextureDef } from '../kit/paint';
import { ball, block, post, type Part } from '../kit/parts';

/** The tower's make-up, in world units: a tapered base, eight flared tiers, a crown and a spire. */
const TOWER = { base: 16, tiers: 8, tier: 5.6, waist: 3.3, flare: 4.3, crown: 5, spire: 11 };

/** The tall tapered tower that stands over the east of the city, far beyond the park, as the establishing shot sees it. */
export function tallTower(x: number, z: number): readonly Part[] {
  const tiers = Array.from({ length: TOWER.tiers }, (_, i) => {
    const y = TOWER.base + i * TOWER.tier;
    return [
      post('towerGlass', { radius: TOWER.waist, topRadius: TOWER.flare, height: TOWER.tier, sides: 4 }, { x, y, z }, { yaw: Math.PI / 4 }),
      post('towerBand', { radius: TOWER.flare * 1.03, height: 0.3, sides: 4 }, { x, y: y + TOWER.tier - 0.3, z }, { yaw: Math.PI / 4 }),
    ];
  }).flat();
  const top = TOWER.base + TOWER.tiers * TOWER.tier;
  return [
    post('towerGlass', { radius: TOWER.flare * 1.15, topRadius: TOWER.waist * 1.05, height: TOWER.base + 2, sides: 4 }, { x, y: -2, z }, { yaw: Math.PI / 4 }),
    ...tiers,
    post('towerGlass', { radius: TOWER.waist * 0.8, topRadius: TOWER.waist * 0.55, height: TOWER.crown, sides: 4 }, { x, y: top, z }, { yaw: Math.PI / 4 }),
    post('towerBand', { radius: 0.5, topRadius: 0.08, height: TOWER.spire, sides: 4 }, { x, y: top + TOWER.crown, z }, { yaw: Math.PI / 4 }),
  ];
}

const CITY_TONES = [0xffffff, 0xe8ecf2, 0xf4efe6, 0xdfe6ee];

/** The city round the park's far side: pale blocks in the haze, and the hills that ring the basin behind them. */
export function cityBeyond(z: number): readonly Part[] {
  const random = seeded(17);
  const blocks: Part[] = [];
  for (let x = -150; x < 260; ) {
    const width = 7 + random() * 12;
    const height = 7 + random() * 16;
    const depth = z - random() * 30;
    const tint = pick(random, CITY_TONES);
    blocks.push(block('city', [x, x + width], [-2, height], [depth - 8, depth], { tint, slide: { u: random(), v: random() } }));
    x += width + 1 + random() * 5;
  }
  const hills = [-120, -20, 90, 210].map((x, i) => ball('hills', 90, { x, y: -30, z: z - 150 }, { stretch: { x: 1.5, y: 0.62 + (i % 2) * 0.12, z: 0.4 }, detail: 2 }));
  return [...blocks, ...hills];
}

/** The outline of the tower from its foot at 0 to its tip at 1, as half-widths. Used for the reflection. */
function outline(): readonly (readonly [number, number])[] {
  const total = TOWER.base + TOWER.tiers * TOWER.tier + TOWER.crown + TOWER.spire;
  const at = (y: number, half: number): readonly [number, number] => [y / total, half / (TOWER.flare * 2.6)];
  const tiers = Array.from({ length: TOWER.tiers }, (_, i) => {
    const y = TOWER.base + i * TOWER.tier;
    return [at(y, TOWER.waist), at(y + TOWER.tier, TOWER.flare)];
  }).flat();
  const top = TOWER.base + TOWER.tiers * TOWER.tier;
  return [at(0, TOWER.flare * 1.15), at(TOWER.base, TOWER.waist * 1.05), ...tiers, at(top, TOWER.waist * 0.8), at(top + TOWER.crown, TOWER.waist * 0.55), at(top + TOWER.crown, 0.4), at(total, 0.05)];
}

/**
 * The tower mirrored in the pond: its foot at the far (top) end of the canvas and its tip towards the viewer,
 * broken into bars by ripples that grow wider as they come nearer.
 */
function drawReflection(ctx: Ctx, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  const points = outline();
  ctx.beginPath();
  points.forEach(([t, half], i) => (i === 0 ? ctx.moveTo(w / 2 - half * w, t * h) : ctx.lineTo(w / 2 - half * w, t * h)));
  [...points].reverse().forEach(([t, half]) => ctx.lineTo(w / 2 + half * w, t * h));
  ctx.closePath();
  const shade = ctx.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, css(0xd6ecea, 0.95));
  shade.addColorStop(1, css(0xd6ecea, 0.55));
  ctx.fillStyle = shade;
  ctx.fill();
  const random = seeded(19);
  ctx.globalCompositeOperation = 'destination-out';
  for (let y = 0; y < h; ) {
    const t = y / h;
    const gap = 1 + random() * (2 + 7 * t);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.35 + random() * 0.5})`;
    ctx.fillRect(0, y, w, gap);
    y += gap + 3 + random() * (6 + 14 * t);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawTowerFace(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = css(0xe8e8e8);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = css(0x8a8a8a, 0.55);
  for (let x = 0; x < w; x += w / 8) ctx.fillRect(x, 0, 2, h);
  for (let y = 0; y < h; y += h / 9) ctx.fillRect(0, y, w, 2);
}

function drawCityBlocks(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = css(0xf2f2f2);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = css(0x8c98a4, 0.5);
  for (let y = 6; y < h; y += h / 12) {
    for (let x = 6; x < w; x += w / 10) ctx.fillRect(x, y, w / 16, h / 22);
  }
}

export const DAAN_FAR_TEXTURES: Readonly<Record<string, TextureDef>> = {
  towerReflection: { width: 256, height: 1024, repeats: false, color: true, draw: drawReflection },
  towerFace: { width: 128, height: 128, repeats: true, color: true, draw: drawTowerFace },
  cityBlocks: { width: 256, height: 256, repeats: true, color: true, draw: drawCityBlocks },
};
