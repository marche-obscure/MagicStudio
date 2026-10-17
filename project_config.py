"""
Configuration du projet (99.Project-Config/Project-Config.json) du noeud
MiniMaxH3Project, sans import ComfyUI (testable seule) :
- Save : etat de tous les dossiers du projet (sauf 99) ; l'ancienne
  configuration part dans 99.Project-Config/Archives (jamais ecrasee) ;
- Load : verification des SHA256 avant toute modification, recherche des
  fichiers differents dans <dossier>/Archives, comparaison de la structure
  du workflow (noeuds et liaisons), puis remise en place depuis Archives.
"""

import json
import os
import shutil
import time

try:  # dans ComfyUI (paquet) ; seul pour les tests
    from . import projects
except ImportError:
    import projects

CONFIG_DIR = projects.PROJECT_CONFIG_DIR
CONFIG_FILE = "Project-Config.json"
FORMAT = "MiniMax H3 Reference Loader"
WORKFLOWS = "00.Workflows"
PROMPT = "04.Prompt"

# Dossiers dont les fichiers ont un SHA256 (choix utilisateur : pas Models,
# LoRA ni les rushs, souvent tres gros et jamais charges).
HASHED = ("00.Workflows", "04.Prompt", "08.Images", "10.Son", "12.Video", "14.Video-Audio")

# Dossiers des listes du Ref Loader : listes, mot des cles ("image 1"), compteur.
MEDIA = {
    "08.Images": (("images", "first_frame", "last_frame"), "image", "NbImage"),
    "10.Son": (("audios",), "son", "NbSon"),
    "12.Video": (("videos",), "video", "NbVideo"),
    "14.Video-Audio": (("video_audios",), "video", "NbVideo"),
}
# Liste -> type de rognage (cle de state.trims du Ref Loader).
TRIM_KIND = {"videos": "video", "video_audios": "video_audio", "audios": "audio"}

DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


class ConfigError(ValueError):
    """Sauvegarde refusee : errors = un message par fichier fautif."""

    def __init__(self, errors):
        ValueError.__init__(self, "Project configuration not saved: %d error(s)." % len(errors))
        self.errors = errors


def config_dir(project):
    return os.path.join(project, CONFIG_DIR)


def ensure_config_dir(project):
    """Cree 99.Project-Config et son dossier Archives ; True s'il manquait."""
    arch = os.path.join(config_dir(project), projects.ARCHIVE_FOLDER)
    missing = not os.path.isdir(arch)
    os.makedirs(arch, exist_ok=True)
    return missing


def trim_key(path):
    """Cle d'un chemin pour les rognages (identique a trimKey() en JS)."""
    return str(path).replace("\\", "/").lower()


def _root_files(folder):
    """Fichiers a la racine du dossier (sans sous-dossiers ni fichiers caches), tries par nom."""
    if not os.path.isdir(folder):
        return []
    names = [e.name for e in os.scandir(folder) if e.is_file() and not e.name.startswith(".")]
    return sorted(names, key=lambda n: (n.lower(), n))


def _id_key(v):
    return (0, v, "") if isinstance(v, int) else (1, 0, str(v))


def workflow_structure(wf):
    """
    Structure d'un workflow : {"Nodes": ["#4 LoadImage", ...],
    "Links": ["#4:IMAGE -> #7:images", ...]} (noeuds par id, liaisons par
    nom de sortie et d'entree, triees ; les valeurs et la disposition ne
    comptent pas). None si ce n'est pas un workflow.
    """
    if not isinstance(wf, dict) or not isinstance(wf.get("nodes"), list):
        return None
    nodes = [n for n in wf["nodes"] if isinstance(n, dict)]
    nodes.sort(key=lambda n: _id_key(n.get("id")))
    by_id = {str(n.get("id")): n for n in nodes}

    def slot_name(node_id, slot, side):
        # Nom de la sortie / de l'entree : les numeros des sorties du Ref Loader
        # changent avec sa selection, pas leurs noms.
        slots = (by_id.get(str(node_id)) or {}).get(side)
        if isinstance(slots, list) and isinstance(slot, int) and 0 <= slot < len(slots):
            name = slots[slot].get("name") if isinstance(slots[slot], dict) else None
            if name:
                return str(name)
        return str(slot)

    links = {}
    for link in wf.get("links") or []:
        if isinstance(link, list) and len(link) >= 5:
            o, os_, t, ts = link[1], link[2], link[3], link[4]
        elif isinstance(link, dict):
            o, os_, t, ts = link.get("origin_id"), link.get("origin_slot"), link.get("target_id"), link.get("target_slot")
        else:
            continue
        on, tn = slot_name(o, os_, "outputs"), slot_name(t, ts, "inputs")
        links[(_id_key(o), on, _id_key(t), tn)] = "#%s:%s -> #%s:%s" % (o, on, t, tn)
    links = sorted(links.items(), key=lambda x: x[0])
    return {"Nodes": ["#%s %s" % (n.get("id"), n.get("type")) for n in nodes], "Links": [l[1] for l in links]}


def diff_structure(before, after):
    """Ce qui change de before a after : noeuds et liaisons en plus (added) ou manquants (missing)."""
    b_nodes, a_nodes = before.get("Nodes") or [], after.get("Nodes") or []
    b_links, a_links = before.get("Links") or [], after.get("Links") or []
    out = {
        "nodes_added": [n for n in a_nodes if n not in b_nodes],
        "nodes_missing": [n for n in b_nodes if n not in a_nodes],
        "links_added": [l for l in a_links if l not in b_links],
        "links_missing": [l for l in b_links if l not in a_links],
    }
    out["same"] = not any(out.values())
    return out


def _read_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


# ----------------------------------------------------------------------
# Save
# ----------------------------------------------------------------------
def build_config(project, refs, trims=None, mode="ref2va", workflow="", datecreat=None, now=None):
    """
    Contenu de Project-Config.json. refs = listes du Ref Loader (chemins
    absolus, deja copies dans le projet), trims = rognages du Ref Loader,
    workflow = nom du workflow du projet dans 00.Workflows. Tous les
    dossiers sont presents, meme vides. Indice : numero dans la liste du Ref
    Loader (dossiers des medias), rang par nom ailleurs ; jamais nul : un
    fichier d'un dossier de medias que le Ref Loader n'utilise pas est une
    erreur (ConfigError, rien n'est ecrit).
    """
    if not project or not os.path.isdir(project):
        raise FileNotFoundError("Project folder not found: %s" % project)
    refs = refs or {}
    trims = trims or {}
    now = now or time.strftime(DATE_FORMAT)
    out = {
        "Project": os.path.basename(os.path.abspath(project)),
        "format": FORMAT,
        "version": 1,
        "mode": "FL2VA" if mode == "fl2va" else "REF2VA",
        "datecreat": datecreat or now,
        "datemodifi": now,
        "ProjectDir": project,
    }
    errors = []
    for folder in projects.SUBFOLDERS:
        d = os.path.join(project, folder)
        hashed = folder in HASHED
        entries = []
        if folder in MEDIA:
            lists, word, counter = MEDIA[folder]
            used = set()
            for lst in lists:
                for i, p in enumerate(refs.get(lst) or []):
                    name = os.path.basename(p or "")
                    if not p or projects._norm(os.path.dirname(p)) != projects._norm(d) or not os.path.isfile(p):
                        errors.append("%s: %s is not in the project folder" % (folder, p))
                        continue
                    used.add(name.lower())
                    e = {"Indice": i + 1, "Liste": lst, "Dossier": d, "nom": name, "SHA256": projects.file_hash(p)}
                    t = (trims.get(TRIM_KIND.get(lst, "")) or {}).get(trim_key(p))
                    if isinstance(t, (list, tuple)) and len(t) == 2:
                        e["trim"] = [t[0], t[1]]
                    entries.append(e)
            for name in _root_files(d):
                if name.lower() not in used:
                    errors.append("%s/%s: no index (not used by the Reference Loader)" % (folder, name))
        else:
            word, counter = "fichier", "NbFichier"
            for i, name in enumerate(_root_files(d)):
                e = {"Indice": i + 1, "Dossier": d, "nom": name}
                if hashed:
                    e["SHA256"] = projects.file_hash(os.path.join(d, name))
                if folder == WORKFLOWS and name.lower().endswith(".json"):
                    st = workflow_structure(_read_json(os.path.join(d, name)))
                    if st:
                        if name == workflow:
                            e["Actif"] = True
                        e.update(st)
                entries.append(e)
        block = {"Valide": bool(entries), counter: len(entries)}
        for k, e in enumerate(entries):
            block["%s %d" % (word, k + 1)] = [e]
        out[folder] = [block]
    if errors:
        raise ConfigError(errors)
    return out


def save_config(project, refs, trims=None, mode="ref2va", workflow=""):
    """
    Ecrit 99.Project-Config/Project-Config.json ; l'ancien part d'abord dans
    99.Project-Config/Archives sous yyyyMMdd-HHmmss_Project-Config.json (date
    de sa derniere sauvegarde, "(2)" si le nom est pris : jamais ecrase).
    Renvoie {path, archived}. Erreur (ConfigError) : rien n'est touche.
    """
    ensure_config_dir(project)
    path = os.path.join(config_dir(project), CONFIG_FILE)
    old = _read_json(path) if os.path.isfile(path) else None
    datecreat = old.get("datecreat") if isinstance(old, dict) and isinstance(old.get("datecreat"), str) else None
    cfg = build_config(project, refs, trims, mode, workflow, datecreat)
    archived = None
    if os.path.isfile(path):
        stamp = time.strftime("%Y%m%d-%H%M%S", time.localtime(os.path.getmtime(path)))
        arch = os.path.join(config_dir(project), projects.ARCHIVE_FOLDER)
        archived = projects._free_name(arch, "%s_%s" % (stamp, CONFIG_FILE))
        shutil.move(path, os.path.join(arch, archived))
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n")
    return {"path": path, "archived": archived}


# ----------------------------------------------------------------------
# Load : verification (rien n'est modifie)
# ----------------------------------------------------------------------
def read_config(project):
    path = os.path.join(config_dir(project), CONFIG_FILE)
    if not os.path.isfile(path):
        raise FileNotFoundError("No project configuration saved yet (%s/%s)." % (CONFIG_DIR, CONFIG_FILE))
    cfg = _read_json(path)
    if not isinstance(cfg, dict) or cfg.get("format") != FORMAT:
        raise ValueError("%s is not a project configuration." % CONFIG_FILE)
    return cfg


def config_entries(cfg, folder):
    """Fichiers d'un dossier de la configuration, dans l'ordre ("image 1", "image 2"...)."""
    blocks = cfg.get(folder)
    block = blocks[0] if isinstance(blocks, list) and blocks and isinstance(blocks[0], dict) else {}
    out = []
    for value in block.values():
        if isinstance(value, list) and value and isinstance(value[0], dict) and isinstance(value[0].get("nom"), str):
            out.append(value[0])
    return out


def _archive_match(project, folder, name, sha, cache):
    """
    Fichier de <dossier>/Archives de meme SHA256, sinon None : celui du meme
    nom d'abord, puis "nom (2)...", puis le premier par ordre alphabetique.
    """
    if folder not in cache:
        arch = os.path.join(project, folder, projects.ARCHIVE_FOLDER)
        cache[folder] = [(n, projects.file_hash(os.path.join(arch, n))) for n in _root_files(arch)]
    same = [n for n, h in cache[folder] if h == sha]
    if not same:
        return None
    # Meme nom, puis meme nom d'origine (yyyyMMdd_HHmmss_nom, "(x)" retires), le plus recent d'abord.
    clean = projects.clean_archive_name(name).lower()
    same.sort(key=lambda n: n.lower(), reverse=True)
    same.sort(key=lambda n: (n.lower() != name.lower(), projects.clean_archive_name(n).lower() != clean))
    return same[0]


def folder_kind(folder):
    if folder == WORKFLOWS:
        return "workflow"
    if folder in MEDIA:
        return "media"
    if folder == PROMPT:
        return "prompt"
    return "info"


def check_config(project, current=None):
    """
    Compare la configuration aux dossiers, sans rien modifier. Pour chaque
    dossier : {folder, kind, count, files: [{nom, Indice, Liste, trim,
    status (ok | changed | missing), archive}]} ; archive = fichier de meme
    SHA256 trouve dans <dossier>/Archives (workflows et medias). workflow =
    {name, status, source (file | archive | None), archive, same (structure
    identique au workflow courant 'current'), diff (courant -> a charger),
    changes (sauvegarde -> a charger, si le fichier differe)} ou None.
    """
    if not project or not os.path.isdir(project):
        raise FileNotFoundError("Project folder not found: %s" % project)
    cfg = read_config(project)
    cache = {}
    report = {"mode": cfg.get("mode"), "datemodifi": cfg.get("datemodifi"), "folders": [], "workflow": None}
    active = None
    for folder in projects.SUBFOLDERS:
        kind = folder_kind(folder)
        files = []
        for e in config_entries(cfg, folder):
            name = e["nom"]
            path = projects._safe_file(os.path.join(project, folder), name)
            item = {"nom": name, "Indice": e.get("Indice"), "Liste": e.get("Liste"), "trim": e.get("trim"),
                    "status": "ok", "archive": None}
            sha = e.get("SHA256")
            if folder in HASHED and sha:
                h = projects.file_hash(path)
                item["status"] = "ok" if h == sha else "missing" if h is None else "changed"
                if item["status"] != "ok" and kind in ("media", "workflow"):
                    item["archive"] = _archive_match(project, folder, name, sha, cache)
            elif not os.path.isfile(path):
                item["status"] = "missing"
            files.append(item)
            if kind == "workflow" and (e.get("Actif") or (active is None and "Nodes" in e)):
                if active is None or e.get("Actif"):
                    active = (e, item)
        report["folders"].append({"folder": folder, "kind": kind, "count": len(files), "files": files})
    if active:
        e, item = active
        wf = {"name": e["nom"], "status": item["status"], "source": None, "archive": item["archive"],
              "same": False, "diff": None, "changes": None}
        src = None
        if item["archive"]:
            wf["source"] = "archive"
            src = os.path.join(project, WORKFLOWS, projects.ARCHIVE_FOLDER, item["archive"])
        elif item["status"] != "missing":
            wf["source"] = "file"
            src = os.path.join(project, WORKFLOWS, e["nom"])
        structure = workflow_structure(_read_json(src)) if src else None
        if structure:
            if item["status"] != "ok":
                wf["changes"] = diff_structure({"Nodes": e.get("Nodes"), "Links": e.get("Links")}, structure)
            cur = workflow_structure(current) if current else None
            if cur:
                wf["diff"] = diff_structure(cur, structure)
                wf["same"] = wf["diff"]["same"]
        else:
            wf["source"] = None
        report["workflow"] = wf
    return report


# ----------------------------------------------------------------------
# Load : remise en place depuis Archives (deja confirmee)
# ----------------------------------------------------------------------
def restore_files(project, items):
    """
    items = [{folder, archive, nom}] : <dossier>/Archives/<archive> revient
    dans <dossier>/<nom>. Un fichier deja present sous ce nom part d'abord
    dans Archives (jamais ecrase ; workflows sous yyyyMMdd-HHmmss_nom).
    Renvoie les chemins remis en place.
    """
    if not project or not os.path.isdir(project):
        raise FileNotFoundError("Project folder not found: %s" % project)
    done = set()
    out = []
    for it in items:
        folder, archive, name = it.get("folder", ""), it.get("archive", ""), it.get("nom", "")
        if folder not in projects.SUBFOLDERS:
            raise ValueError("Unknown project folder: %s" % folder)
        key = (folder, name.lower())
        if key in done:
            continue
        done.add(key)
        d = os.path.join(project, folder)
        arch = os.path.join(d, projects.ARCHIVE_FOLDER)
        src = projects._safe_file(arch, archive)
        dst = projects._safe_file(d, name)
        if not os.path.isfile(src):
            raise FileNotFoundError("Archive not found: %s" % src)
        if os.path.exists(dst):
            if folder == WORKFLOWS:
                stamp = time.strftime("%Y%m%d-%H%M%S", time.localtime(os.path.getmtime(dst)))
                shutil.move(dst, os.path.join(arch, projects._free_name(arch, "%s_%s" % (stamp, name))))
            else:
                projects.archive_files(project, folder, [name])
        shutil.move(src, dst)
        out.append(dst)
    return out
