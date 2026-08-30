import { describe, expect, it } from 'vitest';
import { DEFAULT_CAMERA, DEFAULT_CONTROLS, PRIMARY_CONTROL_IDS } from '../lib/room/default-controls';
import { validateManifest } from '../lib/room/manifest';
import type { RoomManifestV1 } from '../lib/room/types';

function makeManifest(): RoomManifestV1 {
  return {
    schemaVersion: 1,
    sourceBlendSha256: 'a'.repeat(64),
    pipelineVersion: '1.0.0',
    variants: {
      desktop: { url: '/room/room-desktop-a.glb', sha256: 'b'.repeat(64) },
      low: { url: '/room/room-low-c.glb', sha256: 'c'.repeat(64) },
    },
    camera: DEFAULT_CAMERA,
    controls: DEFAULT_CONTROLS.map((control) => ({
      ...control,
      tracks: control.primary ? [{
        nodeId: `node.${control.id}`,
        path: 'position' as const,
        samples: [
          { t: 0, value: [0, 0, 0] },
          { t: 1, value: [0, 0, 1] },
        ],
      }] : [],
    })),
    hitTargets: PRIMARY_CONTROL_IDS.map((controlId) => ({
      controlId,
      center: [0, 0, 0],
      size: [1, 1, 1],
    })),
    visualTargets: PRIMARY_CONTROL_IDS.map((controlId) => ({
      controlId,
      nodeIds: [`node.${controlId}`],
    })),
  };
}

describe('room manifest validation', () => {
  it('accepts a complete versioned semantic contract', () => {
    expect(() => validateManifest(makeManifest())).not.toThrow();
  });

  it('rejects duplicate and unknown semantic ids', () => {
    const duplicate = makeManifest();
    duplicate.controls.push({ ...duplicate.controls[0] });
    expect(() => validateManifest(duplicate)).toThrow('Duplicate manifest control');

    const unknown = makeManifest();
    unknown.hitTargets[0].controlId = 'unknown.control';
    expect(() => validateManifest(unknown)).toThrow('Unknown hit target control');
  });

  it('rejects missing primary tracks, hit proxies, and invalid samples', () => {
    const noTrack = makeManifest();
    noTrack.controls.find((control) => control.id === 'desk.lift')!.tracks = [];
    expect(() => validateManifest(noTrack)).toThrow('Primary control has no tracks');

    const noHit = makeManifest();
    noHit.hitTargets = noHit.hitTargets.filter((target) => target.controlId !== 'desk.lift');
    expect(() => validateManifest(noHit)).toThrow('Primary control has no hit target');

    const badSamples = makeManifest();
    badSamples.controls[0].tracks![0].samples[1].t = .7;
    expect(() => validateManifest(badSamples)).toThrow('Invalid track endpoints');
  });
});
