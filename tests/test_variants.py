"""
Tests de la description des variantes (profiles.py, sans ComfyUI) : lancer depuis
la racine de l'extension avec le Python embarque :

    ..\\..\\..\\python_embeded\\python.exe -m unittest discover -s tests -v
"""

import json
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import profiles as p  # noqa: E402

# Cas partages avec tests/test_variants.mjs (meme verdict en JS).
with open(os.path.join(HERE, "variant_cases.json"), encoding="utf-8") as f:
    CASES = json.load(f)


class VariantsTest(unittest.TestCase):
    def test_shared_layout(self):
        for c in CASES["layout"]:
            self.assertEqual(p.variant_layout_keys(p.migrate_state(c["state"])), c["keys"], c["state"])

    def test_shared_settings(self):
        for c in CASES["settings"]:
            lim = p.variant_limits(p.migrate_state(c["state"]))
            for k, v in c["values"].items():
                self.assertEqual(p.setting_value(k, lim), v, (c["state"], k))

    def test_shared_steps(self):
        for f, s, exp in CASES["step_frame"]:
            self.assertEqual(p.step_frame(f, s), exp, (f, s))
        for n, s, exp in CASES["frames_step"]:
            self.assertEqual(p.frames_step(n, s), exp, (n, s))

    def test_shared_migrate(self):
        for c in CASES["migrate"]:
            s = p.migrate_state(c["state"])
            self.assertEqual(s["variant"], c["variant"])
            for v, rows in c["rows"].items():
                for rid, names in rows.items():
                    self.assertEqual(s["selections"][v]["rows"][rid], names, (v, rid))
            for v, trims in (c.get("trims") or {}).items():
                for rid, t in trims.items():
                    self.assertEqual(s["selections"][v]["trims"][rid], t)
            for v, moments in (c.get("moments") or {}).items():
                for rid, m in moments.items():
                    self.assertEqual(s["selections"][v]["moments"][rid], m)
            for v, lim in (c.get("limits") or {}).items():
                for k, x in lim.items():
                    self.assertEqual(s["limits"][v][k], x, (v, k))
            for k, x in (c.get("keep") or {}).items():
                self.assertEqual(s[k], x)
            # Etat deja migre : inchange.
            self.assertEqual(p.migrate_state(s), s)

    def test_ltx_25_same_rows_as_23(self):
        self.assertEqual(p.VARIANTS["ltx.2_5"]["rows"], p.VARIANTS["ltx.2_3"]["rows"])
        self.assertEqual(p.VARIANTS["ltx.2_5"]["label"], "LTX 2.5")
        self.assertEqual(p.variants_of_model("ltx"), ["ltx.2_3", "ltx.2_5"])
        self.assertEqual(p.variants_of_model("minimax_h3"), ["minimax_h3.ref2va", "minimax_h3.fl2va"])

    def test_container_outputs_fit_largest_layout(self):
        biggest = 0
        for v, d in p.VARIANTS.items():
            sel = {r["id"]: ["f%d" % i for i in range(r["max"])] for r in d["rows"]}
            state = p.migrate_state({"variant": v, "selections": {v: {"rows": sel}}})
            biggest = max(biggest, len(p.variant_layout(state)))
        self.assertLessEqual(biggest, p.CONTAINER_OUTPUTS)

    def test_limits_bounded(self):
        s = {"variant": "ltx.2_3", "limits": {"ltx.2_3": {"counts": {"guide_images": 50, "voice": 0},
                                                         "seconds": 999, "frame_step": 0, "max_size": [9, 99999]}}}
        lim = p.variant_limits(s)
        self.assertEqual(lim["counts"]["guide_images"], 9)
        self.assertEqual(lim["counts"]["voice"], 1)
        self.assertEqual(lim["seconds"], 60)
        self.assertEqual(lim["frame_step"], 1)
        self.assertEqual(lim["max_size"], [64, 4096])

    def test_js_fallback_matches(self):
        with open(os.path.join(os.path.dirname(HERE), "web", "js", "profiles.js"), encoding="utf-8") as f:
            src = f.read()
        m = re.search(r"/\* FALLBACK_DESCRIPTION \*/(.*?)/\* END \*/", src, re.S)
        self.assertIsNotNone(m)
        self.assertEqual(json.loads(m.group(1)), json.loads(json.dumps(p.description())))


if __name__ == "__main__":
    unittest.main()
