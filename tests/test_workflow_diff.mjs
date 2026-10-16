// node --test tests/test_workflow_diff.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffWorkflows, workflowSignature, formatLastSave, shortValue } from "../web/js/workflow_diff.js";

const base = () => ({
    nodes: [
        { id: 1, type: "KSampler", pos: [0, 0], size: [300, 200], mode: 0, widgets_values: [123, "fixed", 20] },
        { id: 2, type: "SaveImage", title: "Final", pos: [400, 0], size: [200, 100], mode: 0, widgets_values: ["out"] },
    ],
    links: [[5, 1, 0, 2, 0, "IMAGE"]],
    extra: { ds: { scale: 1, offset: [0, 0] } },
});

test("identiques : rien a signaler, meme si la vue change", () => {
    const b = base();
    b.extra.ds.scale = 2;
    const d = diffWorkflows(base(), b);
    assert.equal(d.same, true);
    assert.equal(workflowSignature(base()), workflowSignature(b));
});

test("disposition seule", () => {
    const b = base();
    b.nodes[0].pos = [50, 60];
    const d = diffWorkflows(base(), b);
    assert.equal(d.same, false);
    assert.equal(d.layout, true);
    assert.deepEqual([d.added, d.removed, d.changed], [[], [], []]);
    assert.equal(workflowSignature(base()), workflowSignature(b)); // la cloche ne s'allume pas pour ca
});

test("valeurs changees, avec les noms des widgets", () => {
    const b = base();
    b.nodes[0].widgets_values[0] = 456;
    b.nodes[1].mode = 4;
    const d = diffWorkflows(base(), b, { 1: ["seed", "control_after_generate", "steps"] });
    assert.deepEqual(d.changed, [
        { id: 1, label: "KSampler #1", field: "seed", before: 123, after: 456 },
        { id: 2, label: "Final #2", field: "mode", before: 0, after: 4 },
    ]);
    assert.notEqual(workflowSignature(base()), workflowSignature(b));
});

test("sans noms de widgets : value N", () => {
    const b = base();
    b.nodes[0].widgets_values[2] = 30;
    assert.equal(diffWorkflows(base(), b).changed[0].field, "value 3");
});

test("widgets_values en objet", () => {
    const a = base();
    a.nodes[1].widgets_values = { prefix: "out", fps: 24 };
    const b = base();
    b.nodes[1].widgets_values = { prefix: "out", fps: 30 };
    assert.deepEqual(diffWorkflows(a, b).changed, [{ id: 2, label: "Final #2", field: "fps", before: 24, after: 30 }]);
});

test("noeuds ajoutes et supprimes, liens", () => {
    const b = base();
    b.nodes = b.nodes.filter((n) => n.id !== 2);
    b.nodes.push({ id: 3, type: "PreviewImage", pos: [0, 0], size: [1, 1], mode: 0, widgets_values: [] });
    b.links = [[6, 1, 0, 3, 0, "IMAGE"]];
    const d = diffWorkflows(base(), b);
    assert.deepEqual(d.added, [{ id: 3, label: "PreviewImage #3" }]);
    assert.deepEqual(d.removed, [{ id: 2, label: "Final #2" }]);
    assert.equal(d.linksAdded, 1);
    assert.equal(d.linksRemoved, 1);
});

test("liens au format objet", () => {
    const a = base();
    a.links = [{ id: 5, origin_id: 1, origin_slot: 0, target_id: 2, target_slot: 0, type: "IMAGE" }];
    assert.equal(diffWorkflows(a, base()).same, true);
});

test("fichier vide ou invalide : tout est ajoute", () => {
    const d = diffWorkflows(null, base());
    assert.equal(d.added.length, 2);
});

test("formatLastSave : dd/MM/yyyy at HH:mm:ss", () => {
    assert.equal(formatLastSave(new Date(2026, 9, 6, 9, 5, 3)), "06/10/2026 at 09:05:03");
});

test("shortValue coupe les longues valeurs", () => {
    assert.equal(shortValue("abc"), '"abc"');
    assert.equal(shortValue(12), "12");
    assert.equal(shortValue("x".repeat(100)).length, 50);
});
