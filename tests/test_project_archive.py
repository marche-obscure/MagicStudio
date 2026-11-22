import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from datetime import datetime
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import projects  # noqa: E402
import project_archive as pa  # noqa: E402

NOW = datetime(2026, 11, 22, 9, 5, 7)


class ArchiveBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.root = os.path.join(self.tmp, "Projets")
        self.arch = os.path.join(self.tmp, "Arch")
        os.makedirs(self.arch)
        self.simple = projects.create_project(self.root, "P", create_root=True)
        self.sub = projects.create_project(self.root, "A", group="G", new_group=True)
        self.group = os.path.dirname(self.sub)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def put(self, folder, rel, data=b"x"):
        p = os.path.join(folder, *rel.split("/"))
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as f:
            f.write(data)
        return p


class SettingsTest(ArchiveBase):
    def test_check_folder_refuses_inside_root(self):
        with self.assertRaises(ValueError):
            pa.check_folder(os.path.join(self.root, "Arch"), self.root)
        self.assertFalse(os.path.exists(os.path.join(self.root, "Arch")))

    def test_check_folder_refuses_junction_into_root(self):
        link = os.path.join(self.tmp, "Link")
        r = subprocess.run(["cmd", "/c", "mklink", "/J", link, self.root], capture_output=True) \
            if sys.platform == "win32" else None
        if r is None or r.returncode != 0:
            self.skipTest("junction not available")
        with self.assertRaises(ValueError):
            pa.check_folder(os.path.join(link, "x"), self.root)

    def test_check_folder_refuses_empty(self):
        with self.assertRaises(ValueError):
            pa.check_folder("  ", self.root)

    def test_check_folder_creates_missing(self):
        f = os.path.join(self.tmp, "New", "Deep")
        out = pa.check_folder(f, self.root)
        self.assertTrue(os.path.isdir(f))
        self.assertTrue(os.path.isabs(out))

    def test_settings_round_trip(self):
        self.assertEqual(pa.load_settings(base_dir=self.tmp), {"folder": ""})
        res = pa.save_settings(self.arch, self.root, base_dir=self.tmp)
        self.assertEqual(pa.load_settings(base_dir=self.tmp), {"folder": self.arch})
        self.assertEqual(res, {"folder": self.arch})

    def test_save_settings_refuses_bad_folder(self):
        with self.assertRaises(ValueError):
            pa.save_settings(self.root, self.root, base_dir=self.tmp)
        self.assertFalse(os.path.exists(os.path.join(self.tmp, pa.SETTINGS_FILE)))


class TargetTest(ArchiveBase):
    def test_target_whole_and_sub(self):
        t = pa.target_of(self.sub, "whole")
        self.assertEqual((t["folder"], t["kind"], t["name"]), (self.group, "project", "G"))
        s = pa.target_of(self.sub, "sub")
        self.assertEqual((s["kind"], s["group"], s["number"]), ("sub", "G", "01"))
        self.assertEqual(s["folder"], self.sub)

    def test_simple_project(self):
        t = pa.target_of(self.simple, "whole")
        self.assertEqual((t["folder"], t["kind"], t["name"], t["group"]), (self.simple, "project", "P", None))
        with self.assertRaises(ValueError):
            pa.target_of(self.simple, "sub")

    def test_zip_name(self):
        s = pa.target_of(self.sub, "sub")
        self.assertEqual(pa.zip_name(s, NOW), "G - 01-A_20261122-090507.zip")
        self.assertEqual(pa.zip_name(pa.target_of(self.simple, "whole"), NOW), "P_20261122-090507.zip")


class ZipTest(ArchiveBase):
    def test_make_zip_methods_and_manifest(self):
        self.put(self.simple, "12.Video/a.mp4", b"video")
        self.put(self.simple, "00.Workflows/b.json", b"{}" * 50)
        os.makedirs(os.path.join(self.simple, "Vide"))
        res = pa.make_zip(self.simple, "whole", "archive", self.arch, now=NOW)
        self.assertEqual(os.path.basename(res["zip"]), "P_20261122-090507.zip")
        self.assertEqual(os.listdir(self.arch), ["P_20261122-090507.zip"])  # pas de .part
        with zipfile.ZipFile(res["zip"]) as zf:
            infos = zf.infolist()
            self.assertEqual(infos[0].filename, "mmarchive.json")
            m = json.loads(zf.read("mmarchive.json"))
            self.assertEqual(m["format"], "MagicStudio archive")
            self.assertEqual(m["version"], 1)
            self.assertEqual((m["kind"], m["name"], m["group"], m["number"], m["mode"]),
                             ("project", "P", None, None, "archive"))
            self.assertEqual(m["created"], "2026-11-22T09:05:07")
            self.assertEqual(m["files"], res["files"])
            self.assertEqual(m["size"], res["size"])
            self.assertEqual(m["source"], self.simple)
            by = {i.filename: i for i in infos}
            self.assertEqual(by["P/12.Video/a.mp4"].compress_type, zipfile.ZIP_STORED)
            self.assertEqual(by["P/00.Workflows/b.json"].compress_type, zipfile.ZIP_DEFLATED)
            self.assertIn("P/Vide/", by)
            self.assertTrue(all(n == "mmarchive.json" or n.startswith("P/") for n in by))

    def test_sub_manifest(self):
        res = pa.make_zip(self.sub, "sub", "backup", self.arch, now=NOW)
        with zipfile.ZipFile(res["zip"]) as zf:
            m = json.loads(zf.read("mmarchive.json"))
        self.assertEqual((m["kind"], m["name"], m["group"], m["number"], m["mode"]),
                         ("sub", "01-A", "G", "01", "backup"))
        self.assertEqual(os.path.basename(res["zip"]), "G - 01-A_20261122-090507.zip")

    def test_make_zip_never_overwrites(self):
        first = pa.make_zip(self.simple, "whole", "archive", self.arch, now=NOW)
        second = pa.make_zip(self.simple, "whole", "archive", self.arch, now=NOW)
        self.assertTrue(os.path.isfile(first["zip"]))
        self.assertTrue(second["zip"].endswith("_02.zip"))
        self.assertEqual(pa.plan(self.simple, "whole", self.arch, now=NOW)["zip"][-7:], "_03.zip")

    def test_make_zip_no_space(self):
        self.put(self.simple, "a.json", b"data")
        usage = shutil.disk_usage(self.arch)
        with mock.patch("shutil.disk_usage", return_value=type(usage)(100, 99, 1)):
            with self.assertRaises(ValueError) as cm:
                pa.make_zip(self.simple, "whole", "archive", self.arch, now=NOW)
        self.assertIn("Not enough free space", str(cm.exception))
        self.assertEqual(os.listdir(self.arch), [])

    def test_part_removed_on_error(self):
        self.put(self.simple, "a.json")
        with mock.patch("zipfile.ZipFile.write", side_effect=OSError("boom")):
            with self.assertRaises(OSError):
                pa.make_zip(self.simple, "whole", "archive", self.arch, now=NOW)
        self.assertEqual(os.listdir(self.arch), [])
        self.assertIsNone(pa.progress())

    def test_plan(self):
        self.put(self.simple, "a.json", b"1234")
        p = pa.plan(self.simple, "whole", self.arch, now=NOW)
        self.assertEqual(p["size"], 4)
        self.assertEqual(p["files"], 1)
        self.assertEqual(p["zip"], os.path.join(self.arch, "P_20261122-090507.zip"))
        self.assertGreater(p["free"], 0)

    def test_walk_skips_junctions(self):
        other = os.path.join(self.tmp, "Other")
        self.put(other, "secret.txt")
        link = os.path.join(self.simple, "Link")
        r = subprocess.run(["cmd", "/c", "mklink", "/J", link, other], capture_output=True) \
            if sys.platform == "win32" else None
        if r is None or r.returncode != 0:
            self.skipTest("junction not available")
        files, dirs, _ = pa.walk(self.simple)
        self.assertFalse(any("secret" in rel for _, rel in files))
        self.assertNotIn("Link", dirs)


class VerifyTest(ArchiveBase):
    def test_verify_detects_missing_file(self):
        self.put(self.simple, "a.json", b"abc")
        res = pa.make_zip(self.simple, "whole", "archive", self.arch, now=NOW)
        pa.verify(res["zip"], self.simple)  # intact
        self.put(self.simple, "new.json", b"more")
        with self.assertRaises(ValueError) as cm:
            pa.verify(res["zip"], self.simple)
        self.assertIn("The zip is incomplete", str(cm.exception))

    def test_verify_detects_changed_size_and_missing_dir(self):
        p = self.put(self.simple, "a.json", b"abc")
        res = pa.make_zip(self.simple, "whole", "archive", self.arch, now=NOW)
        with open(p, "wb") as f:
            f.write(b"abcdef")
        with self.assertRaises(ValueError):
            pa.verify(res["zip"], self.simple)
        with open(p, "wb") as f:
            f.write(b"abc")
        os.makedirs(os.path.join(self.simple, "EmptyNew"))
        with self.assertRaises(ValueError):
            pa.verify(res["zip"], self.simple)

    def test_verify_bad_zip(self):
        bad = os.path.join(self.arch, "bad.zip")
        with open(bad, "wb") as f:
            f.write(b"not a zip")
        with self.assertRaises(ValueError):
            pa.verify(bad, self.simple)


class BusyTest(ArchiveBase):
    def test_busy(self):
        self.assertTrue(pa._JOB.acquire(blocking=False))
        try:
            with self.assertRaises(pa.BusyError):
                pa.make_zip(self.simple, "whole", "archive", self.arch, now=NOW)
            with self.assertRaises(pa.BusyError):
                pa.verify(os.path.join(self.arch, "x.zip"), self.simple)
        finally:
            pa._JOB.release()
        self.assertEqual(os.listdir(self.arch), [])

    def test_job_nested_and_progress(self):
        self.assertIsNone(pa.progress())
        with pa.job("remove", 3, "x"):
            self.assertEqual(pa.progress()["step"], "remove")
            with pa.job("verify", 1, "y"):
                self.assertEqual(pa.progress()["step"], "verify")
            self.assertIsNotNone(pa.progress())
        self.assertIsNone(pa.progress())
        with pa.job("zip"):
            pass  # le verrou est bien relache


if __name__ == "__main__":
    unittest.main()
