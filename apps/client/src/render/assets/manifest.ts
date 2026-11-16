import type { TeamId } from '@hookwars/sim';

/** Paths relative to the shared KayKit asset base. WC3 attribution is in assets/wc3/CREDITS.txt. */
export const CHARACTER_FILES: Readonly<Record<TeamId, string>> = {
  west: '../wc3/Abomination.glb',
  east: '../wc3/Abomination.glb',
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

/** Half extents and height of each prop as shipped, read from the files' own bounds. World units. */
export const PROP_BOUNDS: Readonly<Record<PropName, { readonly halfX: number; readonly halfZ: number; readonly height: number }>> = {
  floorStone: { halfX: 2, halfZ: 2, height: 0.05 },
  floorTimber: { halfX: 2, halfZ: 2, height: 0.05 },
  wall: { halfX: 2, halfZ: 0.5, height: 4 },
  wallPillar: { halfX: 2, halfZ: 0.75, height: 4 },
  wallGated: { halfX: 2, halfZ: 0.5, height: 4 },
  parapet: { halfX: 2, halfZ: 0.25, height: 1.1 },
  pillar: { halfX: 0.75, halfZ: 0.75, height: 4 },
  torchMounted: { halfX: 0.28, halfZ: 0.62, height: 0.68 },
  torchStanding: { halfX: 0.28, halfZ: 0.28, height: 0.73 },
  barrel: { halfX: 0.9, halfZ: 0.9, height: 2 },
  barrelStack: { halfX: 0.93, halfZ: 0.93, height: 1.77 },
  crates: { halfX: 1.16, halfZ: 1.16, height: 2.14 },
  boxes: { halfX: 1.86, halfZ: 1.86, height: 3.31 },
  keg: { halfX: 1.02, halfZ: 1.02, height: 2.05 },
};

/** Bone the chain is held in. GLTFLoader strips the dot from the rig's `handslot.r`. */
export const HAND_BONE = 'handslotr';
/** Bone the grapple rope is held in, so it never tangles with the hook in the other fist. */
export const OFF_HAND_BONE = 'handslotl';
/** Bones whose children are the pack's weapons, shields and mugs; this game's brawlers carry none of them. */
export const ITEM_SLOT_BONES: readonly string[] = ['handslotr', 'handslotl'];
export const CAPE_SUFFIX = '_Cape';
/** The bare head under the helmet. Painted out, so the helm reads as an empty iron mask instead of a smiling face. */
export const FACE_SUFFIX = '_Head';
