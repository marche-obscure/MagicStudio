"""
Etoiles de comparaison du noeud Image / Video Compare (logique pure, sans ComfyUI).

Une etoile appartient a un FICHIER (le prefere d'une comparaison) :
- sortie d'un Run (source ou copie citee par un JSON de 04.Prompt) : champ "star": true
  de cette sortie (retire quand l'etoile est otee) ;
- autre fichier d'un projet : <projet>/99.Project-Config/stars.json
  {"format": "MagicStudio Stars", "version": 1, "stars": ["chemin relatif avec /", ...]} ;
- fichier hors projet : rien n'est ecrit (le noeud garde l'etoile).
Rien n'est ecrit hors du projet (jamais a travers une jonction qui sort), tout est verifie avant la
premiere ecriture, sous le verrou de chaque projet touche.
"""

import contextlib
import json
import os

try:
    from . import load_media, post_process, projects, run_record
except ImportError:  # tests : module charge seul
    import load_media
    import post_process
    import projects
    import run_record

STARS_FILE = "stars.json"
CONFIG_DIR = "99.Project-Config"
FORMAT = "MagicStudio Stars"


def _norm(path):
    return os.path.normcase(os.path.abspath(path))


def project_of(path, roots):
    """
    Projet du fichier : None s'il n'est dans aucune racine (input / output), sinon le premier parent
    qui est un projet ; None encore si le vrai chemin (jonction) sort de ce projet.
    """
    if not path or not str(path).strip():
        return None
    if not any(load_media.is_within_directory(r, path) for r in roots):
        return None
    project = post_process.project_of(path)
    if not project or not load_media.is_within_directory(project, path):
        return None
    return project


def _config_dir(project, create=False):
    """
    99.Project-Config : comparee a son chemin attendu sous le vrai chemin du projet (jonction / lien qui
    sort = refuse). create=True le cree s'il manque, puis reverifie.
    """
    path = os.path.join(project, CONFIG_DIR)
    expected = os.path.join(os.path.realpath(project), CONFIG_DIR)
    if not os.path.lexists(path):
        if not create:
            return path
        try:
            os.mkdir(path)
        except OSError as e:
            raise ValueError("%s cannot be created: %s" % (CONFIG_DIR, e))
    if not os.path.isdir(path):  # fichier ordinaire a la place du dossier
        raise ValueError("%s is not a folder" % CONFIG_DIR)
    if os.path.normcase(os.path.realpath(path)) != os.path.normcase(expected):
        raise ValueError("%s is not inside the project" % CONFIG_DIR)
    return path


def _stars_path(project, create=False):
    """Chemin de stars.json, verifie : un fichier existant qui sort du dossier est refuse."""
    folder = _config_dir(project, create)
    path = os.path.join(folder, STARS_FILE)
    if os.path.lexists(path):
        expected = os.path.join(os.path.realpath(folder), STARS_FILE)
        if os.path.normcase(os.path.realpath(path)) != os.path.normcase(expected):
            raise ValueError("stars.json is not inside the project")
    return path


def _rel(project, path):
    """Chemin relatif au projet, en "/"."""
    return os.path.relpath(os.path.abspath(path), os.path.abspath(project)).replace(os.sep, "/")


def _abs(project, rel):
    """Chemin absolu d'une entree de la liste, None si elle sort du projet."""
    if not isinstance(rel, str) or not rel or os.path.isabs(rel):
        return None
    path = os.path.normpath(os.path.join(project, *rel.split("/")))
    base = os.path.normcase(os.path.abspath(project))
    if os.path.commonpath((base, os.path.normcase(path))) != base:
        return None
    return path


def read_list(project):
    """Chemins relatifs de stars.json ; absent, illisible ou refuse = []."""
    try:
        path = _stars_path(project)
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return []
    items = data.get("stars") if isinstance(data, dict) else None
    return [s for s in items if isinstance(s, str) and s] if isinstance(items, list) else []


def _write_list(project, rels):
    """Ecrit stars.json (trie, sans doublon) : fichier .tmp puis os.replace."""
    path = _stars_path(project, create=True)
    seen = {}
    for r in rels:
        seen.setdefault(os.path.normcase(r), r)
    data = {"format": FORMAT, "version": 1, "stars": sorted(seen.values(), key=lambda r: (r.lower(), r))}
    tmp = path + ".tmp"
    if os.path.lexists(tmp):  # jamais suivre un lien / une jonction deposee a l'avance
        try:
            os.remove(tmp)
        except OSError:
            os.rmdir(tmp)
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    os.replace(tmp, path)


def run_output_of(project, path):
    """
    Sortie de Run qui cite le fichier (source ou copie) : (fichier JSON, donnees, index) ou None.
    Run encore "running" ignore ; le plus recent d'abord.
    """
    folder = os.path.join(project, run_record.PROMPT_FOLDER)
    if not os.path.isdir(folder):
        return None
    key = _norm(path)
    for name in sorted((n for n in os.listdir(folder) if run_record._RUN_NAME.match(n)), reverse=True):
        run_file = os.path.join(folder, name)
        try:
            with open(run_file, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, ValueError):
            continue
        if not isinstance(data, dict) or data.get("status") == "running":
            continue
        for index, o in enumerate(data.get("outputs") or []):
            if not isinstance(o, dict) or not run_record.output_kind(o):
                continue
            paths = {_norm(x) for x in (o.get("source") or "", run_record._abs_copy(project, o)) if x}
            if key in paths:
                return run_file, data, index
    return None


def set_star(on, off, roots):
    """
    Allume l'etoile de 'on' et eteint celle de 'off' (chemins, "" = rien) en une seule operation.
    Renvoie {"on": where, "off": where} avec where = "run", "list", "node" ou "" (chemin vide).
    'on' doit exister ; tout est verifie avant la premiere ecriture.
    """
    if not isinstance(on, str) or not isinstance(off, str):
        raise ValueError("Invalid request")
    on, off = on.strip(), off.strip()
    if on and not os.path.isfile(on):
        raise FileNotFoundError("File not found: %s" % on)
    ops = []  # (chemin, allume, projet ou None)
    for path, state in ((off, False), (on, True)):  # eteint d'abord : on == off finit etoile
        if path:
            project = project_of(path, roots)
            if project:
                projects.require_project(project)
            ops.append((path, state, project))
    touched = {}
    for _path, _state, project in ops:
        if project:
            touched[run_record._key(project)] = project
    with contextlib.ExitStack() as stack:
        for key in sorted(touched):  # meme ordre partout : pas d'interblocage
            stack.enter_context(run_record.project_lock(touched[key]))
        # Verification : aucune ecriture avant d'avoir tout controle.
        where = {True: "", False: ""}
        runs = {}  # fichier JSON -> donnees
        lists = {}  # cle du projet -> (projet, liste)
        for path, state, project in ops:
            if not project:
                where[state] = "node"
                continue
            found = run_output_of(project, path)
            if found:
                run_file, data, index = found
                rec = runs.setdefault(_norm(run_file), (run_file, data))  # meme objet si deja lu
                out = rec[1]["outputs"][index]
                if state:
                    out["star"] = True
                else:
                    out.pop("star", None)
                where[state] = "run"
                continue
            _stars_path(project, create=True)  # dossier cree et verifie (jonction refusee) avant toute ecriture
            key = run_record._key(project)
            current = lists.setdefault(key, (project, read_list(project)))[1]
            rel = _rel(project, path)
            kept = [r for r in current if os.path.normcase(r) != os.path.normcase(rel)]
            lists[key] = (project, kept + [rel] if state else kept)
            where[state] = "list"
        # Ecriture.
        for run_file, data in runs.values():
            run_record._write(run_file, data)
        for project, rels in lists.values():
            if rels != read_list(project):
                _write_list(project, rels)
    return {"on": where[True], "off": where[False]}


def list_stars(project):
    """
    Chemins absolus etoiles du projet : sorties de Run etoilees (source et copie, celles qui existent)
    et entrees existantes de stars.json.
    """
    out = []
    folder = os.path.join(project, run_record.PROMPT_FOLDER)
    names = sorted(n for n in os.listdir(folder) if run_record._RUN_NAME.match(n)) if os.path.isdir(folder) else []
    for name in names:
        try:
            with open(os.path.join(folder, name), "r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, ValueError):
            continue
        for o in (data.get("outputs") or []) if isinstance(data, dict) else []:
            if isinstance(o, dict) and o.get("star") is True:
                for p in (o.get("source") or "", run_record._abs_copy(project, o)):
                    if p and os.path.isfile(p):
                        out.append(p)
    for rel in read_list(project):
        p = _abs(project, rel)
        if p and os.path.isfile(p):
            out.append(p)
    seen = set()
    return [p for p in out if not (_norm(p) in seen or seen.add(_norm(p)))]


def follow(project, moves):
    """
    Suit les deplacements de MagicStudio (archivage, retour depuis Archives) : moves = [(ancien, nouveau)].
    Un ancien chemin de stars.json qui n'existe plus devient le nouveau ; une copie (l'ancien fichier
    est toujours la) laisse l'etoile a l'original. Sous le verrou du projet.
    """
    with run_record.project_lock(project):
        rels = read_list(project)
        if not rels or not moves:
            return
        changed = False
        for old, new in moves:
            if os.path.exists(old):
                continue
            old_rel, new_rel = _rel(project, old), _rel(project, new)
            if new_rel.startswith("..") or os.path.isabs(new_rel):
                continue
            for i, r in enumerate(rels):
                if os.path.normcase(r) == os.path.normcase(old_rel):
                    rels[i] = new_rel
                    changed = True
        if changed:
            _write_list(project, rels)
