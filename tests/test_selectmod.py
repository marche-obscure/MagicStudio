"""
Tests du module select_mod (noeud MagicStudio SelectMod, sans ComfyUI) : lancer
depuis la racine de l'extension avec le Python embarque :

    ..\\..\\..\\python_embeded\\python.exe -m unittest discover -s tests -v
"""

import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import select_mod as sm  # noqa: E402


def write(path, data=b"x"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


class SelectModTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.comfy = os.path.join(self.tmp, "ComfyUI")
        self.models = os.path.join(self.comfy, "models")
        self.linker = os.path.join(self.tmp, "Gen", "models")
        self.other = os.path.join(self.tmp, "ailleurs")
        for d in (self.models, self.linker, self.other):
            os.makedirs(d)
        write(os.path.join(self.models, "diffusion_models", "a.safetensors"))
        write(os.path.join(self.models, "diffusion_models", "a.json"))
        write(os.path.join(self.models, "diffusion_models", "sub", "b.gguf"))
        write(os.path.join(self.linker, "vae", "v.safetensors"))
        write(os.path.join(self.other, "secret.safetensors"))
        self.roots = [{"label": "models", "path": self.models}, {"label": "Models (Linker)", "path": self.linker}]

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def yaml(self, text):
        with open(os.path.join(self.comfy, "extra_model_paths.yaml"), "w", encoding="utf-8") as f:
            f.write(text)

    def test_subfolder_allowed(self):
        p = os.path.join(self.models, "diffusion_models", "sub")
        self.assertEqual(os.path.normcase(sm.allowed(p, self.roots)), os.path.normcase(os.path.realpath(p)))
        self.assertIsNotNone(sm.allowed(os.path.join(self.linker, "vae", "v.safetensors"), self.roots))

    def test_dot_dot_refused(self):
        self.assertIsNone(sm.allowed(os.path.join(self.models, "..", "..", "ailleurs"), self.roots))
        with self.assertRaisesRegex(PermissionError, "SelectMod only reads the models folders"):
            sm.files(os.path.join(self.models, "..", ".."), self.roots)

    def test_other_drive_refused(self):
        self.assertIsNone(sm.allowed(self.other, self.roots))
        self.assertIsNone(sm.allowed("Z:\\nowhere\\models", self.roots))
        self.assertIsNone(sm.allowed("", self.roots))

    @unittest.skipUnless(sys.platform == "win32", "jonction Windows")
    def test_junction_out_is_refused(self):
        link = os.path.join(self.models, "lien")
        subprocess.run(["cmd", "/c", "mklink", "/J", link, self.other], capture_output=True, check=True)
        try:
            self.assertIsNone(sm.allowed(os.path.join(link, "secret.safetensors"), self.roots))
            names = [d["name"] for d in sm.tree(self.models, self.roots)]
            self.assertNotIn("lien", names)
        finally:
            os.rmdir(link)

    def test_linker_missing_gives_models_only(self):
        self.assertEqual([r["label"] for r in sm.roots(self.models, self.comfy)], ["models"])

    def test_linker_from_yaml(self):
        gen = os.path.dirname(self.linker)
        self.yaml("first:\n    base_path: %s\ncomfyui:\n    base_path: %s\n    is_default: true\n" % (self.other, gen))
        self.assertEqual(os.path.normcase(sm.linker_models_dir(self.comfy)), os.path.normcase(self.linker))
        self.yaml("first:\n    base_path: %s\n" % gen)
        self.assertEqual(os.path.normcase(sm.linker_models_dir(self.comfy)), os.path.normcase(self.linker))
        got = sm.roots(self.models, self.comfy)
        self.assertEqual([r["label"] for r in got], ["models", "Models (Linker)"])

    def test_duplicate_roots_once(self):
        self.yaml("comfyui:\n    base_path: %s\n    is_default: true\n" % self.comfy)
        self.assertEqual([r["label"] for r in sm.roots(self.models, self.comfy)], ["models"])

    def test_model_type(self):
        self.assertEqual(sm.model_type(os.path.join(self.models, "diffusion_models", "x.safetensors")), "diffusion_models")
        self.assertEqual(sm.model_type("G:\\Gen\\Models\\vae"), "vae")
        self.assertEqual(sm.model_type("G:\\Gen\\models\\x.safetensors"), "")
        self.assertEqual(sm.model_type("G:\\Gen\\other\\x.safetensors"), "")

    def test_hidden_files(self):
        for n in ("a.json", "b.sha256", "c.md", "d.info", "e.SHA1"):
            self.assertTrue(sm.is_hidden(n), n)
        self.assertFalse(sm.is_hidden("e.safetensors"))
        names = [f["name"] for f in sm.files(os.path.join(self.models, "diffusion_models"), self.roots)]
        self.assertEqual(names, ["a.safetensors"])

    def test_tree_counts(self):
        tree = sm.tree(self.models, self.roots)
        self.assertEqual([(d["name"], d["count"], d["has_children"]) for d in tree], [("diffusion_models", 1, True)])

    def test_search_finds_in_subfolders(self):
        got = sm.search(self.models, self.roots, "B")
        self.assertEqual([f["name"] for f in got["files"]], ["b.gguf"])
        self.assertFalse(got["truncated"])
        self.assertEqual(sm.search(self.models, self.roots, "  ")["files"], [])

    def test_search_limit(self):
        for i in range(12):
            write(os.path.join(self.models, "loras", "lora_%02d.safetensors" % i))
        got = sm.search(self.models, self.roots, "lora", limit=5)
        self.assertEqual(len(got["files"]), 5)
        self.assertTrue(got["truncated"])

    def test_check_fields(self):
        ok = os.path.join(self.models, "diffusion_models", "a.safetensors")
        sm.check_fields([ok, "", "  "], self.models, self.roots)
        with self.assertRaisesRegex(ValueError, "SelectMod only reads the models folders: "):
            sm.check_fields([os.path.join(self.other, "secret.safetensors")], self.models, self.roots)

    def test_check_fields_relative(self):
        sm.check_fields(["diffusion_models/a.safetensors"], self.models, self.roots)
        sm.check_fields(["vae/v.safetensors"], "", self.roots)
        with self.assertRaises(ValueError):
            sm.check_fields(["../../ailleurs/secret.safetensors"], self.models, self.roots)


    def test_list_dirs_and_files(self):
        self.assertEqual(sm.list_dirs(self.models, self.roots), ["diffusion_models", "diffusion_models/sub"])
        self.assertEqual(sm.list_files(self.models, "diffusion_models", self.roots), ["a.safetensors"])
        with self.assertRaises(PermissionError):
            sm.list_dirs(self.other, self.roots)
        with self.assertRaises(PermissionError):
            sm.list_files(self.models, "../../ailleurs", self.roots)

    def test_check_fields_relative_from_another_root(self):
        # Champ relatif rempli depuis Models (Linker) alors que l'origine est models : accepte.
        sm.check_fields(["vae/v.safetensors"], self.models, self.roots)

    def test_join_path(self):
        self.assertEqual(os.path.normcase(sm.join_path(self.models, "vae", "v.safetensors", "Absolute")),
                         os.path.normcase(os.path.join(self.models, "vae", "v.safetensors")))
        self.assertEqual(sm.join_path(self.models, "vae", "v.safetensors", "Relative").replace("\\", "/"), "vae/v.safetensors")
        self.assertEqual(sm.join_path("", "", "", "Absolute"), "")

    def test_write_export(self):
        name = "20261029-143000_selectmod_fields.json"
        p1 = sm.write_export(self.other, name, '{"format": "MagicStudio SelectMod"}')
        p2 = sm.write_export(self.other, name, "{}")
        self.assertNotEqual(p1, p2)
        self.assertTrue(p2.endswith(" (2).json"))
        with self.assertRaises(ValueError):
            sm.write_export(self.other, "../x.json", "{}")
        with self.assertRaises(ValueError):
            sm.write_export(self.other, name, "not json")

if __name__ == "__main__":
    unittest.main()
