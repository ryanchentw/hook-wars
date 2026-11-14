import type { GameState, PlayerId, Vec2 } from '@hookbrawl/sim';
import type { Session } from './game/session';
import type { Renderer, RenderStats } from './render/renderer';

export type DevHook = {
  getState(): GameState;
  getLocalPlayerId(): PlayerId;
  /** World point to viewport (client) CSS pixels. */
  worldToScreen(p: Vec2): Vec2;
  /** Viewport (client) CSS pixels to the world point on the ground under them. */
  screenToWorld(p: Vec2): Vec2;
  renderStats(): RenderStats;
};

declare global {
  interface Window {
    __hookbrawl?: DevHook;
  }
}

/** Installed only once the scene is drawing, so its presence also tells a test that assets have loaded. */
export function installDevHook(session: Session, renderer: Renderer): void {
  const origin = (): Vec2 => {
    const rect = renderer.canvas.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  };
  window.__hookbrawl = {
    getState: () => session.getState(),
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
  };
}
