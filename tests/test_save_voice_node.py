"""Declaration du noeud MagicStudio SaveVoice (lecture du texte, sans ComfyUI)."""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import run_tracker  # noqa: E402


def _read(name):
    with open(os.path.join(ROOT, name), encoding="utf-8") as f:
        return f.read()


class SaveVoiceNodeTest(unittest.TestCase):
    def test_savevoice_declared(self):
        nodes, init = _read("nodes.py"), _read("__init__.py")
        self.assertIn("class MagicStudioSaveVoice", nodes)
        self.assertIn('RETURN_NAMES = ("audio", "path")', nodes)
        self.assertIn("OUTPUT_NODE = True", nodes[nodes.index("class MagicStudioSaveVoice"):])
        self.assertIn('"MagicStudioSaveVoice": MagicStudioSaveVoice', init)
        self.assertIn('"MagicStudioSaveVoice": "MagicStudio SaveVoice"', init)
        self.assertIn("Wire the final_cut output of a MagicStudio Project node", nodes)
        self.assertIn('"mmvoice"', nodes)

    def test_savevoice_ui_not_a_run_output(self):
        self.assertEqual(run_tracker.output_files({"mmvoice": [{"path": "x.wav", "name": "x.wav"}]}), [])

    def test_js_qualities_match(self):
        """QUALITIES de web/js/save_voice.js = save_voice.QUALITIES (objet JSON dans le JS)."""
        import json
        import save_voice
        src = _read(os.path.join("web", "js", "save_voice.js"))
        mark = "export const QUALITIES = "
        start = src.index(mark) + len(mark)
        js = json.loads(src[start:src.index("};", start) + 1])
        self.assertEqual({k: tuple(v) for k, v in js.items()}, save_voice.QUALITIES)


class SaveVoiceRunTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import types
        import importlib
        pkg = types.ModuleType("msroot_sv")
        pkg.__path__ = [ROOT]
        sys.modules["msroot_sv"] = pkg
        cls.nodes = importlib.import_module("msroot_sv.nodes")

    def _run(self, project):
        return self.nodes.MagicStudioSaveVoice().run({"waveform": None, "sample_rate": 8000}, project)

    def test_empty_project_refused(self):
        with self.assertRaises(ValueError) as c:
            self._run("")
        self.assertEqual(str(c.exception), self.nodes.WIRE_PROJECT)

    def test_non_project_refused(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError) as c:
                self._run(d)
            self.assertEqual(str(c.exception), self.nodes.WIRE_PROJECT)

    def test_save_errors_not_remapped(self):
        import tempfile
        from unittest import mock
        projects_mod = self.nodes.projects
        msg = r"Invalid file name: C:\Project X\a.wav"
        with tempfile.TemporaryDirectory() as d:
            with mock.patch.object(projects_mod, "require_project", return_value=d), \
                    mock.patch.object(self.nodes.save_voice, "save", side_effect=ValueError(msg)):
                with self.assertRaises(ValueError) as c:
                    self._run(d)
        self.assertEqual(str(c.exception), msg)


if __name__ == "__main__":
    unittest.main()
