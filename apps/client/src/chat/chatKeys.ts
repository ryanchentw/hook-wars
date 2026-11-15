/** The parts of a keydown the chat input decides on: plain data, so every browser's event order can be replayed in a test. */
export type ChatKeyPress = {
  readonly key: string;
  /** 229 while an input method has the key, whatever `key` says. */
  readonly keyCode: number;
  readonly isComposing: boolean;
  readonly timeStamp: number;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
};

/** What the input's own composition events have said: whether one is open, and when the last one closed. */
export type Composition = { readonly active: boolean; readonly endedAt: number | null };

export const NO_COMPOSITION: Composition = { active: false, endedAt: null };

/**
 * `ime`: the key belongs to the input method (it confirms or cancels a candidate), so the chat does nothing with it.
 * `type`: an ordinary key that edits the text.
 */
export type ChatKeyAction = 'send' | 'cancel' | 'switch-channel' | 'ime' | 'type';

/**
 * Safari has delivered `compositionend` before the keydown of the Enter that confirmed it, with `isComposing` already
 * false. That keydown lands within a few milliseconds of `compositionend`, either side of it; no person presses Enter
 * twice that fast.
 */
export const COMPOSITION_ECHO_MS = 50;

const PROCESS_KEY = 229;

/** Whether an input method still owns this key, by every signal the browsers between them give. */
export function imeOwns(press: ChatKeyPress, composition: Composition): boolean {
  if (press.isComposing || press.keyCode === PROCESS_KEY || composition.active) return true;
  return composition.endedAt !== null && Math.abs(press.timeStamp - composition.endedAt) < COMPOSITION_ECHO_MS;
}

const modified = (press: ChatKeyPress): boolean => press.altKey || press.ctrlKey || press.metaKey;

/** What a keydown in the chat input means. `canSwitch` is false where there is only one channel, as in the lobby. */
export function chatKeyAction(press: ChatKeyPress, composition: Composition, canSwitch: boolean): ChatKeyAction {
  const { key } = press;
  if (key !== 'Enter' && key !== 'Escape' && key !== 'Tab') return 'type';
  if (imeOwns(press, composition)) return 'ime';
  if (key === 'Escape') return 'cancel';
  if (key === 'Tab') return canSwitch && !modified(press) && !press.shiftKey ? 'switch-channel' : 'type';
  return modified(press) ? 'type' : 'send';
}

export function pressOf(event: KeyboardEvent): ChatKeyPress {
  const { key, keyCode, isComposing, timeStamp, shiftKey, altKey, ctrlKey, metaKey } = event;
  return { key, keyCode, isComposing, timeStamp, shiftKey, altKey, ctrlKey, metaKey };
}
