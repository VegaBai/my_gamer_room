import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { DEFAULT_CAMERA, DEFAULT_CONTROLS, PRIMARY_CONTROL_IDS } from './default-controls';
import { validateManifest } from './manifest';
import { buildProceduralRoom, type ProceduralRoom } from './procedural-room';
import { RoomStateMachine } from './state-machine';
import type {
  ControlDefinition,
  EngineStatus,
  RoomManifestV1,
  TrackSample,
  TransformTrack,
} from './types';

interface RoomEngineCallbacks {
  onProgress: (progress: number, message: string) => void;
  onReady: (status: EngineStatus) => void;
  onSelect: (controlId: string | null) => void;
  onHover: (controlId: string | null, x: number, y: number) => void;
  onValues: (values: Readonly<Record<string, number>>) => void;
  onUserInput: () => void;
}

interface OriginalMaterialState {
  emissive: THREE.Color;
  emissiveIntensity: number;
}

interface NodeBaseTransform {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

const HIT_LAYER = 2;

export class RoomEngine {
  readonly definitions: ControlDefinition[] = DEFAULT_CONTROLS;
  readonly state = new RoomStateMachine(DEFAULT_CONTROLS);

  private readonly scene = new THREE.Scene();
  private readonly hoverOutline = new THREE.Box3Helper(new THREE.Box3(), '#ff4fa8');
  private readonly camera = new THREE.PerspectiveCamera(40, 1, .05, 80);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly orbit: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly callbacks: RoomEngineCallbacks;
  private readonly container: HTMLElement;
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly pointerDown = new THREE.Vector2();
  private readonly originalMaterials = new Map<THREE.MeshStandardMaterial, OriginalMaterialState>();
  private readonly demoTimers = new Set<number>();
  private readonly rgbBaseIntensity = new Map<THREE.MeshStandardMaterial, number>();

  private procedural: ProceduralRoom | null = null;
  private hitTargets: THREE.Object3D[] = [];
  private visualTargets = new Map<string, THREE.Object3D[]>();
  private manifest: RoomManifestV1 | null = null;
  private manifestNodes = new Map<string, THREE.Object3D>();
  private manifestNodeBases = new Map<string, NodeBaseTransform>();
  private manifestRoot: THREE.Object3D | null = null;
  private hoveredControl: string | null = null;
  private raf = 0;
  private disposed = false;
  private lastInputAt = performance.now();
  private frameTotal = 0;
  private frameCount = 0;
  private pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  private lastFrameAt = performance.now();

  constructor(container: HTMLElement, callbacks: RoomEngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.domElement.className = 'room-canvas';
    this.renderer.domElement.setAttribute('aria-label', '可环绕、可点击的电竞房 3D 场景');
    this.container.appendChild(this.renderer.domElement);

    this.camera.layers.disable(HIT_LAYER);
    this.raycaster.layers.set(HIT_LAYER);
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.applyCamera(DEFAULT_CAMERA);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = .055;
    this.orbit.rotateSpeed = .48;
    this.orbit.zoomSpeed = .7;
    this.orbit.enablePan = false;
    this.orbit.autoRotateSpeed = .34;

    this.addLights();
    this.hoverOutline.visible = false;
    this.hoverOutline.renderOrder = 20;
    const outlineMaterial = this.hoverOutline.material as THREE.LineBasicMaterial;
    outlineMaterial.depthTest = false;
    outlineMaterial.transparent = true;
    outlineMaterial.opacity = .9;
    this.scene.add(this.hoverOutline);
    this.procedural = buildProceduralRoom();
    for (const material of this.procedural.rgbMaterials) {
      this.rgbBaseIntensity.set(material, material.emissiveIntensity);
    }
    this.scene.add(this.procedural.root);
    this.useHitTargets(this.procedural.hitTargets, this.procedural.visualTargets);

    this.state.subscribe((values) => {
      this.procedural?.apply(values);
      this.applyManifestTracks(values);
      this.callbacks.onValues(values);
    });

    this.bindEvents();
    this.resize();
    this.animate();
    void this.start();
  }

  private async start() {
    const usingBlenderAsset = await this.tryLoadBlenderAsset();
    if (this.disposed) return;
    const variant = this.chooseVariant();
    this.callbacks.onProgress(100, usingBlenderAsset ? 'Blender 场景已就绪' : '互动预览已就绪');
    this.callbacks.onReady({
      ready: true,
      usingBlenderAsset,
      variant,
      message: usingBlenderAsset
        ? (variant === 'desktop' ? 'Blender 高质量' : 'Blender 轻量')
        : '互动预览',
    });
  }

  selectAndToggle(controlId: string) {
    this.userInput();
    this.select(controlId);
    this.state.toggle(controlId, performance.now());
  }

  setControl(controlId: string, value: number) {
    this.userInput();
    this.select(controlId);
    this.state.setDirect(controlId, value);
  }

  reset() {
    this.userInput();
    this.state.reset(performance.now());
    this.applyCamera(this.manifest?.camera ?? DEFAULT_CAMERA);
  }

  runDemo() {
    if (this.reduceMotion) return;
    this.cancelDemo();
    this.lastInputAt = performance.now();
    this.orbit.autoRotate = false;
    this.callbacks.onUserInput();
    const steps: Array<[number, Array<[string, number]>]> = [
      [0, [['desk.lift', 1]]],
      [1250, [
        ['cabinet.drawer.1', 1], ['cabinet.drawer.2', 1],
        ['cabinet.drawer.3', 1], ['cabinet.drawer.4', 1], ['cabinet.door', 1],
      ]],
      [2450, [['microphone.fold', 1]]],
      [3550, [['monitors.face', 1]]],
      [4650, [['chair.swivel', 45], ['chair.headrest', 1], ['chair.lumbar', 1]]],
      [6500, DEFAULT_CONTROLS.map((control) => [control.id, control.default] as [string, number])],
    ];
    for (const [delay, assignments] of steps) {
      const timer = window.setTimeout(() => {
        this.demoTimers.delete(timer);
        const now = performance.now();
        for (const [id, target] of assignments) this.state.animateTo(id, target, now);
      }, delay);
      this.demoTimers.add(timer);
    }
  }

  enterFullscreen() {
    if (document.fullscreenElement) return document.exitFullscreen();
    const fullscreenTarget = this.container.closest('.room-app') ?? this.container;
    return fullscreenTarget.requestFullscreen();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.cancelDemo();
    this.unbindEvents();
    this.orbit.dispose();
    this.procedural?.dispose();
    this.procedural = null;
    if (this.manifestRoot) disposeObject(this.manifestRoot);
    this.renderer.dispose();
    this.hoverOutline.geometry.dispose();
    (this.hoverOutline.material as THREE.Material).dispose();
    this.renderer.domElement.remove();
  }

  private async tryLoadBlenderAsset(): Promise<boolean> {
    try {
      this.callbacks.onProgress(18, '读取 Blender 场景清单');
      const response = await fetch('/room/room-manifest.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
      const manifest = await response.json() as RoomManifestV1;
      validateManifest(manifest);
      const variantName = this.chooseVariant();
      const variant = manifest.variants[variantName];
      this.callbacks.onProgress(26, variantName === 'desktop' ? '加载桌面高质量模型' : '加载轻量模型');

      const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(this.renderer);
      const loader = new GLTFLoader();
      loader.setKTX2Loader(ktx2);
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await new Promise<Awaited<ReturnType<GLTFLoader['loadAsync']>>>((resolve, reject) => {
        loader.load(
          variant.url,
          resolve,
          (event) => {
            const ratio = event.total > 0 ? event.loaded / event.total : .5;
            this.callbacks.onProgress(26 + Math.round(ratio * 66), '载入房间模型与压缩纹理');
          },
          reject,
        );
      });
      ktx2.dispose();
      if (this.disposed) {
        disposeObject(gltf.scene);
        return false;
      }
      this.installBlenderAsset(gltf.scene, manifest);
      return true;
    } catch (error) {
      // The procedural scene is intentionally a complete, interactive fallback.
      console.info('[room] Blender web asset unavailable; using interactive fallback.', error);
      return false;
    }
  }

  private installBlenderAsset(root: THREE.Object3D, manifest: RoomManifestV1) {
    const nodes = new Map<string, THREE.Object3D>();
    root.traverse((object) => {
      const webId = object.userData.web_id;
      if (typeof webId !== 'string') return;
      if (nodes.has(webId)) throw new Error(`Duplicate web_id in GLB: ${webId}`);
      nodes.set(webId, object);
      if (object instanceof THREE.Light || object instanceof THREE.Camera) object.visible = false;
      if (object instanceof THREE.Mesh) {
        object.castShadow = false;
        object.receiveShadow = true;
      }
    });

    const requiredControls = new Set(PRIMARY_CONTROL_IDS);
    for (const definition of manifest.controls) {
      if (definition.primary && definition.tracks?.length) requiredControls.delete(definition.id);
      for (const track of definition.tracks ?? []) {
        if (!nodes.has(track.nodeId)) throw new Error(`Manifest node is missing: ${track.nodeId}`);
      }
    }
    if (requiredControls.size) throw new Error(`Blender asset is missing controls: ${[...requiredControls].join(', ')}`);

    const actualHitTargets: THREE.Object3D[] = [];
    const actualVisualTargets = new Map<string, THREE.Object3D[]>();
    for (const target of manifest.hitTargets) {
      const parent = target.nodeId ? nodes.get(target.nodeId) : root;
      if (!parent) throw new Error(`Hit target parent is missing: ${target.nodeId}`);
      const proxy = new THREE.Mesh(
        new THREE.BoxGeometry(...target.size),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: .001, depthWrite: false, colorWrite: false }),
      );
      proxy.position.set(...target.center);
      proxy.userData.controlId = target.controlId;
      parent.add(proxy);
      actualHitTargets.push(proxy);
    }
    for (const visual of manifest.visualTargets) {
      actualVisualTargets.set(visual.controlId, visual.nodeIds.map((id) => {
        const object = nodes.get(id);
        if (!object) throw new Error(`Visual target is missing: ${id}`);
        return object;
      }));
    }
    for (const id of PRIMARY_CONTROL_IDS) {
      if (!actualHitTargets.some((target) => target.userData.controlId === id)) {
        throw new Error(`No hit target for ${id}`);
      }
    }

    this.manifest = manifest;
    this.manifestNodes = nodes;
    this.manifestNodeBases = new Map([...nodes].map(([id, object]) => [id, {
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: object.scale.clone(),
    }]));
    this.manifestRoot = root;
    this.applyCamera(manifest.camera);
    this.scene.add(root);
    if (this.procedural) {
      this.scene.remove(this.procedural.root);
      this.procedural.dispose();
      this.procedural = null;
    }
    this.useHitTargets(actualHitTargets, actualVisualTargets);
    this.applyManifestTracks(this.state.snapshot());
  }

  private applyManifestTracks(values: Readonly<Record<string, number>>) {
    if (!this.manifest) return;
    const composed = new Map<string, NodeBaseTransform>();
    for (const definition of this.manifest.controls) {
      const value = values[definition.id] ?? definition.default;
      const normalized = (value - definition.min) / Math.max(1e-8, definition.max - definition.min);
      const defaultNormalized = (definition.default - definition.min)
        / Math.max(1e-8, definition.max - definition.min);
      for (const track of definition.tracks ?? []) {
        const node = this.manifestNodes.get(track.nodeId);
        const base = this.manifestNodeBases.get(track.nodeId);
        if (!node || !base) continue;
        let target = composed.get(track.nodeId);
        if (!target) {
          target = {
            position: base.position.clone(),
            quaternion: base.quaternion.clone(),
            scale: base.scale.clone(),
          };
          composed.set(track.nodeId, target);
        }
        composeTrackDelta(target, track, defaultNormalized, normalized);
      }
    }
    for (const [nodeId, transform] of composed) {
      const node = this.manifestNodes.get(nodeId);
      if (!node) continue;
      node.position.copy(transform.position);
      node.quaternion.copy(transform.quaternion).normalize();
      node.scale.copy(transform.scale);
    }
  }

  private applyCamera(definition: RoomManifestV1['camera']) {
    this.camera.position.set(...definition.position);
    this.camera.fov = definition.fovDegrees ?? 40;
    this.camera.near = definition.near ?? .05;
    this.camera.far = definition.far ?? 80;
    this.camera.updateProjectionMatrix();
    this.orbit?.target.set(...definition.target);
    if (this.orbit) {
      this.orbit.minDistance = Math.max(3, definition.minDistance);
      this.orbit.maxDistance = Math.min(8.5, definition.maxDistance);
      this.orbit.minPolarAngle = Math.max(.65, definition.minPolar);
      this.orbit.maxPolarAngle = Math.min(1.48, definition.maxPolar);
      this.orbit.minAzimuthAngle = Math.max(-1.05, definition.minAzimuth);
      this.orbit.maxAzimuthAngle = Math.min(1.05, definition.maxAzimuth);
      this.orbit.update();
    } else {
      this.camera.lookAt(...definition.target);
    }
  }

  private addLights() {
    this.scene.background = new THREE.Color('#eadde4');
    this.scene.fog = new THREE.Fog('#eadde4', 8.2, 13.5);
    this.scene.add(new THREE.HemisphereLight('#fff5f8', '#79606f', 1.35));
    const key = new THREE.DirectionalLight('#fff3ef', 2.15);
    key.position.set(2.8, 5.8, 4.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -3;
    key.shadow.bias = -.0004;
    this.scene.add(key);
    const pink = new THREE.PointLight('#ff6aae', 3.4, 5.4, 2);
    pink.position.set(-1.4, 2.1, -.7);
    this.scene.add(pink);
    const cyan = new THREE.PointLight('#6deaf5', 2.8, 5.2, 2);
    cyan.position.set(1.7, 2.2, -1.2);
    this.scene.add(cyan);
  }

  private useHitTargets(targets: THREE.Object3D[], visuals: Map<string, THREE.Object3D[]>) {
    for (const target of targets) target.layers.set(HIT_LAYER);
    const isolated = new Set<THREE.Mesh>();
    for (const roots of visuals.values()) {
      for (const root of roots) {
        root.traverse((object) => {
          if (!(object instanceof THREE.Mesh) || isolated.has(object)) return;
          isolated.add(object);
          object.material = Array.isArray(object.material)
            ? object.material.map((material) => material.clone())
            : object.material.clone();
        });
      }
    }
    this.hitTargets = targets;
    this.visualTargets = visuals;
  }

  private bindEvents() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('wheel', this.onInteraction, { passive: true });
    this.orbit.addEventListener('start', this.onInteraction);
    window.addEventListener('resize', this.resize);
  }

  private unbindEvents() {
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    canvas.removeEventListener('wheel', this.onInteraction);
    this.orbit.removeEventListener('start', this.onInteraction);
    window.removeEventListener('resize', this.resize);
  }

  private onPointerMove = (event: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.hitTargets, true)[0];
    const controlId = findControlId(hit?.object);
    this.setHovered(controlId);
    this.callbacks.onHover(controlId, event.clientX, event.clientY);
    this.renderer.domElement.style.cursor = controlId ? 'pointer' : 'grab';
  };

  private onPointerDown = (event: PointerEvent) => {
    this.pointerDown.set(event.clientX, event.clientY);
    this.userInput();
  };

  private onPointerUp = (event: PointerEvent) => {
    const movement = this.pointerDown.distanceTo(new THREE.Vector2(event.clientX, event.clientY));
    if (movement < 7 && this.hoveredControl) this.selectAndToggle(this.hoveredControl);
  };

  private onPointerLeave = () => {
    this.setHovered(null);
    this.callbacks.onHover(null, 0, 0);
  };
  private onInteraction = () => this.userInput();

  private userInput() {
    this.cancelDemo();
    this.lastInputAt = performance.now();
    this.orbit.autoRotate = false;
    this.callbacks.onUserInput();
  }

  private select(controlId: string | null) {
    this.callbacks.onSelect(controlId);
  }

  private setHovered(controlId: string | null) {
    if (controlId === this.hoveredControl) return;
    for (const [material, original] of this.originalMaterials) {
      material.emissive.copy(original.emissive);
      material.emissiveIntensity = original.emissiveIntensity;
    }
    this.originalMaterials.clear();
    this.hoveredControl = controlId;
    this.hoverOutline.visible = Boolean(controlId);
    if (!controlId) return;
    for (const root of this.visualTargets.get(controlId) ?? []) {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          this.originalMaterials.set(material, {
            emissive: material.emissive.clone(),
            emissiveIntensity: material.emissiveIntensity,
          });
          material.emissive.lerp(new THREE.Color('#ff4fa8'), .75);
          material.emissiveIntensity = Math.max(1.05, material.emissiveIntensity + .65);
        }
      });
    }
    this.updateHoverOutline();
  }

  private updateHoverOutline() {
    if (!this.hoveredControl) return;
    const box = new THREE.Box3();
    for (const root of this.visualTargets.get(this.hoveredControl) ?? []) box.expandByObject(root);
    if (!box.isEmpty()) this.hoverOutline.box.copy(box).expandByScalar(.012);
  }

  private animate = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.animate);
    const now = performance.now();
    const delta = Math.min(.05, Math.max(0, (now - this.lastFrameAt) / 1000));
    this.lastFrameAt = now;
    this.state.tick(now);
    if (this.hoveredControl) this.updateHoverOutline();
    if (!this.reduceMotion && now - this.lastInputAt > 8000 && !this.state.isAnimating()) {
      this.orbit.autoRotate = true;
    }
    this.orbit.update(delta);
    if (this.procedural) {
      const pulse = this.reduceMotion ? 1 : 1 + Math.sin(now * .0018) * .22;
      for (const material of this.procedural.rgbMaterials) {
        material.emissiveIntensity = (this.rgbBaseIntensity.get(material) ?? 1) * pulse;
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.measureFrame(delta);
  };

  private measureFrame(delta: number) {
    this.frameTotal += delta;
    this.frameCount += 1;
    if (this.frameCount < 120) return;
    const averageMs = this.frameTotal / this.frameCount * 1000;
    if (averageMs > 21 && this.pixelRatio > .75) {
      this.pixelRatio = Math.max(.75, this.pixelRatio - .15);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
    }
    this.frameTotal = 0;
    this.frameCount = 0;
  }

  private resize = () => {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private chooseVariant(): 'desktop' | 'low' {
    const device = navigator as Navigator & {
      connection?: { saveData?: boolean };
      deviceMemory?: number;
    };
    const constrained = device.connection?.saveData
      || (device.deviceMemory !== undefined && device.deviceMemory <= 4)
      || navigator.hardwareConcurrency <= 4;
    return window.innerWidth < 820 || constrained ? 'low' : 'desktop';
  }

  private cancelDemo() {
    for (const timer of this.demoTimers) window.clearTimeout(timer);
    this.demoTimers.clear();
  }
}

function composeTrackDelta(
  target: NodeBaseTransform,
  track: TransformTrack,
  fromT: number,
  toT: number,
) {
  const from = sampleTrack(track, fromT);
  const to = sampleTrack(track, toT);
  if (track.path === 'quaternion') {
    const origin = new THREE.Quaternion(...(from as [number, number, number, number])).normalize();
    const destination = new THREE.Quaternion(...(to as [number, number, number, number])).normalize();
    const delta = origin.invert().multiply(destination).normalize();
    target.quaternion.multiply(delta).normalize();
    return;
  }
  const origin = new THREE.Vector3(...(from as [number, number, number]));
  const destination = new THREE.Vector3(...(to as [number, number, number]));
  if (track.path === 'position') {
    target.position.add(destination.sub(origin));
    return;
  }
  target.scale.multiply(new THREE.Vector3(
    destination.x / Math.max(1e-8, origin.x),
    destination.y / Math.max(1e-8, origin.y),
    destination.z / Math.max(1e-8, origin.z),
  ));
}

function sampleTrack(track: TransformTrack, t: number) {
  const [a, b, mix] = surroundingSamples(track.samples, THREE.MathUtils.clamp(t, 0, 1));
  if (track.path === 'quaternion') {
    const qa = new THREE.Quaternion(...(a.value as [number, number, number, number]));
    const qb = new THREE.Quaternion(...(b.value as [number, number, number, number]));
    const result = qa.slerp(qb, mix).normalize();
    return [result.x, result.y, result.z, result.w] as [number, number, number, number];
  }
  const result = new THREE.Vector3(...(a.value as [number, number, number]))
    .lerp(new THREE.Vector3(...(b.value as [number, number, number])), mix);
  return [result.x, result.y, result.z] as [number, number, number];
}

function surroundingSamples(samples: TrackSample[], t: number): [TrackSample, TrackSample, number] {
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i].t < t) continue;
    const a = samples[i - 1];
    const b = samples[i];
    return [a, b, (t - a.t) / Math.max(1e-8, b.t - a.t)];
  }
  const last = samples.at(-1)!;
  return [last, last, 0];
}

function findControlId(object?: THREE.Object3D | null): string | null {
  let current = object ?? null;
  while (current) {
    if (typeof current.userData.controlId === 'string') return current.userData.controlId;
    current = current.parent;
  }
  return null;
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
}
