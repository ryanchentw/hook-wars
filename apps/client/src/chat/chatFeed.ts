import { chatTextFits, sanitizeChatText, type ChatChannel, type ChatLine } from '@hookwars/protocol';
import type { MemberId } from '@hookwars/room';
import { createStore, type Store } from '../app/store';
import { addLines, EMPTY_CHAT, type ChatState } from './chatState';

/** What the screens read and send through; the lobby and the match both take one. */
export type ChatFeed = Pick<Store<ChatState>, 'subscribe' | 'getSnapshot'> & {
  /** Cleans and measures the text as the server will, and sends it if anything is left. */
  send(channel: ChatChannel, text: string): void;
};

/** The feed with the side that hears from the server or the local session. */
export type ChatInbox = ChatFeed & {
  /** `live` is false for the history a rejoin brings back. */
  receive(lines: readonly ChatLine[], live: boolean): void;
  limited(): void;
  /** The member this client is, once the server has said: their own lines are theirs. */
  setSelf(self: MemberId): void;
};

export type InboxDeps = { readonly deliver: (channel: ChatChannel, text: string) => void; readonly now: () => number };

export function createChatInbox({ deliver, now }: InboxDeps): ChatInbox {
  const store = createStore<ChatState>(EMPTY_CHAT);
  let self: MemberId | null = null;
  return {
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
    send(channel, raw) {
      const text = sanitizeChatText(raw);
      if (text !== '' && chatTextFits(text)) deliver(channel, text);
    },
    receive(lines, live) {
      const at = now();
      store.update((s) => addLines(s, lines.map((line) => ({ line, at, own: line.from === self, live }))));
    },
    limited() {
      const at = now();
      store.update((s) => ({ ...s, limitedAt: at }));
    },
    setSelf(next) {
      self = next;
    },
  };
}

export type Speaker = Pick<ChatLine, 'from' | 'name' | 'team' | 'fighter'>;

/**
 * Chat in a match played on this machine: there is no one else to send to, so a line comes straight back as the server
 * would send it. Bots never speak, and the local player is alone on their side, so a Team line reaches only them.
 */
export function createLocalChat(speaker: () => Speaker, now: () => number): ChatFeed {
  let seq = 0;
  const inbox: ChatInbox = createChatInbox({
    deliver: (channel, text) => inbox.receive([{ ...speaker(), seq: (seq += 1), channel, text }], true),
    now,
  });
  inbox.setSelf(speaker().from);
  return inbox;
}
