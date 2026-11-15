import type { ChatLine } from '@hookwars/protocol';
import { useEffect, useRef, useState } from 'react';
import { fighterName } from '../game/fighterName';
import type { ChatEntry } from './chatState';

/** How long a line stays on the match screen before it fades, unless the chat input is open. */
export const LINE_SHOWN_MS = 10_000;
const NOW_STEP_MS = 500;

/** The time, moved on every half second, for whatever on screen ages with it. */
export function useNow(): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), NOW_STEP_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** Every part is a React text node: markup typed into a message is shown as the characters typed. */
export function ChatLineText({ line }: { readonly line: ChatLine }) {
  return (
    <>
      {line.channel === 'team' && <span className="chat-tag">[Team] </span>}
      <span className={`chat-name${line.team === null ? '' : ` hud-${line.team}`}`}>{fighterName({ name: line.name, isBot: false })}</span>
      <span className="chat-colon">: </span>
      <span className="chat-text">{line.text}</span>
    </>
  );
}

type Props = {
  readonly entries: readonly ChatEntry[];
  readonly show: number;
  /** Lines older than `LINE_SHOWN_MS` fade out; off while the input is open, so everything recent can be read. */
  readonly fade: boolean;
  readonly className: string;
};

/** A polite live region: a screen reader hears each new line once, and nothing as lines fade. */
export function ChatLog({ entries, show, fade, className }: Props) {
  const now = useNow();
  const list = useRef<HTMLOListElement>(null);
  const shown = entries.slice(-show);
  const newest = shown.at(-1)?.line.seq;
  useEffect(() => {
    const el = list.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [newest]);
  return (
    <ol ref={list} className={className} role="log" aria-label="Chat messages" aria-live="polite">
      {shown.map((e) => (
        <li key={e.line.seq} className={`chat-line${e.line.channel === 'team' ? ' chat-line-team' : ''}`} data-faded={fade && now - e.at > LINE_SHOWN_MS}>
          <ChatLineText line={e.line} />
        </li>
      ))}
    </ol>
  );
}
