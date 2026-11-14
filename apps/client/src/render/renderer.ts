import type { GameEvent, Vec2 } from '@hookbrawl/sim';
import { ACESFilmicToneMapping, PCFShadowMap, WebGLRenderer } from 'three';
import type { Session } from '../game/session';
import type { Assets } from './assets/loadAssets';
import { screenToGround, worldToScreen } from './camera/projection';
import { createCameraRig, type CameraRig } from './camera/rig';
import { createFrameLoop, type ContextEvents } from './frameLoop';
import { createHookGeometry } from './hook/hookGeometry';
import { CALM_IMPACTS, IMPACTS, impactsOf, type Fighter, type Impact } from './impact/impacts';
import { interpolateFrame, type RenderFrame } from './interpolate';
import { INTRO_TIMING, introHaze, introPose, playsIntro } from './intro/intro';
import { createOpening, type Opening } from './intro/opening';
import { createWorldOverlay } from './overlay/worldOverlay';
import type { ViewOptions } from './scenes/choice';
import type { SceneId } from './scenes/types';
import { createSceneShow, type SceneShow } from './sceneShow';
import { simToWorld, worldToSim, type Vec3 } from './space';
import type { StageShared } from './stage';
import { createSurface, type Surface } from './surface';
import { createSoftDot } from './textures';

export type RenderStats = {
  /** Draw calls and triangles of the most recent frame. */
  readonly calls: number;
  readonly triangles: number;
  /** Geometries and textures now held on the GPU. */
  readonly geometries: number;
  readonly textures: number;
};

export type Renderer = {
  readonly canvas: HTMLCanvasElement;
  /** Sim ground point to CSS pixels from the canvas's top-left corner. */
  worldToScreen(p: Vec2): Vec2;
  /** CSS pixels from the canvas's top-left corner to the sim ground point under them. */
  screenToWorld(p: Vec2): Vec2;
  stats(): RenderStats;
  /** The scene the current match is drawn in. */
  sceneId(): SceneId;
  /** True while a match's establishing shot is playing. */
  introActive(): boolean;
  skipIntro(): void;
  /** Stops the picture and the match on the frame now showing, for tooling that needs to look at one exact moment. */
  setFrozen(frozen: boolean): void;
  destroy(): void;
};

export type RendererEvents = ContextEvents & {
  /** The establishing shot started or ended; the match must not run while it plays. */
  readonly onIntro: (active: boolean) => void;
};

const WARM_UP_FRAMES = 3;
const NO_IMPACTS: readonly Impact[] = [];

function createWebGL(): WebGLRenderer {
  try {
    const gl = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    gl.toneMapping = ACESFilmicToneMapping;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = PCFShadowMap;
    return gl;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`This browser could not start WebGL, which Hook Brawl needs to draw the match (${detail})`);
  }
}

function impactsIn(events: readonly GameEvent[], frame: RenderFrame, session: Session, calm: boolean): readonly Impact[] {
  if (events.length === 0) return NO_IMPACTS;
  const fighterOf = (id: string): Fighter | null => {
    const pf = frame.players.find((p) => p.player.id === id);
    return pf === undefined ? null : { pos: pf.pos, team: pf.player.team };
  };
  return impactsOf(events, fighterOf, session.localPlayerId, calm ? CALM_IMPACTS : IMPACTS);
}

type PictureParts = {
  readonly gl: WebGLRenderer;
  readonly session: Session;
  readonly surface: Surface;
  readonly show: SceneShow;
  readonly rig: CameraRig;
  readonly opening: Opening;
  readonly view: ViewOptions;
  /** People who ask their system for less motion get the hit without the jolt or the freeze. */
  readonly calm: boolean;
};

/** Keeps the picture in step with the session: collects each tick's events, re-dresses the stage for a new match, and draws. */
function createPicture({ gl, session, surface, show, rig, opening, view, calm }: PictureParts) {
  const overlay = createWorldOverlay(surface.overlay);
  let pending: readonly GameEvent[] = [];
  let elapsed = 0;
  let stats: RenderStats = { calls: 0, triangles: 0, geometries: 0, textures: 0 };

  const open = (previous: SceneId | null): void => {
    if (playsIntro(view.intro, previous, show.id())) opening.begin(show.stage().theme.title);
  };
  const unsubscribe = session.subscribe((state, change) => {
    if (change === 'tick') {
      pending = [...pending, ...state.events];
      return;
    }
    pending = [];
    rig.reset();
    overlay.clear();
    open(show.nextMatch());
  });
  const project = (world: Vec3): Vec2 => worldToScreen(rig.camera, surface.viewport(), world);

  /** Brings every view in line with the session's current frame; draws nothing. */
  const update = (dt: number): void => {
    const frame = interpolateFrame(session.frame());
    const tickEvents = pending;
    pending = [];
    const impacts = impactsIn(tickEvents, frame, session, calm);
    rig.jolt(impacts, dt);
    const intro = opening.step(dt);
    const gameplay = rig.follow(frame, surface.viewport(), dt);
    const stage = show.stage();
    rig.place(intro === null ? gameplay : introPose(stage.theme.intro, gameplay, intro));
    show.setHaze(introHaze(stage.theme.intro, intro));
    stage.update({ frame, events: tickEvents, impacts, dt, elapsed, camera: rig.camera });
    overlay.setVisible(intro === null);
    overlay.update(frame, impacts, { project, viewport: surface.viewport() }, dt);
  };
  const present = (): void => {
    rig.shaken(() => gl.render(show.scene, rig.camera));
    const { render, memory } = gl.info;
    stats = { calls: render.calls, triangles: render.triangles, geometries: memory.geometries, textures: memory.textures };
  };

  return {
    project,
    stats: (): RenderStats => stats,
    draw(dt: number): void {
      elapsed += dt;
      update(dt);
      present();
    },
    /**
     * Populates the scene (characters are created on first sight) and compiles without blocking the page where the
     * browser allows. Then draws a few real frames: the first builds the shadow-pass shaders compileAsync skips, and
     * waiting for the browser to hand back the next frame absorbs however long the GPU takes to catch up with it.
     */
    async warmUp(): Promise<void> {
      open(null);
      update(0);
      await gl.compileAsync(show.scene, rig.camera);
      for (let i = 0; i < WARM_UP_FRAMES; i += 1) {
        present();
        await new Promise<number>((resolve) => requestAnimationFrame(resolve));
      }
    },
    dispose: unsubscribe,
  };
}

/**
 * Owns the three.js scene and drives the session from the animation frame.
 * Resolves once every shader is compiled and frames are flowing, so the match never opens on a stalled picture;
 * the session is not advanced before then.
 */
export async function createRenderer(
  host: HTMLElement,
  session: Session,
  assets: Assets,
  view: ViewOptions,
  events: RendererEvents,
): Promise<Renderer> {
  const gl = createWebGL();
  const surface = createSurface(host, gl);
  const arena = session.getState().arena;
  const shared: StageShared = { arena, assets, softDot: createSoftDot(), hookGeometry: createHookGeometry(), localPlayerId: session.localPlayerId };
  const show = createSceneShow(gl, host, shared, view.scene);
  const rig = createCameraRig(arena, session.localPlayerId);
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const opening = createOpening(surface.overlay, calm ? INTRO_TIMING.reduced : INTRO_TIMING.full, events.onIntro);
  const picture = createPicture({ gl, session, surface, show, rig, opening, view, calm });
  const loop = createFrameLoop(surface.canvas, events, (dt) => {
    session.advance(dt);
    picture.draw(dt);
  });

  const destroy = (): void => {
    loop.stop();
    picture.dispose();
    opening.dispose();
    show.dispose();
    shared.softDot.dispose();
    shared.hookGeometry.dispose();
    gl.dispose();
    surface.dispose();
  };
  try {
    await picture.warmUp();
  } catch (error) {
    destroy();
    throw error;
  }
  loop.start();

  return {
    canvas: surface.canvas,
    worldToScreen: (p) => picture.project(simToWorld(p)),
    screenToWorld: (p) => worldToSim(screenToGround(rig.camera, surface.viewport(), p)),
    stats: picture.stats,
    sceneId: show.id,
    introActive: opening.active,
    skipIntro: opening.skip,
    setFrozen: loop.setHeld,
    destroy,
  };
}
