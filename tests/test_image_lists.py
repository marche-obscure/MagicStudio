"""Archives des listes d'images (image_lists.py) : dossiers temporaires seulement."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import image_lists as il  # noqa: E402

NOW = time.mktime((2026, 11, 5, 10, 15, 0, 0, 0, -1))


def make_junction(link, target):
    """Jonction (Windows) ou lien symbolique ; False si impossible."""
    try:
        os.symlink(target, link, target_is_directory=True)
        return True
    except (OSError, NotImplementedError):
        pass
    if os.name == "nt":
        r = subprocess.run(["cmd", "/c", "mklink", "/J", link, target], capture_output=True)
        return r.returncode == 0
    return False


class ImageListsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.project = os.path.join(self.tmp, "Yacht")
        os.makedirs(os.path.join(self.project, "08.Images"))
        self.images = []
        for n in range(3):
            p = os.path.join(self.project, "08.Images", "a%d.png" % n)
            open(p, "wb").write(b"x")
            self.images.append(p)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_save_name_and_content(self):
        r = il.save_list(self.project, "Yacht", self.images, now=NOW)
        self.assertEqual(r, {"file": "20261105-101500_Yacht.json", "name": "Yacht",
                             "stamp": "20261105-101500", "count": 3})
        path = os.path.join(self.project, "99.Project-Config", "Image-Lists", r["file"])
        data = json.load(open(path, encoding="utf-8"))
        self.assertEqual(data["format"], "MagicStudio Image List")
        self.assertEqual(data["date"], "2026-11-05 10:15:00")
        self.assertEqual(data["images"][0], "08.Images/a0.png")

    def test_same_second_goes_to_next(self):
        il.save_list(self.project, "Yacht", self.images, now=NOW)
        r = il.save_list(self.project, "Yacht", self.images, now=NOW)
        self.assertEqual(r["file"], "20261105-101501_Yacht.json")

    def test_clean_name(self):
        self.assertEqual(il.clean_name("a<b>:c"), "abc")
        self.assertEqual(il.clean_name("  "), "list")
        self.assertEqual(il.clean_name(""), "list")
        self.assertEqual(len(il.clean_name("x" * 100)), 60)
        self.assertEqual(il.save_list(self.project, "", self.images, now=NOW)["file"], "20261105-101500_list.json")

    def test_image_count_limits(self):
        with self.assertRaises(ValueError):
            il.save_list(self.project, "x", [], now=NOW)
        with self.assertRaises(ValueError):
            il.save_list(self.project, "x", ["a.png"] * 16, now=NOW)
        self.assertEqual(il.save_list(self.project, "x", ["a.png"] * 15, now=NOW)["count"], 15)

    def test_no_limit_on_archives(self):
        for n in range(20):
            il.save_list(self.project, "Yacht", self.images, now=NOW + n)
        self.assertEqual(len(il.list_lists(self.project)), 20)

    def test_list_absolute_missing_and_order(self):
        il.save_list(self.project, "old", self.images, now=NOW)
        outside = os.path.join(self.tmp, "out.png")
        open(outside, "wb").write(b"x")
        il.save_list(self.project, "new", self.images[:2] + [outside], now=NOW + 60)
        os.remove(self.images[1])
        lists = il.list_lists(self.project)
        self.assertEqual([e["name"] for e in lists], ["new", "old"])
        self.assertEqual(lists[0]["images"][0], os.path.normpath(self.images[0]))
        self.assertEqual(lists[0]["images"][2], os.path.normpath(outside))
        self.assertEqual(lists[0]["missing"], [os.path.normpath(self.images[1])])
        self.assertEqual(lists[0]["count"], 3)
        self.assertEqual(lists[0]["date"], "2026-11-05 10:16:00")

    def test_unreadable_json_ignored(self):
        il.save_list(self.project, "ok", self.images, now=NOW)
        open(os.path.join(il.lists_dir(self.project), "20261105-101600_bad.json"), "w").write("{nope")
        self.assertEqual([e["name"] for e in il.list_lists(self.project)], ["ok"])

    def test_empty_when_no_folder(self):
        self.assertEqual(il.list_lists(self.project), [])

    def test_delete_two_of_three(self):
        files = [il.save_list(self.project, "n%d" % i, self.images, now=NOW + i)["file"] for i in range(3)]
        self.assertEqual(il.delete_lists(self.project, files[:2])["deleted"], files[:2])
        self.assertEqual([e["file"] for e in il.list_lists(self.project)], [files[2]])

    def test_outside_image_lists(self):
        victim = os.path.join(self.tmp, "x.json")
        open(victim, "w").write("{}")
        il.save_list(self.project, "a", self.images, now=NOW)
        keep = os.path.join(self.project, "99.Project-Config", "keep.json")
        open(keep, "w").write("{}")
        for bad in ("../x.json", "..\\x.json", "C:/x.json", "a.txt", "keep.json", "", "..",
                    "20261105-101500_a.txt"):
            with self.assertRaises(ValueError, msg=bad):
                il.delete_lists(self.project, [bad])
        self.assertTrue(os.path.exists(victim))
        self.assertTrue(os.path.exists(keep))
        self.assertEqual(len(il.list_lists(self.project)), 1)

    def test_junction_out_refused(self):
        os.makedirs(os.path.join(self.project, "99.Project-Config"))
        elsewhere = os.path.join(self.tmp, "elsewhere")
        os.makedirs(elsewhere)
        victim = os.path.join(elsewhere, "20261105-101500_v.json")
        open(victim, "w").write("{}")
        if not make_junction(il.lists_dir(self.project), elsewhere):
            self.skipTest("no junction / symlink available")
        with self.assertRaises(ValueError):
            il.delete_lists(self.project, ["20261105-101500_v.json"])
        with self.assertRaises(ValueError):
            il.save_list(self.project, "a", self.images, now=NOW)
        with self.assertRaises(ValueError):
            il.list_lists(self.project)
        self.assertTrue(os.path.exists(victim))
        self.assertEqual(os.listdir(elsewhere), ["20261105-101500_v.json"])


if __name__ == "__main__":
    unittest.main()
