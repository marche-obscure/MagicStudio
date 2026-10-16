"""
Logique des dossiers de projet du noeud MiniMaxH3Project (sans import
ComfyUI, testable seule) : un projet = un dossier de la racine des
projets, avec toujours les memes sous-dossiers.
"""

import os
import json

# Sous-dossiers de chaque projet (meme liste que web/js/project_paths.js).
SUBFOLDERS = ("Workflows", "Prompt", "Images", "Son", "Rush Videos", "Rush Images")

# Nom du dossier racine par defaut, cree dans le dossier input de ComfyUI.
DEFAULT_ROOT_NAME = "Projets"

MAX_NAME_LENGTH = 100
_INVALID_CHARS = set('<>:"/\\|?*')
# Noms reserves de Windows (avec ou sans extension).
_RESERVED = {"CON", "PRN", "AUX", "NUL"} | {"COM%d" % i for i in range(1, 10)} | {"LPT%d" % i for i in range(1, 10)}


def validate_name(name):
    """
    Nom de projet sans espaces autour ; ValueError (message en anglais,
    affiche dans le noeud) si Windows ne l'accepte pas comme nom de dossier.
    Regles identiques a projectNameError() de web/js/project_paths.js.
    """
    name = (name or "").strip()
    if not name:
        raise ValueError("The project name is empty.")
    if len(name) > MAX_NAME_LENGTH:
        raise ValueError("The project name is too long (%d characters max)." % MAX_NAME_LENGTH)
    for ch in name:
        if ch in _INVALID_CHARS or ord(ch) < 32:
            raise ValueError('The project name cannot contain < > : " / \\ | ? * or control characters.')
    if name.endswith("."):
        raise ValueError("The project name cannot end with a dot.")
    if name.split(".")[0].upper() in _RESERVED:
        raise ValueError('"%s" is a name reserved by Windows.' % name)
    return name


def list_projects(root):
    """Dossiers de projet de la racine (sans fichiers ni dossiers caches), tries sans casse."""
    if not root or not os.path.isdir(root):
        raise FileNotFoundError("Projects folder not found: %s" % root)
    names = [e.name for e in os.scandir(root) if e.is_dir() and not e.name.startswith(".")]
    return sorted(names, key=lambda n: (n.lower(), n))


def ensure_project(path):
    """Recree les sous-dossiers manquants du projet ; renvoie leurs noms."""
    if not path or not os.path.isdir(path):
        raise FileNotFoundError("Project folder not found: %s" % path)
    created = []
    for sub in SUBFOLDERS:
        full = os.path.join(path, sub)
        if not os.path.isdir(full):
            os.makedirs(full, exist_ok=True)
            created.append(sub)
    return created


def create_project(root, name):
    """Cree le dossier du projet et ses sous-dossiers ; renvoie son chemin."""
    name = validate_name(name)
    if not root or not os.path.isdir(root):
        raise FileNotFoundError("Projects folder not found: %s" % root)
    # Comparaison sans casse : sous Windows, "Clip" et "clip" sont le meme dossier.
    if any(n.lower() == name.lower() for n in os.listdir(root)):
        raise FileExistsError('A project or file named "%s" already exists.' % name)
    path = os.path.join(root, name)
    os.makedirs(path)
    ensure_project(path)
    return path


def open_project(root, name):
    """Chemin d'un projet existant, sous-dossiers manquants recrees."""
    path = os.path.join(root, validate_name(name))
    if not os.path.isdir(path):
        raise FileNotFoundError('Project "%s" not found in %s' % (name, root))
    ensure_project(path)
    return path


def parse_state(raw):
    """Etat du noeud (JSON) : racine ("" = racine par defaut) et nom du projet."""
    try:
        data = json.loads(raw or "{}")
    except (TypeError, ValueError):
        data = None
    if not isinstance(data, dict):
        data = {}
    root = data.get("root")
    name = data.get("name")
    return {
        "root": root if isinstance(root, str) else "",
        "name": name if isinstance(name, str) else "",
    }


def project_path(state, default_root):
    """Chemin du projet de l'etat ("" si aucun projet choisi)."""
    if not state["name"]:
        return ""
    return os.path.join(state["root"] or default_root, state["name"])
