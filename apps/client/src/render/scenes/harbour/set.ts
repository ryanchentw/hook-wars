import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three';
import type { Animated, SetContext } from '../types';
import { createBuoy } from './buoy';
import type { ArenaLayout, Box, PropGroup, Surface } from './layout';
import { HARBOUR_COLORS as COLORS } from './look';

const SURFACE_TINT: Readonly<Record<Surface, number>> = {
  stone: COLORS.stoneTint,
  timber: COLORS.timberTint,
  wall: COLORS.wallTint,
  prop: COLORS.propTint,
};
const UP = new Vector3(0, 1, 0);
const TILE_WEAR = 0.2;

function instanced(group: PropGroup, geometry: BufferGeometry, material: MeshStandardMaterial): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, group.placements.length);
  const matrix = new Matrix4();
  const turn = new Quaternion();
  group.placements.forEach((p, i) => {
    turn.setFromAxisAngle(UP, p.yaw);
    matrix.compose(new Vector3(p.x, p.y, p.z), turn, new Vector3(p.scale.x, p.scale.y, p.scale.z));
    mesh.setMatrixAt(i, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = group.castShadow;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

function boxMesh(box: Box, material: MeshStandardMaterial, castShadow: boolean): Mesh {
  const size = new Vector3(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
  const mesh = new Mesh(new BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.set(box.min.x + size.x / 2, box.min.y + size.y / 2, box.min.z + size.z / 2);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

/** Slight brightness differences from one floor tile to the next, so a wide dock is not one flat sheet. */
function weather(mesh: InstancedMesh): void {
  const shade = new Color();
  for (let i = 0; i < mesh.count; i += 1) {
    const noise = Math.sin(i * 12.9898) * 43758.5453;
    mesh.setColorAt(i, shade.setScalar(1 - TILE_WEAR * (noise - Math.floor(noise))));
  }
}

/** The static harbour: instanced tiles, walls and cargo, and the buoy. */
export function buildHarbourSet(layout: ArenaLayout, { arena, assets, softDot }: SetContext): Animated {
  const group = new Group();
  const materials = Object.fromEntries(
    (Object.keys(SURFACE_TINT) as Surface[]).map((surface) => [
      surface,
      new MeshStandardMaterial({ map: assets.propTexture, color: SURFACE_TINT[surface], roughness: 0.86, metalness: 0 }),
    ]),
  ) as Record<Surface, MeshStandardMaterial>;
  const ledgeMaterial = new MeshStandardMaterial({ color: COLORS.ledge, roughness: 0.95 });

  const placed = layout.groups.filter((g) => g.placements.length > 0);
  const instances = placed.map((g) => {
    const mesh = instanced(g, assets.props[g.prop].geometry, materials[g.surface]);
    if (g.surface === 'stone' || g.surface === 'timber') weather(mesh);
    return mesh;
  });
  const copingMaterial = new MeshStandardMaterial({ color: COLORS.coping, roughness: 0.8 });
  const ledges = [
    ...layout.ledges.map((box) => boxMesh(box, ledgeMaterial, true)),
    ...layout.copings.map((box) => boxMesh(box, copingMaterial, false)),
  ];
  const buoy = createBuoy(arena, softDot);
  group.add(...instances, ...ledges, buoy.group);

  return {
    group,
    update: buoy.update,
    dispose() {
      instances.forEach((mesh) => mesh.dispose());
      // The models stay loaded for the next time this scene comes round; only their copies on the GPU are let go.
      placed.forEach((g) => assets.props[g.prop].geometry.dispose());
      assets.propTexture.dispose();
      ledges.forEach((mesh) => mesh.geometry.dispose());
      Object.values(materials).forEach((m) => m.dispose());
      ledgeMaterial.dispose();
      copingMaterial.dispose();
      buoy.dispose();
    },
  };
}
