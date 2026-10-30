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
        self.p = projects.create_project(self.root, "Proj")
        self.f = lambda folder, name="": os.path.join(self.p, folder, name) if name else os.path.join(self.p, folder)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def build(self, refs, trims=None, mode="ref2va", profile="minimax_h3", moments=None, **kw):
        return pc.build_config(self.p, *pc.selections_from_old(refs, trims, mode, profile, moments), **kw)

    def save(self, refs, trims=None, mode="ref2va", profile="minimax_h3", moments=None, **kw):
        return pc.save_config(self.p, *pc.selections_from_old(refs, trims, mode, profile, moments), **kw)

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
        cfg = self.build(refs, trims, now="2026-10-17 10:00:00")
        self.assertEqual(cfg["Project"], "Proj")
        self.assertEqual((cfg["version"], cfg["variant"]), (3, "minimax_h3.ref2va"))
        self.assertEqual(cfg["datecreat"], "2026-10-17 10:00:00")
        self.assertEqual(cfg["ProjectDir"], self.p)
        self.assertEqual([k for k in cfg if k[0].isdigit()], list(projects.SUBFOLDERS))
        self.assertNotIn("99.Project-Config", cfg)
        img = cfg["08.Images"][0]
        # a.png sert deux fois (Images de Ref2VA, First frame de FL2VA) : une seule entree.
        self.assertEqual((img["Valide"], img["NbImage"]), (True, 2))
        self.assertEqual(img["image 1"][0]["nom"], "b.png")
        self.assertEqual(img["image 1"][0]["Utilisations"], [{"variante": "minimax_h3.ref2va", "ligne": "images", "Indice": 1}])
        self.assertEqual(img["image 2"][0]["Utilisations"], [
            {"variante": "minimax_h3.ref2va", "ligne": "images", "Indice": 2},
            {"variante": "minimax_h3.fl2va", "ligne": "first_frame", "Indice": 1}])
        self.assertEqual(img["image 1"][0]["SHA256"], projects.file_hash(refs["images"][0]))
        self.assertEqual(img["image 1"][0]["Dossier"], self.f("08.Images"))
        self.assertEqual(cfg["12.Video"][0]["video 1"][0]["Utilisations"][0]["trim"], [5, 7])
        self.assertEqual(cfg["14.Video-Audio"], [{"Valide": False, "NbVideo": 0}])
        self.assertEqual(cfg["10.Son"], [{"Valide": False, "NbSon": 0}])
        # 02.Models : indice en cours du registre (aucun registre ici), plus la liste des fichiers.
        self.assertEqual(cfg["02.Models"], [{"Valide": False, "IndiceEnCoursMODELS": 0}])
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

    def test_models_and_lora_blocks(self):
        import run_record as rr
        cfg = pc.build_config(self.p, {})
        self.assertEqual(cfg["02.Models"], [{"Valide": False, "IndiceEnCoursMODELS": 0}])
        self.assertEqual(cfg["06.LoRA"], [{"Valide": False, "IndiceEnCoursLoRA": 0}])
        rr.register_config(self.p, "models", {"diffusion_model": ["u"], "text_encoder": [], "vae": []}, "REF2VA")
        rr.register_config(self.p, "models", {"diffusion_model": ["v"], "text_encoder": [], "vae": []}, "REF2VA")
        rr.register_config(self.p, "lora", [{"name": "b", "strength_model": 0.7, "strength_clip": 0.7}], "REF2VA")
        cfg = pc.build_config(self.p, {})
        self.assertEqual(cfg["02.Models"], [{"Valide": True, "IndiceEnCoursMODELS": 2}])
        self.assertEqual(cfg["06.LoRA"], [{"Valide": True, "IndiceEnCoursLoRA": 1}])

    def test_file_without_index_stops_the_save(self):
        refs, trims = self.refs()
        self.save(refs, trims)
        before = read(os.path.join(self.p, "99.Project-Config", "config_projets_Proj.json"))
        with self.assertRaises(pc.ConfigError) as ctx:
            self.save({"images": refs["images"]}, trims)
        self.assertEqual(len(ctx.exception.errors), 1)
        self.assertIn("12.Video/shot.mp4", ctx.exception.errors[0])
        # Rien n'est ecrit ni archive.
        self.assertEqual(read(os.path.join(self.p, "99.Project-Config", "config_projets_Proj.json")), before)
        self.assertEqual(os.listdir(os.path.join(self.p, "99.Project-Config", "Archives")), [])

    def test_unused_file_in_media_folder_is_an_error(self):
        write(self.f("10.Son", "lost.wav"), b"L")
        with self.assertRaises(pc.ConfigError) as ctx:
            pc.build_config(self.p, {})
        self.assertEqual(len(ctx.exception.errors), 1)
        self.assertIn("10.Son/lost.wav", ctx.exception.errors[0])

    # ---- profil LTX 2.x (Task 7) ----
    def ltx_refs(self):
        g1 = write(self.f("08.Images", "g1.png"), b"G1")
        g2 = write(self.f("08.Images", "g2.png"), b"G2")
        gv = write(self.f("12.Video", "gv.mp4"), b"GV")
        st = write(self.f("10.Son", "st.wav"), b"ST")
        vo = write(self.f("10.Son", "vo.wav"), b"VO")
        refs = {"guide_images": [g1, g2], "guide_video": [gv], "soundtrack": [st], "voice": [vo]}
        trims = {"guide_video": {pc.trim_key(gv): [1, 3]}, "voice": {pc.trim_key(vo): [0, 2]}}
        moments = {"guide_images": {pc.trim_key(g1): 0, pc.trim_key(g2): -1}, "guide_video": {pc.trim_key(gv): 1.5}}
        return refs, trims, moments

    def test_build_config_ltx_profile(self):
        refs, trims, moments = self.ltx_refs()
        cfg = self.build(refs, trims, now="2026-10-25 10:00:00", profile="ltx2", moments=moments)
        self.assertEqual(cfg["variant"], "ltx.2_3")
        self.assertNotIn("mode", cfg)
        self.assertNotIn("profile", cfg)
        use = lambda e: e[0]["Utilisations"][0]   # noqa: E731
        img = cfg["08.Images"][0]
        self.assertEqual(img["NbImage"], 2)
        self.assertEqual([(use(img["image %d" % k])["ligne"], use(img["image %d" % k])["Indice"], img["image %d" % k][0]["nom"])
                          for k in (1, 2)], [("guide_images", 1, "g1.png"), ("guide_images", 2, "g2.png")])
        self.assertEqual([use(img["image 1"])["moment"], use(img["image 2"])["moment"]], [0, -1])
        son = cfg["10.Son"][0]
        self.assertEqual(son["NbSon"], 2)
        self.assertEqual([use(son["son 1"])["ligne"], use(son["son 2"])["ligne"]], ["soundtrack", "voice"])
        self.assertEqual(use(son["son 2"])["trim"], [0, 2])
        vid = use(cfg["12.Video"][0]["video 1"])
        self.assertEqual((vid["ligne"], vid["trim"], vid["moment"]), ("guide_video", [1, 3], 1.5))
        self.assertEqual(cfg["14.Video-Audio"], [{"Valide": False, "NbVideo": 0}])
        # Enregistree puis relue
        self.save(refs, trims, profile="ltx2", moments=moments)
        rep = pc.check_config(self.p)
        self.assertEqual(rep["variant"], "ltx.2_3")
        by = {f["folder"]: f for f in rep["folders"]}
        self.assertEqual([(x["Utilisations"][0]["ligne"], x["Utilisations"][0]["moment"]) for x in by["08.Images"]["files"]],
                         [("guide_images", 0), ("guide_images", -1)])

    def test_other_variant_files_are_kept_with_their_uses(self):
        # Fichiers des autres variantes : gardes avec leurs utilisations (jamais archives),
        # ceux de la variante affichee d'abord.
        refs, trims = self.refs()
        lrefs, ltrims, moments = self.ltx_refs()
        both = dict(refs, **lrefs)
        cfg = self.build(both, dict(trims, **ltrims), profile="ltx2", moments=moments)
        self.assertEqual([e[0]["nom"] for k, e in cfg["08.Images"][0].items() if k.startswith("image ")],
                         ["g1.png", "g2.png", "b.png", "a.png"])
        cfg = self.build(both, dict(trims, **ltrims))
        self.assertEqual(cfg["variant"], "minimax_h3.ref2va")
        self.assertEqual(cfg["08.Images"][0]["NbImage"], 4)
        self.assertEqual(cfg["10.Son"][0]["NbSon"], 2)
        self.assertEqual(cfg["08.Images"][0]["image 1"][0]["nom"], "b.png")
        self.assertNotIn("moment", cfg["08.Images"][0]["image 1"][0]["Utilisations"][0])

    def test_unused_file_message_names_the_refloader(self):
        write(self.f("10.Son", "lost.wav"), b"L")
        with self.assertRaises(pc.ConfigError) as ctx:
            pc.build_config(self.p, {})
        self.assertIn("not used by the MagicStudio RefLoader", ctx.exception.errors[0])

    def test_saved_config_reads_back_its_variant(self):
        # Les anciens fichiers (sans profile, ou avec) : VariantConfigTest.test_old_config_converted.
        refs, trims = self.refs()
        self.save(refs, trims, mode="fl2va")
        self.assertEqual(pc.read_config(self.p)["variant"], "minimax_h3.fl2va")
        self.assertEqual(pc.check_config(self.p)["variant"], "minimax_h3.fl2va")

    # ---- sauvegarde et archives ----
    def test_save_archives_previous_never_overwrites(self):
        refs, trims = self.refs()
        first = self.save(refs, trims)
        self.assertIsNone(first["archived"])
        path = first["path"]
        created = json.loads(read(path))["datecreat"]
        os.utime(path, (1792218600, 1792218600))
        second = self.save(refs, trims)
        self.assertRegex(second["archived"], r"^\d{8}-\d{6}_config_projets_Proj\.json$")
        os.utime(path, (1792218600, 1792218600))
        third = self.save(refs, trims)
        self.assertEqual(third["archived"], second["archived"].replace(".json", " (2).json"))
        arch = os.listdir(os.path.join(self.p, "99.Project-Config", "Archives"))
        self.assertEqual(len(arch), 2)
        self.assertEqual(json.loads(read(path))["datecreat"], created)

    # ---- verification ----
    def test_check_ok_changed_missing_and_archive_match(self):
        refs, trims = self.refs()
        write(self.f("04.Prompt", "p.txt"), b"P")
        self.save(refs, trims)
        a_arch = os.path.basename(projects.archive_files(self.p, "08.Images", ["a.png"])[0])  # meme contenu
        write(self.f("08.Images", "b.png"), b"B2")                 # b.png modifie, sans archive
        os.remove(self.f("12.Video", "shot.mp4"))                  # manquant
        write(self.f("04.Prompt", "p.txt"), b"P2")                 # prompt modifie
        rep = pc.check_config(self.p)
        by = {f["folder"]: f for f in rep["folders"]}
        imgs = {x["nom"]: x for x in by["08.Images"]["files"]}
        self.assertEqual(imgs["b.png"]["status"], "changed")
        self.assertIsNone(imgs["b.png"]["archive"])
        self.assertEqual(imgs["a.png"]["status"], "missing")
        self.assertEqual(imgs["a.png"]["archive"], a_arch)
        self.assertTrue(a_arch.endswith("_a.png"))
        vid = by["12.Video"]["files"][0]
        self.assertEqual((vid["status"], vid["archive"], vid["Utilisations"][0]["trim"]), ("missing", None, [5, 7]))
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

    # ---- Lien project_used (30/10/2026) : anciens noms final_cut / project = meme structure ----
    @staticmethod
    def _wf(out_name, fc_in, sv_in, extra_link=False):
        nodes = [
            {"id": 3, "type": "MiniMaxH3Project", "outputs": [{"name": out_name, "links": [1, 2]}]},
            {"id": 5, "type": "MiniMaxH3FinalCut", "inputs": [{"name": fc_in, "link": 1}]},
            {"id": 6, "type": "MagicStudioSaveVoice", "inputs": [{"name": "audio", "link": None}, {"name": sv_in, "link": 2}]},
            {"id": 8, "type": "Other", "inputs": [{"name": "final_cut", "link": 3}, {"name": "project", "link": None}]},
        ]
        links = [[1, 3, 0, 5, 0, "MINIMAX_FINAL_CUT"], [2, 3, 0, 6, 1, "MINIMAX_FINAL_CUT"]]
        if extra_link:
            links.append([3, 3, 0, 8, 0, "MINIMAX_FINAL_CUT"])
        return {"nodes": nodes, "links": links}

    def test_structure_legacy_link_names_normalised(self):
        old = pc.workflow_structure(self._wf("final_cut", "final_cut", "project"))
        new = pc.workflow_structure(self._wf("project_used", "project_used", "project_used"))
        self.assertEqual(old, new)
        self.assertIn("#3:project_used -> #5:project_used", new["Links"])
        self.assertIn("#3:project_used -> #6:project_used", new["Links"])
        # Autre noeud : ses entrees final_cut / project ne sont pas renommees ; vrai changement vu.
        other = pc.workflow_structure(self._wf("project_used", "project_used", "project_used", extra_link=True))
        self.assertIn("#3:project_used -> #8:final_cut", other["Links"])
        self.assertFalse(pc.diff_structure(new, other)["same"])

    def test_check_config_old_saved_workflow_same(self):
        old = self._wf("final_cut", "final_cut", "project")
        write(self.f("00.Workflows", "Clip.json"), json.dumps(old).encode())
        pc.save_config(self.p, {}, workflow="Clip.json")
        cur = self._wf("project_used", "project_used", "project_used")
        w = pc.check_config(self.p, cur)["workflow"]
        self.assertTrue(w["same"])
        changed = self._wf("project_used", "project_used", "project_used", extra_link=True)
        self.assertFalse(pc.check_config(self.p, changed)["workflow"]["same"])

    def test_check_config_old_stored_links_normalised(self):
        """Configuration enregistree avant (Links avec final_cut) : pas de changement fantome."""
        # Liaisons ecrites comme avant la normalisation (anciens noms).
        legacy = ["#3:final_cut -> #5:final_cut", "#3:final_cut -> #6:project"]
        self.assertEqual(pc.normalize_link_strings(["#3 MiniMaxH3Project", "#5 MiniMaxH3FinalCut",
                                                    "#6 MagicStudioSaveVoice"], legacy),
                         ["#3:project_used -> #5:project_used", "#3:project_used -> #6:project_used"])
        self.assertEqual(pc.normalize_link_strings(["#8 Other", "#3 MiniMaxH3Project"], ["#3:x -> #8:final_cut"]),
                         ["#3:x -> #8:final_cut"])

    def test_legacy_table_matches_js(self):
        """LEGACY_LINK_NAMES = LEGACY_PROJECT_LINKS de web/js/graph_links.js (objet JSON dans le JS)."""
        src = read(os.path.join(os.path.dirname(HERE), "web", "js", "graph_links.js")).decode("utf-8")
        mark = "export const LEGACY_PROJECT_LINKS = "
        start = src.index(mark) + len(mark)
        js = json.loads(src[start:src.index(";", start)])
        self.assertEqual(js, pc.LEGACY_LINK_NAMES)

    def test_archive_with_same_name_preferred(self):
        refs, trims = self.refs()
        self.save(refs, trims)
        write(self.f("08.Images", "Archives/aaa.png"), b"B")
        b_arch = os.path.basename(projects.archive_files(self.p, "08.Images", ["b.png"])[0])
        by = {x["nom"]: x for x in pc.check_config(self.p)["folders"][4]["files"]}
        self.assertEqual(by["b.png"]["archive"], b_arch)   # meme nom d'origine, date en prefixe

    def test_check_without_config(self):
        with self.assertRaises(FileNotFoundError):
            pc.check_config(self.p)

    # ---- remise en place ----
    def test_restore_moves_archive_back_and_archives_current(self):
        refs, trims = self.refs()
        self.save(refs, trims)
        b_arch = os.path.basename(projects.archive_files(self.p, "08.Images", ["b.png"], when=0)[0])
        write(self.f("08.Images", "b.png"), b"B2")
        done = pc.restore_files(self.p, [{"folder": "08.Images", "archive": b_arch, "nom": "b.png"},
                                         {"folder": "08.Images", "archive": b_arch, "nom": "b.png"}])
        self.assertEqual(done, [self.f("08.Images", "b.png")])
        self.assertEqual(read(self.f("08.Images", "b.png")), b"B")
        # Le fichier present part dans Archives avec la date de l'archivage en prefixe.
        others = [n for n in os.listdir(self.f("08.Images", "Archives")) if n.endswith("_b.png")]
        self.assertEqual([read(self.f("08.Images", "Archives/" + n)) for n in others], [b"B2"])
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


class VariantConfigTest(unittest.TestCase):
    """Configuration du projet v3 : toutes les variantes (plan des variantes, Task 6)."""

    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.p = projects.create_project(self.root, "Proj")
        self.f = lambda folder, name="": os.path.join(self.p, folder, name) if name else os.path.join(self.p, folder)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def sels(self):
        import profiles
        a = write(self.f("08.Images", "a.png"), b"A")
        v = write(self.f("12.Video", "shot.mp4"), b"V")
        s = write(self.f("10.Son", "s.wav"), b"S")
        st = profiles.migrate_state({"variant": "minimax_h3.ref2va"})
        st["selections"]["minimax_h3.ref2va"]["rows"]["images"] = [a]
        st["selections"]["minimax_h3.ref2va"]["rows"]["videos"] = [v]
        st["selections"]["minimax_h3.ref2va"]["trims"]["videos"] = {pc.trim_key(v): [1, 2]}
        st["selections"]["ltx.2_5"]["rows"]["guide_images"] = [a]
        st["selections"]["ltx.2_5"]["moments"]["guide_images"] = {pc.trim_key(a): -1}
        st["selections"]["ltx.2_5"]["rows"]["soundtrack"] = [s]
        return st["selections"], (a, v, s)

    def test_save_keeps_all_variants(self):
        sels, _ = self.sels()
        pc.save_config(self.p, sels, "ltx.2_5")
        cfg = pc.read_config(self.p)
        self.assertEqual((cfg["version"], cfg["variant"]), (3, "ltx.2_5"))
        img = cfg["08.Images"][0]
        self.assertEqual(img["NbImage"], 1)
        uses = img["image 1"][0]["Utilisations"]
        self.assertEqual(uses, [
            {"variante": "ltx.2_5", "ligne": "guide_images", "Indice": 1, "moment": -1},
            {"variante": "minimax_h3.ref2va", "ligne": "images", "Indice": 1},
        ])
        self.assertEqual(cfg["12.Video"][0]["video 1"][0]["Utilisations"],
                         [{"variante": "minimax_h3.ref2va", "ligne": "videos", "Indice": 1, "trim": [1, 2]}])
        self.assertEqual(cfg["10.Son"][0]["son 1"][0]["Utilisations"][0]["ligne"], "soundtrack")
        rep = pc.check_config(self.p)
        self.assertEqual(rep["variant"], "ltx.2_5")
        by = {f["folder"]: f for f in rep["folders"]}
        self.assertEqual(by["08.Images"]["files"][0]["Utilisations"], uses)

    def test_file_used_by_two_variants(self):
        sels, (a, _, _) = self.sels()
        cfg = pc.build_config(self.p, sels, "minimax_h3.ref2va")
        img = cfg["08.Images"][0]
        self.assertEqual(img["NbImage"], 1)
        self.assertEqual([u["variante"] for u in img["image 1"][0]["Utilisations"]], ["minimax_h3.ref2va", "ltx.2_5"])
        self.assertEqual(img["image 1"][0]["SHA256"], projects.file_hash(a))

    def test_old_config_converted(self):
        # Fichier de main (sans profile) puis de la branche des profils (profile ltx2).
        path = os.path.join(self.p, "99.Project-Config", "config_projets_Proj.json")
        old_main = {"Project": "Proj", "format": pc.FORMAT, "version": 1, "mode": "FL2VA",
                    "08.Images": [{"Valide": True, "NbImage": 1, "image 1": [
                        {"Indice": 1, "Liste": "first_frame", "Dossier": self.f("08.Images"), "nom": "a.png"}]}]}
        write(path, json.dumps(old_main).encode())
        cfg = pc.read_config(self.p)
        self.assertEqual((cfg["version"], cfg["variant"]), (3, "minimax_h3.fl2va"))
        self.assertNotIn("mode", cfg)
        self.assertEqual(cfg["08.Images"][0]["image 1"][0]["Utilisations"],
                         [{"variante": "minimax_h3.fl2va", "ligne": "first_frame", "Indice": 1}])
        old_ltx = {"Project": "Proj", "format": pc.FORMAT, "version": 1, "mode": None, "profile": "ltx2",
                   "12.Video": [{"Valide": True, "NbVideo": 1, "video 1": [
                       {"Indice": 1, "Liste": "guide_video", "nom": "gv.mp4", "trim": [1, 3], "moment": 1.5}]}]}
        write(path, json.dumps(old_ltx).encode())
        cfg = pc.read_config(self.p)
        self.assertEqual(cfg["variant"], "ltx.2_3")
        self.assertEqual(cfg["12.Video"][0]["video 1"][0]["Utilisations"],
                         [{"variante": "ltx.2_3", "ligne": "guide_video", "Indice": 1, "trim": [1, 3], "moment": 1.5}])

    def test_unused_media_file_still_error(self):
        sels, _ = self.sels()
        write(self.f("14.Video-Audio", "lost.mp4"), b"L")
        with self.assertRaises(pc.ConfigError) as ctx:
            pc.build_config(self.p, sels, "ltx.2_5")
        self.assertEqual(len(ctx.exception.errors), 1)
        self.assertIn("14.Video-Audio/lost.mp4: no index", ctx.exception.errors[0])

    def test_shown_variant_file_outside_project_is_an_error(self):
        sels, _ = self.sels()
        sels["ltx.2_5"]["rows"]["voice"] = ["D:/ailleurs/v.wav"]
        sels["ltx.2_3"]["rows"]["voice"] = ["D:/ailleurs/w.wav"]  # autre variante : ignore
        with self.assertRaises(pc.ConfigError) as ctx:
            pc.build_config(self.p, sels, "ltx.2_5")
        self.assertEqual(len(ctx.exception.errors), 1)
        self.assertIn("v.wav", ctx.exception.errors[0])

    def test_old_payload_converted(self):
        a = write(self.f("08.Images", "a.png"), b"A")
        sels, variant = pc.selections_from_old({"first_frame": [a]}, {}, "fl2va", "minimax_h3", {})
        self.assertEqual(variant, "minimax_h3.fl2va")
        self.assertEqual(sels["minimax_h3.fl2va"]["rows"]["first_frame"], [a])


class ResetCopyTest(unittest.TestCase):
    """Boutons Reset et Copy du noeud Projet (choix utilisateur 19/10/2026)."""

    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.p = projects.create_project(self.root, "Proj")
        self.src = projects.create_project(self.root, "Src")

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def files_of(self, project):
        return sorted(os.path.relpath(p, project).replace(os.sep, "/") for _t, p, _s in projects._project_files(project))

    def test_reset_moves_every_file_and_keeps_the_folders(self):
        write(os.path.join(self.p, "08.Images", "a.png"), b"A")
        write(os.path.join(self.p, "08.Images", "Archives", "old.png"), b"O")
        write(os.path.join(self.p, "40.Rush Videos", "Footage", "r.mp4"), b"R" * 10)
        write(os.path.join(self.p, "99.Project-Config", "config_projets_Proj.json"), b"{}")
        plan = projects.reset_project(self.p, dry_run=True)
        self.assertEqual(plan["total"], 4)
        self.assertEqual(plan["size"], 14)
        self.assertEqual({f["folder"]: f["files"] for f in plan["folders"]},
                         {"08.Images": 2, "40.Rush Videos": 1, "99.Project-Config": 1})
        self.assertEqual(len(self.files_of(self.p)), 4)  # rien touche
        sent = []
        old_bin, old_ok = projects._to_recycle_bin, projects.TRASH_AVAILABLE
        projects._to_recycle_bin = lambda paths: [sent.extend(paths)] + [os.remove(x) for x in paths]
        projects.TRASH_AVAILABLE = True
        try:
            out = projects.reset_project(self.p)
        finally:
            projects._to_recycle_bin, projects.TRASH_AVAILABLE = old_bin, old_ok
        self.assertEqual((out["total"], out["trash"], len(sent)), (4, True, 4))
        self.assertEqual(self.files_of(self.p), [])
        for sub in projects.SUBFOLDERS:
            self.assertTrue(os.path.isdir(os.path.join(self.p, sub)))
        self.assertTrue(os.path.isdir(os.path.join(self.p, "40.Rush Videos", "Footage")))

    def test_reset_refuses_a_folder_that_is_not_a_project(self):
        # Revue securite du 24/10/2026 : un dossier ordinaire n'est jamais vide par Reset.
        plain = os.path.join(self.root, "Documents")
        write(os.path.join(plain, "lettre.txt"), b"L")
        sent = []
        old_bin, old_ok = projects._to_recycle_bin, projects.TRASH_AVAILABLE
        projects._to_recycle_bin = lambda paths: sent.extend(paths)
        projects.TRASH_AVAILABLE = True
        try:
            for dry in (True, False):
                with self.assertRaises(ValueError):
                    projects.reset_project(plain, dry_run=dry)
            with self.assertRaises(ValueError):
                projects.reset_project(self.root)  # dossier de projets
        finally:
            projects._to_recycle_bin, projects.TRASH_AVAILABLE = old_bin, old_ok
        self.assertEqual(sent, [])
        self.assertTrue(os.path.isfile(os.path.join(plain, "lettre.txt")))

    def test_reset_without_recycle_bin_deletes(self):
        write(os.path.join(self.p, "10.Son", "s.wav"), b"S")
        old_ok = projects.TRASH_AVAILABLE
        projects.TRASH_AVAILABLE = False
        try:
            self.assertFalse(projects.reset_project(self.p)["trash"])
        finally:
            projects.TRASH_AVAILABLE = old_ok
        self.assertEqual(self.files_of(self.p), [])

    def test_copy_media_from_another_project(self):
        a = write(os.path.join(self.src, "08.Images", "a.png"), b"A")
        b = write(os.path.join(self.src, "08.Images", "b.png"), b"B")
        v = write(os.path.join(self.src, "12.Video", "shot.mp4"), b"V")
        write(os.path.join(self.src, "08.Images", "Archives", "arch.png"), b"OLD")
        write(os.path.join(self.src, "40.Rush Videos", "Footage", "r.mp4"), b"R")  # hors 08-14 : jamais copie
        pc.save_config(self.src, *pc.selections_from_old({"images": [b, a], "first_frame": [a], "videos": [v]},
                                                         {"video": {pc.trim_key(v): [5, 7]}}))
        write(os.path.join(self.p, "08.Images", "x.png"), b"A")   # meme SHA256 que a.png : pas recopie
        write(os.path.join(self.p, "08.Images", "b.png"), b"Z")   # meme nom, autre contenu : b_02.png
        before = self.files_of(self.p)
        plan = pc.copy_media(self.p, self.src, dry_run=True)
        self.assertEqual(self.files_of(self.p), before)
        self.assertEqual((plan["copied"], plan["skipped"]), (3, 1))
        out = pc.copy_media(self.p, self.src)
        self.assertEqual((out["copied"], out["skipped"]), (3, 1))
        rows = {f["folder"]: f for f in out["folders"]}
        self.assertEqual((rows["08.Images"]["files"], rows["08.Images"]["archives"]), (2, 1))
        self.assertEqual(self.files_of(self.p), [
            "08.Images/Archives/arch.png", "08.Images/b.png", "08.Images/b_02.png", "08.Images/x.png",
            "12.Video/shot.mp4"])
        self.assertEqual(read(os.path.join(self.p, "08.Images", "b_02.png")), b"B")
        # Listes de la configuration de l'autre projet, ramenees aux fichiers du projet ouvert.
        rep = {f["folder"]: f["files"] for f in out["report"]["folders"]}
        self.assertEqual([(u["ligne"], u["Indice"], x["nom"]) for x in rep["08.Images"] for u in x["Utilisations"]],
                         [("images", 1, "b_02.png"), ("images", 2, "x.png"), ("first_frame", 1, "x.png")])
        self.assertEqual([(x["nom"], x["Utilisations"][0]["trim"]) for x in rep["12.Video"]], [("shot.mp4", [5, 7])])
        self.assertEqual(out["report"]["variant"], "minimax_h3.ref2va")
        # L'autre projet n'a pas change ; un second Copy ne recopie rien.
        self.assertEqual(pc.copy_media(self.p, self.src)["copied"], 0)
        with self.assertRaises(ValueError):
            pc.copy_media(self.p, self.p)

    def test_copy_media_without_configuration(self):
        write(os.path.join(self.src, "10.Son", "s.wav"), b"S")
        out = pc.copy_media(self.p, self.src)
        self.assertEqual(out["copied"], 1)
        self.assertIsNone(out["report"])

    def test_copy_media_from_a_folder_of_projects(self):
        group = os.path.join(self.root, "Group")
        os.makedirs(group)
        one, two = (projects.create_project(group, n) for n in ("One", "Two"))
        os.makedirs(os.path.join(group, "Prompt"))                     # sans 08-14 : pas un projet
        a = write(os.path.join(one, "08.Images", "a.png"), b"A")
        write(os.path.join(two, "08.Images", "a.png"), b"OTHER")       # meme nom, autre contenu : a_02.png
        write(os.path.join(two, "08.Images", "dup.png"), b"A")          # meme SHA256 que One/a.png : une copie
        write(os.path.join(two, "10.Son", "Archives", "s.wav"), b"S")
        pc.save_config(one, *pc.selections_from_old({"images": [a]}, {}))
        self.assertEqual(pc.sub_projects(group), ["One", "Two"])
        self.assertEqual(pc.sub_projects(group, exclude=two), ["One"])
        plan = pc.copy_media(self.p, group, dry_run=True)
        self.assertEqual((plan["subs"], plan["copied"]), (["One", "Two"], 0))
        # Un sous-projet : comme un projet, sa configuration remplit le Ref Loader.
        single = pc.copy_media(self.p, group, dry_run=True, sub="One")
        self.assertEqual(single["copied"], 1)
        self.assertEqual([x["nom"] for x in single["report"]["folders"][0]["files"]], ["a.png"])
        with self.assertRaises(FileNotFoundError):
            pc.copy_media(self.p, group, sub="Prompt")
        # All : tous les sous-projets en une passe, sans configuration.
        plan = pc.copy_media(self.p, group, dry_run=True, sub=pc.ALL_SUBS)
        self.assertEqual(self.files_of(self.p), [])
        out = pc.copy_media(self.p, group, sub=pc.ALL_SUBS)
        self.assertEqual((plan["copied"], plan["skipped"]), (out["copied"], out["skipped"]))
        self.assertEqual((out["copied"], out["skipped"]), (3, 1))
        self.assertIsNone(out["report"])
        self.assertEqual(self.files_of(self.p), ["08.Images/a.png", "08.Images/a_02.png", "10.Son/Archives/s.wav"])
        self.assertEqual(read(os.path.join(self.p, "08.Images", "a_02.png")), b"OTHER")
        # Le projet ouvert range dans le meme dossier n'est jamais une source.
        self.assertEqual(pc.copy_media(one, group, dry_run=True, sub=pc.ALL_SUBS)["subs"], ["Two"])
        # Un projet garde l'ancien fonctionnement (pas de sous-projets).
        self.assertEqual(pc.copy_media(self.p, one, dry_run=True)["subs"], [])


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
