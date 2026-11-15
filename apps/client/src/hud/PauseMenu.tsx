import { useEffect, useId, useRef } from 'react';
import type { QualitySetting } from '../render/quality';
import { QualityPicker } from '../screens/QualityPicker';
import { CreditsLink } from './labels';

type Props = {
  readonly open: boolean;
  /** Whether the match stands still while this is open. An online match does not: it is everyone's. */
  readonly holds: boolean;
  /** What the way out is called: back to the lobby from a local match, out of the room from an online one. */
  readonly leaveLabel: string;
  readonly quality: QualitySetting;
  readonly onResume: () => void;
  readonly onLeave: () => void;
};

/** A native modal: Escape and the Resume button both close it, and the browser keeps focus inside while it is open. */
export function PauseMenu({ open, holds, leaveLabel, quality, onResume, onLeave }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="pause hud-plate" aria-labelledby={titleId} onClose={onResume}>
      <h2 id={titleId}>{holds ? 'Paused' : 'Menu'}</h2>
      <p className="pause-note">{holds ? 'The match waits for you.' : 'An online match cannot be paused: it goes on while this is open.'}</p>
      <QualityPicker setting={quality} />
      <div className="pause-actions">
        <form method="dialog">
          <button type="submit" className="hud-primary" autoFocus>
            Resume
          </button>
        </form>
        <button type="button" className="hud-button" onClick={onLeave}>
          {leaveLabel}
        </button>
        <CreditsLink />
      </div>
    </dialog>
  );
}
