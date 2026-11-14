export type MatchKeysDeps = {
  readonly window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  /** Whether Escape may open the pause menu now: the fight is on and nothing else has the keys. */
  readonly canPause: () => boolean;
  readonly pause: () => void;
  /** Whether Tab is the scoreboard key now; when it is not, Tab moves focus as usual, through the end panel or a dialog. */
  readonly tabShowsScores: () => boolean;
  readonly showScores: (shown: boolean) => void;
};

/** Escape pauses; Tab shows the scoreboard while held instead of moving focus out of the game. Returns the unbinder. */
export function bindMatchKeys({ window: win, canPause, pause, tabShowsScores, showScores }: MatchKeysDeps): () => void {
  const onDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !event.repeat && canPause()) {
      event.preventDefault();
      pause();
    } else if (event.key === 'Tab' && tabShowsScores()) {
      event.preventDefault();
      showScores(true);
    }
  };
  const onUp = (event: KeyboardEvent): void => {
    if (event.key === 'Tab') showScores(false);
  };
  const onBlur = (): void => showScores(false);
  win.addEventListener('keydown', onDown);
  win.addEventListener('keyup', onUp);
  win.addEventListener('blur', onBlur);
  return () => {
    win.removeEventListener('keydown', onDown);
    win.removeEventListener('keyup', onUp);
    win.removeEventListener('blur', onBlur);
  };
}
