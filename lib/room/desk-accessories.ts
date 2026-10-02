import * as THREE from 'three';
import { OBB } from 'three/addons/math/OBB.js';

type V3 = [number, number, number];
export interface DeskAccessoryContract {
  schema: 'desk-accessories/1';
  asset: { url: string; sha256: string; bytes: number };
  parentNodeId: 'desk.top';
  groups: Record<string, { min: V3; max: V3; placement: V3 }>;
}

export function installDeskAccessories(base: THREE.Object3D, root: THREE.Object3D, spec: DeskAccessoryContract) {
  if (spec.schema !== 'desk-accessories/1' || spec.parentNodeId !== 'desk.top'
    || !/^\/room\/desk-accessories\/[a-f0-9]{64}\.glb$/.test(spec.asset.url)) throw Error('Invalid desk accessory contract');
  let desk: THREE.Object3D | undefined;
  base.traverse(o => { if (o.userData.web_id === spec.parentNodeId) desk = o; });
  if (!desk) throw Error('Moving desktop missing');
  root.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
  // Authored in the same local desk coordinates as the room, including Z-up -> Y-up GLTF conversion.
  desk.add(root);
  return desk;
}

interface Collider { node: THREE.Object3D; local: OBB; world: OBB; bounds: THREE.Box3; family: string }
const tracked = ['microphone.fold', 'microphone.yaw', 'monitors.face', 'monitors.leftTrim', 'monitors.rightTrim', 'monitors.leftTilt', 'monitors.rightTilt'];
const resolution: Record<string, number> = { 'microphone.fold': .01, 'microphone.yaw': .5, 'monitors.face': 1 / 180,
  'monitors.leftTrim': .5, 'monitors.rightTrim': .5, 'monitors.leftTilt': .5, 'monitors.rightTilt': .5 };

/** Kinematic motion guard: test the whole requested path, then stop at the last separated pose. */
export class DeskMotionGuard {
  private readonly colliders: Collider[] = [];
  private readonly pairs: [Collider, Collider][] = [];
  private previous: Record<string, number>;
  lastContact: string | null = null;

  constructor(private readonly root: THREE.Object3D, initial: Readonly<Record<string, number>>,
    private readonly pose: (values: Readonly<Record<string, number>>) => void) {
    this.previous = { ...initial };
    root.traverse(node => {
      let ancestor: THREE.Object3D | null = node, id = '';
      while (ancestor && !id) { id = ancestor.userData.web_id ?? ''; ancestor = ancestor.parent; }
      let family = '';
      if (id.startsWith('microphone.') && !id.includes('clamp')) family = 'microphone';
      else if (/^monitors\.(left\.mesh|arm\.left\.)/.test(id)) family = 'left-monitor';
      else if (/^monitors\.(right\.mesh|arm\.right\.)/.test(id)) family = 'right-monitor';
      else if (id.startsWith('accessories.mesh.')) family = 'accessory';
      if (!family) return;
      let box: THREE.Box3 | undefined;
      if (node instanceof THREE.Mesh) { node.geometry.computeBoundingBox(); box = node.geometry.boundingBox ?? undefined; }
      // Headless verification uses the exact exported mesh bounds, with the same transforms.
      else if (node.userData.localBounds instanceof THREE.Box3) box = node.userData.localBounds;
      if (!box || box.isEmpty()) return;
      const local = new OBB().fromBox3(box);
      // Conservative mesh envelopes plus 1mm on each object leave a 2mm visible clearance.
      this.colliders.push({ node, local, world: new OBB(), bounds: new THREE.Box3(), family });
    });
    for (let i = 0; i < this.colliders.length; i++) for (let j = i + 1; j < this.colliders.length; j++) {
      const a = this.colliders[i], b = this.colliders[j];
      if (a.family !== b.family) this.pairs.push([a, b]);
    }
    this.pose(initial);
    if (this.contact()) throw Error('Default desktop placement intersects: ' + this.lastContact);
  }

  contact() {
    this.root.updateWorldMatrix(true, true);
    for (const c of this.colliders) {
      c.world.copy(c.local).applyMatrix4(c.node.matrixWorld);
      c.world.center.copy(c.local.center).applyMatrix4(c.node.matrixWorld);
      c.world.halfSize.set(Math.abs(c.world.halfSize.x), Math.abs(c.world.halfSize.y), Math.abs(c.world.halfSize.z)).addScalar(.001);
      const r = c.world.rotation.elements, h = c.world.halfSize;
      const extent = new THREE.Vector3(Math.abs(r[0])*h.x+Math.abs(r[3])*h.y+Math.abs(r[6])*h.z,
        Math.abs(r[1])*h.x+Math.abs(r[4])*h.y+Math.abs(r[7])*h.z, Math.abs(r[2])*h.x+Math.abs(r[5])*h.y+Math.abs(r[8])*h.z);
      c.bounds.min.copy(c.world.center).sub(extent); c.bounds.max.copy(c.world.center).add(extent);
    }
    for (const [a, b] of this.pairs) if (a.bounds.intersectsBox(b.bounds) && a.world.intersectsOBB(b.world)) {
      this.lastContact = `${a.node.name} / ${b.node.name}`; return true;
    }
    return false;
  }

  resolve(requested: Readonly<Record<string, number>>) {
    const from = this.previous;
    const steps = Math.max(1, ...tracked.map(id => Math.ceil(Math.abs((requested[id] ?? 0) - (from[id] ?? 0)) / resolution[id])));
    const at = (t: number) => {
      const values = { ...requested };
      for (const id of tracked) values[id] = (from[id] ?? 0) + ((requested[id] ?? 0) - (from[id] ?? 0)) * t;
      this.pose(values); return values;
    };
    let accepted = { ...requested }, last = 0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps; accepted = at(t);
      if (this.contact()) {
        let lo = last, hi = t;
        for (let j = 0; j < 12; j++) { const mid = (lo + hi) / 2; at(mid); if (this.contact()) hi = mid; else lo = mid; }
        accepted = at(lo); break;
      }
      last = t;
    }
    this.previous = accepted;
    return accepted;
  }
}
