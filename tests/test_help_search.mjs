// Tests de la recherche de l'aide (sans ComfyUI) :
//     node --test tests/test_config_format.mjs tests/test_config_json.mjs tests/test_help_search.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { stripTags, filterSections } from "../web/js/help_search.js";

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
