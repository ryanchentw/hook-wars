import { spawnPickup, TICK_DT } from '@hookwars/sim';
import type { GameState, PickupSpawn, PlayerId, PlayerInput, TeamView, Vec2 } from '@hookwars/sim';
import type { Session } from './game/session';
import type { Renderer, RenderStats } from './render/renderer';
import type { SceneId } from './render/scenes/types';

export type DevHook = {
  /** The whole match, as the authority knows it. */
  getState(): GameState;
  /** What the local team is entitled to see: what the picture and the HUD are given. */
  getView(): TeamView;
  /** The fighters the renderer drew in its last frame. */
  drawnPlayers(): readonly PlayerId[];
  getLocalPlayerId(): PlayerId;
  /** World point to viewport (client) CSS pixels. */
  worldToScreen(p: Vec2): Vec2;
  /** Viewport (client) CSS pixels to the world point on the ground under them. */
  screenToWorld(p: Vec2): Vec2;
  renderStats(): RenderStats;
  /** Holds the sim still, so a test can photograph a hook in flight where the state says it is. */
  setPaused(paused: boolean): void;
  sceneId(): SceneId;
  introActive(): boolean;
  /** Starts the next match, as "Rematch" does. The hook comes back once that match is drawing. */
  restart(): Promise<void>;
  /** Holds the match and the picture on the frame now showing, or lets them go. */
  freeze(frozen: boolean): void;
  /** Runs the match ahead by up to `seconds` of sim time at once, stopping when it ends; a test reaches the end panel without waiting a match out. */
  fastForward(seconds: number): void;
  /** Puts a pickup of the asked-for kind on the water now, at the end and lane asked for, through the sim's own spawn. */
  spawnPickup(spawn: PickupSpawn): void;
  /** Sends an input for any fighter, as a bot would, so a test can make a dummy act. */
  queueInput(input: PlayerInput): void;
};

declare global {
  interface Window {
    __hookwars?: DevHook;
  }
}

/**
 * Installed only once a match is drawing and removed when it ends, so its presence also tells a test that a match is
 * up and its assets have loaded.
 */
export function installDevHook(session: Session, renderer: Renderer, restart: () => Promise<void>): { uninstall(): void } {
  const origin = (): Vec2 => {
    const rect = renderer.canvas.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  };
  const hook: DevHook = {
    getState: () => session.getState(),
    getView: () => session.getView(),
    drawnPlayers: () => renderer.drawnPlayers(),
    getLocalPlayerId: () => session.localPlayerId,
    worldToScreen(p) {
      const local = renderer.worldToScreen(p);
      const o = origin();
      return { x: local.x + o.x, y: local.y + o.y };
    },
    screenToWorld(p) {
      const o = origin();
      return renderer.screenToWorld({ x: p.x - o.x, y: p.y - o.y });
    },
    renderStats: () => renderer.stats(),
    setPaused: (paused) => session.setPaused(paused),
    sceneId: () => renderer.sceneId(),
    introActive: () => renderer.introActive(),
    restart,
    freeze: (frozen) => renderer.setFrozen(frozen),
    fastForward(seconds) {
      for (let t = 0; t < seconds && session.getState().phase.kind === 'playing'; t += TICK_DT) session.advance(TICK_DT);
    },
    spawnPickup(spawn) {
      session.editState((state) => spawnPickup(state, spawn));
    },
    queueInput(input) {
      session.queueInput(input);
    },
  };
  window.__hookwars = hook;
  return {
    uninstall() {
      if (window.__hookwars === hook) delete window.__hookwars;
    },
  };
}
