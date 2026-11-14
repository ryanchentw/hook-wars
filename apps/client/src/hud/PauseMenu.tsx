import { useEffect, useId, useRef } from 'react';
import { HOLDS_MATCH } from '../game/pauseGate';
import { CreditsLink } from './labels';

type Props = { readonly open: boolean; readonly onResume: () => void; readonly onLobby: () => void };

/** A native modal: Escape and the Resume button both close it, and the browser keeps focus inside while it is open. */
export function PauseMenu({ open, onResume, onLobby }: Props) {
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
      <h2 id={titleId}>{HOLDS_MATCH.menu ? 'Paused' : 'Menu'}</h2>
      <p className="pause-note">{HOLDS_MATCH.menu ? 'The match waits for you.' : 'The match goes on while this is open.'}</p>
      <div className="pause-actions">
        <form method="dialog">
          <button type="submit" className="hud-primary" autoFocus>
            Resume
          </button>
        </form>
        <button type="button" className="hud-button" onClick={onLobby}>
          Back to lobby
        </button>
        <CreditsLink />
      </div>
    </dialog>
  );
}
