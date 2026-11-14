import { AdditiveBlending, Group, Mesh, MeshBasicMaterial, RingGeometry, Sprite, SpriteMaterial, type Texture } from 'three';
import { COLORS, FLOURISH, SIZES } from '../theme';
import { flourishGlow } from './flourish';

export type FlourishView = {
  readonly group: Group;
  /** `bought` restarts the glint; otherwise it plays out and hides itself. */
  step(bought: boolean, dt: number): void;
  dispose(): void;
};

/**
 * A gold glow over the fighter and a gold ring running out from their feet, hung on the part of the figure that
 * does not turn. Both are drawn over the body: tested against depth, the figure would hide most of the glow.
 */
export function createFlourishView(softDot: Texture): FlourishView {
  const glowMaterial = new SpriteMaterial({ map: softDot, color: COLORS.coin, blending: AdditiveBlending, depthWrite: false, depthTest: false });
  // Past 1 the gold burns through the tone mapping; the soft dot's faint edge would otherwise vanish on the night dock.
  glowMaterial.color.multiplyScalar(FLOURISH.intensity);
  const glow = new Sprite(glowMaterial);
  glow.position.y = FLOURISH.height;
  glow.renderOrder = 1;
  const ringGeometry = new RingGeometry(1 - FLOURISH.ringWidth, 1, 48);
  const ringMaterial = new MeshBasicMaterial({ color: COLORS.coin, transparent: true, blending: AdditiveBlending, depthWrite: false });
  const ring = new Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = SIZES.ringLift * 2;
  const group = new Group();
  group.add(glow, ring);
  group.visible = false;
  let age = Number.POSITIVE_INFINITY;

  return {
    group,
    step(bought, dt) {
      age = bought ? 0 : age + dt;
      const amount = flourishGlow(age);
      group.visible = amount > 0;
      if (!group.visible) return;
      const t = Math.min(1, age / FLOURISH.life);
      glow.scale.setScalar(FLOURISH.from + (FLOURISH.to - FLOURISH.from) * t);
      glowMaterial.opacity = FLOURISH.opacity * amount;
      ring.scale.setScalar(FLOURISH.ringFrom + (FLOURISH.ringTo - FLOURISH.ringFrom) * t);
      ringMaterial.opacity = amount;
    },
    dispose() {
      glowMaterial.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
    },
  };
}
