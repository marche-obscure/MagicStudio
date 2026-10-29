"""
Tests du module post_process (post-traitements rattaches au Run d'origine, sans
ComfyUI) : lancer depuis la racine de l'extension avec le Python embarque :

    ..\\..\\..\\python_embeded\\python.exe -m unittest discover -s tests -v
"""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import post_process as pp  # noqa: E402


def node(cls, **inputs):
    return {"class_type": cls, "inputs": inputs, "_meta": {"title": cls}}


class UpstreamTest(unittest.TestCase):
    """Regle d'amont : le noeud qui enregistre a-t-il un MedLoad en amont ?"""

    def test_saver_downstream_of_medload(self):
        p = {"1": node(pp.MEDLOAD, file="G:\\in\\a.mp4"), "2": node("Light", video=["1", 0], gain=1.2),
             "3": node("SaveVideo", video=["2", 0])}
        self.assertEqual(pp.upstream_medloads(p, "3"), [("1", 2)])

    def test_saver_not_downstream(self):
        p = {"1": node("KSampler", seed=1), "2": node("VAEDecode", samples=["1", 0]), "3": node("SaveImage", images=["2", 0])}
        self.assertEqual(pp.upstream_medloads(p, "3"), [])

    def test_two_medloads_nearest_first(self):
        p = {"1": node(pp.MEDLOAD, file="a"), "2": node("Light", video=["1", 0]), "3": node("Blend", a=["2", 0]),
             "4": node(pp.MEDLOAD, file="b"), "5": node("Mix", a=["3", 0], b=["4", 0])}
        self.assertEqual(pp.upstream_medloads(p, "5")[0], ("4", 1))
        self.assertEqual(pp.upstream_medloads(p, "5"), [("4", 1), ("1", 3)])

    def test_medload_file_from_link(self):
        p = {"1": node("PrimitiveString", value="G:\\in\\a.mp4"), "2": node(pp.MEDLOAD, file=["1", 0]),
             "3": node(pp.MEDLOAD, file=["99", 0]), "4": node(pp.MEDLOAD, file="  G:\\in\\b.png ")}
        self.assertEqual(pp.medload_file(p, "2"), "G:\\in\\a.mp4")
        self.assertEqual(pp.medload_file(p, "3"), "")
        self.assertEqual(pp.medload_file(p, "4"), "G:\\in\\b.png")

    def test_branch_params_limited(self):
        p = {"1": node("KSampler", seed=7, steps=20, cfg=4.0), "2": node("VAEDecode", samples=["1", 0]),
             "3": node(pp.MEDLOAD, file="a"), "4": node("Light", video=["3", 0], gain=1.5),
             "5": node("SaveVideo", video=["4", 0], extra=["2", 0])}
        self.assertEqual(pp.branch_nodes(p, "3", "5"), {"4"})
        params = pp.branch_params(p, "3", "5")
        self.assertIsNone(params["seed"])
        self.assertEqual(params["nodes"], [{"id": "4", "title": "Light", "class_type": "Light", "values": {"gain": 1.5}}])

    def test_cycle_safe(self):
        p = {"1": node(pp.MEDLOAD, file="a"), "2": node("A", x=["3", 0], y=["1", 0]), "3": node("B", x=["2", 0]),
             "4": node("Save", v=["3", 0])}
        self.assertEqual(pp.upstream_medloads(p, "4"), [("1", 3)])
        self.assertEqual(pp.branch_nodes(p, "1", "4"), {"2", "3"})


if __name__ == "__main__":
    unittest.main()
