// Retire project_used des MedLoad dans le prompt d'API (05/11/2026) : le lien reste dans le workflow
// (la pilule Project | Folder l'utilise) mais n'est pas une dependance d'execution (sinon le cache
// du MedLoad et de sa chaine tombe a chaque Queue, et le nœud Project s'execute pour rien).
//     node --test tests/test_prompt_strip.mjs
export const MEDLOAD_CLASS = "MiniMaxH3LoadMedia";
// Le Compare (05/11/2026) garde aussi son lien project_used hors du prompt.
export const STRIP_CLASSES = [MEDLOAD_CLASS, "MagicStudioCompare"];

/** Supprime inputs.project_used de chaque nœud MedLoad ou Compare de `output` (modifie et renvoie `output`). */
export function stripProjectUsed(output) {
    if (!output || typeof output !== "object") return output;
    for (const id of Object.keys(output)) {
        const n = output[id];
        if (n && STRIP_CLASSES.includes(n.class_type) && n.inputs && typeof n.inputs === "object") delete n.inputs.project_used;
    }
    return output;
}
