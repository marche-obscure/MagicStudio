// Format du fichier de configuration (.txt) du noeud MiniMax H3 Reference
// Loader : sauvegarde (Download) et chargement (Upload). Module sans
// dependance a ComfyUI, teste par tests/test_config_format.mjs.
//
// Une ligne par sortie, dans l'ordre des sorties :
//   root : F:\Rushs\Projet
//   image 1 : images\a.png
//   video 1 : videos\v1.mp4
//   video_audio 1 : videos2.mp4 (bande-son extraite de cette video : piste audio)
//   audio 1 : NaN                (groupe vide : premier numero + NaN)
// Les chemins situes sous la racine sont ecrits relativement a elle.

export const CONFIG_LIMITS = { image: 9, video: 3, video_audio: 3, audio: 3 };
const EMPTY = "NaN";
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

/** Etat du noeud -> texte du fichier de configuration. */
export function formatConfig(state) {
    const root = state.root || "";
    const rel = (p) => toRelative(root, p);
    const lines = ["root : " + (root || EMPTY)];
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
 * Texte du fichier -> { root, images, videos, video_audios, audios } (chemins
 * absolus). video_audio est une liste independante des videos.
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
    let found = false;
    const groups = { image: {}, video: {}, video_audio: {}, audio: {} };

    for (const raw of String(text).split(/\r?\n/)) {
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
        root,
        images: list(groups.image).slice(0, CONFIG_LIMITS.image),
        videos: list(groups.video).slice(0, CONFIG_LIMITS.video),
        video_audios: list(groups.video_audio).slice(0, CONFIG_LIMITS.video_audio),
        audios: list(groups.audio).slice(0, CONFIG_LIMITS.audio),
    };
}
