import { describe, expect, it } from 'vitest';
import { autoQuality, chooseQuality, createQualitySetting, parseQuality, type Capabilities } from './quality';

const M3: Capabilities = { renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)', maxTextureSize: 16384, cores: 12 };

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  } as Storage;
}

describe('autoQuality', () => {
  it('gives a real GPU with cores to spare the full picture', () => {
    expect(autoQuality(M3)).toBe('high');
  });

  it.each(['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'Microsoft Basic Render Driver', 'Apple Software Renderer'])(
    'gives a renderer that draws on the CPU the plain picture: %s',
    (renderer) => {
      expect(autoQuality({ ...M3, renderer })).toBe('low');
    },
  );

  it('gives a machine with few cores or small textures the plain picture', () => {
    expect(autoQuality({ ...M3, cores: 2 })).toBe('low');
    expect(autoQuality({ ...M3, maxTextureSize: 2048 })).toBe('low');
  });
});

describe('parseQuality', () => {
  it('knows the two settings and nothing else', () => {
    expect(parseQuality('high')).toBe('high');
    expect(parseQuality('low')).toBe('low');
    expect(parseQuality('ultra')).toBeNull();
    expect(parseQuality(null)).toBeNull();
  });
});

describe('chooseQuality', () => {
  it('takes what the address asks for over what was remembered, and that over what the machine suggests', () => {
    expect(chooseQuality({ asked: 'low', stored: 'high', capabilities: M3 })).toBe('low');
    expect(chooseQuality({ asked: null, stored: 'low', capabilities: M3 })).toBe('low');
    expect(chooseQuality({ asked: null, stored: null, capabilities: M3 })).toBe('high');
    expect(chooseQuality({ asked: 'nonsense', stored: 'nonsense', capabilities: { ...M3, cores: 2 } })).toBe('low');
  });
});

describe('createQualitySetting', () => {
  it('starts from the remembered choice and remembers a new one', () => {
    const storage = fakeStorage({ 'hookwars.quality': 'low' });
    const setting = createQualitySetting({ storage: () => storage, asked: null, capabilities: M3 });
    expect(setting.getSnapshot()).toBe('low');
    const seen: string[] = [];
    setting.subscribe(() => seen.push(setting.getSnapshot()));
    setting.choose('high');
    expect(seen).toEqual(['high']);
    expect(storage.getItem('hookwars.quality')).toBe('high');
  });

  it('does not remember what only the address asked for', () => {
    const storage = fakeStorage();
    const setting = createQualitySetting({ storage: () => storage, asked: 'low', capabilities: M3 });
    expect(setting.getSnapshot()).toBe('low');
    expect(storage.getItem('hookwars.quality')).toBeNull();
  });

  it('works for the visit when storage is blocked', () => {
    const blocked = (): Storage => {
      throw new Error('blocked');
    };
    const setting = createQualitySetting({ storage: blocked, asked: null, capabilities: M3 });
    expect(setting.getSnapshot()).toBe('high');
    setting.choose('low');
    expect(setting.getSnapshot()).toBe('low');
  });
});
