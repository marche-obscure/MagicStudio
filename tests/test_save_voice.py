import math
import os
import sys
import tempfile
import unittest
from datetime import datetime

import torch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import av  # noqa: E402
import projects  # noqa: E402
import save_voice  # noqa: E402

NOW = datetime(2026, 10, 30, 14, 35, 12)


def sine(rate, channels, seconds=1.0):
    n = int(rate * seconds)
    t = torch.arange(n, dtype=torch.float32) / rate
    wave = 0.3 * torch.sin(2 * math.pi * 440 * t)
    return wave.unsqueeze(0).repeat(channels, 1)


def duration_of(path):
    with av.open(path) as c:
        total = 0
        rate = c.streams.audio[0].rate
        for frame in c.decode(audio=0):
            total += frame.samples
        return total / rate


class SaveVoiceTest(unittest.TestCase):
    def test_clean_prefix(self):
        self.assertEqual(save_voice.clean_prefix("voix:Shiz/01?"), "voixShiz01")
        self.assertEqual(save_voice.clean_prefix("  "), "voice")
        self.assertEqual(save_voice.clean_prefix("fin."), "fin")

    def test_voice_name(self):
        self.assertEqual(
            save_voice.voice_name("voix", "mp3", NOW, lambda n: False),
            "voix_20261030_143512.mp3")

    def test_name_collision(self):
        taken = {"voix_20261030_143512.mp3"}
        self.assertEqual(
            save_voice.voice_name("voix", "mp3", NOW, lambda n: n in taken),
            "voix_20261030_143513.mp3")

    def test_check_quality(self):
        self.assertIsNone(save_voice.check_quality("wav", "V0"))
        self.assertIsNone(save_voice.check_quality("flac", None))
        self.assertEqual(save_voice.check_quality("mp3", None), "V0")
        self.assertEqual(save_voice.check_quality("opus", "999k"), "128k")
        self.assertEqual(save_voice.check_quality("mp3", "320k"), "320k")
        with self.assertRaises(ValueError):
            save_voice.check_quality("ogg", None)

    def test_encode_formats(self):
        with tempfile.TemporaryDirectory() as tmp:
            for rate, ch in ((44100, 2), (22050, 1)):
                for fmt in save_voice.FORMATS:
                    path = os.path.join(tmp, "t_%d_%s.%s" % (rate, fmt, fmt))
                    q = save_voice.check_quality(fmt, None)
                    save_voice.encode(sine(rate, ch), rate, path, fmt, q)
                    self.assertTrue(os.path.isfile(path), path)
                    self.assertAlmostEqual(duration_of(path), 1.0, delta=0.1, msg=path)
            self.assertEqual([f for f in os.listdir(tmp) if f.endswith(".part")], [])

    def _project(self, tmp):
        p = os.path.join(tmp, "Proj")
        os.makedirs(p)
        projects.ensure_project(p)
        return p

    def test_save_writes_in_pick_up(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = self._project(tmp)
            audio = {"waveform": sine(22050, 1).unsqueeze(0), "sample_rate": 22050}
            out = save_voice.save(audio, p, "voix", "wav", None, now=NOW)
            self.assertEqual(len(out), 1)
            self.assertEqual(os.path.dirname(out[0]), os.path.join(p, "90.Pick Up", "Son"))
            self.assertEqual(os.path.basename(out[0]), "voix_20261030_143512.wav")
            self.assertTrue(os.path.isfile(out[0]))

    def test_save_batch(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = self._project(tmp)
            wave = torch.stack([sine(22050, 1), sine(22050, 1)])
            out = save_voice.save({"waveform": wave, "sample_rate": 22050}, p, "", "flac", None, now=NOW)
            self.assertEqual(len(out), 2)
            self.assertEqual(os.path.basename(out[0]), "voice_20261030_143512.flac")
            self.assertEqual(os.path.basename(out[1]), "voice_20261030_143512_02.flac")

    def test_save_never_overwrites(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = self._project(tmp)
            audio = {"waveform": sine(22050, 1).unsqueeze(0), "sample_rate": 22050}
            a = save_voice.save(audio, p, "v", "wav", None, now=NOW)
            b = save_voice.save(audio, p, "v", "wav", None, now=NOW)
            self.assertNotEqual(a[0], b[0])

    def test_save_refuses_non_project(self):
        with tempfile.TemporaryDirectory() as tmp:
            audio = {"waveform": sine(22050, 1).unsqueeze(0), "sample_rate": 22050}
            with self.assertRaises(ValueError):
                save_voice.save(audio, tmp, "v", "wav", None, now=NOW)


if __name__ == "__main__":
    unittest.main()
