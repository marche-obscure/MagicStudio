"""
Tests du module final_cut (sans ComfyUI) : lancer depuis la racine de
l'extension avec le Python embarque :

    ..\\..\\..\\python_embeded\\python.exe -m unittest discover -s tests -v
"""

import os
import shutil
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import final_cut as fc  # noqa: E402
import projects  # noqa: E402


def write(path, data=b"x"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def files_in(folder):
    return sorted(os.listdir(folder)) if os.path.isdir(folder) else []


class FinalCutTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.input = os.path.join(self.root, "input")
        self.trashed = []

    def tearDown(self):
        link = os.path.join(self.input)
        if os.path.isdir(link):
            for n in os.listdir(link):
                p = os.path.join(link, n)
                if fc._is_link(p):
                    fc.remove_link(p)
        shutil.rmtree(self.root, ignore_errors=True)

    def trash(self, paths):
        for p in paths:
            self.trashed.append(os.path.basename(p))
            os.remove(p)

    def test_new_project_has_70_rush_audio(self):
        p = projects.create_project(self.root, "Solo")
        self.assertEqual(sorted(os.listdir(os.path.join(p, "70.Rush Audio"))),
                         ["Footage", "No Good", "Picture Lock", "Rough Cut"])

    def test_simple_project_mirror(self):
        p = projects.create_project(self.root, "Solo")
        self.assertEqual(fc.project_number(p), "00")
        write(os.path.join(p, "40.Rush Videos", "Picture Lock", "v.mp4"), b"video")
        write(os.path.join(p, "60.Rush Images", "Picture Lock", "i.png"), b"img")
        write(os.path.join(p, "60.Rush Images", "Footage", "not_final.png"), b"no")
        plan = fc.plan(p)
        self.assertEqual(plan["folder"], os.path.join(p, "Final-Cut_Solo"))
        self.assertEqual(plan["kinds"]["Video"]["add"], ["_00_v.mp4"])
        self.assertEqual(plan["kinds"]["Images"]["add"], ["_00_i.png"])
        self.assertEqual(plan["count"], 2)
        self.assertFalse(os.path.exists(plan["folder"]))          # plan : rien n'est cree
        old = time.time() - 3600
        os.utime(os.path.join(p, "40.Rush Videos", "Picture Lock", "v.mp4"), (old, old))
        res = fc.sync(p, self.trash, self.input)
        dest = os.path.join(p, "Final-Cut_Solo")
        self.assertEqual(files_in(os.path.join(dest, "Video")), ["_00_v.mp4"])
        self.assertEqual(files_in(os.path.join(dest, "Images")), ["_00_i.png"])
        self.assertEqual(files_in(os.path.join(dest, "Audio")), [])
        # Copie datee du jour (en tete dans H3 Director).
        self.assertGreater(os.path.getmtime(os.path.join(dest, "Video", "_00_v.mp4")), old + 1800)
        # Jonction : les copies sont vues depuis input.
        self.assertEqual(res["link"], os.path.join(self.input, "Final-Cut_Solo"))
        self.assertEqual(files_in(os.path.join(res["link"], "Video")), ["_00_v.mp4"])
        self.assertEqual(fc.plan(p)["count"], 0)
        # Remplace, retire, ajoute ; une copie deposee a la main est retiree.
        write(os.path.join(p, "40.Rush Videos", "Picture Lock", "v.mp4"), b"video v2")
        os.remove(os.path.join(p, "60.Rush Images", "Picture Lock", "i.png"))
        write(os.path.join(p, "70.Rush Audio", "Picture Lock", "a.wav"), b"wav")
        write(os.path.join(dest, "Images", "by_hand.png"), b"h")
        plan = fc.plan(p)
        self.assertEqual((plan["kinds"]["Video"]["replace"], plan["kinds"]["Images"]["remove"],
                          plan["kinds"]["Audio"]["add"]), (["_00_v.mp4"], ["_00_i.png", "by_hand.png"], ["_00_a.wav"]))
        fc.sync(p, self.trash, self.input)
        self.assertEqual(sorted(self.trashed), ["_00_i.png", "_00_v.mp4", "by_hand.png"])
        with open(os.path.join(dest, "Video", "_00_v.mp4"), "rb") as f:
            self.assertEqual(f.read(), b"video v2")
        self.assertEqual(files_in(os.path.join(dest, "Audio")), ["_00_a.wav"])
        # Les originaux ne sont jamais touches.
        self.assertTrue(os.path.isfile(os.path.join(p, "40.Rush Videos", "Picture Lock", "v.mp4")))

    def test_multiproject_numbers_and_mirror(self):
        a = projects.create_project(self.root, "Speech", group="Yacht", new_group=True)
        time.sleep(0.05)
        b = projects.create_project(self.root, "Walk", group="Yacht")
        group = os.path.join(self.root, "Yacht")
        self.assertEqual(fc.group_numbers(group), {"00": "Yacht", "01": "Speech", "02": "Walk"})
        self.assertEqual((fc.project_number(a), fc.project_number(b)), ("01", "02"))
        self.assertTrue(projects.is_group(group))                   # la marque reste une marque
        write(os.path.join(a, "40.Rush Videos", "Picture Lock", "shot.mp4"), b"a")
        write(os.path.join(b, "40.Rush Videos", "Picture Lock", "shot.mp4"), b"b")
        fc.sync(b, self.trash, self.input)
        dest = os.path.join(group, "Final-Cut_Yacht")
        self.assertEqual(files_in(os.path.join(dest, "Video")), ["_01_shot.mp4", "_02_shot.mp4"])
        # Le dossier des copies n'est pas pris pour un sous-projet.
        self.assertEqual(projects.project_children(group), ["Speech", "Walk"])
        # Renommage : le numero suit ; un numero n'est jamais reattribue.
        new = projects.rename_project(a, "Speech-01")
        self.assertEqual(fc.project_number(new), "01")
        shutil.rmtree(b)
        c = projects.create_project(self.root, "Fly", group="Yacht")
        self.assertEqual(fc.project_number(c), "03")
        fc.sync(new, self.trash, self.input)
        self.assertEqual(files_in(os.path.join(dest, "Video")), ["_01_shot.mp4"])
        self.assertEqual(self.trashed, ["_02_shot.mp4"])

    def test_link_never_replaces_a_real_folder(self):
        p = projects.create_project(self.root, "Solo")
        os.makedirs(os.path.join(self.input, "Final-Cut_Solo"))
        with self.assertRaises(ValueError):
            fc.sync(p, self.trash, self.input)
        with self.assertRaises(ValueError):
            fc.remove_link(os.path.join(self.input, "Final-Cut_Solo"))

    def test_last_sync_progress_and_groups(self):
        p1 = projects.create_project(self.root, "Part1", group="Film", new_group=True)
        write(os.path.join(p1, "60.Rush Images", "Picture Lock", "a.png"), b"image")
        folder = fc.target(p1)[0]
        before = fc.plan(p1)
        self.assertIsNone(before["last_sync"])
        self.assertEqual(before["projects"], {"01": "Part1"})
        self.assertIsNone(fc.progress(p1))
        seen = []

        def trash(paths):
            seen.append(fc.progress(p1))
            self.trash(paths)

        t0 = time.time()
        res = fc.sync(p1, trash, self.input)
        self.assertTrue(res["first"])
        self.assertGreaterEqual(res["last_sync"], t0 - 1)
        self.assertIsNone(fc.progress(p1))  # fini : plus de progression
        after = fc.plan(p1)
        self.assertAlmostEqual(after["last_sync"], res["last_sync"], places=3)
        self.assertEqual(after["kinds"]["Images"]["copies"][0]["size"], 5)
        # Le fichier de date est a la racine des copies (nom a point), hors Images / Video / Audio.
        self.assertTrue(os.path.isfile(os.path.join(folder, fc.STAMP)))
        self.assertEqual(after["count"], 0)
        # Retrait : la progression est lisible pendant le travail (ici dans la Corbeille).
        os.remove(os.path.join(p1, "60.Rush Images", "Picture Lock", "a.png"))
        res = fc.sync(p1, trash, self.input)
        self.assertFalse(res["first"])
        self.assertEqual(seen[-1]["total"], 1)
        self.assertEqual(seen[-1]["done"], 0)

    def test_link_status_checks_the_target(self):
        # Relecture du 24/10/2026 : un Final-Cut_<Nom> d'un autre projet du meme nom n'est pas "lie".
        for sub in ("A", "B"):
            os.makedirs(os.path.join(self.root, sub))
        p = projects.create_project(os.path.join(self.root, "A"), "Same")
        other = projects.create_project(os.path.join(self.root, "B"), "Same")
        folder = fc.target(p)[0]
        self.assertEqual(fc.link_status(folder, self.input)["linked"], False)
        fc.sync(other, self.trash, self.input)  # jonction vers l'autre projet "Same"
        status = fc.link_status(folder, self.input)
        self.assertEqual((status["linked"], status["conflict"]), (False, False))
        fc.sync(p, self.trash, self.input)  # le lien est remplace par celui du bon projet
        status = fc.link_status(folder, self.input)
        self.assertEqual((status["linked"], status["conflict"]), (True, False))
        self.assertEqual(status["link"], os.path.join(self.input, "Final-Cut_Same"))
        # Vrai dossier du meme nom : jamais lie, signale (pas de synchronisation automatique en boucle).
        fc.remove_link(status["link"])
        os.makedirs(status["link"])
        status = fc.link_status(folder, self.input)
        self.assertEqual((status["linked"], status["conflict"]), (False, True))

    def test_plan_does_not_rehash_unchanged_files(self):
        # Points mineurs du 24/10/2026 : le plan est relu a chaque Run ; sans changement
        # (taille et date de la source et de la copie), aucune empreinte SHA256 n'est recalculee.
        p = projects.create_project(self.root, "Solo")
        src = os.path.join(p, "40.Rush Videos", "Picture Lock", "v.mp4")
        write(src, b"video-1")
        fc.sync(p, self.trash, self.input)
        calls = []
        old_sha = fc.file_sha256

        def counting_sha(path):
            calls.append(path)
            return old_sha(path)

        fc.file_sha256 = counting_sha
        try:
            self.assertEqual(fc.plan(p)["count"], 0)
            self.assertEqual(calls, [])
            # Meme taille, autre contenu, date changee : remplacement detecte (empreintes recalculees).
            write(src, b"video-2")
            os.utime(src, (time.time() + 5, time.time() + 5))
            self.assertEqual(fc.plan(p)["kinds"]["Video"]["replace"], ["_00_v.mp4"])
            self.assertTrue(calls)
            # Meme contenu, seule la date change : pas de remplacement.
            fc.sync(p, self.trash, self.input)
            os.utime(src, (time.time() + 60, time.time() + 60))
            self.assertEqual(fc.plan(p)["count"], 0)
        finally:
            fc.file_sha256 = old_sha

    def test_sync_refused_while_another_runs(self):
        # Deux noeuds Final Cut (ou deux onglets) sur le meme projet : une seule synchronisation a la fois.
        p = projects.create_project(self.root, "Solo")
        write(os.path.join(p, "60.Rush Images", "Picture Lock", "a.png"))
        inner = []
        old_copy = fc._copy_new

        def copy_new(src, dst):
            # Pendant la copie, une deuxieme synchronisation du meme projet est refusee.
            with self.assertRaises(fc.SyncRunning):
                fc.sync(p, self.trash, self.input)
            inner.append(True)
            old_copy(src, dst)

        fc._copy_new = copy_new
        try:
            fc.sync(p, self.trash, self.input)
        finally:
            fc._copy_new = old_copy
        self.assertEqual(inner, [True])
        # Fini : une nouvelle synchronisation est de nouveau possible.
        self.assertEqual(fc.sync(p, self.trash, self.input)["count"], 0)

    # --- images extraites (Picture Lock/Extract Frame) ---------------------------------

    def _extract(self, project, *names):
        for n in names:
            write(os.path.join(project, *projects.EXTRACT_DIR, n), b"png")

    def test_frames_by_project(self):
        projects.create_project(self.root, "A", group="Multi", new_group=True)
        time.sleep(0.05)
        b = projects.create_project(self.root, "B", group="Multi")
        self._extract(b, "FRAME_0048_x.png", "LAST_FRAME_x.png", "FRAME_0010_x.png", "FIRST_FRAME_x.png")
        frames = fc.plan(b)["frames"]
        num_b = fc.project_number(b)
        self.assertEqual(num_b, "02")
        self.assertEqual(list(frames), [num_b])
        self.assertEqual([f["name"] for f in frames[num_b]],
                         ["FIRST_FRAME_x.png", "LAST_FRAME_x.png", "FRAME_0010_x.png", "FRAME_0048_x.png"])
        f0 = frames[num_b][0]
        self.assertEqual(f0["path"], os.path.join(b, *projects.EXTRACT_DIR, "FIRST_FRAME_x.png"))
        self.assertIsNone(f0["frame"])
        self.assertIsInstance(f0["mtime"], float)

    def test_frames_absent_without_extractions(self):
        p = projects.create_project(self.root, "Solo")
        self.assertEqual(fc.plan(p)["frames"], {})

    def test_frames_skip_missing_project(self):
        p = projects.create_project(self.root, "Solo")
        shutil.rmtree(os.path.join(p, *projects.EXTRACT_DIR))
        self.assertEqual(fc.plan(p)["frames"], {})

    def test_frames_simple_project(self):
        p = projects.create_project(self.root, "Solo")
        self._extract(p, "FRAME_0003_x.png")
        num = fc.target(p)[2][0][0]
        self.assertEqual(num, "00")
        self.assertEqual([f["name"] for f in fc.plan(p)["frames"][num]], ["FRAME_0003_x.png"])


if __name__ == "__main__":
    unittest.main()
