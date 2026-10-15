// Tests du format de configuration JSON (sans ComfyUI) :
//     node --test tests/test_config_format.mjs tests/test_config_json.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { formatConfigJson, parseConfigJson, parseAnyConfig, formatConfig, trimKey }
    from "../web/js/config_format.js";

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
        version: 1,
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
        version: 1,
        mode: "FL2VA",
        root: null,
        first_frame: ROOT + "\\images\\debut.png",
        last_frame: null,
    });
});

test("JSON : aller-retour, chaque mode ne garde que sa partie", () => {
    assert.deepEqual(parseConfigJson(formatConfigJson(ref)),
        { ...ref, header: true, first_frame: [], last_frame: [] });
    const fl = { ...ref, mode: "fl2va" };
    assert.deepEqual(parseConfigJson(formatConfigJson(fl)),
        { ...fl, header: true, images: [], videos: [], video_audios: [], audios: [], trims: NO_TRIMS });
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

test("parseAnyConfig : JSON ou ancien .txt", () => {
    assert.equal(parseAnyConfig(formatConfigJson({ ...ref, mode: "fl2va" })).mode, "fl2va");
    const old = parseAnyConfig(formatConfig(ref));
    assert.equal(old.mode, "ref2va");
    assert.deepEqual(old.videos, ref.videos);
    assert.deepEqual(old.trims, ref.trims);
});
