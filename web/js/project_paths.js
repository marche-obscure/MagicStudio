// Regles des dossiers de projet, sans dependance a ComfyUI (testees par
// node --test tests/test_project_paths.mjs).
import { trimKey } from "./config_format.js";
import { profileOf, limitsOf, LABELS } from "./profiles.js";

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
    // Profil LTX 2.x
    guide_images: "08.Images", guide_video: "12.Video", soundtrack: "10.Son", voice: "10.Son",
};
const LISTS = Object.keys(LIST_FOLDERS);
// Liste -> type de rognage (cle de state.trims).
const TRIM_OF_LIST = {
    videos: "video", video_audios: "video_audio", audios: "audio",
    guide_video: "guide_video", soundtrack: "soundtrack", voice: "voice",
};
// Liste -> moments des guides LTX 2.x (cle de state.moments).
const MOMENT_LISTS = ["guide_images", "guide_video"];
// Listes de chaque profil (l'etat garde les deux jeux ; seul le profil actif sert).
const PROFILE_LISTS = {
    minimax_h3: ["images", "videos", "video_audios", "audios", "first_frame", "last_frame"],
    ltx2: ["guide_images", "guide_video", "soundtrack", "voice"],
};

/**
 * Listes du profil actif, dans l'ordre des listes : Save, cloches, compteurs et
 * configuration du projet. L'archivage (unusedProjectFiles) regarde les deux profils.
 */
export function activeLists(state) {
    return PROFILE_LISTS[profileOf(state)];
}

/** Fichiers a copier par Save : [{path, folder}] dans l'ordre des listes du profil actif. */
export function saveItems(state) {
    const items = [];
    for (const list of activeLists(state)) {
        for (const path of state[list] || []) items.push({ path, folder: LIST_FOLDERS[list] });
    }
    return items;
}

/**
 * Copie de l'etat du Ref Loader avec chaque chemin des listes remplace par
 * fn(chemin, liste) ; les cles de rognage et de moment suivent leur fichier.
 */
export function remapState(state, fn) {
    const s = JSON.parse(JSON.stringify(state));
    // Deplace la cle d'un fichier renomme dans une table {cle du chemin: valeur}.
    const follow = (src, dst, old, now) => {
        old.forEach((p, i) => {
            const before = trimKey(p);
            const after = trimKey(now[i]);
            if (before === after || !(before in src)) return;
            dst[after] = src[before];
            delete dst[before];
        });
    };
    for (const list of LISTS) {
        const old = state[list] || [];
        s[list] = old.map((p) => fn(p, list));
        const kind = TRIM_OF_LIST[list];
        if (kind && state.trims && state.trims[kind]) follow(state.trims[kind], s.trims[kind], old, s[list]);
        if (MOMENT_LISTS.includes(list) && state.moments && state.moments[list]) {
            follow(state.moments[list], s.moments[list], old, s[list]);
        }
    }
    return s;
}

/**
 * fn pour remapState apres Save : destinations dans l'ordre de saveItems()
 * ("" = fichier manquant, chemin garde). Par position et non par chemin :
 * une meme video peut aller dans 12.Video et dans 14.Video-Audio.
 * state : seules les listes de son profil actif recoivent une destination.
 */
export function mapBySequence(dsts, state) {
    const lists = state ? activeLists(state) : null;
    let i = 0;
    return (p, list) => {
        if (lists && !lists.includes(list)) return p;
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

function pathsOf(state, folder, lists) {
    const out = [];
    for (const list of lists) {
        if (LIST_FOLDERS[list] !== folder) continue;
        for (const p of state[list] || []) if (!out.includes(p)) out.push(p);
    }
    return out;
}

/**
 * References du profil cache qui vont dans ce dossier, [{path, folder}] sans celles
 * deja dans le profil actif : la cloche les verifie aussi (une reference manquante
 * du profil cache bloque l'archivage), sans jamais les copier.
 */
export function hiddenFolderItems(state, folder) {
    const active = activeLists(state);
    const seen = new Set(pathsOf(state, folder, active).map(normPath));
    const out = [];
    for (const p of pathsOf(state, folder, LISTS.filter((l) => !active.includes(l)))) {
        if (seen.has(normPath(p))) continue;
        seen.add(normPath(p));
        out.push({ path: p, folder });
    }
    return out;
}

/** References du profil actif du Ref Loader qui vont dans ce dossier (ordre des listes, sans doublon). */
export function folderPaths(state, folder) {
    return pathsOf(state, folder, activeLists(state));
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
    // Retiree = plus dans aucune liste (un fichier du profil cache n'est pas retire).
    const now = new Set(pathsOf(state, folder, LISTS).map(normPath));
    const removed = Array.isArray(snapshot) ? snapshot.filter((p) => !now.has(normPath(p))) : [];
    return { added, removed };
}

/** fn pour remapState apres la mise a jour d'un dossier : seules ses listes (du profil actif de state) changent. */
export function mapFolderBySequence(folder, dsts, state) {
    const lists = state ? activeLists(state) : null;
    let i = 0;
    return (p, list) => {
        if (LIST_FOLDERS[list] !== folder || (lists && !lists.includes(list))) return p;
        const d = dsts[i++];
        return d || p;
    };
}

/**
 * Etat du Ref Loader sans ses listes, rognages ni moments : le contenu des dossiers
 * est suivi par leurs cloches, ce n'est pas une modification du workflow
 * (profil et limites restent : ils changent les sorties).
 */
export function withoutMedia(state) {
    const s = Object.assign({}, state);
    for (const list of LISTS) delete s[list];
    delete s.trims;
    delete s.moments;
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
 * n'utilise (toutes les listes des deux profils : une video peut servir de
 * son seul, un fichier du profil cache reste) : ils partent dans Archives.
 */
export function unusedProjectFiles(paths, state) {
    const used = new Set();
    for (const list of LISTS) for (const p of state[list] || []) used.add(normPath(p));
    return paths.filter((p) => !used.has(normPath(p)));
}

/**
 * Maximum du Reference Loader par dossier, lu dans ses limites (limitsOf : defauts
 * du profil + reglages du noeud). MiniMax : 08 = Images (Ref2VA) ou premiere +
 * derniere image (FL2VA), 10 / 12 / 14 = sons / videos / videos avec son.
 * LTX 2.x : 08 = images guides, 10 = bande-son + voix, 12 = video guide, 14 = 0.
 */
export function folderMax(state, defaults) {
    const lim = limitsOf(state, defaults);
    if (profileOf(state) === "ltx2") {
        return { "08.Images": lim.guide_image, "10.Son": lim.soundtrack + lim.voice, "12.Video": lim.guide_video,
            "14.Video-Audio": 0 };
    }
    const fl = !!state && state.mode === "fl2va";
    return { "08.Images": fl ? lim.first_frame + lim.last_frame : lim.image, "10.Son": lim.audio,
        "12.Video": lim.video, "14.Video-Audio": lim.video_audio };
}

// Listes comptees par "Use: x/y" : [mode ou profil][dossier].
const USE_LISTS = {
    ref2va: { "08.Images": ["images"], "10.Son": ["audios"], "12.Video": ["videos"], "14.Video-Audio": ["video_audios"] },
    fl2va: { "08.Images": ["first_frame", "last_frame"], "10.Son": ["audios"], "12.Video": ["videos"],
        "14.Video-Audio": ["video_audios"] },
    ltx2: { "08.Images": ["guide_images"], "10.Son": ["soundtrack", "voice"], "12.Video": ["guide_video"],
        "14.Video-Audio": [] },
};

/**
 * "Use: x/y" d'un dossier (choix utilisateur) : x = fichiers du dossier
 * utilises par les listes du profil et du mode actuels, y = maximum du dossier
 * (folderMax ; 0 = dossier non utilise : 14.Video-Audio en LTX 2.x).
 * mode = "Ref2VA", "FL2VA" ou "LTX 2.x".
 */
export function folderUse(paths, state, folder, defaults) {
    const ltx = profileOf(state) === "ltx2";
    const fl = !!state && state.mode === "fl2va";
    const key = ltx ? "ltx2" : fl ? "fl2va" : "ref2va";
    const refs = new Set();
    for (const list of USE_LISTS[key][folder] || []) for (const p of (state && state[list]) || []) refs.add(normPath(p));
    return {
        used: (paths || []).filter((p) => refs.has(normPath(p))).length,
        max: folderMax(state, defaults)[folder] || 0,
        mode: ltx ? LABELS.ltx2 : fl ? "FL2VA" : "Ref2VA",
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

/** Le mode (ou "ltx2") a-t-il au moins une reference (une configuration a sauvegarder) ? */
export function modeHasRefs(state, mode) {
    const n = (k) => (state[k] || []).length;
    if (mode === "ltx2") return PROFILE_LISTS.ltx2.some((k) => n(k) > 0);
    return mode === "fl2va" ? n("first_frame") + n("last_frame") > 0
        : n("images") + n("videos") + n("video_audios") + n("audios") > 0;
}

/**
 * Nom d'une configuration enregistree par Save : yyyyMMdd-HHmmss_MODE_minimax_config.json
 * (mode "ltx2" : yyyyMMdd-HHmmss_LTX2_magicstudio_config.json).
 */
export function configFileName(date, mode) {
    const p = (n) => String(n).padStart(2, "0");
    const stamp = date.getFullYear() + p(date.getMonth() + 1) + p(date.getDate()) + "-" +
        p(date.getHours()) + p(date.getMinutes()) + p(date.getSeconds());
    if (mode === "ltx2") return stamp + "_LTX2_magicstudio_config.json";
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
        // Data only avec une autre structure (cloche rouge, 22/10/2026) : chemin du projet.
        wfRed: str(data.wfRed),
    };
}

// ---- Configuration du projet (99.Project-Config) : Load / Save ----

// Dossiers des listes du Ref Loader, deux profils (meme table que project_config.MEDIA en Python).
export const MEDIA_FOLDERS = {
    "08.Images": ["images", "first_frame", "last_frame", "guide_images"],
    "10.Son": ["audios", "soundtrack", "voice"],
    "12.Video": ["videos", "guide_video"],
    "14.Video-Audio": ["video_audios"],
};
// Dossiers chargeables (une case chacun dans la fenetre Load).
export const LOADABLE_FOLDERS = ["00.Workflows", "08.Images", "10.Son", "12.Video", "14.Video-Audio"];

/**
 * Listes du Ref Loader envoyees a Save (chemins des fichiers du projet), des deux
 * profils : build_config indexe celles du profil actif, les fichiers de l'autre
 * profil restent sans indice (pas une erreur).
 */
export function configRefs(state) {
    const out = {};
    for (const lists of Object.values(MEDIA_FOLDERS)) for (const list of lists) out[list] = (state[list] || []).slice();
    return out;
}

function joinPath(dir, ...parts) {
    const sep = String(dir).includes("\\") || !String(dir).includes("/") ? "\\" : "/";
    return [String(dir).replace(/[\\/]+$/, ""), ...parts].join(sep);
}

/**
 * Load : etat du Ref Loader avec les listes des dossiers coches remplacees
 * par la configuration (ordre des indices, rognages et moments repris). Un
 * fichier manquant et introuvable dans Archives est saute. Seules les listes
 * du profil de la configuration changent (sans profile : MiniMax H3) ; le
 * profil et le mode suivent la configuration des qu'un dossier de medias est coche.
 */
export function loadedState(base, report, projectPath, checked) {
    const s = JSON.parse(JSON.stringify(base || {}));
    s.trims = s.trims || {};
    const prof = report.profile === "ltx2" ? "ltx2" : "minimax_h3";
    let any = false;
    for (const f of report.folders || []) {
        const lists = MEDIA_FOLDERS[f.folder];
        if (!lists || !checked.includes(f.folder)) continue;
        any = true;
        for (const list of lists.filter((l) => PROFILE_LISTS[prof].includes(l))) {
            const kind = TRIM_OF_LIST[list];
            if (kind && s.trims[kind]) for (const p of s[list] || []) delete s.trims[kind][trimKey(p)];
            const moments = MOMENT_LISTS.includes(list);
            if (moments && s.moments && s.moments[list]) for (const p of s[list] || []) delete s.moments[list][trimKey(p)];
            const items = (f.files || []).filter((x) => x.Liste === list && (x.status !== "missing" || x.archive))
                .sort((a, b) => a.Indice - b.Indice);
            s[list] = items.map((x) => joinPath(projectPath, f.folder, x.nom));
            items.forEach((x, i) => {
                if (kind && Array.isArray(x.trim) && x.trim.length === 2) {
                    s.trims[kind] = s.trims[kind] || {};
                    s.trims[kind][trimKey(s[list][i])] = [x.trim[0], x.trim[1]];
                }
                if (moments && typeof x.moment === "number") {
                    s.moments = s.moments || {};
                    s.moments[list] = s.moments[list] || {};
                    s.moments[list][trimKey(s[list][i])] = x.moment;
                }
            });
        }
    }
    if (any) s.profile = prof;
    if (any && prof === "minimax_h3" && report.mode) s.mode = report.mode === "FL2VA" ? "fl2va" : "ref2va";
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
    // Listes du profil actif ; LTX 2.x : S / V = bande-son / voix.
    const active = activeLists(refState);
    const lists = (MEDIA_FOLDERS[folder] || []).filter((l) => active.includes(l));
    const LETTERS = { first_frame: "F", last_frame: "L", soundtrack: "S", voice: "V" };
    const rank = new Map();
    lists.forEach((list, li) => {
        ((refState && refState[list]) || []).forEach((p, i) => {
            const key = normPath(p);
            const badge = LETTERS[list] || String(i + 1);
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

// Tri des fichiers de 40 / 60 (choix utilisateur, 19/10/2026) : [cle, bouton, sous-dossier] ;
// Picture Lock, Rough Cut, Footage, No Good (choix utilisateur, 22/10/2026 ; cles d'avant gardees).
export const SORT_FOLDERS = [["picture_lock", "Picture Lock", "Picture Lock"], ["validated", "Rough Cut", "Rough Cut"],
    ["footage", "Footage", "Footage"], ["rejected", "No Good", "No Good"]];
const SORT_KEYS = SORT_FOLDERS.map((x) => x[0]);

/** Pastille d'une sortie : sous-dossier de l'original s'il est dans le projet, sinon "outside". */
export function sortDot(o) {
    return o && o.in_project && SORT_KEYS.includes(o.place) ? o.place : "outside";
}

/**
 * Boutons de tri actifs d'une sortie : tous si l'original existe hors du projet
 * (rapatriement), sinon tous sauf le sous-dossier du fichier ; aucun sans fichier.
 */
export function sortTargets(o) {
    if (!o) return [];
    if (o.source_exists && !o.in_project) return SORT_KEYS.slice();
    if (!outputFile(o)) return [];
    return SORT_KEYS.filter((k) => k !== o.place);
}

/**
 * Boutons de tri pour les fichiers coches (choix utilisateur, 20/10/2026) : un
 * dossier est actif si au moins un fichier coche peut y aller. singleLock (projet
 * d'un MultiProject, 22/10/2026) : Picture Lock seulement pour un seul fichier coche.
 */
export function batchSortTargets(outs, singleLock) {
    const keys = new Set((outs || []).flatMap((o) => sortTargets(o)));
    if (singleLock && (outs || []).length > 1) keys.delete("picture_lock");
    return SORT_KEYS.filter((k) => keys.has(k));
}

/** Sortie supprimable par le bouton Delete : fichier present dans No Good. */
export function canDeleteRush(o) {
    return sortDot(o) === "rejected" && !!outputFile(o);
}

/** Marque "deleted" d'une sortie : "Deleted (Recycle Bin) – dd/MM/yyyy hh:mm:ss", "" sans marque. */
export function deletedText(d) {
    if (!d || typeof d !== "object") return "";
    const m = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/.exec(String(d.date || ""));
    const when = m ? m[3] + "/" + m[2] + "/" + m[1] + " " + m[4] + ":" + m[5] + ":" + m[6] : String(d.date || "");
    return (d.how === "trash" ? "Deleted (Recycle Bin)" : "Deleted permanently") + (when ? " – " + when : "");
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

// Tri par date des fenetres des dossiers (choix utilisateur, 19/10/2026) :
// "desc" = plus recent d'abord (defaut), "asc" = plus ancien d'abord.
/** Liste deja du plus recent au plus ancien (Runs, prompts), dans l'ordre demande. */
export function inDateOrder(list, order) {
    const l = list || [];
    return order === "asc" ? [...l].reverse() : l;
}

/** Cartes 02 / 06 : par date de leur dernier Run ; ensembles sans Run a la fin, par numero. */
export function orderSetCards(cards, order) {
    const used = (cards || []).filter((c) => c.runs.length);
    const unused = (cards || []).filter((c) => !c.runs.length);
    const date = (c) => String(c.runs[0].date || "");
    used.sort((a, b) => (date(a) < date(b) ? 1 : date(a) > date(b) ? -1 : a.set.index - b.set.index));
    return inDateOrder(used, order).concat(unused);
}

/**
 * Fenetres 08 a 14 : [{path, badge}] ; fichiers numerotes (utilises par le Ref
 * Loader) en tete dans leur ordre (choix utilisateur), les autres par date de
 * modification (mtimes {chemin: secondes}).
 */
export function orderByMtime(items, mtimes, order) {
    const t = (p) => (mtimes && typeof mtimes[p] === "number" ? mtimes[p] : 0);
    const base = (p) => String(p).split(/[\\/]/).pop().toLowerCase();
    const fixed = (items || []).filter((x) => x.badge);
    const rest = (items || []).filter((x) => !x.badge);
    rest.sort((a, b) => (t(b.path) - t(a.path)) || base(a.path).localeCompare(base(b.path)));
    return fixed.concat(inDateOrder(rest, order));
}

// Filtre par pastille des fenetres 40 / 60 (choix utilisateur, 19/10/2026), dans
// l'ordre du filtre : dore (Picture Lock, 22/10/2026), vert, orange, rouge, gris.
export const DOT_FILTER = ["picture_lock", "validated", "footage", "rejected", "outside"];

/** Vignettes [{file, run, output}] dont la pastille est active ; aucune active = toutes. */
export function filterByDot(items, active) {
    if (!active || !active.size) return items || [];
    return (items || []).filter((it) => active.has(sortDot(it.output)));
}

/** Nombre de vignettes par pastille : {picture_lock, validated, footage, rejected, outside}. */
export function dotCounts(items) {
    const out = Object.fromEntries(DOT_FILTER.map((k) => [k, 0]));
    for (const it of items || []) out[sortDot(it.output)] += 1;
    return out;
}

/**
 * Vignettes de 40 / 60 groupees par pastille (choix utilisateur, 19/10/2026) :
 * vert, orange, rouge, gris ; l'ordre recu (date) est garde dans chaque groupe.
 */
export function groupByDot(items) {
    const rank = (it) => DOT_FILTER.indexOf(sortDot(it.output));
    return (items || []).map((it, i) => [it, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0]);
}

/** Cle stable d'une vignette de 40 / 60 (le chemin change quand le fichier est range) : Run + sortie. */
export function rushKey(it) {
    return it ? (it.run && it.run.file) + "#" + (it.output && it.output.index) : "";
}

/**
 * Fichier introuvable apres un renommage de dossier hors de ComfyUI (choix
 * utilisateur, 19/10/2026) : chemins a essayer sous le nouveau Root folder,
 * en gardant les maxDepth derniers elements du chemin, puis moins (au moins
 * le dossier parent et le nom). Ex. ...\Ancien\Projet\08.Images\a.png ->
 * <root>\Projet\08.Images\a.png, puis <root>\08.Images\a.png.
 */
export function relinkCandidates(path, root, maxDepth = 4) {
    const parts = String(path || "").split(/[\\/]+/).filter(Boolean);
    const base = String(root || "").replace(/[\\/]+$/, "");
    if (!base || parts.length < 2) return [];
    const sep = base.includes("\\") || !base.includes("/") ? "\\" : "/";
    const norm = (p) => p.replace(/\\/g, "/").toLowerCase();
    const out = [];
    for (let k = Math.min(maxDepth, parts.length - 1); k >= 2; k--) {
        const c = base + sep + parts.slice(-k).join(sep);
        if (norm(c) !== norm(String(path)) && !out.includes(c)) out.push(c);
    }
    return out;
}

/** Liste du Ref Loader sans les chemins de 'gone' (comparaison sans casse) ; rognages nettoyes par remapState. */
export function withoutPaths(paths, gone) {
    const g = new Set((gone || []).map((p) => String(p).replace(/\\/g, "/").toLowerCase()));
    return (paths || []).filter((p) => !g.has(String(p).replace(/\\/g, "/").toLowerCase()));
}

/**
 * Root folder ancre sur le dossier mere (choix utilisateur, 22/10/2026) : prefix =
 * ancienne racine relative a la nouvelle ("Groupe" ou "Groupe/Projet"). Sous-dossiers
 * de la galerie (subs, relatifs a la racine) prefixes pour rester au meme endroit ;
 * un type avec son propre dossier (folders[k]) n'est pas touche.
 */
export function anchoredSubs(subs, folders, prefix) {
    const out = { ...(subs || {}) };
    if (!prefix) return out;
    for (const k of ["image", "video", "audio"]) {
        if (folders && folders[k]) continue;
        const v = String(out[k] || "");
        out[k] = v ? prefix + "/" + v : prefix;
    }
    return out;
}

/** Nom (list_projects) du projet dont le dossier est path, sinon "". */
export function projectNameOfPath(root, names, path) {
    const norm = (p) => String(p || "").replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "").toLowerCase();
    const want = norm(path);
    return (names || []).find((n) => norm(String(root || "") + "/" + n) === want) || "";
}

/**
 * Filtre "Project" de la galerie du Ref Loader (choix utilisateur, 19/10/2026) :
 * sous-dossiers (chemins relatifs au Root folder) du projet choisi ; "" = All.
 */
export function inProjectFilter(path, project) {
    if (!project) return true;
    const p = String(path || "").replace(/\\/g, "/").toLowerCase();
    const n = String(project).toLowerCase();
    return p === n || p.startsWith(n + "/");
}

/**
 * Nom d'un sous-dossier dans la liste Subfolder (choix utilisateur, 22/10/2026) :
 * relatif au choix Project / Sub-project ("G/P/08.Images" -> "08.Images" pour "G/P",
 * "P/08.Images" pour "G") ; chemin entier pour All ou hors du choix.
 */
export function subfolderLabel(path, project) {
    const p = String(path || "").replace(/\\/g, "/");
    if (!project) return p;
    const n = String(project).replace(/\\/g, "/");
    return p.toLowerCase().startsWith(n.toLowerCase() + "/") ? p.slice(n.length + 1) : p;
}

/** MultiProject commun a deux projets "G/A" et "G/B" (meme projet mere), sinon "". */
export function sameGroup(a, b) {
    const group = (n) => {
        const s = String(n || "");
        return s.includes("/") ? s.slice(0, s.lastIndexOf("/")) : "";
    };
    const g = group(a);
    return g && g.toLowerCase() === group(b).toLowerCase() && String(a).toLowerCase() !== String(b).toLowerCase() ? g : "";
}

/**
 * Load "Data only" (choix utilisateur, 22/10/2026) : copie de current (workflow de
 * l'onglet) ou chaque noeud de meme numero et de meme type que dans saved prend ses
 * valeurs (widgets_values, widgets_values_named) ; les autres gardent les leurs.
 */
export function mergeData(current, saved) {
    const out = JSON.parse(JSON.stringify(current || {}));
    const byId = new Map(((saved && saved.nodes) || []).filter((n) => n && n.id != null).map((n) => [String(n.id), n]));
    for (const n of out.nodes || []) {
        const src = n && byId.get(String(n.id));
        if (!src || src.type !== n.type) continue;
        if ("widgets_values" in src) n.widgets_values = JSON.parse(JSON.stringify(src.widgets_values));
        if ("widgets_values_named" in src) n.widgets_values_named = JSON.parse(JSON.stringify(src.widgets_values_named));
        else delete n.widgets_values_named;
    }
    return out;
}

export function filterSubfolders(entries, project) {
    return (entries || []).filter((e) => inProjectFilter(e.path, project));
}

/**
 * Sous-dossier de la galerie quand elle montre le dossier des projets (choix
 * utilisateur, 19/10/2026) : seulement <projet>/08.Images ... 14.Video-Audio
 * en Ref2VA, seulement <projet>/08.Images en F2VA / FL2VA, 08.Images, 10.Son et
 * 12.Video en LTX 2.x (mode "ltx2") ; pas d'Archives : bouton View archives.
 */
export function isMediaSubfolder(path, mode) {
    const parts = String(path || "").split(/[\\/]+/).filter(Boolean);
    const allowed = mode === "fl2va" ? ["08.Images"] : mode === "ltx2" ? ["08.Images", "10.Son", "12.Video"] : UPDATE_FOLDERS;
    // Projet de la racine (P/08.Images) ou d'un dossier de projets (G/P/08.Images, 22/10/2026).
    return (parts.length === 2 || parts.length === 3) && allowed.includes(parts[parts.length - 1]);
}

/**
 * Duree d'un Run (secondes) : "45 s", "3 min 07 s", "1 h 02 min 05 s" ;
 * "" si absente (anciens Runs).
 */
export function durationText(seconds) {
    if (seconds === null || seconds === undefined || seconds === "") return "";
    const n = Number(seconds);
    if (!Number.isFinite(n) || n < 0) return "";
    const t = Math.round(n), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const two = (v) => String(v).padStart(2, "0");
    if (h) return h + " h " + two(m) + " min " + two(s) + " s";
    if (m) return m + " min " + two(s) + " s";
    return s + " s";
}
