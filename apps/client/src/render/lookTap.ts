import type { SceneId, SceneLook } from './scenes/types';

/** A scene on show whose look can be changed while it is drawn. */
export type Retunable = {
  readonly id: SceneId;
  /** The look as shipped, whatever it is showing now. */
  readonly shipped: SceneLook;
  retune(look: SceneLook): void;
};

/** How development tooling reaches the look of whatever scene is on show. A production page has none. */
export type LookTap = {
  /** The look a scene should be built with, given the one it ships with. */
  adjust<L extends SceneLook>(shipped: L): L;
  shown(target: Retunable): void;
  gone(target: Retunable): void;
};
