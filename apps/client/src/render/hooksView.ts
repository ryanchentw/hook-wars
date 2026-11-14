import { Graphics } from 'pixi.js';
import type { Vec2 } from '@hookbrawl/sim';
import type { HookFrame, RenderFrame } from './interpolate';
import { COLORS, SIZES, TEAM_COLORS } from './theme';

export type HooksView = { readonly container: Graphics; update(frame: RenderFrame): void };

/** Points every `spacing` units along a polyline, measured from its first point. */
export function beadPoints(chain: readonly Vec2[], spacing: number): readonly Vec2[] {
  const out: Vec2[] = [];
  let carry = 0;
  for (let i = 1; i < chain.length; i += 1) {
    const a = chain[i - 1];
    const b = chain[i];
    if (a === undefined || b === undefined) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let d = carry;
    for (; d < len; d += spacing) out.push({ x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len });
    carry = d - len;
  }
  return out;
}

function headDirection(hf: HookFrame): number {
  if (hf.hook.phase.kind === 'extending') return Math.atan2(hf.hook.dir.y, hf.hook.dir.x);
  const hand = hf.chain[0] ?? hf.head;
  return Math.atan2(hf.head.y - hand.y, hf.head.x - hand.x);
}

function drawChain(g: Graphics, chain: readonly Vec2[]): void {
  const [first, ...rest] = chain;
  if (first === undefined) return;
  g.moveTo(first.x, first.y);
  rest.forEach((p) => g.lineTo(p.x, p.y));
  g.stroke({ width: SIZES.chainUnderWidth, color: COLORS.chainShadow, alpha: 0.75, join: 'round', cap: 'round' });
  for (const p of beadPoints(chain, SIZES.chainBeadSpacing)) {
    g.circle(p.x, p.y, SIZES.chainBeadRadius)
      .fill(COLORS.chainLink)
      .stroke({ width: SIZES.chainBeadOutline, color: COLORS.outline });
  }
}

function drawHead(g: Graphics, hf: HookFrame): void {
  const { x, y } = hf.head;
  const a = headDirection(hf);
  const r = SIZES.hookHeadRadius;
  const glow = hf.team === null ? COLORS.hookHead : TEAM_COLORS[hf.team].body;
  const rot = (px: number, py: number): readonly [number, number] => [
    x + px * Math.cos(a) - py * Math.sin(a),
    y + px * Math.sin(a) + py * Math.cos(a),
  ];
  g.circle(x, y, SIZES.hookGlowRadius).fill({ color: glow, alpha: 0.35 });
  g.poly([...rot(r * 1.4, 0), ...rot(-r * 0.4, -r * 0.9), ...rot(-r * 0.1, 0), ...rot(-r * 0.4, r * 0.9)])
    .fill(COLORS.hookHead)
    .stroke({ width: 4, color: COLORS.outline, join: 'round' });
  g.circle(x, y, r * 0.35).fill(glow).stroke({ width: 3, color: COLORS.outline });
}

export function createHooksView(): HooksView {
  const g = new Graphics();
  return {
    container: g,
    update(frame) {
      g.clear();
      frame.hooks.forEach((hf) => drawChain(g, hf.chain));
      frame.hooks.forEach((hf) => drawHead(g, hf));
    },
  };
}
