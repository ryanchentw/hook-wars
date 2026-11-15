import type { Arena, PlayerId, SeenEvent, TeamId } from '@hookwars/sim';
import { Color, FogExp2, Group, type BufferGeometry, type Camera, type Scene, type Texture, type Vector3, type WebGLRenderer } from 'three';
import type { Assets } from './assets/loadAssets';
import { createCharactersView } from './characters/charactersView';
import { createEffectsView } from './effects/effectsView';
import { createFogLayer } from './fog/fogLayer';
import { createGrapplesView } from './grapple/grapplesView';
import { createHooksView } from './hook/hooksView';
import type { Impact } from './impact/impacts';
import type { PlayerFrame, RenderFrame } from './interpolate';
import { createAuraView } from './pickups/auraView';
import { createPickupsView } from './pickups/pickupsView';
import { createDrift } from './scenes/kit/drift';
import { createLighting } from './scenes/kit/lighting';
import { createSky } from './scenes/kit/sky';
import { createWater } from './scenes/kit/water';
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
  /** The viewer asked for less motion. */
  readonly calm: boolean;
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
  handPosition(playerId: PlayerId): Vector3 | null;
  dispose(): void;
};

function backdrop(theme: SceneTheme, shared: StageShared): readonly Animated[] {
  const { arena, assets, softDot } = shared;
  const size = { w: toWorldLength(arena.width), d: toWorldLength(arena.height) };
  const { layout, set } = theme.buildSet({ arena, assets, softDot });
  const sky = theme.atmosphere.sky;
  return [
    set,
    createWater(theme.water, layout.water),
    createLighting(theme.lights, layout.lamps, size, softDot),
    ...(sky === null ? [] : [createSky(sky, { x: size.w / 2, z: size.d / 2 })]),
    ...theme.ambient.map((drift) => createDrift(drift, softDot)),
  ];
}

export function createStage(theme: SceneTheme, shared: StageShared): Stage {
  const { assets, softDot, hookGeometry, localPlayerId } = shared;
  const scenery = backdrop(theme, shared);
  const characters = createCharactersView(assets, { hookGeometry, softDot, tints: theme.tints }, localPlayerId);
  const hooks = createHooksView(hookGeometry, softDot, theme.tints, shared.fog?.fadeSeconds ?? 0);
  const grapples = createGrapplesView(softDot, theme.tints);
  const effects = createEffectsView(softDot);
  const pickups = createPickupsView({ softDot, waterLevel: theme.water.level, fadeSeconds: shared.fog?.fadeSeconds ?? 0, calm: shared.calm });
  const auras = createAuraView(softDot, shared.calm);
  const fog = shared.fog === null ? null : createFogLayer({ ...shared.fog, arena: shared.arena, look: theme.fogOfWar });
  const group = new Group();
  group.add(...scenery.map((part) => part.group), characters.group, hooks.group, grapples.group, effects.group, pickups.group, auras.group);
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
      pickups.update(frame, elapsed, dt);
      auras.update(frame, events, elapsed, dt, camera);
    },
    handPosition: characters.handPosition,
    dispose() {
      characters.clear();
      [...scenery, hooks, grapples, effects, pickups, auras].forEach((part) => part.dispose());
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
