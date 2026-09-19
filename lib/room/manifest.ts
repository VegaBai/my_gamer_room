import { BASE_PRIMARY_CONTROL_IDS } from './default-controls';
import type { RoomManifestV1 } from './types';

export function validateManifest(manifest: RoomManifestV1) {
  if (manifest.schemaVersion !== 1) throw new Error('Unsupported room manifest schema');
  if (!manifest.pipelineVersion || !manifest.sourceBlendSha256) {
    throw new Error('Manifest provenance is missing');
  }
  if (!manifest.variants?.desktop?.url || !manifest.variants?.low?.url) {
    throw new Error('Room asset variants are missing');
  }

  const controls = new Map<string, RoomManifestV1['controls'][number]>();
  for (const control of manifest.controls ?? []) {
    if (controls.has(control.id)) throw new Error(`Duplicate manifest control: ${control.id}`);
    if (control.min > control.default || control.default > control.max) {
      throw new Error(`Control default is outside its range: ${control.id}`);
    }
    controls.set(control.id, control);
    for (const track of control.tracks ?? []) {
      if (!track.nodeId) throw new Error(`Track node is missing for ${control.id}`);
      if (track.samples.length < 2 || track.samples[0].t !== 0 || track.samples.at(-1)?.t !== 1) {
        throw new Error(`Invalid track endpoints for ${control.id}`);
      }
      let previous = -1;
      for (const sample of track.samples) {
        if (sample.t <= previous || sample.t < 0 || sample.t > 1) {
          throw new Error(`Track times are not strictly increasing for ${control.id}`);
        }
        const expected = track.path === 'quaternion' ? 4 : 3;
        if (sample.value.length !== expected || sample.value.some((value) => !Number.isFinite(value))) {
          throw new Error(`Invalid track value for ${control.id}`);
        }
        previous = sample.t;
      }
    }
  }

  const hitControlIds = new Set<string>();
  for (const control of controls.values()) for (const track of control.tracks ?? []) {
    if (!track.input) continue;
    const input = track.input;
    if (![input.min, input.max, input.default].every(Number.isFinite) || input.min >= input.max || input.default < input.min || input.default > input.max || !Array.isArray(input.terms) || !input.terms.length) {
      throw new Error(`Invalid coupled track range: ${control.id}`);
    }
    const seen = new Set<string>();
    for (const term of input.terms) {
      if (!controls.has(term.controlId) || seen.has(term.controlId) || !Number.isFinite(term.scale) || !['value', 'positive', 'negative'].includes(term.mode)) {
        throw new Error(`Invalid coupled track input: ${control.id}`);
      }
      seen.add(term.controlId);
    }
  }
  for (const target of manifest.hitTargets ?? []) {
    if (!controls.has(target.controlId)) throw new Error(`Unknown hit target control: ${target.controlId}`);
    if (target.size.some((value) => !Number.isFinite(value) || value <= 0)) {
      throw new Error(`Invalid hit target size: ${target.controlId}`);
    }
    hitControlIds.add(target.controlId);
  }
  const visualControlIds = new Set(manifest.visualTargets?.map((target) => target.controlId) ?? []);
  for (const id of BASE_PRIMARY_CONTROL_IDS) {
    const control = controls.get(id);
    if (!control?.tracks?.length) throw new Error(`Primary control has no tracks: ${id}`);
    if (!hitControlIds.has(id)) throw new Error(`Primary control has no hit target: ${id}`);
    if (!visualControlIds.has(id)) throw new Error(`Primary control has no visual target: ${id}`);
  }
}
