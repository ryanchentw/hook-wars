import { describe, expect, it } from 'vitest';
import { audioMode } from './audioMode';

describe('audioMode', () => {
  it('plays for a person and stays off under automation', () => {
    expect(audioMode('', false)).toBe('on');
    expect(audioMode('', true)).toBe('off');
  });

  it('lets the address ask for it explicitly, either way', () => {
    expect(audioMode('?audio=fake', true)).toBe('fake');
    expect(audioMode('?audio=on', true)).toBe('on');
    expect(audioMode('?audio=off', false)).toBe('off');
    expect(audioMode('?audio=loud', true)).toBe('off');
  });
});
