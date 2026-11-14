import { blots, courses, css, grain, seeded, type Area, type Ctx } from '../kit/canvas';
import type { TextureDef } from '../kit/paint';
import { GATE_COLORS as C } from './look';

/** The ground textures cover one dock each: 32 by 43.2 world units on a square canvas. */
const SIZE = 2048;
const PX_X = SIZE / 32;
const PX_Z = SIZE / 43.2;
const PLANKS = [0x74695e, 0x696057, 0x7f7366, 0x61584f, 0x786c60, 0x6e6359];
const FRESH = [0x9a8262, 0xa58c6a];
const GAP = 0x1d1814;
const LINE_YELLOW = 0xa98a2a;

/** Planks running north to south. A plank here and there has been replaced and has not yet greyed. */
function planking(ctx: Ctx, area: Area, plank: { readonly width: number; readonly length: number }, seed: number): void {
  const random = seeded(seed);
  courses(ctx, area, { across: plank.width, along: plank.length, stagger: 0, joint: 3, jointColor: GAP, tones: PLANKS, random });
  // Butt joints fall at a different place in every strake.
  for (let x = area.x; x < area.x + area.w; x += plank.width) {
    const fresh = random() > 0.93;
    if (fresh) {
      ctx.fillStyle = css(FRESH[Math.floor(random() * FRESH.length)] ?? FRESH[0]!, 0.85);
      const y = area.y + random() * area.h * 0.8;
      ctx.fillRect(x + 2, y, plank.width - 4, plank.length * (0.5 + random() * 0.5));
    }
    ctx.fillStyle = css(0x241d18, 0.35);
    for (let nail = area.y + random() * plank.length; nail < area.y + area.h; nail += plank.length / 2) {
      ctx.fillRect(x + plank.width * 0.3, nail, 3, 3);
      ctx.fillRect(x + plank.width * 0.7, nail, 3, 3);
    }
  }
}

function weather(ctx: Ctx, w: number, h: number, seed: number): void {
  const random = seeded(seed);
  blots(ctx, w, h, { count: 50, radius: [50, 220], color: 0x2a221c, alpha: 0.22, random });
  blots(ctx, w, h, { count: 40, radius: [40, 180], color: 0xc9b8a0, alpha: 0.1, random });
  // Gulls.
  blots(ctx, w, h, { count: 60, radius: [3, 9], color: 0xe8e4da, alpha: 0.5, random });
  grain(ctx, w, h, 9, random);
}

/** One pier's deck. `edgeX` is where the strait runs, in world units from the canvas's left edge. */
function drawPier(ctx: Ctx, edgeX: number, seed: number): void {
  planking(ctx, { x: 0, y: 0, w: SIZE, h: SIZE }, { width: 0.6 * PX_X, length: 5.4 * PX_Z }, seed);
  // A heavy cross-timber every few metres, as the deck is laid in bays.
  ctx.fillStyle = css(0x3e342c, 0.7);
  for (let z = 5.4; z < 43; z += 5.4) ctx.fillRect(0, z * PX_Z - 3, SIZE, 6);
  const inward = edgeX > 16 ? -1 : 1;
  ctx.fillStyle = css(LINE_YELLOW, 0.75);
  ctx.fillRect((edgeX + inward * 1.5) * PX_X - 5, 0, 10, SIZE);
  // Faded berth blocks: paint, no words.
  ctx.fillStyle = css(0xd8d0c0, 0.22);
  for (const z of [8, 21.6, 35]) ctx.fillRect((edgeX + inward * 9) * PX_X - 1.2 * PX_X, (z - 1.4) * PX_Z, 2.4 * PX_X, 2.8 * PX_Z);
  weather(ctx, SIZE, SIZE, seed + 1);
}

function drawPlanks(ctx: Ctx, w: number, h: number): void {
  planking(ctx, { x: 0, y: 0, w, h }, { width: w / 6.67, length: h }, 61);
  grain(ctx, w, h, 9, seeded(62));
}

/** The side of a pier: round piles standing in the dark under the deck. */
function drawPiles(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = css(0x0e0c0b);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = css(0x55473a);
  ctx.fillRect(0, 0, w, h * 0.13);
  for (const x of [0.12, 0.62]) {
    const pile = ctx.createLinearGradient(x * w, 0, (x + 0.22) * w, 0);
    pile.addColorStop(0, css(0x2c241d));
    pile.addColorStop(0.45, css(0x6a5a4a));
    pile.addColorStop(1, css(0x1f1915));
    ctx.fillStyle = pile;
    ctx.fillRect(x * w, h * 0.1, 0.22 * w, h);
  }
  // Weed and barnacle up to the tide line.
  ctx.fillStyle = css(0x1e2a1c, 0.75);
  ctx.fillRect(0, h * 0.62, w, h * 0.38);
}

/** A stiffening truss seen side-on: chords top and bottom with crossed diagonals between. Clear between the members. */
function drawTruss(ctx: Ctx, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h * 0.16);
  ctx.fillRect(0, h * 0.84, w, h * 0.16);
  ctx.lineWidth = w * 0.09;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, h);
  ctx.moveTo(w, 0);
  ctx.lineTo(0, h);
  ctx.stroke();
  ctx.fillRect(0, 0, w * 0.06, h);
  ctx.fillRect(w * 0.94, 0, w * 0.06, h);
}

/** Six lanes of roadway along x, with an orange footway down each side. */
function drawRoad(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = css(C.asphalt);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = css(C.bridgeLit);
  ctx.fillRect(0, 0, w, h * 0.1);
  ctx.fillRect(0, h * 0.9, w, h * 0.1);
  ctx.fillStyle = css(0xd9d4c4, 0.85);
  for (const lane of [0.3, 0.42, 0.58, 0.7]) ctx.fillRect(w * 0.1, h * lane - 1, w * 0.45, 3);
  ctx.fillStyle = css(0xd2a52a, 0.9);
  ctx.fillRect(0, h * 0.5 - 2, w, 4);
  grain(ctx, w, h, 8, seeded(71));
}

/** Planking laid round a pontoon in level courses, weathered grey, green below the tide line. */
function drawCladding(ctx: Ctx, w: number, h: number): void {
  const random = seeded(81);
  courses(ctx, { x: 0, y: 0, w, h }, { across: w / 2, along: h / 13, stagger: 0.5, joint: 3, jointColor: 0x1d1a17, tones: [0x7a756d, 0x6f6a63, 0x847f77, 0x67635c], random });
  ctx.fillStyle = css(0x16211a, 0.8);
  ctx.fillRect(0, h * 0.8, w, h * 0.2);
  grain(ctx, w, h, 10, random);
}

export const GATE_TEXTURES: Readonly<Record<string, TextureDef>> = {
  pierWest: { width: SIZE, height: SIZE, repeats: false, color: true, draw: (ctx) => drawPier(ctx, 32, 51) },
  pierEast: { width: SIZE, height: SIZE, repeats: false, color: true, draw: (ctx) => drawPier(ctx, 0, 53) },
  planks: { width: 512, height: 512, repeats: true, color: true, draw: drawPlanks },
  piles: { width: 256, height: 256, repeats: true, color: true, draw: drawPiles },
  truss: { width: 128, height: 64, repeats: true, color: true, draw: drawTruss },
  road: { width: 256, height: 128, repeats: true, color: true, draw: drawRoad },
  cladding: { width: 256, height: 256, repeats: true, color: true, draw: drawCladding },
};
