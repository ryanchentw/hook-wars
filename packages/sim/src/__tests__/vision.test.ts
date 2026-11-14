import { describe, expect, it } from 'vitest';
import { VISION, visibleTo } from '../index';
import type { GameState, GrappleId, HookId, PlayerStatus, TeamId } from '../index';
import { at, fogMatch, grappleOf, hookOf, pid, withPlayer } from './helpers';

const R = VISION.radius;

/** Puts `w` at the origin of the test's line and `e` `gap` sim units east of it. */
function apart(gap: number, state = fogMatch()): GameState {
  return withPlayer(withPlayer(state, 'w', { pos: at(400, 600) }), 'e', { pos: at(400 + gap, 600) });
}

const sees = (state: GameState, team: TeamId, id: string): boolean => visibleTo(state, team).players.has(pid(id));

describe('visibleTo', () => {
  it('sees everything under open vision', () => {
    const s = apart(1800, fogMatch(undefined, false));
    expect(sees(s, 'west', 'e')).toBe(true);
    expect(sees(s, 'east', 'w')).toBe(true);
  });

  it('sees an enemy exactly at the radius and not one unit past it', () => {
    expect(sees(apart(R), 'west', 'e')).toBe(true);
    expect(sees(apart(R + 1), 'west', 'e')).toBe(false);
    expect(sees(apart(R + 1), 'east', 'w')).toBe(false);
  });

  it('always sees its own team, however far', () => {
    const s = withPlayer(fogMatch([['w', 'west'], ['w2', 'west'], ['e', 'east']]), 'w2', { pos: at(2300, 1300) });
    expect(sees(s, 'west', 'w2')).toBe(true);
  });

  it('shares vision across the team', () => {
    const roster = [['w', 'west'], ['w2', 'west'], ['e', 'east']] as const;
    const s = withPlayer(apart(R + 500, fogMatch(roster)), 'w2', { pos: at(400 + R + 500 - 100, 600) });
    expect(sees(s, 'west', 'e')).toBe(true);
  });

  const viewerStatuses: readonly [string, PlayerStatus, boolean][] = [
    ['alive', { kind: 'alive' }, true],
    ['dragged', { kind: 'dragged', hookId: 'x' as HookId }, true],
    ['grappling', { kind: 'grappling', grappleId: 'x' as GrappleId }, true],
    ['staggered', { kind: 'staggered', until: 9 }, true],
    ['dead', { kind: 'dead', respawnAt: 9 }, false],
  ];
  it.each(viewerStatuses)('a %s fighter gives vision: %s', (_, status, gives) => {
    expect(sees(withPlayer(apart(300), 'w', { status }), 'west', 'e')).toBe(gives);
  });

  const enemyStatuses: readonly [string, PlayerStatus, boolean, boolean][] = [
    ['alive', { kind: 'alive' }, true, false],
    ['grappling', { kind: 'grappling', grappleId: 'x' as GrappleId }, true, false],
    ['staggered', { kind: 'staggered', until: 9 }, true, false],
    ['dead', { kind: 'dead', respawnAt: 9 }, true, false],
    ['dragged', { kind: 'dragged', hookId: 'x' as HookId }, true, true],
  ];
  it.each(enemyStatuses)('an enemy who is %s is seen inside the radius (%s) and outside it (%s)', (_, status, inside, outside) => {
    expect(sees(withPlayer(apart(300), 'e', { status }), 'west', 'e')).toBe(inside);
    expect(sees(withPlayer(apart(R + 200), 'e', { status }), 'west', 'e')).toBe(outside);
  });

  it('sees an enemy hook only while its head is inside vision, and its own hooks always', () => {
    const base = apart(1800);
    const near = { ...base, hooks: [hookOf('e', at(400 + R - 10, 600))] };
    const far = { ...base, hooks: [hookOf('e', at(400 + R + 10, 600))] };
    expect(visibleTo(near, 'west').hooks.has('e-hook' as HookId)).toBe(true);
    expect(visibleTo(far, 'west').hooks.has('e-hook' as HookId)).toBe(false);
    expect(visibleTo(far, 'east').hooks.has('e-hook' as HookId)).toBe(true);
  });

  it('sees a hook that carries someone, since the one it drags is seen by all', () => {
    const base = withPlayer(apart(1800), 'e', { status: { kind: 'dragged', hookId: 'e-hook' as HookId } });
    const hauling = { ...base, hooks: [hookOf('e', at(2200, 600), { phase: { kind: 'retracting', cargo: pid('e') } })] };
    expect(visibleTo(hauling, 'west').hooks.has('e-hook' as HookId)).toBe(true);
  });

  it('sees an enemy grapple only while its head is inside vision', () => {
    const base = apart(1800);
    const near = { ...base, grapples: [grappleOf('e', at(400 + R - 10, 600))] };
    const far = { ...base, grapples: [grappleOf('e', at(400 + R + 10, 600))] };
    expect(visibleTo(near, 'west').grapples.has('e-grapple' as GrappleId)).toBe(true);
    expect(visibleTo(far, 'west').grapples.has('e-grapple' as GrappleId)).toBe(false);
  });
});
