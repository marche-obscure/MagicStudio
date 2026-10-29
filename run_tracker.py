"""
Fin des Runs enregistree par le serveur (choix utilisateur, 21/10/2026)
----------------------------------------------------------------------
Les messages que ComfyUI envoie a l'interface (send_sync) sont suivis ici :
execution_start, executed (JSON du Run donne par le noeud Project dans
ui.mmrun, fichiers des noeuds de sauvegarde), puis execution_success,
execution_error ou execution_interrupted. A la fin, run_record.finish_run
est appele sans attendre l'onglet du navigateur : changer d'onglet de
workflow, recharger la page ou fermer le navigateur pendant le Run ne fait
plus perdre son enregistrement.

La route /mmproject/run_done (appel de l'onglet, pour son message) passe par
finish() : un seul enregistrement par JSON, le second appel recoit le meme
resultat.

Post-traitements (choix utilisateur 28/10/2026) : le prompt envoye est lu au
debut de l'execution (prompt_fn) et les fichiers sont notes par noeud ; a la
fin, settle() ajoute au Run mere chaque fichier enregistre en aval d'un MedLoad
qui charge une sortie de Run (post_process, run_record.attach_post), avec ou
sans noeud Project ; ces fichiers sont retires de la liste du Run global.
"""

import os
import threading

try:  # dans ComfyUI (paquet) ; seul pour les tests
    from . import post_process, run_record
except ImportError:
    import post_process
    import run_record

END_EVENTS = {"execution_success": "done", "execution_error": "error", "execution_interrupted": "error"}
KEEP = 16


def output_files(output):
    """Fichiers cites dans la sortie ui d'un noeud : meme lecture que l'interface (project_node.js)."""
    files = []
    for v in (output or {}).values():
        if not isinstance(v, list):
            continue
        for f in v:
            if not isinstance(f, dict) or not isinstance(f.get("filename"), str):
                continue
            status = f.get("_pixaroma_status") if isinstance(f.get("_pixaroma_status"), dict) else {}
            folder = status.get("folder") or f.get("folder") or ""
            files.append({
                "filename": f["filename"], "subfolder": f.get("subfolder") or "", "type": f.get("type") or "output",
                "fullpath": f["fullpath"] if isinstance(f.get("fullpath"), str) else "",
                "folder": folder if isinstance(folder, str) else "",
            })
    return files


class RunTracker:
    def __init__(self, output_dir, finish_fn=None, prompt_fn=None, attach_fn=None, mother_fn=None):
        self.output_dir = output_dir  # fonction () -> dossier output de ComfyUI
        self.finish_fn = finish_fn or run_record.finish_run
        self.prompt_fn = prompt_fn  # prompt_id -> (prompt, extra_data) ou None
        self.attach_fn = attach_fn or run_record.attach_post
        self.mother_fn = mother_fn or post_process.find_mother
        self.lock = threading.Lock()  # messages (fil d'execution de ComfyUI) : jamais bloque par un enregistrement
        self.finish_lock = threading.Lock()
        self.runs = {}  # prompt_id -> {file, files, start, prompt, extra, nodes}
        self.done = {}  # JSON du Run (normcase) -> resultat de finish_run
        self.ended = {}  # prompt_id -> execution terminee avec des fichiers (a classer par settle)
        self.settled = {}  # prompt_id -> sources rattachees (normcase)
        self.run_pids = {}  # JSON du Run (normcase) -> prompt_id

    @staticmethod
    def _keep(d):
        while len(d) > KEEP:
            d.pop(next(iter(d)))

    def _run(self, prompt_id):
        if prompt_id not in self.runs:
            self.runs[prompt_id] = {"file": "", "files": [], "start": None, "prompt": None, "extra": None, "nodes": {}}
            self._keep(self.runs)
        return self.runs[prompt_id]

    def on_message(self, event, data):
        """
        Un message de ComfyUI. Renvoie (run_file, files, status, duration) quand
        un Run du noeud Project se termine (a passer a finish()), sinon None.
        """
        if not isinstance(data, dict) or not data.get("prompt_id"):
            return None
        pid = data["prompt_id"]
        with self.lock:
            if event == "execution_start":
                run = self._run(pid)
                run["start"] = data.get("timestamp")
                if self.prompt_fn:
                    try:
                        got = self.prompt_fn(pid)
                    except Exception:
                        got = None
                    if got:
                        run["prompt"], run["extra"] = got
            elif event == "executed":
                run = self._run(pid)
                output = data.get("output") if isinstance(data.get("output"), dict) else {}
                mmrun = output.get("mmrun")
                if isinstance(mmrun, list) and mmrun and isinstance(mmrun[0], str):
                    run["file"] = mmrun[0]
                    self.run_pids[os.path.normcase(os.path.abspath(mmrun[0]))] = pid
                    self._keep(self.run_pids)
                files = output_files(output)
                run["files"].extend(files)
                if files:
                    run["nodes"].setdefault(str(data.get("node") or ""), []).extend(files)
            elif event in END_EVENTS:
                run = self.runs.pop(pid, None)
                if run and run["prompt"] and run["nodes"]:
                    self.ended[pid] = run
                    self._keep(self.ended)
                if not run or not run["file"]:
                    return None
                start, end = run["start"], data.get("timestamp")
                duration = ((end - start) / 1000.0 if isinstance(start, (int, float)) and isinstance(end, (int, float))
                            and end >= start else None)
                return run["file"], run["files"], END_EVENTS[event], duration
        return None

    def _sources(self, files):
        out_dir = self.output_dir()
        root = os.path.normcase(os.path.abspath(out_dir))
        return [(f, run_record._source_path(f, out_dir, root)) for f in files or []]

    def settle(self, pid):
        """Post-traitements de l'execution pid rattaches a leur Run mere (une seule fois)."""
        with self.finish_lock:
            return self._settle(pid)

    def _settle(self, pid):
        if pid in self.settled:
            return self.settled[pid]
        taken = set()
        run = self.ended.pop(pid, None) or {}
        prompt = run.get("prompt")
        extra = run.get("extra") if isinstance(run.get("extra"), dict) else {}
        pnginfo = extra.get("extra_pnginfo") if isinstance(extra.get("extra_pnginfo"), dict) else {}
        workflow = pnginfo.get("workflow")
        for node, files in (run.get("nodes") or {}).items():
            try:
                meds = post_process.upstream_medloads(prompt, node)
                if not meds:
                    continue
                mother = self.mother_fn(post_process.medload_file(prompt, meds[0][0]))
                if not mother:
                    continue  # le MedLoad le plus proche charge un fichier hors de tout Run
                others = set()
                for mid, _d in meds[1:]:
                    m = self.mother_fn(post_process.medload_file(prompt, mid))
                    if m and os.path.normcase(m["run_file"]) != os.path.normcase(mother["run_file"]):
                        others.add(os.path.basename(m["run_file"]))
                warning = ("Another MedLoad upstream loads a file of another run: " + ", ".join(sorted(others))
                           if others else None)
                params = post_process.branch_params(prompt, meds[0][0], node)
                for _f, src in self._sources(files):
                    if not src:
                        continue
                    taken.add(os.path.normcase(src))
                    self.attach_fn(mother["run_file"], mother["index"], mother["level"], src, params,
                                   workflow, warning)
            except Exception as e:
                print("[MagicStudio Project] Post-processing not recorded (node %s): %s" % (node, e))
        self.settled[pid] = taken
        self._keep(self.settled)
        return taken

    def finish(self, run_file, files, status, duration=None, pid=None):
        """finish_run une seule fois par JSON ; les appels suivants recoivent le meme resultat."""
        key = os.path.normcase(os.path.abspath(run_file or ""))
        with self.finish_lock:
            if key in self.done:
                return self.done[key]
            pid = pid or self.run_pids.get(key)
            taken = self._settle(pid) if pid else set()
            if taken:
                # Fichiers rattaches a un Run mere : pas dans le Run global.
                files = [f for f, src in self._sources(files) if not (src and os.path.normcase(src) in taken)]
            data = self.finish_fn(run_file, files, status, self.output_dir(), None, duration)
            self.done[key] = data
            while len(self.done) > KEEP:
                self.done.pop(next(iter(self.done)))
            return data

    def handle(self, event, data):
        """A appeler pour chaque message : fin d'un Run -> enregistrement dans un fil a part."""
        end = self.on_message(event, data)
        if end:
            threading.Thread(target=self._finish_quietly, args=end, daemon=True).start()
        elif event in END_EVENTS and isinstance(data, dict) and data.get("prompt_id") in self.ended:
            # Sans noeud Project : seulement les post-traitements.
            threading.Thread(target=self._settle_quietly, args=(data["prompt_id"],), daemon=True).start()

    def _settle_quietly(self, pid):
        try:
            self.settle(pid)
        except Exception as e:
            print("[MagicStudio Project] Post-processing not recorded: %s" % e)

    def _finish_quietly(self, run_file, files, status, duration):
        try:
            self.finish(run_file, files, status, duration)
        except Exception as e:
            print("[MagicStudio Project] Run not recorded (%s): %s" % (run_file, e))
