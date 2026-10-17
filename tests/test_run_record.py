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

    def test_switch_and_json_sliders(self):
        # Workflow reel : KSampler <- Switch (booleen) <- Pixaroma Sliders (etat JSON, une valeur par sortie).
        sliders = lambda steps, cfg: json.dumps({"version": 1, "sliders": [{"type": "int", "value": steps},
                                                                           {"type": "float", "value": cfg}]})
        prompt = {
            "225": {"class_type": "KSampler", "inputs": {"seed": ["244", 0], "steps": ["274", 0], "cfg": ["275", 0]}},
            "244": {"class_type": "PixaromaSeed", "inputs": {"SeedState": json.dumps({"runSeed": 77}), "seed": 77}},
            "270": {"class_type": "PrimitiveBoolean", "inputs": {"value": False}},
            "274": {"class_type": "ComfySwitchNode", "inputs": {"switch": ["270", 0], "on_false": ["332", 0], "on_true": ["335", 0]}},
            "275": {"class_type": "ComfySwitchNode", "inputs": {"switch": ["270", 0], "on_false": ["332", 1], "on_true": ["335", 1]}},
            "332": {"class_type": "PixaromaSliders", "inputs": {"SlidersState": sliders(25, 1.5)}},
            "335": {"class_type": "PixaromaSliders", "inputs": {"SlidersState": sliders(8, 1)}},
        }
        self.assertEqual(rr.run_params(prompt), {"cfg": 1.5, "steps": 25, "seed": 77})
        prompt["270"]["inputs"]["value"] = True
        self.assertEqual(rr.run_params(prompt), {"cfg": 1, "steps": 8, "seed": 77})

    def test_pass_through_and_computed_node(self):
        prompt = {
            "1": {"class_type": "KSampler", "inputs": {"seed": 5, "steps": ["2", 0], "cfg": ["4", 0]}},
            "2": {"class_type": "Reroute-like", "inputs": {"input": ["3", 0]}},
            "3": {"class_type": "PrimitiveInt", "inputs": {"value": 12}},
            "4": {"class_type": "MathExpression", "_meta": {"title": "Math CFG"},
                  "inputs": {"expression": "a*2", "a": ["5", 0], "b": ["6", 0]}},
            "5": {"class_type": "PrimitiveFloat", "inputs": {"value": 2.0}},
            "6": {"class_type": "PrimitiveFloat", "inputs": {"value": 3.0}},
            "9": {"class_type": "OtherNode", "inputs": {"seed": 999}},   # pas un sampler : apres le KSampler
        }
        self.assertEqual(rr.run_params(prompt), {"cfg": None, "steps": 12, "seed": 5, "cfg_from": "Math CFG"})

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

    def test_unchanged_run_is_not_recorded(self):
        write(os.path.join(self.out, "ComfyUI_00001_.png"), b"i1")
        files = [{"filename": "ComfyUI_00001_.png", "subfolder": "", "type": "output"}]
        first = rr.start_run(self.p, "p", PROMPT, self.when)
        rr.finish_run(first, files, "done", self.out)
        # Meme fichier renvoye par le cache de ComfyUI : JSON retire, rien de copie.
        second = rr.start_run(self.p, "p", PROMPT, self.when)
        res = rr.finish_run(second, files, "done", self.out)
        self.assertEqual(res, {"skipped": True, "same_as": "20261017_153000_run.json", "status": "done"})
        self.assertFalse(os.path.exists(second))
        self.assertEqual(os.listdir(os.path.join(self.p, "60.Rush Images")), ["20261017_153000_run.png"])
        # Nouveau fichier : enregistre.
        write(os.path.join(self.out, "ComfyUI_00002_.png"), b"i2")
        third = rr.start_run(self.p, "p", PROMPT, self.when)
        res = rr.finish_run(third, files + [{"filename": "ComfyUI_00002_.png", "subfolder": "", "type": "output"}],
                            "done", self.out)
        self.assertEqual(res["status"], "done")
        self.assertTrue(os.path.isfile(third))
        # Seul le fichier nouveau est garde (l'ancien, renvoye par le cache, est ignore).
        self.assertEqual([os.path.basename(o["source"]) for o in res["outputs"]], ["ComfyUI_00002_.png"])
        self.assertEqual(res["outputs"][0]["copy"], "60.Rush Images/20261017_153001_run.png")

    def test_error_status_and_bad_files(self):
        path = rr.start_run(self.p, "p", PROMPT, self.when)
        # Arrete sans fichier : pas enregistre.
        self.assertEqual(rr.finish_run(path, [], "interrupted", self.out),
                         {"skipped": True, "same_as": None, "status": "error"})
        self.assertFalse(os.path.exists(path))
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
