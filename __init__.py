"""
ComfyUI-MiniMaxRefLoader
------------------------
Noeud de chargement des references (images, videos, videos avec son,
audios) pour MiniMaxH3ReferenceToVideo, avec choix des fichiers dans des
galeries de miniatures, et noeud de dossier de projet (MiniMaxH3Project)
qui fixe le dossier racine de ces galeries.
"""

import os
import sys
import asyncio
import subprocess
import traceback

from . import media
from . import projects
from . import project_config
from .nodes import MiniMaxH3RefLoader, MiniMaxH3Project, default_projects_root

NODE_CLASS_MAPPINGS = {
    "MiniMaxH3RefLoader": MiniMaxH3RefLoader,
    "MiniMaxH3Project": MiniMaxH3Project,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MiniMaxH3RefLoader": "MiniMax H3 Reference Loader",
    "MiniMaxH3Project": "MiniMax H3 Project",
}

WEB_DIRECTORY = "./web/js"

# ------------------------------------------------------------------
# Routes API utilisees par le frontend : liste d'un dossier, miniatures
# et explorateur de dossiers Windows.
# ------------------------------------------------------------------
try:
    from server import PromptServer
    from aiohttp import web

    routes = PromptServer.instance.routes

    async def _in_executor(fn, *args):
        return await asyncio.get_event_loop().run_in_executor(None, fn, *args)

    @routes.get("/mmrefloader/list")
    async def mmrefloader_list(request):
        """Fichiers du type 'kind' (image/video/audio) du dossier 'path'."""
        folder = request.rel_url.query.get("path", "").strip()
        kind = request.rel_url.query.get("kind", "").strip()
        try:
            files = await _in_executor(media.list_folder, folder, kind)
        except FileNotFoundError as e:
            return web.json_response({"error": str(e)}, status=400)
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)
        return web.json_response({"files": files})

    @routes.get("/mmrefloader/subfolders")
    async def mmrefloader_subfolders(request):
        """Sous-dossiers de 'path' et leur nombre de fichiers 'kind' ; all=1 : tous les sous-dossiers."""
        folder = request.rel_url.query.get("path", "").strip()
        kind = request.rel_url.query.get("kind", "").strip()
        every = request.rel_url.query.get("all", "") == "1"
        try:
            subs = await _in_executor(media.list_subfolders, folder, kind, every)
        except FileNotFoundError as e:
            return web.json_response({"error": str(e)}, status=400)
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)
        return web.json_response({"subfolders": subs})

    @routes.get("/mmrefloader/thumb")
    async def mmrefloader_thumb(request):
        """Miniature JPEG d'un fichier du dossier (nom simple, sans chemin)."""
        folder = request.rel_url.query.get("path", "").strip()
        name = request.rel_url.query.get("file", "").strip()
        if not name or os.path.basename(name) != name:
            return web.json_response({"error": "Invalid file name."}, status=400)
        full = os.path.join(folder, name)
        if not os.path.isfile(full):
            return web.json_response({"error": "File not found."}, status=404)
        try:
            data = await _in_executor(media.make_thumbnail, full, 192)
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)
        # L'URL contient la date de modification : la miniature peut etre gardee en cache.
        return web.Response(body=data, content_type="image/jpeg",
                            headers={"Cache-Control": "max-age=86400"})

    @routes.get("/mmrefloader/info")
    async def mmrefloader_info(request):
        """Infos d'un fichier selectionne (chemin complet) pour l'encadre de la fenetre de selection."""
        full = request.rel_url.query.get("file", "").strip()
        try:
            info = await _in_executor(media.media_info, full)
        except FileNotFoundError as e:
            return web.json_response({"error": str(e)}, status=404)
        except Exception as e:
            return web.json_response({"error": str(e)}, status=400)
        return web.json_response(info)

    @routes.get("/mmrefloader/media")
    async def mmrefloader_media(request):
        """Sert le fichier lui-meme (apercu image, lecteur video/audio) ; types supportes uniquement."""
        full = request.rel_url.query.get("file", "").strip()
        if media.kind_of(full) is None or not os.path.isfile(full):
            return web.json_response({"error": "File not found."}, status=404)
        return web.FileResponse(full)

    @routes.get("/mmrefloader/browse_dir")
    async def mmrefloader_browse_dir(request):
        """Ouvre l'explorateur de dossiers Windows (cote serveur) et renvoie le chemin choisi."""
        if sys.platform != "win32":
            return web.json_response(
                {"error": "This feature is only available on Windows."}, status=400)

        initial = request.rel_url.query.get("initial", "").strip()

        # Lancee seule, la boite de dialogue s'ouvre derriere le navigateur :
        # on affiche d'abord une fenetre invisible "toujours au premier plan"
        # et on ouvre la boite dans son evenement Shown, avec elle comme
        # proprietaire, pour qu'elle herite du premier plan. Le dossier de
        # depart passe par une variable
        # d'environnement (pas de probleme de guillemets) et la sortie est
        # forcee en UTF-8 (chemins avec accents).
        # Script adapte de ComfyUI-Pixaroma (https://github.com/pixaroma/ComfyUI-Pixaroma),
        # Copyright (c) 2026 pixaroma, licence MIT (voir LICENSE, "Third-party code").
        script = (
            "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;"
            "Add-Type -AssemblyName System.Windows.Forms;"
            "$r='';"
            "$o=New-Object System.Windows.Forms.Form;"
            "$o.TopMost=$true;$o.ShowInTaskbar=$false;$o.FormBorderStyle='None';"
            "$o.Width=1;$o.Height=1;$o.Opacity=0;$o.StartPosition='CenterScreen';"
            "$o.Add_Shown({"
            "$o.Activate();"
            "$d=New-Object System.Windows.Forms.FolderBrowserDialog;"
            "$d.Description='Select a folder';$d.ShowNewFolderButton=$false;"
            "if($env:MMREF_START){try{$d.SelectedPath=$env:MMREF_START}catch{}};"
            "if($d.ShowDialog($o) -eq [System.Windows.Forms.DialogResult]::OK){$script:r=$d.SelectedPath};"
            "$o.Close()"
            "});"
            "[void]$o.ShowDialog();"
            "[Console]::Out.Write($r)"
        )

        def run_dialog():
            env = dict(os.environ)
            env["MMREF_START"] = initial if initial and os.path.isdir(initial) else ""
            proc = subprocess.run(
                ["powershell", "-NoProfile", "-STA", "-Command", script],
                capture_output=True, text=True, encoding="utf-8", errors="replace",
                timeout=300, env=env,
                creationflags=0x08000000,  # CREATE_NO_WINDOW : pas de console qui clignote
            )
            return (proc.stdout or "").strip()

        try:
            path = await _in_executor(run_dialog)
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)
        return web.json_response({"path": path or ""})

    # ------ Noeud Projet : racine des projets, liste, creation, ouverture ------

    def _projects_root(root):
        """Racine demandee, ou racine par defaut (creee si besoin) si vide."""
        root = (root or "").strip()
        if root:
            return root
        root = default_projects_root()
        os.makedirs(root, exist_ok=True)
        return root

    def _project_error(e):
        status = 409 if isinstance(e, FileExistsError) else 400 if isinstance(
            e, (ValueError, FileNotFoundError)) else 500
        return web.json_response({"error": str(e)}, status=status)

    @routes.get("/mmproject/list")
    async def mmproject_list(request):
        """
        Projets de la racine 'root' ("" = racine par defaut). Racine absente
        du disque : exists = false et liste vide (la fenetre de creation
        propose alors de la creer).
        """
        try:
            root = await _in_executor(_projects_root, request.rel_url.query.get("root", ""))
            exists = os.path.isdir(root)
            names = await _in_executor(projects.list_projects, root) if exists else []
        except Exception as e:
            return _project_error(e)
        return web.json_response({"root": root, "exists": exists, "default_root": default_projects_root(),
                                  "projects": names})

    @routes.post("/mmproject/create")
    async def mmproject_create(request):
        """Cree le projet 'name' (et ses sous-dossiers) dans 'root', creee aussi si create_root."""
        try:
            body = await request.json()
            root = await _in_executor(_projects_root, body.get("root", ""))
            path = await _in_executor(projects.create_project, root, body.get("name", ""),
                                      bool(body.get("create_root")))
        except Exception as e:
            return _project_error(e)
        return web.json_response({"root": root, "path": path, "name": os.path.basename(path)})

    @routes.post("/mmproject/open")
    async def mmproject_open(request):
        """Chemin du projet 'name' de 'root' ; ses sous-dossiers manquants sont recrees."""
        try:
            body = await request.json()
            root = await _in_executor(_projects_root, body.get("root", ""))
            name = body.get("name", "")
            created = await _in_executor(projects.ensure_project, os.path.join(root, projects.validate_name(name)))
        except Exception as e:
            return _project_error(e)
        return web.json_response({"root": root, "path": os.path.join(root, name.strip()), "created": created})

    @routes.post("/mmproject/save_plan")
    async def mmproject_save_plan(request):
        """Ce que Save va faire (copie, deja present, manquant), sans rien ecrire."""
        try:
            body = await request.json()
            plan = await _in_executor(projects.plan_save, body.get("project", ""), body.get("items") or [])
        except Exception as e:
            return _project_error(e)
        return web.json_response({"plan": plan})

    @routes.post("/mmproject/save")
    async def mmproject_save(request):
        """Copie les fichiers dans le projet et ecrit les configurations JSON dans 00.Workflows."""
        try:
            body = await request.json()
            project = body.get("project", "")
            dsts = await _in_executor(projects.execute_save, project, body.get("items") or [])
            configs = []
            for c in body.get("configs") or []:
                configs.append(await _in_executor(projects.write_config, project, c.get("name", ""),
                                                  c.get("content", "")))
        except Exception as e:
            return _project_error(e)
        return web.json_response({"dsts": dsts, "configs": configs})

    @routes.post("/mmproject/rename")
    async def mmproject_rename(request):
        """Renomme le dossier du projet 'path' en 'name'."""
        try:
            body = await request.json()
            path = await _in_executor(projects.rename_project, body.get("path", ""), body.get("name", ""))
        except Exception as e:
            return _project_error(e)
        return web.json_response({"path": path, "root": os.path.dirname(path), "name": os.path.basename(path)})

    @routes.post("/mmproject/move")
    async def mmproject_move(request):
        """Deplace le dossier du projet 'path' dans le dossier 'dest'."""
        try:
            body = await request.json()
            path = await _in_executor(projects.move_project, body.get("path", ""), body.get("dest", ""))
        except Exception as e:
            return _project_error(e)
        return web.json_response({"path": path, "root": os.path.dirname(path), "name": os.path.basename(path)})

    # ------ Workflow du projet (00.Workflows) et archives ------

    @routes.get("/mmproject/workflows")
    async def mmproject_workflows(request):
        """Workflows et archives du projet 'project'."""
        try:
            data = await _in_executor(projects.list_workflows, request.rel_url.query.get("project", ""))
        except Exception as e:
            return _project_error(e)
        return web.json_response(data)

    @routes.get("/mmproject/workflow")
    async def mmproject_workflow(request):
        """Contenu d'un workflow (ou d'une archive) du projet."""
        q = request.rel_url.query
        try:
            text = await _in_executor(projects.read_workflow, q.get("project", ""), q.get("name", ""),
                                      q.get("archive") == "1")
        except Exception as e:
            return _project_error(e)
        return web.Response(text=text, content_type="application/json")

    @routes.post("/mmproject/save_workflow")
    async def mmproject_save_workflow(request):
        """Ecrit le workflow ; 'archive' = workflow precedent renomme yyyyMMdd-HHmmss_nom.json d'abord."""
        try:
            body = await request.json()
            info = await _in_executor(projects.save_workflow, body.get("project", ""), body.get("name", ""),
                                      body.get("content", ""), body.get("archive") or None)
        except Exception as e:
            return _project_error(e)
        return web.json_response(info)

    @routes.post("/mmproject/archive_files")
    async def mmproject_archive_files(request):
        """Deplace des fichiers d'un dossier du projet dans son sous-dossier Archives (deja confirme)."""
        try:
            body = await request.json()
            moved = await _in_executor(projects.archive_files, body.get("project", ""), body.get("folder", ""),
                                       list(body.get("names") or []))
        except Exception as e:
            return _project_error(e)
        return web.json_response({"moved": moved})

    @routes.post("/mmproject/import_files")
    async def mmproject_import_files(request):
        """Remplacants valides : copies (ou deplaces depuis Archives) dans le dossier du projet."""
        try:
            body = await request.json()
            dsts = await _in_executor(projects.import_files, body.get("project", ""), body.get("folder", ""),
                                      list(body.get("paths") or []))
        except Exception as e:
            return _project_error(e)
        return web.json_response({"dsts": dsts})

    @routes.get("/mmproject/folder_files")
    async def mmproject_folder_files(request):
        """
        Fichiers a la racine des dossiers demandes (folders = noms separes par |) ;
        archives=1 : aussi ceux de leur dossier Archives.
        """
        q = request.rel_url.query
        try:
            folders = [f for f in q.get("folders", "").split("|") if f]
            files = await _in_executor(projects.folder_files, q.get("project", ""), folders)
            out = {"files": files}
            if q.get("archives") == "1":
                out["archives"] = await _in_executor(projects.folder_files, q.get("project", ""), folders,
                                                     projects.ARCHIVE_FOLDER)
        except Exception as e:
            return _project_error(e)
        return web.json_response(out)

    @routes.get("/mmproject/archive_duplicates")
    async def mmproject_archive_duplicates(request):
        """Doublons (meme SHA256) dans <dossier>/Archives (folders = noms separes par |)."""
        q = request.rel_url.query
        try:
            folders = [f for f in q.get("folders", "").split("|") if f]
            groups = await _in_executor(projects.archive_duplicates, q.get("project", ""), folders)
        except Exception as e:
            return _project_error(e)
        return web.json_response({"duplicates": groups, "trash": projects.TRASH_AVAILABLE})

    @routes.post("/mmproject/delete_duplicates")
    async def mmproject_delete_duplicates(request):
        """Supprime les copies des groupes coches (deja confirme) : Corbeille ou definitif."""
        try:
            body = await request.json()
            names = await _in_executor(projects.delete_duplicates, body.get("project", ""), body.get("folder", ""),
                                       list(body.get("shas") or []), bool(body.get("trash")))
        except Exception as e:
            return _project_error(e)
        return web.json_response({"deleted": names})

    @routes.post("/mmproject/hashes")
    async def mmproject_hashes(request):
        """SHA256 des fichiers demandes (doublons de la galerie)."""
        try:
            body = await request.json()
            hashes = await _in_executor(projects.file_hashes, list(body.get("paths") or []))
        except Exception as e:
            return _project_error(e)
        return web.json_response({"hashes": hashes})

    # ------ Configuration du projet (99.Project-Config) : Save et Load ------

    @routes.post("/mmproject/config/save")
    async def mmproject_config_save(request):
        """Ecrit Project-Config.json (l'ancien dans Archives) ; errors = fichiers sans indice."""
        try:
            body = await request.json()
            info = await _in_executor(project_config.save_config, body.get("project", ""), body.get("refs") or {},
                                      body.get("trims") or {}, body.get("mode", ""), body.get("workflow", ""))
        except project_config.ConfigError as e:
            return web.json_response({"error": str(e), "errors": e.errors}, status=400)
        except Exception as e:
            return _project_error(e)
        return web.json_response(info)

    @routes.post("/mmproject/config/check")
    async def mmproject_config_check(request):
        """Load, avant toute modification : SHA256, archives, structure du workflow."""
        try:
            body = await request.json()
            report = await _in_executor(project_config.check_config, body.get("project", ""), body.get("current"))
        except Exception as e:
            return _project_error(e)
        return web.json_response(report)

    @routes.post("/mmproject/config/restore")
    async def mmproject_config_restore(request):
        """Load confirme : fichiers retrouves remis en place depuis Archives."""
        try:
            body = await request.json()
            done = await _in_executor(project_config.restore_files, body.get("project", ""),
                                      list(body.get("items") or []))
        except Exception as e:
            return _project_error(e)
        return web.json_response({"restored": done})

    @routes.post("/mmproject/delete_archive")
    async def mmproject_delete_archive(request):
        """Supprime une archive de workflow (deja confirme dans l'UI)."""
        try:
            body = await request.json()
            await _in_executor(projects.delete_archive, body.get("project", ""), body.get("name", ""))
        except Exception as e:
            return _project_error(e)
        return web.json_response({"ok": True})

except Exception:
    print("[ComfyUI-MiniMaxRefLoader] Could not register the API routes:")
    traceback.print_exc()

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
