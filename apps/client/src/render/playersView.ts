import { Container, Graphics } from 'pixi.js';
import type { PlayerId } from '@hookbrawl/sim';
import type { RenderFrame } from './interpolate';
import { createPlayerView, type PlayerView } from './playerView';
import { COLORS, SIZES } from './theme';

export type PlayersView = { readonly container: Container; update(frame: RenderFrame, elapsed: number): void };

function drawMoveMarker(g: Graphics, frame: RenderFrame, localId: PlayerId): void {
  g.clear();
  const local = frame.state.players.find((p) => p.id === localId);
  const target = local?.moveTarget;
  if (local === undefined || target === null || target === undefined || local.status.kind === 'dead') return;
  const s = SIZES.moveMarkerSize;
  g.moveTo(target.x - s, target.y - s).lineTo(target.x + s, target.y + s);
  g.moveTo(target.x + s, target.y - s).lineTo(target.x - s, target.y + s);
  g.stroke({ width: 4, color: COLORS.moveMarker, alpha: 0.7, cap: 'round' });
}

/** Keeps one view per player id, creating and dropping views as players come and go. */
export function createPlayersView(localId: PlayerId): PlayersView {
  const container = new Container();
  const markers = new Graphics();
  const layer = new Container();
  container.addChild(markers, layer);
  let views = new Map<PlayerId, PlayerView>();

  return {
    container,
    update(frame, elapsed) {
      drawMoveMarker(markers, frame, localId);
      const next = new Map<PlayerId, PlayerView>();
      for (const pf of frame.players) {
        const view = views.get(pf.player.id) ?? createPlayerView(pf.player, pf.player.id === localId);
        if (!views.has(pf.player.id)) layer.addChild(view.container);
        view.update(pf, elapsed);
        next.set(pf.player.id, view);
      }
      views.forEach((view, id) => {
        if (!next.has(id)) view.destroy();
      });
      views = next;
    },
  };
}
