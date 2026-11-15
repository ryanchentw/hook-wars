import type { ChatChannel } from '@hookwars/protocol';

const KEY = 'hookwars.chatChannel';

/** The channel last sent on, kept for the next match. Storage can be blocked; then every match starts on All. */
export type ChannelMemory = { load(): ChatChannel; save(channel: ChatChannel): void };

export function createChannelMemory(storage: () => Storage): ChannelMemory {
  return {
    load() {
      try {
        return storage().getItem(KEY) === 'team' ? 'team' : 'all';
      } catch {
        return 'all';
      }
    },
    save(channel) {
      try {
        storage().setItem(KEY, channel);
      } catch {
        // Remembered for this match only.
      }
    },
  };
}
