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
            media.layout_keys(0, 0, 0, 0),
            ["ref_image_1", "ref_video_1", "ref_video_audio_1", "ref_audio_1"],
        )

    def test_each_group_grows_independently(self):
        # ref_video_audio a sa propre liste (pistes son), independante des videos.
        self.assertEqual(
            media.layout_keys(3, 1, 2, 1),
            ["ref_image_1", "ref_image_2", "ref_image_3",
             "ref_video_1",
             "ref_video_audio_1", "ref_video_audio_2",
             "ref_audio_1"],
        )

    def test_counts_are_clamped_to_minimax_limits(self):
        keys = media.layout_keys(20, 9, 9, 9)
        self.assertEqual(len(keys), 18)
        self.assertEqual(media.TOTAL_OUTPUTS, 22)  # plus grande disposition (LTX 2.x, 9 images guides)
        self.assertIn("ref_image_9", keys)
        self.assertNotIn("ref_image_10", keys)
        self.assertIn("ref_audio_3", keys)


class StateTests(unittest.TestCase):
    def test_bad_json_gives_empty_state(self):
        s = media.parse_state("not json")
        self.assertEqual(s["images"], [])
        self.assertEqual(s["videos"], [])
        self.assertEqual(s["video_audios"], [])
        self.assertEqual(s["audios"], [])

    def test_state_is_normalized_and_clamped(self):
        raw = json.dumps({
            "folders": {"image": "C:/img", "video": "C:/vid", "audio": 5},
            "images": ["a.png"] * 12 + [3, ""],
            "videos": ["v.mp4", "w.mp4", "", 4, "x.mp4", "y.mp4"],
            "video_audios": ["v.mp4", "z.mp4"],
            "audios": ["x.wav"],
        })
        s = media.parse_state(raw)
        self.assertEqual(len(s["images"]), 9)
        self.assertEqual(s["folders"]["audio"], "")
        self.assertEqual(s["videos"], ["v.mp4", "w.mp4", "x.mp4"])
        self.assertEqual(s["video_audios"], ["v.mp4", "z.mp4"])
        self.assertEqual(s["audios"], ["x.wav"])

    def test_old_sound_switch_is_converted(self):
        # Ancien etat : video {"file", "sound": true} -> reste en video ET
        # devient une piste son ref_video_audio.
        raw = json.dumps({"videos": [{"file": "a.mp4", "sound": True}, {"file": "b.mp4", "sound": False}]})
        s = media.parse_state(raw)
        self.assertEqual(s["videos"], ["a.mp4", "b.mp4"])
        self.assertEqual(s["video_audios"], ["a.mp4"])


class ModeTests(TmpDirTest):
    def test_default_mode_is_ref2va(self):
        s = media.parse_state("{}")
        self.assertEqual(s["mode"], "ref2va")
        self.assertEqual(s["first_frame"], [])
        self.assertEqual(s["last_frame"], [])
        self.assertEqual(media.state_layout(s)[0], "ref_image_1")

    def test_fl2va_layout_has_two_frame_outputs(self):
        s = media.parse_state(json.dumps({"mode": "fl2va", "images": ["a.png"]}))
        self.assertEqual(media.state_layout(s), ["first_frame", "last_frame"])

    def test_frames_accept_string_or_list_and_keep_one(self):
        s = media.parse_state(json.dumps({"mode": "fl2va", "first_frame": "a.png",
                                          "last_frame": ["b.png", "c.png"]}))
        self.assertEqual(s["first_frame"], ["a.png"])
        self.assertEqual(s["last_frame"], ["b.png"])

    def test_unknown_mode_falls_back_to_ref2va(self):
        self.assertEqual(media.parse_state(json.dumps({"mode": "xyz"}))["mode"], "ref2va")

    def test_fl2va_outputs_first_and_last_frames(self):
        Image.new("RGB", (16, 8)).save(self.p("debut.png"))
        state = media.parse_state(json.dumps({
            "mode": "fl2va", "folders": {"image": self.dir}, "first_frame": ["debut.png"],
            "images": ["absent_mais_ignore.png"],
        }))
        out = media.build_outputs(state)
        self.assertEqual(len(out), media.TOTAL_OUTPUTS)
        self.assertEqual(tuple(out[0].shape), (1, 8, 16, 3))
        self.assertIsNone(out[1])  # pas de last_frame : F2VA
        self.assertTrue(all(v is None for v in out[2:]))

    def test_fl2va_missing_frame_raises_clear_error(self):
        state = media.parse_state(json.dumps({
            "mode": "fl2va", "folders": {"image": self.dir}, "last_frame": ["gone.png"]}))
        with self.assertRaises(FileNotFoundError) as ctx:
            media.build_outputs(state)
        self.assertIn("last_frame", str(ctx.exception))

    def test_signature_follows_the_active_mode(self):
        Image.new("RGB", (8, 8)).save(self.p("f.png"))
        a = media.state_signature(media.parse_state(json.dumps({"mode": "fl2va", "folders": {"image": self.dir}, "first_frame": ["f.png"]})))
        b = media.state_signature(media.parse_state(json.dumps({"mode": "ref2va", "folders": {"image": self.dir}, "first_frame": ["f.png"]})))
        self.assertNotEqual(a, b)


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

    def test_all_kinds_are_listed_with_their_kind(self):
        # Galerie : tous les fichiers medias du dossier, chacun avec sa categorie.
        Image.new("RGB", (8, 8)).save(self.p("a.png"))
        make_video(self.p("v.mp4"), 0.3, 24, with_audio=False)
        make_audio(self.p("s.wav"), 0.3)
        open(self.p("notes.txt"), "w").close()
        files = media.list_folder(self.dir, "all")
        self.assertEqual([(f["name"], f["kind"]) for f in files],
                         [("a.png", "image"), ("s.wav", "audio"), ("v.mp4", "video")])
        self.assertIsNone(files[0]["duration"])
        self.assertIsNotNone(files[2]["duration"])


class SubfoldersTests(TmpDirTest):
    def test_lists_every_subfolder_with_its_count_of_the_kind(self):
        # Comme l'Explorateur : tous les sous-dossiers (caches exclus), meme
        # sans fichier du type ; la racine "" est toujours en tete.
        os.makedirs(self.p("rush"))
        os.makedirs(self.p("Prompt"))
        os.makedirs(self.p(".git"))
        make_video(self.p("rush/v.mp4"), 0.3, 24, with_audio=False)
        open(self.p("Prompt/p.txt"), "w").close()
        self.assertEqual(media.list_subfolders(self.dir, "image", every=True), [
            {"path": "", "count": 0}, {"path": "Prompt", "count": 0}, {"path": "rush", "count": 0}])
        self.assertEqual(media.list_subfolders(self.dir, "video", every=True), [
            {"path": "", "count": 0}, {"path": "Prompt", "count": 0}, {"path": "rush", "count": 1}])

    def test_lists_subfolders_with_files_of_the_kind(self):
        os.makedirs(self.p("images/sdb"))
        os.makedirs(self.p("images/vide"))
        os.makedirs(self.p("videos"))
        os.makedirs(self.p(".cache"))
        Image.new("RGB", (8, 8)).save(self.p("racine.png"))
        Image.new("RGB", (8, 8)).save(self.p("images/sdb/a.png"))
        Image.new("RGB", (8, 8)).save(self.p("images/sdb/b.jpg"))
        Image.new("RGB", (8, 8)).save(self.p(".cache/c.png"))
        open(self.p("images/vide/notes.txt"), "w").close()
        make_audio(self.p("videos/son.wav"), 0.2)
        subs = media.list_subfolders(self.dir, "image")
        self.assertEqual(subs, [{"path": "", "count": 1}, {"path": "images/sdb", "count": 2}])
        self.assertEqual(media.list_subfolders(self.dir, "audio"), [{"path": "videos", "count": 1}])

    def test_missing_root_raises(self):
        with self.assertRaises(FileNotFoundError):
            media.list_subfolders(self.p("nope"), "image")


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

    def test_thumb_cache_changes_when_file_is_replaced_under_same_name(self):
        # Bug du 25/10/2026 : image remplacee par une autre du meme nom, vignette ancienne
        # gardee par le navigateur (URL sans date, max-age d'un jour).
        path = self.p("same.png")
        Image.new("RGB", (80, 40), (255, 0, 0)).save(path)
        os.utime(path, (1000, 1000))
        before = media.thumb_cache(path, {})
        Image.new("RGB", (80, 40), (0, 0, 255)).save(path)
        after = media.thumb_cache(path, {})
        self.assertNotEqual(before["etag"], after["etag"])
        # Sans date dans l'URL : le navigateur doit redemander a chaque fois.
        self.assertEqual(after["headers"]["Cache-Control"], "no-cache")
        self.assertEqual(after["headers"]["ETag"], after["etag"])

    def test_thumb_cache_not_modified_for_same_file(self):
        path = self.p("a.png")
        Image.new("RGB", (80, 40)).save(path)
        etag = media.thumb_cache(path, {})["etag"]
        self.assertTrue(media.thumb_cache(path, {}, if_none_match=etag)["not_modified"])
        self.assertFalse(media.thumb_cache(path, {}, if_none_match='"other"')["not_modified"])

    def test_thumb_cache_long_only_with_date_in_url(self):
        path = self.p("a.png")
        Image.new("RGB", (80, 40)).save(path)
        for key in ("mt", "t"):
            self.assertEqual(media.thumb_cache(path, {key: "123"})["headers"]["Cache-Control"], "max-age=86400")


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


class TrimTests(TmpDirTest):
    def test_video_trim_keeps_only_the_range(self):
        # Rouge = (numero d'image * 7) % 256 ; a 24 ips, 0.5 s = image 12 -> rouge 84.
        make_video(self.p("v.mp4"), 3.0, 24, with_audio=False)
        frames, _ = media.load_video(self.p("v.mp4"), start=0.5, end=1.5)
        self.assertEqual(frames.shape[0], 24)
        first_red = float(frames[0, :, :, 0].mean()) * 255
        self.assertAlmostEqual(first_red, 84, delta=12)

    def test_video_trim_is_still_capped_at_max_seconds(self):
        make_video(self.p("v.mp4"), 3.0, 24, with_audio=False)
        frames, _ = media.load_video(self.p("v.mp4"), start=1.0, end=3.0, max_seconds=1.0)
        self.assertEqual(frames.shape[0], 24)

    def test_trimmed_soundtrack_matches_the_trimmed_frames(self):
        make_video(self.p("v.mp4"), 3.0, 24, sr=16000)
        frames, audio = media.load_video(self.p("v.mp4"), with_audio=True, start=1.0, end=2.0)
        self.assertEqual(frames.shape[0], 24)
        self.assertLessEqual(audio["waveform"].shape[2], 16000)
        self.assertGreater(audio["waveform"].shape[2], 15000)

    def test_audio_trim(self):
        make_audio(self.p("s.wav"), 3.0, sr=8000)
        a = media.load_audio(self.p("s.wav"), start=1.0, end=2.5)
        self.assertEqual(a["waveform"].shape[2], 12000)
        full = media.load_audio(self.p("s.wav"))
        # meme contenu que le fichier entier a partir de 1 s
        self.assertTrue(np.allclose(a["waveform"][0, :, :100].numpy(), full["waveform"][0, :, 8000:8100].numpy()))

    def test_trims_in_state_are_normalized_and_applied(self):
        make_video(self.p("v.mp4"), 3.0, 24, sr=16000)
        path = self.p("v.mp4")
        state = media.parse_state(json.dumps({
            "videos": [path], "video_audios": [path],
            "trims": {
                "video": {path.replace("\\", "/").upper(): [0.5, 1.5]},
                "video_audio": {media.trim_key(path): [1.0, 2.0]},
                "audio": {"x": [3, 1], "y": "bad"},
            },
        }))
        self.assertEqual(state["trims"]["audio"], {})
        out = media.build_outputs(state)
        # ref_image_1, ref_video_1, ref_video_audio_1, ref_audio_1
        self.assertEqual(out[1].shape[0], 24)
        self.assertLessEqual(out[2]["waveform"].shape[2], 16000)


class ProjectOutputTests(unittest.TestCase):
    """La sortie project (Root folder) est toujours la derniere sortie affichee."""

    def test_parse_root(self):
        self.assertEqual(media.parse_root(json.dumps({"root": "F:\\Rushs"})), "F:\\Rushs")
        for raw in ["", "{", "[]", json.dumps({"root": 3})]:
            self.assertEqual(media.parse_root(raw), "")

    def test_project_after_visible_outputs(self):
        for raw, n in [({}, 4), ({"images": ["a.png", "b.png"]}, 5), ({"mode": "fl2va"}, 2)]:
            state = media.parse_state(json.dumps(raw))
            outs = tuple("v%d" % i for i in range(media.TOTAL_OUTPUTS))
            res = media.outputs_with_project(state, outs, "R")
            self.assertEqual(len(res), media.TOTAL_OUTPUTS + 1)
            self.assertEqual(res[n], "R")
            self.assertEqual(res[:n], outs[:n])
            self.assertEqual(res[n + 1:], outs[n:])

    def test_project_key_last_in_output_names(self):
        self.assertEqual(media.output_names(media.parse_state("{}"))[-1], "project")
        self.assertEqual(media.output_names(media.parse_state('{"mode": "fl2va"}')),
                         ["first_frame", "last_frame", "project"])


class BuildOutputsTests(TmpDirTest):
    def test_outputs_follow_layout_and_are_padded(self):
        Image.new("RGB", (8, 8)).save(self.p("a.png"))
        Image.new("RGB", (8, 8)).save(self.p("b.png"))
        make_video(self.p("v.mp4"), 0.5, 24)
        make_audio(self.p("s.wav"), 0.5)
        state = media.parse_state(json.dumps({
            "folders": {"image": self.dir, "video": self.dir, "audio": self.dir},
            "images": ["b.png", "a.png"],
            "videos": ["v.mp4"],
            "audios": ["s.wav"],
        }))
        out = media.build_outputs(state)
        self.assertEqual(len(out), media.TOTAL_OUTPUTS)
        # ref_image_1, ref_image_2, ref_video_1, ref_video_audio_1, ref_audio_1
        self.assertEqual(out[0].shape[0], 1)
        self.assertEqual(out[2].shape[0], 12)
        self.assertIsNone(out[3])  # aucune piste son choisie
        self.assertIn("waveform", out[4])
        self.assertTrue(all(v is None for v in out[5:]))

    def test_video_audio_outputs_only_the_soundtrack(self):
        make_video(self.p("v.mp4"), 1.0, 24, sr=16000)
        make_video(self.p("w.mp4"), 0.5, 24, with_audio=False)
        state = media.parse_state(json.dumps({
            "folders": {"video": self.dir}, "video_audios": ["v.mp4"],
        }))
        out = media.build_outputs(state)
        # ref_image_1, ref_video_1, ref_video_audio_1, ref_audio_1
        self.assertIsNone(out[0])
        self.assertIsNone(out[1])
        self.assertEqual(out[2]["sample_rate"], 16000)
        self.assertEqual(out[2]["waveform"].ndim, 3)
        # une video sans bande-son en Video/Audio : erreur explicite
        state = media.parse_state(json.dumps({"folders": {"video": self.dir}, "video_audios": ["w.mp4"]}))
        with self.assertRaises(ValueError) as ctx:
            media.build_outputs(state)
        self.assertIn("ref_video_audio_1", str(ctx.exception))

    def test_video_in_audio_list_outputs_only_its_sound(self):
        # Option "son seul" : une video choisie dans Audio sort sa bande-son
        # sur ref_audio_N, rognage compris.
        make_video(self.p("v.mp4"), 2.0, 24, sr=16000)
        make_video(self.p("w.mp4"), 0.5, 24, with_audio=False)
        v = self.p("v.mp4")
        state = media.parse_state(json.dumps({
            "audios": [v], "trims": {"audio": {media.trim_key(v): [0.5, 1.5]}},
        }))
        out = media.build_outputs(state)
        # ref_image_1, ref_video_1, ref_video_audio_1, ref_audio_1
        self.assertIsNone(out[2])
        self.assertEqual(out[3]["sample_rate"], 16000)
        self.assertAlmostEqual(out[3]["waveform"].shape[2], 16000, delta=400)
        # une video sans bande-son : erreur explicite qui nomme la sortie
        state = media.parse_state(json.dumps({"audios": [self.p("w.mp4")]}))
        with self.assertRaises(ValueError) as ctx:
            media.build_outputs(state)
        self.assertIn("ref_audio_1", str(ctx.exception))

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


class ProfileOutputTests(TmpDirTest):
    def ltx(self, **extra):
        d = {"profile": "ltx2", "folders": {"image": self.dir, "video": self.dir, "audio": self.dir}}
        d.update(extra)
        return media.parse_state(json.dumps(d))

    def test_state_without_profile_is_minimax(self):
        s = media.parse_state('{"images": ["a.png"]}')
        self.assertEqual(s["profile"], "minimax_h3")
        self.assertEqual(media.state_layout(s), media.layout_keys(1, 0, 0, 0))

    def test_ltx_layout_and_outputs(self):
        Image.new("RGB", (8, 8)).save(self.p("a.png"))
        Image.new("RGB", (8, 8)).save(self.p("b.png"))
        make_audio(self.p("s.wav"), 0.5)
        a, b = self.p("a.png"), self.p("b.png")
        s = self.ltx(guide_images=[a, b], soundtrack=["s.wav"],
                     moments={"guide_images": {media.trim_key(a): 0, media.trim_key(b): -1}})
        self.assertEqual(media.state_layout(s), [
            "guide_image_1", "guide_frame_1", "guide_image_2", "guide_frame_2",
            "guide_video", "guide_video_frame", "soundtrack", "voice"])
        out = media.build_outputs(s)
        self.assertEqual(len(out), 22)
        self.assertEqual(tuple(out[0].shape), (1, 8, 8, 3))
        self.assertEqual(out[1], 0)
        self.assertEqual(tuple(out[2].shape), (1, 8, 8, 3))
        self.assertEqual(out[3], -1)
        self.assertIsNone(out[4])
        self.assertIn("waveform", out[6])
        self.assertIsNone(out[7])
        self.assertEqual(media.outputs_with_project(s, out, "R")[8], "R")

    def test_ltx_missing_moment_uses_default_rule(self):
        for n in "abc":
            Image.new("RGB", (8, 8)).save(self.p(n + ".png"))
        paths = [self.p(n + ".png") for n in "abc"]
        s = self.ltx(guide_images=paths, moments={"guide_images": {media.trim_key(paths[2]): 0}})
        out = media.build_outputs(s)
        # c a 0 stocke ; a -> Last (First pris), b -> First (les deux pris)
        self.assertEqual([out[1], out[3], out[5]], [-1, 0, 0])

    def test_ltx_guide_video_8n1_and_32(self):
        make_video(self.p("g.mp4"), 100 / 24.0, 24, width=100, height=60, with_audio=False)
        g = self.p("g.mp4")
        s = self.ltx(guide_video=[g], moments={"guide_video": {media.trim_key(g): 2}})
        out = media.build_outputs(s)
        # guide_image_1, guide_frame_1, guide_video, guide_video_frame
        self.assertEqual(out[2].shape[0] % 8, 1)
        self.assertEqual(out[2].shape[0], 97)
        self.assertEqual(out[2].shape[1] % 32, 0)
        self.assertEqual(out[2].shape[2] % 32, 0)
        self.assertEqual(out[3], 41)

    def test_ltx_fps_resample(self):
        make_video(self.p("g.mp4"), 2.0, 24, with_audio=False)
        s = self.ltx(guide_video=[self.p("g.mp4")], limits={"ltx2": {"fps": 12}})
        out = media.build_outputs(s)
        self.assertEqual(out[2].shape[0], 17)   # 24 images a 12 i/s, coupees a 8n+1

    def test_ltx_voice_from_video_file(self):
        make_video(self.p("v.mp4"), 1.0, 24, sr=16000)
        s = self.ltx(voice=["v.mp4"])
        out = media.build_outputs(s)
        # guide_image_1, guide_frame_1, guide_video, guide_video_frame, soundtrack, voice
        self.assertIsNone(out[4])
        self.assertEqual(out[5]["sample_rate"], 16000)

    def test_ltx_selected_paths_and_signature(self):
        s = self.ltx(guide_images=["a.png"], guide_video=["g.mp4"], soundtrack=["s.wav"], voice=["v.wav"])
        names = [os.path.basename(p) for p in media.selected_paths(s)]
        self.assertEqual(names, ["a.png", "g.mp4", "s.wav", "v.wav"])

    def test_build_outputs_respects_lowered_limit(self):
        for n in "abc":
            Image.new("RGB", (8, 8)).save(self.p(n + ".png"))
        s = media.parse_state(json.dumps({
            "folders": {"image": self.dir}, "images": ["a.png", "b.png", "c.png"],
            "limits": {"minimax_h3": {"image": 2}}}))
        out = media.build_outputs(s)
        self.assertEqual(sum(1 for v in out[:3] if v is not None), 2)
        self.assertEqual(len(media.state_layout(s)), 5)  # 2 images + 1 video + 1 piste son + 1 audio

    def test_declared_names_keep_old_order(self):
        names = media.declared_output_names()
        self.assertEqual(len(names), 23)
        self.assertEqual(names[:18], media.layout_keys(9, 3, 3, 3))
        self.assertEqual(names[-1], "project")


if __name__ == "__main__":
    unittest.main()
