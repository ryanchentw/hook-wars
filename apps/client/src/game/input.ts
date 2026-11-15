import type { PlayerId, PlayerInput, Purchase, Vec2 } from '@hookwars/sim';
import { actionForKey, HOOK_POINTER_BUTTON, STILL, steerVector, type Direction, type KeyAction } from './bindings';

type Canvas = EventTarget & { getBoundingClientRect(): { readonly left: number; readonly top: number } };

export type InputDeps = {
  readonly target: Canvas;
  readonly window: EventTarget;
  readonly document: EventTarget & { readonly visibilityState: DocumentVisibilityState };
  readonly playerId: PlayerId;
  readonly toWorld: (screen: Vec2) => Vec2;
  /** World aim point for a hook or grapple cast before the cursor has been over the canvas, or null for none. */
  readonly fallbackAim: () => Vec2 | null;
  /** False while something else (the credits dialog) owns the keyboard. */
  readonly enabled: () => boolean;
  readonly send: (input: PlayerInput) => void;
  /** Separate from `send` so the HUD can confirm or refuse every press. */
  readonly buy: (purchase: Purchase) => void;
  readonly steer: (dir: Vec2) => void;
};

type Handlers = {
  readonly keydown: (e: KeyboardEvent) => void;
  readonly keyup: (e: KeyboardEvent) => void;
  readonly releaseAll: () => void;
  readonly visibility: () => void;
  readonly pointermove: (e: PointerEvent) => void;
  readonly pointerdown: (e: PointerEvent) => void;
  readonly contextmenu: (e: Event) => void;
};

function createHandlers(deps: InputDeps): Handlers {
  let held: ReadonlySet<Direction> = new Set();
  let cursor: Vec2 | null = null;

  const setHeld = (next: ReadonlySet<Direction>): void => {
    held = next;
    deps.steer(steerVector(held));
  };
  const releaseAll = (): void => {
    held = new Set();
    deps.steer(STILL);
  };
  const aimed = (kind: 'hook' | 'grapple'): void => {
    const target = cursor === null ? deps.fallbackAim() : deps.toWorld(cursor);
    if (target !== null) deps.send({ kind, playerId: deps.playerId, target });
  };
  const press = (action: KeyAction): void => {
    switch (action.kind) {
      case 'hook':
      case 'grapple':
        return aimed(action.kind);
      case 'buy':
        return deps.buy(action.purchase);
      case 'steer':
        if (!held.has(action.dir)) setHeld(new Set([...held, action.dir]));
    }
  };
  const localPoint = (e: MouseEvent): Vec2 => {
    const rect = deps.target.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  return {
    keydown(e) {
      // macOS sends no keyup for keys released while Cmd is down, so anything held now could stick.
      if (e.metaKey) return releaseAll();
      if (!deps.enabled() || e.ctrlKey || e.altKey) return;
      const action = actionForKey(e.code);
      if (action === null) return;
      e.preventDefault();
      if (!e.repeat) press(action);
    },
    keyup(e) {
      const action = actionForKey(e.code);
      if (action?.kind !== 'steer' || !held.has(action.dir)) return;
      setHeld(new Set([...held].filter((dir) => dir !== action.dir)));
    },
    releaseAll,
    visibility() {
      if (deps.document.visibilityState === 'hidden') releaseAll();
    },
    pointermove(e) {
      cursor = localPoint(e);
    },
    pointerdown(e) {
      if (e.button !== HOOK_POINTER_BUTTON || !deps.enabled()) return;
      e.preventDefault();
      cursor = localPoint(e);
      aimed('hook');
    },
    contextmenu: (e) => e.preventDefault(),
  };
}

type Listener = readonly [EventTarget, string, (e: never) => void];

export function bindInput(deps: InputDeps): () => void {
  const h = createHandlers(deps);
  const listeners: readonly Listener[] = [
    [deps.window, 'keydown', h.keydown],
    [deps.window, 'keyup', h.keyup],
    [deps.window, 'blur', h.releaseAll],
    [deps.document, 'visibilitychange', h.visibility],
    [deps.target, 'pointermove', h.pointermove],
    [deps.target, 'pointerdown', h.pointerdown],
    [deps.target, 'contextmenu', h.contextmenu],
  ];
  listeners.forEach(([target, type, fn]) => target.addEventListener(type, fn as EventListener));
  return () => listeners.forEach(([target, type, fn]) => target.removeEventListener(type, fn as EventListener));
}
