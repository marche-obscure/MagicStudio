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
//   first_frame : images\a.png   (mode F2VA/FL2VA ; NaN si vide)
//   last_frame : NaN
// Les chemins situes sous la racine sont ecrits relativement a elle.

export const CONFIG_LIMITS = { image: 9, video: 3, video_audio: 3, audio: 3 };
const EMPTY = "NaN";
const HEADER = "# MiniMax H3 Reference Loader - ";
const HEADER_RE = /^\s*#\s*MiniMax H3 Reference Loader\s*-\s*(REF2VA|FL2VA)\b/i;
const EOL = "\r\n";

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
    const group = (name, values) => {
        if (!values.length) values = [EMPTY];
        values.forEach((v, i) => lines.push(name + " " + (i + 1) + " : " + (v || EMPTY)));
    };
    group("image", state.images.map(rel));
    group("video", state.videos.map(rel));
    group("video_audio", (state.video_audios || []).map(rel));
    group("audio", state.audios.map(rel));
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
    const list = (g) => ordered(g).map((k) => g[k]).filter(Boolean).map(abs);

    return {
        mode: headerMode || mode,
        header: headerMode !== null,
        root,
        images: list(groups.image).slice(0, CONFIG_LIMITS.image),
        videos: list(groups.video).slice(0, CONFIG_LIMITS.video),
        video_audios: list(groups.video_audio).slice(0, CONFIG_LIMITS.video_audio),
        audios: list(groups.audio).slice(0, CONFIG_LIMITS.audio),
        first_frame: frames.first_frame ? [abs(frames.first_frame)] : [],
        last_frame: frames.last_frame ? [abs(frames.last_frame)] : [],
    };
}
