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


def make_video(path, width, height, frames=6, audio=True):
    """Petite video H.264 (+ son AAC) pour les tests de reduction."""
    import av
    import numpy as np
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with av.open(path, "w") as out:
        v = out.add_stream("libx264", rate=24)
        v.width, v.height, v.pix_fmt = width, height, "yuv420p"
        a = out.add_stream("aac", rate=44100) if audio else None
        for i in range(frames):
            img = np.full((height, width, 3), (i * 40) % 255, dtype=np.uint8)
            for p in v.encode(av.VideoFrame.from_ndarray(img, format="rgb24")):
                out.mux(p)
        for p in v.encode(None):
            out.mux(p)
        if a is not None:
            for i in range(5):
                f = av.AudioFrame.from_ndarray(np.zeros((1, 1024), dtype=np.float32), format="fltp", layout="mono")
                f.sample_rate, f.pts = 44100, i * 1024
                for p in a.encode(f):
                    out.mux(p)
            for p in a.encode(None):
                out.mux(p)


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

    def test_fit_size(self):
        self.assertEqual(rr.fit_size(1216, 672), (960, 530))
        self.assertEqual(rr.fit_size(672, 1216), (300, 544))
        self.assertEqual(rr.fit_size(1920, 1080), (960, 540))
        self.assertIsNone(rr.fit_size(960, 544))
        self.assertIsNone(rr.fit_size(640, 480))
        self.assertEqual(rr.fit_size(1000, 544), (960, 522))

    def test_big_video_is_reduced_small_one_copied(self):
        import av
        big = os.path.join(self.out, "big_00001.mp4")
        small = os.path.join(self.out, "small_00001.mp4")
        make_video(big, 1216, 672)
        make_video(small, 320, 176, audio=False)
        path = rr.start_run(self.p, "p", PROMPT, self.when)
        data = rr.finish_run(path, [{"filename": "big_00001.mp4", "type": "output"},
                                    {"filename": "small_00001.mp4", "type": "output"}], "done", self.out)
        self.assertEqual(data["outputs"], [
            {"source": big, "kind": "video", "copy": "40.Rush Videos/20261017_153000_run.mp4", "size": "1216x672", "copy_size": "960x530"},
            {"source": small, "kind": "video", "copy": "40.Rush Videos/20261017_153000_run_02.mp4", "size": "320x176"},
        ])
        done = os.path.join(self.p, "40.Rush Videos", "20261017_153000_run.mp4")
        with av.open(done) as c:
            self.assertEqual((c.streams.video[0].codec_context.width, c.streams.video[0].codec_context.height), (960, 530))
            self.assertEqual(c.streams.video[0].frames, 6)
            self.assertEqual([s.codec_context.name for s in c.streams.audio], ["aac"])
        self.assertEqual(rr.video_size(big), (1216, 672))     # original intact
        self.assertEqual(sorted(os.listdir(os.path.join(self.p, "40.Rush Videos"))),
                         ["20261017_153000_run.mp4", "20261017_153000_run_02.mp4"])

    def test_video_saved_in_rush_folder_is_left_alone(self):
        own = os.path.join(self.p, "40.Rush Videos", "clip_00001.mp4")
        make_video(own, 1216, 672, frames=2, audio=False)
        path = rr.start_run(self.p, "p", PROMPT, self.when)
        data = rr.finish_run(path, [{"filename": "clip_00001.mp4", "fullpath": own}], "done", self.out)
        self.assertEqual(data["outputs"], [{"source": own, "kind": "video", "copy": "40.Rush Videos/clip_00001.mp4",
                                            "size": "1216x672", "in_place": True}])
        self.assertEqual(os.listdir(os.path.join(self.p, "40.Rush Videos")), ["clip_00001.mp4"])
        self.assertEqual(rr.video_size(own), (1216, 672))

    def test_failed_reduction_falls_back_to_copy(self):
        src = os.path.join(self.out, "big.mp4")
        make_video(src, 1216, 672, frames=2, audio=False)
        old = rr.resize_video
        rr.resize_video = lambda *a: (_ for _ in ()).throw(RuntimeError("no encoder"))
        try:
            data = rr.finish_run(rr.start_run(self.p, "p", PROMPT, self.when),
                                 [{"filename": "big.mp4", "type": "output"}], "done", self.out)
        finally:
            rr.resize_video = old
        self.assertEqual(data["outputs"][0]["copy"], "40.Rush Videos/20261017_153000_run.mp4")
        self.assertEqual(data["outputs"][0]["resize_error"], "no encoder")

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
        # Images citees sans copie (choix utilisateur) ; video illisible : copiee telle quelle.
        self.assertEqual([o["copy"] for o in data["outputs"]], [None, None, "40.Rush Videos/20261017_153000_run.mp4", None])
        self.assertEqual(data["outputs"][1]["source"], os.path.join(self.out, "sub", "ComfyUI_00002_.png"))
        self.assertEqual(os.listdir(os.path.join(self.p, "60.Rush Images")), [])
        self.assertEqual(read_json(path)["outputs"], data["outputs"])
        # Deja termine : rien n'est refait.
        again = rr.finish_run(path, [], "error", self.out)
        self.assertEqual(again["status"], "done")

    def test_real_paths_of_save_nodes(self):
        # Pixaroma Save Video (dossier choisi hors de output), Video Helper Suite (fullpath).
        rush = os.path.join(self.root, "elsewhere", "rush")
        write(os.path.join(rush, "Video_Shiz_001.mp4"), b"v")
        write(os.path.join(self.root, "vhs", "AnimateDiff_00001.mp4"), b"w")
        write(os.path.join(self.root, "vhs", "notes.txt"), b"t")
        path = rr.start_run(self.p, "p", PROMPT, self.when)
        data = rr.finish_run(path, [
            {"filename": "Video_Shiz_001.mp4", "subfolder": "", "type": "output", "fullpath": "", "folder": rush},
            {"filename": "AnimateDiff_00001.mp4", "type": "output",
             "fullpath": os.path.join(self.root, "vhs", "AnimateDiff_00001.mp4")},
            {"filename": "notes.txt", "type": "output", "fullpath": os.path.join(self.root, "vhs", "notes.txt")},
            {"filename": "preview.mp4", "type": "temp", "fullpath": os.path.join(self.root, "vhs", "AnimateDiff_00001.mp4")},
            {"filename": "missing.mp4", "type": "output", "folder": rush},
        ], "done", self.out)
        self.assertEqual([o["source"] for o in data["outputs"]],
                         [os.path.join(rush, "Video_Shiz_001.mp4"), os.path.join(self.root, "vhs", "AnimateDiff_00001.mp4")])
        self.assertEqual([o["copy"] for o in data["outputs"]],
                         ["40.Rush Videos/20261017_153000_run.mp4", "40.Rush Videos/20261017_153000_run_02.mp4"])

    def test_reused_name_written_during_run_is_new(self):
        # Compteur de SaveImage reparti a 00001 (anciens fichiers effaces) : meme nom, fichier neuf.
        src = os.path.join(self.out, "ComfyUI_00001_.png")
        write(src, b"i1")
        os.utime(src, (self.when - 60, self.when - 60))
        files = [{"filename": "ComfyUI_00001_.png", "subfolder": "", "type": "output"}]
        rr.finish_run(rr.start_run(self.p, "p", PROMPT, self.when - 60), files, "done", self.out)
        write(src, b"i2")
        os.utime(src, (self.when + 5, self.when + 5))
        res = rr.finish_run(rr.start_run(self.p, "p", PROMPT, self.when), files, "done", self.out)
        self.assertEqual(res["status"], "done")
        self.assertEqual(res["outputs"][0]["source"], src)

    def test_unchanged_run_is_not_recorded(self):
        write(os.path.join(self.out, "ComfyUI_00001_.png"), b"i1")
        # Fichier ecrit avant les Runs (le second le recoit du cache).
        os.utime(os.path.join(self.out, "ComfyUI_00001_.png"), (self.when - 60, self.when - 60))
        files = [{"filename": "ComfyUI_00001_.png", "subfolder": "", "type": "output"}]
        first = rr.start_run(self.p, "p", PROMPT, self.when)
        rr.finish_run(first, files, "done", self.out)
        # Meme fichier renvoye par le cache de ComfyUI : JSON retire, rien de copie.
        second = rr.start_run(self.p, "p", PROMPT, self.when)
        res = rr.finish_run(second, files, "done", self.out)
        self.assertEqual(res, {"skipped": True, "same_as": "20261017_153000_run.json", "status": "done"})
        self.assertFalse(os.path.exists(second))
        self.assertEqual(os.listdir(os.path.join(self.p, "60.Rush Images")), [])
        # Nouveau fichier : enregistre.
        write(os.path.join(self.out, "ComfyUI_00002_.png"), b"i2")
        third = rr.start_run(self.p, "p", PROMPT, self.when)
        res = rr.finish_run(third, files + [{"filename": "ComfyUI_00002_.png", "subfolder": "", "type": "output"}],
                            "done", self.out)
        self.assertEqual(res["status"], "done")
        self.assertTrue(os.path.isfile(third))
        # Seul le fichier nouveau est garde (l'ancien, renvoye par le cache, est ignore).
        self.assertEqual([os.path.basename(o["source"]) for o in res["outputs"]], ["ComfyUI_00002_.png"])
        self.assertIsNone(res["outputs"][0]["copy"])

    def test_kind_and_list_runs(self):
        src_img = os.path.join(self.out, "ComfyUI_00001_.png")
        src_vid = os.path.join(self.root, "elsewhere", "v.mp4")
        write(src_img, b"i")
        write(src_vid, b"v")
        path = rr.start_run(self.p, "a bunny", PROMPT, self.when)
        data = rr.finish_run(path, [{"filename": "ComfyUI_00001_.png", "type": "output"},
                                    {"filename": "v.mp4", "fullpath": src_vid}], "done", self.out)
        self.assertEqual([o["kind"] for o in data["outputs"]], ["image", "video"])
        # Ancien JSON sans kind (deduit de l'extension), plus ancien ; fichier qui n'est pas un Run : ignore.
        old = os.path.join(self.p, "04.Prompt", "20261017_120000_run.json")
        with open(old, "w", encoding="utf-8") as f:
            json.dump({"date": "2026-10-17 12:00:00", "prompt": "old", "cfg": None, "cfg_from": "Math",
                       "status": "done", "outputs": [{"source": "Z:/gone.webm", "copy": "40.Rush Videos/x.webm"}]}, f)
        write(os.path.join(self.p, "04.Prompt", "notes.json"), b"{}")
        runs = rr.list_runs(self.p)
        self.assertEqual([r["file"] for r in runs], ["20261017_153000_run.json", "20261017_120000_run.json"])
        self.assertEqual(runs[0]["prompt"], "a bunny")
        img, vid = runs[0]["outputs"]
        self.assertEqual((img["kind"], img["source_exists"], img["copy"], img["folder"]), ("image", True, "", self.out))
        self.assertEqual(vid["kind"], "video")
        self.assertEqual(vid["copy"], os.path.join(self.p, "40.Rush Videos", "20261017_153000_run.mp4"))
        self.assertTrue(vid["copy_exists"])
        self.assertEqual(runs[1]["cfg_from"], "Math")
        self.assertEqual(runs[1]["outputs"][0]["kind"], "video")
        self.assertFalse(runs[1]["outputs"][0]["source_exists"])
        self.assertFalse(runs[1]["outputs"][0]["copy_exists"])
        with self.assertRaises(FileNotFoundError):
            rr.list_runs(os.path.join(self.root, "nope"))

    def _run_with(self, outputs):
        path = rr.start_run(self.p, "p", PROMPT, self.when)
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        data.update({"status": "done", "outputs": outputs})
        rr._write(path, data)
        return os.path.basename(path)

    def test_move_image_to_rush_images(self):
        src = os.path.join(self.out, "ComfyUI_00001_.png")
        write(src, b"img")
        write(os.path.join(self.p, "60.Rush Images", "20261017_153000_run.png"), b"other")  # nom pris
        name = self._run_with([{"source": src, "kind": "image", "copy": None}])
        self.assertFalse(rr.list_runs(self.p)[0]["outputs"][0]["in_project"])
        res = rr.move_output(self.p, name, 0)
        dst = os.path.join(self.p, "60.Rush Images", "20261017_153000_run_02.png")
        self.assertEqual(res, {"source": dst, "copy": "60.Rush Images/20261017_153000_run_02.png", "moved_from": src})
        self.assertFalse(os.path.exists(src))
        with open(dst, "rb") as f:
            self.assertEqual(f.read(), b"img")
        out = rr.list_runs(self.p)[0]["outputs"][0]
        self.assertTrue(out["in_project"])
        self.assertEqual(out["source"], dst)
        with self.assertRaises(ValueError):          # deja dans 60
            rr.move_output(self.p, name, 0)

    def test_move_video_replaces_reduced_copy(self):
        src = os.path.join(self.root, "rush", "Video_001.webm")
        write(src, b"full")
        copy = os.path.join(self.p, "40.Rush Videos", "20261017_153000_run.mp4")
        write(copy, b"small")
        name = self._run_with([{"source": src, "kind": "video", "copy": "40.Rush Videos/20261017_153000_run.mp4",
                                "size": "1216x672", "copy_size": "960x530"}])
        rr.move_output(self.p, name, 0)
        self.assertEqual(os.listdir(os.path.join(self.p, "40.Rush Videos")), ["20261017_153000_run.webm"])
        self.assertFalse(os.path.exists(src))
        with open(os.path.join(self.p, "04.Prompt", name), "r", encoding="utf-8") as f:
            o = json.load(f)["outputs"][0]
        self.assertEqual(o["copy"], "40.Rush Videos/20261017_153000_run.webm")
        self.assertEqual(o["moved_from"], src)
        self.assertNotIn("copy_size", o)
        self.assertEqual(o["size"], "1216x672")

    def test_move_failure_keeps_original(self):
        src = os.path.join(self.out, "a.png")
        write(src, b"img")
        name = self._run_with([{"source": src, "kind": "image", "copy": None}])
        old = rr.file_sha256
        calls = []
        rr.file_sha256 = lambda p: calls.append(p) or ("x" if p.endswith(".part") else "y")
        try:
            with self.assertRaises(IOError):
                rr.move_output(self.p, name, 0)
        finally:
            rr.file_sha256 = old
        self.assertTrue(os.path.isfile(src))
        self.assertEqual(os.listdir(os.path.join(self.p, "60.Rush Images")), [])
        with self.assertRaises(ValueError):
            rr.move_output(self.p, name, 5)
        os.remove(src)
        with self.assertRaises(FileNotFoundError):
            rr.move_output(self.p, name, 0)

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
