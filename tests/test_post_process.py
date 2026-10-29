"""
Tests du module post_process (post-traitements rattaches au Run d'origine, sans
ComfyUI) : lancer depuis la racine de l'extension avec le Python embarque :

    ..\\..\\..\\python_embeded\\python.exe -m unittest discover -s tests -v
"""

import json
import os
import shutil
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import final_cut as fc  # noqa: E402
import post_process as pp  # noqa: E402
import projects  # noqa: E402
import run_record as rr  # noqa: E402


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


def write(path, data=b"x"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


class FindMotherTest(unittest.TestCase):
    """Retrouver le Run qui a produit le fichier charge par MedLoad."""

    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.p = projects.create_project(self.root, "Clip")
        self.video = os.path.join(self.p, "40.Rush Videos", "Footage", "20261029_100000_run.mp4")
        write(self.video, b"video A")
        self.run = self.write_run("20261029_100000_run.json", [{"source": self.video, "kind": "video",
                                                                "copy": None, "in_place": True}])

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def write_run(self, name, outputs, status="done", project=None):
        path = os.path.join(project or self.p, "04.Prompt", name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"status": status, "date": "2026-10-29 10:00:00", "outputs": outputs}, f)
        return path

    def check(self, found, run, index=0, level=0):
        self.assertIsNotNone(found)
        self.assertEqual(os.path.normcase(found["run_file"]), os.path.normcase(run))
        self.assertEqual((found["index"], found["level"]), (index, level))

    def test_find_run_from_source(self):
        self.check(pp.find_mother(self.video), self.run)

    def test_find_run_from_copy(self):
        orig = os.path.join(self.root, "output", "big.mp4")
        write(orig, b"big")
        copy = os.path.join(self.p, "40.Rush Videos", "Footage", "20261029_110000_run.mp4")
        write(copy, b"small")
        run = self.write_run("20261029_110000_run.json", [{"source": orig, "kind": "video",
                                                           "copy": "40.Rush Videos/Footage/20261029_110000_run.mp4"}])
        self.check(pp.find_mother(copy), run)

    def test_find_run_after_sort(self):
        rr.sort_output(self.p, os.path.basename(self.run), 0, "picture_lock")
        moved = os.path.join(self.p, "40.Rush Videos", "Picture Lock", os.path.basename(self.video))
        self.assertTrue(os.path.isfile(moved))
        self.check(pp.find_mother(moved), self.run)

    def test_final_cut_copy_of_simple_project(self):
        rr.sort_output(self.p, os.path.basename(self.run), 0, "picture_lock")
        copy = os.path.join(self.p, "Final-Cut_Clip", "Video", "_00_" + os.path.basename(self.video))
        write(copy, b"video A")
        self.assertEqual(os.path.normcase(fc.source_of(copy)),
                         os.path.normcase(os.path.join(self.p, "40.Rush Videos", "Picture Lock",
                                                       os.path.basename(self.video))))
        self.check(pp.find_mother(copy), self.run)

    def test_final_cut_copy_of_sub_project(self):
        a = projects.create_project(self.root, "A", group="Serie", new_group=True)
        time.sleep(0.05)
        b = projects.create_project(self.root, "B", group="Serie")
        group = os.path.dirname(b)
        num = [k for k, v in fc.group_numbers(group).items() if v == "B"][0]
        self.assertNotEqual(num, "00")
        lock = os.path.join(b, "40.Rush Videos", "Picture Lock", "20261029_120000_run.mp4")
        write(lock, b"video B")
        run = self.write_run("20261029_120000_run.json", [{"source": lock, "kind": "video", "copy": None,
                                                           "in_place": True}], project=b)
        copy = os.path.join(group, "Final-Cut_Serie", "Video", "_%s_20261029_120000_run.mp4" % num)
        write(copy, b"video B")
        self.check(pp.find_mother(copy), run)
        self.assertTrue(os.path.isdir(a))

    def test_outside_any_run_gives_none(self):
        other = os.path.join(self.root, "input", "loose.mp4")
        write(other)
        self.assertIsNone(pp.find_mother(other))
        free = os.path.join(self.p, "12.Video", "free.mp4")
        write(free)
        self.assertIsNone(pp.find_mother(free))
        self.assertIsNone(pp.find_mother(""))

    def test_running_mother_is_ignored(self):
        with open(self.run, "w", encoding="utf-8") as f:
            json.dump({"status": "running", "outputs": [{"source": self.video, "kind": "video"}]}, f)
        self.assertIsNone(pp.find_mother(self.video))

    def test_level_of_a_post(self):
        post = os.path.join(self.p, "40.Rush Videos", "Footage", "20261029_100000_run_post01.mp4")
        write(post, b"B")
        with open(self.run, "r", encoding="utf-8") as f:
            data = json.load(f)
        data["outputs"].append({"source": post, "kind": "video", "copy": None, "in_place": True,
                                "post_of": 0, "post_level": 1})
        with open(self.run, "w", encoding="utf-8") as f:
            json.dump(data, f)
        self.check(pp.find_mother(post), self.run, index=1, level=1)


if __name__ == "__main__":
    unittest.main()
