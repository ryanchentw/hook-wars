import type { Arena, PlayerId, SeenEvent, TeamId } from '@hookwars/sim';
import { Color, FogExp2, Group, type BufferGeometry, type Camera, type Scene, type Texture, type Vector3, type WebGLRenderer } from 'three';
import type { Assets } from './assets/loadAssets';
import { createCharactersView } from './characters/charactersView';
import { createRimLight } from './characters/rim';
import { createEffectsView } from './effects/effectsView';
import { createFogLayer } from './fog/fogLayer';
import { createGrapplesView } from './grapple/grapplesView';
import { createHooksView } from './hook/hooksView';
import type { Impact } from './impact/impacts';
import type { PlayerFrame, RenderFrame } from './interpolate';
import { createDrift } from './scenes/kit/drift';
import { createLighting, type Lighting } from './scenes/kit/lighting';
import { createSky } from './scenes/kit/sky';
import { createWater, type Water } from './scenes/kit/water';
import type { Animated, SceneLook, SceneTheme } from './scenes/types';
import { toWorldLength } from './space';

/** What outlives any one scene: the renderer makes these once and disposes of them. */
export type StageShared = {
  readonly arena: Arena;
  readonly assets: Assets;
  readonly softDot: Texture;
  readonly hookGeometry: BufferGeometry;
  readonly localPlayerId: PlayerId;
  /** Fog of war over the enemy, seen from the viewer's side; null draws no veil. */
  readonly fog: { readonly viewer: TeamId; readonly radius: number; readonly fadeSeconds: number } | null;
};

export type StageUpdate = {
  readonly frame: RenderFrame;
  /** Sim events since the previous update, each delivered exactly once, and the blows among them. */
  readonly events: readonly SeenEvent[];
  readonly impacts: readonly Impact[];
  readonly dt: number;
  readonly elapsed: number;
  readonly camera: Camera;
};

/** One scene with the fight in it: the set, its sky, lights and water, and the fighters, hooks and effects tinted for it. */
export type Stage = {
  readonly theme: SceneTheme;
  readonly group: Group;
  update(input: StageUpdate): void;
  /** Takes `look`'s lights, water, veil and rim as they now are, without rebuilding anything. `reflect` is whether this picture draws reflections at all. */
  retune(look: SceneLook, reflect: boolean): void;
  /** Redraws the water's mirror image for the frame about to be drawn from `camera`. */
  mirror(gl: WebGLRenderer, scene: Scene, camera: Camera): void;
  handPosition(playerId: PlayerId): Vector3 | null;
  dispose(): void;
};

type Backdrop = { readonly parts: readonly Animated[]; readonly water: Water; readonly lighting: Lighting };

function backdrop(theme: SceneTheme, shared: StageShared): Backdrop {
  const { arena, assets, softDot } = shared;
  const size = { w: toWorldLength(arena.width), d: toWorldLength(arena.height) };
  const { layout, set } = theme.buildSet({ arena, assets, softDot });
  const sky = theme.atmosphere.sky;
  const water = createWater(theme.water, layout.water);
  const lighting = createLighting(theme.lights, layout.lamps, size, softDot);
  const parts = [set, water, lighting, ...(sky === null ? [] : [createSky(sky, { x: size.w / 2, z: size.d / 2 })]), ...theme.ambient.map((drift) => createDrift(drift, softDot))];
  return { parts, water, lighting };
}

export function createStage(theme: SceneTheme, shared: StageShared): Stage {
  const { assets, softDot, hookGeometry, localPlayerId } = shared;
  const { parts: scenery, water, lighting } = backdrop(theme, shared);
  const rim = createRimLight(theme.fighterRim);
  const characters = createCharactersView(assets, { hookGeometry, softDot, tints: theme.tints, rim }, localPlayerId);
  const hooks = createHooksView(hookGeometry, softDot, theme.tints, shared.fog?.fadeSeconds ?? 0);
  const grapples = createGrapplesView(softDot, theme.tints);
  const effects = createEffectsView(softDot);
  const fog = shared.fog === null ? null : createFogLayer({ ...shared.fog, arena: shared.arena, look: theme.fogOfWar });
  const group = new Group();
  group.add(...scenery.map((part) => part.group), characters.group, hooks.group, grapples.group, effects.group);
  if (fog !== null) group.add(fog.mesh);

  return {
    theme,
    group,
    update({ frame, events, impacts, dt, elapsed, camera }) {
      const frameOf = (id: PlayerId): PlayerFrame | undefined => frame.players.find((p) => p.player.id === id);
      scenery.forEach((part) => part.update(elapsed, camera));
      fog?.update(frame, dt);
      characters.update(frame, events, impacts, dt);
      hooks.update(frame, characters.handPosition, dt);
      grapples.update(frame, characters.offHandPosition);
      effects.update(events, impacts, dt, camera, (id) => frameOf(id)?.player.facing ?? null);
    },
    retune(look, reflect) {
      lighting.retune(look.lights);
      water.retune(look.water, reflect && look.water.reflection.on);
      rim.retune(look.fighterRim);
      fog?.retune(look.fogOfWar);
    },
    mirror(gl, scene, camera) {
      // The veil lies over the water; seen from below it would be drawn into the image it is there to dim.
      if (fog !== null) fog.mesh.visible = false;
      water.mirror(gl, scene, camera);
      if (fog !== null) fog.mesh.visible = true;
    },
    handPosition: characters.handPosition,
    dispose() {
      characters.clear();
      [...scenery, hooks, grapples, effects].forEach((part) => part.dispose());
      fog?.dispose();
    },
  };
}

/** Sets everything about the picture that is not an object in it: clear colour, fog, exposure, and the inks of the DOM drawn over it. */
export function applyLook(look: SceneLook, target: { readonly scene: Scene; readonly gl: WebGLRenderer; readonly host: HTMLElement }): void {
  const { atmosphere, tints } = look;
  target.scene.background = new Color(atmosphere.background);
  target.scene.fog = new FogExp2(atmosphere.fog.color, atmosphere.fog.density);
  target.gl.toneMappingExposure = atmosphere.exposure;
  target.host.dataset.scene = look.id;
  const ink: Readonly<Record<string, string>> = {
    '--vignette': String(atmosphere.vignette),
    '--name-shadow': tints.overlay.nameShadow,
    '--damage-ink': tints.overlay.damage,
    '--damage-heavy-ink': tints.overlay.damageHeavy,
    '--damage-shadow': tints.overlay.damageShadow,
  };
  Object.entries(ink).forEach(([name, value]) => target.host.style.setProperty(name, value));
}
