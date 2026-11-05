// Parties pures de la fenetre Project de MedLoad (sans ComfyUI : testees par tests/test_project_browser.mjs).

/** Types proposes par la fenetre : [cle, bouton]. */
export const PROJECT_KINDS = [["video", "Video"], ["image", "Image"], ["audio", "Son"]];

// Dossiers de chaque type (conception du 30/10/2026) ; 40 / 60 = originaux des Runs, avec leur arbre Processing.
const FOLDERS = {
    video: ["12.Video", "14.Video-Audio", "40.Rush Videos", "90.Pick Up/Video"],
    image: ["08.Images", "60.Rush Images", "90.Pick Up/Image"],
    audio: ["10.Son", "90.Pick Up/Son"],
};
/** Images extraites d'une video du Picture Lock, quel que soit le type choisi. */
export const EXTRACT_FOLDER = "40.Rush Videos/Picture Lock/Extract Frame";
/** Sous-dossier des fichiers archives. */
export const ARCHIVES = "Archives";

/**
 * Sections de la fenetre : [{title, folder}] dans l'ordre d'affichage.
 * kind : video | image | audio ; mode : normal | archives | extract.
 * archives : le sous-dossier Archives de chaque dossier du type (folder = "<dossier>/Archives").
 */
export function projectSections(kind, mode) {
    if (mode === "extract") return [{ title: "Extract Frame", folder: EXTRACT_FOLDER }];
    const list = FOLDERS[kind] || FOLDERS.video;
    if (mode === "archives") return list.map((f) => ({ title: f + "/" + ARCHIVES, folder: f + "/" + ARCHIVES }));
    return list.map((f) => ({ title: f, folder: f }));
}

/** {base, archives} d'un dossier de section ("12.Video/Archives" -> base "12.Video", archives vrai). */
export function sectionQuery(folder) {
    const m = /^(.*)\/Archives$/.exec(String(folder || ""));
    return m ? { base: m[1], archives: true } : { base: String(folder || ""), archives: false };
}

/** Section 40 / 60 (originaux des Runs) : dossier racine seulement, jamais ses Archives ni Extract Frame. */
export function rushFolderOf(folder) {
    return folder === "40.Rush Videos" || folder === "60.Rush Images" ? folder : "";
}

const EXTS = {
    video: ["mp4", "mov", "mkv", "webm", "avi", "m4v"],
    image: ["png", "jpg", "jpeg", "webp", "bmp", "gif"],
    audio: ["wav", "mp3", "flac", "ogg", "opus", "m4a", "aac"],
};

/** Type d'un fichier d'apres son extension ("" si ce n'est pas un media). */
export function kindOfName(name) {
    const ext = String(name || "").split(".").pop().toLowerCase();
    for (const k of Object.keys(EXTS)) if (EXTS[k].includes(ext)) return k;
    return "";
}

/** Dossier du projet : racine + nom ("Groupe/Projet" devient Groupe\Projet). */
export function projectPathOf(root, name) {
    const sep = String(root || "").includes("\\") ? "\\" : "/";
    return String(root || "").replace(/[\\/]+$/, "") + sep + String(name || "").split("/").join(sep);
}

/** Projets et sous-projets pour le menu : [{value, label, group, multi}], comme le noeud Project (groupe en tete). */
export function projectChoices(tree) {
    const out = [];
    for (const e of tree || []) {
        if (!e.projects) out.push({ value: e.name, label: e.name, group: "", multi: false });
        else for (const p of e.projects) out.push({ value: e.name + "/" + p, label: p, group: e.name, multi: true });
    }
    return out;
}

/** Date de modification (secondes) -> "dd/mm/yyyy hh:mm:ss", "" sans date. */
export function mtimeText(seconds) {
    if (!(seconds > 0)) return "";
    const d = new Date(seconds * 1000);
    const z = (n) => String(n).padStart(2, "0");
    return z(d.getDate()) + "/" + z(d.getMonth() + 1) + "/" + d.getFullYear() + " " + z(d.getHours()) + ":" +
        z(d.getMinutes()) + ":" + z(d.getSeconds());
}
