// Tests du format de configuration JSON (sans ComfyUI) :
//     node --test tests/test_config_format.mjs tests/test_config_json.mjs tests/test_help_search.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { formatConfigJson, parseConfigJson, trimKey, configFilePrefix } from "../web/js/config_format.js";

const ROOT = "F:\\Rushs\\Projet";
const V1 = ROOT + "\\rush\\v1.mp4";
const NO_TRIMS = { video: {}, video_audio: {}, audio: {} };

const ref = {
    mode: "ref2va",
    root: ROOT,
    images: [ROOT + "\\images\\a.png", "D:\\ailleurs\\b.png"],
    videos: [V1, ROOT + "\\rush\\v2.mp4"],
    video_audios: [V1],
    audios: [],
    first_frame: [ROOT + "\\images\\debut.png"],
    last_frame: [],
    trims: { video: { [trimKey(V1)]: [5, 7] }, video_audio: { [trimKey(V1)]: [1, 3] }, audio: {} },
};

test("JSON Ref2VA : objet attendu, chemins relatifs, rognage, sans les frames", () => {
    const obj = JSON.parse(formatConfigJson(ref));
    assert.deepEqual(obj, {
        format: "MiniMax H3 Reference Loader",
        version: 2,
        profile: "minimax_h3",
        mode: "REF2VA",
        root: ROOT,
        images: ["images\\a.png", "D:\\ailleurs\\b.png"],
        videos: [{ path: "rush\\v1.mp4", trim: [5, 7] }, { path: "rush\\v2.mp4" }],
        video_audios: [{ path: "rush\\v1.mp4", trim: [1, 3] }],
        audios: [],
    });
});

test("JSON FL2VA : seulement les frames, null si vide", () => {
    const obj = JSON.parse(formatConfigJson({ ...ref, mode: "fl2va", root: "" }));
    assert.deepEqual(obj, {
        format: "MiniMax H3 Reference Loader",
        version: 2,
        profile: "minimax_h3",
        mode: "FL2VA",
        root: null,
        first_frame: ROOT + "\\images\\debut.png",
        last_frame: null,
    });
});

test("JSON : aller-retour, chaque mode ne garde que sa partie", () => {
    assert.deepEqual(parseConfigJson(formatConfigJson(ref)),
        { ...ref, profile: "minimax_h3", header: true, first_frame: [], last_frame: [] });
    const fl = { ...ref, mode: "fl2va" };
    assert.deepEqual(parseConfigJson(formatConfigJson(fl)),
        { ...fl, profile: "minimax_h3", header: true, images: [], videos: [], video_audios: [], audios: [], trims: NO_TRIMS });
});

test("JSON : lecture tolerante (chaines ou objets, rognage invalide ignore, plafonds)", () => {
    const text = JSON.stringify({
        format: "MiniMax H3 Reference Loader", mode: "REF2VA", root: "F:/r",
        images: Array.from({ length: 12 }, (_, i) => "i" + i + ".png"),
        videos: ["a.mp4", { path: "b.mp4", trim: [5, 2] }, { trim: [1, 2] }, null],
        audios: [{ path: "D:\\s.wav", trim: [0, 4] }],
    });
    const c = parseConfigJson(text);
    assert.equal(c.images.length, 9);
    assert.deepEqual(c.videos, ["F:/r/a.mp4", "F:/r/b.mp4"]);
    assert.deepEqual(c.video_audios, []);
    assert.deepEqual(c.trims.video, {});
    assert.deepEqual(c.trims.audio, { [trimKey("D:\\s.wav")]: [0, 4] });
});

test("JSON : erreurs claires", () => {
    assert.throws(() => parseConfigJson("{ pas du json"), /not valid JSON/);
    assert.throws(() => parseConfigJson(JSON.stringify({ format: "autre chose", mode: "REF2VA" })),
        /not a MiniMax H3 Reference Loader/);
});

test("ancien .txt refuse avec un message clair", () => {
    const old = ["# MiniMax H3 Reference Loader - REF2VA configuration", "mode : Ref2VA", "video 1 : a.mp4"].join("\n");
    assert.throws(() => parseConfigJson(old), /Only \.json configuration files are supported/);
});

// ---- version 2 : profil (chemins en "/" : la racine garde ses "\") ----
const G1 = ROOT + "/images/g1.png";
const G2 = "D:/ailleurs/g2.png";
const GV = ROOT + "/rush/gv.mp4";
const SND = ROOT + "/audio/s.wav";
const VOX = ROOT + "/audio/v.wav";
const keys = (a) => a.map(trimKey); // separateurs "/" ou "\\" equivalents
const ltx = {
    profile: "ltx2",
    root: ROOT,
    guide_images: [G1, G2],
    guide_video: [GV],
    soundtrack: [SND],
    voice: [VOX],
    moments: { guide_images: { [trimKey(G1)]: 0, [trimKey(G2)]: -1 }, guide_video: { [trimKey(GV)]: 2.5 } },
    trims: {
        guide_video: { [trimKey(GV)]: [1, 4] },
        soundtrack: { [trimKey(SND)]: [0, 3] },
        voice: {},
    },
};

test("v2 minimax round trip", () => {
    const text = formatConfigJson({ ...ref, profile: "minimax_h3" });
    const obj = JSON.parse(text);
    assert.equal(obj.version, 2);
    assert.equal(obj.profile, "minimax_h3");
    const back = parseConfigJson(text);
    assert.equal(back.profile, "minimax_h3");
    assert.equal(back.mode, "ref2va");
    assert.deepEqual(back.images, ref.images);
    assert.deepEqual(back.trims.video, ref.trims.video);
});

test("v2 ltx round trip (seconds and trims kept)", () => {
    const text = formatConfigJson(ltx);
    const obj = JSON.parse(text);
    assert.equal(obj.version, 2);
    assert.equal(obj.profile, "ltx2");
    assert.deepEqual(obj.guide_images, [{ path: "images/g1.png", seconds: 0 }, { path: "D:/ailleurs/g2.png", seconds: -1 }]);
    assert.deepEqual(obj.guide_video, { path: "rush/gv.mp4", seconds: 2.5, trim: [1, 4] });
    assert.deepEqual(obj.soundtrack, { path: "audio/s.wav", trim: [0, 3] });
    assert.deepEqual(obj.voice, { path: "audio/v.wav" });
    const back = parseConfigJson(text);
    assert.equal(back.profile, "ltx2");
    assert.equal(back.root, ROOT);
    assert.deepEqual(keys(back.guide_images), keys(ltx.guide_images));
    assert.deepEqual(keys(back.guide_video), keys(ltx.guide_video));
    assert.deepEqual(keys(back.soundtrack), keys(ltx.soundtrack));
    assert.deepEqual(keys(back.voice), keys(ltx.voice));
    assert.deepEqual(back.moments, ltx.moments);
    assert.deepEqual(back.trims.guide_video, ltx.trims.guide_video);
    assert.deepEqual(back.trims.soundtrack, ltx.trims.soundtrack);
    assert.deepEqual(back.trims.voice, {});
});

test("v2 ltx : vide -> null, seconds absent -> pas de moment", () => {
    const obj = JSON.parse(formatConfigJson({ profile: "ltx2", root: "", guide_images: [G1] }));
    assert.equal(obj.guide_video, null);
    assert.equal(obj.soundtrack, null);
    assert.equal(obj.voice, null);
    assert.equal(obj.root, null);
    const back = parseConfigJson(JSON.stringify({
        format: "MiniMax H3 Reference Loader", version: 2, profile: "ltx2", root: null,
        guide_images: [{ path: "D:/a.png" }, "D:/b.png"], guide_video: null,
    }));
    assert.deepEqual(back.guide_images, ["D:/a.png", "D:/b.png"]);
    assert.deepEqual(back.moments, { guide_images: {}, guide_video: {} });
    assert.deepEqual(back.guide_video, []);
});

test("v1 file is read as minimax_h3", () => {
    const old = JSON.stringify({ format: "MiniMax H3 Reference Loader", version: 1, mode: "REF2VA", root: null, images: ["D:/a.png"] });
    assert.equal(parseConfigJson(old).profile, "minimax_h3");
    assert.deepEqual(parseConfigJson(old).images, ["D:/a.png"]);
    const noVersion = JSON.stringify({ format: "MiniMax H3 Reference Loader", mode: "FL2VA", first_frame: "D:/f.png" });
    assert.equal(parseConfigJson(noVersion).profile, "minimax_h3");
});

test("ltx file has no mode", () => {
    const obj = JSON.parse(formatConfigJson(ltx));
    assert.ok(!("mode" in obj));
    assert.ok(!("images" in obj));
});

test("prefixe du nom de fichier par profil", () => {
    assert.equal(configFilePrefix({ profile: "ltx2" }), "LTX2_magicstudio_config_");
    assert.equal(configFilePrefix({ mode: "fl2va" }), "FL2VA_minimax_config_");
    assert.equal(configFilePrefix({ mode: "ref2va" }), "REF2VA_minimax_config_");
});
