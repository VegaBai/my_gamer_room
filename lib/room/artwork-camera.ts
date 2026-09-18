import { PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

interface CameraView {
  position: Vector3;
  target: Vector3;
  fov: number;
  zoom: number;
  minDistance: number;
}

/** One temporary artwork view, with a single return point across repeated clicks. */
export class ArtworkCamera {
  private saved: CameraView | null = null;
  private transition: { from: CameraView; to: CameraView; start: number; duration: number } | null = null;

  constructor(private camera: PerspectiveCamera, private orbit: OrbitControls) {}

  get active() { return this.saved !== null; }
  get returning() { return this.transition !== null && !this.active; }

  enter() {
    // Reopening during zoom-out must still return to the original room view.
    this.saved ??= this.transition?.to ?? this.capture();
    this.transition = null;
    this.apply(this.capture());
  }

  focus(view: Pick<CameraView, 'position' | 'target' | 'fov'>, now: number, duration = 600) {
    const from = this.capture();
    const to = { ...from, ...view, position: view.position.clone(), target: view.target.clone(), minDistance: .65 };
    if (duration <= 0) { this.transition = null; this.apply(to); return; }
    this.transition = { from, to, start: now, duration };
  }

  close(now: number, duration = 600) {
    if (!this.saved) return;
    const to = this.saved;
    this.saved = null;
    if (duration <= 0) { this.transition = null; this.apply(to); return; }
    this.transition = { from: this.capture(), to, start: now, duration };
  }

  tick(now: number) {
    const transition = this.transition;
    if (!transition) return false;
    const t = Math.min(1, Math.max(0, (now - transition.start) / transition.duration));
    const eased = t * t * (3 - 2 * t);
    const { from, to } = transition;
    this.apply(t === 1 ? to : {
      position: from.position.clone().lerp(to.position, eased),
      target: from.target.clone().lerp(to.target, eased),
      fov: from.fov + (to.fov - from.fov) * eased,
      zoom: from.zoom + (to.zoom - from.zoom) * eased,
      minDistance: Math.min(from.minDistance, to.minDistance),
    });
    if (t === 1) this.transition = null;
    return true;
  }

  finish() {
    if (!this.transition) return;
    // During zoom-in, manual camera input takes over where the camera currently is.
    const to = this.active ? this.capture() : this.transition.to;
    this.transition = null;
    this.apply(to);
  }

  clear() {
    this.saved = null;
    this.transition = null;
    this.apply(this.capture());
  }

  private capture(): CameraView {
    return {
      position: this.camera.position.clone(), target: this.orbit.target.clone(),
      fov: this.camera.fov, zoom: this.camera.zoom, minDistance: this.orbit.minDistance,
    };
  }

  private apply(view: CameraView) {
    // Flush leftover drag inertia before setting the pose, so it cannot shift the return point.
    const damping = this.orbit.enableDamping;
    this.orbit.enableDamping = false;
    this.orbit.autoRotate = false;
    this.orbit.update();
    this.camera.position.copy(view.position);
    this.camera.fov = view.fov;
    this.camera.zoom = view.zoom;
    this.camera.updateProjectionMatrix();
    this.orbit.target.copy(view.target);
    this.orbit.minDistance = view.minDistance;
    this.orbit.update();
    this.orbit.enableDamping = damping;
  }
}
