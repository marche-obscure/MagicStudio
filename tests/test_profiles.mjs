// node --test tests/test_profiles.mjs
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

// ---- Task 5 : cles de liens par profil, defauts de la route, disposition et etat ----
import {
    profileKey, legacyModeLinks, routeDefaults, layoutKeys, stateLayout, parseState, emptyState,
} from "../web/js/profiles.js";

test("profileKey : une cle de liens par profil (et par mode en MiniMax)", () => {
    assert.equal(profileKey({}), "minimax_h3:ref2va");
    assert.equal(profileKey({ mode: "fl2va" }), "minimax_h3:fl2va");
    assert.equal(profileKey({ profile: "minimax_h3", mode: "ref2va" }), "minimax_h3:ref2va");
    assert.equal(profileKey({ profile: "ltx2", mode: "fl2va" }), "ltx2");
    assert.equal(profileKey(null), "minimax_h3:ref2va");
});

test("legacyModeLinks : anciennes cles ref2va / fl2va lues comme minimax_h3:*", () => {
    const a = [{ key: "ref_image_1", label: null, links: [] }];
    const b = [{ key: "first_frame", label: "x", links: [] }];
    assert.deepEqual(legacyModeLinks({ ref2va: a, fl2va: b }), { "minimax_h3:ref2va": a, "minimax_h3:fl2va": b });
    // une cle nouvelle l'emporte sur l'ancienne ; ltx2 garde
    const n = [{ key: "ref_image_2", label: null, links: [] }];
    assert.deepEqual(legacyModeLinks({ ref2va: a, "minimax_h3:ref2va": n, ltx2: b }),
        { "minimax_h3:ref2va": n, ltx2: b });
    assert.deepEqual(legacyModeLinks(undefined), {});
    assert.deepEqual(legacyModeLinks("oops"), {});
});

test("routeDefaults : reponse de /mmrefloader/profiles -> {profil: limites}", () => {
    const json = { profiles: [{ id: "minimax_h3", label: "MiniMax H3", limits: FALLBACK_LIMITS.minimax_h3, bounds: {} },
        { id: "ltx2", label: "LTX 2.x", limits: { ...FALLBACK_LIMITS.ltx2, guide_image: 5 }, bounds: {} }], default: "minimax_h3" };
    const d = routeDefaults(json);
    assert.equal(d.ltx2.guide_image, 5);
    assert.equal(d.minimax_h3.image, 9);
    assert.equal(routeDefaults(null), null);
    assert.equal(routeDefaults({ profiles: "x" }), null);
    // profil inconnu ou limites absentes : ignores
    assert.deepEqual(Object.keys(routeDefaults({ profiles: [{ id: "zzz", limits: {} }, { id: "ltx2" }] })), []);
});

test("layoutKeys : bornes du module (9, 3, 3, 3), un minimum par groupe", () => {
    assert.deepEqual(layoutKeys(0, 0, 0, 0), ["ref_image_1", "ref_video_1", "ref_video_audio_1", "ref_audio_1"]);
    assert.equal(layoutKeys(20, 9, 9, 9).length, 18);
});

test("etat et disposition identiques a Python (cas partages state_cases)", () => {
    for (const c of CASES.state_cases) {
        const s = parseState(JSON.stringify(c.state));
        assert.deepEqual(stateLayout(s), c.layout, JSON.stringify(c.state));
        for (const [k, v] of Object.entries(c.parsed)) assert.deepEqual(s[k], v, k + " " + JSON.stringify(c.state));
    }
});

test("parseState : etat vide, JSON invalide, champs du noeud", () => {
    const e = emptyState();
    assert.equal(e.profile, "minimax_h3");
    assert.deepEqual(e.guide_images, []);
    assert.deepEqual(parseState("not json"), e);
    const s = parseState(JSON.stringify({ root: "R", subs: { image: "x" }, folders: { video: "F" }, mode: "fl2va", first_frame: "a.png" }));
    assert.equal(s.root, "R");
    assert.equal(s.subs.image, "x");
    assert.equal(s.folders.video, "F");
    assert.deepEqual(s.first_frame, ["a.png"]);
    // les deux jeux de listes restent dans l'etat : changer de profil ne perd rien
    const both = parseState(JSON.stringify({ profile: "ltx2", images: ["a.png"], guide_images: ["g.png"] }));
    assert.deepEqual(both.images, ["a.png"]);
    assert.deepEqual(both.guide_images, ["g.png"]);
    assert.equal(stateLayout(both, { ltx2: { ...FALLBACK_LIMITS.ltx2 } })[0], "guide_image_1");
});

// ---- Task 6 : moments en secondes et fenetre Limits ----
import {
    COUNT_KEYS, defaultMoment, guideMoments, checkMoment, sameFrameAs, limitBounds, limitOverrides, pruneMoments,
} from "../web/js/profiles.js";

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

test("limitBounds : compteurs 1..defaut, duree, cadence et taille = LIMIT_BOUNDS", () => {
    const b = limitBounds("ltx2");
    assert.deepEqual(b.guide_image, [1, 9]);
    assert.deepEqual(b.guide_video, [1, 1]);
    assert.deepEqual(b.seconds, [1, 60]);
    assert.deepEqual(b.fps, [1, 60]);
    assert.deepEqual(b.max_side, [64, 4096]);
    assert.deepEqual(limitBounds("minimax_h3", { minimax_h3: { ...FALLBACK_LIMITS.minimax_h3, image: 5 } }).image, [1, 5]);
    assert.deepEqual(COUNT_KEYS.ltx2, ["guide_image", "guide_video", "soundtrack", "voice"]);
});

test("limitOverrides : seulement les valeurs differentes des defauts", () => {
    const d = FALLBACK_LIMITS.ltx2;
    assert.deepEqual(limitOverrides("ltx2", { ...d }), {});
    assert.deepEqual(limitOverrides("ltx2", { ...d, guide_image: 4, max_size: [768, 1344] }), { guide_image: 4 });
    assert.deepEqual(limitOverrides("ltx2", { ...d, seconds: 10, fps: 25, max_size: [512, 896] }),
        { seconds: 10, fps: 25, max_size: [512, 896] });
    // defauts fournis par la route
    assert.deepEqual(limitOverrides("ltx2", { ...d, guide_image: 5 }, { ltx2: { ...d, guide_image: 5 } }), {});
});

test("pruneMoments : retire les moments des fichiers qui ne sont plus dans leur liste", () => {
    const s = { guide_images: ["A.png"], guide_video: [], moments: { guide_images: { "a.png": 1, "b.png": 2 }, guide_video: { "v.mp4": 0 } } };
    assert.equal(pruneMoments(s), s);
    assert.deepEqual(s.moments, { guide_images: { "a.png": 1 }, guide_video: {} });
    assert.deepEqual(pruneMoments({}).moments, undefined);
});
