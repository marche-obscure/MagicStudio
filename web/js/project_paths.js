// Regles des dossiers de projet, sans dependance a ComfyUI (testees par
// node --test tests/test_project_paths.mjs).
import { trimKey } from "./config_format.js";
import { FALLBACK_DESCRIPTION, variantOf, rowsOf, variantLimits, migrateState } from "./profiles.js";

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

// ---- Etat du RefLoader (variantes, 29/10/2026) : selections de chaque variante, lignes et
// dossiers lus dans la description (profiles.js). Toutes ces fonctions recoivent desc en
// dernier (absent : FALLBACK_DESCRIPTION).
const descOf = (desc) => (desc && desc.variants ? desc : FALLBACK_DESCRIPTION);

/** Dossier du projet d'une ligne d'une variante (description : folder), "" si aucun. */
export function rowFolder(desc, variant, rowId) {
    const r = rowsOf(descOf(desc), variant).find((x) => x.id === rowId);
    return (r && r.folder) || "";
}

const rowsIn = (state, v) => (((state && state.selections) || {})[v] || {}).rows || {};

/** Lignes de la variante affichee : [{variant, row}] dans l'ordre de la description. */
function shownRows(state, desc) {
    const d = descOf(desc);
    const v = variantOf(state, d);
    return rowsOf(d, v).map((row) => ({ variant: v, row }));
}

/** Lignes de toutes les variantes, la variante affichee d'abord. */
function everyRow(state, desc) {
    const d = descOf(desc);
    const v = variantOf(state, d);
    return [v].concat(Object.keys(d.variants).filter((x) => x !== v))
        .flatMap((x) => rowsOf(d, x).map((row) => ({ variant: x, row })));
}

/** Fichiers a copier par Save : [{path, folder}], lignes de la variante affichee dans leur ordre. */
export function saveItems(state, desc) {
    const items = [];
    for (const { variant, row } of shownRows(state, desc)) {
        for (const path of rowsIn(state, variant)[row.id] || []) items.push({ path, folder: row.folder });
    }
    return items;
}

/** Deplace la cle d'un fichier renomme dans une table {cle du chemin: valeur} (src lu, dst ecrit). */
function followKeys(src, dst, old, now) {
    old.forEach((p, i) => {
        const before = trimKey(p);
        const after = trimKey(now[i]);
        if (before === after || !(before in src)) return;
        dst[after] = src[before];
        delete dst[before];
    });
}

/**
 * Copie de l'etat du RefLoader avec chaque chemin de chaque variante remplace par
 * fn(chemin, ligne, variante) ; les cles de rognage et de moment suivent leur fichier.
 * Lignes de chaque variante dans l'ordre de la description (= ordre de saveItems).
 */
export function remapState(state, fn, desc) {
    const d = descOf(desc);
    const s = JSON.parse(JSON.stringify(state || {}));
    for (const [v, sel] of Object.entries((state && state.selections) || {})) {
        const out = s.selections[v];
        const rows = (sel && sel.rows) || {};
        const ids = d.variants[v] ? rowsOf(d, v).map((r) => r.id).filter((id) => id in rows) : [];
        for (const rid of Object.keys(rows)) if (!ids.includes(rid)) ids.push(rid);
        for (const rid of ids) {
            const old = rows[rid] || [];
            out.rows[rid] = old.map((p) => fn(p, rid, v));
            for (const table of ["trims", "moments"]) {
                if (sel[table] && sel[table][rid]) followKeys(sel[table][rid], out[table][rid], old, out.rows[rid]);
            }
        }
    }
    return s;
}

/**
 * fn pour remapState apres Save : dsts = destinations par position dans l'ordre de
 * saveItems ("" = fichier manquant, chemin garde). Par position et non par chemin : une
 * meme video peut aller dans 12.Video et dans 14.Video-Audio. Seule la variante affichee
 * recoit des destinations.
 */
export function mapBySequence(dsts, state, desc) {
    const v = variantOf(state, descOf(desc));
    let i = 0;
    return (p, rid, variant) => {
        if (variant !== v) return p;
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

/** Chemins (sans doublon, dans l'ordre) des lignes donnees qui vont dans ce dossier. */
function pathsOf(state, folder, pairs) {
    const out = [];
    const seen = new Set();
    for (const { variant, row } of pairs) {
        if (row.folder !== folder) continue;
        for (const p of rowsIn(state, variant)[row.id] || []) {
            if (seen.has(normPath(p))) continue;
            seen.add(normPath(p));
            out.push(p);
        }
    }
    return out;
}

/**
 * References des autres variantes qui vont dans ce dossier, [{path, folder}] sans celles
 * deja dans la variante affichee : la cloche les verifie aussi (une reference manquante
 * d'une autre variante bloque l'archivage), sans jamais les copier.
 */
export function hiddenFolderItems(state, folder, desc) {
    const v = variantOf(state, descOf(desc));
    const seen = new Set(folderPaths(state, folder, desc).map(normPath));
    return pathsOf(state, folder, everyRow(state, desc).filter((x) => x.variant !== v))
        .filter((p) => !seen.has(normPath(p))).map((path) => ({ path, folder }));
}

/** References de la variante affichee qui vont dans ce dossier (ordre des lignes, sans doublon). */
export function folderPaths(state, folder, desc) {
    return pathsOf(state, folder, shownRows(state, desc));
}

/** Instantane des dossiers suivis : {dossier: [chemins]} (Save, mise a jour). */
export function folderSnapshot(state, desc) {
    const snap = {};
    for (const f of UPDATE_FOLDERS) snap[f] = folderPaths(state, f, desc);
    return snap;
}

/**
 * Changements d'un dossier suivi : added = references de la variante affichee pas encore
 * dans <projet>/<dossier> ; removed = references de l'instantane qu'aucune variante
 * n'utilise plus (sans instantane, aucune). Les fichiers ne sont jamais effaces.
 */
export function folderChanges(state, folder, projectPath, snapshot, desc) {
    const current = folderPaths(state, folder, desc);
    const dir = normPath(projectPath + "/" + folder);
    const added = current.filter((p) => dirOf(p) !== dir);
    const now = new Set(pathsOf(state, folder, everyRow(state, desc)).map(normPath));
    const removed = Array.isArray(snapshot) ? snapshot.filter((p) => !now.has(normPath(p))) : [];
    return { added, removed };
}

/** fn pour remapState apres la mise a jour d'un dossier : seules les lignes de la variante affichee de ce dossier changent. */
export function mapFolderBySequence(folder, dsts, state, desc) {
    const d = descOf(desc);
    const v = variantOf(state, d);
    let i = 0;
    return (p, rid, variant) => {
        if (variant !== v || rowFolder(d, v, rid) !== folder) return p;
        const dst = dsts[i++];
        return dst || p;
    };
}

/** Etat sans les references gone dans les lignes (toutes variantes) rangees dans ce dossier. */
export function withoutFolderPaths(state, folder, gone, desc) {
    const s = JSON.parse(JSON.stringify(state || {}));
    for (const { variant, row } of everyRow(state, desc)) {
        const rows = rowsIn(s, variant);
        if (row.folder === folder && Array.isArray(rows[row.id])) rows[row.id] = withoutPaths(rows[row.id], gone);
    }
    return s;
}

/** Etat sans aucune reference (Reset du projet) : lignes, rognages et moments vides dans toutes les variantes. */
export function withoutReferences(state, desc) {
    const s = migrateState(JSON.parse(JSON.stringify(state || {})), descOf(desc));
    for (const sel of Object.values(s.selections)) {
        for (const rid of Object.keys(sel.rows)) sel.rows[rid] = [];
        for (const rid of Object.keys(sel.trims)) sel.trims[rid] = {};
        for (const rid of Object.keys(sel.moments)) sel.moments[rid] = {};
    }
    return s;
}

/**
 * Etat du RefLoader sans ses selections (fichiers, rognages, moments) : le contenu des
 * dossiers est suivi par leurs cloches, ce n'est pas une modification du workflow
 * (variante et limites restent : elles changent les sorties). Un ancien etat est d'abord
 * converti, pour comparer deux etats de la meme facon.
 */
export function withoutMedia(state, desc) {
    const s = migrateState(JSON.parse(JSON.stringify(state || {})), descOf(desc));
    delete s.selections;
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
 * Fichiers du dossier du projet qu'aucune ligne du RefLoader n'utilise, dans aucune
 * variante (une video peut servir de son seul, un fichier d'une autre variante reste) :
 * ils partent dans Archives.
 * cited = runSourcePaths(...) : les fichiers d'un Run ne sont jamais orphelins (26/10/2026).
 */
export function unusedProjectFiles(paths, state, cited = new Set()) {
    const used = new Set();
    for (const sel of Object.values((state && state.selections) || {})) {
        for (const list of Object.values((sel && sel.rows) || {})) for (const p of list || []) used.add(normPath(p));
    }
    return paths.filter((p) => !used.has(normPath(p)) && !cited.has(normPath(p)));
}

/** Chemins (normPath) des fichiers source de toutes les sorties des Runs (/mmproject/runs). */
export function runSourcePaths(runs) {
    const out = new Set();
    for (const r of runs || []) for (const o of (r && r.outputs) || []) if (o && o.source) out.add(normPath(o.source));
    return out;
}

/**
 * Maximum du RefLoader par dossier : somme des plafonds (variantLimits : description +
 * reglages du noeud) des lignes de la variante affichee rangees dans ce dossier ; 0 =
 * dossier sans ligne ("Not used").
 */
export function folderMax(state, desc) {
    const d = descOf(desc);
    const lim = variantLimits(state, d);
    const out = {};
    for (const f of UPDATE_FOLDERS) out[f] = 0;
    for (const { row } of shownRows(state, d)) if (row.folder in out) out[row.folder] += lim.counts[row.id] || 0;
    return out;
}

/**
 * "Use: x/y" d'un dossier (choix utilisateur) : x = fichiers du dossier utilises par les
 * lignes de la variante affichee, y = maximum du dossier (folderMax ; 0 = "Not used").
 * mode = libelle de la variante (Ref2VA, F2VA / FL2VA, LTX 2.3...).
 */
export function folderUse(paths, state, folder, desc) {
    const d = descOf(desc);
    const refs = new Set(folderPaths(state, folder, d).map(normPath));
    return {
        used: (paths || []).filter((p) => refs.has(normPath(p))).length,
        max: folderMax(state, d)[folder] || 0,
        mode: d.variants[variantOf(state, d)].label,
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

// Dossiers chargeables (une case chacun dans la fenetre Load).
export const LOADABLE_FOLDERS = ["00.Workflows", "08.Images", "10.Son", "12.Video", "14.Video-Audio"];

/** Ce que Save envoie pour la configuration du projet : toutes les variantes et celle affichee. */
export function configRefs(state, desc) {
    return { selections: JSON.parse(JSON.stringify((state && state.selections) || {})),
        variant: variantOf(state, descOf(desc)) };
}

function joinPath(dir, ...parts) {
    const sep = String(dir).includes("\\") || !String(dir).includes("/") ? "\\" : "/";
    return [String(dir).replace(/[\\/]+$/, ""), ...parts].join(sep);
}

/**
 * Load : etat du RefLoader avec, pour chaque dossier de medias coche, les lignes de toutes
 * les variantes rangees dans ce dossier remplacees par la configuration (Utilisations :
 * ordre des Indice, rognages et moments repris). Un fichier manquant et introuvable dans
 * Archives est saute. La variante affichee ne change pas (choix utilisateur).
 */
export function loadedState(base, report, projectPath, checked, desc) {
    const d = descOf(desc);
    const s = migrateState(JSON.parse(JSON.stringify(base || {})), d);
    const rowOfVariant = (v, rid) => (d.variants[v] ? rowsOf(d, v).find((r) => r.id === rid) : null);
    for (const f of report.folders || []) {
        if (!UPDATE_FOLDERS.includes(f.folder) || !checked.includes(f.folder)) continue;
        for (const v of Object.keys(d.variants)) {
            const sel = s.selections[v];
            for (const r of rowsOf(d, v)) {
                if (r.folder !== f.folder) continue;
                for (const p of sel.rows[r.id] || []) {
                    if (sel.trims[r.id]) delete sel.trims[r.id][trimKey(p)];
                    if (sel.moments[r.id]) delete sel.moments[r.id][trimKey(p)];
                }
                sel.rows[r.id] = [];
            }
        }
        const filled = new Map(); // "variante|ligne" -> [{i, path, u}]
        for (const x of f.files || []) {
            if (x.status === "missing" && !x.archive) continue;
            const path = joinPath(projectPath, f.folder, x.nom);
            for (const u of x.Utilisations || []) {
                const r = rowOfVariant(u.variante, u.ligne);
                if (!r || r.folder !== f.folder) continue;
                const key = u.variante + "|" + u.ligne;
                if (!filled.has(key)) filled.set(key, []);
                filled.get(key).push({ i: Number(u.Indice) || 0, path, u });
            }
        }
        for (const [key, items] of filled) {
            const [v, rid] = key.split("|");
            const r = rowOfVariant(v, rid);
            const sel = s.selections[v];
            items.sort((a, b) => a.i - b.i);
            const kept = items.slice(0, r.max);
            sel.rows[rid] = kept.map((x) => x.path);
            for (const x of kept) {
                if (r.trim && Array.isArray(x.u.trim) && x.u.trim.length === 2) {
                    sel.trims[rid] = sel.trims[rid] || {};
                    sel.trims[rid][trimKey(x.path)] = [x.u.trim[0], x.u.trim[1]];
                }
                if (r.moment && typeof x.u.moment === "number") {
                    sel.moments[rid] = sel.moments[rid] || {};
                    sel.moments[rid][trimKey(x.path)] = x.u.moment;
                }
            }
        }
    }
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
 * Fenetre de visualisation d'un dossier : fichiers de sa racine dans l'ordre du RefLoader,
 * [{path, badge}] ; lignes de la variante affichee rangees dans ce dossier : numero dans
 * la ligne, ou initiale de la ligne pour une ligne d'un seul fichier (F / L, S / V...),
 * puis les fichiers sans numero (badge "") par nom.
 */
export function orderedFolderFiles(paths, refState, folder, desc) {
    const rank = new Map();
    if (refState) {
        shownRows(refState, desc).filter((x) => x.row.folder === folder).forEach(({ variant, row }, li) => {
            (rowsIn(refState, variant)[row.id] || []).forEach((p, i) => {
                const key = normPath(p);
                const badge = row.max === 1 ? row.label.charAt(0).toUpperCase() : String(i + 1);
                if (!rank.has(key)) rank.set(key, { order: li * 1000 + i, badge });
                else rank.get(key).badge += " · " + badge;
            });
        });
    }
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
/**
 * Post-traitements (choix utilisateur 28/10/2026) : chaque sortie suivie de ses
 * post-traitements (post_of = index de la sortie source), en profondeur ; freres
 * par niveau, date puis index ; un post dont la source manque reste a la fin.
 */
export function orderOutputs(outs) {
    const list = outs || [];
    const byIndex = new Map(list.map((o) => [o.index, o]));
    const children = new Map();
    for (const o of list) {
        if (!o.post_level || !byIndex.has(o.post_of)) continue;
        if (!children.has(o.post_of)) children.set(o.post_of, []);
        children.get(o.post_of).push(o);
    }
    const rank = (a, b) => (a.post_level - b.post_level) || String(a.post_date || "").localeCompare(String(b.post_date || ""))
        || (a.index - b.index);
    const out = [];
    const seen = new Set();
    const visit = (o) => {
        if (seen.has(o)) return;
        seen.add(o);
        out.push(o);
        for (const c of (children.get(o.index) || []).sort(rank)) visit(c);
    };
    for (const o of list) if (!o.post_level) visit(o);
    for (const o of list) visit(o);
    return out;
}

/** Badge d'un post-traitement : « Post 1 », « Post 2 »… ; "" pour une sortie du Run. */
export function postLabel(o) {
    return o && o.post_level ? "Post " + o.post_level : "";
}

export function rushItems(runs, folder) {
    const kind = RUN_FOLDERS[folder];
    const items = [];
    for (const run of runs || []) {
        for (const o of orderOutputs(run.outputs)) {
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
 * utilisateur, 19/10/2026) : seulement les dossiers des lignes de la variante
 * (description : Ref2VA 08 a 14, F2VA / FL2VA 08, LTX 08 / 10 / 12) ; pas
 * d'Archives : bouton View archives.
 * Aussi <projet>/40.Rush Videos/Picture Lock/Extract Frame (26/10/2026) pour les
 * lignes d'images : kind = type de fichier de la ligne ("image"...), absent = accepte.
 * Et <projet>/90.Pick Up/Image | Son | Video (26/10/2026) : le sous-dossier du type de la ligne.
 */
export function isMediaSubfolder(path, variant, kind, desc) {
    const parts = String(path || "").split(/[\\/]+/).filter(Boolean);
    const n = parts.length;
    if ((n === 4 || n === 5) && parts.slice(n - 3).join("/") === EXTRACT_FRAME_DIR.join("/")) {
        return !kind || kind === "image";
    }
    if ((n === 3 || n === 4) && parts[n - 2] === PICKUP_DIR) {
        return kind ? parts[n - 1] === PICKUP_SUBS[kind] : Object.values(PICKUP_SUBS).includes(parts[n - 1]);
    }
    // Dossiers des lignes de la variante (description) ; sans variante : les quatre dossiers de medias.
    const allowed = variant ? [...new Set(rowsOf(descOf(desc), variant).map((r) => r.folder).filter(Boolean))]
        : UPDATE_FOLDERS;
    // Projet de la racine (P/08.Images) ou d'un dossier de projets (G/P/08.Images, 22/10/2026).
    return (n === 2 || n === 3) && allowed.includes(parts[n - 1]);
}

// --- Pick Up (26/10/2026) ------------------------------------------------------------------

/** Dossier propose pour enregistrer les Runs (= projects.PICKUP_DIR), sans ligne dans le noeud. */
export const PICKUP_DIR = "90.Pick Up";
/** Type de fichier -> sous-dossier de Pick Up (= projects.PICKUP_SUBS). */
export const PICKUP_SUBS = { image: "Image", audio: "Son", video: "Video" };

/** Chemin Windows du sous-dossier de Pick Up pour kind (icones du noeud Projet : copie du chemin). */
export function pickupPath(project, kind) {
    return String(project || "").replace(/[\\/]+$/, "") + "\\" + PICKUP_DIR + "\\" + PICKUP_SUBS[kind];
}

// --- Extract Frame (26/10/2026) ------------------------------------------------------------

/** Dossier des images extraites, sous le projet (= projects.EXTRACT_DIR). */
export const EXTRACT_FRAME_DIR = ["40.Rush Videos", "Picture Lock", "Extract Frame"];

/** Choix de la liste Select: de la fenetre Extract Frame ([valeur envoyee, texte]). */
export const EXTRACT_CHOICES = [["first", "First"], ["last", "Last"], ["fl", "FL-Frame"], ["n", "Frame-N"]];

/**
 * Numero de l'image affichee au temps t (s), a partir de 0, jamais hors de 0..total-1.
 * Marge de 1/1000 d'image : requestVideoFrameCallback donne le debut de l'image arrondi
 * a la microseconde (5/24 -> 0.208333 -> 4.999992 images), qui doit compter pour l'image 5.
 */
export function frameAt(time, fps, total) {
    const t = Number(time), f = Number(fps), tot = Math.floor(Number(total));
    if (!(t > 0) || !(f > 0) || !(tot > 0)) return 0;
    return Math.max(0, Math.min(tot - 1, Math.floor(t * f + 1e-3)));
}

/** Temps (s) du milieu de l'image n : un saut a ce temps affiche bien l'image n. */
export function timeOf(frame, fps) {
    const f = Number(fps);
    return f > 0 ? (Math.max(0, Number(frame) || 0) + 0.5) / f : 0;
}

/** Extensions video du Picture Lock (= run_record.VIDEO_EXTS). */
export const LOCK_VIDEO_EXTS = [".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v"];

/**
 * Bouton Extract Frame de l'en-tete de la fenetre 40 (26/10/2026, choix utilisateur) :
 * locked = /mmproject/runs `locked` ({video: [noms des fichiers de 40/Picture Lock]}),
 * overfull = /mmproject/runs `overfull`. "disabled" : plus d'un fichier ; "enabled" :
 * une seule video (meme deposee a la main) ; "hidden" : vide ou un seul fichier non video.
 */
export function extractHeaderState(locked, overfull) {
    const names = (locked && Array.isArray(locked.video)) ? locked.video : [];
    if (names.length > 1 || (overfull && Number(overfull.video) > 1)) return "disabled";
    if (names.length !== 1) return "hidden";
    const n = String(names[0]).toLowerCase();
    return LOCK_VIDEO_EXTS.some((e) => n.endsWith(e)) ? "enabled" : "hidden";
}

/** Compteur de la fenetre Extract Frame : "Frame n / total". */
export function frameText(n, total) {
    return "Frame " + n + " / " + total;
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
