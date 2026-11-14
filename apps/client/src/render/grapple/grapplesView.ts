import type { PlayerId, TeamId } from '@hookbrawl/sim';
import {
  AdditiveBlending,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
  type BufferGeometry,
  type Texture,
} from 'three';
import type { GrappleFrame, RenderFrame } from '../interpolate';
import { toWorldLength } from '../space';
import { COLORS, GRAPPLE_LOOK, SIZES, TEAM_COLORS } from '../theme';
import { createGrappleGeometry, GRAPPLE_EYE_OFFSET } from './grappleGeometry';

export type GrapplesView = {
  readonly group: Group;
  update(frame: RenderFrame, handOf: (playerId: PlayerId) => Vector3 | null): void;
  dispose(): void;
};

/** One grapple per player at most, and a match has at most six players. */
const SLOTS = 6;
/** Sim units from the anchor over which a flying head drops from hand height to the dock it bites. */
const DESCENT = 300;
const TEAMS = Object.keys(TEAM_COLORS) as TeamId[];
const UP = new Vector3(0, 1, 0);

type Slot = { readonly rope: Mesh; readonly head: Mesh; readonly halo: Sprite };

/** Height of the claw: in the air at hand height while it flies, low against the stone once it has bitten. */
function headHeight(gf: GrappleFrame): number {
  if (gf.grapple.phase.kind === 'pulling') return GRAPPLE_LOOK.headHeight;
  const left = Math.hypot(gf.grapple.anchor.x - gf.head.x, gf.grapple.anchor.y - gf.head.y);
  const t = Math.min(1, left / DESCENT);
  return GRAPPLE_LOOK.headHeight + (SIZES.chainHeight - GRAPPLE_LOOK.headHeight) * t;
}

function perTeam<T>(make: (team: TeamId) => T): Record<TeamId, T> {
  return Object.fromEntries(TEAMS.map((team) => [team, make(team)])) as Record<TeamId, T>;
}

type Looks = {
  readonly rope: { readonly geometry: CylinderGeometry; readonly material: MeshStandardMaterial };
  readonly claw: { readonly geometry: BufferGeometry; readonly materials: Record<TeamId, MeshStandardMaterial> };
  readonly halos: Record<TeamId, SpriteMaterial>;
};

function createLooks(softDot: Texture): Looks {
  const glow = GRAPPLE_LOOK.ropeGlow;
  return {
    rope: {
      geometry: new CylinderGeometry(GRAPPLE_LOOK.ropeRadius, GRAPPLE_LOOK.ropeRadius, 1, 6),
      material: new MeshStandardMaterial({ color: COLORS.rope, roughness: 0.9, emissive: COLORS.rope, emissiveIntensity: glow }),
    },
    claw: {
      geometry: createGrappleGeometry(),
      materials: perTeam(
        (team) => new MeshStandardMaterial({ color: COLORS.iron, roughness: 0.4, metalness: 0.6, emissive: TEAM_COLORS[team].glow, emissiveIntensity: 0.12 }),
      ),
    },
    halos: perTeam(
      (team) =>
        new SpriteMaterial({ map: softDot, color: TEAM_COLORS[team].glow, blending: AdditiveBlending, depthWrite: false, opacity: GRAPPLE_LOOK.haloOpacity }),
    ),
  };
}

function disposeLooks({ rope, claw, halos }: Looks): void {
  [rope.geometry, rope.material, claw.geometry, ...Object.values(claw.materials), ...Object.values(halos)].forEach((thing) => thing.dispose());
}

function createSlot(looks: Looks): Slot {
  const rope = new Mesh(looks.rope.geometry, looks.rope.material);
  rope.castShadow = true;
  const head = new Mesh(looks.claw.geometry, looks.claw.materials.west);
  head.scale.setScalar(GRAPPLE_LOOK.headRadius);
  head.castShadow = true;
  const halo = new Sprite(looks.halos.west);
  // A child of the claw, so its size is given in claw radii.
  halo.scale.setScalar(GRAPPLE_LOOK.haloSize / GRAPPLE_LOOK.headRadius);
  head.add(halo);
  rope.visible = false;
  head.visible = false;
  return { rope, head, halo };
}

/** Draws each grapple as a pale rope from the owner's off hand to a small claw; a fixed pool, so a frame allocates nothing. */
export function createGrapplesView(softDot: Texture): GrapplesView {
  const group = new Group();
  const looks = createLooks(softDot);
  const slots: readonly Slot[] = Array.from({ length: SLOTS }, () => createSlot(looks));
  slots.forEach((slot) => group.add(slot.rope, slot.head));
  const from = new Vector3();
  const to = new Vector3();
  const along = new Vector3();

  const place = (slot: Slot, gf: GrappleFrame, hand: Vector3 | null): void => {
    const team = gf.team ?? 'west';
    slot.head.material = looks.claw.materials[team];
    slot.halo.material = looks.halos[team];
    const at = slot.head.position.set(toWorldLength(gf.head.x), headHeight(gf), toWorldLength(gf.head.y));
    if (hand === null) along.set(gf.grapple.anchor.x - gf.head.x, 0, gf.grapple.anchor.y - gf.head.y);
    else along.set(at.x - hand.x, 0, at.z - hand.z);
    if (along.lengthSq() < 1e-8) along.set(1, 0, 0);
    along.normalize();
    slot.head.rotation.set(0, -Math.atan2(along.z, along.x), 0);
    const ring = GRAPPLE_LOOK.headRadius * GRAPPLE_EYE_OFFSET;
    to.set(at.x - along.x * ring, at.y, at.z - along.z * ring);
    from.copy(hand ?? to);
    const length = from.distanceTo(to);
    slot.rope.visible = length > 1e-3;
    slot.rope.position.copy(from).add(to).multiplyScalar(0.5);
    slot.rope.quaternion.setFromUnitVectors(UP, along.copy(to).sub(from).normalize());
    slot.rope.scale.set(1, length, 1);
  };

  return {
    group,
    update(frame, handOf) {
      for (let i = 0; i < SLOTS; i += 1) {
        const slot = slots[i]!;
        const gf = frame.grapples[i];
        slot.rope.visible = gf !== undefined;
        slot.head.visible = gf !== undefined;
        if (gf !== undefined) place(slot, gf, handOf(gf.grapple.ownerId));
      }
    },
    dispose: () => disposeLooks(looks),
  };
}
