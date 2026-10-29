// Ordre des references du mode Ref2VA (choix utilisateur, 19/10/2026) : chaque
// fichier a un jeton dans le prompt MiniMax (<Picture N>, <Video N>, <Audio N> ;
// les bandes-son des videos d'abord, puis les fichiers audio). Un changement
// d'ordre change ces jetons : le noeud previent. Module sans dependance a
// ComfyUI, teste par tests/test_ref_order.mjs.

import { profileOf } from "./profiles.js";

const LISTS = [["images", "Picture"], ["videos", "Video"], ["video_audios", "Audio"], ["audios", "Audio"]];

/** Jetons du prompt de la selection Ref2VA : [{list, path, token}] ; rien en F2VA/FL2VA. */
export function refTokens(state) {
    const out = [];
    // Seulement MiniMax Ref2VA : ni F2VA/FL2VA, ni LTX 2.x (pas de balises).
    if (!state || state.mode === "fl2va" || profileOf(state) !== "minimax_h3") return out;
    const soundtracks = (state.video_audios || []).filter(Boolean).length;
    for (const [list, word] of LISTS) {
        (state[list] || []).forEach((path, i) => {
            if (!path) return;
            const n = list === "audios" ? soundtracks + i + 1 : i + 1;
            out.push({ list, path, token: "<" + word + " " + n + ">" });
        });
    }
    return out;
}

/**
 * Jetons changes entre deux selections Ref2VA : [{list, path, from, to}],
 * to = null pour un fichier retire. Un fichier remplace a sa place (son
 * jeton repris par un nouveau fichier, choix utilisateur) : {list, path:
 * nouveau fichier, from = to = le jeton, replaced: ancien fichier}.
 */
export function orderChanges(before, after) {
    if (!before || !after || before.mode === "fl2va" || after.mode === "fl2va") return [];
    if (profileOf(before) !== "minimax_h3" || profileOf(after) !== "minimax_h3") return [];
    const key = (t, seen) => {
        const k = t.list + "|" + t.path;
        const n = seen.get(k) || 0;
        seen.set(k, n + 1);
        return k + "|" + n;
    };
    const old = refTokens(before);
    const known = new Set(old.map((t) => t.list + "|" + t.path));
    const now = new Map();
    const taken = new Map(); // jeton repris par un fichier nouveau dans sa liste -> ce fichier
    const seenAfter = new Map();
    for (const t of refTokens(after)) {
        now.set(key(t, seenAfter), t.token);
        if (!known.has(t.list + "|" + t.path)) taken.set(t.list + "|" + t.token, t.path);
    }
    const out = [];
    const seenBefore = new Map();
    for (const t of old) {
        const to = now.get(key(t, seenBefore)) || null;
        if (to === t.token) continue;
        const by = to ? null : taken.get(t.list + "|" + t.token);
        if (by) out.push({ list: t.list, path: by, from: t.token, to: t.token, replaced: t.path });
        else out.push({ list: t.list, path: t.path, from: t.token, to });
    }
    return out;
}

/** Message a montrer : un fichier garde change de jeton, ou un fichier est remplace a sa place. */
export function orderWarningNeeded(changes) {
    return (changes || []).some((c) => c.to);
}
