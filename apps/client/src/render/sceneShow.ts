import { FogExp2, Scene, type WebGLRenderer } from 'three';
import { sceneForMatch } from './scenes/choice';
import { SCENES } from './scenes/registry';
import type { SceneId } from './scenes/types';
import { applyLook, createStage, type Stage, type StageShared } from './stage';

export type SceneShow = {
  readonly scene: Scene;
  id(): SceneId;
  stage(): Stage;
  /** Readies the next match: the same scene swept clean, or the next scene in turn. Returns the scene the last match was in. */
  nextMatch(): SceneId;
  /** Thickens the scene's fog by a factor; 1 is the scene's own. */
  setHaze(factor: number): void;
  dispose(): void;
};

/** The scene on show. A new match that is due a different scene frees everything the old one put on the GPU, then builds its own. */
export function createSceneShow(gl: WebGLRenderer, host: HTMLElement, shared: StageShared, chosen: SceneId | null): SceneShow {
  const scene = new Scene();
  const enter = (id: SceneId): Stage => {
    const stage = createStage(SCENES[id], shared);
    scene.add(stage.group);
    applyLook(stage.theme, { scene, gl, host });
    return stage;
  };
  const leave = (stage: Stage): void => {
    scene.remove(stage.group);
    stage.dispose();
  };
  let matchIndex = 0;
  let id = sceneForMatch(chosen, matchIndex);
  let stage = enter(id);

  return {
    scene,
    id: () => id,
    stage: () => stage,
    nextMatch() {
      const previous = id;
      matchIndex += 1;
      id = sceneForMatch(chosen, matchIndex);
      if (id === previous) {
        stage.clear();
      } else {
        leave(stage);
        stage = enter(id);
      }
      return previous;
    },
    setHaze(factor) {
      if (scene.fog instanceof FogExp2) scene.fog.density = stage.theme.atmosphere.fog.density * factor;
    },
    dispose: () => leave(stage),
  };
}
