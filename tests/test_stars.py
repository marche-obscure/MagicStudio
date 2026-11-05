"""Etoiles de comparaison (stars.py) : dossiers temporaires seulement, sans ComfyUI."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import projects  # noqa: E402
import run_record as rr  # noqa: E402
import stars  # noqa: E402

WHEN = time.mktime((2026, 11, 5, 10, 15, 0, 0, 0, -1))


def write(path, data=b"x"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    return path


def make_junction(link, target):
    """Jonction (Windows) ou lien symbolique ; False si impossible."""
    try:
        os.symlink(target, link, target_is_directory=True)
        return True
    except (OSError, NotImplementedError):
        pass
    if os.name == "nt":
        r = subprocess.run(["cmd", "/c", "mklink", "/J", link, target], capture_output=True)
        return r.returncode == 0
    return False


def remove_link(path):
    """Retire une jonction sans toucher a sa cible."""
    try:
        os.rmdir(path)
    except OSError:
        os.remove(path)


class StarsTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.roots = [self.root]
        self.p = projects.create_project(self.root, "Clip")
        self.list_file = os.path.join(self.p, "99.Project-Config", "stars.json")

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def run_with(self, project, outputs, when=WHEN):
        path = rr.start_run(project, "p", {}, when)
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        data.update({"status": "done", "outputs": outputs})
        rr._write(path, data)
        return path

    def read_run(self, path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def read_stars(self):
        with open(self.list_file, "r", encoding="utf-8") as f:
            return json.load(f)

    def test_project_of_a_path(self):
        a = write(os.path.join(self.p, "08.Images", "a.png"))
        self.assertEqual(os.path.normcase(stars.project_of(a, self.roots)), os.path.normcase(self.p))
        other = tempfile.mkdtemp()
        try:
            b = write(os.path.join(other, "Clip", "08.Images", "b.png"))
            self.assertIsNone(stars.project_of(b, self.roots))
        finally:
            shutil.rmtree(other, ignore_errors=True)
        c = write(os.path.join(self.root, "Plain", "c.png"))
        self.assertIsNone(stars.project_of(c, self.roots))

    def test_run_output_gets_the_star(self):
        x = write(os.path.join(self.p, "40.Rush Videos", "Footage", "x.mp4"))
        copy = write(os.path.join(self.p, "40.Rush Videos", "Footage", "x_small.mp4"))
        run = self.run_with(self.p, [{"source": x, "kind": "video", "copy": None},
                                     {"source": "Z:/gone/y.mp4", "kind": "video",
                                      "copy": "40.Rush Videos/Footage/x_small.mp4"}])
        self.assertEqual(stars.set_star(x, "", self.roots), {"on": "run", "off": ""})
        self.assertIs(self.read_run(run)["outputs"][0]["star"], True)
        self.assertEqual(stars.set_star("", x, self.roots), {"on": "", "off": "run"})
        self.assertNotIn("star", self.read_run(run)["outputs"][0])
        # la copie est reconnue comme la source
        self.assertEqual(stars.set_star(copy, "", self.roots)["on"], "run")
        self.assertIs(self.read_run(run)["outputs"][1]["star"], True)
        self.assertFalse(os.path.exists(self.list_file))

    def test_other_file_goes_to_stars_json(self):
        a = write(os.path.join(self.p, "08.Images", "a.png"))
        self.assertEqual(stars.set_star(a, "", self.roots), {"on": "list", "off": ""})
        self.assertEqual(self.read_stars(), {"format": "MagicStudio Stars", "version": 1,
                                             "stars": ["08.Images/a.png"]})
        self.assertEqual(stars.read_list(self.p), ["08.Images/a.png"])
        self.assertEqual(stars.set_star("", a, self.roots)["off"], "list")
        self.assertEqual(self.read_stars()["stars"], [])

    def test_on_and_off_in_one_call(self):
        a = write(os.path.join(self.p, "08.Images", "a.png"))
        b = write(os.path.join(self.p, "08.Images", "b.png"))
        stars.set_star(b, "", self.roots)
        self.assertEqual(stars.set_star(a, b, self.roots), {"on": "list", "off": "list"})
        self.assertEqual(self.read_stars()["stars"], ["08.Images/a.png"])
        # deux projets : les deux sont ecrits
        p2 = projects.create_project(self.root, "Other")
        c = write(os.path.join(p2, "08.Images", "c.png"))
        stars.set_star(c, "", self.roots)
        d = write(os.path.join(self.p, "08.Images", "d.png"))
        self.assertEqual(stars.set_star(d, c, self.roots), {"on": "list", "off": "list"})
        self.assertEqual(self.read_stars()["stars"], ["08.Images/a.png", "08.Images/d.png"])
        self.assertEqual(stars.read_list(p2), [])

    def test_on_and_off_checked_before_writing(self):
        target = tempfile.mkdtemp()
        p2 = projects.create_project(self.root, "Other")
        cfg = os.path.join(p2, "99.Project-Config")
        try:
            shutil.rmtree(cfg, ignore_errors=True)
            if not make_junction(cfg, target):
                self.skipTest("junction not available")
            a = write(os.path.join(self.p, "08.Images", "a.png"))
            b = write(os.path.join(p2, "08.Images", "b.png"))
            with self.assertRaises(ValueError):
                stars.set_star(a, b, self.roots)
            self.assertFalse(os.path.exists(self.list_file))
            self.assertEqual(os.listdir(target), [])
        finally:
            if os.path.lexists(cfg):
                remove_link(cfg)
            shutil.rmtree(target, ignore_errors=True)

    def test_outside_the_project_stays_in_the_node(self):
        f = write(os.path.join(self.root, "Plain", "f.png"))
        self.assertEqual(stars.set_star(f, "", self.roots), {"on": "node", "off": ""})
        self.assertFalse(os.path.exists(self.list_file))
        self.assertEqual(stars.set_star("", "", self.roots), {"on": "", "off": ""})

    def test_star_refused_through_a_junction(self):
        target = tempfile.mkdtemp()
        cfg = os.path.join(self.p, "99.Project-Config")
        try:
            shutil.rmtree(cfg, ignore_errors=True)
            if not make_junction(cfg, target):
                self.skipTest("junction not available")
            a = write(os.path.join(self.p, "08.Images", "a.png"))
            with self.assertRaises(ValueError):
                stars.set_star(a, "", self.roots)
            self.assertEqual(os.listdir(target), [])
        finally:
            if os.path.lexists(cfg):
                remove_link(cfg)
            shutil.rmtree(target, ignore_errors=True)

    def test_stars_json_leaving_the_folder_refused(self):
        target = tempfile.mkdtemp()
        try:
            real = os.path.join(target, "stars.json")
            write(real, b"{}")
            try:
                os.symlink(real, self.list_file)
            except (OSError, NotImplementedError):
                self.skipTest("file symlink not available")
            a = write(os.path.join(self.p, "08.Images", "a.png"))
            with self.assertRaises(ValueError) as cm:
                stars.set_star(a, "", self.roots)
            self.assertEqual(str(cm.exception), "stars.json is not inside the project")
            with open(real, "rb") as f:
                self.assertEqual(f.read(), b"{}")
        finally:
            shutil.rmtree(target, ignore_errors=True)

    def test_missing_file(self):
        a = os.path.join(self.p, "08.Images", "a.png")
        with self.assertRaises(FileNotFoundError):
            stars.set_star(a, "", self.roots)
        write(a)
        stars.set_star(a, "", self.roots)
        os.remove(a)
        self.assertEqual(stars.set_star("", a, self.roots)["off"], "list")
        self.assertEqual(stars.read_list(self.p), [])

    def test_list_stars(self):
        x = write(os.path.join(self.p, "40.Rush Videos", "Footage", "x.mp4"))
        copy = write(os.path.join(self.p, "40.Rush Videos", "Footage", "x_small.mp4"))
        gone = os.path.join(self.p, "40.Rush Videos", "Footage", "gone.mp4")
        a = write(os.path.join(self.p, "08.Images", "a.png"))
        b = write(os.path.join(self.p, "08.Images", "b.png"))
        self.run_with(self.p, [{"source": x, "kind": "video", "copy": "40.Rush Videos/Footage/x_small.mp4",
                                "star": True},
                               {"source": gone, "kind": "video", "copy": None, "star": True},
                               {"source": b, "kind": "image", "copy": None}])
        stars.set_star(a, "", self.roots)  # a n'est pas une sortie de Run : va dans stars.json
        stars.set_star(b, "", self.roots)  # b est une sortie de Run : va dans le Run
        got = {os.path.normcase(p) for p in stars.list_stars(self.p)}
        self.assertEqual(got, {os.path.normcase(p) for p in (x, copy, a, b)})
        os.remove(a)
        got = {os.path.normcase(p) for p in stars.list_stars(self.p)}
        self.assertNotIn(os.path.normcase(a), got)
        self.assertEqual(stars.list_stars(os.path.join(self.root, "nope")), [])

    def test_follow(self):
        a = write(os.path.join(self.p, "08.Images", "a.png"))
        stars.set_star(a, "", self.roots)
        moved = projects.archive_files(self.p, "08.Images", ["a.png"], WHEN)
        stars.follow(self.p, [(a, moved[0])])
        self.assertEqual(self.read_stars()["stars"], ["08.Images/Archives/20261105_101500_a.png"])
        # retour depuis Archives
        back = projects.import_files(self.p, "08.Images", moved)
        stars.follow(self.p, [(moved[0], back[0])])
        self.assertEqual(self.read_stars()["stars"], ["08.Images/a.png"])
        # une copie (l'ancien fichier est toujours la) garde l'etoile de l'original
        ext = write(os.path.join(self.root, "ext", "a.png"))
        stars.follow(self.p, [(back[0], ext)])
        self.assertEqual(self.read_stars()["stars"], ["08.Images/a.png"])
        # sans liste : rien n'est cree
        p2 = projects.create_project(self.root, "Other")
        stars.follow(p2, [(back[0], ext)])
        self.assertFalse(os.path.exists(os.path.join(p2, "99.Project-Config", "stars.json")))

    def test_holds_the_project_lock(self):
        a = write(os.path.join(self.p, "08.Images", "a.png"))
        done = []
        lock = rr.project_lock(self.p)
        t = threading.Thread(target=lambda: done.append(stars.set_star(a, "", self.roots)))
        with lock:
            t.start()
            t.join(0.4)
            self.assertTrue(t.is_alive())
            self.assertEqual(done, [])
        t.join(5)
        self.assertEqual(done, [{"on": "list", "off": ""}])


if __name__ == "__main__":
    unittest.main()
