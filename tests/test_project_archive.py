import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
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

    def test_plan_without_folder(self):
        self.put(self.simple, "a.json", b"1234")
        p = pa.plan(self.simple, "whole", "", now=NOW)
        self.assertIsNone(p["zip"])
        self.assertEqual(p["folder"], "")
        self.assertEqual((p["size"], p["files"]), (4, 1))

    def test_zip_in_folder(self):
        good = self.put(self.arch, "a.zip")
        self.assertEqual(pa.zip_in_folder(good, self.arch), os.path.realpath(good))
        for bad in (os.path.join(self.arch, "..", "x.zip"),
                    self.put(self.arch, "a.txt"),
                    self.put(self.tmp, "out.zip"),
                    self.put(self.arch, "sub/b.zip"),
                    ""):
            with self.assertRaisesRegex(ValueError, "must be in the archives folder"):
                pa.zip_in_folder(bad, self.arch)
        with self.assertRaisesRegex(ValueError, "Choose the archives folder first"):
            pa.zip_in_folder(good, "")

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


class UnreadableTest(ArchiveBase):
    def test_walk_raises_on_unlistable_dir(self):
        self.put(self.simple, "12.Video/a.mp4")
        bad = os.path.join(self.simple, "12.Video")
        real = os.scandir

        def scandir(path="."):
            if os.path.normcase(os.fspath(path)) == os.path.normcase(bad):
                raise PermissionError("denied")
            return real(path)

        with mock.patch("os.scandir", scandir):
            with self.assertRaises(OSError):
                pa.walk(self.simple)
            with self.assertRaises(OSError):
                pa.make_zip(self.simple, "whole", "archive", self.arch, now=NOW)
        self.assertEqual(os.listdir(self.arch), [])

    def test_walk_raises_on_unreadable_file(self):
        target = self.put(self.simple, "a.json")
        real = os.lstat

        def lstat(path, *a, **k):
            if os.path.normcase(os.fspath(path)) == os.path.normcase(target):
                raise PermissionError("denied")
            return real(path, *a, **k)

        with mock.patch("os.lstat", lstat):
            with self.assertRaises(OSError):
                pa.walk(self.simple)


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


def fake_trash(log=None):
    def fn(paths):
        for p in paths:
            if log is not None:
                log.append(p)
            shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    return fn


class RemoveTest(ArchiveBase):
    def setUp(self):
        super().setUp()
        self.put(self.simple, "40.Rush Videos/a.mp4", b"video")
        self.put(self.sub, "08.Images/b.png", b"img")
        self.input = os.path.join(self.tmp, "input")
        os.makedirs(self.input)

    def make_link(self, name, target):
        link = os.path.join(self.input, "Final-Cut_" + name)
        if sys.platform == "win32":
            r = subprocess.run(["cmd", "/c", "mklink", "/J", link, target], capture_output=True)
            if r.returncode != 0:
                self.skipTest("junction not available")
        else:
            os.symlink(target, link)
        return link

    def test_archive_trash_removes_project_and_link(self):
        link = self.make_link("P", self.simple)
        log = []
        res = pa.archive(self.simple, "whole", "trash", self.arch, self.input, fake_trash(log),
                         now=NOW, fits_fn=lambda f, s: True)
        self.assertTrue(res["removed"])
        self.assertFalse(os.path.exists(self.simple))
        self.assertFalse(os.path.lexists(link))
        self.assertEqual(log, [self.simple])
        listed = pa.list_archives(self.arch)
        self.assertEqual([a["name"] for a in listed], ["P"])
        self.assertEqual(listed[0]["kind"], "project")

    def test_archive_refuses_when_bin_too_small(self):
        called = []
        with self.assertRaises(ValueError) as cm:
            pa.archive(self.simple, "whole", "trash", self.arch, self.input, fake_trash(called),
                       now=NOW, fits_fn=lambda f, s: False)
        self.assertIn("Recycle Bin cannot hold", str(cm.exception))
        self.assertTrue(os.path.isdir(self.simple))
        self.assertEqual(called, [])
        self.assertEqual(len(pa.list_archives(self.arch)), 1)

    def test_fits_gets_folder_and_size(self):
        seen = []
        pa.remove_target(pa.target_of(self.simple, "whole"), "trash", self.input, fake_trash(),
                         lambda f, s: seen.append((f, s)) or True)
        self.assertEqual(seen, [(self.simple, 5)])

    def test_unknown_bin_refuses(self):
        called = []
        with self.assertRaises(ValueError) as cm:
            pa.archive(self.simple, "whole", "trash", self.arch, self.input, fake_trash(called),
                       now=NOW, fits_fn=lambda f, s: None)
        self.assertIn("does not tell", str(cm.exception))
        self.assertTrue(os.path.isdir(self.simple))
        self.assertEqual(called, [])
        self.assertEqual(len(pa.list_archives(self.arch)), 1)

    def test_remove_link_failure_keeps_zip_message(self):
        self.make_link("P", self.simple)
        with mock.patch("final_cut.remove_link", side_effect=OSError("busy")):
            with self.assertRaises(ValueError) as cm:
                pa.archive(self.simple, "whole", "permanent", self.arch, self.input,
                           fake_trash(), now=NOW)
        self.assertIn("verified zip is kept", str(cm.exception))
        self.assertTrue(os.path.isdir(self.simple))

    def test_fits_failure_keeps_zip_message(self):
        def boom(f, s):
            raise OSError("walk")
        with self.assertRaises(ValueError) as cm:
            pa.archive(self.simple, "whole", "trash", self.arch, self.input, fake_trash(),
                       now=NOW, fits_fn=boom)
        self.assertIn("verified zip is kept", str(cm.exception))

    def test_archive_trash_failure_keeps_everything(self):
        def boom(paths):
            raise OSError("denied")
        with self.assertRaises(ValueError):
            pa.archive(self.simple, "whole", "trash", self.arch, self.input, boom, now=NOW,
                       fits_fn=lambda f, s: True)
        self.assertTrue(os.path.isdir(self.simple))
        self.assertEqual(len(pa.list_archives(self.arch)), 1)

    def test_archive_permanent(self):
        called = []
        ro = self.put(self.simple, "08.Images/ro.png")
        os.chmod(ro, 0o444)
        res = pa.archive(self.simple, "whole", "permanent", self.arch, self.input,
                         fake_trash(called), now=NOW)
        self.assertTrue(res["removed"])
        self.assertFalse(os.path.exists(self.simple))
        self.assertEqual(called, [])

    def test_archive_sub_keeps_mother(self):
        res = pa.archive(self.sub, "sub", "permanent", self.arch, self.input, fake_trash(), now=NOW)
        self.assertTrue(res["removed"])
        self.assertFalse(os.path.exists(self.sub))
        self.assertTrue(os.path.isdir(self.group))
        self.assertTrue(os.path.exists(os.path.join(self.group, ".mmproject-group")))

    def test_sub_does_not_touch_link(self):
        link = self.make_link(os.path.basename(self.group), self.group)
        pa.archive(self.sub, "sub", "permanent", self.arch, self.input, fake_trash(), now=NOW)
        self.assertTrue(os.path.lexists(link))

    def test_whole_of_sub_removes_mother_and_its_link(self):
        link = self.make_link(os.path.basename(self.group), self.group)
        pa.archive(self.sub, "whole", "permanent", self.arch, self.input, fake_trash(), now=NOW)
        self.assertFalse(os.path.exists(self.group))
        self.assertFalse(os.path.lexists(link))

    def test_real_folder_of_same_name_not_removed(self):
        real = os.path.join(self.input, "Final-Cut_P")
        os.makedirs(real)
        pa.archive(self.simple, "whole", "permanent", self.arch, self.input, fake_trash(), now=NOW)
        self.assertTrue(os.path.isdir(real))

    def test_verify_failure_removes_zip(self):
        with mock.patch.object(pa, "verify", side_effect=ValueError("The zip is incomplete")):
            with self.assertRaises(ValueError):
                pa.archive(self.simple, "whole", "permanent", self.arch, self.input,
                           fake_trash(), now=NOW)
        self.assertTrue(os.path.isdir(self.simple))
        self.assertEqual(os.listdir(self.arch), [])

    def test_removal_failure_keeps_verified_zip(self):
        with mock.patch.object(pa.shutil, "rmtree", side_effect=OSError("locked")):
            with self.assertRaises(ValueError) as cm:
                pa.archive(self.simple, "whole", "permanent", self.arch, self.input,
                           fake_trash(), now=NOW)
        self.assertIn("verified zip is kept", str(cm.exception))
        self.assertTrue(os.path.isdir(self.simple))
        self.assertEqual(len(pa.list_archives(self.arch)), 1)

    def test_archive_reports_remove_step_and_holds_job(self):
        steps, busy = [], []
        real = pa.remove_target

        def spy(*a, **k):
            steps.append(pa.progress()["step"])
            th = threading.Thread(target=lambda: self._try(busy))
            th.start()
            th.join()
            return real(*a, **k)
        with mock.patch.object(pa, "remove_target", side_effect=spy):
            pa.archive(self.simple, "whole", "permanent", self.arch, self.input, fake_trash(),
                       now=NOW)
        self.assertEqual(steps, ["remove"])
        self.assertEqual(len(busy), 1)  # autre fil : verrou pris pendant la suppression

    def _try(self, out):
        try:
            with pa.job("zip"):
                pass
        except pa.BusyError as e:
            out.append(e)


class ListTest(ArchiveBase):
    def test_list_ignores_foreign_zips_and_cleans_part(self):
        self.put(self.simple, "a.txt")
        pa.make_zip(self.simple, "whole", "archive", self.arch, now=NOW)
        pa.make_zip(self.sub, "sub", "backup", self.arch, now=datetime(2026, 11, 23, 8, 0, 0))
        with zipfile.ZipFile(os.path.join(self.arch, "plain.zip"), "w") as zf:
            zf.writestr("x.txt", "x")
        old = os.path.join(self.arch, "old.zip.part")
        new = os.path.join(self.arch, "new.zip.part")
        for p in (old, new):
            open(p, "wb").close()
        t = datetime.now().timestamp() - 7200
        os.utime(old, (t, t))
        listed = pa.list_archives(self.arch)
        self.assertEqual([a["name"] for a in listed], ["01-A", "P"])  # le plus recent d'abord
        self.assertEqual(listed[0]["kind"], "sub")
        self.assertEqual(listed[0]["group"], "G")
        self.assertEqual(listed[0]["mode"], "backup")
        self.assertEqual(listed[1]["files"], 1)
        self.assertEqual(listed[1]["size"], os.path.getsize(listed[1]["zip"]))
        self.assertEqual(listed[1]["file"], os.path.basename(listed[1]["zip"]))
        self.assertFalse(os.path.exists(old))
        self.assertTrue(os.path.exists(new))

    def test_list_missing_folder(self):
        self.assertEqual(pa.list_archives(os.path.join(self.tmp, "nope")), [])


class TrashFitsTest(unittest.TestCase):
    @unittest.skipIf(sys.platform == "win32", "off Windows only")
    def test_unknown_off_windows(self):
        self.assertIsNone(pa.trash_fits(tempfile.gettempdir(), 10))

    @unittest.skipUnless(sys.platform == "win32", "Windows only")
    def test_settings_rules(self):
        path = tempfile.gettempdir()
        MB = 1024 * 1024
        with mock.patch.object(pa, "_bin_settings", return_value=(True, 100 * MB, 0)):
            self.assertFalse(pa.trash_fits(path, 1))
        with mock.patch.object(pa, "_bin_settings", return_value=(False, 100 * MB, 90 * MB)):
            self.assertFalse(pa.trash_fits(path, 20 * MB))
            self.assertTrue(pa.trash_fits(path, 10 * MB))
        with mock.patch.object(pa, "_bin_settings", return_value=None):
            self.assertIsNone(pa.trash_fits(path, 1))


if __name__ == "__main__":
    unittest.main()


class RestoreTest(ArchiveBase):
    def setUp(self):
        super().setUp()
        self.input = os.path.join(self.tmp, "input")
        os.makedirs(self.input)

    def zap(self, project, scope):
        res = pa.archive(project, scope, "permanent", self.arch, self.input, lambda p: None, now=NOW)
        return res["zip"]

    def test_restore_whole_round_trip(self):
        sub2 = projects.create_project(self.root, "B", group="G")
        self.put(self.sub, "08.Images/a.png", b"aaa")
        self.put(sub2, "12.Video/b.mp4", b"bbbb")
        self.put(self.group, "Final-Cut_G/Video/_00_v.mp4", b"cc")
        os.makedirs(os.path.join(self.sub, "empty dir"))
        before = pa.walk(self.group)
        z = self.zap(self.sub, "whole")
        self.assertFalse(os.path.exists(self.group))
        res = pa.restore(z, self.root)
        self.assertEqual(res["dest"], self.group)
        after = pa.walk(self.group)
        self.assertEqual(sorted((r, os.path.getsize(p)) for p, r in before[0]),
                         sorted((r, os.path.getsize(p)) for p, r in after[0]))
        self.assertEqual(sorted(before[1]), sorted(after[1]))
        self.assertTrue(projects.is_group(self.group))
        self.assertTrue(os.path.exists(z))
        self.assertFalse(os.path.exists(self.group + ".part"))
        self.assertEqual(res["files"], len(after[0]))

    def test_restore_name_taken(self):
        self.put(self.simple, "08.Images/a.png")
        z = self.zap(self.simple, "whole")
        os.makedirs(self.simple)
        self.assertEqual(pa.restore_target(z, self.root)["needs"], "name")
        with self.assertRaises(ValueError):
            pa.restore(z, self.root)
        res = pa.restore(z, self.root, name="P2")
        self.assertEqual(res["dest"], os.path.join(self.root, "P2"))
        self.assertTrue(os.path.isfile(os.path.join(self.root, "P2", "08.Images", "a.png")))
        self.assertEqual(pa.restore_target(z, self.root, name="P2")["needs"], "name")
        with self.assertRaises(ValueError):
            pa.restore(z, self.root, name="a/b")

    def test_restore_sub_into_mother_keeps_number(self):
        sub = projects.create_project(self.root, "B", group="G")
        base = os.path.basename(sub)
        self.assertRegex(base, r"^\d\d-B$")
        self.put(sub, "08.Images/a.png", b"z")
        z = self.zap(sub, "sub")
        t = pa.restore_target(z, self.root)
        self.assertEqual((t["dest"], t["needs"]), (os.path.join(self.group, base), None))
        pa.restore(z, self.root)
        self.assertTrue(os.path.isfile(os.path.join(self.group, base, "08.Images", "a.png")))
        shutil.rmtree(os.path.join(self.group, base))
        number = base.split("-")[0]
        res = pa.restore(z, self.root, name="Other")
        self.assertEqual(res["dest"], os.path.join(self.group, number + "-Other"))
        self.assertTrue(os.path.isdir(res["dest"]))

    def test_restore_sub_without_mother(self):
        sub = projects.create_project(self.root, "B", group="G")
        base = os.path.basename(sub)
        z = self.zap(sub, "sub")
        shutil.rmtree(self.group)
        self.assertEqual(pa.restore_target(z, self.root)["needs"], "independent")
        with self.assertRaises(ValueError):
            pa.restore(z, self.root)
        res = pa.restore(z, self.root, independent=True)
        self.assertEqual(res["dest"], os.path.join(self.root, base))
        self.assertTrue(os.path.isdir(os.path.join(self.root, base, "08.Images")))

    def hand_zip(self, members, manifest=None):
        manifest = manifest or {"format": pa.FORMAT, "version": 1, "kind": "project", "name": "P",
                                "group": None, "number": None}
        z = os.path.join(self.arch, "hand.zip")
        with zipfile.ZipFile(z, "w") as zf:
            zf.writestr(pa.MANIFEST, json.dumps(manifest))
            for m in members:
                zf.writestr(m, b"evil")
        return z

    def test_restore_refuses_unsafe_paths(self):
        dest_root = os.path.join(self.tmp, "R2")
        os.makedirs(dest_root)
        for bad in ("P/../../evil.txt", "/abs/evil.txt", "C:/evil.txt", "Other/evil.txt", "P/../evil.txt"):
            z = self.hand_zip(["P/ok.txt", bad])
            with self.assertRaises(ValueError, msg=bad) as cm:
                pa.restore(z, dest_root)
            self.assertIn("Unsafe path in the archive", str(cm.exception))
            self.assertEqual(os.listdir(dest_root), [])
            self.assertFalse(os.path.exists(os.path.join(self.tmp, "evil.txt")))

    def test_restore_refuses_foreign_zip(self):
        z = os.path.join(self.arch, "foreign.zip")
        with zipfile.ZipFile(z, "w") as zf:
            zf.writestr("a.txt", b"x")
        with self.assertRaises(ValueError) as cm:
            pa.restore(z, self.root)
        self.assertEqual(str(cm.exception), "Not a MagicStudio archive.")
        z2 = self.hand_zip([], {"format": "other"})
        with self.assertRaises(ValueError):
            pa.read_manifest(z2)

    def test_restore_removes_stale_part_and_cleans_on_error(self):
        self.put(self.simple, "08.Images/a.png")
        z = self.zap(self.simple, "whole")
        stale = self.simple + ".part"
        os.makedirs(stale)
        self.put(stale, "junk.txt")
        self.put(stale, pa.PART_MARK, b"x")
        pa.restore(z, self.root)
        self.assertFalse(os.path.exists(stale))
        shutil.rmtree(self.simple)
        with mock.patch.object(projects, "ensure_project", side_effect=OSError("boom")):
            with self.assertRaises(OSError):
                pa.restore(z, self.root)
        self.assertFalse(os.path.exists(stale))
        self.assertFalse(os.path.exists(self.simple))

    def test_restore_reports_progress_and_holds_job(self):
        self.put(self.simple, "08.Images/a.png")
        z = self.zap(self.simple, "whole")
        seen = []
        real = pa._report

        def spy(*a):
            seen.append(a[0])
            real(*a)
        with mock.patch.object(pa, "_report", spy):
            pa.restore(z, self.root)
        self.assertIn("restore", seen)
        self.assertIsNone(pa.progress())

    def test_restore_never_deletes_real_folder_named_part(self):
        self.put(self.simple, "08.Images/a.png")
        z = self.zap(self.simple, "whole")
        real = projects.create_project(self.root, "P.part")
        keep = self.put(real, "08.Images/mine.png", b"precious")
        with self.assertRaises(ValueError):
            pa.restore(z, self.root)
        with open(keep, "rb") as fh:
            self.assertEqual(fh.read(), b"precious")
        self.assertFalse(os.path.exists(self.simple))

    def test_restore_sub_other_name_same_number_needs_independent(self):
        sub = projects.create_project(self.root, "B", group="G")
        base = os.path.basename(sub)
        z = pa.make_zip(sub, "sub", "backup", self.arch, now=NOW)["zip"]
        t = pa.restore_target(z, self.root, name="Other")
        self.assertEqual(t["needs"], "independent")
        with self.assertRaises(ValueError):
            pa.restore(z, self.root, name="Other")
        res = pa.restore(z, self.root, name="Other", independent=True)
        self.assertEqual(res["dest"], os.path.join(self.root, base.split("-")[0] + "-Other"))
        self.assertTrue(os.path.isdir(res["dest"]))
        self.assertEqual(pa.restore_target(z, self.root)["needs"], "name")
