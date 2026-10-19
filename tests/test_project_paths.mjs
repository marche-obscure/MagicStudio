// node --test tests/test_project_paths.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    PROJECT_SUBFOLDERS, FOLDER_COLORS, LIST_FOLDERS, projectNameError, parseProjectState,
    saveItems, remapState, mapBySequence, mapByPrefix, configFileName, modeHasRefs,
    UPDATE_FOLDERS, folderPaths, folderSnapshot, folderChanges, mapFolderBySequence, withoutMedia,
    gallerySession, replaceSelection, unusedProjectFiles, duplicateColors, DUP_COLORS,
    MEDIA_FOLDERS, LOADABLE_FOLDERS, configRefs, loadedState, restoreItems, copyTabName, orderedFolderFiles,
    runDateText, runsOfKind, runSummary, outputFile, rushItems, folderUse, SORT_FOLDERS, sortDot, sortTargets,
    REGISTRY_FOLDERS, OTHER_REGISTRY, runsOfSet, setsWithRuns, promptGroups, setsOfRuns, setSummary, runTabName,
    switchSourceInput, inDateOrder, orderSetCards, orderByMtime, DOT_FILTER, filterByDot, dotCounts, groupByDot, rushKey, relinkCandidates, withoutPaths, filterSubfolders, inProjectFilter, isMediaSubfolder,
} from "../web/js/project_paths.js";

test("Fenetres 02 / 06 : ensembles, prompts identiques, autre registre", () => {
    const runs = [
        { file: "c", date: "2026-10-18 13:48:47", prompt: "a yacht ", sets: { models: [2], lora: [1] } },
        { file: "b", date: "2026-10-18 12:00:00", prompt: "a dog", sets: { models: [1], lora: [] } },
        { file: "a", date: "2026-10-17 10:00:00", prompt: "a yacht", sets: { models: [2], lora: [3] } },
        { file: "z", date: "2026-10-16 10:00:00", prompt: "old" },
    ];
    const registries = { models: [{ index: 1 }, { index: 2 }, { index: 3 }], lora: [{ index: 1 }, { index: 3 }] };
    assert.equal(REGISTRY_FOLDERS["02.Models"], "models");
    assert.equal(OTHER_REGISTRY[REGISTRY_FOLDERS["06.LoRA"]], "models");
    assert.deepEqual(runsOfSet(runs, "models", 2).map((r) => r.file), ["c", "a"]);
    assert.deepEqual(setsWithRuns(registries, runs, "models").map((x) => [x.set.index, x.runs.length]), [[1, 1], [2, 2], [3, 0]]);
    assert.deepEqual(setsWithRuns(null, runs, "lora"), []);
    // Meme texte (espaces autour ignores) : un seul groupe, Run le plus recent d'abord.
    const groups = promptGroups(runsOfSet(runs, "models", 2));
    assert.deepEqual(groups.map((g) => [g.prompt, g.runs.map((r) => r.file)]), [["a yacht", ["c", "a"]]]);
    assert.deepEqual(promptGroups([{ prompt: null }, { prompt: "" }]).map((g) => g.runs.length), [2]);
    // Zone A : LoRA des Runs du prompt ; 0 = Run sans ensemble.
    assert.deepEqual(setsOfRuns(groups[0].runs, "lora"), [{ index: 1, count: 1 }, { index: 3, count: 1 }]);
    assert.deepEqual(setsOfRuns(runs.slice(1, 2), "lora"), [{ index: 0, count: 1 }]);
    assert.equal(setSummary(registries, runs, "06.LoRA"), "Sets: 2 | Last run: 18/10/2026 13:48:47");
    assert.equal(setSummary({ models: [] }, runs, "02.Models"), "");
    assert.equal(runTabName("20261018_134847_run.json"), "20261018_134847_run");
});

test("Use: x/y : utilises par le mode actuel / maximum du dossier", () => {
    const st = { mode: "ref2va", images: ["P/08.Images/a.png", "P/08.Images/b.png"], first_frame: ["P/08.Images/c.png"],
        last_frame: [], audios: ["P/10.Son/s.wav"], videos: [], video_audios: [] };
    const imgs = ["P/08.Images/a.png", "P/08.Images/b.png", "P/08.Images/c.png", "P/08.Images/d.png"];
    assert.deepEqual(folderUse(imgs, st, "08.Images"), { used: 2, max: 9, mode: "Ref2VA" });
    assert.deepEqual(folderUse(imgs, Object.assign({}, st, { mode: "fl2va" }), "08.Images"), { used: 1, max: 2, mode: "FL2VA" });
    assert.equal(folderUse(["p/10.son/S.wav"], st, "10.Son").used, 1);   // casse et separateurs ignores
    assert.equal(folderUse([], st, "12.Video").max, 3);
    assert.equal(folderUse([], st, "14.Video-Audio").max, 3);
});

const RUNS = [
    { date: "2026-10-17 15:06:41", outputs: [
        { kind: "video", source: "F:/r/v.mp4", source_exists: true, copy: "P/40.Rush Videos/a.mp4", copy_exists: true }] },
    { date: "2026-10-17 14:00:00", outputs: [
        { kind: "image", source: "G:/o/i.png", source_exists: true, copy: "", copy_exists: false },
        { kind: "video", source: "F:/r/w.mp4", source_exists: true, copy: "P/40.Rush Videos/b.mp4", copy_exists: false }] },
    { date: "2026-10-17 13:00:00", outputs: [] },
];

test("Runs : date, filtre, texte des boutons", () => {
    assert.equal(runDateText("2026-10-17 15:06:41"), "17/10/2026 15:06:41");
    assert.equal(runDateText("bad"), "bad");
    assert.equal(runsOfKind(RUNS, null).length, 3);
    assert.deepEqual(runsOfKind(RUNS, "image").map((r) => r.date), ["2026-10-17 14:00:00"]);
    assert.equal(runSummary(RUNS, "04.Prompt"), "Last run: 17/10/2026 15:06:41 | Runs: 3");
    assert.equal(runSummary(RUNS, "40.Rush Videos"), "Last run: 17/10/2026 15:06:41 | Runs: 2");
    assert.equal(runSummary(RUNS, "60.Rush Images"), "Last run: 17/10/2026 14:00:00 | Runs: 1");
    assert.equal(runSummary([], "04.Prompt"), "");
});

test("Runs : vignettes de 40 / 60 = fichiers cites et presents", () => {
    assert.equal(outputFile(RUNS[0].outputs[0]), "P/40.Rush Videos/a.mp4");
    assert.equal(outputFile(RUNS[1].outputs[1]), "");          // copie absente
    assert.equal(outputFile(RUNS[1].outputs[0]), "G:/o/i.png"); // image : original
    assert.deepEqual(rushItems(RUNS, "40.Rush Videos").map((x) => x.file), ["P/40.Rush Videos/a.mp4"]);
    assert.deepEqual(rushItems(RUNS, "60.Rush Images").map((x) => x.file), ["G:/o/i.png"]);
    assert.equal(rushItems(RUNS, "60.Rush Images")[0].run, RUNS[1]);
});

test("Runs : pastille et boutons de tri Reject / Validate / Footage", () => {
    assert.deepEqual(SORT_FOLDERS.map((x) => x[2]), ["Rejected", "Validated", "Footage"]);
    const inside = { kind: "video", in_project: true, place: "validated", source_exists: true,
        copy: "P/40.Rush Videos/Validated/a.mp4", copy_exists: true };
    assert.equal(sortDot(inside), "validated");
    assert.deepEqual(sortTargets(inside), ["rejected", "footage"]);
    // Original hors du projet : pastille grise, les trois boutons le rapatrient.
    const outside = { kind: "video", in_project: false, place: "footage", source_exists: true,
        copy: "P/40.Rush Videos/Footage/a.mp4", copy_exists: true };
    assert.equal(sortDot(outside), "outside");
    assert.deepEqual(sortTargets(outside), ["rejected", "validated", "footage"]);
    // Original disparu, copie video dans Footage : deplacable ailleurs.
    const gone = { ...outside, source_exists: false };
    assert.deepEqual(sortTargets(gone), ["rejected", "validated"]);
    // Aucun fichier : aucun bouton.
    assert.deepEqual(sortTargets({ ...gone, copy_exists: false }), []);
    assert.deepEqual(sortTargets(null), []);
    assert.equal(sortDot({ in_project: true, place: "root" }), "outside");
});

test("tri par date : Runs, ensembles 02 / 06 et fichiers 08 a 14", () => {
    const runs = [{ date: "2026-10-19 12:00:00" }, { date: "2026-10-18 12:00:00" }];
    assert.equal(inDateOrder(runs, "desc"), runs);
    assert.deepEqual(inDateOrder(runs, "asc"), [runs[1], runs[0]]);
    assert.deepEqual(runs.map((r) => r.date)[0], "2026-10-19 12:00:00"); // liste d'origine intacte
    assert.deepEqual(inDateOrder(null, "asc"), []);
    const cards = [
        { set: { index: 1 }, runs: [runs[1]] },
        { set: { index: 2 }, runs: [] },
        { set: { index: 3 }, runs: [runs[0]] },
    ];
    assert.deepEqual(orderSetCards(cards, "desc").map((c) => c.set.index), [3, 1, 2]);
    assert.deepEqual(orderSetCards(cards, "asc").map((c) => c.set.index), [1, 3, 2]);
    // Fichiers numerotes en tete dans leur ordre, les autres par date.
    const items = [{ path: "D/b.png", badge: "1" }, { path: "D/a.png", badge: "2" },
        { path: "D/old.png", badge: "" }, { path: "D/new.png", badge: "" }, { path: "D/mid.png", badge: "" }];
    const mtimes = { "D/old.png": 10, "D/new.png": 30, "D/mid.png": 20, "D/b.png": 5, "D/a.png": 50 };
    assert.deepEqual(orderByMtime(items, mtimes, "desc").map((x) => x.path),
        ["D/b.png", "D/a.png", "D/new.png", "D/mid.png", "D/old.png"]);
    assert.deepEqual(orderByMtime(items, mtimes, "asc").map((x) => x.path),
        ["D/b.png", "D/a.png", "D/old.png", "D/mid.png", "D/new.png"]);
});

test("40 / 60 : filtre par pastille", () => {
    assert.deepEqual(DOT_FILTER, ["validated", "footage", "rejected", "outside"]);
    const it = (file, place, inside = true) => ({ file, output: { in_project: inside, place } });
    const items = [it("a", "validated"), it("b", "footage"), it("c", "rejected"), it("d", "footage", false),
        it("e", "footage")];
    assert.equal(filterByDot(items, new Set()), items);
    assert.deepEqual(filterByDot(items, new Set(["footage"])).map((x) => x.file), ["b", "e"]);
    assert.deepEqual(filterByDot(items, new Set(["validated", "outside"])).map((x) => x.file), ["a", "d"]);
    assert.deepEqual(filterByDot(null, new Set(["rejected"])), []);
    assert.deepEqual(dotCounts(items), { validated: 1, footage: 2, rejected: 1, outside: 1 });
});

test("40 / 60 : groupes par pastille, puis date", () => {
    const it = (file, place, inside = true) => ({ file, run: { file: file + ".json" }, output: { index: 0, in_project: inside, place } });
    // Ordre recu = date (plus recent d'abord) : garde dans chaque groupe.
    const items = [it("d5", "rejected"), it("d4", "footage", false), it("d3", "footage"), it("d2", "validated"),
        it("d1", "footage"), it("d0", "validated")];
    assert.deepEqual(groupByDot(items).map((x) => x.file), ["d2", "d0", "d3", "d1", "d5", "d4"]);
    assert.deepEqual(groupByDot([...items].reverse()).map((x) => x.file), ["d0", "d2", "d1", "d3", "d5", "d4"]);
    assert.deepEqual(groupByDot(null), []);
    assert.equal(rushKey(items[0]), "d5.json#0");
    assert.equal(rushKey(undefined), "");
});

test("dossier renomme : candidats sous le nouveau Root folder, retrait des manquants", () => {
    const old = "F:\\Appli\\Porjet-Yatch\\Speech-01\\08.Images\\a.png";
    assert.deepEqual(relinkCandidates(old, "F:\\Appli\\Projet-Yatch\\"), [
        "F:\\Appli\\Projet-Yatch\\Porjet-Yatch\\Speech-01\\08.Images\\a.png",
        "F:\\Appli\\Projet-Yatch\\Speech-01\\08.Images\\a.png",
        "F:\\Appli\\Projet-Yatch\\08.Images\\a.png",
    ]);
    assert.deepEqual(relinkCandidates("D:/r/p/x.png", "E:/new", 2), ["E:/new/p/x.png"]);
    assert.deepEqual(relinkCandidates("a.png", "E:\\new"), []);
    assert.deepEqual(relinkCandidates(old, ""), []);
    assert.deepEqual(withoutPaths(["C:\\A\\x.png", "C:\\A\\y.png"], ["c:/a/X.PNG"]), ["C:\\A\\y.png"]);
    assert.deepEqual(withoutPaths(null, ["x"]), []);
});

test("galerie : filtre Project des sous-dossiers", () => {
    const subs = [{ path: "Speech-01" }, { path: "Speech-01/08.Images" }, { path: "Speech-01/08.Images/Archives" },
        { path: "Speech-012/08.Images" }, { path: "Yatch/12.Video" }];
    assert.deepEqual(filterSubfolders(subs, ""), subs);
    assert.deepEqual(filterSubfolders(subs, "Speech-01").map((e) => e.path),
        ["Speech-01", "Speech-01/08.Images", "Speech-01/08.Images/Archives"]);
    assert.deepEqual(filterSubfolders(subs, "yatch").map((e) => e.path), ["Yatch/12.Video"]);
    assert.ok(inProjectFilter("Speech-01\\10.Son", "Speech-01"));
    assert.ok(!inProjectFilter("Speech-012", "Speech-01"));
    assert.ok(inProjectFilter("anything", ""));
    assert.deepEqual(filterSubfolders(null, "x"), []);
});

test("galerie : sous-dossiers de medias seulement (08 a 14, 08 en FL2VA)", () => {
    for (const f of ["08.Images", "10.Son", "12.Video", "14.Video-Audio"]) assert.ok(isMediaSubfolder("P/" + f, "ref2va"));
    for (const f of ["00.Workflows", "40.Rush Videos", "99.Project-Config"]) assert.ok(!isMediaSubfolder("P/" + f, "ref2va"));
    assert.ok(!isMediaSubfolder("P", "ref2va"));
    assert.ok(!isMediaSubfolder("P/08.Images/Archives", "ref2va"));
    assert.ok(isMediaSubfolder("P\\08.Images", "fl2va"));
    assert.ok(!isMediaSubfolder("P/12.Video", "fl2va"));
});

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

test("Switch MultiIN-OUT : entree du groupe actif qui alimente une sortie", () => {
    const inputs = ["group", "pairs", "show_c", "select", "a1", "a2", "b1", "b2"].map((name) => ({ name, link: null }));
    const sw = (group) => ({ type: "SwitchMultiInOut", inputs, widgets: [{ name: "group", value: group }] });
    assert.equal(switchSourceInput(sw("A"), 0), 4);      // S1 -> A1
    assert.equal(switchSourceInput(sw("B"), 1), 7);      // S2 -> B2
    assert.equal(switchSourceInput(sw("C"), 0), -1);     // C absent
    assert.equal(switchSourceInput({ type: "Other", inputs }, 0), -1);
});
