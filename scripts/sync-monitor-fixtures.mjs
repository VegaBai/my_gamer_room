import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Record independently evaluated Blender poses, never runtime-computed results.
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const auditPath = process.argv[2] ?? path.resolve(webRoot, '../.tmp/web-export/monitor-kinematics-high.json');
const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
if (audit.schema !== 'monitor-kinematics-audit/2' || !audit.passed || !audit.allDriversLiveAndValidated) {
  throw new Error('A passing, live-driver-validated Blender audit is required.');
}
const poses = audit.fixtures.map(pose => ({
  face: pose.face, leftTrim: pose.leftTrim, rightTrim: pose.rightTrim,
  leftTilt: pose.leftTilt, rightTilt: pose.rightTilt,
  nodes: Object.fromEntries(Object.entries(pose.nodes).map(([id, node]) => [id, {
    translation: node.worldPositionBlender, quaternion: node.worldQuaternionWxyzBlender,
  }])),
}));
for (const key of ['leftTilt', 'rightTilt']) {
  if (!poses.every(pose => Number.isFinite(pose[key])) || !poses.some(pose => pose[key] < 0) || !poses.some(pose => pose[key] > 0)) {
    throw new Error(`Missing actual up/down coverage: ${key}`);
  }
}
writeFileSync(path.resolve(webRoot, 'tests/fixtures/monitor-poses.json'), `[\n${poses.map(pose => JSON.stringify(pose)).join(',\n')}\n]\n`);
console.log(`Recorded ${poses.length} Blender poses (${Object.keys(poses[0].nodes).length} nodes each).`);
