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

    def test_default_moment(self):
        for used, exp in CASES["default_moment"]:
            self.assertEqual(profiles.default_moment(used), exp, used)

    def test_moment_clamped(self):
        self.assertEqual(profiles.seconds_to_frame(25, 24, 20), 480)

    def test_fit_size(self):
        self.assertEqual(profiles.fit_size(1920, 1080, [768, 1344], 32), (1344, 736))
        self.assertEqual(profiles.fit_size(500, 300, [768, 1344], 32), (480, 288))
        self.assertEqual(profiles.fit_size(500, 300, [768, 1344], 1), (500, 300))

    def test_profile_of_and_tolerance(self):
        self.assertEqual(profiles.profile_of({}), "minimax_h3")
        self.assertEqual(profiles.profile_of({"profile": "ltx2"}), "ltx2")
        self.assertEqual(profiles.profile_of({"profile": "zzz"}), "minimax_h3")
        self.assertEqual(profiles.profile_of(None), "minimax_h3")

