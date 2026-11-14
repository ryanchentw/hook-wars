import type { SceneLook } from '../scenes/types';
import { introFrame, skipIntro, startIntro, stepIntro, type IntroFrame, type IntroState, type IntroTiming } from './intro';
import { createTitleCard } from './titleCard';

export type Opening = {
  active(): boolean;
  /** Starts the establishing shot for a scene. */
  begin(title: SceneLook['title']): void;
  /** Ends it at the next frame, so the key or click that asked is not also read as a game input. */
  skip(): void;
  /** Advances by `dt` and says what this frame shows, or null once the fight is on. */
  step(dt: number): IntroFrame | null;
  dispose(): void;
};

/** Runs the establishing shot's clock and its title card, and reports when it starts and ends. */
export function createOpening(parent: HTMLElement, timing: IntroTiming, onChange: (active: boolean) => void): Opening {
  const card = createTitleCard(parent);
  let state: IntroState = { kind: 'done' };
  let title: SceneLook['title'] | null = null;
  let skipAsked = false;

  const set = (next: IntroState): void => {
    const was = state.kind !== 'done';
    state = next;
    const is = state.kind !== 'done';
    if (was !== is) onChange(is);
  };

  return {
    active: () => state.kind !== 'done',
    begin(next) {
      title = next;
      skipAsked = false;
      set(startIntro());
    },
    skip() {
      skipAsked = true;
    },
    step(dt) {
      set(skipAsked ? skipIntro() : stepIntro(state, dt, timing));
      skipAsked = false;
      const frame = introFrame(state, timing);
      if (title !== null) card.show(title, frame?.title ?? 0);
      return frame;
    },
    dispose: card.remove,
  };
}
