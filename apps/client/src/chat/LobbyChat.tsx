import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import './chat.css';
import type { ChatFeed } from './chatFeed';
import { ChatComposer } from './ChatComposer';
import { ChatLog } from './ChatLog';
import { CHAT_KEPT } from './chatState';
import { RateNotice } from './MatchChatBox';

/** Enter on the page itself, not on a control, goes to the chat input. */
function useEnterToChat(wrap: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const onDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || event.isComposing || event.repeat) return;
      const target = event.target as Element | null;
      if (target?.closest?.('button, input, textarea, select, a[href], dialog, [role="switch"], [role="tab"]')) return;
      const input = wrap.current?.querySelector('input');
      if (input === null || input === undefined) return;
      event.preventDefault();
      input.focus();
    };
    window.addEventListener('keydown', onDown);
    return () => window.removeEventListener('keydown', onDown);
  }, [wrap]);
}

/** The room's chat under the seats: everyone in the room, one channel, newest line at the bottom. */
export function LobbyChat({ feed }: { readonly feed: ChatFeed }) {
  const state = useSyncExternalStore(feed.subscribe, feed.getSnapshot);
  const [draft, setDraft] = useState('');
  const wrap = useRef<HTMLElement>(null);
  useEnterToChat(wrap);
  const send = (): void => {
    feed.send('all', draft);
    setDraft('');
  };
  const cancel = (): void => {
    if (draft === '') (document.activeElement as HTMLElement | null)?.blur();
    setDraft('');
  };
  return (
    <section ref={wrap} className="chat chat-lobby" aria-label="Room chat">
      <ChatLog entries={state.entries} show={CHAT_KEPT} fade={false} className="chat-log chat-log-lobby" />
      <RateNotice limitedAt={state.limitedAt} />
      <ChatComposer
        channel="all"
        canSwitch={false}
        team={null}
        draft={draft}
        placeholder="Say something to the room"
        onDraft={setDraft}
        onSend={send}
        onCancel={cancel}
        onSwitch={() => {}}
        focusOnMount={false}
      />
    </section>
  );
}
