import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? '--report';
if (!['--report', '--apply-public', '--prune-build', '--check'].includes(mode) || process.argv.length > 3) throw Error('Unknown retention mode');
const publicRoot = fs.realpathSync(path.join(project, 'public'));
const roomRoot = fs.realpathSync(path.join(publicRoot, 'room'));
const declarations = [
  'public/room/room-manifest.json',
  'public/room/expansion/manifest.json',
  'public/room/desk-accessories/manifest.json',
  'public/room/personal-corner/manifest.json',
  'lib/room/book-prop-asset.json',
];
const models = new Map();
const inside = (root, file) => { const rel = path.relative(root, file); return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel); };
function collect(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.url === 'string' && value.url.endsWith('.glb')) {
    if (!/^\/room\/(?:[a-zA-Z0-9_-]+\/)*[a-f0-9]{64}\.glb$/.test(value.url)
      || !/^[a-f0-9]{64}$/.test(value.sha256) || !Number.isSafeInteger(value.bytes) || value.bytes <= 0) throw Error('Invalid model declaration');
    const previous = models.get(value.url);
    if (previous && (previous.sha256 !== value.sha256 || previous.bytes !== value.bytes)) throw Error('Conflicting model declaration');
    models.set(value.url, value);
  }
  for (const child of Object.values(value)) collect(child);
}
for (const relative of declarations) collect(JSON.parse(fs.readFileSync(path.join(project, relative), 'utf8')));
if (!models.size) throw Error('No current models; refusing cleanup');
// Validate every current source asset before even collecting deletion targets.
for (const asset of models.values()) {
  const target = fs.realpathSync(path.resolve(publicRoot, '.' + asset.url));
  if (!inside(roomRoot, target)) throw Error('Model escapes public/room');
  const bytes = fs.readFileSync(target);
  if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw Error('Missing/corrupt current model: ' + asset.url);
}
const root = mode === '--prune-build' ? fs.realpathSync(path.join(project, 'dist/client/room')) : roomRoot;
const expected = new Set([...models.keys()].map(url => path.resolve(root, url.slice('/room/'.length))));
if (mode === '--prune-build') {
  for (const relative of ['room-manifest.json', 'expansion/manifest.json', 'desk-accessories/manifest.json', 'personal-corner/manifest.json']) {
    if (!fs.readFileSync(path.join(root, relative)).equals(fs.readFileSync(path.join(roomRoot, relative)))) throw Error('Stale build; refusing cleanup');
  }
  for (const asset of models.values()) {
    const bytes = fs.readFileSync(path.resolve(root, asset.url.slice('/room/'.length)));
    if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw Error('Corrupt built model');
  }
}
const obsolete = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw Error('Symlink in room assets; refusing cleanup');
    if (entry.isDirectory()) { walk(file); continue; }
    if (!entry.name.endsWith('.glb') || expected.has(file)) continue;
    if (!entry.isFile() || !/^[a-f0-9]{64}\.glb$/.test(entry.name)) throw Error('Unrecognized model; review before cleanup: ' + file);
    const resolved = fs.realpathSync(file);
    if (!inside(root, resolved)) throw Error('Cleanup target escapes room assets');
    obsolete.push({ path: resolved, bytes: fs.statSync(resolved).size });
  }
}
walk(root);
if (mode === '--apply-public' || mode === '--prune-build') {
  // Individual validated generated files only; never delete a directory.
  for (const item of obsolete) fs.unlinkSync(item.path);
}
console.log(JSON.stringify({ mode, keptModels: models.size, obsoleteModels: obsolete.length,
  obsoleteBytes: obsolete.reduce((total, item) => total + item.bytes, 0), files: obsolete,
  recovery: 'Published source GLBs remain recoverable from Git history; original Blender/source assets are untouched.' }, null, 2));
if (mode === '--check' && obsolete.length) process.exitCode = 1;
