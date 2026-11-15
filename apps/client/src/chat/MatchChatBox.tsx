import type { TeamId } from '@hookwars/sim';
import { useSyncExternalStore } from 'react';
import './chat.css';
import { CHANNEL_LABEL, ChatComposer } from './ChatComposer';
import { ChatLog, useNow } from './ChatLog';
import type { MatchChat } from './matchChat';

/** Lines on screen while playing, and while the input is open. */
const SHOWN = { closed: 5, open: 8 } as const;
const LIMIT_NOTICE_MS = 4000;

export function RateNotice({ limitedAt }: { readonly limitedAt: number | null }) {
  const now = useNow();
  const shown = limitedAt !== null && now - limitedAt < LIMIT_NOTICE_MS;
  return (
    <p className="chat-notice" role="status">
      {shown ? 'Too fast: that line was not sent.' : ''}
    </p>
  );
}

/** The chat in a match: the last few lines bottom-left, and the input when Enter has opened it. */
export function MatchChatBox({ chat, team }: { readonly chat: MatchChat; readonly team: TeamId }) {
  const ui = useSyncExternalStore(chat.ui.subscribe, chat.ui.getSnapshot);
  const state = useSyncExternalStore(chat.feed.subscribe, chat.feed.getSnapshot);
  return (
    <section className="chat chat-match" data-open={ui.open} aria-label="Chat">
      <ChatLog entries={state.entries} show={ui.open ? SHOWN.open : SHOWN.closed} fade={!ui.open} className="chat-log" />
      <RateNotice limitedAt={state.limitedAt} />
      {ui.open && (
        <ChatComposer
          channel={ui.channel}
          canSwitch
          team={team}
          draft={ui.draft}
          placeholder="Enter to send, Esc to cancel, Tab for channel"
          onDraft={chat.setDraft}
          onSend={chat.send}
          onCancel={chat.cancel}
          onSwitch={chat.switchChannel}
          onBlur={chat.dismiss}
          focusOnMount
        />
      )}
      <p className="hud-sr" aria-live="polite">
        {ui.open ? `Chat to ${CHANNEL_LABEL[ui.channel]}` : ''}
      </p>
    </section>
  );
}
