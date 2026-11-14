import { SCENE_IDS, type SceneId } from './types';

/** What the page address asks of the picture. */
export type ViewOptions = {
  /** Null lets the scenes take turns, one per match. */
  readonly scene: SceneId | null;
  /** Whether a match opens on its establishing shot. Tests and tooling turn it off with `?intro=off`. */
  readonly intro: boolean;
};

export function isSceneId(value: string | null): value is SceneId {
  return value !== null && (SCENE_IDS as readonly string[]).includes(value);
}

/** An unknown or missing `?scene` is no choice at all, so a mistyped link still opens a match. */
export function viewOptionsFromQuery(search: string): ViewOptions {
  const params = new URLSearchParams(search);
  const scene = params.get('scene');
  return { scene: isSceneId(scene) ? scene : null, intro: params.get('intro') !== 'off' };
}

/** The scene a match is played in: the chosen one, or the next in turn. `matchIndex` counts matches since the page loaded. */
export function sceneForMatch(chosen: SceneId | null, matchIndex: number): SceneId {
  if (chosen !== null) return chosen;
  const turn = ((Math.floor(matchIndex) % SCENE_IDS.length) + SCENE_IDS.length) % SCENE_IDS.length;
  return SCENE_IDS[turn] ?? SCENE_IDS[0];
}
