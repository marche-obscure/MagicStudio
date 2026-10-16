"""
Tests du module projects (sans ComfyUI) : lancer depuis la racine de
l'extension avec le Python embarque :

    ..\\..\\..\\python_embeded\\python.exe -m unittest discover -s tests -v
"""

import os
import re
import sys
import shutil
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import projects  # noqa: E402

# Cas partages avec tests/test_project_paths.mjs (meme verdict en JS).
VALID_NAMES = ["Clip 01", "Mon projet", "été-2026", "a.b", "x" * 100]
INVALID_NAMES = ["", "   ", "a/b", "a\\b", "a:b", "a*b", "a?b", 'a"b', "a<b", "a>b", "a|b",
                 "fin.", "CON", "nul", "Com1", "lpt9.txt", "..", "x" * 101, "tab\there"]


class ValidateNameTest(unittest.TestCase):
    def test_valid_names(self):
        for name in VALID_NAMES:
            self.assertEqual(projects.validate_name(name), name)

    def test_strips_spaces(self):
        self.assertEqual(projects.validate_name("  Clip  "), "Clip")

    def test_invalid_names(self):
        for name in INVALID_NAMES:
            with self.assertRaises(ValueError, msg=repr(name)):
                projects.validate_name(name)


class ProjectFoldersTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_subfolders_list(self):
        self.assertEqual(projects.SUBFOLDERS,
                         ("00.Workflows", "02.Models", "04.Prompt", "06.LoRA", "08.Images", "10.Son",
                          "12.Video", "14.Video-Audio", "40.Rush Videos", "60.Rush Images"))

    def test_create_project_makes_all_subfolders(self):
        path = projects.create_project(self.root, " Clip 01 ")
        self.assertEqual(path, os.path.join(self.root, "Clip 01"))
        for sub in projects.SUBFOLDERS:
            self.assertTrue(os.path.isdir(os.path.join(path, sub)), sub)

    def test_create_existing_project_refused(self):
        projects.create_project(self.root, "Clip")
        with self.assertRaises(FileExistsError):
            projects.create_project(self.root, "clip")  # Windows : meme dossier

    def test_create_in_missing_root_refused(self):
        with self.assertRaises(FileNotFoundError):
            projects.create_project(os.path.join(self.root, "nope"), "Clip")

    def test_create_in_missing_root_with_create_root(self):
        root = os.path.join(self.root, "new", "root")
        path = projects.create_project(root, "Clip", create_root=True)
        self.assertEqual(path, os.path.join(root, "Clip"))
        self.assertTrue(os.path.isdir(os.path.join(path, "60.Rush Images")))

    def test_create_invalid_name_refused(self):
        with self.assertRaises(ValueError):
            projects.create_project(self.root, "a/b")
        self.assertEqual(os.listdir(self.root), [])

    def test_list_projects_sorted_without_files_and_hidden(self):
        for name in ["beta", "Alpha", ".cache"]:
            os.makedirs(os.path.join(self.root, name))
        open(os.path.join(self.root, "notes.txt"), "w").close()
        self.assertEqual(projects.list_projects(self.root), ["Alpha", "beta"])

    def test_list_missing_root_raises(self):
        with self.assertRaises(FileNotFoundError):
            projects.list_projects(os.path.join(self.root, "nope"))

    def test_ensure_project_recreates_missing_subfolders(self):
        path = projects.create_project(self.root, "Clip")
        shutil.rmtree(os.path.join(path, "10.Son"))
        shutil.rmtree(os.path.join(path, "04.Prompt"))
        created = projects.ensure_project(path)
        self.assertEqual(sorted(created), ["04.Prompt", "10.Son"])
        self.assertEqual(projects.ensure_project(path), [])

    def test_ensure_missing_project_raises(self):
        with self.assertRaises(FileNotFoundError):
            projects.ensure_project(os.path.join(self.root, "nope"))

    def test_open_project(self):
        projects.create_project(self.root, "Clip")
        path = projects.open_project(self.root, "Clip")
        self.assertEqual(path, os.path.join(self.root, "Clip"))
        with self.assertRaises(FileNotFoundError):
            projects.open_project(self.root, "Other")


def write(path, data=b"x"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


class SaveTest(unittest.TestCase):
    """Save : copie des fichiers du Ref Loader dans les dossiers du projet."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.project = projects.create_project(self.tmp, "Clip")
        self.src = os.path.join(self.tmp, "rushs")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def item(self, name, folder, data=b"x"):
        path = os.path.join(self.src, name)
        write(path, data)
        return {"path": path, "folder": folder}

    def test_plan_copy_skip_rename_missing(self):
        a = self.item("a.png", "08.Images")
        same = self.item("b.png", "08.Images", b"same")
        write(os.path.join(self.project, "08.Images", "b.png"), b"same")
        other = self.item("c.png", "08.Images", b"new")
        write(os.path.join(self.project, "08.Images", "c.png"), b"old")
        inside = os.path.join(self.project, "10.Son", "s.wav")
        write(inside)
        missing = {"path": os.path.join(self.src, "nope.mp4"), "folder": "12.Video"}
        plan = projects.plan_save(self.project, [a, same, other, {"path": inside, "folder": "10.Son"}, missing])
        img = os.path.join(self.project, "08.Images")
        self.assertEqual([(p["action"], p["dst"]) for p in plan], [
            ("copy", os.path.join(img, "a.png")),
            ("skip", os.path.join(img, "b.png")),
            ("copy", os.path.join(img, "c (2).png")),
            ("skip", inside),
            ("missing", ""),
        ])

    def test_plan_same_name_twice_in_one_save(self):
        a = self.item("x/a.png", "08.Images", b"1")
        b = self.item("y/a.png", "08.Images", b"2")
        plan = projects.plan_save(self.project, [a, b])
        self.assertEqual([os.path.basename(p["dst"]) for p in plan], ["a.png", "a (2).png"])

    def test_plan_same_file_listed_twice(self):
        a = self.item("a.mp4", "12.Video")
        plan = projects.plan_save(self.project, [a, dict(a)])
        self.assertEqual([p["action"] for p in plan], ["copy", "skip"])
        self.assertEqual(plan[0]["dst"], plan[1]["dst"])

    def test_plan_unknown_folder_refused(self):
        with self.assertRaises(ValueError):
            projects.plan_save(self.project, [self.item("a.png", "../evil")])

    def test_execute_save_copies_and_maps(self):
        a = self.item("a.png", "08.Images", b"img")
        v = self.item("v.mp4", "14.Video-Audio", b"vid")
        both = dict(v, folder="12.Video")
        missing = {"path": os.path.join(self.src, "nope.wav"), "folder": "10.Son"}
        dsts = projects.execute_save(self.project, [a, v, both, missing])
        dst = os.path.join(self.project, "08.Images", "a.png")
        self.assertEqual(dsts, [dst, os.path.join(self.project, "14.Video-Audio", "v.mp4"),
                                os.path.join(self.project, "12.Video", "v.mp4"), ""])
        with open(dst, "rb") as f:
            self.assertEqual(f.read(), b"img")
        self.assertTrue(os.path.isfile(os.path.join(self.project, "14.Video-Audio", "v.mp4")))

    def test_write_config(self):
        path = projects.write_config(self.project, "20261016-153000_REF2VA_minimax_config.json", "{}\n")
        self.assertEqual(path, os.path.join(self.project, "00.Workflows", "20261016-153000_REF2VA_minimax_config.json"))
        for bad in ["../x.json", "a/b.json", "x.txt", ""]:
            with self.assertRaises(ValueError, msg=bad):
                projects.write_config(self.project, bad, "{}")


class RenameMoveTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.project = projects.create_project(self.tmp, "Clip")
        write(os.path.join(self.project, "08.Images", "a.png"))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_rename(self):
        new = projects.rename_project(self.project, " Clip v2 ")
        self.assertEqual(new, os.path.join(self.tmp, "Clip v2"))
        self.assertTrue(os.path.isfile(os.path.join(new, "08.Images", "a.png")))
        self.assertFalse(os.path.exists(self.project))

    def test_rename_refused(self):
        projects.create_project(self.tmp, "Other")
        with self.assertRaises(FileExistsError):
            projects.rename_project(self.project, "other")
        with self.assertRaises(ValueError):
            projects.rename_project(self.project, "a:b")
        with self.assertRaises(ValueError):
            projects.rename_project(self.project, "Clip")  # meme nom

    def test_move(self):
        dest = os.path.join(self.tmp, "ailleurs", "projets")
        new = projects.move_project(self.project, dest)
        self.assertEqual(new, os.path.join(dest, "Clip"))
        self.assertTrue(os.path.isfile(os.path.join(new, "08.Images", "a.png")))
        self.assertFalse(os.path.exists(self.project))

    def test_move_refused(self):
        dest = os.path.join(self.tmp, "d")
        os.makedirs(os.path.join(dest, "Clip"))
        with self.assertRaises(FileExistsError):
            projects.move_project(self.project, dest)
        with self.assertRaises(ValueError):
            projects.move_project(self.project, self.tmp)  # meme dossier
        with self.assertRaises(ValueError):
            projects.move_project(self.project, os.path.join(self.project, "08.Images"))  # dans lui-meme


class SameAsJsTest(unittest.TestCase):
    """La liste des sous-dossiers doit etre la meme cote JS."""

    def test_js_subfolders(self):
        with open(os.path.join(os.path.dirname(HERE), "web", "js", "project_paths.js"), encoding="utf-8") as f:
            src = f.read()
        m = re.search(r"PROJECT_SUBFOLDERS\s*=\s*\[([^\]]*)\]", src)
        self.assertIsNotNone(m)
        self.assertEqual(tuple(re.findall(r'"([^"]*)"', m.group(1))), projects.SUBFOLDERS)


if __name__ == "__main__":
    unittest.main()
