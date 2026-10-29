// node --test tests/test_final_cut_frames.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { frameStrip, stepIndex, numberedLabel, framesOfCopy } from "../web/js/final_cut_frames.js";

const e = (name, frame = null) => ({ name, frame, path: "p/" + name, mtime: 1 });

test("frameStrip classe un melange desordonne", () => {
    const input = [
        e("FRAME_0120_a.png", 120),
        e("LAST_FRAME_x.png"),
        e("FRAME_0048_a.png", 48),
        e("FIRST_FRAME_x.png"),
    ];
    const copy = input.slice();
    const s = frameStrip(input);
    assert.equal(s.first.name, "FIRST_FRAME_x.png");
    assert.equal(s.last.name, "LAST_FRAME_x.png");
    assert.deepEqual(s.numbered.map((x) => x.frame), [48, 120]);
    assert.deepEqual(input, copy); // entree non modifiee
});

test("frameStrip sans First, numero inconnu -> numero du nom puis nom", () => {
    const s = frameStrip([
        e("FRAME_0200_a.png"),
        e("FRAME_0050_a.png"),
        e("FRAME_b.png"),
        e("FRAME_a.png"),
    ]);
    assert.equal(s.first, null);
    assert.equal(s.last, null);
    assert.deepEqual(s.numbered.map((x) => x.name),
        ["FRAME_0050_a.png", "FRAME_0200_a.png", "FRAME_a.png", "FRAME_b.png"]);
});

test("frameStrip tolere vide ou absent", () => {
    assert.deepEqual(frameStrip([]), { first: null, last: null, numbered: [] });
    assert.deepEqual(frameStrip(undefined), { first: null, last: null, numbered: [] });
});

test("stepIndex tourne en boucle", () => {
    assert.equal(stepIndex(0, 3, -1), 2);
    assert.equal(stepIndex(2, 3, 1), 0);
    assert.equal(stepIndex(1, 3, 1), 2);
    assert.equal(stepIndex(0, 0, 1), 0);
});

test("numberedLabel", () => {
    assert.equal(numberedLabel(e("FRAME_0048_a.png", 48)), "N · 48");
    assert.equal(numberedLabel(e("FRAME_a.png", null)), "N · ?");
});

test("framesOfCopy", () => {
    const list = [e("FIRST_FRAME_a.png")];
    const plan = { frames: { "02": list } };
    assert.equal(framesOfCopy(plan, "_02_x.mp4"), list);
    assert.deepEqual(framesOfCopy(plan, "x.mp4"), []);
    assert.deepEqual(framesOfCopy(plan, "_03_x.mp4"), []);
    assert.deepEqual(framesOfCopy(null, "_02_x.mp4"), []);
    assert.deepEqual(framesOfCopy({}, "_02_x.mp4"), []);
});
