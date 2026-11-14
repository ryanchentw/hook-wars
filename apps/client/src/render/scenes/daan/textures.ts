import { blots, courses, css, grain, pick, seeded, type Ctx } from '../kit/canvas';
import type { TextureDef } from '../kit/paint';
import { DAAN_COLORS as C } from './look';

/** The ground textures cover one lawn each: 32 by 43.2 world units on a square canvas. */
const SIZE = 2048;
const PX_X = SIZE / 32;
const PX_Z = SIZE / 43.2;
const GRASS = 0x4a6a38;
/** Cool grey setts: a fighter in the west team's orange would sink into red brick. */
const PAVERS = [0x7f7b76, 0x76726d, 0x88847e, 0x7b7772, 0x6f6b67];
const PAVER_JOINT = 0x3d3b39;
const BORDER_BRICK = 0x7d4a3c;
const KERB = 0xb5b1a4;

function turf(ctx: Ctx, w: number, h: number, seed: number): void {
  const random = seeded(seed);
  ctx.fillStyle = css(GRASS);
  ctx.fillRect(0, 0, w, h);
  // Mower stripes: the same grass laid over two ways.
  ctx.fillStyle = css(0x5a7a40, 0.3);
  for (let x = -h; x < w; x += w / 5) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + w / 10, 0);
    ctx.lineTo(x + w / 10 + h * 0.25, h);
    ctx.lineTo(x + h * 0.25, h);
    ctx.fill();
  }
  blots(ctx, w, h, { count: 260, radius: [w * 0.012, w * 0.08], color: 0x33502a, alpha: 0.26, random });
  blots(ctx, w, h, { count: 200, radius: [w * 0.01, w * 0.06], color: 0x7a8f4a, alpha: 0.18, random });
  // Clover and daisies in drifts; worn to the soil where people cut the corner.
  blots(ctx, w, h, { count: 500, radius: [3, 9], color: 0x2c4a26, alpha: 0.35, random });
  blots(ctx, w, h, { count: 240, radius: [2, 4], color: 0xdfe3c8, alpha: 0.5, random });
  blots(ctx, w, h, { count: 18, radius: [w * 0.02, w * 0.05], color: 0x8c8455, alpha: 0.32, random });
  grain(ctx, w, h, 14, random);
}

/** A paved band between two x positions, in world units from the canvas's left edge, kerbed in pale granite. */
function pavedBand(ctx: Ctx, from: number, to: number, seed: number): void {
  const band = { x: from * PX_X, y: 0, w: (to - from) * PX_X, h: SIZE };
  courses(ctx, band, { across: 0.4 * PX_X, along: 0.2 * PX_Z, stagger: 0.5, joint: 2, jointColor: PAVER_JOINT, tones: PAVERS, random: seeded(seed) });
  // A course of red brick inside each granite kerb, as the park's walks have.
  ctx.fillStyle = css(BORDER_BRICK);
  ctx.fillRect(from * PX_X, 0, 0.3 * PX_X, SIZE);
  ctx.fillRect((to - 0.3) * PX_X, 0, 0.3 * PX_X, SIZE);
  ctx.fillStyle = css(KERB);
  ctx.fillRect(from * PX_X - 6, 0, 8, SIZE);
  ctx.fillRect(to * PX_X - 2, 0, 8, SIZE);
}

/** A path of the same pavers along a curve, drawn as a thick stroke. */
function pavedCurve(ctx: Ctx, trace: () => void, width: number): void {
  ctx.lineCap = 'butt';
  ctx.strokeStyle = css(KERB);
  ctx.lineWidth = width * PX_X + 14;
  ctx.beginPath();
  trace();
  ctx.stroke();
  ctx.strokeStyle = css(pick(seeded(3), PAVERS));
  ctx.lineWidth = width * PX_X;
  ctx.beginPath();
  trace();
  ctx.stroke();
  // Joints across the path, close enough to read as courses of pavers.
  ctx.strokeStyle = css(PAVER_JOINT, 0.55);
  ctx.lineWidth = width * PX_X;
  ctx.setLineDash([2, 11]);
  ctx.beginPath();
  trace();
  ctx.stroke();
  ctx.setLineDash([]);
}

/** One lawn. `pondX` is where the pond's edge runs, in world units from the canvas's left edge. */
function drawLawn(ctx: Ctx, pondX: number, seed: number): void {
  turf(ctx, SIZE, SIZE, seed);
  const inward = pondX > 16 ? -1 : 1;
  const x = (offset: number): number => (pondX + inward * offset) * PX_X;
  // A branch path leaves the pond walk, rounds a small circle and runs out to the far side of the lawn.
  pavedCurve(ctx, () => {
    ctx.moveTo(x(3), 30 * PX_Z);
    ctx.bezierCurveTo(x(9), 30 * PX_Z, x(11), 24 * PX_Z, x(17), 22 * PX_Z);
    ctx.bezierCurveTo(x(23), 20 * PX_Z, x(26), 12 * PX_Z, x(33), 9 * PX_Z);
  }, 2.2);
  pavedCurve(ctx, () => ctx.ellipse(x(17), 22 * PX_Z, 3.1 * PX_X, 3.1 * PX_Z, 0, 0, Math.PI * 2), 1.5);
  ctx.fillStyle = css(0x4f7040);
  ctx.beginPath();
  ctx.ellipse(x(17), 22 * PX_Z, 2.3 * PX_X, 2.3 * PX_Z, 0, 0, Math.PI * 2);
  ctx.fill();
  const walk = inward < 0 ? [pondX - 4.3, pondX - 0.9] : [pondX + 0.9, pondX + 4.3];
  pavedBand(ctx, walk[0]!, walk[1]!, seed + 5);
  const random = seeded(seed + 9);
  blots(ctx, SIZE, SIZE, { count: 30, radius: [40, 140], color: 0x20301a, alpha: 0.12, random });
}

function drawGrass(ctx: Ctx, w: number, h: number): void {
  const random = seeded(91);
  ctx.fillStyle = css(GRASS);
  ctx.fillRect(0, 0, w, h);
  blots(ctx, w, h, { count: 70, radius: [w * 0.03, w * 0.14], color: 0x33502a, alpha: 0.26, random });
  blots(ctx, w, h, { count: 50, radius: [w * 0.02, w * 0.1], color: 0x7a8f4a, alpha: 0.18, random });
  blots(ctx, w, h, { count: 120, radius: [2, 6], color: 0x2c4a26, alpha: 0.35, random });
  grain(ctx, w, h, 12, random);
}

function drawPavers(ctx: Ctx, w: number, h: number): void {
  const random = seeded(93);
  courses(ctx, { x: 0, y: 0, w, h }, { across: w / 8, along: h / 16, stagger: 0.5, joint: 2, jointColor: PAVER_JOINT, tones: PAVERS, random });
  grain(ctx, w, h, 8, random);
}

/** Stacked rockery stone: irregular blocks with deep joints and a little moss. */
function drawRockery(ctx: Ctx, w: number, h: number): void {
  const random = seeded(95);
  courses(ctx, { x: 0, y: 0, w, h }, { across: w / 4, along: h / 5, stagger: 0.37, joint: 6, jointColor: 0x3a3a34, tones: [0xd8d5cb, 0xc4c1b6, 0xe2dfd6, 0xb3b0a5], random });
  blots(ctx, w, h, { count: 24, radius: [8, 30], color: 0x4a6a30, alpha: 0.4, random });
  grain(ctx, w, h, 14, random);
}

/** Leaf mass: light and dark dabs, pale enough that the paint colour decides the green. */
function drawFoliage(ctx: Ctx, w: number, h: number): void {
  const random = seeded(97);
  ctx.fillStyle = css(0xbdbdbd);
  ctx.fillRect(0, 0, w, h);
  blots(ctx, w, h, { count: 220, radius: [4, 12], color: 0x555555, alpha: 0.5, random });
  blots(ctx, w, h, { count: 200, radius: [3, 9], color: 0xffffff, alpha: 0.55, random });
}

/** An azalea hedge in flower: green leaf crowded with pink and white blossom. */
function drawBlossom(ctx: Ctx, w: number, h: number): void {
  const random = seeded(99);
  ctx.fillStyle = css(C.shrub);
  ctx.fillRect(0, 0, w, h);
  blots(ctx, w, h, { count: 260, radius: [3, 8], color: C.azalea, alpha: 0.95, random });
  blots(ctx, w, h, { count: 90, radius: [3, 7], color: C.azaleaPale, alpha: 0.95, random });
}

function drawRoofTiles(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = css(0xe6e6e6);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = css(0x777777, 0.8);
  for (let x = 0; x < w; x += w / 6) ctx.fillRect(x, 0, w / 22, h);
  ctx.fillStyle = css(0x555555, 0.5);
  for (let y = 0; y < h; y += h / 4) ctx.fillRect(0, y, w, 2);
}

function drawLilies(ctx: Ctx, w: number, h: number): void {
  const random = seeded(103);
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < 26; i += 1) {
    const x = random() * w;
    const y = random() * h;
    const r = w * (0.02 + random() * 0.035);
    const notch = random() * Math.PI * 2;
    ctx.fillStyle = css(pick(random, [0x4f7d36, 0x5b8a3c, 0x44702f]));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, notch, notch + Math.PI * 1.8);
    ctx.fill();
  }
}

export const DAAN_GROUND_TEXTURES: Readonly<Record<string, TextureDef>> = {
  lawnWest: { width: SIZE, height: SIZE, repeats: false, color: true, draw: (ctx) => drawLawn(ctx, 32, 111) },
  lawnEast: { width: SIZE, height: SIZE, repeats: false, color: true, draw: (ctx) => drawLawn(ctx, 0, 131) },
  grass: { width: 512, height: 512, repeats: true, color: true, draw: drawGrass },
  pavers: { width: 256, height: 256, repeats: true, color: true, draw: drawPavers },
  rockery: { width: 256, height: 256, repeats: true, color: true, draw: drawRockery },
  foliage: { width: 128, height: 128, repeats: true, color: true, draw: drawFoliage },
  blossom: { width: 128, height: 128, repeats: true, color: true, draw: drawBlossom },
  roofTiles: { width: 128, height: 64, repeats: true, color: true, draw: drawRoofTiles },
  lilies: { width: 256, height: 256, repeats: true, color: true, draw: drawLilies },
};
