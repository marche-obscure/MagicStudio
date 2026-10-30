// Arbre des post-traitements d'un original (choix utilisateur 30/10/2026) : noms
// "Original" / "Post A" / "Post A.01", arbre par original, disposition en colonnes pour la
// fenetre Processing, et chemin / lien de glisser-deposer d'une sortie.
// Module pur : aucun appel a project_paths.js au chargement (import circulaire possible).
import { outputFile, sortDot } from "./project_paths.js";

/** Lettres de rang n : 0 -> A, 25 -> Z, 26 -> AA, 27 -> AB, 51 -> AZ, 52 -> BA. */
export function letters(n) {
    let s = "";
    let k = Math.max(0, Math.floor(n)) + 1;
    while (k > 0) {
        const r = (k - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        k = Math.floor((k - 1) / 26);
    }
    return s;
}

// Ordre de nommage des freres : date croissante, puis index (les supprimes gardent leur rang).
const naming = (a, b) => String(a.post_date || "").localeCompare(String(b.post_date || "")) || (a.index - b.index);

/** Structure commune : sorties par index, originaux (non-post), enfants de chacun en ordre de nommage. */
function structure(outs) {
    const list = (outs || []).filter(Boolean);
    const byIndex = new Map(list.map((o) => [o.index, o]));
    const roots = list.filter((o) => !o.post_level);
    const first = roots[0] || null;
    const kids = new Map();
    const orphans = [];
    for (const o of list) {
        if (!o.post_level) continue;
        const src = byIndex.get(o.post_of);
        if (src && src !== o) {
            if (!kids.has(src.index)) kids.set(src.index, []);
            kids.get(src.index).push(o);
        } else orphans.push(o);
    }
    for (const arr of kids.values()) arr.sort(naming);
    // Orphelins : enfants de la premiere sortie non-post, apres ses enfants reels.
    if (first && orphans.length) {
        if (!kids.has(first.index)) kids.set(first.index, []);
        kids.get(first.index).push(...orphans.sort(naming));
    }
    return { list, byIndex, roots, first, kids, orphans };
}

const pad2 = (n) => (n < 10 ? "0" : "") + n;

/** Noms par index : "Original" (a au moins un post), "Post A", "Post A.01"... ; sortie sans post absente. */
export function postNames(outs) {
    const { list, roots, kids, orphans } = structure(outs);
    const names = new Map();
    const walk = (o, name, isRoot) => {
        (kids.get(o.index) || []).forEach((c, i) => {
            if (names.has(c.index)) return;
            names.set(c.index, isRoot ? "Post " + letters(i) : name + "." + pad2(i + 1));
            walk(c, names.get(c.index), false);
        });
    };
    for (const r of roots) {
        if ((kids.get(r.index) || []).length) names.set(r.index, "Original");
        walk(r, "Original", true);
    }
    // Posts hors de tout arbre (aucun original, ou cycle de post_of corrompu).
    for (const o of list) if (o.post_level && !names.has(o.index)) names.set(o.index, "Post ?");
    return names;
}

/** Original (sortie non-post) au bout de la chaine post_of ; source manquante : premier original. */
export function rootOf(o, outs) {
    const { byIndex, first } = structure(outs);
    const seen = new Set();
    let cur = o;
    while (cur && cur.post_level) {
        if (seen.has(cur)) break;
        seen.add(cur);
        const next = byIndex.get(cur.post_of);
        if (!next) break;
        cur = next;
    }
    if (cur && !cur.post_level) return cur;
    return first || o;
}

/** Arbre {output, name, children} d'un original ; order : "desc" (recent d'abord) ou "asc" pour les freres. */
export function postTree(outs, rootIndex, order = "desc") {
    const { byIndex, kids } = structure(outs);
    const names = postNames(outs);
    const sign = order === "asc" ? 1 : -1;
    const display = (a, b) => sign * String(a.post_date || "").localeCompare(String(b.post_date || "")) || (a.index - b.index);
    const seen = new Set();
    const build = (o) => {
        seen.add(o.index);
        const children = (kids.get(o.index) || []).filter((c) => !seen.has(c.index)).sort(display).map(build);
        return { output: o, name: names.get(o.index) || "", children };
    };
    const root = byIndex.get(rootIndex);
    return root ? build(root) : null;
}

/** Tous les descendants de l'original (supprimes compris), en parcours en profondeur. */
export function postsOf(outs, rootIndex) {
    const tree = postTree(outs, rootIndex);
    const out = [];
    const walk = (n) => { for (const c of n.children) { out.push(c.output); walk(c); } };
    if (tree) walk(tree);
    return out;
}

/** Disposition : chaque feuille une colonne, parent centre (moyenne premier / dernier enfant). */
export function treeLayout(tree) {
    const cards = [];
    const links = [];
    let column = 0;
    let levels = 0;
    const place = (node, depth) => {
        levels = Math.max(levels, depth + 1);
        const card = { node, depth, x: 0 };
        cards.push(card);
        if (!node.children.length) {
            card.x = column++;
        } else {
            const sub = node.children.map((c) => place(c, depth + 1));
            sub.forEach((s) => links.push([card, s]));
            card.x = (sub[0].x + sub[sub.length - 1].x) / 2;
        }
        return card;
    };
    if (tree) place(tree, 0);
    return { cards, links, width: column, depth: levels };
}

/** Fichier a glisser : l'original s'il est dans le projet, sinon le fichier montre ; "" sans fichier. */
export function dragPath(o) {
    if (!o) return "";
    if (o.in_project && o.source_exists && o.source) return o.source;
    return outputFile(o) || "";
}

/** Lien de glisser vers MedLoad : route media du Ref Loader + nom du fichier. */
export function dragLink(path, origin) {
    const name = String(path).split(/[\\/]/).pop();
    return origin + "/mmrefloader/media?file=" + encodeURIComponent(path) + "&filename=" + encodeURIComponent(name);
}

/**
 * Arbre sans les cartes inutiles : un nœud sans fichier et sans descendant present disparait
 * (un supprime qui a des descendants presents reste, pour garder les liens) ; la racine reste toujours.
 */
export function pruneGone(tree) {
    if (!tree) return null;
    const keep = (n) => {
        const children = n.children.map(keep).filter(Boolean);
        return outputFile(n.output) || children.length ? { ...n, children } : null;
    };
    const kids = tree.children.map(keep).filter(Boolean);
    return { ...tree, children: kids };
}

/** Sorties de l'arbre qui ont un fichier present, racine d'abord (parcours en profondeur). */
export function treeFiles(tree) {
    const out = [];
    const walk = (n) => {
        if (outputFile(n.output)) out.push(n.output);
        n.children.forEach(walk);
    };
    if (tree) walk(tree);
    return out;
}

/**
 * Post pale dans Processing : un filtre de pastilles est actif et la pastille du post n'y est pas.
 * L'original (rootIndex) n'est jamais filtre ; une carte « Deleted » (sans fichier) non plus.
 */
export function isFiltered(o, rootIndex, active) {
    if (!o || !active || !active.size || o.index === rootIndex || !outputFile(o)) return false;
    return !active.has(sortDot(o));
}
