import { Mesh, type Object3D } from 'three';
import { isBookId, type BookId } from './books';

/** Multi-material glTF books may be Groups; select their actual mesh children. */
export function collectBookTargets(root: Object3D) {
  const targets = new Map<BookId, Object3D>();
  root.traverse(node => {
    const id = node.userData.web_id;
    if (!isBookId(id)) return;
    if (targets.has(id)) throw new Error(`Duplicate book identity: ${id}`);
    let hasGeometry = false;
    node.traverse(child => { if (child instanceof Mesh) hasGeometry = true; });
    if (!hasGeometry) throw new Error(`Book has no geometry: ${id}`);
    targets.set(id, node);
  });
  return targets;
}
