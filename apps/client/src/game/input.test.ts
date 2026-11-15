import type { PlayerInput, Purchase, Vec2 } from '@hookwars/sim';
import { beforeEach, describe, expect, it } from 'vitest';
import { HUMAN } from './fakeSim';
import { bindInput, type InputDeps } from './input';

type KeyInit = { readonly code: string; readonly repeat?: boolean; readonly metaKey?: boolean; readonly ctrlKey?: boolean };

function keyEvent(type: 'keydown' | 'keyup', init: KeyInit): Event {
  return Object.assign(new Event(type, { cancelable: true }), {
    key: '',
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    ...init,
  });
}

function pointerEvent(type: 'pointerdown' | 'pointermove', button: number, at: Vec2): Event {
  return Object.assign(new Event(type, { cancelable: true }), { button, clientX: at.x, clientY: at.y });
}

const CANVAS_ORIGIN = { x: 10, y: 20 };
const FALLBACK = { x: 999, y: 0 };

function harness() {
  const steers: Vec2[] = [];
  const sent: PlayerInput[] = [];
  const bought: Purchase[] = [];
  const flags = { enabled: true, visibility: 'visible' as DocumentVisibilityState };
  const canvas = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({ left: CANVAS_ORIGIN.x, top: CANVAS_ORIGIN.y }),
  });
  const win = new EventTarget();
  const doc = Object.defineProperty(new EventTarget(), 'visibilityState', { get: () => flags.visibility }) as EventTarget & {
    readonly visibilityState: DocumentVisibilityState;
  };
  const deps: InputDeps = {
    target: canvas,
    window: win,
    document: doc,
    playerId: HUMAN,
    toWorld: (p) => ({ x: p.x * 10, y: p.y * 10 }),
    fallbackAim: () => FALLBACK,
    enabled: () => flags.enabled,
    send: (input) => sent.push(input),
    buy: (purchase) => bought.push(purchase),
    steer: (dir) => steers.push(dir),
  };
  const { unbind, releaseAll } = bindInput(deps);
  const down = (init: KeyInit) => {
    const e = keyEvent('keydown', init);
    win.dispatchEvent(e);
    return e;
  };
  const up = (code: string) => win.dispatchEvent(keyEvent('keyup', { code }));
  return { steers, sent, bought, flags, canvas, win, doc, unbind, releaseAll, down, up, last: () => steers.at(-1) };
}

let h: ReturnType<typeof harness>;
beforeEach(() => {
  h = harness();
});

describe('steering keys', () => {
  it('steers on every change of the held keys', () => {
    h.down({ code: 'KeyW' });
    h.down({ code: 'KeyD' });
    h.up('KeyW');
    h.up('KeyD');
    expect(h.steers).toEqual([{ x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 0 }]);
  });

  it('prevents the browser default for handled keys, including repeats it otherwise ignores', () => {
    expect(h.down({ code: 'ArrowUp' }).defaultPrevented).toBe(true);
    expect(h.down({ code: 'ArrowUp', repeat: true }).defaultPrevented).toBe(true);
    expect(h.steers).toHaveLength(1);
    expect(h.down({ code: 'KeyR' }).defaultPrevented).toBe(false);
  });

  it('ignores keys pressed with ctrl or alt', () => {
    expect(h.down({ code: 'KeyW', ctrlKey: true }).defaultPrevented).toBe(false);
    expect(h.steers).toEqual([]);
  });
});

describe('hook', () => {
  it('throws at the last cursor position over the canvas on Space', () => {
    h.canvas.dispatchEvent(pointerEvent('pointermove', -1, { x: 30, y: 40 }));
    h.down({ code: 'Space' });
    expect(h.sent).toEqual([{ kind: 'hook', playerId: HUMAN, target: { x: 200, y: 200 } }]);
  });

  it('throws along the facing when the cursor has never moved', () => {
    h.down({ code: 'KeyQ' });
    expect(h.sent).toEqual([{ kind: 'hook', playerId: HUMAN, target: FALLBACK }]);
  });

  it('throws on a left click at the click point, and nothing else clicks', () => {
    h.canvas.dispatchEvent(pointerEvent('pointerdown', 2, { x: 30, y: 40 }));
    expect(h.sent).toEqual([]);
    const click = pointerEvent('pointerdown', 0, { x: 15, y: 25 });
    h.canvas.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(h.sent).toEqual([{ kind: 'hook', playerId: HUMAN, target: { x: 50, y: 50 } }]);
  });

  it('keeps the context menu off the canvas', () => {
    const menu = new Event('contextmenu', { cancelable: true });
    h.canvas.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });
});

describe('grapple', () => {
  it('grapples at the cursor on E, or along the facing before the cursor has moved', () => {
    h.down({ code: 'KeyE' });
    h.canvas.dispatchEvent(pointerEvent('pointermove', -1, { x: 30, y: 40 }));
    const e = h.down({ code: 'KeyE' });
    expect(e.defaultPrevented).toBe(true);
    expect(h.sent).toEqual([
      { kind: 'grapple', playerId: HUMAN, target: FALLBACK },
      { kind: 'grapple', playerId: HUMAN, target: { x: 200, y: 200 } },
    ]);
  });
});

describe('buy keys', () => {
  it('buys the numbered slot once per press, ignoring auto-repeat', () => {
    expect(h.down({ code: 'Digit2' }).defaultPrevented).toBe(true);
    expect(h.down({ code: 'Digit2', repeat: true }).defaultPrevented).toBe(true);
    h.down({ code: 'Digit5' });
    expect(h.bought).toEqual([
      { kind: 'upgrade', id: 'range' },
      { kind: 'item', id: 'grapple' },
    ]);
    expect(h.sent).toEqual([]);
  });

  it('ignores digits with a modifier, so browser tab shortcuts still work', () => {
    expect(h.down({ code: 'Digit1', ctrlKey: true }).defaultPrevented).toBe(false);
    h.down({ code: 'Digit1', metaKey: true });
    expect(h.bought).toEqual([]);
  });
});

describe('while disabled', () => {
  it('leaves keydown alone so the dialog keeps its keys, but still releases on keyup', () => {
    h.down({ code: 'KeyW' });
    h.flags.enabled = false;
    const space = h.down({ code: 'Space' });
    const d = h.down({ code: 'KeyD' });
    const digit = h.down({ code: 'Digit1' });
    const grapple = h.down({ code: 'KeyE' });
    expect(space.defaultPrevented || d.defaultPrevented || digit.defaultPrevented || grapple.defaultPrevented).toBe(false);
    expect(h.sent).toEqual([]);
    expect(h.bought).toEqual([]);
    h.up('KeyW');
    expect(h.steers).toEqual([{ x: 0, y: -1 }, { x: 0, y: 0 }]);
  });
});

describe('stuck keys', () => {
  it('releases everything when the window loses focus', () => {
    h.down({ code: 'KeyW' });
    h.win.dispatchEvent(new Event('blur'));
    expect(h.last()).toEqual({ x: 0, y: 0 });
    h.down({ code: 'KeyD' });
    expect(h.last()).toEqual({ x: 1, y: 0 });
  });

  it('releases everything when the page is hidden, not when it is shown', () => {
    h.down({ code: 'KeyW' });
    h.doc.dispatchEvent(new Event('visibilitychange'));
    expect(h.last()).toEqual({ x: 0, y: -1 });
    h.flags.visibility = 'hidden';
    h.doc.dispatchEvent(new Event('visibilitychange'));
    expect(h.last()).toEqual({ x: 0, y: 0 });
  });

  it('releases everything on a Cmd chord, since macOS swallows the keyups behind it', () => {
    h.down({ code: 'KeyW' });
    h.down({ code: 'Tab', metaKey: true });
    expect(h.last()).toEqual({ x: 0, y: 0 });
  });

  it('lets go at once when the chat takes the keyboard, and then no game key acts and nothing is prevented', () => {
    h.down({ code: 'KeyW' });
    h.releaseAll();
    h.flags.enabled = false;
    expect(h.last()).toEqual({ x: 0, y: 0 });
    const typed = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyE', 'KeyQ', 'Digit1', 'ArrowUp'].map((code) => h.down({ code }));
    h.canvas.dispatchEvent(pointerEvent('pointerdown', 0, { x: 15, y: 25 }));
    expect(h.last()).toEqual({ x: 0, y: 0 });
    expect(h.sent).toEqual([]);
    expect(h.bought).toEqual([]);
    expect(typed.some((e) => e.defaultPrevented)).toBe(false);
  });

  it('stops listening once unbound', () => {
    h.unbind();
    h.down({ code: 'KeyW' });
    h.canvas.dispatchEvent(pointerEvent('pointerdown', 0, { x: 15, y: 25 }));
    expect(h.steers).toEqual([]);
    expect(h.sent).toEqual([]);
  });
});
