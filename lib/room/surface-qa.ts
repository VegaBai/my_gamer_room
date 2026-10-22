/** Local-only material/geometry isolation for repeatable close-up regression checks. */
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function mountSurfaceQA(root: THREE.Object3D, scene: THREE.Scene, camera: THREE.PerspectiveCamera, orbit: OrbitControls, captureCover?: () => string) {
  const panel = document.createElement('section');
  panel.setAttribute('aria-label', '表面检查工具');
  Object.assign(panel.style, { position: 'fixed', top: '12px', right: '12px', zIndex: '100', background: '#fff', color: '#202020', padding: '10px', borderRadius: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap', maxWidth: '560px', fontSize: '14px' });
  const meshes: THREE.Mesh[] = [];
  const initial = new Map<THREE.Mesh, { material: THREE.Material | THREE.Material[]; visible: boolean }>();
  const normalMaps = new Map<THREE.MeshStandardMaterial, THREE.Texture | null>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || typeof node.userData.web_id !== 'string') return;
    meshes.push(node);
    initial.set(node, { material: node.material, visible: node.visible });
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (material instanceof THREE.MeshStandardMaterial) normalMaps.set(material, material.normalMap);
    }
  });
  const clay = new THREE.MeshStandardMaterial({ color: '#a0a0a0', roughness: .34, side: THREE.DoubleSide });
  let normals = true;
  let clayMode = false;
  let cavities = true;
  const initialFog = scene.fog;
  scene.fog = null;
  function unlockCamera() {
    orbit.minDistance = .1;
    orbit.maxDistance = 10;
    orbit.autoRotate = false;
    orbit.minAzimuthAngle = -Infinity;
    orbit.maxAzimuthAngle = Infinity;
    orbit.minPolarAngle = .1;
    orbit.maxPolarAngle = Math.PI - .1;
    orbit.enablePan = true;
  }
  unlockCamera();
  const button = (label: string, action: () => void) => {
    const element = document.createElement('button');
    element.textContent = label;
    element.style.cssText = 'padding:8px;background:#f1eaf0;border:1px solid #bbb;border-radius:6px;cursor:pointer';
    element.onclick = action;
    panel.appendChild(element);
    return element;
  };
  function focus(part: 'cabinet' | 'chair') {
    unlockCamera();
    const selected = meshes.filter((mesh) => part === 'cabinet'
      ? /cabinet|drawer|door/.test(mesh.userData.web_id)
      : /chair/.test(mesh.userData.web_id));
    const box = new THREE.Box3();
    for (const mesh of selected) box.expandByObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    if (part === 'chair') center.y = box.min.y + .18;
    const offset = part === 'cabinet' ? new THREE.Vector3(.98, .58, 1.5) : new THREE.Vector3(.65, .40, 1.35);
    camera.position.copy(center).add(offset);
    orbit.target.copy(center);
    camera.fov = part === 'cabinet' ? 37 : 34;
    camera.updateProjectionMatrix();
    orbit.update();
  }
  button('柜体近景', () => focus('cabinet'));
  button('椅脚近景', () => focus('chair'));
  function focusChair(back: boolean) {
    unlockCamera();
    for (const mesh of meshes) {
      if (/wall/i.test(mesh.userData.web_id)) mesh.visible = !back && initial.get(mesh)!.visible;
    }
    // Multiple material primitives load as a Group with Mesh children; the
    // authored web_id belongs to the Group, not those primitive children.
    let upper: THREE.Object3D | undefined;
    root.traverse(node => {
      if (node.userData.web_id === 'chair.swivel.mesh') upper = node;
    });
    if (!upper) return;
    const box = new THREE.Box3().setFromObject(upper);
    const center = box.getCenter(new THREE.Vector3());
    // Blender chair fronts along +X at an eight-degree world yaw.
    camera.position.copy(center).add(new THREE.Vector3(back ? -1.55 : 1.65, .35, back ? .5 : .7));
    orbit.target.copy(center);
    camera.fov = 43;
    camera.updateProjectionMatrix();
    orbit.update();
  }
  button('椅子正面', () => focusChair(false));
  button('椅子背面', () => focusChair(true));
  function focusArtwork(oblique: boolean) {
    unlockCamera();
    for (const mesh of meshes) mesh.visible = initial.get(mesh)!.visible;
    let frame: THREE.Object3D | undefined;
    root.traverse(node => { if (node.userData.web_id === 'decor.wall-art.root') frame = node; });
    if (!frame) return;
    const center = new THREE.Box3().setFromObject(frame).getCenter(new THREE.Vector3());
    camera.position.copy(center).add(new THREE.Vector3(oblique ? .55 : 0, oblique ? .16 : 0, 1.15));
    orbit.target.copy(center);
    camera.fov = 43;
    camera.updateProjectionMatrix();
    orbit.update();
  }
  button('画框正面', () => focusArtwork(false));
  button('画框斜视', () => focusArtwork(true));
  function focusMonitors(back: boolean) {
    unlockCamera();
    for (const mesh of meshes) {
      if (/wall/i.test(mesh.userData.web_id)) mesh.visible = !back && initial.get(mesh)!.visible;
    }
    const box = new THREE.Box3();
    for (const mesh of meshes.filter((item) => /monitor/i.test(item.userData.web_id))) box.expandByObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    camera.position.copy(center).add(new THREE.Vector3(back ? -.9 : 1.2, .85, back ? -1.8 : 1.8));
    orbit.target.copy(center);
    camera.fov = 48;
    camera.updateProjectionMatrix();
    orbit.update();
  }
  button('双屏正面', () => focusMonitors(false));
  button('双屏背面', () => focusMonitors(true));
  function focusMicrophone(back: boolean) {
    unlockCamera();
    for (const mesh of meshes) {
      if (/wall/i.test(mesh.userData.web_id)) mesh.visible = !back && initial.get(mesh)!.visible;
    }
    const head = meshes.find((mesh) => mesh.userData.web_id === 'microphone.head.mesh');
    if (!head) return;
    const center = new THREE.Box3().setFromObject(head).getCenter(new THREE.Vector3());
    center.y -= .06;
    camera.position.copy(center).add(new THREE.Vector3(back ? -.42 : .38, .18, back ? -.65 : .72));
    orbit.target.copy(center);
    camera.fov = 32;
    camera.updateProjectionMatrix();
    orbit.update();
  }
  button('话筒正面', () => focusMicrophone(false));
  button('话筒背面', () => focusMicrophone(true));
  function focusCoatCollar(back: boolean) {
    let hanger: THREE.Object3D | undefined;
    root.traverse(node => {
      if (node.userData.web_id === 'coat.v9.hanger.wood') hanger = node;
    });
    if (!hanger) return;
    unlockCamera();
    const center = new THREE.Box3().setFromObject(hanger).getCenter(new THREE.Vector3());
    center.y += .025;
    // Stay inside the side-hung hat so it cannot occlude the collar inspection.
    camera.position.copy(center).add(new THREE.Vector3(-.20, .09, back ? -.25 : .23));
    orbit.target.copy(center);
    camera.fov = 38;
    camera.updateProjectionMatrix();
    orbit.update();
  }
  button('衣领正面', () => focusCoatCollar(false));
  button('衣领背面', () => focusCoatCollar(true));
  const detailView = (position: [number, number, number], target: [number, number, number]) => {
    unlockCamera(); camera.position.fromArray(position); orbit.target.fromArray(target);
    camera.fov = 43; camera.updateProjectionMatrix(); orbit.update();
  };
  button('床尾褶皱', () => detailView([1.05, 1.50, 1.75], [-.65, .5, 2.96]));
  button('百叶安装侧面', () => detailView([-.9, 2.8, 1.9], [-2.05, 1.76, .55]));
  button('吉他承托斜视', () => detailView([-1.08, .65, .35], [-1.72, .30, .03]));
  button('吉他承托侧面', () => detailView([-2.10, .55, .62], [-1.72, .35, .03]));
  if (captureCover) button('生成当前房间封面', () => {
    const preview = document.createElement('img');
    preview.alt = '当前房间封面预览';
    preview.src = captureCover();
    preview.style.cssText = 'position:fixed;inset:12% 5%;width:90%;height:76%;object-fit:contain;z-index:110;background:#eadde4;cursor:pointer';
    preview.onclick = () => preview.remove();
    document.body.appendChild(preview);
  });
  const normalButton = button('法线贴图：开', () => {
    normals = !normals;
    normalButton.textContent = `法线贴图：${normals ? '开' : '关'}`;
    for (const [material, map] of normalMaps) { material.normalMap = normals ? map : null; material.needsUpdate = true; }
  });
  const clayButton = button('灰模：关', () => {
    clayMode = !clayMode;
    clayButton.textContent = `灰模：${clayMode ? '开' : '关'}`;
    for (const mesh of meshes) mesh.material = clayMode ? clay : initial.get(mesh)!.material;
  });
  const cavityButton = button('内腔：开', () => {
    cavities = !cavities;
    cavityButton.textContent = `内腔：${cavities ? '开' : '关'}`;
    for (const mesh of meshes.filter((node) => /cavit/.test(node.userData.web_id))) mesh.visible = cavities;
  });
  document.body.appendChild(panel);
  return () => {
    for (const [mesh, state] of initial) { mesh.material = state.material; mesh.visible = state.visible; }
    for (const [material, map] of normalMaps) { material.normalMap = map; material.needsUpdate = true; }
    scene.fog = initialFog;
    clay.dispose();
    panel.remove();
  };
}
