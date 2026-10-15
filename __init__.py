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

    @routes.get("/mmrefloader/browse_dir")
    async def mmrefloader_browse_dir(request):
        """Ouvre l'explorateur de dossiers Windows (cote serveur) et renvoie le chemin choisi."""
        if sys.platform != "win32":
            return web.json_response(
                {"error": "This feature is only available on Windows."}, status=400)

        initial = request.rel_url.query.get("initial", "").strip()
        initial_line = ""
        if initial and os.path.isdir(initial):
            safe_initial = initial.replace('"', '`"')
            initial_line = f'$dialog.SelectedPath = "{safe_initial}"'

        script = f"""
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Select a folder"
$dialog.ShowNewFolderButton = $false
{initial_line}
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {{
    Write-Output $dialog.SelectedPath
}}
"""

        def run_dialog():
            proc = subprocess.run(
                ["powershell", "-NoProfile", "-STA", "-Command", script],
                capture_output=True, text=True, timeout=300,
            )
            return proc.stdout.strip()

        try:
            path = await _in_executor(run_dialog)
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)
        return web.json_response({"path": path or ""})

except Exception:
    print("[ComfyUI-MiniMaxRefLoader] Could not register the API routes:")
    traceback.print_exc()

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
