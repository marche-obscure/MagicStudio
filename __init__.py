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
        """Projets de la racine 'root' ("" = racine par defaut)."""
        try:
            root = await _in_executor(_projects_root, request.rel_url.query.get("root", ""))
            names = await _in_executor(projects.list_projects, root)
        except Exception as e:
            return _project_error(e)
        return web.json_response({"root": root, "default_root": default_projects_root(), "projects": names})

    @routes.post("/mmproject/create")
    async def mmproject_create(request):
        """Cree le projet 'name' (et ses sous-dossiers) dans 'root'."""
        try:
            body = await request.json()
            root = await _in_executor(_projects_root, body.get("root", ""))
            path = await _in_executor(projects.create_project, root, body.get("name", ""))
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

except Exception:
    print("[ComfyUI-MiniMaxRefLoader] Could not register the API routes:")
    traceback.print_exc()

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
