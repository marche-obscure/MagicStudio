"""
Archives des listes d'images du modele Image (logique pure, sans ComfyUI).

Dossier : <projet>/99.Project-Config/Image-Lists/yyyyMMdd-HHmmss_<nom>.json
Contenu : {"format": "MagicStudio Image List", "version": 1, "name", "date", "images"}
(chemin relatif au projet avec "/" s'il est dedans, sinon absolu).
Rien n'est lu, ecrit ni supprime hors de ce dossier ; pas de limite de nombre d'archives.
"""

import json
import os
import re
import time

LISTS_DIR = "Image-Lists"
CONFIG_DIR = "99.Project-Config"
FORMAT = "MagicStudio Image List"
MAX_IMAGES = 15
MAX_NAME = 60
_FORBIDDEN = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_ARCHIVE = re.compile(r"^(\d{8}-\d{6})_.+\.json$")


def lists_dir(project):
    return os.path.join(project, CONFIG_DIR, LISTS_DIR)


def clean_name(name):
    """Nom propre : caracteres interdits retires, espaces aux bouts, 60 au plus, sinon "list"."""
    text = _FORBIDDEN.sub("", str(name or "")).strip()[:MAX_NAME].strip()
    return text or "list"


def _inside(path, folder):
    path, folder = os.path.normcase(os.path.realpath(path)), os.path.normcase(os.path.realpath(folder))
    return os.path.commonpath([path, folder]) == folder and path != folder


def _check_dir(project, create=False):
    """
    Le dossier des archives doit rester dans le projet : chaque niveau sous le projet (99.Project-Config,
    puis Image-Lists), qu'il existe ou non, est compare a son chemin attendu (jonction / lien qui sort =
    refuse). create=True les cree un par un, en reverifiant apres chaque creation, avant toute ecriture.
    """
    real = os.path.realpath(project)
    path = project
    for part in (CONFIG_DIR, LISTS_DIR):
        path = os.path.join(path, part)
        real = os.path.join(real, part)
        if not os.path.lexists(path):
            if not create:
                break
            os.mkdir(path)
        if os.path.normcase(os.path.realpath(path)) != os.path.normcase(real):
            raise ValueError("%s is not inside the project" % part)
    return lists_dir(project)


def _safe(project, file):
    """Chemin d'une archive : nom simple de la forme yyyyMMdd-HHmmss_nom.json, realpath dans Image-Lists."""
    if (not isinstance(file, str) or not file or os.path.basename(file) != file or "\\" in file
            or ":" in file or not _ARCHIVE.match(file)):
        raise ValueError("Not an archived image list: %s" % file)
    folder = _check_dir(project)
    path = os.path.join(folder, file)
    if os.path.lexists(path) and not _inside(path, folder):
        raise ValueError("Outside Image-Lists: %s" % file)
    return path


def _to_stored(project, path):
    """Chemin relatif au projet (avec /) s'il est dedans, sinon absolu."""
    full = os.path.normpath(path)
    base = os.path.normpath(project)
    try:
        inside = os.path.commonpath([os.path.normcase(full), os.path.normcase(base)]) == os.path.normcase(base)
    except ValueError:  # autre lecteur
        inside = False
    if inside and os.path.normcase(full) != os.path.normcase(base):
        return os.path.relpath(full, base).replace("\\", "/")
    return full.replace("\\", "/")


def _to_absolute(project, stored):
    if os.path.isabs(stored) or re.match(r"^[A-Za-z]:", stored):
        return os.path.normpath(stored)
    return os.path.normpath(os.path.join(project, stored))


def save_list(project, name, images, now=None):
    """Ecrit une archive (jamais par-dessus une autre : seconde suivante). Renvoie {file, name, stamp, count}."""
    if not isinstance(images, (list, tuple)) or not 1 <= len(images) <= MAX_IMAGES \
            or not all(isinstance(p, str) and p.strip() for p in images):
        raise ValueError("An image list needs 1 to %d images" % MAX_IMAGES)
    folder = _check_dir(project, create=True)
    clean = clean_name(name)
    t = int(time.time() if now is None else now)
    while True:
        stamp = time.strftime("%Y%m%d-%H%M%S", time.localtime(t))
        file = "%s_%s.json" % (stamp, clean)
        path = os.path.join(folder, file)
        data = {"format": FORMAT, "version": 1, "name": clean,
                "date": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t)),
                "images": [_to_stored(project, p) for p in images]}
        try:
            f = open(path, "x", encoding="utf-8")  # "x" : jamais par-dessus un fichier existant
        except FileExistsError:
            t += 1
            continue
        try:
            with f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except BaseException:
            try:
                os.remove(path)
            except OSError:
                pass
            raise
        break
    return {"file": file, "name": clean, "stamp": stamp, "count": len(images)}


def list_lists(project):
    """Archives, la plus recente d'abord (illisibles ignorees). images = chemins absolus."""
    folder = _check_dir(project)
    if not os.path.isdir(folder):
        return []
    out = []
    for file in os.listdir(folder):
        m = _ARCHIVE.match(file)
        path = os.path.join(folder, file)
        if not m or not os.path.isfile(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            images = [_to_absolute(project, p) for p in data["images"] if isinstance(p, str) and p]
            name = data.get("name")
            date = data.get("date")
        except Exception:
            continue
        out.append({"file": file, "name": name if isinstance(name, str) else file[16:-5], "stamp": m.group(1),
                    "date": date if isinstance(date, str) else "", "count": len(images), "images": images,
                    "missing": [p for p in images if not os.path.isfile(p)]})
    out.sort(key=lambda e: e["file"], reverse=True)
    return out


def delete_lists(project, files):
    """Supprime des archives de Image-Lists (tout est verifie avant la premiere suppression)."""
    if not isinstance(files, (list, tuple)):
        raise ValueError("files must be a list")
    paths = [(f, _safe(project, f)) for f in files]
    deleted = []
    for file, path in paths:
        if os.path.isfile(path):
            os.remove(path)
            deleted.append(file)
    return {"deleted": deleted}
