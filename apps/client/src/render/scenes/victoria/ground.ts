import { blots, courses, css, grain, seeded, type Ctx } from '../kit/canvas';
import type { TextureDef } from '../kit/paint';

/** The ground textures cover one dock each: 32 by 43.2 world units on a square canvas. */
const SIZE = 2048;
const PX_X = SIZE / 32;
const PX_Z = SIZE / 43.2;

const GRANITE = [0x3b3e44, 0x35383d, 0x41444a, 0x303338, 0x393c42];
const BRICK = [0x5c3731, 0x51302b, 0x663d36, 0x58342e];
const SLAB = [0x45484c, 0x3f4246, 0x4a4d51, 0x424549];
const JOINT = 0x1b1c1f;
const TACTILE = 0x9a8431;
const PAINT_WHITE = 0xc9c7bd;
const PAINT_GREEN = 0x1e5a44;
const HAZARD_YELLOW = 0xb08f1c;
const HAZARD_BLACK = 0x18181a;

function wear(ctx: Ctx, seed: number): void {
  const random = seeded(seed);
  blots(ctx, SIZE, SIZE, { count: 70, radius: [60, 260], color: 0x0c0d10, alpha: 0.28, random });
  blots(ctx, SIZE, SIZE, { count: 40, radius: [40, 160], color: 0x8a8f99, alpha: 0.07, random });
  grain(ctx, SIZE, SIZE, 7, random);
}

/** Dots of a tactile strip running north to south between two x positions, in world units from the canvas's left edge. */
function tactile(ctx: Ctx, from: number, to: number): void {
  ctx.fillStyle = css(TACTILE);
  ctx.fillRect(from * PX_X, 0, (to - from) * PX_X, SIZE);
  ctx.fillStyle = css(0x6f5f22);
  for (let z = 6; z < SIZE; z += 12) {
    for (let x = from * PX_X + 6; x < to * PX_X; x += 12) ctx.fillRect(x - 2.5, z - 2.5, 5, 5);
  }
}

function drains(ctx: Ctx, x: number): void {
  for (let z = 4; z < 43; z += 8.6) {
    ctx.fillStyle = css(0x101113);
    ctx.fillRect(x * PX_X, z * PX_Z, 1.1 * PX_X, 0.45 * PX_Z);
    ctx.fillStyle = css(0x4a4d52);
    for (let bar = 0; bar < 7; bar += 1) ctx.fillRect((x + 0.08 + bar * 0.15) * PX_X, z * PX_Z, 2, 0.45 * PX_Z);
  }
}

/** The west dock: a granite promenade with a brick band and a tactile strip along the water. East is to the right. */
function drawPromenade(ctx: Ctx): void {
  const random = seeded(11);
  courses(ctx, { x: 0, y: 0, w: SIZE, h: SIZE }, { across: 0.8 * PX_X, along: 0.4 * PX_Z, stagger: 0.5, joint: 2, jointColor: JOINT, tones: GRANITE, random });
  courses(ctx, { x: 24.4 * PX_X, y: 0, w: 5.4 * PX_X, h: SIZE }, { across: 0.3 * PX_X, along: 0.6 * PX_Z, stagger: 0.5, joint: 2, jointColor: JOINT, tones: BRICK, random });
  // A course of long granite kerbs either side of the brick, as on the real promenade.
  ctx.fillStyle = css(0x4d5056);
  ctx.fillRect(24 * PX_X, 0, 0.4 * PX_X, SIZE);
  ctx.fillRect(29.8 * PX_X, 0, 0.4 * PX_X, SIZE);
  tactile(ctx, 30.3, 30.9);
  drains(ctx, 12);
  // Darker setts mark out squares in the granite, as paving patterns do.
  ctx.fillStyle = css(0x24262a, 0.55);
  for (const z of [10.8, 21.6, 32.4]) {
    for (const x of [4, 15]) {
      ctx.fillRect(x * PX_X, (z - 2.4) * PX_Z, 4.8 * PX_X, 0.4 * PX_Z);
      ctx.fillRect(x * PX_X, (z + 2) * PX_Z, 4.8 * PX_X, 0.4 * PX_Z);
      ctx.fillRect(x * PX_X, (z - 2.4) * PX_Z, 0.4 * PX_X, 4.8 * PX_Z);
      ctx.fillRect((x + 4.4) * PX_X, (z - 2.4) * PX_Z, 0.4 * PX_X, 4.8 * PX_Z);
    }
  }
  wear(ctx, 12);
}

function chevrons(ctx: Ctx, from: number, to: number): void {
  ctx.fillStyle = css(HAZARD_YELLOW);
  ctx.fillRect(from * PX_X, 0, (to - from) * PX_X, SIZE);
  ctx.fillStyle = css(HAZARD_BLACK);
  const width = (to - from) * PX_X;
  for (let z = -width; z < SIZE; z += 44) {
    ctx.beginPath();
    ctx.moveTo(from * PX_X, z);
    ctx.lineTo(to * PX_X, z + width);
    ctx.lineTo(to * PX_X, z + width + 22);
    ctx.lineTo(from * PX_X, z + 22);
    ctx.fill();
  }
}

/** The east dock: a ferry pier of concrete slabs, green paint and hazard stripes along the water. West is to the left. */
function drawPier(ctx: Ctx): void {
  const random = seeded(21);
  courses(ctx, { x: 0, y: 0, w: SIZE, h: SIZE }, { across: 2.4 * PX_X, along: 2.4 * PX_Z, stagger: 0, joint: 4, jointColor: JOINT, tones: SLAB, random });
  ctx.fillStyle = css(PAINT_GREEN, 0.8);
  ctx.fillRect(1.9 * PX_X, 0, 3.4 * PX_X, SIZE);
  chevrons(ctx, 0.9, 1.6);
  // Waiting bays for the gangway, painted broad and long since worn: nothing here is thin enough to be taken for a chain.
  ctx.fillStyle = css(PAINT_WHITE, 0.16);
  for (const z of [6, 17, 28]) ctx.fillRect(11 * PX_X, z * PX_Z, 9 * PX_X, 8 * PX_Z);
  ctx.fillStyle = css(HAZARD_YELLOW, 0.3);
  for (const z of [6, 17, 28]) ctx.fillRect(11 * PX_X, z * PX_Z, 9 * PX_X, 0.5 * PX_Z);
  wear(ctx, 22);
}

function drawPavers(ctx: Ctx, w: number, h: number): void {
  const random = seeded(31);
  courses(ctx, { x: 0, y: 0, w, h }, { across: w / 5, along: h / 10, stagger: 0.5, joint: 2, jointColor: JOINT, tones: GRANITE, random });
  grain(ctx, w, h, 6, random);
}

function drawConcrete(ctx: Ctx, w: number, h: number): void {
  const random = seeded(41);
  ctx.fillStyle = css(0x9a9a9a);
  ctx.fillRect(0, 0, w, h);
  blots(ctx, w, h, { count: 30, radius: [10, 50], color: 0x303030, alpha: 0.3, random });
  // Tide and rust run down a quay wall.
  for (let i = 0; i < 40; i += 1) {
    ctx.fillStyle = css(0x2a2420, 0.12 + random() * 0.15);
    ctx.fillRect(random() * w, 0, 2 + random() * 5, h * (0.4 + random() * 0.6));
  }
  grain(ctx, w, h, 10, random);
}

export const GROUND_TEXTURES: Readonly<Record<string, TextureDef>> = {
  promenade: { width: SIZE, height: SIZE, repeats: false, color: true, draw: drawPromenade },
  pier: { width: SIZE, height: SIZE, repeats: false, color: true, draw: drawPier },
  pavers: { width: 512, height: 512, repeats: true, color: true, draw: drawPavers },
  concrete: { width: 256, height: 256, repeats: true, color: true, draw: drawConcrete },
};
