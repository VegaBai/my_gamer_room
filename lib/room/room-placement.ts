import * as THREE from 'three';
import type { Vec3 } from './types';

export interface RoomPlacementSpec {
  id: string;
  nodeIds: string[];
  translation: Vec3;
}

/** Static world offsets above animated rigs; never rewrite their local channels. */
export class RoomPlacement {
  private readonly entries: { node: THREE.Object3D; parent: THREE.Object3D; wrapper: THREE.Group }[] = [];
  private active = false;

  constructor(root: THREE.Object3D, specs: RoomPlacementSpec[]) {
    const nodes = new Map<string, THREE.Object3D>();
    root.traverse(node => { if (typeof node.userData.web_id === 'string') nodes.set(node.userData.web_id, node); });
    const claimed = new Set<THREE.Object3D>();
    root.updateWorldMatrix(true, true);
    for (const spec of specs) {
      if (!spec.id || !spec.nodeIds.length || !Array.isArray(spec.translation)
        || spec.translation.length !== 3 || !spec.translation.every(Number.isFinite)) throw new Error('Invalid room placement');
      for (const id of spec.nodeIds) {
        const node = nodes.get(id);
        if (!node?.parent || claimed.has(node)) throw new Error(`Missing or repeated placement root: ${id}`);
        for (const other of claimed) {
          for (let p: THREE.Object3D | null = node; p; p = p.parent) if (p === other) throw new Error('Nested placement roots');
          for (let p: THREE.Object3D | null = other; p; p = p.parent) if (p === node) throw new Error('Nested placement roots');
        }
        claimed.add(node);
        const parent = node.parent;
        const wrapper = new THREE.Group();
        wrapper.name = `Layout_${spec.id}_${id}`;
        // Convert the world-space displacement to the current parent's coordinates.
        const inverse = parent.matrixWorld.clone().invert();
        wrapper.position.fromArray(spec.translation).applyMatrix4(inverse)
          .sub(new THREE.Vector3().applyMatrix4(inverse));
        this.entries.push({ node, parent, wrapper });
      }
    }
  }

  apply() {
    if (this.active) return;
    for (const { node, parent, wrapper } of this.entries) {
      parent.add(wrapper); wrapper.add(node);
    }
    this.active = true;
  }

  dispose() {
    if (!this.active) return;
    for (const { node, parent, wrapper } of this.entries) {
      parent.add(node); wrapper.removeFromParent();
    }
    this.active = false;
  }
}
