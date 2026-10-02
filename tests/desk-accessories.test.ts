import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DeskMotionGuard, installDeskAccessories, type DeskAccessoryContract } from '../lib/room/desk-accessories';
import { composeTrackDelta, controlInputRange } from '../lib/room/room-engine';
import { RoomPlacement } from '../lib/room/room-placement';
import { RoomStateMachine } from '../lib/room/state-machine';
import { DEFAULT_CONTROLS } from '../lib/room/default-controls';
import type { RoomManifestV1 } from '../lib/room/types';

const manifest: RoomManifestV1 = JSON.parse(readFileSync('public/room/room-manifest.json','utf8'));
const expansion = JSON.parse(readFileSync('public/room/expansion/manifest.json','utf8'));
const accessories: DeskAccessoryContract = JSON.parse(readFileSync('public/room/desk-accessories/manifest.json','utf8'));
function glb(url: string) {
  const b=readFileSync('public'+url), g=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
  const nodes: THREE.Object3D[] = g.nodes.map((n: { name?: string; extras?: object; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; mesh?: number }) => {
    const o=new THREE.Object3D();o.name=n.name??'';o.userData={...n.extras};
    if(n.matrix)new THREE.Matrix4().fromArray(n.matrix).decompose(o.position,o.quaternion,o.scale);
    else {if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);}
    if(n.mesh!==undefined){const box=new THREE.Box3();for(const p of g.meshes[n.mesh].primitives){const a=g.accessors[p.attributes.POSITION];box.union(new THREE.Box3(new THREE.Vector3(...a.min),new THREE.Vector3(...a.max)));}o.userData.localBounds=box;}
    return o;
  });
  g.nodes.forEach((n:{children?:number[]},i:number)=>n.children?.forEach(j=>nodes[i].add(nodes[j])));
  const root=new THREE.Group();g.scenes[g.scene??0].nodes.forEach((i:number)=>root.add(nodes[i]));return root;
}
function setup(variant:'desktop'|'low') {
  const root=glb(manifest.variants[variant].url),prop=glb(accessories.asset.url);
  const ids=new Map<string,THREE.Object3D>();root.traverse(o=>{if(o.userData.web_id)ids.set(o.userData.web_id,o);});
  const bases=new Map([...ids].map(([id,o])=>[id,{position:o.position.clone(),quaternion:o.quaternion.clone(),scale:o.scale.clone()}]));
  new RoomPlacement(root,expansion.placements).apply();installDeskAccessories(root,prop,accessories);
  const state=new RoomStateMachine(DEFAULT_CONTROLS);state.setLimits(expansion.controlLimits);
  const pose=(values:Readonly<Record<string,number>>)=>{
    const targets=new Map([...bases].map(([id,p])=>[id,{position:p.position.clone(),quaternion:p.quaternion.clone(),scale:p.scale.clone()}]));
    for(const c of manifest.controls)for(const t of c.tracks??[])composeTrackDelta(targets.get(t.nodeId)!,t,...controlInputRange(c,values,t));
    for(const [id,p]of targets){const o=ids.get(id)!;o.position.copy(p.position);o.quaternion.copy(p.quaternion);o.scale.copy(p.scale);}
    root.updateMatrixWorld(true);
  };
  const guard=new DeskMotionGuard(root,state.snapshot(),pose);state.setConstraint(v=>guard.resolve(v));
  return {root,prop,guard,state,pose,ids};
}

describe('desk accessories on actual exported assets',()=>{
  it.each(['desktop','low'] as const)('%s: mounts all props on moving desktop, clear at home and raised',variant=>{
    const r=setup(variant);expect(r.prop.parent).toBe(r.ids.get('desk.top'));
    const start=r.prop.getWorldPosition(new THREE.Vector3());
    r.state.setDirect('desk.lift',1);
    const end=r.prop.getWorldPosition(new THREE.Vector3());
    expect(end.y-start.y).toBeCloseTo(.4,5);expect(r.guard.contact()).toBe(false);
    expect(Object.keys(accessories.groups)).toHaveLength(9);
  });
  it.each(['desktop','low'] as const)('%s: guards combined screen/arm motion, direct jumps and reversal',variant=>{
    const r=setup(variant);let seed=29;
    const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const controls=DEFAULT_CONTROLS.filter(c=>/^(monitors|microphone)\./.test(c.id));
    for(let i=0;i<90;i++){
      const c=controls[i%controls.length],d=r.state.getDefinition(c.id),target=d.min+rand()*(d.max-d.min);
      r.state.setDirect(c.id,target);
      expect(r.guard.contact(),r.guard.lastContact??'').toBe(false);
    }
    r.state.reset(0);for(let t=0;t<=1400;t+=40){r.state.tick(t);expect(r.guard.contact()).toBe(false);}
  },30000);
  it('stops a path whose two endpoints are clear but which crosses an obstacle',()=>{
    const root=new THREE.Group();
    const moving=new THREE.Object3D();moving.name='screen';moving.userData={web_id:'monitors.left.mesh',localBounds:new THREE.Box3(new THREE.Vector3(-.02,-.02,-.02),new THREE.Vector3(.02,.02,.02))};
    const fixed=new THREE.Object3D();fixed.name='pen';fixed.userData={web_id:'accessories.mesh.pen',localBounds:new THREE.Box3(new THREE.Vector3(.48,-.1,-.1),new THREE.Vector3(.52,.1,.1))};root.add(moving,fixed);
    const pose=(v:Readonly<Record<string,number>>)=>{moving.position.x=v['monitors.face']??0;};
    const guard=new DeskMotionGuard(root,{'monitors.face':0},pose);
    const stopped=guard.resolve({'monitors.face':1});expect(stopped['monitors.face']).toBeLessThan(.46);expect(guard.contact()).toBe(false);
    const reversed=guard.resolve({'monitors.face':0});expect(reversed['monitors.face']).toBe(0);
  });
});
