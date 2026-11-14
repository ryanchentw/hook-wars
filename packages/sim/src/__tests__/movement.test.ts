import { describe, expect, it } from 'vitest';
import { step, TUNING } from '../index';
import type { HookId } from '../index';
import { at, match, pid, player, run, withPlayer } from './helpers';

const duel = () =>
  match([
    ['w', 'west'],
    ['e', 'east'],
  ]);
const r = TUNING.playerRadius;

describe('movement', () => {
  it('walks to the target at moveSpeed, then stops and clears the target', () => {
    const start = duel();
    const move = [{ kind: 'move', playerId: pid('w'), target: at(620, 675) }] as const;
    const halfway = run(start, 10, move).state;
    expect(player(halfway, 'w').pos.x).toBeCloseTo(420 + TUNING.moveSpeed * (10 / 30), 6);
    expect(player(halfway, 'w').facing).toBeCloseTo(0, 9);

    const arrived = run(start, 25, move).state;
    expect(player(arrived, 'w').pos).toEqual(at(620, 675));
    expect(player(arrived, 'w').moveTarget).toBeNull();
  });

  it('faces the direction it walks', () => {
    const s = step(duel(), [{ kind: 'move', playerId: pid('w'), target: at(420, 100) }], 1 / 30);
    expect(player(s, 'w').facing).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('clamps a target in the canal or outside the arena to the walkable dock', () => {
    const s = step(
      duel(),
      [
        { kind: 'move', playerId: pid('w'), target: at(1200, 500) },
        { kind: 'move', playerId: pid('e'), target: at(3000, -50) },
      ],
      1 / 30,
    );
    expect(player(s, 'w').moveTarget).toEqual(at(1000 - r, 500));
    expect(player(s, 'e').moveTarget).toEqual(at(2400 - r, r));

    const walked = run(s, 200).state;
    expect(player(walked, 'w').pos).toEqual(at(1000 - r, 500));
  });

  it('a player dragged onto the enemy dock walks on that dock', () => {
    const s = withPlayer(duel(), 'e', { pos: at(600, 300) });
    const next = step(s, [{ kind: 'move', playerId: pid('e'), target: at(2000, 300) }], 1 / 30);
    expect(player(next, 'e').moveTarget).toEqual(at(1000 - r, 300));
  });

  it('stop clears the move target', () => {
    const moving = step(duel(), [{ kind: 'move', playerId: pid('w'), target: at(800, 675) }], 1 / 30);
    const stopped = step(moving, [{ kind: 'stop', playerId: pid('w') }], 1 / 30);
    expect(player(stopped, 'w').moveTarget).toBeNull();
    expect(player(run(stopped, 5).state, 'w').pos).toEqual(player(stopped, 'w').pos);
  });

  it('dead and dragged players ignore every input', () => {
    const base = withPlayer(
      withPlayer(duel(), 'w', { status: { kind: 'dead', respawnAt: 99 } }),
      'e',
      { status: { kind: 'dragged', hookId: 'h-gone' as HookId } },
    );
    const s = step(
      base,
      [
        { kind: 'move', playerId: pid('w'), target: at(600, 600) },
        { kind: 'hook', playerId: pid('w'), target: at(1900, 600) },
        { kind: 'move', playerId: pid('e'), target: at(1600, 600) },
        { kind: 'hook', playerId: pid('e'), target: at(600, 600) },
      ],
      1 / 30,
    );
    expect(player(s, 'w').moveTarget).toBeNull();
    expect(player(s, 'e').moveTarget).toBeNull();
    expect(s.hooks).toEqual([]);
    expect(s.events).toEqual([]);
  });

  it('ignores inputs for unknown players', () => {
    const s = step(duel(), [{ kind: 'move', playerId: pid('ghost'), target: at(1, 1) }], 1 / 30);
    expect(s.players).toEqual(duel().players);
  });
});
