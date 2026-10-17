"""
Logique des dossiers de projet du noeud MiniMaxH3Project (sans import
ComfyUI, testable seule) : un projet = un dossier de la racine des
projets (le Root folder du MiniMax H3 Reference Loader branche, sinon
<input de ComfyUI>/Projets), avec toujours les memes sous-dossiers.
"""

import os
import sys
import shutil
import filecmp
import hashlib
import re
import time

# Sous-dossiers de chaque projet (meme liste que web/js/project_paths.js).
SUBFOLDERS = ("00.Workflows", "02.Models", "04.Prompt", "06.LoRA", "08.Images", "10.Son",
              "12.Video", "14.Video-Audio", "40.Rush Videos", "60.Rush Images")

# Dossier des configurations JSON du Ref Loader (anciennes versions de Save).
CONFIG_FOLDER = "00.Workflows"

# Configuration du projet (Load / Save du noeud) : creee avec le projet et son
# dossier Archives, sans ligne dans le noeud (voir project_config.py).
PROJECT_CONFIG_DIR = "99.Project-Config"

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
    arch = os.path.join(path, PROJECT_CONFIG_DIR, "Archives")
    if not os.path.isdir(arch):
        os.makedirs(arch, exist_ok=True)
        created.append(PROJECT_CONFIG_DIR)
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
# Archive : 00.Workflows/Archives/yyyyMMdd-HHmmss_<nom du workflow>.json ;
# configuration du Ref Loader : yyyyMMdd-HHmmss_REF2VA|FL2VA_minimax_config.json
# a la racine de 00.Workflows (pas un workflow).
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


def _archive_dir(project):
    return os.path.join(_workflow_dir(project), "Archives")


def _free_name(folder, name):
    """name, sinon "stem (2).ext", "stem (3).ext"... libre dans folder."""
    stem, ext = os.path.splitext(name)
    n = 1
    while True:
        candidate = name if n == 1 else "%s (%d)%s" % (stem, n, ext)
        if not os.path.exists(os.path.join(folder, candidate)):
            return candidate
        n += 1


def _migrate_archives(project):
    """Anciennes archives datees laissees a la racine de 00.Workflows : deplacees dans Archives."""
    folder = _workflow_dir(project)
    if not os.path.isdir(folder):
        return
    old = [e.name for e in os.scandir(folder) if e.is_file() and e.name.lower().endswith(".json")
           and _STAMPED.match(e.name) and not _CONFIG.match(e.name)]
    if not old:
        return
    dst = _archive_dir(project)
    os.makedirs(dst, exist_ok=True)
    for name in old:
        shutil.move(os.path.join(folder, name), os.path.join(dst, _free_name(dst, name)))


def _safe_file(folder, name):
    if not name or os.path.basename(name) != name:
        raise ValueError("Invalid file name: %s" % name)
    return os.path.join(folder, name)


def list_workflows(project):
    """
    {"workflows": [{name, mtime}] (racine de 00.Workflows, plus recent d'abord),
     "archives": [{name, mtime, stamp, of}] (tout .json de 00.Workflows/Archives,
     plus recente d'abord ; sans date dans le nom, stamp = date du fichier)}.
    Les configurations du Ref Loader ne sont pas listees.
    """
    _migrate_archives(project)
    folder = _workflow_dir(project)
    workflows, archives = [], []
    if os.path.isdir(folder):
        for e in os.scandir(folder):
            if not e.is_file() or not e.name.lower().endswith(".json") or _CONFIG.match(e.name):
                continue
            workflows.append({"name": e.name, "mtime": e.stat().st_mtime})
    arch = _archive_dir(project)
    if os.path.isdir(arch):
        for e in os.scandir(arch):
            if not e.is_file() or not e.name.lower().endswith(".json"):
                continue
            mtime = e.stat().st_mtime
            m = _STAMPED.match(e.name)
            stamp = m.group(1) if m else time.strftime("%Y%m%d-%H%M%S", time.localtime(mtime))
            archives.append({"name": e.name, "mtime": mtime, "stamp": stamp, "of": m.group(2) if m else e.name})
    workflows.sort(key=lambda w: -w["mtime"])
    archives.sort(key=lambda a: (a["stamp"], a["name"]), reverse=True)
    return {"workflows": workflows, "archives": archives}


def read_workflow(project, name, archive=False):
    """Texte d'un workflow de 00.Workflows, ou d'une archive de 00.Workflows/Archives."""
    path = _safe_file(_archive_dir(project) if archive else _workflow_dir(project), name)
    if not os.path.isfile(path):
        raise FileNotFoundError("Workflow not found: %s" % name)
    with open(path, encoding="utf-8") as f:
        return f.read()


def save_workflow(project, name, content, archive=None):
    """
    Ecrit le workflow 'name' dans 00.Workflows. archive = nom du workflow
    precedent a archiver d'abord : deplace dans 00.Workflows/Archives sous
    yyyyMMdd-HHmmss_<nom>.json avec la date de sa derniere sauvegarde
    ("nom (2)" si cette archive existe).
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
            arch = _archive_dir(project)
            os.makedirs(arch, exist_ok=True)
            candidate = _free_name(arch, "%s_%s" % (stamp, archive))
            shutil.move(old, os.path.join(arch, candidate))
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


def folder_files(project, folders):
    """
    {dossier: [chemins]} : fichiers a la racine de chaque dossier du projet
    (sans sous-dossiers ni fichiers caches), tries par nom. Cloches des
    dossiers suivis : fichiers que le Ref Loader n'utilise plus.
    """
    if not project or not os.path.isdir(project):
        raise FileNotFoundError("Project folder not found: %s" % project)
    out = {}
    for folder in folders:
        if folder not in SUBFOLDERS:
            raise ValueError("Unknown project folder: %s" % folder)
        d = os.path.join(project, folder)
        names = [e.name for e in os.scandir(d) if e.is_file() and not e.name.startswith(".")] if os.path.isdir(d) else []
        out[folder] = [os.path.join(d, n) for n in sorted(names, key=lambda n: (n.lower(), n))]
    return out


def import_name(folder, name):
    """
    Nom libre pour 'name' dans 'folder' : le nom lui-meme s'il est libre,
    sinon "nom_02.ext", "nom_03.ext"... (un fichier qui en remplace un du
    meme nom garde son nom : l'ancien est archive avant).
    """
    if not os.path.exists(os.path.join(folder, name)):
        return name
    stem, ext = os.path.splitext(name)
    n = 2
    while os.path.exists(os.path.join(folder, "%s_%02d%s" % (stem, n, ext))):
        n += 1
    return "%s_%02d%s" % (stem, n, ext)


def import_files(project, folder, paths):
    """
    Fait entrer des fichiers dans <projet>/<folder> : ceux de
    <projet>/<folder>/Archives sont deplaces, les autres copies (la source
    reste intacte), ceux deja dans le dossier restent en place. Nom pris =
    import_name(). Renvoie les nouveaux chemins, dans l'ordre.
    """
    if not project or not os.path.isdir(project):
        raise FileNotFoundError("Project folder not found: %s" % project)
    if folder not in SUBFOLDERS:
        raise ValueError("Unknown project folder: %s" % folder)
    dst_dir = os.path.join(project, folder)
    arch_dir = os.path.join(dst_dir, ARCHIVE_FOLDER)
    for p in paths:
        if not os.path.isfile(p or ""):
            raise FileNotFoundError("File not found: %s" % p)
    os.makedirs(dst_dir, exist_ok=True)
    out = []
    for p in paths:
        parent = _norm(os.path.dirname(p))
        if parent == _norm(dst_dir):
            out.append(p)
            continue
        dst = os.path.join(dst_dir, import_name(dst_dir, os.path.basename(p)))
        if parent == _norm(arch_dir):
            shutil.move(p, dst)
        else:
            shutil.copy2(p, dst)
        out.append(dst)
    return out


# SHA256 deja calcules : chemin -> (taille, date, empreinte).
_HASH_CACHE = {}


def file_hash(path):
    """SHA256 du fichier (None s'il n'existe pas), garde en cache tant que taille et date ne changent pas."""
    try:
        st = os.stat(path)
    except OSError:
        return None
    key = _norm(path)
    hit = _HASH_CACHE.get(key)
    if hit and hit[0] == st.st_size and hit[1] == st.st_mtime:
        return hit[2]
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    digest = h.hexdigest()
    _HASH_CACHE[key] = (st.st_size, st.st_mtime, digest)
    return digest


def file_hashes(paths):
    """{chemin: SHA256} pour les fichiers existants."""
    out = {}
    for p in paths:
        d = file_hash(p)
        if d:
            out[p] = d
    return out


# ----------------------------------------------------------------------
# Doublons dans <dossier>/Archives (08.Images, 10.Son, 12.Video, 14.Video-Audio)
# ----------------------------------------------------------------------
# Suffixe ajoute par le projet a un nom deja pris : "nom (2)" ou "nom_02".
_COPY_SUFFIX = re.compile(r"(?: \(\d+\)|_\d{2,})$")


def _has_copy_suffix(name):
    return bool(_COPY_SUFFIX.search(os.path.splitext(name)[0]))


def archive_duplicates(project, folders):
    """
    {dossier: [groupe]} : fichiers de <dossier>/Archives (racine seulement)
    au meme SHA256, groupes d'au moins deux. groupe = {sha, files: [{name,
    size, mtime, keep}]} ; keep = l'exemplaire garde (choix utilisateur : le
    nom sans suffixe "(2)" / "_02", sinon le plus ancien), en premier.
    """
    if not project or not os.path.isdir(project):
        raise FileNotFoundError("Project folder not found: %s" % project)
    out = {}
    for folder in folders:
        if folder not in SUBFOLDERS:
            raise ValueError("Unknown project folder: %s" % folder)
        arch = os.path.join(project, folder, ARCHIVE_FOLDER)
        groups = {}
        if os.path.isdir(arch):
            for e in os.scandir(arch):
                if not e.is_file() or e.name.startswith("."):
                    continue
                st = e.stat()
                sha = file_hash(e.path)
                if sha:
                    groups.setdefault(sha, []).append({"name": e.name, "size": st.st_size, "mtime": st.st_mtime})
        found = []
        for sha, files in groups.items():
            if len(files) < 2:
                continue
            files.sort(key=lambda f: (_has_copy_suffix(f["name"]), f["mtime"], f["name"].lower()))
            for i, f in enumerate(files):
                f["keep"] = i == 0
            found.append({"sha": sha, "files": files})
        found.sort(key=lambda g: g["files"][0]["name"].lower())
        out[folder] = found
    return out


def _to_recycle_bin(paths):
    """Corbeille de Windows (recuperable) ; OSError si elle refuse."""
    import ctypes
    from ctypes import wintypes

    class SHFILEOPSTRUCTW(ctypes.Structure):
        _fields_ = [("hwnd", wintypes.HWND), ("wFunc", wintypes.UINT), ("pFrom", ctypes.c_void_p),
                    ("pTo", ctypes.c_void_p), ("fFlags", ctypes.c_ushort), ("fAnyOperationsAborted", wintypes.BOOL),
                    ("hNameMappings", ctypes.c_void_p), ("lpszProgressTitle", ctypes.c_void_p)]

    FO_DELETE, FOF_SILENT, FOF_NOCONFIRMATION, FOF_ALLOWUNDO, FOF_NOERRORUI = 3, 0x4, 0x10, 0x40, 0x400
    # Liste terminee par deux caracteres nuls.
    buf = ctypes.create_unicode_buffer("\0".join(os.path.abspath(p) for p in paths) + "\0\0")
    op = SHFILEOPSTRUCTW(None, FO_DELETE, ctypes.cast(buf, ctypes.c_void_p), None,
                         FOF_SILENT | FOF_NOCONFIRMATION | FOF_ALLOWUNDO | FOF_NOERRORUI, False, None, None)
    code = ctypes.windll.shell32.SHFileOperationW(ctypes.byref(op))
    if code != 0 or op.fAnyOperationsAborted:
        raise OSError("Could not move the files to the Recycle Bin (code %d)." % code)


TRASH_AVAILABLE = sys.platform == "win32"


def delete_duplicates(project, folder, shas, trash):
    """
    Supprime les copies des groupes 'shas' de <dossier>/Archives : tout sauf
    l'exemplaire garde (relu ici, jamais choisi par l'appelant). trash = vers
    la Corbeille de Windows, sinon suppression definitive. Renvoie les noms.
    """
    if trash and not TRASH_AVAILABLE:
        raise ValueError("The Recycle Bin is only available on Windows.")
    groups = archive_duplicates(project, [folder])[folder]
    wanted = set(shas or [])
    arch = os.path.join(project, folder, ARCHIVE_FOLDER)
    names = [f["name"] for g in groups if g["sha"] in wanted for f in g["files"] if not f["keep"]]
    paths = [os.path.join(arch, n) for n in names]
    if not paths:
        return []
    if trash:
        _to_recycle_bin(paths)
    else:
        for p in paths:
            os.remove(p)
    for p in paths:
        _HASH_CACHE.pop(_norm(p), None)
    return names


def delete_archive(project, name):
    """Supprime un .json de 00.Workflows/Archives (jamais un fichier de la racine)."""
    if not (name or "").lower().endswith(".json"):
        raise ValueError("Not an archived workflow: %s" % name)
    path = _safe_file(_archive_dir(project), name)
    if not os.path.isfile(path):
        raise FileNotFoundError("Archive not found: %s" % name)
    os.remove(path)
