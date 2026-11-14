import { TUNING } from '@hookbrawl/sim';
import type { GameEvent, Vec2 } from '@hookbrawl/sim';
import { ACESFilmicToneMapping, Color, FogExp2, PCFShadowMap, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import type { Session } from '../game/session';
import type { Assets } from './assets/loadAssets';
import { dampFocus, focusFor, poseFor, type Focus, type Viewport } from './camera/framing';
import { applyPose, screenToGround, worldToScreen } from './camera/projection';
import { shakeOffset } from './camera/shake';
import { createCharactersView } from './characters/charactersView';
import { createEffectsView } from './effects/effectsView';
import { createHooksView } from './hook/hooksView';
import { interpolateFrame, type RenderFrame } from './interpolate';
import { createDamageNumbers } from './overlay/damageNumbers';
import { createLabels, type LabelView } from './overlay/labels';
import { spreadLabels } from './overlay/spreadLabels';
import './overlay/overlay.css';
import { createArenaView } from './scene/arenaView';
import { simToWorld, worldToSim, type Vec3 } from './space';
import { createSoftDot } from './textures';
import { COLORS, LIGHTS, SIZES } from './theme';

export type RenderStats = { readonly calls: number; readonly triangles: number };

export type Renderer = {
  readonly canvas: HTMLCanvasElement;
  /** Sim ground point to CSS pixels from the canvas's top-left corner. */
  worldToScreen(p: Vec2): Vec2;
  /** CSS pixels from the canvas's top-left corner to the sim ground point under them. */
  screenToWorld(p: Vec2): Vec2;
  /** Draw calls and triangles of the most recent frame. */
  stats(): RenderStats;
  destroy(): void;
};

export type RendererEvents = { readonly onContextLost: () => void; readonly onContextRestored: () => void };

const MS_PER_SECOND = 1000;
// A tab that was hidden comes back with one huge frame; treat it as a short one.
const MAX_FRAME_SECONDS = 0.1;
const MAX_PIXEL_RATIO = 2;
const WARM_UP_FRAMES = 3;
/** Screen room one name-and-bar block needs before the next must be stacked clear of it. */
const LABEL_BOX = { width: 72, height: SIZES.labelBlockPx };

function createWebGL(): WebGLRenderer {
  try {
    return new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`This browser could not start WebGL, which Hook Brawl needs to draw the harbour (${detail})`);
  }
}

function labelsFor(frame: RenderFrame, project: (world: Vec3) => Vec2): readonly LabelView[] {
  const anchors = spreadLabels(
    frame.players.map(({ player, pos }) => (player.status.kind === 'dead' ? null : project(simToWorld(pos, SIZES.labelHeight)))),
    LABEL_BOX,
  );
  return frame.players.map(({ player }, i) => ({
    id: player.id,
    name: player.name,
    team: player.team,
    hpFraction: player.hp / TUNING.maxHp,
    anchor: anchors[i] ?? null,
  }));
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
  events: RendererEvents,
): Promise<Renderer> {
  const gl = createWebGL();
  gl.toneMapping = ACESFilmicToneMapping;
  gl.toneMappingExposure = LIGHTS.exposure;
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = PCFShadowMap;
  const canvas = gl.domElement;
  const overlay = document.createElement('div');
  overlay.className = 'world-overlay';
  host.append(canvas, overlay);

  const scene = new Scene();
  scene.background = new Color(COLORS.night);
  scene.fog = new FogExp2(COLORS.fog, LIGHTS.fogDensity);
  const camera = new PerspectiveCamera();
  const arena = session.getState().arena;
  const softDot = createSoftDot();
  const arenaView = createArenaView(arena, assets, softDot);
  const characters = createCharactersView(assets, session.localPlayerId);
  const hooks = createHooksView(softDot);
  const effects = createEffectsView(softDot);
  const labels = createLabels(overlay);
  const damage = createDamageNumbers(overlay);
  scene.add(arenaView.group, characters.group, hooks.group, effects.group);

  // People who ask their system for less motion get the hit without the jolt.
  const shakes = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let viewport: Viewport = { width: 1, height: 1 };
  let focus: Focus | null = null;
  let pending: readonly GameEvent[] = [];
  let shakeAge = Number.POSITIVE_INFINITY;
  let elapsed = 0;
  let last: number | null = null;
  let contextLost = false;
  let raf = 0;
  let stats: RenderStats = { calls: 0, triangles: 0 };

  const resize = (): void => {
    viewport = { width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight) };
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    gl.setSize(viewport.width, viewport.height);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  const unsubscribe = session.subscribe((state, change) => {
    if (change === 'tick') {
      pending = [...pending, ...state.events];
      return;
    }
    pending = [];
    focus = null;
    characters.clear();
    effects.clear();
    damage.clear();
  });

  const project = (world: Vec3): Vec2 => worldToScreen(camera, viewport, world);
  const right = new Vector3();
  const up = new Vector3();

  const aimCamera = (frame: RenderFrame, dt: number): void => {
    const local = frame.players.find((p) => p.player.id === session.localPlayerId);
    if (local !== undefined) {
      const wanted = focusFor(arena, local.player.team, local.pos, viewport);
      focus = focus === null ? wanted : dampFocus(focus, wanted, dt);
    }
    applyPose(camera, poseFor(focus ?? { x: 0, z: 0 }, viewport));
  };

  /** Brings every view in line with the session's current frame; draws nothing. */
  const update = (dt: number): void => {
    const frame = interpolateFrame(session.frame());
    const tickEvents = pending;
    pending = [];
    if (shakes && tickEvents.some((e) => e.kind === 'hookHit' && e.damage > 0)) shakeAge = 0;
    shakeAge += dt;

    aimCamera(frame, dt);
    arenaView.update(elapsed);
    characters.update(frame, tickEvents, dt);
    hooks.update(frame, characters.handPosition);
    effects.update(tickEvents, dt, camera);
    labels.update(labelsFor(frame, project));
    damage.spawn(tickEvents);
    damage.update(dt, project, (id) => frame.players.find((p) => p.player.id === id)?.pos ?? null);
  };

  const present = (): void => {
    const unshaken = camera.position.clone();
    const offset = shakeOffset(shakeAge);
    camera.matrixWorld.extractBasis(right, up, new Vector3());
    camera.position.addScaledVector(right, offset.right).addScaledVector(up, offset.up);
    camera.updateMatrixWorld(true);
    gl.render(scene, camera);
    stats = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
    // Aiming reads the camera between frames, so it must not see the shake.
    camera.position.copy(unshaken);
    camera.updateMatrixWorld(true);
  };

  const onFrame = (now: number): void => {
    raf = requestAnimationFrame(onFrame);
    const dt = last === null ? 0 : Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - last) / MS_PER_SECOND));
    last = now;
    if (contextLost) return;
    elapsed += dt;
    session.advance(dt);
    update(dt);
    present();
  };

  const onLost = (event: Event): void => {
    // Without this the browser never offers the context back.
    event.preventDefault();
    contextLost = true;
    events.onContextLost();
  };
  const onRestored = (): void => {
    contextLost = false;
    last = null;
    events.onContextRestored();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  const destroy = (): void => {
    cancelAnimationFrame(raf);
    unsubscribe();
    observer.disconnect();
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    characters.clear();
    [arenaView, hooks, effects].forEach((view) => view.dispose());
    softDot.dispose();
    gl.dispose();
    canvas.remove();
    overlay.remove();
  };

  try {
    // Populate the scene (characters are created on first sight) and compile without blocking the page where the
    // browser allows. Then draw a few real frames: the first builds the shadow-pass shaders compileAsync skips, and
    // waiting for the browser to hand back the next frame absorbs however long the GPU takes to catch up with it.
    update(0);
    await gl.compileAsync(scene, camera);
    for (let i = 0; i < WARM_UP_FRAMES; i += 1) {
      present();
      await new Promise<number>((resolve) => {
        raf = requestAnimationFrame(resolve);
      });
    }
  } catch (error) {
    destroy();
    throw error;
  }
  raf = requestAnimationFrame(onFrame);

  return {
    canvas,
    worldToScreen: (p) => project(simToWorld(p)),
    screenToWorld: (p) => worldToSim(screenToGround(camera, viewport, p)),
    stats: () => stats,
    destroy,
  };
}
