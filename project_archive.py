"""
Archive d'un projet dans un zip (plan du 22/11/2026) : reglage du dossier des archives,
cible (projet entier ou sous-projet), zip fait par Python (zipfile), relecture complete.
Logique pure, sans ComfyUI. Un seul travail a la fois pour tout le paquet.
"""
import contextlib
import json
import os
import shutil
import tempfile
import threading
import zipfile
from datetime import datetime

try:
    from . import projects
except ImportError:
    import projects

SETTINGS_FILE = "archive_settings.json"
MANIFEST = "mmarchive.json"
FORMAT = "MagicStudio archive"
# Extensions deja compressees : stockees sans recompression.
STORED_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".png", ".jpg", ".jpeg", ".webp", ".gif",
               ".mp3", ".flac", ".opus", ".ogg", ".m4a", ".zip", ".7z"}

_REPARSE = 0x400  # FILE_ATTRIBUTE_REPARSE_POINT (jonction ou lien)


class BusyError(Exception):
    """Un autre travail d'archive est deja en cours."""


# ---- travail unique et progression -------------------------------------------------

_JOB = threading.Lock()
_STATE = threading.Lock()
_owner = None
_progress = None


@contextlib.contextmanager
def job(step, total=0, name=""):
    """Prend le verrou du travail (BusyError s'il est pris) ; rentrant dans le meme fil."""
    global _owner, _progress
    me = threading.get_ident()
    if _owner == me:
        _report(step, 0, total, name)
        yield
        return
    if not _JOB.acquire(blocking=False):
        raise BusyError("Another archive job is already running.")
    _owner = me
    _report(step, 0, total, name)
    try:
        yield
    finally:
        with _STATE:
            _progress = None
        _owner = None
        _JOB.release()


def _report(step, done, total, name=""):
    global _progress
    with _STATE:
        _progress = {"step": step, "done": done, "total": total, "name": name}


def progress():
    """Etat du travail en cours ({step, done, total, name}) ou None."""
    with _STATE:
        return dict(_progress) if _progress else None


# ---- reglage -----------------------------------------------------------------------

def _inside(path, root):
    a = os.path.normcase(os.path.realpath(path))
    b = os.path.normcase(os.path.realpath(root))
    try:
        return os.path.commonpath([a, b]) == b
    except ValueError:  # disques differents
        return False


def check_folder(folder, projects_root):
    """Dossier des archives : absolu, cree s'il manque ; refuse vide, non inscriptible ou dans les projets."""
    if not folder or not str(folder).strip():
        raise ValueError("Choose a folder for the archives.")
    path = os.path.abspath(str(folder).strip())
    msg = "The archives folder cannot be inside the projects folder."
    if projects_root and _inside(path, projects_root):
        raise ValueError(msg)
    try:
        os.makedirs(path, exist_ok=True)
        if projects_root and _inside(path, projects_root):  # jonction vers les projets
            raise ValueError(msg)
        fd, probe = tempfile.mkstemp(dir=path, prefix=".mmtest")
        os.close(fd)
        os.remove(probe)
    except OSError as e:
        raise ValueError("Cannot write in the archives folder: %s" % e)
    return path


def _settings_path(base_dir=None):
    return os.path.join(base_dir or os.path.dirname(os.path.abspath(__file__)), SETTINGS_FILE)


def load_settings(base_dir=None):
    try:
        with open(_settings_path(base_dir), "r", encoding="utf-8") as f:
            folder = json.load(f).get("folder", "")
        return {"folder": folder if isinstance(folder, str) else ""}
    except (OSError, ValueError, AttributeError):
        return {"folder": ""}


def save_settings(folder, projects_root, base_dir=None):
    path = check_folder(folder, projects_root)
    with open(_settings_path(base_dir), "w", encoding="utf-8") as f:
        json.dump({"folder": path}, f, ensure_ascii=False, indent=2)
    return {"folder": path}


# ---- cible et parcours -------------------------------------------------------------

def target_of(project, scope):
    """Dossier a archiver : "whole" = dossier de projets si c'est un sous-projet, "sub" = le sous-projet."""
    project = os.path.abspath(project).rstrip("\\/")
    parent = os.path.dirname(project)
    name = os.path.basename(project)
    if scope == "whole":
        if projects.is_group(parent):
            return {"folder": parent, "kind": "project", "name": os.path.basename(parent),
                    "group": None, "number": None}
        return {"folder": project, "kind": "project", "name": name, "group": None, "number": None}
    if scope == "sub":
        if not projects.is_group(parent):
            raise ValueError("This project is not a sub-project.")
        return {"folder": project, "kind": "sub", "name": name,
                "group": os.path.basename(parent), "number": projects.split_number(name)[0]}
    raise ValueError("Unknown scope: %s" % scope)


def _is_link(path):
    try:
        st = os.lstat(path)
    except OSError:
        return True
    return os.path.islink(path) or bool(getattr(st, "st_file_attributes", 0) & _REPARSE)


def walk(folder):
    """(fichiers [(abs, rel)], dossiers [rel], taille) ; liens et jonctions ni suivis ni gardes."""
    files, dirs, size = [], [], 0
    folder = os.path.abspath(folder)
    for cur, subs, names in os.walk(folder, followlinks=False):
        subs[:] = sorted(d for d in subs if not _is_link(os.path.join(cur, d)))
        for d in subs:
            dirs.append(os.path.relpath(os.path.join(cur, d), folder).replace(os.sep, "/"))
        for n in sorted(names):
            p = os.path.join(cur, n)
            if _is_link(p):
                continue
            files.append((p, os.path.relpath(p, folder).replace(os.sep, "/")))
            size += os.path.getsize(p)
    return files, dirs, size


def zip_name(t, now):
    stamp = now.strftime("%Y%m%d-%H%M%S")
    if t["kind"] == "sub":
        return "%s - %s_%s.zip" % (t["group"], t["name"], stamp)
    return "%s_%s.zip" % (t["name"], stamp)


def _free_zip(folder, name):
    path = os.path.join(folder, name)
    base = name[:-4]
    n = 2
    while os.path.exists(path) or os.path.exists(path + ".part"):
        path = os.path.join(folder, "%s_%02d.zip" % (base, n))
        n += 1
    return path


def plan(project, scope, folder, now=None):
    now = now or datetime.now()
    t = target_of(project, scope)
    files, _dirs, size = walk(t["folder"])
    return {"target": t, "zip": _free_zip(folder, zip_name(t, now)), "size": size,
            "files": len(files), "free": shutil.disk_usage(folder).free}


# ---- zip et relecture --------------------------------------------------------------

def make_zip(project, scope, mode, folder, now=None):
    """Ecrit <zip>.part puis le renomme ; ValueError si le disque est trop plein."""
    if mode not in ("archive", "backup"):
        raise ValueError("Unknown mode: %s" % mode)
    now = now or datetime.now()
    t = target_of(project, scope)
    with job("zip", 0, t["name"]):
        files, dirs, size = walk(t["folder"])
        if shutil.disk_usage(folder).free < size:
            raise ValueError("Not enough free space on the archives disk.")
        final = _free_zip(folder, zip_name(t, now))
        part = final + ".part"
        manifest = {"format": FORMAT, "version": 1, "kind": t["kind"], "name": t["name"],
                    "group": t["group"], "number": t["number"],
                    "created": now.strftime("%Y-%m-%dT%H:%M:%S"), "mode": mode,
                    "files": len(files), "size": size, "source": t["folder"]}
        _report("zip", 0, len(files), t["name"])
        try:
            with zipfile.ZipFile(part, "w", allowZip64=True) as zf:
                info = zipfile.ZipInfo(MANIFEST, now.timetuple()[:6])
                zf.writestr(info, json.dumps(manifest, ensure_ascii=False, indent=2),
                            compress_type=zipfile.ZIP_DEFLATED)
                for rel in dirs:
                    zf.write(os.path.join(t["folder"], rel), t["name"] + "/" + rel + "/")
                for i, (path, rel) in enumerate(files, 1):
                    ext = os.path.splitext(rel)[1].lower()
                    method = zipfile.ZIP_STORED if ext in STORED_EXTS else zipfile.ZIP_DEFLATED
                    zf.write(path, t["name"] + "/" + rel, compress_type=method)
                    _report("zip", i, len(files), t["name"])
            os.replace(part, final)
        except BaseException:
            with contextlib.suppress(OSError):
                os.remove(part)
            raise
    return {"zip": final, "size": size, "files": len(files)}


def verify(zip_path, folder):
    """Relit tout le zip (CRC) et compare fichiers + tailles (et dossiers vides) au dossier d'origine."""
    with job("verify", 0, os.path.basename(zip_path)):
        files, dirs, _size = walk(folder)
        prefix = os.path.basename(os.path.abspath(folder)) + "/"
        want = {(rel, os.path.getsize(p)) for p, rel in files}
        try:
            zf = zipfile.ZipFile(zip_path, "r")
        except (OSError, zipfile.BadZipFile) as e:
            raise ValueError("The zip is incomplete: cannot be read (%s)." % e)
        with zf:
            _report("verify", 0, len(zf.infolist()), os.path.basename(zip_path))
            bad = zf.testzip()
            if bad is not None:
                raise ValueError("The zip is incomplete: damaged entry %s." % bad)
            got, got_dirs = set(), set()
            for zi in zf.infolist():
                if zi.filename == MANIFEST:
                    continue
                if not zi.filename.startswith(prefix):
                    raise ValueError("The zip is incomplete: unexpected entry %s." % zi.filename)
                rel = zi.filename[len(prefix):]
                if zi.is_dir():
                    got_dirs.add(rel.rstrip("/"))
                else:
                    got.add((rel, zi.file_size))
        if got != want:
            diff = sorted(r for r, _ in (want ^ got))
            raise ValueError("The zip is incomplete: %d file(s) differ (%s)." % (len(diff), ", ".join(diff[:3])))
        missing = sorted(set(dirs) - got_dirs)
        if missing:
            raise ValueError("The zip is incomplete: folder(s) missing (%s)." % ", ".join(missing[:3]))
