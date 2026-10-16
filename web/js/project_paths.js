// Regles des dossiers de projet, sans dependance a ComfyUI (testees par
// node --test tests/test_project_paths.mjs).
import { trimKey } from "./config_format.js";

// Sous-dossiers de chaque projet (meme liste que projects.SUBFOLDERS en Python).
export const PROJECT_SUBFOLDERS = [
    "00.Workflows", "02.Models", "04.Prompt", "06.LoRA", "08.Images", "10.Son", "12.Video", "14.Video-Audio",
    "40.Rush Videos", "60.Rush Images",
];

// Couleur de la pastille de chaque sous-dossier dans le noeud (Images, Son,
// Video et Video-Audio reprennent les couleurs Images, Audio, Video et
// Video/Audio du Ref Loader).
export const FOLDER_COLORS = {
    "00.Workflows": "#607d8b",
    "02.Models": "#3d6fd3",
    "04.Prompt": "#c9a227",
    "06.LoRA": "#d35fa8",
    "08.Images": "#6a5fd3",
    "10.Son": "#3eaca5",
    "12.Video": "#e0793c",
    "14.Video-Audio": "#43a047",
    "40.Rush Videos": "#a8622e",
    "60.Rush Images": "#8e7fe0",
};

// Save : sous-dossier ou va chaque liste du Ref Loader (les deux modes).
export const LIST_FOLDERS = {
    images: "08.Images", videos: "12.Video", video_audios: "14.Video-Audio", audios: "10.Son",
    first_frame: "08.Images", last_frame: "08.Images",
};
const LISTS = Object.keys(LIST_FOLDERS);
// Liste -> type de rognage (cle de state.trims).
const TRIM_OF_LIST = { videos: "video", video_audios: "video_audio", audios: "audio" };

/** Fichiers a copier par Save : [{path, folder}] dans l'ordre des listes. */
export function saveItems(state) {
    const items = [];
    for (const list of LISTS) {
        for (const path of state[list] || []) items.push({ path, folder: LIST_FOLDERS[list] });
    }
    return items;
}

/**
 * Copie de l'etat du Ref Loader avec chaque chemin des listes remplace par
 * fn(chemin, liste) ; les cles de rognage suivent leur fichier.
 */
export function remapState(state, fn) {
    const s = JSON.parse(JSON.stringify(state));
    for (const list of LISTS) {
        const old = state[list] || [];
        s[list] = old.map((p) => fn(p, list));
        const kind = TRIM_OF_LIST[list];
        if (!kind || !state.trims || !state.trims[kind]) continue;
        old.forEach((p, i) => {
            const before = trimKey(p);
            const after = trimKey(s[list][i]);
            if (before === after || !(before in state.trims[kind])) return;
            s.trims[kind][after] = state.trims[kind][before];
            delete s.trims[kind][before];
        });
    }
    return s;
}

/**
 * fn pour remapState apres Save : destinations dans l'ordre de saveItems()
 * ("" = fichier manquant, chemin garde). Par position et non par chemin :
 * une meme video peut aller dans 12.Video et dans 14.Video-Audio.
 */
export function mapBySequence(dsts) {
    let i = 0;
    return (p) => {
        const d = dsts[i++];
        return d || p;
    };
}

/** fn pour remapState : ce qui est sous oldDir passe sous newDir (renommer / deplacer un projet). */
export function mapByPrefix(oldDir, newDir) {
    const norm = (p) => String(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    const base = norm(oldDir) + "/";
    const sep = newDir.includes("\\") || !newDir.includes("/") ? "\\" : "/";
    return (p) => {
        if (!norm(p).startsWith(base)) return p;
        const rest = String(p).replace(/\\/g, "/").slice(base.length);
        return newDir.replace(/[\\/]+$/, "") + sep + rest.split("/").join(sep);
    };
}

// Dossiers suivis par leur cloche : ajout / suppression de references du Ref Loader.
export const UPDATE_FOLDERS = ["08.Images", "10.Son", "12.Video", "14.Video-Audio"];

const normPath = (p) => String(p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
const dirOf = (p) => normPath(p).replace(/\/[^/]*$/, "");

/** References du Ref Loader qui vont dans ce dossier (ordre des listes, sans doublon). */
export function folderPaths(state, folder) {
    const out = [];
    for (const list of LISTS) {
        if (LIST_FOLDERS[list] !== folder) continue;
        for (const p of state[list] || []) if (!out.includes(p)) out.push(p);
    }
    return out;
}

/** Instantane des dossiers suivis : {dossier: [chemins]} (Save, mise a jour). */
export function folderSnapshot(state) {
    const snap = {};
    for (const f of UPDATE_FOLDERS) snap[f] = folderPaths(state, f);
    return snap;
}

/**
 * Changements d'un dossier suivi : added = references pas encore dans
 * <projet>/<dossier> ; removed = references de l'instantane retirees du Ref
 * Loader (sans instantane, aucune). Les fichiers ne sont jamais effaces.
 */
export function folderChanges(state, folder, projectPath, snapshot) {
    const current = folderPaths(state, folder);
    const dir = normPath(projectPath + "/" + folder);
    const added = current.filter((p) => dirOf(p) !== dir);
    const now = new Set(current.map(normPath));
    const removed = Array.isArray(snapshot) ? snapshot.filter((p) => !now.has(normPath(p))) : [];
    return { added, removed };
}

/** fn pour remapState apres la mise a jour d'un dossier : seules ses listes changent. */
export function mapFolderBySequence(folder, dsts) {
    let i = 0;
    return (p, list) => {
        if (LIST_FOLDERS[list] !== folder) return p;
        const d = dsts[i++];
        return d || p;
    };
}

/**
 * Etat du Ref Loader sans ses listes ni rognages : le contenu des dossiers
 * est suivi par leurs cloches, ce n'est pas une modification du workflow.
 */
export function withoutMedia(state) {
    const s = Object.assign({}, state);
    for (const list of LISTS) delete s[list];
    delete s.trims;
    return s;
}

// ---- Galerie du Ref Loader reliee a un projet ----

/**
 * Selection de la galerie a la fermeture : added / removed par rapport a
 * l'ouverture ; ask = demander Add ou Replace (de nouveaux fichiers, rien
 * de retire, et une selection qui existait deja).
 */
export function gallerySession(initial, final) {
    const has = (list, p) => list.some((x) => normPath(x) === normPath(p));
    const added = final.filter((p) => !has(initial, p));
    const removed = initial.filter((p) => !has(final, p));
    return { added, removed, ask: added.length > 0 && removed.length === 0 && initial.length > 0 };
}

/** Replace : seuls les fichiers ajoutes pendant la session restent, dans leur ordre. */
export function replaceSelection(initial, final) {
    return gallerySession(initial, final).added;
}

/**
 * Fichiers du dossier du projet que plus aucune liste du Ref Loader
 * n'utilise (toutes les listes : une video peut servir de son seul) :
 * ils partent dans Archives, aucun ne reste.
 */
export function unusedProjectFiles(paths, state) {
    const used = new Set();
    for (const list of LISTS) for (const p of state[list] || []) used.add(normPath(p));
    return paths.filter((p) => !used.has(normPath(p)));
}

/** Couleurs des groupes de doublons, dans l'ordre d'apparition (puis on recommence). */
export const DUP_COLORS = ["#3b82f6", "#e0793c", "#8b5cf6", "#22c55e", "#eab308", "#06b6d4"];

/**
 * Doublons (meme SHA256) parmi des fichiers affiches dans l'ordre :
 * {chemin: couleur} pour chaque fichier d'un groupe d'au moins deux
 * fichiers differents ; une couleur par groupe. Un chemin sans empreinte
 * connue est ignore.
 */
export function duplicateColors(paths, hashes) {
    const seen = new Set();
    const groups = new Map(); // empreinte -> chemins
    for (const p of paths) {
        const key = normPath(p);
        const h = hashes[p];
        if (!h || seen.has(key)) continue;
        seen.add(key);
        if (!groups.has(h)) groups.set(h, []);
        groups.get(h).push(p);
    }
    const out = {};
    let n = 0;
    for (const members of groups.values()) {
        if (members.length < 2) continue;
        const color = DUP_COLORS[n++ % DUP_COLORS.length];
        for (const p of members) out[p] = color;
    }
    return out;
}

/** Le mode a-t-il au moins une reference (une configuration a sauvegarder) ? */
export function modeHasRefs(state, mode) {
    const n = (k) => (state[k] || []).length;
    return mode === "fl2va" ? n("first_frame") + n("last_frame") > 0
        : n("images") + n("videos") + n("video_audios") + n("audios") > 0;
}

/** Nom d'une configuration enregistree par Save : yyyyMMdd-HHmmss_MODE_minimax_config.json. */
export function configFileName(date, mode) {
    const p = (n) => String(n).padStart(2, "0");
    const stamp = date.getFullYear() + p(date.getMonth() + 1) + p(date.getDate()) + "-" +
        p(date.getHours()) + p(date.getMinutes()) + p(date.getSeconds());
    return stamp + "_" + (mode === "fl2va" ? "FL2VA" : "REF2VA") + "_minimax_config.json";
}

const MAX_NAME_LENGTH = 100;
const INVALID_CHARS = '<>:"/\\|?*';
const RESERVED = new Set(["CON", "PRN", "AUX", "NUL"]);
for (let i = 1; i <= 9; i++) {
    RESERVED.add("COM" + i);
    RESERVED.add("LPT" + i);
}

/**
 * Message d'erreur (anglais) si Windows refuse ce nom de dossier, "" sinon.
 * Regles identiques a projects.validate_name() en Python.
 */
export function projectNameError(raw) {
    const name = String(raw || "").trim();
    if (!name) return "The project name is empty.";
    if (name.length > MAX_NAME_LENGTH) return "The project name is too long (" + MAX_NAME_LENGTH + " characters max).";
    for (const ch of name) {
        if (INVALID_CHARS.includes(ch) || ch.charCodeAt(0) < 32) {
            return 'The project name cannot contain < > : " / \\ | ? * or control characters.';
        }
    }
    if (name.endsWith(".")) return "The project name cannot end with a dot.";
    if (RESERVED.has(name.split(".")[0].toUpperCase())) return '"' + name + '" is a name reserved by Windows.';
    return "";
}

/**
 * Etat du noeud Projet : racine et chemin du projet choisi, nom, et
 * folder = dossier des projets personnalise quand aucun Root folder ne
 * vient du Reference Loader ("" = dossier de repli <input>/Projets).
 */
export function parseProjectState(raw) {
    let data = null;
    try {
        data = JSON.parse(raw || "{}");
    } catch (e) {
        data = null;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) data = {};
    const str = (v) => (typeof v === "string" ? v : "");
    // Workflow du projet wfPath : nom du fichier (00.Workflows) et validation
    // par la cloche (cloche orange tant qu'elle n'a pas ete faite).
    // snap = instantane des dossiers suivis a la derniere mise a jour (projet snapPath).
    const snap = {};
    if (data.snap && typeof data.snap === "object" && !Array.isArray(data.snap)) {
        for (const f of UPDATE_FOLDERS) {
            if (Array.isArray(data.snap[f])) snap[f] = data.snap[f].filter((p) => typeof p === "string");
        }
    }
    return {
        root: str(data.root), name: str(data.name), path: str(data.path), folder: str(data.folder),
        wfPath: str(data.wfPath), wfName: str(data.wfName), wfValidated: data.wfValidated === true,
        snap, snapPath: str(data.snapPath),
    };
}
