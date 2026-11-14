import { describe, expect, it } from 'vitest';
import { HUMAN } from './fakeSim';
import { commandForKey, commandForPointer, toPlayerInput } from './input';

describe('input mapping', () => {
  it('maps mouse buttons: right moves, left hooks, middle does nothing', () => {
    expect(commandForPointer(2)).toBe('move');
    expect(commandForPointer(0)).toBe('hook');
    expect(commandForPointer(1)).toBeNull();
  });

  it('maps Q to hook and S to stop regardless of case', () => {
    expect(commandForKey('q')).toBe('hook');
    expect(commandForKey('Q')).toBe('hook');
    expect(commandForKey('s')).toBe('stop');
    expect(commandForKey('S')).toBe('stop');
    expect(commandForKey('w')).toBeNull();
  });

  it('builds sim inputs aimed at the world point', () => {
    const target = { x: 1800, y: 600 };
    expect(toPlayerInput('hook', HUMAN, target)).toEqual({ kind: 'hook', playerId: HUMAN, target });
    expect(toPlayerInput('move', HUMAN, target)).toEqual({ kind: 'move', playerId: HUMAN, target });
    expect(toPlayerInput('stop', HUMAN, null)).toEqual({ kind: 'stop', playerId: HUMAN });
  });

  it('drops an aimed command when the cursor position is unknown', () => {
    expect(toPlayerInput('hook', HUMAN, null)).toBeNull();
  });
});
