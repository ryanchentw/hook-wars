import { describe, expect, it } from 'vitest';
import { bindMatchKeys } from './matchKeys';

type Handler = (event: KeyboardEvent) => void;

function setup(allowed: { pause: boolean; tab: boolean }) {
  const handlers = new Map<string, Handler>();
  const win = {
    addEventListener: (type: string, fn: Handler) => handlers.set(type, fn),
    removeEventListener: (type: string) => handlers.delete(type),
  } as unknown as Window;
  const log: string[] = [];
  const unbind = bindMatchKeys({
    window: win,
    canPause: () => allowed.pause,
    pause: () => log.push('pause'),
    tabShowsScores: () => allowed.tab,
    showScores: (shown) => log.push(shown ? 'scores' : 'hide'),
  });
  const press = (type: string, key: string, repeat = false): boolean => {
    let prevented = false;
    handlers.get(type)?.({ key, repeat, preventDefault: () => (prevented = true) } as unknown as KeyboardEvent);
    return prevented;
  };
  return { log, press, handlers, unbind };
}

describe('match keys', () => {
  it('pauses on Escape when allowed, once per press', () => {
    const { log, press } = setup({ pause: true, tab: true });
    expect(press('keydown', 'Escape')).toBe(true);
    press('keydown', 'Escape', true);
    expect(log).toEqual(['pause']);
  });

  it('leaves Escape alone when the game does not have the keys', () => {
    const { log, press } = setup({ pause: false, tab: true });
    expect(press('keydown', 'Escape')).toBe(false);
    expect(log).toEqual([]);
  });

  it('holds the scoreboard open while Tab is down, keeping focus where it is', () => {
    const { log, press } = setup({ pause: true, tab: true });
    expect(press('keydown', 'Tab')).toBe(true);
    press('keyup', 'Tab');
    expect(log).toEqual(['scores', 'hide']);
  });

  it('lets Tab move focus when it is not the scoreboard key', () => {
    const { log, press } = setup({ pause: true, tab: false });
    expect(press('keydown', 'Tab')).toBe(false);
    expect(log).toEqual([]);
  });

  it('closes the scoreboard when the window loses focus, and unbinds', () => {
    const { log, handlers, unbind } = setup({ pause: true, tab: true });
    handlers.get('blur')?.({} as KeyboardEvent);
    expect(log).toEqual(['hide']);
    unbind();
    expect(handlers.size).toBe(0);
  });
});
