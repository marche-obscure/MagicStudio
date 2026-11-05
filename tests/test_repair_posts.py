"""
Tests de tools/repair_posts.py (reparation ponctuelle des posts mal rattaches), sur des
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


def stamp(t):
    return time.strftime(rr.DATE_FORMAT, time.localtime(t))


def run_name(t):
    return time.strftime("%Y%m%d_%H%M%S", time.localtime(t)) + "_run.json"


def write_bytes(path, data=b"x"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


class RepairPostsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="mm_repair_")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.a = os.path.join(self.tmp, "A")
        self.b = os.path.join(self.tmp, "B")
        for p in (self.a, self.b):
            os.makedirs(p)
            projects.ensure_project(p)
        self.out = os.path.join(self.tmp, "output")
        # Run mere de A, avec une sortie normale.
        self.mother = os.path.join(self.a, "04.Prompt", run_name(T0 - 3600))
        self.mother_data = {"date": stamp(T0 - 3600), "status": "done", "duration": 5.0,
                            "outputs": [{"source": os.path.join(self.out, "orig.mp4"), "kind": "video",
                                         "copy": "40.Rush Videos/Footage/orig.mp4"}]}
        write_bytes(os.path.join(self.a, "40.Rush Videos", "Footage", "orig.mp4"), b"orig")

    def add_post(self, n, post_t, content=b"v", workflow=True):
        """Ajoute un post (comme _attach_post) a la sortie 0 du Run mere de A."""
        base = os.path.splitext(os.path.basename(self.mother))[0]
        name = "%s_post%02d" % (base, n)
        write_bytes(os.path.join(self.a, "40.Rush Videos", "Footage", name + ".mp4"), content)
        out = {"source": os.path.join(self.out, "p%d.mp4" % n), "kind": "video",
               "copy": "40.Rush Videos/Footage/%s.mp4" % name, "size": "640x360",
               "post_of": 0, "post_level": 1, "post_date": stamp(post_t), "post_params": {"cfg": 4}}
        if workflow:
            write_bytes(rr.run_workflow_path(self.a, name + ".json"), b'{"wf": %d}' % n)
            out["post_workflow"] = name + ".json"
        self.mother_data["outputs"].append(out)
        return out

    def add_target_run(self, start, duration, status="done", outputs=None, with_workflow=False):
        name = run_name(start)
        data = {"date": stamp(start), "status": status, "duration": duration, "outputs": outputs or []}
        path = os.path.join(self.b, "04.Prompt", name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if with_workflow:
            write_bytes(rr.run_workflow_path(self.b, name), b'{"own": 1}')
            data["workflow"] = "00.Workflows/Run/" + name
        rr._write(path, data)
        return path

    def save_mother(self):
        rr._write(self.mother, self.mother_data)

    def snapshot(self):
        files = {}
        for base in (self.a, self.b):
            for d, _, names in os.walk(base):
                for n in names:
                    p = os.path.join(d, n)
                    with open(p, "rb") as f:
                        files[p] = f.read()
        return files

    def run_tool(self, dry_run=True, since="2026-11-04 08:00"):
        return rp.repair(self.mother, self.b, since, dry_run=dry_run, now=T0 + 1000)

    def two_posts(self):
        self.add_post(1, T0 + 40)
        self.add_post(2, T0 + 400)
        self.save_mother()
        r1 = self.add_target_run(T0, 30)  # fin T0+30, post a +40
        r2 = self.add_target_run(T0 + 300, 80)  # fin T0+380, post a +400
        return r1, r2

    def test_moves_two_posts_into_their_runs(self):
        r1, r2 = self.two_posts()
        res = self.run_tool(dry_run=False)
        self.assertEqual([s["action"] for s in res], ["move", "move"])
        for path, n in ((r1, 1), (r2, 2)):
            data = read(path)
            self.assertEqual(len(data["outputs"]), 1)
            o = data["outputs"][0]
            for k in rp.POST_FIELDS:
                self.assertNotIn(k, o)
            base = os.path.splitext(os.path.basename(path))[0]
            self.assertEqual(o["copy"], "40.Rush Videos/Footage/%s.mp4" % base)
            self.assertTrue(os.path.isfile(os.path.join(self.b, *o["copy"].split("/"))))
            self.assertEqual(o["kind"], "video")
            self.assertEqual(o["size"], "640x360")
            self.assertEqual(data["workflow"], "00.Workflows/Run/" + os.path.basename(path))
            self.assertTrue(os.path.isfile(rr.run_workflow_path(self.b, os.path.basename(path))))
        mother = read(self.mother)
        self.assertEqual(len(mother["outputs"]), 1)
        self.assertEqual(mother["outputs"][0]["copy"], "40.Rush Videos/Footage/orig.mp4")
        footage = os.listdir(os.path.join(self.a, "40.Rush Videos", "Footage"))
        self.assertEqual(footage, ["orig.mp4"])
        self.assertEqual(os.listdir(os.path.join(self.a, "00.Workflows", "Run")), [])

    def test_backups_made_and_never_overwritten(self):
        r1, _ = self.two_posts()
        with open(self.mother, "rb") as f:
            before = f.read()
        self.run_tool(dry_run=False)
        arch_a = os.path.join(self.a, "99.Project-Config", "Archives")
        arch_b = os.path.join(self.b, "99.Project-Config", "Archives")
        self.assertEqual(len(os.listdir(arch_a)), 1)
        self.assertEqual(len(os.listdir(arch_b)), 2)
        with open(os.path.join(arch_a, os.listdir(arch_a)[0]), "rb") as f:
            self.assertEqual(f.read(), before)
        # Meme nom de sauvegarde deja pris : un autre nom est utilise.
        dst = rp._backup(self.a, self.mother, "20990101-000000")
        dst2 = rp._backup(self.a, self.mother, "20990101-000000")
        self.assertNotEqual(dst, dst2)
        self.assertTrue(os.path.isfile(dst) and os.path.isfile(dst2))

    def test_idempotent(self):
        self.two_posts()
        self.run_tool(dry_run=False)
        snap = self.snapshot()
        again = self.run_tool(dry_run=False)
        self.assertEqual(again, [])
        after = self.snapshot()
        self.assertEqual({k: v for k, v in after.items() if "Archives" not in k},
                         {k: v for k, v in snap.items() if "Archives" not in k})
        self.assertEqual(sorted(after), sorted(snap))  # pas de nouvelle sauvegarde non plus

    def test_post_without_run_is_left_and_reported(self):
        self.add_post(1, T0 + 40)
        self.add_post(2, T0 + 5000)  # aucun Run du projet cible ne finit avant
        self.save_mother()
        r1 = self.add_target_run(T0, 30)
        res = self.run_tool(dry_run=False)
        self.assertEqual([s["action"] for s in res], ["move", "left"])
        self.assertTrue(res[1]["reason"])
        mother = read(self.mother)
        self.assertEqual(len(mother["outputs"]), 2)
        self.assertTrue(mother["outputs"][1]["post_level"])
        self.assertTrue(os.path.isfile(os.path.join(self.a, "40.Rush Videos", "Footage",
                                                    os.path.splitext(os.path.basename(self.mother))[0] + "_post02.mp4")))
        self.assertEqual(len(read(r1)["outputs"]), 1)

    def test_dry_run_writes_nothing(self):
        self.two_posts()
        snap = self.snapshot()
        res = self.run_tool(dry_run=True)
        self.assertEqual([s["action"] for s in res], ["move", "move"])
        self.assertTrue(res[0]["copy_to"].endswith(".mp4"))
        self.assertEqual(self.snapshot(), snap)
        self.assertFalse(os.path.isdir(os.path.join(self.a, "99.Project-Config", "Archives")) and
                         os.listdir(os.path.join(self.a, "99.Project-Config", "Archives")))

    def test_since_filters_old_posts(self):
        self.add_post(1, T0 + 40)
        self.save_mother()
        self.add_target_run(T0, 30)
        self.assertEqual(self.run_tool(since="2026-11-04 11:00"), [])

    def test_matching_rule(self):
        self.add_post(1, T0 + 100)
        self.save_mother()
        self.add_target_run(T0 - 100, 10)  # fin T0-90 : 190 s avant le post, trop loin
        self.add_target_run(T0 + 200, 10)  # fin apres le post
        self.add_target_run(T0, 20, status="error")  # pas done
        self.add_target_run(T0 + 10, 30, outputs=[{"kind": "video", "source": "x"}])  # deja des sorties
        res = self.run_tool()
        self.assertEqual(res[0]["action"], "left")
        close = self.add_target_run(T0 + 20, 70)  # fin T0+90, 10 s avant le post
        far = self.add_target_run(T0 + 30, 20)  # fin T0+50, 50 s avant
        res = self.run_tool()
        self.assertEqual(res[0]["target_run"], os.path.basename(close))
        self.assertNotEqual(res[0]["target_run"], os.path.basename(far))

    def test_existing_workflow_of_target_is_kept(self):
        self.add_post(1, T0 + 40)
        self.save_mother()
        r1 = self.add_target_run(T0, 30, with_workflow=True)
        self.run_tool(dry_run=False)
        name = os.path.basename(r1)
        with open(rr.run_workflow_path(self.b, name), "rb") as f:
            self.assertEqual(f.read(), b'{"own": 1}')
        self.assertEqual(len(read(r1)["outputs"]), 1)

    def test_two_posts_of_same_run_get_distinct_names(self):
        self.add_post(1, T0 + 40)
        self.add_post(2, T0 + 41)
        self.save_mother()
        r1 = self.add_target_run(T0, 30)
        self.run_tool(dry_run=False)
        base = os.path.splitext(os.path.basename(r1))[0]
        copies = [o["copy"] for o in read(r1)["outputs"]]
        self.assertEqual(copies, ["40.Rush Videos/Footage/%s.mp4" % base, "40.Rush Videos/Footage/%s_02.mp4" % base])

    def test_remaining_post_of_is_renumbered(self):
        self.add_post(1, T0 + 40)           # index 1, sera deplace
        self.add_post(2, T0 + 9000)         # index 2, reste (post de la sortie 0)
        third = self.add_post(3, T0 + 9100)  # index 3, reste, enfant du post d'index 2
        third["post_of"] = 2
        self.save_mother()
        self.add_target_run(T0, 30)
        self.run_tool(dry_run=False)
        rest = read(self.mother)["outputs"]
        self.assertEqual(len(rest), 3)
        self.assertEqual(rest[1]["post_of"], 0)
        self.assertEqual(rest[2]["post_of"], 1)

    def test_same_project_refused(self):
        self.save_mother()
        with self.assertRaises(ValueError):
            rp.repair(self.mother, self.a, "2026-11-04 08:00")

    def test_cli_default_is_dry_run(self):
        self.two_posts()
        snap = self.snapshot()
        with contextlib.redirect_stdout(io.StringIO()):
            code = rp.main(["--mother", self.mother, "--target", self.b, "--since", "2026-11-04 08:00"])
        self.assertEqual(code, 0)
        self.assertEqual(self.snapshot(), snap)
        with contextlib.redirect_stdout(io.StringIO()):
            code = rp.main(["--mother", self.mother, "--target", self.b, "--since", "2026-11-04 08:00", "--apply"])
        self.assertEqual(code, 0)
        self.assertEqual(len(read(self.mother)["outputs"]), 1)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(rp.main(["--mother", self.mother, "--target", self.b, "--since", "bad"]), 2)


if __name__ == "__main__":
    unittest.main()
