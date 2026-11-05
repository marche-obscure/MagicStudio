// Parties pures du noeud MagicStudio Image / Video Compare (31/10/2026) : etat, cote choisi, rideau,
// son, depots, etoile, lecteur. Aucun import ComfyUI : testable avec node.
// Les regles de parseState / chosenSide sont celles de compare.py (tests/compare_cases.json).
//     node --test tests/test_compare.mjs
export const COMPARE_CLASS = "MagicStudioCompare";
export const MODES = [["side", "Side by side"], ["lr", "Left Right"], ["rl", "Right Left"], ["ud", "Up Down"]];
export const DEFAULT_STATE = Object.freeze({
    version: 1, a: { path: "", kind: "" }, b: { path: "", kind: "" }, mode: "side", sync: true, star: "",
});
export const STAR_GOLD = "#ffca28";
export const STAR_TIP = "Preferred in a comparison";

const MODE_KEYS = MODES.map((m) => m[0]);

function sideState(raw) {
    raw = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return {
        path: typeof raw.path === "string" ? raw.path : "",
        kind: raw.kind === "image" || raw.kind === "video" ? raw.kind : "",
    };
}

/** Etat du widget state (texte JSON ou objet) avec les valeurs sures par defaut. */
export function parseState(text) {
    let raw = text;
    if (typeof raw === "string") {
        try { raw = JSON.parse(raw); } catch (e) { raw = {}; }
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) raw = {};
    return {
        version: 1,
        a: sideState(raw.a),
        b: sideState(raw.b),
        mode: MODE_KEYS.includes(raw.mode) ? raw.mode : "side",
        sync: typeof raw.sync === "boolean" ? raw.sync : true,
        star: raw.star === "A" || raw.star === "B" ? raw.star : "",
    };
}

/** Texte JSON de l'etat (relu par parseState). */
export function formatState(state) {
    return JSON.stringify(parseState(state));
}

/** Cote choisi : l'etoile s'il a une source, sinon A, sinon B ; null si aucune source. */
export function chosenSide(star, hasA, hasB) {
    const has = { A: !!hasA, B: !!hasB };
    if ((star === "A" || star === "B") && has[star]) return star;
    if (has.A) return "A";
    if (has.B) return "B";
    return null;
}

/** Type d'une entree branchee : video -> video ; frames -> image si 1 image, sinon video. */
export function inputKind({ video, frames, count } = {}) {
    if (video) return "video";
    if (frames) return count === 1 ? "image" : "video";
    return null;
}

/** Type impose par le premier cote present (A puis B) : "image", "video" ou "". wired = {A: type|null, B: type|null}. */
export function effectiveKind(state, wired) {
    const w = wired || {};
    const a = w.A || (state.a.path ? state.a.kind : "");
    if (a) return a;
    return w.B || (state.b.path ? state.b.kind : "") || "";
}

/** Un fichier de ce type peut-il etre pose ? {ok, text} avec les textes de l'interface. */
export function acceptKind(imposed, kind) {
    if (kind === "audio") return { ok: false, text: "Audio files cannot be compared" };
    if (kind !== "image" && kind !== "video") return { ok: false, text: "Only images and videos can be compared" };
    if (imposed === "video" && kind !== "video") return { ok: false, text: "Not a video: this is a video comparison" };
    if (imposed === "image" && kind !== "image") return { ok: false, text: "Not an image: this is an image comparison" };
    return { ok: true, text: "" };
}

/** Depot hors du cadre : premier cote libre (ni fichier ni entree branchee), A puis B ; null si pris. */
export function bodyDropSide(state, wired) {
    const w = wired || {};
    if (!w.A && !state.a.path) return "A";
    if (!w.B && !state.b.path) return "B";
    return null;
}

function bounds(rect) {
    const left = rect.left !== undefined ? rect.left : (rect.x || 0);
    const top = rect.top !== undefined ? rect.top : (rect.y || 0);
    return { left, top, width: rect.width || 1, height: rect.height || 1 };
}

/** Cote de la moitie du cadre sous la souris (side / lr : gauche = A ; rl : gauche = B ; ud : haut = A). */
export function halfSide(mode, rect, x, y) {
    const r = bounds(rect);
    if (mode === "ud") return y - r.top < r.height / 2 ? "A" : "B";
    const left = x - r.left < r.width / 2;
    if (mode === "rl") return left ? "B" : "A";
    return left ? "A" : "B";
}

/** Position du rideau (0 a 1) selon la souris ; 0.5 en side. */
export function wipePos(mode, rect, x, y) {
    if (mode === "side") return 0.5;
    const r = bounds(rect);
    const t = mode === "ud" ? (y - r.top) / r.height : (x - r.left) / r.width;
    return Math.min(1, Math.max(0, t));
}

const pct = (v) => String(Number(v.toFixed(2)));

/** clip-path de la couche A selon le mode et la position du rideau ("none" en side). */
export function clipA(mode, pos) {
    if (mode === "lr") return "inset(0 " + pct(100 - 100 * pos) + "% 0 0)";
    if (mode === "rl") return "inset(0 0 0 " + pct(100 * pos) + "%)";
    if (mode === "ud") return "inset(0 0 " + pct(100 - 100 * pos) + "% 0)";
    return "none";
}

/** Aide sous les modes. */
export function hintText(mode) {
    if (mode === "lr" || mode === "rl") return "↔ Hover to slide left / right";
    if (mode === "ud") return "↕ Hover to slide up / down";
    return "A left, B right";
}

/** Cote qui parle : celui sous la souris, sinon le cote etoile, sinon A. */
export function soundSide(hover, star) {
    return hover || star || "A";
}

/** Nouveau temps a imposer a l'autre cote si l'ecart depasse la tolerance, sinon null. */
export function syncFix(masterT, otherT, tol = 0.05) {
    return Math.abs(masterT - otherT) > tol ? masterT : null;
}

/** Temps apres un pas d'une image (1 / fps, 24 sans fps), borne a [0, duree]. */
export function frameStep(t, fps, dir, duration) {
    const step = 1 / (fps > 0 ? fps : 24);
    const next = t + dir * step;
    return Math.min(duration, Math.max(0, next));
}

/**
 * Bouton Sync visible ? Cache pour une comparaison d'images (kinds = types des cotes presents, tous
 * "image") ; visible (estompe) tant qu'aucun cote n'est rempli. Revue finale du 05/11/2026.
 */
export function syncShown(kinds) {
    const list = (kinds || []).filter((k) => k === "image" || k === "video");
    return !(list.length && list.every((k) => k === "image"));
}

/** Hauteur de l'interface : une barre de temps (Sync) ou deux. */
export function uiHeight(sync) {
    return sync ? 420 : 464;
}

/**
 * Plan d'un clic sur l'etoile du cote `side` : nouvelle etoile du noeud et fichiers a (de)marquer.
 * Une entree branchee ou un cote vide n'a pas de fichier (chaine vide).
 * Cote vide (ni fichier ni entree branchee) : rien ne change, rien n'est envoye (revue finale :
 * sinon l'etoile enregistree du fichier de l'autre cote etait retiree).
 */
export function starPlan(state, side, wired) {
    const w = wired || {};
    const file = (s) => (w[s] ? "" : state[s === "A" ? "a" : "b"].path || "");
    const mine = file(side);
    if (!w[side] && !mine) return { star: state.star, on: "", off: "" };
    if (state.star === side) return { star: "", on: "", off: mine };
    return { star: side, on: mine, off: file(side === "A" ? "B" : "A") };
}

/**
 * Etoile a l'ouverture : un seul fichier deja etoile dans le projet -> ce cote ; sinon l'etat du noeud.
 * placed = cote qui vient de recevoir un fichier : si les deux sont etoiles et que le noeud n'a plus
 * d'etoile (starAfterSet l'a retiree), elle revient sur ce cote (son fichier est etoile).
 */
export function initialStar(state, storedA, storedB, placed) {
    if (storedA && !storedB) return "A";
    if (storedB && !storedA) return "B";
    if (storedA && storedB && !state.star && (placed === "A" || placed === "B")) return placed;
    return state.star;
}

/**
 * Etoile du noeud quand un nouveau fichier est pose sur `side` : l'etoile appartient au fichier, elle
 * part avec l'ancien (initialStar la rend si le nouveau fichier est lui-meme etoile). Revue finale.
 */
export function starAfterSet(state, side) {
    return state.star === side ? "" : state.star;
}

/** Cle de comparaison d'un chemin (separateurs, casse Windows). */
export function starKey(p) {
    return String(p || "").replace(/[\\/]+/g, "/").toLowerCase();
}

/** Ensemble des fichiers etoiles (reponse de /mmproject/stars) ; liste absente ou invalide = ensemble vide. */
export function starSetOf(stars) {
    return new Set(Array.isArray(stars) ? stars.filter((p) => typeof p === "string" && p).map(starKey) : []);
}

/** Ce fichier est-il dans l'ensemble des etoiles ? */
export function isStarred(set, path) {
    return !!path && !!set && set.has(starKey(path));
}

/** Ferme les lecteurs des noeuds Compare (fichier verrouille sous Windows) ; renvoie leur nombre. */
export function releaseComparePlayers(nodes) {
    let n = 0;
    for (const node of nodes || []) {
        if (node && node.type === COMPARE_CLASS && typeof node.mmCompareRelease === "function") {
            node.mmCompareRelease();
            n++;
        }
    }
    return n;
}

/**
 * Lecteurs Compare de tout le graphe fermes (app.graph) : appele avant chaque deplacement, Swap,
 * archivage ou suppression de fichiers (revue finale du 05/11/2026).
 */
export function releaseComparePlayersOf(graph) {
    return releaseComparePlayers((graph && graph._nodes) || []);
}

/** Coin de l'etiquette A / B dans le cadre : "tl" (haut gauche), "tr" (haut droite), "bl" (bas gauche). */
export function tagCorner(mode, side) {
    if (mode === "ud") return side === "A" ? "tl" : "bl";
    if (mode === "rl") return side === "B" ? "tl" : "tr";
    return side === "A" ? "tl" : "tr";
}

/** Temps lisible du lecteur : "m:ss.d" (dixiemes) ; 0 pour une valeur invalide. */
export function timeText(t) {
    const v = Number.isFinite(t) && t > 0 ? t : 0;
    const tenths = Math.floor(v * 10 + 1e-6);
    const m = Math.floor(tenths / 600);
    const s = Math.floor((tenths % 600) / 10);
    return m + ":" + String(s).padStart(2, "0") + "." + (tenths % 10);
}

/** Cadence d'un cote : apercu de frames branchees = 24, sinon fps lu (/mmrefloader/info), sinon 24. */
export function sideFps(fromFrames, infoFps) {
    if (fromFrames) return 24;
    return Number(infoFps) > 0 ? Number(infoFps) : 24;
}
