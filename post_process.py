"""
Post-traitements rattaches au Run d'origine (choix utilisateur 28/10/2026)
-------------------------------------------------------------------------
Un fichier enregistre pendant une execution est un post-traitement si, dans le
graphe execute (prompt envoye), le noeud qui l'enregistre a en amont un
MagicStudio MedLoad dont le fichier charge appartient a un Run : il est alors
ajoute a ce Run (le « Run mere », run_record.attach_post), jamais a un nouveau.
Le fichier charge est lu dans le prompt (entree "file" du MedLoad) : la regle
marche aussi quand MedLoad est repris du cache. Plusieurs MedLoad en amont : le
plus proche decide.

Sans import ComfyUI (testable seul).
"""

import json
import os

try:
    from . import final_cut, projects, run_record
except ImportError:  # tests : modules charges seuls
    import final_cut
    import projects
    import run_record

MEDLOAD = "MiniMaxH3LoadMedia"


def _links(node):
    """Noeuds sources des entrees reliees d'un noeud du prompt."""
    return [str(v[0]) for v in ((node or {}).get("inputs") or {}).values() if run_record._is_link(v)]


def _upstream(prompt, node_id):
    """{noeud: distance en liens} de tous les noeuds en amont de node_id (lui exclu)."""
    seen, frontier, dist = {str(node_id)}, [str(node_id)], {}
    d = 0
    while frontier:
        d += 1
        nxt = []
        for n in frontier:
            for src in _links(prompt.get(n)):
                if src in seen or src not in prompt:
                    continue
                seen.add(src)
                dist[src] = d
                nxt.append(src)
        frontier = nxt
    return dist


def upstream_medloads(prompt, node_id):
    """[(id du MedLoad, distance)] en amont du noeud, le plus proche d'abord, puis par id."""
    if not isinstance(prompt, dict):
        return []
    dist = _upstream(prompt, node_id)
    found = [(n, d) for n, d in dist.items() if (prompt.get(n) or {}).get("class_type") == MEDLOAD]
    return sorted(found, key=lambda x: (x[1], run_record._sort_key(x[0])))


def medload_file(prompt, medload_id):
    """Chemin charge par le MedLoad (texte, ou valeur suivie par lien) ; "" si illisible."""
    value = (((prompt or {}).get(str(medload_id)) or {}).get("inputs") or {}).get("file")
    v, _src = run_record.resolve(prompt, value)
    return v.strip().strip('"').strip() if isinstance(v, str) else ""


def branch_nodes(prompt, medload_id, node_id):
    """Noeuds en aval du MedLoad ET en amont du noeud qui enregistre (les deux exclus)."""
    medload_id, node_id = str(medload_id), str(node_id)
    return {n for n in _upstream(prompt, node_id) if n != medload_id and medload_id in _upstream(prompt, n)}


def branch_params(prompt, medload_id, node_id):
    """
    Reglages de la branche de retouche : cfg / steps / seed (run_params limite a
    la branche) et, pour chaque noeud, ses valeurs directes (entrees non reliees).
    """
    branch = branch_nodes(prompt, medload_id, node_id)
    sub = {k: prompt[k] for k in branch}
    out = run_record.run_params(sub)
    nodes = []
    for n in sorted(branch, key=run_record._sort_key):
        node = prompt[n] or {}
        values = {k: v for k, v in (node.get("inputs") or {}).items()
                  if not run_record._is_link(v) and not isinstance(v, (list, dict))}
        nodes.append({"id": n, "title": run_record._title(node), "class_type": node.get("class_type") or "",
                      "values": values})
    out["nodes"] = nodes
    return out


def project_of(path):
    """Dossier de projet qui contient le fichier (premier parent avec les dossiers 00 a 99), sinon None."""
    d = os.path.dirname(os.path.abspath(path))
    while True:
        if projects.is_project(d):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent


def find_mother(path):
    """
    Run qui a produit le fichier charge : {project, run_file, index, level} ou None.
    Jonction de input et copie du Final Cut ramenees a l'original (Picture Lock) ;
    sorties triees ou deplacees suivies par tidy_rush ; Run encore "running" ignore.
    """
    if not path or not str(path).strip():
        return None
    p = os.path.realpath(os.path.abspath(path))
    src = final_cut.source_of(p) or p
    project = project_of(src)
    if not project:
        return None
    try:
        run_record.tidy_rush(project)
    except OSError:  # fichier verrouille : chemins des JSON tels quels
        pass
    folder = os.path.join(project, run_record.PROMPT_FOLDER)
    names = sorted((n for n in os.listdir(folder) if run_record._RUN_NAME.match(n)), reverse=True) \
        if os.path.isdir(folder) else []
    key = os.path.normcase(src)
    for name in names:
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
            paths = {os.path.normcase(x) for x in (o.get("source") or "", run_record._abs_copy(project, o)) if x}
            if key in paths:
                level = o.get("post_level") if isinstance(o.get("post_level"), int) else 0
                return {"project": project, "run_file": run_file, "index": index, "level": level}
    return None
