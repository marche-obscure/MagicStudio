// Tests de la recherche de l'aide (sans ComfyUI) :
//     node --test tests/test_config_format.mjs tests/test_config_json.mjs tests/test_help_search.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { stripTags, filterSections, foldText, findMatches, pickLanguage } from "../web/js/help_search.js";

const SECTIONS = [
    { id: "start", title: "Quick start", html: "<p>Pick <b>files</b> in the gallery.</p>" },
    { id: "trim", title: "Trim", html: "<p>Set the start &amp; end, then <code>\"trim\": [2.5, 8]</code>.</p>" },
    { id: "save", title: "Save and load", html: "<p>One .json file per mode.</p>" },
];

test("texte sans balises ni entites", () => {
    assert.equal(stripTags("<p>Set <b>start</b> &amp; end &lt;Picture 1&gt;</p>"), "Set start & end <Picture 1>");
});

test("recherche vide : toutes les rubriques", () => {
    assert.deepEqual(filterSections(SECTIONS, ""), ["start", "trim", "save"]);
    assert.deepEqual(filterSections(SECTIONS, "   "), ["start", "trim", "save"]);
});

test("recherche dans le titre et le texte, sans casse", () => {
    assert.deepEqual(filterSections(SECTIONS, "TRIM"), ["trim"]);
    assert.deepEqual(filterSections(SECTIONS, "json"), ["save"]);
    assert.deepEqual(filterSections(SECTIONS, "gallery"), ["start"]);
});

test("plusieurs mots : tous doivent etre presents", () => {
    assert.deepEqual(filterSections(SECTIONS, "start end"), ["trim"]);
    assert.deepEqual(filterSections(SECTIONS, "json gallery"), []);
});

test("les balises ne sont pas trouvees", () => {
    assert.deepEqual(filterSections(SECTIONS, "code"), []);
});

test("accents et casse ignores", () => {
    assert.equal(foldText("Résumé ÉTÉ"), "resume ete");
    const fr = [{ id: "a", title: "Rognage", html: "<p>Le fichier n'est jamais modifié.</p>" }];
    assert.deepEqual(filterSections(fr, "modifie"), ["a"]);
    assert.deepEqual(filterSections(fr, "RÔGNAGE"), ["a"]);
});

test("positions des mots trouves dans le texte d'origine", () => {
    assert.deepEqual(findMatches("Le fichier modifié, Modifié.", ["modifie"]), [[11, 18], [20, 27]]);
    assert.deepEqual(findMatches("trim and Trim", ["trim", "and"]), [[0, 4], [5, 8], [9, 13]]);
    assert.deepEqual(findMatches("rien", []), []);
});

test("langue : choix memorise, puis ComfyUI, puis navigateur, sinon anglais", () => {
    assert.equal(pickLanguage("fr", "en", "en-US"), "fr");
    assert.equal(pickLanguage(null, "fr", "en-US"), "fr");
    assert.equal(pickLanguage(null, null, "fr-FR"), "fr");
    assert.equal(pickLanguage(null, "zh", "de-DE"), "en");
    assert.equal(pickLanguage("xx", null, null), "en");
});

// --- Aide EN / FR : memes rubriques dans le meme ordre ---
// Les fichiers du noeud importent scripts/app.js (impossible sous Node) :
// on les lit comme du texte et on extrait les id des deux tableaux.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function helpIds(file, name) {
    const src = readFileSync(fileURLToPath(new URL("../web/js/" + file, import.meta.url)), "utf8");
    const start = src.indexOf("const " + name + " = [");
    assert.ok(start >= 0, name + " introuvable dans " + file);
    // fin du tableau : premiere ligne "];" apres le debut
    const end = src.indexOf("\n];", start);
    assert.ok(end > start, "fin de " + name + " introuvable dans " + file);
    const body = src.slice(start, end);
    return [...body.matchAll(/^ {8}id: "([a-z0-9_]+)"/gm)].map((m) => m[1]);
}

const HELP_FILES = ["minimax_ref_loader.js", "project_node.js", "final_cut_node.js", "load_media_node.js",
    "container_node.js", "save_voice_node.js"];

for (const file of HELP_FILES) {
    test("help sections have the same ids in EN and FR: " + file, () => {
        const en = helpIds(file, "HELP_SECTIONS");
        const fr = helpIds(file, "HELP_SECTIONS_FR");
        assert.ok(en.length > 0, "aucune rubrique EN");
        assert.deepEqual(fr, en);
    });
}

test("RefLoader help order starts with quick, models", () => {
    const en = helpIds("minimax_ref_loader.js", "HELP_SECTIONS");
    assert.deepEqual(en.slice(0, 2), ["start", "models"]);
});

// --- Anciens noms interdits dans les aides (chaines coupees par " + " comprises) ---
test("help arrays contain no old node names", () => {
    const OLD = ["Reference Loader", "Ref Loader", "MiniMax H3 Project", "MiniMax H3 Final Cut", "MiniMax H3 Load Media"];
    for (const file of HELP_FILES) {
        const src = readFileSync(fileURLToPath(new URL("../web/js/" + file, import.meta.url)), "utf8");
        const a = src.indexOf("const HELP_SECTIONS = [");
        const frStart = src.indexOf("const HELP_SECTIONS_FR = [");
        const end = src.indexOf("\n];", frStart);
        // Recolle les chaines coupees : fin de guillemet + plus + debut de guillemet (retours a la ligne compris).
        const text = src.slice(a, end).replace(/"\s*\+\s*"/g, "").replace(/\s+/g, " ")
            // Cle de format du fichier JSON : nom technique, pas un titre de noeud.
            .replaceAll('"format": "MiniMax H3 Reference Loader"', "");
        for (const old of OLD) {
            assert.ok(!text.includes(old), file + " contient encore \u00ab " + old + " \u00bb");
        }
    }
});

// --- Aide Project : rubrique extract juste apres rushsort, EN et FR ---
test("project help has an extract section after rushsort", () => {
    const en = helpIds("project_node.js", "HELP_SECTIONS");
    const fr = helpIds("project_node.js", "HELP_SECTIONS_FR");
    for (const ids of [en, fr]) {
        const i = ids.indexOf("rushsort");
        assert.ok(i >= 0, "rushsort introuvable");
        assert.equal(ids[i + 1], "extract");
    }
    assert.equal(en.indexOf("extract"), fr.indexOf("extract"));
});

// --- Variantes (plan des variantes, Task 8) ---
/** Texte d'un tableau d'aide (chaines recollees), pour chercher des mots. */
function helpText(file, name) {
    const src = readFileSync(fileURLToPath(new URL("../web/js/" + file, import.meta.url)), "utf8");
    const start = src.indexOf("const " + name + " = [");
    const end = src.indexOf("\n];", start);
    return src.slice(start, end).replace(/"\s*\+\s*"/g, "").replace(/\s+/g, " ");
}

test("help mentions every variant label", () => {
    for (const name of ["HELP_SECTIONS", "HELP_SECTIONS_FR"]) {
        const text = helpText("minimax_ref_loader.js", name);
        for (const label of ["Ref2VA", "F2VA / FL2VA", "LTX 2.3", "LTX 2.5"]) {
            assert.ok(text.includes(label), name + " : « " + label + " » absent");
        }
        assert.ok(text.includes("package"), name + " : package absent");
        assert.ok(text.includes("MagicStudio Container"), name + " : Container absent");
    }
});

test("container help EN and FR have the same ids", () => {
    const en = helpIds("container_node.js", "HELP_SECTIONS");
    assert.deepEqual(en, ["start", "inputs", "outputs", "variants"]);
    assert.deepEqual(helpIds("container_node.js", "HELP_SECTIONS_FR"), en);
});

// --- Lien project_used (30/10/2026) : plus de nom de lien final_cut dans les aides ---
test("help arrays no longer name the link final_cut", () => {
    for (const file of ["project_node.js", "final_cut_node.js", "save_voice_node.js"]) {
        for (const name of ["HELP_SECTIONS", "HELP_SECTIONS_FR"]) {
            // "Final Cut" (noeud) et "Final-Cut_" (dossier) restent : on cherche le nom du lien seul.
            const text = helpText(file, name).replaceAll("final_cut.py", "");
            assert.ok(!text.includes("final_cut"), file + " " + name + " : final_cut encore cite");
            assert.ok(text.includes("project_used"), file + " " + name + " : project_used absent");
        }
    }
});
