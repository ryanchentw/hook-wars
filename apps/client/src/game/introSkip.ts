export type IntroSkipDeps = {
  readonly window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  /** Whether the establishing shot is on screen and the game, not a dialog, has the keys. */
  readonly skippable: () => boolean;
  readonly skip: () => void;
};

const MODIFIERS: ReadonlySet<string> = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab']);

/** Any key or click ends the establishing shot. Returns the function that unbinds it. */
export function bindIntroSkip({ window: win, skippable, skip }: IntroSkipDeps): () => void {
  const onKey = (event: KeyboardEvent): void => {
    // A modifier on its own is the start of a browser shortcut, not a wish to play.
    if (!MODIFIERS.has(event.key) && skippable()) skip();
  };
  const onPointer = (): void => {
    if (skippable()) skip();
  };
  win.addEventListener('keydown', onKey);
  win.addEventListener('pointerdown', onPointer);
  return () => {
    win.removeEventListener('keydown', onKey);
    win.removeEventListener('pointerdown', onPointer);
  };
}
