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
