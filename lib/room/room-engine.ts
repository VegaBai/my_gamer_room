import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { DEFAULT_CAMERA, DEFAULT_CONTROLS, BASE_PRIMARY_CONTROL_IDS } from './default-controls';
import { validateManifest } from './manifest';
import { buildProceduralRoom, type ProceduralRoom } from './procedural-room';
import { RoomStateMachine } from './state-machine';
import { WallArtwork } from './wall-artwork';
import { PhotoWall, PHOTO_WALL_INTERACTION_ID, registerPhotoWallInteraction, type PhotoSlot } from './photo-wall';
import { ARTWORK_INTERACTION_ID, type ArtworkFit } from './artwork-input';
import { PointerTap } from './pointer-tap';
import { artworkViewport } from './artwork-focus';
import { ArtworkCamera } from './artwork-camera';
import { BOOK_IDS, isBookId, type BookId } from './books';
import { collectBookTargets } from './book-targets';
import { installBookProp } from './book-prop';
import bookPropAsset from './book-prop-asset.json';
import { DeskMotionGuard, installDeskAccessories, type DeskAccessoryContract } from './desk-accessories';
import { installPersonalCorner, type PersonalCornerContract } from './personal-corner';
import { RoomExpansion, validateExpansionContract, type ExpansionContract } from './room-expansion';
import { isExpansionControl } from './expansion-controls';
import { BedroomAssembly, type BedroomContract } from './bedroom';
import { isBedroomControl } from './bedroom-controls';
import { isVisibleInScene, pickRoomControl } from './room-picking';
import { overviewFraming } from './overview-framing';
import { RoomArchitecture, resolveWallpaper, WALLPAPER_STORAGE_KEY, type WallpaperId } from './wallpaper';
import type {
  ControlDefinition,
  EngineStatus,
  RoomLoadingStage,
  RoomManifestV1,
  TrackSample,
  TransformTrack,
} from './types';

interface RoomEngineCallbacks {
  onProgress: (progress: number, stage: RoomLoadingStage) => void;
  onReady: (status: EngineStatus) => void;
  onSelect: (controlId: string | null) => void;
  onArtworkSelect: () => void;
  onArtworkClose: () => void;
  onPhotoWallSelect: () => void;
  onFurnitureInspection?: (key: string | null) => void;
  onBookSelect: (bookId: BookId | null) => void;
  onHover: (controlId: string | null, x: number, y: number) => void;
  onValues: (values: Readonly<Record<string, number>>) => void;
  onUserInput: () => void;
}

interface OriginalMaterialState {
  emissive: THREE.Color;
  emissiveIntensity: number;
}

export interface NodeBaseTransform {
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
  private readonly bookOutline = new THREE.Box3Helper(new THREE.Box3(), '#b83777');
  private readonly camera = new THREE.PerspectiveCamera(40, 1, .05, 80);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly orbit: OrbitControls;
  private readonly artworkCamera: ArtworkCamera;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly callbacks: RoomEngineCallbacks;
  private readonly container: HTMLElement;
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly pointerTap = new PointerTap();
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
  private disposeSurfaceQA: (() => void) | null = null;
  private wallArtwork: WallArtwork | null = null;
  private photoWall: PhotoWall | null = null;
  private bookTargets = new Map<BookId, THREE.Object3D>();
  private selectedBookId: BookId | null = null;
  private bookAssetFailed = false;
  private retiredBookRoot: THREE.Object3D | null = null;
  private expansion: RoomExpansion | null = null;
  private bedroom: BedroomAssembly | null = null;
  private furnitureInspection: string | null = null;
  private overviewFov = 40;
  private framingKey = '';
  private architecture: RoomArchitecture | null = null;
  private wallpaperId: WallpaperId = 'linen';

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
    this.renderer.domElement.setAttribute('aria-label', 'Interactive gaming room: drag to orbit and click a device to adjust it');
    this.container.appendChild(this.renderer.domElement);

    this.camera.layers.disable(HIT_LAYER);
    this.raycaster.layers.set(HIT_LAYER);
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.artworkCamera = new ArtworkCamera(this.camera, this.orbit);
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
    this.bookOutline.visible = false;
    this.bookOutline.renderOrder = 19;
    const bookOutlineMaterial = this.bookOutline.material as THREE.LineBasicMaterial;
    bookOutlineMaterial.depthTest = false;
    bookOutlineMaterial.transparent = true;
    bookOutlineMaterial.opacity = .8;
    this.scene.add(this.bookOutline);
    this.procedural = buildProceduralRoom();
    for (const material of this.procedural.rgbMaterials) {
      this.rgbBaseIntensity.set(material, material.emissiveIntensity);
    }
    this.scene.add(this.procedural.root);
    this.useHitTargets(this.procedural.hitTargets, this.procedural.visualTargets);

    this.state.subscribe((values) => {
      this.procedural?.apply(values);
      this.applyManifestTracks(values);
      this.expansion?.apply(values);
      this.bedroom?.apply(values);
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
    if (usingBlenderAsset) await this.tryLoadExpansion();
    if (usingBlenderAsset && !this.disposed) await this.tryLoadDeskAccessories();
    if (this.disposed) return;
    const variant = this.chooseVariant();
    this.wallArtwork = new WallArtwork(this.manifestRoot ?? this.procedural!.root);
    this.registerArtworkInteraction();
    if (this.photoWall) registerPhotoWallInteraction(this.photoWall.root, this.hitTargets, this.visualTargets);
    this.registerBookInteractions();
    this.callbacks.onProgress(100, usingBlenderAsset ? 'ready' : 'fallbackReady');
    this.callbacks.onReady({
      ready: true,
      usingBlenderAsset,
      variant,
      bookError: this.bookAssetFailed || this.bookTargets.size !== BOOK_IDS.length,
      expansionReady: Boolean(this.expansion),
      expansionError: !this.expansion,
      controlLimits: this.expansion?.contract.controlLimits,
    });
  }

  selectAndToggle(controlId: string) {
    if ((isExpansionControl(controlId) || isBedroomControl(controlId)) && !this.expansion) return;
    if (controlId === ARTWORK_INTERACTION_ID) { this.openArtwork(); return; }
    if (controlId === PHOTO_WALL_INTERACTION_ID) { this.openPhotoWall(); return; }
    if (isBookId(controlId)) { this.openBook(controlId); return; }
    const inspection = this.bedroom?.inspection(controlId);
    if (inspection && this.furnitureInspection !== inspection.key) { this.inspectFurniture(controlId); return; }
    this.userInput();
    this.select(controlId);
    this.state.toggle(controlId, performance.now());
  }

  setControl(controlId: string, value: number) {
    if ((isExpansionControl(controlId) || isBedroomControl(controlId)) && !this.expansion) return;
    this.userInput();
    this.select(controlId);
    this.state.setDirect(controlId, value);
  }

  reset() {
    this.userInput();
    this.clearFurnitureInspection();
    this.artworkCamera.clear();
    this.callbacks.onArtworkClose();
    this.clearBookSelection();
    this.state.reset(performance.now());
    this.applyCamera(this.expansion?.camera ?? this.manifest?.camera ?? DEFAULT_CAMERA);
  }

  resetGroup(controlId: string) {
    this.userInput();
    this.state.resetGroup(controlId, performance.now());
  }

  get artworkAvailable() { return this.wallArtwork?.available ?? false; }
  get photoWallAvailable() { return this.photoWall?.available ?? false; }
  get photos() { return this.photoWall?.status ?? []; }
  replacePhoto(id: PhotoSlot, file: File) { return this.photoWall?.replace(id, file) ?? Promise.resolve(false); }
  resetPhoto(id: PhotoSlot) { return this.photoWall?.reset(id) ?? Promise.resolve(); }
  setPhotoFit(id: PhotoSlot, fit: ArtworkFit) { return this.photoWall?.setFit(id, fit) ?? Promise.resolve(); }
  openPhotoWall() {
    this.clearFurnitureInspection();
    if (!this.photoWall?.available) return;
    this.userInput();
    this.clearBookSelection();
    this.onPointerLeave();
    this.select(null);
    this.callbacks.onArtworkClose();
    // Share the original return point when switching or repeatedly clicking the wall.
    this.artworkCamera.enter();
    this.focusBounds(new THREE.Box3().setFromObject(this.photoWall.root), .85, new THREE.Vector3(0,0,1));
    this.callbacks.onPhotoWallSelect();
  }
  get wallpaperAvailable() { return this.architecture?.available ?? false; }
  get wallpaper() { return this.wallpaperId; }

  setWallpaper(id: WallpaperId) {
    if (!this.architecture?.available) return;
    this.userInput();
    this.wallpaperId = resolveWallpaper(id);
    this.architecture.setWallpaper(this.wallpaperId);
    try { window.localStorage.setItem(WALLPAPER_STORAGE_KEY, this.wallpaperId); } catch { /* Optional local preference. */ }
  }

  viewBookshelf() {
    if (!this.expansion) return;
    this.userInput(); this.closeBook(); this.closeArtwork();
    this.artworkCamera.clear();
    // Stand inside the room on the open side of the right-wall bookcase.
    this.applyCamera({ ...this.expansion.camera, position: [-1.4, 2.05, 2.0], target: [2.05, 1.05, .45], fovDegrees: 43 });
  }

  openArtwork() {
    this.clearFurnitureInspection();
    if (!this.artworkAvailable) return;
    // Share the original return point while switching between inspection panels.
    this.clearBookSelection();
    this.onPointerLeave();
    this.select(null);
    this.artworkCamera.enter();
    this.focusArtwork();
    this.callbacks.onArtworkSelect();
  }

  closeArtwork() {
    if (!this.artworkCamera.active || this.selectedBookId) return;
    this.userInput();
    this.clearFurnitureInspection();
    this.onPointerLeave();
    this.artworkCamera.close(performance.now(), this.reduceMotion ? 0 : 600);
    this.callbacks.onArtworkClose();
  }

  get bookIds() { return BOOK_IDS.filter(id => this.bookTargets.has(id)); }

  private registerBookInteractions() {
    if (!this.manifestRoot) return;
    this.bookTargets = collectBookTargets(this.manifestRoot);
    for (const [id, root] of this.bookTargets) {
      root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.layers.enable(HIT_LAYER);
        object.userData.controlId = id;
        this.hitTargets.push(object);
      });
      this.visualTargets.set(id, [root]);
    }
  }

  openBook(id: BookId) {
    const book = this.bookTargets.get(id);
    if (!book) return;
    this.clearFurnitureInspection();
    this.userInput();
    this.onPointerLeave();
    this.select(null);
    this.callbacks.onArtworkClose();
    this.selectedBookId = id;
    this.bookOutline.box.setFromObject(book).expandByScalar(.003);
    this.bookOutline.visible = true;
    this.artworkCamera.enter();
    const bounds = new THREE.Box3();
    for (const node of this.bookTargets.values()) bounds.expandByObject(node);
    this.focusBounds(bounds, .85, new THREE.Vector3(.25, .5, 1));
    this.callbacks.onBookSelect(id);
  }

  closeBook() {
    if (!this.selectedBookId) return;
    this.userInput();
    this.onPointerLeave();
    this.clearBookSelection();
    this.artworkCamera.close(performance.now(), this.reduceMotion ? 0 : 600);
  }

  private clearBookSelection() {
    this.selectedBookId = null;
    this.bookOutline.visible = false;
    this.callbacks.onBookSelect(null);
  }

  private registerArtworkInteraction() {
    if (!this.artworkAvailable) return;
    const root = this.manifestNodes.get('decor.wall-art.root')
      ?? this.procedural?.root.getObjectByName('art-image-surface')?.parent;
    if (!root) return;
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      // Keep the visible layer; these are real meshes, not hidden furniture proxies.
      object.layers.enable(HIT_LAYER);
      object.userData.controlId = ARTWORK_INTERACTION_ID;
      this.hitTargets.push(object);
    });
    this.visualTargets.set(ARTWORK_INTERACTION_ID, [root]);
  }

  replaceArtwork(file: File) {
    this.userInput();
    return this.wallArtwork?.replace(file) ?? Promise.resolve(false);
  }

  setArtworkFit(fit: ArtworkFit) { this.wallArtwork?.setFit(fit); }
  resetArtwork() { this.wallArtwork?.reset(); }

  inspectFurniture(id: string) {
    const view = this.bedroom?.inspection(id);
    if (!view || view.bounds.isEmpty()) return;
    this.userInput(); this.clearBookSelection(); this.onPointerLeave();
    this.callbacks.onArtworkClose();
    this.furnitureInspection = view.key;
    this.callbacks.onFurnitureInspection?.(view.key);
    this.callbacks.onSelect(id);
    this.artworkCamera.enter();
    this.focusBounds(view.bounds, .7, view.backward);
  }

  closeFurnitureInspection() {
    if (this.furnitureInspection) this.closeArtwork();
  }

  private clearFurnitureInspection() {
    this.furnitureInspection = null;
    this.callbacks.onFurnitureInspection?.(null);
  }

  focusArtwork() {
    const target = this.manifestNodes.get('decor.wall-art.root')
      ?? this.procedural?.root.getObjectByName('art-image-surface');
    if (!target) return;
    this.userInput();
    const bounds = new THREE.Box3().setFromObject(target);
    this.focusBounds(bounds, 1.5, new THREE.Vector3(.12, .16, 1));
  }

  private focusBounds(bounds: THREE.Box3, minimumDistance: number, backward: THREE.Vector3) {
    this.camera.clearViewOffset();
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const viewport = artworkViewport(width, height);
    const direction = new THREE.Spherical().setFromVector3(backward);
    direction.theta = THREE.MathUtils.clamp(direction.theta, this.orbit.minAzimuthAngle, this.orbit.maxAzimuthAngle);
    direction.phi = THREE.MathUtils.clamp(direction.phi, this.orbit.minPolarAngle, this.orbit.maxPolarAngle);
    backward.setFromSpherical(direction).normalize();
    const right = new THREE.Vector3().crossVectors(this.camera.up, backward).normalize();
    const up = new THREE.Vector3().crossVectors(backward, right).normalize();
    // Project all three dimensions: a side-facing cabinet cannot use its world-X width alone.
    const projected = (axis: THREE.Vector3) => size.x * Math.abs(axis.x) + size.y * Math.abs(axis.y) + size.z * Math.abs(axis.z);
    const visibleHeight = Math.max(projected(up) * height / (viewport.height * .82), projected(right) * height / (viewport.width * .82));
    const distance = Math.max(minimumDistance, visibleHeight / (2 * Math.tan(THREE.MathUtils.degToRad(43 / 2))) + projected(backward) / 2);
    const actualHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(43 / 2));
    const focus = center.clone()
      .addScaledVector(right, (.5 - viewport.centerX / width) * actualHeight * this.camera.aspect)
      .addScaledVector(up, (viewport.centerY / height - .5) * actualHeight);
    this.artworkCamera.focus({
      position: focus.clone().addScaledVector(backward, distance),
      target: focus,
      fov: 43,
    }, performance.now(), this.reduceMotion ? 0 : 600);
  }

  setSceneLabel(label: string) {
    this.renderer.domElement.setAttribute('aria-label', label);
  }

  runDemo() {
    if (this.reduceMotion) return;
    this.closeBook();
    this.closeArtwork();
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
      [4650, [['chair.moveX', .25], ['chair.moveY', -.35], ['chair.swivel', 45], ['chair.headrest', 1], ['chair.lumbar', 1]]],
    ];
    if (this.expansion) steps.push(
      [5900, [['blinds.tilt', -70]]],
      [6900, [['blinds.raise', 1]]],
      [8500, [['bookshelf.leftDoor', 1], ['bookshelf.rightDoor', 1], ['floorLamp.power', 0], ['bookshelf.lights', 0]]],
    );
    steps.push([this.expansion ? 10500 : 6500, DEFAULT_CONTROLS.map(control => [control.id, control.default] as [string, number])]);
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
    this.disposeSurfaceQA?.();
    this.wallArtwork?.dispose();
    this.photoWall?.dispose();
    this.architecture?.dispose();
    this.procedural?.dispose();
    this.procedural = null;
    if (this.manifestRoot) disposeObject(this.manifestRoot);
    if (this.retiredBookRoot) disposeObject(this.retiredBookRoot);
    this.renderer.dispose();
    this.hoverOutline.geometry.dispose();
    (this.hoverOutline.material as THREE.Material).dispose();
    this.bookOutline.geometry.dispose();
    (this.bookOutline.material as THREE.Material).dispose();
    this.renderer.domElement.remove();
  }

  private async tryLoadBlenderAsset(): Promise<boolean> {
    try {
      this.callbacks.onProgress(18, 'manifest');
      const response = await fetch('/room/room-manifest.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
      const manifest = await response.json() as RoomManifestV1;
      validateManifest(manifest);
      const variantName = this.chooseVariant();
      const variant = manifest.variants[variantName];
      this.callbacks.onProgress(26, variantName);

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
            this.callbacks.onProgress(26 + Math.round(ratio * 66), 'assets');
          },
          reject,
        );
      });
      ktx2.dispose();
      if (this.disposed) {
        disposeObject(gltf.scene);
        return false;
      }
      // A small independently versioned prop replaces only the old fused book stack.
      // Keep the working room intact if this optional asset cannot be loaded.
      let bookProp: THREE.Object3D | null = null;
      try {
        bookProp = (await loader.loadAsync(bookPropAsset.url)).scene;
        if (this.disposed) {
          disposeObject(bookProp);
          disposeObject(gltf.scene);
          return false;
        }
        this.retiredBookRoot = installBookProp(gltf.scene, bookProp).replaced;
      } catch (error) {
        if (bookProp) disposeObject(bookProp);
        this.bookAssetFailed = true;
        console.error('[room] Independent books could not be loaded.', error);
      }
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

  private async tryLoadDeskAccessories() {
    let root: THREE.Object3D | null = null;
    let personalRoot: THREE.Object3D | null = null;
    let personalParts: THREE.Object3D[] = [];
    try {
      const response = await fetch('/room/desk-accessories/manifest.json', { cache: 'no-store' });
      if (!response.ok) throw Error(`Desk accessories HTTP ${response.status}`);
      const spec = await response.json() as DeskAccessoryContract;
      root = (await new GLTFLoader().loadAsync(spec.asset.url)).scene;
      if (this.disposed) { disposeObject(root); return; }
      installDeskAccessories(this.manifestRoot!, root, spec);
      const personalResponse = await fetch('/room/personal-corner/manifest.json', { cache: 'no-store' });
      if (!personalResponse.ok) throw Error(`Personal corner HTTP ${personalResponse.status}`);
      const personalSpec = await personalResponse.json() as PersonalCornerContract;
      personalRoot = (await new GLTFLoader().loadAsync(personalSpec.asset.url)).scene;
      if (this.disposed) { root.removeFromParent(); disposeObject(root); disposeObject(personalRoot); return; }
      const wall = this.expansion?.nodes.get('architecture.backWall.v6');
      if (!wall) throw Error('Photo wall attachment missing');
      personalParts = installPersonalCorner(this.manifestRoot!, wall, personalRoot, personalSpec);
      const guard = new DeskMotionGuard(this.manifestRoot!, this.state.snapshot(), values => this.applyManifestTracks(values));
      this.state.setConstraint(values => guard.resolve(this.bedroom?.constrain(values) ?? values));
      this.photoWall = new PhotoWall(personalParts[1]);
      await this.photoWall.restore();
    } catch (error) {
      for (const part of personalParts) { part.removeFromParent(); disposeObject(part); }
      if (personalRoot) disposeObject(personalRoot);
      if (root) { root.removeFromParent(); disposeObject(root); }
      console.error('[room] Desk accessories could not be installed safely.', error);
    }
  }

  private async tryLoadExpansion() {
    let root: THREE.Object3D | null = null;
    const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(this.renderer);
    try {
      const response = await fetch('/room/expansion/manifest.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Expansion HTTP ${response.status}`);
      const contract = await response.json() as ExpansionContract;
      validateExpansionContract(contract);
      if (this.disposed) return;
      const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
      root = (await loader.loadAsync(contract.asset.url)).scene;
      if (this.disposed) { disposeObject(root); return; }
      this.expansion = new RoomExpansion(root, contract, this.manifestRoot!);
      const bedroomResponse = await fetch('/room/bedroom/manifest.json', { cache: 'no-store' });
      if (!bedroomResponse.ok) throw Error('B7 furniture unavailable');
      const bedroomSpec = await bedroomResponse.json() as BedroomContract;
      const bedroomRoot = (await loader.loadAsync(bedroomSpec.asset.url)).scene;
      if (this.disposed) { disposeObject(bedroomRoot); return; }
      this.bedroom = new BedroomAssembly(bedroomRoot, bedroomSpec, this.manifestRoot!);
      this.bedroom.apply(this.state.snapshot());
      this.state.setConstraint(values => this.bedroom?.constrain(values) ?? { ...values });
      if (contract.architecture) {
        this.architecture = new RoomArchitecture(this.manifestRoot!, contract.architecture);
        try { this.wallpaperId = resolveWallpaper(window.localStorage.getItem(WALLPAPER_STORAGE_KEY)); } catch { /* Keep linen. */ }
        this.architecture.setWallpaper(this.wallpaperId);
      }
      this.expansion.apply(this.state.snapshot());
      this.state.setLimits(contract.controlLimits ?? {});
      this.applyCamera(this.expansion.camera);
      // Publish pick targets only after physical limits and the rest of the addon validate.
      this.hitTargets.push(...this.expansion.hitTargets);
      for (const [id, targets] of this.expansion.visualTargets) this.visualTargets.set(id, targets);
      this.hitTargets.push(...this.bedroom.hitTargets);
      for (const [id, targets] of this.bedroom.visualTargets) this.visualTargets.set(id, targets);
    } catch (error) {
      if (this.bedroom) { this.bedroom.detach(); disposeObject(this.bedroom.root); this.bedroom = null; }
      this.architecture?.dispose();
      this.architecture = null;
      this.expansion?.detach();
      this.expansion = null;
      if (root) disposeObject(root);
      console.error('[room] Window, floor lamp and bookcase could not be loaded; the original room is preserved.', error);
    } finally {
      ktx2.dispose();
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

    const requiredControls = new Set(BASE_PRIMARY_CONTROL_IDS);
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
    for (const id of BASE_PRIMARY_CONTROL_IDS) {
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
    if (process.env.NODE_ENV === 'development' && new URLSearchParams(location.search).has('surfaceQA')) {
      void import('./surface-qa').then(({ mountSurfaceQA }) => {
        if (this.disposed) return;
        this.disposeSurfaceQA = mountSurfaceQA(root, this.scene, this.camera, this.orbit);
        this.lastInputAt = Number.POSITIVE_INFINITY;
      });
    }
  }

  private applyManifestTracks(values: Readonly<Record<string, number>>) {
    if (!this.manifest) return;
    const composed = new Map<string, NodeBaseTransform>();
    for (const definition of this.manifest.controls) {
      for (const track of definition.tracks ?? []) {
        const [defaultNormalized, normalized] = controlInputRange(definition, values, track);
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
    this.overviewFov = definition.fovDegrees ?? 40;
    this.framingKey = '';
    this.camera.fov = overviewFraming(this.overviewFov, this.container.clientWidth, this.container.clientHeight).fov;
    this.camera.near = definition.near ?? .05;
    this.camera.far = definition.far ?? 80;
    this.camera.updateProjectionMatrix();
    this.orbit?.target.set(...definition.target);
    if (this.orbit) {
      this.orbit.minDistance = Math.max(3, definition.minDistance);
      this.orbit.maxDistance = Math.min(8.5, definition.maxDistance);
      this.orbit.minPolarAngle = Math.max(.65, definition.minPolar);
      this.orbit.maxPolarAngle = Math.min(1.48, definition.maxPolar);
      this.orbit.minAzimuthAngle = this.architecture ? -Infinity : Math.max(-1.05, definition.minAzimuth);
      this.orbit.maxAzimuthAngle = this.architecture ? Infinity : Math.min(1.05, definition.maxAzimuth);
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
    canvas.addEventListener('pointercancel', this.onPointerLeave);
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
    canvas.removeEventListener('pointercancel', this.onPointerLeave);
    canvas.removeEventListener('wheel', this.onInteraction);
    this.orbit.removeEventListener('start', this.onInteraction);
    window.removeEventListener('resize', this.resize);
  }

  private pickControl(event: PointerEvent): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.scene.updateMatrixWorld();
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // Wall-mounted additions live in the expansion, alongside the base room root.
    return pickRoomControl(this.raycaster, this.scene, this.hitTargets, this.visualTargets);
  }

  private onPointerMove = (event: PointerEvent) => {
    this.pointerTap.move(event);
    const controlId = this.pickControl(event);
    this.setHovered(controlId);
    this.callbacks.onHover(controlId, event.clientX, event.clientY);
    this.renderer.domElement.style.cursor = controlId ? 'pointer' : 'grab';
  };

  private onPointerDown = (event: PointerEvent) => {
    this.artworkCamera.finish();
    this.pointerTap.down(event, this.pickControl(event));
    this.userInput();
  };

  private onPointerUp = (event: PointerEvent) => {
    const controlId = this.pointerTap.up(event, this.pickControl(event));
    if (controlId) this.selectAndToggle(controlId);
  };

  private onPointerLeave = () => {
    this.pointerTap.cancel();
    this.setHovered(null);
    this.callbacks.onHover(null, 0, 0);
    this.renderer.domElement.style.cursor = 'grab';
  };
  private onInteraction = () => {
    this.artworkCamera.finish();
    this.userInput();
  };

  private userInput() {
    this.cancelDemo();
    this.lastInputAt = performance.now();
    this.orbit.autoRotate = false;
    this.callbacks.onUserInput();
  }

  private select(controlId: string | null) {
    if (controlId) this.closeBook();
    if (controlId && this.artworkCamera.active && (!this.furnitureInspection || this.bedroom?.inspection(controlId)?.key !== this.furnitureInspection)) this.closeArtwork();
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
    // Outline the artwork without tinting the print or its shared fallback materials.
    if (controlId === ARTWORK_INTERACTION_ID || controlId === PHOTO_WALL_INTERACTION_ID || isBookId(controlId) || isExpansionControl(controlId) || isBedroomControl(controlId)) { this.updateHoverOutline(); return; }
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
    for (const root of this.visualTargets.get(this.hoveredControl) ?? []) if (isVisibleInScene(root)) box.expandByObject(root);
    this.hoverOutline.visible = !box.isEmpty();
    if (!box.isEmpty()) this.hoverOutline.box.copy(box).expandByScalar(isBookId(this.hoveredControl) ? .003 : .012);
  }

  private animate = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.animate);
    const now = performance.now();
    const delta = Math.min(.05, Math.max(0, (now - this.lastFrameAt) / 1000));
    this.lastFrameAt = now;
    this.state.tick(now);
    if (!this.disposeSurfaceQA && !this.reduceMotion && !this.artworkCamera.active && !this.artworkCamera.returning
        && now - this.lastInputAt > 8000 && !this.state.isAnimating()) {
      this.orbit.autoRotate = true;
    }
    if (!this.artworkCamera.tick(now)) this.orbit.update(delta);
    this.updateResponsiveFraming();
    this.architecture?.update(this.camera.position);
    if (this.hoveredControl) this.updateHoverOutline();
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
    this.framingKey = '';
    this.updateResponsiveFraming();
  };

  private updateResponsiveFraming() {
    const width = Math.max(1, this.container.clientWidth), height = Math.max(1, this.container.clientHeight);
    const inspecting = this.artworkCamera.active || this.artworkCamera.returning;
    const key = `${width}/${height}/${inspecting}/${this.overviewFov}`;
    if (key === this.framingKey) return;
    this.framingKey = key;
    if (inspecting) { this.camera.clearViewOffset(); return; }
    const framing = overviewFraming(this.overviewFov, width, height);
    this.camera.fov = framing.fov;
    if (framing.offsetY) this.camera.setViewOffset(width, height, 0, framing.offsetY, width, height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private chooseVariant(): 'desktop' | 'low' {
    if (process.env.NODE_ENV === 'development') {
      const inspectionVariant = new URLSearchParams(location.search).get('qaVariant');
      if (inspectionVariant === 'desktop' || inspectionVariant === 'low') return inspectionVariant;
    }
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

export function controlInputRange(control: ControlDefinition, values: Readonly<Record<string, number>>, track?: TransformTrack): [number, number] {
  if (track?.input) {
    const input = track.input;
    const value = input.terms.reduce((sum, term) => {
      const v = values[term.controlId] ?? 0;
      const directed = term.mode === 'positive' ? Math.max(v, 0) : term.mode === 'negative' ? Math.min(v, 0) : v;
      return sum + term.scale * directed;
    }, 0);
    const range = input.max - input.min;
    return [(input.default - input.min) / range, THREE.MathUtils.clamp((value - input.min) / range, 0, 1)];
  }
  const range = Math.max(1e-8, control.max - control.min);
  return [(control.default - control.min) / range, ((values[control.id] ?? control.default) - control.min) / range];
}

export function composeTrackDelta(
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

export function sampleTrack(track: TransformTrack, t: number) {
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

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
}
