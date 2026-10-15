// Recherche dans les rubriques de l'aide. Module sans dependance a ComfyUI,
// teste par tests/test_help_search.mjs.

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/** HTML -> texte brut (balises retirees, entites courantes decodees). */
export function stripTags(html) {
    return String(html)
        .replace(/<[^>]*>/g, "")
        .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m])
        .replace(/\s+/g, " ")
        .trim();
}

/** Minuscules sans accents, caractere par caractere (meme longueur que le texte). */
export function foldText(text) {
    // Unites UTF-16 une par une : les positions restent celles du texte d'origine.
    return String(text).split("").map((c) => {
        const f = c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        if (f.length === 1) return f;
        const l = c.toLowerCase();
        return l.length === 1 ? l : c;
    }).join("");
}

/** Mots de la recherche, sans casse ni accents. */
export function queryWords(query) {
    return foldText(String(query || "")).split(/\s+/).filter(Boolean);
}

/**
 * Identifiants des rubriques ({id, title, html}) dont le titre ou le texte
 * contient tous les mots de la recherche (sans casse ni accents). Recherche
 * vide : toutes les rubriques.
 */
export function filterSections(sections, query) {
    const words = queryWords(query);
    return sections
        .filter((s) => {
            const text = foldText(s.title + " " + stripTags(s.html));
            return words.every((w) => text.includes(w));
        })
        .map((s) => s.id);
}

/**
 * Positions [debut, fin[ des mots (deja replies par queryWords) dans text,
 * triees et sans chevauchement : pour surligner le texte d'origine.
 */
export function findMatches(text, words) {
    const folded = foldText(text);
    const found = [];
    for (const w of words) {
        if (!w) continue;
        let i = folded.indexOf(w);
        while (i >= 0) {
            found.push([i, i + w.length]);
            i = folded.indexOf(w, i + w.length);
        }
    }
    found.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const out = [];
    for (const m of found) {
        if (out.length && m[0] < out[out.length - 1][1]) continue;
        out.push(m);
    }
    return out;
}

// Langues de l'aide.
export const HELP_LANGUAGES = ["en", "fr"];

/**
 * Langue de l'aide : choix memorise, sinon langue de ComfyUI, sinon celle du
 * navigateur, sinon l'anglais (seulement parmi HELP_LANGUAGES).
 */
export function pickLanguage(saved, comfyLocale, browserLang) {
    for (const v of [saved, comfyLocale, browserLang]) {
        const code = String(v || "").toLowerCase().slice(0, 2);
        if (HELP_LANGUAGES.includes(code)) return code;
    }
    return "en";
}
