import type { AppView } from '../app/appCore';
import type { Store } from '../app/store';
import { audioMode } from './audioMode';
import { createAudioDirector } from './director';
import { createFakeOutput, type FakeOutput } from './fakeOutput';
import type { AudioOutput } from './output';
import { audioSettings } from './settingsStore';
import { createWebAudioOutput } from './webAudio';

/** What the browser suite reads under `?audio=fake`: the labels of every sound asked for, oldest first, and how many files were fetched. */
export type AudioProbe = { readonly requested: () => readonly string[]; readonly clear: () => void; readonly loaded: () => number };

declare global {
  interface Window {
    __hookwarsAudio?: AudioProbe;
  }
}

function fakeWithProbe(win: Window): FakeOutput {
  const fake = createFakeOutput();
  win.__hookwarsAudio = { requested: () => fake.played().map((p) => p.label), clear: fake.clear, loaded: () => fake.loaded().length };
  return fake;
}

/** Starts the page's audio, or nothing when the mode says off. */
export function startAudio(win: Window, app: Pick<Store<AppView>, 'subscribe' | 'getSnapshot'>, base: string): void {
  const mode = audioMode(win.location.search, win.navigator.webdriver);
  if (mode === 'off') return;
  const output: AudioOutput = mode === 'fake' ? fakeWithProbe(win) : createWebAudioOutput();
  createAudioDirector({ output, settings: audioSettings, app, window: win, base, random: Math.random });
}
