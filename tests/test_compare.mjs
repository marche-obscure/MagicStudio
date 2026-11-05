// Tests de compare_pure.js : parite avec compare.py (tests/compare_cases.json) et regles du Compare (31/10/2026).
//     node --test tests/test_compare.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    COMPARE_CLASS, MODES, DEFAULT_STATE, STAR_GOLD, STAR_TIP, parseState, formatState, chosenSide, inputKind,
    effectiveKind, acceptKind, bodyDropSide, halfSide, wipePos, clipA, hintText, soundSide, syncFix, frameStep,
    uiHeight, starPlan, initialStar, releaseComparePlayers, starKey, starSetOf, isStarred,
} from "../web/js/compare_pure.js";

const cases = JSON.parse(readFileSync(new URL("./compare_cases.json", import.meta.url), "utf8"));

test("constantes", () => {
    assert.equal(COMPARE_CLASS, "MagicStudioCompare");
    assert.deepEqual(MODES.map((m) => m[0]), ["side", "lr", "rl", "ud"]);
    assert.equal(STAR_GOLD, "#ffca28");
    assert.equal(STAR_TIP, "Preferred in a comparison");
    assert.deepEqual(DEFAULT_STATE, cases.default_state);
});

test("parite chosenSide", () => {
    for (const c of cases.chosen) assert.equal(chosenSide(...c.args), c.expect, JSON.stringify(c.args));
});

test("parite parseState", () => {
    for (const c of cases.state) {
        const raw = typeof c.raw === "string" ? c.raw : JSON.stringify(c.raw);
        const want = c.expect === "default" ? cases.default_state : c.expect;
        assert.deepEqual(parseState(raw), want, raw);
    }
});

test("formatState relit ce que parseState lit", () => {
    const s = parseState('{"mode":"lr","star":"A"}');
    assert.deepEqual(parseState(formatState(s)), s);
    assert.equal(formatState(DEFAULT_STATE), JSON.stringify(cases.default_state));
});

test("inputKind et effectiveKind", () => {
    assert.equal(inputKind({ video: true }), "video");
    assert.equal(inputKind({ frames: true, count: 1 }), "image");
    assert.equal(inputKind({ frames: true, count: 12 }), "video");
    assert.equal(inputKind({}), null);
    const st = (a, b) => ({ a: { path: a[0], kind: a[1] }, b: { path: b[0], kind: b[1] } });
    assert.equal(effectiveKind(st(["", ""], ["", ""]), { A: null, B: null }), "");
    assert.equal(effectiveKind(st(["", ""], ["b.png", "image"]), { A: null, B: null }), "image");
    assert.equal(effectiveKind(st(["a.mp4", "video"], ["b.png", "image"]), { A: null, B: null }), "video");
    assert.equal(effectiveKind(st(["a.mp4", "video"], ["", ""]), { A: "image", B: null }), "image");
});

test("clipA et wipePos", () => {
    assert.equal(clipA("lr", 0.25), "inset(0 75% 0 0)");
    assert.equal(clipA("rl", 0.25), "inset(0 0 0 25%)");
    assert.equal(clipA("ud", 0.333), "inset(0 0 66.7% 0)");
    assert.equal(clipA("side", 0.5), "none");
    const rect = { left: 100, top: 0, width: 200, height: 100 };
    assert.equal(wipePos("lr", rect, 90, 0), 0);
    assert.equal(wipePos("lr", rect, 1000, 0), 1);
    assert.equal(wipePos("lr", rect, 200, 0), 0.5);
    assert.equal(wipePos("ud", rect, 0, 25), 0.25);
});

test("halfSide et soundSide", () => {
    const rect = { left: 0, top: 0, width: 200, height: 100 };
    assert.equal(halfSide("lr", rect, 50, 10), "A");
    assert.equal(halfSide("rl", rect, 50, 10), "B");
    assert.equal(halfSide("side", rect, 50, 10), "A");
    assert.equal(halfSide("side", rect, 150, 10), "B");
    assert.equal(halfSide("ud", rect, 10, 80), "B");
    assert.equal(halfSide("ud", rect, 10, 20), "A");
    assert.equal(soundSide(null, "B"), "B");
    assert.equal(soundSide(null, ""), "A");
    assert.equal(soundSide("B", "A"), "B");
});

test("acceptKind", () => {
    assert.deepEqual(acceptKind("video", "image"), { ok: false, text: "Not a video: this is a video comparison" });
    assert.deepEqual(acceptKind("image", "video"), { ok: false, text: "Not an image: this is an image comparison" });
    assert.equal(acceptKind("", "audio").text, "Audio files cannot be compared");
    assert.equal(acceptKind("", "audio").ok, false);
    assert.equal(acceptKind("", "video").ok, true);
    assert.equal(acceptKind("video", "video").ok, true);
});

test("bodyDropSide", () => {
    const none = { A: null, B: null };
    const st = (a, b) => ({ a: { path: a }, b: { path: b } });
    assert.equal(bodyDropSide(st("", ""), none), "A");
    assert.equal(bodyDropSide(st("a.mp4", ""), none), "B");
    assert.equal(bodyDropSide(st("", ""), { A: "video", B: null }), "B");
    assert.equal(bodyDropSide(st("a.mp4", "b.mp4"), none), null);
    assert.equal(bodyDropSide(st("", ""), { A: "video", B: "video" }), null);
});

test("starPlan", () => {
    const st = (star) => ({ star, a: { path: "a.png" }, b: { path: "b.png" } });
    const none = { A: null, B: null };
    assert.deepEqual(starPlan(st(""), "A", none), { star: "A", on: "a.png", off: "b.png" });
    assert.deepEqual(starPlan(st("A"), "A", none), { star: "", on: "", off: "a.png" });
    assert.equal(starPlan(st(""), "A", { A: "image", B: null }).on, "");
    assert.equal(starPlan(st(""), "A", { A: null, B: "image" }).off, "");
});

test("initialStar", () => {
    const s = { star: "B" };
    assert.equal(initialStar(s, true, false), "A");
    assert.equal(initialStar(s, false, true), "B");
    assert.equal(initialStar(s, true, true), "B");
    assert.equal(initialStar(s, false, false), "B");
});

test("syncFix, frameStep, uiHeight", () => {
    assert.equal(syncFix(10, 10.04), null);
    assert.equal(syncFix(10, 10.2), 10);
    assert.equal(frameStep(0, 25, 1, 4), 0.04);
    assert.equal(frameStep(0, null, -1, 4), 0);
    assert.equal(frameStep(3.99, 25, 1, 4), 4);
    assert.equal(uiHeight(true), 420);
    assert.equal(uiHeight(false), 464);
});

test("hintText", () => {
    assert.equal(hintText("lr"), "↔ Hover to slide left / right");
    assert.equal(hintText("rl"), "↔ Hover to slide left / right");
    assert.equal(hintText("ud"), "↕ Hover to slide up / down");
    assert.equal(hintText("side"), "A left, B right");
});

test("releaseComparePlayers", () => {
    let n = 0;
    const r = releaseComparePlayers([{ type: "MagicStudioCompare", mmCompareRelease: () => n++ }, { type: "X" }]);
    assert.equal(r, 1);
    assert.equal(n, 1);
});

test("tagCorner : coin de l'etiquette selon le mode", async () => {
    const { tagCorner } = await import("../web/js/compare_pure.js");
    assert.equal(tagCorner("side", "A"), "tl");
    assert.equal(tagCorner("side", "B"), "tr");
    assert.equal(tagCorner("lr", "A"), "tl");
    assert.equal(tagCorner("lr", "B"), "tr");
    assert.equal(tagCorner("rl", "B"), "tl");
    assert.equal(tagCorner("rl", "A"), "tr");
    assert.equal(tagCorner("ud", "A"), "tl");
    assert.equal(tagCorner("ud", "B"), "bl");
});

test("timeText : m:ss.d", async () => {
    const { timeText } = await import("../web/js/compare_pure.js");
    assert.equal(timeText(0), "0:00.0");
    assert.equal(timeText(NaN), "0:00.0");
    assert.equal(timeText(-3), "0:00.0");
    assert.equal(timeText(1.26), "0:01.2");
    assert.equal(timeText(65.5), "1:05.5");
    assert.equal(timeText(0.3), "0:00.3");
});

test("sideFps : 24 pour des frames, sinon fps lu, sinon 24", async () => {
    const { sideFps } = await import("../web/js/compare_pure.js");
    assert.equal(sideFps(true, 30), 24);
    assert.equal(sideFps(false, 29.97), 29.97);
    assert.equal(sideFps(false, null), 24);
    assert.equal(sideFps(false, 0), 24);
});

test("starSetOf / isStarred : chemins normalises, liste invalide = vide", () => {
    assert.equal(starKey("C:\\In\\A.MP4"), "c:/in/a.mp4");
    const set = starSetOf(["C:\\In\\A.mp4", "", 3, "D:/x/b.png"]);
    assert.equal(set.size, 2);
    assert.ok(isStarred(set, "c:/in/a.MP4"));
    assert.ok(!isStarred(set, "c:/in/zz.mp4"));
    assert.ok(!isStarred(set, ""));
    assert.equal(starSetOf(undefined).size, 0);
    assert.ok(!isStarred(null, "a"));
});
