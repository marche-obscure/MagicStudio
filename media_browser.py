"""
Fenetre Folder de MedLoad (plan du 05/11/2026) : logique serveur pure, en lecture seule,
sans dependance a ComfyUI. Seuls les dossiers input et output de ComfyUI sont lus ; tout
chemin est compare apres realpath (pas de sortie par ".." ni par une jonction). Les racines
viennent du serveur, jamais du navigateur. Modele : select_mod.py.
"""

import os
import unicodedata

try:
    from . import media
except ImportError:  # tests : module charge seul
    import media

REFUSED = "The Folder window only reads the input and output folders of ComfyUI: "
SEARCH_LIMIT = 500
KINDS = ("all", "video", "image", "audio")


def _real(path):
    return os.path.normcase(os.path.realpath(path))


def _inside(path, root):
    try:
        return os.path.commonpath((path, root)) == root
    except ValueError:  # lecteurs differents
        return False


def roots(input_dir, output_dir):
    """Racines permises existantes, sans doublon (une racine dans une autre n'est pas gardee)."""
    out = []
    for rid, label, path in (("input", "Input", input_dir), ("output", "Output", output_dir)):
        if not path or not os.path.isdir(path):
            continue
        real = _real(path)
        if any(_inside(real, _real(r["path"])) or _inside(_real(r["path"]), real) for r in out):
            continue
        out.append({"id": rid, "label": label, "path": os.path.abspath(path)})
    return out


def allowed(path, roots_):
    """realpath du chemin s'il est dans une racine permise, sinon None."""
    if not path or not str(path).strip():
        return None
    try:
        real = os.path.realpath(os.path.abspath(path))
    except (OSError, ValueError):
        return None
    key = os.path.normcase(real)
    return real if any(_inside(key, _real(r["path"])) for r in roots_ or []) else None


def _check(path, roots_):
    real = allowed(path, roots_)
    if real is None:
        raise PermissionError(REFUSED + str(path))
    return real


def _kind_ok(name, kind):
    k = media.kind_of(name)
    return k is not None and (kind in (None, "", "all") or k == kind)


def _media_names(folder):
    try:
        names = os.listdir(folder)
    except OSError:
        return []
    return [n for n in names if media.kind_of(n) and os.path.isfile(os.path.join(folder, n))]


def _subdirs(folder, roots_):
    try:
        names = sorted(os.listdir(folder), key=str.lower)
    except OSError:
        return []
    # Dossiers caches exclus ; un sous-dossier qui sort des racines (jonction) n'est pas montre.
    return [n for n in names if not n.startswith(".") and os.path.isdir(os.path.join(folder, n))
            and allowed(os.path.join(folder, n), roots_)]


def tree(path, roots_):
    """Sous-dossiers : [{name, path, count (fichiers medias directs), has_children}]."""
    folder = _check(path, roots_)
    out = []
    for n in _subdirs(folder, roots_):
        p = os.path.join(folder, n)
        out.append({"name": n, "path": p, "count": len(_media_names(p)), "has_children": bool(_subdirs(p, roots_))})
    return out


def _file_info(folder, name):
    p = os.path.join(folder, name)
    st = os.stat(p)
    return {"name": name, "path": p, "kind": media.kind_of(name), "size": st.st_size, "mtime": st.st_mtime}


def files(path, roots_, kind="all"):
    """Medias du dossier : [{name, path, kind, size, mtime}], par nom ; kind = all / video / image / audio."""
    folder = _check(path, roots_)
    return [_file_info(folder, n) for n in sorted(_media_names(folder), key=str.lower) if _kind_ok(n, kind)]


def fold(text):
    """Texte sans accents ni casse (comme foldText du JS)."""
    return "".join(c for c in unicodedata.normalize("NFKD", str(text or "")) if not unicodedata.combining(c)).lower()


def search(path, roots_, query, kind="all", limit=SEARCH_LIMIT):
    """Medias du dossier et de ses sous-dossiers dont le nom contient tous les mots : {files, truncated}."""
    folder = _check(path, roots_)
    words = fold(query).split()
    out = []
    if not words:
        return {"files": out, "truncated": False}
    for dirpath, dirnames, filenames in os.walk(folder):
        dirnames[:] = sorted((d for d in dirnames if not d.startswith(".")
                              and allowed(os.path.join(dirpath, d), roots_)), key=str.lower)
        for n in sorted(filenames, key=str.lower):
            if not _kind_ok(n, kind) or not all(w in fold(n) for w in words):
                continue
            if len(out) >= limit:
                return {"files": out, "truncated": True}
            out.append(_file_info(dirpath, n))
    return {"files": out, "truncated": False}
