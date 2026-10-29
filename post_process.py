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
    from . import run_record
except ImportError:  # tests : modules charges seuls
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
