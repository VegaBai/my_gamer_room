# Web model retention

The room keeps only currently referenced runtime GLBs. Original Blender projects,
concepts and source assets outside this web project are not cleanup targets.

- `npm run build` validates the current manifests and model hashes, then removes
  unreferenced historical GLBs from the generated production output. It never
  removes source models while a new release is still being prepared.
- After the current model release is confirmed successfully deployed, run
  `npm run room:models:report`, review the candidates, then
  `npm run room:models:cleanup` to remove obsolete copies from `public/room`.
- Commit the removals normally. Prior web GLBs remain recoverable from Git
  history; do not rewrite repository history or delete original authoring files.
- Register new runtime model dependencies in the room manifest, expansion
  manifest or book-prop asset declaration before building. If a feature loads
  models through another declaration, add it to the retention script first.

The script validates every retained model's byte count and SHA256 before any
deletion, rejects symlinks/path escapes, and deletes only individual hash-named
GLB files. It does not remove old posters, deployment history or archives.
