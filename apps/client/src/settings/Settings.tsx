import { useId, useRef, useSyncExternalStore, type Ref } from 'react';
import { AudioSettings } from '../audio/AudioSettings';
import { toggleMuted } from '../audio/settings';
import { audioSettings } from '../audio/settingsStore';
import type { QualitySetting } from '../render/quality';
import { QualityPicker } from '../screens/QualityPicker';
import './settings.css';

/** Clicking the backdrop closes it too; where `closedby` is unknown, Escape and Done still do. */
const LIGHT_DISMISS = { closedby: 'any' } as Record<string, string>;

function SettingsDialog({ ref, quality }: { readonly ref: Ref<HTMLDialogElement>; readonly quality: QualitySetting }) {
  const titleId = useId();
  return (
    <dialog ref={ref} className="settings hud-plate" aria-labelledby={titleId} {...LIGHT_DISMISS}>
      <h2 id={titleId} className="settings-title">
        Settings
      </h2>
      <QualityPicker setting={quality} />
      <AudioSettings />
      <form method="dialog" className="settings-done">
        <button type="submit" className="hud-button">
          Done
        </button>
      </form>
    </dialog>
  );
}

const isMuted = (): boolean => audioSettings.getSnapshot().muted;

function SpeakerIcon({ muted }: { readonly muted: boolean }) {
  return (
    <svg className="speaker-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      {muted ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />}
    </svg>
  );
}

/** Shows at a glance whether the game is silent, follows `M` live, and switches sound with a press of its own. */
function MuteToggle() {
  const muted = useSyncExternalStore(audioSettings.subscribe, isMuted);
  return (
    <button
      type="button"
      className="mute-toggle"
      aria-pressed={muted}
      aria-keyshortcuts="M"
      title={muted ? 'Sound is off (M)' : 'Sound is on (M)'}
      onClick={() => audioSettings.update(toggleMuted)}
    >
      <SpeakerIcon muted={muted} />
      <span className="hud-sr">Mute</span>
    </button>
  );
}

type Props = {
  readonly quality: QualitySetting;
  /** How the opening button looks where it sits: a plate button in the lobby and pause menu, quieter on the main menu. */
  readonly buttonClass?: string;
};

/**
 * The one place graphics and sound are set, on every screen that offers them. A native modal: it can open over the pause
 * menu, and closing it hands focus back to the button that opened it.
 */
export function Settings({ quality, buttonClass = 'hud-button' }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <span className="settings-control">
      <button type="button" className={buttonClass} aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        Settings
      </button>
      <MuteToggle />
      <SettingsDialog ref={dialog} quality={quality} />
    </span>
  );
}
