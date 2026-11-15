import type { ChatChannel } from '@hookwars/protocol';
import { createStore, type Store } from '../app/store';
import type { ChannelMemory } from './channelMemory';
import type { ChatFeed } from './chatFeed';
import { otherChannel } from './chatState';

/** The chat input of one match: whether it is open, the channel it sends on, and what has been typed. */
export type ChatUi = { readonly open: boolean; readonly channel: ChatChannel; readonly draft: string };

export type MatchChat = {
  readonly feed: ChatFeed;
  readonly ui: Pick<Store<ChatUi>, 'subscribe' | 'getSnapshot'>;
  isOpen(): boolean;
  open(): void;
  /** Sends the draft, if anything is left of it once cleaned, and closes. */
  send(): void;
  /** Escape: the draft is thrown away. */
  cancel(): void;
  /** Focus went elsewhere, as when the player clicks the playfield: closed, with the draft kept for next time. */
  dismiss(): void;
  setDraft(draft: string): void;
  switchChannel(): void;
};

export type MatchChatDeps = {
  readonly feed: ChatFeed;
  readonly memory: ChannelMemory;
  /** Lets go of every held direction: the fighter stands still while its player types. */
  readonly release: () => void;
  readonly focusGame: () => void;
};

export function createMatchChat({ feed, memory, release, focusGame }: MatchChatDeps): MatchChat {
  const ui = createStore<ChatUi>({ open: false, channel: memory.load(), draft: '' });
  const close = (draft: string): void => ui.update((u) => ({ ...u, open: false, draft }));
  return {
    feed,
    ui,
    isOpen: () => ui.getSnapshot().open,
    open() {
      release();
      ui.update((u) => (u.open ? u : { ...u, open: true }));
    },
    send() {
      const { channel, draft } = ui.getSnapshot();
      feed.send(channel, draft);
      if (draft.trim() !== '') memory.save(channel);
      close('');
      focusGame();
    },
    cancel() {
      close('');
      focusGame();
    },
    dismiss: () => close(ui.getSnapshot().draft),
    setDraft: (draft) => ui.update((u) => (u.draft === draft ? u : { ...u, draft })),
    switchChannel: () => ui.update((u) => ({ ...u, channel: otherChannel(u.channel) })),
  };
}

export type ChatKeyDeps = {
  readonly window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  /** Whether Enter may open the chat now: the fight is on screen and nothing else has the keys. */
  readonly canOpen: () => boolean;
  readonly open: () => void;
};

/** Enter on a button, a field or a link is theirs; Enter anywhere else in a match opens the chat. */
function onControl(target: EventTarget | null): boolean {
  const closest = (target as Partial<Element> | null)?.closest?.bind(target);
  return closest !== undefined && closest('button, input, textarea, select, a[href], [contenteditable="true"], dialog') !== null;
}

/**
 * Bind this before the establishing shot's skip key: listeners run in the order they were added, so the Enter that
 * skips the shot is seen here while the shot is still on and cannot also open the chat.
 */
export function bindChatKey({ window: win, canOpen, open }: ChatKeyDeps): () => void {
  const onDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (onControl(event.target) || !canOpen()) return;
    event.preventDefault();
    open();
  };
  win.addEventListener('keydown', onDown);
  return () => win.removeEventListener('keydown', onDown);
}
