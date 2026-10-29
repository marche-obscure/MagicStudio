"""
Modeles et variantes du RefLoader (MiniMax H3 Ref2VA / F2VA / FL2VA, LTX 2.3 / 2.5) :
description des lignes et des sorties, limites, calculs d'images et conversion des
anciens etats. Module pur : pas de torch, av, numpy ni ComfyUI.
Miroir JS : web/js/profiles.js (memes cas dans tests/variant_cases.json).
"""

import math

# Anciens profils (etats d'avant les variantes, lus par migrate_state / variant_of).
PROFILES = ("minimax_h3", "ltx2")
DEFAULT_PROFILE = "minimax_h3"

LAST = -1


def profile_of(state):
    """Ancien profil d'un etat (inconnu ou absent : minimax_h3)."""
    p = state.get("profile") if isinstance(state, dict) else None
    return p if p in PROFILES else DEFAULT_PROFILE


def _num(v):
    """Nombre valide (pas un booleen, fini) ou None."""
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        return None
    return v


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def seconds_to_frame(seconds, fps, max_seconds):
    """Moment en secondes -> numero d'image ; LAST (ou < 0) reste LAST."""
    if seconds < 0:
        return LAST
    return int(math.floor(min(seconds, max_seconds) * fps + 0.5))  # arrondi comme Math.round (JS)


def fit_size(width, height, max_size, multiple):
    """Reduit (jamais d'agrandissement) pour w*h <= max_size[0]*max_size[1], ratio garde,
    puis chaque cote au multiple inferieur de 'multiple' (au moins 'multiple')."""
    budget = max_size[0] * max_size[1]
    scale = min(1.0, math.sqrt(budget / float(width * height)))
    w, h = width * scale, height * scale
    m = max(1, int(multiple))
    return (max(m, int(w) // m * m), max(m, int(h) // m * m))


def default_moment(used):
    """Moment d'une image sans moment choisi : First (0) s'il est libre, sinon Last (-1)
    s'il est libre, sinon 0. 'used' = moments deja pris."""
    if not any(u == 0 for u in used):
        return 0.0
    if not any(u == LAST for u in used):
        return LAST
    return 0.0


# ======================================================================
# Variantes (plan des variantes, 29/10/2026) : chaque modele est decrit une
# seule fois.
# Miroir JS : web/js/profiles.js (FALLBACK_DESCRIPTION, verifie egal par test).
# ======================================================================

MODELS = {"minimax_h3": {"label": "MiniMax H3"}, "ltx": {"label": "LTX"}}

_MINIMAX_LIMITS = {"seconds": 15, "max_size": [768, 1344], "fps": 24, "multiple": 1, "frame_step": 1}
_LTX_LIMITS = {"seconds": 20, "max_size": [768, 1344], "fps": 24, "multiple": 32, "frame_step": 8}
_LTX_SETTINGS = [["fps", "INT", "fps"], ["width", "INT", "width"], ["height", "INT", "height"],
                 ["length", "INT", "length"]]


def _ltx_rows():
    return [
        {"id": "guide_images", "label": "Guide images", "kind": "image", "max": 9, "folder": "08.Images",
         "moment": "frame",
         "outputs": [["guide_image_{n}", "IMAGE", "image"], ["guide_frame_{n}", "INT", "frame"]]},
        {"id": "guide_video", "label": "Guide video", "kind": "video", "max": 1, "folder": "12.Video",
         "moment": "video_frame", "trim": True,
         "outputs": [["guide_video", "IMAGE", "video_frames"], ["guide_video_frame", "INT", "frame"]]},
        {"id": "soundtrack", "label": "Soundtrack", "kind": "audio", "max": 1, "folder": "10.Son",
         "trim": True, "accepts_video": True, "outputs": [["soundtrack", "AUDIO", "audio"]]},
        {"id": "voice", "label": "Voice", "kind": "audio", "max": 1, "folder": "10.Son",
         "trim": True, "accepts_video": True, "outputs": [["voice", "AUDIO", "audio"]]},
    ]


VARIANTS = {
    "minimax_h3.ref2va": {
        "model": "minimax_h3", "label": "Ref2VA", "limits": dict(_MINIMAX_LIMITS), "settings": [], "first_index": 0,
        "rows": [
            {"id": "images", "label": "Images", "kind": "image", "max": 9, "folder": "08.Images", "tags": True,
             "outputs": [["ref_image_{n}", "IMAGE", "image"]]},
            {"id": "videos", "label": "Video", "kind": "video", "max": 3, "folder": "12.Video", "trim": True,
             "outputs": [["ref_video_{n}", "IMAGE", "video_frames"]]},
            {"id": "video_audios", "label": "Video/Audio", "kind": "video", "max": 3, "folder": "14.Video-Audio",
             "trim": True, "outputs": [["ref_video_audio_{n}", "AUDIO", "audio"]]},
            {"id": "audios", "label": "Audio", "kind": "audio", "max": 3, "folder": "10.Son", "trim": True,
             "accepts_video": True, "outputs": [["ref_audio_{n}", "AUDIO", "audio"]]},
        ],
    },
    "minimax_h3.fl2va": {
        "model": "minimax_h3", "label": "F2VA / FL2VA", "limits": dict(_MINIMAX_LIMITS), "settings": [],
        "first_index": 0,
        "rows": [
            {"id": "first_frame", "label": "First frame", "kind": "image", "max": 1, "folder": "08.Images",
             "outputs": [["first_frame", "IMAGE", "image"]]},
            {"id": "last_frame", "label": "Last frame", "kind": "image", "max": 1, "folder": "08.Images",
             "outputs": [["last_frame", "IMAGE", "image"]]},
        ],
    },
    "ltx.2_3": {"model": "ltx", "label": "LTX 2.3", "limits": dict(_LTX_LIMITS), "settings": _LTX_SETTINGS,
                "rows": _ltx_rows()},
    "ltx.2_5": {"model": "ltx", "label": "LTX 2.5", "limits": dict(_LTX_LIMITS), "settings": _LTX_SETTINGS,
                "rows": _ltx_rows()},
}
DEFAULT_VARIANT = "minimax_h3.ref2va"
CONTAINER_OUTPUTS = 40
VARIANT_BOUNDS = {"seconds": [1, 60], "fps": [1, 60], "max_side": [64, 4096], "frame_step": [1, 16],
                  "multiple": [1, 64]}


def description():
    """Description servie par la route /mmrefloader/profiles (et copie de secours du JS)."""
    return {"models": MODELS, "variants": VARIANTS, "bounds": VARIANT_BOUNDS, "default": DEFAULT_VARIANT}


def variant_of(state):
    """Variante de l'etat (nouvel etat : "variant" ; ancien : profile / mode)."""
    if not isinstance(state, dict):
        return DEFAULT_VARIANT
    v = state.get("variant")
    if v in VARIANTS:
        return v
    if state.get("profile") == "ltx2":
        return "ltx.2_3"
    return "minimax_h3.fl2va" if state.get("mode") == "fl2va" else DEFAULT_VARIANT


def model_of(variant):
    return VARIANTS.get(variant, VARIANTS[DEFAULT_VARIANT])["model"]


def variants_of_model(model):
    return [v for v, d in VARIANTS.items() if d["model"] == model]


def rows_of(variant):
    return VARIANTS.get(variant, VARIANTS[DEFAULT_VARIANT])["rows"]


def row_of(variant, row_id):
    return next((r for r in rows_of(variant) if r["id"] == row_id), None)


def trim_key(path):
    """Cle d'un chemin pour les rognages et les moments (identique a trimKey() du JS)."""
    return path.replace("\\", "/").lower()


def row_list(state, row_id, variant=None):
    """Fichiers d'une ligne d'une variante (nouvel etat)."""
    v = variant or variant_of(state)
    sel = ((state or {}).get("selections") or {}).get(v) or {}
    return list((sel.get("rows") or {}).get(row_id) or [])


def variant_limits(state, variant=None):
    """
    Limites d'une variante : defauts de la description + state["limits"][variant], bornees.
    {"counts": {ligne: n}, "seconds", "max_size", "fps", "multiple", "frame_step"} ; un nombre
    de fichiers reste entre 1 et le max de sa ligne.
    """
    v = variant or variant_of(state)
    d = VARIANTS.get(v, VARIANTS[DEFAULT_VARIANT])
    out = {k: (list(x) if isinstance(x, list) else x) for k, x in d["limits"].items()}
    out["counts"] = {r["id"]: r["max"] for r in d["rows"]}
    all_limits = state.get("limits") if isinstance(state, dict) else None
    over = all_limits.get(v) if isinstance(all_limits, dict) else None
    if not isinstance(over, dict):
        return out
    counts = over.get("counts") if isinstance(over.get("counts"), dict) else {}
    for r in d["rows"]:
        n = _num(counts.get(r["id"]))
        if n is not None:
            out["counts"][r["id"]] = _clamp(int(n), 1, r["max"])
    for key in ("seconds", "fps", "frame_step", "multiple"):
        n = _num(over.get(key))
        if n is not None:
            lo, hi = VARIANT_BOUNDS[key]
            out[key] = _clamp(n if key in ("seconds", "fps") else int(n), lo, hi)
    ms = over.get("max_size")
    if isinstance(ms, (list, tuple)) and len(ms) == 2 and all(_num(x) is not None for x in ms):
        lo, hi = VARIANT_BOUNDS["max_side"]
        out["max_size"] = [int(_clamp(x, lo, hi)) for x in ms]
    return out


def step_frame(frame, step):
    """Numero d'image ramene a step*k+1 inferieur (0 et negatifs inchanges)."""
    step = max(1, int(step))
    if frame <= 0:
        return frame
    return (frame - 1) // step * step + 1


def frames_step(count, step):
    """Nombre d'images ramene a step*n+1 inferieur (0 si aucune)."""
    step = max(1, int(step))
    if count < 1:
        return 0
    return (count - 1) // step * step + 1


def setting_value(name, limits):
    """Reglage fixe d'une variante : fps, width / height (multiples de 'multiple'), length."""
    m = max(1, int(limits.get("multiple") or 1))
    if name == "fps":
        return int(limits["fps"])
    if name in ("width", "height"):
        side = limits["max_size"][0 if name == "width" else 1]
        return max(m, int(side) // m * m)
    if name == "length":
        frames = int(math.floor(limits["seconds"] * limits["fps"] + 0.5)) + 1  # arrondi comme Math.round
        return frames_step(frames, limits.get("frame_step") or 1)
    raise ValueError("Unknown setting: %s" % name)


def variant_layout(state):
    """
    Sorties de la variante de l'etat : reglages d'abord ({key, type, value, row: None,
    index: None}), puis chaque ligne : n = nombre de fichiers borne a [1, counts[ligne]],
    pour i = 1..n les sorties de la ligne ({n} -> numero du fichier a partir de first_index de
    la variante : 0 pour MiniMax H3, comme ses entrees ref_image_0..., 1 par defaut ; sans {n} :
    une seule fois).
    """
    v = variant_of(state)
    d = VARIANTS[v]
    lim = variant_limits(state, v)
    first = d.get("first_index", 1)
    out = [{"key": name, "type": typ, "value": value, "row": None, "index": None}
           for name, typ, value in d["settings"]]
    for r in d["rows"]:
        n = min(max(1, len(row_list(state, r["id"], v))), lim["counts"][r["id"]])
        for i in range(1, n + 1):
            for name, typ, value in r["outputs"]:
                if "{n}" in name:
                    out.append({"key": name.replace("{n}", str(i - 1 + first)), "type": typ, "value": value,
                                "row": r["id"], "index": i - 1})
                elif i == 1:
                    out.append({"key": name, "type": typ, "value": value, "row": r["id"], "index": 0})
    return out


def variant_layout_keys(state):
    return [o["key"] for o in variant_layout(state)]


# Anciennes cles (etat d'avant les variantes) -> (variante, ligne).
_OLD_ROWS = {
    "images": ("minimax_h3.ref2va", "images"), "videos": ("minimax_h3.ref2va", "videos"),
    "video_audios": ("minimax_h3.ref2va", "video_audios"), "audios": ("minimax_h3.ref2va", "audios"),
    "first_frame": ("minimax_h3.fl2va", "first_frame"), "last_frame": ("minimax_h3.fl2va", "last_frame"),
    "guide_images": ("ltx.2_3", "guide_images"), "guide_video": ("ltx.2_3", "guide_video"),
    "soundtrack": ("ltx.2_3", "soundtrack"), "voice": ("ltx.2_3", "voice"),
}
_OLD_TRIMS = {"video": ("minimax_h3.ref2va", "videos"), "video_audio": ("minimax_h3.ref2va", "video_audios"),
              "audio": ("minimax_h3.ref2va", "audios"), "guide_video": ("ltx.2_3", "guide_video"),
              "soundtrack": ("ltx.2_3", "soundtrack"), "voice": ("ltx.2_3", "voice")}
_OLD_COUNTS = {"image": "images", "video": "videos", "video_audio": "video_audios", "audio": "audios",
               "first_frame": "first_frame", "last_frame": "last_frame", "guide_image": "guide_images",
               "guide_video": "guide_video", "soundtrack": "soundtrack", "voice": "voice"}
_KEEP_KEYS = ("root", "folders", "subs")


def _names(value):
    items = value if isinstance(value, list) else ([value] if isinstance(value, str) else [])
    out = []
    for v in items:
        if isinstance(v, dict):  # ancienne video {"file", "sound"}
            v = v.get("file")
        if isinstance(v, str) and v.strip():
            out.append(v.strip())
    return out


def _empty_selection(variant):
    rows = rows_of(variant)
    return {"rows": {r["id"]: [] for r in rows},
            "trims": {r["id"]: {} for r in rows if r.get("trim")},
            "moments": {r["id"]: {} for r in rows if r.get("moment")}}


def _clean_trims(entries):
    out = {}
    for k, v in (entries.items() if isinstance(entries, dict) else []):
        try:
            a, b = float(v[0]), float(v[1])
        except (TypeError, ValueError, IndexError, KeyError):
            continue
        if isinstance(k, str) and 0 <= a < b:
            out[trim_key(k)] = [a, b]
    return out


def _clean_moments(entries):
    return {trim_key(k): float(v) for k, v in (entries.items() if isinstance(entries, dict) else [])
            if isinstance(k, str) and _num(v) is not None}


def _normalize(data):
    """Nouvel etat nettoye : toutes les variantes presentes, valeurs invalides retirees."""
    out = {k: data[k] for k in _KEEP_KEYS if k in data}
    out["variant"] = data["variant"] if data.get("variant") in VARIANTS else DEFAULT_VARIANT
    last = data.get("lastVariant") if isinstance(data.get("lastVariant"), dict) else {}
    out["lastVariant"] = {m: v for m, v in last.items() if m in MODELS and v in VARIANTS and model_of(v) == m}
    out["lastVariant"][model_of(out["variant"])] = out["variant"]
    sels = data.get("selections") if isinstance(data.get("selections"), dict) else {}
    out["selections"] = {}
    for v in VARIANTS:
        sel = sels.get(v) if isinstance(sels.get(v), dict) else {}
        clean = _empty_selection(v)
        rows_in = sel.get("rows") if isinstance(sel.get("rows"), dict) else {}
        for r in rows_of(v):
            clean["rows"][r["id"]] = _names(rows_in.get(r["id"]))[:r["max"]]
        for rid in clean["trims"]:
            clean["trims"][rid] = _clean_trims((sel.get("trims") or {}).get(rid))
        for rid in clean["moments"]:
            clean["moments"][rid] = _clean_moments((sel.get("moments") or {}).get(rid))
        out["selections"][v] = clean
    lim = data.get("limits") if isinstance(data.get("limits"), dict) else {}
    out["limits"] = {v: x for v, x in lim.items() if v in VARIANTS and isinstance(x, dict)}
    return out


def migrate_state(data):
    """
    Etat du RefLoader au format des variantes. Ancien etat (sans "variant") : mode ref2va /
    fl2va -> variantes MiniMax ; profile "ltx2" -> ltx.2_3 ; images, videos, video_audios,
    audios -> Ref2VA ; first_frame, last_frame -> FL2VA ; guide_*, soundtrack, voice -> LTX 2.3 ;
    rognages, moments et limites suivent. Etat deja migre : nettoye seulement.
    """
    if not isinstance(data, dict):
        data = {}
    if "selections" in data or data.get("variant") in VARIANTS:
        return _normalize(data)
    new = {k: data[k] for k in _KEEP_KEYS if k in data}
    new["variant"] = variant_of(data)
    sels = {v: _empty_selection(v) for v in VARIANTS}
    for key, (v, rid) in _OLD_ROWS.items():
        sels[v]["rows"][rid] = _names(data.get(key))
    # Ancienne video {"file", "sound": true} : aussi piste Video/Audio si la liste est vide.
    if not sels["minimax_h3.ref2va"]["rows"]["video_audios"]:
        sels["minimax_h3.ref2va"]["rows"]["video_audios"] = [
            v["file"].strip() for v in (data.get("videos") if isinstance(data.get("videos"), list) else [])
            if isinstance(v, dict) and v.get("sound") and isinstance(v.get("file"), str) and v["file"].strip()]
    trims = data.get("trims") if isinstance(data.get("trims"), dict) else {}
    for kind, (v, rid) in _OLD_TRIMS.items():
        sels[v]["trims"][rid] = trims.get(kind) if isinstance(trims.get(kind), dict) else {}
    moments = data.get("moments") if isinstance(data.get("moments"), dict) else {}
    for rid in ("guide_images", "guide_video"):
        sels["ltx.2_3"]["moments"][rid] = moments.get(rid) if isinstance(moments.get(rid), dict) else {}
    new["selections"] = sels
    limits = {}
    old = data.get("limits") if isinstance(data.get("limits"), dict) else {}
    for prof, variants in (("minimax_h3", ("minimax_h3.ref2va", "minimax_h3.fl2va")), ("ltx2", ("ltx.2_3",))):
        o = old.get(prof)
        if not isinstance(o, dict):
            continue
        for v in variants:
            ids = {r["id"] for r in rows_of(v)}
            entry = {k: o[k] for k in ("seconds", "fps", "max_size", "multiple") if k in o}
            counts = {_OLD_COUNTS[k]: n for k, n in o.items() if k in _OLD_COUNTS and _OLD_COUNTS[k] in ids}
            if counts:
                entry["counts"] = counts
            if entry:
                limits[v] = entry
    new["limits"] = limits
    return _normalize(new)
