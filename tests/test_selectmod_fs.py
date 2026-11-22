"""
Tests des fonctions pures de l'explorateur de champs de SelectMod (sans ComfyUI) :

    ..\\..\\..\\python_embeded\\python.exe -m unittest tests.test_selectmod_fs -v
"""

import json
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import select_mod as sm  # noqa: E402

CONTENT = '{"format": "MagicStudio SelectMod", "version": 1, "fields": []}'


def write(path, data=b"x"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


class SelectModFsTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def p(self, *parts):
        return os.path.join(self.root, *parts)

    def test_is_local_address(self):
        for a in ("127.0.0.1", "127.5.0.1", "::1", "::ffff:127.0.0.1", "localhost"):
            self.assertTrue(sm.is_local_address(a), a)
        for a in (None, "", "192.168.1.20", "::ffff:10.0.0.2", "8.8.8.8"):
            self.assertFalse(sm.is_local_address(a), a)

    def test_drives(self):
        d = sm.drives()
        self.assertTrue(d)
        if os.name == "nt":
            self.assertTrue(all(len(x) == 3 and x[1:] == ":\\" for x in d))
        else:
            self.assertEqual(d, ["/"])

    def test_clean_name(self):
        self.assertEqual(sm.clean_name("  wan v1 "), "wan v1.json")
        self.assertEqual(sm.clean_name("wan.JSON"), "wan.json")
        for bad in ("", "  ", ".", "..", "a/b", "a\\b", "a:b", "a*b", "a?b", 'a"b', "a<b", "a>b", "a|b", "a.", "a\x01"):
            with self.assertRaises(ValueError, msg=bad):
                sm.clean_name(bad)

    def test_list_dir_kinds_and_counts(self):
        write(self.p("a.json"))
        write(self.p("B.TXT"))
        write(self.p("c.safetensors"))
        write(self.p("sub", "x.json"))
        write(self.p("sub", "y.txt"))
        os.makedirs(self.p("vide"))
        save = sm.list_dir(self.root, "save")
        self.assertEqual([f["name"] for f in save["files"]], ["a.json"])
        self.assertEqual({d["name"]: d["count"] for d in save["dirs"]}, {"sub": 1, "vide": 0})
        opened = sm.list_dir(self.root, "open")
        self.assertEqual([f["name"] for f in opened["files"]], ["a.json", "B.TXT"])
        self.assertEqual({d["name"]: d["count"] for d in opened["dirs"]}, {"sub": 2, "vide": 0})
        self.assertEqual(save["parent"], os.path.dirname(self.root))
        self.assertEqual(save["path"], os.path.abspath(self.root))
        self.assertEqual(sm.list_dir(self.root, "folder")["files"], save["files"])
        info = save["files"][0]
        self.assertEqual(set(info), {"name", "path", "size", "mtime"})

    def test_list_dir_has_dirs(self):
        os.makedirs(self.p("a", "inner"))
        os.makedirs(self.p("b", ".hidden"))
        os.makedirs(self.p("c"))
        got = {d["name"]: d["has_dirs"] for d in sm.list_dir(self.root, "save")["dirs"]}
        self.assertEqual(got, {"a": True, "b": False, "c": False})

    def test_list_dir_skips_hidden_and_denied(self):
        for n in (".cache", "$RECYCLE.BIN", "System Volume Information", "normal", "locked"):
            os.makedirs(self.p(n))
        real_scandir = os.scandir

        def fake(path):
            if os.path.basename(str(path)) == "locked":
                raise PermissionError("denied")
            return real_scandir(path)

        with mock.patch("select_mod.os.scandir", fake):
            names = [d["name"] for d in sm.list_dir(self.root, "save")["dirs"]]
        self.assertEqual(names, ["normal"])
        with self.assertRaises(FileNotFoundError):
            sm.list_dir(os.path.join(self.root, "absent"), "save")

    def test_list_dir_denied_root(self):
        def fake(path):
            raise PermissionError("denied")

        with mock.patch("select_mod.os.scandir", fake):
            with self.assertRaises(PermissionError):
                sm.list_dir(self.root, "save")

    def test_read_fields(self):
        j = self.p("a.json")
        write(j, b'\xef\xbb\xbf{"format": "MagicStudio SelectMod", "fields": []}')
        self.assertEqual(sm.read_fields(j), '{"format": "MagicStudio SelectMod", "fields": []}')
        st = self.p("m.safetensors")
        write(st)
        with self.assertRaises(ValueError):
            sm.read_fields(st)
        big = self.p("big.json")
        write(big, b"x" * (sm.FIELDS_MAX_BYTES + 1))
        with self.assertRaises(ValueError):
            sm.read_fields(big)
        with self.assertRaises(FileNotFoundError):
            sm.read_fields(self.p("missing.json"))

    def test_write_fields_new_then_replace(self):
        p = sm.write_fields(self.root, "wan v1", CONTENT)
        self.assertEqual(os.path.basename(p), "wan v1.json")
        with self.assertRaises(FileExistsError):
            sm.write_fields(self.root, "wan v1", CONTENT)
        self.assertEqual(sm.write_fields(self.root, "wan v1", CONTENT, replace=True), p)
        self.assertEqual([n for n in os.listdir(self.root)], ["wan v1.json"])

    def test_write_fields_never_replaces_other_json(self):
        registry = self.p("20261122_120000_models.json")
        write(registry, b'{"IndiceMODELS": []}')
        with self.assertRaises(ValueError):
            sm.write_fields(self.root, "20261122_120000_models", CONTENT, replace=True)
        with self.assertRaises(ValueError):
            sm.write_fields(self.root, "20261122_120000_models", CONTENT)
        with open(registry, "rb") as f:
            self.assertEqual(f.read(), b'{"IndiceMODELS": []}')

    def test_write_fields_refuses_bad_content_and_folder(self):
        with self.assertRaises(ValueError):
            sm.write_fields(self.root, "x", "not json")
        with self.assertRaises(ValueError):
            sm.write_fields(self.root, "x", '{"format": "MultiFiles Select", "fields": []}')
        with self.assertRaises(FileNotFoundError):
            sm.write_fields(os.path.join(self.root, "absent"), "x", CONTENT)

    def test_write_fields_keeps_old_file_on_error(self):
        p = sm.write_fields(self.root, "keep", CONTENT)
        new = '{"format": "MagicStudio SelectMod", "version": 1, "fields": [1]}'
        with mock.patch("select_mod.os.replace", side_effect=OSError("boom")):
            with self.assertRaises(OSError):
                sm.write_fields(self.root, "keep", new, replace=True)
        with open(p, encoding="utf-8") as f:
            self.assertEqual(f.read(), CONTENT)
        self.assertEqual(os.listdir(self.root), ["keep.json"])

    def test_is_fields_file(self):
        def mk(name, text):
            write(self.p(name), text.encode("utf-8") if isinstance(text, str) else text)
            return self.p(name)

        self.assertTrue(sm.is_fields_file(mk("a.json", CONTENT)))
        self.assertTrue(sm.is_fields_file(mk("b.json", '{"format": "MultiFiles Select", "fields": []}')))
        self.assertFalse(sm.is_fields_file(mk("c.json", '{"IndiceMODELS": []}')))
        self.assertFalse(sm.is_fields_file(mk("d.json", "[]")))
        self.assertFalse(sm.is_fields_file(mk("e.json", b"\xff\xfe not json")))
        self.assertFalse(sm.is_fields_file(mk("f.txt", CONTENT)))
        self.assertFalse(sm.is_fields_file(mk("g.json", '{"format": "MagicStudio SelectMod", "fields": 3}')))
        big = json.dumps({"format": "MagicStudio SelectMod", "fields": [], "pad": "x" * sm.FIELDS_MAX_BYTES})
        self.assertFalse(sm.is_fields_file(mk("h.json", big)))
        self.assertFalse(sm.is_fields_file(self.p("missing.json")))


if __name__ == "__main__":
    unittest.main()
