import test from "node:test";
import assert from "node:assert/strict";
import {
    projectSections, sectionQuery, rushFolderOf, kindOfName, projectPathOf, projectGroups, splitProjectName, pickProject, mtimeText,
} from "../web/js/project_browser_pure.js";

const folders = (kind, mode) => projectSections(kind, mode).map((s) => s.folder);

test("projectSections normal : dossiers de chaque type", () => {
    assert.deepEqual(folders("video", "normal"), ["12.Video", "14.Video-Audio", "40.Rush Videos", "90.Pick Up/Video"]);
    assert.deepEqual(folders("image", "normal"), ["08.Images", "60.Rush Images", "90.Pick Up/Image"]);
    assert.deepEqual(folders("audio", "normal"), ["10.Son", "90.Pick Up/Son"]);
});

test("projectSections archives : le sous-dossier Archives de chaque dossier", () => {
    assert.deepEqual(folders("video", "archives"),
        ["12.Video/Archives", "14.Video-Audio/Archives", "40.Rush Videos/Archives", "90.Pick Up/Video/Archives"]);
    assert.deepEqual(folders("image", "archives"), ["08.Images/Archives", "60.Rush Images/Archives", "90.Pick Up/Image/Archives"]);
    assert.deepEqual(folders("audio", "archives"), ["10.Son/Archives", "90.Pick Up/Son/Archives"]);
});

test("projectSections extract : Extract Frame quel que soit le type", () => {
    for (const k of ["video", "image", "audio"]) {
        assert.deepEqual(projectSections(k, "extract"), [{ title: "Extract Frame", folder: "40.Rush Videos/Picture Lock/Extract Frame" }]);
    }
});

test("sectionQuery et rushFolderOf", () => {
    assert.deepEqual(sectionQuery("90.Pick Up/Video/Archives"), { base: "90.Pick Up/Video", archives: true });
    assert.deepEqual(sectionQuery("12.Video"), { base: "12.Video", archives: false });
    assert.equal(rushFolderOf("40.Rush Videos"), "40.Rush Videos");
    assert.equal(rushFolderOf("60.Rush Images"), "60.Rush Images");
    assert.equal(rushFolderOf("40.Rush Videos/Archives"), "");
    assert.equal(rushFolderOf(EXTRACT()), "");
});
function EXTRACT() {
    return projectSections("video", "extract")[0].folder;
}

test("projectGroups : projet simple et MultiProject avec sous-projets", () => {
    const tree = [{ name: "Solo", projects: null }, { name: "Serie", projects: ["Ep1", "Ep2"] }];
    assert.deepEqual(projectGroups(tree), [
        { name: "Solo", multi: false, subs: [] },
        { name: "Serie", multi: true, subs: ["Ep1", "Ep2"] },
    ]);
    assert.deepEqual(projectGroups(null), []);
});

test("splitProjectName : G/P et projet simple", () => {
    assert.deepEqual(splitProjectName("Serie/Ep1"), { group: "Serie", sub: "Ep1" });
    assert.deepEqual(splitProjectName("Solo"), { group: "Solo", sub: "" });
    assert.deepEqual(splitProjectName(""), { group: "", sub: "" });
});

test("pickProject : choix du groupe, sous-projet gardé s'il appartient au groupe", () => {
    const g = projectGroups([{ name: "Solo", projects: null }, { name: "Serie", projects: ["Ep1", "Ep2"] }, { name: "Vide", projects: [] }]);
    assert.equal(pickProject(g, "Solo", "Serie/Ep2"), "Solo");
    assert.equal(pickProject(g, "Serie", "Solo"), "Serie/Ep1");
    assert.equal(pickProject(g, "Serie", "Serie/Ep2"), "Serie/Ep2");
    assert.equal(pickProject(g, "Serie", "Autre/Ep2"), "Serie/Ep1");
    assert.equal(pickProject(g, "Vide", ""), "");
    assert.equal(pickProject(g, "Inconnu", "Solo"), "");
});

test("projectPathOf, kindOfName, mtimeText", () => {
    assert.equal(projectPathOf("F:\\Projets\\", "Serie/Ep1"), "F:\\Projets\\Serie\\Ep1");
    assert.equal(projectPathOf("/data/p", "Solo"), "/data/p/Solo");
    assert.equal(kindOfName("a.MP4"), "video");
    assert.equal(kindOfName("a.png"), "image");
    assert.equal(kindOfName("a.flac"), "audio");
    assert.equal(kindOfName("a.txt"), "");
    assert.equal(mtimeText(0), "");
    assert.match(mtimeText(1700000000), /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
});
