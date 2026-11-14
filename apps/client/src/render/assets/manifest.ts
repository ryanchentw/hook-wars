import type { TeamId } from '@hookbrawl/sim';

/** KayKit models (CC0, Kay Lousberg), served from `public/assets/kaykit/`. */
export const CHARACTER_FILES: Readonly<Record<TeamId, string>> = {
  west: 'characters/Knight.glb',
  east: 'characters/Knight.glb',
};

export const PROP_FILES = {
  floorStone: 'dungeon/floor_tile_large.gltf.glb',
  floorTimber: 'dungeon/floor_wood_large_dark.gltf.glb',
  wall: 'dungeon/wall.gltf.glb',
  wallPillar: 'dungeon/wall_pillar.gltf.glb',
  wallGated: 'dungeon/wall_gated.gltf.glb',
  parapet: 'dungeon/barrier.gltf.glb',
  pillar: 'dungeon/pillar.gltf.glb',
  torchMounted: 'dungeon/torch_mounted.gltf.glb',
  torchStanding: 'dungeon/torch_lit.gltf.glb',
  barrel: 'dungeon/barrel_large.gltf.glb',
  barrelStack: 'dungeon/barrel_small_stack.gltf.glb',
  crates: 'dungeon/crates_stacked.gltf.glb',
  boxes: 'dungeon/box_stacked.gltf.glb',
  keg: 'dungeon/keg.gltf.glb',
} as const;

export type PropName = keyof typeof PROP_FILES;

/** Bone the chain is held in. GLTFLoader strips the dot from the rig's `handslot.r`. */
export const HAND_BONE = 'handslotr';
/** Bones whose children are the pack's weapons, shields and mugs; this game's brawlers carry none of them. */
export const ITEM_SLOT_BONES: readonly string[] = ['handslotr', 'handslotl'];
export const CAPE_SUFFIX = '_Cape';
/** The bare head under the helmet. Painted out, so the helm reads as an empty iron mask instead of a smiling face. */
export const FACE_SUFFIX = '_Head';
