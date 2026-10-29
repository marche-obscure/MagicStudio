// Tests de web/js/ref_order.js : node --test tests/test_ref_order.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { refTokens, orderChanges, orderWarningNeeded } from "../web/js/ref_order.js";

const st = (o) => Object.assign({ mode: "ref2va", images: [], videos: [], video_audios: [], audios: [] }, o);

test("jetons du prompt : Picture, Video, Audio (bandes-son d'abord)", () => {
    const s = st({ images: ["a.png", "b.png"], videos: ["v.mp4"], video_audios: ["va1.mp4", "va2.mp4"], audios: ["s.wav"] });
    assert.deepEqual(refTokens(s).map((t) => t.path + "=" + t.token), [
        "a.png=<Picture 1>", "b.png=<Picture 2>", "v.mp4=<Video 1>",
        "va1.mp4=<Audio 1>", "va2.mp4=<Audio 2>", "s.wav=<Audio 3>",
    ]);
    assert.deepEqual(refTokens(st({ mode: "fl2va", images: ["a.png"] })), []);
});

test("ordre change : deplacement, suppression, decalage des audios", () => {
    const before = st({ images: ["a.png", "b.png", "c.png"], audios: ["s.wav"] });
    // c.png avant b.png
    const moved = orderChanges(before, st({ images: ["a.png", "c.png", "b.png"], audios: ["s.wav"] }));
    assert.deepEqual(moved.map((c) => [c.path, c.from, c.to]),
        [["b.png", "<Picture 2>", "<Picture 3>"], ["c.png", "<Picture 3>", "<Picture 2>"]]);
    assert.ok(orderWarningNeeded(moved));
    // b.png retire : c.png remonte
    const removed = orderChanges(before, st({ images: ["a.png", "c.png"], audios: ["s.wav"] }));
    assert.deepEqual(removed.map((c) => [c.path, c.from, c.to]),
        [["b.png", "<Picture 2>", null], ["c.png", "<Picture 3>", "<Picture 2>"]]);
    // une bande-son ajoutee decale l'audio
    const va = orderChanges(before, st({ images: ["a.png", "b.png", "c.png"], video_audios: ["va.mp4"], audios: ["s.wav"] }));
    assert.deepEqual(va.map((c) => [c.path, c.from, c.to]), [["s.wav", "<Audio 1>", "<Audio 2>"]]);
});

test("remplacement a sa place : signale (meme numero, autre fichier)", () => {
    const before = st({ images: ["a.png", "b.png"], audios: ["s.wav"] });
    const rep = orderChanges(before, st({ images: ["a.png", "x.png"], audios: ["s.wav"] }));
    assert.deepEqual(rep, [{ list: "images", path: "x.png", from: "<Picture 2>", to: "<Picture 2>", replaced: "b.png" }]);
    assert.ok(orderWarningNeeded(rep));
});

test("pas d'avertissement : ajout a la fin, dernier retire, F2VA", () => {
    const before = st({ images: ["a.png", "b.png"] });
    assert.deepEqual(orderChanges(before, st({ images: ["a.png", "b.png", "c.png"] })), []);
    const last = orderChanges(before, st({ images: ["a.png"] }));
    assert.deepEqual(last.map((c) => c.to), [null]);
    assert.equal(orderWarningNeeded(last), false);
    assert.deepEqual(orderChanges(before, st({ mode: "fl2va" })), []);
    assert.equal(orderWarningNeeded(null), false);
});

test("profil LTX 2.x : pas de balises <Picture N>, aucun avertissement d'ordre", () => {
    const before = st({ images: ["a.png", "b.png"] });
    const after = st({ images: ["b.png", "a.png"] });
    assert.ok(orderChanges(before, after).length);
    assert.deepEqual(orderChanges({ ...before, profile: "ltx2" }, { ...after, profile: "ltx2" }), []);
    assert.deepEqual(orderChanges(before, { ...after, profile: "ltx2" }), []);
});

// ---- Etat des variantes (Task 4) : jetons seulement pour une variante avec une ligne "tags" ----
import { migrateState } from "../web/js/profiles.js";

const vs = (variant, rows) => {
    const s = migrateState({ variant });
    Object.assign(s.selections[variant].rows, rows);
    return s;
};

test("variant state : Ref2VA tokens from the description", () => {
    const s = vs("minimax_h3.ref2va", { images: ["a.png"], videos: ["v.mp4"], video_audios: ["va.mp4"], audios: ["s.wav"] });
    assert.deepEqual(refTokens(s).map((t) => t.list + ":" + t.path + "=" + t.token), [
        "images:a.png=<Picture 1>", "videos:v.mp4=<Video 1>", "video_audios:va.mp4=<Audio 1>", "audios:s.wav=<Audio 2>",
    ]);
    assert.deepEqual(refTokens(vs("ltx.2_3", { guide_images: ["a.png"] })), []);
    assert.deepEqual(refTokens(vs("minimax_h3.fl2va", { first_frame: ["a.png"] })), []);
    const before = vs("minimax_h3.ref2va", { images: ["a.png", "b.png"] });
    const after = vs("minimax_h3.ref2va", { images: ["b.png", "a.png"] });
    assert.ok(orderWarningNeeded(orderChanges(before, after)));
    assert.deepEqual(orderChanges(before, vs("ltx.2_3", {})), []);
});
