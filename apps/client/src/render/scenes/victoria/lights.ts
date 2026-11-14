import { css, pick, seeded, type Ctx } from '../kit/canvas';
import type { TextureDef } from '../kit/paint';
import { VICTORIA_COLORS as C } from './look';

const NEONS = [C.neonPink, C.neonCyan, C.neonGold, C.neonGreen, C.neonRed, 0xffffff, C.neonGold, C.neonPink];
const WINDOW_TONES = [0xffd27a, 0xffe6b0, 0xcfe4ff, 0xffc061, 0x9fe8ff];
const FACADE = 0x080a12;
const WINDOW_COLS = 10;
const WINDOW_ROWS = 14;

/** A tower front seen from across the water: a grid of windows, some lit, a few whole floors dark. */
function drawWindows(ctx: Ctx, w: number, h: number): void {
  const random = seeded(101);
  ctx.fillStyle = css(FACADE);
  ctx.fillRect(0, 0, w, h);
  for (let row = 0; row < WINDOW_ROWS; row += 1) {
    // Offices empty by the floor and flats by the room, so light comes in runs rather than as static.
    const floor = random();
    let run = 0;
    for (let col = 0; col < WINDOW_COLS; col += 1) {
      if (run <= 0 && random() < (floor > 0.75 ? 0.5 : 0.16)) run = 1 + Math.floor(random() * 4);
      const lit = floor > 0.2 && run > 0;
      run -= 1;
      ctx.fillStyle = lit ? css(pick(random, WINDOW_TONES), 0.5 + random() * 0.5) : css(0x141a28, 0.9);
      ctx.fillRect((col + 0.18) * (w / WINDOW_COLS), (row + 0.3) * (h / WINDOW_ROWS), 0.64 * (w / WINDOW_COLS), 0.42 * (h / WINDOW_ROWS));
    }
  }
}

/** Light lying on water: broken streaks running towards the viewer. `fade` is how much is left at the near end. */
function drawStreaks(ctx: Ctx, w: number, h: number, spec: { readonly seed: number; readonly count: number; readonly width: readonly [number, number]; readonly fade: number }): void {
  const random = seeded(spec.seed);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < spec.count; i += 1) {
    const x = random() * w;
    const width = spec.width[0] + random() * (spec.width[1] - spec.width[0]);
    const color = pick(random, NEONS);
    const strength = 0.35 + random() * 0.65;
    // Ripples cut a reflection into dashes that grow longer and fainter as they come nearer.
    for (let y = 0; y < h; ) {
      const t = y / h;
      const dash = 3 + random() * (6 + 26 * t);
      const alpha = strength * (1 - (1 - spec.fade) * t) * (0.55 + random() * 0.45);
      const wobble = (random() - 0.5) * width * (0.6 + t);
      const gradient = ctx.createLinearGradient(x + wobble - width, 0, x + wobble + width, 0);
      gradient.addColorStop(0, css(color, 0));
      gradient.addColorStop(0.5, css(color, alpha));
      gradient.addColorStop(1, css(color, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(x + wobble - width, y, width * 2, dash);
      y += dash + 1 + random() * (3 + 8 * t);
    }
  }
}

type Pictogram = (ctx: Ctx, cx: number, cy: number, r: number) => void;

/** Shapes a neon tube can be bent into that are no word in any script. */
const PICTOGRAMS: readonly Pictogram[] = [
  (ctx, cx, cy, r) => {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.moveTo(cx + r * 0.5, cy);
    ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
  },
  (ctx, cx, cy, r) => {
    ctx.moveTo(cx - r, cy + r * 0.8);
    ctx.lineTo(cx, cy - r);
    ctx.lineTo(cx + r, cy + r * 0.8);
    ctx.closePath();
  },
  (ctx, cx, cy, r) => {
    for (const dy of [-0.6, 0, 0.6]) {
      ctx.moveTo(cx - r, cy + dy * r);
      ctx.bezierCurveTo(cx - r * 0.4, cy + (dy - 0.5) * r, cx + r * 0.4, cy + (dy + 0.5) * r, cx + r, cy + dy * r);
    }
  },
  (ctx, cx, cy, r) => {
    for (const dx of [-0.5, 0.3]) {
      ctx.moveTo(cx + (dx - 0.4) * r, cy - r);
      ctx.lineTo(cx + (dx + 0.4) * r, cy);
      ctx.lineTo(cx + (dx - 0.4) * r, cy + r);
    }
  },
  (ctx, cx, cy, r) => {
    ctx.rect(cx - r * 0.8, cy - r * 0.8, r * 1.6, r * 1.6);
    ctx.moveTo(cx - r * 0.8, cy + r * 0.8);
    ctx.lineTo(cx + r * 0.8, cy - r * 0.8);
  },
];

/** A neon sign: a double border and a column or row of tube pictograms, glowing on a dark board. */
function drawSign(ctx: Ctx, w: number, h: number, spec: { readonly seed: number; readonly main: number; readonly accent: number }): void {
  const random = seeded(spec.seed);
  ctx.fillStyle = css(0x0a0508);
  ctx.fillRect(0, 0, w, h);
  const tube = (color: number, width: number, path: () => void): void => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [scale, alpha] of [[4, 0.18], [2.2, 0.35], [1, 1]] as const) {
      ctx.strokeStyle = css(color, alpha);
      ctx.lineWidth = width * scale;
      ctx.beginPath();
      path();
      ctx.stroke();
    }
  };
  const unit = Math.min(w, h);
  tube(spec.accent, unit * 0.022, () => ctx.rect(unit * 0.07, unit * 0.07, w - unit * 0.14, h - unit * 0.14));
  const upright = h > w;
  const count = Math.max(2, Math.round((upright ? h : w) / unit));
  const start = Math.floor(random() * PICTOGRAMS.length);
  for (let i = 0; i < count; i += 1) {
    const along = (i + 0.5) / count;
    const cx = upright ? w / 2 : w * (0.1 + along * 0.8);
    const cy = upright ? h * (0.08 + along * 0.84) : h / 2;
    const draw = PICTOGRAMS[(start + i) % PICTOGRAMS.length]!;
    tube(i % 2 === 0 ? spec.main : spec.accent, unit * 0.04, () => draw(ctx, cx, cy, unit * 0.27));
  }
}

function drawFerryWindows(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = css(C.ferryWhite);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = css(C.ferryGreen);
  ctx.fillRect(0, h * 0.82, w, h * 0.18);
  ctx.fillStyle = css(0xffcf7a);
  for (let i = 0; i < 4; i += 1) ctx.fillRect((i + 0.18) * (w / 4), h * 0.2, 0.64 * (w / 4), h * 0.45);
}

export const LIGHT_TEXTURES: Readonly<Record<string, TextureDef>> = {
  windows: { width: 512, height: 512, repeats: true, color: true, draw: drawWindows },
  streaks: { width: 2048, height: 512, repeats: false, color: true, draw: (ctx, w, h) => drawStreaks(ctx, w, h, { seed: 201, count: 170, width: [3, 9], fade: 0.75 }) },
  nearStreaks: { width: 1024, height: 512, repeats: false, color: true, draw: (ctx, w, h) => drawStreaks(ctx, w, h, { seed: 203, count: 46, width: [3, 8], fade: 0.5 }) },
  stripStreaks: { width: 256, height: 1024, repeats: false, color: true, draw: (ctx, w, h) => drawStreaks(ctx, w, h, { seed: 202, count: 6, width: [6, 14], fade: 0.1 }) },
  signPink: { width: 512, height: 320, repeats: false, color: true, draw: (ctx, w, h) => drawSign(ctx, w, h, { seed: 301, main: C.neonPink, accent: C.neonGold }) },
  signCyan: { width: 160, height: 512, repeats: false, color: true, draw: (ctx, w, h) => drawSign(ctx, w, h, { seed: 302, main: C.neonCyan, accent: C.neonPink }) },
  ferryWindows: { width: 128, height: 64, repeats: true, color: true, draw: drawFerryWindows },
};
