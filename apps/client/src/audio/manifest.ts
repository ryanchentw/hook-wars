/**
 * Every sound the game can play and the files behind it, under `public/audio`. The files are made by
 * `scripts/audio/build.mjs` from the CC0 originals it names; their licences sit beside them.
 */
export type SoundId =
  | 'hookThrow'
  | 'hookHit'
  | 'hookBounce'
  | 'melee'
  | 'hurt'
  | 'kill'
  | 'respawn'
  | 'purchase'
  | 'refused'
  | 'grappleThrow'
  | 'grappleBite'
  | 'grappleArrive'
  | 'pickupCaught'
  | 'gold'
  | 'gale'
  | 'storm'
  | 'stormBolt'
  | 'matchStart'
  | 'victory'
  | 'defeat'
  | 'uiClick'
  | 'seat'
  | 'tick';

export type SoundSpec = {
  /** File names without the extension; one is picked at random each time, never the same twice running. */
  readonly variants: readonly string[];
  /** Linear gain before the effects volume, distance and pan. */
  readonly gain: number;
  /** Each play is pitched up or down by up to this many semitones, at random. */
  readonly pitch: number;
  /** Each play is louder or quieter by up to this many decibels, at random. */
  readonly jitterDb: number;
};

const numbered = (name: string, count: number): readonly string[] => Array.from({ length: count }, (_, i) => `${name}-${i + 1}`);

const busy = (variants: readonly string[], gain: number): SoundSpec => ({ variants, gain, pitch: 1.5, jitterDb: 2 });
const steady = (variants: readonly string[], gain: number): SoundSpec => ({ variants, gain, pitch: 0, jitterDb: 0 });

export const SOUNDS: Readonly<Record<SoundId, SoundSpec>> = {
  hookThrow: busy(numbered('hook-throw', 3), 0.55),
  hookHit: busy(numbered('hook-hit', 2), 0.8),
  hookBounce: busy(numbered('hook-bounce', 3), 0.5),
  melee: busy(numbered('melee', 3), 1),
  hurt: busy(numbered('hurt', 3), 0.8),
  kill: { variants: ['kill'], gain: 0.85, pitch: 1, jitterDb: 1 },
  respawn: steady(['respawn'], 0.5),
  purchase: busy(['purchase'], 0.6),
  refused: steady(['refused'], 0.5),
  grappleThrow: busy(numbered('grapple-throw', 2), 0.5),
  grappleBite: busy(numbered('grapple-bite', 2), 0.6),
  grappleArrive: busy(['grapple-arrive'], 0.55),
  pickupCaught: busy(numbered('pickup-caught', 2), 0.55),
  gold: steady(['gold'], 0.6),
  gale: steady(['gale'], 0.6),
  storm: steady(['storm'], 0.7),
  stormBolt: busy(numbered('storm-bolt', 2), 0.35),
  matchStart: steady(['match-start'], 0.6),
  victory: steady(['victory'], 0.75),
  defeat: steady(['defeat'], 0.75),
  uiClick: { variants: ['ui-click'], gain: 0.35, pitch: 0.5, jitterDb: 0 },
  seat: steady(['seat'], 0.45),
  tick: steady(['tick'], 0.4),
};

export type TrackId = 'menu' | 'match';

export type TrackSpec = {
  readonly file: string;
  /** Seconds the end of one pass overlaps the start of the next. */
  readonly overlap: number;
  /** Seconds the next pass takes to come up to full; the overlap fades the old pass out. */
  readonly fadeIn: number;
};

export const TRACKS: Readonly<Record<TrackId, TrackSpec>> = {
  // Written to loop: the overlap only hides the seam's click.
  menu: { file: 'music-menu', overlap: 0.05, fadeIn: 0.05 },
  // Ends on a chord that rings out over about two seconds; the next pass starts on the downbeat under that ring.
  match: { file: 'music-match', overlap: 1.8, fadeIn: 0 },
};

export const AUDIO_EXTENSION = '.mp3';

export const audioUrl = (base: string, file: string): string => `${base}audio/${file}${AUDIO_EXTENSION}`;
