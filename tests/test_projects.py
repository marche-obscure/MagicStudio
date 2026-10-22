"""
Tests du module projects (sans ComfyUI) : lancer depuis la racine de
l'extension avec le Python embarque :

    ..\\..\\..\\python_embeded\\python.exe -m unittest discover -s tests -v
"""

import os
import re
import sys
import shutil
import time
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

    def test_create_multi_project(self):
        r = self.root
        first = projects.create_project(r, "Shot1", group="Film", new_group=True)
        self.assertEqual(first, os.path.join(r, "Film", "Shot1"))
        self.assertTrue(projects.is_project(first))
        self.assertFalse(projects.is_project(os.path.join(r, "Film")))
        second = projects.create_project(r, "Shot2", group="Film")
        self.assertEqual(projects.list_projects(r), ["Film/Shot1", "Film/Shot2"])
        self.assertTrue(os.path.isdir(os.path.join(second, "08.Images")))
        with self.assertRaises(FileExistsError):      # dossier de projets deja pris
            projects.create_project(r, "X", group="film", new_group=True)
        with self.assertRaises(FileExistsError):      # sous-projet deja pris
            projects.create_project(r, "shot1", group="Film")
        with self.assertRaises(FileNotFoundError):
            projects.create_project(r, "X", group="Nope")
        simple = projects.create_project(r, "Simple")
        with self.assertRaises(ValueError):           # un projet simple ne contient pas de projet
            projects.create_project(r, "X", group="Simple")
        with self.assertRaises(ValueError):           # un sous-projet non plus (racine = projet)
            projects.create_project(first, "X")
        with self.assertRaises(ValueError):
            projects.create_project(simple, "X", group="G", new_group=True)
        with self.assertRaises(ValueError):           # un seul niveau : pas de separateur
            projects.create_project(r, "X", group="Film/Shot1")
        self.assertFalse(os.path.exists(os.path.join(r, "G")))

    def test_anchor_root_on_the_parent_folder(self):
        r = self.root
        sub = projects.create_project(r, "Speech", group="Yacht", new_group=True)
        solo = projects.create_project(r, "Solo")
        group = os.path.join(r, "Yacht")
        self.assertTrue(projects.is_group(group))                    # marque posee a la creation
        self.assertEqual(projects.anchor_root(r), (r, ""))            # racine normale : inchangee
        self.assertEqual(projects.anchor_root(group), (r, "Yacht"))
        self.assertEqual(projects.anchor_root(sub), (r, "Yacht/Speech"))
        self.assertEqual(projects.anchor_root(solo), (r, "Solo"))
        # Groupe cree a la main : marque quand la racine le liste.
        other = os.path.join(r, "Old")
        projects.create_project(other, "Shot", create_root=True)
        self.assertEqual(projects.anchor_root(other), (other, ""))
        projects.project_tree(r)
        self.assertEqual(projects.anchor_root(other), (r, "Old"))
        self.assertEqual(projects.list_projects(r), ["Old/Shot", "Solo", "Yacht/Speech"])

    def test_folder_of_projects_with_stray_parts_stays_a_group(self):
        r = self.root
        projects.create_project(r, "Shot1", group="Film", new_group=True)
        os.makedirs(os.path.join(r, "Film", "08.Images"))      # cree par erreur (ancienne version)
        self.assertFalse(projects.is_project(os.path.join(r, "Film")))
        self.assertEqual(projects.project_tree(r), [{"name": "Film", "projects": ["Shot1"]}])
        self.assertEqual(projects.project_children(os.path.join(r, "Film")), ["Shot1"])
        projects.create_project(r, "Shot2", group="Film")       # on peut toujours y ajouter un projet
        with self.assertRaises(ValueError):                      # jamais complete en projet
            projects.ensure_project(os.path.join(r, "Film"))
        self.assertFalse(os.path.isdir(os.path.join(r, "Film", "00.Workflows")))
        self.assertEqual(projects.list_projects(r), ["Film/Shot1", "Film/Shot2"])

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
            os.makedirs(os.path.join(self.root, name, "08.Images"))
        open(os.path.join(self.root, "notes.txt"), "w").close()
        self.assertEqual(projects.list_projects(self.root), ["Alpha", "beta"])

    def test_project_tree_with_folders_of_projects(self):
        r = self.root
        projects.create_project(r, "Solo")
        os.makedirs(os.path.join(r, "Group"))
        projects.create_project(os.path.join(r, "Group"), "Two")
        projects.create_project(os.path.join(r, "Group"), "one")
        os.makedirs(os.path.join(r, "Group", "Prompt"))           # pas un projet : masque
        os.makedirs(os.path.join(r, "Videos"))                     # sans projet : masque
        open(os.path.join(r, "Videos", "a.mp4"), "w").close()
        os.makedirs(os.path.join(r, "12.Video"))                   # racine = un projet : ses dossiers masques
        self.assertFalse(projects.is_project(os.path.join(r, "Videos")))
        self.assertEqual(projects.project_tree(r), [
            {"name": "Group", "projects": ["one", "Two"]}, {"name": "Solo", "projects": None}])
        self.assertEqual(projects.list_projects(r), ["Group/one", "Group/Two", "Solo"])
        self.assertEqual(projects.project_path(r, "Group/one"), os.path.join(r, "Group", "one"))
        self.assertEqual(projects.project_path(r, " Solo "), os.path.join(r, "Solo"))
        for bad in ("a/b/c", "Group/", "Group/x:y"):
            with self.assertRaises(ValueError):
                projects.project_path(r, bad)

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
        for rush in ("40.Rush Videos", "60.Rush Images"):
            self.assertEqual(sorted(os.listdir(os.path.join(path, rush))), ["Footage", "No Good", "Picture Lock", "Rough Cut"])

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


class WorkflowTest(unittest.TestCase):
    """Sauvegarde du workflow dans 00.Workflows, archives yyyyMMdd-HHmmss_nom.json."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.project = projects.create_project(self.tmp, "Proj")
        self.wf = os.path.join(self.project, "00.Workflows")
        self.arch = os.path.join(self.wf, "Archives")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_workflow_file_name(self):
        self.assertEqual(projects.workflow_file_name(" Clip "), "Clip.json")
        self.assertEqual(projects.workflow_file_name("Clip.json"), "Clip.json")
        for bad in ["", "a/b", "20261016-153000_Clip", "20261016-153000_REF2VA_minimax_config.json"]:
            with self.assertRaises(ValueError, msg=bad):
                projects.workflow_file_name(bad)

    def test_save_list_read(self):
        info = projects.save_workflow(self.project, "Clip", '{"a": 1}')
        self.assertEqual(info["name"], "Clip.json")
        self.assertEqual(projects.read_workflow(self.project, "Clip.json"), '{"a": 1}')
        write(os.path.join(self.wf, "20261016-153000_REF2VA_minimax_config.json"), b"{}")
        listing = projects.list_workflows(self.project)
        self.assertEqual([w["name"] for w in listing["workflows"]], ["Clip.json"])
        self.assertEqual(listing["archives"], [])

    def test_archive_uses_old_save_time(self):
        projects.save_workflow(self.project, "Clip", "v1")
        old = os.path.join(self.wf, "Clip.json")
        t = time.mktime((2026, 10, 16, 15, 30, 0, 0, 0, -1))
        os.utime(old, (t, t))
        info = projects.save_workflow(self.project, "Clip", "v2", archive="Clip.json")
        self.assertEqual(info["archived"], "20261016-153000_Clip.json")
        self.assertTrue(os.path.isfile(os.path.join(self.arch, "20261016-153000_Clip.json")))
        self.assertFalse(os.path.exists(os.path.join(self.wf, "20261016-153000_Clip.json")))
        self.assertEqual(projects.read_workflow(self.project, "20261016-153000_Clip.json", archive=True), "v1")
        self.assertEqual(projects.read_workflow(self.project, "Clip.json"), "v2")
        listing = projects.list_workflows(self.project)
        self.assertEqual([a["name"] for a in listing["archives"]], ["20261016-153000_Clip.json"])
        self.assertEqual(listing["archives"][0]["of"], "Clip.json")
        # Meme seconde : pas d'ecrasement d'une archive.
        os.utime(os.path.join(self.wf, "Clip.json"), (t, t))
        info = projects.save_workflow(self.project, "Clip", "v3", archive="Clip.json")
        self.assertEqual(info["archived"], "20261016-153000_Clip (2).json")

    def test_rename_while_archiving(self):
        projects.save_workflow(self.project, "Clip", "v1")
        info = projects.save_workflow(self.project, "Clip final", "v2", archive="Clip.json")
        self.assertEqual(info["name"], "Clip final.json")
        self.assertTrue(info["archived"].endswith("_Clip.json"))
        self.assertFalse(os.path.exists(os.path.join(self.wf, "Clip.json")))

    def test_archives_sorted_newest_first(self):
        for n in ["20261001-100000_Clip.json", "20261016-100000_Clip.json", "20261010-100000_Other.json"]:
            write(os.path.join(self.arch, n), b"{}")
        names = [a["name"] for a in projects.list_workflows(self.project)["archives"]]
        self.assertEqual(names, ["20261016-100000_Clip.json", "20261010-100000_Other.json", "20261001-100000_Clip.json"])

    def test_at_most_five_archives(self):
        for i in range(projects.MAX_ARCHIVES):
            write(os.path.join(self.arch, "2026100%d-100000_Clip.json" % (i + 1)), b"{}")
        projects.save_workflow(self.project, "Clip", "v1")
        with self.assertRaises(ValueError):
            projects.save_workflow(self.project, "Clip", "v2", archive="Clip.json")
        self.assertEqual(projects.read_workflow(self.project, "Clip.json"), "v1")
        # Ecraser reste possible.
        projects.save_workflow(self.project, "Clip", "v2")
        projects.delete_archive(self.project, "20261001-100000_Clip.json")
        info = projects.save_workflow(self.project, "Clip", "v3", archive="Clip.json")
        self.assertTrue(info["archived"])
        self.assertEqual(len(projects.list_workflows(self.project)["archives"]), projects.MAX_ARCHIVES)

    def test_delete_archive_only(self):
        projects.save_workflow(self.project, "Clip", "v1")
        write(os.path.join(self.wf, "20261016-153000_REF2VA_minimax_config.json"), b"{}")
        for bad in ["notes.txt", "../20261016-153000_x.json"]:
            with self.assertRaises(ValueError, msg=bad):
                projects.delete_archive(self.project, bad)
        # Les fichiers de la racine ne sont jamais touches.
        for root_file in ["Clip.json", "20261016-153000_REF2VA_minimax_config.json", "20261016-153000_Nope.json"]:
            with self.assertRaises(FileNotFoundError, msg=root_file):
                projects.delete_archive(self.project, root_file)
        self.assertTrue(os.path.isfile(os.path.join(self.wf, "Clip.json")))
        write(os.path.join(self.arch, "old.json"), b"{}")
        projects.delete_archive(self.project, "old.json")
        self.assertFalse(os.path.exists(os.path.join(self.arch, "old.json")))

    def test_project_files_renamed_and_follow_the_project(self):
        # Ancien nom -> workflows_<projet>.json, Project-Config.json -> config_projets_<projet>.json.
        p = projects.create_project(self.tmp, "Lapin")
        write(os.path.join(p, "00.Workflows", "Lapin.json"), b"wf")
        write(os.path.join(p, "99.Project-Config", "Project-Config.json"), b"cfg")
        self.assertEqual([w["name"] for w in projects.list_workflows(p)["workflows"]], ["workflows_Lapin.json"])
        self.assertTrue(os.path.isfile(os.path.join(p, "99.Project-Config", "config_projets_Lapin.json")))
        # Archive demandee sous l'ancien nom : celle du nouveau nom.
        info = projects.save_workflow(p, "workflows_Lapin", "v2", archive="Lapin.json")
        self.assertTrue(info["archived"].endswith("_workflows_Lapin.json"))
        # Le renommage du projet renomme les deux fichiers.
        new = projects.rename_project(p, "Lapin blanc")
        self.assertTrue(os.path.isfile(os.path.join(new, "00.Workflows", "workflows_Lapin blanc.json")))
        self.assertTrue(os.path.isfile(os.path.join(new, "99.Project-Config", "config_projets_Lapin blanc.json")))
        self.assertFalse(os.path.exists(os.path.join(new, "00.Workflows", "workflows_Lapin.json")))

    def test_old_archives_move_into_archives_folder(self):
        write(os.path.join(self.wf, "Clip.json"), b"{}")
        write(os.path.join(self.wf, "20261016-153000_Clip.json"), b"old")
        write(os.path.join(self.wf, "20261016-153000_REF2VA_minimax_config.json"), b"{}")
        write(os.path.join(self.arch, "20261016-153000_Clip.json"), b"there")
        write(os.path.join(self.arch, "manual.json"), b"{}")
        listing = projects.list_workflows(self.project)
        self.assertEqual([w["name"] for w in listing["workflows"]], ["Clip.json"])
        self.assertEqual(sorted(a["name"] for a in listing["archives"]),
                         ["20261016-153000_Clip (2).json", "20261016-153000_Clip.json", "manual.json"])
        self.assertTrue(os.path.isfile(os.path.join(self.wf, "20261016-153000_REF2VA_minimax_config.json")))
        self.assertEqual(projects.read_workflow(self.project, "20261016-153000_Clip (2).json", archive=True), "old")
        manual = [a for a in listing["archives"] if a["name"] == "manual.json"][0]
        self.assertEqual(manual["of"], "manual.json")
        self.assertRegex(manual["stamp"], r"^\d{8}-\d{6}$")

    def test_read_refuses_paths(self):
        with self.assertRaises(ValueError):
            projects.read_workflow(self.project, "../x.json")
        with self.assertRaises(FileNotFoundError):
            projects.read_workflow(self.project, "nope.json")


class ArchiveFilesTest(unittest.TestCase):
    """Fichiers plus utilises : deplaces dans <dossier>/Archives, jamais effaces."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.project = projects.create_project(self.tmp, "Clip")
        self.img = os.path.join(self.project, "08.Images")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_moves_into_archives_with_date_prefix(self):
        # yyyyMMdd_HHmmss_<nom sans "(x)"> (date de l'archivage) ; nom pris : une seconde de plus.
        when = time.mktime((2026, 10, 17, 15, 30, 0, 0, 0, -1))
        write(os.path.join(self.img, "a.png"), b"1")
        write(os.path.join(self.img, "TalonHaut-01 (2) (2) (2).png"), b"2")
        write(os.path.join(self.img, "Archives", "a.png"), b"old")
        moved = projects.archive_files(self.project, "08.Images", ["a.png", "TalonHaut-01 (2) (2) (2).png"], when)
        arch = os.path.join(self.img, "Archives")
        self.assertEqual(moved, [os.path.join(arch, "20261017_153000_a.png"),
                                 os.path.join(arch, "20261017_153000_TalonHaut-01.png")])
        self.assertFalse(os.path.exists(os.path.join(self.img, "a.png")))
        with open(os.path.join(arch, "a.png"), "rb") as f:
            self.assertEqual(f.read(), b"old")
        write(os.path.join(self.img, "a (3).png"), b"3")
        again = projects.archive_files(self.project, "08.Images", ["a (3).png"], when)
        self.assertEqual(again, [os.path.join(arch, "20261017_153001_a.png")])

    def test_clean_archive_name(self):
        self.assertEqual(projects.clean_archive_name("20261017_153000_TalonHaut-01 (2) (2).png"), "TalonHaut-01.png")
        self.assertEqual(projects.clean_archive_name("shot (12).mp4"), "shot.mp4")
        self.assertEqual(projects.clean_archive_name("b1_02.png"), "b1_02.png")
        self.assertEqual(projects.clean_archive_name("(2).png"), "(2).png")

    def test_back_from_archives_gets_its_name(self):
        arch = os.path.join(self.img, "Archives", "20261017_153000_a.png")
        write(arch, b"a")
        self.assertEqual(projects.import_files(self.project, "08.Images", [arch]), [os.path.join(self.img, "a.png")])

    def test_refuses_bad_input_and_moves_nothing(self):
        write(os.path.join(self.img, "a.png"))
        for folder, names in [("08.Images", ["../x.png"]), ("Nope", ["a.png"])]:
            with self.assertRaises(ValueError):
                projects.archive_files(self.project, folder, names)
        with self.assertRaises(FileNotFoundError):
            projects.archive_files(self.project, "08.Images", ["a.png", "missing.png"])
        self.assertTrue(os.path.isfile(os.path.join(self.img, "a.png")))


class FolderFilesTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.p = projects.create_project(self.root, "Clip")

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_root_files_only_sorted(self):
        img = os.path.join(self.p, "08.Images")
        for n in ["b.png", "A.png", ".hidden", "Archives/old.png"]:
            write(os.path.join(img, n))
        out = projects.folder_files(self.p, ["08.Images", "10.Son"])
        times = projects.file_mtimes(out)
        self.assertEqual(sorted(times), sorted(p for v in out.values() for p in v))
        self.assertTrue(all(isinstance(t, float) for t in times.values()))
        self.assertEqual(out["08.Images"], [os.path.join(img, "A.png"), os.path.join(img, "b.png")])
        self.assertEqual(out["10.Son"], [])
        arch = projects.folder_files(self.p, ["08.Images", "10.Son"], "Archives")
        self.assertEqual(arch, {"08.Images": [os.path.join(img, "Archives", "old.png")], "10.Son": []})
        with self.assertRaises(ValueError):
            projects.folder_files(self.p, ["08.Images"], "..")
        with self.assertRaises(ValueError):
            projects.folder_files(self.p, ["99.Project-Config"])
        with self.assertRaises(FileNotFoundError):
            projects.folder_files(os.path.join(self.root, "nope"), ["08.Images"])


class ArchiveDuplicatesTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.p = projects.create_project(self.root, "Clip")
        self.arch = os.path.join(self.p, "08.Images", "Archives")

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def add(self, name, data, mtime):
        path = os.path.join(self.arch, name)
        write(path, data)
        os.utime(path, (mtime, mtime))
        return path

    def test_groups_and_kept_copy(self):
        self.add("a (2).png", b"A", 100)      # le plus ancien, mais avec suffixe
        self.add("a.png", b"A", 300)          # nom sans suffixe : garde
        self.add("a_02.png", b"A", 200)
        self.add("x_03.png", b"X", 300)
        self.add("y_02.png", b"X", 100)       # tous avec suffixe : le plus ancien
        self.add("solo.png", b"S", 100)
        self.add("20261017_100000_s (2).png", b"S", 50)   # date mais "(x)" : pas prioritaire
        self.add("20261017_110000_s.png", b"S", 400)      # date sans "(x)" : garde
        write(os.path.join(self.p, "08.Images", "a.png"), b"A")   # racine : ignoree
        groups = projects.archive_duplicates(self.p, ["08.Images", "10.Son"])
        self.assertEqual(groups["10.Son"], [])
        g = groups["08.Images"]
        self.assertEqual([[f["name"] for f in x["files"]] for x in g], [
            ["20261017_110000_s.png", "solo.png", "20261017_100000_s (2).png"],
            ["a.png", "a (2).png", "a_02.png"], ["y_02.png", "x_03.png"]])
        self.assertEqual([[f["keep"] for f in x["files"]] for x in g],
                         [[True, False, False], [True, False, False], [True, False]])
        self.assertEqual(g[0]["files"][0]["size"], 1)

    def test_delete_keeps_one_copy_per_checked_group(self):
        self.add("a.png", b"A", 300)
        self.add("a (2).png", b"A", 100)
        self.add("x.png", b"X", 100)
        self.add("x (2).png", b"X", 200)
        sha_a = projects.file_hash(os.path.join(self.arch, "a.png"))
        deleted = projects.delete_duplicates(self.p, "08.Images", [sha_a, "unknown"], False)
        self.assertEqual(deleted, ["a (2).png"])
        # Exemplaire garde sans date : renomme avec la date du fichier en prefixe.
        kept = time.strftime("%Y%m%d_%H%M%S", time.localtime(300)) + "_a.png"
        self.assertEqual(sorted(os.listdir(self.arch)), sorted([kept, "x (2).png", "x.png"]))
        # Plus de doublon pour A : rien a supprimer.
        self.assertEqual(projects.delete_duplicates(self.p, "08.Images", [sha_a], False), [])
        self.assertEqual(len(projects.archive_duplicates(self.p, ["08.Images"])["08.Images"]), 1)
        with self.assertRaises(ValueError):
            projects.delete_duplicates(self.p, "99.Project-Config", [sha_a], False)


class ImportFilesTest(unittest.TestCase):
    """Remplacants valides : copies (deplaces depuis Archives) dans le dossier du projet."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.project = projects.create_project(self.tmp, "Clip")
        self.img = os.path.join(self.project, "08.Images")
        self.src = os.path.join(self.tmp, "src")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_import_name(self):
        self.assertEqual(projects.import_name(self.img, "a.png"), "a.png")
        write(os.path.join(self.img, "a.png"))
        self.assertEqual(projects.import_name(self.img, "a.png"), "a_02.png")
        write(os.path.join(self.img, "a_02.png"))
        self.assertEqual(projects.import_name(self.img, "a.png"), "a_03.png")

    def test_copies_outside_moves_from_archives_keeps_inside(self):
        outside = os.path.join(self.src, "a.png")
        write(outside, b"new")
        write(os.path.join(self.img, "a.png"), b"taken")
        arch = os.path.join(self.img, "Archives", "b.png")
        write(arch, b"back")
        inside = os.path.join(self.img, "c.png")
        write(inside, b"c")
        dsts = projects.import_files(self.project, "08.Images", [outside, arch, inside])
        self.assertEqual(dsts, [os.path.join(self.img, "a_02.png"), os.path.join(self.img, "b.png"), inside])
        self.assertTrue(os.path.isfile(outside))  # copie : la source reste
        self.assertFalse(os.path.exists(arch))  # deplace depuis Archives
        with open(dsts[0], "rb") as f:
            self.assertEqual(f.read(), b"new")

    def test_replacing_itself_keeps_its_name(self):
        # L'ancien "a.png" est archive d'abord : le remplacant du meme nom garde son nom.
        write(os.path.join(self.img, "a.png"), b"old")
        new = os.path.join(self.src, "a.png")
        write(new, b"resized")
        projects.archive_files(self.project, "08.Images", ["a.png"])
        dsts = projects.import_files(self.project, "08.Images", [new])
        self.assertEqual(dsts, [os.path.join(self.img, "a.png")])

    def test_refuses_bad_input_and_imports_nothing(self):
        ok = os.path.join(self.src, "a.png")
        write(ok)
        with self.assertRaises(ValueError):
            projects.import_files(self.project, "Nope", [ok])
        with self.assertRaises(FileNotFoundError):
            projects.import_files(self.project, "08.Images", [ok, os.path.join(self.src, "missing.png")])
        self.assertFalse(os.path.exists(os.path.join(self.img, "a.png")))


class HashTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_same_content_same_hash_and_cache_follows_changes(self):
        a, b, c = (os.path.join(self.tmp, n) for n in ("a.png", "b.png", "c.png"))
        write(a, b"same")
        write(b, b"same")
        write(c, b"other")
        h = projects.file_hashes([a, b, c, os.path.join(self.tmp, "missing.png")])
        self.assertEqual(sorted(h), sorted([a, b, c]))
        self.assertEqual(h[a], h[b])
        self.assertNotEqual(h[a], h[c])
        write(a, b"changed!")
        os.utime(a, (time.time() + 10, time.time() + 10))
        self.assertNotEqual(projects.file_hash(a), h[b])


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
