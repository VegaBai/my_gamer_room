import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ArtworkCamera } from '../lib/room/artwork-camera';

function setup() {
  const camera = new PerspectiveCamera(40, 1.5, .05, 80);
  camera.position.set(2, 2.4, 5);
  const orbit = new OrbitControls(camera);
  orbit.target.set(.2, 1, 0);
  orbit.minDistance = 3;
  orbit.enableDamping = true;
  orbit.update();
  const original = camera.position.clone();
  const originalTarget = orbit.target.clone();
  const controller = new ArtworkCamera(camera, orbit);
  const focus = () => {
    camera.position.set(1.3, 1.9, 1.6);
    orbit.target.set(1, 1.7, 0);
    camera.fov = 43;
    orbit.minDistance = .65;
    orbit.update();
  };
  return { camera, orbit, original, originalTarget, controller, focus };
}

describe('wall art camera round trip', () => {
  const artView = { position: new Vector3(1.3, 1.9, 1.6), target: new Vector3(1, 1.7, 0), fov: 43 };

  it('zooms in from the current view without a first-frame jump, then returns', () => {
    const { camera, original, controller } = setup();
    controller.enter(); controller.focus(artView, 100);
    expect(camera.position.distanceTo(original)).toBeLessThan(1e-10);
    controller.tick(400);
    expect(camera.position.distanceTo(original)).toBeGreaterThan(.1);
    expect(camera.position.distanceTo(artView.position)).toBeGreaterThan(.1);
    controller.tick(700);
    expect(camera.position.distanceTo(artView.position)).toBeLessThan(1e-10);
    expect(camera.fov).toBe(43);
    controller.close(800); controller.tick(1400);
    expect(camera.position.distanceTo(original)).toBeLessThan(1e-10);
  });

  it('can reverse a partial zoom-in and reopen mid-return without losing the original view', () => {
    const { camera, original, controller } = setup();
    controller.enter(); controller.focus(artView, 0); controller.tick(200);
    const partial = camera.position.clone();
    controller.close(200);
    expect(camera.position.distanceTo(partial)).toBeLessThan(1e-10);
    controller.tick(400);
    controller.enter(); controller.focus(artView, 400); controller.tick(1000);
    controller.close(1000); controller.tick(1600);
    expect(camera.position.distanceTo(original)).toBeLessThan(1e-10);
  });

  it('allows manual takeover during zoom-in without snapping to its endpoint', () => {
    const { camera, original, controller } = setup();
    controller.enter(); controller.focus(artView, 0); controller.tick(200);
    const partial = camera.position.clone();
    controller.finish(); controller.tick(600);
    expect(camera.position.distanceTo(partial)).toBeLessThan(1e-10);
    controller.close(700, 0);
    expect(camera.position.distanceTo(original)).toBeLessThan(1e-10);
    controller.enter(); controller.focus(artView, 800, 0);
    expect(camera.position.distanceTo(artView.position)).toBeLessThan(1e-10);
  });

  it('smoothly restores the custom pre-open pose, lens and zoom limits', () => {
    const { camera, orbit, original, originalTarget, controller, focus } = setup();
    controller.enter(); focus();
    const focused = camera.position.clone();
    controller.close(100);
    controller.tick(400);
    expect(camera.position.distanceTo(original)).toBeGreaterThan(.1);
    expect(camera.position.distanceTo(focused)).toBeGreaterThan(.1);
    controller.tick(700);
    expect(camera.position.distanceTo(original)).toBeLessThan(1e-10);
    expect(orbit.target.distanceTo(originalTarget)).toBeLessThan(1e-10);
    expect(camera.fov).toBe(40);
    expect(orbit.minDistance).toBe(3);
    expect(orbit.enableDamping).toBe(true);
    expect(controller.returning).toBe(false);
    expect(controller.active).toBe(false);
  });

  it('does not replace the return point on repeated opens or a quick reopen', () => {
    const { camera, original, controller, focus } = setup();
    controller.enter(); focus(); controller.enter(); focus();
    controller.close(0); controller.tick(200);
    controller.enter(); focus(); controller.close(250); controller.tick(850);
    expect(camera.position.distanceTo(original)).toBeLessThan(1e-10);
    controller.close(900); // Redundant close is a no-op.
    expect(controller.returning).toBe(false);
  });

  it('keeps the original room view when switching between books and wall art', () => {
    const { camera, original, controller } = setup();
    const bookView = { position: new Vector3(1.1, 1.2, .8), target: new Vector3(1, .9, 0), fov: 43 };
    controller.enter(); controller.focus(bookView, 0); controller.tick(600);
    controller.enter(); controller.focus(artView, 700); controller.tick(1300);
    controller.enter(); controller.focus(bookView, 1400); controller.tick(2000);
    controller.close(2100); controller.tick(2700);
    expect(camera.position.distanceTo(original)).toBeLessThan(1e-10);
  });

  it('supports reduced motion and preserves the new viewport aspect', () => {
    const { camera, original, controller, focus } = setup();
    controller.enter(); focus(); camera.aspect = .5;
    controller.close(0, 0);
    expect(camera.position.distanceTo(original)).toBeLessThan(1e-10);
    expect(camera.aspect).toBe(.5);
    expect(controller.returning).toBe(false);
  });

  it('lets reset discard an old return view and finishes animation before manual control', () => {
    const { camera, original, controller, focus } = setup();
    controller.enter(); focus(); controller.close(0); controller.tick(200);
    controller.finish();
    expect(camera.position.distanceTo(original)).toBeLessThan(1e-10);
    controller.enter(); focus(); controller.close(300);
    controller.clear();
    camera.position.set(0, 3, 6);
    controller.close(400); controller.tick(1000);
    expect(camera.position.toArray()).toEqual([0, 3, 6]);
    expect(controller.active).toBe(false);
  });
});
