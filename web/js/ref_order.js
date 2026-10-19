// Ordre des references du mode Ref2VA (choix utilisateur, 19/10/2026) : chaque
// fichier a un jeton dans le prompt MiniMax (<Picture N>, <Video N>, <Audio N> ;
// les bandes-son des videos d'abord, puis les fichiers audio). Un changement
// d'ordre change ces jetons : le noeud previent. Module sans dependance a
// ComfyUI, teste par tests/test_ref_order.mjs.

const LISTS = [["images", "Picture"], ["videos", "Video"], ["video_audios", "Audio"], ["audios", "Audio"]];

/** Jetons du prompt de la selection Ref2VA : [{list, path, token}] ; rien en F2VA/FL2VA. */
export function refTokens(state) {
    const out = [];
    if (!state || state.mode === "fl2va") return out;
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
 * jeton repris par un nouveau fichier) ne compte pas.
 */
export function orderChanges(before, after) {
    if (!before || !after || before.mode === "fl2va" || after.mode === "fl2va") return [];
    const key = (t, seen) => {
        const k = t.list + "|" + t.path;
        const n = seen.get(k) || 0;
        seen.set(k, n + 1);
        return k + "|" + n;
    };
    const old = refTokens(before);
    const known = new Set(old.map((t) => t.list + "|" + t.path));
    const now = new Map();
    const taken = new Set(); // jetons repris par un fichier nouveau dans sa liste
    const seenAfter = new Map();
    for (const t of refTokens(after)) {
        now.set(key(t, seenAfter), t.token);
        if (!known.has(t.list + "|" + t.path)) taken.add(t.list + "|" + t.token);
    }
    const out = [];
    const seenBefore = new Map();
    for (const t of old) {
        const to = now.get(key(t, seenBefore)) || null;
        if (to === t.token) continue;
        if (!to && taken.has(t.list + "|" + t.token)) continue;
        out.push({ list: t.list, path: t.path, from: t.token, to });
    }
    return out;
}

/** Message a montrer : au moins un fichier garde change de jeton. */
export function orderWarningNeeded(changes) {
    return (changes || []).some((c) => c.to);
}
