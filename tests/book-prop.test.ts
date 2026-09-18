import { describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, Vector3 } from 'three';
import { BOOK_IDS } from '../lib/room/books';
import { installBookProp } from '../lib/room/book-prop';

function setup() {
  const room = new Group();
  const cabinet = new Group();
  cabinet.position.set(1, .2, .1);
  room.add(cabinet);
  const old = new Mesh(new BoxGeometry(.32, .23, .205));
  old.userData.web_id = 'decor.scifi.books';
  old.position.set(.1, .735, -.1);
  cabinet.add(old);
  const furniture = new Mesh(new BoxGeometry());
  furniture.position.set(2, 3, 4);
  room.add(furniture);
  const prop = new Group();
  prop.userData.web_id = 'decor.scifi.books';
  for (const [index, id] of BOOK_IDS.entries()) {
    const mesh = new Mesh(new BoxGeometry(.3, .04, .2));
    mesh.position.y = index * .04;
    mesh.userData.web_id = id;
    prop.add(mesh);
  }
  room.updateMatrixWorld(true);
  return { room, cabinet, old, prop, furniture };
}

describe('single-book template composition', () => {
  it('replaces the fused anchor with four real selectable books, grounded on the same surface', () => {
    const { room, cabinet, old, prop, furniture } = setup();
    const before = new Box3().setFromObject(old);
    const furnitureMatrix = furniture.matrixWorld.clone();
    const installed = installBookProp(room, prop);
    const after = new Box3().setFromObject(installed.wrapper);
    expect(installed.books.size).toBe(4);
    expect(old.parent).toBeNull();
    expect(installed.wrapper.parent).toBe(cabinet);
    expect(after.min.y).toBeCloseTo(before.min.y, 8);
    const centerBefore = before.getCenter(new Vector3()), centerAfter = after.getCenter(new Vector3());
    expect(centerAfter.x).toBeCloseTo(centerBefore.x, 8);
    expect(centerAfter.z).toBeCloseTo(centerBefore.z, 8);
    expect(after.max.x).toBeLessThanOrEqual(before.max.x + 1e-8);
    expect(after.max.y).toBeLessThanOrEqual(before.max.y + 1e-8);
    expect(after.max.z).toBeLessThanOrEqual(before.max.z + 1e-8);
    expect(furniture.matrixWorld.equals(furnitureMatrix)).toBe(true);
  });

  it('keeps the original room untouched if the prop is incomplete', () => {
    const { room, cabinet, old, prop } = setup();
    prop.remove(prop.children[0]);
    expect(() => installBookProp(room, prop)).toThrow('all four books');
    expect(old.parent).toBe(cabinet);
    expect(cabinet.children).toEqual([old]);
  });
});
