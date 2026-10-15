// Tests des chemins des fichiers de configuration (sans ComfyUI) :
//     node --test tests/test_config_format.mjs tests/test_config_json.mjs tests/test_help_search.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { toRelative, toAbsolute, trimKey } from "../web/js/config_format.js";

const ROOT = "F:\\Rushs\\Projet";

test("chemin sous la racine ecrit en relatif, ailleurs en absolu", () => {
    assert.equal(toRelative(ROOT, ROOT + "\\images\\a.png"), "images\\a.png");
    assert.equal(toRelative(ROOT, "f:/rushs/projet/x.png"), "x.png");
    assert.equal(toRelative(ROOT, "F:\\Rushs\\Projet2\\x.png"), "F:\\Rushs\\Projet2\\x.png");
    assert.equal(toRelative("", "C:\\a.png"), "C:\\a.png");
});

test("chemin relatif rejoint la racine, absolu garde tel quel", () => {
    assert.equal(toAbsolute(ROOT, "images\\a.png"), ROOT + "\\images\\a.png");
    assert.equal(toAbsolute(ROOT + "\\", "a.png"), ROOT + "\\a.png");
    assert.equal(toAbsolute(ROOT, "D:\\x.png"), "D:\\x.png");
    assert.equal(toAbsolute(ROOT, "\\\\nas\\x.png"), "\\\\nas\\x.png");
    assert.equal(toAbsolute("F:/r", "sub/a.png"), "F:/r/sub/a.png");
});

test("cle de rognage : casse et separateurs ignores", () => {
    assert.equal(trimKey("F:\\Rush\\A.mp4"), trimKey("f:/rush/a.mp4"));
});
