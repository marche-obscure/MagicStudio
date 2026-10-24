// node --test tests/test_final_cut_cache.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeFileCache } from "../web/js/final_cut_cache.js";

const file = (size) => ({ size });

test("garde et rend un fichier", () => {
    const cache = makeFileCache({ maxBytes: 100, maxItems: 5 });
    const f = file(10);
    cache.set("a", f);
    assert.equal(cache.get("a"), f);
    assert.equal(cache.get("b"), undefined);
    assert.equal(cache.bytes(), 10);
});

test("budget en octets : les plus anciens partent d'abord", () => {
    const cache = makeFileCache({ maxBytes: 100, maxItems: 10 });
    cache.set("a", file(40));
    cache.set("b", file(40));
    cache.get("a"); // a utilise recemment : b part avant lui
    cache.set("c", file(40));
    assert.deepEqual(cache.keys(), ["a", "c"]);
    assert.equal(cache.bytes(), 80);
});

test("nombre maximal de fichiers", () => {
    const cache = makeFileCache({ maxBytes: 1e9, maxItems: 2 });
    cache.set("a", file(1));
    cache.set("b", file(1));
    cache.set("c", file(1));
    assert.deepEqual(cache.keys(), ["b", "c"]);
});

test("un fichier plus gros que le budget reste seul (on peut toujours le glisser)", () => {
    const cache = makeFileCache({ maxBytes: 100, maxItems: 5 });
    cache.set("a", file(10));
    cache.set("big", file(500));
    assert.deepEqual(cache.keys(), ["big"]);
    cache.set("b", file(10));
    assert.deepEqual(cache.keys(), ["b"]);
});

test("remplacer une cle ne compte pas deux fois", () => {
    const cache = makeFileCache({ maxBytes: 100, maxItems: 5 });
    cache.set("a", file(30));
    cache.set("a", file(50));
    assert.equal(cache.bytes(), 50);
    assert.deepEqual(cache.keys(), ["a"]);
});

test("clear vide tout", () => {
    const cache = makeFileCache({ maxBytes: 100, maxItems: 5 });
    cache.set("a", file(30));
    cache.clear();
    assert.equal(cache.bytes(), 0);
    assert.deepEqual(cache.keys(), []);
});
