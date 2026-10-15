"""
ComfyUI-MiniMaxRefLoader
------------------------
Noeud de chargement des references (images, videos, videos avec son,
audios) pour MiniMaxH3ReferenceToVideo, avec choix des fichiers dans des
galeries de miniatures.
"""

import os
import sys
import asyncio
import subprocess
import traceback

from . import media
from .nodes import MiniMaxH3RefLoader

NODE_CLASS_MAPPINGS = {
    "MiniMaxH3RefLoader": MiniMaxH3RefLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MiniMaxH3RefLoader": "MiniMax H3 Reference Loader",
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
        # proprietaire, pour qu'elle herite du premier plan (meme methode que
        # Pixaroma). Le dossier de depart passe par une variable
        # d'environnement (pas de probleme de guillemets) et la sortie est
        # forcee en UTF-8 (chemins avec accents).
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

except Exception:
    print("[ComfyUI-MiniMaxRefLoader] Could not register the API routes:")
    traceback.print_exc()

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
