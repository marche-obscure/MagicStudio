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


if __name__ == "__main__":
    unittest.main()
