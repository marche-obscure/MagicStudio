"""
Enregistrement d'un Run dans le projet (noeud MiniMaxH3Project, entree
text_prompt), sans import ComfyUI (testable seul) :
- au lancement : 04.Prompt/yyyyMMdd_HHmmss_run.json avec le prompt final,
  CFG, Steps et Seed lus dans le Run lui-meme (aucune entree en plus), et le
  workflow du Run (tel qu'au clic sur Run) dans 00.Workflows/Run sous le meme
  nom, cite par le champ "workflow" du JSON ;
- a la fin : les videos generees sont copiees dans 40.Rush Videos sous le
  meme nom que le JSON (reduites a 960x544 au plus) ; les images restent
  dans le dossier choisi par l'utilisateur ; le JSON liste les deux.
"""

import hashlib
import json
import os
import re
import shutil
import time

PROMPT_FOLDER = "04.Prompt"
# Workflow de chaque Run (choix utilisateur, 18/10/2026) : meme nom que son JSON.
RUN_WORKFLOW_FOLDER = ("00.Workflows", "Run")
RUSH_IMAGES = "60.Rush Images"
RUSH_VIDEOS = "40.Rush Videos"
REF_LOADER = "MiniMaxH3RefLoader"

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff"}
VIDEO_EXTS = {".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v"}

_RUN_NAME = re.compile(r"^\d{8}_\d{6}_run\.json$")
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# Taille maximale des videos copiees dans 40.Rush Videos (choix utilisateur).
MAX_VIDEO_SIZE = (960, 544)


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


_MODEL_KEYS = (("unet_name", "diffusion_model"), ("ckpt_name", "diffusion_model"), ("vae_name", "vae"))


def _number(prompt, value):
    v, _src = resolve(prompt, value)
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


# Regle 1 (choix utilisateur) : un nom de fichier donne par un lien est cherche
# en remontant les liens jusqu'au nom du fichier (methode resolve_file).
# Regle 2 : une valeur donnee par un lien (STEPS / CFG / SEED...) garde la
# methode resolve. Regle 3 : l'emplacement des fichiers du Run garde la methode
# _source_path.
MODEL_EXTS = (".safetensors", ".gguf", ".ckpt", ".pt", ".pth", ".bin", ".sft", ".onnx")


def _is_file_name(v):
    return isinstance(v, str) and v.strip().lower().endswith(MODEL_EXTS)


# MultiFiles Select : sortie -> champ (la 6e sortie "model_link" donne le
# dossier de sauvegarde, puis Option 1 / Option 2 = field_6 / field_7).
MULTI_FILE_SELECT = "MultiFileSelect"
_MULTI_SELECT_FIELDS = {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 6: 6, 7: 7}


def resolve_file(prompt, value, depth=0):
    """
    Nom de fichier d'une entree (regle 1) : valeur directe ; sinon en remontant
    le lien : noeud a champs numerotes (sortie N -> champ "*_N" qui est un nom
    de fichier, ex. MultiFileSelect "File Select"), seul nom de fichier d'un
    noeud sans lien, branche choisie d'un switch, noeud de passage (une seule
    entree reliee), enfin la methode des valeurs (resolve) ; None sinon.
    """
    if not _is_link(value):
        return value.strip() if isinstance(value, str) and value.strip() else None
    node = prompt.get(str(value[0])) or {}
    inputs = node.get("inputs") or {}
    if depth >= MAX_DEPTH or not node:
        return None
    if node.get("class_type") == MULTI_FILE_SELECT:
        n = _MULTI_SELECT_FIELDS.get(value[1])
        v = inputs.get("field_%d" % n) if n else None
        return v.strip() if isinstance(v, str) and v.strip() else None
    numbered = [v for k, v in inputs.items() if re.search(r"(?:^|_)%d$" % (value[1] + 1), k) and _is_file_name(v)]
    if len(numbered) == 1:
        return numbered[0].strip()
    links = [v for v in inputs.values() if _is_link(v)]
    files = [v for v in inputs.values() if _is_file_name(v)]
    if len(files) == 1 and not links:
        return files[0].strip()
    skip = _chosen_branch(prompt, inputs)
    if skip:
        chosen = next(t if skip == f else f for t, f in _BRANCHES if skip in (t, f))
        return resolve_file(prompt, inputs[chosen], depth + 1)
    if len(links) == 1:
        return resolve_file(prompt, links[0], depth + 1)
    v, _src = resolve(prompt, value)
    return v if isinstance(v, str) and v else None


def _chosen_branch(prompt, inputs):
    """Switch : nom de l'entree de la branche NON choisie (a ne pas suivre), None sinon ou si indecidable."""
    for t, f in _BRANCHES:
        if t in inputs and f in inputs:
            for key in _SWITCH_KEYS:
                if key in inputs:
                    cond, _src = resolve(prompt, inputs[key])
                    if isinstance(cond, bool):
                        return f if cond else t
    return None


def _manager_loras(value):
    """LoRA actives d'une liste LoraManager ([{name, strength, clipStrength, active}] ou {"__value__": [...]})."""
    if isinstance(value, dict):
        value = value.get("__value__")
    out = []
    for lora in value if isinstance(value, list) else []:
        if isinstance(lora, dict) and lora.get("active") and lora.get("name"):
            strength = lora.get("strength")
            clip = lora.get("clipStrength", strength)
            out.append({"name": str(lora["name"]), "strength_model": strength, "strength_clip": clip})
    return out


PROJECT_NODE = "MiniMaxH3Project"
# Type de dossier de MultiFiles Select (model_type_N) -> groupe de 02.Models ; les
# autres types (loras...) sont ignores : les LoRA restent lus dans le graphe.
FILE_SELECT_GROUPS = {"diffusion_models": "diffusion_model", "unet": "diffusion_model",
                      "checkpoints": "diffusion_model", "text_encoders": "text_encoder", "clip": "text_encoder",
                      "vae": "vae"}


def linked_file_select(prompt):
    """Noeud relie a l'entree models_link du noeud Project du Run, None sinon."""
    for i in sorted(prompt or {}, key=_sort_key):
        node = prompt.get(i) or {}
        link = (node.get("inputs") or {}).get("models_link") if node.get("class_type") == PROJECT_NODE else None
        if _is_link(link):
            return prompt.get(str(link[0]))
    return None


def file_select_models(node):
    """Champs de MultiFiles Select -> {groupe: [{position, name}]} (position = numero du champ)."""
    inputs = (node or {}).get("inputs") or {}
    out = {g: [] for g in _MODEL_GROUPS}
    for n in range(1, 8):
        path, mtype = inputs.get("field_%d" % n), inputs.get("model_type_%d" % n)
        group = FILE_SELECT_GROUPS.get(mtype.strip().lower()) if isinstance(mtype, str) else None
        if group and isinstance(path, str) and path.strip():
            out[group].append({"position": n, "name": path.strip()})
    return out


def model_item(v):
    """Entree d'un groupe de 02.Models : {position, name} (ancien format texte : position 0)."""
    if isinstance(v, dict):
        return {"position": v.get("position") or 0, "name": v.get("name")}
    return {"position": 0, "name": v}


def run_models(prompt):
    """
    Modeles et LoRA utilises par le Run (choix utilisateur) : noeuds en amont
    des decodeurs VAE et des samplers, en suivant seulement la branche choisie
    des switchs ; unet_name / ckpt_name -> diffusion_model, clip_name* ->
    text_encoder, vae_name -> vae, lora_name -> loras (forces), liste loras de
    LoraManager -> seulement les LoRA actives, lora_N de Power Lora Loader
    ({on, lora, strength}) -> seulement celles allumees.
    """
    out = {"diffusion_model": [], "text_encoder": [], "vae": [], "loras": []}
    if not isinstance(prompt, dict):
        return out
    ids = sorted(prompt, key=_sort_key)
    node = lambda i: prompt.get(i) or {}
    starts = [i for i in ids if "VAEDecode" in str(node(i).get("class_type") or "")
              or {"cfg", "steps"} <= set(node(i).get("inputs") or {})] or ids
    seen, stack = set(), list(starts)
    while stack:
        i = str(stack.pop())
        if i in seen or i not in prompt:
            continue
        seen.add(i)
        inputs = node(i).get("inputs") or {}
        skip = _chosen_branch(prompt, inputs)
        stack.extend(str(v[0]) for k, v in inputs.items() if k != skip and _is_link(v))
    for i in [x for x in ids if x in seen]:
        inputs = node(i).get("inputs") or {}
        for key, group in _MODEL_KEYS:
            name = resolve_file(prompt, inputs[key]) if key in inputs else None
            if name and name not in out[group]:
                out[group].append(name)
        for key in sorted(k for k in inputs if k.startswith("clip_name")):
            name = resolve_file(prompt, inputs[key])
            if name and name not in out["text_encoder"]:
                out["text_encoder"].append(name)
        if "lora_name" in inputs:
            name = resolve_file(prompt, inputs["lora_name"])
            if name:
                out["loras"].append({
                    "name": name,
                    "strength_model": _number(prompt, inputs.get("strength_model", inputs.get("strength"))),
                    "strength_clip": _number(prompt, inputs["strength_clip"]) if "strength_clip" in inputs else None})
        if "loras" in inputs:
            out["loras"].extend(_manager_loras(inputs["loras"]))
        for key in sorted(k for k in inputs if k.startswith("lora_") and isinstance(inputs[k], dict)):
            lora = inputs[key]
            if lora.get("on") and lora.get("lora"):
                out["loras"].append({"name": str(lora["lora"]), "strength_model": lora.get("strength"),
                                     "strength_clip": lora.get("strengthTwo")})
    # Modeles (choix utilisateur) : champs de MultiFiles Select relie a models_link
    # (position = numero du champ), sinon lus dans le graphe (position 0).
    fs = linked_file_select(prompt)
    if fs and fs.get("class_type") == MULTI_FILE_SELECT:
        out.update(file_select_models(fs))
    else:
        for g in _MODEL_GROUPS:
            out[g] = [model_item(n) for n in out[g]]
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


def run_workflow_path(project, run_name):
    """Chemin du workflow d'un Run : <projet>/00.Workflows/Run/<nom du JSON du Run>."""
    return os.path.join(project, *RUN_WORKFLOW_FOLDER, os.path.basename(run_name))


def start_run(project, text, prompt=None, when=None, workflow=None):
    """
    Ecrit 04.Prompt/yyyyMMdd_HHmmss_run.json (seconde suivante si le nom est
    pris, ici ou dans 00.Workflows/Run) ; renvoie son chemin. workflow =
    workflow du Run (dict) : ecrit sous le meme nom dans 00.Workflows/Run et
    cite par le champ "workflow" (chemin relatif au projet). Echec
    d'ecriture : "workflow_error", le Run est enregistre quand meme.
    """
    if not project or not os.path.isdir(project):
        raise FileNotFoundError("Project folder not found: %s" % project)
    folder = os.path.join(project, PROMPT_FOLDER)
    os.makedirs(folder, exist_ok=True)
    t = int(time.time() if when is None else when)
    while True:
        name = time.strftime("%Y%m%d_%H%M%S", time.localtime(t)) + "_run.json"
        path = os.path.join(folder, name)
        if not os.path.exists(path) and not os.path.exists(run_workflow_path(project, name)):
            break
        t += 1
    data = {"date": time.strftime(DATE_FORMAT, time.localtime(t)),
            "project": os.path.basename(os.path.abspath(project)), "mode": run_mode(prompt),
            "prompt": text}
    data.update(run_params(prompt))
    data["models"] = run_models(prompt)
    if isinstance(workflow, dict):
        wf = run_workflow_path(project, name)
        try:
            os.makedirs(os.path.dirname(wf), exist_ok=True)
            with open(wf, "w", encoding="utf-8", newline="\n") as f:
                f.write(json.dumps(workflow, ensure_ascii=False))
            data["workflow"] = "/".join(RUN_WORKFLOW_FOLDER + (name,))
        except (OSError, TypeError, ValueError) as e:
            data["workflow_error"] = str(e) or e.__class__.__name__
    data.update({"status": "running", "outputs": []})
    _write(path, data)
    return path


def _remove_run_workflow(project, run_file):
    wf = run_workflow_path(project, run_file)
    if os.path.isfile(wf):
        os.remove(wf)


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


RUN_START_MARGIN = 2


def finish_run(run_file, files, status, output_dir, now=None):
    """
    Fin du Run : files = [{filename, subfolder, type}] des sorties (seulement
    type "output", sous output_dir). Seuls les fichiers NOUVEAUX comptent :
    ceux qu'un Run precedent du projet a deja enregistres (renvoyes par le
    cache de ComfyUI) sont ignores (choix utilisateur), sauf s'ils ont ete
    ecrits pendant ce Run (date de modification). Videos -> 40.Rush Videos
    sous le nom du JSON ("_02"... pour les suivantes), reduites dans
    MAX_VIDEO_SIZE (ratio garde, en .mp4) si plus grandes, copiees sinon ;
    une video deja dans 40.Rush Videos du projet n'est pas touchee
    (in_place). Images : pas de copie (choix utilisateur), seulement citees.
    Le JSON recoit status et outputs. Aucun fichier
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
        src = _source_path(item, output_dir, root)
        if src and os.path.normcase(src) not in {os.path.normcase(x) for x in sources}:
            sources.append(src)
    known = _known_sources(run_file)
    started = _run_start(data)
    new = [src for src in sources if os.path.normcase(src) not in known or _written_since(src, started)]
    if not new and (sources or data["status"] == "error"):
        os.remove(run_file)
        _remove_run_workflow(project, run_file)
        same = known.get(os.path.normcase(sources[0])) if sources else None
        return {"skipped": True, "same_as": same, "status": data["status"]}
    try:
        data = _register_run(project, data, now)
    except Exception as e:  # registre illisible : le Run garde son bloc complet
        data["registry_error"] = str(e) or e.__class__.__name__
    base = os.path.splitext(os.path.basename(run_file))[0]
    outputs, n = [], 0
    rush = os.path.join(project, RUSH_VIDEOS)
    for src in new:
        ext = os.path.splitext(src)[1].lower()
        out = {"source": src, "kind": "video" if ext in VIDEO_EXTS else "image", "copy": None}
        if ext in VIDEO_EXTS:
            size = video_size(src)
            if size:
                out["size"] = "%dx%d" % size
            if os.path.normcase(os.path.dirname(src)) == os.path.normcase(rush):
                out.update({"copy": RUSH_VIDEOS + "/" + os.path.basename(src), "in_place": True})
            else:
                n += 1
                out.update(_copy_video(src, rush, base if n == 1 else "%s_%02d" % (base, n), size))
        outputs.append(out)
    data["outputs"] = outputs
    _write(run_file, data)
    return data


def fit_size(width, height, box=None):
    """Taille dans la boite (ratio garde, dimensions paires), None si la video y tient deja."""
    bw, bh = box or MAX_VIDEO_SIZE
    if width <= bw and height <= bh:
        return None
    scale = min(bw / float(width), bh / float(height))
    return (min(bw, max(2, int(round(width * scale)) // 2 * 2)),
            min(bh, max(2, int(round(height * scale)) // 2 * 2)))


def video_size(path):
    """(largeur, hauteur) de la premiere piste video, None si illisible."""
    try:
        import av
        with av.open(path) as c:
            s = c.streams.video[0].codec_context
            return (s.width, s.height) if s.width and s.height else None
    except Exception:
        return None


def resize_video(src, dst, size):
    """
    Reencode src en H.264 (.mp4) a la taille size, meme cadence ; le son est
    recopie tel quel. Ecrit d'abord un fichier .part, retire en cas d'erreur.
    """
    import av
    part = dst + ".part.mp4"
    try:
        with av.open(src) as inp, av.open(part, "w", format="mp4") as out:
            vin = inp.streams.video[0]
            ain = inp.streams.audio[0] if inp.streams.audio else None
            vout = out.add_stream("libx264", rate=vin.average_rate or 24)
            vout.width, vout.height = size
            vout.pix_fmt = "yuv420p"
            vout.options = {"crf": "18", "preset": "medium"}
            aout = out.add_stream_from_template(ain) if ain is not None else None
            for packet in inp.demux([s for s in (vin, ain) if s is not None]):
                if packet.stream.index == vin.index:
                    for frame in packet.decode():
                        small = frame.reformat(width=size[0], height=size[1], format="yuv420p")
                        small.pts, small.time_base = frame.pts, frame.time_base
                        for p in vout.encode(small):
                            out.mux(p)
                elif packet.dts is not None:
                    packet.stream = aout
                    out.mux(packet)
            for p in vout.encode(None):
                out.mux(p)
        os.replace(part, dst)
    finally:
        if os.path.exists(part):
            os.remove(part)


def _copy_video(src, folder, name, size):
    """Copie (ou reduction) d'une video dans folder sous name ; champs du JSON."""
    os.makedirs(folder, exist_ok=True)
    ext = os.path.splitext(src)[1].lower()
    small = fit_size(*size) if size else None
    if small:
        dst = os.path.join(folder, name + ".mp4")
        try:
            resize_video(src, dst, small)
            return {"copy": RUSH_VIDEOS + "/" + name + ".mp4", "copy_size": "%dx%d" % small}
        except Exception as e:
            error = str(e) or e.__class__.__name__
        shutil.copy2(src, os.path.join(folder, name + ext))
        return {"copy": RUSH_VIDEOS + "/" + name + ext, "resize_error": error}
    shutil.copy2(src, os.path.join(folder, name + ext))
    return {"copy": RUSH_VIDEOS + "/" + name + ext}


def _source_path(item, output_dir, root):
    """
    Vrai chemin d'un fichier renvoye par un noeud de sauvegarde, sinon None :
    "fullpath" (Video Helper Suite) ou "folder" (Pixaroma Save Video, dossier
    choisi hors de output) + nom : images et videos existantes seulement ;
    sinon output_dir / subfolder / nom (type "output", sous output_dir).
    Les apercus (type "temp") sont ignores.
    """
    if not isinstance(item, dict) or item.get("type", "output") == "temp":
        return None
    name = item.get("filename") or ""
    direct = item.get("fullpath") or (os.path.join(item["folder"], name) if item.get("folder") and name else "")
    if direct:
        src = os.path.abspath(direct)
        ext = os.path.splitext(src)[1].lower()
        return src if (ext in IMAGE_EXTS or ext in VIDEO_EXTS) and os.path.isfile(src) else None
    if item.get("type", "output") != "output" or not name:
        return None
    src = os.path.abspath(os.path.join(output_dir, item.get("subfolder") or "", name))
    return src if os.path.normcase(src).startswith(root + os.sep) and os.path.isfile(src) else None


def output_kind(output):
    """"video" ou "image" : champ kind, sinon extension (anciens JSON)."""
    if output.get("kind") in ("video", "image"):
        return output["kind"]
    ext = os.path.splitext(output.get("copy") or output.get("source") or "")[1].lower()
    return "video" if ext in VIDEO_EXTS else "image" if ext in IMAGE_EXTS else None


def list_runs(project):
    """
    Runs du projet, le plus recent d'abord (fenetres 04.Prompt, 40.Rush Videos,
    60.Rush Images) : JSON de 04.Prompt avec, pour chaque sortie, kind,
    source et son dossier, copy en chemin complet, et si ces fichiers existent.
    """
    if not project or not os.path.isdir(project):
        raise FileNotFoundError("Project folder not found: %s" % project)
    folder = os.path.join(project, PROMPT_FOLDER)
    names = sorted((n for n in os.listdir(folder) if _RUN_NAME.match(n)), reverse=True) if os.path.isdir(folder) else []
    runs = []
    regs = {k: read_registry(project, k) for k in REGISTRIES}
    for name in names:
        try:
            with open(os.path.join(folder, name), "r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, ValueError):
            continue
        if not isinstance(data, dict):
            continue
        run = {k: data.get(k) for k in ("date", "mode", "prompt", "cfg", "steps", "seed", "status")}
        run.update({k: data[k] for k in ("cfg_from", "steps_from", "seed_from") if data.get(k)})
        models = run_models_of(project, data, regs)
        if models is not None:
            run["models"] = models
        run["file"] = name
        run["sets"] = run_sets(data, regs)
        wf = run_workflow_path(project, name)
        run["workflow"] = wf if data.get("workflow") and os.path.isfile(wf) else None
        outs = []
        for index, o in enumerate(data.get("outputs") or []):
            if not isinstance(o, dict) or not output_kind(o):
                continue
            src = o.get("source") or ""
            copy = os.path.join(project, *o["copy"].split("/")) if o.get("copy") else ""
            kind = output_kind(o)
            out = {"index": index, "kind": kind, "source": src, "folder": os.path.dirname(src),
                   "source_exists": bool(src) and os.path.isfile(src),
                   "copy": copy, "copy_exists": bool(copy) and os.path.isfile(copy),
                   # Original deja dans son dossier du projet (pastille verte) : video -> 40, image -> 60.
                   "in_project": bool(src) and _same_dir(os.path.dirname(src), _rush_dir(project, kind))}
            out.update({k: o[k] for k in ("size", "copy_size", "in_place", "resize_error") if o.get(k)})
            outs.append(out)
        run["outputs"] = outs
        runs.append(run)
    return runs


def _rush_dir(project, kind):
    return os.path.join(project, RUSH_VIDEOS if kind == "video" else RUSH_IMAGES)


def _same_dir(a, b):
    return os.path.normcase(os.path.abspath(a)) == os.path.normcase(os.path.abspath(b))


def file_sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def move_output(project, run_name, index):
    """
    Deplace l'original d'une sortie dans son dossier du projet (choix
    utilisateur, en 3 temps) : video -> 40.Rush Videos (remplace la copie,
    une seule version gardee : l'original), image -> 60.Rush Images (nom du
    JSON, "_02"... si pris). 1) copie dans un fichier .part, 2) SHA256 de la
    copie = celui de l'original, 3) la copie prend sa place, l'ancienne copie
    est retiree, puis l'original est supprime. Toute erreur avant la
    suppression laisse l'original intact (fichier .part retire). Le JSON
    recoit source / copy (nouveau chemin) et moved_from.
    """
    run_file = os.path.join(project or "", PROMPT_FOLDER, os.path.basename(run_name or ""))
    _check_run_file(run_file)
    with open(run_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    outputs = data.get("outputs") or []
    if not isinstance(index, int) or not 0 <= index < len(outputs) or not isinstance(outputs[index], dict):
        raise ValueError("Output not found in %s" % os.path.basename(run_file))
    o = outputs[index]
    kind = output_kind(o)
    src = o.get("source") or ""
    if kind not in ("video", "image"):
        raise ValueError("Not a video or an image: %s" % src)
    if not src or not os.path.isfile(src):
        raise FileNotFoundError("Original not found: %s" % src)
    folder = _rush_dir(project, kind)
    if _same_dir(os.path.dirname(src), folder):
        raise ValueError("Already in %s" % os.path.basename(folder))
    os.makedirs(folder, exist_ok=True)
    ext = os.path.splitext(src)[1]
    old_copy = os.path.join(project, *o["copy"].split("/")) if o.get("copy") else ""
    if kind == "video" and old_copy:
        dst = os.path.splitext(old_copy)[0] + ext
    else:
        base = os.path.splitext(os.path.basename(run_file))[0]
        dst, n = os.path.join(folder, base + ext), 1
        while os.path.exists(dst):
            n += 1
            dst = os.path.join(folder, "%s_%02d%s" % (base, n, ext))
    part = dst + ".part"
    try:
        shutil.copy2(src, part)
        if file_sha256(part) != file_sha256(src):
            raise IOError("The copy differs from the original (SHA256)")
        os.replace(part, dst)
    finally:
        if os.path.exists(part):
            os.remove(part)
    if old_copy and not _same_dir(old_copy, dst) and os.path.isfile(old_copy) and _same_dir(os.path.dirname(old_copy), folder):
        os.remove(old_copy)
    os.remove(src)
    rel = os.path.basename(folder) + "/" + os.path.basename(dst)
    o.update({"source": dst, "copy": rel, "moved_from": src, "in_place": True})
    for key in ("copy_size", "resize_error"):
        o.pop(key, None)
    _write(run_file, data)
    return {"source": dst, "copy": rel, "moved_from": src}


# ----------------------------------------------------------------------
# Registres des modeles et des LoRA (choix utilisateur, 17/10/2026) :
# 02.Models/yyyyMMdd_HHmmss_models.json et 06.LoRA/yyyyMMdd_HHmmss_LoRA.json
# (un fichier par dossier, date de sa creation). Une entree MODELS = un
# ensemble diffusion_model + text_encoder + vae ; une entree LoRA = la liste
# des LoRA d'un Run (ListeName : LoRA01, LoRA02... avec leurs forces). A la
# fin d'un Run enregistre : ensemble deja connu = son indice (datemodifi mis
# a jour), sinon dernier indice + 1 ; le JSON du Run garde seulement
# "models": [{"indiceMODELS": x}] et "loras": [{"indiceLoRA": y}].
# ----------------------------------------------------------------------
MODELS_FOLDER = "02.Models"
LORA_FOLDER = "06.LoRA"
REGISTRY_FORMAT = "MiniMax H3 Reference Loader"
_MODEL_GROUPS = ("diffusion_model", "text_encoder", "vae")
# kind -> (dossier, suffixe du fichier, liste, indice d'entree, dernier indice, indice en cours)
REGISTRIES = {
    "models": (MODELS_FOLDER, "models", "MODELS", "IndiceMODELS", "DernierIndiceMODELS", "IndiceEnCoursMODELS"),
    "lora": (LORA_FOLDER, "LoRA", "LoRA", "IndiceLoRA", "DernierIndiceLoRA", "IndiceEnCoursLoRA"),
}


def registry_file(project, kind):
    """Chemin du registre existant (02.Models / 06.LoRA), None s'il n'existe pas encore."""
    folder, suffix = REGISTRIES[kind][:2]
    d = os.path.join(project, folder)
    pat = re.compile(r"^\d{8}_\d{6}_%s\.json$" % suffix, re.IGNORECASE)
    names = sorted(n for n in os.listdir(d) if pat.match(n)) if os.path.isdir(d) else []
    return os.path.join(d, names[0]) if names else None


def read_registry(project, kind):
    path = registry_file(project, kind)
    if not path:
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def lora_list(entry):
    """LoRA d'une entree du registre LoRA (ListeName, ordre LoRA01, LoRA02...)."""
    liste = entry.get("ListeName") if isinstance(entry, dict) else None
    if not isinstance(liste, dict):
        return []
    return [v for _k, v in sorted(liste.items()) if isinstance(v, dict)]


def _config_key(kind, config):
    if kind == "models":
        return tuple(tuple((model_item(x)["position"], model_item(x)["name"]) for x in config.get(g) or [])
                     for g in _MODEL_GROUPS)
    return tuple(sorted((repr((l.get("name"), l.get("strength_model"), l.get("strength_clip"))) for l in config)))


def _entry_key(kind, entry):
    return _config_key(kind, entry if kind == "models" else lora_list(entry))


def register_config(project, kind, config, mode=None, now=None, when=None):
    """
    Indice de l'ensemble 'config' dans le registre 'kind' ("models" : dict des
    trois listes ; "lora" : liste [{name, strength_model, strength_clip}]) :
    ensemble deja present = son indice (datemodifi = now), sinon nouvelle
    entree (dernier indice + 1). L'indice en cours devient cet indice (0 pour
    un ensemble vide, sans entree ; pas de registre cree pour lui).
    """
    folder, suffix, list_key, idx_key, last_key, cur_key = REGISTRIES[kind]
    now = now or time.strftime(DATE_FORMAT)
    empty = not any(config.get(g) for g in _MODEL_GROUPS) if kind == "models" else not config
    path = registry_file(project, kind)
    if empty and not path:
        return 0
    data = read_registry(project, kind) if path else None
    data = data or {}
    entries = [e for e in data.get(list_key) or [] if isinstance(e, dict)]
    last = int(data.get(last_key) or 0)
    index = 0
    if not empty:
        key = _config_key(kind, config)
        found = next((e for e in entries if _entry_key(kind, e) == key), None)
        if found:
            index = found.get(idx_key) or 0
            found["datemodifi"] = now
        else:
            last = index = max([last] + [int(e.get(idx_key) or 0) for e in entries]) + 1
            entry = {idx_key: index, "datecreat": now, "datemodifi": now}
            if kind == "models":
                entry.update({g: [model_item(x) for x in config.get(g) or []] for g in _MODEL_GROUPS})
            else:
                entry["ListeName"] = {"LoRA%02d" % (i + 1): {"name": l.get("name"), "strength_model": l.get("strength_model"),
                                                            "strength_clip": l.get("strength_clip")}
                                      for i, l in enumerate(config)}
            entries.append(entry)
    out = {"Project": os.path.basename(os.path.abspath(project)), "format": REGISTRY_FORMAT, "version": 1,
           "mode": mode or data.get("mode"), "ProjectDir": project, last_key: last, cur_key: index, list_key: entries}
    if not path:
        d = os.path.join(project, folder)
        os.makedirs(d, exist_ok=True)
        stamp = time.strftime("%Y%m%d_%H%M%S", time.localtime(when if when is not None else time.time()))
        path = os.path.join(d, "%s_%s.json" % (stamp, suffix))
    _write(path, out)
    return index


def current_index(project, kind):
    """Indice en cours du registre (0 sans registre)."""
    data = read_registry(project, kind)
    return int((data or {}).get(REGISTRIES[kind][5]) or 0)


def _register_run(project, data, now=None):
    """Bloc "models" capture au lancement -> indices des registres (models / loras) dans le JSON du Run."""
    captured = data.get("models")
    if not isinstance(captured, dict):
        return data
    when = _run_start(data)
    mi = register_config(project, "models", {g: captured.get(g) or [] for g in _MODEL_GROUPS},
                         data.get("mode"), now, when)
    li = register_config(project, "lora", list(captured.get("loras") or []), data.get("mode"), now, when)
    out = {}
    for k, v in data.items():
        if k == "loras":
            continue
        if k == "models":
            out["models"] = [{"indiceMODELS": mi}] if mi else []
            out["loras"] = [{"indiceLoRA": li}] if li else []
        else:
            out[k] = v
    return out


def run_sets(data, registries):
    """
    Numeros des ensembles du Run dans les registres : {"models": [n], "lora": [n]}
    (listes vides sans ensemble). Ancien Run au bloc complet : ensemble du
    registre identique, s'il existe (fenetres 02.Models / 06.LoRA).
    """
    out = {"models": [], "lora": []}
    m = data.get("models")
    if isinstance(m, list):
        out["models"] = [r["indiceMODELS"] for r in m if isinstance(r, dict) and r.get("indiceMODELS")]
        out["lora"] = [r["indiceLoRA"] for r in data.get("loras") or [] if isinstance(r, dict) and r.get("indiceLoRA")]
        return out
    if not isinstance(m, dict):
        return out
    configs = {"models": {g: m.get(g) or [] for g in _MODEL_GROUPS}, "lora": list(m.get("loras") or [])}
    for kind, config in configs.items():
        if (not any(config.values())) if kind == "models" else not config:
            continue
        _f, _s, list_key, idx_key = REGISTRIES[kind][:4]
        key = _config_key(kind, config)
        for e in ((registries or {}).get(kind) or {}).get(list_key) or []:
            if isinstance(e, dict) and e.get(idx_key) and _entry_key(kind, e) == key:
                out[kind] = [e[idx_key]]
                break
    return out


def registry_sets(project):
    """
    Ensembles des registres pour les fenetres 02.Models / 06.LoRA :
    {"models": [{index, datecreat, datemodifi, diffusion_model, text_encoder, vae}],
     "lora": [{index, datecreat, datemodifi, loras: [{name, strength_model, strength_clip}]}]}.
    """
    out = {}
    for kind in REGISTRIES:
        _f, _s, list_key, idx_key = REGISTRIES[kind][:4]
        items = []
        for e in (read_registry(project, kind) or {}).get(list_key) or []:
            if not isinstance(e, dict) or not e.get(idx_key):
                continue
            item = {"index": e[idx_key], "datecreat": e.get("datecreat"), "datemodifi": e.get("datemodifi")}
            if kind == "models":
                item.update({g: [model_item(x) for x in e.get(g) or []] for g in _MODEL_GROUPS})
            else:
                item["loras"] = lora_list(e)
            items.append(item)
        out[kind] = sorted(items, key=lambda x: x["index"])
    return out


def _workflow_in_file(path):
    """Workflow (dict) range dans un rendu : PNG (texte "workflow"), video VHS (metadonnee "workflow" ou "comment")."""
    ext = os.path.splitext(path)[1].lower()
    texts = []
    try:
        if ext in IMAGE_EXTS:
            from PIL import Image
            with Image.open(path) as img:
                texts = [img.info.get("workflow")]
        elif ext in VIDEO_EXTS:
            import av
            with av.open(path) as c:
                meta = {k.lower(): v for k, v in (c.metadata or {}).items()}
                texts = [meta.get("workflow"), meta.get("comment")]
    except Exception:
        return None
    for text in texts:
        if not isinstance(text, str) or not text.strip().startswith("{"):
            continue
        try:
            data = json.loads(text)
        except ValueError:
            continue
        if isinstance(data, dict) and isinstance(data.get("workflow"), dict):
            data = data["workflow"]
        if isinstance(data, dict) and isinstance(data.get("nodes"), list):
            return data
    return None


def read_run_workflow(project, run_name):
    """
    Workflow d'un Run : 00.Workflows/Run/<nom>, sinon (anciens Runs) celui
    range dans ses rendus (original, puis copie). Renvoie {"workflow": dict,
    "source": chemin} ; FileNotFoundError si aucun n'est trouve.
    """
    run_file = os.path.join(project or "", PROMPT_FOLDER, os.path.basename(run_name or ""))
    _check_run_file(run_file)
    wf = run_workflow_path(project, run_file)
    if os.path.isfile(wf):
        with open(wf, "r", encoding="utf-8") as f:
            return {"workflow": json.load(f), "source": wf}
    with open(run_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    for o in data.get("outputs") or []:
        if not isinstance(o, dict):
            continue
        copy = os.path.join(project, *o["copy"].split("/")) if o.get("copy") else ""
        for path in (o.get("source") or "", copy):
            if path and os.path.isfile(path):
                found = _workflow_in_file(path)
                if found:
                    return {"workflow": found, "source": path}
    raise FileNotFoundError("No workflow found for this run: it was recorded before workflows were saved, "
                            "and its output files do not contain one.")


def run_models_of(project, data, registries=None):
    """Detail des modeles / LoRA d'un JSON de Run : bloc complet (en cours, anciens), sinon lu dans les registres."""
    m = data.get("models")
    if isinstance(m, dict):
        return m
    if not isinstance(m, list):
        return None
    regs = registries if registries is not None else {k: read_registry(project, k) for k in REGISTRIES}
    out = {"diffusion_model": [], "text_encoder": [], "vae": [], "loras": []}

    def entry(kind, index):
        reg = regs.get(kind) or {}
        _f, _s, list_key, idx_key = REGISTRIES[kind][:4]
        return next((e for e in reg.get(list_key) or [] if isinstance(e, dict) and e.get(idx_key) == index), None)

    for ref in m:
        e = entry("models", (ref or {}).get("indiceMODELS")) if isinstance(ref, dict) else None
        for g in _MODEL_GROUPS:
            out[g].extend((e or {}).get(g) or [])
    for ref in data.get("loras") or []:
        e = entry("lora", ref.get("indiceLoRA")) if isinstance(ref, dict) else None
        out["loras"].extend(lora_list(e))
    return out


def _run_start(data):
    """Debut du Run (date du JSON, a la seconde), None si illisible."""
    try:
        return time.mktime(time.strptime(data.get("date") or "", DATE_FORMAT))
    except (TypeError, ValueError, OverflowError):
        return None


def _written_since(src, started):
    """
    Fichier ecrit pendant le Run (meme s'il reprend le nom d'un fichier deja
    enregistre, ex. compteur de SaveImage reparti a 00001) : date de
    modification >= debut du Run (2 s de marge : date a la seconde, nom decale).
    """
    if started is None:
        return False
    try:
        return os.path.getmtime(src) >= started - RUN_START_MARGIN
    except OSError:
        return False


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
