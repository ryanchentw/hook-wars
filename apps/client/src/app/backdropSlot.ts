import type { Backdrop } from '../render/backdrop';
import type { SceneId } from '../render/scenes/types';

export type BackdropSlot = {
  /** Shows the scene behind the menu and lobby, or nothing. Resolves once the picture matches the latest request. */
  show(scene: SceneId | null): Promise<void>;
};

/**
 * Holds at most one backdrop. Requests are settled one after another, so a quick change of mind never leaves two
 * scenes on the GPU, and only the latest request is built.
 */
export function createBackdropSlot(make: (scene: SceneId) => Promise<Backdrop>, onError: (error: unknown) => void): BackdropSlot {
  let current: Backdrop | null = null;
  let wanted: SceneId | null = null;
  let queue: Promise<void> = Promise.resolve();

  const settle = async (): Promise<void> => {
    if (current?.sceneId === wanted) return;
    current?.dispose();
    current = null;
    if (wanted === null) return;
    try {
      current = await make(wanted);
    } catch (error) {
      onError(error);
    }
  };

  return {
    show(scene) {
      wanted = scene;
      queue = queue.then(settle);
      return queue;
    },
  };
}
