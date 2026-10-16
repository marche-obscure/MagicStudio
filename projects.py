"""
Logique des dossiers de projet du noeud MiniMaxH3Project (sans import
ComfyUI, testable seule) : un projet = un dossier de la racine des
projets (le Root folder du MiniMax H3 Reference Loader branche, sinon
<input de ComfyUI>/Projets), avec toujours les memes sous-dossiers.
"""

import os
import shutil
import filecmp
import re
import time

# Sous-dossiers de chaque projet (meme liste que web/js/project_paths.js).
SUBFOLDERS = ("00.Workflows", "02.Models", "04.Prompt", "06.LoRA", "08.Images", "10.Son",
              "12.Video", "14.Video-Audio", "40.Rush Videos", "60.Rush Images")

# Dossier des configurations JSON du Ref Loader enregistrees par Save.
CONFIG_FOLDER = "00.Workflows"

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


def create_project(root, name, create_root=False):
    """
    Cree le dossier du projet et ses sous-dossiers ; renvoie son chemin.
    create_root : cree aussi la racine si elle n'existe pas (l'utilisateur
    l'a accepte dans la fenetre de creation).
    """
    name = validate_name(name)
    if root and create_root and not os.path.isdir(root):
        os.makedirs(root, exist_ok=True)
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


# ----------------------------------------------------------------------
# Save : copie des fichiers du Ref Loader dans les dossiers du projet
# ----------------------------------------------------------------------
def _norm(path):
    return os.path.normcase(os.path.abspath(path))


def _same_content(a, b):
    try:
        return filecmp.cmp(a, b, shallow=False)
    except OSError:
        return False


def plan_save(project, items):
    """
    Plan de copie, sans rien ecrire. items = [{path, folder}] (folder = un
    sous-dossier du projet). Pour chaque element, dans l'ordre :
    {src, folder, dst, action} avec action =
      - "copy"    : copie vers dst (nom libre, "nom (2).ext" si le nom est pris
                    par un autre fichier) ;
      - "skip"    : deja dans le projet (fichier lui-meme dans le dossier, ou
                    copie identique de meme nom), dst = ce fichier ;
      - "missing" : fichier source introuvable, dst = "".
    """
    if not project or not os.path.isdir(project):
        raise FileNotFoundError("Project folder not found: %s" % project)
    plan = []
    taken = {}      # destinations deja prises par ce plan -> source
    done = {}       # (source, dossier) deja traites -> destination
    for item in items:
        src = item.get("path") or ""
        folder = item.get("folder") or ""
        if folder not in SUBFOLDERS:
            raise ValueError("Unknown project folder: %s" % folder)
        entry = {"src": src, "folder": folder, "dst": "", "action": "missing"}
        plan.append(entry)
        if not os.path.isfile(src):
            continue
        key = (_norm(src), folder)
        if key in done:
            entry.update(dst=done[key], action="skip")
            continue
        target_dir = os.path.join(project, folder)
        if _norm(os.path.dirname(src)) == _norm(target_dir):
            entry.update(dst=src, action="skip")
            done[key] = src
            continue
        stem, ext = os.path.splitext(os.path.basename(src))
        n = 1
        while True:
            name = stem + ext if n == 1 else "%s (%d)%s" % (stem, n, ext)
            dst = os.path.join(target_dir, name)
            if _norm(dst) in taken:
                n += 1
                continue
            if os.path.exists(dst):
                if _same_content(src, dst):
                    entry.update(dst=dst, action="skip")
                    break
                n += 1
                continue
            entry.update(dst=dst, action="copy")
            break
        taken[_norm(entry["dst"])] = src
        done[key] = entry["dst"]
    return plan


def execute_save(project, items):
    """
    Applique plan_save ; renvoie le fichier du projet de chaque element, dans
    l'ordre des items ("" si manquant). Par position : un meme fichier peut
    aller dans deux dossiers (12.Video et 14.Video-Audio).
    """
    dsts = []
    for entry in plan_save(project, items):
        if entry["action"] == "copy":
            os.makedirs(os.path.dirname(entry["dst"]), exist_ok=True)
            shutil.copy2(entry["src"], entry["dst"])
        dsts.append(entry["dst"])
    return dsts


def write_config(project, filename, content):
    """Ecrit une configuration JSON du Ref Loader dans 00.Workflows ; renvoie son chemin."""
    if not filename or os.path.basename(filename) != filename or not filename.lower().endswith(".json"):
        raise ValueError("Invalid configuration file name: %s" % filename)
    folder = os.path.join(project, CONFIG_FOLDER)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, filename)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    return path


# ----------------------------------------------------------------------
# Renommer / deplacer un projet
# ----------------------------------------------------------------------
def rename_project(path, new_name):
    """Renomme le dossier du projet ; renvoie le nouveau chemin."""
    if not path or not os.path.isdir(path):
        raise FileNotFoundError("Project folder not found: %s" % path)
    new_name = validate_name(new_name)
    parent = os.path.dirname(os.path.abspath(path))
    if new_name == os.path.basename(os.path.abspath(path)):
        raise ValueError("The new name is the current name.")
    # Sous Windows, changer seulement la casse vise le meme dossier : autorise.
    others = [n for n in os.listdir(parent) if n.lower() == new_name.lower()
              and n != os.path.basename(os.path.abspath(path))]
    if others:
        raise FileExistsError('A project or file named "%s" already exists.' % new_name)
    new_path = os.path.join(parent, new_name)
    os.rename(path, new_path)
    return new_path


def move_project(path, dest_parent):
    """Deplace le dossier du projet dans dest_parent (cree si besoin) ; renvoie le nouveau chemin."""
    if not path or not os.path.isdir(path):
        raise FileNotFoundError("Project folder not found: %s" % path)
    dest_parent = (dest_parent or "").strip()
    if not dest_parent:
        raise ValueError("Choose the destination folder.")
    src = _norm(path)
    dst_parent = _norm(dest_parent)
    if dst_parent == _norm(os.path.dirname(os.path.abspath(path))):
        raise ValueError("The project is already in this folder.")
    if dst_parent == src or dst_parent.startswith(src + os.sep):
        raise ValueError("A project cannot be moved into itself.")
    new_path = os.path.join(dest_parent, os.path.basename(os.path.abspath(path)))
    if os.path.exists(new_path):
        raise FileExistsError("This folder already exists: %s" % new_path)
    os.makedirs(dest_parent, exist_ok=True)
    shutil.move(path, new_path)
    return new_path


# ----------------------------------------------------------------------
# Workflow du projet (00.Workflows) et ses archives
# ----------------------------------------------------------------------
# Archive : yyyyMMdd-HHmmss_<nom du workflow>.json ; configuration du Ref
# Loader : yyyyMMdd-HHmmss_REF2VA|FL2VA_minimax_config.json (pas un workflow).
_STAMPED = re.compile(r"^(\d{8}-\d{6})_(.+)$")
_CONFIG = re.compile(r"^\d{8}-\d{6}_(REF2VA|FL2VA)_minimax_config\.json$", re.IGNORECASE)
# Archives de workflow gardees par projet (choix utilisateur : 5 au plus).
MAX_ARCHIVES = 5


def workflow_file_name(name):
    """Nom de fichier d'un workflow (".json" ajoute) ; ValueError si invalide."""
    name = (name or "").strip()
    if name.lower().endswith(".json"):
        name = name[:-5].strip()
    stem = validate_name(name).replace("The project name", "The workflow name")
    if _STAMPED.match(stem + ".json"):
        raise ValueError("A workflow name cannot start with a date (yyyyMMdd-HHmmss_): it is kept for the archives.")
    return stem + ".json"


def _workflow_dir(project):
    if not project or not os.path.isdir(project):
        raise FileNotFoundError("Project folder not found: %s" % project)
    return os.path.join(project, CONFIG_FOLDER)


def _safe_file(folder, name):
    if not name or os.path.basename(name) != name:
        raise ValueError("Invalid file name: %s" % name)
    return os.path.join(folder, name)


def list_workflows(project):
    """
    {"workflows": [{name, mtime}] (plus recent d'abord),
     "archives": [{name, mtime, stamp, of}] (plus recente d'abord)}.
    Les configurations du Ref Loader ne sont pas listees.
    """
    folder = _workflow_dir(project)
    workflows, archives = [], []
    if os.path.isdir(folder):
        for e in os.scandir(folder):
            if not e.is_file() or not e.name.lower().endswith(".json") or _CONFIG.match(e.name):
                continue
            mtime = e.stat().st_mtime
            m = _STAMPED.match(e.name)
            if m:
                archives.append({"name": e.name, "mtime": mtime, "stamp": m.group(1), "of": m.group(2)})
            else:
                workflows.append({"name": e.name, "mtime": mtime})
    workflows.sort(key=lambda w: -w["mtime"])
    archives.sort(key=lambda a: a["name"], reverse=True)
    return {"workflows": workflows, "archives": archives}


def read_workflow(project, name):
    """Texte d'un workflow (ou d'une archive) de 00.Workflows."""
    path = _safe_file(_workflow_dir(project), name)
    if not os.path.isfile(path):
        raise FileNotFoundError("Workflow not found: %s" % name)
    with open(path, encoding="utf-8") as f:
        return f.read()


def save_workflow(project, name, content, archive=None):
    """
    Ecrit le workflow 'name' dans 00.Workflows. archive = nom du workflow
    precedent a archiver d'abord : renomme yyyyMMdd-HHmmss_<nom>.json avec
    la date de sa derniere sauvegarde ("nom (2)" si cette archive existe).
    Renvoie {name, mtime, archived}.
    """
    folder = _workflow_dir(project)
    os.makedirs(folder, exist_ok=True)
    name = workflow_file_name(name)
    archived = None
    if archive:
        old = _safe_file(folder, archive)
        if os.path.isfile(old):
            if len(list_workflows(project)["archives"]) >= MAX_ARCHIVES:
                raise ValueError("%d archives max: delete one before archiving." % MAX_ARCHIVES)
            stamp = time.strftime("%Y%m%d-%H%M%S", time.localtime(os.path.getmtime(old)))
            stem, ext = os.path.splitext(archive)
            n = 1
            while True:
                candidate = "%s_%s%s" % (stamp, stem, ext) if n == 1 else "%s_%s (%d)%s" % (stamp, stem, n, ext)
                if not os.path.exists(os.path.join(folder, candidate)):
                    break
                n += 1
            os.rename(old, os.path.join(folder, candidate))
            archived = candidate
    path = os.path.join(folder, name)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    return {"name": name, "mtime": os.path.getmtime(path), "archived": archived}


# Fichiers du projet plus utilises par le Ref Loader : deplaces ici, jamais effaces.
ARCHIVE_FOLDER = "Archives"


def archive_files(project, folder, names):
    """
    Deplace les fichiers 'names' de <projet>/<folder> dans
    <projet>/<folder>/Archives ("nom (2).ext" si le nom y est pris).
    Renvoie les nouveaux chemins, dans l'ordre.
    """
    if not project or not os.path.isdir(project):
        raise FileNotFoundError("Project folder not found: %s" % project)
    if folder not in SUBFOLDERS:
        raise ValueError("Unknown project folder: %s" % folder)
    src_dir = os.path.join(project, folder)
    for name in names:
        if not os.path.isfile(_safe_file(src_dir, name)):
            raise FileNotFoundError("File not found: %s" % os.path.join(src_dir, name))
    dst_dir = os.path.join(src_dir, ARCHIVE_FOLDER)
    os.makedirs(dst_dir, exist_ok=True)
    moved = []
    for name in names:
        stem, ext = os.path.splitext(name)
        n = 1
        while True:
            dst = os.path.join(dst_dir, name if n == 1 else "%s (%d)%s" % (stem, n, ext))
            if not os.path.exists(dst):
                break
            n += 1
        shutil.move(os.path.join(src_dir, name), dst)
        moved.append(dst)
    return moved


def delete_archive(project, name):
    """Supprime une archive yyyyMMdd-HHmmss_nom.json (jamais un workflow ni une configuration)."""
    if not _STAMPED.match(name or "") or _CONFIG.match(name) or not name.lower().endswith(".json"):
        raise ValueError("Not an archived workflow: %s" % name)
    path = _safe_file(_workflow_dir(project), name)
    if not os.path.isfile(path):
        raise FileNotFoundError("Archive not found: %s" % name)
    os.remove(path)
