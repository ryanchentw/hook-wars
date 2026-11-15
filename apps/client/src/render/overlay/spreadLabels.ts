import type { Vec2 } from '@hookwars/sim';

export type LabelBox = { readonly width: number; readonly height: number };

/**
 * Lifts labels that would print over one another, as happens when two brawlers stand toe to toe.
 * The label lowest on screen keeps its place and each one that collides with it is stacked above.
 * Each label is as wide as its own name, so a long name clears its neighbours too.
 * Order and nulls (hidden labels) are preserved.
 */
export function spreadLabels(anchors: readonly (Vec2 | null)[], widths: readonly number[], height: number): readonly (Vec2 | null)[] {
  const order = anchors
    .map((anchor, index) => ({ anchor, index, width: widths[index] ?? 0 }))
    .filter((e): e is { anchor: Vec2; index: number; width: number } => e.anchor !== null)
    .sort((a, b) => b.anchor.y - a.anchor.y || a.index - b.index);
  const placed: { readonly index: number; readonly at: Vec2; readonly width: number }[] = [];
  for (const { anchor, index, width } of order) {
    let at = anchor;
    for (const other of placed) {
      const overlaps = Math.abs(other.at.x - at.x) < (other.width + width) / 2 && Math.abs(other.at.y - at.y) < height;
      if (overlaps) at = { x: at.x, y: other.at.y - height };
    }
    placed.push({ index, at, width });
  }
  return anchors.map((anchor, index) => (anchor === null ? null : (placed.find((p) => p.index === index)?.at ?? anchor)));
}

/** Slides a label whose fighter is on screen but near an edge back inside, so the name is never cut off. */
export function keepInView(anchor: Vec2, box: LabelBox, view: LabelBox): Vec2 {
  if (anchor.x < 0 || anchor.x > view.width) return anchor;
  const half = box.width / 2;
  const x = Math.min(view.width - half, Math.max(half, anchor.x));
  return x === anchor.x ? anchor : { x, y: anchor.y };
}
