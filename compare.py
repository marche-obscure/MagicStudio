"""
Logique pure du noeud MagicStudio Image / Video Compare (31/10/2026) : lecture de l'etat,
type et source de chaque cote, cote choisi, signature (IS_CHANGED) et apercus des entrees
branchees. Sans ComfyUI : le noeud (nodes.py) fournit les dossiers et les images.
Les regles de parse_state / chosen_side sont reprises a l'identique par le JS
(tests/compare_cases.json).
"""

import json
import os
import re
from fractions import Fraction

try:
    from . import load_media
    from . import media
    from . import run_record
except ImportError:  # tests : modules charges seuls
    import load_media
    import media
    import run_record

MODES = ("side", "lr", "rl", "ud")
SIDES = ("A", "B")
PREVIEW_DIR = "magicstudio_compare"
PREVIEW_FPS = 24  # cadence des apercus faits depuis des frames


def _side_state(raw):
    """{"path", "kind"} d'un cote : textes seulement, type connu sinon vide."""
    raw = raw if isinstance(raw, dict) else {}
    path = raw.get("path")
    kind = raw.get("kind")
    return {"path": path if isinstance(path, str) else "",
            "kind": kind if kind in ("image", "video") else ""}


def parse_state(raw):
    """Etat du widget state (texte JSON ou objet) avec les valeurs sures par defaut."""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            raw = {}
    if not isinstance(raw, dict):
        raw = {}
    mode = raw.get("mode")
    sync = raw.get("sync")
    star = raw.get("star")
    return {
        "version": 1,
        "a": _side_state(raw.get("a")),
        "b": _side_state(raw.get("b")),
        "mode": mode if mode in MODES else "side",
        "sync": sync if isinstance(sync, bool) else True,
        "star": star if star in SIDES else "",
    }


def input_kind(video=None, frames=None):
    """Type d'une entree branchee : video -> video ; frames -> image si 1 image, sinon video."""
    if video is not None:
        return "video"
    if frames is not None:
        return "image" if frames.shape[0] == 1 else "video"
    return None


def side_source(side, state, video=None, frames=None):
    """
    {"from": "input" | "file" | None, "kind", "path"} d'un cote. Une entree branchee gagne
    sur le fichier du meme cote (le fichier reste dans state).
    """
    if video is not None and frames is not None:
        raise ValueError("Side %s already has an input" % side)
    if video is not None or frames is not None:
        return {"from": "input", "kind": input_kind(video, frames), "path": ""}
    path = state["a" if side == "A" else "b"]["path"].strip()
    if not path:
        return {"from": None, "kind": None, "path": ""}
    name = os.path.basename(path.replace("\\", "/"))
    kind = media.kind_of(path)
    if kind == "audio":
        raise ValueError("Audio files cannot be compared: " + name)
    if kind is None:
        raise ValueError("Unsupported file type: " + name)
    return {"from": "file", "kind": kind, "path": path}


def check_kinds(src_a, src_b):
    """Type commun des deux cotes presents (None si aucun) ; ValueError s'ils different."""
    kinds = [s["kind"] for s in (src_a, src_b) if s["from"] is not None]
    if len(set(kinds)) > 1:
        raise ValueError("A and B must both be images or both be videos")
    return kinds[0] if kinds else None


def chosen_side(star, has_a, has_b):
    """Cote choisi : l'etoile s'il a une source, sinon A ; si vide, l'autre ; aucun -> ValueError."""
    has = {"A": has_a, "B": has_b}
    side = star if star in SIDES and has[star] else "A"
    if not has[side]:
        side = "B" if side == "A" else "A"
    if not has[side]:
        raise ValueError("Pick or wire at least one source")
    return side


def signature(state_text):
    """Change avec les cotes, chemins, etoile et fichiers (date, taille) ; pas avec mode ni sync."""
    s = parse_state(state_text)
    parts = [s["star"]]
    for key in ("a", "b"):
        path = s[key]["path"]
        parts.append(path + "|" + (load_media.signature(path) if path else ""))
    return "\n".join(parts)


def preview_path(temp_dir, unique_id, side, kind):
    """<temp>/magicstudio_compare/<unique_id nettoye>_<A|B>.mp4 (video) ou .png (image)."""
    uid = re.sub(r"[^A-Za-z0-9_-]", "_", str(unique_id if unique_id is not None else "")) or "node"
    return os.path.join(temp_dir, PREVIEW_DIR, "%s_%s.%s" % (uid, side, "png" if kind == "image" else "mp4"))


def _frame_array(images, i):
    """Image i d'un tenseur [N, H, W, 3] (0..1) -> tableau uint8 [H, W, 3]."""
    import numpy as np
    return (np.clip(images[i].cpu().numpy()[..., :3], 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)


def write_preview(path, kind, images, fps=None):
    """Ecrit l'apercu : PNG (premiere image) ou MP4 H.264 yuv420p (taille bornee par run_record.fit_size)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if kind == "image":
        from PIL import Image
        Image.fromarray(_frame_array(images, 0)).save(path, format="PNG")
        return
    import av
    count, height, width = int(images.shape[0]), int(images.shape[1]), int(images.shape[2])
    size = run_record.fit_size(width, height) or (max(2, width // 2 * 2), max(2, height // 2 * 2))
    rate = Fraction(fps or PREVIEW_FPS).limit_denominator(1000)
    part = path + ".part.mp4"
    try:
        with av.open(part, "w", format="mp4") as out:
            stream = out.add_stream("libx264", rate=rate)
            stream.width, stream.height = size
            stream.pix_fmt = "yuv420p"
            stream.options = {"crf": "18", "preset": "medium"}
            for i in range(count):
                frame = av.VideoFrame.from_ndarray(_frame_array(images, i), format="rgb24")
                frame = frame.reformat(width=size[0], height=size[1], format="yuv420p")
                for p in stream.encode(frame):
                    out.mux(p)
            for p in stream.encode(None):
                out.mux(p)
        os.replace(part, path)
    finally:
        if os.path.exists(part):
            os.remove(part)
