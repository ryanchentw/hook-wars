import { TUNING } from '@hookbrawl/sim';
import type { PlayerId, Vec2 } from '@hookbrawl/sim';
import type { Viewport } from '../camera/framing';
import type { Impact } from '../impact/impacts';
import type { RenderFrame } from '../interpolate';
import { simToWorld, type Vec3 } from '../space';
import { SIZES } from '../theme';
import { createDamageNumbers } from './damageNumbers';
import { createLabels, type LabelView } from './labels';
import { keepInView, spreadLabels } from './spreadLabels';
import './overlay.css';

export type WorldOverlay = {
  update(frame: RenderFrame, impacts: readonly Impact[], view: { readonly project: (world: Vec3) => Vec2; readonly viewport: Viewport }, dt: number): void;
  /** Hides names and bars while the camera is away on the establishing shot. */
  setVisible(visible: boolean): void;
  clear(): void;
};

/** Screen room one name-and-bar block needs before the next must be stacked clear of it. */
const LABEL_BOX = { width: 72, height: SIZES.labelBlockPx };

function labelsFor(frame: RenderFrame, project: (world: Vec3) => Vec2, viewport: Viewport): readonly LabelView[] {
  const spread = spreadLabels(
    frame.players.map(({ player, pos }) => (player.status.kind === 'dead' ? null : project(simToWorld(pos, SIZES.labelHeight)))),
    LABEL_BOX,
  );
  const anchors = spread.map((anchor) => (anchor === null ? null : keepInView(anchor, LABEL_BOX, viewport)));
  return frame.players.map(({ player }, i) => ({
    id: player.id,
    name: player.name,
    team: player.team,
    hpFraction: player.hp / TUNING.maxHp,
    anchor: anchors[i] ?? null,
  }));
}

/** The names, hp bars and damage numbers that follow the fighters, drawn as DOM over the canvas. */
export function createWorldOverlay(parent: HTMLElement): WorldOverlay {
  const labels = createLabels(parent);
  const damage = createDamageNumbers(parent);
  return {
    update(frame, impacts, { project, viewport }, dt) {
      const positionOf = (id: PlayerId): Vec2 | null => frame.players.find((p) => p.player.id === id)?.pos ?? null;
      labels.update(labelsFor(frame, project, viewport), dt);
      damage.spawn(impacts);
      damage.update(dt, project, positionOf);
    },
    setVisible(visible) {
      parent.classList.toggle('is-away', !visible);
    },
    clear() {
      labels.clear();
      damage.clear();
    },
  };
}
