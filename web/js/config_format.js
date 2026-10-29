// Fichiers de configuration (.json) du RefLoader : sauvegarde (Download) et chargement
// (Upload), une variante par fichier (version 3) ; versions 1 et 2 toujours lues. Module
// sans dependance a ComfyUI, teste par tests/test_config_format.mjs et tests/test_config_json.mjs.

import { variantOf, rowsOf, migrateState, variantTrimKey, FALLBACK_DESCRIPTION } from "./profiles.js";

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
// Versions 1 et 2 (lues seulement, converties par migrateState) :
//   v1 / v2 MiniMax : { "format", "version", "mode": "REF2VA"|"FL2VA", "root", "images": ["a.png"],
//     "videos": [{"path", "trim"}], "video_audios", "audios" } ou "first_frame" / "last_frame" ;
//   v2 LTX 2.x : { ..., "profile": "ltx2", "guide_images": [{path, seconds}], "guide_video": {...} | null,
//     "soundtrack", "voice" }.
// Chemins relatifs au dossier racine quand ils sont dessous ; root null si absent.
// --------------------------------------------------------------------
export const JSON_FORMAT = "MiniMax H3 Reference Loader";

/**
 * Ancien fichier (version 1 ou 2) -> etat d'avant les variantes { profile, mode, header,
 * root, images, videos, video_audios, audios, trims, first_frame, last_frame } ou, pour
 * LTX 2.x, { profile, header, root, guide_images, guide_video, soundtrack, voice, moments,
 * trims } (chemins absolus). Tolerant : elements en chaine ou en objet {path, trim},
 * rognage invalide ignore ; les plafonds sont ceux des lignes (migrateState). Erreur claire
 * si le JSON est invalide ou d'un autre format.
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
    const list = (kind, arr) => (Array.isArray(arr) ? arr : [])
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
        .filter(Boolean);
    const frame = (v) => (str(v) ? [abs(str(v))] : []);
    return {
        profile: "minimax_h3",
        mode: /fl2va/i.test(String(obj.mode || "")) ? "fl2va" : "ref2va",
        header: true,
        root,
        images: list("image", obj.images),
        videos: list("video", obj.videos),
        video_audios: list("video_audio", obj.video_audios),
        audios: list("audio", obj.audios),
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
    const read = (kind, it, withMoment) => {
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
        }).filter(Boolean);
    };
    return {
        profile: "ltx2",
        header: true,
        root,
        guide_images: read("guide_images", obj.guide_images, true),
        guide_video: read("guide_video", obj.guide_video, true),
        soundtrack: read("soundtrack", obj.soundtrack, false),
        voice: read("voice", obj.voice, false),
        moments,
        trims,
    };
}

// --------------------------------------------------------------------
// Version 3 (plan des variantes, 29/10/2026) : une variante par fichier.
//   { "format": "MiniMax H3 Reference Loader", "version": 3, "variant": "ltx.2_5", "root": "...",
//     "rows": { "guide_images": [{"path": "a.png", "seconds": 0}], "soundtrack": [{"path": "s.wav", "trim": [0, 4]}] } }
// Lignes, plafonds, rognages et moments lus dans la description (profiles.js) ; un ancien
// fichier (version 1 ou 2) est lu par parseConfigJson puis converti par migrateState.
// --------------------------------------------------------------------
const VARIANT_PREFIX = {
    "minimax_h3.ref2va": "REF2VA_minimax_config_",
    "minimax_h3.fl2va": "FL2VA_minimax_config_",
    "ltx.2_3": "LTX23_magicstudio_config_",
    "ltx.2_5": "LTX25_magicstudio_config_",
};

/** Debut du nom du fichier telecharge pour la variante affichee (suivi de yyyyMMdd-HHmmss.json). */
export function variantConfigPrefix(state, desc) {
    const v = variantOf(state, desc);
    return VARIANT_PREFIX[v] || v.replace(/[^A-Za-z0-9]+/g, "").toUpperCase() + "_magicstudio_config_";
}

/** Etat au format des variantes -> texte JSON de la variante affichee. */
export function formatVariantConfig(state, desc) {
    const v = variantOf(state, desc);
    const root = (state && state.root) || "";
    const sel = ((state && state.selections) || {})[v] || {};
    const rows = {};
    for (const r of rowsOf(desc, v)) {
        const trims = (sel.trims || {})[r.id] || {};
        const moments = (sel.moments || {})[r.id] || {};
        rows[r.id] = ((sel.rows || {})[r.id] || []).slice(0, r.max).map((p) => {
            const o = { path: toRelative(root, p) };
            const m = moments[variantTrimKey(p)];
            if (r.moment && typeof m === "number" && Number.isFinite(m)) o.seconds = m;
            const t = trims[variantTrimKey(p)];
            if (r.trim && t) o.trim = [t[0], t[1]];
            return o;
        });
    }
    return JSON.stringify({ format: JSON_FORMAT, version: 3, variant: v, root: root || null, rows }, null, 2) + "\n";
}

/**
 * Texte JSON -> { variant, header, root, rows, trims, moments } (chemins absolus, une variante).
 * Versions 1 et 2 lues par parseConfigJson puis converties par migrateState. Tolerant :
 * elements en chaine ou en objet, lignes inconnues ignorees, plafond de chaque ligne.
 */
export function parseVariantConfig(text, desc) {
    const d = desc && desc.variants ? desc : FALLBACK_DESCRIPTION;
    if (!String(text).trimStart().startsWith("{")) throw new Error("Only .json configuration files are supported.");
    let obj;
    try {
        obj = JSON.parse(text);
    } catch (e) {
        throw new Error("This file is not valid JSON.");
    }
    if (!obj || typeof obj !== "object" || obj.format !== JSON_FORMAT) {
        throw new Error("This file is not a MiniMax H3 Reference Loader configuration.");
    }
    if (Number(obj.version) < 3) {
        const s = migrateState(parseConfigJson(text), d);
        const sel = s.selections[s.variant];
        return { variant: s.variant, header: true, root: s.root || "", rows: sel.rows, trims: sel.trims, moments: sel.moments };
    }
    const v = obj.variant;
    if (!d.variants[v]) throw new Error("Unknown variant: " + v);
    const root = typeof obj.root === "string" ? obj.root.trim() : "";
    const str = (x) => (typeof x === "string" && x.trim() ? x.trim() : "");
    const inRows = obj.rows && typeof obj.rows === "object" ? obj.rows : {};
    const out = { variant: v, header: true, root, rows: {}, trims: {}, moments: {} };
    for (const r of rowsOf(d, v)) {
        const items = Array.isArray(inRows[r.id]) ? inRows[r.id] : [];
        out.rows[r.id] = [];
        if (r.trim) out.trims[r.id] = {};
        if (r.moment) out.moments[r.id] = {};
        for (const it of items) {
            if (out.rows[r.id].length >= r.max) break;
            const p = str(typeof it === "string" ? it : it && it.path);
            if (!p) continue;
            const path = toAbsolute(root, p);
            out.rows[r.id].push(path);
            if (!it || typeof it !== "object") continue;
            const key = variantTrimKey(path);
            if (r.moment && typeof it.seconds === "number" && Number.isFinite(it.seconds)) out.moments[r.id][key] = it.seconds;
            const t = it.trim;
            if (r.trim && Array.isArray(t) && t.length === 2 && Number(t[0]) >= 0 && Number(t[1]) > Number(t[0])) {
                out.trims[r.id][key] = [Number(t[0]), Number(t[1])];
            }
        }
    }
    return out;
}
