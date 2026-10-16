// node --test tests/test_project_paths.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    PROJECT_SUBFOLDERS, gallerySubfolder, projectNameError, parseProjectState,
} from "../web/js/project_paths.js";

// Memes cas que tests/test_projects.py (meme verdict en Python).
const VALID_NAMES = ["Clip 01", "Mon projet", "été-2026", "a.b", "x".repeat(100)];
const INVALID_NAMES = ["", "   ", "a/b", "a\\b", "a:b", "a*b", "a?b", 'a"b', "a<b", "a>b", "a|b",
    "fin.", "CON", "nul", "Com1", "lpt9.txt", "..", "x".repeat(101), "tab\there"];

test("six sous-dossiers", () => {
    assert.deepEqual(PROJECT_SUBFOLDERS, ["Workflows", "Prompt", "Images", "Son", "Rush Videos", "Rush Images"]);
});

test("galeries : sous-dossier par type", () => {
    assert.equal(gallerySubfolder("image"), "Images");
    assert.equal(gallerySubfolder("video"), "Rush Videos");
    assert.equal(gallerySubfolder("audio"), "Son");
    assert.equal(gallerySubfolder("other"), "");
    for (const k of ["image", "video", "audio"]) assert.ok(PROJECT_SUBFOLDERS.includes(gallerySubfolder(k)));
});

test("noms valides", () => {
    for (const n of VALID_NAMES) assert.equal(projectNameError(n), "", n);
    assert.equal(projectNameError("  Clip  "), "");
});

test("noms refuses", () => {
    for (const n of INVALID_NAMES) assert.notEqual(projectNameError(n), "", JSON.stringify(n));
});

test("etat tolerant", () => {
    assert.deepEqual(parseProjectState('{"root":"R","name":"N","path":"P"}'), { root: "R", name: "N", path: "P" });
    for (const raw of ["", "{", "[]", "null", '{"root":3}']) {
        assert.deepEqual(parseProjectState(raw), { root: "", name: "", path: "" });
    }
});
