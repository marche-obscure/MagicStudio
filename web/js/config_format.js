// Fichiers de configuration (.json) du noeud MiniMax H3 Reference Loader :
// sauvegarde (Download) et chargement (Upload). Module sans dependance a
// ComfyUI, teste par tests/test_config_format.mjs et tests/test_config_json.mjs.

import { profileOf } from "./profiles.js";

export const CONFIG_LIMITS = { image: 9, video: 3, video_audio: 3, audio: 3 };
// Plafonds du profil LTX 2.x (fichier de configuration).
export const LTX_CONFIG_LIMITS = { guide_images: 9, guide_video: 1, soundtrack: 1, voice: 1 };

/** Cle d'un chemin pour les rognages (identique a media.trim_key cote Python). */
export function trimKey(path) {
    return String(path).replace(/\\/g, "/").toLowerCase();
}

// Listes dont les fichiers peuvent etre rognes.
const TRIM_KINDS = ["video", "video_audio", "audio"];

const norm = (p) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
const isAbsolute = (p) => /^[A-Za-z]:[\\/]/.test(p) || /^[\\/]/.test(p);

/** Chemin relatif a la racine s'il est dessous, sinon inchange. */
export function toRelative(root, path) {
    if (!root || !path) return path;
    const r = norm(root);
    const p = path.replace(/\\/g, "/").toLowerCase();
    if (p.startsWith(r + "/")) return path.slice(root.replace(/[\\/]+$/, "").length + 1);
    return path;
}

/** Chemin absolu : un chemin relatif est rattache a la racine. */
export function toAbsolute(root, path) {
    if (!path || isAbsolute(path) || !root) return path;
    const base = root.replace(/[\\/]+$/, "");
    const sep = base.includes("\\") ? "\\" : "/";
    return base + sep + path;
}

// --------------------------------------------------------------------
// Format JSON : un objet par mode.
//   { "format": "MiniMax H3 Reference Loader", "version": 1, "mode": "REF2VA",
//     "root": "...", "images": ["a.png"], "videos": [{"path": "v.mp4", "trim": [5, 7]}],
//     "video_audios": [...], "audios": [...] }
//   { ..., "mode": "FL2VA", "root": ..., "first_frame": "a.png", "last_frame": null }
// Chemins relatifs au dossier racine quand ils sont dessous ; root null si absent.
// --------------------------------------------------------------------
export const JSON_FORMAT = "MiniMax H3 Reference Loader";

/** Debut du nom du fichier telecharge (suivi de yyyyMMdd-HHmmss.json). */
export function configFilePrefix(state) {
    if (profileOf(state) === "ltx2") return "LTX2_magicstudio_config_";
    return (state.mode === "fl2va" ? "FL2VA" : "REF2VA") + "_minimax_config_";
}

// Profil LTX 2.x : { format, version: 2, profile: "ltx2", root, guide_images: [{path, seconds}],
//   guide_video: {path, seconds, trim?} | null, soundtrack: {path, trim?} | null, voice: {...} | null }
function formatLtx(state) {
    const root = state.root || "";
    const rel = (p) => toRelative(root, p);
    const trims = state.trims || {};
    const moments = state.moments || {};
    const withTrim = (kind, p, obj) => {
        const t = (trims[kind] || {})[trimKey(p)];
        if (t) obj.trim = [t[0], t[1]];
        return obj;
    };
    const withSeconds = (kind, p, obj) => {
        const m = (moments[kind] || {})[trimKey(p)];
        if (typeof m === "number" && Number.isFinite(m)) obj.seconds = m;
        return obj;
    };
    const one = (kind, arr, seconds) => {
        const p = (arr || [])[0];
        if (!p) return null;
        const o = { path: rel(p) };
        if (seconds) withSeconds(kind, p, o);
        return withTrim(kind, p, o);
    };
    return JSON.stringify({
        format: JSON_FORMAT,
        version: 2,
        profile: "ltx2",
        root: root || null,
        guide_images: (state.guide_images || []).map((p) => withSeconds("guide_images", p, { path: rel(p) })),
        guide_video: one("guide_video", state.guide_video, true),
        soundtrack: one("soundtrack", state.soundtrack, false),
        voice: one("voice", state.voice, false),
    }, null, 2) + "\n";
}

/** Etat du noeud -> texte JSON de la configuration du profil / mode actif. */
export function formatConfigJson(state) {
    if (profileOf(state) === "ltx2") return formatLtx(state);
    const root = state.root || "";
    const rel = (p) => toRelative(root, p);
    const fl = state.mode === "fl2va";
    const obj = { format: JSON_FORMAT, version: 2, profile: "minimax_h3", mode: fl ? "FL2VA" : "REF2VA", root: root || null };
    if (fl) {
        obj.first_frame = (state.first_frame || [])[0] ? rel(state.first_frame[0]) : null;
        obj.last_frame = (state.last_frame || [])[0] ? rel(state.last_frame[0]) : null;
        return JSON.stringify(obj, null, 2) + "\n";
    }
    const trims = state.trims || {};
    // Element rognable : {path, trim?} ; image : simple chemin.
    const items = (kind, paths) => (paths || []).map((p) => {
        const t = (trims[kind] || {})[trimKey(p)];
        return t ? { path: rel(p), trim: [t[0], t[1]] } : { path: rel(p) };
    });
    obj.images = (state.images || []).map(rel);
    obj.videos = items("video", state.videos);
    obj.video_audios = items("video_audio", state.video_audios);
    obj.audios = items("audio", state.audios);
    return JSON.stringify(obj, null, 2) + "\n";
}

/**
 * Texte JSON -> { mode, header, root, images, videos, video_audios, audios,
 * trims, first_frame, last_frame } (chemins absolus). Tolerant :
 * elements en chaine ou en objet {path, trim}, rognage invalide ignore,
 * plafonds MiniMax. Erreur claire si le JSON est invalide ou d'un autre format.
 */
export function parseConfigJson(text) {
    // Les anciennes sauvegardes .txt ne sont plus lues.
    if (!String(text).trimStart().startsWith("{")) {
        throw new Error("Only .json configuration files are supported.");
    }
    let obj;
    try {
        obj = JSON.parse(text);
    } catch (e) {
        throw new Error("This file is not valid JSON.");
    }
    if (!obj || typeof obj !== "object" || obj.format !== JSON_FORMAT) {
        throw new Error("This file is not a MiniMax H3 Reference Loader configuration.");
    }
    const root = typeof obj.root === "string" ? obj.root.trim() : "";
    const abs = (p) => toAbsolute(root, p);
    // Version 1 ou profil absent : fichier MiniMax H3.
    if (Number(obj.version) >= 2 && obj.profile === "ltx2") return parseLtx(obj, root, abs);
    const trims = { video: {}, video_audio: {}, audio: {} };
    const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : "");
    const list = (kind, arr, max) => (Array.isArray(arr) ? arr : [])
        .map((it) => {
            const p = str(typeof it === "string" ? it : it && it.path);
            if (!p) return "";
            const path = abs(p);
            const t = it && typeof it === "object" ? it.trim : null;
            if (TRIM_KINDS.includes(kind) && Array.isArray(t) && t.length === 2 &&
                Number(t[0]) >= 0 && Number(t[1]) > Number(t[0])) {
                trims[kind][trimKey(path)] = [Number(t[0]), Number(t[1])];
            }
            return path;
        })
        .filter(Boolean)
        .slice(0, max);
    const frame = (v) => (str(v) ? [abs(str(v))] : []);
    return {
        profile: "minimax_h3",
        mode: /fl2va/i.test(String(obj.mode || "")) ? "fl2va" : "ref2va",
        header: true,
        root,
        images: list("image", obj.images, CONFIG_LIMITS.image),
        videos: list("video", obj.videos, CONFIG_LIMITS.video),
        video_audios: list("video_audio", obj.video_audios, CONFIG_LIMITS.video_audio),
        audios: list("audio", obj.audios, CONFIG_LIMITS.audio),
        trims,
        first_frame: frame(obj.first_frame),
        last_frame: frame(obj.last_frame),
    };
}

// Fichier du profil LTX 2.x -> etat (chemins absolus). Tolerant comme le profil MiniMax.
function parseLtx(obj, root, abs) {
    const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : "");
    const trims = { guide_video: {}, soundtrack: {}, voice: {} };
    const moments = { guide_images: {}, guide_video: {} };
    const read = (kind, it, max, withMoment) => {
        const items = Array.isArray(it) ? it : (it ? [it] : []);
        return items.map((x) => {
            const p = str(typeof x === "string" ? x : x && x.path);
            if (!p) return "";
            const path = abs(p);
            if (x && typeof x === "object") {
                const s = x.seconds;
                if (withMoment && typeof s === "number" && Number.isFinite(s)) moments[kind][trimKey(path)] = s;
                const t = x.trim;
                if (trims[kind] && Array.isArray(t) && t.length === 2 &&
                    Number(t[0]) >= 0 && Number(t[1]) > Number(t[0])) {
                    trims[kind][trimKey(path)] = [Number(t[0]), Number(t[1])];
                }
            }
            return path;
        }).filter(Boolean).slice(0, max);
    };
    return {
        profile: "ltx2",
        header: true,
        root,
        guide_images: read("guide_images", obj.guide_images, LTX_CONFIG_LIMITS.guide_images, true),
        guide_video: read("guide_video", obj.guide_video, LTX_CONFIG_LIMITS.guide_video, true),
        soundtrack: read("soundtrack", obj.soundtrack, LTX_CONFIG_LIMITS.soundtrack, false),
        voice: read("voice", obj.voice, LTX_CONFIG_LIMITS.voice, false),
        moments,
        trims,
    };
}
