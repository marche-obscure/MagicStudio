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
"""

import os
import threading

try:  # dans ComfyUI (paquet) ; seul pour les tests
    from . import run_record
except ImportError:
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
    def __init__(self, output_dir, finish_fn=None):
        self.output_dir = output_dir  # fonction () -> dossier output de ComfyUI
        self.finish_fn = finish_fn or run_record.finish_run
        self.lock = threading.Lock()  # messages (fil d'execution de ComfyUI) : jamais bloque par un enregistrement
        self.finish_lock = threading.Lock()
        self.runs = {}  # prompt_id -> {file, files, start}
        self.done = {}  # JSON du Run (normcase) -> resultat de finish_run

    def _run(self, prompt_id):
        if prompt_id not in self.runs:
            self.runs[prompt_id] = {"file": "", "files": [], "start": None}
            while len(self.runs) > KEEP:
                self.runs.pop(next(iter(self.runs)))
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
                self._run(pid)["start"] = data.get("timestamp")
            elif event == "executed":
                run = self._run(pid)
                output = data.get("output") if isinstance(data.get("output"), dict) else {}
                mmrun = output.get("mmrun")
                if isinstance(mmrun, list) and mmrun and isinstance(mmrun[0], str):
                    run["file"] = mmrun[0]
                run["files"].extend(output_files(output))
            elif event in END_EVENTS:
                run = self.runs.pop(pid, None)
                if not run or not run["file"]:
                    return None
                start, end = run["start"], data.get("timestamp")
                duration = ((end - start) / 1000.0 if isinstance(start, (int, float)) and isinstance(end, (int, float))
                            and end >= start else None)
                return run["file"], run["files"], END_EVENTS[event], duration
        return None

    def finish(self, run_file, files, status, duration=None):
        """finish_run une seule fois par JSON ; les appels suivants recoivent le meme resultat."""
        key = os.path.normcase(os.path.abspath(run_file or ""))
        with self.finish_lock:
            if key in self.done:
                return self.done[key]
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

    def _finish_quietly(self, run_file, files, status, duration):
        try:
            self.finish(run_file, files, status, duration)
        except Exception as e:
            print("[MagicStudio Project] Run not recorded (%s): %s" % (run_file, e))
