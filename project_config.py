"""
Configuration du projet (99.Project-Config/config_projets_<projet>.json) du noeud
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
    from . import profiles, projects, run_record
except ImportError:
    import profiles
    import projects
    import run_record

CONFIG_DIR = projects.PROJECT_CONFIG_DIR
# Ancien nom (renomme de lui-meme) ; nouveau nom : config_projets_<projet>.json (choix utilisateur).
OLD_CONFIG_FILE = "Project-Config.json"


def config_file(project):
    return projects.project_config_name(os.path.basename(os.path.abspath(project)))
FORMAT = "MiniMax H3 Reference Loader"
WORKFLOWS = "00.Workflows"
PROMPT = "04.Prompt"

# Dossiers dont les fichiers ont un SHA256 (choix utilisateur : pas Models,
# LoRA ni les rushs, souvent tres gros et jamais charges).
HASHED = ("00.Workflows", "04.Prompt", "08.Images", "10.Son", "12.Video", "14.Video-Audio")

# Dossiers de medias (lignes du RefLoader : profiles.VARIANTS, cle "folder") : mot des cles
# ("image 1") et compteur.
FOLDER_INFO = {"08.Images": ("image", "NbImage"), "10.Son": ("son", "NbSon"), "12.Video": ("video", "NbVideo"),
               "14.Video-Audio": ("video", "NbVideo")}
MEDIA = tuple(FOLDER_INFO)
VERSION = 3


def selections_from_old(refs, trims=None, mode="ref2va", profile="minimax_h3", moments=None):
    """Ancien envoi du noeud Project (listes, rognages, mode, profil, moments) -> (selections, variante)."""
    data = dict(refs or {})
    data.update({"trims": trims or {}, "mode": mode or "ref2va", "profile": profile or "minimax_h3",
                 "moments": moments or {}})
    state = profiles.migrate_state(data)
    return state["selections"], state["variant"]


def _variant_order(variant):
    """Variante affichee d'abord, puis les autres dans l'ordre de la description."""
    return [variant] + [v for v in profiles.VARIANTS if v != variant]


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


# Anciens noms du lien project_used (30/10/2026) par type de noeud : {inputs|outputs: {ancien: nouveau}}.
# Identique a LEGACY_PROJECT_LINKS de web/js/graph_links.js (verifie par test_project_config).
LEGACY_LINK_NAMES = {
    "MiniMaxH3Project": {"outputs": {"final_cut": "project_used"}},
    "MiniMaxH3FinalCut": {"inputs": {"final_cut": "project_used"}},
    "MagicStudioSaveVoice": {"inputs": {"project": "project_used"}},
}


def current_slot_name(node_type, side, name):
    """Ancien nom du lien project_used ramene au nouveau ; tout autre nom rendu tel quel."""
    return ((LEGACY_LINK_NAMES.get(node_type) or {}).get(side) or {}).get(name, name)


def normalize_link_strings(nodes, links):
    """
    Liaisons enregistrees ("#o:sortie -> #t:entree", Links d'une configuration) avec les noms
    courants : les types viennent de Nodes ("#id Type"). Les autres textes restent tels quels.
    """
    types = {}
    for n in nodes or []:
        head, _, typ = str(n).partition(" ")
        types[head.lstrip("#")] = typ
    out = []
    for link in links or []:
        left, sep, right = str(link).partition(" -> ")
        o, _, on = left.lstrip("#").partition(":")
        t, _, tn = right.lstrip("#").partition(":")
        if not sep or not on or not tn:
            out.append(link)
            continue
        out.append("#%s:%s -> #%s:%s" % (o, current_slot_name(types.get(o), "outputs", on),
                                          t, current_slot_name(types.get(t), "inputs", tn)))
    return out


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
                # Ancien nom du lien project_used (avant le 30/10/2026) = nouveau nom.
                return current_slot_name((by_id.get(str(node_id)) or {}).get("type"), side, str(name))
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
def _usages(project, selections, variant, errors):
    """
    Utilisations des fichiers des dossiers de medias : {dossier: {nom en minuscules: (nom,
    [utilisation])}} dans l'ordre (variante affichee, puis les autres ; lignes ; numero).
    Un fichier de la variante affichee hors du dossier de sa ligne (ou absent) est une
    erreur ; celui d'une autre variante est ignore (Save ne copie que la variante affichee).
    """
    out = {f: {} for f in MEDIA}
    for v in _variant_order(variant):
        sel = (selections or {}).get(v) or {}
        rows = sel.get("rows") or {}
        for row in profiles.rows_of(v):
            folder = row.get("folder")
            if folder not in out:
                continue
            d = os.path.join(project, folder)
            for i, path in enumerate((rows.get(row["id"]) or [])[:row["max"]]):
                ok = path and projects._norm(os.path.dirname(path)) == projects._norm(d) and os.path.isfile(path)
                if not ok:
                    if v == variant:
                        errors.append("%s: %s is not in the project folder" % (folder, path))
                    continue
                name = os.path.basename(path)
                use = {"variante": v, "ligne": row["id"], "Indice": i + 1}
                t = ((sel.get("trims") or {}).get(row["id"]) or {}).get(trim_key(path)) if row.get("trim") else None
                if isinstance(t, (list, tuple)) and len(t) == 2:
                    use["trim"] = [t[0], t[1]]
                m = ((sel.get("moments") or {}).get(row["id"]) or {}).get(trim_key(path)) if row.get("moment") else None
                if isinstance(m, (int, float)) and not isinstance(m, bool):
                    use["moment"] = m
                out[folder].setdefault(name.lower(), (name, []))[1].append(use)
    return out


def build_config(project, selections, variant=profiles.DEFAULT_VARIANT, workflow="", datecreat=None, now=None):
    """
    Contenu de config_projets_<projet>.json, format 3 (complement 6.2) : toutes les variantes
    du RefLoader (selections = etat.selections, chemins absolus deja copies dans le projet),
    variant = variante affichee, workflow = nom du workflow du projet dans 00.Workflows. Tous
    les dossiers sont presents, meme vides. Dossiers de medias : chaque fichier une fois, avec
    ses Utilisations [{variante, ligne, Indice, trim?, moment?}] ; un fichier qu'aucune variante
    n'utilise est une erreur (ConfigError, rien n'est ecrit). Ailleurs : Indice = rang par nom.
    """
    if not project or not os.path.isdir(project):
        raise FileNotFoundError("Project folder not found: %s" % project)
    variant = variant if variant in profiles.VARIANTS else profiles.DEFAULT_VARIANT
    now = now or time.strftime(DATE_FORMAT)
    out = {
        "Project": os.path.basename(os.path.abspath(project)),
        "format": FORMAT,
        "version": VERSION,
        "variant": variant,
        "datecreat": datecreat or now,
        "datemodifi": now,
        "ProjectDir": project,
    }
    errors = []
    usages = _usages(project, selections, variant, errors)
    # 02.Models / 06.LoRA (choix utilisateur) : indice en cours du registre, 0 et Valide false sans registre.
    registry_blocks = {run_record.MODELS_FOLDER: ("models", "IndiceEnCoursMODELS"),
                       run_record.LORA_FOLDER: ("lora", "IndiceEnCoursLoRA")}
    for folder in projects.SUBFOLDERS:
        d = os.path.join(project, folder)
        if folder in registry_blocks:
            kind, key = registry_blocks[folder]
            exists = run_record.registry_file(project, kind) is not None
            out[folder] = [{"Valide": exists, key: run_record.current_index(project, kind) if exists else 0}]
            continue
        hashed = folder in HASHED
        entries = []
        if folder in FOLDER_INFO:
            word, counter = FOLDER_INFO[folder]
            for name, uses in usages[folder].values():
                entries.append({"Dossier": d, "nom": name, "SHA256": projects.file_hash(os.path.join(d, name)),
                                "Utilisations": uses})
            for name in _root_files(d):
                if name.lower() not in usages[folder]:
                    errors.append("%s/%s: no index (not used by the MagicStudio RefLoader)" % (folder, name))
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


def save_config(project, selections, variant=profiles.DEFAULT_VARIANT, workflow=""):
    """
    Ecrit 99.Project-Config/config_projets_<projet>.json ; l'ancien part d'abord dans
    99.Project-Config/Archives sous yyyyMMdd-HHmmss_config_projets_<projet>.json (date
    de sa derniere sauvegarde, "(2)" si le nom est pris : jamais ecrase).
    Renvoie {path, archived}. Erreur (ConfigError) : rien n'est touche.
    """
    ensure_config_dir(project)
    projects.migrate_project_names(project)
    name = config_file(project)
    path = os.path.join(config_dir(project), name)
    old = _read_json(path) if os.path.isfile(path) else None
    datecreat = old.get("datecreat") if isinstance(old, dict) and isinstance(old.get("datecreat"), str) else None
    cfg = build_config(project, selections, variant, workflow, datecreat)
    archived = None
    if os.path.isfile(path):
        stamp = time.strftime("%Y%m%d-%H%M%S", time.localtime(os.path.getmtime(path)))
        arch = os.path.join(config_dir(project), projects.ARCHIVE_FOLDER)
        archived = projects._free_name(arch, "%s_%s" % (stamp, name))
        shutil.move(path, os.path.join(arch, archived))
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n")
    return {"path": path, "archived": archived}


# ----------------------------------------------------------------------
# Load : verification (rien n'est modifie)
# ----------------------------------------------------------------------
def read_config(project):
    projects.migrate_project_names(project)
    name = config_file(project)
    path = os.path.join(config_dir(project), name)
    if not os.path.isfile(path):
        old = os.path.join(config_dir(project), OLD_CONFIG_FILE)
        if not os.path.isfile(old):
            raise FileNotFoundError("No project configuration saved yet (%s/%s)." % (CONFIG_DIR, name))
        path, name = old, OLD_CONFIG_FILE
    cfg = _read_json(path)
    if not isinstance(cfg, dict) or cfg.get("format") != FORMAT:
        raise ValueError("%s is not a project configuration." % name)
    return upgrade_config(cfg)


def upgrade_config(cfg):
    """
    Ancienne configuration (version 1 : main sans profile, ou branche des profils avec
    profile) -> format 3 : variant d'apres profile / mode ; chaque fichier des dossiers de
    medias recoit ses Utilisations (Liste -> variante et ligne, Indice, trim, moment).
    Le prochain Save l'ecrit au format 3.
    """
    if cfg.get("version") == VERSION and cfg.get("variant") in profiles.VARIANTS:
        return cfg
    out = json.loads(json.dumps(cfg))
    prof = profiles.profile_of(out)  # ancien fichier sans profile : MiniMax H3
    mode = str(out.get("mode") or "").lower()
    out.pop("mode", None)
    out.pop("profile", None)
    out["version"] = VERSION
    out["variant"] = ("ltx.2_3" if prof == "ltx2" else "minimax_h3.fl2va" if mode == "fl2va"
                      else profiles.DEFAULT_VARIANT)
    for folder in MEDIA:
        for e in config_entries(out, folder):
            lst, idx = e.pop("Liste", None), e.pop("Indice", None)
            trim, moment = e.pop("trim", None), e.pop("moment", None)
            uses = []
            if lst in profiles._OLD_ROWS and isinstance(idx, int):
                v, row = profiles._OLD_ROWS[lst]
                use = {"variante": v, "ligne": row, "Indice": idx}
                if isinstance(trim, list) and len(trim) == 2:
                    use["trim"] = trim
                if isinstance(moment, (int, float)) and not isinstance(moment, bool):
                    use["moment"] = moment
                uses.append(use)
            e["Utilisations"] = uses
    return out


def config_entries(cfg, folder):
    """Fichiers d'un dossier de la configuration, dans l'ordre ("image 1", "image 2"...)."""
    blocks = cfg.get(folder)
    block = blocks[0] if isinstance(blocks, list) and blocks and isinstance(blocks[0], dict) else {}
    out = []
    for value in block.values():
        if isinstance(value, list) and value and isinstance(value[0], dict) and isinstance(value[0].get("nom"), str):
            out.append(value[0])
    return out


def _free_copy_name(folder, name, taken):
    """name, sinon stem_02.ext, stem_03.ext... libre dans folder et hors de taken."""
    stem, ext = os.path.splitext(name)
    candidate, n = name, 1
    while os.path.exists(os.path.join(folder, candidate)) or candidate.lower() in taken:
        n += 1
        candidate = "%s_%02d%s" % (stem, n, ext)
    return candidate


ALL_SUBS = "*"


def _has_media(path):
    return any(os.path.isdir(os.path.join(path, f)) for f in MEDIA)


def sub_projects(path, exclude=None):
    """
    Sous-dossiers de path qui contiennent au moins un dossier de 08 a 14 (projets
    ranges dans un dossier, choix utilisateur 21/10/2026), tries ; exclude (le
    projet ouvert) n'est pas renvoye.
    """
    if not path or not os.path.isdir(path):
        return []
    skip = os.path.normcase(os.path.abspath(exclude)) if exclude else None
    out = []
    for n in sorted(os.listdir(path), key=str.lower):
        p = os.path.join(path, n)
        if os.path.isdir(p) and os.path.normcase(os.path.abspath(p)) != skip and _has_media(p):
            out.append(n)
    return out


def copy_media(project, source, dry_run=False, sub=""):
    """
    Copy (choix utilisateur 19/10/2026) : fichiers de 08.Images, 10.Son,
    12.Video et 14.Video-Audio d'un autre projet copies dans les memes dossiers
    du projet ouvert, Archives comprises ; un fichier dont le SHA256 est deja
    dans le dossier d'arrivee n'est pas recopie ; nom pris -> _02, _03...
    L'autre projet n'est jamais modifie. dry_run : bilan seulement.
    Renvoie {folders: [{folder, files, archives, copy, skip}], copied, skipped,
    report} ; report = listes de la configuration de l'autre projet ramenees
    aux fichiers du projet ouvert (meme forme que check_config, pour remplir le
    Ref Loader), None sans configuration.

    Dossier de projets (source sans dossier 08 a 14, choix utilisateur
    21/10/2026) : subs = ses sous-projets (sub_projects, sans le projet ouvert) ;
    sub = l'un d'eux, ou ALL_SUBS = tous en une passe (un fichier de meme
    SHA256 n'est copie qu'une fois ; report None : plusieurs configurations).
    """
    project, source = os.path.abspath(project or ""), os.path.abspath(source or "")
    for p in (project, source):
        if not os.path.isdir(p):
            raise FileNotFoundError("Project folder not found: %s" % p)
    subs = [] if _has_media(source) else sub_projects(source, project)
    if sub == ALL_SUBS:
        sources = [os.path.join(source, n) for n in subs]
    elif sub:
        if sub not in subs:
            raise FileNotFoundError("Project folder not found: %s" % os.path.join(source, sub))
        sources = [os.path.join(source, sub)]
    else:
        sources = [source]
    if any(os.path.normcase(project) == os.path.normcase(s) for s in sources):
        raise ValueError("Pick another project to copy from.")
    out = {"folders": [], "copied": 0, "skipped": 0, "report": None, "subs": subs}
    names = {}  # (dossier, nom dans l'autre projet) -> nom dans le projet ouvert (racine)
    for folder in MEDIA:
        row = {"folder": folder, "files": 0, "archives": 0, "copy": 0, "skip": 0}
        for part in ("", projects.ARCHIVE_FOLDER):
            ddir = os.path.join(project, folder, part)
            here = _root_files(ddir) if os.path.isdir(ddir) else []
            known = {}
            for n in here:
                sha = projects.file_hash(os.path.join(ddir, n))
                if sha:
                    known.setdefault(sha, n)
            taken = set()
            for one in sources:
                sdir = os.path.join(one, folder, part)
                for n in (_root_files(sdir) if os.path.isdir(sdir) else []):
                    row["archives" if part else "files"] += 1
                    src = os.path.join(sdir, n)
                    sha = projects.file_hash(src)
                    if sha in known:
                        row["skip"] += 1
                        dst_name = known[sha]
                    else:
                        row["copy"] += 1
                        dst_name = _free_copy_name(ddir, n, taken)
                        taken.add(dst_name.lower())
                        if not dry_run:
                            os.makedirs(ddir, exist_ok=True)
                            shutil.copy2(src, os.path.join(ddir, dst_name))
                        if sha:
                            known[sha] = dst_name
                    if not part:
                        names[(folder, n)] = dst_name
        out["folders"].append(row)
        out["copied"] += row["copy"]
        out["skipped"] += row["skip"]
    try:
        cfg = read_config(sources[0]) if len(sources) == 1 else None
    except (OSError, ValueError):
        cfg = None
    if cfg:
        report = {"variant": cfg.get("variant"), "folders": []}
        for folder in MEDIA:
            files = []
            for e in config_entries(cfg, folder):
                dst_name = names.get((folder, e["nom"]))
                if dst_name:
                    files.append({"nom": dst_name, "Utilisations": e.get("Utilisations") or [], "status": "ok"})
            report["folders"].append({"folder": folder, "kind": "media", "files": files})
        out["report"] = report
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
    dossier : {folder, kind, count, files: [{nom, Indice, status (ok | changed |
    missing), archive}]} ; archive = fichier de meme
    SHA256 trouve dans <dossier>/Archives (workflows et medias) ; medias : Utilisations
    au lieu de Indice (format 3). workflow =
    {name, status, source (file | archive | None), archive, same (structure
    identique au workflow courant 'current'), diff (courant -> a charger),
    changes (sauvegarde -> a charger, si le fichier differe)} ou None.
    """
    if not project or not os.path.isdir(project):
        raise FileNotFoundError("Project folder not found: %s" % project)
    cfg = read_config(project)
    cache = {}
    report = {"variant": cfg.get("variant"), "datemodifi": cfg.get("datemodifi"), "folders": [], "workflow": None}
    active = None
    for folder in projects.SUBFOLDERS:
        kind = folder_kind(folder)
        files = []
        for e in config_entries(cfg, folder):
            name = e["nom"]
            path = projects._safe_file(os.path.join(project, folder), name)
            item = {"nom": name, "Indice": e.get("Indice"), "status": "ok", "archive": None}
            if kind == "media":
                item["Utilisations"] = e.get("Utilisations") or []
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
                # Links enregistres avant le 30/10/2026 : anciens noms du lien project_used ramenes.
                links = normalize_link_strings(e.get("Nodes"), e.get("Links"))
                wf["changes"] = diff_structure({"Nodes": e.get("Nodes"), "Links": links}, structure)
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
