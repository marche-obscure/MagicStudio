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
    "/mmproject/copy_media": ["project", "source"],
    "/mmproject/purge": ["project"],
    "/mmproject/sort_output": ["project"],
    "/mmproject/final_cut/sync": ["project"],
    "/mmproject/resolve_duplicate": ["project"],
    "/mmproject/delete_rush": ["project"],
    "/mmproject/config/save": ["project"],
    "/mmproject/config/restore": ["project"],
    "/mmproject/delete_archive": ["project"],
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
                "/mmproject/hashes", "/mmproject/config/check"}
        with open(INIT, encoding="utf-8") as f:
            posts = set(re.findall(r'@routes\.post\("([^"]+)"\)', f.read()))
        self.assertEqual(posts - free, set(GUARDED))


if __name__ == "__main__":
    unittest.main()
