"""
Tests du module projects (sans ComfyUI) : lancer depuis la racine de
l'extension avec le Python embarque :

    ..\\..\\..\\python_embeded\\python.exe -m unittest discover -s tests -v
"""

import os
import re
import sys
import json
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
                         ("Workflows", "Prompt", "Images", "Son", "Rush Videos", "Rush Images"))

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
        shutil.rmtree(os.path.join(path, "Son"))
        shutil.rmtree(os.path.join(path, "Prompt"))
        created = projects.ensure_project(path)
        self.assertEqual(sorted(created), ["Prompt", "Son"])
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


class StateTest(unittest.TestCase):
    def test_parse_state(self):
        self.assertEqual(projects.parse_state(json.dumps({"root": "R", "name": "N", "path": "x"})),
                         {"root": "R", "name": "N"})

    def test_parse_state_tolerant(self):
        for raw in ["", "{", "[]", "null", json.dumps({"root": 3, "name": None})]:
            self.assertEqual(projects.parse_state(raw), {"root": "", "name": ""})

    def test_project_path(self):
        self.assertEqual(projects.project_path({"root": "", "name": "Clip"}, "D"), os.path.join("D", "Clip"))
        self.assertEqual(projects.project_path({"root": "R", "name": "Clip"}, "D"), os.path.join("R", "Clip"))
        self.assertEqual(projects.project_path({"root": "R", "name": ""}, "D"), "")


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
