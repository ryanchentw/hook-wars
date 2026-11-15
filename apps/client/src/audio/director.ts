import type { RoomState } from '@hookwars/room';
import type { AppView } from '../app/appCore';
import type { Store } from '../app/store';
import { createEffects, type EffectRequest } from './effects';
import { attachMatchAudio } from './matchAudio';
import type { TrackId } from './manifest';
import { createMusic } from './music';
import type { AudioOutput } from './output';
import { bindButtonClicks, bindGestures, bindMuteKey, bindVisibility, whenIdle } from './pageHooks';
import { volumeGain, type SettingsStore } from './settings';
import type { Random } from './variation';

export type DirectorDeps = {
  readonly output: AudioOutput;
  readonly settings: SettingsStore;
  readonly app: Pick<Store<AppView>, 'subscribe' | 'getSnapshot'>;
  readonly window: Window;
  readonly base: string;
  readonly random: Random;
};

const TICK_MS = 250;
const LEVEL_RAMP = 0.08;
/** Where the music sits under the end-of-match sting, and while an offline match waits in its pause menu. */
const DUCK = { sting: 0.35, pause: 0.5 } as const;
const DUCK_IN = 0.15;
const DUCK_OUT = 1.5;
/** Long enough for the longer of the two stings to finish. */
const STING_HOLD_MS = 1600;

type Ducks = { readonly sting: boolean; readonly pause: boolean };

const seatsFilled = (room: RoomState): number => [...room.slots.west, ...room.slots.east].filter((s) => s.kind !== 'empty').length;

function trackFor(view: AppView): TrackId {
  return view.route.screen === 'match' && view.match !== null ? 'match' : 'menu';
}

/** On the menu and in the lobby every button clicks; in a match only those in its dialogs, since the shop has its own sounds. */
function clicks(view: AppView, button: HTMLButtonElement): boolean {
  return view.route.screen !== 'match' || button.closest('dialog, [role="dialog"]') !== null;
}

/** Everything the page plays: music for the screen on show, a match's sounds, and the menus' clicks. */
export function createAudioDirector({ output, settings, app, window: win, base, random }: DirectorDeps): () => void {
  const effects = createEffects(output, base, random);
  const music = createMusic(output, base);
  let ducks: Ducks = { sting: false, pause: false };
  let detachMatch: (() => void) | null = null;
  let shownMatch: AppView['match'] = null;
  let seats = seatsFilled(app.getSnapshot().room);
  let stingTimer: number | undefined;

  const applySettings = (): void => {
    const s = settings.getSnapshot();
    output.setLevel('master', s.muted ? 0 : 1, LEVEL_RAMP);
    output.setLevel('music', volumeGain(s.music), LEVEL_RAMP);
    output.setLevel('effects', volumeGain(s.effects), LEVEL_RAMP);
  };
  const setDucks = (next: Ducks): void => {
    const level = Math.min(next.sting ? DUCK.sting : 1, next.pause ? DUCK.pause : 1);
    output.setLevel('duck', level, level < 1 ? DUCK_IN : DUCK_OUT);
    ducks = next;
  };
  const play = (requests: readonly EffectRequest[]): void => effects.play(requests);
  const sting = (): void => {
    setDucks({ ...ducks, sting: true });
    win.clearTimeout(stingTimer);
    stingTimer = win.setTimeout(() => setDucks({ ...ducks, sting: false }), STING_HOLD_MS);
  };

  const followMatch = (view: AppView): void => {
    if (view.match === shownMatch) return;
    detachMatch?.();
    shownMatch = view.match;
    detachMatch = view.match === null ? null : attachMatchAudio({ match: view.match, sink: { play, sting, paused: (pause) => setDucks({ ...ducks, pause }) }, hidden: () => win.document.hidden });
  };
  const followApp = (): void => {
    const view = app.getSnapshot();
    music.want(trackFor(view));
    followMatch(view);
    const filled = seatsFilled(view.room);
    if (view.route.screen === 'lobby' && filled > seats) play([{ sound: 'seat', gain: 1, pan: 0 }]);
    seats = filled;
  };

  applySettings();
  followApp();
  const timer = win.setInterval(music.tick, TICK_MS);
  const unbinders = [
    settings.subscribe(applySettings),
    app.subscribe(followApp),
    bindGestures(win, () => {
      output.unlock();
      music.tick();
    }),
    bindVisibility(win.document, (hidden) => output.setHidden(hidden)),
    bindMuteKey(win, () => settings.update((s) => ({ ...s, muted: !s.muted }))),
    bindButtonClicks(win.document, (button) => clicks(app.getSnapshot(), button), () => play([{ sound: 'uiClick', gain: 1, pan: 0 }])),
  ];
  whenIdle(win, () => void effects.load().then(music.load));
  return () => {
    win.clearInterval(timer);
    win.clearTimeout(stingTimer);
    detachMatch?.();
    unbinders.forEach((unbind) => unbind());
  };
}
