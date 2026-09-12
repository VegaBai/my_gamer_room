import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { composeTrackDelta, sampleTrack } from '../lib/room/room-engine';
import type { TransformTrack } from '../lib/room/types';
import { RoomStateMachine } from '../lib/room/state-machine';
import { DEFAULT_CONTROLS } from '../lib/room/default-controls';

const quaternion = (degrees: number): [number, number, number, number] =>
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), degrees * Math.PI / 180).toArray();
const track = (degrees: number[]): TransformTrack => ({
  nodeId: 'joint', path: 'quaternion',
  samples: degrees.map((value, index) => ({ t: index / (degrees.length - 1), value: quaternion(value) })),
});
const transform = () => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1) });
const angle = (q: THREE.Quaternion) => new THREE.Euler().setFromQuaternion(q, 'YXZ').y * 180 / Math.PI;

describe('directional monitor joint sampling', () => {
  it('preserves the exact neutral knot instead of blending inward and outward pivots', () => {
    const inward = track([0, 0, 15]);
    const outward = track([-15, 0, 0]);
    for (const [t, arm, screen] of [[0, 0, -15], [.25, 0, -7.5], [.5, 0, 0], [.75, 7.5, 0], [1, 15, 0]]) {
      expect(angle(new THREE.Quaternion(...sampleTrack(inward, t)))).toBeCloseTo(arm, 6);
      expect(angle(new THREE.Quaternion(...sampleTrack(outward, t)))).toBeCloseTo(screen, 6);
    }
  });

  it('composes inward trim with arm motion without double-applying the neutral pose', () => {
    const joint = transform();
    composeTrackDelta(joint, track([0, 45, 90]), 0, .5);
    composeTrackDelta(joint, track([0, 0, 15]), .5, .75);
    expect(angle(joint.quaternion)).toBeCloseTo(52.5, 6);
    const reset = transform();
    composeTrackDelta(reset, track([0, 45, 90]), 0, 0);
    composeTrackDelta(reset, track([0, 0, 15]), .5, .5);
    expect(angle(reset.quaternion)).toBeCloseTo(0, 6);
  });

  it('is continuous through the inward/outward transition and clamps endpoints', () => {
    const motion = track([0, 0, 15]);
    const before = new THREE.Quaternion(...sampleTrack(motion, .5 - 1e-7));
    const after = new THREE.Quaternion(...sampleTrack(motion, .5 + 1e-7));
    expect(before.angleTo(after)).toBeLessThan(1e-6);
    expect(sampleTrack(motion, -1)).toEqual(sampleTrack(motion, 0));
    expect(sampleTrack(motion, 2)).toEqual(sampleTrack(motion, 1));
  });

  it('reverses monitor motion in place, accepts trim takeover, and resets during desk lift', () => {
    const machine = new RoomStateMachine(DEFAULT_CONTROLS);
    machine.toggle('monitors.face', 0);
    machine.toggle('desk.lift', 0);
    machine.tick(360);
    const faceBefore = machine.getValue('monitors.face');
    machine.toggle('monitors.face', 360);
    expect(machine.getValue('monitors.face')).toBe(faceBefore);
    machine.setDirect('monitors.leftTrim', 9.5);
    machine.setDirect('monitors.rightTrim', -12);
    expect(machine.isAnimating('desk.lift')).toBe(true);
    machine.setDirect('monitors.face', .73);
    expect(machine.isAnimating('monitors.face')).toBe(false);
    machine.tick(650);
    const beforeReset = machine.snapshot();
    machine.reset(650);
    expect(machine.snapshot()).toEqual(beforeReset);
    machine.tick(2000);
    for (const control of DEFAULT_CONTROLS) expect(machine.getValue(control.id)).toBe(control.default);
  });
});
