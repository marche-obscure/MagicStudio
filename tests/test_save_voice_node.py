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


if __name__ == "__main__":
    unittest.main()
