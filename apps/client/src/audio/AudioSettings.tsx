import { useId, useSyncExternalStore } from 'react';
import type { AudioSettings as Settings } from './settings';
import { audioSettings } from './settingsStore';
import './audio.css';

const PERCENT = 100;
const STEP = 5;

type Volume = 'music' | 'effects';

function VolumeSlider({ which, label, value }: { readonly which: Volume; readonly label: string; readonly value: number }) {
  const id = useId();
  const percent = Math.round(value * PERCENT);
  return (
    <div className="audio-row">
      <label htmlFor={id} className="audio-label">
        {label}
      </label>
      <input
        id={id}
        className="audio-slider"
        type="range"
        min={0}
        max={PERCENT}
        step={STEP}
        value={percent}
        aria-valuetext={`${percent}%`}
        onChange={(e) => {
          const next = Number(e.target.value) / PERCENT;
          audioSettings.update((s): Settings => ({ ...s, [which]: next }));
        }}
      />
      <output htmlFor={id} className="audio-value">
        {percent}%
      </output>
    </div>
  );
}

/** Music and effects volume and a mute switch, remembered across visits. Part of the settings dialog. */
export function AudioSettings() {
  const settings = useSyncExternalStore(audioSettings.subscribe, audioSettings.getSnapshot);
  const titleId = useId();
  const muteId = useId();
  return (
    <fieldset className="audio-settings" aria-labelledby={titleId}>
      <legend id={titleId} className="field-label">
        Sound
      </legend>
      <VolumeSlider which="music" label="Music" value={settings.music} />
      <VolumeSlider which="effects" label="Effects" value={settings.effects} />
      <div className="audio-mute">
        <input id={muteId} type="checkbox" checked={settings.muted} onChange={(e) => audioSettings.update((s) => ({ ...s, muted: e.target.checked }))} />
        <label htmlFor={muteId}>
          Mute <kbd className="audio-key">M</kbd>
        </label>
      </div>
    </fieldset>
  );
}
