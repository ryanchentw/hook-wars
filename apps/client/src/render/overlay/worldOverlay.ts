import { TUNING } from '@hookbrawl/sim';
import type { PlayerId, Vec2 } from '@hookbrawl/sim';
import type { Viewport } from '../camera/framing';
import type { Impact } from '../impact/impacts';
import type { RenderFrame } from '../interpolate';
import { simToWorld, type Vec3 } from '../space';
import { fighterName } from '../../game/fighterName';
import { SIZES } from '../theme';
import { createDamageNumbers } from './damageNumbers';
import { createLabels, type Labels, type LabelView } from './labels';
import { keepInView, spreadLabels } from './spreadLabels';
import './overlay.css';

export type WorldOverlay = {
  update(frame: RenderFrame, impacts: readonly Impact[], view: { readonly project: (world: Vec3) => Vec2; readonly viewport: Viewport }, dt: number): void;
  /** Hides names and bars while the camera is away on the establishing shot. */
  setVisible(visible: boolean): void;
  clear(): void;
};

/** Screen room the narrowest name-and-bar block needs before the next must be stacked clear of it. */
const LABEL_BOX = { width: 72, height: SIZES.labelBlockPx };
/** Clear air left between two labels side by side. */
const LABEL_GAP_PX = 8;

function labelsFor(frame: RenderFrame, labels: Labels, project: (world: Vec3) => Vec2, viewport: Viewport): readonly LabelView[] {
  const widths = frame.players.map(({ player }) => Math.max(LABEL_BOX.width, (labels.widthOf(player.id) ?? 0) + LABEL_GAP_PX));
  const spread = spreadLabels(
    frame.players.map(({ player, pos }) => (player.status.kind === 'dead' ? null : project(simToWorld(pos, SIZES.labelHeight)))),
    widths,
    LABEL_BOX.height,
  );
  const anchors = spread.map((anchor, i) => (anchor === null ? null : keepInView(anchor, { width: widths[i] ?? LABEL_BOX.width, height: LABEL_BOX.height }, viewport)));
  return frame.players.map(({ player, presence }, i) => ({
    id: player.id,
    name: fighterName(player),
    team: player.team,
    hpFraction: player.hp / TUNING.maxHp,
    presence,
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
      labels.update(labelsFor(frame, labels, project, viewport), dt);
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
