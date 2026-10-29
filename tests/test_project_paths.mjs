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
    batchSortTargets, canDeleteRush, deletedText, anchoredSubs, projectNameOfPath, subfolderLabel,
    sameGroup, mergeData,
    REGISTRY_FOLDERS, OTHER_REGISTRY, runsOfSet, setsWithRuns, promptGroups, setsOfRuns, setSummary, runTabName,
    switchSourceInput, inDateOrder, orderSetCards, orderByMtime, DOT_FILTER, filterByDot, dotCounts, groupByDot, rushKey, relinkCandidates, withoutPaths, filterSubfolders, inProjectFilter, isMediaSubfolder, durationText,
    folderMax, activeLists, hiddenFolderItems,
    frameAt, timeOf, frameText, EXTRACT_CHOICES,
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

test("Runs : pastille et boutons de tri Picture Lock / Rough Cut / Footage / No Good", () => {
    assert.deepEqual(SORT_FOLDERS.map((x) => x[1]), ["Picture Lock", "Rough Cut", "Footage", "No Good"]);
    assert.deepEqual(SORT_FOLDERS.map((x) => x[2]), ["Picture Lock", "Rough Cut", "Footage", "No Good"]);
    const inside = { kind: "video", in_project: true, place: "validated", source_exists: true,
        copy: "P/40.Rush Videos/Rough Cut/a.mp4", copy_exists: true };
    assert.equal(sortDot(inside), "validated");
    assert.deepEqual(sortTargets(inside), ["picture_lock", "footage", "rejected"]);
    assert.equal(sortDot({ ...inside, place: "picture_lock" }), "picture_lock");
    // Original hors du projet : pastille grise, les trois boutons le rapatrient.
    const outside = { kind: "video", in_project: false, place: "footage", source_exists: true,
        copy: "P/40.Rush Videos/Footage/a.mp4", copy_exists: true };
    assert.equal(sortDot(outside), "outside");
    assert.deepEqual(sortTargets(outside), ["picture_lock", "validated", "footage", "rejected"]);
    // Original disparu, copie video dans Footage : deplacable ailleurs.
    const gone = { ...outside, source_exists: false };
    assert.deepEqual(sortTargets(gone), ["picture_lock", "validated", "rejected"]);
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
    assert.deepEqual(DOT_FILTER, ["picture_lock", "validated", "footage", "rejected", "outside"]);
    const it = (file, place, inside = true) => ({ file, output: { in_project: inside, place } });
    const items = [it("a", "validated"), it("b", "footage"), it("c", "rejected"), it("d", "footage", false),
        it("e", "footage")];
    assert.equal(filterByDot(items, new Set()), items);
    assert.deepEqual(filterByDot(items, new Set(["footage"])).map((x) => x.file), ["b", "e"]);
    assert.deepEqual(filterByDot(items, new Set(["validated", "outside"])).map((x) => x.file), ["a", "d"]);
    assert.deepEqual(filterByDot(null, new Set(["rejected"])), []);
    assert.deepEqual(dotCounts(items), { picture_lock: 0, validated: 1, footage: 2, rejected: 1, outside: 1 });
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
    assert.ok(isMediaSubfolder("G/P/10.Son", "ref2va"));
    assert.ok(!isMediaSubfolder("G/P/08.Images/Archives", "ref2va"));
    assert.ok(isMediaSubfolder("P\\08.Images", "fl2va"));
    assert.ok(!isMediaSubfolder("P/12.Video", "fl2va"));
});

test("duree du Run : s, min s, h min s ; vide si absente", () => {
    assert.equal(durationText(45.4), "45 s");
    assert.equal(durationText(0), "0 s");
    assert.equal(durationText(187.4), "3 min 07 s");
    assert.equal(durationText(3725), "1 h 02 min 05 s");
    assert.equal(durationText(59.6), "1 min 00 s");
    for (const v of [null, undefined, "", -1, "abc", Infinity]) assert.equal(durationText(v), "");
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
        guide_images: "08.Images", guide_video: "12.Video", soundtrack: "10.Son", voice: "10.Son",
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
    const empty = { root: "", name: "", path: "", folder: "", wfPath: "", wfName: "", wfValidated: false, snap: {}, snapPath: "", wfRed: "" };
    assert.deepEqual(parseProjectState(
        '{"root":"R","name":"N","path":"P","folder":"F","wfPath":"P","wfName":"N.json","wfValidated":true,"wfRed":"P"}'),
    { root: "R", name: "N", path: "P", folder: "F", wfPath: "P", wfName: "N.json", wfValidated: true, snap: {}, snapPath: "", wfRed: "P" });
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
    // Listes des deux profils (build_config indexe celles du profil actif, les autres gardent leurs fichiers).
    assert.deepEqual(configRefs(st), {
        images: ["a"], videos: ["v"], video_audios: [], audios: [], first_frame: [], last_frame: [],
        guide_images: [], guide_video: [], soundtrack: [], voice: [],
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

test("lot de 40 / 60 : boutons actifs, suppression, marque deleted", () => {
    const inRej = { kind: "image", in_project: true, place: "rejected", source: "P/60/Rejected/a.png", source_exists: true };
    const inVal = { kind: "image", in_project: true, place: "validated", source: "P/60/Validated/b.png", source_exists: true };
    assert.deepEqual(batchSortTargets([inRej]), ["picture_lock", "validated", "footage"]);
    assert.deepEqual(batchSortTargets([inRej, inVal]), ["picture_lock", "validated", "footage", "rejected"]);
    // Projet d'un MultiProject : Picture Lock pour un seul fichier coche.
    assert.deepEqual(batchSortTargets([inRej], true), ["picture_lock", "validated", "footage"]);
    assert.deepEqual(batchSortTargets([inRej, inVal], true), ["validated", "footage", "rejected"]);
    assert.deepEqual(batchSortTargets([]), []);
    assert.equal(canDeleteRush(inRej), true);
    assert.equal(canDeleteRush(inVal), false);
    assert.equal(canDeleteRush({ ...inRej, source_exists: false }), false);
    const vid = { kind: "video", in_project: false, place: "rejected", copy: "P/40/Rejected/v.mp4", copy_exists: true };
    assert.equal(canDeleteRush(vid), false); // original hors du projet : pastille grise
    assert.equal(deletedText({ date: "20261020_101010", how: "trash" }), "Deleted (Recycle Bin) – 20/10/2026 10:10:10");
    assert.equal(deletedText({ date: "20261020_101010", how: "permanent" }), "Deleted permanently – 20/10/2026 10:10:10");
    assert.equal(deletedText(null), "");
});

test("root folder anchored on the parent folder", () => {
    const subs = { image: "Speech/08.Images", video: "", audio: "x" };
    assert.deepEqual(anchoredSubs(subs, { image: "", video: "", audio: "D:/Sons" }, "Yacht"),
        { image: "Yacht/Speech/08.Images", video: "Yacht", audio: "x" });
    assert.deepEqual(anchoredSubs(subs, {}, ""), subs);
    const names = ["Projet de test", "Yacht/Speech", "Yacht/Walk"];
    assert.equal(projectNameOfPath("F:\\P", names, "F:\\P\\Yacht\\Speech"), "Yacht/Speech");
    assert.equal(projectNameOfPath("F:/P/", names, "f:/p/projet de test"), "Projet de test");
    assert.equal(projectNameOfPath("F:\\P", names, "F:\\Q\\Speech"), "");
});

test("subfolder names relative to the Project / Sub-project choice", () => {
    assert.equal(subfolderLabel("Yacht/Speech/08.Images", "Yacht/Speech"), "08.Images");
    assert.equal(subfolderLabel("Yacht/Speech/08.Images", "Yacht"), "Speech/08.Images");
    assert.equal(subfolderLabel("Yacht/Speech/08.Images", ""), "Yacht/Speech/08.Images");
    assert.equal(subfolderLabel("Solo\\10.Son", "solo"), "10.Son");
    assert.equal(subfolderLabel("Solo2/10.Son", "Solo"), "Solo2/10.Son");
});

test("Load data only: same MultiProject, values of the common nodes", () => {
    assert.equal(sameGroup("Yatch/Speech-01", "Yatch/Start-Walking"), "Yatch");
    assert.equal(sameGroup("Yatch/Speech-01", "yatch/Walk"), "Yatch");
    assert.equal(sameGroup("Yatch/Speech-01", "Other/Speech-01"), "");
    assert.equal(sameGroup("Solo", "Yatch/Speech-01"), "");
    assert.equal(sameGroup("Yatch/Speech-01", "Yatch/Speech-01"), "");
    const current = { nodes: [
        { id: 1, type: "Prompt", widgets_values: ["walk"], widgets_values_named: { text: "walk" } },
        { id: 2, type: "KSampler", widgets_values: [1, 20] },
        { id: 3, type: "Upscale", widgets_values: [2] },
    ], links: [[1, 1, 0, 2, 0, "X"]] };
    const saved = { nodes: [
        { id: 1, type: "Prompt", widgets_values: ["speech"], widgets_values_named: { text: "speech" } },
        { id: 2, type: "Other", widgets_values: [9] },
        { id: 9, type: "Note", widgets_values: ["only in saved"] },
    ] };
    const m = mergeData(current, saved);
    assert.deepEqual(m.nodes.map((n) => n.widgets_values), [["speech"], [1, 20], [2]]);
    assert.deepEqual(m.nodes[0].widgets_values_named, { text: "speech" });
    assert.deepEqual(m.links, current.links);
    assert.equal(m.nodes.length, 3);
    assert.deepEqual(current.nodes[0].widgets_values, ["walk"]);   // current n'est pas modifie
});

// ---- Task 6 : listes LTX 2.x et moments ----
test("remapState moves moment keys", () => {
    const state = {
        guide_images: ["C:\\R\\a.png", "C:\\R\\b.png"], guide_video: ["C:\\R\\v.mp4"], soundtrack: ["C:\\R\\s.wav"],
        moments: { guide_images: { "c:/r/a.png": 2, "c:/r/b.png": -1 }, guide_video: { "c:/r/v.mp4": 1.5 } },
        trims: { guide_video: { "c:/r/v.mp4": [1, 3] }, soundtrack: { "c:/r/s.wav": [0, 2] } },
    };
    const out = remapState(state, (p) => p.replace("C:\\R", "P:\\08"));
    assert.deepEqual(out.guide_images, ["P:\\08\\a.png", "P:\\08\\b.png"]);
    assert.deepEqual(out.moments.guide_images, { "p:/08/a.png": 2, "p:/08/b.png": -1 });
    assert.deepEqual(out.moments.guide_video, { "p:/08/v.mp4": 1.5 });
    assert.deepEqual(out.trims.guide_video, { "p:/08/v.mp4": [1, 3] });
    assert.deepEqual(out.trims.soundtrack, { "p:/08/s.wav": [0, 2] });
    // l'etat d'origine n'est pas touche
    assert.deepEqual(state.moments.guide_images, { "c:/r/a.png": 2, "c:/r/b.png": -1 });
    // etat sans moments : rien ne casse
    assert.deepEqual(remapState({ images: ["a"] }, (p) => p + "x").images, ["ax"]);
});

test("Save : listes LTX 2.x dans leurs dossiers, etat MiniMax inchange", () => {
    assert.equal(LIST_FOLDERS.guide_images, "08.Images");
    assert.equal(LIST_FOLDERS.guide_video, "12.Video");
    assert.equal(LIST_FOLDERS.soundtrack, "10.Son");
    assert.equal(LIST_FOLDERS.voice, "10.Son");
    assert.deepEqual(saveItems({ profile: "ltx2", guide_images: ["g"], voice: ["v"] }),
        [{ path: "g", folder: "08.Images" }, { path: "v", folder: "10.Son" }]);
    // configRefs : listes des dossiers de medias des deux profils (Task 7)
    assert.deepEqual(configRefs({ guide_images: ["g"] }).guide_images, ["g"]);
});

// ---- Task 7 : noeud Project selon le profil du RefLoader ----
const LTX_STATE = {
    profile: "ltx2", mode: "ref2va",
    // Listes MiniMax gardees dans l'etat (profil cache)
    images: ["P/08.Images/m.png"], videos: ["P/12.Video/mv.mp4"], video_audios: ["P/14.Video-Audio/va.mp4"],
    audios: ["P/10.Son/ma.wav"], first_frame: [], last_frame: [],
    guide_images: ["P/08.Images/g1.png", "P/08.Images/g2.png"], guide_video: ["P/12.Video/gv.mp4"],
    soundtrack: ["P/10.Son/st.wav"], voice: ["P/10.Son/vo.wav"],
    moments: { guide_images: { "p/08.images/g1.png": 0 }, guide_video: {} },
    trims: {},
};

test("activeLists : listes du profil actif, dans l'ordre des listes", () => {
    assert.deepEqual(activeLists({}), ["images", "videos", "video_audios", "audios", "first_frame", "last_frame"]);
    assert.deepEqual(activeLists(LTX_STATE), ["guide_images", "guide_video", "soundtrack", "voice"]);
});

test("folderUse in ltx2", () => {
    const imgs = ["P/08.Images/g1.png", "P/08.Images/g2.png", "P/08.Images/m.png", "P/08.Images/x.png"];
    assert.deepEqual(folderUse(imgs, LTX_STATE, "08.Images"), { used: 2, max: 9, mode: "LTX 2.x" });
    const son = ["P/10.Son/st.wav", "P/10.Son/vo.wav", "P/10.Son/ma.wav"];
    assert.deepEqual(folderUse(son, LTX_STATE, "10.Son"), { used: 2, max: 2, mode: "LTX 2.x" });
    assert.deepEqual(folderUse(["P/12.Video/gv.mp4", "P/12.Video/mv.mp4"], LTX_STATE, "12.Video"),
        { used: 1, max: 1, mode: "LTX 2.x" });
    assert.deepEqual(folderUse(["P/14.Video-Audio/va.mp4"], LTX_STATE, "14.Video-Audio"),
        { used: 0, max: 0, mode: "LTX 2.x" });
    // Limites reglees dans le RefLoader (state.limits) et defauts de la route
    const lim = Object.assign({}, LTX_STATE, { limits: { ltx2: { guide_image: 4 } } });
    assert.equal(folderUse(imgs, lim, "08.Images").max, 4);
    const defaults = { ltx2: { guide_image: 5, guide_video: 1, soundtrack: 1, voice: 1, seconds: 20,
        max_size: [768, 1344], fps: 24, multiple: 32 } };
    assert.equal(folderUse(imgs, LTX_STATE, "08.Images", defaults).max, 5);
});

test("folderUse keeps minimax counts", () => {
    const st = { mode: "ref2va", images: ["P/08.Images/a.png"], first_frame: [], last_frame: [], audios: [],
        videos: [], video_audios: [], guide_images: ["P/08.Images/g.png"] };
    const imgs = ["P/08.Images/a.png", "P/08.Images/g.png"];
    assert.deepEqual(folderUse(imgs, st, "08.Images"), { used: 1, max: 9, mode: "Ref2VA" });
    assert.deepEqual(folderMax(st), { "08.Images": 9, "10.Son": 3, "12.Video": 3, "14.Video-Audio": 3 });
    assert.deepEqual(folderMax({ mode: "fl2va" }), { "08.Images": 2, "10.Son": 3, "12.Video": 3, "14.Video-Audio": 3 });
    assert.deepEqual(folderMax(LTX_STATE), { "08.Images": 9, "10.Son": 2, "12.Video": 1, "14.Video-Audio": 0 });
    // Limites MiniMax reglees : lues dans limitsOf
    assert.equal(folderUse(imgs, Object.assign({}, st, { limits: { minimax_h3: { image: 4 } } }), "08.Images").max, 4);
});

test("Save : seulement les listes du profil actif ; destinations par position", () => {
    assert.deepEqual(saveItems(LTX_STATE).map((i) => [i.path, i.folder]), [
        ["P/08.Images/g1.png", "08.Images"], ["P/08.Images/g2.png", "08.Images"], ["P/12.Video/gv.mp4", "12.Video"],
        ["P/10.Son/st.wav", "10.Son"], ["P/10.Son/vo.wav", "10.Son"]]);
    const mm = Object.assign({}, LTX_STATE, { profile: "minimax_h3" });
    assert.deepEqual(saveItems(mm).map((i) => i.path),
        ["P/08.Images/m.png", "P/12.Video/mv.mp4", "P/14.Video-Audio/va.mp4", "P/10.Son/ma.wav"]);
    // Les destinations ne vont qu'aux listes du profil actif (les listes cachees ne bougent pas)
    const out = remapState(LTX_STATE, mapBySequence(["A", "B", "C", "D", "E"], LTX_STATE));
    assert.deepEqual([out.guide_images, out.guide_video, out.soundtrack, out.voice], [["A", "B"], ["C"], ["D"], ["E"]]);
    assert.deepEqual(out.images, ["P/08.Images/m.png"]);
    assert.deepEqual(out.moments.guide_images, { "a": 0 });
    const f = remapState(LTX_STATE, mapFolderBySequence("08.Images", ["X", ""], LTX_STATE));
    assert.deepEqual(f.guide_images, ["X", "P/08.Images/g2.png"]);
    assert.deepEqual(f.images, ["P/08.Images/m.png"]);
});

test("cloches : listes du profil actif ; une reference du profil cache n'est pas retiree", () => {
    assert.deepEqual(folderPaths(LTX_STATE, "10.Son"), ["P/10.Son/st.wav", "P/10.Son/vo.wav"]);
    assert.deepEqual(folderPaths(LTX_STATE, "14.Video-Audio"), []);
    const mm = Object.assign({}, LTX_STATE, { profile: "minimax_h3" });
    assert.deepEqual(folderPaths(mm, "10.Son"), ["P/10.Son/ma.wav"]);
    // Instantane pris en MiniMax, puis passage en LTX : ma.wav reste utilise par le profil cache
    const snap = ["P/10.Son/ma.wav", "P/10.Son/gone.wav"];
    assert.deepEqual(folderChanges(LTX_STATE, "10.Son", "P", snap), { added: [], removed: ["P/10.Son/gone.wav"] });
    assert.deepEqual(folderChanges(LTX_STATE, "10.Son", "Q", []).added, ["P/10.Son/st.wav", "P/10.Son/vo.wav"]);
});

test("archives : les fichiers des deux profils sont utilises", () => {
    const files = ["P/08.Images/m.png", "P/08.Images/g1.png", "P/08.Images/x.png"];
    assert.deepEqual(unusedProjectFiles(files, LTX_STATE), ["P/08.Images/x.png"]);
    assert.deepEqual(unusedProjectFiles(files, Object.assign({}, LTX_STATE, { profile: "minimax_h3" })),
        ["P/08.Images/x.png"]);
});

test("withoutMedia : moments retires, profil et limites gardes", () => {
    const s = withoutMedia(Object.assign({}, LTX_STATE, { limits: { ltx2: { fps: 25 } } }));
    assert.equal(s.moments, undefined);
    assert.equal(s.trims, undefined);
    assert.equal(s.guide_images, undefined);
    assert.equal(s.profile, "ltx2");
    assert.deepEqual(s.limits, { ltx2: { fps: 25 } });
});

test("galerie reliee a un projet : dossiers LTX 2.x", () => {
    for (const f of ["08.Images", "10.Son", "12.Video"]) assert.ok(isMediaSubfolder("P/" + f, "ltx2"));
    assert.ok(!isMediaSubfolder("P/14.Video-Audio", "ltx2"));
    assert.ok(isMediaSubfolder("G/P/12.Video", "ltx2"));
});

test("MEDIA_FOLDERS : listes LTX 2.x dans leurs dossiers", () => {
    assert.deepEqual(MEDIA_FOLDERS, {
        "08.Images": ["images", "first_frame", "last_frame", "guide_images"],
        "10.Son": ["audios", "soundtrack", "voice"],
        "12.Video": ["videos", "guide_video"],
        "14.Video-Audio": ["video_audios"],
    });
});

test("Load d'une configuration LTX 2.x : listes LTX remplacees, listes MiniMax gardees, moments repris", () => {
    const report = { mode: null, profile: "ltx2", folders: [
        { folder: "08.Images", kind: "media", files: [
            { nom: "b.png", Liste: "guide_images", Indice: 2, status: "ok", moment: -1 },
            { nom: "a.png", Liste: "guide_images", Indice: 1, status: "ok", moment: 2.5 },
        ] },
        { folder: "10.Son", kind: "media", files: [{ nom: "v.wav", Liste: "voice", Indice: 1, status: "ok", trim: [1, 4] }] },
    ] };
    const base = { profile: "minimax_h3", mode: "fl2va", images: ["keep.png"], first_frame: ["f.png"], audios: ["a.wav"],
        guide_images: ["old.png"], voice: [], soundtrack: ["old.wav"], moments: { guide_images: { "old.png": 1 } }, trims: {} };
    const s = loadedState(base, report, "C:\\P", ["08.Images", "10.Son"]);
    assert.equal(s.profile, "ltx2");
    assert.equal(s.mode, "fl2va");   // mode MiniMax inchange
    assert.deepEqual(s.images, ["keep.png"]);
    assert.deepEqual(s.first_frame, ["f.png"]);
    assert.deepEqual(s.audios, ["a.wav"]);
    assert.deepEqual(s.guide_images, ["C:\\P\\08.Images\\a.png", "C:\\P\\08.Images\\b.png"]);
    assert.deepEqual(s.moments.guide_images, { "c:/p/08.images/a.png": 2.5, "c:/p/08.images/b.png": -1 });
    assert.deepEqual(s.voice, ["C:\\P\\10.Son\\v.wav"]);
    assert.deepEqual(s.soundtrack, []);
    assert.deepEqual(s.trims.voice, { "c:/p/10.son/v.wav": [1, 4] });
    // Configuration MiniMax (sans profile) : listes LTX gardees, profil MiniMax
    const mm = loadedState(Object.assign({}, base, { profile: "ltx2" }), { mode: "REF2VA", folders: [
        { folder: "08.Images", kind: "media", files: [{ nom: "i.png", Liste: "images", Indice: 1, status: "ok" }] }] },
    "C:\\P", ["08.Images"]);
    assert.equal(mm.profile, "minimax_h3");
    assert.equal(mm.mode, "ref2va");
    assert.deepEqual(mm.guide_images, ["old.png"]);
    assert.deepEqual(mm.images, ["C:\\P\\08.Images\\i.png"]);
});

test("visualisation d'un dossier en LTX 2.x : numeros des guides, S / V pour le son", () => {
    const D = "C:\\P\\10.Son\\";
    const st = { profile: "ltx2", audios: [D + "m.wav"], soundtrack: [D + "s.wav"], voice: [D + "v.wav"] };
    assert.deepEqual(orderedFolderFiles([D + "m.wav", D + "v.wav", D + "s.wav"], st, "10.Son"), [
        { path: D + "s.wav", badge: "S" }, { path: D + "v.wav", badge: "V" }, { path: D + "m.wav", badge: "" }]);
    const I = "C:\\P\\08.Images\\";
    assert.deepEqual(orderedFolderFiles([I + "g.png"], { profile: "ltx2", guide_images: [I + "g.png"] }, "08.Images"),
        [{ path: I + "g.png", badge: "1" }]);
});

test("configFileName et modeHasRefs en LTX 2.x", () => {
    const d = new Date(2026, 9, 6, 9, 5, 3);
    assert.equal(configFileName(d, "ltx2"), "20261006-090503_LTX2_magicstudio_config.json");
    assert.equal(modeHasRefs({ voice: ["v"] }, "ltx2"), true);
    assert.equal(modeHasRefs({ images: ["i"] }, "ltx2"), false);
});

test("cloche : les references du profil cache sont aussi verifiees (manquantes = pas d'archivage)", () => {
    // Projet deplace hors de ComfyUI : references MiniMax (profil cache) vers l'ancien chemin,
    // listes LTX actives vides ou vers des fichiers presents.
    const st = {
        profile: "ltx2",
        images: ["OLD/P/08.Images/a.png", "OLD/P/08.Images/b.png"], first_frame: ["OLD/P/08.Images/a.png"],
        audios: ["OLD/P/10.Son/s.wav"], video_audios: ["OLD/P/14.Video-Audio/va.mp4"],
        guide_images: ["NEW/P/08.Images/g.png", "new/p/08.images/B.PNG"], soundtrack: [],
    };
    // Copies : profil actif seulement ; verification : actif + cache (sans doublon).
    const items = saveItems(st).filter((i) => i.folder === "08.Images");
    assert.deepEqual(items.map((i) => i.path), ["NEW/P/08.Images/g.png", "new/p/08.images/B.PNG"]);
    assert.deepEqual(hiddenFolderItems(st, "08.Images"),
        [{ path: "OLD/P/08.Images/a.png", folder: "08.Images" }, { path: "OLD/P/08.Images/b.png", folder: "08.Images" }]);
    assert.deepEqual(hiddenFolderItems(st, "10.Son"), [{ path: "OLD/P/10.Son/s.wav", folder: "10.Son" }]);
    // 14.Video-Audio (non utilise en LTX) : les references MiniMax sont verifiees aussi.
    assert.deepEqual(hiddenFolderItems(st, "14.Video-Audio").map((i) => i.path), ["OLD/P/14.Video-Audio/va.mp4"]);
    // Une reference deja dans le profil actif n'est pas repetee.
    const shared = Object.assign({}, st, { images: ["NEW/P/08.Images/g.png"], first_frame: [] });
    assert.deepEqual(hiddenFolderItems(shared, "08.Images"), []);
    // Profil MiniMax actif : les guides LTX sont verifies.
    assert.deepEqual(hiddenFolderItems(Object.assign({}, st, { profile: "minimax_h3" }), "08.Images").map((i) => i.path),
        ["NEW/P/08.Images/g.png", "new/p/08.images/B.PNG"]);
});

test("Extract Frame : numero d'image, temps, compteur, choix, galerie", () => {
    assert.equal(frameAt(0, 24, 97), 0);
    assert.equal(frameAt(1.0, 24, 97), 24);
    assert.equal(frameAt(99, 24, 97), 96);
    assert.equal(frameAt(-1, 24, 97), 0);
    assert.equal(frameAt(1.0, 0, 97), 0);
    assert.equal(frameAt(0.5, 24, 0), 0);
    assert.ok(Math.abs(timeOf(24, 24) - 1.0208) < 1e-3);
    assert.equal(frameAt(timeOf(24, 24), 24, 97), 24);
    assert.equal(frameAt(timeOf(96, 30), 30, 97), 96);
    assert.equal(frameText(0, 97), "Frame 0 / 97");
    assert.deepEqual(EXTRACT_CHOICES, [["first", "First"], ["last", "Last"], ["fl", "FL-Frame"], ["n", "Frame-N"]]);
    assert.ok(isMediaSubfolder("P/40.Rush Videos/Picture Lock/Extract Frame", "ref2va"));
    assert.ok(isMediaSubfolder("G/P/40.Rush Videos/Picture Lock/Extract Frame", "fl2va"));
    assert.ok(isMediaSubfolder("P\\40.Rush Videos\\Picture Lock\\Extract Frame", "ltx2", "image"));
    assert.ok(!isMediaSubfolder("P/40.Rush Videos/Picture Lock/Extract Frame", "ref2va", "video"));
    assert.ok(!isMediaSubfolder("P/40.Rush Videos/Picture Lock", "ref2va"));
    assert.ok(!isMediaSubfolder("P/40.Rush Videos/Footage/Extract Frame", "ref2va"));
    assert.ok(!isMediaSubfolder("A/G/P/40.Rush Videos/Picture Lock/Extract Frame", "ref2va"));
    // Lignes de medias inchangees avec le type de la ligne
    assert.ok(isMediaSubfolder("P/08.Images", "ref2va", "image"));
});
