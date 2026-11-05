"""Tests du module media_browser (fenetre Folder de MedLoad, sans ComfyUI), dossiers temporaires seulement."""

import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import media_browser as mb  # noqa: E402


def write(path, data=b"x"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


class MediaBrowserTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.inp = os.path.join(self.tmp, "input")
        self.out = os.path.join(self.tmp, "output")
        self.other = os.path.join(self.tmp, "ailleurs")
        for d in (self.inp, self.out, self.other):
            os.makedirs(d)
        write(os.path.join(self.inp, "a.png"))
        write(os.path.join(self.inp, "b.mp4"), b"xyz")
        write(os.path.join(self.inp, "c.wav"))
        write(os.path.join(self.inp, "notes.txt"))
        write(os.path.join(self.inp, "sub", "Été photo.jpg"))
        write(os.path.join(self.inp, "sub", "deep", "d.png"))
        write(os.path.join(self.inp, ".hidden", "h.png"))
        write(os.path.join(self.out, "o.mp4"))
        write(os.path.join(self.other, "secret.png"))
        self.r = mb.roots(self.inp, self.out)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_roots(self):
        self.assertEqual([(r["id"], r["label"]) for r in self.r], [("input", "Input"), ("output", "Output")])
        self.assertEqual([r["id"] for r in mb.roots(self.inp, os.path.join(self.tmp, "absent"))], ["input"])
        self.assertEqual(mb.roots(self.inp, os.path.join(self.inp, "sub")), mb.roots(self.inp, ""))

    def test_outside_roots(self):
        self.assertIsNone(mb.allowed(self.other, self.r))
        self.assertIsNone(mb.allowed(os.path.join(self.inp, "..", "ailleurs"), self.r))
        self.assertIsNone(mb.allowed("", self.r))
        self.assertIsNotNone(mb.allowed(os.path.join(self.inp, "sub"), self.r))
        for fn in (mb.tree, mb.files):
            with self.assertRaises(PermissionError):
                fn(self.other, self.r)
            with self.assertRaises(PermissionError):
                fn(os.path.join(self.inp, ".."), self.r)
        with self.assertRaises(PermissionError):
            mb.search(self.other, self.r, "secret")

    def test_junction_out_is_refused(self):
        link = os.path.join(self.inp, "lien")
        res = subprocess.run(["cmd", "/c", "mklink", "/J", link, self.other], capture_output=True)
        if res.returncode != 0:
            self.skipTest("jonction impossible")
        self.assertIsNone(mb.allowed(link, self.r))
        with self.assertRaises(PermissionError):
            mb.files(link, self.r)
        self.assertNotIn("lien", [d["name"] for d in mb.tree(self.inp, self.r)])
        self.assertEqual([f["name"] for f in mb.search(self.inp, self.r, "secret")["files"]], [])
        os.rmdir(link)

    def test_tree_hides_hidden_and_counts_media(self):
        t = {d["name"]: d for d in mb.tree(self.inp, self.r)}
        self.assertEqual(list(t), ["sub"])
        self.assertEqual(t["sub"]["count"], 1)
        self.assertTrue(t["sub"]["has_children"])
        self.assertFalse(mb.tree(os.path.join(self.inp, "sub"), self.r)[0]["has_children"])

    def test_files_only_media_and_kind(self):
        names = lambda k: [f["name"] for f in mb.files(self.inp, self.r, k)]
        self.assertEqual(names("all"), ["a.png", "b.mp4", "c.wav"])
        self.assertEqual(names("video"), ["b.mp4"])
        self.assertEqual(names("image"), ["a.png"])
        self.assertEqual(names("audio"), ["c.wav"])
        f = mb.files(self.inp, self.r)[1]
        self.assertEqual((f["kind"], f["size"]), ("video", 3))
        self.assertEqual(f["path"], os.path.join(self.inp, "b.mp4"))
        self.assertIn("mtime", f)

    def test_search_without_accents_all_words(self):
        n = lambda q, **k: [f["name"] for f in mb.search(self.inp, self.r, q, **k)["files"]]
        self.assertEqual(n("ete PHOTO"), ["Été photo.jpg"])
        self.assertEqual(n("png"), ["a.png", "d.png"])
        self.assertEqual(n("png", kind="video"), [])
        self.assertEqual(n("h.png"), [])  # dossier cache exclu
        self.assertEqual(n("notes"), [])  # pas un media
        self.assertEqual(n("  "), [])

    def test_search_limit_and_truncated(self):
        for i in range(5):
            write(os.path.join(self.out, "many", "m%d.png" % i))
        res = mb.search(self.out, self.r, "m", limit=3)
        self.assertEqual((len(res["files"]), res["truncated"]), (3, True))
        res = mb.search(self.out, self.r, "m", limit=50)
        self.assertEqual(res["truncated"], False)


if __name__ == "__main__":
    unittest.main()
