import { createMatch, DEFAULT_ARENA, viewFor } from '@hookwars/sim';
import type { PlayerId } from '@hookwars/sim';
import { PerspectiveCamera } from 'three';
import { poseFor } from './camera/framing';
import { applyPose } from './camera/projection';
import { createFrameLoop, type ContextEvents } from './frameLoop';
import type { Graphics } from './graphics';
import type { RenderFrame } from './interpolate';
import { introHaze, introPose } from './intro/intro';
import type { SceneId } from './scenes/types';
import { createSceneShow } from './sceneShow';

export type Backdrop = { readonly sceneId: SceneId; dispose(): void };

/** Seconds for the camera to drift from one end of the establishing shot to the other and back. */
const DRIFT_PERIOD = 24;
const NOBODY = '' as PlayerId;

/** The docks with nobody on them: the scene is drawn but no match exists, so nothing can tick. */
function emptyFrame(): RenderFrame {
  const match = createMatch({
    killTarget: 1,
    players: [
      { id: 'west' as PlayerId, name: '', team: 'west', isBot: false },
      { id: 'east' as PlayerId, name: '', team: 'east', isBot: false },
    ],
  });
  return { state: viewFor(match, 'west'), players: [], hooks: [], grapples: [], pickups: [] };
}

/** Where along the establishing shot the camera is: a slow swing, or the shot's middle held still for less motion. */
function along(elapsed: number, calm: boolean): number {
  return calm ? 0.5 : 0.5 - 0.5 * Math.cos((2 * Math.PI * elapsed) / DRIFT_PERIOD);
}

/** The scene behind the menu and the lobby, seen from its establishing shot with the water and lamps still moving. */
export async function createBackdrop(graphics: Graphics, sceneId: SceneId, events: ContextEvents): Promise<Backdrop> {
  const { gl, surface, host, assets, softDot, hookGeometry } = graphics;
  const show = createSceneShow(gl, host, { arena: DEFAULT_ARENA, assets, softDot, hookGeometry, localPlayerId: NOBODY, fog: null, calm: false }, sceneId);
  const shot = show.stage.theme.intro;
  const camera = new PerspectiveCamera();
  const frame = emptyFrame();
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let elapsed = 0;

  const draw = (dt: number): void => {
    elapsed += dt;
    const shown = { along: along(elapsed, calm), blend: 0, title: 0 };
    applyPose(camera, introPose(shot, poseFor({ x: 0, z: 0 }, surface.viewport()), shown));
    show.setHaze(introHaze(shot, shown));
    show.stage.update({ frame, events: [], impacts: [], dt, elapsed, camera });
    gl.render(show.scene, camera);
  };
  const loop = createFrameLoop(surface.canvas, events, draw);
  const dispose = (): void => {
    loop.stop();
    show.dispose();
  };
  try {
    draw(0);
    await gl.compileAsync(show.scene, camera);
  } catch (error) {
    dispose();
    throw error;
  }
  loop.start();
  return { sceneId, dispose };
}
