import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {ArtworkCamera} from '../lib/room/artwork-camera';
import type {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {BedroomAssembly, gltfVector, type BedroomContract} from '../lib/room/bedroom';
import {DEFAULT_CONTROLS} from '../lib/room/default-controls';
import {RoomStateMachine} from '../lib/room/state-machine';
import {FURNITURE_INSPECTIONS} from '../lib/room/furniture-inspection';
const spec=JSON.parse(readFileSync(new URL('../public/room/bedroom/manifest.json',import.meta.url),'utf8')) as BedroomContract;
function rig(){
 const bytes=readFileSync(new URL('../public'+spec.asset.url,import.meta.url));
 const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 const nodes=doc.nodes.map((n: {translation?:number[];rotation?:number[];scale?:number[];extras?:Record<string,unknown>})=>{
  const o=new THREE.Group();o.userData={...n.extras};if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);return o;
 });
 doc.nodes.forEach((n:{children?:number[]},i:number)=>n.children?.forEach(j=>nodes[i].add(nodes[j])));
 // Use the authored accessor bounds to exercise framing without decoding textures.
 doc.nodes.forEach((n:{mesh?:number},i:number)=>{
  if(n.mesh===undefined)return;
  for(const primitive of doc.meshes[n.mesh].primitives){
   const a=doc.accessors[primitive.attributes.POSITION];if(!a.min||!a.max)continue;
   const lo=new THREE.Vector3(...a.min),hi=new THREE.Vector3(...a.max),size=hi.clone().sub(lo);
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(size.x,size.y,size.z));mesh.position.copy(lo.add(hi).multiplyScalar(.5));nodes[i].add(mesh);
  }
 });
 const root=new THREE.Group();doc.scenes[doc.scene??0].nodes.forEach((i:number)=>root.add(nodes[i]));
 return {model:new BedroomAssembly(root,structuredClone(spec),new THREE.Group()),nodes,bytes};
}
describe('B7 assembled room',()=>{
 it('first click inspects without operating, sliders retain focus, and switching furniture preserves the original return camera',async()=>{
  const {RoomEngine}=await import('../lib/room/room-engine');const {model}=rig();
  const camera=new THREE.PerspectiveCamera(40,1.2,.05,80);camera.position.set(4,5,6);
  const orbit={target:new THREE.Vector3(0,1,0),minDistance:2,maxDistance:20,update:vi.fn(),minAzimuthAngle:-Infinity,maxAzimuthAngle:Infinity,minPolarAngle:.1,maxPolarAngle:Math.PI/2,autoRotate:false};
  const artworkCamera=new ArtworkCamera(camera,orbit as unknown as OrbitControls);const original=camera.position.clone(),target=orbit.target.clone();
  const callbacks={onArtworkClose:vi.fn(),onBookSelect:vi.fn(),onFurnitureInspection:vi.fn(),onSelect:vi.fn(),onUserInput:vi.fn()};
  const engine=Object.create(RoomEngine.prototype) as InstanceType<typeof RoomEngine>;
  Object.assign(engine,{state:new RoomStateMachine(DEFAULT_CONTROLS),expansion:{},bedroom:model,camera,orbit,artworkCamera,callbacks,reduceMotion:true,
   container:{clientWidth:1200,clientHeight:1000},demoTimers:new Set(),bookOutline:{visible:false},onPointerLeave:vi.fn()});
  engine.selectAndToggle('nightstand.drawer');artworkCamera.tick(performance.now());
  expect(engine.state.getValue('nightstand.drawer')).toBe(0);expect(artworkCamera.active).toBe(true);
  const focused=camera.position.clone();expect(focused.distanceTo(original)).toBeGreaterThan(1);
  engine.setControl('nightstand.drawer',1);artworkCamera.tick(performance.now());
  expect(camera.position.distanceTo(focused)).toBeLessThan(1e-8);expect(artworkCamera.active).toBe(true);
  engine.selectAndToggle('entry.open');artworkCamera.tick(performance.now());expect(engine.state.getValue('entry.open')).toBe(0);
  engine.closeFurnitureInspection();artworkCamera.tick(performance.now());
  expect(camera.position.distanceTo(original)).toBeLessThan(1e-8);expect(orbit.target.distanceTo(target)).toBeLessThan(1e-8);expect(artworkCamera.active).toBe(false);
 });
 it('frames all eight furniture groups with full travel and keeps the same envelope while operating',()=>{
  const {model}=rig();expect(new Set(Object.values(FURNITURE_INSPECTIONS).map(v=>v.key)).size).toBe(8);
  for(const [id,specification] of Object.entries(FURNITURE_INSPECTIONS)){
   const view=model.inspection(id)!;expect(view.bounds.isEmpty()).toBe(false);
   for(let step=0;step<=24;step++){
    model.apply(Object.fromEntries(spec.motions.filter(m=>m.parts.some(p=>specification.parts.includes(p))).map(m=>[m.controlId,step/24])));
    model.root.updateWorldMatrix(true,true);
    for(const part of specification.parts){let target:THREE.Object3D|undefined;model.root.traverse(o=>{if(o.userData.web_id===part)target=o;});
     const actual=new THREE.Box3().setFromObject(target!);expect(view.bounds.clone().expandByScalar(1e-6).containsBox(actual)).toBe(true);
    }
    expect(model.inspection(id)!.bounds.equals(view.bounds)).toBe(true);
   }
   model.apply({});
  }
 });
 it('ships all 27 parts with an intact hashed GLB and no duplicate identifiers',()=>{
  const {nodes,bytes}=rig();expect(bytes.length).toBe(spec.asset.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(spec.asset.sha256);
  for(const p of spec.parts)expect(nodes.filter((n:THREE.Object3D)=>n.userData.web_id===p.id)).toHaveLength(1);
 });
 it('keeps the hat, bag and shoes on the rack when the coat is lifted off the rail',()=>{
  const {model,nodes}=rig();model.root.updateWorldMatrix(true,true);
  const props=['c03-hat','c04-bag','c05-shoes'].map(id=>nodes.find((n:THREE.Object3D)=>n.userData.web_id===id)!);
  const positions=props.map(p=>p.getWorldPosition(new THREE.Vector3()));
  model.apply({'coat.take':1});model.root.updateWorldMatrix(true,true);
  props.forEach((p,i)=>expect(p.getWorldPosition(new THREE.Vector3()).distanceTo(positions[i])).toBeLessThan(1e-8));
  expect(FURNITURE_INSPECTIONS['coat.take'].parts).toEqual(expect.arrayContaining(['c03-hat','c04-bag','c05-shoes']));
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
