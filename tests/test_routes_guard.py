"""
Revue securite du 24/10/2026 : chaque route qui modifie ou supprime des
fichiers verifie d'abord que le dossier recu est un vrai projet
(projects.require_project). Lecture du texte de __init__.py : pas besoin de
ComfyUI pour ce test.
"""

import os
import re
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
INIT = os.path.join(os.path.dirname(HERE), "__init__.py")

# Routes qui ecrivent, deplacent ou suppriment, et les champs a controler.
GUARDED = {
    "/mmproject/save": ["project"],
    "/mmproject/rename": ["path"],
    "/mmproject/move": ["path"],
    "/mmproject/save_workflow": ["project"],
    "/mmproject/archive_files": ["project"],
    "/mmproject/import_files": ["project"],
    "/mmproject/delete_duplicates": ["project"],
    "/mmproject/reset": ["project"],
    "/mmproject/copy_media": ["project"],
    "/mmproject/purge": ["project"],
    "/mmproject/sort_output": ["project"],
    "/mmproject/final_cut/sync": ["project"],
    "/mmproject/resolve_duplicate": ["project"],
    "/mmproject/delete_rush": ["project"],
    "/mmproject/config/save": ["project"],
    "/mmproject/config/restore": ["project"],
    "/mmproject/delete_archive": ["project"],
    "/mmproject/extract": ["project"],
    "/mmproject/extract/replace": ["project"],
}


def route_bodies():
    """{route: texte de son gestionnaire}, d'un decorateur @routes au suivant."""
    with open(INIT, encoding="utf-8") as f:
        text = f.read()
    parts = re.split(r'\n    @routes\.(?:get|post)\("([^"]+)"\)', text)
    return {parts[i]: parts[i + 1] for i in range(1, len(parts), 2)}


class RoutesGuardTest(unittest.TestCase):
    def test_every_writing_route_checks_the_project(self):
        bodies = route_bodies()
        for route, fields in GUARDED.items():
            self.assertIn(route, bodies, route)
            for field in fields:
                pattern = r'require_project\(body\.get\("%s"' % field
                self.assertRegex(bodies[route], pattern, "%s : %s non controle" % (route, field))

    def test_no_new_writing_route_forgotten(self):
        # Une nouvelle route POST doit etre classee ici : controlee, ou volontairement libre.
        free = {"/mmproject/create", "/mmproject/open", "/mmproject/save_plan", "/mmproject/run_done",
                "/mmproject/hashes", "/mmproject/config/check",
                # Export de SelectMod : seulement un .json nomme par le noeud, dans le dossier de
                # sauvegarde choisi, jamais par-dessus un fichier existant (select_mod.write_export).
                "/mmselectmod/save_export"}
        with open(INIT, encoding="utf-8") as f:
            posts = set(re.findall(r'@routes\.post\("([^"]+)"\)', f.read()))
        self.assertEqual(posts - free, set(GUARDED))

    def test_copy_source_checked(self):
        # Copy lit un projet ou un dossier de projets (MultiProject), jamais un dossier ordinaire (30/10/2026).
        self.assertRegex(route_bodies()["/mmproject/copy_media"], r'require_copy_source\(body\.get\("source"')

    def test_archive_files_keeps_run_files(self):
        # La cloche n'archive jamais un fichier de Run (26/10/2026).
        body = route_bodies()["/mmproject/archive_files"]
        self.assertIn("run_record.protected_files", body)
        self.assertLess(body.index("protected_files"), body.index("projects.archive_files"))
        self.assertIn('"kept"', body)


class ExtractRoutesTest(unittest.TestCase):
    def test_info_route_checks_the_project(self):
        body = route_bodies()["/mmproject/extract/info"]
        self.assertRegex(body, r'require_project\(')
        self.assertIn("extract_frame.listing", body)

    def test_runs_and_sort_output_apply_the_lock_change_rules(self):
        bodies = route_bodies()
        for route in ("/mmproject/runs", "/mmproject/sort_output"):
            self.assertIn("_extract_change", bodies[route], route)
            self.assertIn("extract_change", bodies[route], route)

    def test_helper_calls_check_lock_change_after_the_project_guard(self):
        with open(INIT, encoding="utf-8") as f:
            text = f.read()
        helper = text.split("def _extract_change(project):")[1].split("@routes.get")[0]
        self.assertLess(helper.index("require_project("), helper.index("check_lock_change("))
        self.assertIn("[MagicStudio Project]", helper)

    def test_sort_output_holds_the_extract_lock(self):
        body = route_bodies()["/mmproject/sort_output"]
        self.assertIn("extract_frame.lock_for(", body)
        self.assertLess(body.index("sort_output("), body.index("_extract_change("))

    def test_trash_function_follows_availability(self):
        with open(INIT, encoding="utf-8") as f:
            text = f.read()
        self.assertRegex(text, r"projects\._to_recycle_bin if projects\.TRASH_AVAILABLE else None")


    def test_selectmod_reads_only_server_roots(self):
        # SelectMod (29/10/2026) : racines lues par le serveur, chaque lecture controlee par select_mod.
        bodies = route_bodies()
        for route in ("/mmselectmod/tree", "/mmselectmod/files", "/mmselectmod/search",
                      "/mmselectmod/list_dirs", "/mmselectmod/list_files"):
            self.assertIn(route, bodies, route)
            self.assertIn("_selectmod_roots()", bodies[route], route)
            self.assertNotIn('get("roots"', bodies[route], route)
            self.assertIn("PermissionError", bodies[route], route)

class DisplayNamesTest(unittest.TestCase):
    def test_display_names_and_category(self):
        root = os.path.dirname(HERE)
        with open(INIT, encoding="utf-8") as f:
            init = f.read()
        with open(os.path.join(root, "nodes.py"), encoding="utf-8") as f:
            nodes = f.read()
        for name in ("MagicStudio RefLoader", "MagicStudio Project",
                     "MagicStudio Final Cut", "MagicStudio MedLoad", "MagicStudio SelectMod",
                     "MagicStudio Container", "MagicStudio SaveVoice"):
            self.assertIn('"%s"' % name, init)
        self.assertNotIn("loaders/minimax", nodes)
        self.assertEqual(nodes.count('CATEGORY = "MagicStudio"'), 7)
        # Plus de prefixe de message console a l'ancien nom.
        for folder, _dirs, files in os.walk(root):
            if any(x in folder for x in (".git", ".superpowers", "node_modules", "tests")):
                continue
            for fn in files:
                if fn.endswith((".py", ".js")):
                    with open(os.path.join(folder, fn), encoding="utf-8") as f:
                        text = f.read()
                    self.assertNotIn('"[MiniMax H3 ', text, fn)
                    self.assertNotIn('"[MiniMaxRefLoader]', text, fn)


if __name__ == "__main__":
    unittest.main()
