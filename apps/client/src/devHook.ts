import type { GameState, PlayerId, Vec2 } from '@hookbrawl/sim';
import type { Session } from './game/session';
import type { Renderer } from './render/renderer';
import { worldToScreen } from './render/camera';

export type DevHook = {
  getState(): GameState;
  getLocalPlayerId(): PlayerId;
  /** World point to viewport (client) CSS pixels. */
  worldToScreen(p: Vec2): Vec2;
};

declare global {
  interface Window {
    __hookbrawl?: DevHook;
  }
}

export function installDevHook(session: Session, renderer: Renderer): void {
  window.__hookbrawl = {
    getState: () => session.getState(),
    getLocalPlayerId: () => session.localPlayerId,
    worldToScreen(p) {
      const rect = renderer.canvas.getBoundingClientRect();
      const local = worldToScreen(renderer.camera(), p);
      return { x: local.x + rect.left, y: local.y + rect.top };
    },
  };
}
