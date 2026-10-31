// Liens du graphe (MagicStudio Container, plan des variantes 29/10/2026). Module sans
// dependance a ComfyUI : il n'utilise que les champs de LiteGraph (graph.links Map ou
// objet, getNodeById, inputs[].link, getInputLink, connect), teste par tests/test_container.mjs
// avec un faux graphe.

/** Lien d'un identifiant (graph.links : LinkMap ou objet). */
function linkById(graph, id) {
    if (!graph || !graph.links || id == null) return null;
    return (typeof graph.links.get === "function" ? graph.links.get(id) : graph.links[id]) || null;
}

/** Lien qui arrive sur l'entree slot du noeud n, ou null. */
export function linkInto(n, slot) {
    if (!n || !n.graph || slot < 0 || !n.inputs || !n.inputs[slot]) return null;
    if (typeof n.getInputLink === "function") return n.getInputLink(slot) || null;
    return linkById(n.graph, n.inputs[slot].link);
}

/**
 * Liens qui partent de la sortie slot du noeud, deduits de graph.links (origin_id /
 * origin_slot). Ne jamais assigner output.links (obsolete : une affectation debranche).
 */
export function outputLinksOf(node, slot) {
    const graph = node && node.graph;
    if (!graph || !graph.links) return [];
    const all = typeof graph.links.values === "function" ? [...graph.links.values()] : Object.values(graph.links);
    return all.filter((l) => l && l.origin_id === node.id && l.origin_slot === slot);
}

/**
 * Noeud source de l'entree slot, a travers Get (Pixaroma / KJNodes : getInputLink du Get,
 * sinon findSetter ou Set de meme nom), Set et Reroute : le premier noeud accepte par
 * accept(n), ou null (autre noeud, rien de branche, plus de maxHops sauts). Meme methode que
 * linkedFileSelect du noeud Project.
 */
export function traceSource(node, slot, accept, maxHops = 10) {
    let link = linkInto(node, slot);
    let src = link ? node.graph.getNodeById(link.origin_id) : null;
    for (let hop = 0; src && hop <= maxHops; hop++) {
        if (accept(src)) return src;
        const type = String(src.type || "");
        const from = src;
        if (/get/i.test(type) && typeof from.getInputLink === "function") {
            link = from.getInputLink(0) || null;
        } else if (/get/i.test(type) && from.widgets && from.widgets[0]) {
            const name = from.widgets[0].value;
            let setter = typeof from.findSetter === "function" ? from.findSetter(from.graph) : null;
            if (setter && setter.node) setter = setter.node;
            if (!setter && from.graph) {
                setter = (from.graph._nodes || []).find((n) => /set/i.test(String(n.type || "")) &&
                    n.widgets && n.widgets[0] && n.widgets[0].value === name) || null;
            }
            link = setter ? linkInto(setter, 0) : null;
            src = link ? setter.graph.getNodeById(link.origin_id) : null;
            continue;
        } else if (from.isVirtualNode || /reroute|set/i.test(type)) {
            link = linkInto(from, 0);
        } else {
            return null;
        }
        src = link ? from.graph.getNodeById(link.origin_id) : null;
    }
    return null;
}

/** Liens et etiquettes de chaque sortie : [{key, label, links: [{targetId, input}]}] (entree par nom). */
export function saveOutputLinks(node) {
    return (node.outputs || []).map((o, i) => ({
        key: o.name,
        label: o.label || null,
        links: outputLinksOf(node, i).map((l) => {
            const target = node.graph && node.graph.getNodeById(l.target_id);
            const input = target && target.inputs && target.inputs[l.target_slot];
            return input ? { targetId: l.target_id, input: input.name } : null;
        }).filter(Boolean),
    }));
}

/**
 * Remet les etiquettes et rebranche les liens memorises, par nom de sortie, seulement si le
 * noeud cible existe encore et si son entree (cherchee par nom) est libre.
 */
export function restoreOutputLinks(node, saved) {
    for (const entry of saved || []) {
        const outIdx = (node.outputs || []).findIndex((o) => o.name === entry.key);
        if (outIdx < 0) continue;
        if (entry.label) node.outputs[outIdx].label = entry.label;
        for (const l of entry.links || []) {
            const target = node.graph && node.graph.getNodeById(l.targetId);
            if (!target || !target.inputs) continue;
            const inIdx = target.inputs.findIndex((inp) => inp.name === l.input);
            if (inIdx >= 0 && target.inputs[inIdx].link == null) node.connect(outIdx, target, inIdx);
        }
    }
}

/** Lien enregistre sur l'entree slot (input.link lu dans graph.links, sans getInputLink), ou null. */
function storedLinkInto(n, slot) {
    const input = n && n.inputs && n.inputs[slot];
    if (!input || input.link == null || !n.graph) return null;
    return linkById(n.graph, input.link);
}

/**
 * Noeud Set correspondant a un noeud Get (findSetter de KJNodes / Easy-Use, sinon un noeud "Set"
 * du graphe avec le meme widgets[0].value), ou null. Partage par linkedProject et promptSource.
 */
function setterOfGet(get) {
    const name = get.widgets && get.widgets[0] ? get.widgets[0].value : undefined;
    let setter = typeof get.findSetter === "function" ? get.findSetter(get.graph) : null;
    if (setter && setter.node) setter = setter.node;
    if (!setter && get.graph) {
        setter = (get.graph._nodes || []).find((n) => /set/i.test(String(n.type || "")) &&
            n.widgets && n.widgets[0] && n.widgets[0].value === name) || null;
    }
    return setter;
}

/**
 * Projet du noeud MagicStudio Project (type projectType) relie a l'entree inputName du noeud :
 * {wired, info} (info = mmProjectInfo() du noeud Project : {name, path} ou null). Traverse Get
 * (getInputLink(0) du Get : Pixaroma lit la premiere entree branchee du Set, KJNodes aussi ;
 * sinon findSetter de KJNodes / Easy-Use, sinon un noeud "Set" de meme nom dans le graphe) et les
 * Reroute, 10 sauts. Deplace depuis final_cut_node.js (30/10/2026) pour le partager avec SaveVoice.
 * inputName : un nom, ou une liste (le premier present est pris : voir projectInputNames).
 */
export function linkedProject(node, inputName, projectType) {
    // Un nom ou une liste de noms acceptes (project_used puis l'ancien nom, 30/10/2026) : le
    // premier qui a un lien (project_used vide + ancien nom relie = l'ancien), sinon le premier present.
    const names = Array.isArray(inputName) ? inputName : [inputName];
    const slots = names.map((name) => (node.inputs || []).findIndex((i) => i && i.name === name))
        .filter((i) => i >= 0);
    const slot = slots.find((i) => storedLinkInto(node, i)) ?? (slots.length ? slots[0] : -1);
    let link = slot >= 0 ? storedLinkInto(node, slot) : null;
    let src = link ? node.graph.getNodeById(link.origin_id) : null;
    for (let hop = 0; src && hop < 10; hop++) {
        if (src.type === projectType) {
            const info = typeof src.mmProjectInfo === "function" ? src.mmProjectInfo() : null;
            return { wired: true, info };
        }
        const type = String(src.type || "");
        if (/get/i.test(type) && typeof src.getInputLink === "function") {
            const from = src;
            link = from.getInputLink(0) || null;
            src = link ? from.graph.getNodeById(link.origin_id) : null;
        } else if (/get/i.test(type) && src.widgets && src.widgets[0]) {
            const setter = setterOfGet(src);
            link = setter ? storedLinkInto(setter, 0) : null;
            src = link ? setter.graph.getNodeById(link.origin_id) : null;
        } else if (src.isVirtualNode || /reroute/i.test(type)) {
            const from = src;
            link = storedLinkInto(from, 0);
            src = link ? from.graph.getNodeById(link.origin_id) : null;
        } else {
            break;
        }
    }
    return { wired: false, info: null };
}

// ---- Entree text_prompt (31/10/2026) ----

/** Avertissement affiche avant le Run quand text_prompt ne recoit rien. */
export const PROMPT_UNWIRED = "text_prompt receives nothing: runs will be recorded without a prompt";

/**
 * Ce que recevra l'entree text_prompt du noeud Project : {ok:true}, {ok:false, reason:"unwired"}
 * (aucun lien) ou {ok:false, reason:"get-without-set", name} (un Get dont le Set de meme nom
 * manque, ou dont le Set n'a lui-meme aucun lien). Meme parcours Get / Set / Reroute que
 * linkedProject (10 sauts). Un noeud qu'on ne sait pas traverser compte comme une source valide.
 */
export function promptSource(node) {
    const slot = (node.inputs || []).findIndex((i) => i && i.name === "text_prompt");
    let link = slot >= 0 ? storedLinkInto(node, slot) : null;
    let src = link ? node.graph.getNodeById(link.origin_id) : null;
    if (!src) return { ok: false, reason: "unwired" };
    for (let hop = 0; hop < 10; hop++) {
        const type = String(src.type || "");
        let next = null;
        if (/get/i.test(type) && src.widgets && src.widgets[0]) {
            const name = String(src.widgets[0].value);
            const direct = typeof src.getInputLink === "function" ? src.getInputLink(0) : null;
            const setter = direct ? null : setterOfGet(src);
            link = direct || (setter ? storedLinkInto(setter, 0) : null);
            if (!link) return { ok: false, reason: "get-without-set", name };
            next = (setter || src).graph.getNodeById(link.origin_id);
        } else if (/setnode/i.test(type) && src.widgets && src.widgets[0]) {
            link = storedLinkInto(src, 0);
            if (!link) return { ok: false, reason: "get-without-set", name: String(src.widgets[0].value) };
            next = src.graph.getNodeById(link.origin_id);
        } else if (src.isVirtualNode || /reroute/i.test(type)) {
            link = storedLinkInto(src, 0);
            if (!link) return { ok: false, reason: "unwired" };
            next = src.graph.getNodeById(link.origin_id);
        } else {
            return { ok: true };
        }
        if (!next) return { ok: false, reason: "unwired" };
        src = next;
    }
    return { ok: true };
}

// ---- Lien project_used (30/10/2026, choix utilisateur) ----
// La sortie du noeud MagicStudio Project s'appelait final_cut, l'entree du Final Cut aussi et
// celle du SaveVoice project : les trois s'appellent maintenant project_used (meme type
// MINIMAX_FINAL_CUT, memes positions).

/** Nouveau nom du lien entre le noeud Project et les noeuds Final Cut / SaveVoice. */
export const PROJECT_USED = "project_used";

/**
 * Anciens noms par type de noeud : {inputs|outputs: {ancien: nouveau}}. Ecrit en JSON sur une
 * ligne : project_config.LEGACY_LINK_NAMES (Python) doit etre identique (test_project_config).
 */
export const LEGACY_PROJECT_LINKS = {"MiniMaxH3Project": {"outputs": {"final_cut": "project_used"}}, "MiniMaxH3FinalCut": {"inputs": {"final_cut": "project_used"}}, "MagicStudioSaveVoice": {"inputs": {"project": "project_used"}}};

/**
 * Nom courant d'une entree / sortie (side "inputs" | "outputs") d'un noeud du type nodeType :
 * l'ancien nom du lien project_used est ramene au nouveau, les autres noms sont rendus tels quels.
 * Sert aux comparaisons de workflows (workflow_diff.js) : un workflow enregistre avant le
 * 30/10/2026 a la meme structure que le meme workflow ouvert aujourd'hui.
 */
export function currentSlotName(nodeType, side, name) {
    const names = ((LEGACY_PROJECT_LINKS[nodeType] || {})[side]) || {};
    return Object.prototype.hasOwnProperty.call(names, name) ? names[name] : name;
}

/** Noms d'entree acceptes pour trouver le projet : project_used, puis l'ancien nom du type. */
export function projectInputNames(nodeType) {
    const legacy = (LEGACY_PROJECT_LINKS[nodeType] || {}).inputs || {};
    return [PROJECT_USED, ...Object.keys(legacy)];
}

/**
 * Renomme, dans les donnees enregistrees d'un noeud (avant configure), les entrees / sorties
 * dont le nom est ancien : name, et localized_name / label quand ils valent l'ancien nom
 * (une etiquette choisie par l'utilisateur est gardee). Les liens sont enregistres par
 * position (link, links, origin_slot / target_slot) : on n'y touche pas, ils restent.
 * Rien n'est renomme si le nouveau nom existe deja (pas de doublon). Modifie data et le renvoie.
 */
export function renameLegacySlots(data, map) {
    if (!data || !map) return data;
    for (const side of ["inputs", "outputs"]) {
        const names = map[side];
        const slots = data[side];
        if (!names || !Array.isArray(slots)) continue;
        const present = new Set(slots.map((s) => (s ? s.name : undefined)));
        for (const slot of slots) {
            if (!slot || !Object.prototype.hasOwnProperty.call(names, slot.name)) continue;
            const old = slot.name;
            const next = names[old];
            if (present.has(next)) continue;
            slot.name = next;
            if (slot.localized_name === old) slot.localized_name = next;
            if (slot.label === old) slot.label = next;
            present.add(next);
        }
    }
    return data;
}
