import { describe, expect, it } from 'vitest';
import { distance } from '../geometry';
import { VISION, viewFor } from '../index';
import type { GameEvent, GameState, GrappleId, HookId, TeamView } from '../index';
import { at, fogMatch, grappleOf, hookOf, pid, withPlayer } from './helpers';

const R = VISION.radius;
const W = at(400, 600);
const FAR = at(1900, 777);

/** `w` at W, `e` far out of its sight at FAR, both carrying gold and a walk in progress. */
function hidden(fog = true): GameState {
  const s = fogMatch(undefined, fog);
  return withPlayer(withPlayer(s, 'w', { pos: W }), 'e', { pos: FAR, gold: 999, move: { kind: 'toward', target: at(2100, 900) } });
}

const mentions = (view: TeamView, p: { x: number; y: number }): boolean => {
  const text = JSON.stringify(view);
  return text.includes(String(p.x)) && text.includes(String(p.y));
};

describe('viewFor', () => {
  it('hands over the whole match under open vision', () => {
    const s = hidden(false);
    const view = viewFor(s, 'west');
    expect(view.players.map((p) => p.id)).toEqual(['w', 'e']);
    expect(view.players[1]?.pos).toEqual(FAR);
    expect(view.roster.find((c) => c.id === 'e')?.gold).toBe(999);
    expect(view.players[1]?.move).toEqual(s.players[1]?.move);
  });

  it('leaves a hidden enemy out entirely, position and all', () => {
    const view = viewFor(hidden(), 'west');
    expect(view.players.map((p) => p.id)).toEqual(['w']);
    expect(mentions(view, FAR)).toBe(false);
    expect(view).not.toHaveProperty('nextHookSeq');
  });

  it('keeps every fighter on the roster, with an enemy purse hidden and its own shown', () => {
    const view = viewFor(hidden(), 'west');
    expect(view.roster.map((c) => [c.id, c.gold])).toEqual([
      ['w', 150],
      ['e', null],
    ]);
  });

  it('shows a seen enemy without its gold or where it is walking to', () => {
    const s = withPlayer(hidden(), 'e', { pos: at(900, 600) });
    const enemy = viewFor(s, 'west').players.find((p) => p.id === 'e');
    expect(enemy).toBeDefined();
    expect(enemy).not.toHaveProperty('gold');
    expect(enemy?.move.kind).toBe('steer');
    expect(JSON.stringify(enemy)).not.toContain('2100');
  });

  it('starts a hidden thrower’s chain at the edge of sight, never at the thrower', () => {
    const head = at(400 + R - 100, 600);
    const s = { ...hidden(), hooks: [hookOf('e', head, { path: [FAR, at(1500, 650)] })] };
    const [hook] = viewFor(s, 'west').hooks;
    const start = hook?.path[0];
    expect(start).toBeDefined();
    expect(distance(start!, W)).toBeCloseTo(R, 0);
    expect(mentions(viewFor(s, 'west'), FAR)).toBe(false);
  });

  it('cuts a returning hidden hook’s chain at the edge too', () => {
    const head = at(400 + R - 100, 600);
    const s = { ...hidden(), hooks: [hookOf('e', head, { phase: { kind: 'retracting', cargo: null } })] };
    const [hook] = viewFor(s, 'west').hooks;
    expect(hook?.path).toHaveLength(1);
    expect(distance(hook!.path[0]!, W)).toBeCloseTo(R, 0);
  });

  it('runs a seen thrower’s chain from where the thrower stands now', () => {
    const s = withPlayer(hidden(), 'e', { pos: at(1000, 600) });
    const withHook = { ...s, hooks: [hookOf('e', at(700, 600), { path: [FAR] })] };
    expect(viewFor(withHook, 'west').hooks[0]?.path).toEqual([at(1000, 600)]);
  });

  it('leaves out an enemy hook whose head is out of sight', () => {
    const s = { ...hidden(), hooks: [hookOf('e', at(1600, 600))] };
    expect(viewFor(s, 'west').hooks).toEqual([]);
  });

  it('runs a hidden grappler’s rope from the edge of sight', () => {
    const s = { ...hidden(), grapples: [grappleOf('e', at(400 + R - 100, 600))] };
    const [g] = viewFor(s, 'west').grapples;
    expect(g?.ropeFrom).not.toBeNull();
    expect(distance(g!.ropeFrom!, W)).toBeCloseTo(R, 0);
    expect(viewFor({ ...hidden(), grapples: [grappleOf('w', at(500, 600))] }, 'west').grapples[0]?.ropeFrom).toBeNull();
  });
});

describe('viewFor events', () => {
  const NEAR = at(700, 600);
  /** `e` hidden at FAR; `n` an enemy in sight at NEAR. */
  function scene(events: readonly GameEvent[]): GameState {
    const s = fogMatch([['w', 'west'], ['e', 'east'], ['n', 'east']]);
    const placed = withPlayer(withPlayer(withPlayer(s, 'w', { pos: W }), 'e', { pos: FAR }), 'n', { pos: NEAR });
    return { ...placed, events };
  }
  const h = 'h' as HookId;
  const g = 'g' as GrappleId;
  const cases: readonly [string, GameEvent, boolean][] = [
    ['hookCast by a hidden enemy', { kind: 'hookCast', hookId: h, ownerId: pid('e') }, false],
    ['hookCast by a seen enemy', { kind: 'hookCast', hookId: h, ownerId: pid('n') }, true],
    ['hookBounce out of sight', { kind: 'hookBounce', hookId: h, at: FAR }, false],
    ['hookBounce in sight', { kind: 'hookBounce', hookId: h, at: NEAR }, true],
    ['hookHit between hidden enemies', { kind: 'hookHit', hookId: h, ownerId: pid('e'), targetId: pid('e'), damage: 0, ally: true, at: FAR }, false],
    ['hookHit on us from the dark', { kind: 'hookHit', hookId: h, ownerId: pid('e'), targetId: pid('w'), damage: 9, ally: false, at: W }, true],
    ['melee out of sight', { kind: 'melee', attackerId: pid('e'), targetId: pid('e'), damage: 9, at: FAR }, false],
    ['melee in sight', { kind: 'melee', attackerId: pid('n'), targetId: pid('w'), damage: 9, at: W }, true],
    ['purchase by an enemy, even a seen one', { kind: 'purchase', playerId: pid('n'), purchase: { kind: 'item', id: 'barb' }, cost: 450 }, false],
    ['purchase by us', { kind: 'purchase', playerId: pid('w'), purchase: { kind: 'item', id: 'barb' }, cost: 450 }, true],
    ['grappleCast by a hidden enemy', { kind: 'grappleCast', grappleId: g, ownerId: pid('e') }, false],
    ['grappleCast by a seen enemy', { kind: 'grappleCast', grappleId: g, ownerId: pid('n') }, true],
    ['grappleLand out of sight', { kind: 'grappleLand', grappleId: g, at: FAR }, false],
    ['grappleLand in sight', { kind: 'grappleLand', grappleId: g, at: NEAR }, true],
    ['grappleArrive of a hidden enemy', { kind: 'grappleArrive', playerId: pid('e'), at: FAR }, false],
    ['grappleArrive of a seen enemy', { kind: 'grappleArrive', playerId: pid('n'), at: NEAR }, true],
    ['respawn of a hidden enemy', { kind: 'respawn', playerId: pid('e') }, false],
    ['respawn of ours', { kind: 'respawn', playerId: pid('w') }, true],
    ['matchEnd', { kind: 'matchEnd', winner: 'east' }, true],
  ];
  it.each(cases)('%s reaches the view: %s', (_, event, kept) => {
    expect(viewFor(scene([event]), 'west').events).toEqual(kept ? [event] : []);
  });

  it('keeps every kill for the feed, but not where a hidden one happened', () => {
    const hiddenKill: GameEvent = { kind: 'kill', killerId: pid('n'), victimId: pid('e'), assistIds: [], at: FAR };
    const seenKill: GameEvent = { kind: 'kill', killerId: pid('e'), victimId: pid('w'), assistIds: [], at: W };
    const dead = withPlayer(scene([hiddenKill, seenKill]), 'e', { status: { kind: 'dead', respawnAt: 9 } });
    expect(viewFor(dead, 'west').events).toEqual([{ ...hiddenKill, at: null }, seenKill]);
  });

  it('passes every event through under open vision', () => {
    const event: GameEvent = { kind: 'melee', attackerId: pid('e'), targetId: pid('e'), damage: 9, at: FAR };
    const s = { ...scene([event]), vision: { kind: 'open' } as const };
    expect(viewFor(s, 'west').events).toEqual([event]);
  });
});
