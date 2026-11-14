import { FogExp2, Scene, type WebGLRenderer } from 'three';
import { SCENES } from './scenes/registry';
import type { SceneId } from './scenes/types';
import { applyLook, createStage, type Stage, type StageShared } from './stage';

export type SceneShow = {
  readonly scene: Scene;
  readonly id: SceneId;
  readonly stage: Stage;
  /** Thickens the scene's fog by a factor; 1 is the scene's own. */
  setHaze(factor: number): void;
  /** Frees everything the scene put on the GPU. */
  dispose(): void;
};

/** One scene with its look applied to the picture. */
export function createSceneShow(gl: WebGLRenderer, host: HTMLElement, shared: StageShared, id: SceneId): SceneShow {
  const scene = new Scene();
  const stage = createStage(SCENES[id], shared);
  scene.add(stage.group);
  applyLook(stage.theme, { scene, gl, host });
  return {
    scene,
    id,
    stage,
    setHaze(factor) {
      if (scene.fog instanceof FogExp2) scene.fog.density = stage.theme.atmosphere.fog.density * factor;
    },
    dispose() {
      scene.remove(stage.group);
      stage.dispose();
    },
  };
}
