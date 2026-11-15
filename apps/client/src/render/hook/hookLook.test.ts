import type { Hook, HookId, PlayerId } from '@hookwars/sim';
import { describe, expect, it } from 'vitest';
import { hookLook } from './hookLook';

function hook(phase: Hook['phase'], barbed: boolean): Hook {
  return {
    id: 'h' as HookId,
    ownerId: 'w' as PlayerId,
    pos: { x: 0, y: 0 },
    dir: { x: 1, y: 0 },
    path: [],
    phase,
    stats: { damage: 350, range: 1300, speed: 1100, retractSpeed: 1300, radius: 26, barbed },
  };
}

const OUT = { kind: 'extending', remaining: 400 } as const;
const EMPTY_BACK = { kind: 'retracting', cargo: null } as const;
const LOADED_BACK = { kind: 'retracting', cargo: 'e' as PlayerId } as const;

describe('hookLook', () => {
  it('reads every outgoing hook as live, barbed or not', () => {
    expect(hookLook(hook(OUT, false))).toEqual({ menace: 'live', barbed: false });
    expect(hookLook(hook(OUT, true))).toEqual({ menace: 'live', barbed: true });
  });

  it('reads an empty plain hook on its way back as spent', () => {
    expect(hookLook(hook(EMPTY_BACK, false)).menace).toBe('spent');
  });

  it('reads an empty barbed hook on its way back as hot, since it still catches', () => {
    expect(hookLook(hook(EMPTY_BACK, true)).menace).toBe('hot');
  });

  it('keeps a hook hauling its catch live', () => {
    expect(hookLook(hook(LOADED_BACK, false)).menace).toBe('live');
    expect(hookLook(hook(LOADED_BACK, true)).menace).toBe('live');
  });
});
