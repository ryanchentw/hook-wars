import { createSettingsStore } from './settings';

/** The page's one set of audio settings, shared by the sliders on every screen and the audio they control. */
export const audioSettings = createSettingsStore(() => window.localStorage);
