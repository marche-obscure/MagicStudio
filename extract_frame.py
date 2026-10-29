"""
Extract Frame (sans ComfyUI) : lit des images dans la video du Picture Lock (40.Rush Videos),
les ecrit en PNG, note la video d'origine (.extract.json) et applique les regles quand cette
video change. Numerotation des images a partir de 0. Rien n'est supprime sans la Corbeille.
"""

import functools
import json
import os
import threading

import av

try:
    from . import projects
    from . import run_record
except ImportError:  # tests : module charge seul
    import projects
    import run_record

STATE_FILE = ".extract.json"
PREFIXES = ("FIRST_FRAME_", "LAST_FRAME_", "FRAME_")

_INFO_CACHE = {}


# --- exclusion mutuelle par projet ----------------------------------------------------------
# Un seul verrou (RLock, donc re-entrant) par projet. Il est pris ici par extract, check_lock_change
# et replace_first_last, et par la route sort_output autour du tri ET du controle qui suit : une
# lecture des Runs ne peut pas tomber au milieu d'un tri (video momentanement absente du Picture Lock).
_LOCKS = {}
_LOCKS_GUARD = threading.Lock()


def lock_for(project):
    key = os.path.normcase(os.path.abspath(project))
    with _LOCKS_GUARD:
        if key not in _LOCKS:
            _LOCKS[key] = threading.RLock()
        return _LOCKS[key]


def _locked(fn):
    @functools.wraps(fn)
    def wrapper(project, *args, **kwargs):
        with lock_for(project):
            return fn(project, *args, **kwargs)
    return wrapper


def _flag(body, key):
    v = body.get(key, False)
    if not isinstance(v, bool):
        raise ValueError("'%s' must be true or false" % key)
    return v


def parse_request(body):
    """Corps de POST /mmproject/extract -> (which, n, overwrite) ; ValueError si invalide."""
    if not isinstance(body, dict):
        raise ValueError("Invalid request body")
    n = body.get("n")
    if n is not None and (isinstance(n, bool) or not isinstance(n, int)):
        raise ValueError("'n' must be a whole number")
    return str(body.get("which", "")), n, _flag(body, "overwrite")


def parse_keep(body):
    """Corps de POST /mmproject/extract/replace -> keep (bool) ; ValueError si invalide."""
    if not isinstance(body, dict):
        raise ValueError("Invalid request body")
    return _flag(body, "keep")


def extract_dir(project):
    return os.path.join(project, *projects.EXTRACT_DIR)


def lock_video(project):
    """Chemin de LA video du Picture Lock de 40.Rush Videos ; None si aucune ou plus d'une."""
    files = run_record.lock_files(project, "video")
    if len(files) != 1 or os.path.splitext(files[0])[1].lower() not in run_record.VIDEO_EXTS:
        return None
    return files[0]


def video_info(path):
    """{"frames", "fps", "width", "height"} ; images comptees en decodant si le flux ne les donne pas."""
    st = os.stat(path)
    key = (os.path.abspath(path), st.st_size, st.st_mtime)
    if key in _INFO_CACHE:
        return dict(_INFO_CACHE[key])
    with av.open(path) as c:
        s = c.streams.video[0]
        frames = int(s.frames or 0)
        fps = float(s.average_rate) if s.average_rate else 0.0
        width, height = int(s.codec_context.width), int(s.codec_context.height)
    if frames <= 0:
        with av.open(path) as c:
            frames = sum(1 for _ in c.decode(video=0))
    info = {"frames": frames, "fps": fps, "width": width, "height": height}
    _INFO_CACHE[key] = info
    return dict(info)


def frame_name(which, project, n=None):
    base = os.path.basename(os.path.normpath(project))
    if which == "first":
        return "FIRST_FRAME_%s.png" % base
    if which == "last":
        return "LAST_FRAME_%s.png" % base
    if which == "n":
        return "FRAME_%04d_%s.png" % (n, base)
    raise ValueError("Unknown frame kind: %s" % which)


def targets(which, total, n):
    if which == "first":
        return [("first", 0)]
    if which == "last":
        return [("last", total - 1)]
    if which == "fl":
        return [("first", 0), ("last", total - 1)]
    if which == "n":
        if isinstance(n, bool) or not isinstance(n, int):
            raise ValueError("Frame number must be a whole number")
        if n < 0 or n >= total:
            raise ValueError("Frame number must be between 0 and %d" % (total - 1))
        return [("n", n)]
    raise ValueError("Unknown choice: %s" % which)


# --- etat .extract.json -------------------------------------------------------------------

def _identity(path):
    st = os.stat(path)
    return {"video": os.path.basename(path), "size": st.st_size, "mtime": st.st_mtime}


def _same_video(state, path):
    if not state or not path or not state.get("video"):
        return False
    ident = _identity(path)
    return all(state.get(k) == ident[k] for k in ("video", "size", "mtime"))


def _read_state(project):
    try:
        with open(os.path.join(extract_dir(project), STATE_FILE), "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else None
    except (OSError, ValueError):
        return None


def _dump_state(project, data):
    """Ecriture atomique : fichier temporaire dans le meme dossier puis os.replace."""
    folder = extract_dir(project)
    os.makedirs(folder, exist_ok=True)
    tmp = os.path.join(folder, STATE_FILE + ".tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    os.replace(tmp, os.path.join(folder, STATE_FILE))


def _write_state(project, video_path, frames):
    data = _identity(video_path) if video_path else {"video": None, "size": None, "mtime": None}
    data["frames"] = frames
    _dump_state(project, data)


def _extraction_files(project):
    """Noms des PNG d'extraction (les seuls fichiers que le module touche)."""
    folder = extract_dir(project)
    if not os.path.isdir(folder):
        return []
    return sorted(n for n in os.listdir(folder)
                  if n.lower().endswith(".png") and n.startswith(PREFIXES)
                  and os.path.isfile(os.path.join(folder, n)))


def listing(project):
    """[{"name", "frame"}] des PNG d'extraction ; frame = numero note dans .extract.json, None si inconnu."""
    frames = (_read_state(project) or {}).get("frames") or {}
    out = []
    for n in _extraction_files(project):
        v = frames.get(n)
        out.append({"name": n, "frame": v if isinstance(v, int) else None})
    return out


# --- lecture des images -------------------------------------------------------------------

def _read_frames(path, wanted):
    """{numero: image PIL RGB}, en decodant dans l'ordre ; au-dela de la fin : derniere image lue."""
    want = set(wanted)
    top = max(want)
    out = {}
    last_img = None
    last_i = -1
    with av.open(path) as c:
        for i, fr in enumerate(c.decode(video=0)):
            last_i = i
            if i in want or i == top:
                last_img = fr.to_image().convert("RGB")
                if i in want:
                    out[i] = last_img
            if i >= top:
                break
    for i in want:
        if i not in out:
            if last_img is None:
                raise ValueError("The video has no readable frame")
            out[i] = last_img
    return out


def _save(project, video, items, overwrite):
    """items : [(nom, numero)] -> {"written", "exists"} ; met a jour l'etat."""
    folder = extract_dir(project)
    os.makedirs(folder, exist_ok=True)
    written, exists, todo = [], [], []
    for name, num in items:
        if os.path.exists(os.path.join(folder, name)) and not overwrite:
            exists.append(name)
        else:
            todo.append((name, num))
    if todo:
        imgs = _read_frames(video, [num for _, num in todo])
        for name, num in todo:
            imgs[num].save(os.path.join(folder, name), "PNG")
            written.append(name)
        state = _read_state(project)
        frames = dict(state.get("frames") or {}) if _same_video(state, video) else {}
        frames.update(dict(todo))
        _write_state(project, video, frames)
    return {"written": written, "exists": exists}


@_locked
def extract(project, which, n=None, overwrite=False):
    video = lock_video(project)
    if video is None:
        raise ValueError("Picture Lock: keep one file")
    state = _read_state(project)
    if state and state.get("video") and not _same_video(state, video) and _extraction_files(project):
        # La video a change et check_lock_change n'a pas encore tranche : on n'ecrit rien.
        raise ValueError("The Picture Lock video changed: check the Extract Frame folder first")
    total = video_info(video)["frames"]
    items = [(frame_name(kind, project, num if kind == "n" else None), num)
             for kind, num in targets(which, total, n)]
    return _save(project, video, items, overwrite)


# --- changement de video ------------------------------------------------------------------

def _trash(trash_fn, folder, names):
    """None si tout va bien, sinon le message d'erreur (rien n'est alors supprime)."""
    if not names:
        return None
    if trash_fn is None:
        return "Recycle Bin not available: nothing was deleted"
    try:
        # Echec partiel possible (certains fichiers deja a la Corbeille) : on ne note rien, l'etat
        # reste inchange et le prochain appel recalcule la liste depuis le dossier, donc finit le travail.
        trash_fn([os.path.join(folder, n) for n in names])
    except Exception as e:  # noqa: BLE001 - la Corbeille peut echouer de bien des facons
        return str(e) or "Could not move the files to the Recycle Bin"
    return None


@_locked
def check_lock_change(project, trash_fn):
    """Regles de la section 6 de la spec ; seuls les PNG aux PREFIXES sont touches."""
    res = {"emptied": [], "deleted": [], "ask_replace": [], "trash_error": None}
    lock_folder = os.path.join(project, run_record.RUSH_VIDEOS, run_record.SORT_FOLDERS[run_record.LOCK])
    if os.path.isdir(lock_folder) and any(n.lower().endswith(".part") for n in os.listdir(lock_folder)):
        return res  # copie en cours : la video n'est pas encore la, on ne decide rien
    folder = extract_dir(project)
    names = _extraction_files(project)
    state = _read_state(project)
    cur = lock_video(project)
    if cur is None and run_record.lock_files(project, "video"):
        return res  # plusieurs fichiers : rien ne bouge (avertissement ailleurs)

    if state is None:
        if names and cur:  # extractions sans etat : la video actuelle en est la source
            _write_state(project, cur, {})
        return res
    if cur is not None and _same_video(state, cur):
        return res
    if cur is None and not state.get("video"):
        return res  # deja vide

    frames = {k: v for k, v in (state.get("frames") or {}).items() if k in names}
    if cur is None:  # video retiree, pas de remplacant : tout est vide
        err = _trash(trash_fn, folder, names)
        if err:
            res["trash_error"] = err
            return res
        res["emptied"] = names
        _write_state(project, None, {})
        return res

    firstlast = [n for n in names if n.startswith(("FIRST_FRAME_", "LAST_FRAME_"))]
    numbered = [n for n in names if n not in firstlast]
    err = _trash(trash_fn, folder, numbered)
    if err:
        res["trash_error"] = err
        return res
    res["deleted"] = numbered
    for n in numbered:
        frames.pop(n, None)
    if firstlast:  # l'ancienne video reste notee jusqu'a la reponse
        res["ask_replace"] = firstlast
        old = dict(state)
        old["frames"] = frames
        _dump_state(project, old)
    else:
        _write_state(project, cur, {})
    return res


@_locked
def replace_first_last(project, keep):
    """keep=False : FIRST/LAST presents sont reextraits de la nouvelle video ; keep=True : gardes."""
    video = lock_video(project)
    if video is None:
        raise ValueError("Picture Lock: keep one file")
    frames = dict((_read_state(project) or {}).get("frames") or {})
    written = []
    if not keep:
        total = video_info(video)["frames"]
        folder = extract_dir(project)
        items = []
        for kind, num in (("first", 0), ("last", total - 1)):
            name = frame_name(kind, project)
            if os.path.isfile(os.path.join(folder, name)):
                items.append((name, num))
        if items:
            imgs = _read_frames(video, [num for _, num in items])
            for name, num in items:
                imgs[num].save(os.path.join(folder, name), "PNG")
                frames[name] = num
                written.append(name)
    _write_state(project, video, frames)
    return {"written": written}
