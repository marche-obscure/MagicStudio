"""
Lien project_used (30/10/2026) : nom declare par les noeuds Project, Final Cut et
SaveVoice (lecture du texte de nodes.py, sans ComfyUI, comme test_routes_guard).
"""
import os
import re
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def _nodes():
    with open(os.path.join(ROOT, "nodes.py"), encoding="utf-8") as f:
        return f.read()


def _class(src, name):
    start = src.index("class %s" % name)
    nxt = src.find("\nclass ", start + 1)
    return src[start:nxt if nxt > 0 else len(src)]


class ProjectUsedNamesTest(unittest.TestCase):
    def test_project_output(self):
        body = _class(_nodes(), "MiniMaxH3Project")
        self.assertIn('RETURN_NAMES = ("project_used",)', body)
        self.assertIn("RETURN_TYPES = (FINAL_CUT_TYPE,)", body)

    def test_final_cut_input(self):
        body = _class(_nodes(), "MiniMaxH3FinalCut")
        self.assertIn('{"required": {"project_used": (FINAL_CUT_TYPE,)}}', body)
        self.assertIn("def run(self, project_used=None):", body)

    def test_save_voice_input(self):
        body = _class(_nodes(), "MagicStudioSaveVoice")
        self.assertIn('"project_used": (FINAL_CUT_TYPE,),', body)
        self.assertIn("def run(self, audio, project_used,", body)
        self.assertNotIn('"project": (FINAL_CUT_TYPE,)', body)

    def test_project_run_records_without_text_prompt(self):
        """Le noeud Project enregistre le Run meme sans text_prompt (31/10/2026)."""
        body = _class(_nodes(), "MiniMaxH3Project")
        self.assertNotRegex(body, r"if text_prompt is None:\s*\n\s*return")
        self.assertIn("run_record.prompt_text(", body)
        cut = body.index('"optional"')
        self.assertIn('"text_prompt"', body[cut:])
        self.assertNotIn('"text_prompt":', body[:cut])

    def test_old_link_name_gone(self):
        """Plus de "final_cut" comme nom de lien (Final Cut, final_cut.py, routes gardes)."""
        src = _nodes()
        self.assertEqual(re.findall(r'"final_cut"', src), [])
        self.assertIn('WIRE_PROJECT = "Wire the project_used output of a MagicStudio Project node"', src)


if __name__ == "__main__":
    unittest.main()
