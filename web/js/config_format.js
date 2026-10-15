// Fichiers de configuration (.json) du noeud MiniMax H3 Reference Loader :
// sauvegarde (Download) et chargement (Upload). Module sans dependance a
// ComfyUI, teste par tests/test_config_format.mjs et tests/test_config_json.mjs.

export const CONFIG_LIMITS = { image: 9, video: 3, video_audio: 3, audio: 3 };

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

/** Etat du noeud -> texte JSON de la configuration du mode actif. */
export function formatConfigJson(state) {
    const root = state.root || "";
    const rel = (p) => toRelative(root, p);
    const fl = state.mode === "fl2va";
    const obj = { format: JSON_FORMAT, version: 1, mode: fl ? "FL2VA" : "REF2VA", root: root || null };
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
