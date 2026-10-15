"""
Tests du module media (sans ComfyUI) : lancer depuis la racine de l'extension
avec le Python embarque :

    ..\\..\\..\\python_embeded\\python.exe -m unittest discover -s tests -v
"""

import os
import sys
import json
import shutil
import tempfile
import unittest

import av
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import media  # noqa: E402


def make_video(path, seconds, fps, width=64, height=48, with_audio=True, sr=16000):
    """Petite video synthetique : la couleur rouge code le numero d'image."""
    with av.open(path, "w") as c:
        vs = c.add_stream("mpeg4", rate=fps)
        vs.width, vs.height, vs.pix_fmt = width, height, "yuv420p"
        aus = None
        if with_audio:
            aus = c.add_stream("aac", rate=sr)
            aus.layout = "mono"
        n = int(seconds * fps)
        for i in range(n):
            arr = np.zeros((height, width, 3), dtype=np.uint8)
            arr[..., 0] = (i * 7) % 256
            for p in vs.encode(av.VideoFrame.from_ndarray(arr, format="rgb24")):
                c.mux(p)
        for p in vs.encode():
            c.mux(p)
        if aus is not None:
            total = int(seconds * sr)
            chunk = 1024
            t = 0
            while t < total:
                k = min(chunk, total - t)
                samples = (0.1 * np.sin(np.arange(t, t + k) / 20.0)).astype(np.float32)[None, :]
                frame = av.AudioFrame.from_ndarray(samples, format="flt", layout="mono")
                frame.sample_rate = sr
                frame.pts = t
                for p in aus.encode(frame):
                    c.mux(p)
                t += k
            for p in aus.encode():
                c.mux(p)


def make_audio(path, seconds, sr=22050):
    with av.open(path, "w") as c:
        aus = c.add_stream("pcm_s16le", rate=sr)
        aus.layout = "stereo"
        samples = (np.random.rand(2, int(seconds * sr)) * 2000).astype(np.int16)
        frame = av.AudioFrame.from_ndarray(samples.reshape(1, -1), format="s16", layout="stereo")
        frame.sample_rate = sr
        for p in aus.encode(frame):
            c.mux(p)
        for p in aus.encode():
            c.mux(p)


class TmpDirTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="mmref_")

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def p(self, name):
        return os.path.join(self.dir, name)


class LayoutTests(unittest.TestCase):
    def test_empty_selection_gives_four_base_outputs(self):
        self.assertEqual(
            media.layout_keys(0, 0, 0),
            ["ref_image_1", "ref_video_1", "ref_video_audio_1", "ref_audio_1"],
        )

    def test_counts_grow_each_group_and_video_audio_mirrors_videos(self):
        self.assertEqual(
            media.layout_keys(3, 2, 1),
            ["ref_image_1", "ref_image_2", "ref_image_3",
             "ref_video_1", "ref_video_2",
             "ref_video_audio_1", "ref_video_audio_2",
             "ref_audio_1"],
        )

    def test_counts_are_clamped_to_minimax_limits(self):
        keys = media.layout_keys(20, 9, 9)
        self.assertEqual(len(keys), media.TOTAL_OUTPUTS)
        self.assertEqual(media.TOTAL_OUTPUTS, 18)
        self.assertIn("ref_image_9", keys)
        self.assertNotIn("ref_image_10", keys)
        self.assertIn("ref_audio_3", keys)


class StateTests(unittest.TestCase):
    def test_bad_json_gives_empty_state(self):
        s = media.parse_state("not json")
        self.assertEqual(s["images"], [])
        self.assertEqual(s["videos"], [])
        self.assertEqual(s["audios"], [])

    def test_state_is_normalized_and_clamped(self):
        raw = json.dumps({
            "folders": {"image": "C:/img", "video": "C:/vid", "audio": 5},
            "images": ["a.png"] * 12 + [3, ""],
            "videos": [{"file": "v.mp4", "sound": True}, "w.mp4", {"file": ""}],
            "audios": ["x.wav"],
        })
        s = media.parse_state(raw)
        self.assertEqual(len(s["images"]), 9)
        self.assertEqual(s["folders"]["audio"], "")
        self.assertEqual(s["videos"], [{"file": "v.mp4", "sound": True},
                                       {"file": "w.mp4", "sound": False}])
        self.assertEqual(s["audios"], ["x.wav"])


class ListFolderTests(TmpDirTest):
    def test_lists_only_files_of_the_requested_kind_sorted(self):
        Image.new("RGB", (8, 8)).save(self.p("b.png"))
        Image.new("RGB", (8, 8)).save(self.p("A.jpg"))
        open(self.p("notes.txt"), "w").close()
        make_audio(self.p("s.wav"), 0.5)
        files = media.list_folder(self.dir, "image")
        self.assertEqual([f["name"] for f in files], ["A.jpg", "b.png"])
        audio = media.list_folder(self.dir, "audio")
        self.assertEqual([f["name"] for f in audio], ["s.wav"])
        self.assertAlmostEqual(audio[0]["duration"], 0.5, delta=0.1)

    def test_missing_folder_raises(self):
        with self.assertRaises(FileNotFoundError):
            media.list_folder(self.p("nope"), "image")


class LoadImageTests(TmpDirTest):
    def test_image_tensor_is_bhwc_float(self):
        Image.new("RGBA", (10, 6), (255, 0, 0, 128)).save(self.p("r.png"))
        t = media.load_image(self.p("r.png"))
        self.assertEqual(tuple(t.shape), (1, 6, 10, 3))
        self.assertAlmostEqual(float(t[0, 0, 0, 0]), 1.0, places=3)
        self.assertEqual(str(t.dtype), "torch.float32")


class LoadVideoTests(TmpDirTest):
    def test_video_is_resampled_to_24_fps(self):
        make_video(self.p("v30.mp4"), 2.0, 30)
        frames, audio = media.load_video(self.p("v30.mp4"), with_audio=False)
        self.assertEqual(frames.shape[0], 48)
        self.assertEqual(tuple(frames.shape[1:]), (48, 64, 3))
        self.assertIsNone(audio)

    def test_low_fps_video_repeats_frames(self):
        make_video(self.p("v12.mp4"), 1.0, 12, with_audio=False)
        frames, _ = media.load_video(self.p("v12.mp4"), with_audio=False)
        self.assertEqual(frames.shape[0], 24)

    def test_video_is_capped_at_max_seconds(self):
        make_video(self.p("long.mp4"), 3.0, 24, with_audio=False)
        frames, _ = media.load_video(self.p("long.mp4"), with_audio=False, max_seconds=1.0)
        self.assertEqual(frames.shape[0], 24)

    def test_big_video_is_downscaled_to_pixel_cap(self):
        make_video(self.p("big.mp4"), 0.5, 24, width=320, height=240, with_audio=False)
        frames, _ = media.load_video(self.p("big.mp4"), with_audio=False, max_pixels=160 * 120)
        h, w = frames.shape[1], frames.shape[2]
        self.assertLessEqual(h * w, 160 * 120)
        self.assertAlmostEqual(w / h, 320 / 240, delta=0.05)

    def test_soundtrack_is_extracted_and_trimmed_to_video_length(self):
        make_video(self.p("av.mp4"), 2.0, 24, sr=16000)
        frames, audio = media.load_video(self.p("av.mp4"), with_audio=True, max_seconds=1.0)
        self.assertEqual(frames.shape[0], 24)
        self.assertEqual(audio["sample_rate"], 16000)
        wf = audio["waveform"]
        self.assertEqual(wf.ndim, 3)
        self.assertEqual(wf.shape[0], 1)
        self.assertLessEqual(wf.shape[2], 16000)
        self.assertGreater(wf.shape[2], 14000)

    def test_video_without_soundtrack_gives_no_audio(self):
        make_video(self.p("mute.mp4"), 0.5, 24, with_audio=False)
        _, audio = media.load_video(self.p("mute.mp4"), with_audio=True)
        self.assertIsNone(audio)


class LoadAudioTests(TmpDirTest):
    def test_audio_dict_shape(self):
        make_audio(self.p("s.wav"), 1.0, sr=22050)
        a = media.load_audio(self.p("s.wav"))
        self.assertEqual(a["sample_rate"], 22050)
        self.assertEqual(tuple(a["waveform"].shape), (1, 2, 22050))

    def test_audio_is_capped(self):
        make_audio(self.p("s.wav"), 2.0, sr=8000)
        a = media.load_audio(self.p("s.wav"), max_seconds=1.0)
        self.assertEqual(a["waveform"].shape[2], 8000)


class ThumbTests(TmpDirTest):
    def test_image_and_video_thumbnails_are_jpeg(self):
        Image.new("RGB", (800, 400)).save(self.p("i.png"))
        make_video(self.p("v.mp4"), 0.5, 24, with_audio=False)
        for name in ("i.png", "v.mp4"):
            data = media.make_thumbnail(self.p(name), 192)
            self.assertTrue(data.startswith(b"\xff\xd8"))


class MediaInfoTests(TmpDirTest):
    def test_image_info(self):
        Image.new("RGB", (40, 30)).save(self.p("i.png"))
        info = media.media_info(self.p("i.png"))
        self.assertEqual(info["kind"], "image")
        self.assertEqual(info["name"], "i.png")
        self.assertEqual(os.path.normcase(info["folder"]), os.path.normcase(self.dir))
        self.assertEqual((info["width"], info["height"]), (40, 30))
        self.assertGreater(info["size"], 0)

    def test_video_info(self):
        make_video(self.p("v.mp4"), 1.0, 30, width=64, height=48, with_audio=True)
        info = media.media_info(self.p("v.mp4"))
        self.assertEqual(info["kind"], "video")
        self.assertEqual((info["width"], info["height"]), (64, 48))
        self.assertAlmostEqual(info["fps"], 30, delta=0.5)
        self.assertAlmostEqual(info["duration"], 1.0, delta=0.15)
        self.assertTrue(info["has_audio"])

    def test_audio_info(self):
        make_audio(self.p("s.wav"), 1.0, sr=22050)
        info = media.media_info(self.p("s.wav"))
        self.assertEqual(info["kind"], "audio")
        self.assertEqual(info["sample_rate"], 22050)
        self.assertEqual(info["channels"], 2)
        self.assertAlmostEqual(info["duration"], 1.0, delta=0.1)

    def test_unknown_or_missing_file_raises(self):
        open(self.p("x.txt"), "w").close()
        with self.assertRaises(ValueError):
            media.media_info(self.p("x.txt"))
        with self.assertRaises(FileNotFoundError):
            media.media_info(self.p("gone.png"))


class BuildOutputsTests(TmpDirTest):
    def test_outputs_follow_layout_and_are_padded(self):
        Image.new("RGB", (8, 8)).save(self.p("a.png"))
        Image.new("RGB", (8, 8)).save(self.p("b.png"))
        make_video(self.p("v.mp4"), 0.5, 24)
        make_audio(self.p("s.wav"), 0.5)
        state = media.parse_state(json.dumps({
            "folders": {"image": self.dir, "video": self.dir, "audio": self.dir},
            "images": ["b.png", "a.png"],
            "videos": [{"file": "v.mp4", "sound": False}],
            "audios": ["s.wav"],
        }))
        out = media.build_outputs(state)
        self.assertEqual(len(out), media.TOTAL_OUTPUTS)
        # ref_image_1, ref_image_2, ref_video_1, ref_video_audio_1, ref_audio_1
        self.assertEqual(out[0].shape[0], 1)
        self.assertEqual(out[2].shape[0], 12)
        self.assertIsNone(out[3])  # son coupe
        self.assertIn("waveform", out[4])
        self.assertTrue(all(v is None for v in out[5:]))

    def test_absolute_paths_from_other_folders_are_used_as_is(self):
        # Le JS stocke des chemins complets : une selection peut venir de
        # plusieurs dossiers, le dossier courant ne sert qu'a la navigation.
        Image.new("RGB", (8, 8)).save(self.p("a.png"))
        state = media.parse_state(json.dumps({
            "folders": {"image": "Z:/elsewhere"}, "images": [self.p("a.png")],
        }))
        out = media.build_outputs(state)
        self.assertEqual(tuple(out[0].shape), (1, 8, 8, 3))

    def test_missing_file_raises_clear_error(self):
        state = media.parse_state(json.dumps({
            "folders": {"image": self.dir}, "images": ["gone.png"],
        }))
        with self.assertRaises(FileNotFoundError) as ctx:
            media.build_outputs(state)
        self.assertIn("gone.png", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
