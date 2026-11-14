import { Container, Graphics, Text } from 'pixi.js';
import { TUNING } from '@hookbrawl/sim';
import type { Player, TeamId } from '@hookbrawl/sim';
import type { PlayerFrame } from './interpolate';
import { COLORS, CRITICAL_HP_FRACTION, FONT_FAMILY, LOW_HP_FRACTION, SIZES, TEAM_COLORS } from './theme';

export type PlayerView = {
  readonly container: Container;
  update(frame: PlayerFrame, elapsed: number): void;
  destroy(): void;
};

const R = TUNING.playerRadius;

function drawBody(g: Graphics, team: TeamId): void {
  const c = TEAM_COLORS[team];
  g.circle(R * 0.55, -R * 0.72, SIZES.handRadius).fill(c.dark).stroke({ width: 3, color: COLORS.outline });
  g.circle(R * 0.55, R * 0.72, SIZES.handRadius).fill(c.dark).stroke({ width: 3, color: COLORS.outline });
  g.circle(0, 0, R).fill(c.body).stroke({ width: SIZES.bodyOutline, color: COLORS.outline });
  // A knit cap seen from above, pushed to the back of the head so facing reads at a glance.
  g.circle(-R * 0.18, 0, R * 0.55).fill(c.dark);
  g.circle(-R * 0.18, 0, R * 0.2).fill(c.light);
  g.poly([R - 4, -9, R + SIZES.noseLength, 0, R - 4, 9]).fill(c.light).stroke({ width: 3, color: COLORS.outline });
}

function drawGhost(g: Graphics, team: TeamId): void {
  g.circle(0, 0, R).stroke({ width: 4, color: TEAM_COLORS[team].light, alpha: 0.9 });
  g.circle(0, 0, R * 0.55).stroke({ width: 2, color: TEAM_COLORS[team].light, alpha: 0.6 });
}

function hpColor(fraction: number): number {
  if (fraction <= CRITICAL_HP_FRACTION) return COLORS.hpCritical;
  if (fraction <= LOW_HP_FRACTION) return COLORS.hpLow;
  return COLORS.hpFill;
}

function drawHpBar(g: Graphics, hp: number): void {
  const fraction = Math.max(0, Math.min(1, hp / TUNING.maxHp));
  const w = SIZES.hpBarWidth;
  const h = SIZES.hpBarHeight;
  g.clear();
  g.roundRect(-w / 2 - 2, -SIZES.hpBarOffset - 2, w + 4, h + 4, 4).fill(COLORS.hpBack);
  if (fraction > 0) g.roundRect(-w / 2, -SIZES.hpBarOffset, w * fraction, h, 3).fill(hpColor(fraction));
}

function drawLocalMarker(g: Graphics): void {
  g.circle(0, 0, SIZES.localRingRadius).stroke({ width: SIZES.localRingWidth, color: COLORS.moveMarker, alpha: 0.5 });
}

export function createPlayerView(player: Player, isLocal: boolean): PlayerView {
  const container = new Container();
  const shadow = new Graphics().ellipse(6, 10, R * 1.05, R * 0.9).fill({ color: COLORS.shadow, alpha: 0.35 });
  const marker = new Graphics();
  const body = new Graphics();
  const ghost = new Graphics();
  const hpBar = new Graphics();
  const name = new Text({
    text: player.name,
    style: {
      fontFamily: FONT_FAMILY,
      fontSize: SIZES.nameFontSize,
      fontWeight: '700',
      fill: COLORS.nameText,
      stroke: { color: COLORS.outline, width: 5 },
    },
  });
  name.anchor.set(0.5, 1);
  name.y = -SIZES.nameOffset;
  drawBody(body, player.team);
  drawGhost(ghost, player.team);
  if (isLocal) drawLocalMarker(marker);
  container.addChild(shadow, marker, body, ghost, hpBar, name);
  let lastHp = Number.NaN;

  return {
    container,
    update({ player: p, pos }, elapsed) {
      const dead = p.status.kind === 'dead';
      const dragged = p.status.kind === 'dragged';
      const phase = elapsed * SIZES.dragShakeHz * Math.PI * 2;
      const shakeX = dragged ? Math.sin(phase) * SIZES.dragShakeAmplitude : 0;
      const shakeY = dragged ? Math.cos(phase * 1.3) * SIZES.dragShakeAmplitude : 0;
      container.position.set(pos.x + shakeX, pos.y + shakeY);
      body.rotation = p.facing + (dragged ? Math.sin(phase * 0.5) * SIZES.dragTiltRadians : 0);
      body.visible = !dead;
      shadow.visible = !dead;
      marker.visible = !dead;
      hpBar.visible = !dead;
      ghost.visible = dead;
      container.alpha = dead ? SIZES.ghostAlpha : 1;
      if (p.hp !== lastHp) {
        drawHpBar(hpBar, p.hp);
        lastHp = p.hp;
      }
    },
    destroy() {
      container.destroy({ children: true });
    },
  };
}
