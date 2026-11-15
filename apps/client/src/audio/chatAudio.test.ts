import type { ChatLine } from '@hookwars/protocol';
import { describe, expect, it } from 'vitest';
import { createChatInbox } from '../chat/chatFeed';
import { followChat } from './chatAudio';

const line = (seq: number, from: string): ChatLine => ({ seq, from: from as never, name: 'Bo' as never, team: 'east', fighter: null, channel: 'all', text: 'hi' });

describe('the sound of a line arriving', () => {
  it('plays for someone else\'s line, never for your own nor for a rejoin\'s history', () => {
    const inbox = createChatInbox({ deliver: () => {}, now: () => 0 });
    inbox.setSelf('m1' as never);
    let played = 0;
    followChat(inbox, () => (played += 1));
    inbox.receive([line(1, 'm1')], true);
    expect(played).toBe(0);
    inbox.receive([line(2, 'm2')], true);
    expect(played).toBe(1);
    inbox.receive([line(3, 'm2')], false);
    inbox.limited();
    expect(played).toBe(1);
  });
});
