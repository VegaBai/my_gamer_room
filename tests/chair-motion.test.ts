import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_CONTROLS } from '../lib/room/default-controls';
import { composeTrackDelta, controlInputRange } from '../lib/room/room-engine';
import { RoomStateMachine } from '../lib/room/state-machine';
import type { TransformTrack } from '../lib/room/types';

describe('chair movement with swivel and removable pillows', () => {
  it('adds both ground offsets without rotating the base or changing child-local controls', () => {
    const root = new THREE.Group();
    const base = new THREE.Group();
    const swivel = new THREE.Group();
    const pillow = new THREE.Group();
    root.add(base, swivel);
    swivel.add(pillow);
    swivel.rotation.y = Math.PI / 4;
    pillow.position.set(.2, 1.15, .12);
    root.updateMatrixWorld(true);
    const pillowBefore = pillow.getWorldPosition(new THREE.Vector3());
    const localBefore = pillow.matrix.clone();
    const transform = { position: root.position, quaternion: root.quaternion, scale: root.scale };
    for (const id of ['chair.moveX', 'chair.moveY']) {
      const control = DEFAULT_CONTROLS.find(item => item.id === id)!;
      const track: TransformTrack = {
        nodeId: 'chair.root', path: 'position', samples: [control.min, 0, control.max].map(value => ({
          t: (value - control.min) / (control.max - control.min),
          value: id === 'chair.moveX' ? [value, 0, 0] : [0, 0, -value],
        })),
      };
      composeTrackDelta(transform, track, ...controlInputRange(control, { 'chair.moveX': .25, 'chair.moveY': -.35 }));
    }
    root.updateMatrixWorld(true);
    expect(root.position.x).toBeCloseTo(.25);
    expect(root.position.y).toBeCloseTo(0);
    expect(root.position.z).toBeCloseTo(.35);
    expect(base.getWorldQuaternion(new THREE.Quaternion()).angleTo(new THREE.Quaternion())).toBeCloseTo(0);
    expect(pillow.matrix.equals(localBefore)).toBe(true);
    const delta = pillow.getWorldPosition(new THREE.Vector3()).sub(pillowBefore);
    expect(delta.x).toBeCloseTo(.25);
    expect(delta.y).toBeCloseTo(0);
    expect(delta.z).toBeCloseTo(.35);
  });

  it('clamps ground movement and resets it along with swivel and both pillows', () => {
    const state = new RoomStateMachine(DEFAULT_CONTROLS);
    state.setDirect('chair.moveX', 10);
    state.setDirect('chair.moveY', -10);
    state.setDirect('chair.swivel', 30);
    state.setDirect('chair.headrest', 1);
    state.setDirect('chair.lumbar', 1);
    expect(state.getValue('chair.moveX')).toBe(.35);
    expect(state.getValue('chair.moveY')).toBe(-.45);
    state.reset(0);
    state.tick(1500);
    for (const id of ['chair.moveX', 'chair.moveY', 'chair.swivel', 'chair.headrest', 'chair.lumbar']) {
      expect(state.getValue(id)).toBe(0);
    }
  });
});
