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

    def test_post_processing_input_is_optional_boolean(self):
        py = open(os.path.join(ROOT, "nodes.py"), encoding="utf-8").read()
        cls = py[py.index("class MiniMaxH3LoadMedia"):]
        cls = cls[:cls.index("RETURN_TYPES")]
        self.assertIn('"optional"', cls)
        opt = cls[cls.index('"optional"'):]
        self.assertRegex(opt, r'"post_processing": \("BOOLEAN", \{\s*"default": False')
        self.assertLess(cls.index('"required"'), cls.index('"optional"'))
        self.assertIn("Grey: the saved file is a new run", opt)
        # project_used (05/11/2026) : apres post_processing, type du noeud Project.
        self.assertIn('"project_used": (FINAL_CUT_TYPE,)', opt)
        self.assertLess(opt.index('"post_processing"'), opt.index('"project_used"'))

    def test_validate_and_run_accept_new_inputs_and_output_dir(self):
        with open(os.path.join(ROOT, "nodes.py"), encoding="utf-8") as f:
            py = f.read()
        cls = py[py.index("class MiniMaxH3LoadMedia"):]
        cls = cls[:cls.index("def selectmod_roots")]
        self.assertIn("def VALIDATE_INPUTS(cls, file, **kwargs):", cls)
        self.assertIn("def run(self, file, post_processing=False, project_used=None):", cls)
        self.assertEqual(cls.count("folder_paths.get_output_directory()"), 2)
        self.assertIn("Project or Folder window", cls)

    def test_is_changed_accepts_post_processing(self):
        with open(os.path.join(ROOT, "nodes.py"), encoding="utf-8") as f:
            py = f.read()
        cls = py[py.index("class MiniMaxH3LoadMedia"):]
        self.assertIn("def IS_CHANGED(cls, file, post_processing=False, **kwargs):", cls)
        self.assertIn("return load_media.signature(file)", cls)

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
        self.output = os.path.join(self.tmp, "output")
        os.makedirs(self.output)
        self.in_output = os.path.join(self.output, "o.png")
        Image.new("RGB", (8, 6), (0, 255, 0)).save(self.in_output)
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
        with self.assertRaisesRegex(ValueError, "^Only files in the input or output folder of ComfyUI can be loaded: "):
            lm.check_path(self.outside, self.input)

    def test_dot_dot_escape_refused(self):
        sneaky = os.path.join(self.input, "Projet", "..", "..", "b.png")
        with self.assertRaisesRegex(ValueError, "^Only files in the input or output folder of ComfyUI can be loaded: "):
            lm.check_path(sneaky, self.input, self.output)

    def test_output_accepted(self):
        path, kind = lm.check_path(self.in_output, self.input, self.output)
        self.assertEqual(kind, "image")
        self.assertEqual(os.path.normcase(path), os.path.normcase(os.path.abspath(self.in_output)))
        self.assertEqual(lm.check_path(self.inside, self.input, self.output)[1], "image")

    def test_output_refused_without_output_dir(self):
        with self.assertRaisesRegex(ValueError, "^Only files in the input or output folder"):
            lm.check_path(self.in_output, self.input)

    def test_other_folder_refused_with_both(self):
        with self.assertRaisesRegex(ValueError, "^Only files in the input or output folder of ComfyUI can be loaded: "):
            lm.check_path(self.outside, self.input, self.output)

    def test_dot_dot_from_output_escape_refused(self):
        sneaky = os.path.join(self.output, "..", "b.png")
        with self.assertRaisesRegex(ValueError, "^Only files in the input or output folder"):
            lm.check_path(sneaky, self.input, self.output)

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


class MedLoadBrowserPillTextTest(unittest.TestCase):
    """Texte de load_media_node.js : pilule Project | Folder, infobulle, aide EN / FR (05/11/2026)."""

    def setUp(self):
        import os
        p = os.path.join(os.path.dirname(__file__), "..", "web", "js", "load_media_node.js")
        with open(p, encoding="utf-8") as f:
            self.js = f.read()

    def test_tooltip_and_property(self):
        self.assertIn("Wire the project_used output of a MagicStudio Project node", self.js)
        self.assertIn("mmloadmediaBrowser", self.js)
        self.assertIn("onConnectionsChange", self.js)
        self.assertIn("mmProjectRefresh", self.js)

    def test_help_sections_in_both_languages(self):
        for sid in ("browser", "folderwin", "projectwin"):
            self.assertEqual(self.js.count('id: "%s"' % sid), 2, sid)

    def test_old_widgets_logic_kept(self):
        self.assertIn('w.name === "post_processing"', self.js)
