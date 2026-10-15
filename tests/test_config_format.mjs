// Tests du format de configuration .txt (sans ComfyUI) :
//     node --test tests/test_config_format.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { formatConfig, parseConfig, toRelative, toAbsolute } from "../web/js/config_format.js";

const ROOT = "F:\\Rushs\\Projet";

const state = {
    root: ROOT,
    images: [ROOT + "\\images\\a.png", "D:\\ailleurs\\b.png"],
    videos: [ROOT + "\\videos\\v1.mp4", ROOT + "\\videos\\v2.mp4"],
    video_audios: [ROOT + "\\videos\\v2.mp4"],
    audios: [],
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

test("format : une ligne par sortie, NaN pour un groupe vide", () => {
    assert.equal(formatConfig(state), [
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

test("format d'une configuration vide", () => {
    const text = formatConfig({ root: "", images: [], videos: [], video_audios: [], audios: [] });
    assert.equal(text, "root : NaN\r\nimage 1 : NaN\r\nvideo 1 : NaN\r\nvideo_audio 1 : NaN\r\naudio 1 : NaN\r\n");
});

test("aller-retour format -> lecture", () => {
    const back = parseConfig(formatConfig(state));
    assert.deepEqual(back, state);
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
        root: "F:/r",
        images: ["F:/r/a.png", "F:/r/c.png"],
        videos: [],
        video_audios: ["F:/r/x.mp4"],
        audios: ["F:/r/voix.wav"],
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
        root: "", images: [], videos: ["C:\\a.mp4", "C:\\b.mp4"], video_audios: ["C:\\b.mp4"], audios: [],
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
