"""
Noeud MagicStudio SelectMod (choix utilisateur 28/10/2026) : logique serveur pure,
sans dependance a ComfyUI, pour pouvoir etre testee seule.

SelectMod ne lit que les dossiers de modeles : "models" de ComfyUI et
"Models (Linker)" (<base_path>/models de extra_model_paths.yaml). Tout chemin est
compare apres realpath (pas de sortie par ".." ni par une jonction). Les racines
viennent du serveur, jamais du navigateur. Copie adaptee de MultiFiles Select,
sans aucun import de ce paquet.
"""

import os
import re
import unicodedata

REFUSED = "SelectMod only reads the models folders: "
SEARCH_LIMIT = 500


def linker_models_dir(comfyui_root):
    """
    <base_path>/models de extra_model_paths.yaml a la racine de ComfyUI : section
    is_default, sinon la premiere avec base_path ; "" si absent ou illisible.
    """
    if not comfyui_root:
        return ""
    path = os.path.join(comfyui_root, "extra_model_paths.yaml")
    if not os.path.isfile(path):
        return ""
    try:
        import yaml
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
    except Exception:
        return ""
    if not isinstance(data, dict):
        return ""
    default_base = first_base = ""
    for section in data.values():
        if not isinstance(section, dict) or not section.get("base_path"):
            continue
        first_base = first_base or section["base_path"]
        if section.get("is_default") and not default_base:
            default_base = section["base_path"]
    base = default_base or first_base
    return os.path.join(str(base), "models") if base else ""


def _real(path):
    return os.path.normcase(os.path.realpath(path))


def _inside(path, root):
    try:
        return os.path.commonpath((path, root)) == root
    except ValueError:  # lecteurs differents
        return False


def roots(models_dir, comfyui_root):
    """Racines permises existantes, sans doublon (une racine dans une autre n'est pas gardee)."""
    out = []
    for label, path in (("models", models_dir), ("Models (Linker)", linker_models_dir(comfyui_root))):
        if not path or not os.path.isdir(path):
            continue
        real = _real(path)
        if any(_inside(real, _real(r["path"])) or _inside(_real(r["path"]), real) for r in out):
            continue
        out.append({"label": label, "path": os.path.abspath(path)})
    return out


def is_hidden(name):
    """Fichiers annexes caches : .json, .info, .md, .shaN."""
    ext = os.path.splitext(name)[1].lower()
    return ext in (".json", ".info", ".md") or bool(re.fullmatch(r"\.sha\d*", ext))


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


def model_type(path):
    """Dossier qui suit le dernier segment "models" (casse ignoree) ; "" sinon ou pour un fichier pose dans models."""
    parts = [p for p in re.split(r"[\\/]+", path or "") if p]
    idx = [i for i, p in enumerate(parts) if p.lower() == "models"]
    if not idx or idx[-1] + 1 >= len(parts):
        return ""
    i = idx[-1] + 1
    if i == len(parts) - 1 and os.path.splitext(parts[i])[1]:
        return ""
    return parts[i]


def _visible_files(folder):
    try:
        names = os.listdir(folder)
    except OSError:
        return []
    return [n for n in names if not is_hidden(n) and os.path.isfile(os.path.join(folder, n))]


def _subdirs(folder, roots_):
    try:
        names = sorted(os.listdir(folder), key=str.lower)
    except OSError:
        return []
    # Un sous-dossier qui sort des racines (jonction vers ailleurs) n'est pas montre.
    return [n for n in names if os.path.isdir(os.path.join(folder, n)) and allowed(os.path.join(folder, n), roots_)]


def tree(path, roots_):
    """Sous-dossiers : [{name, path, count (fichiers visibles), has_children}]."""
    folder = _check(path, roots_)
    out = []
    for n in _subdirs(folder, roots_):
        p = os.path.join(folder, n)
        out.append({"name": n, "path": p, "count": len(_visible_files(p)), "has_children": bool(_subdirs(p, roots_))})
    return out


def _file_info(folder, name):
    p = os.path.join(folder, name)
    st = os.stat(p)
    return {"name": name, "path": p, "size": st.st_size, "mtime": st.st_mtime}


def files(path, roots_):
    """Fichiers visibles du dossier : [{name, path, size, mtime}], par nom."""
    folder = _check(path, roots_)
    return [_file_info(folder, n) for n in sorted(_visible_files(folder), key=str.lower)]


def fold(text):
    """Texte sans accents ni casse (recherche)."""
    return "".join(c for c in unicodedata.normalize("NFKD", str(text or "")) if not unicodedata.combining(c)).lower()


def search(path, roots_, query, limit=SEARCH_LIMIT):
    """Fichiers du dossier et de ses sous-dossiers dont le nom contient tous les mots : {files, truncated}."""
    folder = _check(path, roots_)
    words = fold(query).split()
    out = []
    if not words:
        return {"files": out, "truncated": False}
    for dirpath, dirnames, filenames in os.walk(folder):
        dirnames[:] = sorted(d for d in dirnames if allowed(os.path.join(dirpath, d), roots_))
        for n in sorted(filenames, key=str.lower):
            if is_hidden(n) or not all(w in fold(n) for w in words):
                continue
            if len(out) >= limit:
                return {"files": out, "truncated": True}
            out.append(_file_info(dirpath, n))
    return {"files": out, "truncated": False}


def check_fields(fields, origin_dir, roots_):
    """
    run() : chaque champ rempli doit etre dans une racine. Chemin relatif (mode
    Relative) : depuis origin_dir, sinon depuis chaque racine. ValueError sinon.
    """
    for field in fields or []:
        text = str(field or "").strip().strip('"').strip()
        if not text:
            continue
        if os.path.isabs(text):
            candidates = [text]
        else:
            bases = [origin_dir] if origin_dir and str(origin_dir).strip() else [r["path"] for r in roots_ or []]
            candidates = [os.path.join(b, text) for b in bases]
        if not any(allowed(c, roots_) for c in candidates):
            raise ValueError(REFUSED + text)


def join_path(origin, subdir, file_name, mode):
    """Chemin d'un champ : origine + sous-dossier + fichier (Absolute), sinon sous-dossier + fichier (Relative)."""
    parts = [p for p in ((origin, subdir, file_name) if mode == "Absolute" else (subdir, file_name)) if p]
    if not parts:
        return ""
    path = os.path.normpath(os.path.join(*parts))
    return "" if path == "." else path


# Nom produit par le JS : date en prefixe, ex. "20261029-143000_selectmod_fields.json".
EXPORT_NAME_RE = re.compile(r"^\d{8}-\d{6}_selectmod_fields\.json$")


def _free_path(folder, name):
    path = os.path.join(folder, name)
    base, ext = os.path.splitext(name)
    n = 2
    while os.path.exists(path):
        path = os.path.join(folder, "%s (%d)%s" % (base, n, ext))
        n += 1
    return path


def write_export(folder, name, content):
    """Export des champs (.json) dans le dossier de sauvegarde ; jamais par-dessus un fichier existant."""
    import json
    folder = (folder or "").strip()
    if not folder:
        raise ValueError("No save folder.")
    if not EXPORT_NAME_RE.match(name or ""):
        raise ValueError("Invalid export file name.")
    try:
        json.loads(content)
    except (TypeError, ValueError):
        raise ValueError("The export is not valid JSON.")
    if not os.path.isdir(folder):
        raise FileNotFoundError("Folder not found: %s" % folder)
    path = _free_path(folder, name)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    return path
