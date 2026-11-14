import { Box3, Vector3, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { createHookGeometry, HOOK_GROUPS } from './hookGeometry';

function boundsOf(geometry: BufferGeometry, groupIndex: number): Box3 {
  const group = geometry.groups[groupIndex];
  if (group === undefined) throw new Error(`no group ${groupIndex}`);
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');
  const box = new Box3();
  const point = new Vector3();
  for (let i = group.start; i < group.start + group.count; i += 1) {
    box.expandByPoint(point.fromBufferAttribute(position, index === null ? i : index.getX(i)));
  }
  return box;
}

/** In hook radii: about five screen pixels on a carried hook at the game's camera distance. */
const MIN_STANDOUT = 0.3;

describe('createHookGeometry', () => {
  it('draws the plain hook and the barb spurs as two separate groups', () => {
    const geometry = createHookGeometry();
    expect(geometry.groups.map((g) => g.materialIndex)).toEqual([HOOK_GROUPS.plain, HOOK_GROUPS.spurs]);
    geometry.dispose();
  });

  it('stands the spurs well clear of the plain hook, so they change its silhouette', () => {
    const geometry = createHookGeometry();
    const plain = boundsOf(geometry, HOOK_GROUPS.plain);
    const spurs = boundsOf(geometry, HOOK_GROUPS.spurs);
    const beyond = Math.max(...plain.min.clone().sub(spurs.min).toArray(), ...spurs.max.clone().sub(plain.max).toArray());
    expect(beyond).toBeGreaterThan(MIN_STANDOUT);
    geometry.dispose();
  });
});
