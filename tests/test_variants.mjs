// node --test tests/test_variants.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
    FALLBACK_DESCRIPTION, CONTAINER_OUTPUTS, variantOf, modelOf, variantsOfModel, rowsOf, rowList, setRowList,
    variantLimits, stepFrame, framesStep, settingValue, variantLayout, variantLayoutKeys, migrateState,
    parseVariantState, variantModeLinks, routeDescription,
} from "../web/js/profiles.js";

const CASES = JSON.parse(fs.readFileSync(new URL("./variant_cases.json", import.meta.url), "utf-8"));

test("variantes : dispositions partagees", () => {
    for (const c of CASES.layout) assert.deepEqual(variantLayoutKeys(migrateState(c.state)), c.keys, JSON.stringify(c.state));
});

test("variantes : reglages partages", () => {
    for (const c of CASES.settings) {
        const lim = variantLimits(migrateState(c.state));
        for (const [k, v] of Object.entries(c.values)) assert.equal(settingValue(k, lim), v, k);
    }
});

test("variantes : pas d'images", () => {
    for (const [f, s, exp] of CASES.step_frame) assert.equal(stepFrame(f, s), exp);
    for (const [n, s, exp] of CASES.frames_step) assert.equal(framesStep(n, s), exp);
});

test("variantes : migration partagee (meme resultat que Python)", () => {
    for (const c of CASES.migrate) {
        const s = migrateState(c.state);
        assert.equal(s.variant, c.variant);
        for (const [v, rows] of Object.entries(c.rows)) {
            for (const [rid, list] of Object.entries(rows)) assert.deepEqual(s.selections[v].rows[rid], list, v + " " + rid);
        }
        for (const [v, trims] of Object.entries(c.trims || {})) {
            for (const [rid, t] of Object.entries(trims)) assert.deepEqual(s.selections[v].trims[rid], t);
        }
        for (const [v, moments] of Object.entries(c.moments || {})) {
            for (const [rid, m] of Object.entries(moments)) assert.deepEqual(s.selections[v].moments[rid], m);
        }
        for (const [v, lim] of Object.entries(c.limits || {})) {
            for (const [k, x] of Object.entries(lim)) assert.deepEqual(s.limits[v][k], x);
        }
        for (const [k, x] of Object.entries(c.keep || {})) assert.deepEqual(s[k], x);
        assert.deepEqual(migrateState(s), s);
    }
});

test("variantes : modeles, lignes, liste d'une ligne", () => {
    assert.deepEqual(variantsOfModel(null, "ltx"), ["ltx.2_3", "ltx.2_5"]);
    assert.equal(modelOf(null, "minimax_h3.fl2va"), "minimax_h3");
    assert.deepEqual(rowsOf(null, "ltx.2_5").map((r) => r.id), ["guide_images", "guide_video", "soundtrack", "voice"]);
    const s = migrateState({ variant: "ltx.2_3" });
    setRowList(s, "guide_images", ["a.png"], "ltx.2_5");
    assert.deepEqual(rowList(s, "guide_images", "ltx.2_5"), ["a.png"]);
    assert.deepEqual(rowList(s, "guide_images"), []); // LTX 2.3 inchange
    assert.equal(variantOf({ profile: "ltx2" }), "ltx.2_3");
    assert.equal(variantOf(parseVariantState('{"mode":"fl2va"}')), "minimax_h3.fl2va");
    assert.equal(variantOf(parseVariantState("{bad")), "minimax_h3.ref2va");
});

test("variantes : liens par mode anciens -> variantes", () => {
    const a = [{ key: "ref_image_1" }];
    const b = [{ key: "first_frame" }];
    const n = [{ key: "ref_image_2" }];
    assert.deepEqual(variantModeLinks({ ref2va: a, fl2va: b, ltx2: n }),
        { "minimax_h3.ref2va": a, "minimax_h3.fl2va": b, "ltx.2_3": n });
    assert.deepEqual(variantModeLinks({ ref2va: a, "minimax_h3.ref2va": n }), { "minimax_h3.ref2va": n });
    assert.deepEqual(variantModeLinks(undefined), {});
});

test("variantes : la plus grande disposition tient dans le Container", () => {
    let biggest = 0;
    for (const [v, d] of Object.entries(FALLBACK_DESCRIPTION.variants)) {
        const rows = {};
        for (const r of d.rows) rows[r.id] = Array.from({ length: r.max }, (_, i) => "f" + i);
        biggest = Math.max(biggest, variantLayout(migrateState({ variant: v, selections: { [v]: { rows } } })).length);
    }
    assert.ok(biggest <= CONTAINER_OUTPUTS);
    assert.equal(routeDescription(null), FALLBACK_DESCRIPTION);
    assert.equal(routeDescription({ variants: {}, models: {}, default: "x" }).default, "x");
    assert.equal(routeDescription({ profiles: [], default: "minimax_h3", description: { variants: {}, models: {}, default: "y" } }).default, "y");
    assert.equal(routeDescription({ profiles: [], default: "minimax_h3" }), FALLBACK_DESCRIPTION);
});
