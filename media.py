"""
Chargement des medias de reference du RefLoader (sans dependance a ComfyUI,
pour pouvoir etre teste seul) : liste des fichiers d'un dossier, miniatures,
chargement image / video / audio, et package de la variante affichee (lignes
et sorties lues dans profiles.VARIANTS).

Formats produits (ceux qu'attend MiniMaxH3ReferenceToVideo) :
- IMAGE : tenseur float32 [B, H, W, 3] entre 0 et 1
- AUDIO : dict {"waveform": [1, C, L] float32, "sample_rate": int}
"""

import io
import os
import json
import math

import av
import numpy as np
import torch
from PIL import Image, ImageOps

try:
    from . import profiles
except ImportError:  # tests : module charge seul
    import profiles

# Cadence attendue par MiniMax H3 pour les videos de reference.
FPS = 24
# Duree maximale utile d'une reference (le MiniMax accepte 2 a 15 s).
MAX_SECONDS = 15.0
# Le MiniMax ramene de toute facon les videos a 768*1344 pixels au plus :
# inutile de garder plus en memoire (360 images en pleine HD = plusieurs Go).
MAX_PIXELS = 768 * 1344

KIND_EXTS = {
    "image": (".png", ".jpg", ".jpeg", ".webp", ".bmp"),
    "video": (".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"),
    "audio": (".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".opus"),
}


# ----------------------------------------------------------------------
# Etat du noeud (JSON stocke dans un widget cache)
# ----------------------------------------------------------------------
def trim_key(path):
    """Cle d'un chemin pour les rognages (identique a trimKey() du JS)."""
    return path.replace("\\", "/").lower()


def parse_root(raw):
    """Root folder de l'etat JSON ("" si absent)."""
    try:
        data = json.loads(raw) if isinstance(raw, str) else {}
    except (ValueError, TypeError):
        data = {}
    root = data.get("root") if isinstance(data, dict) else None
    return root if isinstance(root, str) else ""


def _resolve(state, kind, name):
    """Chemin complet d'un fichier (l'etat garde des chemins complets ; sinon dossier du type)."""
    return os.path.join((state.get("folders") or {}).get(kind, ""), name)


# ----------------------------------------------------------------------
# Liste des fichiers et miniatures
# ----------------------------------------------------------------------
def media_duration(path):
    """Duree en secondes (lecture des metadonnees uniquement), sinon None."""
    try:
        with av.open(path) as c:
            if c.duration:
                return c.duration / av.time_base
            for s in c.streams:
                if s.duration and s.time_base:
                    return float(s.duration * s.time_base)
    except Exception:
        pass
    return None


def list_folder(folder, kind):
    """
    Fichiers du dossier (non recursif), tries par nom, chacun avec sa
    categorie ("kind"). kind = "image" / "video" / "audio" : ce type
    seulement ; kind = "all" : tous les fichiers medias (galerie affichant
    les autres categories pour information).
    """
    if kind != "all" and kind not in KIND_EXTS:
        raise ValueError("Unknown kind: %s" % kind)
    if not folder or not os.path.isdir(folder):
        raise FileNotFoundError("Folder not found: %s" % folder)

    files = []
    for name in os.listdir(folder):
        full = os.path.join(folder, name)
        k = kind_of(name)
        if k is None or (kind != "all" and k != kind) or not os.path.isfile(full):
            continue
        st = os.stat(full)
        files.append({
            "name": name,
            "kind": k,
            "size": st.st_size,
            "mtime": st.st_mtime,
            "duration": media_duration(full) if k != "image" else None,
        })
    files.sort(key=lambda f: f["name"].lower())
    return files


def kind_of(path):
    """Type de media d'apres l'extension ("image", "video", "audio"), sinon None."""
    ext = os.path.splitext(path)[1].lower()
    for kind, exts in KIND_EXTS.items():
        if ext in exts:
            return kind
    return None


def media_info(path):
    """
    Informations affichees dans l'encadre de la fenetre de selection :
    dossier, nom, poids, et selon le type taille en pixels, duree,
    cadence, presence de son, frequence et nombre de canaux.
    """
    kind = kind_of(path)
    if kind is None:
        raise ValueError("Unsupported file type: %s" % path)
    if not os.path.isfile(path):
        raise FileNotFoundError("File not found: %s" % path)

    info = {
        "kind": kind,
        "name": os.path.basename(path),
        "folder": os.path.dirname(os.path.abspath(path)),
        "size": os.path.getsize(path),
    }
    if kind == "image":
        with Image.open(path) as img:
            w, h = ImageOps.exif_transpose(img).size
        info.update(width=w, height=h)
        return info

    info["duration"] = media_duration(path)
    with av.open(path) as c:
        if kind == "video" and c.streams.video:
            vs = c.streams.video[0]
            rate = vs.average_rate or vs.guessed_rate
            info.update(width=vs.codec_context.width, height=vs.codec_context.height,
                        fps=float(rate) if rate else None, has_audio=bool(c.streams.audio))
        if kind == "audio" and c.streams.audio:
            st = c.streams.audio[0]
            info.update(sample_rate=st.codec_context.sample_rate or st.rate, channels=st.channels)
    return info


# Garde-fou : nombre de dossiers parcourus au plus sous une racine.
MAX_SCAN_DIRS = 5000


def list_subfolders(root, kind, every=False):
    """
    Sous-dossiers de root (tous niveaux), chemins relatifs avec "/", avec
    le nombre de fichiers du type demande qu'ils contiennent directement.
    every=False : seulement ceux qui en contiennent ("" = la racine si elle
    en contient). every=True : tous, comme l'Explorateur, la racine "" en
    tete (la liste deroulante de la galerie). Les dossiers caches
    (commencant par ".") et __pycache__ sont ignores.
    """
    if kind not in KIND_EXTS:
        raise ValueError("Unknown kind: %s" % kind)
    if not root or not os.path.isdir(root):
        raise FileNotFoundError("Folder not found: %s" % root)

    exts = KIND_EXTS[kind]
    out = []
    for n, (cur, dirs, files) in enumerate(os.walk(root)):
        if n >= MAX_SCAN_DIRS:
            break
        dirs[:] = sorted((d for d in dirs if not d.startswith(".") and d != "__pycache__"), key=str.lower)
        count = sum(1 for f in files if f.lower().endswith(exts))
        if count or every:
            rel = os.path.relpath(cur, root)
            out.append({"path": "" if rel == "." else rel.replace(os.sep, "/"), "count": count})
    out.sort(key=lambda e: e["path"].lower())
    return out


def _jpeg_bytes(img, size):
    img = img.convert("RGB")
    img.thumbnail((size, size))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=82)
    return buf.getvalue()


def thumb_cache(path, query, if_none_match=None):
    """
    Cache navigateur d'une miniature (bug du 25/10/2026 : fichier remplace par un autre
    du meme nom, ancienne vignette affichee). L'etiquette (ETag) suit la date et la taille
    du fichier. Avec la date dans l'URL (mt= ou t=), la miniature est gardee un jour ;
    sans elle, le navigateur redemande toujours, et "not_modified" dit si l'on peut
    repondre 304 sans refaire la miniature.
    """
    st = os.stat(path)
    etag = '"%x-%x"' % (st.st_mtime_ns, st.st_size)
    versioned = bool(query.get("mt") or query.get("t"))
    return {
        "etag": etag,
        "not_modified": if_none_match == etag,
        "headers": {"Cache-Control": "max-age=86400" if versioned else "no-cache", "ETag": etag},
    }


def make_thumbnail(path, size=192):
    """Miniature JPEG : l'image elle-meme, ou la premiere image d'une video."""
    ext = os.path.splitext(path)[1].lower()
    if ext in KIND_EXTS["image"]:
        with Image.open(path) as img:
            return _jpeg_bytes(ImageOps.exif_transpose(img), size)
    if ext in KIND_EXTS["video"]:
        with av.open(path) as c:
            for frame in c.decode(video=0):
                return _jpeg_bytes(frame.to_image(), size)
        raise ValueError("No video frame in %s" % path)
    raise ValueError("No thumbnail for this file type: %s" % path)


# ----------------------------------------------------------------------
# Chargement
# ----------------------------------------------------------------------
def load_image(path):
    """Image -> tenseur [1, H, W, 3] (orientation EXIF appliquee, alpha ignore)."""
    with Image.open(path) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        arr = np.asarray(img, dtype=np.float32) / 255.0
    return torch.from_numpy(arr.copy())[None, ...]


def _target_size(width, height, max_pixels):
    """Taille reduite (jamais agrandie) a max_pixels, ratio garde, cotes pairs."""
    scale = min(1.0, math.sqrt(max_pixels / float(width * height)))
    tw = max(2, int(width * scale) // 2 * 2)
    th = max(2, int(height * scale) // 2 * 2)
    return tw, th


def _decode_audio(container, max_seconds, start=0.0):
    """
    Piste son d'un conteneur deja ouvert -> dict AUDIO, ou None sans piste.
    Garde max_seconds a partir de start (secondes depuis le debut du fichier).
    """
    if not container.streams.audio:
        return None
    stream = container.streams.audio[0]
    sr = stream.codec_context.sample_rate or stream.rate
    skip = int(round(max(0.0, start) * sr))
    max_samples = int(round(max_seconds * sr)) if max_seconds else None
    # Conversion en float planaire : (canaux, echantillons) quel que soit le format source.
    resampler = av.AudioResampler(format="fltp")

    chunks = []
    total = 0

    def add(frames):
        nonlocal total
        for f in frames:
            arr = f.to_ndarray()
            chunks.append(arr)
            total += arr.shape[1]

    for frame in container.decode(stream):
        add(resampler.resample(frame))
        if max_samples is not None and total >= skip + max_samples:
            break
    else:
        add(resampler.resample(None))

    if not chunks:
        return None
    wav = torch.from_numpy(np.concatenate(chunks, axis=1).astype(np.float32))
    wav = wav[:, skip:] if max_samples is None else wav[:, skip:skip + max_samples]
    if wav.shape[1] == 0:
        return None
    return {"waveform": wav[None, ...].contiguous(), "sample_rate": int(sr)}


def _trim_length(max_seconds, start, end):
    """Duree gardee : max_seconds, ou moins si une fin de rognage est donnee."""
    if end is not None and end > start:
        return min(max_seconds, end - start)
    return max_seconds


def load_audio(path, max_seconds=MAX_SECONDS, start=0.0, end=None):
    """Fichier audio -> dict AUDIO : portion [start, end] coupee a max_seconds."""
    with av.open(path) as c:
        audio = _decode_audio(c, _trim_length(max_seconds, start, end), start)
    if audio is None:
        raise ValueError("No audio stream in %s" % path)
    return audio


def load_video(path, with_audio=False, max_seconds=MAX_SECONDS, max_pixels=MAX_PIXELS,
               start=0.0, end=None, fps=FPS, multiple=1):
    """
    Video -> (images [N, H, W, 3] a 'fps' ips (24 par defaut), piste son ou None).

    multiple > 1 : cotes ramenes a un multiple de 'multiple' (profiles.fit_size).
    Reechantillonnage : chaque instant k/fps recoit la derniere image source
    affichee a cet instant (images repetees sous 24 ips, sautees au-dessus).
    Rognage : seule la portion [start, end] (secondes) est gardee, coupee a
    max_seconds. La piste son est coupee a la meme portion que les images.
    """
    start = max(0.0, float(start or 0.0))
    max_frames = max(1, int(round(_trim_length(max_seconds, start, end) * fps)))
    eps = 1e-3

    with av.open(path) as c:
        if not c.streams.video:
            raise ValueError("No video stream in %s" % path)
        vs = c.streams.video[0]
        vs.thread_type = "AUTO"
        src_fps = float(vs.average_rate or vs.guessed_rate or fps)
        vw, vh = vs.codec_context.width, vs.codec_context.height
        if not vw or not vh:
            raise ValueError("No video frame decoded from %s" % path)
        if multiple > 1:
            # budget de pixels passe a fit_size sous la forme [max_pixels, 1]
            tw, th = profiles.fit_size(vw, vh, [max_pixels, 1], multiple)
        else:
            tw, th = _target_size(vw, vh, max_pixels)

        out = []
        pending = None      # derniere image source decodee (pas encore convertie)
        pending_arr = None
        pending_t = 0.0
        # Origine des temps : debut du flux (ou premiere image decodee).
        t0 = float(vs.start_time * vs.time_base) if vs.start_time is not None else None
        if start > 0 and t0 is not None:
            # Saut a l'image cle precedant le debut du rognage.
            c.seek(int((t0 + start) / float(vs.time_base)), stream=vs, backward=True)

        def emit_until(limit):
            nonlocal pending_arr
            while len(out) < max_frames and len(out) / fps < limit - eps:
                if pending_arr is None:
                    pending_arr = pending.reformat(width=tw, height=th, format="rgb24").to_ndarray()
                out.append(pending_arr)

        for idx, frame in enumerate(c.decode(vs)):
            t = frame.time if frame.time is not None else idx / src_fps
            if t0 is None:
                t0 = t
            # Temps relatif au debut du rognage : l'image affichee a cet
            # instant (meme anterieure) devient l'image 0.
            t -= t0 + start
            if pending is not None and t > 0:
                emit_until(t)
                if len(out) >= max_frames:
                    break
            pending, pending_arr, pending_t = frame, None, t
        else:
            if pending is not None:
                emit_until(pending_t + 1.0 / src_fps)

    if not out:
        raise ValueError("No video frame decoded from %s" % path)
    frames = torch.from_numpy(np.stack(out)).float().div_(255.0)

    audio = None
    if with_audio:
        with av.open(path) as c:
            audio = _decode_audio(c, len(out) / fps, start)
    return frames, audio


# ----------------------------------------------------------------------
# Construction des sorties du noeud
# ----------------------------------------------------------------------
def _checked(state, kind, name, key):
    path = _resolve(state, kind, name)
    if not os.path.isfile(path):
        raise FileNotFoundError("%s: file not found: %s" % (key, path))
    return path


# ----------------------------------------------------------------------
# Variantes (plan des variantes, 29/10/2026) : package du RefLoader
# Un seul chemin de calcul pour toutes les variantes, lu dans la description
# (profiles.VARIANTS).
# ----------------------------------------------------------------------
def parse_variant_state(raw):
    """Etat JSON du widget -> etat au format des variantes (anciens etats convertis)."""
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except (ValueError, TypeError):
        data = {}
    return profiles.migrate_state(data if isinstance(data, dict) else {})


def _variant_trim(sel, row_id, name):
    t = (sel.get("trims") or {}).get(row_id, {}).get(trim_key(name))
    return (t[0], t[1]) if t else (0.0, None)


def _row_moments(sel, row, names):
    """Moment (secondes, -1 = Last) de chaque fichier de la ligne : memorise, sinon regle par defaut."""
    stored = (sel.get("moments") or {}).get(row["id"], {})
    if row.get("moment") != "frame":
        return [stored.get(trim_key(n), 0.0) for n in names]
    # Image sans moment choisi : First s'il est libre, sinon Last (moments memorises d'abord).
    used = [stored[trim_key(n)] for n in names if trim_key(n) in stored]
    out = []
    for n in names:
        m = stored.get(trim_key(n))
        if m is None:
            m = profiles.default_moment(used)
            used.append(m)
        out.append(m)
    return out


def variant_selected_paths(state):
    """Chemins complets des fichiers de la variante affichee."""
    v = profiles.variant_of(state)
    lim = profiles.variant_limits(state, v)
    paths = []
    for row in profiles.rows_of(v):
        for name in profiles.row_list(state, row["id"], v)[:lim["counts"][row["id"]]]:
            paths.append(_resolve(state, row["kind"], name))
    return paths


def variant_signature(state):
    """Empreinte de l'etat + dates de modification des fichiers de la variante (IS_CHANGED)."""
    stamps = []
    for p in variant_selected_paths(state):
        try:
            stamps.append(os.path.getmtime(p))
        except OSError:
            stamps.append(None)
    return json.dumps([state, stamps], sort_keys=True)


def build_package(state):
    """
    Charge les fichiers de la variante affichee : {"variant", "layout": [noms des sorties],
    "values": {nom: valeur}} ; reglages compris, None pour une sortie sans fichier. Les erreurs
    nomment la sortie. Le Container renvoie ces valeurs sans rien recharger.
    """
    v = profiles.variant_of(state)
    lim = profiles.variant_limits(state, v)
    sel = (state.get("selections") or {}).get(v) or {}
    fps, seconds, step = lim["fps"], lim["seconds"], lim["frame_step"]
    pixels = lim["max_size"][0] * lim["max_size"][1]
    layout = profiles.variant_layout(state)
    rows = {r["id"]: r for r in profiles.rows_of(v)}
    names = {rid: profiles.row_list(state, rid, v)[:lim["counts"][rid]] for rid in rows}
    moments = {rid: _row_moments(sel, rows[rid], names[rid]) for rid in rows if rows[rid].get("moment")}
    values = {}
    for out in layout:
        key, value = out["key"], out["value"]
        if out["row"] is None:
            values[key] = profiles.setting_value(value, lim)
            continue
        row, i = rows[out["row"]], out["index"]
        if i >= len(names[row["id"]]):
            values[key] = None
            continue
        name = names[row["id"]][i]
        if value == "frame":
            frame = profiles.seconds_to_frame(moments[row["id"]][i], fps, seconds)
            values[key] = profiles.step_frame(frame, step) if row.get("moment") == "video_frame" else frame
            continue
        path = _checked(state, row["kind"], name, key)
        start, end = _variant_trim(sel, row["id"], name)
        if value == "image":
            values[key] = load_image(path)
        elif value == "video_frames":
            frames, _ = load_video(path, max_seconds=seconds, max_pixels=pixels, start=start, end=end,
                                   fps=fps, multiple=lim["multiple"])
            values[key] = frames[:profiles.frames_step(frames.shape[0], step)] if step > 1 else frames
        elif value == "audio":
            try:
                values[key] = load_audio(path, max_seconds=seconds, start=start, end=end)
            except ValueError:
                raise ValueError("%s: no soundtrack in %s" % (key, path))
        else:
            raise ValueError("%s: unknown value %s" % (key, value))
    return {"variant": v, "layout": [o["key"] for o in layout], "values": values}
