import test from "node:test";
import assert from "node:assert/strict";
import { stripProjectUsed } from "../web/js/prompt_strip_pure.js";

test("project_used retire des MedLoad seulement", () => {
    const out = {
        1: { class_type: "MiniMaxH3LoadMedia", inputs: { file: "a.mp4", project_used: ["5", 0] } },
        2: { class_type: "MiniMaxH3FinalCut", inputs: { project_used: ["5", 0] } },
        3: { class_type: "MiniMaxH3LoadMedia", inputs: { file: "b.mp4" } },
    };
    const r = stripProjectUsed(out);
    assert.deepEqual(r[1].inputs, { file: "a.mp4" });
    assert.deepEqual(r[2].inputs, { project_used: ["5", 0] });
    assert.deepEqual(r[3].inputs, { file: "b.mp4" });
});

test("entrees invalides tolerees", () => {
    assert.equal(stripProjectUsed(null), null);
    assert.deepEqual(stripProjectUsed({ 1: null, 2: { class_type: "MiniMaxH3LoadMedia" } }), { 1: null, 2: { class_type: "MiniMaxH3LoadMedia" } });
});
