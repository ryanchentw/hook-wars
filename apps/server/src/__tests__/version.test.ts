import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAME_VERSION } from '@hookwars/protocol';

const ROOT = '../../../../';
const MANIFESTS = ['package.json', 'packages/sim/package.json', 'packages/room/package.json', 'packages/protocol/package.json', 'apps/client/package.json', 'apps/server/package.json'].map((path) => ROOT + path);

describe('GAME_VERSION', () => {
  it('matches every package manifest, so the menu, the health check and the tag agree', () => {
    for (const path of MANIFESTS) {
      const manifest = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as { version?: string };
      expect({ path, version: manifest.version }).toEqual({ path, version: GAME_VERSION });
    }
  });
});
