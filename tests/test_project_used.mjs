// Lien project_used (30/10/2026) : renommage des anciens noms final_cut / project dans les
// workflows enregistres, et recherche du noeud Project par le nouveau nom ou l'ancien.
//     node --test tests/test_project_used.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
    PROJECT_USED, LEGACY_PROJECT_LINKS, projectInputNames, renameLegacySlots, linkedProject,
} from "../web/js/graph_links.js";

const clone = (o) => JSON.parse(JSON.stringify(o));

test("noms : project_used et anciens noms acceptes", () => {
    assert.equal(PROJECT_USED, "project_used");
    assert.deepEqual(projectInputNames("MiniMaxH3FinalCut"), ["project_used", "final_cut"]);
    assert.deepEqual(projectInputNames("MagicStudioSaveVoice"), ["project_used", "project"]);
    assert.deepEqual(LEGACY_PROJECT_LINKS.MiniMaxH3Project, { outputs: { final_cut: "project_used" } });
});

test("renameLegacySlots : sortie final_cut du noeud Project, liens gardes", () => {
    const data = { type: "MiniMaxH3Project", outputs: [
        { name: "final_cut", localized_name: "final_cut", type: "MINIMAX_FINAL_CUT", links: [7, 9], label: "final_cut" },
    ] };
    const out = renameLegacySlots(data, LEGACY_PROJECT_LINKS.MiniMaxH3Project);
    assert.equal(out, data);
    assert.deepEqual(data.outputs, [
        { name: "project_used", localized_name: "project_used", type: "MINIMAX_FINAL_CUT", links: [7, 9], label: "project_used" },
    ]);
});

test("renameLegacySlots : entree final_cut du Final Cut, lien garde", () => {
    const data = { type: "MiniMaxH3FinalCut", inputs: [
        { name: "final_cut", localized_name: "final_cut", type: "MINIMAX_FINAL_CUT", link: 12 },
    ] };
    renameLegacySlots(data, LEGACY_PROJECT_LINKS.MiniMaxH3FinalCut);
    assert.deepEqual(data.inputs, [
        { name: "project_used", localized_name: "project_used", type: "MINIMAX_FINAL_CUT", link: 12 },
    ]);
});

test("renameLegacySlots : entree project du SaveVoice, autres entrees intactes, etiquette perso gardee", () => {
    const data = { type: "MagicStudioSaveVoice", inputs: [
        { name: "audio", type: "AUDIO", link: 3 },
        { name: "project", type: "MINIMAX_FINAL_CUT", link: 4, label: "my project" },
        { name: "prefix", type: "STRING", link: null, widget: { name: "prefix" } },
    ] };
    renameLegacySlots(data, LEGACY_PROJECT_LINKS.MagicStudioSaveVoice);
    assert.deepEqual(data.inputs, [
        { name: "audio", type: "AUDIO", link: 3 },
        { name: "project_used", type: "MINIMAX_FINAL_CUT", link: 4, label: "my project" },
        { name: "prefix", type: "STRING", link: null, widget: { name: "prefix" } },
    ]);
});

test("renameLegacySlots : donnees deja a jour inchangees", () => {
    const cases = [
        [{ outputs: [{ name: "project_used", type: "MINIMAX_FINAL_CUT", links: [1] }] }, "MiniMaxH3Project"],
        [{ inputs: [{ name: "project_used", type: "MINIMAX_FINAL_CUT", link: 2 }] }, "MiniMaxH3FinalCut"],
        [{ inputs: [{ name: "audio", link: null }, { name: "project_used", link: 5 }] }, "MagicStudioSaveVoice"],
    ];
    for (const [data, type] of cases) {
        const before = clone(data);
        renameLegacySlots(data, LEGACY_PROJECT_LINKS[type]);
        assert.deepEqual(data, before, type);
    }
});

test("renameLegacySlots : pas de doublon si le nouveau nom existe deja ; donnees vides acceptees", () => {
    const data = { inputs: [{ name: "project_used", link: 1 }, { name: "final_cut", link: null }] };
    const before = clone(data);
    renameLegacySlots(data, LEGACY_PROJECT_LINKS.MiniMaxH3FinalCut);
    assert.deepEqual(data, before);
    assert.equal(renameLegacySlots(null, LEGACY_PROJECT_LINKS.MiniMaxH3FinalCut), null);
    assert.deepEqual(renameLegacySlots({}, null), {});
    assert.deepEqual(renameLegacySlots({ inputs: [null] }, LEGACY_PROJECT_LINKS.MiniMaxH3FinalCut), { inputs: [null] });
});

// ---- linkedProject par project_used ou par l'ancien nom ----
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

test("linkedProject : entree project_used ou ancien nom (noeud pas encore migre)", () => {
    for (const [type, names] of [["MagicStudioSaveVoice", ["audio", "project_used"]],
        ["MagicStudioSaveVoice", ["audio", "project"]],
        ["MiniMaxH3FinalCut", ["final_cut"]], ["MiniMaxH3FinalCut", ["project_used"]]]) {
        const g = fakeGraph();
        const proj = fakeNode(g, 1, PROJECT, [], { mmProjectInfo: () => INFO });
        const n = fakeNode(g, 2, type, names);
        const accepted = projectInputNames(type);
        assert.deepEqual(linkedProject(n, accepted, PROJECT), { wired: false, info: null });
        wire(g, proj, n, names.length - 1);
        assert.deepEqual(linkedProject(n, accepted, PROJECT), { wired: true, info: INFO }, type + " " + names);
    }
});

test("linkedProject : un seul nom (texte) toujours accepte", () => {
    const g = fakeGraph();
    const proj = fakeNode(g, 1, PROJECT, [], { mmProjectInfo: () => INFO });
    const n = fakeNode(g, 2, "MiniMaxH3FinalCut", ["project_used"]);
    wire(g, proj, n, 0);
    assert.deepEqual(linkedProject(n, "project_used", PROJECT), { wired: true, info: INFO });
});

// ---- Les noeuds utilisent bien project_used ----
const src = (f) => readFileSync(fileURLToPath(new URL("../web/js/" + f, import.meta.url)), "utf8");

test("Final Cut et SaveVoice cherchent le projet par projectInputNames et migrent configure", () => {
    for (const f of ["final_cut_node.js", "save_voice_node.js", "project_node.js"]) {
        const s = src(f);
        assert.ok(s.includes("renameLegacySlots("), f + " : renameLegacySlots absent");
        assert.ok(!/linkedProject(Of)?\(node, "(final_cut|project)"/.test(s), f + " : ancien nom d'entree");
    }
    assert.ok(src("final_cut_node.js").includes("projectInputNames("));
    assert.ok(src("save_voice_node.js").includes("projectInputNames("));
    assert.ok(!src("project_node.js").includes('o.name === "final_cut")'), "project_node : sortie final_cut");
});
