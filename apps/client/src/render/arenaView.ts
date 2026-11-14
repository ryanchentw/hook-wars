import { Container, Graphics } from 'pixi.js';
import type { Arena } from '@hookbrawl/sim';
import { COLORS, SIZES } from './theme';

export type ArenaView = { readonly container: Container; update(elapsed: number): void };

type Strip = { readonly x0: number; readonly x1: number };

function drawDock(g: Graphics, dock: Strip, arena: Arena): void {
  g.rect(dock.x0, 0, dock.x1 - dock.x0, arena.height).fill(COLORS.plank);
  const planks = Math.ceil((dock.x1 - dock.x0) / SIZES.plankWidth);
  for (let i = 0; i < planks; i += 1) {
    const x = dock.x0 + i * SIZES.plankWidth;
    const w = Math.min(SIZES.plankWidth, dock.x1 - x);
    if (i % 2 === 1) g.rect(x, 0, w, arena.height).fill(COLORS.plankAlt);
    g.moveTo(x, 0).lineTo(x, arena.height).stroke({ width: 2, color: COLORS.plankSeam, alpha: 0.55 });
    // Stagger the board ends so the deck reads as planks, not stripes.
    const stagger = (i % 3) * (SIZES.plankSeamEvery / 3);
    for (let y = stagger; y < arena.height; y += SIZES.plankSeamEvery) {
      g.moveTo(x + 4, y).lineTo(x + w - 4, y).stroke({ width: 2, color: COLORS.plankSeam, alpha: 0.4 });
    }
  }
}

function drawDockEdge(g: Graphics, edgeX: number, inward: 1 | -1, arena: Arena): void {
  const x = inward === 1 ? edgeX : edgeX - SIZES.dockEdgeWidth;
  g.rect(x, 0, SIZES.dockEdgeWidth, arena.height).fill(COLORS.dockEdge);
  const postX = edgeX + inward * (SIZES.dockEdgeWidth + SIZES.bollardRadius);
  for (let y = SIZES.bollardSpacing / 2; y < arena.height; y += SIZES.bollardSpacing) {
    g.circle(postX, y, SIZES.bollardRadius).fill(COLORS.bollard);
    g.circle(postX, y, SIZES.bollardRadius * 0.55).fill(COLORS.bollardTop);
  }
}

function drawLanterns(g: Graphics, arena: Arena): void {
  const inset = SIZES.lanternInset;
  const xs = [inset, arena.width - inset];
  const ys = [arena.height * 0.2, arena.height * 0.8];
  for (const x of xs) {
    for (const y of ys) {
      for (let k = 3; k >= 1; k -= 1) {
        g.circle(x, y, (SIZES.lanternRadius * k) / 3).fill({ color: COLORS.lantern, alpha: 0.07 });
      }
      g.circle(x, y, SIZES.lanternCore).fill(COLORS.lantern).stroke({ width: 4, color: COLORS.outline });
    }
  }
}

function drawStatic(arena: Arena): Graphics {
  const g = new Graphics();
  const { canal } = arena;
  g.rect(-SIZES.arenaFrameWidth, -SIZES.arenaFrameWidth, arena.width + SIZES.arenaFrameWidth * 2, arena.height + SIZES.arenaFrameWidth * 2).fill(COLORS.arenaFrame);
  g.rect(canal.x0, 0, canal.x1 - canal.x0, arena.height).fill(COLORS.canal);
  const mid = (canal.x0 + canal.x1) / 2;
  const deepHalf = (canal.x1 - canal.x0) / 4;
  g.rect(mid - deepHalf, 0, deepHalf * 2, arena.height).fill({ color: COLORS.canalDeep, alpha: 0.6 });
  drawDock(g, { x0: 0, x1: canal.x0 }, arena);
  drawDock(g, { x0: canal.x1, x1: arena.width }, arena);
  drawDockEdge(g, canal.x0, -1, arena);
  drawDockEdge(g, canal.x1, 1, arena);
  drawLanterns(g, arena);
  return g;
}

function drawRipples(g: Graphics, arena: Arena, elapsed: number): void {
  const { canal } = arena;
  const width = canal.x1 - canal.x0 - SIZES.rippleLength * 2;
  g.clear();
  for (let i = 0; i < SIZES.rippleCount; i += 1) {
    // Golden-ratio spread gives an even-looking but irregular scatter without an RNG.
    const fx = (i * 0.618034) % 1;
    const baseY = (i / SIZES.rippleCount) * arena.height;
    const y = (baseY + elapsed * SIZES.rippleSpeed * (0.6 + fx)) % arena.height;
    const x = canal.x0 + SIZES.rippleLength + fx * width;
    const sway = Math.sin(elapsed * 0.8 + i) * 10;
    const alpha = 0.18 + 0.17 * (0.5 + 0.5 * Math.sin(elapsed * 1.3 + i * 2.1));
    g.moveTo(x - SIZES.rippleLength / 2 + sway, y)
      .quadraticCurveTo(x + sway, y - 6, x + SIZES.rippleLength / 2 + sway, y)
      .stroke({ width: SIZES.rippleWidth, color: COLORS.ripple, alpha, cap: 'round' });
  }
}

function drawBuoy(g: Graphics, arena: Arena, elapsed: number): void {
  const { pos, radius } = arena.buoy;
  const bob = 1 + Math.sin(elapsed * 2) * 0.03;
  const ring = radius * (1.15 + ((elapsed * 0.4) % 1) * 0.5);
  g.clear();
  g.circle(pos.x, pos.y, ring).stroke({ width: 3, color: COLORS.ripple, alpha: 0.5 * (1 - ((elapsed * 0.4) % 1)) });
  g.circle(pos.x + 6, pos.y + 8, radius * bob).fill({ color: COLORS.shadow, alpha: 0.35 });
  g.circle(pos.x, pos.y, radius * bob).fill(COLORS.buoyRed).stroke({ width: 5, color: COLORS.outline });
  g.circle(pos.x, pos.y, radius * SIZES.buoyStripe * bob).fill(COLORS.buoyWhite);
  g.circle(pos.x, pos.y, radius * SIZES.buoyCap * bob).fill(COLORS.buoyRed).stroke({ width: 4, color: COLORS.buoyCap });
}

export function createArenaView(arena: Arena): ArenaView {
  const container = new Container();
  const ripples = new Graphics();
  const buoy = new Graphics();
  container.addChild(drawStatic(arena), ripples, buoy);
  return {
    container,
    update(elapsed) {
      drawRipples(ripples, arena, elapsed);
      drawBuoy(buoy, arena, elapsed);
    },
  };
}
