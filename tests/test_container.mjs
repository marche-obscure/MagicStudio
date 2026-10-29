// Tests du MagicStudio Container (sans ComfyUI) : node --test tests/test_container.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { isOldLoaderOutputs, rewirePlan, pairedOutputs, migrateState, variantLayoutKeys, renumberOldName,
    renumberModeLinks, outputKey } from "../web/js/profiles.js";
import { traceSource, outputLinksOf, saveOutputLinks, restoreOutputLinks } from "../web/js/graph_links.js";

// ---- faux graphe (memes champs que LiteGraph : links Map, getNodeById, inputs[].link, connect) ----
function fakeGraph() {
    const g = { links: new Map(), nodes: new Map(), _nodes: [], last: 0 };
    g.getNodeById = (id) => g.nodes.get(id) || null;
    return g;
}
function fakeNode(g, id, type, inputs, outputs, extra = {}) {
    const n = Object.assign({
        id, type, graph: g,
        inputs: inputs.map((name) => ({ name, link: null })),
        outputs: outputs.map((name) => ({ name })),
    }, extra);
    n.connect = (slot, target, tslot) => {
        const lid = ++g.last;
        g.links.set(lid, { id: lid, origin_id: n.id, origin_slot: slot, target_id: target.id, target_slot: tslot });
        target.inputs[tslot].link = lid;
    };
    g.nodes.set(id, n);
    g._nodes.push(n);
    return n;
}
const isLoader = (n) => n.type === "MiniMaxH3RefLoader";

test("isOldLoaderOutputs", () => {
    const old = ["ref_image_1", "ref_image_2", "ref_video_1", "ref_video_audio_1", "ref_audio_1"];
    while (old.length < 18) old.push("ref_x_" + old.length);
    assert.equal(isOldLoaderOutputs(old.concat(["project"])), true);
    assert.equal(isOldLoaderOutputs(["project", "package"]), false);
    assert.equal(isOldLoaderOutputs([]), false);
    assert.equal(isOldLoaderOutputs(null), false);
});

test("rewirePlan maps old links by name", () => {
    const old = [
        { name: "ref_image_1", links: [{ targetId: 7, targetSlot: 0 }] },
        { name: "ref_image_2", links: [{ targetId: 7, targetSlot: 1 }] },
        { name: "ref_video_1", links: [{ targetId: 7, targetSlot: 2 }, { targetId: 9, targetSlot: 0 }] },
        { name: "project", links: [{ targetId: 8, targetSlot: 0 }] },
    ];
    const keys = ["ref_image_1", "ref_image_2", "ref_video_1", "ref_video_audio_1", "ref_audio_1"];
    const plan = rewirePlan(old, keys);
    assert.deepEqual(plan.toContainer, [
        { name: "ref_image_1", targetId: 7, targetSlot: 0 },
        { name: "ref_image_2", targetId: 7, targetSlot: 1 },
        { name: "ref_video_1", targetId: 7, targetSlot: 2 },
        { name: "ref_video_1", targetId: 9, targetSlot: 0 },
    ]);
    assert.deepEqual(plan.toProject, [{ name: "project", targetId: 8, targetSlot: 0 }]);
    assert.deepEqual(plan.dropped, []);
});

test("rewirePlan keeps project", () => {
    const plan = rewirePlan([{ name: "project", links: [{ targetId: 3, targetSlot: 1 }] }], []);
    assert.deepEqual(plan.toProject, [{ name: "project", targetId: 3, targetSlot: 1 }]);
    assert.deepEqual(plan.toContainer, []);
});

test("rewirePlan drops unknown names", () => {
    const plan = rewirePlan([
        { name: "ref_image_9", links: [{ targetId: 1, targetSlot: 0 }] },
        { name: "ref_image_3", links: [] }, // sans lien : rien a reprendre, pas signale
    ], ["ref_image_1"]);
    assert.deepEqual(plan.dropped, ["ref_image_9"]);
    assert.deepEqual(plan.toContainer, []);
});

test("old workflow : old names (from 1) become the container keys (from 0, like MiniMax)", () => {
    const s = migrateState({ mode: "ref2va", images: ["a.png", "b.png"], videos: ["v.mp4"] });
    const keys = variantLayoutKeys(s);
    assert.deepEqual(keys, ["ref_image_0", "ref_image_1", "ref_video_0", "ref_video_audio_0", "ref_audio_0"]);
    const old = ["ref_image_1", "ref_image_2", "ref_video_1", "ref_video_audio_1", "ref_audio_1", "project"];
    assert.deepEqual(old.map((n) => renumberOldName(n)), keys.concat(["project"]));
    // LTX garde sa numerotation a partir de 1 ; first_frame / last_frame inchanges
    assert.deepEqual(variantLayoutKeys(migrateState({ variant: "ltx.2_3" })).slice(4, 6), ["guide_image_1", "guide_frame_1"]);
    assert.equal(renumberOldName("guide_image_1"), "guide_image_1");
    assert.equal(renumberOldName("first_frame"), "first_frame");
    assert.equal(renumberOldName("ref_video_audio_3"), "ref_video_audio_2");
    assert.equal(outputKey("ref_image_{n}", { first_index: 0 }, 0), "ref_image_0");
    assert.equal(outputKey("guide_image_{n}", {}, 0), "guide_image_1");
});

test("modeLinks saved before the numbering from 0 are renamed", () => {
    const m = renumberModeLinks({ "minimax_h3.ref2va": [{ key: "ref_image_1", label: "hero", links: [] }],
        "ltx.2_3": [{ key: "guide_image_1", label: null, links: [] }] });
    assert.equal(m["minimax_h3.ref2va"][0].key, "ref_image_0");
    assert.equal(m["minimax_h3.ref2va"][0].label, "hero");
    assert.equal(m["ltx.2_3"][0].key, "guide_image_1");
});

test("linked loader through Get/Set and Reroute", () => {
    const g = fakeGraph();
    const loader = fakeNode(g, 1, "MiniMaxH3RefLoader", ["state"], ["project", "package"]);
    const set = fakeNode(g, 2, "SetNode", ["value"], [], { widgets: [{ value: "pkg" }] });
    const get = fakeNode(g, 3, "GetNode", [], ["value"], { widgets: [{ value: "pkg" }] });
    const reroute = fakeNode(g, 4, "Reroute", [""], [""]);
    const container = fakeNode(g, 5, "MagicStudioContainer", ["package"], []);
    loader.connect(1, set, 0);
    get.connect(0, reroute, 0);
    reroute.connect(0, container, 0);
    assert.equal(traceSource(container, 0, isLoader), loader);
    // Get qui donne lui-meme son lien (Pixaroma / KJNodes : getInputLink)
    const g2 = fakeGraph();
    const l2 = fakeNode(g2, 1, "MiniMaxH3RefLoader", [], ["project", "package"]);
    const get2 = fakeNode(g2, 2, "Get (Pixaroma)", [], ["value"]);
    const c2 = fakeNode(g2, 3, "MagicStudioContainer", ["package"], []);
    get2.getInputLink = () => ({ origin_id: 1, origin_slot: 1 });
    get2.connect(0, c2, 0);
    assert.equal(traceSource(c2, 0, isLoader), l2);
    // rien de branche, ou un autre noeud : null
    const g3 = fakeGraph();
    const c3 = fakeNode(g3, 1, "MagicStudioContainer", ["package"], []);
    assert.equal(traceSource(c3, 0, isLoader), null);
    const other = fakeNode(g3, 2, "LoadImage", [], ["IMAGE"]);
    other.connect(0, c3, 0);
    assert.equal(traceSource(c3, 0, isLoader), null);
});

test("links saved per variant", () => {
    const g = fakeGraph();
    const c = fakeNode(g, 1, "MagicStudioContainer", ["package"], ["ref_image_1", "ref_video_1"]);
    const target = fakeNode(g, 2, "MiniMaxH3ReferenceToVideo", ["ref_image_0", "ref_video_0"], []);
    c.outputs[0].label = "hero";
    c.connect(0, target, 0);
    c.connect(1, target, 1);
    const saved = saveOutputLinks(c);
    assert.deepEqual(saved, [
        { key: "ref_image_1", label: "hero", links: [{ targetId: 2, input: "ref_image_0" }] },
        { key: "ref_video_1", label: null, links: [{ targetId: 2, input: "ref_video_0" }] },
    ]);
    assert.deepEqual(outputLinksOf(c, 1).map((l) => l.target_slot), [1]);
    // retour sur la variante : entree libre seulement
    const g2 = fakeGraph();
    const c2 = fakeNode(g2, 1, "MagicStudioContainer", ["package"], ["ref_video_1", "ref_image_1"]);
    const t2 = fakeNode(g2, 2, "MiniMaxH3ReferenceToVideo", ["ref_image_0", "ref_video_0"], []);
    const busy = fakeNode(g2, 3, "Other", [], ["x"]);
    busy.connect(0, t2, 1); // ref_video_0 deja prise
    restoreOutputLinks(c2, saved);
    assert.equal(c2.outputs[1].label, "hero");
    assert.deepEqual(outputLinksOf(c2, 1).map((l) => l.target_slot), [0]);
    assert.deepEqual(outputLinksOf(c2, 0), []);
});

test("pair colors only for a video and its soundtrack of the same number", () => {
    const s = migrateState({ mode: "ref2va", videos: ["a.mp4", "b.mp4"], video_audios: ["a.mp4"] });
    assert.deepEqual(pairedOutputs(s), { ref_video_0: 1, ref_video_audio_0: 1 });
    assert.deepEqual(pairedOutputs(migrateState({ variant: "ltx.2_3" })), {});
});
