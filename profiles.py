"""
Profils de modele (MiniMax H3, LTX 2.x) : limites, disposition des sorties
et calculs d'images. Module pur : pas de torch, av, numpy ni ComfyUI.
Miroir JS : web/js/profiles.js (memes cas dans tests/profile_cases.json).
"""

import math

PROFILES = ("minimax_h3", "ltx2")
DEFAULT_PROFILE = "minimax_h3"
LABELS = {"minimax_h3": "MiniMax H3", "ltx2": "LTX 2.x"}

DEFAULT_LIMITS = {
    "minimax_h3": {"image": 9, "video": 3, "video_audio": 3, "audio": 3,
                   "first_frame": 1, "last_frame": 1, "seconds": 15,
                   "max_size": [768, 1344], "fps": 24, "multiple": 1},
    "ltx2": {"guide_image": 9, "guide_video": 1, "soundtrack": 1, "voice": 1,
             "seconds": 20, "max_size": [768, 1344], "fps": 24, "multiple": 32},
}

# Cles de nombre par profil, dans l'ordre des lignes.
COUNT_KEYS = {
    "minimax_h3": ("image", "video", "video_audio", "audio", "first_frame", "last_frame"),
    "ltx2": ("guide_image", "guide_video", "soundtrack", "voice"),
}

LAST = -1

# max_side borne chacune des deux valeurs de max_size.
LIMIT_BOUNDS = {"seconds": (1, 60), "fps": (1, 60), "max_side": (64, 4096)}


def profile_of(state):
    """Profil d'un etat (inconnu ou absent : minimax_h3)."""
    p = state.get("profile") if isinstance(state, dict) else None
    return p if p in PROFILES else DEFAULT_PROFILE


def _num(v):
    """Nombre valide (pas un booleen, fini) ou None."""
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        return None
    return v


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def limits_of(state):
    """Limites du profil de l'etat : defauts + state["limits"][profil], bornees.
    Un nombre ne depasse jamais sa valeur par defaut ; valeur non numerique ignoree."""
    prof = profile_of(state)
    out = {k: (list(v) if isinstance(v, list) else v) for k, v in DEFAULT_LIMITS[prof].items()}
    all_limits = state.get("limits") if isinstance(state, dict) else None
    over = all_limits.get(prof) if isinstance(all_limits, dict) else None
    if not isinstance(over, dict):
        return out
    for key in COUNT_KEYS[prof]:
        n = _num(over.get(key))
        if n is not None:
            out[key] = _clamp(int(n), 1, DEFAULT_LIMITS[prof][key])
    for key in ("seconds", "fps"):
        n = _num(over.get(key))
        if n is not None:
            lo, hi = LIMIT_BOUNDS[key]
            out[key] = _clamp(n, lo, hi)
    ms = over.get("max_size")
    if isinstance(ms, (list, tuple)) and len(ms) == 2 and all(_num(x) is not None for x in ms):
        lo, hi = LIMIT_BOUNDS["max_side"]
        out["max_size"] = [int(_clamp(x, lo, hi)) for x in ms]
    return out


def ltx_layout_keys(n_guide_images, limits):
    """Cles des sorties LTX : paires image/moment, puis video guide, bande-son, voix."""
    n = min(max(1, int(n_guide_images)), limits["guide_image"])
    keys = []
    for i in range(1, n + 1):
        keys += ["guide_image_%d" % i, "guide_frame_%d" % i]
    return keys + ["guide_video", "guide_video_frame", "soundtrack", "voice"]


def output_type(key):
    """Type ComfyUI de la sortie 'key'."""
    if key == "project":
        return "MINIMAX_PROJECT"
    if key.startswith("guide_frame_") or key == "guide_video_frame":
        return "INT"
    if key in ("soundtrack", "voice") or key.startswith(("ref_video_audio_", "ref_audio_")):
        return "AUDIO"
    return "IMAGE"


def seconds_to_frame(seconds, fps, max_seconds):
    """Moment en secondes -> numero d'image ; LAST (ou < 0) reste LAST."""
    if seconds < 0:
        return LAST
    return int(math.floor(min(seconds, max_seconds) * fps + 0.5))  # arrondi comme Math.round (JS)


def video_guide_frame(frame):
    """Numero d'image d'une video guide ramene a 8k+1 inferieur (0 et negatifs inchanges)."""
    if frame <= 0:
        return frame
    return (frame - 1) // 8 * 8 + 1


def frames_8n1(count):
    """Nombre d'images ramene a 8n+1 inferieur (0 si aucune)."""
    if count < 1:
        return 0
    return (count - 1) // 8 * 8 + 1


def fit_size(width, height, max_size, multiple):
    """Reduit (jamais d'agrandissement) pour w*h <= max_size[0]*max_size[1], ratio garde,
    puis chaque cote au multiple inferieur de 'multiple' (au moins 'multiple')."""
    budget = max_size[0] * max_size[1]
    scale = min(1.0, math.sqrt(budget / float(width * height)))
    w, h = width * scale, height * scale
    m = max(1, int(multiple))
    return (max(m, int(w) // m * m), max(m, int(h) // m * m))


def default_moment(used):
    """Moment d'une image guide sans moment choisi : First (0) s'il est libre,
    sinon Last (-1) s'il est libre, sinon 0. 'used' = moments deja pris."""
    if not any(u == 0 for u in used):
        return 0.0
    if not any(u == LAST for u in used):
        return LAST
    return 0.0


def default_moment(used):
    """Moment d une image guide sans moment choisi : First (0) s il est libre,
    sinon Last (-1) s il est libre, sinon 0. used = moments deja pris."""
    if not any(u == 0 for u in used):
        return 0.0
    if not any(u == LAST for u in used):
        return LAST
    return 0.0
