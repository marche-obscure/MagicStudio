// Archives des listes d'images du modele Image : fonctions pures (sans ComfyUI, testees par
// tests/test_image_lists.mjs). Le serveur (image_lists.py) fait foi pour le format et les chemins.

export const IMAGE_VARIANT = "image.basic";
export const ROW_ID = "images";
export const MAX_IMAGES = 15;

// Corps des icones (dessinees par svg() de minimax_ref_loader.js) : boite d'archive et liste.
export const ARCHIVE_ICON_BODY = '<rect x="2" y="3" width="20" height="5" rx="1"></rect>' +
    '<path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"></path><line x1="10" y1="12" x2="14" y2="12"></line>';
export const LISTS_ICON_BODY = '<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line>' +
    '<line x1="8" y1="18" x2="21" y2="18"></line><circle cx="3.5" cy="6" r="1"></circle>' +
    '<circle cx="3.5" cy="12" r="1"></circle><circle cx="3.5" cy="18" r="1"></circle>';

/** Dossier et nom d'un chemin (separateurs / ou \). */
export function splitPath(path) {
    const s = String(path || "");
    const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
    return { dir: i < 0 ? "" : s.slice(0, i), name: s.slice(i + 1) };
}

/** "yyyyMMdd-HHmmss" -> "yyyy-MM-dd HH:mm:ss" (secours quand l'archive n'a pas de date). */
export function stampDate(stamp) {
    const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(stamp || "");
    return m ? m[1] + "-" + m[2] + "-" + m[3] + " " + m[4] + ":" + m[5] + ":" + m[6] : "";
}

/**
 * Lignes de la fenetre Lists : la plus recente d'abord (date du nom de fichier), texte
 * "yyyy-MM-dd HH:mm:ss · nom · n images". La liste d'entree n'est pas modifiee.
 */
export function archiveRows(list) {
    const rows = (list || []).map((e) => {
        const n = (e.images || []).length;
        const date = e.date || stampDate(e.stamp);
        return Object.assign({}, e, {
            count: n,
            missingCount: (e.missing || []).length,
            text: date + " · " + e.name + " · " + n + " image" + (n === 1 ? "" : "s"),
        });
    });
    rows.sort((a, b) => (a.stamp === b.stamp ? (a.file < b.file ? 1 : a.file > b.file ? -1 : 0)
        : a.stamp < b.stamp ? 1 : -1));
    return rows;
}

/** Ce que Load met dans la liste : images presentes seulement, coupees a max ; manquantes a signaler. */
export function loadPlan(entry, max) {
    const gone = new Set((entry && entry.missing) || []);
    const all = ((entry && entry.images) || []);
    const images = all.filter((p) => !gone.has(p));
    return { images: images.slice(0, max), missing: all.filter((p) => gone.has(p)) };
}

/** Liste d'images de la variante Image dans l'etat du RefLoader (tableau vide s'il n'y en a pas). */
export function imagesOfState(state) {
    const sel = state && state.selections && state.selections[IMAGE_VARIANT];
    return (sel && sel.rows && Array.isArray(sel.rows[ROW_ID])) ? sel.rows[ROW_ID].slice() : [];
}

/** Remplace la liste d'images de la variante Image seulement (rien d'autre ne change). */
export function withImages(state, images) {
    state.selections = state.selections || {};
    const sel = (state.selections[IMAGE_VARIANT] = state.selections[IMAGE_VARIANT] || {});
    sel.rows = sel.rows || {};
    sel.rows[ROW_ID] = images.slice();
    return state;
}
