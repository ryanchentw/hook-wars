import { describe, expect, it } from 'vitest';
import { bindIntroSkip } from './introSkip';

type Listener = (event: { readonly key?: string }) => void;

function fakeWindow() {
  const listeners = new Map<string, Listener>();
  return {
    listeners,
    window: {
      addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    } as unknown as Pick<Window, 'addEventListener' | 'removeEventListener'>,
  };
}

describe('skipping the establishing shot', () => {
  it('skips on any key or click while the shot is up', () => {
    const { window, listeners } = fakeWindow();
    let skips = 0;
    bindIntroSkip({ window, skippable: () => true, skip: () => (skips += 1) });
    listeners.get('keydown')!({ key: 'w' });
    listeners.get('keydown')!({ key: ' ' });
    listeners.get('pointerdown')!({});
    expect(skips).toBe(3);
  });

  it('leaves keys alone once the fight is on or a dialog has them', () => {
    const { window, listeners } = fakeWindow();
    let skips = 0;
    bindIntroSkip({ window, skippable: () => false, skip: () => (skips += 1) });
    listeners.get('keydown')!({ key: 'w' });
    listeners.get('pointerdown')!({});
    expect(skips).toBe(0);
  });

  it('does not take a bare modifier for a wish to play', () => {
    const { window, listeners } = fakeWindow();
    let skips = 0;
    bindIntroSkip({ window, skippable: () => true, skip: () => (skips += 1) });
    listeners.get('keydown')!({ key: 'Meta' });
    listeners.get('keydown')!({ key: 'Shift' });
    expect(skips).toBe(0);
  });

  it('unbinds', () => {
    const { window, listeners } = fakeWindow();
    const unbind = bindIntroSkip({ window, skippable: () => true, skip: () => undefined });
    unbind();
    expect(listeners.size).toBe(0);
  });
});
