import type { PlayerId, PlayerInput, Vec2 } from '@hookbrawl/sim';

export type Command = 'move' | 'hook' | 'stop';

const LEFT_BUTTON = 0;
const RIGHT_BUTTON = 2;

export const POINTER_BINDINGS: Readonly<Record<number, Command>> = {
  [LEFT_BUTTON]: 'hook',
  [RIGHT_BUTTON]: 'move',
};

export const KEY_BINDINGS: Readonly<Record<string, Command>> = {
  q: 'hook',
  s: 'stop',
};

export function commandForPointer(button: number): Command | null {
  return POINTER_BINDINGS[button] ?? null;
}

export function commandForKey(key: string): Command | null {
  return KEY_BINDINGS[key.toLowerCase()] ?? null;
}

/** Returns null when the command needs an aim point and none is known yet. */
export function toPlayerInput(command: Command, playerId: PlayerId, target: Vec2 | null): PlayerInput | null {
  if (command === 'stop') return { kind: 'stop', playerId };
  if (target === null) return null;
  return { kind: command, playerId, target };
}

export type InputDeps = {
  readonly target: HTMLElement;
  readonly playerId: PlayerId;
  readonly toWorld: (screen: Vec2) => Vec2;
  readonly send: (input: PlayerInput) => void;
};

export function bindInput(deps: InputDeps): () => void {
  let cursor: Vec2 | null = null;

  const localPoint = (e: MouseEvent): Vec2 => {
    const rect = deps.target.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const dispatch = (command: Command, screen: Vec2 | null): void => {
    const input = toPlayerInput(command, deps.playerId, screen === null ? null : deps.toWorld(screen));
    if (input !== null) deps.send(input);
  };

  const onPointerMove = (e: PointerEvent): void => {
    cursor = localPoint(e);
  };
  const onPointerDown = (e: PointerEvent): void => {
    const command = commandForPointer(e.button);
    if (command === null) return;
    e.preventDefault();
    cursor = localPoint(e);
    dispatch(command, cursor);
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const command = commandForKey(e.key);
    if (command === null) return;
    e.preventDefault();
    dispatch(command, cursor);
  };
  const onContextMenu = (e: Event): void => e.preventDefault();

  deps.target.addEventListener('pointermove', onPointerMove);
  deps.target.addEventListener('pointerdown', onPointerDown);
  deps.target.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
  return () => {
    deps.target.removeEventListener('pointermove', onPointerMove);
    deps.target.removeEventListener('pointerdown', onPointerDown);
    deps.target.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('keydown', onKeyDown);
  };
}
