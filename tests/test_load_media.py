"""
Tests du module load_media (sans ComfyUI) : lancer depuis la racine de
l'extension avec le Python embarque :

    ..\\..\\..\\python_embeded\\python.exe -m unittest discover -s tests -v
"""

import os
import shutil
import sys
import tempfile
import unittest
import wave

import re
from urllib.parse import quote

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

import load_media as lm  # noqa: E402


class FileNameTest(unittest.TestCase):
    """Sortie name du noeud MagicStudio MedLoad (28/10/2026) : nom du fichier avec extension."""

    def test_file_name(self):
        self.assertEqual(lm.file_name(r"G:\in\a\LAST_FRAME_P.png"), "LAST_FRAME_P.png")

    def test_file_name_keeps_unicode(self):
        self.assertEqual(lm.file_name(os.path.join("G:\\", "in", "Plan 02 – été.mp4")), "Plan 02 – été.mp4")

    def test_return_names_match_js_outputs(self):
        py = open(os.path.join(ROOT, "nodes.py"), encoding="utf-8").read()
        cls = py[py.index("class MiniMaxH3LoadMedia"):]
        names = re.findall(r'"(\w+)"', re.search(r"RETURN_NAMES = \(([^)]*)\)", cls).group(1))
        js = open(os.path.join(ROOT, "web", "js", "load_media_node.js"), encoding="utf-8").read()
        block = re.search(r"const OUTPUTS = \[(.*?)\];", js, re.S).group(1)
        self.assertEqual(names, re.findall(r'\["(\w+)", "\w+"\]', block))
        self.assertEqual(names[-1], "name")


class PathFromDropTest(unittest.TestCase):
    def test_media_link_of_final_cut(self):
        url = ("http://127.0.0.1:8188/mmrefloader/media?file=G%3A%5CProjets%5C_01_clip%20A.mp4"
               "&filename=_01_clip%20A.mp4")
        self.assertEqual(lm.path_from_drop(url), "G:\\Projets\\_01_clip A.mp4")

    def test_relative_media_link(self):
        self.assertEqual(lm.path_from_drop("/mmrefloader/media?file=C%3A%2Fa%2Fb.png"), "C:/a/b.png")

    def test_uri_list_with_comments(self):
        text = "# dragged from Final Cut\r\n/mmrefloader/media?file=C%3A%5Cx.wav\r\nhttp://other/\r\n"
        self.assertEqual(lm.path_from_drop(text), "C:\\x.wav")

    def test_file_url(self):
        self.assertEqual(lm.path_from_drop("file:///C:/My%20Files/a.jpg"), "C:/My Files/a.jpg")

    def test_plain_path_and_quotes(self):
        self.assertEqual(lm.path_from_drop('  "C:\\a\\b.mp4"  '), "C:\\a\\b.mp4")
        self.assertEqual(lm.path_from_drop("C:\\a\\b.mp4"), "C:\\a\\b.mp4")

    def test_other_links_give_nothing(self):
        self.assertEqual(lm.path_from_drop("https://example.com/video.mp4"), "")
        self.assertEqual(lm.path_from_drop("/view?filename=a.png"), "")
        self.assertEqual(lm.path_from_drop(""), "")
        self.assertEqual(lm.path_from_drop(None), "")


class CheckPathTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.input = os.path.join(self.tmp, "input")
        os.makedirs(os.path.join(self.input, "Projet"))
        self.inside = os.path.join(self.input, "Projet", "a.png")
        Image.new("RGB", (8, 6), (255, 0, 0)).save(self.inside)
        self.outside = os.path.join(self.tmp, "b.png")
        Image.new("RGB", (8, 6)).save(self.outside)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_file_inside_input(self):
        path, kind = lm.check_path(self.inside, self.input)
        self.assertEqual(kind, "image")
        self.assertEqual(os.path.normcase(path), os.path.normcase(os.path.abspath(self.inside)))

    def test_quotes_are_removed(self):
        self.assertEqual(lm.check_path('"' + self.inside + '"', self.input)[1], "image")

    def test_empty(self):
        with self.assertRaisesRegex(ValueError, "No file"):
            lm.check_path("  ", self.input)

    def test_outside_input_refused(self):
        with self.assertRaisesRegex(ValueError, "input folder"):
            lm.check_path(self.outside, self.input)

    def test_dot_dot_escape_refused(self):
        sneaky = os.path.join(self.input, "Projet", "..", "..", "b.png")
        with self.assertRaisesRegex(ValueError, "input folder"):
            lm.check_path(sneaky, self.input)

    def test_missing_file(self):
        with self.assertRaisesRegex(ValueError, "not found"):
            lm.check_path(os.path.join(self.input, "nope.png"), self.input)

    def test_unsupported_type(self):
        other = os.path.join(self.input, "notes.txt")
        open(other, "w").close()
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            lm.check_path(other, self.input)

    def test_file_name_from_checked_path(self):
        # Sortie name : nom du fichier reellement charge (apres check_path), pas le texte brut.
        quoted = '"' + self.inside + '"'
        self.assertEqual(lm.file_name(lm.check_path(quoted, self.input)[0]), "a.png")
        link = "/mmrefloader/media?file=" + quote(self.inside) + "&filename=a.png"
        self.assertEqual(lm.file_name(lm.check_path(lm.path_from_drop(link), self.input)[0]), "a.png")

    def test_signature_follows_the_file(self):
        before = lm.signature(self.inside)
        os.utime(self.inside, (1, 1))
        self.assertNotEqual(before, lm.signature(self.inside))
        self.assertEqual(lm.signature(os.path.join(self.input, "nope.png")), "missing")


class LoadTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_image(self):
        path = os.path.join(self.tmp, "a.png")
        Image.new("RGB", (8, 6), (255, 0, 0)).save(path)
        image, audio = lm.load_still(path, "image")
        self.assertEqual(tuple(image.shape), (1, 6, 8, 3))
        self.assertAlmostEqual(float(image[0, 0, 0, 0]), 1.0)
        self.assertIsNone(audio)

    def test_audio_is_not_cut(self):
        # 20 s : plus long que la limite de 15 s du Reference Loader.
        path = os.path.join(self.tmp, "a.wav")
        sr = 8000
        with wave.open(path, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sr)
            w.writeframes(np.zeros(sr * 20, dtype=np.int16).tobytes())
        image, audio = lm.load_still(path, "audio")
        self.assertIsNone(image)
        self.assertEqual(audio["sample_rate"], sr)
        self.assertEqual(audio["waveform"].shape[0], 1)
        self.assertEqual(audio["waveform"].shape[2], sr * 20)

    def test_soundtrack_of_silent_video_is_none(self):
        import av
        path = os.path.join(self.tmp, "v.mp4")
        with av.open(path, "w") as c:
            s = c.add_stream("mpeg4", rate=24)
            s.width, s.height, s.pix_fmt = 32, 32, "yuv420p"
            for _ in range(3):
                frame = av.VideoFrame.from_ndarray(np.zeros((32, 32, 3), dtype=np.uint8), format="rgb24")
                for p in s.encode(frame):
                    c.mux(p)
            for p in s.encode():
                c.mux(p)
        self.assertIsNone(lm.soundtrack(path))


if __name__ == "__main__":
    unittest.main()
