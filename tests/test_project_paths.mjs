// node --test tests/test_project_paths.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    PROJECT_SUBFOLDERS, FOLDER_COLORS, projectNameError, parseProjectState,
    saveItems, remapState, mapBySequence, mapByPrefix, 
    UPDATE_FOLDERS, folderPaths, folderSnapshot, folderChanges, mapFolderBySequence, withoutMedia,
    gallerySession, replaceSelection, unusedProjectFiles, duplicateColors, DUP_COLORS,
    LOADABLE_FOLDERS, configRefs, loadedState, restoreItems, copyTabName, orderedFolderFiles,
    runDateText, runsOfKind, runSummary, outputFile, rushItems, folderUse, SORT_FOLDERS, sortDot, sortTargets,
    batchSortTargets, canDeleteRush, deletedText, anchoredSubs, projectNameOfPath, subfolderLabel,
    sameGroup, mergeData,
    REGISTRY_FOLDERS, OTHER_REGISTRY, runsOfSet, setsWithRuns, promptGroups, setsOfRuns, setSummary, runTabName,
    switchSourceInput, inDateOrder, orderSetCards, orderByMtime, DOT_FILTER, filterByDot, dotCounts, groupByDot, rushKey, relinkCandidates, withoutPaths, filterSubfolders, inProjectFilter, isMediaSubfolder, durationText,
    folderMax, hiddenFolderItems, rowFolder, withoutFolderPaths, withoutReferences,
    frameAt, timeOf, frameText, EXTRACT_CHOICES, extractHeaderState, runSourcePaths, PICKUP_DIR, PICKUP_SUBS, pickupPath,
    orderOutputs, postLabel, postTags, postHint,
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

test("mapByPrefix : seulement sous l'ancien dossier, sans casse ni sens des barres", () => {
    const f = mapByPrefix("F:\\Projets\\Clip", "G:\\Ailleurs\\Clip v2");
    assert.equal(f("F:\\Projets\\Clip\\08.Images\\a.png"), "G:\\Ailleurs\\Clip v2\\08.Images\\a.png");
    assert.equal(f("f:/projets/clip/10.Son/s.wav"), "G:\\Ailleurs\\Clip v2\\10.Son\\s.wav");
    assert.equal(f("F:\\Projets\\Clip2\\a.png"), "F:\\Projets\\Clip2\\a.png");
    assert.equal(f("F:\\Other\\a.png"), "F:\\Other\\a.png");
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

test("dossiers chargeables", () => {
    assert.deepEqual(LOADABLE_FOLDERS, ["00.Workflows", "08.Images", "10.Son", "12.Video", "14.Video-Audio"]);
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
    assert.ok(isMediaSubfolder("P/40.Rush Videos/Picture Lock/Extract Frame", "minimax_h3.ref2va"));
    assert.ok(isMediaSubfolder("G/P/40.Rush Videos/Picture Lock/Extract Frame", "minimax_h3.fl2va"));
    assert.ok(isMediaSubfolder("P\\40.Rush Videos\\Picture Lock\\Extract Frame", "ltx.2_3", "image"));
    assert.ok(!isMediaSubfolder("P/40.Rush Videos/Picture Lock/Extract Frame", "minimax_h3.ref2va", "video"));
    assert.ok(!isMediaSubfolder("P/40.Rush Videos/Picture Lock", "minimax_h3.ref2va"));
    assert.ok(!isMediaSubfolder("P/40.Rush Videos/Footage/Extract Frame", "minimax_h3.ref2va"));
    assert.ok(!isMediaSubfolder("A/G/P/40.Rush Videos/Picture Lock/Extract Frame", "minimax_h3.ref2va"));
    // Lignes de medias inchangees avec le type de la ligne
    assert.ok(isMediaSubfolder("P/08.Images", "minimax_h3.ref2va", "image"));
});

test("Extract Frame : mediaTime arrondi a la microseconde (debut de l'image)", () => {
    assert.equal(frameAt(0.208333, 24, 97), 5);
    for (let k = 0; k <= 96; k++) {
        assert.equal(frameAt(Math.floor((k / 24) * 1e6) / 1e6, 24, 97), k, "debut arrondi de l'image " + k);
        assert.equal(frameAt(timeOf(k, 24), 24, 97), k, "milieu de l'image " + k);
    }
});

test("Extract Frame : bouton de l'en-tete de la fenetre 40", () => {
    assert.equal(extractHeaderState({}, {}), "hidden");
    assert.equal(extractHeaderState(null, null), "hidden");
    assert.equal(extractHeaderState({ video: [] }, {}), "hidden");
    assert.equal(extractHeaderState({ video: ["clip.mp4"] }, {}), "enabled");
    assert.equal(extractHeaderState({ video: ["CLIP.MOV"] }, {}), "enabled");
    assert.equal(extractHeaderState({ video: ["a.mp4", "b.mp4"] }, { video: 2 }), "disabled");
    assert.equal(extractHeaderState({ video: ["a.mp4", "notes.txt"] }, {}), "disabled");
    assert.equal(extractHeaderState({ video: ["a.mp4"] }, { video: 3 }), "disabled");
    assert.equal(extractHeaderState({ video: ["still.png"] }, {}), "hidden");
    // Picture Lock des images (60) sans effet
    assert.equal(extractHeaderState({ video: ["a.mp4"], image: ["x.png", "y.png"] }, { image: 2 }), "enabled");
});

test("cloche : les fichiers d'un Run ne sont jamais orphelins (26/10/2026)", () => {
    const runs = [{ outputs: [{ source: "G:\\P\\12.Video\\a.mp4" }, { source: "" }] }, { outputs: [] }, {}];
    assert.deepEqual([...runSourcePaths(runs)], ["g:/p/12.video/a.mp4"]);
    assert.deepEqual([...runSourcePaths(null)], []);
    const paths = ["G:/P/12.Video/a.mp4", "G:/P/12.Video/b.mp4"];
    assert.deepEqual(unusedProjectFiles(paths, {}, runSourcePaths(runs)), [paths[1]]);
    assert.deepEqual(unusedProjectFiles(paths, {}), paths);
});

test("Pick Up : liste de la galerie et chemins (26/10/2026)", () => {
    assert.equal(PICKUP_DIR, "90.Pick Up");
    assert.deepEqual(PICKUP_SUBS, { image: "Image", audio: "Son", video: "Video" });
    assert.ok(isMediaSubfolder("P/90.Pick Up/Image", "minimax_h3.ref2va", "image"));
    assert.ok(isMediaSubfolder("G/P/90.Pick Up/Son", "minimax_h3.ref2va", "audio"));
    assert.ok(isMediaSubfolder("P\\90.Pick Up\\Video", "ltx.2_3", "video"));
    assert.ok(isMediaSubfolder("P/90.Pick Up/Image", "minimax_h3.fl2va", "image"));
    assert.ok(isMediaSubfolder("P/90.Pick Up/Video", "minimax_h3.ref2va"));
    assert.ok(!isMediaSubfolder("P/90.Pick Up/Image", "minimax_h3.ref2va", "video"));
    assert.ok(!isMediaSubfolder("P/90.Pick Up/Son", "minimax_h3.ref2va", "image"));
    assert.ok(!isMediaSubfolder("P/90.Pick Up/Other", "minimax_h3.ref2va"));
    assert.ok(!isMediaSubfolder("P/90.Pick Up", "minimax_h3.ref2va"));
    assert.ok(!isMediaSubfolder("P/90.Pick Up/Video/Sub", "minimax_h3.ref2va"));
    assert.ok(!isMediaSubfolder("A/G/P/90.Pick Up/Image", "minimax_h3.ref2va"));
    assert.equal(pickupPath("G:\\X\\P", "audio"), "G:\\X\\P\\90.Pick Up\\Son");
    assert.equal(pickupPath("G:\\X\\P\\", "image"), "G:\\X\\P\\90.Pick Up\\Image");
});

test("Post-traitements : original suivi de ses posts, badge Post n (29/10/2026)", () => {
    const v = (index, extra) => Object.assign({ index, kind: "video", copy: "P/" + index + ".mp4", copy_exists: true }, extra);
    const A = v(0), A2 = v(2);
    const B = v(1, { post_of: 0, post_level: 1, post_date: "2026-10-29 11:00:00" });
    const C = v(3, { post_of: 1, post_level: 2, post_date: "2026-10-29 12:00:00" });
    assert.deepEqual(orderOutputs([A, B, A2, C]).map((o) => o.index), [0, 1, 3, 2]);
    // Deux posts du meme original : par date.
    const B2 = v(4, { post_of: 0, post_level: 1, post_date: "2026-10-29 10:30:00" });
    assert.deepEqual(orderOutputs([A, B, B2]).map((o) => o.index), [0, 4, 1]);
    // Post dont la source manque : a la fin.
    const lost = v(5, { post_of: 9, post_level: 1, post_date: "x" });
    assert.deepEqual(orderOutputs([lost, A]).map((o) => o.index), [0, 5]);
    assert.deepEqual(orderOutputs(null), []);
    const names = [A, B, A2, C];
    assert.equal(postLabel(B, names), "Post A");
    assert.equal(postLabel(C, names), "Post A.01");
    assert.equal(postLabel(A2, names), "");
    const runs = [{ file: "r.json", outputs: [A, A2, B] }];
    const items = rushItems(runs, "40.Rush Videos");
    assert.deepEqual(items.map((x) => x.output.index), [0, 2]);
    assert.deepEqual(items[0].posts.map((o) => o.index), [1]);
    assert.deepEqual(items[1].posts, []);
});

test("40 / 60 : original supprime gardé seulement avec un post present", () => {
    const v = (index, extra) => Object.assign({ index, kind: "video", copy: "P/" + index + ".mp4", copy_exists: true }, extra);
    const gone = v(0, { copy_exists: false });
    const post = v(1, { post_of: 0, post_level: 1, post_date: "d" });
    const items = rushItems([{ file: "r.json", outputs: [gone, post] }], "40.Rush Videos");
    assert.equal(items.length, 1);
    assert.equal(items[0].file, "");
    assert.deepEqual(items[0].posts.map((o) => o.index), [1]);
    const postGone = v(1, { post_of: 0, post_level: 1, post_date: "d", copy_exists: false });
    assert.deepEqual(rushItems([{ file: "r.json", outputs: [gone, postGone] }], "40.Rush Videos"), []);
    // Rien ne plante sur un original supprime.
    assert.equal(filterByDot(items, new Set(["footage"])).length, 0);
    assert.equal(dotCounts(items).outside, 1);   // le post seul
    assert.equal(groupByDot(items).length, 1);
});

test("40 / 60 : filtre et compteurs comptent les posts", () => {
    const v = (index, extra) => Object.assign({ index, kind: "video", copy: "P/" + index + ".mp4", copy_exists: true, in_project: true }, extra);
    const A = v(0, { place: "footage" });
    const B = v(1, { place: "picture_lock", post_of: 0, post_level: 1, post_date: "d" });
    const C = v(2, { place: "picture_lock", post_of: 0, post_level: 1, post_date: "e" });
    const items = rushItems([{ file: "r.json", outputs: [A, B, C] }], "40.Rush Videos");
    assert.equal(items.length, 1);
    assert.equal(filterByDot(items, new Set(["picture_lock"])).length, 1);
    assert.equal(filterByDot(items, new Set(["footage"])).length, 1);
    assert.equal(filterByDot(items, new Set(["rejected"])).length, 0);
    const counts = dotCounts(items);
    assert.equal(counts.picture_lock, 2);
    assert.equal(counts.footage, 1);
    assert.equal(postHint(items[0], new Set(["picture_lock"])), "2 post(s) in Picture Lock");
    assert.equal(postHint(items[0], new Set(["footage"])), "");
    assert.equal(postHint(items[0], new Set()), "");
    assert.equal(postHint(items[0], new Set(["picture_lock", "footage"])), "");
    const one = rushItems([{ file: "r.json", outputs: [A, B] }], "40.Rush Videos");
    assert.equal(postHint(one[0], new Set(["picture_lock"])), "1 post(s) in Picture Lock");
});

// ---- Etat du RefLoader au format des variantes (plan des variantes, Task 7) ----
import { migrateState } from "../web/js/profiles.js";

/** Etat de test : variante affichee + lignes {variante: {ligne: [chemins]}} (+ rognages / moments). */
function vstate(variant, rows, extra = {}) {
    const s = migrateState({ variant });
    for (const [v, r] of Object.entries(rows)) Object.assign(s.selections[v].rows, r);
    for (const [v, x] of Object.entries(extra)) {
        for (const [table, t] of Object.entries(x)) Object.assign(s.selections[v][table], t);
    }
    return s;
}
const R2 = "minimax_h3.ref2va";
const FL = "minimax_h3.fl2va";
const L3 = "ltx.2_3";
const L5 = "ltx.2_5";

test("rowFolder : dossier de chaque ligne (description)", () => {
    assert.equal(rowFolder(null, R2, "video_audios"), "14.Video-Audio");
    assert.equal(rowFolder(null, FL, "last_frame"), "08.Images");
    assert.equal(rowFolder(null, L5, "voice"), "10.Son");
    assert.equal(rowFolder(null, L5, "nope"), "");
});

test("saveItems only the shown variant", () => {
    const s = vstate(L5, { [R2]: { images: ["P/08.Images/m.png"] },
        [L5]: { guide_images: ["g1", "g2"], guide_video: ["gv"], voice: ["vo"] } });
    assert.deepEqual(saveItems(s).map((i) => [i.path, i.folder]), [
        ["g1", "08.Images"], ["g2", "08.Images"], ["gv", "12.Video"], ["vo", "10.Son"]]);
    // une meme video dans Video et Video/Audio : deux copies (par position)
    const r = vstate(R2, { [R2]: { videos: ["v"], video_audios: ["v"] } });
    assert.deepEqual(saveItems(r).map((i) => i.folder), ["12.Video", "14.Video-Audio"]);
});

test("remapState + mapBySequence : variante affichee seulement, rognages et moments suivent", () => {
    const s = vstate(L3, { [L3]: { guide_images: ["C:\\R\\a.png", "C:\\R\\b.png"], guide_video: ["C:\\R\\v.mp4"] },
        [L5]: { guide_images: ["C:\\R\\a.png"] } },
    { [L3]: { moments: { guide_images: { "c:/r/a.png": 2 } }, trims: { guide_video: { "c:/r/v.mp4": [1, 3] } } } });
    const out = remapState(s, mapBySequence(["P\\a.png", "", "P\\v.mp4"], s));
    assert.deepEqual(out.selections[L3].rows.guide_images, ["P\\a.png", "C:\\R\\b.png"]); // "" = manquant, garde
    assert.deepEqual(out.selections[L3].rows.guide_video, ["P\\v.mp4"]);
    assert.deepEqual(out.selections[L3].moments.guide_images, { "p/a.png": 2 });
    assert.deepEqual(out.selections[L3].trims.guide_video, { "p/v.mp4": [1, 3] });
    assert.deepEqual(out.selections[L5].rows.guide_images, ["C:\\R\\a.png"]);   // autre variante : inchangee
    assert.deepEqual(s.selections[L3].rows.guide_video, ["C:\\R\\v.mp4"]);       // etat d'origine intact
    // fn(chemin, ligne, variante) : toutes les variantes
    const all = remapState(s, (p) => p.replace("C:\\R", "Q"));
    assert.deepEqual(all.selections[L5].rows.guide_images, ["Q\\a.png"]);
});

test("hiddenFolderItems covers other variants", () => {
    const s = vstate(L3, { [R2]: { images: ["OLD/a.png", "OLD/b.png"], audios: ["OLD/s.wav"], video_audios: ["OLD/va.mp4"] },
        [FL]: { first_frame: ["OLD/a.png"] }, [L3]: { guide_images: ["NEW/g.png", "OLD/b.png"] },
        [L5]: { guide_images: ["NEW/g5.png"] } });
    // Ordre de la description (Ref2VA, FL2VA, LTX 2.5), sans doublon ni chemin de la variante affichee.
    assert.deepEqual(hiddenFolderItems(s, "08.Images").map((i) => i.path), ["OLD/a.png", "NEW/g5.png"]);
    assert.deepEqual(hiddenFolderItems(s, "10.Son"), [{ path: "OLD/s.wav", folder: "10.Son" }]);
    assert.deepEqual(hiddenFolderItems(s, "14.Video-Audio").map((i) => i.path), ["OLD/va.mp4"]);
});

test("dossiers suivis : variante affichee, retrait seulement si aucune variante ne l'utilise", () => {
    assert.deepEqual(UPDATE_FOLDERS, ["08.Images", "10.Son", "12.Video", "14.Video-Audio"]);
    const proj = "C:\\P\\Clip";
    const s = vstate(R2, { [R2]: { images: ["C:\\P\\Clip\\08.Images\\a.png", "D:\\x\\b.png"],
        videos: ["C:\\P\\Clip\\12.Video\\v.mp4"] }, [L5]: { soundtrack: ["C:\\P\\Clip\\10.Son\\s.wav"] } });
    assert.deepEqual(folderPaths(s, "08.Images"), ["C:\\P\\Clip\\08.Images\\a.png", "D:\\x\\b.png"]);
    assert.deepEqual(folderChanges(s, "08.Images", proj, null), { added: ["D:\\x\\b.png"], removed: [] });
    const snap = ["c:/p/clip/12.video/v.mp4", "C:\\P\\Clip\\12.Video\\old.mp4"];
    assert.deepEqual(folderChanges(s, "12.Video", proj, snap), { added: [], removed: ["C:\\P\\Clip\\12.Video\\old.mp4"] });
    // s.wav : seulement dans LTX 2.5 (variante cachee) -> pas retire
    assert.deepEqual(folderChanges(s, "10.Son", proj, ["C:\\P\\Clip\\10.Son\\s.wav"]), { added: [], removed: [] });
    assert.deepEqual(Object.keys(folderSnapshot(s)), UPDATE_FOLDERS);
    assert.deepEqual(folderSnapshot(s)["10.Son"], []);
});

test("mise a jour d'un dossier : seules les lignes de la variante affichee de ce dossier sont repointees", () => {
    const s = vstate(R2, { [R2]: { images: ["a", "b"], videos: ["v"] }, [FL]: { first_frame: ["b"] } });
    const items = saveItems(s).filter((i) => i.folder === "08.Images");
    assert.deepEqual(items.map((i) => i.path), ["a", "b"]);
    const out = remapState(s, mapFolderBySequence("08.Images", ["A", ""], s));
    assert.deepEqual(out.selections[R2].rows.images, ["A", "b"]);
    assert.deepEqual(out.selections[R2].rows.videos, ["v"]);
    assert.deepEqual(out.selections[FL].rows.first_frame, ["b"]);
});

test("references manquantes retirees d'un dossier, Reset", () => {
    const s = vstate(R2, { [R2]: { images: ["a", "gone"], videos: ["gone"] }, [L5]: { guide_images: ["gone", "c"] } },
        { [L5]: { moments: { guide_images: { c: 1 } } } });
    const out = withoutFolderPaths(s, "08.Images", ["GONE"]);
    assert.deepEqual(out.selections[R2].rows.images, ["a"]);
    assert.deepEqual(out.selections[L5].rows.guide_images, ["c"]);
    assert.deepEqual(out.selections[R2].rows.videos, ["gone"]);   // autre dossier
    const r = withoutReferences(s);
    assert.deepEqual(r.selections[L5].rows.guide_images, []);
    assert.deepEqual(r.selections[L5].moments.guide_images, {});
    assert.equal(r.variant, R2);
});

test("etat du RefLoader sans medias pour comparer le workflow", () => {
    const s = vstate(L5, { [L5]: { guide_images: ["a"] } });
    s.root = "R";
    s.limits = { [L5]: { fps: 25 } };
    const w = withoutMedia(s);
    assert.equal(w.selections, undefined);
    assert.equal(w.root, "R");
    assert.equal(w.variant, L5);
    assert.deepEqual(w.limits, { [L5]: { fps: 25 } });
    // ancien etat : converti puis compare de la meme facon
    assert.deepEqual(withoutMedia({ mode: "fl2va", images: ["a"], root: "R" }).variant, FL);
    assert.deepEqual(s.selections[L5].rows.guide_images, ["a"]);
});

test("unusedProjectFiles counts every variant", () => {
    const s = vstate(R2, { [L5]: { guide_video: ["P/12.Video/only25.mp4"] }, [R2]: { videos: ["P/12.Video/b.mp4"] } });
    const files = ["P/12.Video/only25.mp4", "P/12.Video/b.mp4", "P/12.Video/x.mp4"];
    assert.deepEqual(unusedProjectFiles(files, s), ["P/12.Video/x.mp4"]);
    assert.deepEqual(unusedProjectFiles(["p\\12.video\\B.MP4"], s), []);   // casse et separateurs ignores
});

test("folderUse LTX 2.5 14 is Not used", () => {
    const s = vstate(L5, { [L5]: { guide_images: ["P/08.Images/g1.png", "P/08.Images/g2.png"], soundtrack: ["P/10.Son/st.wav"],
        voice: ["P/10.Son/vo.wav"], guide_video: ["P/12.Video/gv.mp4"] }, [R2]: { images: ["P/08.Images/m.png"] } });
    const imgs = ["P/08.Images/g1.png", "P/08.Images/g2.png", "P/08.Images/m.png", "P/08.Images/x.png"];
    assert.deepEqual(folderUse(imgs, s, "08.Images"), { used: 2, max: 9, mode: "LTX 2.5" });
    assert.deepEqual(folderUse(["P/10.Son/st.wav", "P/10.Son/vo.wav"], s, "10.Son"), { used: 2, max: 2, mode: "LTX 2.5" });
    assert.deepEqual(folderUse(["P/14.Video-Audio/va.mp4"], s, "14.Video-Audio"), { used: 0, max: 0, mode: "LTX 2.5" });
    assert.deepEqual(folderMax(s), { "08.Images": 9, "10.Son": 2, "12.Video": 1, "14.Video-Audio": 0 });
    // Limits du RefLoader
    s.limits = { [L5]: { counts: { guide_images: 4 } } };
    assert.equal(folderUse(imgs, s, "08.Images").max, 4);
    // MiniMax : Ref2VA 9 images, FL2VA 2 frames
    assert.deepEqual(folderMax(vstate(R2, {})), { "08.Images": 9, "10.Son": 3, "12.Video": 3, "14.Video-Audio": 3 });
    assert.deepEqual(folderMax(vstate(FL, {})), { "08.Images": 2, "10.Son": 0, "12.Video": 0, "14.Video-Audio": 0 });
    assert.equal(folderUse([], vstate(FL, {}), "08.Images").mode, "F2VA / FL2VA");
});

test("configRefs : toutes les variantes et celle affichee", () => {
    const s = vstate(L3, { [L3]: { guide_images: ["g"] } });
    const c = configRefs(s);
    assert.equal(c.variant, L3);
    assert.deepEqual(c.selections[L3].rows.guide_images, ["g"]);
    c.selections[L3].rows.guide_images.push("x");
    assert.deepEqual(s.selections[L3].rows.guide_images, ["g"]);   // copie
});

test("loadedState keeps the shown variant", () => {
    // Exemple de l'utilisateur : Ref2VA -> Save -> LTX 2.3 -> Save -> Ref2VA -> Load = reste en Ref2VA.
    const report = { variant: L3, folders: [
        { folder: "08.Images", kind: "media", files: [
            { nom: "b.png", status: "ok", Utilisations: [{ variante: R2, ligne: "images", Indice: 2 }] },
            { nom: "a.png", status: "changed", archive: null, Utilisations: [
                { variante: R2, ligne: "images", Indice: 1 }, { variante: L3, ligne: "guide_images", Indice: 1, moment: -1 }] },
            { nom: "lost.png", status: "missing", archive: null, Utilisations: [{ variante: R2, ligne: "images", Indice: 3 }] },
            { nom: "f.png", status: "missing", archive: "f.png", Utilisations: [{ variante: FL, ligne: "first_frame", Indice: 1 }] },
        ] },
        { folder: "12.Video", kind: "media", files: [
            { nom: "s.mp4", status: "ok", Utilisations: [{ variante: R2, ligne: "videos", Indice: 1, trim: [5, 7] }] }] },
        { folder: "10.Son", kind: "media", files: [
            { nom: "x.wav", status: "ok", Utilisations: [{ variante: R2, ligne: "audios", Indice: 1 }] }] },
    ] };
    const base = vstate(R2, { [R2]: { images: ["old.png"], audios: ["keep.wav"], videos: ["C:\\o.mp4"] },
        [L3]: { guide_images: ["oldg.png"] } }, { [R2]: { trims: { videos: { "c:/o.mp4": [1, 2] } } } });
    base.root = "R";
    const s = loadedState(base, report, "C:\\P", ["08.Images", "12.Video"]);
    assert.equal(s.variant, R2);
    assert.equal(s.root, "R");
    assert.deepEqual(s.selections[R2].rows.images, ["C:\\P\\08.Images\\a.png", "C:\\P\\08.Images\\b.png"]);
    assert.deepEqual(s.selections[FL].rows.first_frame, ["C:\\P\\08.Images\\f.png"]);
    assert.deepEqual(s.selections[L3].rows.guide_images, ["C:\\P\\08.Images\\a.png"]);
    assert.deepEqual(s.selections[L3].moments.guide_images, { "c:/p/08.images/a.png": -1 });
    assert.deepEqual(s.selections[R2].rows.videos, ["C:\\P\\12.Video\\s.mp4"]);
    assert.deepEqual(s.selections[R2].trims.videos, { "c:/p/12.video/s.mp4": [5, 7] });
    assert.deepEqual(s.selections[R2].rows.audios, ["keep.wav"]);   // 10.Son non coche
    assert.deepEqual(base.selections[R2].rows.images, ["old.png"]);   // copie
    // ancien etat du workflow (sans selections) : converti
    const old = loadedState({ mode: "ref2va", images: ["z.png"] }, report, "C:\\P", ["10.Son"]);
    assert.deepEqual(old.selections[R2].rows.images, ["z.png"]);
    assert.deepEqual(old.selections[R2].rows.audios, ["C:\\P\\10.Son\\x.wav"]);
});

test("visualisation : ordre du RefLoader, initiale pour une ligne d'un seul fichier, puis par nom", () => {
    const D = "C:\\P\\08.Images\\";
    const files = [D + "z.png", D + "b.png", D + "a.png", D + "f.png", D + "y.png"];
    const st = vstate(FL, { [FL]: { first_frame: [D + "f.png"], last_frame: [D + "b.png"] },
        [R2]: { images: [D + "b.png", "c:/p/08.images/A.png"] } });
    assert.deepEqual(orderedFolderFiles(files, st, "08.Images"), [
        { path: D + "f.png", badge: "F" }, { path: D + "b.png", badge: "L" },
        { path: D + "a.png", badge: "" }, { path: D + "y.png", badge: "" }, { path: D + "z.png", badge: "" }]);
    st.variant = R2;
    assert.deepEqual(orderedFolderFiles(files, st, "08.Images").slice(0, 2),
        [{ path: D + "b.png", badge: "1" }, { path: D + "a.png", badge: "2" }]);
    const S = "C:\\P\\10.Son\\";
    const lt = vstate(L5, { [L5]: { soundtrack: [S + "s.wav"], voice: [S + "v.wav"] } });
    assert.deepEqual(orderedFolderFiles([S + "v.wav", S + "s.wav"], lt, "10.Son").map((x) => x.badge), ["S", "V"]);
    assert.deepEqual(orderedFolderFiles([D + "b.png", D + "a.png"], null, "10.Son").map((x) => x.badge), ["", ""]);
});

test("isMediaSubfolder keeps Extract Frame for image rows", () => {
    for (const f of ["08.Images", "10.Son", "12.Video", "14.Video-Audio"]) assert.ok(isMediaSubfolder("P/" + f, R2));
    for (const f of ["00.Workflows", "40.Rush Videos", "99.Project-Config"]) assert.ok(!isMediaSubfolder("P/" + f, R2));
    assert.ok(!isMediaSubfolder("P", R2));
    assert.ok(!isMediaSubfolder("P/08.Images/Archives", R2));
    assert.ok(isMediaSubfolder("G/P/10.Son", R2));
    assert.ok(isMediaSubfolder("P\\08.Images", FL));
    assert.ok(!isMediaSubfolder("P/12.Video", FL));
    for (const f of ["08.Images", "10.Son", "12.Video"]) assert.ok(isMediaSubfolder("P/" + f, L5));
    assert.ok(!isMediaSubfolder("P/14.Video-Audio", L5));
    assert.ok(isMediaSubfolder("P/40.Rush Videos/Picture Lock/Extract Frame", L5, "image"));
    assert.ok(!isMediaSubfolder("P/40.Rush Videos/Picture Lock/Extract Frame", L5, "video"));
    assert.ok(isMediaSubfolder("P/14.Video-Audio"));   // sans variante : les quatre dossiers
});

test("Etiquettes Original / Post n (30/10/2026)", () => {
    const A = { index: 0 }, Z = { index: 2 };
    const B = { index: 1, post_of: 0, post_level: 1 };
    const C = { index: 3, post_of: 1, post_level: 2 };
    const outs = [A, B, Z, C];
    assert.deepEqual(postTags(A, outs), { self: "Original", parent: "", source: null });
    assert.deepEqual(postTags(Z, outs), { self: "", parent: "", source: null });
    assert.deepEqual(postTags(B, outs), { self: "Post A", parent: "Original", source: A });
    assert.deepEqual(postTags(C, outs), { self: "Post A.01", parent: "Post A", source: B });
    // Source absente : Original, sans fichier.
    assert.deepEqual(postTags({ index: 5, post_of: 9, post_level: 1 }, outs), { self: "Post ?", parent: "Original", source: null });
    assert.deepEqual(postTags(null, outs), { self: "", parent: "", source: null });
});
