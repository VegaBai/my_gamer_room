import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RoomPlacement } from '../lib/room/room-placement';
import { RoomStateMachine } from '../lib/room/state-machine';
import { DEFAULT_CONTROLS } from '../lib/room/default-controls';
import { composeTrackDelta, controlInputRange } from '../lib/room/room-engine';
import type { RoomManifestV1 } from '../lib/room/types';
import type { ExpansionContract } from '../lib/room/room-expansion';

const manifest = JSON.parse(readFileSync('public/room/room-manifest.json', 'utf8')) as RoomManifestV1;
const expansion = JSON.parse(readFileSync('public/room/expansion/manifest.json', 'utf8')) as ExpansionContract;
function load(variant: 'desktop' | 'low') {
  const bytes = readFileSync(`public${manifest.variants[variant].url}`);
  const data = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const nodes: THREE.Object3D[] = data.nodes.map((n: { name: string; extras?: object; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; mesh?: number }) => {
    const o = new THREE.Object3D(); o.name = n.name; o.userData = { ...n.extras };
    if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
    else { if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale); }
    if (n.mesh !== undefined) {
      const box = new THREE.Box3();
      for (const p of data.meshes[n.mesh].primitives) { const a = data.accessors[p.attributes.POSITION]; box.union(new THREE.Box3(new THREE.Vector3(...a.min), new THREE.Vector3(...a.max))); }
      o.userData.box = box;
    }
    return o;
  });
  data.nodes.forEach((n: { children?: number[] }, i: number) => n.children?.forEach(child => nodes[i].add(nodes[child])));
  const root = new THREE.Group(); data.scenes[data.scene ?? 0].nodes.forEach((i: number) => root.add(nodes[i]));
  const ids = new Map(nodes.map(n => [n.userData.web_id, n]));
  const bases = new Map(nodes.map(n => [n, { position: n.position.clone(), quaternion: n.quaternion.clone(), scale: n.scale.clone() }]));
  const initialWorld = new Map(nodes.map(n => [n.userData.web_id, new THREE.Vector3()]));
  root.updateMatrixWorld(true);
  for (const n of nodes) n.getWorldPosition(initialWorld.get(n.userData.web_id)!);
  const placement = new RoomPlacement(root, expansion.placements!); placement.apply();
  const state = new RoomStateMachine(DEFAULT_CONTROLS); state.setLimits(expansion.controlLimits!);
  function apply(values: Record<string, number>) {
    for (const [id, value] of Object.entries(values)) state.setDirect(id, value);
    const actual = state.snapshot();
    const poses = new Map([...bases].map(([n, b]) => [n, { position: b.position.clone(), quaternion: b.quaternion.clone(), scale: b.scale.clone() }]));
    for (const control of manifest.controls) for (const track of control.tracks ?? []) {
      composeTrackDelta(poses.get(ids.get(track.nodeId)!)!, track, ...controlInputRange(control, actual, track));
    }
    for (const [n, p] of poses) { n.position.copy(p.position); n.quaternion.copy(p.quaternion); n.scale.copy(p.scale); }
    root.updateMatrixWorld(true);
  }
  function bounds(id: string) {
    const box = new THREE.Box3(); ids.get(id)!.traverse(n => { if (n.userData.box) box.union(n.userData.box.clone().applyMatrix4(n.matrixWorld)); }); return box;
  }
  function displacement(id: string) {
    return ids.get(id)!.getWorldPosition(new THREE.Vector3()).sub(initialWorld.get(id)!);
  }
  return { apply, bounds, displacement };
}

describe('near-wall placement on actual desktop and low assets', () => {
  it.each(['desktop', 'low'] as const)('%s: cabinet props travel together and drawers/door stay clear', variant => {
    const rig = load(variant), wallZ = -.73;
    const placement = expansion.placements!.find(p => p.id === 'cabinet-near-wall-v8')!;
    expect(placement.nodeIds).not.toContain('decor.scifi.books');
    rig.apply({});
    expect(rig.bounds('scene.geo.cabinet.body.d90def4f').min.z - wallZ).toBeCloseTo(.05, 3);
    for (const id of [...placement.nodeIds, 'decor.scifi.books']) {
      expect(rig.displacement(id).distanceTo(new THREE.Vector3(...placement.translation)), id).toBeLessThan(1e-6);
    }
    const bookBounds = rig.bounds('decor.scifi.books'), lampBounds = rig.bounds('scene.root.13.ambient.loop.lamp.89e8666e');
    for (let step = 0; step <= 10; step++) {
      rig.apply({ 'cabinet.door': step / 10, ...Object.fromEntries([1, 2, 3, 4].map(i => [`cabinet.drawer.${i}`, step / 10])) });
      const cabinet = rig.bounds('cabinet.root');
      expect(cabinet.min.z - wallZ).toBeGreaterThan(.045);
      expect(cabinet.min.x - rig.bounds('scene.root.04.pc.tower.075d2d73').max.x).toBeGreaterThan(.01);
      expect(rig.bounds('decor.scifi.books').equals(bookBounds)).toBe(true);
      expect(rig.bounds('scene.root.13.ambient.loop.lamp.89e8666e').equals(lampBounds)).toBe(true);
    }
    rig.apply({ 'cabinet.door': 0, ...Object.fromEntries([1, 2, 3, 4].map(i => [`cabinet.drawer.${i}`, 0])) });
    expect(rig.bounds('scene.geo.cabinet.body.d90def4f').min.z - wallZ).toBeCloseTo(.05, 3);
  });

  it.each(['desktop', 'low'] as const)('%s: keeps 5cm tabletop gap and safe monitor travel at both desk heights', variant => {
    expect(expansion.controlLimits?.['monitors.face'].max).toBe(1 / 3);
    const rig = load(variant), wallZ = -.73;
    for (const lift of [0, 1]) {
      rig.apply({ 'desk.lift': lift });
      expect(rig.bounds('desk.top.mesh').min.z - wallZ).toBeCloseTo(.05, 3);
      for (let step = 0; step <= 12; step++) for (const trim of [-15, 0, 15]) for (const tilt of [-5, 5]) {
        rig.apply({ 'monitors.face': step / 36, 'monitors.leftTrim': trim, 'monitors.rightTrim': -trim,
          'monitors.leftTilt': tilt, 'monitors.rightTilt': tilt });
        expect(rig.bounds('monitors.root').min.z - wallZ, `${variant} lift=${lift}, face=${step / 36}, trim=${trim}, tilt=${tilt}`).toBeGreaterThan(.003);
      }
      // A legacy full-open request must be clamped to the new wall-safe end state.
      rig.apply({ 'monitors.face': 1 });
      expect(rig.bounds('monitors.root').min.z - wallZ).toBeGreaterThan(.003);
    }
  });
});
