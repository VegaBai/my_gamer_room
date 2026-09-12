import * as THREE from 'three';

export interface ProceduralRoom {
  root: THREE.Group;
  hitTargets: THREE.Object3D[];
  visualTargets: Map<string, THREE.Object3D[]>;
  rgbMaterials: THREE.MeshStandardMaterial[];
  apply: (values: Readonly<Record<string, number>>) => void;
  dispose: () => void;
}

const deg = THREE.MathUtils.degToRad;

export function buildProceduralRoom(): ProceduralRoom {
  const root = new THREE.Group();
  root.name = 'procedural-room-fallback';
  const hitTargets: THREE.Object3D[] = [];
  const visualTargets = new Map<string, THREE.Object3D[]>();
  const rgbMaterials: THREE.MeshStandardMaterial[] = [];

  const materials = {
    wall: standard('#f7edf0', .83, .03),
    wallBlue: standard('#edf3fa', .86, .02),
    floor: standard('#b7866c', .73, .02),
    rug: standard('#eee0e4', .98, .01),
    white: standard('#f9f6f5', .42, .08),
    whiteSoft: standard('#e9e1e3', .58, .05),
    pink: standard('#e6a4b8', .52, .08),
    pinkDark: standard('#a9637f', .5, .12),
    dark: standard('#231c25', .38, .22),
    black: standard('#09080d', .3, .26),
    metal: standard('#8b858b', .26, .65),
    green: standard('#6eab7d', .72, .01),
    soil: standard('#59433d', .95, .0),
    glass: new THREE.MeshPhysicalMaterial({ color: '#d8f4fa', roughness: .1, metalness: 0, transmission: .42, transparent: true, opacity: .74 }),
  };

  const pinkGlow = standard('#ff6fb2', .35, .05, '#ff4fa2', 2.0);
  const cyanGlow = standard('#70e8f4', .35, .04, '#54ddea', 1.65);
  const screenGlow = standard('#39233f', .32, .06, '#bb64d5', 1.25);
  rgbMaterials.push(pinkGlow, cyanGlow, screenGlow);

  // Room shell and fixed decoration.
  box(root, 'floor', [7.7, .12, 6.1], [0, -.07, -.25], materials.floor, true);
  box(root, 'back-wall', [7.7, 4.2, .13], [0, 2.05, -3.24], materials.wall);
  box(root, 'left-wall', [.13, 4.2, 6.1], [-3.78, 2.05, -.25], materials.wallBlue);
  box(root, 'rug', [5.7, .025, 3.4], [-.35, .015, .2], materials.rug);
  box(root, 'baseboard-back', [7.65, .13, .08], [0, .12, -3.14], materials.white);
  box(root, 'baseboard-left', [.08, .13, 6.0], [-3.68, .12, -.25], materials.white);

  const windowGroup = new THREE.Group();
  windowGroup.position.set(-2.45, 2.45, -3.15);
  root.add(windowGroup);
  box(windowGroup, 'window-frame', [1.85, 1.48, .08], [0, 0, 0], materials.white);
  box(windowGroup, 'window-glass', [1.58, 1.22, .05], [0, 0, .06], materials.glass);
  box(windowGroup, 'window-bar-v', [.06, 1.25, .11], [0, 0, .1], materials.white);

  const art = new THREE.Group();
  art.position.set(2.55, 2.55, -3.12);
  root.add(art);
  box(art, 'art-frame', [1.0, 1.28, .1], [0, 0, 0], materials.white);
  box(art, 'art-image', [.82, 1.08, .06], [0, 0, .07], screenGlow);

  const plant = new THREE.Group();
  plant.position.set(2.65, 0, -2.46);
  root.add(plant);
  cylinder(plant, 'plant-pot', .24, .19, .4, [0, .22, 0], materials.pink);
  sphere(plant, 'plant-leaves-a', [.28, .48, .22], [-.1, .67, 0], materials.green);
  sphere(plant, 'plant-leaves-b', [.25, .42, .2], [.16, .75, -.04], materials.green);
  sphere(plant, 'plant-leaves-c', [.22, .38, .18], [0, .92, 0], materials.green);

  // Desk and its moving payload.
  const desk = new THREE.Group();
  desk.name = 'room.desk';
  desk.position.set(.15, 0, -1.38);
  root.add(desk);

  const deskMiddle = new THREE.Group();
  const deskTop = new THREE.Group();
  deskTop.position.y = 1.22;
  desk.add(deskMiddle, deskTop);

  for (const x of [-1.38, 1.38]) {
    box(desk, 'desk-foot', [.95, .11, .42], [x, .08, .03], materials.whiteSoft);
    box(desk, 'desk-leg-fixed', [.25, .68, .25], [x, .44, 0], materials.whiteSoft);
    box(deskMiddle, 'desk-leg-middle', [.19, .52, .19], [x, .76, 0], materials.metal);
    box(deskTop, 'desk-leg-inner', [.14, .45, .14], [x, -.27, 0], materials.white);
  }
  const desktopMesh = box(deskTop, 'desk-top', [3.62, .13, 1.28], [0, 0, 0], materials.white, true);
  box(deskTop, 'desk-edge-glow', [3.44, .035, .045], [0, -.02, .64], pinkGlow);

  // Keyboard, mouse pad, speakers.
  box(deskTop, 'keyboard', [1.0, .055, .34], [-.25, .105, .25], materials.whiteSoft, true);
  box(deskTop, 'mouse-pad', [.82, .025, .48], [.93, .09, .23], materials.pink);
  sphere(deskTop, 'mouse', [.12, .055, .17], [.9, .15, .24], materials.white);
  for (const x of [-1.43, 1.43]) {
    const speaker = box(deskTop, 'speaker', [.3, .52, .29], [x, .34, -.1], materials.white, true);
    cylinder(speaker, 'speaker-driver', .09, .09, .025, [0, .04, .155], materials.dark, [Math.PI / 2, 0, 0]);
  }

  const monitorSupport = new THREE.Group();
  monitorSupport.position.set(0, .1, -.18);
  deskTop.add(monitorSupport);
  cylinder(monitorSupport, 'monitor-post', .09, .09, .78, [0, .39, 0], materials.metal);
  box(monitorSupport, 'monitor-arm-left-fixed', [.4, .08, .08], [-.2, .67, 0], materials.metal);
  box(monitorSupport, 'monitor-arm-right-fixed', [.4, .08, .08], [.2, .67, 0], materials.metal);
  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  leftArm.position.set(-.4, .67, 0);
  rightArm.position.set(.4, .67, 0);
  monitorSupport.add(leftArm, rightArm);
  cylinder(leftArm, 'monitor-left-yaw-joint', .055, .055, .1, [0, 0, 0], materials.metal);
  cylinder(rightArm, 'monitor-right-yaw-joint', .055, .055, .1, [0, 0, 0], materials.metal);
  box(leftArm, 'monitor-arm-left-moving', [.33, .07, .07], [-.165, 0, 0], materials.metal);
  box(rightArm, 'monitor-arm-right-moving', [.33, .07, .07], [.165, 0, 0], materials.metal);
  box(leftArm, 'monitor-left-mount', [.06, .06, .2], [-.33, .05, .1], materials.metal);
  box(rightArm, 'monitor-right-mount', [.06, .06, .2], [.33, .05, .1], materials.metal);

  const leftScreen = new THREE.Group();
  const rightScreen = new THREE.Group();
  leftScreen.position.set(-.33, .05, .2);
  rightScreen.position.set(.33, .05, .2);
  leftArm.add(leftScreen);
  rightArm.add(rightScreen);
  const leftTilt = new THREE.Group();
  const rightTilt = new THREE.Group();
  leftScreen.add(leftTilt);
  rightScreen.add(rightTilt);
  const leftScreenMesh = buildScreen(leftTilt, 'left-screen', screenGlow, materials.dark);
  const rightScreenMesh = buildScreen(rightTilt, 'right-screen', screenGlow, materials.dark);

  // Microphone boom hierarchy.
  const microphoneRig = new THREE.Group();
  microphoneRig.position.set(-1.52, .17, .06);
  deskTop.add(microphoneRig);
  cylinder(microphoneRig, 'mic-clamp', .09, .09, .22, [0, -.1, 0], materials.white);
  const micYaw = new THREE.Group();
  micYaw.position.y = .02;
  microphoneRig.add(micYaw);
  cylinder(micYaw, 'mic-base', .12, .12, .13, [0, .05, 0], materials.pinkDark);
  const shoulder = new THREE.Group();
  shoulder.position.y = .1;
  micYaw.add(shoulder);
  const lowerArm = box(shoulder, 'mic-lower-arm', [.11, .72, .11], [0, .35, 0], materials.white, true);
  const elbow = new THREE.Group();
  elbow.position.y = .7;
  shoulder.add(elbow);
  cylinder(elbow, 'mic-elbow', .13, .13, .13, [0, 0, 0], materials.pink, [Math.PI / 2, 0, 0]);
  const upperArm = box(elbow, 'mic-upper-arm', [.1, .76, .1], [0, .37, 0], materials.white, true);
  const micHead = new THREE.Group();
  micHead.position.y = .74;
  elbow.add(micHead);
  cylinder(micHead, 'microphone', .13, .11, .44, [0, -.2, 0], materials.pinkDark);
  cylinder(micHead, 'microphone-grille', .135, .12, .24, [0, -.15, 0], pinkGlow);

  // Chair: fixed base with a rotating upper assembly.
  const chair = new THREE.Group();
  chair.name = 'room.chair';
  chair.position.set(-2.05, 0, .34);
  root.add(chair);
  cylinder(chair, 'chair-column', .09, .11, .62, [0, .31, 0], materials.metal);
  for (let i = 0; i < 5; i += 1) {
    const spoke = new THREE.Group();
    spoke.rotation.y = i * Math.PI * 2 / 5;
    chair.add(spoke);
    box(spoke, 'chair-spoke', [.1, .08, .68], [0, .11, .29], materials.metal);
    cylinder(spoke, 'chair-wheel', .1, .1, .07, [0, .08, .66], materials.pinkDark, [0, 0, Math.PI / 2]);
  }
  const chairSwivel = new THREE.Group();
  chairSwivel.position.y = .58;
  chair.add(chairSwivel);
  const chairSeat = box(chairSwivel, 'chair-seat', [.9, .2, .78], [0, .05, 0], materials.white, true);
  box(chairSwivel, 'chair-seat-accent', [.76, .08, .66], [0, .15, .02], materials.pink);
  const chairBack = box(chairSwivel, 'chair-back', [.82, 1.45, .22], [0, .88, -.32], materials.white, true);
  box(chairSwivel, 'chair-back-inset', [.6, 1.13, .08], [0, .88, -.18], materials.pink);
  for (const x of [-.52, .52]) {
    box(chairSwivel, 'chair-arm-post', [.08, .38, .08], [x, .32, -.02], materials.metal);
    box(chairSwivel, 'chair-arm', [.15, .08, .55], [x, .53, .04], materials.whiteSoft);
  }
  const headrest = new THREE.Group();
  headrest.position.set(0, 1.35, -.17);
  chairSwivel.add(headrest);
  const headrestMesh = box(headrest, 'chair-headrest', [.62, .3, .18], [0, 0, 0], materials.pink, true);
  const lumbar = new THREE.Group();
  lumbar.position.set(0, .78, -.13);
  chairSwivel.add(lumbar);
  const lumbarMesh = box(lumbar, 'chair-lumbar', [.58, .28, .18], [0, 0, 0], materials.pink, true);

  // PC tower.
  const pc = new THREE.Group();
  pc.position.set(1.48, 0, -.62);
  root.add(pc);
  box(pc, 'pc-case', [.62, 1.05, .76], [0, .53, 0], materials.whiteSoft, true);
  box(pc, 'pc-glass', [.5, .88, .02], [0, .55, .39], materials.glass);
  for (const y of [.28, .54, .8]) {
    cylinder(pc, 'pc-fan', .17, .17, .025, [0, y, .42], pinkGlow, [Math.PI / 2, 0, 0]);
    cylinder(pc, 'pc-fan-core', .055, .055, .03, [0, y, .44], cyanGlow, [Math.PI / 2, 0, 0]);
  }

  // Cabinet with four drawers and one hinged door.
  const cabinet = new THREE.Group();
  cabinet.position.set(2.52, 0, -1.36);
  root.add(cabinet);
  box(cabinet, 'cabinet-body', [1.5, 1.3, .68], [0, .65, 0], materials.whiteSoft, true);
  box(cabinet, 'cabinet-glow', [1.35, .035, .05], [0, .05, .37], pinkGlow);
  const drawerGroups: THREE.Group[] = [];
  const drawerVisuals: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i += 1) {
    const drawer = new THREE.Group();
    drawer.position.set(-.38, 1.08 - i * .285, .36);
    cabinet.add(drawer);
    const front = box(drawer, `drawer-${i + 1}`, [.65, .245, .075], [0, 0, 0], materials.white, true);
    box(drawer, `drawer-tray-${i + 1}`, [.58, .15, .52], [0, -.03, -.25], materials.whiteSoft);
    box(drawer, `drawer-handle-${i + 1}`, [.23, .035, .045], [0, .02, .065], materials.pinkDark);
    drawerGroups.push(drawer);
    drawerVisuals.push(front);
  }
  const doorPivot = new THREE.Group();
  doorPivot.position.set(.72, .66, .36);
  cabinet.add(doorPivot);
  const doorMesh = box(doorPivot, 'cabinet-door', [.7, 1.12, .075], [-.35, 0, 0], materials.white, true);
  box(doorPivot, 'cabinet-door-accent', [.08, .72, .04], [-.61, 0, .055], materials.pink);

  const ringLamp = new THREE.Group();
  ringLamp.position.set(.45, 1.42, 0);
  cabinet.add(ringLamp);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.17, .03, 12, 36), pinkGlow);
  ring.position.y = .19;
  ring.castShadow = true;
  ringLamp.add(ring);
  cylinder(ringLamp, 'lamp-base', .15, .18, .06, [0, .03, 0], materials.pink);

  // Raycast proxies are deliberately simple and invisible.
  const registerTarget = (
    controlId: string,
    parent: THREE.Object3D,
    size: [number, number, number],
    center: [number, number, number],
    visuals: THREE.Object3D[],
  ) => {
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: .001, depthWrite: false, colorWrite: false }),
    );
    proxy.name = `hit.${controlId}`;
    proxy.position.set(...center);
    proxy.userData.controlId = controlId;
    proxy.renderOrder = -1;
    parent.add(proxy);
    hitTargets.push(proxy);
    visualTargets.set(controlId, visuals);
  };

  drawerGroups.forEach((drawer, i) => registerTarget(`cabinet.drawer.${i + 1}`, drawer, [.72, .29, .45], [0, 0, .12], [drawerVisuals[i]]));
  registerTarget('cabinet.door', doorPivot, [.76, 1.2, .35], [-.35, 0, .12], [doorMesh]);
  registerTarget('desk.lift', deskTop, [3.5, .35, 1.2], [0, .05, 0], [desktopMesh]);
  registerTarget('chair.swivel', chairSwivel, [1.15, 1.7, .95], [0, .65, -.08], [chairSeat, chairBack]);
  registerTarget('chair.headrest', headrest, [.72, .4, .35], [0, 0, .1], [headrestMesh]);
  registerTarget('chair.lumbar', lumbar, [.68, .38, .35], [0, 0, .1], [lumbarMesh]);
  registerTarget('microphone.fold', micYaw, [.85, 1.45, .62], [.2, .62, 0], [lowerArm, upperArm, micHead]);
  registerTarget('monitors.face', leftTilt, [1.05, .68, .26], [0, 0, .03], [leftScreenMesh]);
  registerTarget('monitors.face', rightTilt, [1.05, .68, .26], [0, 0, .03], [rightScreenMesh]);

  const apply = (values: Readonly<Record<string, number>>) => {
    const deskLift = values['desk.lift'] ?? 0;
    deskMiddle.position.y = .2 * deskLift;
    deskTop.position.y = 1.22 + .4 * deskLift;

    drawerGroups.forEach((drawer, i) => {
      drawer.position.z = .36 + .46 * (values[`cabinet.drawer.${i + 1}`] ?? 0);
    });
    doorPivot.rotation.y = -deg(105) * (values['cabinet.door'] ?? 0);

    chairSwivel.rotation.y = deg(values['chair.swivel'] ?? 0);
    const headrestDetach = values['chair.headrest'] ?? 0;
    headrest.position.set(0, 1.35 + .18 * headrestDetach, -.17 + .18 * headrestDetach);
    const lumbarDetach = values['chair.lumbar'] ?? 0;
    lumbar.position.set(0, .78 + .12 * lumbarDetach, -.13 + .2 * lumbarDetach);

    const fold = values['microphone.fold'] ?? 0;
    micYaw.rotation.y = deg(values['microphone.yaw'] ?? 0);
    shoulder.rotation.z = deg(-6 - 30 * fold);
    elbow.rotation.z = deg(33 + 66 * fold);
    micHead.rotation.z = -(shoulder.rotation.z + elbow.rotation.z);

    const screens = values['monitors.face'] ?? 0;
    const leftTrim = values['monitors.leftTrim'] ?? 0;
    const rightTrim = values['monitors.rightTrim'] ?? 0;
    leftArm.rotation.y = deg(75 * screens + Math.max(0, leftTrim));
    rightArm.rotation.y = deg(-75 * screens + Math.min(0, rightTrim));
    leftScreen.rotation.y = deg(15 * screens + Math.min(0, leftTrim));
    rightScreen.rotation.y = deg(-15 * screens + Math.max(0, rightTrim));
    leftTilt.rotation.x = -deg(values['monitors.leftTilt'] ?? 0);
    rightTilt.rotation.x = -deg(values['monitors.rightTilt'] ?? 0);
  };

  const dispose = () => {
    const disposedMaterials = new Set<THREE.Material>();
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of meshMaterials) {
        if (!disposedMaterials.has(material)) {
          material.dispose();
          disposedMaterials.add(material);
        }
      }
    });
  };

  return { root, hitTargets, visualTargets, rgbMaterials, apply, dispose };
}

function standard(color: string, roughness: number, metalness: number, emissive = '#000000', emissiveIntensity = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity });
}

function box(
  parent: THREE.Object3D,
  name: string,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  castShadow = false,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size, 2, 2, 2), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(
  parent: THREE.Object3D,
  name: string,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  position: [number, number, number],
  material: THREE.Material,
  rotation: [number, number, number] = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 24), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function sphere(
  parent: THREE.Object3D,
  name: string,
  scale: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), material);
  mesh.name = name;
  mesh.scale.set(...scale);
  mesh.position.set(...position);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function buildScreen(parent: THREE.Object3D, name: string, screen: THREE.Material, frame: THREE.Material) {
  const group = new THREE.Group();
  group.name = name;
  parent.add(group);
  box(group, `${name}-frame`, [1.15, .7, .08], [0, 0, 0], frame, true);
  const display = box(group, `${name}-display`, [1.04, .59, .018], [0, 0, .052], screen);
  return display;
}
