"""
Tests du module project_config (sans ComfyUI) : lancer depuis la racine de
l'extension avec le Python embarque :

    ..\\..\\..\\python_embeded\\python.exe -m unittest discover -s tests -v
"""

import json
import os
import sys
import shutil
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import projects  # noqa: E402
import project_config as pc  # noqa: E402


def write(path, data=b"x"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    return path


def read(path):
    with open(path, "rb") as f:
        return f.read()


def wf_json(nodes, links):
    return json.dumps({"nodes": [{"id": i, "type": t} for i, t in nodes], "links": links}).encode()


class ProjectConfigTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.p = projects.create_project(self.root, "Clip")
        self.f = lambda folder, name="": os.path.join(self.p, folder, name) if name else os.path.join(self.p, folder)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def refs(self):
        a = write(self.f("08.Images", "a.png"), b"A")
        b = write(self.f("08.Images", "b.png"), b"B")
        v = write(self.f("12.Video", "shot.mp4"), b"V")
        return {"images": [b, a], "first_frame": [a], "videos": [v]}, {"video": {pc.trim_key(v): [5, 7]}}

    # ---- dossier ----
    def test_project_has_config_folder_with_archives(self):
        self.assertTrue(os.path.isdir(os.path.join(self.p, "99.Project-Config", "Archives")))
        self.assertNotIn("99.Project-Config", projects.SUBFOLDERS)
        shutil.rmtree(os.path.join(self.p, "99.Project-Config"))
        self.assertEqual(projects.ensure_project(self.p), ["99.Project-Config"])
        self.assertTrue(os.path.isdir(os.path.join(self.p, "99.Project-Config", "Archives")))

    # ---- contenu ----
    def test_build_lists_every_folder_with_indices(self):
        refs, trims = self.refs()
        write(self.f("02.Models", "m.safetensors"), b"M")
        write(self.f("04.Prompt", "p.txt"), b"P")
        write(self.f("08.Images", "Archives/old.png"), b"O")
        cfg = pc.build_config(self.p, refs, trims, "ref2va", now="2026-10-17 10:00:00")
        self.assertEqual(cfg["Project"], "Clip")
        self.assertEqual(cfg["mode"], "REF2VA")
        self.assertEqual(cfg["datecreat"], "2026-10-17 10:00:00")
        self.assertEqual(cfg["ProjectDir"], self.p)
        self.assertEqual([k for k in cfg if k[0].isdigit()], list(projects.SUBFOLDERS))
        self.assertNotIn("99.Project-Config", cfg)
        img = cfg["08.Images"][0]
        self.assertEqual((img["Valide"], img["NbImage"]), (True, 3))
        self.assertEqual(img["image 1"][0]["nom"], "b.png")
        self.assertEqual(img["image 1"][0]["Indice"], 1)
        self.assertEqual(img["image 2"][0]["Indice"], 2)
        self.assertEqual((img["image 3"][0]["Liste"], img["image 3"][0]["Indice"]), ("first_frame", 1))
        self.assertEqual(img["image 1"][0]["SHA256"], projects.file_hash(refs["images"][0]))
        self.assertEqual(img["image 1"][0]["Dossier"], self.f("08.Images"))
        self.assertEqual(cfg["12.Video"][0]["video 1"][0]["trim"], [5, 7])
        self.assertEqual(cfg["14.Video-Audio"], [{"Valide": False, "NbVideo": 0}])
        self.assertEqual(cfg["10.Son"], [{"Valide": False, "NbSon": 0}])
        models = cfg["02.Models"][0]["fichier 1"][0]
        self.assertEqual((models["Indice"], models["nom"]), (1, "m.safetensors"))
        self.assertNotIn("SHA256", models)
        self.assertIn("SHA256", cfg["04.Prompt"][0]["fichier 1"][0])

    def test_workflow_entries_have_structure_and_active_flag(self):
        write(self.f("00.Workflows", "Clip.json"), wf_json([(4, "LoadImage"), (7, "Save")], [[1, 4, 0, 7, 0, "IMAGE"]]))
        write(self.f("00.Workflows", "Other.json"), wf_json([(1, "A")], []))
        cfg = pc.build_config(self.p, {}, workflow="Clip.json")
        wf = cfg["00.Workflows"][0]
        self.assertEqual(wf["NbFichier"], 2)
        clip = wf["fichier 1"][0]
        self.assertTrue(clip["Actif"])
        self.assertEqual(clip["Nodes"], ["#4 LoadImage", "#7 Save"])
        self.assertEqual(clip["Links"], ["#4:0 -> #7:0"])
        self.assertNotIn("Actif", wf["fichier 2"][0])

    def test_file_without_index_stops_the_save(self):
        refs, trims = self.refs()
        pc.save_config(self.p, refs, trims)
        before = read(os.path.join(self.p, "99.Project-Config", "Project-Config.json"))
        with self.assertRaises(pc.ConfigError) as ctx:
            pc.save_config(self.p, {"images": refs["images"]}, trims)
        self.assertEqual(len(ctx.exception.errors), 1)
        self.assertIn("12.Video/shot.mp4", ctx.exception.errors[0])
        # Rien n'est ecrit ni archive.
        self.assertEqual(read(os.path.join(self.p, "99.Project-Config", "Project-Config.json")), before)
        self.assertEqual(os.listdir(os.path.join(self.p, "99.Project-Config", "Archives")), [])

    def test_unused_file_in_media_folder_is_an_error(self):
        write(self.f("10.Son", "lost.wav"), b"L")
        with self.assertRaises(pc.ConfigError) as ctx:
            pc.build_config(self.p, {})
        self.assertEqual(len(ctx.exception.errors), 1)
        self.assertIn("10.Son/lost.wav", ctx.exception.errors[0])

    # ---- sauvegarde et archives ----
    def test_save_archives_previous_never_overwrites(self):
        refs, trims = self.refs()
        first = pc.save_config(self.p, refs, trims)
        self.assertIsNone(first["archived"])
        path = first["path"]
        created = json.loads(read(path))["datecreat"]
        os.utime(path, (1792218600, 1792218600))
        second = pc.save_config(self.p, refs, trims)
        self.assertRegex(second["archived"], r"^\d{8}-\d{6}_Project-Config\.json$")
        os.utime(path, (1792218600, 1792218600))
        third = pc.save_config(self.p, refs, trims)
        self.assertEqual(third["archived"], second["archived"].replace(".json", " (2).json"))
        arch = os.listdir(os.path.join(self.p, "99.Project-Config", "Archives"))
        self.assertEqual(len(arch), 2)
        self.assertEqual(json.loads(read(path))["datecreat"], created)

    # ---- verification ----
    def test_check_ok_changed_missing_and_archive_match(self):
        refs, trims = self.refs()
        write(self.f("04.Prompt", "p.txt"), b"P")
        pc.save_config(self.p, refs, trims)
        projects.archive_files(self.p, "08.Images", ["a.png"])   # a.png -> Archives (meme contenu)
        write(self.f("08.Images", "b.png"), b"B2")                 # b.png modifie, sans archive
        os.remove(self.f("12.Video", "shot.mp4"))                  # manquant
        write(self.f("04.Prompt", "p.txt"), b"P2")                 # prompt modifie
        rep = pc.check_config(self.p)
        by = {f["folder"]: f for f in rep["folders"]}
        imgs = {(x["nom"], x["Liste"]): x for x in by["08.Images"]["files"]}
        self.assertEqual(imgs[("b.png", "images")]["status"], "changed")
        self.assertIsNone(imgs[("b.png", "images")]["archive"])
        self.assertEqual(imgs[("a.png", "images")]["status"], "missing")
        self.assertEqual(imgs[("a.png", "images")]["archive"], "a.png")
        vid = by["12.Video"]["files"][0]
        self.assertEqual((vid["status"], vid["archive"], vid["trim"]), ("missing", None, [5, 7]))
        prompt = by["04.Prompt"]
        self.assertEqual((prompt["kind"], prompt["files"][0]["status"], prompt["files"][0]["archive"]),
                         ("prompt", "changed", None))
        self.assertEqual(by["02.Models"]["kind"], "info")
        self.assertIsNone(rep["workflow"])

    def test_check_workflow_structure(self):
        cur = {"nodes": [{"id": 4, "type": "LoadImage"}, {"id": 7, "type": "Save"}], "links": [[1, 4, 0, 7, 0, "IMAGE"]]}
        write(self.f("00.Workflows", "Clip.json"), json.dumps(cur).encode())
        pc.save_config(self.p, {}, workflow="Clip.json")
        rep = pc.check_config(self.p, cur)
        self.assertEqual((rep["workflow"]["name"], rep["workflow"]["source"]), ("Clip.json", "file"))
        self.assertTrue(rep["workflow"]["same"])
        self.assertIsNone(rep["workflow"]["changes"])
        # Valeurs differentes, meme structure : toujours identique.
        cur2 = json.loads(json.dumps(cur))
        cur2["nodes"][0]["widgets_values"] = ["x.png"]
        self.assertTrue(pc.check_config(self.p, cur2)["workflow"]["same"])
        # Un noeud et une liaison en plus dans l'onglet courant.
        cur3 = {"nodes": cur["nodes"] + [{"id": 9, "type": "Note"}], "links": cur["links"] + [[2, 4, 0, 9, 0, "*"]]}
        d = pc.check_config(self.p, cur3)["workflow"]
        self.assertFalse(d["same"])
        self.assertEqual(d["diff"]["nodes_missing"], ["#9 Note"])
        self.assertEqual(d["diff"]["links_missing"], ["#4:0 -> #9:0"])
        # Fichier modifie apres la sauvegarde, version sauvegardee dans Archives.
        os.makedirs(self.f("00.Workflows", "Archives"), exist_ok=True)
        shutil.copy(self.f("00.Workflows", "Clip.json"), self.f("00.Workflows", "Archives/20261017-100000_Clip.json"))
        write(self.f("00.Workflows", "Clip.json"), json.dumps({"nodes": [{"id": 4, "type": "LoadImage"}], "links": []}).encode())
        w = pc.check_config(self.p, cur)["workflow"]
        self.assertEqual((w["status"], w["source"], w["archive"]), ("changed", "archive", "20261017-100000_Clip.json"))
        self.assertTrue(w["same"])
        self.assertTrue(w["changes"]["same"])

    def test_archive_with_same_name_preferred(self):
        refs, trims = self.refs()
        pc.save_config(self.p, refs, trims)
        write(self.f("08.Images", "Archives/aaa.png"), b"B")
        projects.archive_files(self.p, "08.Images", ["b.png"])
        by = {x["nom"]: x for x in pc.check_config(self.p)["folders"][4]["files"]}
        self.assertEqual(by["b.png"]["archive"], "b.png")

    def test_check_without_config(self):
        with self.assertRaises(FileNotFoundError):
            pc.check_config(self.p)

    # ---- remise en place ----
    def test_restore_moves_archive_back_and_archives_current(self):
        refs, trims = self.refs()
        pc.save_config(self.p, refs, trims)
        projects.archive_files(self.p, "08.Images", ["b.png"])
        write(self.f("08.Images", "b.png"), b"B2")
        done = pc.restore_files(self.p, [{"folder": "08.Images", "archive": "b.png", "nom": "b.png"},
                                         {"folder": "08.Images", "archive": "b.png", "nom": "b.png"}])
        self.assertEqual(done, [self.f("08.Images", "b.png")])
        self.assertEqual(read(self.f("08.Images", "b.png")), b"B")
        self.assertEqual(read(self.f("08.Images", "Archives/b (2).png")), b"B2")
        with self.assertRaises(ValueError):
            pc.restore_files(self.p, [{"folder": "99.Project-Config", "archive": "x", "nom": "x"}])
        with self.assertRaises(ValueError):
            pc.restore_files(self.p, [{"folder": "08.Images", "archive": "../x", "nom": "x"}])

    def test_restore_workflow_stamps_current_one(self):
        write(self.f("00.Workflows", "Clip.json"), b"new")
        write(self.f("00.Workflows", "Archives/20261017-100000_Clip.json"), b"old")
        pc.restore_files(self.p, [{"folder": "00.Workflows", "archive": "20261017-100000_Clip.json", "nom": "Clip.json"}])
        self.assertEqual(read(self.f("00.Workflows", "Clip.json")), b"old")
        arch = os.listdir(self.f("00.Workflows", "Archives"))
        self.assertEqual(len(arch), 1)
        self.assertRegex(arch[0], r"^\d{8}-\d{6}_Clip\.json$")


class StructureTest(unittest.TestCase):
    def test_list_and_dict_links(self):
        a = pc.workflow_structure({"nodes": [{"id": 10, "type": "B"}, {"id": 2, "type": "A"}],
                                   "links": [[5, 2, 1, 10, 0, "X"]]})
        b = pc.workflow_structure({"nodes": [{"id": 2, "type": "A"}, {"id": 10, "type": "B"}],
                                   "links": [{"id": 9, "origin_id": 2, "origin_slot": 1, "target_id": 10, "target_slot": 0}]})
        self.assertEqual(a, b)
        self.assertEqual(a["Nodes"], ["#2 A", "#10 B"])
        self.assertIsNone(pc.workflow_structure({"format": "x"}))

    def test_links_use_slot_names(self):
        # Les numeros des sorties du Ref Loader changent avec sa selection : seuls les noms comptent.
        def wf(slot, outputs):
            return {"nodes": [{"id": 1, "type": "Ref", "outputs": [{"name": n} for n in outputs]},
                              {"id": 2, "type": "Proj", "inputs": [{"name": "project"}]}],
                    "links": [[3, 1, slot, 2, 0, "MM_PROJECT"]]}
        a = pc.workflow_structure(wf(9, ["i1", "i2", "i3", "i4", "v1", "va1", "a1", "a2", "a3", "project"]))
        b = pc.workflow_structure(wf(6, ["i1", "v1", "va1", "a1", "a2", "a3", "project"]))
        self.assertEqual(a["Links"], ["#1:project -> #2:project"])
        self.assertEqual(a, b)

    def test_diff(self):
        d = pc.diff_structure({"Nodes": ["#1 A"], "Links": []}, {"Nodes": ["#1 A", "#2 B"], "Links": ["#1:0 -> #2:0"]})
        self.assertEqual(d["nodes_added"], ["#2 B"])
        self.assertEqual(d["links_added"], ["#1:0 -> #2:0"])
        self.assertFalse(d["same"])


if __name__ == "__main__":
    unittest.main()
