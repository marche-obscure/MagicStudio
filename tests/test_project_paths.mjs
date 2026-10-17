// node --test tests/test_project_paths.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    PROJECT_SUBFOLDERS, FOLDER_COLORS, LIST_FOLDERS, projectNameError, parseProjectState,
    saveItems, remapState, mapBySequence, mapByPrefix, configFileName, modeHasRefs,
    UPDATE_FOLDERS, folderPaths, folderSnapshot, folderChanges, mapFolderBySequence, withoutMedia,
    gallerySession, replaceSelection, unusedProjectFiles, duplicateColors, DUP_COLORS,
    MEDIA_FOLDERS, LOADABLE_FOLDERS, configRefs, loadedState, restoreItems, copyTabName, orderedFolderFiles,
} from "../web/js/project_paths.js";

test("galerie : Add / Replace demande seulement pour un ajout pur", () => {
    assert.deepEqual(gallerySession(["a", "b"], ["a", "b", "c"]), { added: ["c"], removed: [], ask: true });
    // Un fichier decoche : le remplacement est deja choisi.
    assert.equal(gallerySession(["a", "b"], ["a", "c"]).ask, false);
    // Premiere selection, ou rien d'ajoute : pas de question.
    assert.equal(gallerySession([], ["c"]).ask, false);
    assert.equal(gallerySession(["a"], ["a"]).ask, false);
    // Casse et separateurs ignores.
    assert.deepEqual(gallerySession(["C:\\P\\a.png"], ["c:/p/A.png"]).added, []);
    assert.deepEqual(replaceSelection(["a", "b"], ["a", "c", "b", "d"]), ["c", "d"]);
});

test("galerie : fichiers du projet plus utilises par aucune liste", () => {
    const state = { images: ["P\\08.Images\\a.png"], first_frame: ["P/08.Images/f.png"], audios: ["P\\12.Video\\v.mp4"] };
    assert.deepEqual(unusedProjectFiles(["P\\08.Images\\a.png", "P\\08.Images\\b.png", "P\\08.Images\\f.png"], state),
        ["P\\08.Images\\b.png"]);
    assert.deepEqual(unusedProjectFiles(["P\\12.Video\\v.mp4"], state), []);
});

test("dossiers suivis : ajouts hors du dossier, suppressions depuis l'instantane", () => {
    assert.deepEqual(UPDATE_FOLDERS, ["08.Images", "10.Son", "12.Video", "14.Video-Audio"]);
    const proj = "C:\\P\\Clip";
    const state = {
        images: ["C:\\P\\Clip\\08.Images\\a.png", "D:\\x\\b.png"], first_frame: ["D:\\x\\b.png"],
        last_frame: ["D:\\x\\c.png"], videos: ["C:\\P\\Clip\\12.Video\\v.mp4"], audios: [],
    };
    assert.deepEqual(folderPaths(state, "08.Images"), ["C:\\P\\Clip\\08.Images\\a.png", "D:\\x\\b.png", "D:\\x\\c.png"]);
    assert.deepEqual(folderChanges(state, "08.Images", proj, null), { added: ["D:\\x\\b.png", "D:\\x\\c.png"], removed: [] });
    // Casse et separateurs ignores ; une reference retiree est signalee, sans effacer.
    const snap = ["c:/p/clip/12.video/v.mp4", "C:\\P\\Clip\\12.Video\\old.mp4"];
    assert.deepEqual(folderChanges(state, "12.Video", proj, snap), { added: [], removed: ["C:\\P\\Clip\\12.Video\\old.mp4"] });
    assert.deepEqual(folderChanges(state, "10.Son", proj, []), { added: [], removed: [] });
    // Dossier d'un autre projet ou sous-dossier : a copier.
    assert.deepEqual(folderChanges({ audios: ["C:\\P\\Clip\\10.Son\\sub\\s.wav"] }, "10.Son", proj, null).added.length, 1);
    assert.deepEqual(Object.keys(folderSnapshot(state)), UPDATE_FOLDERS);
    assert.deepEqual(folderSnapshot(state)["10.Son"], []);
});

test("mise a jour d'un dossier : seules ses listes sont repointees", () => {
    const state = { images: ["a", "b"], first_frame: ["b"], videos: ["v"], trims: {} };
    const items = saveItems(state).filter((i) => i.folder === "08.Images");
    assert.deepEqual(items.map((i) => i.path), ["a", "b", "b"]);
    const out = remapState(state, mapFolderBySequence("08.Images", ["A", "", "B"]));
    assert.deepEqual(out.images, ["A", "b"]);
    assert.deepEqual(out.first_frame, ["B"]);
    assert.deepEqual(out.videos, ["v"]);
});

test("etat du Ref Loader sans medias pour comparer le workflow", () => {
    const s = { mode: "ref2va", root: "R", images: ["a"], videos: [], trims: { video: {} }, audios: ["s"] };
    assert.deepEqual(withoutMedia(s), { mode: "ref2va", root: "R" });
    assert.deepEqual(s.images, ["a"]);
});

test("instantane des dossiers dans l'etat du noeud Projet", () => {
    const s = parseProjectState(JSON.stringify({ snap: { "08.Images": ["a", 3], "02.Models": ["x"], "10.Son": "no" }, snapPath: "P" }));
    assert.deepEqual(s.snap, { "08.Images": ["a"] });
    assert.equal(s.snapPath, "P");
    assert.deepEqual(parseProjectState("{}").snap, {});
});

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
    const empty = { root: "", name: "", path: "", folder: "", wfPath: "", wfName: "", wfValidated: false, snap: {}, snapPath: "" };
    assert.deepEqual(parseProjectState(
        '{"root":"R","name":"N","path":"P","folder":"F","wfPath":"P","wfName":"N.json","wfValidated":true}'),
    { root: "R", name: "N", path: "P", folder: "F", wfPath: "P", wfName: "N.json", wfValidated: true, snap: {}, snapPath: "" });
    // Etat d'avant le dossier personnalise et le workflow : champs vides.
    assert.deepEqual(parseProjectState('{"root":"R","name":"N","path":"P"}'),
        Object.assign({}, empty, { root: "R", name: "N", path: "P" }));
    for (const raw of ["", "{", "[]", "null", '{"root":3,"wfValidated":"yes"}']) {
        assert.deepEqual(parseProjectState(raw), empty);
    }
});

test("duplicateColors: one colour per group, in order, pool and project together", () => {
    const h = { "P\\a.png": "1", "P\\b.png": "2", "S\\x.png": "1", "S\\y.png": "3", "S\\z.png": "2",
        "P\\c.png": "2", "P\\d.png": "4" };
    const c = duplicateColors(["P\\a.png", "P\\b.png", "P\\c.png", "P\\d.png", "S\\x.png", "S\\y.png", "S\\z.png",
        "S\\unknown.png"], h);
    assert.deepEqual(c, {
        "P\\a.png": DUP_COLORS[0], "S\\x.png": DUP_COLORS[0],
        "P\\b.png": DUP_COLORS[1], "P\\c.png": DUP_COLORS[1], "S\\z.png": DUP_COLORS[1],
    });
    // Le meme fichier deux fois n'est pas un doublon.
    assert.deepEqual(duplicateColors(["P\\a.png", "p/a.png"], { "P\\a.png": "1", "p/a.png": "1" }), {});
});

test("configuration : listes envoyees a Save", () => {
    const st = { images: ["a"], videos: ["v"], first_frame: [], other: 1 };
    assert.deepEqual(configRefs(st), {
        images: ["a"], videos: ["v"], video_audios: [], audios: [], first_frame: [], last_frame: [],
    });
});

test("Load : listes des dossiers coches, ordre des indices, rognages, fichiers perdus sautes", () => {
    const report = {
        mode: "FL2VA",
        folders: [
            { folder: "08.Images", kind: "media", files: [
                { nom: "b.png", Liste: "images", Indice: 2, status: "ok" },
                { nom: "a.png", Liste: "images", Indice: 1, status: "changed", archive: null },
                { nom: "lost.png", Liste: "images", Indice: 3, status: "missing", archive: null },
                { nom: "a.png", Liste: "first_frame", Indice: 1, status: "missing", archive: "a.png" },
            ] },
            { folder: "12.Video", kind: "media", files: [
                { nom: "s.mp4", Liste: "videos", Indice: 1, status: "ok", trim: [5, 7] },
            ] },
            { folder: "10.Son", kind: "media", files: [{ nom: "x.wav", Liste: "audios", Indice: 1, status: "ok" }] },
        ],
    };
    const base = { mode: "ref2va", images: ["old.png"], audios: ["keep.wav"], videos: ["C:\\o.mp4"],
        trims: { video: { "c:/o.mp4": [1, 2] } }, root: "R" };
    const s = loadedState(base, report, "C:\\P", ["08.Images", "12.Video"]);
    assert.deepEqual(s.images, ["C:\\P\\08.Images\\a.png", "C:\\P\\08.Images\\b.png"]);
    assert.deepEqual(s.first_frame, ["C:\\P\\08.Images\\a.png"]);
    assert.deepEqual(s.last_frame, []);
    assert.deepEqual(s.videos, ["C:\\P\\12.Video\\s.mp4"]);
    assert.deepEqual(s.trims.video, { "c:/p/12.video/s.mp4": [5, 7] });
    assert.deepEqual(s.audios, ["keep.wav"]);   // 10.Son non coche
    assert.equal(s.mode, "fl2va");
    assert.equal(s.root, "R");
    assert.deepEqual(base.images, ["old.png"]);  // copie
    // Aucun dossier de medias coche : mode inchange.
    assert.equal(loadedState(base, report, "C:\\P", ["00.Workflows"]).mode, "ref2va");
});

test("Load : fichiers a remettre en place depuis Archives", () => {
    const report = { folders: [
        { folder: "00.Workflows", kind: "workflow", files: [{ nom: "C.json", status: "changed", archive: "2026_C.json" }] },
        { folder: "04.Prompt", kind: "prompt", files: [{ nom: "p.txt", status: "changed", archive: "p.txt" }] },
        { folder: "08.Images", kind: "media", files: [
            { nom: "a.png", status: "missing", archive: "a.png" },
            { nom: "A.png", status: "missing", archive: "a.png" },
            { nom: "b.png", status: "ok", archive: null },
            { nom: "c.png", status: "changed", archive: null },
        ] },
        { folder: "10.Son", kind: "media", files: [{ nom: "x.wav", status: "missing", archive: "x.wav" }] },
    ] };
    assert.deepEqual(restoreItems(report, ["00.Workflows", "04.Prompt", "08.Images"]), [
        { folder: "00.Workflows", archive: "2026_C.json", nom: "C.json" },
        { folder: "08.Images", archive: "a.png", nom: "a.png" },
    ]);
    assert.equal(copyTabName("Clip.json"), "Clip-copie");
});

test("dossiers chargeables et dossiers des medias", () => {
    assert.deepEqual(LOADABLE_FOLDERS, ["00.Workflows", "08.Images", "10.Son", "12.Video", "14.Video-Audio"]);
    for (const f of Object.keys(MEDIA_FOLDERS)) assert.ok(PROJECT_SUBFOLDERS.includes(f));
});

test("visualisation : ordre du Ref Loader, F / L, puis sans numero par nom", () => {
    const D = "C:\\P\\08.Images\\";
    const files = [D + "z.png", D + "b.png", D + "a.png", D + "f.png", D + "y.png"];
    const st = { images: [D + "b.png", "c:/p/08.images/A.png"], first_frame: [D + "f.png"], last_frame: [D + "b.png"] };
    assert.deepEqual(orderedFolderFiles(files, st, "08.Images"), [
        { path: D + "b.png", badge: "1 · L" },
        { path: D + "a.png", badge: "2" },
        { path: D + "f.png", badge: "F" },
        { path: D + "y.png", badge: "" },
        { path: D + "z.png", badge: "" },
    ]);
    // Sans Reference Loader : tout par nom, sans numero.
    assert.deepEqual(orderedFolderFiles([D + "b.png", D + "a.png"], null, "10.Son").map((x) => x.badge), ["", ""]);
});
