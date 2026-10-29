"""
Tests du module run_tracker (fin des Runs enregistree par le serveur, sans
ComfyUI) : lancer depuis la racine de l'extension avec le Python embarque :

    ..\\..\\..\\python_embeded\\python.exe -m unittest discover -s tests -v
"""

import json
import os
import shutil
import sys
import tempfile
import threading
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import projects  # noqa: E402
import run_record as rr  # noqa: E402
import run_tracker as rt  # noqa: E402

PROMPT = {"1": {"class_type": "KSampler", "inputs": {"seed": 5, "steps": 20, "cfg": 1}}}


def write(path, data=b"x"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def pixaroma(folder, name):
    """Sortie ui de Pixaroma Save Video (dossier choisi hors de output)."""
    return {"pixaroma_save_video": [{"filename": name, "type": "external", "path": os.path.join(folder, name),
                                     "_pixaroma_status": {"saved": 1, "folder": folder}}]}


class TrackerTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.p = projects.create_project(self.root, "Clip")
        self.out = os.path.join(self.root, "output")
        os.makedirs(self.out)
        self.tracker = rt.RunTracker(lambda: self.out)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def run_messages(self, pid, run_file, outputs, end="execution_success"):
        t = self.tracker
        self.assertIsNone(t.on_message("execution_start", {"prompt_id": pid, "timestamp": 1000}))
        self.assertIsNone(t.on_message("executed", {"node": "340", "prompt_id": pid, "output": {"mmrun": [run_file]}}))
        for node, output in outputs:
            self.assertIsNone(t.on_message("executed", {"node": node, "prompt_id": pid, "output": output}))
        return t.on_message(end, {"prompt_id": pid, "timestamp": 61000})

    def test_output_files_reads_pixaroma_folder(self):
        files = rt.output_files({"images": [{"filename": "a.png", "subfolder": "x", "type": "output"}],
                                 "pixaroma_save_video": [{"filename": "v.mp4", "type": "external",
                                                          "_pixaroma_status": {"folder": "F:/p/40"}}],
                                 "text": ["not a file"], "mmrun": ["F:/p/04.Prompt/r.json"]})
        self.assertEqual(files, [
            {"filename": "a.png", "subfolder": "x", "type": "output", "fullpath": "", "folder": ""},
            {"filename": "v.mp4", "subfolder": "", "type": "external", "fullpath": "", "folder": "F:/p/40"}])

    def test_run_saved_in_footage_is_recorded_without_the_tab(self):
        run_file = rr.start_run(self.p, "a red car", PROMPT)
        footage = os.path.join(self.p, rr.RUSH_VIDEOS, "Footage")
        write(os.path.join(footage, "Video_001.mp4"))
        end = self.run_messages("p1", run_file, [("241", pixaroma(footage, "Video_001.mp4"))])
        self.assertEqual(end[0], run_file)
        self.assertEqual(end[2:], ("done", 60.0))
        data = self.tracker.finish(*end)
        self.assertEqual(data["status"], "done")
        self.assertEqual(data["duration"], 60.0)
        self.assertEqual(len(data["outputs"]), 1)
        self.assertTrue(data["outputs"][0]["in_place"])
        self.assertEqual(data["outputs"][0]["copy"], rr.RUSH_VIDEOS + "/Footage/Video_001.mp4")
        with open(run_file, encoding="utf-8") as f:
            self.assertEqual(json.load(f)["status"], "done")
        # Appel de l'onglet ensuite : meme resultat, rien n'est refait.
        self.assertIs(self.tracker.finish(run_file, [], "done", 5), data)

    def test_skipped_run_answers_the_tab_too(self):
        run_file = rr.start_run(self.p, "p", PROMPT)
        end = self.run_messages("p2", run_file, [], end="execution_interrupted")
        self.assertEqual(end[2], "error")
        data = self.tracker.finish(*end)
        self.assertTrue(data["skipped"])
        self.assertFalse(os.path.exists(run_file))
        self.assertEqual(self.tracker.finish(run_file, [], "error"), data)

    def test_run_without_project_node_is_ignored(self):
        t = self.tracker
        t.on_message("execution_start", {"prompt_id": "x", "timestamp": 1})
        t.on_message("executed", {"node": "9", "prompt_id": "x", "output": {"images": [{"filename": "a.png"}]}})
        self.assertIsNone(t.on_message("execution_success", {"prompt_id": "x", "timestamp": 2}))
        self.assertIsNone(t.on_message("status", {"status": {}}))
        self.assertEqual(t.runs, {})

    def test_handle_records_in_a_thread(self):
        called = threading.Event()
        seen = []

        def fake_finish(run_file, files, status, output_dir, now, duration):
            seen.append((run_file, status, output_dir, duration))
            called.set()
            return {"status": status}

        t = rt.RunTracker(lambda: self.out, fake_finish)
        t.handle("execution_start", {"prompt_id": "q"})
        t.handle("executed", {"prompt_id": "q", "output": {"mmrun": ["r.json"]}})
        t.handle("execution_error", {"prompt_id": "q"})
        self.assertTrue(called.wait(5))
        self.assertEqual(seen, [("r.json", "error", self.out, None)])

    def test_only_the_last_runs_are_kept(self):
        for i in range(rt.KEEP + 5):
            self.tracker.on_message("execution_start", {"prompt_id": str(i)})
        self.assertEqual(len(self.tracker.runs), rt.KEEP)
        self.assertNotIn("0", self.tracker.runs)



class PostTrackerTest(unittest.TestCase):
    """Post-traitements classes par le serveur a la fin de chaque execution (29/10/2026)."""

    MOTHER = {"project": "P", "run_file": "P/04.Prompt/20261029_100000_run.json", "index": 0, "level": 0}

    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.out = os.path.join(self.root, "output")
        for n in ("a2.png", "b.mp4", "c.png"):
            write(os.path.join(self.out, n))
        # 2 : generation (SaveImage) ; 5 -> 6 -> 7 : MedLoad -> retouche -> SaveVideo.
        self.prompt = {
            "1": {"class_type": "KSampler", "inputs": {"seed": 1, "steps": 4, "cfg": 1}},
            "2": {"class_type": "SaveImage", "inputs": {"images": ["1", 0]}},
            "5": {"class_type": "MiniMaxH3LoadMedia", "inputs": {"file": "G:/in/A.mp4"}},
            "6": {"class_type": "Light", "inputs": {"video": ["5", 0], "gain": 1.2}},
            "7": {"class_type": "SaveVideo", "inputs": {"video": ["6", 0]}},
        }
        self.mothers = {"G:/in/A.mp4": self.MOTHER}
        self.attached, self.finished = [], []
        self.t = rt.RunTracker(lambda: self.out, self.fake_finish, prompt_fn=self.fake_prompt,
                               attach_fn=self.fake_attach, mother_fn=lambda path: self.mothers.get(path))

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def fake_prompt(self, pid):
        return self.prompt, {"extra_pnginfo": {"workflow": {"nodes": []}}}

    def fake_attach(self, run_file, index, level, src, params, workflow, warning=None):
        self.attached.append((run_file, index, level, os.path.basename(src), warning))
        return {"post_level": level + 1}

    def fake_finish(self, run_file, files, status, output_dir, now, duration):
        self.finished.append((run_file, sorted(f["filename"] for f in files)))
        return {"status": status}

    def img(self, name):
        return {"images": [{"filename": name, "subfolder": "", "type": "output"}]}

    def execute(self, pid, outputs, mmrun=None):
        self.t.on_message("execution_start", {"prompt_id": pid, "timestamp": 1})
        if mmrun:
            self.t.on_message("executed", {"node": "9", "prompt_id": pid, "output": {"mmrun": [mmrun]}})
        for node, name in outputs:
            self.t.on_message("executed", {"node": node, "prompt_id": pid, "output": self.img(name)})
        return self.t.on_message("execution_success", {"prompt_id": pid, "timestamp": 2})

    def test_branch_alone_no_new_run(self):
        self.assertIsNone(self.execute("p", [("7", "b.mp4")]))
        self.t.settle("p")
        self.assertEqual(self.attached, [(self.MOTHER["run_file"], 0, 0, "b.mp4", None)])
        self.assertEqual(self.finished, [])

    def test_global_run_new_generation_and_post(self):
        end = self.execute("p", [("2", "a2.png"), ("7", "b.mp4")], mmrun="new.json")
        self.t.finish(*end)
        self.assertEqual(self.finished, [("new.json", ["a2.png"])])
        self.assertEqual([a[3] for a in self.attached], ["b.mp4"])

    def test_global_run_cached_generation(self):
        end = self.execute("p", [("7", "b.mp4")], mmrun="new.json")
        self.t.finish(*end)
        self.assertEqual(self.finished, [("new.json", [])])

    def test_run_done_first_still_filters_posts(self):
        self.execute("p", [("2", "a2.png"), ("7", "b.mp4")], mmrun="new.json")
        tab_files = [self.img("a2.png")["images"][0], self.img("b.mp4")["images"][0]]
        self.t.finish("new.json", tab_files, "done", 3)
        self.assertEqual(self.finished, [("new.json", ["a2.png"])])

    def test_loaded_outside_runs(self):
        self.mothers = {}
        end = self.execute("p", [("2", "a2.png"), ("7", "b.mp4")], mmrun="new.json")
        self.t.finish(*end)
        self.assertEqual(self.attached, [])
        self.assertEqual(self.finished, [("new.json", ["a2.png", "b.mp4"])])

    def test_settle_once(self):
        end = self.execute("p", [("7", "b.mp4")], mmrun="new.json")
        self.t.settle("p")
        self.t.finish(*end)
        self.t.finish(*end)
        self.assertEqual(len(self.attached), 1)

    def test_two_medloads_other_run_warns(self):
        self.prompt["8"] = {"class_type": "MiniMaxH3LoadMedia", "inputs": {"file": "G:/in/Z.mp4"}}
        self.prompt["6"]["inputs"]["mask"] = ["10", 0]
        self.prompt["10"] = {"class_type": "Resize", "inputs": {"image": ["8", 0]}}
        self.mothers["G:/in/Z.mp4"] = dict(self.MOTHER, run_file="P/04.Prompt/20261028_090000_run.json")
        self.prompt["7"]["inputs"]["video"] = ["5", 0]
        self.prompt["7"]["inputs"]["extra"] = ["6", 0]
        self.execute("p", [("7", "b.mp4")])
        self.t.settle("p")
        self.assertEqual(self.attached[0][0], self.MOTHER["run_file"])
        self.assertIn("20261028_090000_run.json", self.attached[0][4])

if __name__ == "__main__":
    unittest.main()
