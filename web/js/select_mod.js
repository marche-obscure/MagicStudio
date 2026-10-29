// MagicStudio SelectMod (29/10/2026) : format des exports de champs, tri du tableau
// de fichiers et recherche. Module sans dependance a ComfyUI, teste par
// tests/test_select_mod.mjs. Copie adaptee de fields_format.js de MultiFiles Select.

export const EXPORT_FORMAT = "MagicStudio SelectMod";
export const EXPORT_VERSION = 1;
// Exports de MultiFiles Select, lus aussi pour passer d'un noeud a l'autre.
const MFS_FORMAT = "MultiFiles Select";

const pad = (n) => String(n).padStart(2, "0");

/** Nom de l'export, date en prefixe : "20261029-143000_selectmod_fields.json". */
export function exportFileName(date) {
    const d = date || new Date();
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" +
        pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + "_selectmod_fields.json";
}

/** Texte JSON de l'export ; rows = [{field, type, path}] (champs remplis, dans l'ordre). */
export function buildExport(rows) {
    return JSON.stringify({
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        fields: (rows || []).map((r) => ({ field: r.field, type: r.type || "", path: r.path || "" })),
    }, null, 2) + "\n";
}

/**
 * Fichier de champs : export SelectMod ou MultiFiles Select (JSON), ou ancien .txt
 * de MultiFiles Select ("N - Type : chemin"). Tableau indexe 1..maxFields de
 * {modelType, fieldValue} ; Error si le JSON est illisible ou d'un autre format.
 */
export function parseFieldsFile(text, maxFields) {
    const out = [];
    for (let i = 0; i <= maxFields; i++) out.push({ modelType: "", fieldValue: "" });
    const src = String(text || "").replace(/^﻿/, "");
    if (src.trim().startsWith("{")) {
        let data;
        try {
            data = JSON.parse(src);
        } catch (e) {
            throw new Error("Invalid JSON file.");
        }
        if (!data || ![EXPORT_FORMAT, MFS_FORMAT].includes(data.format) || !Array.isArray(data.fields)) {
            throw new Error("Not a SelectMod or MultiFiles Select fields file.");
        }
        for (const f of data.fields) {
            const n = Number(f && f.field);
            if (!Number.isInteger(n) || n < 1 || n > maxFields) continue;
            out[n] = { modelType: String((f && f.type) || "").trim(), fieldValue: String((f && f.path) || "").trim() };
        }
        return out;
    }
    const lines = src.split(/\r?\n/);
    for (let i = 1; i <= maxFields; i++) {
        const re = new RegExp(`^\\s*${i}\\s*-\\s*(.*?)\\s*:\\s*(.*)$`);
        for (const line of lines) {
            const m = line.match(re);
            if (m) {
                out[i] = { modelType: (m[1] || "").trim(), fieldValue: (m[2] || "").trim() };
                break;
            }
        }
    }
    return out;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Copie triee des fichiers par "name" (ordre naturel, sans casse), "size" ou "mtime". */
export function sortFiles(files, column, asc) {
    const key = column === "size" || column === "mtime" ? column : "name";
    const cmp = key === "name" ? (a, b) => collator.compare(a.name, b.name) : (a, b) => (a[key] || 0) - (b[key] || 0);
    const out = [...(files || [])].sort(cmp);
    return asc ? out : out.reverse();
}

/** Taille lisible : « 2 KB », « 512 MB », « 6.4 GB ». */
export function sizeText(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 ** 3) return (Math.round((n / 1024 ** 3) * 10) / 10) + " GB";
    if (n >= 1024 ** 2) return Math.round(n / 1024 ** 2) + " MB";
    return Math.round(n / 1024) + " KB";
}

/** Texte sans accents ni casse. */
export function foldText(text) {
    return String(text || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Le nom contient tous les mots de la recherche (sans accents ni casse) ; recherche vide = tout. */
export function matchesSearch(name, query) {
    const words = foldText(query).split(/\s+/).filter(Boolean);
    const n = foldText(name);
    return words.every((w) => n.includes(w));
}
