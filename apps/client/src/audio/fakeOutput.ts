import type { AudioOutput, Clip, Level, PlayRequest } from './output';

const FAKE_CLIP_SECONDS = 1;

export type FakeOutput = AudioOutput & {
  /** Every play asked for, oldest first. */
  readonly played: () => readonly PlayRequest[];
  readonly levels: () => Readonly<Record<Level, number>>;
  readonly loaded: () => readonly string[];
  /** Moves the fake clock on. */
  advance(seconds: number): void;
  clear(): void;
};

/**
 * Records what would be played instead of playing it: for unit tests, and for the browser suite under `?audio=fake`.
 * It starts locked like a real page, so a test also proves nothing plays before a gesture.
 */
export function createFakeOutput(): FakeOutput {
  let played: readonly PlayRequest[] = [];
  let loaded: readonly string[] = [];
  let levels: Record<Level, number> = { master: 1, music: 1, effects: 1, duck: 1 };
  let unlocked = false;
  let hidden = false;
  let clock = 0;
  return {
    live: () => unlocked && !hidden,
    now: () => clock,
    load(url) {
      loaded = [...loaded, url];
      const clip: Clip = { duration: FAKE_CLIP_SECONDS, bounds: { start: 0, end: FAKE_CLIP_SECONDS } };
      return Promise.resolve(clip);
    },
    play(_clip, request) {
      played = [...played, request];
      return { stop: () => undefined };
    },
    setLevel(level, gain) {
      levels = { ...levels, [level]: gain };
    },
    unlock() {
      unlocked = true;
    },
    setHidden(next) {
      hidden = next;
    },
    played: () => played,
    levels: () => levels,
    loaded: () => loaded,
    advance(seconds) {
      clock += seconds;
    },
    clear() {
      played = [];
    },
  };
}
