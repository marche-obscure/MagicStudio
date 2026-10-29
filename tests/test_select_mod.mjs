// node --test tests/test_select_mod.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    EXPORT_FORMAT, exportFileName, buildExport, parseFieldsFile, sortFiles, sizeText, matchesSearch, pickTarget,
} from "../web/js/select_mod.js";

test("SelectMod : export puis import = memes champs", () => {
    assert.equal(EXPORT_FORMAT, "MagicStudio SelectMod");
    assert.equal(exportFileName(new Date(2026, 9, 29, 14, 30, 5)), "20261029-143005_selectmod_fields.json");
    const text = buildExport([{ field: 1, type: "diffusion_models", path: "G:\\m\\a.safetensors" }, { field: 6, type: "vae", path: "v.safetensors" }]);
    assert.equal(JSON.parse(text).format, "MagicStudio SelectMod");
    const got = parseFieldsFile(text, 7);
    assert.deepEqual(got[1], { modelType: "diffusion_models", fieldValue: "G:\\m\\a.safetensors" });
    assert.deepEqual(got[6], { modelType: "vae", fieldValue: "v.safetensors" });
    assert.deepEqual(got[2], { modelType: "", fieldValue: "" });
});

test("SelectMod : lit les exports de MultiFiles Select (JSON et ancien .txt)", () => {
    const mfs = JSON.stringify({ format: "MultiFiles Select", version: 1, fields: [{ field: 3, type: "loras", path: "x.safetensors" }] });
    assert.deepEqual(parseFieldsFile(mfs, 7)[3], { modelType: "loras", fieldValue: "x.safetensors" });
    const txt = "1 - diffusion_models : G:\\m\\a.safetensors\n2 - vae : v.safetensors\n";
    const got = parseFieldsFile(txt, 7);
    assert.deepEqual(got[1], { modelType: "diffusion_models", fieldValue: "G:\\m\\a.safetensors" });
    assert.deepEqual(got[2], { modelType: "vae", fieldValue: "v.safetensors" });
    assert.throws(() => parseFieldsFile(JSON.stringify({ format: "Other", fields: [] }), 7),
        /Not a SelectMod or MultiFiles Select fields file/);
    assert.throws(() => parseFieldsFile("{ bad", 7), /Invalid JSON/);
});

test("SelectMod : tri du tableau de fichiers", () => {
    const files = [
        { name: "a10.safetensors", size: 300, mtime: 2 },
        { name: "A2.safetensors", size: 100, mtime: 3 },
        { name: "b.gguf", size: 200, mtime: 1 },
    ];
    assert.deepEqual(sortFiles(files, "name", true).map((f) => f.name), ["A2.safetensors", "a10.safetensors", "b.gguf"]);
    assert.deepEqual(sortFiles(files, "name", false).map((f) => f.name), ["b.gguf", "a10.safetensors", "A2.safetensors"]);
    assert.deepEqual(sortFiles(files, "size", true).map((f) => f.size), [100, 200, 300]);
    assert.deepEqual(sortFiles(files, "mtime", false).map((f) => f.mtime), [3, 2, 1]);
    assert.equal(files[0].name, "a10.safetensors"); // la liste d'origine n'est pas modifiee
});

test("SelectMod : taille lisible", () => {
    assert.equal(sizeText(512 * 1024 * 1024), "512 MB");
    assert.equal(sizeText(6.4 * 1024 * 1024 * 1024), "6.4 GB");
    assert.equal(sizeText(1536), "2 KB");
    assert.equal(sizeText(0), "0 KB");
});

test("SelectMod : recherche sans accents ni casse, tous les mots", () => {
    assert.ok(matchesSearch("ete_v2.safetensors", "Été"));
    assert.ok(matchesSearch("Wan2.2_T2V_fp8.safetensors", "wan fp8"));
    assert.ok(!matchesSearch("Wan2.2_T2V_fp8.safetensors", "wan bf16"));
    assert.ok(matchesSearch("x.safetensors", "  "));
});

test("SelectMod : aide EN / FR, memes rubriques dans le meme ordre", async () => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(new URL("../web/js/select_mod_node.js", import.meta.url), "utf-8");
    const block = (name) => {
        const start = text.indexOf("const " + name + " = [");
        const end = text.indexOf("\n];", start);
        return [...text.slice(start, end).matchAll(/^ {8}id: "(\w+)"/gm)].map((m) => m[1]);
    };
    const order = ["start", "fields", "window", "mode", "export", "project", "good"];
    assert.deepEqual(block("HELP_SECTIONS"), order);
    assert.deepEqual(block("HELP_SECTIONS_FR"), order);
});

test("SelectMod : clic dans la fenetre, chemin relatif depuis le dossier de type (29/10/2026)", () => {
    const root = "G:\\GenerateurIA\\models";
    assert.deepEqual(pickTarget(root, root + "\\diffusion_models\\MINIMAXH3\\convrot\\m.safetensors"),
        { origin: root + "\\diffusion_models", subdir: "MINIMAXH3/convrot" });
    assert.deepEqual(pickTarget(root, root + "\\vae\\v.safetensors"), { origin: root + "\\vae", subdir: "" });
    // Fichier pose directement dans models : pas de dossier de type.
    assert.deepEqual(pickTarget(root, root + "\\x.safetensors"), { origin: root, subdir: "" });
    assert.deepEqual(pickTarget("F:/C/models/", "F:/C/models/loras/a/b.safetensors"), { origin: "F:/C/models/loras", subdir: "a" });
});

