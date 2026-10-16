// node --test tests/test_project_paths.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    PROJECT_SUBFOLDERS, FOLDER_COLORS, LIST_FOLDERS, projectNameError, parseProjectState,
    saveItems, remapState, mapBySequence, mapByPrefix, configFileName, modeHasRefs,
} from "../web/js/project_paths.js";

// Memes cas que tests/test_projects.py (meme verdict en Python).
const VALID_NAMES = ["Clip 01", "Mon projet", "été-2026", "a.b", "x".repeat(100)];
const INVALID_NAMES = ["", "   ", "a/b", "a\\b", "a:b", "a*b", "a?b", 'a"b', "a<b", "a>b", "a|b",
    "fin.", "CON", "nul", "Com1", "lpt9.txt", "..", "x".repeat(101), "tab\there"];

test("dix sous-dossiers numerotes", () => {
    assert.deepEqual(PROJECT_SUBFOLDERS, [
        "00.Workflows", "02.Models", "04.Prompt", "06.LoRA", "08.Images", "10.Son", "12.Video", "14.Video-Audio",
        "40.Rush Videos", "60.Rush Images",
    ]);
});

test("une couleur par sous-dossier", () => {
    assert.deepEqual(Object.keys(FOLDER_COLORS), PROJECT_SUBFOLDERS);
    for (const c of Object.values(FOLDER_COLORS)) assert.match(c, /^#[0-9a-f]{6}$/);
    assert.equal(new Set(Object.values(FOLDER_COLORS)).size, PROJECT_SUBFOLDERS.length);
});

test("chaque liste du Ref Loader va dans un sous-dossier", () => {
    assert.deepEqual(LIST_FOLDERS, {
        images: "08.Images", first_frame: "08.Images", last_frame: "08.Images",
        videos: "12.Video", video_audios: "14.Video-Audio", audios: "10.Son",
    });
    for (const f of Object.values(LIST_FOLDERS)) assert.ok(PROJECT_SUBFOLDERS.includes(f));
});

const STATE = {
    root: "F:\\R", mode: "ref2va",
    images: ["F:\\R\\a.png", "F:\\R\\b.png"], videos: ["F:\\R\\v.mp4"], video_audios: ["F:\\R\\v.mp4"],
    audios: ["F:\\R\\s.wav"], first_frame: ["F:\\R\\f.png"], last_frame: [],
    trims: { video: { "f:/r/v.mp4": [1, 2] }, video_audio: {}, audio: { "f:/r/s.wav": [0, 3] } },
    folders: { image: "", video: "", audio: "" }, subs: { image: "", video: "", audio: "" },
};

test("saveItems : les deux modes, dans l'ordre des listes", () => {
    assert.deepEqual(saveItems(STATE), [
        { path: "F:\\R\\a.png", folder: "08.Images" },
        { path: "F:\\R\\b.png", folder: "08.Images" },
        { path: "F:\\R\\v.mp4", folder: "12.Video" },
        { path: "F:\\R\\v.mp4", folder: "14.Video-Audio" },
        { path: "F:\\R\\s.wav", folder: "10.Son" },
        { path: "F:\\R\\f.png", folder: "08.Images" },
    ]);
});

test("remapState + mapBySequence : chemins, cles de rognage, ordre de saveItems", () => {
    const dsts = ["F:\\P\\08.Images\\a.png", "", "F:\\P\\12.Video\\v.mp4", "F:\\P\\14.Video-Audio\\v.mp4",
        "F:\\P\\10.Son\\s.wav", "F:\\P\\08.Images\\f.png"];
    const s = remapState(STATE, mapBySequence(dsts));
    assert.deepEqual(s.images, ["F:\\P\\08.Images\\a.png", "F:\\R\\b.png"]); // "" = manquant, garde
    assert.deepEqual(s.videos, ["F:\\P\\12.Video\\v.mp4"]);
    assert.deepEqual(s.video_audios, ["F:\\P\\14.Video-Audio\\v.mp4"]);
    assert.deepEqual(s.first_frame, ["F:\\P\\08.Images\\f.png"]);
    assert.deepEqual(s.trims.video, { "f:/p/12.video/v.mp4": [1, 2] });
    assert.deepEqual(s.trims.audio, { "f:/p/10.son/s.wav": [0, 3] });
    assert.deepEqual(STATE.videos, ["F:\\R\\v.mp4"]); // etat d'origine intact
});

test("remapState : table par liste (une video copiee dans deux dossiers)", () => {
    const s = remapState(STATE, (p, list) => (list === "video_audios" ? "F:\\P\\14.Video-Audio\\v.mp4" : p));
    assert.deepEqual(s.videos, ["F:\\R\\v.mp4"]);
    assert.deepEqual(s.video_audios, ["F:\\P\\14.Video-Audio\\v.mp4"]);
});

test("mapByPrefix : seulement sous l'ancien dossier, sans casse ni sens des barres", () => {
    const f = mapByPrefix("F:\\Projets\\Clip", "G:\\Ailleurs\\Clip v2");
    assert.equal(f("F:\\Projets\\Clip\\08.Images\\a.png"), "G:\\Ailleurs\\Clip v2\\08.Images\\a.png");
    assert.equal(f("f:/projets/clip/10.Son/s.wav"), "G:\\Ailleurs\\Clip v2\\10.Son\\s.wav");
    assert.equal(f("F:\\Projets\\Clip2\\a.png"), "F:\\Projets\\Clip2\\a.png");
    assert.equal(f("F:\\Other\\a.png"), "F:\\Other\\a.png");
});

test("configFileName : prefixe yyyyMMdd-HHmmss puis mode", () => {
    const d = new Date(2026, 9, 6, 9, 5, 3);
    assert.equal(configFileName(d, "ref2va"), "20261006-090503_REF2VA_minimax_config.json");
    assert.equal(configFileName(d, "fl2va"), "20261006-090503_FL2VA_minimax_config.json");
});

test("modeHasRefs", () => {
    assert.equal(modeHasRefs(STATE, "ref2va"), true);
    assert.equal(modeHasRefs(STATE, "fl2va"), true);
    assert.equal(modeHasRefs({ ...STATE, first_frame: [], last_frame: [] }, "fl2va"), false);
    assert.equal(modeHasRefs({ images: [], videos: [], video_audios: [], audios: [] }, "ref2va"), false);
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
