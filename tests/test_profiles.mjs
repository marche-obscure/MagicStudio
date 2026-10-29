// true 
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
    PROFILES, DEFAULT_PROFILE, LABELS, LAST, FALLBACK_LIMITS, profileOf, limitsOf, ltxLayoutKeys,
    outputType, secondsToFrame, videoGuideFrame, frames8n1,
} from "../web/js/profiles.js";

const CASES = JSON.parse(fs.readFileSync(new URL("./profile_cases.json", import.meta.url), "utf-8"));

test("constantes", () => {
    assert.deepEqual(PROFILES, ["minimax_h3", "ltx2"]);
    assert.equal(DEFAULT_PROFILE, "minimax_h3");
    assert.equal(LABELS.ltx2, "LTX 2.x");
    assert.equal(LAST, -1);
});

test("cas partages", () => {
    for (const [s, fps, mx, exp] of CASES.seconds_to_frame) assert.equal(secondsToFrame(s, fps, mx), exp);
    for (const [f, exp] of CASES.video_guide_frame) assert.equal(videoGuideFrame(f), exp);
    for (const [n, exp] of CASES.frames_8n1) assert.equal(frames8n1(n), exp);
    const lim = limitsOf({ profile: "ltx2" });
    for (const [n, exp] of CASES.ltx_layout) assert.deepEqual(ltxLayoutKeys(n, lim), exp);
    for (const c of CASES.limits) assert.equal(limitsOf(c.state)[c.key], c.expected);
});

test("defauts fournis et tolerance", () => {
    const defaults = { ltx2: { ...FALLBACK_LIMITS.ltx2, guide_image: 5 } };
    assert.equal(limitsOf({ profile: "ltx2" }, defaults).guide_image, 5);
    assert.equal(limitsOf({ profile: "zzz" }).seconds, 15);
    assert.equal(limitsOf({ limits: "oops" }).seconds, 15);
    assert.equal(profileOf(null), "minimax_h3");
});

test("types de sortie", () => {
    assert.equal(outputType("guide_frame_3"), "INT");
    assert.equal(outputType("guide_video_frame"), "INT");
    assert.equal(outputType("voice"), "AUDIO");
    assert.equal(outputType("ref_video_audio_1"), "AUDIO");
    assert.equal(outputType("guide_image_1"), "IMAGE");
    assert.equal(outputType("project"), "MINIMAX_PROJECT");
});
