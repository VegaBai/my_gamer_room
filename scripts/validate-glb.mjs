import { readFile } from 'node:fs/promises';
import path from 'node:path';
import validator from 'gltf-validator';

const files = process.argv.slice(2);
if (files.length === 0) {
  throw new Error('Usage: node scripts/validate-glb.mjs <model.glb> [...]');
}

let failed = false;
for (const file of files) {
  const bytes = await readFile(file);
  const report = await validator.validateBytes(new Uint8Array(bytes), {
    uri: path.basename(file),
    maxIssues: 1000,
  });
  const summary = {
    file,
    validatorVersion: report.validatorVersion,
    errors: report.issues?.numErrors ?? 0,
    warnings: report.issues?.numWarnings ?? 0,
    infos: report.issues?.numInfos ?? 0,
    hints: report.issues?.numHints ?? 0,
    messages: report.issues?.messages ?? [],
  };
  console.log(JSON.stringify(summary));
  if (summary.errors > 0) failed = true;
}

if (failed) process.exitCode = 1;
