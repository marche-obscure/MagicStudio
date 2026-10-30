// Comparaison de deux workflows ComfyUI (sans dependance a ComfyUI, teste
// par node --test tests/test_workflow_diff.mjs) : noeuds ajoutes ou
// supprimes, valeurs changees, liens, et disposition (positions / tailles)
// signalee a part. La vue (zoom, decalage) et "extra" sont ignores.

import { currentSlotName } from "./graph_links.js";

function nodesOf(wf) {
    const map = new Map();
    for (const n of (wf && Array.isArray(wf.nodes) ? wf.nodes : [])) {
        if (n && n.id != null) map.set(String(n.id), n);
    }
    return map;
}

/**
 * Liens sous forme "origine:slot>cible:slot" (format tableau ou objet). Le
 * slot est designe par son nom quand le noeud le donne : des sorties
 * dynamiques (Reference Loader) decalent les numeros sans changer le lien.
 */
function linksOf(wf) {
    const nodes = nodesOf(wf);
    const slot = (id, kind, i) => {
        const n = nodes.get(String(id));
        const s = n && Array.isArray(n[kind]) ? n[kind][i] : null;
        // Ancien nom du lien project_used (final_cut / project, avant le 30/10/2026) = nouveau nom.
        return s && s.name ? currentSlotName(n.type, kind, s.name) : i;
    };
    const key = (o, os, t, ts) => o + ":" + slot(o, "outputs", os) + ">" + t + ":" + slot(t, "inputs", ts);
    const set = new Set();
    for (const l of (wf && Array.isArray(wf.links) ? wf.links : [])) {
        if (Array.isArray(l)) set.add(key(l[1], l[2], l[3], l[4]));
        else if (l && typeof l === "object") set.add(key(l.origin_id, l.origin_slot, l.target_id, l.target_slot));
    }
    return set;
}

const labelOf = (n) => (n.title || n.type || "Node") + " #" + n.id;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Valeurs d'un noeud : [[champ, valeur]] (widgets_values en tableau ou en objet). */
function valuesOf(n, names) {
    const v = n.widgets_values;
    if (Array.isArray(v)) return v.map((x, i) => [(names && names[i]) || "value " + (i + 1), x]);
    if (v && typeof v === "object") return Object.entries(v);
    return [];
}

/**
 * Differences de saved vers current. widgetNames (facultatif) :
 * {id du noeud: [noms des widgets]} pour des libelles lisibles.
 */
export function diffWorkflows(saved, current, widgetNames) {
    const a = nodesOf(saved);
    const b = nodesOf(current);
    const added = [];
    const removed = [];
    const changed = [];
    let layout = false;
    for (const [id, n] of b) if (!a.has(id)) added.push({ id: n.id, label: labelOf(n) });
    for (const [id, n] of a) if (!b.has(id)) removed.push({ id: n.id, label: labelOf(n) });
    for (const [id, nb] of b) {
        const na = a.get(id);
        if (!na) continue;
        const names = widgetNames && widgetNames[id];
        const before = new Map(valuesOf(na, names));
        for (const [field, after] of valuesOf(nb, names)) {
            if (!same(before.get(field), after)) {
                changed.push({ id: nb.id, label: labelOf(nb), field, before: before.get(field), after });
            }
        }
        if ((na.mode || 0) !== (nb.mode || 0)) {
            changed.push({ id: nb.id, label: labelOf(nb), field: "mode", before: na.mode || 0, after: nb.mode || 0 });
        }
        if (!same(na.pos, nb.pos) || !same(na.size, nb.size)) layout = true;
    }
    const la = linksOf(saved);
    const lb = linksOf(current);
    const linksAdded = [...lb].filter((l) => !la.has(l)).length;
    const linksRemoved = [...la].filter((l) => !lb.has(l)).length;
    const content = added.length + removed.length + changed.length + linksAdded + linksRemoved > 0;
    return { added, removed, changed, linksAdded, linksRemoved, layout, same: !content && !layout };
}

/**
 * Empreinte du contenu (noeuds, valeurs, modes, liens), sans la disposition :
 * deux workflows qui ne different que par la position des noeuds ont la meme.
 */
export function workflowSignature(wf) {
    const nodes = [...nodesOf(wf).values()]
        .map((n) => [String(n.id), n.type, n.mode || 0, n.widgets_values === undefined ? null : n.widgets_values])
        .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    return JSON.stringify([nodes, [...linksOf(wf)].sort()]);
}

/** "dd/MM/yyyy at HH:mm:ss" (heure locale). */
export function formatLastSave(date) {
    const p = (n) => String(n).padStart(2, "0");
    return p(date.getDate()) + "/" + p(date.getMonth() + 1) + "/" + date.getFullYear() + " at " +
        p(date.getHours()) + ":" + p(date.getMinutes()) + ":" + p(date.getSeconds());
}

/** Valeur courte pour la liste des changements (50 caracteres au plus). */
export function shortValue(v) {
    const s = v === undefined ? "-" : JSON.stringify(v);
    return s.length > 50 ? s.slice(0, 49) + "…" : s;
}
