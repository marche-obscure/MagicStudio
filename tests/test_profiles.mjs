// node --test tests/test_profiles.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { LAST, secondsToFrame } from "../web/js/profiles.js";

const CASES = JSON.parse(fs.readFileSync(new URL("./profile_cases.json", import.meta.url), "utf-8"));

test("cas partages", () => {
    assert.equal(LAST, -1);
    for (const [s, fps, mx, exp] of CASES.seconds_to_frame) assert.equal(secondsToFrame(s, fps, mx), exp);
});


// ---- Moments en secondes ----
import { defaultMoment, guideMoments, checkMoment, sameFrameAs } from "../web/js/profiles.js";

test("defaultMoment : memes cas que profiles.default_moment (cas partages)", () => {
    assert.ok(CASES.default_moment.length > 0);
    for (const [used, exp] of CASES.default_moment) assert.equal(defaultMoment(used), exp, JSON.stringify(used));
});

test("guideMoments : moments memorises d'abord, puis First / Last libres dans l'ordre (= media._build_ltx_outputs)", () => {
    // sans moment : First puis Last puis First
    assert.deepEqual(guideMoments(["a", "b", "c"], {}), [0, -1, 0]);
    // moment memorise a 0 (cle = chemin normalise) : les autres prennent Last puis First
    assert.deepEqual(guideMoments(["a", "C:\\X\\B.png", "c"], { "c:/x/b.png": 0 }), [-1, 0, 0]);
    assert.deepEqual(guideMoments(["a", "b"], { a: 3.5, b: -1 }), [3.5, -1]);
    assert.deepEqual(guideMoments([], {}), []);
    assert.deepEqual(guideMoments(["a"], null), [0]);
});

test("checkMoment : 0..max accepte (arrondi au dixieme), le reste refuse", () => {
    assert.deepEqual(checkMoment("2.5", 20), { ok: true, value: 2.5 });
    assert.deepEqual(checkMoment("0", 20), { ok: true, value: 0 });
    assert.deepEqual(checkMoment(20, 20), { ok: true, value: 20 });
    assert.deepEqual(checkMoment("1.26", 20), { ok: true, value: 1.3 });
    assert.equal(checkMoment("25", 20).ok, false);
    assert.equal(checkMoment("-1", 20).ok, false);
    assert.equal(checkMoment("", 20).ok, false);
    assert.equal(checkMoment("abc", 20).ok, false);
});

test("sameFrameAs : numero (1..) d'un autre guide au meme numero d'image, sinon 0", () => {
    assert.deepEqual(sameFrameAs([0, 24, 0, -1]), [3, 0, 1, 0]);
    assert.deepEqual(sameFrameAs([-1, -1]), [2, 1]);
    assert.deepEqual(sameFrameAs([]), []);
});

// ---- RefLoader des variantes (plan des variantes, Task 4) ----
import { FALLBACK_DESCRIPTION as VD, variantsOfModel as vom, setRowList as srl, rowList as rl, migrateState as ms,
    uiHeight, limitLabels, variantLimitOverrides, variantLimits as vl } from "../web/js/profiles.js";

test("variantsOfModel lists ltx 2.3 then 2.5", () => {
    assert.deepEqual(vom(VD, "ltx"), ["ltx.2_3", "ltx.2_5"]);
    assert.deepEqual(vom(VD, "minimax_h3"), ["minimax_h3.ref2va", "minimax_h3.fl2va"]);
});

test("setRowList keeps other variants untouched", () => {
    const s = ms({ variant: "ltx.2_3" });
    srl(s, "guide_images", ["D:/a.png"], "ltx.2_5");
    assert.deepEqual(rl(s, "guide_images", "ltx.2_5"), ["D:/a.png"]);
    assert.deepEqual(rl(s, "guide_images", "ltx.2_3"), []);
    srl(s, "guide_images", ["D:/b.png"]);
    assert.deepEqual(rl(s, "guide_images"), ["D:/b.png"]);
    assert.deepEqual(rl(s, "guide_images", "ltx.2_5"), ["D:/a.png"]);
});

test("uiHeight Ref2VA 232 FL2VA 156", () => {
    assert.equal(uiHeight(VD, "minimax_h3.ref2va"), 232);
    assert.equal(uiHeight(VD, "minimax_h3.fl2va"), 156);
    assert.equal(uiHeight(VD, "ltx.2_5"), 232);
    assert.equal(uiHeight(null, "nope"), 232); // variante inconnue : celle par defaut
});

test("limit labels use Duration for length variants", () => {
    assert.equal(limitLabels(VD, "ltx.2_3").seconds, "Duration (s)");
    assert.equal(limitLabels(VD, "minimax_h3.ref2va").seconds, "Max duration (s)");
    assert.equal(limitLabels(VD, "minimax_h3.ref2va").counts.video_audios, "Video/Audio");
    assert.deepEqual(Object.keys(limitLabels(VD, "minimax_h3.fl2va").counts), ["first_frame", "last_frame"]);
});

test("variantLimitOverrides : seulement les valeurs differentes de la variante", () => {
    const base = vl({}, VD, "ltx.2_5");
    assert.deepEqual(variantLimitOverrides(VD, "ltx.2_5", base), {});
    const v = JSON.parse(JSON.stringify(base));
    v.counts.guide_images = 4;
    v.seconds = 10;
    v.max_size = [512, 896];
    assert.deepEqual(variantLimitOverrides(VD, "ltx.2_5", v), { counts: { guide_images: 4 }, seconds: 10, max_size: [512, 896] });
    // relu par variantLimits
    const s = ms({ variant: "ltx.2_5", limits: { "ltx.2_5": variantLimitOverrides(VD, "ltx.2_5", v) } });
    assert.equal(vl(s, VD).counts.guide_images, 4);
    assert.equal(vl(s, VD).seconds, 10);
});

import { pruneVariantMoments } from "../web/js/profiles.js";

test("pruneVariantMoments : moments des fichiers retires de leur ligne", () => {
    const s = ms({ variant: "ltx.2_3" });
    s.selections["ltx.2_3"].rows.guide_images = ["A.png"];
    s.selections["ltx.2_3"].moments.guide_images = { "a.png": 1, "b.png": 2 };
    s.selections["ltx.2_5"].moments.guide_images = { "z.png": 3 };
    assert.equal(pruneVariantMoments(s), s);
    assert.deepEqual(s.selections["ltx.2_3"].moments.guide_images, { "a.png": 1 });
    assert.deepEqual(s.selections["ltx.2_5"].moments.guide_images, {});
});
