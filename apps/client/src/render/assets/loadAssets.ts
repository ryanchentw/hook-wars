import type { TeamId } from '@hookwars/sim';
import { Mesh, SkinnedMesh, type AnimationClip, type BufferGeometry, type MeshStandardMaterial, type Object3D, type Texture } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { REQUIRED_CLIPS } from '../characters/animation';
import { CHARACTER_FILES, HAND_BONE, OFF_HAND_BONE, PROP_FILES, type PropName } from './manifest';

export type CharacterAsset = {
  /** Template scene; instances are made with `SkeletonUtils.clone`. */
  readonly scene: Object3D;
  readonly clips: ReadonlyMap<string, AnimationClip>;
};

export type PropAsset = { readonly geometry: BufferGeometry };

export type Assets = {
  readonly characters: Readonly<Record<TeamId, CharacterAsset>>;
  readonly props: Readonly<Record<PropName, PropAsset>>;
  /** Every dungeon prop is painted from the same atlas, so one texture serves them all. */
  readonly propTexture: Texture;
};

export class AssetLoadError extends Error {
  constructor(file: string, reason: string) {
    super(`Could not load ${file}: ${reason}`);
    this.name = 'AssetLoadError';
  }
}

function reasonOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof ProgressEvent !== 'undefined' && error instanceof ProgressEvent) return 'the download failed';
  return String(error);
}

async function loadGltf(loader: GLTFLoader, baseUrl: string, file: string): Promise<GLTF> {
  try {
    return await loader.loadAsync(`${baseUrl}${file}`);
  } catch (error) {
    throw new AssetLoadError(file, reasonOf(error));
  }
}

/** Downloaded models are outside data: check they hold what the renderer will reach for before the match starts. */
function toCharacter(file: string, gltf: GLTF): CharacterAsset {
  const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
  const missing = REQUIRED_CLIPS.filter((name) => !clips.has(name));
  if (missing.length > 0) throw new AssetLoadError(file, `missing animation ${missing.join(', ')}`);
  for (const bone of [HAND_BONE, OFF_HAND_BONE]) {
    if (gltf.scene.getObjectByName(bone) === undefined) throw new AssetLoadError(file, `missing bone ${bone}`);
  }
  let skinned = false;
  gltf.scene.traverse((node) => {
    if (node instanceof SkinnedMesh) skinned = true;
  });
  if (!skinned) throw new AssetLoadError(file, 'no skinned mesh');
  return { scene: gltf.scene, clips };
}

function firstMesh(file: string, gltf: GLTF): Mesh {
  let found: Mesh | null = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((node) => {
    if (found === null && node instanceof Mesh) found = node;
  });
  if (found === null) throw new AssetLoadError(file, 'no mesh');
  return found;
}

function toProp(file: string, gltf: GLTF): { readonly prop: PropAsset; readonly texture: Texture | null } {
  const mesh = firstMesh(file, gltf);
  const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as MeshStandardMaterial | undefined;
  return { prop: { geometry }, texture: material?.map ?? null };
}

function byFile(loaded: readonly (readonly [string, CharacterAsset])[], file: string): CharacterAsset {
  const found = loaded.find(([name]) => name === file);
  if (found === undefined) throw new AssetLoadError(file, 'was not loaded');
  return found[1];
}

/**
 * Loads every model the scene needs. Rejects with an `AssetLoadError` naming the first file that failed,
 * so the caller can show it and offer a retry.
 */
export async function loadAssets(baseUrl: string, onProgress: (fraction: number) => void): Promise<Assets> {
  const loader = new GLTFLoader();
  const teams = Object.keys(CHARACTER_FILES) as TeamId[];
  const characterFiles = [...new Set(teams.map((team) => CHARACTER_FILES[team]))];
  const propNames = Object.keys(PROP_FILES) as PropName[];
  const total = characterFiles.length + propNames.length;
  let done = 0;
  let failed = false;
  const tick = <T>(value: T): T => {
    done += 1;
    // Downloads still in flight when another one fails keep finishing; they must not report progress over the error.
    if (!failed) onProgress(done / total);
    return value;
  };
  onProgress(0);

  const [characters, props] = await Promise.all([
    Promise.all(
      characterFiles.map(async (file) => tick([file, toCharacter(file, await loadGltf(loader, baseUrl, file))] as const)),
    ),
    Promise.all(
      propNames.map(async (name) => {
        const file = PROP_FILES[name];
        return tick([name, toProp(file, await loadGltf(loader, baseUrl, file))] as const);
      }),
    ),
  ]).catch((error: unknown) => {
    failed = true;
    throw error;
  });

  const propTexture = props.map(([, loaded]) => loaded.texture).find((texture) => texture !== null);
  if (propTexture === undefined || propTexture === null) throw new AssetLoadError('dungeon props', 'no texture atlas');
  return {
    characters: Object.fromEntries(teams.map((team) => [team, byFile(characters, CHARACTER_FILES[team])])) as Record<TeamId, CharacterAsset>,
    props: Object.fromEntries(props.map(([name, loaded]) => [name, loaded.prop])) as Record<PropName, PropAsset>,
    propTexture,
  };
}
