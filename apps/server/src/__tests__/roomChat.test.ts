import type { MemberId } from '@hookwars/room';
import type { PlayerId } from '@hookwars/sim';
import { describe, expect, it } from 'vitest';
import { harness, started } from './roomHarness';

const linesTo = (h: ReturnType<typeof harness>, member: MemberId) => h.sentTo(member, 'chat').map((m) => m.line);

/** Two a side: Ada and Cy in the west, Bo and Di in the east. */
function teams(fog = false) {
  const h = harness();
  const [ada, bo, cy, di] = ['Ada', 'Bo', 'Cy', 'Di'].map((name) => h.join(name)) as [MemberId, MemberId, MemberId, MemberId];
  if (fog !== h.room.lobby.settings.fog) h.act(ada, { kind: 'setFog', fog });
  return { h, ada, bo, cy, di };
}

describe('who hears a line', () => {
  it('sends an All line to everyone in the room, the speaker too, stamped with who said it', () => {
    const { h, ada, bo, cy, di } = teams();
    h.say(bo, 'all', 'gg');
    [ada, bo, cy, di].forEach((m) => expect(linesTo(h, m)).toEqual([{ seq: 1, from: bo, name: 'Bo', team: 'east', fighter: null, channel: 'all', text: 'gg' }]));
  });

  it('sends a Team line to the speaker and their side only: the other side is sent nothing at all', () => {
    const { h, ada, bo, cy, di } = teams();
    h.say(ada, 'team', 'push top');
    expect(linesTo(h, ada).map((l) => l.text)).toEqual(['push top']);
    expect(linesTo(h, cy).map((l) => l.text)).toEqual(['push top']);
    expect(h.sentTo(bo, 'chat')).toEqual([]);
    expect(h.sentTo(di, 'chat')).toEqual([]);
  });

  it('keeps Team lines to the side under fog in a match, and names the fighter that spoke', () => {
    const { h, ada, bo } = teams(true);
    h.act(ada, { kind: 'startMatch' });
    h.run(h.rules.countdownMs + 1);
    h.say(bo, 'team', 'they are bot side');
    h.say(bo, 'all', '來啊');
    expect(linesTo(h, ada).map((l) => l.text)).toEqual(['來啊']);
    expect(linesTo(h, bo).map((l) => [l.text, l.fighter])).toEqual([
      ['they are bot side', 'east-0'],
      ['來啊', 'east-0'],
    ]);
  });

  it('says nothing for a member who is not in the room, or whose connection is down', () => {
    const { h, ada, bo } = teams();
    h.disconnect(bo);
    h.say(bo, 'all', 'ghost');
    h.say('m99' as MemberId, 'all', 'stranger');
    expect(h.sentTo(ada, 'chat')).toEqual([]);
  });
});

describe('what a line may hold', () => {
  it('trims, collapses whitespace and strips what hides or reorders text', () => {
    const { h, ada } = teams();
    h.say(ada, 'all', '  ‮ha\u0000  ha​  ');
    expect(linesTo(h, ada)[0]?.text).toBe('ha ha');
  });

  it('drops a line that is empty once cleaned, or longer than sixty characters', () => {
    const { h, ada } = teams();
    h.say(ada, 'all', ' ‍‮\t ');
    h.say(ada, 'all', '你'.repeat(61));
    expect(h.sentTo(ada, 'chat')).toEqual([]);
    h.say(ada, 'all', '你'.repeat(60));
    expect(linesTo(h, ada)[0]?.seq).toBe(1);
  });

  it('keeps markup as plain characters', () => {
    const { h, ada } = teams();
    h.say(ada, 'all', '<script>alert(1)</script>');
    expect(linesTo(h, ada)[0]?.text).toBe('<script>alert(1)</script>');
  });
});

describe('coming back', () => {
  it('gives a returning member the recent lines they would have been sent, and nobody new any', () => {
    const { h, ada, bo } = teams();
    const token = h.tokenOf(ada);
    h.say(bo, 'team', 'east only');
    h.say(bo, 'all', 'hello all');
    h.disconnect(ada);
    h.say(bo, 'all', 'while you were out');
    h.rejoin(token);
    expect(h.last(ada, 'welcome').chat.map((l) => l.text)).toEqual(['hello all', 'while you were out']);
    h.join('Ed');
    const ed = h.room.members.at(-1)!.id;
    expect(h.last(ed, 'welcome').chat).toEqual([]);
  });

  it('keeps no more than the last eight lines', () => {
    const { h, ada, bo } = teams();
    for (let i = 1; i <= 12; i += 1) h.say(bo, 'all', `line ${i}`);
    expect(h.room.chat.map((l) => l.text)).toEqual(Array.from({ length: 8 }, (_, i) => `line ${i + 5}`));
    expect(h.room.chat.every((l) => l.from === bo)).toBe(true);
    expect(ada).toBeDefined();
  });
});

describe('a stand-in bot', () => {
  it('never speaks for the member it stands in for: nothing is said while they are away', () => {
    const { h, west, east } = started();
    h.disconnect(east);
    h.forget();
    h.run(2000);
    expect(h.sentTo(west, 'chat')).toEqual([]);
    expect(h.room.match?.fighters.find((f) => f.id === ('east-0' as PlayerId))?.drivenBy).toBe('bot');
  });
});
