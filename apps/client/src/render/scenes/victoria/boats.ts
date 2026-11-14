import { css, grain, seeded, type Ctx } from '../kit/canvas';
import type { Motion } from '../kit/motion';
import type { TextureDef } from '../kit/paint';
import { block, box, post, ring, type Part } from '../kit/parts';
import { VICTORIA_COLORS as C } from './look';

/** Heights are above the waterline; the mover that carries a boat sits it on the water. */
const JUNK = { length: 7.2, beam: 1.7, freeboard: 0.9, sailLean: 0.32 } as const;
const FERRY = { length: 10, beam: 2.8, hull: 1, cabin: 1.1 } as const;

export const JUNK_MOTION: Motion = { bob: 0.07, bobRate: 0.9, tilt: 0.025, tiltRate: 0.7, drift: 1.4, driftRate: 0.11 };
export const FERRY_MOTION: Motion = { bob: 0.05, bobRate: 0.8, tilt: 0.012, tiltRate: 0.6, drift: 0, driftRate: 0 };
export const BUOY_MOTION: Motion = { bob: 0.12, bobRate: 1.1, tilt: 0.05, tiltRate: 0.7, drift: 0, driftRate: 0 };

function sail(mastX: number, width: number, height: number, foot: number): readonly Part[] {
  return [
    post('junkHull', { radius: 0.07, height: foot + height + 0.3, sides: 6 }, { x: mastX, y: JUNK.freeboard, z: 0 }),
    box('junkSail', { x: width, y: height, z: 0.04 }, { x: mastX + width * 0.3, y: JUNK.freeboard + foot + height / 2, z: 0.1 }, { yaw: JUNK.sailLean }),
  ];
}

/** A three-masted junk under red battened sails, bow to the west. */
export function junk(): readonly Part[] {
  const half = JUNK.length / 2;
  return [
    block('junkHull', [-half, half], [-0.3, JUNK.freeboard], [-JUNK.beam / 2, JUNK.beam / 2]),
    // High stern castle and a lifted bow give the hull its banana line.
    block('junkHull', [half - 1.7, half + 0.2], [JUNK.freeboard, JUNK.freeboard + 0.8], [-JUNK.beam / 2, JUNK.beam / 2]),
    block('junkHull', [-half - 0.5, -half + 0.8], [0.2, JUNK.freeboard + 0.35], [-JUNK.beam / 2 + 0.2, JUNK.beam / 2 - 0.2]),
    ...sail(-2.3, 2, 2.3, 0.3),
    ...sail(-0.2, 2.7, 3.1, 0.35),
    ...sail(2.3, 1.6, 1.9, 1),
  ];
}

/** A double-ended harbour ferry: green hull, white cabin with a lit row of windows, a funnel amidships. */
export function ferry(): readonly Part[] {
  const half = FERRY.length / 2;
  const cabinTop = FERRY.hull + FERRY.cabin;
  return [
    block('ferryHull', [-half, half], [-0.3, FERRY.hull], [-FERRY.beam / 2, FERRY.beam / 2]),
    block('ferryWindows', [-half + 0.7, half - 0.7], [FERRY.hull, cabinTop], [-FERRY.beam / 2 + 0.12, FERRY.beam / 2 - 0.12]),
    block('ferryWhite', [-half + 0.3, half - 0.3], [cabinTop, cabinTop + 0.16], [-FERRY.beam / 2, FERRY.beam / 2]),
    block('ferryWhite', [-half + 0.9, -half + 2.1], [cabinTop + 0.16, cabinTop + 0.8], [-0.6, 0.6]),
    block('ferryWhite', [half - 2.1, half - 0.9], [cabinTop + 0.16, cabinTop + 0.8], [-0.6, 0.6]),
    post('ferryHull', { radius: 0.36, height: 1.1, sides: 10 }, { x: 0, y: cabinTop + 0.16, z: 0 }),
    post('iron', { radius: 0.38, height: 0.22, sides: 10 }, { x: 0, y: cabinTop + 1.26, z: 0 }),
  ];
}

/**
 * A lit channel buoy. Its drum is the sim's circle and stays full width past hook height, so a hook visibly strikes
 * steel. Heights are from the dock surface, with the waterline at `waterLevel`.
 */
export function channelBuoy(radius: number, waterLevel: number): readonly Part[] {
  const drum = { foot: waterLevel - 0.9, top: 2.3 };
  const cage = { top: 4.3, legs: [0.25, 0.75, 1.25, 1.75].map((turn) => turn * Math.PI) };
  return [
    post('buoyRed', { radius, height: drum.top - drum.foot, sides: 24 }, { x: 0, y: drum.foot, z: 0 }),
    post('buoyWhite', { radius: radius * 1.004, height: 0.8, sides: 24 }, { x: 0, y: 0.5, z: 0 }),
    ring('iron', { radius: radius * 0.99, tube: 0.1, sides: 24 }, { x: 0, y: waterLevel + 0.15, z: 0 }),
    post('buoyRed', { radius, topRadius: radius * 0.45, height: 0.5, sides: 24 }, { x: 0, y: drum.top, z: 0 }),
    ...cage.legs.map((a) => post('iron', { radius: 0.07, height: cage.top - drum.top - 0.5, sides: 5 }, { x: Math.cos(a) * 0.8, y: drum.top + 0.5, z: Math.sin(a) * 0.8 })),
    post('iron', { radius: 0.95, height: 0.1, sides: 12 }, { x: 0, y: cage.top, z: 0 }),
    post('buoyLamp', { radius: 0.24, height: 0.4, sides: 10 }, { x: 0, y: cage.top + 0.1, z: 0 }),
  ];
}

/** Height of the buoy's lamp above the dock surface, for the light that goes with it. */
export const BUOY_LAMP_HEIGHT = 4.6;

/** A junk sail: a fan of red cloth on bamboo battens, scalloped between them along the free edge. */
function drawSail(ctx: Ctx, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  const outline: readonly (readonly [number, number])[] = [[0.06, 0.98], [0.06, 0.1], [0.42, 0.02], [0.96, 0.22], [0.98, 0.62], [0.9, 0.98]];
  ctx.beginPath();
  outline.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * w, y * h) : ctx.lineTo(x * w, y * h)));
  ctx.closePath();
  const cloth = ctx.createLinearGradient(0, 0, w, h);
  cloth.addColorStop(0, css(0xd42a20));
  cloth.addColorStop(1, css(0x8f1712));
  ctx.fillStyle = cloth;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = css(0x3a0c08);
  ctx.lineWidth = Math.max(2, h * 0.014);
  for (let i = 1; i < 7; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0.06 * w, (0.1 + i * 0.125) * h);
    ctx.lineTo(w, (0.04 + i * 0.14) * h);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.arc(1.02 * w, (0.3 + i * 0.13) * h, 0.055 * w, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Riveted steel plate, pale so the paint colour shows through it, with rust weeping from the seams. */
function drawPlates(ctx: Ctx, w: number, h: number): void {
  const random = seeded(51);
  ctx.fillStyle = css(0xd8d8d8);
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = css(0x555555, 0.8);
  ctx.lineWidth = 2;
  for (let x = 0; x < w; x += w / 4) ctx.strokeRect(x, -2, w / 4, h + 4);
  ctx.strokeRect(-2, h / 2, w + 4, h);
  for (let i = 0; i < 30; i += 1) {
    ctx.fillStyle = css(0x4a2a1a, 0.1 + random() * 0.25);
    ctx.fillRect(random() * w, random() * h * 0.5, 2 + random() * 4, h * (0.2 + random() * 0.5));
  }
  grain(ctx, w, h, 12, random);
}

export const BOAT_TEXTURES: Readonly<Record<string, TextureDef>> = {
  sail: { width: 256, height: 256, repeats: false, color: true, draw: drawSail },
  plates: { width: 256, height: 256, repeats: true, color: true, draw: drawPlates },
};
