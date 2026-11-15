import { audioUrl, SOUNDS, type SoundId } from './manifest';
import type { AudioOutput, Clip, Voice } from './output';
import { pickVariant, vary, type Random } from './variation';
import { admit, VOICE_LIMITS, type ActiveVoice } from './voices';

/** A sound to play now, already placed: its gain after distance, and its pan. */
export type EffectRequest = { readonly sound: SoundId; readonly gain: number; readonly pan: number };

export type Effects = {
  /** Fetches and decodes every effect; sounds asked for before theirs arrive are skipped. */
  load(): Promise<void>;
  play(requests: readonly EffectRequest[]): void;
};

const QUIET = 0.001;
/** Seconds a stolen voice takes to go, short enough to free it at once without a click. */
const STEAL_FADE = 0.02;

type Playing = ActiveVoice & { readonly voice: Voice };

export function createEffects(output: AudioOutput, base: string, random: Random): Effects {
  const clips = new Map<string, Clip>();
  const lastVariant = new Map<SoundId, number>();
  let playing: readonly Playing[] = [];
  let nextId = 0;

  const start = (request: EffectRequest, now: number): Playing | null => {
    const spec = SOUNDS[request.sound];
    const index = pickVariant(spec.variants.length, lastVariant.get(request.sound) ?? null, random);
    const clip = clips.get(spec.variants[index] ?? '');
    if (clip === undefined) return null;
    lastVariant.set(request.sound, index);
    const { rate, gain } = vary(spec, random);
    const { start: offset, end } = clip.bounds;
    const voice = output.play(clip, { label: request.sound, bus: 'effects', gain: request.gain * spec.gain * gain, pan: request.pan, rate, when: now, offset, length: end - offset, fadeIn: 0, fadeOut: 0 });
    nextId += 1;
    return { id: nextId, sound: request.sound, startedAt: now, endsAt: now + (end - offset) / rate, gain: request.gain, voice };
  };

  return {
    async load() {
      const files = [...new Set(Object.values(SOUNDS).flatMap((s) => s.variants))];
      await Promise.all(
        files.map(async (file) => {
          const clip = await output.load(audioUrl(base, file));
          if (clip !== null) clips.set(file, clip);
        }),
      );
    },
    play(requests) {
      if (!output.live()) return;
      const now = output.now();
      const plan = admit(playing, requests.filter((r) => r.gain > QUIET), now, VOICE_LIMITS);
      playing.filter((p) => plan.steal.includes(p.id)).forEach((p) => p.voice.stop(STEAL_FADE));
      const started = plan.start.flatMap((r) => start(r, now) ?? []);
      playing = [...playing.filter((p) => p.endsAt > now && !plan.steal.includes(p.id)), ...started];
    },
  };
}
