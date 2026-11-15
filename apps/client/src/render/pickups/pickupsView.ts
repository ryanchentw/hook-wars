import { PICKUP_KINDS, PICKUPS } from '@hookwars/sim';
import type { PickupId, PickupKind } from '@hookwars/sim';
import {
  AdditiveBlending,
  BufferGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusKnotGeometry,
  type Texture,
} from 'three';
import type { PickupFrame, RenderFrame } from '../interpolate';
import { simToWorld, toWorldLength } from '../space';
import { SIZES } from '../theme';
import { PICKUP_COLORS, PICKUP_SIZES as S } from './pickupLook';

export type PickupsView = {
  readonly group: Group;
  update(frame: RenderFrame, elapsed: number, dt: number): void;
  dispose(): void;
};

export type PickupsOptions = {
  readonly softDot: Texture;
  /** The scene's water height, which a drifting pickup floats just above. */
  readonly waterLevel: number;
  /** Seconds a pickup takes to fade into or out of sight; 0 shows and hides it at once. */
  readonly fadeSeconds: number;
  /** No bobbing, spinning or pulsing for people who ask for less motion. */
  readonly calm: boolean;
};

const BODY_RADIUS = toWorldLength(PICKUPS.radius);

/** A purse, a twist of wind, a shard of storm: each kind's shape, at unit size. */
function bodyParts(kind: PickupKind): readonly BufferGeometry[] {
  switch (kind) {
    case 'gold':
      return [new SphereGeometry(0.8, 16, 12).scale(1, 0.85, 1), new ConeGeometry(0.34, 0.5, 12).translate(0, 0.78, 0)];
    case 'gale':
      return [new TorusKnotGeometry(0.55, 0.17, 64, 8, 2, 3)];
    case 'storm':
      return [new OctahedronGeometry(0.85).scale(0.8, 1.25, 0.8)];
  }
}

type Shown = {
  readonly root: Group;
  readonly body: Group;
  readonly halo: Sprite;
  readonly ring: Mesh;
  readonly materials: readonly (MeshStandardMaterial | MeshBasicMaterial | SpriteMaterial)[];
  readonly phase: number;
  presence: number;
  last: PickupFrame;
};

export function createPickupsView({ softDot, waterLevel, fadeSeconds, calm }: PickupsOptions): PickupsView {
  const group = new Group();
  const geometries = new Map(PICKUP_KINDS.map((kind) => [kind, bodyParts(kind)]));
  const ringGeometry = new RingGeometry(S.ringInner, S.ringOuter, 40).rotateX(-Math.PI / 2);
  let shown = new Map<PickupId, Shown>();

  const create = (pf: PickupFrame): Shown => {
    const color = PICKUP_COLORS[pf.pickup.kind];
    const face = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: S.emissive, roughness: 0.35, metalness: 0.2, transparent: true });
    const glow = new SpriteMaterial({ map: softDot, color, blending: AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    const water = new MeshBasicMaterial({ color, blending: AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    const body = new Group();
    body.add(...(geometries.get(pf.pickup.kind) ?? []).map((g) => new Mesh(g, face)));
    const halo = new Sprite(glow);
    const ring = new Mesh(ringGeometry, water);
    const root = new Group();
    root.add(body, halo, ring);
    root.scale.setScalar(BODY_RADIUS);
    group.add(root);
    const phase = Number.parseInt(pf.pickup.id.replace(/\D/g, ''), 10) || 0;
    return { root, body, halo, ring, materials: [face, glow, water], phase, presence: fadeSeconds > 0 ? 0 : 1, last: pf };
  };

  const place = (s: Shown, pf: PickupFrame, elapsed: number): void => {
    const carried = pf.pickup.state.kind === 'carried';
    const bob = calm || carried ? 0 : Math.sin(elapsed * S.bobRate + s.phase) * S.bobHeight;
    const height = carried ? SIZES.chainHeight : waterLevel + S.float + bob;
    const at = simToWorld(pf.pos, height);
    s.root.position.set(at.x, at.y, at.z);
    s.body.rotation.y = calm ? 0 : elapsed * S.spin + s.phase;
    // The ring lies on the water under a floating pickup; it would hang in the air under a carried one.
    s.ring.visible = !carried;
    s.ring.position.y = (waterLevel + 0.02 - height) / BODY_RADIUS;
    const pulse = calm ? 1 : 0.75 + 0.25 * Math.sin(elapsed * S.ringPulseRate + s.phase);
    s.ring.scale.setScalar(pulse);
    s.halo.scale.setScalar(S.halo);
    const [face, glow, water] = s.materials;
    if (face) face.opacity = s.presence;
    if (glow) glow.opacity = S.haloOpacity * s.presence;
    if (water) water.opacity = S.ringOpacity * s.presence * (calm ? 1 : pulse);
  };

  const step = (s: Shown, present: boolean, dt: number): void => {
    const rate = fadeSeconds > 0 ? dt / fadeSeconds : 1;
    s.presence = Math.max(0, Math.min(1, s.presence + (present ? rate : -rate)));
  };

  return {
    group,
    update(frame, elapsed, dt) {
      const next = new Map<PickupId, Shown>();
      frame.pickups.forEach((pf) => {
        const s = shown.get(pf.pickup.id) ?? create(pf);
        s.last = pf;
        step(s, true, dt);
        place(s, pf, elapsed);
        next.set(pf.pickup.id, s);
      });
      shown.forEach((s, id) => {
        if (next.has(id)) return;
        step(s, false, dt);
        if (s.presence > 0) {
          place(s, s.last, elapsed);
          next.set(id, s);
          return;
        }
        group.remove(s.root);
        s.materials.forEach((m) => m.dispose());
      });
      shown = next;
    },
    dispose() {
      shown.forEach((s) => s.materials.forEach((m) => m.dispose()));
      geometries.forEach((parts) => parts.forEach((g) => g.dispose()));
      ringGeometry.dispose();
    },
  };
}
