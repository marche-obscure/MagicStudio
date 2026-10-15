// Format du fichier de configuration (.txt) du noeud MiniMax H3 Reference
// Loader : sauvegarde (Download) et chargement (Upload). Module sans
// dependance a ComfyUI, teste par tests/test_config_format.mjs.
//
// Une ligne d'en-tete (type du fichier, verifie a l'Upload), puis une ligne
// par sortie, dans l'ordre des sorties :
//   # MiniMax H3 Reference Loader - REF2VA configuration   (ou FL2VA)
//   mode : Ref2VA                (ou FL2VA : mode F2VA/FL2VA)
//   root : F:\Rushs\Projet
//   image 1 : images\a.png
//   video 1 : videos\v1.mp4
//   video_audio 1 : videos2.mp4 (bande-son extraite de cette video : piste audio)
//   audio 1 : NaN                (groupe vide : premier numero + NaN)
//   video 2 : rush\plan.mp4 | 2.5-8 (rognage : debut-fin en secondes, facultatif)
//   first_frame : images\a.png   (mode F2VA/FL2VA ; NaN si vide)
//   last_frame : NaN
// Les chemins situes sous la racine sont ecrits relativement a elle.

export const CONFIG_LIMITS = { image: 9, video: 3, video_audio: 3, audio: 3 };
const EMPTY = "NaN";
const HEADER = "# MiniMax H3 Reference Loader - ";
const HEADER_RE = /^\s*#\s*MiniMax H3 Reference Loader\s*-\s*(REF2VA|FL2VA)\b/i;
const EOL = "\r\n";

/** Cle d'un chemin pour les rognages (identique a media.trim_key cote Python). */
export function trimKey(path) {
    return String(path).replace(/\\/g, "/").toLowerCase();
}

// Listes dont les fichiers peuvent etre rognes.
const TRIM_KINDS = ["video", "video_audio", "audio"];
const fmtSeconds = (x) => String(Number(Number(x).toFixed(3)));

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

/**
 * Etat du noeud -> texte du fichier de configuration du MODE ACTIF seulement :
 * Ref2VA = les 4 listes ; F2VA/FL2VA = first_frame et last_frame. Les deux
 * modes ont des fichiers separes, sans melange.
 */
export function formatConfig(state) {
    const root = state.root || "";
    const rel = (p) => toRelative(root, p);
    const fl = state.mode === "fl2va";
    const lines = [
        HEADER + (fl ? "FL2VA" : "REF2VA") + " configuration",
        "mode : " + (fl ? "FL2VA" : "Ref2VA"),
        "root : " + (root || EMPTY),
    ];
    if (fl) {
        for (const key of ["first_frame", "last_frame"]) {
            const v = (state[key] || [])[0];
            lines.push(key + " : " + (v ? rel(v) : EMPTY));
        }
        return lines.join(EOL) + EOL;
    }
    const trims = state.trims || {};
    // Ligne "groupe N : chemin" suivie de " | debut-fin" si le fichier est rogne.
    const group = (name, paths) => {
        if (!paths.length) {
            lines.push(name + " 1 : " + EMPTY);
            return;
        }
        paths.forEach((p, i) => {
            const t = (trims[name] || {})[trimKey(p)];
            lines.push(name + " " + (i + 1) + " : " + rel(p) +
                (t ? " | " + fmtSeconds(t[0]) + "-" + fmtSeconds(t[1]) : ""));
        });
    };
    group("image", state.images);
    group("video", state.videos);
    group("video_audio", state.video_audios || []);
    group("audio", state.audios);
    return lines.join(EOL) + EOL;
}

/**
 * Texte du fichier -> { mode, root, images, videos, video_audios, audios,
 * first_frame, last_frame, header } (chemins absolus). video_audio est une
 * liste independante des videos. Le mode vient de l'en-tete s'il existe
 * (header = true), sinon de la ligne mode, sinon Ref2VA.
 * Tolerant : ordre des lignes, casse, espaces, numeros manquants (la liste
 * est resserree), lignes inconnues ignorees. Leve une erreur si aucune
 * ligne n'est reconnue.
 */
export function parseConfig(text) {
    const value = (v) => {
        const t = (v || "").trim();
        return !t || t.toLowerCase() === EMPTY.toLowerCase() ? "" : t;
    };
    let root = "";
    let mode = "ref2va";
    let headerMode = null;
    const frames = { first_frame: "", last_frame: "" };
    let found = false;
    const groups = { image: {}, video: {}, video_audio: {}, audio: {} };

    for (const raw of String(text).split(/\r?\n/)) {
        const mh = raw.match(HEADER_RE);
        if (mh) {
            headerMode = mh[1].toLowerCase() === "fl2va" ? "fl2va" : "ref2va";
            found = true;
            continue;
        }
        const mm = raw.match(/^\s*mode\s*:(.*)$/i);
        if (mm) {
            // "FL2VA", "F2VA/FL2VA", "fl2va"... = mode F2VA/FL2VA ; le reste = Ref2VA.
            mode = /fl2va/i.test(mm[1]) ? "fl2va" : "ref2va";
            found = true;
            continue;
        }
        const mf = raw.match(/^\s*(first_frame|last_frame)(?:\s+1)?\s*:(.*)$/i);
        if (mf) {
            frames[mf[1].toLowerCase()] = value(mf[2]);
            found = true;
            continue;
        }
        const mr = raw.match(/^\s*root\s*:(.*)$/i);
        if (mr) {
            root = value(mr[1]);
            found = true;
            continue;
        }
        const m = raw.match(/^\s*(image|video_audio|video|audio)\s+(\d+)\s*:(.*)$/i);
        if (!m) continue;
        found = true;
        groups[m[1].toLowerCase()][Number(m[2])] = value(m[3]);
    }
    if (!found) throw new Error("No configuration line found in this file.");

    const abs = (p) => toAbsolute(root, p);
    const ordered = (g) => Object.keys(g).map(Number).sort((a, b) => a - b);
    // "chemin | debut-fin" : le rognage invalide est ignore, le chemin garde.
    const trims = { video: {}, video_audio: {}, audio: {} };
    const split = (kind, v) => {
        const m = v.match(/^(.*?)\s*\|\s*(.*)$/);
        const path = abs(m ? m[1].trim() : v);
        const r = m && m[2].match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
        if (r && TRIM_KINDS.includes(kind) && Number(r[1]) < Number(r[2])) {
            trims[kind][trimKey(path)] = [Number(r[1]), Number(r[2])];
        }
        return path;
    };
    const list = (kind) => ordered(groups[kind]).map((k) => groups[kind][k]).filter(Boolean)
        .map((v) => split(kind, v));

    return {
        mode: headerMode || mode,
        header: headerMode !== null,
        root,
        images: list("image").slice(0, CONFIG_LIMITS.image),
        videos: list("video").slice(0, CONFIG_LIMITS.video),
        video_audios: list("video_audio").slice(0, CONFIG_LIMITS.video_audio),
        audios: list("audio").slice(0, CONFIG_LIMITS.audio),
        trims,
        first_frame: frames.first_frame ? [abs(frames.first_frame)] : [],
        last_frame: frames.last_frame ? [abs(frames.last_frame)] : [],
    };
}

// --------------------------------------------------------------------
// Format JSON (sauvegardes depuis le 15/10/2026) : un objet par mode.
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
 * Texte JSON -> meme objet que parseConfig() (header = true). Tolerant :
 * elements en chaine ou en objet {path, trim}, rognage invalide ignore,
 * plafonds MiniMax. Erreur claire si le JSON est invalide ou d'un autre format.
 */
export function parseConfigJson(text) {
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

/** Fichier JSON (nouveau) ou .txt (ancien) : choisi d'apres son contenu. */
export function parseAnyConfig(text) {
    return String(text).trimStart().startsWith("{") ? parseConfigJson(text) : parseConfig(text);
}
