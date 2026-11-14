import { describe, expect, it } from 'vitest';
import { BOT, fakePlayer, HUMAN } from '../../game/fakeSim';
import type { PlayerFrame } from '../interpolate';
import { trackPresence } from './presence';

const at = (id: typeof HUMAN, x: number): PlayerFrame => ({ player: fakePlayer({ id }), pos: { x, y: 0 }, presence: 1 });
const presences = (players: readonly PlayerFrame[]) => players.map((pf) => [pf.player.id, Number(pf.presence.toFixed(2))]);

describe('trackPresence', () => {
  it('shows the first frame as it is', () => {
    expect(presences(trackPresence(null, [at(HUMAN, 0), at(BOT, 5)], 0, 0.2).players)).toEqual([
      [HUMAN, 1],
      [BOT, 1],
    ]);
  });

  it('fades a newcomer in over the fade time', () => {
    const first = trackPresence(null, [at(HUMAN, 0)], 0, 0.2);
    const next = trackPresence(first.track, [at(HUMAN, 0), at(BOT, 5)], 0.05, 0.2);
    expect(presences(next.players)).toEqual([
      [HUMAN, 1],
      [BOT, 0.25],
    ]);
  });

  it('keeps one who left where they were last seen, fading out, then drops them', () => {
    let p = trackPresence(null, [at(HUMAN, 0), at(BOT, 5)], 0, 0.2);
    p = trackPresence(p.track, [at(HUMAN, 1)], 0.1, 0.2);
    expect(presences(p.players)).toEqual([
      [HUMAN, 1],
      [BOT, 0.5],
    ]);
    expect(p.players[1]?.pos).toEqual({ x: 5, y: 0 });
    p = trackPresence(p.track, [at(HUMAN, 1)], 0.1, 0.2);
    expect(p.players.map((pf) => pf.player.id)).toEqual([HUMAN]);
  });

  it('switches at once when asked for no fade', () => {
    const first = trackPresence(null, [at(HUMAN, 0), at(BOT, 5)], 0, 0);
    expect(trackPresence(first.track, [at(HUMAN, 0)], 0.016, 0).players).toHaveLength(1);
  });
});
