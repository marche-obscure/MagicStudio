import test from "node:test";
import assert from "node:assert/strict";
import { sortMedia, kindFilter, KINDS } from "../web/js/media_browser_pure.js";

const LIST = [
    { name: "b10.mp4", kind: "video", size: 300, mtime: 20 },
    { name: "a.png", kind: "image", size: 100, mtime: 30 },
    { name: "b2.mp4", kind: "video", size: 200, mtime: 10 },
    { name: "c.wav", kind: "audio", size: 50, mtime: 40 },
];
const names = (l) => l.map((f) => f.name);

test("sortMedia par nom, ordre naturel, deux sens", () => {
    assert.deepEqual(names(sortMedia(LIST, "name", "asc")), ["a.png", "b2.mp4", "b10.mp4", "c.wav"]);
    assert.deepEqual(names(sortMedia(LIST, "name", "desc")), ["c.wav", "b10.mp4", "b2.mp4", "a.png"]);
});

test("sortMedia par taille et par date", () => {
    assert.deepEqual(names(sortMedia(LIST, "size", "asc")), ["c.wav", "a.png", "b2.mp4", "b10.mp4"]);
    assert.deepEqual(names(sortMedia(LIST, "size", "desc")), ["b10.mp4", "b2.mp4", "a.png", "c.wav"]);
    assert.deepEqual(names(sortMedia(LIST, "mtime", "asc")), ["b2.mp4", "b10.mp4", "a.png", "c.wav"]);
    assert.deepEqual(names(sortMedia(LIST, "mtime", "desc")), ["c.wav", "a.png", "b10.mp4", "b2.mp4"]);
});

test("sortMedia ne modifie pas la liste d'origine", () => {
    const copy = names(LIST);
    sortMedia(LIST, "size", "desc");
    assert.deepEqual(names(LIST), copy);
});

test("kindFilter", () => {
    assert.deepEqual(KINDS, ["all", "video", "image", "audio"]);
    assert.equal(kindFilter(LIST, "all").length, 4);
    assert.deepEqual(names(kindFilter(LIST, "video")), ["b10.mp4", "b2.mp4"]);
    assert.deepEqual(names(kindFilter(LIST, "image")), ["a.png"]);
    assert.deepEqual(names(kindFilter(LIST, "audio")), ["c.wav"]);
    assert.equal(kindFilter(LIST, "inconnu").length, 4);
    assert.deepEqual(kindFilter(null, "video"), []);
});
