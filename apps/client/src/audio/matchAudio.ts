import type { TeamView, Vec2 } from '@hookwars/sim';
import type { MatchHandle } from '../app/matchHost';
import { cuesFor, type Cue } from './cues';
import type { EffectRequest } from './effects';
import type { SoundId } from './manifest';
import { countdownTicks, cueContext, purchaseSounds, respawnLeft } from './matchCues';
import { spatialize } from './spatial';

/** What a match's sounds go to: the effects, and the music's dips. */
export type MatchSink = {
  play(requests: readonly EffectRequest[]): void;
  /** The match ended and its sting is playing. */
  sting(): void;
  /** The match stopped for the pause menu, or started again. */
  paused(paused: boolean): void;
};

export type MatchAudioDeps = {
  readonly match: Pick<MatchHandle, 'session' | 'renderer' | 'hud' | 'ui' | 'holds'>;
  readonly sink: MatchSink;
  /** True while the page is hidden: effects then are dropped, not saved up. */
  readonly hidden: () => boolean;
};

const CENTRED = { gain: 1, pan: 0 };

/** Turns one match's view, tick by tick, into placed sounds. Returns the detacher. */
export function attachMatchAudio({ match, sink, hidden }: MatchAudioDeps): () => void {
  const { session, renderer, hud, ui } = match;
  const localId = session.localPlayerId;
  let started = false;
  let countdown: number | null = null;
  let answered = hud.getSnapshot().feedback.slots;
  let seenSeq = purchaseSounds(0, answered).seq;

  const place = (cue: Cue, view: TeamView): EffectRequest => {
    const listener: Vec2 | null = view.players.find((p) => p.id === localId && p.status.kind !== 'dead')?.pos ?? null;
    const canvas = renderer.canvas;
    const screen = { width: canvas.clientWidth, height: canvas.clientHeight };
    const spatial = cue.at === null ? CENTRED : spatialize({ at: cue.at, listener, screenPos: renderer.worldToScreen(cue.at), screen });
    return { sound: cue.sound, gain: cue.gain * spatial.gain, pan: spatial.pan };
  };
  const plain = (sound: SoundId): EffectRequest => ({ sound, gain: 1, pan: 0 });

  const onTick = (view: TeamView): void => {
    const opening: readonly EffectRequest[] = started ? [] : [plain('matchStart')];
    started = true;
    const left = respawnLeft(view, localId);
    const tick: readonly EffectRequest[] = countdownTicks(countdown, left) ? [plain('tick')] : [];
    countdown = left;
    const cues = cuesFor(view.events, cueContext(view, localId, session.localTeam));
    if (view.events.some((e) => e.kind === 'matchEnd')) sink.sting();
    if (hidden()) return;
    sink.play([...opening, ...tick, ...cues.map((cue) => place(cue, view))]);
  };

  const onShop = (): void => {
    const slots = hud.getSnapshot().feedback.slots;
    if (slots === answered) return;
    answered = slots;
    const { seq, sounds } = purchaseSounds(seenSeq, slots);
    seenSeq = seq;
    if (!hidden() && sounds.length > 0) sink.play(sounds.map(plain));
  };

  const onUi = (): void => sink.paused(match.holds.menu && ui.getSnapshot().paused);

  const unbinders = [session.subscribe(onTick), hud.subscribe(onShop), ui.subscribe(onUi)];
  return () => {
    unbinders.forEach((unbind) => unbind());
    sink.paused(false);
  };
}
