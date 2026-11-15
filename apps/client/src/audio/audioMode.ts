/** `fake` records what would play instead of playing it, for the browser suite. */
export type AudioMode = 'on' | 'off' | 'fake';

const MODES: readonly AudioMode[] = ['on', 'off', 'fake'];

/** `?audio=` decides; without it, audio plays for a person and stays off under automation, so test runs stay quiet. */
export function audioMode(search: string, automated: boolean): AudioMode {
  const asked = new URLSearchParams(search).get('audio');
  if (asked === null) return automated ? 'off' : 'on';
  return MODES.find((mode) => mode === asked) ?? 'off';
}
