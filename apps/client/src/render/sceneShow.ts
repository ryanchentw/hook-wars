import { FogExp2, Scene, type Camera, type WebGLRenderer } from 'three';
import type { LookTap, Retunable } from './lookTap';
import type { Pipeline } from './post/pipeline';
import { QUALITY_FEATURES, type QualitySetting } from './quality';
import { SCENES } from './scenes/registry';
import type { SceneId, SceneLook } from './scenes/types';
import { applyLook, createStage, type Stage, type StageShared } from './stage';

export type SceneShow = {
  readonly scene: Scene;
  readonly id: SceneId;
  readonly stage: Stage;
  /** Thickens the scene's fog by a factor; 1 is the scene's own. */
  setHaze(factor: number): void;
  /** Draws the scene to the canvas from `camera`, with whatever the look and the quality setting ask for. */
  render(camera: Camera): void;
  /** Frees everything the scene put on the GPU. */
  dispose(): void;
};

/** What every scene on the page is drawn through. */
export type ShowKit = { readonly pipeline: Pipeline; readonly quality: QualitySetting; readonly tap: LookTap | null };

/** One scene with its look applied to the picture. */
export function createSceneShow(gl: WebGLRenderer, host: HTMLElement, shared: StageShared, id: SceneId, kit: ShowKit): SceneShow {
  const scene = new Scene();
  const shipped = SCENES[id];
  const stage = createStage(kit.tap?.adjust(shipped) ?? shipped, shared);
  scene.add(stage.group);
  let look: SceneLook = stage.theme;
  let haze = 1;
  const features = (): (typeof QUALITY_FEATURES)['high'] => QUALITY_FEATURES[kit.quality.getSnapshot()];
  const setHaze = (factor: number): void => {
    haze = factor;
    if (scene.fog instanceof FogExp2) scene.fog.density = look.atmosphere.fog.density * factor;
  };
  const retune = (next: SceneLook): void => {
    look = next;
    applyLook(look, { scene, gl, host });
    setHaze(haze);
    stage.retune(look, features().reflection);
  };
  retune(look);
  const stopFollowing = kit.quality.subscribe(() => retune(look));
  const tapped: Retunable = { id, shipped, retune };
  kit.tap?.shown(tapped);

  return {
    scene,
    id,
    stage,
    setHaze,
    render(camera) {
      // Counted by hand so the frame's draw calls include the mirror image and every pass after the scene.
      gl.info.reset();
      stage.mirror(gl, scene, camera);
      kit.pipeline.render(scene, camera, features().bloom && look.bloom.on ? look.bloom : null);
    },
    dispose() {
      kit.tap?.gone(tapped);
      stopFollowing();
      scene.remove(stage.group);
      stage.dispose();
    },
  };
}
