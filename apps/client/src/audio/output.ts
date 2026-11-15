import type { Bounds } from './loop';

export type Bus = 'music' | 'effects';
/** The gain stages: everything, each bus, and the dip the music takes under a sting or a pause. */
export type Level = 'master' | Bus | 'duck';

/** A decoded sound, and where in it the sound actually is. */
export type Clip = { readonly duration: number; readonly bounds: Bounds };

export type PlayRequest = {
  /** What is playing, for the fake output to record; the real one ignores it. */
  readonly label: string;
  readonly bus: Bus;
  readonly gain: number;
  /** -1 left to 1 right. */
  readonly pan: number;
  readonly rate: number;
  /** When it starts, on the output's clock. */
  readonly when: number;
  /** Seconds into the clip it starts from, and how many it plays. */
  readonly offset: number;
  readonly length: number;
  readonly fadeIn: number;
  /** Seconds at the end over which it fades to nothing. */
  readonly fadeOut: number;
};

export type Voice = {
  /** Fades it out from now over `fade` seconds; harmless on a voice already finished. */
  stop(fade: number): void;
};

/**
 * The audio graph, kept behind this so everything that decides what to play runs in tests against a fake. Nothing
 * here throws: a blocked or missing output plays nothing.
 */
export type AudioOutput = {
  /** True once a gesture has let audio start and the page is showing. */
  live(): boolean;
  /** Seconds on the output's clock. */
  now(): number;
  /** Null when the file cannot be fetched or decoded. */
  load(url: string): Promise<Clip | null>;
  play(clip: Clip, request: PlayRequest): Voice;
  setLevel(level: Level, gain: number, ramp: number): void;
  /** Called from a key or pointer gesture, which is when browsers let audio start. */
  unlock(): void;
  /** Stops the clock while the tab is hidden, holding the music where it was. */
  setHidden(hidden: boolean): void;
};
