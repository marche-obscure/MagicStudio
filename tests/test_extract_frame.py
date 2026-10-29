"""Tests du module extract_frame (sans ComfyUI), meme approche de video synthetique que test_media."""

import json
import os
import shutil
import sys
import tempfile
import unittest

import av
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import extract_frame as ef  # noqa: E402


def make_video(path, frames, codec="mpeg4", step=7, width=64, height=48, fps=10):
    """Video synthetique : le rouge code le numero d'image (numero * step)."""
    with av.open(path, "w") as c:
        vs = c.add_stream(codec, rate=fps)
        vs.width, vs.height, vs.pix_fmt = width, height, "yuv420p"
        for i in range(frames):
            arr = np.zeros((height, width, 3), dtype=np.uint8)
            arr[..., 0] = (i * step) % 256
            for p in vs.encode(av.VideoFrame.from_ndarray(arr, format="rgb24")):
                c.mux(p)
        for p in vs.encode():
            c.mux(p)


class FakeTrash:
    def __init__(self, fail=False):
        self.calls = []
        self.fail = fail

    def __call__(self, paths):
        if self.fail:
            raise OSError("no bin")
        self.calls.append(list(paths))
        for p in paths:
            os.remove(p)


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.project = os.path.join(self.tmp, "Sub")
        self.lock = os.path.join(self.project, "40.Rush Videos", "Picture Lock")
        os.makedirs(self.lock)
        self.video = os.path.join(self.lock, "a.mp4")
        make_video(self.video, 10)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def out(self, name):
        return os.path.join(ef.extract_dir(self.project), name)

    def red(self, name):
        return int(np.array(Image.open(self.out(name)).convert("RGB"))[..., 0].mean())

    def touch(self, name, data=b"x"):
        os.makedirs(ef.extract_dir(self.project), exist_ok=True)
        with open(self.out(name), "wb") as f:
            f.write(data)

    def state(self):
        with open(self.out(ef.STATE_FILE), encoding="utf-8") as f:
            return json.load(f)

    def replace_video(self, frames=8, step=11):
        os.remove(self.video)
        make_video(self.video, frames, step=step)

    def listing(self):
        folder = ef.extract_dir(self.project)
        return sorted(os.listdir(folder)) if os.path.isdir(folder) else []


class NamesTest(unittest.TestCase):
    def test_names(self):
        self.assertEqual(ef.frame_name("n", "C:/P/Sub", 48), "FRAME_0048_Sub.png")
        self.assertEqual(ef.frame_name("first", "C:/P/Sub"), "FIRST_FRAME_Sub.png")
        self.assertEqual(ef.frame_name("last", "C:/P/Sub"), "LAST_FRAME_Sub.png")

    def test_targets(self):
        self.assertEqual(ef.targets("fl", 10, None), [("first", 0), ("last", 9)])
        self.assertEqual(ef.targets("first", 10, None), [("first", 0)])
        self.assertEqual(ef.targets("last", 10, None), [("last", 9)])
        self.assertEqual(ef.targets("n", 10, 4), [("n", 4)])
        for bad in (None, -1, 10, "abc", 1.5):
            with self.assertRaises(ValueError):
                ef.targets("n", 10, bad)


class ExtractTest(Base):
    def test_extract_first_last_n(self):
        info = ef.video_info(self.video)
        self.assertEqual((info["frames"], info["width"], info["height"]), (10, 64, 48))
        r = ef.extract(self.project, "fl")
        self.assertEqual(r["written"], ["FIRST_FRAME_Sub.png", "LAST_FRAME_Sub.png"])
        ef.extract(self.project, "n", 5)
        for name, num in (("FIRST_FRAME_Sub.png", 0), ("LAST_FRAME_Sub.png", 9), ("FRAME_0005_Sub.png", 5)):
            self.assertAlmostEqual(self.red(name), num * 7, delta=6, msg=name)
            with Image.open(self.out(name)) as im:
                self.assertEqual(im.size, (64, 48))
        st = self.state()
        self.assertEqual(st["video"], "a.mp4")
        self.assertEqual(st["frames"], {"FIRST_FRAME_Sub.png": 0, "LAST_FRAME_Sub.png": 9, "FRAME_0005_Sub.png": 5})

    def test_count_when_stream_frames_unknown(self):
        webm = os.path.join(self.tmp, "b.webm")
        make_video(webm, 6, codec="libvpx")
        self.assertEqual(ef.video_info(webm)["frames"], 6)

    def test_count_when_stream_reports_zero(self):
        # Simule un flux sans nombre d'images (frames == 0) : le compte se fait en decodant.
        class FakeStream:
            frames = 0
            average_rate = 10

            class codec_context:
                width, height = 64, 48

        orig = av.open

        class Wrap:
            def __init__(s, c):
                s.c = c
                s.streams = type("S", (), {"video": [FakeStream]})()

            def __enter__(s):
                return s

            def __exit__(s, *a):
                s.c.close()

            def decode(s, **k):
                return s.c.decode(**k)

        ef._INFO_CACHE.clear()
        av.open = lambda p, *a, **k: Wrap(orig(p, *a, **k))
        try:
            self.assertEqual(ef.video_info(self.video)["frames"], 10)
        finally:
            av.open = orig
            ef._INFO_CACHE.clear()

    def test_frame_n_out_of_range(self):
        for bad in (-1, 10, "abc", None):
            with self.assertRaises(ValueError):
                ef.extract(self.project, "n", bad)
        self.assertEqual(self.listing(), [])

    def test_existing_name_not_overwritten_without_flag(self):
        self.touch("FIRST_FRAME_Sub.png", b"old")
        r = ef.extract(self.project, "first")
        self.assertEqual((r["written"], r["exists"]), ([], ["FIRST_FRAME_Sub.png"]))
        with open(self.out("FIRST_FRAME_Sub.png"), "rb") as f:
            self.assertEqual(f.read(), b"old")
        r = ef.extract(self.project, "first", overwrite=True)
        self.assertEqual(r["written"], ["FIRST_FRAME_Sub.png"])
        self.assertEqual(Image.open(self.out("FIRST_FRAME_Sub.png")).size, (64, 48))

    def test_two_videos_no_extract(self):
        make_video(os.path.join(self.lock, "b.mp4"), 4)
        self.assertIsNone(ef.lock_video(self.project))
        with self.assertRaises(ValueError) as cm:
            ef.extract(self.project, "first")
        self.assertIn("Picture Lock: keep one file", str(cm.exception))

    def test_part_and_subfolder_ignored(self):
        open(os.path.join(self.lock, "c.mp4.part"), "wb").close()
        os.makedirs(os.path.join(self.lock, "Extract Frame"))
        self.assertEqual(ef.lock_video(self.project), self.video)


class ChangeTest(Base):
    def prepare(self):
        ef.extract(self.project, "fl")
        ef.extract(self.project, "n", 3)

    def test_change_removed(self):
        self.prepare()
        os.remove(self.video)
        trash = FakeTrash()
        r = ef.check_lock_change(self.project, trash)
        self.assertEqual(sorted(r["emptied"]), ["FIRST_FRAME_Sub.png", "FRAME_0003_Sub.png", "LAST_FRAME_Sub.png"])
        self.assertEqual(len(trash.calls), 1)
        self.assertEqual(self.listing(), [ef.STATE_FILE])
        self.assertIsNone(self.state()["video"])
        self.assertEqual(ef.check_lock_change(self.project, trash)["emptied"], [])

    def test_change_replaced_empty_folder(self):
        ef.extract(self.project, "first")
        os.remove(self.out("FIRST_FRAME_Sub.png"))
        self.replace_video()
        trash = FakeTrash()
        r = ef.check_lock_change(self.project, trash)
        self.assertEqual((r["emptied"], r["deleted"], r["ask_replace"]), ([], [], []))
        self.assertEqual(trash.calls, [])
        self.assertEqual(self.state()["size"], os.path.getsize(self.video))

    def test_change_replaced_first_last_asks(self):
        ef.extract(self.project, "fl")
        old = self.state()
        self.replace_video()
        trash = FakeTrash()
        r = ef.check_lock_change(self.project, trash)
        self.assertEqual(r["ask_replace"], ["FIRST_FRAME_Sub.png", "LAST_FRAME_Sub.png"])
        self.assertEqual(trash.calls, [])
        self.assertEqual(self.state()["size"], old["size"])  # ancienne video gardee notee
        w = ef.replace_first_last(self.project, False)
        self.assertEqual(w["written"], ["FIRST_FRAME_Sub.png", "LAST_FRAME_Sub.png"])
        self.assertAlmostEqual(self.red("LAST_FRAME_Sub.png"), 7 * 11, delta=6)
        self.assertEqual(self.state()["size"], os.path.getsize(self.video))
        self.assertEqual(self.state()["frames"]["LAST_FRAME_Sub.png"], 7)
        self.assertEqual(ef.check_lock_change(self.project, trash)["ask_replace"], [])

    def test_change_replaced_keep(self):
        ef.extract(self.project, "fl")
        before = self.red("LAST_FRAME_Sub.png")
        self.replace_video()
        ef.check_lock_change(self.project, FakeTrash())
        self.assertEqual(ef.replace_first_last(self.project, True)["written"], [])
        self.assertEqual(self.red("LAST_FRAME_Sub.png"), before)
        self.assertEqual(self.state()["size"], os.path.getsize(self.video))
        self.assertEqual(ef.check_lock_change(self.project, FakeTrash())["ask_replace"], [])

    def test_change_replaced_frames_deleted(self):
        ef.extract(self.project, "first")
        ef.extract(self.project, "n", 3)
        self.replace_video()
        r = ef.check_lock_change(self.project, FakeTrash())
        self.assertEqual(r["deleted"], ["FRAME_0003_Sub.png"])
        self.assertEqual(r["ask_replace"], ["FIRST_FRAME_Sub.png"])
        self.assertEqual(self.listing(), [ef.STATE_FILE, "FIRST_FRAME_Sub.png"])
        self.assertNotIn("FRAME_0003_Sub.png", self.state()["frames"])

    def test_same_name_new_content_is_a_change(self):
        ef.extract(self.project, "n", 3)
        self.replace_video(frames=12)  # meme nom a.mp4, autre taille
        r = ef.check_lock_change(self.project, FakeTrash())
        self.assertEqual(r["deleted"], ["FRAME_0003_Sub.png"])

    def test_same_video_nothing(self):
        self.prepare()
        r = ef.check_lock_change(self.project, FakeTrash())
        self.assertEqual((r["emptied"], r["deleted"], r["ask_replace"]), ([], [], []))

    def test_foreign_files_never_deleted(self):
        self.prepare()
        self.touch("notes.txt")
        self.touch("MY_FRAME_x.png")
        self.touch("frame_0001_x.png")
        self.replace_video()
        ef.check_lock_change(self.project, FakeTrash())
        os.remove(self.video)
        ef.check_lock_change(self.project, FakeTrash())
        self.assertEqual(self.listing(), [ef.STATE_FILE, "MY_FRAME_x.png", "frame_0001_x.png", "notes.txt"])

    def test_no_trash_deletes_nothing(self):
        self.prepare()
        os.remove(self.video)
        before = self.listing()
        r = ef.check_lock_change(self.project, None)
        self.assertTrue(r["trash_error"])
        self.assertEqual(self.listing(), before)
        self.assertEqual(self.state()["video"], "a.mp4")
        r = ef.check_lock_change(self.project, FakeTrash(fail=True))
        self.assertIn("no bin", r["trash_error"])
        self.assertEqual(self.listing(), before)

    def test_extract_refused_while_video_change_pending(self):
        ef.extract(self.project, "first")
        before = self.state()
        self.replace_video()
        with self.assertRaises(ValueError) as cm:
            ef.extract(self.project, "n", 1)
        self.assertIn("Picture Lock video changed", str(cm.exception))
        self.assertEqual(self.listing(), [ef.STATE_FILE, "FIRST_FRAME_Sub.png"])
        self.assertEqual(self.state(), before)
        r = ef.check_lock_change(self.project, FakeTrash())
        self.assertEqual(r["ask_replace"], ["FIRST_FRAME_Sub.png"])
        with self.assertRaises(ValueError):  # tant que la question n'a pas recu de reponse
            ef.extract(self.project, "n", 1)
        ef.replace_first_last(self.project, True)
        self.assertEqual(ef.extract(self.project, "n", 1)["written"], ["FRAME_0001_Sub.png"])

    def test_partial_trash_failure_then_retry(self):
        self.prepare()
        os.remove(self.video)
        before = self.state()

        def half(paths):
            os.remove(paths[0])
            raise OSError("half done")

        r = ef.check_lock_change(self.project, half)
        self.assertIn("half done", r["trash_error"])
        self.assertEqual((r["emptied"], r["deleted"]), ([], []))
        self.assertEqual(self.state(), before)
        r = ef.check_lock_change(self.project, FakeTrash())
        self.assertIsNone(r["trash_error"])
        self.assertEqual(len(r["emptied"]), 2)  # reste du dossier
        self.assertEqual(self.listing(), [ef.STATE_FILE])
        self.assertIsNone(self.state()["video"])

    def test_no_state_no_files_writes_nothing(self):
        r = ef.check_lock_change(self.project, FakeTrash())
        self.assertEqual(r["emptied"], [])
        self.assertFalse(os.path.exists(self.out(ef.STATE_FILE)))

    def test_files_without_state_adopt_current_video(self):
        self.touch("FIRST_FRAME_Sub.png")
        trash = FakeTrash()
        r = ef.check_lock_change(self.project, trash)
        self.assertEqual((r["emptied"], r["deleted"], r["ask_replace"]), ([], [], []))
        self.assertEqual(trash.calls, [])
        self.assertEqual(self.state()["video"], "a.mp4")

    def test_two_videos_nothing_happens(self):
        self.prepare()
        make_video(os.path.join(self.lock, "b.mp4"), 4)
        before = self.listing()
        r = ef.check_lock_change(self.project, FakeTrash())
        self.assertEqual((r["emptied"], r["deleted"]), ([], []))
        self.assertEqual(self.listing(), before)


if __name__ == "__main__":
    unittest.main()
