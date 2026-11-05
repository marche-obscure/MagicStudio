"""Logique pure du noeud MagicStudio Image / Video Compare (compare.py) et son noeud, sans ComfyUI."""
import importlib
import json
import os
import shutil
import sys
import tempfile
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import compare  # noqa: E402
import run_record  # noqa: E402

with open(os.path.join(HERE, "compare_cases.json"), encoding="utf-8") as f:
    CASES = json.load(f)


def _frames(n, h=4, w=6):
    import torch
    return torch.zeros((n, h, w, 3))


def _state(**kw):
    s = compare.parse_state({})
    s.update(kw)
    return s


class PureTest(unittest.TestCase):
    def test_chosen_cases(self):
        for c in CASES["chosen"]:
            if c["expect"] is None:
                with self.assertRaises(ValueError):
                    compare.chosen_side(*c["args"])
            else:
                self.assertEqual(compare.chosen_side(*c["args"]), c["expect"], c["args"])

    def test_state_cases(self):
        for c in CASES["state"]:
            expect = CASES["default_state"] if c["expect"] == "default" else c["expect"]
            raw = c["raw"] if isinstance(c["raw"], str) else json.dumps(c["raw"])
            self.assertEqual(compare.parse_state(raw), expect, c["raw"])
            self.assertEqual(compare.parse_state(c["raw"]), expect, c["raw"])

    def test_kinds_cases(self):
        for c in CASES["kinds"]:
            s = _state()
            if "file_a" in c:
                s["a"] = {"path": c["file_a"], "kind": ""}
            if "file_b" in c:
                s["b"] = {"path": c["file_b"], "kind": ""}
            video = object() if c.get("video_a") else None
            frames = _frames(c["frames_a"]) if "frames_a" in c else None
            sa = compare.side_source("A", s, video=video, frames=frames)
            sb = compare.side_source("B", s)
            if "expect_source_a" in c:
                self.assertEqual(sa["from"], c["expect_source_a"])
            elif c["expect"].startswith("error "):
                with self.assertRaises(ValueError) as e:
                    compare.check_kinds(sa, sb)
                self.assertEqual(str(e.exception), c["expect"][6:])
            else:
                self.assertEqual(compare.check_kinds(sa, sb), c["expect"])

    def test_both_inputs_refused(self):
        with self.assertRaises(ValueError) as e:
            compare.side_source("A", _state(), video=object(), frames=_frames(1))
        self.assertEqual(str(e.exception), "Side A already has an input")
        with self.assertRaises(ValueError) as e:
            compare.side_source("B", _state(), video=object(), frames=_frames(1))
        self.assertEqual(str(e.exception), "Side B already has an input")

    def test_audio_and_unknown_refused(self):
        s = _state(a={"path": "x/a.wav", "kind": ""})
        with self.assertRaises(ValueError) as e:
            compare.side_source("A", s)
        self.assertEqual(str(e.exception), "Audio files cannot be compared: a.wav")
        s = _state(a={"path": "x/a.txt", "kind": ""})
        with self.assertRaises(ValueError) as e:
            compare.side_source("A", s)
        self.assertEqual(str(e.exception), "Unsupported file type: a.txt")

    def test_input_kind(self):
        self.assertIsNone(compare.input_kind())
        self.assertEqual(compare.input_kind(video=object()), "video")
        self.assertEqual(compare.input_kind(frames=_frames(1)), "image")
        self.assertEqual(compare.input_kind(frames=_frames(3)), "video")

    def test_signature(self):
        d = tempfile.mkdtemp()
        try:
            p = os.path.join(d, "a.png")
            with open(p, "wb") as f:
                f.write(b"x")
            base = {"a": {"path": p, "kind": "image"}, "mode": "side", "sync": True, "star": ""}
            sig = compare.signature(json.dumps(base))
            self.assertEqual(sig, compare.signature(json.dumps(dict(base, mode="ud", sync=False))))
            self.assertNotEqual(sig, compare.signature(json.dumps(dict(base, star="A"))))
            os.utime(p, (1000000000, 1000000000))
            self.assertNotEqual(sig, compare.signature(json.dumps(base)))
        finally:
            shutil.rmtree(d, ignore_errors=True)

    def test_preview_path(self):
        p = compare.preview_path(os.path.join("t", "tmp"), "12:3", "A", "video")
        self.assertTrue(p.replace("\\", "/").endswith("magicstudio_compare/12_3_A.mp4"), p)
        p = compare.preview_path("t", "7", "B", "image")
        self.assertTrue(p.replace("\\", "/").endswith("magicstudio_compare/7_B.png"), p)

    def test_write_preview_png_and_mp4(self):
        import av
        from PIL import Image
        d = tempfile.mkdtemp()
        try:
            png = os.path.join(d, "sub", "a.png")
            compare.write_preview(png, "image", _frames(1, 64, 96))
            with Image.open(png) as im:
                self.assertEqual(im.size, (96, 64))
            mp4 = os.path.join(d, "sub", "a.mp4")
            compare.write_preview(mp4, "video", _frames(5, 1200, 1600), fps=12)
            with av.open(mp4) as c:
                n = sum(1 for _ in c.decode(video=0))
                s = c.streams.video[0].codec_context
                self.assertEqual(n, 5)
                self.assertEqual((s.width, s.height), run_record.fit_size(1600, 1200))
        finally:
            shutil.rmtree(d, ignore_errors=True)


class RunTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.inp = os.path.join(cls.tmp, "input")
        cls.out = os.path.join(cls.tmp, "output")
        cls.temp = os.path.join(cls.tmp, "temp")
        for d in (cls.inp, cls.out, cls.temp):
            os.makedirs(d)
        fp = types.ModuleType("folder_paths")
        fp.get_input_directory = lambda: cls.inp
        fp.get_output_directory = lambda: cls.out
        fp.get_temp_directory = lambda: cls.temp
        cls._saved = sys.modules.get("folder_paths")
        sys.modules["folder_paths"] = fp
        pkg = types.ModuleType("msroot_cmp")
        pkg.__path__ = [ROOT]
        sys.modules["msroot_cmp"] = pkg
        cls.nodes = importlib.import_module("msroot_cmp.nodes")
        from PIL import Image
        cls.a = os.path.join(cls.inp, "a.png")
        cls.b = os.path.join(cls.out, "b.png")
        Image.new("RGB", (20, 10), (255, 0, 0)).save(cls.a)
        Image.new("RGB", (30, 12), (0, 0, 255)).save(cls.b)
        cls.outside = os.path.join(cls.tmp, "c.png")
        Image.new("RGB", (8, 8)).save(cls.outside)

    @classmethod
    def tearDownClass(cls):
        if cls._saved is None:
            sys.modules.pop("folder_paths", None)
        else:
            sys.modules["folder_paths"] = cls._saved
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def _st(self, **kw):
        return json.dumps(_state(**kw))

    def test_images_star_b(self):
        st = self._st(a={"path": self.a, "kind": "image"}, b={"path": self.b, "kind": "image"}, star="B")
        r = self.nodes.MagicStudioCompare().run(st)
        video, images, path, choice = r["result"]
        self.assertEqual(choice, "B")
        self.assertEqual(path, os.path.abspath(self.b))
        self.assertIsNone(video)
        self.assertEqual(tuple(images.shape), (1, 12, 30, 3))

    def test_nothing(self):
        with self.assertRaises(ValueError) as e:
            self.nodes.MagicStudioCompare().run(self._st())
        self.assertEqual(str(e.exception), "Pick or wire at least one source")

    def test_wired_frames_b_beats_file(self):
        fb = _frames(3, 8, 8)
        # A est une image, frames_b (3 images) est une video : types differents -> refus
        st = self._st(a={"path": self.a, "kind": "image"}, b={"path": self.b, "kind": "image"}, star="B")
        with self.assertRaises(ValueError):
            self.nodes.MagicStudioCompare().run(st, frames_b=fb)
        st = self._st(b={"path": self.b, "kind": "image"}, star="B")
        r = self.nodes.MagicStudioCompare().run(st, frames_b=fb, unique_id="12:3")
        video, images, path, choice = r["result"]
        self.assertEqual((path, choice), ("", "B"))
        self.assertIs(images, fb)
        self.assertIsNone(video)
        ui = r["ui"]["mmcompare"]
        self.assertEqual(len(ui), 1)
        self.assertEqual(ui[0]["side"], "B")
        self.assertEqual(ui[0]["kind"], "video")
        self.assertTrue(ui[0]["path"].replace("\\", "/").endswith("magicstudio_compare/12_3_B.mp4"))
        self.assertTrue(os.path.isfile(ui[0]["path"]))

    def test_file_outside_refused(self):
        st = self._st(a={"path": self.outside, "kind": "image"})
        with self.assertRaises(ValueError):
            self.nodes.MagicStudioCompare().run(st)

    def test_is_changed_ignores_mode(self):
        c = self.nodes.MagicStudioCompare
        self.assertEqual(c.IS_CHANGED(self._st(mode="lr")), c.IS_CHANGED(self._st(mode="ud", sync=False)))
        self.assertNotEqual(c.IS_CHANGED(self._st(star="A")), c.IS_CHANGED(self._st(star="B")))

    def test_declaration(self):
        c = self.nodes.MagicStudioCompare
        self.assertEqual(c.RETURN_TYPES, ("VIDEO", "IMAGE", "STRING", "STRING"))
        self.assertEqual(c.RETURN_NAMES, ("video", "images", "path", "choice"))
        it = c.INPUT_TYPES()
        self.assertEqual(list(it["required"]), ["state"])
        self.assertEqual(list(it["optional"]), ["project_used", "video_a", "video_b", "frames_a", "frames_b"])
        self.assertEqual(it["hidden"], {"unique_id": "UNIQUE_ID"})
        self.assertEqual(c.CATEGORY, "MagicStudio")


if __name__ == "__main__":
    unittest.main()
