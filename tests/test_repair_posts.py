"""
Tests de tools/repair_posts.py (nettoyage des posts mal rattaches au Run mere), sur des
dossiers temporaires seulement. Lancer depuis la racine de l'extension :

    python -m unittest discover -s tests -p "test_*.py"
"""

import contextlib
import io
import json
import os
import shutil
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "tools"))

import projects  # noqa: E402
import run_record as rr  # noqa: E402
import repair_posts as rp  # noqa: E402

T0 = time.mktime(time.strptime("2026-11-04 10:00:00", rr.DATE_FORMAT))
SINCE = "2026-11-04 08:00"


def stamp(t):
    return time.strftime(rr.DATE_FORMAT, time.localtime(t))


def write_bytes(path, data=b"x"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


class CleanPostsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="mm_clean_")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.a = os.path.join(self.tmp, "A")
        os.makedirs(self.a)
        projects.ensure_project(self.a)
        self.pick = os.path.join(self.tmp, "B", "90.Pick Up", "Video")
        self.mother = os.path.join(self.a, "04.Prompt", "20261102_141546_run.json")
        self.base = "20261102_141546_run"
        self.data = {"date": "2026-11-02 14:15:46", "status": "done", "duration": 5.0,
                     "outputs": [{"source": os.path.join(self.tmp, "orig.mp4"), "kind": "video",
                                  "copy": "40.Rush Videos/Footage/orig.mp4"}]}
        write_bytes(os.path.join(self.a, "40.Rush Videos", "Footage", "orig.mp4"), b"orig")
        self.trashed = []

    def trash(self, paths):
        for p in paths:
            self.trashed.append(p)
            os.remove(p)  # simule la Corbeille

    def add_post(self, n, post_t, parent=0, copy=True, workflow=True):
        name = "%s_post%02d" % (self.base, n)
        src = os.path.join(self.pick, "p%d.mp4" % n)
        write_bytes(src, b"source%d" % n)
        out = {"source": src, "kind": "video", "copy": None, "post_of": parent, "post_level": 1,
               "post_date": stamp(post_t), "post_params": {}}
        if copy:
            write_bytes(os.path.join(self.a, "40.Rush Videos", "Footage", name + ".mp4"), b"copy%d" % n)
        out["copy"] = "40.Rush Videos/Footage/%s.mp4" % name
        if workflow:
            write_bytes(rr.run_workflow_path(self.a, name + ".json"), b"{}")
            out["post_workflow"] = name + ".json"
        self.data["outputs"].append(out)
        return out

    def save(self):
        rr._write(self.mother, self.data)

    def files(self):
        found = {}
        for d, _, names in os.walk(self.tmp):
            for n in names:
                p = os.path.join(d, n)
                found[p] = read_b(p)
        return found

    def clean(self, apply=True, since=SINCE, **kw):
        return rp.clean(self.mother, since, apply=apply, trash_fn=self.trash, now=T0 + 1000, **kw)

    def three_posts(self):
        for n in (1, 2, 3):
            self.add_post(n, T0 + n * 60)
        self.save()

    def test_dry_run_lists_and_writes_nothing(self):
        self.three_posts()
        snap = self.files()
        rep = self.clean(apply=False)
        self.assertEqual([x["name"] for x in rep["posts"]], ["Post A", "Post B", "Post C"])
        self.assertEqual(rep["posts"][0]["source"], os.path.join(self.pick, "p1.mp4"))
        self.assertFalse(rep["applied"])
        self.assertEqual(self.files(), snap)
        self.assertEqual(self.trashed, [])

    def test_apply_removes_posts_backs_up_trashes_and_keeps_sources(self):
        self.three_posts()
        before = read_b(self.mother)
        rep = self.clean()
        self.assertTrue(rep["applied"])
        data = read(self.mother)
        self.assertEqual(data["outputs"], [self.data["outputs"][0]])
        self.assertEqual(data["status"], "done")
        self.assertEqual(read_b(rep["backup"]), before)
        self.assertTrue(rep["backup"].startswith(os.path.join(self.a, "99.Project-Config", "Archives")))
        self.assertEqual(len(self.trashed), 6)  # 3 copies + 3 workflows
        footage = os.path.join(self.a, "40.Rush Videos", "Footage")
        self.assertEqual(os.listdir(footage), ["orig.mp4"])
        self.assertEqual(os.listdir(os.path.join(self.a, "00.Workflows", "Run")), [])
        for n in (1, 2, 3):  # les originaux restent
            self.assertTrue(os.path.isfile(os.path.join(self.pick, "p%d.mp4" % n)))
        self.assertTrue(all(x["copy_status"] == "recycled" and x["workflow_status"] == "recycled" for x in rep["posts"]))

    def test_backup_never_overwritten(self):
        self.three_posts()
        a = rp._backup(self.a, self.mother, T0)
        b = rp._backup(self.a, self.mother, T0)
        self.assertNotEqual(a, b)
        self.assertTrue(os.path.isfile(a) and os.path.isfile(b))

    def test_idempotent(self):
        self.three_posts()
        self.clean()
        snap = self.files()
        rep = self.clean()
        self.assertEqual(rep["posts"], [])
        self.assertFalse(rep["applied"])
        self.assertEqual(self.files(), snap)

    def test_refuses_when_file_changed_since_plan(self):
        self.three_posts()
        real = rp.plan

        def stale(*a, **k):
            p = real(*a, **k)
            changed = read(self.mother)
            changed["note"] = "rewritten by ComfyUI"
            rr._write(self.mother, changed)  # ComfyUI reecrit le JSON apres le plan
            return p

        rp.plan = stale
        self.addCleanup(setattr, rp, "plan", real)
        with self.assertRaises(rp.Refused):
            self.clean()
        self.assertEqual(len(read(self.mother)["outputs"]), 4)
        self.assertEqual(self.trashed, [])
        self.assertEqual(read(self.mother)["note"], "rewritten by ComfyUI")

    def test_refuses_when_remaining_post_would_be_renamed(self):
        # Le post d'index 1 (avant since) est l'enfant du post d'index 2 (apres since) :
        # sans son parent il deviendrait "Post A" au lieu de "Post A.01".
        child = self.add_post(1, T0 - 7200)
        child["post_of"] = 2
        self.add_post(2, T0 + 60)
        self.save()
        snap = self.files()
        with self.assertRaises(rp.Refused):
            self.clean(since="2026-11-04 09:00")
        self.assertEqual(self.files(), snap)  # rien ecrit, rien a la Corbeille

    def test_refuses_when_remaining_output_index_would_shift(self):
        self.add_post(1, T0 + 60)
        self.data["outputs"].append({"source": "z.mp4", "kind": "video", "copy": None})
        self.save()
        snap = self.files()
        with self.assertRaises(rp.Refused):
            self.clean()
        self.assertEqual(self.files(), snap)

    def test_later_posts_removed_keeps_earlier_names(self):
        self.add_post(1, T0 - 7200)  # avant since, reste (Post A)
        self.add_post(2, T0 + 60)    # retire (Post B)
        self.save()
        rep = self.clean(since="2026-11-04 09:00")
        self.assertEqual([x["name"] for x in rep["posts"]], ["Post B"])
        rest = read(self.mother)["outputs"]
        self.assertEqual(len(rest), 2)
        self.assertEqual(rest[1]["post_of"], 0)

    def test_missing_copy_is_reported_not_an_error(self):
        self.add_post(1, T0 + 60, copy=False, workflow=False)
        self.save()
        rep = self.clean()
        self.assertTrue(rep["applied"])
        self.assertEqual(rep["posts"][0]["copy_status"], "missing")
        self.assertEqual(rep["posts"][0]["workflow_status"], "none")
        self.assertEqual(len(read(self.mother)["outputs"]), 1)

    def test_in_place_copy_that_is_the_source_is_kept(self):
        out = self.add_post(1, T0 + 60, workflow=False)
        out["source"] = os.path.join(self.a, *out["copy"].split("/"))
        self.save()
        rep = self.clean()
        self.assertIn("kept", rep["posts"][0]["copy_status"])
        self.assertTrue(os.path.isfile(out["source"]))
        self.assertEqual(self.trashed, [])

    def test_trash_failure_leaves_json_clean(self):
        self.three_posts()

        def boom(paths):
            raise OSError("locked")

        rep = rp.clean(self.mother, SINCE, apply=True, trash_fn=boom, now=T0 + 1000)
        self.assertEqual(len(read(self.mother)["outputs"]), 1)
        self.assertTrue(rep["posts"][0]["copy_status"].startswith("NOT recycled"))

    def test_cli(self):
        self.three_posts()
        snap = self.files()
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(rp.main(["--mother", self.mother, "--since", SINCE]), 0)
        self.assertEqual(self.files(), snap)
        self.assertIn("DRY RUN", out.getvalue())
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(rp.main(["--mother", self.mother, "--since", "bad"]), 2)


def read_b(path):
    with open(path, "rb") as f:
        return f.read()


if __name__ == "__main__":
    unittest.main()
