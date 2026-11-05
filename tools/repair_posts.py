"""
Nettoyage ponctuel (04/11/2026, choix utilisateur du 05/11) : avant le bouton « For
post-processing », toute video enregistree en aval d'un MedLoad etait rattachee comme « post »
au Run du fichier charge. Cet outil retire ces posts du Run mere ; il ne recree aucun Run.

    python tools/repair_posts.py --mother <run.json> --since "YYYY-MM-DD HH:MM" [--apply]

Sans --apply : simple liste (rien n'est ecrit). Avec --apply, dans cet ordre :
  1) refus si le retrait renommerait un post qui reste ou decalerait l'index d'une sortie qui reste ;
  2) sauvegarde du JSON dans <projet>/99.Project-Config/Archives/ (datee, jamais ecrasee) ;
  3) relecture : refus si le JSON a change depuis le plan (ComfyUI l'a peut-etre reecrit) ;
  4) ecriture du JSON sans ces sorties (les autres gardent ordre, champs et index) ;
  5) seulement ensuite : copie video `_postNN` (40.Rush Videos) et workflow `_postNN.json` a la
     Corbeille. Le champ `source` (l'original, ex. 90.Pick Up/Video) n'est JAMAIS touche.
Fermer ComfyUI (ou au moins les fenetres 40 / Processing et les lecteurs) avant --apply.
Relancer = rien a faire (idempotent).
"""

import argparse
import hashlib
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import projects  # noqa: E402
import run_record as rr  # noqa: E402


class Refused(Exception):
    """Nettoyage refuse : rien n'a ete ecrit."""


def parse_since(text):
    """'YYYY-MM-DD HH:MM[:SS]' -> secondes (heure locale)."""
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return time.mktime(time.strptime(text.strip(), fmt))
        except (ValueError, AttributeError):
            pass
    raise ValueError("Bad date (expected YYYY-MM-DD HH:MM): %r" % (text,))


def _read_bytes(path):
    with open(path, "rb") as f:
        return f.read()


def _post_ts(o):
    try:
        return time.mktime(time.strptime(o.get("post_date") or "", rr.DATE_FORMAT))
    except (TypeError, ValueError, OverflowError):
        return None


def post_names(outs):
    """
    Noms des posts comme web/js/post_tree.js : freres classes par (post_date, index) ;
    parent absent = premiere sortie qui n'est pas un post. Renvoie {index: "Post A.01"}.
    """
    items = [(i, o) for i, o in enumerate(outs) if isinstance(o, dict)]
    roots = [i for i, o in items if not o.get("post_level")]
    kids = {}
    for i, o in items:
        if not o.get("post_level"):
            continue
        parent = o.get("post_of")
        if parent == i or not any(j == parent for j, _ in items):
            parent = roots[0] if roots else None
        kids.setdefault(parent, []).append(i)
    names = {}

    def letters(n):
        s, k = "", n + 1
        while k > 0:
            s = chr(65 + (k - 1) % 26) + s
            k = (k - 1) // 26
        return s

    def walk(parent, label):
        order = sorted(kids.get(parent, []), key=lambda i: (str(outs[i].get("post_date") or ""), i))
        for n, i in enumerate(order):
            if i in names:
                continue
            names[i] = ("Post " + letters(n)) if label is None else "%s.%02d" % (label, n + 1)
            walk(i, names[i])

    for r in roots:
        walk(r, None)
    return names


def _inside(path, folder):
    path, folder = os.path.normcase(os.path.abspath(path)), os.path.normcase(os.path.abspath(folder))
    return path.startswith(folder + os.sep)


def plan(mother_run_json, since):
    """Liste des posts a retirer (rien n'est ecrit) : dict avec le hash du JSON lu."""
    mother = os.path.abspath(mother_run_json)
    project = rr._check_run_file(mother)
    raw = _read_bytes(mother)
    data = json.loads(raw.decode("utf-8"))
    outs = data.get("outputs") or []
    since_ts = parse_since(since) if isinstance(since, str) else float(since)
    names = post_names(outs)
    posts = []
    for index, o in enumerate(outs):
        if not isinstance(o, dict) or not o.get("post_level"):
            continue
        ts = _post_ts(o)
        if ts is None or ts < since_ts:
            continue
        copy = rr._abs_copy(project, o)
        wf = rr.run_workflow_path(project, o["post_workflow"]) if o.get("post_workflow") else ""
        posts.append({"index": index, "name": names.get(index, "Post ?"), "post_date": o.get("post_date"),
                      "source": o.get("source"), "copy": copy or None, "workflow": wf or None})
    return {"mother": mother, "project": project, "sha": hashlib.sha256(raw).hexdigest(), "posts": posts}


def _check_removal(mother_data, posts):
    """Refuse si un post ou une sortie qui reste changerait de nom ou d'index."""
    outs = mother_data.get("outputs") or []
    gone = {p["index"] for p in posts}
    last_kept = max((i for i in range(len(outs)) if i not in gone), default=-1)
    if any(g < last_kept for g in gone):
        raise Refused("Removing these posts would shift the index of an output that stays "
                      "(an open 40 / Processing window would act on the wrong file).")
    before = post_names(outs)
    after = post_names([o for i, o in enumerate(outs) if i not in gone])
    for i, name in before.items():
        if i not in gone and after.get(i) != name:
            raise Refused("Removing these posts would rename the remaining post %r (-> %r). "
                          "Use an earlier --since so that the whole family goes." % (name, after.get(i)))


def _backup(project, path, now):
    """Copie datee de path dans <projet>/99.Project-Config/Archives (jamais ecrasee)."""
    folder = os.path.join(project, projects.PROJECT_CONFIG_DIR, "Archives")
    os.makedirs(folder, exist_ok=True)
    dst = rr._free_path(folder, "%s_%s" % (time.strftime("%Y%m%d-%H%M%S", time.localtime(now)), os.path.basename(path)))
    with open(dst, "wb") as f:
        f.write(_read_bytes(path))
    return dst


def clean(mother_run_json, since, apply=False, trash_fn=None, now=None):
    """
    Retire du Run mere les posts dates >= since. Sans apply : renvoie le plan, n'ecrit rien.
    Renvoie {mother, posts: [{index, name, post_date, source, copy, workflow, copy_status,
    workflow_status}], applied, backup}. Leve Refused si le nettoyage est refuse.
    """
    p = plan(mother_run_json, since)
    report = {"mother": p["mother"], "posts": p["posts"], "applied": False, "backup": None}
    if not apply or not p["posts"]:
        return report
    trash = trash_fn or projects._to_recycle_bin
    with rr.project_lock(p["project"]):
        data = json.loads(_read_bytes(p["mother"]).decode("utf-8"))
        _check_removal(data, p["posts"])
        report["backup"] = _backup(p["project"], p["mother"], time.time() if now is None else now)
        if hashlib.sha256(_read_bytes(p["mother"])).hexdigest() != p["sha"]:
            raise Refused("The run file changed since the plan was made (ComfyUI may be writing it). Nothing was removed; run again.")
        gone = {x["index"] for x in p["posts"]}
        data["outputs"] = [o for i, o in enumerate(data["outputs"]) if i not in gone]
        rr._write(p["mother"], data)
        report["applied"] = True
        # Fichiers a la Corbeille seulement apres l'ecriture du JSON : un echec ne laisse jamais un JSON qui cite un fichier absent.
        run_wf = os.path.join(p["project"], *rr.RUN_WORKFLOW_FOLDER)
        rush = os.path.join(p["project"], rr.RUSH_VIDEOS)
        for x in p["posts"]:
            src = os.path.normcase(os.path.abspath(x["source"] or "")) if x["source"] else None
            for key, folder in (("copy", rush), ("workflow", run_wf)):
                path = x[key]
                if not path:
                    x[key + "_status"] = "none"
                elif src and os.path.normcase(os.path.abspath(path)) == src:
                    x[key + "_status"] = "kept (it is the source file)"
                elif not _inside(path, folder):
                    x[key + "_status"] = "kept (outside the project folder)"
                elif not os.path.isfile(path):
                    x[key + "_status"] = "missing"
                else:
                    try:
                        trash([path])
                        x[key + "_status"] = "recycled"
                    except OSError as e:
                        x[key + "_status"] = "NOT recycled: %s" % e
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(description="Remove mis-attached post-processing outputs from a run file.")
    ap.add_argument("--mother", required=True, help="run JSON that wrongly holds the posts (04.Prompt/..._run.json)")
    ap.add_argument("--since", required=True, help='only posts dated from this moment, "YYYY-MM-DD HH:MM"')
    ap.add_argument("--apply", action="store_true", help="really write (default: dry run, nothing is written)")
    args = ap.parse_args(argv)
    try:
        rep = clean(args.mother, args.since, apply=args.apply)
    except Refused as e:
        print("REFUSED, nothing was changed: %s" % e)
        return 1
    except (ValueError, OSError) as e:
        print("Error: %s" % e)
        return 2
    print("%s - %d post(s) dated since %s in %s" % ("APPLY" if args.apply else "DRY RUN (nothing written)",
                                                    len(rep["posts"]), args.since, rep["mother"]))
    for x in rep["posts"]:
        print("  %s (output %d, %s)" % (x["name"], x["index"], x["post_date"]))
        print("      source (never touched): %s" % x["source"])
        print("      video copy: %s%s" % (x["copy"], "  -> " + x["copy_status"] if "copy_status" in x else ""))
        print("      workflow:   %s%s" % (x["workflow"], "  -> " + x["workflow_status"] if "workflow_status" in x else ""))
    if rep["backup"]:
        print("JSON backup: %s" % rep["backup"])
    if rep["applied"]:
        print("Done. The posts are removed from the run; files went to the Recycle Bin.")
    elif rep["posts"]:
        print("Nothing was written. Close ComfyUI's 40 / Processing windows and players, then add --apply.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
