import type { HookId, PlayerId, TeamId } from '@hookwars/sim';
import { Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Sprite, TorusGeometry, Vector3, type BufferGeometry, type Texture } from 'three';
import type { HookFrame, RenderFrame } from '../interpolate';
import { simToWorld, toWorldLength, type Vec3 } from '../space';
import type { Tints } from '../scenes/types';
import { CHAIN, SIZES } from '../theme';
import { hookLook, type HookLook } from './hookLook';
import { createHookMaterials } from './hookMaterials';
import { layOutChain, type LinkPlacement } from './chainLinks';
import { HOOK_EYE_OFFSET } from './hookGeometry';

export type HooksView = {
  readonly group: Group;
  update(frame: RenderFrame, handOf: (playerId: PlayerId) => Vector3 | null, dt: number): void;
  dispose(): void;
};

/** Chains drawn at once at full length; later hooks in a crowded frame get shorter chains rather than none. */
const FULL_CHAINS = 6;
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
  const eye = toWorldLength(hf.hook.stats.radius) * HOOK_EYE_OFFSET;
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

/** `shown` grows from 0 to 1 for a head that came out of the dark, and is 1 for every other. */
type Head = { readonly mesh: Mesh; readonly halo: Sprite; shown: number };

/** Links over which a chain that comes out of the dark thins to nothing, so it fades into the veil rather than stopping dead. */
const TAPER_LINKS = 6;

function taper(index: number, cut: boolean): number {
  return cut && index < TAPER_LINKS ? (index + 1) / (TAPER_LINKS + 1) : 1;
}

/** Draws every group, so the warm-up heads compile all a head can show. */
const LIVE_BARBED: HookLook = { menace: 'live', barbed: true };

/** Each hook carries a faint halo in its thrower's colour, so it is clear at a glance whose iron is in the air. In hook radii. */
const HALO_SIZE = 4.2;

/** `hookGeometry` is shared with the hooks the fighters carry; whoever made it disposes of it. */
/** `emergeSeconds` is how long a head that comes out of the dark takes to grow to full size; 0 shows it at once. */
export function createHooksView(hookGeometry: BufferGeometry, softDot: Texture, tints: Tints, emergeSeconds = 0): HooksView {
  const teams = Object.keys(tints.teams) as TeamId[];
  const group = new Group();
  const linkGeometry = new TorusGeometry((LINK.width - LINK.thickness) / 2, LINK.thickness / 2, 6, 12);
  linkGeometry.scale(LINK.length / LINK.width, 1, 1);
  const linkMaterial = new MeshStandardMaterial({
    color: tints.iron,
    roughness: 0.38,
    metalness: 0.55,
    emissive: tints.iron,
    emissiveIntensity: tints.chainGlow,
  });
  const capacity = CHAIN.maxLinks * FULL_CHAINS;
  const links = new InstancedMesh(linkGeometry, linkMaterial, capacity);
  links.castShadow = true;
  links.frustumCulled = false;
  links.count = 0;
  group.add(links);

  const materials = createHookMaterials(softDot, tints);
  let heads = new Map<HookId, Head>();
  const matrix = new Matrix4();
  const thin = new Vector3();

  const createHead = (team: TeamId): Head => {
    const live = materials.dress(team, LIVE_BARBED);
    const mesh = new Mesh(hookGeometry, live.faces);
    mesh.castShadow = true;
    const halo = new Sprite(live.halo ?? undefined);
    // A child of the head, so it grows with whatever size the hook was bought up to.
    halo.scale.setScalar(HALO_SIZE);
    mesh.add(halo);
    return { mesh, halo, shown: 1 };
  };
  /** Truthful about what the hook can still do: a spent hook dims and loses its halo, a hot barb glows. */
  const dress = (head: Head, team: TeamId, look: HookLook): void => {
    const { faces, halo } = materials.dress(team, look);
    head.mesh.material = faces;
    head.halo.visible = halo !== null;
    if (halo !== null) head.halo.material = halo;
  };
  // Never drawn. Their presence lets the renderer compile the hook shaders up front, not on the first throw.
  const warmUp = teams.map(createHead);
  warmUp.forEach(({ mesh }) => {
    mesh.visible = false;
    group.add(mesh);
  });

  return {
    group,
    update(frame, handOf, dt) {
      const next = new Map<HookId, Head>();
      let used = 0;
      for (const hf of frame.hooks) {
        const direction = headDirection(hf);
        const team = hf.team ?? 'west';
        const known = heads.get(hf.hook.id);
        const head = known ?? createHead(team);
        if (known === undefined) {
          group.add(head.mesh);
          head.shown = hf.cut && emergeSeconds > 0 ? 0 : 1;
        }
        head.shown = Math.min(1, head.shown + (emergeSeconds > 0 ? dt / emergeSeconds : 1));
        dress(head, team, hookLook(hf.hook));
        const at = simToWorld(hf.head, SIZES.chainHeight);
        head.mesh.position.set(at.x, at.y, at.z);
        head.mesh.scale.setScalar(toWorldLength(hf.hook.stats.radius) * head.shown);
        head.mesh.rotation.set(0, -Math.atan2(direction.z, direction.x), 0);
        next.set(hf.hook.id, head);

        const layout = layOutChain(chainPath(hf, hf.cut ? null : handOf(hf.hook.ownerId), direction), LINK.spacing, Math.min(CHAIN.maxLinks, capacity - used));
        layout.links.forEach((link, i) => {
          const k = taper(i, hf.cut);
          links.setMatrixAt(used, linkMatrix(link, layout.stretch, matrix).scale(thin.set(k, k, k)));
          used += 1;
        });
      }
      heads.forEach((head, id) => {
        if (!next.has(id)) group.remove(head.mesh);
      });
      heads = next;
      links.count = used;
      links.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      linkGeometry.dispose();
      linkMaterial.dispose();
      materials.dispose();
      links.dispose();
    },
  };
}
