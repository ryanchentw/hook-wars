import type { TeamId } from '@hookbrawl/sim';
import { Mesh, MeshStandardMaterial, SkinnedMesh, type Object3D } from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { CharacterAsset } from '../assets/loadAssets';
import { CAPE_SUFFIX, FACE_SUFFIX, HAND_BONE, ITEM_SLOT_BONES, OFF_HAND_BONE } from '../assets/manifest';
import { COLORS, LIGHTS, SIZES, TEAM_COLORS, type TeamPalette } from '../theme';

export type CharacterModel = {
  readonly root: Object3D;
  readonly hand: Object3D;
  readonly offHand: Object3D;
  /** Every material on this instance, so the whole figure can fade as one. */
  readonly materials: readonly MeshStandardMaterial[];
};

/** Ordered rules for what each part of the figure is made of; the first whose suffix matches the mesh name applies. */
const DRESSING: readonly {
  readonly suffix: string;
  readonly make: (source: MeshStandardMaterial, palette: TeamPalette) => MeshStandardMaterial;
}[] = [
  {
    suffix: CAPE_SUFFIX,
    make: (_source, palette) =>
      new MeshStandardMaterial({ color: palette.signal, roughness: 0.85, emissive: palette.signal, emissiveIntensity: 0.3 }),
  },
  { suffix: FACE_SUFFIX, make: () => new MeshStandardMaterial({ color: COLORS.visorVoid, roughness: 1 }) },
  {
    suffix: '',
    make: (source, palette) =>
      new MeshStandardMaterial({
        map: source.map,
        color: palette.tint,
        roughness: 0.62,
        metalness: 0.15,
        emissive: palette.tint,
        emissiveMap: source.map,
        emissiveIntensity: LIGHTS.characterSelfLight,
      }),
  },
];

function dress(meshName: string, source: MeshStandardMaterial, palette: TeamPalette): MeshStandardMaterial {
  const rule = DRESSING.find((r) => meshName.endsWith(r.suffix));
  if (rule === undefined) throw new Error(`No dressing rule for mesh "${meshName}"`);
  return rule.make(source, palette);
}

function isItem(node: Object3D): boolean {
  return node.parent !== null && ITEM_SLOT_BONES.includes(node.parent.name);
}

/**
 * Clones the template and dresses it for a team: weapons and shields hidden, the texture leaned warm or cold,
 * and the cape recoloured in the team's signal colour.
 */
export function instantiateCharacter(asset: CharacterAsset, team: TeamId): CharacterModel {
  const root = cloneSkinned(asset.scene);
  const palette = TEAM_COLORS[team];
  const materials: MeshStandardMaterial[] = [];

  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    if (isItem(node)) {
      node.visible = false;
      return;
    }
    const source = (Array.isArray(node.material) ? node.material[0] : node.material) as MeshStandardMaterial;
    const material = dress(node.name, source, palette);
    node.material = material;
    materials.push(material);
    node.castShadow = true;
    node.receiveShadow = true;
    // Skinned bounds are those of the bind pose, which a lunging or fallen body leaves behind.
    if (node instanceof SkinnedMesh) node.frustumCulled = false;
  });

  const hand = root.getObjectByName(HAND_BONE);
  const offHand = root.getObjectByName(OFF_HAND_BONE);
  if (hand === undefined || offHand === undefined) throw new Error(`Character model needs both ${HAND_BONE} and ${OFF_HAND_BONE} bones`);
  root.scale.set(SIZES.characterScale.x, SIZES.characterScale.y, SIZES.characterScale.z);
  return { root, hand, offHand, materials };
}
