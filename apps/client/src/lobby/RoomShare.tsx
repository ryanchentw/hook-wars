import { useEffect, useRef, useState } from 'react';

type Props = { readonly code: string; readonly link: string };

const FEEDBACK_MS = 2000;
/** VoiceOver skips a message identical to the last from the same region; this makes a repeat differ without being read. */
const NO_BREAK_SPACE = ' ';

/** The room's code, to read out, and a button that copies the link, to paste. The bubble is both the visible answer and the live region. */
export function RoomShare({ code, link }: Props) {
  const [message, setMessage] = useState('');
  const last = useRef('');
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const report = (text: string): void => {
    const said = text === last.current ? text + NO_BREAK_SPACE : text;
    last.current = said;
    setMessage(said);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(''), FEEDBACK_MS);
  };

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(link);
      report('Copied');
    } catch {
      // No clipboard on an insecure page, or permission refused: the code beside the button still gets a friend in.
      report('Copy failed');
    }
  };

  return (
    <div className="room-share">
      <span className="room-code">
        <span className="field-label">Room</span> <strong>{code}</strong>
      </span>
      <span className="room-copy">
        <button type="button" className="hud-button" onClick={() => void copy()}>
          Copy link
        </button>
        <span className="room-tip" role="status" data-shown={message !== ''}>
          {message}
        </span>
      </span>
    </div>
  );
}
