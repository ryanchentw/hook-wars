import { loopPass, type LoopPass } from './loop';
import { audioUrl, TRACKS, type TrackId } from './manifest';
import type { AudioOutput, Clip, Voice } from './output';

/** Seconds one track takes to hand over to the next. */
export const CROSSFADE = 2;
/** How far ahead of its start the next pass is handed to the output. */
const LOOKAHEAD = 1;

export type Music = {
  /** Fetches and decodes every track; a track asked for before it arrives starts once it does. */
  load(): Promise<void>;
  /** The track that should be playing, or null for none. */
  want(track: TrackId | null): void;
  /** Schedules the next pass when it is due; called often, from a timer. */
  tick(): void;
};

type Playing = { readonly id: TrackId; readonly voices: readonly Voice[]; readonly nextAt: number | null };

export function createMusic(output: AudioOutput, base: string): Music {
  const clips = new Map<TrackId, Clip>();
  let playing: Playing | null = null;

  const startPass = (id: TrackId, clip: Clip, pass: LoopPass, when: number, fadeIn: number): Voice =>
    output.play(clip, { label: `music:${id}`, bus: 'music', gain: 1, pan: 0, rate: 1, when, offset: pass.offset, length: pass.length, fadeIn, fadeOut: pass.fadeOut });

  const tick = (): void => {
    if (playing === null || !output.live()) return;
    const clip = clips.get(playing.id);
    if (clip === undefined) return;
    const pass = loopPass(clip.bounds, TRACKS[playing.id]);
    const now = output.now();
    if (playing.nextAt !== null && playing.nextAt - now > LOOKAHEAD) return;
    const first = playing.nextAt === null;
    const when = first ? now : (playing.nextAt ?? now);
    const voice = startPass(playing.id, clip, pass, when, first ? CROSSFADE : pass.fadeIn);
    // Only the pass still ringing out and the new one can be heard; older ones have ended.
    playing = { ...playing, voices: [...playing.voices.slice(-1), voice], nextAt: when + pass.period };
  };

  return {
    async load() {
      const ids = Object.keys(TRACKS) as TrackId[];
      await Promise.all(
        ids.map(async (id) => {
          const clip = await output.load(audioUrl(base, TRACKS[id].file));
          if (clip !== null) clips.set(id, clip);
          tick();
        }),
      );
    },
    want(track) {
      if (playing?.id === track || (playing === null && track === null)) return;
      playing?.voices.forEach((v) => v.stop(CROSSFADE));
      playing = track === null ? null : { id: track, voices: [], nextAt: null };
      tick();
    },
    tick,
  };
}
