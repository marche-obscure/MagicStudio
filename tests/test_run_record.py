"""
Tests du module run_record (sans ComfyUI) : lancer depuis la racine de
l'extension avec le Python embarque :

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

import projects  # noqa: E402
import run_record as rr  # noqa: E402


def write(path, data=b"x"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def read_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# Run d'exemple : KSampler avec un seed venant d'un noeud Primitive.
PROMPT = {
    "3": {"class_type": "KSampler", "inputs": {"seed": ["5", 0], "steps": 30, "cfg": 7.5, "model": ["4", 0]}},
    "5": {"class_type": "PrimitiveInt", "inputs": {"value": 44}},
    "1": {"class_type": "MiniMaxH3RefLoader", "inputs": {"state": json.dumps({"mode": "fl2va"})}},
}


class RunParamsTest(unittest.TestCase):
    def test_ksampler_and_primitive_link(self):
        self.assertEqual(rr.run_params(PROMPT), {"cfg": 7.5, "steps": 30, "seed": 44})
        self.assertEqual(rr.run_mode(PROMPT), "FL2VA")

    def test_custom_sampler_nodes(self):
        prompt = {
            "10": {"class_type": "RandomNoise", "inputs": {"noise_seed": 123}},
            "11": {"class_type": "CFGGuider", "inputs": {"cfg": 4, "model": ["2", 0]}},
            "12": {"class_type": "BasicScheduler", "inputs": {"steps": 20, "scheduler": "simple"}},
        }
        self.assertEqual(rr.run_params(prompt), {"cfg": 4, "steps": 20, "seed": 123})

    def test_nothing_found(self):
        self.assertEqual(rr.run_params({"1": {"class_type": "X", "inputs": {"text": "a"}}}),
                         {"cfg": None, "steps": None, "seed": None})
        self.assertEqual(rr.run_params(None), {"cfg": None, "steps": None, "seed": None})
        self.assertIsNone(rr.run_mode({}))


class RunFileTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.p = projects.create_project(self.root, "Clip")
        self.out = os.path.join(self.root, "output")
        self.when = time.mktime((2026, 10, 17, 15, 30, 0, 0, 0, -1))

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_start_writes_json(self):
        path = rr.start_run(self.p, "a red car", PROMPT, self.when)
        self.assertEqual(path, os.path.join(self.p, "04.Prompt", "20261017_153000_run.json"))
        data = read_json(path)
        self.assertEqual(data, {"date": "2026-10-17 15:30:00", "project": "Clip", "mode": "FL2VA",
                                "prompt": "a red car", "cfg": 7.5, "steps": 30, "seed": 44,
                                "status": "running", "outputs": []})
        # Meme seconde : la suivante.
        self.assertTrue(rr.start_run(self.p, "b", PROMPT, self.when).endswith("20261017_153001_run.json"))

    def test_finish_copies_outputs_to_rushes(self):
        path = rr.start_run(self.p, "p", PROMPT, self.when)
        write(os.path.join(self.out, "ComfyUI_00001_.png"), b"i1")
        write(os.path.join(self.out, "sub", "ComfyUI_00002_.png"), b"i2")
        write(os.path.join(self.out, "video", "clip_00001.mp4"), b"v")
        write(os.path.join(self.out, "sound.flac"), b"s")
        files = [
            {"filename": "ComfyUI_00001_.png", "subfolder": "", "type": "output"},
            {"filename": "ComfyUI_00002_.png", "subfolder": "sub", "type": "output"},
            {"filename": "ComfyUI_00001_.png", "subfolder": "", "type": "output"},       # deja vu
            {"filename": "preview.png", "subfolder": "", "type": "temp"},               # apercu : ignore
            {"filename": "clip_00001.mp4", "subfolder": "video", "type": "output"},
            {"filename": "sound.flac", "subfolder": "", "type": "output"},              # ni image ni video
            {"filename": "../../escape.png", "subfolder": "", "type": "output"},         # hors de output
        ]
        data = rr.finish_run(path, files, "done", self.out)
        self.assertEqual(data["status"], "done")
        self.assertEqual([o["copy"] for o in data["outputs"]], [
            "60.Rush Images/20261017_153000_run.png", "60.Rush Images/20261017_153000_run_02.png",
            "40.Rush Videos/20261017_153000_run.mp4", None])
        with open(os.path.join(self.p, "60.Rush Images", "20261017_153000_run_02.png"), "rb") as f:
            self.assertEqual(f.read(), b"i2")
        self.assertEqual(read_json(path)["outputs"], data["outputs"])
        # Deja termine : rien n'est refait.
        again = rr.finish_run(path, [], "error", self.out)
        self.assertEqual(again["status"], "done")

    def test_error_status_and_bad_files(self):
        path = rr.start_run(self.p, "p", PROMPT, self.when)
        self.assertEqual(rr.finish_run(path, [], "interrupted", self.out)["status"], "error")
        with self.assertRaises(ValueError):
            rr.finish_run(os.path.join(self.p, "04.Prompt", "notes.json"), [], "done", self.out)
        with self.assertRaises(ValueError):
            rr.finish_run(os.path.join(self.p, "08.Images", "20261017_153000_run.json"), [], "done", self.out)
        with self.assertRaises(FileNotFoundError):
            rr.finish_run(os.path.join(self.p, "04.Prompt", "20261017_160000_run.json"), [], "done", self.out)
        with self.assertRaises(FileNotFoundError):
            rr.start_run(os.path.join(self.root, "nope"), "p")


if __name__ == "__main__":
    unittest.main()
