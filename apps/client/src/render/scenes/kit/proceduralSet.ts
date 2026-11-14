import { Group } from 'three';
import type { Vec3 } from '../../space';
import type { Animated, Footprint, Lamp, SceneLayout, SetContext, WaterSheet } from '../types';
import { swayAt, type Motion } from './motion';
import type { Paint, TextureDef } from './paint';
import { footprintOf, reachFrom, type Part } from './parts';
import type { Plan } from './plan';
import { createWorkshop, type Workshop } from './workshop';

/** Parts that move as one about a mooring. The parts are laid out around the origin. */
export type Mover = { readonly parts: readonly Part[]; readonly home: Vec3; readonly motion: Motion };

/** The layout of a scene made wholly of parts. */
export type ProceduralLayout = SceneLayout & {
  /** Platforms and dressing that never move. */
  readonly still: readonly Part[];
  /** The obstacle, laid out around the origin and moored at the sim's circle. */
  readonly obstacleMover: Mover;
  readonly movers: readonly Mover[];
  /** Shadow casters that are not themselves drawn. They may hang over the play area: nothing of them is ever seen. */
  readonly shade: readonly Mover[];
};

export type ProceduralInput = {
  readonly plan: Plan;
  readonly still: readonly Part[];
  readonly obstacle: { readonly parts: readonly Part[]; readonly motion: Motion };
  readonly movers?: readonly Mover[];
  readonly shade?: readonly Mover[];
  readonly lamps: readonly Lamp[];
  readonly water: WaterSheet;
};

function sweptFootprints(mover: Mover): readonly Footprint[] {
  return mover.parts.map((p) => {
    const f = footprintOf(p);
    return {
      label: f.label,
      x0: f.x0 + mover.home.x - mover.motion.drift,
      x1: f.x1 + mover.home.x + mover.motion.drift,
      z0: f.z0 + mover.home.z,
      z1: f.z1 + mover.home.z,
      top: f.top + mover.home.y + mover.motion.bob,
    };
  });
}

/** Fills in what a layout must say about itself from the parts it is made of. */
export function proceduralLayout(input: ProceduralInput): ProceduralLayout {
  const { plan, still, obstacle } = input;
  const movers = input.movers ?? [];
  return {
    still,
    obstacleMover: { parts: obstacle.parts, home: { x: plan.obstacle.x, y: 0, z: plan.obstacle.z }, motion: obstacle.motion },
    movers,
    shade: input.shade ?? [],
    footprints: [...still.map(footprintOf), ...movers.flatMap(sweptFootprints)],
    obstacle: { ...plan.obstacle, reach: reachFrom(obstacle.parts, { x: 0, z: 0 }) },
    lamps: input.lamps,
    water: input.water,
  };
}

function moving(shop: Workshop, mover: Mover): { readonly group: Group; update(elapsed: number): void } {
  const group = shop.build(mover.parts);
  group.position.set(mover.home.x, mover.home.y, mover.home.z);
  return {
    group,
    update(elapsed) {
      const sway = swayAt(mover.motion, elapsed);
      group.position.set(mover.home.x + sway.x, mover.home.y + sway.y, mover.home.z);
      group.rotation.set(sway.tiltX, 0, sway.tiltZ);
    },
  };
}

/** What a scene may do each frame to the textures it painted, such as sliding a reflection. */
export type Animate = (shop: Workshop, elapsed: number) => void;

/** Builds a scene's set from its parts: one mesh per paint for what stands still, and a group for each thing that moves. */
export function proceduralSet(paints: Readonly<Record<string, Paint>>, textures: Readonly<Record<string, TextureDef>>, animate: Animate = () => undefined) {
  return (layout: ProceduralLayout, _ctx: SetContext): Animated => {
    const shop = createWorkshop(paints, textures);
    const group = new Group();
    const still = shop.build(layout.still);
    still.matrixAutoUpdate = false;
    const movers = [layout.obstacleMover, ...layout.movers, ...layout.shade].map((mover) => moving(shop, mover));
    group.add(still, ...movers.map((m) => m.group));
    return {
      group,
      update(elapsed) {
        movers.forEach((m) => m.update(elapsed));
        animate(shop, elapsed);
      },
      dispose: shop.dispose,
    };
  };
}
