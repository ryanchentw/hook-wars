import { Application, Container } from 'pixi.js';
import type { Session } from '../game/session';
import { createArenaView } from './arenaView';
import { fitCamera, type Camera } from './camera';
import { createEffectsView } from './effectsView';
import { createHooksView } from './hooksView';
import { interpolateFrame } from './interpolate';
import { createPlayersView } from './playersView';
import { COLORS, VIEW_INSETS } from './theme';

export type Renderer = {
  readonly canvas: HTMLCanvasElement;
  camera(): Camera;
  destroy(): void;
};

const MS_PER_SECOND = 1000;

/** Owns the Pixi application and drives the session from the animation frame. */
export async function createRenderer(host: HTMLElement, session: Session): Promise<Renderer> {
  const app = new Application();
  await app.init({
    resizeTo: host,
    background: COLORS.backdrop,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  host.appendChild(app.canvas);

  const arena = session.getState().arena;
  const world = new Container();
  const arenaView = createArenaView(arena);
  const playersView = createPlayersView(session.localPlayerId);
  const hooksView = createHooksView();
  const effectsView = createEffectsView();
  world.addChild(arenaView.container, playersView.container, hooksView.container, effectsView.container);
  app.stage.addChild(world);

  let camera = fitCamera(arena, app.screen, VIEW_INSETS);
  let elapsed = 0;

  const unsubscribe = session.subscribe((state, change) => {
    if (change === 'reset') effectsView.clear();
    else effectsView.spawn(state);
  });

  const onFrame = (ticker: { readonly deltaMS: number }): void => {
    const dt = ticker.deltaMS / MS_PER_SECOND;
    elapsed += dt;
    session.advance(dt);
    camera = fitCamera(arena, app.screen, VIEW_INSETS);
    world.scale.set(camera.scale);
    world.position.set(camera.offsetX, camera.offsetY);
    const frame = interpolateFrame(session.frame());
    arenaView.update(elapsed);
    playersView.update(frame, elapsed);
    hooksView.update(frame);
    effectsView.update(dt);
  };
  app.ticker.add(onFrame);

  return {
    canvas: app.canvas,
    camera: () => camera,
    destroy() {
      unsubscribe();
      app.ticker.remove(onFrame);
      app.destroy(true, { children: true });
    },
  };
}
