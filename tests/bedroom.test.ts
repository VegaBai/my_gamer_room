import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {BedroomAssembly, gltfVector, type BedroomContract} from '../lib/room/bedroom';
import {DEFAULT_CONTROLS} from '../lib/room/default-controls';
import {RoomStateMachine} from '../lib/room/state-machine';
const spec=JSON.parse(readFileSync(new URL('../public/room/bedroom/manifest.json',import.meta.url),'utf8')) as BedroomContract;
function rig(){
 const bytes=readFileSync(new URL('../public'+spec.asset.url,import.meta.url));
 const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 const nodes=doc.nodes.map((n: {translation?:number[];rotation?:number[];scale?:number[];extras?:Record<string,unknown>})=>{
  const o=new THREE.Group();o.userData={...n.extras};if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);return o;
 });
 doc.nodes.forEach((n:{children?:number[]},i:number)=>n.children?.forEach(j=>nodes[i].add(nodes[j])));
 const root=new THREE.Group();doc.scenes[doc.scene??0].nodes.forEach((i:number)=>root.add(nodes[i]));
 return {model:new BedroomAssembly(root,structuredClone(spec),new THREE.Group()),nodes,bytes};
}
describe('B7 assembled room',()=>{
 it('ships all 23 parts with an intact hashed GLB and no duplicate identifiers',()=>{
  const {nodes,bytes}=rig();expect(bytes.length).toBe(spec.asset.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(spec.asset.sha256);
  for(const p of spec.parts)expect(nodes.filter((n:THREE.Object3D)=>n.userData.web_id===p.id)).toHaveLength(1);
 });
 it('preserves the authored pivots and returns every mechanism exactly to its rest pose',()=>{
  const {model,nodes}=rig();const transforms=nodes.map((o:THREE.Object3D)=>({p:o.position.clone(),q:o.quaternion.clone()}));
  for(const m of spec.motions){
   const o=nodes.find((n:THREE.Object3D)=>n.userData.web_id===m.nodeId)!;const i=nodes.indexOf(o);
   model.apply({[m.controlId]:1});
   if(m.kind==='slide')expect(o.position.distanceTo(transforms[i].p.clone().addScaledVector(gltfVector(m.axis),m.travel))).toBeLessThan(1e-7);
   else expect(o.quaternion.angleTo(transforms[i].q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(gltfVector(m.axis).normalize(),m.travel)))).toBeLessThan(1e-7);
   model.apply({});expect(o.position.distanceTo(transforms[i].p)).toBeLessThan(1e-7);expect(o.quaternion.angleTo(transforms[i].q)).toBeLessThan(1e-7);
  }
 });
 it('requires an open bin lid, prevents closure through the liner, and resets both safely',()=>{
  const {model}=rig();const state=new RoomStateMachine(DEFAULT_CONTROLS);state.setConstraint(v=>model.constrain(v));
  state.setDirect('trash.liner',1);expect(state.getValue('trash.liner')).toBe(0);
  state.setDirect('trash.open',1);state.setDirect('trash.liner',1);state.setDirect('trash.open',0);expect(state.getValue('trash.open')).toBe(1);
  state.reset(0);for(let t=0;t<=1200;t+=10)state.tick(t);
  expect(state.getValue('trash.liner')).toBe(0);expect(state.getValue('trash.open')).toBe(0);
 });
});
