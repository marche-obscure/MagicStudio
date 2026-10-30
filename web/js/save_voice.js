// Fonctions pures du noeud MagicStudio SaveVoice (sans ComfyUI), testees par
// tests/test_save_voice.mjs. QUALITIES = save_voice.QUALITIES (Python) : verifie par
// tests/test_save_voice_node.py, qui lit l'objet ci-dessous comme du JSON (garder les
// guillemets doubles et la fin "};").

export const QUALITIES = {
    "mp3": ["V0", "128k", "320k"],
    "opus": ["64k", "96k", "128k", "192k", "320k"],
    "wav": [],
    "flac": []
};
/** Qualite par defaut de chaque format (= save_voice.DEFAULT_QUALITY). */
export const DEFAULT_QUALITY = { mp3: "V0", opus: "128k" };
/** Valeur du widget quality quand le format n'a pas de qualite (wav, flac). */
export const NO_QUALITY = "none";
/** Sous-dossier des voix dans le projet (= save_voice.VOICE_DIR). */
export const VOICE_DIR = ["90.Pick Up", "Son"];

/** Qualites proposees pour le format (copie ; [] pour wav / flac ou un format inconnu). */
export function qualityChoices(fmt) {
    return (QUALITIES[fmt] || []).slice();
}

/** Qualite a garder quand le format change : "none" sans qualite, sinon valeur gardee ou defaut. */
export function fixQuality(fmt, current) {
    const choices = qualityChoices(fmt);
    if (!choices.length) return NO_QUALITY;
    return choices.includes(current) ? current : DEFAULT_QUALITY[fmt];
}

/** Dossier des voix : <projet>\90.Pick Up\Son, avec le separateur du chemin recu. */
export function voicePath(projectPath) {
    const p = String(projectPath || "");
    if (!p) return "";
    const sep = p.includes("\\") || !p.includes("/") ? "\\" : "/";
    return p.replace(/[\\/]+$/, "") + sep + VOICE_DIR.join(sep);
}
