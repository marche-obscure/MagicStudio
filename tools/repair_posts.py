"""
Reparation ponctuelle (04/11/2026) : avant le bouton « For post-processing », toute video
enregistree en aval d'un MedLoad etait rattachee comme « post » au Run du fichier charge.
Ce script remet ces posts dans les Runs du projet cible qui les ont produits.

    python tools/repair_posts.py --mother <run.json> --target <dossier du projet>
                                 --since "YYYY-MM-DD HH:MM" [--apply]

Sans --apply : simple plan (rien n'est ecrit). Avec --apply : les JSON touches sont
d'abord sauvegardes dans <projet>/99.Project-Config/Archives/, puis les fichiers sont deplaces.
Un post sans Run correspondant est laisse tel quel et signale. Relancer = aucun changement.
"""

import argparse
import json
import os
import shutil
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import projects  # noqa: E402
import run_record as rr  # noqa: E402

# Ecart maximal (s) entre la fin d'un Run et la date du post : le post suit la fin du Run.
MATCH_WINDOW = 120
# Tolerance (s) si la date du post tombe un peu avant la fin mesuree (arrondis).
MATCH_SLACK = 2
POST_FIELDS = ("post_of", "post_level", "post_date", "post_params", "post_warning", "post_workflow")


def parse_since(text):
    """'YYYY-MM-DD HH:MM[:SS]' -> secondes (heure locale)."""
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return time.mktime(time.strptime(text.strip(), fmt))
        except (ValueError, AttributeError):
            pass
    raise ValueError("Bad date (expected YYYY-MM-DD HH:MM): %r" % (text,))


def _read(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _target_runs(target):
    """Runs 'done' sans sortie du projet cible : [(nom, debut, fin, data)]."""
    folder = os.path.join(target, rr.PROMPT_FOLDER)
    runs = []
    for name in sorted(os.listdir(folder)) if os.path.isdir(folder) else []:
        if not rr._RUN_NAME.match(name):
            continue
        try:
            data = _read(os.path.join(folder, name))
        except (OSError, ValueError):
            continue
        if not isinstance(data, dict) or data.get("status") != "done" or data.get("outputs"):
            continue
        start = rr._run_start(data)
        if start is None:
            continue
        try:
            dur = max(0.0, float(data.get("duration") or 0))
        except (TypeError, ValueError):
            dur = 0.0
        runs.append((name, start, start + dur, data))
    return runs


def _match(post_ts, runs):
    """Run dont la fin precede le post de moins de MATCH_WINDOW s (le plus proche), sinon None."""
    best = None
    for name, start, end, _ in runs:
        gap = post_ts - end
        if -MATCH_SLACK <= gap < MATCH_WINDOW and (best is None or abs(gap) < best[0]):
            best = (abs(gap), name)
    return best[1] if best else None


def plan(mother_run_json, target_project, since):
    """Calcule le plan sans rien ecrire : liste de dicts (action 'move' ou 'left')."""
    mother = os.path.abspath(mother_run_json)
    mproject = rr._check_run_file(mother)
    target = os.path.abspath(target_project)
    if not os.path.isdir(target):
        raise FileNotFoundError("Target project not found: %s" % target)
    if rr._same_dir(mproject, target):
        raise ValueError("The target project is the mother's project")
    since_ts = parse_since(since) if isinstance(since, str) else float(since)
    data = _read(mother)
    runs = _target_runs(target)
    rush = os.path.join(target, rr.RUSH_VIDEOS, rr.SORT_FOLDERS[rr.DEFAULT_SORT])
    reserved, wf_used, steps = set(), set(), []
    for index, o in enumerate(data.get("outputs") or []):
        if not isinstance(o, dict) or not o.get("post_level"):
            continue
        try:
            post_ts = time.mktime(time.strptime(o.get("post_date") or "", rr.DATE_FORMAT))
        except (TypeError, ValueError, OverflowError):
            continue
        if post_ts < since_ts:
            continue
        step = {"index": index, "source": o.get("source"), "post_date": o.get("post_date"),
                "action": "left", "target_run": None, "reason": None}
        steps.append(step)
        name = _match(post_ts, runs)
        if not name:
            step["reason"] = "no matching run in the target project"
            continue
        base = os.path.splitext(name)[0]
        copy = rr._abs_copy(mproject, o)
        if o.get("copy") and not os.path.isfile(copy):
            step["reason"] = "video copy missing: %s" % copy
            continue
        step.update({"action": "move", "target_run": name})
        if copy:
            ext = os.path.splitext(copy)[1]
            dst = rr._free_path(rush, base + ext)
            n = 1
            while os.path.normcase(dst) in reserved:  # deux posts du meme Run dans ce plan
                n += 1
                dst = os.path.join(rush, "%s_%02d%s" % (base, n, ext))
            while os.path.exists(dst):
                n += 1
                dst = os.path.join(rush, "%s_%02d%s" % (base, n, ext))
            reserved.add(os.path.normcase(dst))
            step.update({"copy_from": copy, "copy_to": dst})
        wf_src = rr.run_workflow_path(mproject, o["post_workflow"]) if o.get("post_workflow") else ""
        if wf_src and os.path.isfile(wf_src):
            wf_dst = rr.run_workflow_path(target, name)
            if os.path.exists(wf_dst) or name in wf_used:
                step["workflow_kept"] = wf_src  # le Run a deja son workflow : l'autre reste en place
            else:
                wf_used.add(name)
                step.update({"workflow_from": wf_src, "workflow_to": wf_dst})
    return steps


def _backup(project, path, stamp):
    """Copie datee de path dans <projet>/99.Project-Config/Archives (jamais ecrasee)."""
    folder = os.path.join(project, projects.PROJECT_CONFIG_DIR, "Archives")
    os.makedirs(folder, exist_ok=True)
    dst = rr._free_path(folder, "%s_%s" % (stamp, os.path.basename(path)))
    shutil.copy2(path, dst)
    return dst


def _apply(mother, target, steps, now):
    mproject = rr._check_run_file(mother)
    stamp = time.strftime("%Y%m%d-%H%M%S", time.localtime(now))
    moves = [s for s in steps if s["action"] == "move"]
    mdata = _read(mother)
    outs = mdata["outputs"]
    tdatas = {}
    for s in moves:
        tpath = os.path.join(target, rr.PROMPT_FOLDER, s["target_run"])
        tdatas.setdefault(s["target_run"], (tpath, _read(tpath)))
    # Sauvegardes avant toute ecriture.
    _backup(mproject, mother, stamp)
    for tpath, _ in tdatas.values():
        _backup(target, tpath, stamp)
    for s in moves:
        o = dict(outs[s["index"]])
        tpath, tdata = tdatas[s["target_run"]]
        if s.get("copy_to"):
            os.makedirs(os.path.dirname(s["copy_to"]), exist_ok=True)
            was_source = os.path.normcase(os.path.abspath(o.get("source") or "")) == os.path.normcase(s["copy_from"])
            rr._move_verified(s["copy_from"], s["copy_to"])
            o["copy"] = rr._rel(target, s["copy_to"])
            if was_source:  # video deja dans 40 du projet mere : l'original a suivi
                o["source"] = s["copy_to"]
        if s.get("workflow_from"):
            os.makedirs(os.path.dirname(s["workflow_to"]), exist_ok=True)
            shutil.move(s["workflow_from"], s["workflow_to"])
            if not tdata.get("workflow"):
                tdata["workflow"] = "/".join(rr.RUN_WORKFLOW_FOLDER + (s["target_run"],))
        for k in POST_FIELDS:
            o.pop(k, None)
        tdata.setdefault("outputs", []).append(o)
        s["applied"] = True
    for tpath, tdata in tdatas.values():
        rr._write(tpath, tdata)
    # Run mere : sorties deplacees retirees, post_of des autres suit la nouvelle numerotation.
    gone = sorted(s["index"] for s in moves)
    kept = []
    for i, o in enumerate(outs):
        if i in gone:
            continue
        if isinstance(o, dict) and isinstance(o.get("post_of"), int):
            o = dict(o)
            o["post_of"] = o["post_of"] - sum(1 for g in gone if g < o["post_of"])
        kept.append(o)
    mdata["outputs"] = kept
    rr._write(mother, mdata)


def repair(mother_run_json, target_project, since, dry_run=True, now=None):
    """
    Deplace les posts de mother_run_json (dates >= since) vers les Runs du projet cible
    qui les ont produits. dry_run (defaut) : ne fait que renvoyer le plan. Renvoie une
    liste de dicts {index, source, post_date, action 'move'|'left', target_run, reason...}.
    """
    steps = plan(mother_run_json, target_project, since)
    if not dry_run and any(s["action"] == "move" for s in steps):
        mother = os.path.abspath(mother_run_json)
        target = os.path.abspath(target_project)
        with rr.project_lock(rr._check_run_file(mother)), rr.project_lock(target):
            _apply(mother, target, steps, time.time() if now is None else now)
    return steps


def main(argv=None):
    ap = argparse.ArgumentParser(description="Move mis-attached post-processing outputs back to the runs that produced them.")
    ap.add_argument("--mother", required=True, help="run JSON that wrongly holds the posts (04.Prompt/..._run.json)")
    ap.add_argument("--target", required=True, help="project folder whose runs produced the videos")
    ap.add_argument("--since", required=True, help='only posts dated from this moment, "YYYY-MM-DD HH:MM"')
    ap.add_argument("--apply", action="store_true", help="really write (default: dry run, nothing is written)")
    args = ap.parse_args(argv)
    try:
        steps = repair(args.mother, args.target, args.since, dry_run=not args.apply)
    except (ValueError, OSError) as e:
        print("Error: %s" % e)
        return 2
    print("%s - %d post(s) found since %s" % ("APPLY" if args.apply else "DRY RUN (nothing written)", len(steps), args.since))
    for s in steps:
        if s["action"] == "move":
            print("  [%s] output %d (%s) -> run %s" % ("moved" if s.get("applied") else "would move", s["index"], s["post_date"], s["target_run"]))
            if s.get("copy_to"):
                print("      video: %s" % s["copy_to"])
            if s.get("workflow_to"):
                print("      workflow: %s" % s["workflow_to"])
            if s.get("workflow_kept"):
                print("      workflow left in place (the run already has one): %s" % s["workflow_kept"])
        else:
            print("  [left] output %d (%s): %s" % (s["index"], s["post_date"], s["reason"]))
    if not args.apply and any(s["action"] == "move" for s in steps):
        print("Nothing was written. Add --apply to do it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
