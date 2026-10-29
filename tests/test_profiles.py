"""
Tests du module profiles (sans ComfyUI) : lancer depuis la racine de
l'extension avec le Python embarque :

    ..\\..\\..\\python_embeded\\python.exe -m unittest discover -s tests -v
"""

import json
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import profiles  # noqa: E402

# Cas partages avec tests/test_profiles.mjs (meme verdict en JS).
with open(os.path.join(HERE, "profile_cases.json"), encoding="utf-8") as f:
    CASES = json.load(f)


class SharedCasesTest(unittest.TestCase):
    def test_shared_cases(self):
        for s, fps, mx, exp in CASES["seconds_to_frame"]:
            self.assertEqual(profiles.seconds_to_frame(s, fps, mx), exp, (s, fps, mx))
        for f, exp in CASES["video_guide_frame"]:
            self.assertEqual(profiles.video_guide_frame(f), exp, f)
        for n, exp in CASES["frames_8n1"]:
            self.assertEqual(profiles.frames_8n1(n), exp, n)
        lim = profiles.limits_of({"profile": "ltx2"})
        for n, exp in CASES["ltx_layout"]:
            self.assertEqual(profiles.ltx_layout_keys(n, lim), exp, n)
        for c in CASES["limits"]:
            self.assertEqual(profiles.limits_of(c["state"])[c["key"]], c["expected"], c)

    def test_default_moment(self):
        for used, exp in CASES["default_moment"]:
            self.assertEqual(profiles.default_moment(used), exp, used)

    def test_moment_clamped(self):
        self.assertEqual(profiles.seconds_to_frame(25, 24, 20), 480)

    def test_limits_cap_layout(self):
        lim = dict(profiles.DEFAULT_LIMITS["ltx2"], guide_image=4)
        keys = profiles.ltx_layout_keys(9, lim)
        self.assertEqual(len([k for k in keys if k.startswith("guide_image_")]), 4)

    def test_fit_size(self):
        self.assertEqual(profiles.fit_size(1920, 1080, [768, 1344], 32), (1344, 736))
        self.assertEqual(profiles.fit_size(500, 300, [768, 1344], 32), (480, 288))
        self.assertEqual(profiles.fit_size(500, 300, [768, 1344], 1), (500, 300))

    def test_output_types(self):
        for k in ("guide_frame_1", "guide_frame_9", "guide_video_frame"):
            self.assertEqual(profiles.output_type(k), "INT")
        for k in ("soundtrack", "voice", "ref_video_audio_1", "ref_audio_2"):
            self.assertEqual(profiles.output_type(k), "AUDIO")
        for k in ("guide_image_1", "guide_video", "ref_image_1"):
            self.assertEqual(profiles.output_type(k), "IMAGE")
        self.assertEqual(profiles.output_type("project"), "MINIMAX_PROJECT")

    def test_profile_of_and_tolerance(self):
        self.assertEqual(profiles.profile_of({}), "minimax_h3")
        self.assertEqual(profiles.profile_of({"profile": "ltx2"}), "ltx2")
        self.assertEqual(profiles.profile_of({"profile": "zzz"}), "minimax_h3")
        self.assertEqual(profiles.profile_of(None), "minimax_h3")
        self.assertEqual(profiles.limits_of({"limits": "oops"}), profiles.DEFAULT_LIMITS["minimax_h3"])
        self.assertEqual(profiles.limits_of({"limits": {"minimax_h3": {"seconds": "abc"}}})["seconds"], 15)
        lim = profiles.limits_of({"limits": {"minimax_h3": {"max_size": [100000, 10]}}})
        self.assertEqual(lim["max_size"], [4096, 64])

    def test_js_fallback_matches(self):
        with open(os.path.join(os.path.dirname(HERE), "web", "js", "profiles.js"), encoding="utf-8") as f:
            src = f.read()
        m = re.search(r"/\* FALLBACK_LIMITS \*/(.*?)/\* END \*/", src, re.S)
        self.assertIsNotNone(m)
        self.assertEqual(json.loads(m.group(1)), profiles.DEFAULT_LIMITS)


if __name__ == "__main__":
    unittest.main()
