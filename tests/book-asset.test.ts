import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOOK_IDS } from '../lib/room/books';
import asset from '../lib/room/book-prop-asset.json';

const bytes = readFileSync(path.resolve('public', asset.url.slice(1)));
const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));

describe('published standalone book asset', () => {
  it('is the exact content-addressed model used by the room loader', () => {
    expect(bytes.toString('utf8', 0, 4)).toBe('glTF');
    expect(bytes.length).toBe(asset.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
    expect(asset.url).toBe(`/room/books/${asset.sha256}.glb`);
  });

  it('has four separate complete books under one collection, not the old fused stack', () => {
    const roots = gltf.nodes.filter((node: any) => node.extras?.web_id === 'decor.scifi.books');
    expect(roots).toHaveLength(1);
    expect(roots[0].mesh).toBeUndefined();
    expect(roots[0].children).toHaveLength(4);
    const identities = new Set();
    for (const id of BOOK_IDS) {
      const matches = gltf.nodes.filter((node: any) => node.extras?.web_id === id);
      expect(matches).toHaveLength(1);
      expect(roots[0].children).toContain(gltf.nodes.indexOf(matches[0]));
      identities.add(matches[0].mesh);
      const primitives = gltf.meshes[matches[0].mesh].primitives;
      expect(primitives).toHaveLength(4);
      for (const primitive of primitives) {
        expect(primitive.attributes.NORMAL).toBeDefined();
        expect(primitive.attributes.TEXCOORD_0).toBeDefined();
        expect(primitive.material).toBeDefined();
      }
    }
    expect(identities.size).toBe(4);
    const triangles = gltf.meshes.flatMap((mesh: any) => mesh.primitives)
      .reduce((total: number, primitive: any) => total + gltf.accessors[primitive.indices].count / 3, 0);
    expect(triangles).toBe(asset.triangles);
    expect(triangles).toBe(3008);
  });
});
