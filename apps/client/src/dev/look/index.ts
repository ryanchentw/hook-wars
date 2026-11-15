import type { LookTap } from '../../render/lookTap';
import { createOverrideStore } from './overrides';
import type { Panel } from './panel';
import { createTuner } from './tuner';

/** The key beside 1 on a laptop: free in the game, and under the left hand while the right is on the trackpad. */
const TOGGLE_KEY = 'Backquote';

/**
 * Development only: a button and a key that open a panel of sliders over whatever scene is on show. Returns the tap
 * the picture is built through, so overrides kept from an earlier visit are in force from the first frame.
 */
export function installLookTuner(storage: () => Storage): LookTap {
  const tuner = createTuner(createOverrideStore(storage));
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'look-toggle';
  button.setAttribute('aria-keyshortcuts', '`');
  button.setAttribute('aria-expanded', 'false');
  document.body.append(button);

  // The panel and the library that draws it load on first open, so a page that never tunes pays nothing for them.
  let panel: Promise<Panel> | null = null;
  const toggle = async (): Promise<void> => {
    panel ??= import('./panel').then(({ createPanel }) => createPanel(tuner));
    const opened = await panel;
    opened.setOpen(!opened.isOpen());
    button.setAttribute('aria-expanded', String(opened.isOpen()));
  };
  const label = (): void => {
    const active = Object.keys(tuner.overrides()).length > 0;
    button.dataset.overrides = active ? 'on' : 'off';
    button.textContent = active ? 'Look ● overrides on' : 'Look';
  };
  tuner.subscribe(label);
  label();

  button.addEventListener('click', () => void toggle());
  window.addEventListener('keydown', (event) => {
    if (event.code !== TOGGLE_KEY || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    // A backtick typed into the chat, or any field, is text.
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    void toggle();
  });
  return tuner;
}
