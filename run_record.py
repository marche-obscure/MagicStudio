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


def _resolve(prompt, value, depth=0):
    """Valeur d'une entree du Run : un lien [id, sortie] mene a la valeur du noeud source (Primitive...)."""
    if isinstance(value, list) and len(value) == 2 and depth < 5:
        node = prompt.get(str(value[0])) or {}
        scalars = [v for v in (node.get("inputs") or {}).values() if not isinstance(v, (list, dict))]
        if len(scalars) == 1:
            return scalars[0]
        links = [v for v in (node.get("inputs") or {}).values() if isinstance(v, list)]
        return _resolve(prompt, links[0], depth + 1) if len(links) == 1 else None
    return None if isinstance(value, (list, dict)) else value


def _sort_key(node_id):
    return (0, int(node_id), "") if str(node_id).isdigit() else (1, 0, str(node_id))


def run_params(prompt):
    """{cfg, steps, seed} : premier noeud du Run qui a ces entrees (KSampler, CFGGuider, RandomNoise...), sinon None."""
    out = {"cfg": None, "steps": None, "seed": None}
    if not isinstance(prompt, dict):
        return out
    names = {"cfg": ("cfg",), "steps": ("steps",), "seed": ("seed", "noise_seed")}
    for node_id in sorted(prompt, key=_sort_key):
        inputs = (prompt[node_id] or {}).get("inputs") or {}
        for key, candidates in names.items():
            if out[key] is not None:
                continue
            for name in candidates:
                if name in inputs:
                    v = _resolve(prompt, inputs[name])
                    if isinstance(v, (int, float)) and not isinstance(v, bool):
                        out[key] = v
                        break
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
    type "output", sous output_dir). Images -> 60.Rush Images, videos ->
    40.Rush Videos, copiees sous le nom du JSON ("_02"... pour les suivantes) ;
    le JSON recoit status et outputs. Deja termine : rien n'est refait.
    """
    project = _check_run_file(run_file)
    with open(run_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    if data.get("status") != "running":
        return data
    base = os.path.splitext(os.path.basename(run_file))[0]
    root = os.path.normcase(os.path.abspath(output_dir))
    outputs, seen, count = [], set(), {}
    for item in files or []:
        if not isinstance(item, dict) or item.get("type", "output") != "output":
            continue
        src = os.path.abspath(os.path.join(output_dir, item.get("subfolder") or "", item.get("filename") or ""))
        if not os.path.normcase(src).startswith(root + os.sep) or not os.path.isfile(src):
            continue
        if os.path.normcase(src) in seen:
            continue
        seen.add(os.path.normcase(src))
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
    data["status"] = "done" if status == "done" else "error"
    data["outputs"] = outputs
    _write(run_file, data)
    return data
