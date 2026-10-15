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

/**
 * Identifiants des rubriques ({id, title, html}) dont le titre ou le texte
 * contient tous les mots de la recherche (sans casse). Recherche vide :
 * toutes les rubriques.
 */
export function filterSections(sections, query) {
    const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
    return sections
        .filter((s) => {
            const text = (s.title + " " + stripTags(s.html)).toLowerCase();
            return words.every((w) => text.includes(w));
        })
        .map((s) => s.id);
}
