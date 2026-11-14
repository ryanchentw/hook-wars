import { DAAN } from './daan';
import { GOLDEN_GATE } from './goldenGate';
import { HARBOUR } from './harbour';
import type { SceneId, SceneTheme } from './types';
import { VICTORIA } from './victoria';

/** Every scene a match can be played in. Nothing outside this table knows one scene from another. */
export const SCENES: Readonly<Record<SceneId, SceneTheme>> = {
  victoria: VICTORIA,
  'golden-gate': GOLDEN_GATE,
  daan: DAAN,
  harbour: HARBOUR,
};
