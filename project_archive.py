"""
Archive d'un projet dans un zip (plan du 22/11/2026) : reglage du dossier des archives,
cible (projet entier ou sous-projet), zip fait par Python (zipfile), relecture complete.
Logique pure, sans ComfyUI. Un seul travail a la fois pour tout le paquet.
"""
import contextlib
import json
import os
import shutil
import sys
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
    st = os.lstat(path)  # une erreur remonte : jamais un fichier illisible traite comme un lien
    return os.path.islink(path) or bool(getattr(st, "st_file_attributes", 0) & _REPARSE)


def _raise(err):
    raise err


def walk(folder):
    """(fichiers [(abs, rel)], dossiers [rel], taille) ; liens et jonctions ni suivis ni gardes.
    Un dossier ou fichier illisible leve OSError (rien n'est omis en silence)."""
    files, dirs, size = [], [], 0
    folder = os.path.abspath(folder)
    for cur, subs, names in os.walk(folder, followlinks=False, onerror=_raise):
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


# ---- Corbeille : place disponible --------------------------------------------------

def _bin_settings(path):
    """(nuke, max_bytes, used_bytes) de la Corbeille du volume de path, ou None si inconnu.
    Lu dans le registre (NukeOnDelete, MaxCapacity en Mo) et par SHQueryRecycleBinW."""
    if sys.platform != "win32":
        return None
    try:
        import ctypes
        import winreg
        from ctypes import wintypes
        drive = os.path.splitdrive(os.path.abspath(path))[0]
        if not drive or drive.startswith("\\\\"):
            return None
        root = drive + "\\"
        buf = ctypes.create_unicode_buffer(260)
        if not ctypes.windll.kernel32.GetVolumeNameForVolumeMountPointW(root, buf, 260):
            return None
        guid = "{" + buf.value.split("{", 1)[-1].split("}", 1)[0] + "}"  # \\?\Volume{GUID}\
        key = r"Software\Microsoft\Windows\CurrentVersion\Explorer\BitBucket\Volume\%s" % guid
        nuke, max_mb = 0, None
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key) as k:
                for name in ("NukeOnDelete", "MaxCapacity"):
                    try:
                        value = winreg.QueryValueEx(k, name)[0]
                    except FileNotFoundError:
                        continue
                    if name == "NukeOnDelete":
                        nuke = int(value)
                    else:
                        max_mb = int(value)
        except FileNotFoundError:
            return None

        class RBINFO(ctypes.Structure):
            _fields_ = [("cbSize", wintypes.DWORD), ("i64Size", ctypes.c_int64),
                        ("i64NumItems", ctypes.c_int64)]
        info = RBINFO()
        info.cbSize = ctypes.sizeof(RBINFO)
        if ctypes.windll.shell32.SHQueryRecycleBinW(root, ctypes.byref(info)) != 0:
            return None
        if nuke == 1:
            return (True, 0, int(info.i64Size))
        if max_mb is None:
            return None
        return (False, max_mb * 1024 * 1024, int(info.i64Size))
    except Exception:
        return None


def trash_fits(path, size):
    """False = la Corbeille ne peut pas garder `size` octets (Windows supprimerait pour de bon) ;
    None = inconnu (hors Windows ou reglage illisible)."""
    settings = _bin_settings(path)
    if settings is None:
        return None
    nuke, max_bytes, used = settings
    if nuke or used + size > max_bytes:
        return False
    return True


# ---- suppression et archive complete -----------------------------------------------

def _writable_then_retry(func, path, _exc):
    os.chmod(path, 0o700)
    func(path)


def remove_target(t, how, input_dir, trash_fn, fits_fn=trash_fits):
    """Retire le lien Final-Cut_<nom> (projet entier seulement) puis le dossier."""
    if how not in ("trash", "permanent"):
        raise ValueError("Unknown removal: %s" % how)
    folder = t["folder"]
    kept = "The project could not be deleted (%s). Its verified zip is kept."
    if how == "trash":
        try:
            fits = fits_fn(folder, walk(folder)[2])
        except Exception as e:
            raise ValueError(kept % e)
        if fits is False:
            raise ValueError("The Recycle Bin cannot hold this project: nothing was deleted. "
                             "Empty the Recycle Bin or choose Delete permanently.")
        if fits is None:  # Windows supprimerait pour de bon, sans le dire : on refuse
            raise ValueError("Windows does not tell whether the Recycle Bin can hold this project: "
                             "nothing was deleted. Choose Delete permanently to free the space.")
    try:
        try:
            from . import final_cut
        except ImportError:
            import final_cut
        if t["kind"] == "project":
            link = os.path.join(input_dir, "Final-Cut_" + t["name"])
            if os.path.lexists(link) and final_cut._is_link(link):
                final_cut.remove_link(link)
        if how == "trash":
            trash_fn([folder])
            if os.path.exists(folder):
                raise OSError("the folder is still there")
        else:
            shutil.rmtree(folder, onerror=_writable_then_retry)
    except Exception as e:
        raise ValueError(kept % e)
    return {"removed": True, "how": how}


def archive(project, scope, how, folder, input_dir, trash_fn, now=None, fits_fn=trash_fits):
    """zip -> relecture -> suppression, sous un seul travail. Zip garde si la suppression echoue."""
    t = target_of(project, scope)
    with job("zip", 0, t["name"]):
        made = make_zip(project, scope, "archive", folder, now)
        try:
            verify(made["zip"], t["folder"])
        except (ValueError, OSError) as e:
            with contextlib.suppress(OSError):
                os.remove(made["zip"])
            if isinstance(e, ValueError):
                raise
            raise ValueError("The zip could not be checked (%s): nothing was deleted." % e)
        _report("remove", 0, 0, t["name"])
        remove_target(t, how, input_dir, trash_fn, fits_fn)
    return {"zip": made["zip"], "size": made["size"], "files": made["files"], "removed": True}


# ---- liste des archives ------------------------------------------------------------

STALE_PART_SECONDS = 3600
PART_MARK = ".mmrestore-part"


def list_archives(folder):
    """Archives valides du dossier (plus recente d'abord) ; efface les .zip.part vieux de plus d'une heure."""
    if not folder or not os.path.isdir(folder):
        return []
    now = datetime.now().timestamp()
    found = []
    for n in os.listdir(folder):
        path = os.path.join(folder, n)
        low = n.lower()
        if low.endswith(".zip.part"):
            try:
                if now - os.path.getmtime(path) > STALE_PART_SECONDS:
                    os.remove(path)
            except OSError:
                pass
            continue
        if not low.endswith(".zip"):
            continue
        try:
            with zipfile.ZipFile(path, "r") as zf:
                m = json.loads(zf.read(MANIFEST).decode("utf-8"))
            if not isinstance(m, dict) or m.get("format") != FORMAT:
                continue
            found.append({"zip": path, "file": n, "kind": m.get("kind"), "name": m.get("name"),
                          "group": m.get("group"), "number": m.get("number"),
                          "created": m.get("created"), "mode": m.get("mode"),
                          "size": os.path.getsize(path), "files": m.get("files")})
        except (OSError, KeyError, ValueError, zipfile.BadZipFile):
            continue
    found.sort(key=lambda a: (a["created"] or "", a["file"]), reverse=True)
    return found


# ---- restauration ------------------------------------------------------------------

def read_manifest(zip_path):
    """Manifeste d'une archive MagicStudio ; ValueError("Not a MagicStudio archive.") sinon."""
    msg = "Not a MagicStudio archive."
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            m = json.loads(zf.read(MANIFEST).decode("utf-8"))
    except (OSError, KeyError, ValueError, zipfile.BadZipFile):
        raise ValueError(msg)
    if not isinstance(m, dict) or m.get("format") != FORMAT:
        raise ValueError(msg)
    return m


def _number_taken(mother, number):
    try:
        names = os.listdir(mother)
    except OSError:
        return False
    return any(projects.split_number(n)[0] == number and os.path.isdir(os.path.join(mother, n))
               for n in names)


def restore_target(zip_path, root, name=None, independent=False):
    """Destination de la restauration et ce qui manque : needs = None | "name" | "independent"."""
    m = read_manifest(zip_path)
    kind = m.get("kind")
    base = projects.validate_name(m.get("name"))  # le manifeste n'est pas digne de confiance
    if name is not None and str(name).strip() == "":
        name = None
    if kind == "project":
        final = projects.validate_name(name) if name is not None else base
        dest = os.path.join(root, final)
    elif kind == "sub":
        group = projects.validate_name(m.get("group"))
        number, plain = projects.split_number(base)
        if name is not None:
            plain = projects.validate_name(name)
            final = projects.numbered_name(int(number), plain) if number is not None else plain
        else:
            final = base
        mother = os.path.join(root, group)
        dest = os.path.join(mother, final)
        if projects.is_group(mother):
            if independent and number is not None and _number_taken(mother, number)                     and not os.path.lexists(dest):
                dest = os.path.join(root, final)
            elif (not os.path.lexists(dest) and number is not None and not independent
                    and _number_taken(mother, number)):
                # Un autre sous-projet porte deja ce numero : pas deux fois le meme (Final Cut _NN_).
                return {"dest": dest, "needs": "independent"}
        elif independent:
            dest = os.path.join(root, final)
        else:
            return {"dest": os.path.join(root, final), "needs": "independent"}
    else:
        raise ValueError("Not a MagicStudio archive.")
    if os.path.lexists(dest):
        return {"dest": dest, "needs": "name"}
    return {"dest": dest, "needs": None}


def _unsafe(member, top):
    """True si le nom du membre sort du dossier de tete (chemin absolu, lecteur, .. ou autre dossier)."""
    n = member.replace("\\", "/")
    if n.startswith("/") or os.path.splitdrive(n)[0] or ":" in n.split("/")[0]:
        return True
    parts = n.split("/")
    if ".." in parts or "." in parts[:-1] or "" in parts[:-1]:
        return True
    return parts[0] != top


def restore(zip_path, root, name=None, independent=False):
    """Extrait l'archive dans <destination>.part puis le renomme ; le zip n'est jamais supprime."""
    m = read_manifest(zip_path)
    t = restore_target(zip_path, root, name, independent)
    if t["needs"] is not None:
        raise ValueError("Cannot restore yet: %s is needed." % t["needs"])
    dest = t["dest"]
    top = m["name"]
    part = dest + ".part"
    with job("restore", 0, top):
        with zipfile.ZipFile(zip_path, "r") as zf:
            members = [zi for zi in zf.infolist() if zi.filename != MANIFEST]
            for zi in members:  # tout est verifie avant d'ecrire quoi que ce soit
                if _unsafe(zi.filename, top):
                    raise ValueError("Unsafe path in the archive: %s" % zi.filename)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            if os.path.lexists(part):
                # Seul un reste de restauration (repere pose a la creation) est efface ;
                # un vrai dossier du meme nom n'est jamais touche.
                if not os.path.isfile(os.path.join(part, PART_MARK)):
                    raise ValueError("A folder named %s already exists: nothing was restored."
                                     % os.path.basename(part))
                shutil.rmtree(part, onerror=_writable_then_retry)
            count = 0
            try:
                os.makedirs(part)
                with open(os.path.join(part, PART_MARK), "w", encoding="utf-8") as f:
                    f.write("MagicStudio restore in progress.\n")
                _report("restore", 0, len(members), top)
                for i, zi in enumerate(members, 1):
                    rel = zi.filename.replace("\\", "/")[len(top) + 1:]
                    if rel:
                        out = os.path.join(part, *rel.rstrip("/").split("/"))
                        if not _inside(out, part):
                            raise ValueError("Unsafe path in the archive: %s" % zi.filename)
                        if zi.is_dir():
                            os.makedirs(out, exist_ok=True)
                        else:
                            os.makedirs(os.path.dirname(out), exist_ok=True)
                            with zf.open(zi) as src, open(out, "wb") as dst:
                                shutil.copyfileobj(src, dst, 1024 * 1024)
                            with contextlib.suppress(OSError, ValueError, OverflowError):
                                ts = datetime(*zi.date_time).timestamp()
                                os.utime(out, (ts, ts))
                            count += 1
                    _report("restore", i, len(members), top)
                # Sous-dossiers manquants : le projet lui-meme, ou chacun des projets d'un MultiProject
                # (avant le renommage : une erreur ne laisse rien a la destination).
                kids = projects.project_children(part)
                for p in ([os.path.join(part, k) for k in kids] if kids else [part]):
                    projects.ensure_project(p)
                os.remove(os.path.join(part, PART_MARK))
                os.rename(part, dest)
            except BaseException:
                shutil.rmtree(part, onerror=_writable_then_retry)
                raise
    return {"dest": dest, "files": count}
