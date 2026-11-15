import { useId, useSyncExternalStore } from 'react';
import { QUALITIES, QUALITY_LABELS, type Quality, type QualitySetting } from '../render/quality';

const HINTS: Readonly<Record<Quality, string>> = {
  high: 'Glow and reflections in the water',
  low: 'The plain picture, for a slower machine',
};

/** The picture's quality, applied the moment it is picked and remembered for the next visit. */
export function QualityPicker({ setting }: { readonly setting: QualitySetting }) {
  const quality = useSyncExternalStore(setting.subscribe, setting.getSnapshot);
  const name = useId();
  return (
    <fieldset className="quality">
      <legend className="field-label">Graphics</legend>
      <div className="quality-options">
        {QUALITIES.map((option) => (
          <span key={option} className="quality-option">
            <input type="radio" id={`${name}${option}`} name={name} checked={quality === option} onChange={() => setting.choose(option)} />
            <label htmlFor={`${name}${option}`}>{QUALITY_LABELS[option]}</label>
          </span>
        ))}
      </div>
      <p className="field-hint quality-hint">{HINTS[quality]}</p>
    </fieldset>
  );
}
