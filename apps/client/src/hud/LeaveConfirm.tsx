import { useEffect, useId, useRef } from 'react';

type Props = { readonly open: boolean; readonly onStay: () => void; readonly onLeave: () => void };

const LEAVE = 'leave';

/**
 * Asked before an online match is left, since leaving cannot be undone. A native modal whose buttons close it through
 * the form; Escape, or anything else that closes it without a choice, means stay.
 */
export function LeaveConfirm({ open, onStay, onLeave }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const noteId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const onClose = (): void => {
    const dialog = ref.current;
    const chose = dialog?.returnValue;
    // Escape sets no value, and browsers differ on clearing the last one.
    if (dialog !== null) dialog.returnValue = '';
    if (chose === LEAVE) onLeave();
    else onStay();
  };

  return (
    <dialog ref={ref} className="pause hud-plate" aria-labelledby={titleId} aria-describedby={noteId} onClose={onClose}>
      <h2 id={titleId}>Leave the match?</h2>
      <p id={noteId} className="pause-note">
        The match goes on without you. A bot takes your fighter, and you cannot come back to this match.
      </p>
      <form method="dialog" className="pause-actions">
        <button type="submit" value="stay" className="hud-primary" autoFocus>
          Stay
        </button>
        <button type="submit" value={LEAVE} className="hud-button">
          Leave match
        </button>
      </form>
    </dialog>
  );
}
