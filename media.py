"""
Chargement des medias de reference pour MiniMax H3 (sans dependance a
ComfyUI, pour pouvoir etre teste seul) : liste des fichiers d'un dossier,
miniatures, chargement image / video (24 ips) / audio, et disposition des
sorties du noeud.

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

# Cadence attendue par MiniMax H3 pour les videos de reference.
FPS = 24
# Duree maximale utile d'une reference (le MiniMax accepte 2 a 15 s).
MAX_SECONDS = 15.0
# Le MiniMax ramene de toute facon les videos a 768*1344 pixels au plus :
# inutile de garder plus en memoire (360 images en pleine HD = plusieurs Go).
MAX_PIXELS = 768 * 1344

# Plafonds des entrees du noeud MiniMaxH3ReferenceToVideo.
MAX_IMAGES = 9
MAX_VIDEOS = 3
MAX_AUDIOS = 3
TOTAL_OUTPUTS = MAX_IMAGES + MAX_VIDEOS * 2 + MAX_AUDIOS

KIND_EXTS = {
    "image": (".png", ".jpg", ".jpeg", ".webp", ".bmp"),
    "video": (".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"),
    "audio": (".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".opus"),
}


# ----------------------------------------------------------------------
# Disposition des sorties
# ----------------------------------------------------------------------
def layout_keys(n_images, n_videos, n_audios):
    """
    Noms des sorties visibles, dans l'ordre : images, videos, pistes son
    des videos, audios. Chaque groupe garde au moins une sortie ; les
    pistes son suivent toujours le nombre de videos (ref_video_audio_N va
    avec ref_video_N). Doit rester identique a layoutKeys() du JS.
    """
    ni = min(max(1, n_images), MAX_IMAGES)
    nv = min(max(1, n_videos), MAX_VIDEOS)
    na = min(max(1, n_audios), MAX_AUDIOS)
    keys = ["ref_image_%d" % i for i in range(1, ni + 1)]
    keys += ["ref_video_%d" % i for i in range(1, nv + 1)]
    keys += ["ref_video_audio_%d" % i for i in range(1, nv + 1)]
    keys += ["ref_audio_%d" % i for i in range(1, na + 1)]
    return keys


# ----------------------------------------------------------------------
# Etat du noeud (JSON stocke dans un widget cache)
# ----------------------------------------------------------------------
def _clean_name(value):
    return value.strip() if isinstance(value, str) else ""


def parse_state(raw):
    """Lit l'etat JSON du noeud en le normalisant (valeurs invalides ignorees)."""
    try:
        data = json.loads(raw) if isinstance(raw, str) else {}
    except (ValueError, TypeError):
        data = {}
    if not isinstance(data, dict):
        data = {}

    folders_in = data.get("folders") if isinstance(data.get("folders"), dict) else {}
    folders = {kind: _clean_name(folders_in.get(kind)) for kind in KIND_EXTS}

    images = [n for n in (_clean_name(v) for v in _as_list(data.get("images"))) if n]
    audios = [n for n in (_clean_name(v) for v in _as_list(data.get("audios"))) if n]

    videos = []
    for v in _as_list(data.get("videos")):
        if isinstance(v, dict):
            name, sound = _clean_name(v.get("file")), bool(v.get("sound"))
        else:
            name, sound = _clean_name(v), False
        if name:
            videos.append({"file": name, "sound": sound})

    return {
        "folders": folders,
        "images": images[:MAX_IMAGES],
        "videos": videos[:MAX_VIDEOS],
        "audios": audios[:MAX_AUDIOS],
    }


def _as_list(value):
    return value if isinstance(value, list) else []


def _resolve(state, kind, name):
    return os.path.join(state["folders"].get(kind, ""), name)


def selected_paths(state):
    """Chemins complets de tous les fichiers selectionnes."""
    paths = [_resolve(state, "image", n) for n in state["images"]]
    paths += [_resolve(state, "video", v["file"]) for v in state["videos"]]
    paths += [_resolve(state, "audio", n) for n in state["audios"]]
    return paths


def state_signature(state):
    """Empreinte de l'etat + dates de modification (pour IS_CHANGED)."""
    stamps = []
    for p in selected_paths(state):
        try:
            stamps.append(os.path.getmtime(p))
        except OSError:
            stamps.append(None)
    return json.dumps([state, stamps], sort_keys=True)


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
    """Fichiers du type demande dans le dossier (non recursif), tries par nom."""
    if kind not in KIND_EXTS:
        raise ValueError("Unknown kind: %s" % kind)
    if not folder or not os.path.isdir(folder):
        raise FileNotFoundError("Folder not found: %s" % folder)

    exts = KIND_EXTS[kind]
    files = []
    for name in os.listdir(folder):
        full = os.path.join(folder, name)
        if not name.lower().endswith(exts) or not os.path.isfile(full):
            continue
        st = os.stat(full)
        files.append({
            "name": name,
            "size": st.st_size,
            "mtime": st.st_mtime,
            "duration": media_duration(full) if kind != "image" else None,
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


def _decode_audio(container, max_seconds):
    """Piste son d'un conteneur deja ouvert -> dict AUDIO, ou None sans piste."""
    if not container.streams.audio:
        return None
    stream = container.streams.audio[0]
    sr = stream.codec_context.sample_rate or stream.rate
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
        if max_samples is not None and total >= max_samples:
            break
    else:
        add(resampler.resample(None))

    if not chunks:
        return None
    wav = torch.from_numpy(np.concatenate(chunks, axis=1).astype(np.float32))
    if max_samples is not None:
        wav = wav[:, :max_samples]
    return {"waveform": wav[None, ...].contiguous(), "sample_rate": int(sr)}


def load_audio(path, max_seconds=MAX_SECONDS):
    """Fichier audio -> dict AUDIO, coupe a max_seconds."""
    with av.open(path) as c:
        audio = _decode_audio(c, max_seconds)
    if audio is None:
        raise ValueError("No audio stream in %s" % path)
    return audio


def load_video(path, with_audio=False, max_seconds=MAX_SECONDS, max_pixels=MAX_PIXELS):
    """
    Video -> (images [N, H, W, 3] a 24 ips, piste son ou None).

    Reechantillonnage : chaque instant k/24 recoit la derniere image source
    affichee a cet instant (images repetees sous 24 ips, sautees au-dessus).
    La piste son est coupee a la duree des images gardees.
    """
    max_frames = max(1, int(round(max_seconds * FPS)))
    eps = 1e-3

    with av.open(path) as c:
        if not c.streams.video:
            raise ValueError("No video stream in %s" % path)
        vs = c.streams.video[0]
        vs.thread_type = "AUTO"
        src_fps = float(vs.average_rate or vs.guessed_rate or FPS)
        tw, th = _target_size(vs.codec_context.width, vs.codec_context.height, max_pixels)

        out = []
        pending = None      # derniere image source decodee (pas encore convertie)
        pending_arr = None
        pending_t = 0.0
        t0 = None

        def emit_until(limit):
            nonlocal pending_arr
            while len(out) < max_frames and len(out) / FPS < limit - eps:
                if pending_arr is None:
                    pending_arr = pending.reformat(width=tw, height=th, format="rgb24").to_ndarray()
                out.append(pending_arr)

        for idx, frame in enumerate(c.decode(vs)):
            t = frame.time if frame.time is not None else idx / src_fps
            if t0 is None:
                t0 = t
            t -= t0
            if pending is not None:
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
            audio = _decode_audio(c, len(out) / FPS)
    return frames, audio


# ----------------------------------------------------------------------
# Construction des sorties du noeud
# ----------------------------------------------------------------------
def _checked(state, kind, name, key):
    path = _resolve(state, kind, name)
    if not os.path.isfile(path):
        raise FileNotFoundError("%s: file not found: %s" % (key, path))
    return path


def build_outputs(state):
    """
    Charge les fichiers selectionnes et renvoie un tuple de TOTAL_OUTPUTS
    valeurs : d'abord celles des sorties visibles (ordre de layout_keys),
    puis None pour les sorties inutilisees.
    """
    values = {}
    for i, name in enumerate(state["images"], 1):
        key = "ref_image_%d" % i
        values[key] = load_image(_checked(state, "image", name, key))
    for i, v in enumerate(state["videos"], 1):
        key = "ref_video_%d" % i
        frames, audio = load_video(_checked(state, "video", v["file"], key), with_audio=v["sound"])
        values[key] = frames
        values["ref_video_audio_%d" % i] = audio
    for i, name in enumerate(state["audios"], 1):
        key = "ref_audio_%d" % i
        values[key] = load_audio(_checked(state, "audio", name, key))

    keys = layout_keys(len(state["images"]), len(state["videos"]), len(state["audios"]))
    out = [values.get(k) for k in keys]
    out += [None] * (TOTAL_OUTPUTS - len(out))
    return tuple(out)
