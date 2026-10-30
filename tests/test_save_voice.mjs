// Tests des fonctions pures du noeud MagicStudio SaveVoice (sans ComfyUI) :
//     node --test tests/test_save_voice.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { QUALITIES, qualityChoices, fixQuality, voicePath } from "../web/js/save_voice.js";

test("qualites proposees selon le format", () => {
    assert.deepEqual(qualityChoices("mp3"), ["V0", "128k", "320k"]);
    assert.deepEqual(qualityChoices("opus"), ["64k", "96k", "128k", "192k", "320k"]);
    assert.deepEqual(qualityChoices("wav"), []);
    assert.deepEqual(qualityChoices("flac"), []);
    assert.deepEqual(qualityChoices("xyz"), []);
});

test("la liste renvoyee est une copie", () => {
    qualityChoices("mp3").push("zz");
    assert.deepEqual(QUALITIES.mp3, ["V0", "128k", "320k"]);
});

test("qualite corrigee quand le format change", () => {
    assert.equal(fixQuality("wav", "V0"), "none");
    assert.equal(fixQuality("flac", "128k"), "none");
    assert.equal(fixQuality("mp3", "none"), "V0");
    assert.equal(fixQuality("opus", "V0"), "128k");
    assert.equal(fixQuality("opus", "320k"), "320k");
    assert.equal(fixQuality("mp3", "320k"), "320k");
    assert.equal(fixQuality("mp3", "64k"), "V0");
});

test("dossier des voix sous le projet, separateur du chemin recu", () => {
    assert.equal(voicePath(String.raw`G:\P\Proj`), String.raw`G:\P\Proj\90.Pick Up\Son`);
    assert.equal(voicePath(String.raw`G:\P\Proj\ `.trim()), String.raw`G:\P\Proj\90.Pick Up\Son`);
    assert.equal(voicePath("/home/u/Proj"), "/home/u/Proj/90.Pick Up/Son");
    assert.equal(voicePath(""), "");
});

// ---- linkedProject (graph_links.js), partage par Final Cut et SaveVoice ----
import { linkedProject } from "../web/js/graph_links.js";

function fakeGraph() {
    const g = { links: new Map(), nodes: new Map(), _nodes: [], last: 0 };
    g.getNodeById = (id) => g.nodes.get(id) || null;
    return g;
}
function fakeNode(g, id, type, inputs, extra = {}) {
    const n = Object.assign({ id, type, graph: g, inputs: inputs.map((name) => ({ name, link: null })) }, extra);
    g.nodes.set(id, n);
    g._nodes.push(n);
    return n;
}
function wire(g, from, to, slot) {
    const lid = ++g.last;
    g.links.set(lid, { id: lid, origin_id: from.id, origin_slot: 0, target_id: to.id, target_slot: slot });
    to.inputs[slot].link = lid;
}
const PROJECT = "MiniMaxH3Project";
const INFO = { name: "Yacht", path: String.raw`G:\P\Yacht` };

test("linkedProject : lien direct, Reroute, Get / Set de meme nom", () => {
    const g = fakeGraph();
    const proj = fakeNode(g, 1, PROJECT, [], { mmProjectInfo: () => INFO });
    const sv = fakeNode(g, 2, "MagicStudioSaveVoice", ["audio", "project"]);
    assert.deepEqual(linkedProject(sv, "project", PROJECT), { wired: false, info: null });
    wire(g, proj, sv, 1);
    assert.deepEqual(linkedProject(sv, "project", PROJECT), { wired: true, info: INFO });

    const g2 = fakeGraph();
    const p2 = fakeNode(g2, 1, PROJECT, [], { mmProjectInfo: () => null });
    const rr = fakeNode(g2, 2, "Reroute", [""]);
    const fc = fakeNode(g2, 3, "MiniMaxH3FinalCut", ["final_cut"]);
    wire(g2, p2, rr, 0);
    wire(g2, rr, fc, 0);
    assert.deepEqual(linkedProject(fc, "final_cut", PROJECT), { wired: true, info: null });

    const g3 = fakeGraph();
    const p3 = fakeNode(g3, 1, PROJECT, [], { mmProjectInfo: () => INFO });
    const set = fakeNode(g3, 2, "SetNode", ["value"], { widgets: [{ value: "proj" }] });
    const get = fakeNode(g3, 3, "GetNode", [], { widgets: [{ value: "proj" }] });
    const sv3 = fakeNode(g3, 4, "MagicStudioSaveVoice", ["audio", "project"]);
    wire(g3, p3, set, 0);
    wire(g3, get, sv3, 1);
    assert.deepEqual(linkedProject(sv3, "project", PROJECT), { wired: true, info: INFO });
});

test("linkedProject : autre noeud ou entree absente", () => {
    const g = fakeGraph();
    const other = fakeNode(g, 1, "SomethingElse", []);
    const sv = fakeNode(g, 2, "MagicStudioSaveVoice", ["audio", "project"]);
    wire(g, other, sv, 1);
    assert.deepEqual(linkedProject(sv, "project", PROJECT), { wired: false, info: null });
    assert.deepEqual(linkedProject(sv, "nope", PROJECT), { wired: false, info: null });
});
