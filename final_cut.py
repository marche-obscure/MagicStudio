"""
Final Cut (choix utilisateur, 22/10/2026) : copies des rushs finaux d'un projet
pour H3 Director, sans jamais toucher aux originaux.

- Sources : le dossier Picture Lock de 60.Rush Images (Images), 40.Rush Videos
  (Video) et 70.Rush Audio (Audio) du projet, ou de chaque sous-projet d'un
  MultiProject.
- Copies : Final-Cut_<Nom>/Images, Video, Audio, dans le projet (Simple) ou dans
  le projet mere (MultiProject), nommees _<NN>_<fichier> (NN : numero du projet,
  00 pour un projet Simple ; 01, 02... pour les sous-projets) et datees du jour
  de la copie (en tete dans H3 Director, qui classe par date).
- Miroir : ajout, remplacement (SHA256 different) et retrait ; les anciennes
  copies vont dans la Corbeille.
- Jonction ComfyUI/input/Final-Cut_<Nom> -> dossier des copies : visible dans les
  fenetres de choix de H3 Director ; une suppression faite depuis input ne touche
  que des copies.
Sans import ComfyUI (testable seul) : le dossier input est passe en parametre.
"""

import json
import os
import shutil
import sys

try:
    from . import projects
    from .run_record import file_sha256
except ImportError:  # tests : modules charges seuls
    import projects
    from run_record import file_sha256

RUSH_AUDIO = "70.Rush Audio"
LOCK = "Picture Lock"
# Dossier des copies <- dossier de rushs (Picture Lock) de chaque projet.
KINDS = (("Images", "60.Rush Images"), ("Video", "40.Rush Videos"), ("Audio", RUSH_AUDIO))
PREFIX = "Final-Cut_"


# ----------------------------------------------------------------------
# Numeros des projets (stockes sans affichage dans la marque du projet mere)
# ----------------------------------------------------------------------

def _read_mark(group):
    try:
        with open(os.path.join(group, projects.GROUP_MARK), "r", encoding="utf-8") as f:
            data = json.loads(f.read() or "{}")
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}  # ancienne marque (texte) ou absente


def _write_mark(group, data):
    mark = os.path.join(group, projects.GROUP_MARK)
    if sys.platform == "win32" and os.path.isfile(mark):
        import ctypes
        ctypes.windll.kernel32.SetFileAttributesW(mark, 0x80)  # NORMAL : un fichier cache refuse "w"
    with open(mark, "w", encoding="utf-8") as f:
        f.write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    if sys.platform == "win32":
        import ctypes
        ctypes.windll.kernel32.SetFileAttributesW(mark, 2)  # FILE_ATTRIBUTE_HIDDEN


def group_numbers(group):
    """
    Numeros d'un MultiProject : {"00": projet mere, "01": sous-projet...}. Un
    sous-projet sans numero prend le suivant (ordre de creation des dossiers) ;
    un numero n'est jamais reattribue.
    """
    data = _read_mark(group)
    numbers = data.get("numbers") if isinstance(data.get("numbers"), dict) else {}
    numbers = {k: v for k, v in numbers.items() if isinstance(k, str) and isinstance(v, str)}
    changed = numbers.get("00") != os.path.basename(os.path.abspath(group))
    numbers["00"] = os.path.basename(os.path.abspath(group))
    known = {v for k, v in numbers.items() if k != "00"}
    subs = [n for n in projects.project_children(group) if n not in known]
    subs.sort(key=lambda n: (os.path.getctime(os.path.join(group, n)), n.lower()))
    last = max([int(k) for k in numbers if k.isdigit()] + [int(data.get("last") or 0)])
    for n in subs:
        last += 1
        numbers["%02d" % last] = n
        changed = True
    if changed or data.get("last") != last:
        data.update({"note": "Folder of projects of the MiniMax H3 Project node.", "numbers": numbers, "last": last})
        _write_mark(group, data)
    return numbers


def rename_in_group(group, old, new):
    """Sous-projet renomme : il garde son numero."""
    data = _read_mark(group)
    numbers = data.get("numbers")
    if not isinstance(numbers, dict):
        return
    for k, v in numbers.items():
        if v == old and k != "00":
            numbers[k] = new
            _write_mark(group, data)
            return


def project_number(project):
    """00 pour un projet Simple ; numero du sous-projet dans son MultiProject."""
    parent = os.path.dirname(os.path.abspath(project))
    if not projects.is_group(parent):
        return "00"
    name = os.path.basename(os.path.abspath(project))
    for k, v in group_numbers(parent).items():
        if v == name and k != "00":
            return k
    return "00"


# ----------------------------------------------------------------------
# Plan du miroir
# ----------------------------------------------------------------------

def target(project):
    """
    (dossier des copies, nom, [(numero, projet source)]) : projet Simple -> dans le
    projet ; sous-projet -> dans le projet mere, avec tous ses sous-projets.
    """
    project = os.path.abspath(project)
    parent = os.path.dirname(project)
    if projects.is_group(parent):
        numbers = group_numbers(parent)
        sources = [(k, os.path.join(parent, v)) for k, v in sorted(numbers.items())
                   if k != "00" and os.path.isdir(os.path.join(parent, v))]
        name = os.path.basename(parent)
        return os.path.join(parent, PREFIX + name), name, sources
    name = os.path.basename(project)
    return os.path.join(project, PREFIX + name), name, [("00", project)]


def _files(folder):
    if not os.path.isdir(folder):
        return []
    return sorted(n for n in os.listdir(folder)
                  if not n.endswith(".part") and os.path.isfile(os.path.join(folder, n)))


def _same(a, b):
    try:
        if os.path.getsize(a) != os.path.getsize(b):
            return False
    except OSError:
        return False
    return file_sha256(a) == file_sha256(b)


def plan(project):
    """
    Ce que la synchronisation ferait, sans rien modifier :
    {folder, name, kinds: {Images|Video|Audio: {add, replace, remove, files}}, count}.
    files = copies attendues (nom de la copie, source).
    """
    folder, name, sources = target(project)
    out = {"folder": folder, "name": name, "kinds": {}, "count": 0}
    for kind, rush in KINDS:
        expected = {}
        for num, src_project in sources:
            src_dir = os.path.join(src_project, rush, LOCK)
            for n in _files(src_dir):
                expected["_%s_%s" % (num, n)] = os.path.join(src_dir, n)
        dest = os.path.join(folder, kind)
        present = set(_files(dest))
        add = sorted(n for n in expected if n not in present)
        replace = sorted(n for n in expected if n in present and not _same(expected[n], os.path.join(dest, n)))
        remove = sorted(n for n in present if n not in expected)
        out["kinds"][kind] = {"add": add, "replace": replace, "remove": remove,
                              "files": [{"name": n, "source": expected[n]} for n in sorted(expected)]}
        out["count"] += len(add) + len(replace) + len(remove)
    return out


def _copy_new(src, dst):
    """Copie datee du jour (copyfile, pas copy2), via un .part : jamais de copie a moitie."""
    part = dst + ".part"
    try:
        shutil.copyfile(src, part)
        os.replace(part, dst)
    finally:
        if os.path.exists(part):
            os.remove(part)


def sync(project, trash_fn, input_dir=None):
    """
    Applique le miroir : retraits et anciennes versions a la Corbeille (trash_fn),
    puis copies. Cree les dossiers et la jonction dans input_dir. Renvoie le plan
    applique avec link (chemin de la jonction, "" sans input_dir).
    """
    p = plan(project)
    for kind, _rush in KINDS:
        os.makedirs(os.path.join(p["folder"], kind), exist_ok=True)
    for kind, _rush in KINDS:
        k = p["kinds"][kind]
        dest = os.path.join(p["folder"], kind)
        old = [os.path.join(dest, n) for n in k["remove"] + k["replace"]]
        if old:
            trash_fn(old)
        sources = {f["name"]: f["source"] for f in k["files"]}
        for n in k["add"] + k["replace"]:
            _copy_new(sources[n], os.path.join(dest, n))
    p["link"] = ensure_link(p["folder"], input_dir) if input_dir else ""
    return p


# ----------------------------------------------------------------------
# Jonction dans le dossier input de ComfyUI
# ----------------------------------------------------------------------

def _is_link(path):
    isjunction = getattr(os.path, "isjunction", lambda p: False)
    return os.path.islink(path) or isjunction(path)


def ensure_link(folder, input_dir):
    """
    input_dir/Final-Cut_<Nom> -> folder (jonction sous Windows, lien symbolique
    ailleurs). Un lien qui pointe ailleurs est remplace ; un vrai dossier du meme
    nom n'est jamais touche (ValueError).
    """
    link = os.path.join(input_dir, os.path.basename(folder))
    if _is_link(link):
        if os.path.normcase(os.path.realpath(link)) == os.path.normcase(os.path.realpath(folder)):
            return link
        remove_link(link)
    elif os.path.exists(link):
        raise ValueError("A real folder already has this name in the input folder: %s" % link)
    os.makedirs(input_dir, exist_ok=True)
    if sys.platform == "win32":
        import _winapi
        _winapi.CreateJunction(os.path.abspath(folder), os.path.abspath(link))
    else:
        os.symlink(os.path.abspath(folder), link, target_is_directory=True)
    return link


def remove_link(link):
    """Retire le lien seulement (jamais le contenu du dossier lie)."""
    if not _is_link(link):
        raise ValueError("Not a link: %s" % link)
    if os.path.islink(link) and sys.platform != "win32":
        os.unlink(link)
    else:
        os.rmdir(link)  # jonction : retire le lien, pas la cible
