import { TUNING } from '@hookbrawl/sim';
import type { HookId, PlayerId, TeamId } from '@hookbrawl/sim';
import {
  AdditiveBlending,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Texture,
} from 'three';
import type { HookFrame, RenderFrame } from '../interpolate';
import { simToWorld, toWorldLength, type Vec3 } from '../space';
import { CHAIN, COLORS, SIZES, TEAM_COLORS } from '../theme';
import { layOutChain, type LinkPlacement } from './chainLinks';
import { HOOK_EYE_OFFSET } from './hookGeometry';

export type HooksView = {
  readonly group: Group;
  update(frame: RenderFrame, handOf: (playerId: PlayerId) => Vector3 | null): void;
  dispose(): void;
};

/** Chains drawn at once at full length; later hooks in a crowded frame get shorter chains rather than none. */
const FULL_CHAINS = 6;
const HOOK_RADIUS = toWorldLength(TUNING.hookRadius);
const LINK = {
  length: toWorldLength(CHAIN.linkLength),
  width: toWorldLength(CHAIN.linkWidth),
  thickness: toWorldLength(CHAIN.linkThickness),
  spacing: toWorldLength(CHAIN.linkSpacing),
};
// Leans the upright links over so the camera, looking down, never sees them exactly edge-on.
const LINK_ROLL = 0.5;
const UP = new Vector3(0, 1, 0);

function headDirection(hf: HookFrame): Vec3 {
  if (hf.hook.phase.kind === 'extending') return { x: hf.hook.dir.x, y: 0, z: hf.hook.dir.y };
  const before = hf.chain[hf.chain.length - 2] ?? hf.head;
  const dx = hf.head.x - before.x;
  const dz = hf.head.y - before.y;
  const len = Math.hypot(dx, dz);
  return len === 0 ? { x: 1, y: 0, z: 0 } : { x: dx / len, y: 0, z: dz / len };
}

/** The chain's path in world space: from the hand, through each bounce at flight height, to the ring on the hook. */
function chainPath(hf: HookFrame, hand: Vector3 | null, direction: Vec3): readonly Vec3[] {
  const points = hf.chain.map((p) => simToWorld(p, SIZES.chainHeight));
  const head = simToWorld(hf.head, SIZES.chainHeight);
  const eye = HOOK_RADIUS * HOOK_EYE_OFFSET;
  const ring = { x: head.x - direction.x * eye, y: head.y, z: head.z - direction.z * eye };
  const start = hand === null ? points[0] : { x: hand.x, y: hand.y, z: hand.z };
  return start === undefined ? [] : [start, ...points.slice(1, -1), ring];
}

function linkMatrix(link: LinkPlacement, stretch: number, out: Matrix4): Matrix4 {
  const along = new Vector3(link.direction.x, link.direction.y, link.direction.z);
  const side = new Vector3().crossVectors(along, UP);
  if (side.lengthSq() < 1e-8) side.set(0, 0, 1);
  side.normalize().applyAxisAngle(along, LINK_ROLL + (link.quarterTurn ? Math.PI / 2 : 0));
  const third = new Vector3().crossVectors(side, along);
  out.makeBasis(along.multiplyScalar(stretch), third, side);
  return out.setPosition(link.position.x, link.position.y, link.position.z);
}

/** Each hook carries a faint halo in its thrower's colour, so it is clear at a glance whose iron is in the air. */
const HALO_SIZE = HOOK_RADIUS * 4.2;

/** `hookGeometry` is shared with the hooks the fighters carry; whoever made it disposes of it. */
export function createHooksView(hookGeometry: BufferGeometry, softDot: Texture): HooksView {
  const group = new Group();
  const linkGeometry = new TorusGeometry((LINK.width - LINK.thickness) / 2, LINK.thickness / 2, 6, 12);
  linkGeometry.scale(LINK.length / LINK.width, 1, 1);
  const linkMaterial = new MeshStandardMaterial({
    color: COLORS.iron,
    roughness: 0.38,
    metalness: 0.55,
    emissive: COLORS.iron,
    emissiveIntensity: 0.16,
  });
  const capacity = CHAIN.maxLinks * FULL_CHAINS;
  const links = new InstancedMesh(linkGeometry, linkMaterial, capacity);
  links.castShadow = true;
  links.frustumCulled = false;
  links.count = 0;
  group.add(links);

  const hookMaterials = Object.fromEntries(
    (Object.keys(TEAM_COLORS) as TeamId[]).map((team) => [
      team,
      new MeshStandardMaterial({
        color: COLORS.iron,
        roughness: 0.34,
        metalness: 0.6,
        emissive: TEAM_COLORS[team].glow,
        emissiveIntensity: 0.05,
      }),
    ]),
  ) as Record<TeamId, MeshStandardMaterial>;
  const haloMaterials = Object.fromEntries(
    (Object.keys(TEAM_COLORS) as TeamId[]).map((team) => [
      team,
      new SpriteMaterial({ map: softDot, color: TEAM_COLORS[team].glow, blending: AdditiveBlending, depthWrite: false, opacity: 0.55 }),
    ]),
  ) as Record<TeamId, SpriteMaterial>;
  let heads = new Map<HookId, Mesh>();
  const matrix = new Matrix4();

  const createHead = (team: TeamId): Mesh => {
    const head = new Mesh(hookGeometry, hookMaterials[team]);
    head.castShadow = true;
    head.scale.setScalar(HOOK_RADIUS);
    const halo = new Sprite(haloMaterials[team]);
    // The sprite is a child of a mesh scaled down to hook size, so undo that scale here.
    halo.scale.setScalar(HALO_SIZE / HOOK_RADIUS);
    head.add(halo);
    return head;
  };
  // Never drawn. Their presence lets the renderer compile the hook shaders up front, not on the first throw.
  const warmUp = (Object.keys(TEAM_COLORS) as TeamId[]).map(createHead);
  warmUp.forEach((head) => {
    head.visible = false;
    group.add(head);
  });

  return {
    group,
    update(frame, handOf) {
      const next = new Map<HookId, Mesh>();
      let used = 0;
      for (const hf of frame.hooks) {
        const direction = headDirection(hf);
        const head = heads.get(hf.hook.id) ?? createHead(hf.team ?? 'west');
        if (!heads.has(hf.hook.id)) group.add(head);
        const at = simToWorld(hf.head, SIZES.chainHeight);
        head.position.set(at.x, at.y, at.z);
        head.rotation.set(0, -Math.atan2(direction.z, direction.x), 0);
        next.set(hf.hook.id, head);

        const layout = layOutChain(chainPath(hf, handOf(hf.hook.ownerId), direction), LINK.spacing, Math.min(CHAIN.maxLinks, capacity - used));
        for (const link of layout.links) {
          links.setMatrixAt(used, linkMatrix(link, layout.stretch, matrix));
          used += 1;
        }
      }
      heads.forEach((head, id) => {
        if (!next.has(id)) group.remove(head);
      });
      heads = next;
      links.count = used;
      links.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      linkGeometry.dispose();
      linkMaterial.dispose();
      Object.values(hookMaterials).forEach((m) => m.dispose());
      Object.values(haloMaterials).forEach((m) => m.dispose());
      links.dispose();
    },
  };
}
