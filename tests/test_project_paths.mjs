// node --test tests/test_project_paths.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { PROJECT_SUBFOLDERS, FOLDER_COLORS, projectNameError, parseProjectState } from "../web/js/project_paths.js";

// Memes cas que tests/test_projects.py (meme verdict en Python).
const VALID_NAMES = ["Clip 01", "Mon projet", "été-2026", "a.b", "x".repeat(100)];
const INVALID_NAMES = ["", "   ", "a/b", "a\\b", "a:b", "a*b", "a?b", 'a"b', "a<b", "a>b", "a|b",
    "fin.", "CON", "nul", "Com1", "lpt9.txt", "..", "x".repeat(101), "tab\there"];

test("huit sous-dossiers numerotes", () => {
    assert.deepEqual(PROJECT_SUBFOLDERS, [
        "00.Workflows", "02.Models", "04.Prompt", "06.LoRA", "08.Images", "10.Son", "40.Rush Videos", "60.Rush Images",
    ]);
});

test("une couleur par sous-dossier", () => {
    assert.deepEqual(Object.keys(FOLDER_COLORS), PROJECT_SUBFOLDERS);
    for (const c of Object.values(FOLDER_COLORS)) assert.match(c, /^#[0-9a-f]{6}$/);
    assert.equal(new Set(Object.values(FOLDER_COLORS)).size, PROJECT_SUBFOLDERS.length);
});

test("noms valides", () => {
    for (const n of VALID_NAMES) assert.equal(projectNameError(n), "", n);
    assert.equal(projectNameError("  Clip  "), "");
});

test("noms refuses", () => {
    for (const n of INVALID_NAMES) assert.notEqual(projectNameError(n), "", JSON.stringify(n));
});

test("etat tolerant", () => {
    assert.deepEqual(parseProjectState('{"root":"R","name":"N","path":"P","folder":"F"}'),
        { root: "R", name: "N", path: "P", folder: "F" });
    // Etat d'avant le dossier personnalise : folder vide.
    assert.deepEqual(parseProjectState('{"root":"R","name":"N","path":"P"}'), { root: "R", name: "N", path: "P", folder: "" });
    for (const raw of ["", "{", "[]", "null", '{"root":3}']) {
        assert.deepEqual(parseProjectState(raw), { root: "", name: "", path: "", folder: "" });
    }
});
