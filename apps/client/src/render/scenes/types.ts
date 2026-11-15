import type { SceneId } from '@hookwars/room';
import type { Arena, TeamId } from '@hookwars/sim';
import type { Camera, Object3D, Texture } from 'three';
import type { Assets } from '../assets/loadAssets';
import type { Vec3 } from '../space';
import type { TeamPalette } from '../theme';

export { SCENE_IDS, type SceneId } from '@hookwars/room';

export type Atmosphere = {
  readonly background: number;
  /** A gradient dome for scenes whose establishing shot shows the sky; null keeps the flat background. */
  readonly sky: { readonly zenith: number; readonly horizon: number } | null;
  readonly fog: { readonly color: number; readonly density: number };
  readonly exposure: number;
  /** 0..1: how dark the corners of the picture are drawn. */
  readonly vignette: number;
};

/** A directional light, placed by the direction it shines from. */
export type SunSpec = { readonly color: number; readonly intensity: number; readonly from: Vec3 };

export type ShadowSpec = {
  readonly mapSize: number;
  readonly bias: number;
  readonly normalBias: number;
  /** Texels the shadow's edge is blurred over: 1 is crisp, more softens it. */
  readonly radius: number;
};

export type LightRig = {
  /** The only light that casts shadows. */
  readonly key: SunSpec & { readonly shadow: ShadowSpec };
  /** A weak counter-light that only picks out edges. */
  readonly rim: SunSpec | null;
  readonly fill: { readonly sky: number; readonly ground: number; readonly intensity: number };
};

/** A local light with a soft glow where its source is. It casts no shadow. */
export type Lamp = {
  readonly glowAt: Vec3;
  /** The light hangs this far above its glow, clear of whatever holds it. */
  readonly lift: number;
  readonly color: number;
  readonly glowColor: number;
  readonly glowSize: number;
  readonly intensity: number;
  readonly distance: number;
  readonly decay: number;
  /** 0 burns steady; a torch flickers by about this fraction. */
  readonly flicker: number;
};

/** How the strip between the platforms is shaded. */
export type WaterSpec = {
  readonly level: number;
  readonly color: number;
  readonly roughness: number;
  readonly metalness: number;
  /** World units one repeat of the swell covers. */
  readonly swellSize: number;
  readonly ripple: number;
  /** Texture repeats per second the swell slides by. */
  readonly drift: { readonly x: number; readonly y: number };
  readonly reflection: ReflectionSpec;
};

/** The scene mirrored in the water, drawn only at high quality. */
export type ReflectionSpec = {
  readonly on: boolean;
  /** 0..1: how much of the water's own shading the mirror image replaces. */
  readonly strength: number;
  /** How far the swell pushes the image about, as a fraction of the screen. */
  readonly distortion: number;
};

/** Glow around the scene's light sources, drawn only at high quality. Lit surfaces, however bright, never glow. */
export type BloomSpec = {
  readonly on: boolean;
  readonly strength: number;
  /** 0..1: how far the glow spreads. */
  readonly radius: number;
  /** Scene light a source must be brighter than to glow: 1 is white, and a lamp or a neon tube is drawn well past it. */
  readonly threshold: number;
};

/** A light on the edges of each fighter's silhouette, so a dark pelt never sinks into dark ground. */
export type FighterRim = {
  readonly on: boolean;
  readonly strength: number;
  readonly color: number;
  /** Higher keeps the light to a thinner edge. */
  readonly power: number;
  /** 0..1: how far the light leans from `color` to the fighter's own team glow. */
  readonly team: number;
};

export type WaterSheet = { readonly centre: Vec3; readonly width: number; readonly depth: number };

/** Colours of the things a player must never lose against this scene's ground. */
export type Tints = {
  /** Chain links, hook and claw steel. */
  readonly iron: number;
  /** How much of its own colour the chain gives off. */
  readonly chainGlow: number;
  readonly rope: number;
  readonly ropeGlow: number;
  readonly teams: Readonly<Record<TeamId, TeamPalette>>;
  /** How much of its own texture a character gives off, so a dark pelt never sinks into the ground. */
  readonly characterSelfLight: number;
  readonly overlay: OverlayInk;
};

/** Inks of the names and damage numbers drawn over the scene, as CSS values. */
export type OverlayInk = {
  readonly damage: string;
  readonly damageHeavy: string;
  /** `text-shadow` lists: the outline that keeps pale text legible on this scene's ground. */
  readonly nameShadow: string;
  readonly damageShadow: string;
};

export type CameraShot = { readonly position: Vec3; readonly target: Vec3; readonly fovDeg: number };

/** The low-angle shot a match opens on: the camera drifts from one pose to the other, then eases down to the fight. */
export type IntroShot = {
  readonly from: CameraShot;
  readonly to: CameraShot;
  /** How many times thicker the fog is while the shot holds, thinning to the scene's own as the camera comes down. 1 leaves it alone. */
  readonly haze: number;
};

export type Drift = {
  readonly count: number;
  readonly color: number;
  readonly opacity: number;
  /** World units across. */
  readonly size: number;
  /** The box they wander in; one that leaves by a face comes back in by the opposite one. */
  readonly box: { readonly min: Vec3; readonly max: Vec3 };
  /** World units per second. */
  readonly velocity: Vec3;
  readonly additive: boolean;
};

/** A box on the ground plan with the height its top reaches. */
export type Footprint = {
  readonly label: string;
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly top: number;
};

/** What every scene's layout must be able to say about itself, whatever else it holds. */
export type SceneLayout = {
  /** Everything built by the scene's set, as boxes on the ground plan. */
  readonly footprints: readonly Footprint[];
  /** The round thing hooks bounce off: where it is drawn, the radius of its body, and the furthest any of it reaches from its centre line. */
  readonly obstacle: { readonly x: number; readonly z: number; readonly radius: number; readonly reach: number };
  readonly lamps: readonly Lamp[];
  readonly water: WaterSheet;
};

/** How ground out of the team's sight is shaded under fog of war: multiplied towards `color` by `opacity`, its edge softened over `edge` sim units. */
export type FogOfWarLook = { readonly color: number; readonly opacity: number; readonly edge: number };

export type SceneLook = {
  readonly id: SceneId;
  readonly title: { readonly name: string; readonly caption: string };
  readonly atmosphere: Atmosphere;
  readonly lights: LightRig;
  readonly water: WaterSpec;
  readonly tints: Tints;
  readonly intro: IntroShot;
  /** Things adrift in the air: fog banks, motes. */
  readonly ambient: readonly Drift[];
  readonly fogOfWar: FogOfWarLook;
  readonly bloom: BloomSpec;
  readonly fighterRim: FighterRim;
};

export type SetContext = { readonly arena: Arena; readonly assets: Assets; readonly softDot: Texture };

/** Something in the scene that owns GPU resources and may move with time. */
export type Animated = {
  readonly group: Object3D;
  /** `camera` is where the frame about to be drawn is seen from, for the few things that must face it. */
  update(elapsed: number, camera: Camera): void;
  dispose(): void;
};

export type SceneTheme = SceneLook & {
  /** Pure: where everything stands, derived from the sim's arena. */
  layOut(arena: Arena): SceneLayout;
  /** The platforms, the obstacle and the dressing. Sky, lights and water are built from the look, the same way in every scene. */
  buildSet(ctx: SetContext): { readonly layout: SceneLayout; readonly set: Animated };
};

/** Ties a scene's layout to the builder that draws it, so the layout a test guards is the one that gets built. */
export function defineScene<L extends SceneLayout>(
  look: SceneLook,
  layOut: (arena: Arena) => L,
  build: (layout: L, ctx: SetContext) => Animated,
): SceneTheme {
  return {
    ...look,
    layOut,
    buildSet(ctx) {
      const layout = layOut(ctx.arena);
      return { layout, set: build(layout, ctx) };
    },
  };
}
