import { Box3, Group, Matrix4, Object3D, Vector3 } from 'three';
import { BOOK_IDS } from './books';
import { collectBookTargets } from './book-targets';

/** Replace only the existing cabinet-top prop; every furniture node stays intact. */
export function installBookProp(room: Object3D, prop: Object3D) {
  const anchors: Object3D[] = [];
  room.traverse(node => { if (node.userData.web_id === 'decor.scifi.books') anchors.push(node); });
  if (anchors.length !== 1 || !anchors[0].parent) throw new Error('Missing unique cabinet book anchor');
  const books = collectBookTargets(prop);
  if (books.size !== BOOK_IDS.length || BOOK_IDS.some(id => !books.has(id))) throw new Error('The book prop must contain all four books');
  const roots: Object3D[] = [];
  prop.traverse(node => { if (node.userData.web_id === 'decor.scifi.books') roots.push(node); });
  if (roots.length !== 1) throw new Error('The book prop needs one collection root');
  for (const node of books.values()) {
    let ancestor = node.parent;
    while (ancestor && ancestor !== roots[0]) ancestor = ancestor.parent;
    if (!ancestor) throw new Error('Every book must belong to the collection root');
  }
  room.updateMatrixWorld(true);
  prop.updateMatrixWorld(true);
  const original = anchors[0];
  const oldBounds = new Box3().setFromObject(original);
  const newBounds = new Box3().setFromObject(prop);
  const oldSize = oldBounds.getSize(new Vector3());
  const newSize = newBounds.getSize(new Vector3());
  if ([...oldSize.toArray(), ...newSize.toArray()].some(n => !Number.isFinite(n) || n <= 0)) {
    throw new Error('Book geometry has invalid dimensions');
  }
  // Uniform fit preserves the prototype's shape, cabinet contact and lamp clearance.
  const scale = Math.min(oldSize.x / newSize.x, oldSize.y / newSize.y, oldSize.z / newSize.z);
  const oldCenter = oldBounds.getCenter(new Vector3());
  const newCenter = newBounds.getCenter(new Vector3());
  const worldTransform = new Matrix4().makeTranslation(oldCenter.x, oldBounds.min.y, oldCenter.z)
    .multiply(new Matrix4().makeScale(scale, scale, scale))
    .multiply(new Matrix4().makeTranslation(-newCenter.x, -newBounds.min.y, -newCenter.z));
  const parent = original.parent!;
  const wrapper = new Group();
  wrapper.name = 'Cabinet_Books_Template_V3';
  wrapper.userData.bookTemplateVersion = 3;
  wrapper.add(prop);
  wrapper.applyMatrix4(parent.matrixWorld.clone().invert().multiply(worldTransform));
  // No live-scene mutation before all shape/identity validation has succeeded.
  parent.add(wrapper);
  parent.remove(original);
  room.updateMatrixWorld(true);
  return { replaced: original, wrapper, books, scale };
}
