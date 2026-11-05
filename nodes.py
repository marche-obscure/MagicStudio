"""
Noeud MiniMaxH3RefLoader (MagicStudio RefLoader) : charge les images, videos et
sons de reference de la variante affichee (MiniMax H3 Ref2VA / F2VA / FL2VA, LTX
2.3 / 2.5). La selection est faite dans l'interface JS (web/js/minimax_ref_loader.js)
et transmise en JSON dans le widget cache "state". Deux sorties fixes : project
(Root folder) et package (fichiers charges), redonnes par le noeud MagicStudio
Container avec les noms et types de la variante (profiles.VARIANTS).
"""

import json
import os

from . import compare
from . import load_media
from . import media
from . import profiles
from . import projects
from . import run_record
from . import save_voice
from . import select_mod


class AnyType(str):
    """Type joker : accepte par n'importe quelle entree lors de la validation."""

    def __eq__(self, other):
        return True

    def __ne__(self, other):
        return False

    def __hash__(self):
        return hash(str(self))


ANY_TYPE = AnyType("*")

# Type de la sortie du noeud Projet et de l'entree du Ref Loader.
PROJECT_TYPE = "MINIMAX_PROJECT"
# Sortie project_used du noeud Project -> entree project_used des noeuds Final Cut et SaveVoice
# (choix utilisateur, 22/10/2026 ; nom final_cut / project jusqu'au 30/10/2026, type inchange).
FINAL_CUT_TYPE = "MINIMAX_FINAL_CUT"
# Sortie package du RefLoader -> entree du noeud MagicStudio Container (variantes, 29/10/2026).
PACKAGE_TYPE = "MAGICSTUDIO_PACKAGE"


class MiniMaxH3RefLoader:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "state": ("STRING", {"default": "{}", "multiline": False}),
            },
        }

    # Variantes (29/10/2026) : deux sorties fixes, project (Root folder pour le noeud
    # Project) puis package (fichiers charges de la variante affichee, pour le noeud
    # MagicStudio Container). Elles ne bougent plus.
    RETURN_TYPES = (ANY_TYPE, PACKAGE_TYPE)
    RETURN_NAMES = ("project", "package")
    FUNCTION = "run"
    CATEGORY = "MagicStudio"
    DESCRIPTION = (
        "Pick the reference files of a model variant (MiniMax H3 Ref2VA / F2VA / FL2VA, LTX 2.3 / 2.5, Image) in "
        "thumbnail galleries. Wire package to a MagicStudio Container to get the outputs of the variant."
    )

    @classmethod
    def IS_CHANGED(cls, state):
        # Recharge si la selection ou le Root folder change, ou si un fichier selectionne est modifie.
        return media.variant_signature(media.parse_variant_state(state)) + "|" + media.parse_root(state)

    def run(self, state):
        return (media.parse_root(state), media.build_package(media.parse_variant_state(state)))


class MagicStudioContainer:
    """
    Noeud MagicStudio Container (variantes, 29/10/2026) : redonne les sorties de la
    variante choisie dans le RefLoader relie (entree package). Le JS
    (web/js/container_node.js) affiche les noms et types de la variante ; run()
    renvoie les valeurs deja chargees par le RefLoader, dans l'ordre du package,
    completees par None : rien n'est recharge, meme avec plusieurs Containers.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"package": (PACKAGE_TYPE,)}}

    RETURN_TYPES = tuple(ANY_TYPE for _ in range(profiles.CONTAINER_OUTPUTS))
    RETURN_NAMES = tuple("output_%d" % i for i in range(1, profiles.CONTAINER_OUTPUTS + 1))
    FUNCTION = "run"
    CATEGORY = "MagicStudio"
    DESCRIPTION = "Gives the outputs of the variant chosen in the MagicStudio RefLoader wired to package."

    def run(self, package):
        layout = package.get("layout") if isinstance(package, dict) else None
        values = package.get("values") if isinstance(package, dict) else None
        out = [values.get(k) for k in layout] if isinstance(layout, list) and isinstance(values, dict) else []
        out = out[:profiles.CONTAINER_OUTPUTS]
        return tuple(out + [None] * (profiles.CONTAINER_OUTPUTS - len(out)))


def default_projects_root():
    """Racine des projets par defaut : <input de ComfyUI>/Projets."""
    import folder_paths
    return os.path.join(folder_paths.get_input_directory(), projects.DEFAULT_ROOT_NAME)


class MiniMaxH3Project:
    """
    Dossier de projet (00.Workflows ... 60.Rush Images) choisi ou cree dans
    l'interface JS (web/js/project_node.js), dans le Root folder recu du
    MagicStudio RefLoader (entree "project", obligatoire : choix
    utilisateur 19/10/2026), ou <input de ComfyUI>/Projets si ce Root folder
    est vide. Le dossier se gere dans l'interface ; chaque Run est enregistre
    dans 04.Prompt (voir run_record.py), avec le texte de l'entree text_prompt.
    text_prompt est facultative : sans elle, le Run est quand meme enregistre, sans prompt
    (sauf s'il ne produit aucun fichier). Sortie project_used (22/10/2026, ex-final_cut) : le
    dossier du projet, pour les noeuds MagicStudio Final Cut et SaveVoice.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "state": ("STRING", {"default": "{}", "multiline": False}),
                # Sortie project du Reference Loader : tout l'interet du noeud (choix utilisateur).
                "project": (PROJECT_TYPE,),
            },
            "optional": {
                "text_prompt": ("STRING", {"forceInput": True, "tooltip": "Prompt text saved with the run. Optional: without it, the run is still recorded, without a prompt."}),
                # Sortie model_link de MultiFiles Select (choix utilisateur) : ses champs
                # donnent les modeles du Run (02.Models), avec leur position.
                "models_link": ("STRING", {"forceInput": True}),
            },
            # extra_pnginfo.workflow = workflow tel qu'au clic sur Run (00.Workflows/Run).
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = (FINAL_CUT_TYPE,)
    RETURN_NAMES = ("project_used",)
    # Noeud de sortie : execute a chaque Run pour l'enregistrer (choix utilisateur).
    OUTPUT_NODE = True
    FUNCTION = "run"
    CATEGORY = "MagicStudio"
    DESCRIPTION = (
        "Create or pick a project folder (00.Workflows, 02.Models, 04.Prompt, 06.LoRA, 08.Images, "
        "10.Son, 40.Rush Videos, 60.Rush Images) in the root folder of the MagicStudio RefLoader. "
        "Optional: without text_prompt, the run is still recorded, without a prompt."
    )

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Chaque Run est enregistre, meme avec le meme prompt. ComfyUI ne donne pas ici
        # les entrees branchees (text_prompt) : le noeud s'execute donc a chaque Run.
        return float("nan")

    def run(self, state, project=None, text_prompt=None, models_link=None, prompt=None, extra_pnginfo=None):
        try:
            path = (json.loads(state or "{}") or {}).get("path") or ""
        except (TypeError, ValueError):
            path = ""
        # Sortie project_used : le dossier du projet ("" sans projet).
        result = (path if path and os.path.isdir(path) else "",)
        if not result[0]:
            print("[MagicStudio Project] No project picked: this run is not recorded.")
            return {"result": result}
        # Sans texte (rien recu, vide ou espaces) : Run enregistre quand meme, prompt vide.
        if run_record.prompt_text(text_prompt)[1]:
            print("[MagicStudio Project] text_prompt receives nothing: run recorded without a prompt.")
        workflow = extra_pnginfo.get("workflow") if isinstance(extra_pnginfo, dict) else None
        try:
            run_file = run_record.start_run(path, text_prompt, prompt, workflow=workflow)
        except (OSError, ValueError) as e:
            # Erreur d'ecriture dans le projet : le Run de l'utilisateur ne doit pas echouer pour autant.
            print("[MagicStudio Project] Could not start the run record (" + str(e) + "): this run is not recorded.")
            return {"result": result}
        # Lu par l'interface : a la fin du Run, les fichiers generes sont associes a ce JSON.
        return {"ui": {"mmrun": [run_file]}, "result": result}


class MiniMaxH3FinalCut:
    """
    Copies des rushs finaux (Picture Lock de 40 / 60 / 70) d'un projet ou d'un
    MultiProject dans Final-Cut_<Nom>, liees dans le dossier input de ComfyUI pour
    H3 Director (voir final_cut.py). Tout se passe dans l'interface
    (web/js/final_cut_node.js) : le noeud ne s'execute pas pendant un Run.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"project_used": (FINAL_CUT_TYPE,)}}

    RETURN_TYPES = ()
    FUNCTION = "run"
    CATEGORY = "MagicStudio"
    DESCRIPTION = (
        "Mirror of the Picture Lock folders of a project (Images, Video, Audio) in Final-Cut_<Name>, linked in "
        "the input folder of ComfyUI: drag the files into MiniMax H3 Director."
    )

    def run(self, project_used=None):
        return {}


class MiniMaxH3LoadMedia:
    """
    Charge, sans copie, une image, une video ou un son glisse depuis le noeud
    MagicStudio Final Cut (choix utilisateur, 24/10/2026). Le JS
    (web/js/load_media_node.js) lit le chemin dans le lien depose et le met
    dans le champ "file" ; seuls les fichiers du dossier input sont acceptes
    (voir load_media.py).
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "file": ("STRING", {
                    "default": "", "multiline": False,
                    "tooltip": "Full path of the file, in the input or output folder of ComfyUI. Choose it in "
                               "the Project or Folder window of this node, or drop a file from "
                               "MagicStudio Final Cut, 40.Rush Videos / 60.Rush Images or Processing "
                               "on the node to fill it.",
                }),
            },
            # Ajoute apres les autres entrees (04/11/2026) : un ancien workflow garde la valeur de file.
            "optional": {
                "post_processing": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Grey: the saved file is a new run. Green: it is a post-processing of "
                               "the loaded file's run",
                }),
                # Utilise par l'interface seulement (fenetre Project) ; Python ne s'en sert pas.
                "project_used": (FINAL_CUT_TYPE,),
            },
        }

    # Choix utilisateur (24/10/2026) : video_frames puis audio_video (bande-son de la video)
    # sous video ; audio = fichiers son seulement. Ordre a garder identique a OUTPUTS de
    # web/js/load_media_node.js : le JS y remet les liens des workflows enregistres avec
    # un ancien ordre (sortie de meme nom). name (28/10/2026) : nom du fichier, en dernier.
    RETURN_TYPES = ("VIDEO", "IMAGE", "AUDIO", "IMAGE", "AUDIO", "STRING")
    RETURN_NAMES = ("video", "video_frames", "audio_video", "image", "audio", "name")
    FUNCTION = "run"
    CATEGORY = "MagicStudio"
    DESCRIPTION = (
        "Load an image, a video or an audio file of the input or output folder of ComfyUI, where it is "
        "(no copy): choose it in the Project or Folder window of this node, or drop it from "
        "MagicStudio Final Cut, 40.Rush Videos / 60.Rush Images or Processing. "
        "video: a video (same type as Load Video); video_frames: all the frames of a video, as images; "
        "audio_video: the soundtrack of a video; image: an image; audio: an audio file; name: the file name."
    )

    @classmethod
    def VALIDATE_INPUTS(cls, file, **kwargs):
        import folder_paths
        try:
            load_media.check_path(file, folder_paths.get_input_directory(), folder_paths.get_output_directory())
        except ValueError as e:
            return str(e)
        return True

    @classmethod
    def IS_CHANGED(cls, file, post_processing=False, **kwargs):
        # Recharge si le chemin change ou si le fichier est modifie (date, taille).
        # ComfyUI passe TOUTES les entrees : post_processing et project_used (dans kwargs)
        # ne changent pas les sorties, on les ignore.
        return load_media.signature(file)

    def run(self, file, post_processing=False, project_used=None):
        # post_processing : lu par le serveur de Runs (post_process.py), pas ici.
        # project_used : sert a la fenetre Project (interface), pas au chargement.
        import folder_paths
        path, kind = load_media.check_path(file, folder_paths.get_input_directory(), folder_paths.get_output_directory())
        name = load_media.file_name(path)
        if kind == "video":
            from comfy_api.latest import InputImpl
            # Meme objet que le Load Video natif ; toutes les images (taille et cadence
            # d'origine) sur "video_frames", comme le noeud natif Get Video Components,
            # et la bande-son sur "audio_video".
            video = InputImpl.VideoFromFile(path)
            return (video, video.get_components().images, load_media.soundtrack(path), None, None, name)
        image, audio = load_media.load_still(path, kind)
        return (None, None, None, image, audio, name)

def selectmod_roots():
    """Racines permises de SelectMod, lues par le serveur (models, Models (Linker))."""
    import folder_paths
    return select_mod.roots(getattr(folder_paths, "models_dir", ""), getattr(folder_paths, "base_path", ""))


class MagicStudioSelectMod:
    """
    Noeud MagicStudio SelectMod (choix utilisateur 28/10/2026) : comme MultiFiles
    Select (copie adaptee, aucun import de ce paquet), mais ne lit que les dossiers
    de modeles (select_mod.py). Les champs sont remplis par l'interface
    (web/js/select_mod_node.js) ; run() les renvoie tels quels apres controle :
    un chemin hors de models / Models (Linker) est refuse.
    """

    @classmethod
    def INPUT_TYPES(cls):
        req = {
            "origin_dir": ("STRING", {"default": "", "multiline": False}),
            "selected_dir": ("STRING", {"default": "", "multiline": False}),
            "output_mode": ("STRING", {"default": "Absolute"}),
        }
        for n in range(1, 8):
            req["model_type_%d" % n] = ("STRING", {"default": "", "multiline": False})
            req["field_%d" % n] = ("STRING", {"default": "", "multiline": False})
        req["save_folder"] = ("STRING", {"default": "", "multiline": False})
        return {"required": req}

    # Meme ordre que MultiFiles Select : 5 champs, model_link (dossier de sauvegarde), Option 1 / 2.
    RETURN_TYPES = (ANY_TYPE,) * 8
    RETURN_NAMES = tuple("unused %d" % i for i in range(1, 6)) + ("model_link", "Option 1", "Option 2")
    FUNCTION = "run"
    CATEGORY = "MagicStudio"
    DESCRIPTION = (
        "Pick up to 7 model files (diffusion model, text encoder, VAE, LoRA...) in the models folders only "
        "(models and Models (Linker)). Outputs: the 5 fields, model_link (the save folder, for the "
        "MagicStudio Project node), Option 1 and Option 2."
    )

    def run(self, origin_dir, selected_dir, output_mode, model_type_1, field_1, model_type_2, field_2,
            model_type_3, field_3, model_type_4, field_4, model_type_5, field_5, model_type_6="", field_6="",
            model_type_7="", field_7="", save_folder=""):
        fields = [field_1, field_2, field_3, field_4, field_5, field_6, field_7]
        select_mod.check_fields(fields, origin_dir, selectmod_roots())
        f = [(x or "").strip() for x in fields]
        return (f[0], f[1], f[2], f[3], f[4], (save_folder or "").strip(), f[5], f[6])


# Toutes les qualites (l'interface ne montre que celles du format).
VOICE_QUALITIES = ("none", "V0", "128k", "320k", "64k", "96k", "192k")
WIRE_PROJECT = "Wire the project_used output of a MagicStudio Project node"


class MagicStudioSaveVoice:
    """
    Enregistre une voix de reference dans <projet>/90.Pick Up/Son (save_voice.py).
    Le fichier n'est lie a aucun Run : la sortie ui n'a pas de cle filename.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "audio": ("AUDIO",),
            "project_used": (FINAL_CUT_TYPE,),
            "prefix": ("STRING", {"default": "", "multiline": False}),
            "format": (list(save_voice.FORMATS), {"default": save_voice.DEFAULT_FORMAT}),
            "quality": (list(VOICE_QUALITIES), {"default": "none"}),
        }}

    RETURN_TYPES = ("AUDIO", "STRING")
    RETURN_NAMES = ("audio", "path")
    FUNCTION = "run"
    OUTPUT_NODE = True
    CATEGORY = "MagicStudio"
    DESCRIPTION = (
        "Saves a voice reference into <project>/90.Pick Up/Son (wav, flac, mp3 or opus). "
        "Outputs the audio and the full path of the saved file."
    )

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")  # chaque Run enregistre, comme le noeud Project

    @classmethod
    def VALIDATE_INPUTS(cls, format=None, quality=None, **kwargs):
        # Le projet arrive par un lien : verifie dans run().
        if format is not None and format not in save_voice.FORMATS:
            return "Unsupported audio format: %s" % (format,)
        if quality is not None and quality not in VOICE_QUALITIES:
            return "Unsupported quality: %s" % (quality,)
        return True

    def run(self, audio, project_used, prefix="", format="wav", quality="none"):
        q = None if quality == "none" else quality
        # Seules les erreurs de projet deviennent le message de branchement ; le reste passe tel quel.
        try:
            projects.require_project(project_used)
        except (FileNotFoundError, NotADirectoryError, ValueError):
            raise ValueError(WIRE_PROJECT)
        paths = save_voice.save(audio, project_used, prefix, format, q)
        return {"ui": {"mmvoice": [{"path": p, "name": os.path.basename(p)} for p in paths]},
                "result": (audio, paths[0])}


class MagicStudioCompare:
    """
    Compare deux images ou deux videos (A / B : entree branchee ou fichier choisi) et garde
    la preferee (compare.py). Les apercus des entrees branchees sont ecrits dans le dossier
    temp de ComfyUI. Pas de VALIDATE_INPUTS : un fichier cache par une entree ne doit pas
    bloquer le Run.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"state": ("STRING", {"default": "{}", "multiline": False})},
            "optional": {
                "project_used": (FINAL_CUT_TYPE,),
                "video_a": ("VIDEO",),
                "video_b": ("VIDEO",),
                "frames_a": ("IMAGE",),
                "frames_b": ("IMAGE",),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("VIDEO", "IMAGE", "STRING", "STRING")
    RETURN_NAMES = ("video", "images", "path", "choice")
    FUNCTION = "run"
    CATEGORY = "MagicStudio"
    DESCRIPTION = (
        "Compare two images or two videos (A / B: a wired input or a picked file) and keep the preferred one. "
        "Outputs the starred side (otherwise A): video (empty for an image), images, path (empty for a wired "
        "input) and choice (A or B)."
    )

    @classmethod
    def IS_CHANGED(cls, state="{}", **kwargs):
        # Ni mode ni sync : changer de mode ne relance rien.
        return compare.signature(state)

    def run(self, state, project_used=None, video_a=None, video_b=None, frames_a=None, frames_b=None,
            unique_id=None):
        # project_used : sert a la fenetre de choix (interface), pas au Run.
        import folder_paths
        s = compare.parse_state(state)
        inputs = {"A": (video_a, frames_a), "B": (video_b, frames_b)}
        src = {side: compare.side_source(side, s, *inputs[side]) for side in compare.SIDES}
        compare.check_kinds(src["A"], src["B"])
        choice = compare.chosen_side(s["star"], src["A"]["from"] is not None, src["B"]["from"] is not None)

        # Apercus des cotes branches (choisis ou non) ; la video est lue une seule fois.
        ui, components = [], {}
        for side in compare.SIDES:
            video, frames = inputs[side]
            if src[side]["from"] != "input":
                continue
            if video is not None:
                components[side] = video.get_components()
                images, fps = components[side].images, float(components[side].frame_rate)
            else:
                images, fps = frames, None
            kind = src[side]["kind"]
            path = compare.preview_path(folder_paths.get_temp_directory(), unique_id, side, kind)
            compare.write_preview(path, kind, images, fps)
            ui.append({"side": side, "path": path, "kind": kind})

        chosen = src[choice]
        video, frames = inputs[choice]
        if chosen["from"] == "input":
            if video is not None:
                result = (video, components[choice].images, "", choice)
            else:
                result = (None, frames, "", choice)
        else:
            path, kind = load_media.check_path(
                chosen["path"], folder_paths.get_input_directory(), folder_paths.get_output_directory())
            if kind == "video":
                from comfy_api.latest import InputImpl
                v = InputImpl.VideoFromFile(path)
                result = (v, v.get_components().images, path, choice)
            else:
                result = (None, media.load_image(path), path, choice)
        return {"ui": {"mmcompare": ui}, "result": result}
