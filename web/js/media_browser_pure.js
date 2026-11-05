// Parties pures de la fenetre Folder de MedLoad (sans ComfyUI : testees par tests/test_media_browser.mjs).
import { sortFiles } from "./select_mod.js";

/** Types proposes par la barre du haut. */
export const KINDS = ["all", "video", "image", "audio"];

/** Copie triee par "name" (ordre naturel), "size" ou "mtime" ; dir = "asc" | "desc". */
export function sortMedia(list, key, dir) {
    return sortFiles(list, key, dir !== "desc");
}

/** Fichiers du type demande ("all" ou inconnu = tout). */
export function kindFilter(list, kind) {
    const items = list || [];
    return KINDS.includes(kind) && kind !== "all" ? items.filter((f) => f.kind === kind) : [...items];
}
