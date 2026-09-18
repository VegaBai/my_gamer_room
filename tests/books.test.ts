import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, Raycaster, Vector3 } from 'three';
import { BOOK_IDS, BOOKS, isBookId } from '../lib/room/books';
import { collectBookTargets } from '../lib/room/book-targets';

describe('individual book selection', () => {
  it('recognizes only the four book identities, not the old combined pile', () => {
    for (const id of BOOK_IDS) expect(isBookId(id)).toBe(true);
    for (const id of [null, '', 'decor.scifi.books', 'book.unknown']) expect(isBookId(id)).toBe(false);
    const oldAsset = new Mesh(new BoxGeometry());
    oldAsset.userData.web_id = 'decor.scifi.books';
    expect(collectBookTargets(oldAsset).size).toBe(0);
  });

  it('collects multi-material book Groups and raycasts individual geometry', () => {
    const stack = new Group();
    stack.userData.web_id = 'decor.scifi.books';
    for (const [index, id] of BOOK_IDS.entries()) {
      const book = new Group();
      book.userData.web_id = id;
      book.position.y = index * .2;
      book.add(new Mesh(new BoxGeometry(.3, .1, .2)));
      stack.add(book);
    }
    stack.updateMatrixWorld(true);
    const targets = collectBookTargets(stack);
    expect([...targets.keys()]).toEqual(BOOK_IDS);
    for (const [index, id] of BOOK_IDS.entries()) {
      const ray = new Raycaster(new Vector3(0, index * .2, 1), new Vector3(0, 0, -1));
      const hit = ray.intersectObjects([...targets.values()], true)[0];
      expect(hit.object.parent?.userData.web_id).toBe(id);
    }
  });

  it('rejects duplicate identities and empty placeholders', () => {
    const root = new Group();
    const mesh = new Mesh(new BoxGeometry());
    mesh.userData.web_id = BOOK_IDS[0];
    root.add(mesh, mesh.clone());
    expect(() => collectBookTargets(root)).toThrow('Duplicate book identity');
    const empty = new Group();
    empty.userData.web_id = BOOK_IDS[1];
    expect(() => collectBookTargets(empty)).toThrow('Book has no geometry');
  });
});

describe('bilingual book metadata', () => {
  it('provides factual first-book years, both languages, and linked primary sources', () => {
    expect(BOOK_IDS.map(id => BOOKS[id].year)).toEqual([1965, 1951, 1984, 2008]);
    for (const id of BOOK_IDS) {
      for (const language of ['zh', 'en'] as const) {
        expect(BOOKS[id].title[language].length).toBeGreaterThan(0);
        expect(BOOKS[id].author[language].length).toBeGreaterThan(0);
        expect(BOOKS[id].synopsis[language].length).toBeGreaterThan(80);
      }
      expect(BOOKS[id].sources.length).toBeGreaterThan(0);
      for (const source of BOOKS[id].sources) expect(new URL(source.url).protocol).toBe('https:');
    }
  });
});
