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

// Maximum du Reference Loader par dossier (plafonds du noeud MiniMax H3) ; 08.Images suit le mode.
export const FOLDER_MAX = {
    "08.Images": { ref2va: 9, fl2va: 2 }, "10.Son": 3, "12.Video": 3, "14.Video-Audio": 3,
};

/**
 * "Use: x/y" d'un dossier (choix utilisateur) : x = fichiers du dossier
 * utilises par les listes du mode actuel (08.Images : Images en Ref2VA,
 * premiere + derniere image en FL2VA), y = maximum du dossier pour ce mode.
 */
export function folderUse(paths, state, folder) {
    const fl = !!state && state.mode === "fl2va";
    const lists = folder === "08.Images" ? (fl ? ["first_frame", "last_frame"] : ["images"]) : MEDIA_FOLDERS[folder] || [];
    const refs = new Set();
    for (const list of lists) for (const p of (state && state[list]) || []) refs.add(normPath(p));
    const max = FOLDER_MAX[folder];
    return {
        used: (paths || []).filter((p) => refs.has(normPath(p))).length,
        max: typeof max === "object" && max ? max[fl ? "fl2va" : "ref2va"] : max || 0,
        mode: fl ? "FL2VA" : "Ref2VA",
    };
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

// ---- Configuration du projet (99.Project-Config) : Load / Save ----

// Dossiers des listes du Ref Loader (meme table que project_config.MEDIA en Python).
export const MEDIA_FOLDERS = {
    "08.Images": ["images", "first_frame", "last_frame"],
    "10.Son": ["audios"],
    "12.Video": ["videos"],
    "14.Video-Audio": ["video_audios"],
};
// Dossiers chargeables (une case chacun dans la fenetre Load).
export const LOADABLE_FOLDERS = ["00.Workflows", "08.Images", "10.Son", "12.Video", "14.Video-Audio"];

/** Listes du Ref Loader envoyees a Save (chemins des fichiers du projet). */
export function configRefs(state) {
    const out = {};
    for (const list of LISTS) out[list] = (state[list] || []).slice();
    return out;
}

function joinPath(dir, ...parts) {
    const sep = String(dir).includes("\\") || !String(dir).includes("/") ? "\\" : "/";
    return [String(dir).replace(/[\\/]+$/, ""), ...parts].join(sep);
}

/**
 * Load : etat du Ref Loader avec les listes des dossiers coches remplacees
 * par la configuration (ordre des indices, rognages repris). Un fichier
 * manquant et introuvable dans Archives est saute. Le mode suit la
 * configuration des qu'un dossier de medias est coche.
 */
export function loadedState(base, report, projectPath, checked) {
    const s = JSON.parse(JSON.stringify(base || {}));
    s.trims = s.trims || {};
    let any = false;
    for (const f of report.folders || []) {
        const lists = MEDIA_FOLDERS[f.folder];
        if (!lists || !checked.includes(f.folder)) continue;
        any = true;
        for (const list of lists) {
            const kind = TRIM_OF_LIST[list];
            if (kind && s.trims[kind]) for (const p of s[list] || []) delete s.trims[kind][trimKey(p)];
            const items = (f.files || []).filter((x) => x.Liste === list && (x.status !== "missing" || x.archive))
                .sort((a, b) => a.Indice - b.Indice);
            s[list] = items.map((x) => joinPath(projectPath, f.folder, x.nom));
            if (!kind) continue;
            items.forEach((x, i) => {
                if (!Array.isArray(x.trim) || x.trim.length !== 2) return;
                s.trims[kind] = s.trims[kind] || {};
                s.trims[kind][trimKey(s[list][i])] = [x.trim[0], x.trim[1]];
            });
        }
    }
    if (any && report.mode) s.mode = report.mode === "FL2VA" ? "fl2va" : "ref2va";
    return s;
}

/** Load : fichiers a remettre en place depuis Archives (dossiers coches, sans doublon). */
export function restoreItems(report, checked) {
    const out = [];
    const seen = new Set();
    for (const f of report.folders || []) {
        if (!checked.includes(f.folder) || !(f.kind === "media" || f.kind === "workflow")) continue;
        for (const x of f.files || []) {
            const key = f.folder + "/" + String(x.nom).toLowerCase();
            if (x.status === "ok" || !x.archive || seen.has(key)) continue;
            seen.add(key);
            out.push({ folder: f.folder, archive: x.archive, nom: x.nom });
        }
    }
    return out;
}

/**
 * Fenetre de visualisation d'un dossier : fichiers de sa racine dans l'ordre
 * du Reference Loader, [{path, badge}] ; numeros de la premiere liste
 * (Images, Audio...), puis F / L (First / Last frame), puis les fichiers
 * sans numero (badge "") par nom.
 */
export function orderedFolderFiles(paths, refState, folder) {
    const lists = MEDIA_FOLDERS[folder] || [];
    const rank = new Map();
    lists.forEach((list, li) => {
        ((refState && refState[list]) || []).forEach((p, i) => {
            const key = normPath(p);
            const badge = list === "first_frame" ? "F" : list === "last_frame" ? "L" : String(i + 1);
            if (!rank.has(key)) rank.set(key, { order: li * 1000 + i, badge });
            else rank.get(key).badge += " · " + badge;
        });
    });
    const base = (p) => String(p).split(/[\\/]/).pop().toLowerCase();
    const items = paths.map((p) => Object.assign({ path: p }, rank.get(normPath(p)) || { order: Infinity, badge: "" }));
    items.sort((a, b) => (a.order === b.order ? 0 : a.order < b.order ? -1 : 1) || base(a.path).localeCompare(base(b.path)));
    return items.map((x) => ({ path: x.path, badge: x.badge }));
}

// Dossiers des Runs (choix utilisateur) : 04.Prompt = tous les Runs, 40 = videos, 60 = images.
export const RUN_FOLDERS = { "04.Prompt": null, "40.Rush Videos": "video", "60.Rush Images": "image" };

/** Date d'un JSON de Run "2026-10-17 15:06:41" -> "17/10/2026 15:06:41". */
export function runDateText(date) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(String(date || ""));
    return m ? m[3] + "/" + m[2] + "/" + m[1] + " " + m[4] : String(date || "");
}

/** Runs ayant au moins une sortie du type (null = tous), ordre garde. */
export function runsOfKind(runs, kind) {
    return (runs || []).filter((r) => !kind || (r.outputs || []).some((o) => o.kind === kind));
}

/** Texte du bouton 04 / 40 / 60 : "Last run: dd/MM/yyyy hh:mm:ss | Runs: n", "" sans Run. */
export function runSummary(runs, folder) {
    const list = runsOfKind(runs, RUN_FOLDERS[folder] || null);
    return list.length ? "Last run: " + runDateText(list[0].date) + " | Runs: " + list.length : "";
}

/** Fichier montre pour une sortie : video = copie de 40.Rush Videos, image = original ; "" si absent. */
export function outputFile(o) {
    if (!o) return "";
    if (o.kind === "video") return o.copy_exists ? o.copy : "";
    return o.source_exists ? o.source : "";
}

/**
 * Vignettes de 40.Rush Videos / 60.Rush Images (choix utilisateur) : seulement
 * les sorties citees par les JSON et presentes, [{file, run, output}], Run le
 * plus recent d'abord.
 */
export function rushItems(runs, folder) {
    const kind = RUN_FOLDERS[folder];
    const items = [];
    for (const run of runs || []) {
        for (const o of run.outputs || []) {
            const file = o.kind === kind ? outputFile(o) : "";
            if (file) items.push({ file, run, output: o });
        }
    }
    return items;
}

// Fenetres 02.Models / 06.LoRA (choix utilisateur, 18/10/2026) : un ensemble du
// registre par carte, ses prompts regroupes par texte identique, et l'autre
// registre des Runs du prompt choisi.
export const REGISTRY_FOLDERS = { "02.Models": "models", "06.LoRA": "lora" };
export const OTHER_REGISTRY = { models: "lora", lora: "models" };

/** Runs qui utilisent l'ensemble n du registre kind (ordre garde : plus recent d'abord). */
export function runsOfSet(runs, kind, index) {
    return (runs || []).filter((r) => ((r.sets || {})[kind] || []).includes(index));
}

/** Cartes de la colonne 1 : [{set, runs}] dans l'ordre du registre (numero croissant). */
export function setsWithRuns(registries, runs, kind) {
    return ((registries && registries[kind]) || []).map((set) => ({ set, runs: runsOfSet(runs, kind, set.index) }));
}

/** Prompts identiques (espaces autour ignores) regroupes : [{prompt, runs}], groupe du Run le plus recent d'abord. */
export function promptGroups(runs) {
    const groups = new Map();
    for (const r of runs || []) {
        const key = String(r.prompt == null ? "" : r.prompt).trim();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    }
    return [...groups].map(([prompt, list]) => ({ prompt, runs: list }));
}

/** Ensembles du registre kind utilises par ces Runs : [{index, count}] par numero ; index 0 = Runs sans ensemble. */
export function setsOfRuns(runs, kind) {
    const counts = new Map();
    for (const r of runs || []) {
        const list = (r.sets || {})[kind] || [];
        for (const n of list.length ? list : [0]) counts.set(n, (counts.get(n) || 0) + 1);
    }
    return [...counts].sort((a, b) => a[0] - b[0]).map(([index, count]) => ({ index, count }));
}

/** Texte des lignes 02 / 06 : "Sets: n | Last run: dd/MM/yyyy hh:mm:ss", "" sans ensemble. */
export function setSummary(registries, runs, folder) {
    const kind = REGISTRY_FOLDERS[folder];
    const sets = (registries && registries[kind]) || [];
    if (!sets.length) return "";
    const used = (runs || []).find((r) => ((r.sets || {})[kind] || []).length);
    return "Sets: " + sets.length + (used ? " | Last run: " + runDateText(used.date) : "");
}

/** Nom de l'onglet du workflow d'un Run : nom du JSON sans extension. */
export function runTabName(file) {
    return String(file || "run").replace(/\.json$/i, "");
}

/** Nom du nouvel onglet quand la structure du workflow differe : "<nom>-copie". */
export function copyTabName(name) {
    return String(name || "workflow").replace(/\.json$/i, "") + "-copie";
}

/**
 * Switch MultiIN-OUT (noeud de l'utilisateur) : index de l'entree qui alimente sa
 * sortie outSlot = entree n du groupe actif (widget "group" ; une entree select
 * reliee n'est connue qu'au Run, la pilule sert alors de repere). -1 sinon.
 */
export function switchSourceInput(node, outSlot) {
    if (!node || node.type !== "SwitchMultiInOut") return -1;
    const w = (node.widgets || []).find((x) => x.name === "group");
    const group = String((w && w.value) || "A").toLowerCase();
    return (node.inputs || []).findIndex((i) => i.name === group + (outSlot + 1));
}
