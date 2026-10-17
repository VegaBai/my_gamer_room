import * as THREE from 'three';
import { BEDROOM_CONTROLS } from './bedroom-controls';
import type { Vec3 } from './types';

export interface BedroomContract {
  schema: 'bedroom-b7/1';
  asset: { url: string; sha256: string; bytes: number };
  parts: { id: string }[];
  motions: { nodeId: string; parts: string[]; kind: 'hinge' | 'slide'; axis: Vec3; travel: number; controlId: string }[];
  lamp: { controlId: string; partId: string; position: Vec3 };
}
export const gltfVector = ([x, y, z]: Vec3) => new THREE.Vector3(x, z, -y);

export function validateBedroom(spec: BedroomContract) {
  if (spec.schema !== 'bedroom-b7/1' || !/^\/room\/bedroom\/[a-f0-9]{64}\.glb$/.test(spec.asset?.url)
    || spec.parts.length !== 23 || new Set(spec.parts.map(p => p.id)).size !== 23) throw Error('Invalid B7 asset contract');
  for (const m of spec.motions) if (!m.nodeId || !m.parts.length || !['hinge', 'slide'].includes(m.kind)
    || m.axis.length !== 3 || !m.axis.every(Number.isFinite) || !Number.isFinite(m.travel)
    || gltfVector(m.axis).length() < .5 || !BEDROOM_CONTROLS.some(c => c.id === m.controlId)) throw Error('Invalid B7 motion');
}

export class BedroomAssembly {
  readonly hitTargets: THREE.Mesh[] = [];
  readonly visualTargets = new Map<string, THREE.Object3D[]>();
  private readonly transforms: { node: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion; motion: BedroomContract['motions'][number] }[] = [];
  private readonly bulbs: THREE.MeshStandardMaterial[] = [];
  private readonly light = new THREE.PointLight('#ffd9ad', .8, 2.3, 2);
  private lastLiner = 0;
  private closeAfterInsertion = false;

  constructor(readonly root: THREE.Object3D, readonly contract: BedroomContract, base: THREE.Object3D) {
    validateBedroom(contract);
    const nodes = new Map<string, THREE.Object3D>();
    root.traverse(o => { if (typeof o.userData.web_id === 'string') {
      if (nodes.has(o.userData.web_id)) throw Error('Duplicate B7 node');
      nodes.set(o.userData.web_id, o);
    } });
    const requireNode = (id: string) => { const n = nodes.get(id); if (!n) throw Error('Missing B7 node ' + id); return n; };
    contract.parts.forEach(p => requireNode(p.id));
    for (const motion of contract.motions) {
      const node = requireNode(motion.nodeId);
      this.transforms.push({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), motion });
      const targets = this.visualTargets.get(motion.controlId) ?? [];
      targets.push(...motion.parts.map(requireNode)); this.visualTargets.set(motion.controlId, targets);
    }
    this.visualTargets.get('trash.open')!.push(requireNode('t01-bin-body'));
    this.visualTargets.get('nightstand.drawer')!.push(requireNode('n01-carcass'));
    this.visualTargets.set('bedsideLamp.power', ['l01-lamp-base', 'l02-lampshade', 'l03-bulb'].map(requireNode));
    for (const [id, targets] of this.visualTargets) for (const target of targets) target.traverse(o => {
      if (o instanceof THREE.Mesh) { o.userData.controlId = id; o.layers.enable(2); this.hitTargets.push(o); }
    });
    root.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = false; o.receiveShadow = true; } });
    requireNode(contract.lamp.partId).traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const originals = Array.isArray(o.material) ? o.material : [o.material];
      const materials = originals.map(m => { const clone = m.clone(); if (clone instanceof THREE.MeshStandardMaterial) {
        clone.emissive.set('#ffd9ad'); this.bulbs.push(clone);
      } return clone; });
      o.material = Array.isArray(o.material) ? materials : materials[0];
    });
    this.light.position.copy(gltfVector(contract.lamp.position));root.add(this.light);base.add(root);
  }

  constrain(values: Readonly<Record<string, number>>) {
    const next = { ...values };
    // Reinsert the liner before allowing closure, and open the lid before removal.
    if (this.lastLiner > .001 && (next['trash.open'] ?? 0) < .98) {
      this.closeAfterInsertion = true; next['trash.open'] = 1;
    }
    if ((next['trash.liner'] ?? 0) <= .001 && this.closeAfterInsertion) {
      next['trash.liner'] = 0; next['trash.open'] = 0; this.closeAfterInsertion = false;
    }
    if ((next['trash.open'] ?? 0) < .98) next['trash.liner'] = 0;
    this.lastLiner = next['trash.liner'] ?? 0;
    return next;
  }

  apply(values: Readonly<Record<string, number>>) {
    for (const t of this.transforms) {
      const value = THREE.MathUtils.clamp(values[t.motion.controlId] ?? 0, 0, 1), axis = gltfVector(t.motion.axis);
      if (t.motion.kind === 'slide') t.node.position.copy(t.position).addScaledVector(axis, value * t.motion.travel);
      else t.node.quaternion.copy(t.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(axis.normalize(), value * t.motion.travel));
    }
    const power = THREE.MathUtils.clamp(values[this.contract.lamp.controlId] ?? 1, 0, 1);
    this.bulbs.forEach(m => { m.emissiveIntensity = 2 * power; });this.light.intensity = .8 * power;
  }
  detach() { this.root.removeFromParent(); }
}
