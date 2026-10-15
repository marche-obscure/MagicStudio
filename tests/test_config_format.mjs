// Tests du format de configuration .txt (sans ComfyUI) :
//     node --test tests/test_config_format.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { formatConfig, parseConfig, toRelative, toAbsolute, trimKey } from "../web/js/config_format.js";

const NO_TRIMS = { video: {}, video_audio: {}, audio: {} };

const ROOT = "F:\\Rushs\\Projet";

const state = {
    mode: "ref2va",
    root: ROOT,
    images: [ROOT + "\\images\\a.png", "D:\\ailleurs\\b.png"],
    videos: [ROOT + "\\videos\\v1.mp4", ROOT + "\\videos\\v2.mp4"],
    video_audios: [ROOT + "\\videos\\v2.mp4"],
    audios: [],
    first_frame: [ROOT + "\\images\\debut.png"],
    last_frame: [],
};

test("chemin sous la racine ecrit en relatif, ailleurs en absolu", () => {
    assert.equal(toRelative(ROOT, ROOT + "\\images\\a.png"), "images\\a.png");
    assert.equal(toRelative(ROOT, "f:/rushs/projet/x.png"), "x.png");
    assert.equal(toRelative(ROOT, "F:\\Rushs\\Projet2\\x.png"), "F:\\Rushs\\Projet2\\x.png");
    assert.equal(toRelative("", "C:\\a.png"), "C:\\a.png");
});

test("chemin relatif rejoint la racine, absolu garde tel quel", () => {
    assert.equal(toAbsolute(ROOT, "images\\a.png"), ROOT + "\\images\\a.png");
    assert.equal(toAbsolute(ROOT + "\\", "a.png"), ROOT + "\\a.png");
    assert.equal(toAbsolute(ROOT, "D:\\x.png"), "D:\\x.png");
    assert.equal(toAbsolute(ROOT, "\\\\nas\\x.png"), "\\\\nas\\x.png");
    assert.equal(toAbsolute("F:/r", "sub/a.png"), "F:/r/sub/a.png");
});

test("format Ref2VA : une ligne par sortie, NaN pour un groupe vide, sans les frames", () => {
    assert.equal(formatConfig(state), [
        "# MiniMax H3 Reference Loader - REF2VA configuration",
        "mode : Ref2VA",
        "root : F:\\Rushs\\Projet",
        "image 1 : images\\a.png",
        "image 2 : D:\\ailleurs\\b.png",
        "video 1 : videos\\v1.mp4",
        "video 2 : videos\\v2.mp4",
        "video_audio 1 : videos\\v2.mp4",
        "audio 1 : NaN",
        "",
    ].join("\r\n"));
});

test("format F2VA/FL2VA : seulement les frames, sans les listes Ref2VA", () => {
    assert.equal(formatConfig({ ...state, mode: "fl2va" }), [
        "# MiniMax H3 Reference Loader - FL2VA configuration",
        "mode : FL2VA",
        "root : F:\\Rushs\\Projet",
        "first_frame : images\\debut.png",
        "last_frame : NaN",
        "",
    ].join("\r\n"));
});

test("format d'une configuration vide", () => {
    const text = formatConfig({ mode: "fl2va", root: "", images: [], videos: [], video_audios: [], audios: [],
        first_frame: [], last_frame: [] });
    assert.equal(text, "# MiniMax H3 Reference Loader - FL2VA configuration\r\n" +
        "mode : FL2VA\r\nroot : NaN\r\nfirst_frame : NaN\r\nlast_frame : NaN\r\n");
    const ref = formatConfig({ mode: "ref2va", root: "", images: [], videos: [], video_audios: [], audios: [],
        first_frame: [], last_frame: [] });
    assert.equal(ref, "# MiniMax H3 Reference Loader - REF2VA configuration\r\n" +
        "mode : Ref2VA\r\nroot : NaN\r\nimage 1 : NaN\r\nvideo 1 : NaN\r\nvideo_audio 1 : NaN\r\n" +
        "audio 1 : NaN\r\n");
});

test("aller-retour format -> lecture, chaque mode ne garde que sa partie", () => {
    assert.deepEqual(parseConfig(formatConfig(state)),
        { ...state, header: true, trims: NO_TRIMS, first_frame: [], last_frame: [] });
    const fl = { ...state, mode: "fl2va" };
    assert.deepEqual(parseConfig(formatConfig(fl)),
        { ...fl, header: true, trims: NO_TRIMS, images: [], videos: [], video_audios: [], audios: [] });
});

test("lecture tolerante : ordre, casse, espaces, trous de numerotation, NaN", () => {
    const text = [
        "  AUDIO 2 : voix.wav",
        "root:F:/r",
        "image 3 : c.png",
        "image 1 : a.png",
        "video 1 : NaN",
        "video_audio 1 : x.mp4",
        "ligne inconnue",
        "audio 1 : nan",
    ].join("\n");
    assert.deepEqual(parseConfig(text), {
        mode: "ref2va",
        header: false,
        trims: NO_TRIMS,
        root: "F:/r",
        images: ["F:/r/a.png", "F:/r/c.png"],
        videos: [],
        video_audios: ["F:/r/x.mp4"],
        audios: ["F:/r/voix.wav"],
        first_frame: [],
        last_frame: [],
    });
});

test("ancien fichier : video_audio N = NaN ou meme chemin que video N", () => {
    const text = [
        "root : NaN",
        "video 1 : C:\\a.mp4",
        "video 2 : C:\\b.mp4",
        "video_audio 1 : NaN",
        "video_audio 2 : C:\\b.mp4",
    ].join("\n");
    assert.deepEqual(parseConfig(text), {
        mode: "ref2va", header: false, trims: NO_TRIMS, root: "", images: [], videos: ["C:\\a.mp4", "C:\\b.mp4"], video_audios: ["C:\\b.mp4"],
        audios: [], first_frame: [], last_frame: [],
    });
});

test("lecture : plafonds MiniMax respectes", () => {
    const lines = ["root : NaN"];
    for (let i = 1; i <= 12; i++) lines.push("image " + i + " : C:\\i" + i + ".png");
    for (let i = 1; i <= 5; i++) lines.push("video_audio " + i + " : C:\\v" + i + ".mp4");
    for (let i = 1; i <= 5; i++) lines.push("audio " + i + " : C:\\a" + i + ".wav");
    const c = parseConfig(lines.join("\n"));
    assert.equal(c.images.length, 9);
    assert.equal(c.video_audios.length, 3);
    assert.equal(c.audios.length, 3);
    assert.equal(c.root, "");
});

test("lecture : fichier sans aucune ligne reconnue refuse", () => {
    assert.throws(() => parseConfig("bonjour\nrien a voir"), /No configuration line/);
});

test("mode et images de debut / fin", () => {
    const text = "mode : fl2va\nroot : F:/r\nfirst_frame : a.png\nlast_frame 1 : D:\\b.png\n";
    const c = parseConfig(text);
    assert.equal(c.mode, "fl2va");
    assert.deepEqual(c.first_frame, ["F:/r/a.png"]);
    assert.deepEqual(c.last_frame, ["D:\\b.png"]);
    assert.equal(parseConfig("mode : F2VA/FL2VA\nfirst_frame : x.png").mode, "fl2va");
    assert.equal(parseConfig("mode : n'importe quoi\nimage 1 : x.png").mode, "ref2va");
});

test("en-tete : il donne le mode du fichier (prioritaire sur la ligne mode)", () => {
    const fl = parseConfig("# MiniMax H3 Reference Loader - FL2VA configuration\nfirst_frame : a.png\n");
    assert.equal(fl.mode, "fl2va");
    assert.equal(fl.header, true);
    const ref = parseConfig("# MiniMax H3 Reference Loader - REF2VA configuration\nmode : FL2VA\nimage 1 : a.png\n");
    assert.equal(ref.mode, "ref2va");
    // ancien fichier sans en-tete : ligne mode, et header = false
    const old = parseConfig("mode : FL2VA\nfirst_frame : a.png\n");
    assert.equal(old.mode, "fl2va");
    assert.equal(old.header, false);
    // un commentaire quelconque n'est pas un en-tete
    assert.equal(parseConfig("# notes\nimage 1 : a.png").header, false);
});

test("rognage : ecrit apres le chemin et relu", () => {
    const v = ROOT + "\\videos\\v1.mp4";
    const st = {
        ...state, videos: [v], video_audios: [v], audios: ["D:\\son.wav"],
        trims: { video: { [trimKey(v)]: [2.5, 8] }, video_audio: { [trimKey(v)]: [1, 3.25] },
                 audio: { [trimKey("D:\\son.wav")]: [0, 4] } },
    };
    const text = formatConfig(st);
    assert.ok(text.includes("video 1 : videos\\v1.mp4 | 2.5-8\r\n"));
    assert.ok(text.includes("video_audio 1 : videos\\v1.mp4 | 1-3.25\r\n"));
    assert.ok(text.includes("audio 1 : D:\\son.wav | 0-4\r\n"));
    const back = parseConfig(text);
    assert.deepEqual(back.videos, [v]);
    assert.deepEqual(back.trims, st.trims);
});

test("rognage invalide ignore, chemin garde", () => {
    const c = parseConfig("video 1 : C:\\a.mp4 | 5-2\nvideo 2 : C:\\b.mp4 | x\n");
    assert.deepEqual(c.videos, ["C:\\a.mp4", "C:\\b.mp4"]);
    assert.deepEqual(c.trims.video, {});
});
