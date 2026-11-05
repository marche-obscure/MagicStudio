// Fonctions pures des archives de listes d'images : node --test tests/test_image_lists.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { archiveRows, loadPlan, splitPath, stampDate, imagesOfState, withImages } from "../web/js/image_lists_pure.js";

const mk = (stamp, name, images, missing = [], date = "") => ({
    file: stamp + "_" + name + ".json", name, stamp, date, images, missing,
});

test("archiveRows : plus recente d'abord, texte date - nom - nombre", () => {
    const rows = archiveRows([
        mk("20261105-101500", "old", ["a", "b"], [], "2026-11-05 10:15:00"),
        mk("20261106-090000", "new", ["a"], [], "2026-11-06 09:00:00"),
    ]);
    assert.deepEqual(rows.map((r) => r.name), ["new", "old"]);
    assert.equal(rows[0].text, "2026-11-06 09:00:00 · new · 1 image");
    assert.equal(rows[1].text, "2026-11-05 10:15:00 · old · 2 images");
});

test("archiveRows : date tiree du nom de fichier si absente, entree non modifiee", () => {
    const input = [mk("20261105-101500", "x", ["a"], ["a"])];
    const rows = archiveRows(input);
    assert.equal(rows[0].text, "2026-11-05 10:15:00 · x · 1 image");
    assert.equal(rows[0].missingCount, 1);
    assert.equal(input[0].text, undefined);
    assert.deepEqual(archiveRows([]), []);
});

test("loadPlan : manquantes retirees et signalees", () => {
    const p = loadPlan(mk("s", "n", ["a", "b", "c"], ["b"]), 15);
    assert.deepEqual(p.images, ["a", "c"]);
    assert.deepEqual(p.missing, ["b"]);
});

test("loadPlan : 15 au plus", () => {
    const many = Array.from({ length: 20 }, (_, i) => "p" + i);
    const p = loadPlan(mk("s", "n", many), 15);
    assert.equal(p.images.length, 15);
    assert.equal(p.images[14], "p14");
});

test("splitPath et stampDate", () => {
    assert.deepEqual(splitPath("C:\\a\\b\\c.png"), { dir: "C:\\a\\b", name: "c.png" });
    assert.deepEqual(splitPath("/a/b.png"), { dir: "/a", name: "b.png" });
    assert.deepEqual(splitPath("b.png"), { dir: "", name: "b.png" });
    assert.equal(stampDate("bad"), "");
});

test("withImages remplace seulement la liste Image", () => {
    const s = { variant: "image.basic", selections: { "minimax_h3.ref2va": { rows: { images: ["keep"] } } } };
    assert.deepEqual(imagesOfState(s), []);
    withImages(s, ["a", "b"]);
    assert.deepEqual(imagesOfState(s), ["a", "b"]);
    assert.deepEqual(s.selections["minimax_h3.ref2va"].rows.images, ["keep"]);
});
