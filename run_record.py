"""
Enregistrement d'un Run dans le projet (noeud MiniMaxH3Project, entree
text_prompt), sans import ComfyUI (testable seul) :
- au lancement : 04.Prompt/yyyyMMdd_HHmmss_run.json avec le prompt final,
  CFG, Steps et Seed lus dans le Run lui-meme (aucune entree en plus) ;
- a la fin : les fichiers generes sont copies dans 60.Rush Images (images)
  ou 40.Rush Videos (videos) sous le meme nom que le JSON, qui les liste.
"""

import json
import os
import re
import shutil
import time

PROMPT_FOLDER = "04.Prompt"
RUSH_IMAGES = "60.Rush Images"
RUSH_VIDEOS = "40.Rush Videos"
REF_LOADER = "MiniMaxH3RefLoader"

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff"}
VIDEO_EXTS = {".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v"}

_RUN_NAME = re.compile(r"^\d{8}_\d{6}_run\.json$")
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


# Suivi des liens (choix utilisateur) : valeur directe, ou lien vers un noeud
# (Get / Set et Reroute sont deja remplaces par ComfyUI avant le Run) :
# noeud valeur, switch (booleen + branches vrai / faux), noeud a etat JSON avec
# une liste de valeurs par sortie (Pixaroma Sliders), noeud de passage.
MAX_DEPTH = 10
_SWITCH_KEYS = ("switch", "boolean", "condition", "select", "value")
_BRANCHES = (("on_true", "on_false"), ("if_true", "if_false"), ("true", "false"), ("input_true", "input_false"))


def _is_link(v):
    return isinstance(v, list) and len(v) == 2 and isinstance(v[1], int)


def _title(node):
    return ((node.get("_meta") or {}).get("title")) or node.get("class_type") or "?"


def _json_slot_value(inputs, slot):
    """Valeur de la sortie 'slot' d'un noeud qui garde ses valeurs dans un etat JSON ({..., [{value}, ...]})."""
    for v in inputs.values():
        if not isinstance(v, str) or not v.lstrip().startswith("{"):
            continue
        try:
            data = json.loads(v)
        except ValueError:
            continue
        for lst in data.values() if isinstance(data, dict) else []:
            if isinstance(lst, list) and 0 <= slot < len(lst) and isinstance(lst[slot], dict) and "value" in lst[slot]:
                return lst[slot]["value"]
    return None


def resolve(prompt, value, depth=0):
    """
    (valeur, source) d'une entree du Run : valeur directe, ou valeur trouvee en
    remontant les liens ; (None, titre du noeud) si le noeud calcule sa valeur
    pendant l'execution (non lisible a l'avance).
    """
    if not _is_link(value):
        return (None, None) if isinstance(value, (list, dict)) else (value, None)
    node = prompt.get(str(value[0])) or {}
    inputs = node.get("inputs") or {}
    if depth >= MAX_DEPTH or not node:
        return None, _title(node)
    # Switch : booleen, puis la branche choisie.
    for t, f in _BRANCHES:
        if t in inputs and f in inputs:
            for key in _SWITCH_KEYS:
                if key in inputs:
                    cond, _src = resolve(prompt, inputs[key], depth + 1)
                    if isinstance(cond, bool):
                        return resolve(prompt, inputs[t] if cond else inputs[f], depth + 1)
            return None, _title(node)
    links = [v for v in inputs.values() if _is_link(v)]
    from_json = _json_slot_value(inputs, value[1])
    if from_json is not None:
        return from_json, None
    if not links:
        # Noeud valeur (Primitive, Seed...) : son seul nombre, sinon sa seule valeur.
        numbers = [v for v in inputs.values() if isinstance(v, (int, float)) and not isinstance(v, bool)]
        if len(numbers) == 1:
            return numbers[0], None
        scalars = [v for v in inputs.values() if not isinstance(v, (list, dict))]
        if len(scalars) == 1:
            return scalars[0], None
    elif len(links) == 1 and not [v for v in inputs.values() if not _is_link(v)]:
        # Noeud de passage : une seule entree, reliee.
        return resolve(prompt, links[0], depth + 1)
    return None, _title(node)


def _sort_key(node_id):
    return (0, int(node_id), "") if str(node_id).isdigit() else (1, 0, str(node_id))


def run_params(prompt):
    """
    {cfg, steps, seed} lus dans le Run : d'abord les noeuds qui ont cfg et
    steps (KSampler...), puis les autres (CFGGuider, RandomNoise...) ; une
    valeur introuvable reste None et <cle>_from donne le noeud source.
    """
    out = {"cfg": None, "steps": None, "seed": None}
    if not isinstance(prompt, dict):
        return out
    names = {"cfg": ("cfg",), "steps": ("steps",), "seed": ("seed", "noise_seed")}
    ids = sorted(prompt, key=_sort_key)
    samplers = [i for i in ids if {"cfg", "steps"} <= set(((prompt[i] or {}).get("inputs") or {}))]
    sources = {}
    for node_id in samplers + [i for i in ids if i not in samplers]:
        inputs = (prompt[node_id] or {}).get("inputs") or {}
        for key, candidates in names.items():
            if out[key] is not None:
                continue
            for name in candidates:
                if name not in inputs:
                    continue
                v, src = resolve(prompt, inputs[name])
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    out[key] = v
                    break
                if src and key not in sources:
                    sources[key] = src
    for key, src in sources.items():
        if out[key] is None:
            out[key + "_from"] = src
    return out


def run_mode(prompt):
    """REF2VA / FL2VA du Reference Loader du Run (etat JSON de son entree state), sinon None."""
    if not isinstance(prompt, dict):
        return None
    for node_id in sorted(prompt, key=_sort_key):
        node = prompt[node_id] or {}
        if node.get("class_type") != REF_LOADER:
            continue
        try:
            state = json.loads((node.get("inputs") or {}).get("state") or "{}")
        except (TypeError, ValueError):
            continue
        return "FL2VA" if state.get("mode") == "fl2va" else "REF2VA"
    return None


def start_run(project, text, prompt=None, when=None):
    """Ecrit 04.Prompt/yyyyMMdd_HHmmss_run.json (seconde suivante si le nom est pris) ; renvoie son chemin."""
    if not project or not os.path.isdir(project):
        raise FileNotFoundError("Project folder not found: %s" % project)
    folder = os.path.join(project, PROMPT_FOLDER)
    os.makedirs(folder, exist_ok=True)
    t = int(time.time() if when is None else when)
    while True:
        name = time.strftime("%Y%m%d_%H%M%S", time.localtime(t)) + "_run.json"
        path = os.path.join(folder, name)
        if not os.path.exists(path):
            break
        t += 1
    data = {"date": time.strftime(DATE_FORMAT, time.localtime(t)),
            "project": os.path.basename(os.path.abspath(project)), "mode": run_mode(prompt),
            "prompt": text}
    data.update(run_params(prompt))
    data.update({"status": "running", "outputs": []})
    _write(path, data)
    return path


def _write(path, data):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def _check_run_file(path):
    """Chemin d'un JSON de Run : <projet>/04.Prompt/yyyyMMdd_HHmmss_run.json ; renvoie le dossier du projet."""
    path = os.path.abspath(path or "")
    folder = os.path.dirname(path)
    if not _RUN_NAME.match(os.path.basename(path)) or os.path.basename(folder) != PROMPT_FOLDER:
        raise ValueError("Not a run file: %s" % path)
    if not os.path.isfile(path):
        raise FileNotFoundError("Run file not found: %s" % path)
    return os.path.dirname(folder)


def finish_run(run_file, files, status, output_dir):
    """
    Fin du Run : files = [{filename, subfolder, type}] des sorties (seulement
    type "output", sous output_dir). Seuls les fichiers NOUVEAUX comptent :
    ceux qu'un Run precedent du projet a deja enregistres (renvoyes par le
    cache de ComfyUI) sont ignores (choix utilisateur). Images -> 60.Rush
    Images, videos -> 40.Rush Videos, copiees sous le nom du JSON ("_02"...
    pour les suivantes) ; le JSON recoit status et outputs. Aucun fichier
    nouveau alors que le Run en a renvoye, ou Run arrete sans fichier : le
    JSON est retire, rien n'est copie ({skipped, same_as, status}). Deja
    termine : rien n'est refait.
    """
    project = _check_run_file(run_file)
    with open(run_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    if data.get("status") != "running":
        return data
    data["status"] = "done" if status == "done" else "error"
    root = os.path.normcase(os.path.abspath(output_dir))
    sources = []
    for item in files or []:
        if not isinstance(item, dict) or item.get("type", "output") != "output":
            continue
        src = os.path.abspath(os.path.join(output_dir, item.get("subfolder") or "", item.get("filename") or ""))
        key = os.path.normcase(src)
        if key.startswith(root + os.sep) and os.path.isfile(src) and key not in {os.path.normcase(x) for x in sources}:
            sources.append(src)
    known = _known_sources(run_file)
    new = [src for src in sources if os.path.normcase(src) not in known]
    if not new and (sources or data["status"] == "error"):
        os.remove(run_file)
        same = known.get(os.path.normcase(sources[0])) if sources else None
        return {"skipped": True, "same_as": same, "status": data["status"]}
    base = os.path.splitext(os.path.basename(run_file))[0]
    outputs, count = [], {}
    for src in new:
        ext = os.path.splitext(src)[1].lower()
        folder = RUSH_IMAGES if ext in IMAGE_EXTS else RUSH_VIDEOS if ext in VIDEO_EXTS else None
        copy = None
        if folder:
            count[folder] = count.get(folder, 0) + 1
            n = count[folder]
            name = base + ext if n == 1 else "%s_%02d%s" % (base, n, ext)
            dst_dir = os.path.join(project, folder)
            os.makedirs(dst_dir, exist_ok=True)
            shutil.copy2(src, os.path.join(dst_dir, name))
            copy = folder + "/" + name
        outputs.append({"source": src, "copy": copy})
    data["outputs"] = outputs
    _write(run_file, data)
    return data


def _known_sources(run_file):
    """{source (normcase): nom du Run} des fichiers deja enregistres par les autres Runs du dossier (le plus recent)."""
    folder = os.path.dirname(run_file)
    known = {}
    for name in sorted(os.listdir(folder)):
        path = os.path.join(folder, name)
        if not _RUN_NAME.match(name) or os.path.normcase(path) == os.path.normcase(run_file):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                other = json.load(f)
        except (OSError, ValueError):
            continue
        for o in other.get("outputs") or []:
            if isinstance(o, dict) and o.get("source"):
                known[os.path.normcase(o["source"])] = name
    return known
