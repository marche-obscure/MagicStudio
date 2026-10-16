// Regles des dossiers de projet, sans dependance a ComfyUI (testees par
// node --test tests/test_project_paths.mjs).

// Sous-dossiers de chaque projet (meme liste que projects.SUBFOLDERS en Python).
export const PROJECT_SUBFOLDERS = [
    "00.Workflows", "02.Models", "04.Prompt", "06.LoRA", "08.Images", "10.Son", "40.Rush Videos", "60.Rush Images",
];

const MAX_NAME_LENGTH = 100;
const INVALID_CHARS = '<>:"/\\|?*';
const RESERVED = new Set(["CON", "PRN", "AUX", "NUL"]);
for (let i = 1; i <= 9; i++) {
    RESERVED.add("COM" + i);
    RESERVED.add("LPT" + i);
}

/**
 * Message d'erreur (anglais) si Windows refuse ce nom de dossier, "" sinon.
 * Regles identiques a projects.validate_name() en Python.
 */
export function projectNameError(raw) {
    const name = String(raw || "").trim();
    if (!name) return "The project name is empty.";
    if (name.length > MAX_NAME_LENGTH) return "The project name is too long (" + MAX_NAME_LENGTH + " characters max).";
    for (const ch of name) {
        if (INVALID_CHARS.includes(ch) || ch.charCodeAt(0) < 32) {
            return 'The project name cannot contain < > : " / \\ | ? * or control characters.';
        }
    }
    if (name.endsWith(".")) return "The project name cannot end with a dot.";
    if (RESERVED.has(name.split(".")[0].toUpperCase())) return '"' + name + '" is a name reserved by Windows.';
    return "";
}

/**
 * Etat du noeud Projet : racine et chemin du projet choisi, nom, et
 * folder = dossier des projets personnalise quand aucun Root folder ne
 * vient du Reference Loader ("" = dossier de repli <input>/Projets).
 */
export function parseProjectState(raw) {
    let data = null;
    try {
        data = JSON.parse(raw || "{}");
    } catch (e) {
        data = null;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) data = {};
    const str = (v) => (typeof v === "string" ? v : "");
    return { root: str(data.root), name: str(data.name), path: str(data.path), folder: str(data.folder) };
}
