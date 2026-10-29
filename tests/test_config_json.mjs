// Tests du format de configuration JSON (sans ComfyUI) :
//     node --test tests/test_config_format.mjs tests/test_config_json.mjs tests/test_help_search.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { parseConfigJson, trimKey } from "../web/js/config_format.js";

const ROOT = "F:\\Rushs\\Projet";
const V1 = ROOT + "\\rush\\v1.mp4";
const FORMAT = "MiniMax H3 Reference Loader";

// ---- versions 1 et 2 : lues seulement (Download ecrit la version 3) ----
test("v1 / v2 Ref2VA : chemins relatifs rattaches a la racine, rognages", () => {
    const text = JSON.stringify({
        format: FORMAT, version: 2, profile: "minimax_h3", mode: "REF2VA", root: ROOT,
        images: ["images\\a.png", "D:\\ailleurs\\b.png"],
        videos: [{ path: "rush\\v1.mp4", trim: [5, 7] }, { path: "rush\\v2.mp4" }],
        video_audios: [{ path: "rush\\v1.mp4", trim: [1, 3] }],
        audios: [],
    });
    const c = parseConfigJson(text);
    assert.equal(c.mode, "ref2va");
    assert.equal(c.profile, "minimax_h3");
    assert.equal(c.root, ROOT);
    assert.deepEqual(c.images, [ROOT + "\\images\\a.png", "D:\\ailleurs\\b.png"]);
    assert.deepEqual(c.videos, [V1, ROOT + "\\rush\\v2.mp4"]);
    assert.deepEqual(c.trims.video, { [trimKey(V1)]: [5, 7] });
    assert.deepEqual(c.trims.video_audio, { [trimKey(V1)]: [1, 3] });
    assert.deepEqual(c.first_frame, []);
});

test("v1 FL2VA : frames (chemin ou null)", () => {
    const c = parseConfigJson(JSON.stringify({ format: FORMAT, version: 1, mode: "FL2VA", root: null,
        first_frame: "D:/f.png", last_frame: null }));
    assert.equal(c.mode, "fl2va");
    assert.deepEqual(c.first_frame, ["D:/f.png"]);
    assert.deepEqual(c.last_frame, []);
    const noVersion = parseConfigJson(JSON.stringify({ format: FORMAT, mode: "FL2VA", first_frame: "D:/f.png" }));
    assert.equal(noVersion.profile, "minimax_h3");
});

test("lecture tolerante (chaines ou objets, rognage invalide ignore)", () => {
    const c = parseConfigJson(JSON.stringify({
        format: FORMAT, mode: "REF2VA", root: "F:/r",
        videos: ["a.mp4", { path: "b.mp4", trim: [5, 2] }, { trim: [1, 2] }, null],
        audios: [{ path: "D:\\s.wav", trim: [0, 4] }],
    }));
    assert.deepEqual(c.videos, ["F:/r/a.mp4", "F:/r/b.mp4"]);
    assert.deepEqual(c.video_audios, []);
    assert.deepEqual(c.trims.video, {});
    assert.deepEqual(c.trims.audio, { [trimKey("D:\\s.wav")]: [0, 4] });
});

test("erreurs claires", () => {
    assert.throws(() => parseConfigJson("{ pas du json"), /not valid JSON/);
    assert.throws(() => parseConfigJson(JSON.stringify({ format: "autre chose", mode: "REF2VA" })),
        /not a MiniMax H3 Reference Loader/);
    const old = ["# MiniMax H3 Reference Loader - REF2VA configuration", "mode : Ref2VA", "video 1 : a.mp4"].join("\n");
    assert.throws(() => parseConfigJson(old), /Only \.json configuration files are supported/);
});

// Fichier v2 LTX 2.x (branche des profils) : chemins en "/" (la racine garde ses "\").
const G1 = ROOT + "/images/g1.png";
const GV = ROOT + "/rush/gv.mp4";
const SND = ROOT + "/audio/s.wav";
const V2_LTX = JSON.stringify({
    format: FORMAT, version: 2, profile: "ltx2", root: ROOT,
    guide_images: [{ path: "images/g1.png", seconds: 0 }, { path: "D:/ailleurs/g2.png", seconds: -1 }],
    guide_video: { path: "rush/gv.mp4", seconds: 2.5, trim: [1, 4] },
    soundtrack: { path: "audio/s.wav", trim: [0, 3] },
    voice: null,
});
const keys = (a) => a.map(trimKey); // separateurs "/" ou "\\" equivalents

test("v2 LTX : moments (seconds) et rognages relus", () => {
    const c = parseConfigJson(V2_LTX);
    assert.equal(c.profile, "ltx2");
    assert.deepEqual(keys(c.guide_images), keys([G1, "D:/ailleurs/g2.png"]));
    assert.deepEqual(keys(c.guide_video), keys([GV]));
    assert.deepEqual(c.voice, []);
    assert.deepEqual(c.moments.guide_images, { [trimKey(G1)]: 0, [trimKey("D:/ailleurs/g2.png")]: -1 });
    assert.deepEqual(c.moments.guide_video, { [trimKey(GV)]: 2.5 });
    assert.deepEqual(c.trims.soundtrack, { [trimKey(SND)]: [0, 3] });
    const empty = parseConfigJson(JSON.stringify({ format: FORMAT, version: 2, profile: "ltx2", root: null,
        guide_images: [{ path: "D:/a.png" }, "D:/b.png"], guide_video: null }));
    assert.deepEqual(empty.guide_images, ["D:/a.png", "D:/b.png"]);
    assert.deepEqual(empty.moments, { guide_images: {}, guide_video: {} });
});

// ---- version 3 : une variante par fichier (plan des variantes, 29/10/2026) ----
import { formatVariantConfig, parseVariantConfig, variantConfigPrefix } from "../web/js/config_format.js";
import { migrateState, rowList } from "../web/js/profiles.js";

const R3 = "F:/Rushs/P3";
const vstate = (variant, rows, extra = {}) => {
    const s = migrateState({ variant, root: R3 });
    Object.assign(s.selections[variant].rows, rows);
    for (const [k, v] of Object.entries(extra)) Object.assign(s.selections[variant][k], v);
    return s;
};

test("v3 round trip for each variant", () => {
    const cases = [
        vstate("minimax_h3.ref2va", { images: [R3 + "/i/a.png", "D:/x/b.png"], videos: [R3 + "/v.mp4"], audios: [R3 + "/s.wav"] },
            { trims: { videos: { [trimKey(R3 + "/v.mp4")]: [1, 3] } } }),
        vstate("minimax_h3.fl2va", { first_frame: [R3 + "/f.png"] }),
        vstate("ltx.2_3", { guide_images: [R3 + "/g.png"], guide_video: [R3 + "/gv.mp4"] },
            { moments: { guide_images: { [trimKey(R3 + "/g.png")]: -1 }, guide_video: { [trimKey(R3 + "/gv.mp4")]: 2 } },
              trims: { guide_video: { [trimKey(R3 + "/gv.mp4")]: [0, 4] } } }),
        vstate("ltx.2_5", { guide_images: [R3 + "/g.png"], soundtrack: [R3 + "/s.wav"] },
            { trims: { soundtrack: { [trimKey(R3 + "/s.wav")]: [0, 4] } } }),
    ];
    for (const s of cases) {
        const text = formatVariantConfig(s);
        const obj = JSON.parse(text);
        assert.equal(obj.version, 3);
        assert.equal(obj.variant, s.variant);
        assert.equal(obj.root, R3);
        const back = parseVariantConfig(text);
        assert.equal(back.variant, s.variant);
        assert.equal(back.root, R3);
        const sel = s.selections[s.variant];
        for (const rid of Object.keys(sel.rows)) assert.deepEqual(back.rows[rid], sel.rows[rid], rid);
        for (const rid of Object.keys(sel.trims)) assert.deepEqual(back.trims[rid] || {}, sel.trims[rid], rid);
        for (const rid of Object.keys(sel.moments)) assert.deepEqual(back.moments[rid] || {}, sel.moments[rid], rid);
    }
    const ltx = JSON.parse(formatVariantConfig(cases[2]));
    assert.deepEqual(ltx.rows.guide_images, [{ path: "g.png", seconds: -1 }]);
    assert.deepEqual(ltx.rows.guide_video, [{ path: "gv.mp4", seconds: 2, trim: [0, 4] }]);
    assert.ok(!("images" in ltx.rows));
});

test("v2 ltx file reads as ltx.2_3", () => {
    const back = parseVariantConfig(V2_LTX);
    assert.equal(back.variant, "ltx.2_3");
    assert.deepEqual(keys(back.rows.guide_images), keys([G1, "D:/ailleurs/g2.png"]));
    assert.deepEqual(back.moments.guide_video, { [trimKey(GV)]: 2.5 });
    assert.deepEqual(back.trims.soundtrack, { [trimKey(SND)]: [0, 3] });
});

test("v1 file reads as minimax variant of its mode", () => {
    const ref1 = JSON.stringify({ format: "MiniMax H3 Reference Loader", version: 1, mode: "REF2VA", root: null,
        images: ["D:/a.png"], videos: [{ path: "D:/v.mp4", trim: [1, 2] }] });
    const a = parseVariantConfig(ref1);
    assert.equal(a.variant, "minimax_h3.ref2va");
    assert.deepEqual(a.rows.images, ["D:/a.png"]);
    assert.deepEqual(a.trims.videos, { [trimKey("D:/v.mp4")]: [1, 2] });
    const fl1 = JSON.stringify({ format: "MiniMax H3 Reference Loader", version: 1, mode: "FL2VA", first_frame: "D:/f.png" });
    const b = parseVariantConfig(fl1);
    assert.equal(b.variant, "minimax_h3.fl2va");
    assert.deepEqual(b.rows.first_frame, ["D:/f.png"]);
});

test("file prefix per variant", () => {
    assert.equal(variantConfigPrefix({ variant: "minimax_h3.ref2va" }), "REF2VA_minimax_config_");
    assert.equal(variantConfigPrefix({ variant: "minimax_h3.fl2va" }), "FL2VA_minimax_config_");
    assert.equal(variantConfigPrefix({ variant: "ltx.2_3" }), "LTX23_magicstudio_config_");
    assert.equal(variantConfigPrefix({ variant: "ltx.2_5" }), "LTX25_magicstudio_config_");
    assert.equal(variantConfigPrefix({ mode: "fl2va" }), "FL2VA_minimax_config_");
});

test("rows over the limit are cut at the row max", () => {
    const text = JSON.stringify({ format: "MiniMax H3 Reference Loader", version: 3, variant: "ltx.2_5", root: "D:/r",
        rows: { guide_images: Array.from({ length: 12 }, (_, i) => ({ path: "g" + i + ".png" })),
                guide_video: ["a.mp4", "b.mp4"], unknown: ["z.png"] } });
    const c = parseVariantConfig(text);
    assert.equal(c.rows.guide_images.length, 9);
    assert.deepEqual(c.rows.guide_video, ["D:/r/a.mp4"]);
    assert.ok(!("unknown" in c.rows));
    // L'etat de la variante garde aussi le plafond.
    const s = vstate("ltx.2_5", {});
    s.selections["ltx.2_5"].rows.guide_images = c.rows.guide_images;
    assert.equal(rowList(s, "guide_images").length, 9);
});

test("v3 : variante inconnue refusee", () => {
    const text = JSON.stringify({ format: "MiniMax H3 Reference Loader", version: 3, variant: "wan.s2v", rows: {} });
    assert.throws(() => parseVariantConfig(text), /Unknown variant/);
});
