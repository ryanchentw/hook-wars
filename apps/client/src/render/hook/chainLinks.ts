import type { Vec3 } from '../space';

export type LinkPlacement = {
  readonly position: Vec3;
  /** Unit vector along the chain, pointing from the hand towards the hook. */
  readonly direction: Vec3;
  /** Alternate links sit a quarter turn about the chain, the way real links interlock. */
  readonly quarterTurn: boolean;
};

export type ChainLayout = {
  readonly links: readonly LinkPlacement[];
  /** How much longer than normal each link must be drawn; above 1 only when the link cap was hit. */
  readonly stretch: number;
};

type Segment = { readonly from: Vec3; readonly direction: Vec3; readonly length: number };

const EMPTY: ChainLayout = { links: [], stretch: 1 };

function segmentsFromHook(polyline: readonly Vec3[]): readonly Segment[] {
  const segments: Segment[] = [];
  for (let i = polyline.length - 1; i > 0; i -= 1) {
    const hookSide = polyline[i];
    const handSide = polyline[i - 1];
    if (hookSide === undefined || handSide === undefined) continue;
    const dx = hookSide.x - handSide.x;
    const dy = hookSide.y - handSide.y;
    const dz = hookSide.z - handSide.z;
    const length = Math.hypot(dx, dy, dz);
    if (length === 0) continue;
    segments.push({ from: hookSide, direction: { x: dx / length, y: dy / length, z: dz / length }, length });
  }
  return segments;
}

/**
 * Places chain links along a polyline that runs from the thrower's hand to the hook.
 * Links are counted from the hook, so they travel with it as chain pays out or reels in at the hand.
 */
export function layOutChain(polyline: readonly Vec3[], spacing: number, maxLinks: number): ChainLayout {
  const segments = segmentsFromHook(polyline);
  const total = segments.reduce((sum, s) => sum + s.length, 0);
  const wanted = spacing > 0 ? Math.floor(total / spacing) : 0;
  const count = Math.min(Math.max(0, Math.floor(maxLinks)), wanted);
  if (count === 0) return EMPTY;
  const step = count < wanted ? total / count : spacing;

  const links: LinkPlacement[] = [];
  let segmentIndex = 0;
  let segmentStart = 0;
  for (let i = 0; i < count; i += 1) {
    const arc = (i + 0.5) * step;
    let segment = segments[segmentIndex];
    while (segment !== undefined && arc > segmentStart + segment.length && segmentIndex < segments.length - 1) {
      segmentStart += segment.length;
      segmentIndex += 1;
      segment = segments[segmentIndex];
    }
    if (segment === undefined) break;
    const back = arc - segmentStart;
    links.push({
      position: {
        x: segment.from.x - segment.direction.x * back,
        y: segment.from.y - segment.direction.y * back,
        z: segment.from.z - segment.direction.z * back,
      },
      direction: segment.direction,
      quarterTurn: i % 2 === 1,
    });
  }
  return { links, stretch: step / spacing };
}
