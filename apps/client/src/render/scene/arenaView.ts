import type { Arena } from '@hookbrawl/sim';
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
  type Texture,
} from 'three';
import type { Assets } from '../assets/loadAssets';
import { toWorldLength } from '../space';
import { COLORS } from '../theme';
import { createBuoy } from './buoy';
import { layOutArena, type Box, type PropGroup, type Surface } from './layout';
import { createLighting } from './lighting';
import { createWater } from './water';

export type ArenaView = { readonly group: Group; update(elapsed: number): void; dispose(): void };

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

/** The static harbour: instanced tiles, walls and cargo, the canal water, the buoy and the lights. */
export function createArenaView(arena: Arena, assets: Assets, softDot: Texture): ArenaView {
  const layout = layOutArena(arena);
  const group = new Group();

  const materials = Object.fromEntries(
    (Object.keys(SURFACE_TINT) as Surface[]).map((surface) => [
      surface,
      new MeshStandardMaterial({ map: assets.propTexture, color: SURFACE_TINT[surface], roughness: 0.86, metalness: 0 }),
    ]),
  ) as Record<Surface, MeshStandardMaterial>;
  const ledgeMaterial = new MeshStandardMaterial({ color: COLORS.ledge, roughness: 0.95 });

  const instances = layout.groups
    .filter((g) => g.placements.length > 0)
    .map((g) => instanced(g, assets.props[g.prop].geometry, materials[g.surface]));
  instances.forEach((mesh, i) => {
    const surface = layout.groups.filter((g) => g.placements.length > 0)[i]?.surface;
    if (surface === 'stone' || surface === 'timber') weather(mesh);
  });
  const copingMaterial = new MeshStandardMaterial({ color: COLORS.coping, roughness: 0.8 });
  const ledges = [
    ...layout.ledges.map((box) => boxMesh(box, ledgeMaterial, true)),
    ...layout.copings.map((box) => boxMesh(box, copingMaterial, false)),
  ];
  const water = createWater(layout.water);
  const buoy = createBuoy(arena, softDot);
  const lighting = createLighting({ w: toWorldLength(arena.width), d: toWorldLength(arena.height) }, layout.torches, softDot);
  group.add(...instances, ...ledges, water.mesh, buoy.group, lighting.group);

  return {
    group,
    update(elapsed) {
      water.update(elapsed);
      buoy.update(elapsed);
      lighting.update(elapsed);
    },
    dispose() {
      instances.forEach((mesh) => mesh.dispose());
      ledges.forEach((mesh) => mesh.geometry.dispose());
      Object.values(materials).forEach((m) => m.dispose());
      ledgeMaterial.dispose();
      copingMaterial.dispose();
      water.dispose();
      buoy.dispose();
      lighting.dispose();
    },
  };
}
