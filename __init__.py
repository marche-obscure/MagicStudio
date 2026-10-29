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
from . import profiles
from . import projects
from . import project_config
from . import run_record
from . import extract_frame
from . import run_tracker
from . import final_cut
from . import load_media
from . import select_mod
from .nodes import (MiniMaxH3RefLoader, MiniMaxH3Project, MiniMaxH3FinalCut, MiniMaxH3LoadMedia,
                    MagicStudioSelectMod, MagicStudioContainer, default_projects_root, selectmod_roots)

NODE_CLASS_MAPPINGS = {
    "MiniMaxH3RefLoader": MiniMaxH3RefLoader,
    "MiniMaxH3Project": MiniMaxH3Project,
    "MiniMaxH3FinalCut": MiniMaxH3FinalCut,
    "MiniMaxH3LoadMedia": MiniMaxH3LoadMedia,
    "MagicStudioSelectMod": MagicStudioSelectMod,
    "MagicStudioContainer": MagicStudioContainer,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MiniMaxH3RefLoader": "MagicStudio RefLoader",
    "MiniMaxH3Project": "MagicStudio Project",
    "MiniMaxH3FinalCut": "MagicStudio Final Cut",
    "MiniMaxH3LoadMedia": "MagicStudio MedLoad",
    "MagicStudioSelectMod": "MagicStudio SelectMod",
    "MagicStudioContainer": "MagicStudio Container",
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

    # ---- MagicStudio SelectMod (29/10/2026) : lecture des dossiers de modeles seulement ----
    def _selectmod_roots():
        return selectmod_roots()

    def _selectmod_refused(e):
        return web.json_response({"error": str(e)}, status=403)

    @routes.get("/mmselectmod/roots")
    async def mmselectmod_roots(request):
        """Racines permises (models, Models (Linker)), lues par le serveur."""
        try:
            return web.json_response({"roots": await _in_executor(_selectmod_roots)})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    @routes.get("/mmselectmod/tree")
    async def mmselectmod_tree(request):
        """Sous-dossiers d'un dossier permis (nombre de fichiers de modeles)."""
        path = request.rel_url.query.get("path", "")
        try:
            return web.json_response({"dirs": await _in_executor(select_mod.tree, path, _selectmod_roots())})
        except PermissionError as e:
            return _selectmod_refused(e)
        except OSError as e:
            return web.json_response({"error": str(e)}, status=400)

    @routes.get("/mmselectmod/files")
    async def mmselectmod_files(request):
        """Fichiers de modeles d'un dossier permis (nom, taille, date)."""
        path = request.rel_url.query.get("path", "")
        try:
            return web.json_response({"files": await _in_executor(select_mod.files, path, _selectmod_roots())})
        except PermissionError as e:
            return _selectmod_refused(e)
        except OSError as e:
            return web.json_response({"error": str(e)}, status=400)

    @routes.get("/mmselectmod/search")
    async def mmselectmod_search(request):
        """Recherche par nom dans un dossier permis et ses sous-dossiers."""
        q = request.rel_url.query
        try:
            return web.json_response(await _in_executor(select_mod.search, q.get("path", ""), _selectmod_roots(),
                                                        q.get("q", "")))
        except PermissionError as e:
            return _selectmod_refused(e)
        except OSError as e:
            return web.json_response({"error": str(e)}, status=400)

    @routes.get("/mmselectmod/list_dirs")
    async def mmselectmod_list_dirs(request):
        """Sous-dossiers avec des fichiers de l'origine (relatifs), dans les dossiers de modeles seulement."""
        path = request.rel_url.query.get("path", "")
        try:
            return web.json_response({"dirs": await _in_executor(select_mod.list_dirs, path, _selectmod_roots())})
        except PermissionError as e:
            return _selectmod_refused(e)
        except OSError as e:
            return web.json_response({"error": str(e)}, status=400)

    @routes.get("/mmselectmod/list_files")
    async def mmselectmod_list_files(request):
        """Fichiers de <origin>/<subdir>, dans les dossiers de modeles seulement."""
        q = request.rel_url.query
        try:
            return web.json_response({"files": await _in_executor(select_mod.list_files, q.get("origin", ""),
                                                                  q.get("subdir", ""), _selectmod_roots())})
        except PermissionError as e:
            return _selectmod_refused(e)
        except OSError as e:
            return web.json_response({"error": str(e)}, status=400)

    @routes.get("/mmselectmod/dir_exists")
    async def mmselectmod_dir_exists(request):
        """Le dossier de sauvegarde (roue) existe-t-il ? (il peut etre hors des modeles, ex. 02.Models)."""
        path = request.rel_url.query.get("path", "").strip()
        return web.json_response({"exists": bool(path) and os.path.isdir(path)})

    @routes.get("/mmselectmod/join_path")
    async def mmselectmod_join_path(request):
        """Chemin d'un champ (Absolute : origine + sous-dossier + fichier ; Relative : sans l'origine)."""
        q = request.rel_url.query
        return web.json_response({"path": select_mod.join_path(q.get("origin", "").strip(), q.get("dir", "").strip(),
                                                               q.get("file", "").strip(), q.get("mode", "Absolute"))})

    @routes.post("/mmselectmod/save_export")
    async def mmselectmod_save_export(request):
        """Export des champs (.json) dans le dossier de sauvegarde ; jamais par-dessus un fichier existant."""
        try:
            data = await request.json()
            path = await _in_executor(select_mod.write_export, data.get("folder", ""), data.get("name", ""),
                                      data.get("content", ""))
        except (ValueError, FileNotFoundError) as e:
            return web.json_response({"error": str(e)}, status=400)
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)
        return web.json_response({"path": path})

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

    @routes.get("/mmrefloader/profiles")
    async def mmrefloader_profiles(request):
        """Description des variantes (modeles, lignes, sorties, limites) : {"description": ...}."""
        return web.json_response({"description": profiles.description()})

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
        # Cache : un jour seulement si l'URL porte la date du fichier ; sinon le navigateur
        # redemande et recoit 304 si le fichier n'a pas change (voir media.thumb_cache).
        cache = media.thumb_cache(full, request.rel_url.query, request.headers.get("If-None-Match"))
        if cache["not_modified"]:
            return web.Response(status=304, headers=cache["headers"])
        try:
            data = await _in_executor(media.make_thumbnail, full, 192)
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)
        return web.Response(body=data, content_type="image/jpeg", headers=cache["headers"])

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

    @routes.get("/mmrefloader/load_media/check")
    async def mmrefloader_load_media_check(request):
        """
        Noeud Load Media : chemin accepte ? -> {path, kind}, sinon {error} (memes regles que le Run).
        "drop" = texte depose (lien text/uri-list de Final Cut), lu par load_media.path_from_drop.
        """
        import folder_paths
        q = request.rel_url.query
        try:
            if "drop" in q:
                text = load_media.path_from_drop(q.get("drop", ""))
                if not text:
                    raise ValueError("Not a file of MagicStudio Final Cut.")
            else:
                text = q.get("file", "")
            path, kind = load_media.check_path(text, folder_paths.get_input_directory())
        except ValueError as e:
            return web.json_response({"error": str(e)}, status=400)
        return web.json_response({"path": path, "kind": kind})

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
            requested = await _in_executor(_projects_root, request.rel_url.query.get("root", ""))
            exists = os.path.isdir(requested)
            # Racine ancree sur le dossier mere : prefix = ancienne racine relative a la nouvelle.
            root, prefix = projects.anchor_root(requested) if exists else (requested, "")
            tree = await _in_executor(projects.project_tree, root) if exists else []
        except Exception as e:
            return _project_error(e)
        names = []
        for e in tree:
            names.extend([e["name"]] if e["projects"] is None
                         else [e["name"] + projects.GROUP_SEP + s for s in e["projects"]])
        return web.json_response({"root": root, "exists": exists, "default_root": default_projects_root(),
                                  "projects": names, "tree": tree, "anchored": prefix})

    @routes.post("/mmproject/create")
    async def mmproject_create(request):
        """Cree le projet 'name' (et ses sous-dossiers) dans 'root', creee aussi si create_root."""
        try:
            body = await request.json()
            root = await _in_executor(_projects_root, body.get("root", ""))
            group = body.get("group")  # MultiProject : dossier de projets (new_group : a creer)
            path = await _in_executor(projects.create_project, root, body.get("name", ""),
                                      bool(body.get("create_root")), group or None, bool(body.get("new_group")))
        except Exception as e:
            return _project_error(e)
        name = os.path.basename(path)
        return web.json_response({"root": root, "path": path,
                                  "name": os.path.basename(os.path.dirname(path)) + projects.GROUP_SEP + name
                                  if group else name})

    @routes.post("/mmproject/open")
    async def mmproject_open(request):
        """Chemin du projet 'name' de 'root' ; ses sous-dossiers manquants sont recrees."""
        try:
            body = await request.json()
            root = await _in_executor(_projects_root, body.get("root", ""))
            path = projects.project_path(root, body.get("name", ""))
            # Dossier de projets : jamais ouvert comme projet (ses dossiers 00 a 99 seraient crees).
            if os.path.isdir(path) and projects.project_children(path):
                raise ValueError("This folder holds projects: pick one of them.")
            created = await _in_executor(projects.ensure_project, path)
        except Exception as e:
            return _project_error(e)
        return web.json_response({"root": root, "path": path, "created": created})

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
            projects.require_project(body.get("project", ""))  # vrai projet seulement (revue securite du 24/10/2026)
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
            projects.require_project(body.get("path", ""))  # vrai projet seulement (revue securite du 24/10/2026)
            path = await _in_executor(projects.rename_project, body.get("path", ""), body.get("name", ""))
        except Exception as e:
            return _project_error(e)
        return web.json_response({"path": path, "root": os.path.dirname(path), "name": os.path.basename(path)})

    @routes.post("/mmproject/move")
    async def mmproject_move(request):
        """Deplace le dossier du projet 'path' dans le dossier 'dest'."""
        try:
            body = await request.json()
            projects.require_project(body.get("path", ""))  # vrai projet seulement (revue securite du 24/10/2026)
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
            projects.require_project(body.get("project", ""))  # vrai projet seulement (revue securite du 24/10/2026)
            info = await _in_executor(projects.save_workflow, body.get("project", ""), body.get("name", ""),
                                      body.get("content", ""), body.get("archive") or None)
        except Exception as e:
            return _project_error(e)
        return web.json_response(info)

    @routes.post("/mmproject/archive_files")
    async def mmproject_archive_files(request):
        """
        Deplace des fichiers d'un dossier du projet dans son sous-dossier Archives (deja confirme).
        Les fichiers d'un Run restent en place (kept, 26/10/2026) : finish_run / tidy_rush les rangent dans 40 / 60.
        """
        try:
            body = await request.json()
            projects.require_project(body.get("project", ""))  # vrai projet seulement (revue securite du 24/10/2026)
            project, folder = body.get("project", ""), body.get("folder", "")
            names = [str(n) for n in (body.get("names") or [])]
            paths = [os.path.join(project, folder, n) for n in names]
            held = set(await _in_executor(run_record.protected_files, project, paths))
            kept = [n for n, p in zip(names, paths) if p in held]
            moved = await _in_executor(projects.archive_files, project, folder, [n for n in names if n not in kept])
        except Exception as e:
            return _project_error(e)
        return web.json_response({"moved": moved, "kept": kept})

    @routes.post("/mmproject/import_files")
    async def mmproject_import_files(request):
        """Remplacants valides : copies (ou deplaces depuis Archives) dans le dossier du projet."""
        try:
            body = await request.json()
            projects.require_project(body.get("project", ""))  # vrai projet seulement (revue securite du 24/10/2026)
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
            if q.get("dates") == "1":
                groups = dict(files)
                groups.update({"Archives/" + k: v for k, v in (out.get("archives") or {}).items()})
                out["mtimes"] = await _in_executor(projects.file_mtimes, groups)
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
            projects.require_project(body.get("project", ""))  # vrai projet seulement (revue securite du 24/10/2026)
            names = await _in_executor(projects.delete_duplicates, body.get("project", ""), body.get("folder", ""),
                                       list(body.get("shas") or []), bool(body.get("trash")))
        except Exception as e:
            return _project_error(e)
        return web.json_response({"deleted": names})

    @routes.post("/mmproject/reset")
    async def mmproject_reset(request):
        """Reset du projet (bouton Reset) : dry_run = bilan ; sinon tous ses fichiers vers la Corbeille."""
        try:
            body = await request.json()
            projects.require_project(body.get("project", ""))  # vrai projet seulement (revue securite du 24/10/2026)
            data = await _in_executor(projects.reset_project, body.get("project", ""), bool(body.get("dry_run")))
        except Exception as e:
            return _project_error(e)
        return web.json_response(data)

    @routes.post("/mmproject/copy_media")
    async def mmproject_copy_media(request):
        """Copy (bouton Copy) : 08 a 14 (et leurs Archives) d'un autre projet ; dry_run = bilan."""
        try:
            body = await request.json()
            projects.require_project(body.get("project", ""))  # vrai projet seulement (revue securite du 24/10/2026)
            projects.require_project(body.get("source", ""))
            data = await _in_executor(project_config.copy_media, body.get("project", ""), body.get("source", ""),
                                      bool(body.get("dry_run")), str(body.get("sub") or ""))
        except Exception as e:
            return _project_error(e)
        return web.json_response(data)

    @routes.post("/mmproject/run_done")
    async def mmproject_run_done(request):
        """Fin d'un Run enregistre : fichiers generes copies dans les rushs et listes dans son JSON."""
        try:
            import folder_paths
            body = await request.json()
            # Deja enregistre par le serveur (suivi des messages) : meme resultat, rien n'est refait.
            data = await _in_executor(_run_tracker.finish, body.get("run_file", ""), list(body.get("files") or []),
                                      body.get("status", ""), body.get("duration"), body.get("prompt_id"))
        except Exception as e:
            return _project_error(e)
        return web.json_response(data)

    def _extract_change(project):
        """Regles de changement de video du Picture Lock (Extract Frame) ; None si rien ne s'est passe ou en cas d'echec."""
        try:
            projects.require_project(project)  # la lecture des Runs n'a pas de garde : on ne supprime que dans un vrai projet
        except (ValueError, FileNotFoundError):
            return None  # pas un projet : rien a faire, pas de message
        try:
            trash_fn = projects._to_recycle_bin if projects.TRASH_AVAILABLE else None
            res = extract_frame.check_lock_change(project, trash_fn)
        except Exception as e:  # ne casse jamais la lecture des Runs ni le tri
            print("[MagicStudio Project] Extract Frame check failed: %s" % e)
            return None
        if res and (res.get("emptied") or res.get("deleted") or res.get("ask_replace") or res.get("trash_error")):
            return res
        return None

    @routes.get("/mmproject/runs")
    async def mmproject_runs(request):
        """Runs enregistres du projet (04.Prompt), le plus recent d'abord."""
        try:
            project = request.rel_url.query.get("project", "").strip()
            change = await _in_executor(_extract_change, project)  # Extract Frame : regles du changement de video
            runs = await _in_executor(run_record.list_runs, project)
            sets = await _in_executor(run_record.registry_sets, project)
            # Picture Lock (choix utilisateur, 26/10/2026) : un seul fichier, tous projets ; overfull = dossiers qui en tiennent plus.
            single = run_record.single_lock(project)
            overfull = run_record.lock_overfull(project)
            locked = {k: [os.path.basename(p) for p in run_record.lock_files(project, k)] for k in ("video", "image")}
            # Fichiers sur le disque par dossier de tri et fichiers deposes a la main (22/10/2026).
            counts = await _in_executor(run_record.sort_counts, project)
            orphans = await _in_executor(run_record.rush_orphans, project)
        except Exception as e:
            return _project_error(e)
        data = {"runs": runs, "registries": sets, "single_lock": single, "locked": locked,
                "overfull": overfull, "counts": counts, "orphans": orphans}
        if change:
            data["extract_change"] = change
        return web.json_response(data)

    @routes.get("/mmproject/run_workflow")
    async def mmproject_run_workflow(request):
        """Workflow d'un Run (00.Workflows/Run, sinon celui range dans ses rendus)."""
        q = request.rel_url.query
        try:
            data = await _in_executor(run_record.read_run_workflow, q.get("project", "").strip(), q.get("name", ""),
                                      q.get("post", "") or None)
        except Exception as e:
            return _project_error(e)
        return web.json_response(data)

    def _comfy_busy():
        """Un Run tourne dans ComfyUI (file d'attente : prompt en cours d'execution)."""
        try:
            running, _pending = PromptServer.instance.prompt_queue.get_current_queue()
            return bool(running)
        except Exception:
            return True  # file illisible : on garde les Runs "running"

    @routes.post("/mmproject/purge")
    async def mmproject_purge(request):
        """
        Purge du projet (bouton Purge) : dry_run = compte seulement (fenetre
        d'avertissement) ; sinon supprime les Runs "running" sans Run en cours
        et range les Runs "error" dans 98.Error ; empty_done : supprime aussi
        les Runs "done" sans sortie image ou video.
        """
        try:
            body = await request.json()
            projects.require_project(body.get("project", ""))  # vrai projet seulement (revue securite du 24/10/2026)
            data = await _in_executor(run_record.purge_runs, body.get("project", ""), _comfy_busy(),
                                      bool(body.get("dry_run")), bool(body.get("empty_done")))
        except Exception as e:
            return _project_error(e)
        return web.json_response(data)

    @routes.post("/mmproject/sort_output")
    async def mmproject_sort_output(request):
        """Range une sortie de Run dans Picture Lock / Rough Cut / Footage / No Good de 40 / 60 (rapatriement : copie, SHA256, suppression)."""
        try:
            body = await request.json()
            projects.require_project(body.get("project", ""))  # vrai projet seulement (revue securite du 24/10/2026)
            def work():
                # Meme verrou qu'Extract Frame : le tri et le controle qui suit ne sont pas coupes par une lecture des Runs.
                with extract_frame.lock_for(body.get("project", "")):
                    res = run_record.sort_output(body.get("project", ""), body.get("run", ""),
                                                 body.get("index"), body.get("target", ""), bool(body.get("swap")))
                    change = _extract_change(body.get("project", ""))
                return res, change
            data, change = await _in_executor(work)
            if change and isinstance(data, dict):
                data["extract_change"] = change
        except Exception as e:
            return _project_error(e)
        return web.json_response(data)

    @routes.get("/mmproject/extract/info")
    async def mmproject_extract_info(request):
        """Extract Frame : video du Picture Lock (40), ses infos, fichiers deja extraits."""
        try:
            project = request.rel_url.query.get("project", "").strip()
            projects.require_project(project)  # vrai projet seulement

            def work():
                video = extract_frame.lock_video(project)
                info = extract_frame.video_info(video) if video else {}
                return {"video": video, "frames": info.get("frames", 0), "fps": info.get("fps", 0),
                        "width": info.get("width", 0), "height": info.get("height", 0),
                        "files": extract_frame.listing(project),
                        "overfull": "video" in run_record.lock_overfull(project)}
            data = await _in_executor(work)
        except Exception as e:
            return _project_error(e)
        return web.json_response(data)

    @routes.post("/mmproject/extract")
    async def mmproject_extract(request):
        """Extract Frame : ecrit FIRST / LAST / les deux / une image N dans Picture Lock/Extract Frame."""
        try:
            body = await request.json()
            projects.require_project(body.get("project", ""))  # vrai projet seulement
            which, n, overwrite = extract_frame.parse_request(body)
            data = await _in_executor(extract_frame.extract, body.get("project", ""), which, n, overwrite)
        except Exception as e:
            return _project_error(e)
        return web.json_response(data)

    @routes.post("/mmproject/extract/replace")
    async def mmproject_extract_replace(request):
        """Extract Frame : reponse a la question apres un changement de video (keep = garder FIRST / LAST)."""
        try:
            body = await request.json()
            projects.require_project(body.get("project", ""))  # vrai projet seulement
            data = await _in_executor(extract_frame.replace_first_last, body.get("project", ""),
                                      extract_frame.parse_keep(body))
        except Exception as e:
            return _project_error(e)
        return web.json_response(data)

    @routes.get("/mmproject/final_cut/plan")
    async def mmproject_final_cut_plan(request):
        """Final Cut : ce que la synchronisation ferait (rien n'est modifie) et la jonction attendue."""
        try:
            import folder_paths
            project = request.rel_url.query.get("project", "").strip()
            if not project or not os.path.isdir(project):
                raise FileNotFoundError("Project folder not found: %s" % project)
            data = await _in_executor(final_cut.plan, project)
            # linked : la jonction mene bien a ces copies ; conflict : vrai dossier du meme nom dans input.
            data.update(final_cut.link_status(data["folder"], folder_paths.get_input_directory()))
            data["synced"] = os.path.isdir(data["folder"])
        except Exception as e:
            return _project_error(e)
        return web.json_response(data)

    @routes.get("/mmproject/final_cut/progress")
    async def mmproject_final_cut_progress(request):
        """Final Cut : progression de la synchronisation en cours ({running: false} sinon)."""
        try:
            project = request.rel_url.query.get("project", "").strip()
            if not project or not os.path.isdir(project):
                raise FileNotFoundError("Project folder not found: %s" % project)
            state = final_cut.progress(project)
        except Exception as e:
            return _project_error(e)
        return web.json_response(dict(state, running=True) if state else {"running": False})

    @routes.post("/mmproject/final_cut/sync")
    async def mmproject_final_cut_sync(request):
        """Final Cut : miroir des Picture Lock (anciennes copies a la Corbeille) et jonction dans input."""
        try:
            import folder_paths
            body = await request.json()
            projects.require_project(body.get("project", ""))  # vrai projet seulement (revue securite du 24/10/2026)
            project = (body.get("project") or "").strip()
            if not project or not os.path.isdir(project):
                raise FileNotFoundError("Project folder not found: %s" % project)
            if not projects.TRASH_AVAILABLE:
                raise ValueError("The Recycle Bin is only available on Windows")
            data = await _in_executor(final_cut.sync, project, projects._to_recycle_bin,
                                      folder_paths.get_input_directory())
        except Exception as e:
            return _project_error(e)
        return web.json_response(data)

    @routes.post("/mmproject/resolve_duplicate")
    async def mmproject_resolve_duplicate(request):
        """Doublon depose a la main dans 40 / 60 : garde un exemplaire, l'autre va dans la Corbeille."""
        try:
            body = await request.json()
            projects.require_project(body.get("project", ""))  # vrai projet seulement (revue securite du 24/10/2026)
            if not projects.TRASH_AVAILABLE:
                raise ValueError("The Recycle Bin is only available on Windows")
            data = await _in_executor(run_record.resolve_duplicate, body.get("project", ""), body.get("run", ""),
                                      body.get("index"), body.get("orphan", ""), body.get("keep", ""),
                                      projects._to_recycle_bin)
        except Exception as e:
            return _project_error(e)
        return web.json_response(data)

    @routes.post("/mmproject/delete_rush")
    async def mmproject_delete_rush(request):
        """Supprime une sortie rangee dans No Good (Corbeille si trash, sinon definitif) ; le JSON la marque deleted."""
        try:
            body = await request.json()
            projects.require_project(body.get("project", ""))  # vrai projet seulement (revue securite du 24/10/2026)
            trash = bool(body.get("trash"))
            if trash and not projects.TRASH_AVAILABLE:
                raise ValueError("The Recycle Bin is only available on Windows")
            data = await _in_executor(run_record.delete_rush, body.get("project", ""), body.get("run", ""),
                                      body.get("index"), projects._to_recycle_bin if trash else None)
        except Exception as e:
            return _project_error(e)
        return web.json_response(data)

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
        """Ecrit config_projets_<projet>.json (l'ancien dans Archives) ; errors = fichiers sans indice."""
        try:
            body = await request.json()
            projects.require_project(body.get("project", ""))  # vrai projet seulement (revue securite du 24/10/2026)
            # Toutes les variantes du RefLoader (selections) et celle affichee (variant).
            selections = body.get("selections") if isinstance(body.get("selections"), dict) else {}
            info = await _in_executor(project_config.save_config, body.get("project", ""), selections,
                                      body.get("variant") or "", body.get("workflow", ""))
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
            projects.require_project(body.get("project", ""))  # vrai projet seulement (revue securite du 24/10/2026)
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
            projects.require_project(body.get("project", ""))  # vrai projet seulement (revue securite du 24/10/2026)
            await _in_executor(projects.delete_archive, body.get("project", ""), body.get("name", ""))
        except Exception as e:
            return _project_error(e)
        return web.json_response({"ok": True})

except Exception:
    print("[MagicStudio] Could not register the API routes:")
    traceback.print_exc()

# ------------------------------------------------------------------
# Fin des Runs enregistree par le serveur (run_tracker) : les messages
# envoyes a l'interface sont aussi lus ici, sans dependre de l'onglet.
# ------------------------------------------------------------------
try:
    import folder_paths
    from server import PromptServer

    def _prompt_of(prompt_id):
        """(prompt, extra_data) de l'execution en cours (post-traitements, 29/10/2026), sinon None."""
        running, _pending = PromptServer.instance.prompt_queue.get_current_queue()
        for item in running or []:
            if len(item) > 3 and item[1] == prompt_id:
                return item[2], item[3]
        return None

    _run_tracker = run_tracker.RunTracker(folder_paths.get_output_directory, prompt_fn=_prompt_of)
    _server = PromptServer.instance
    _send_sync = _server.send_sync

    def _tracked_send_sync(event, data, sid=None):
        try:
            _run_tracker.handle(event, data)
        except Exception:
            traceback.print_exc()
        return _send_sync(event, data, sid)

    _server.send_sync = _tracked_send_sync
except Exception:
    print("[MagicStudio] Could not follow the runs on the server:")
    traceback.print_exc()

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
