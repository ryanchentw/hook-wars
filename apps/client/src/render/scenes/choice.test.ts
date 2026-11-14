import { describe, expect, it } from 'vitest';
import { sceneForMatch, viewOptionsFromQuery } from './choice';
import { SCENE_IDS } from './types';

describe('view options from the page address', () => {
  it('takes a known scene', () => {
    for (const id of SCENE_IDS) expect(viewOptionsFromQuery(`?scene=${id}`).scene).toBe(id);
  });

  it('treats an unknown, empty or missing scene as no choice', () => {
    expect(viewOptionsFromQuery('?scene=atlantis').scene).toBeNull();
    expect(viewOptionsFromQuery('?scene=').scene).toBeNull();
    expect(viewOptionsFromQuery('?scene=__proto__').scene).toBeNull();
    expect(viewOptionsFromQuery('?scene=Victoria').scene).toBeNull();
    expect(viewOptionsFromQuery('').scene).toBeNull();
  });

  it('plays the establishing shot unless told not to', () => {
    expect(viewOptionsFromQuery('').intro).toBe(true);
    expect(viewOptionsFromQuery('?intro=on').intro).toBe(true);
    expect(viewOptionsFromQuery('?scene=daan&intro=off').intro).toBe(false);
  });
});

describe('the scene a match is played in', () => {
  it('opens on Victoria Harbour and takes the others in turn', () => {
    expect(SCENE_IDS[0]).toBe('victoria');
    expect([0, 1, 2, 3].map((i) => sceneForMatch(null, i))).toEqual([...SCENE_IDS]);
  });

  it('comes back round to the first', () => {
    expect(sceneForMatch(null, SCENE_IDS.length)).toBe(SCENE_IDS[0]);
    expect(sceneForMatch(null, SCENE_IDS.length * 3 + 1)).toBe(SCENE_IDS[1]);
  });

  it('never changes a chosen scene', () => {
    expect([0, 1, 2, 7].map((i) => sceneForMatch('daan', i))).toEqual(['daan', 'daan', 'daan', 'daan']);
  });
});
