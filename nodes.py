"""
Noeud MiniMaxH3RefLoader : charge des images, videos (avec ou sans leur
bande-son) et audios de reference, a brancher sur MiniMaxH3ReferenceToVideo.

La selection est faite dans l'interface JS (web/js/minimax_ref_loader.js)
et transmise en JSON dans le widget cache "state". Le noeud declare toutes
les sorties possibles (23) en type joker ; le JS n'affiche que celles qui
servent, dans l'ordre de media.state_layout() selon le profil (MiniMax H3 ou
LTX 2.x), et leur donne leur vrai type (IMAGE, AUDIO, INT) pour les branchements.
"""

import json
import os

from . import load_media
from . import media
from . import profiles
from . import projects
from . import run_record
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
# Sortie final_cut du noeud Project -> entree du noeud Final Cut (choix utilisateur, 22/10/2026).
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
        "Pick the reference files of a model variant (MiniMax H3 Ref2VA / F2VA / FL2VA, LTX 2.3 / 2.5) in "
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
    est vide. Le dossier se gere dans l'interface ; avec
    l'entree text_prompt branchee, chaque Run est enregistre dans
    04.Prompt (voir run_record.py). Sortie final_cut (22/10/2026) : le dossier du
    projet, pour le noeud MagicStudio Final Cut.
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
                "text_prompt": ("STRING", {"forceInput": True}),
                # Sortie model_link de MultiFiles Select (choix utilisateur) : ses champs
                # donnent les modeles du Run (02.Models), avec leur position.
                "models_link": ("STRING", {"forceInput": True}),
            },
            # extra_pnginfo.workflow = workflow tel qu'au clic sur Run (00.Workflows/Run).
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = (FINAL_CUT_TYPE,)
    RETURN_NAMES = ("final_cut",)
    # Noeud de sortie : execute a chaque Run pour l'enregistrer (choix utilisateur).
    OUTPUT_NODE = True
    FUNCTION = "run"
    CATEGORY = "MagicStudio"
    DESCRIPTION = (
        "Create or pick a project folder (00.Workflows, 02.Models, 04.Prompt, 06.LoRA, 08.Images, "
        "10.Son, 40.Rush Videos, 60.Rush Images) in the root folder of the MagicStudio RefLoader."
    )

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Chaque Run est enregistre, meme avec le meme prompt. ComfyUI ne donne pas ici
        # les entrees branchees (text_prompt) : le noeud s'execute donc a chaque Run,
        # ce qui ne fait rien sans text_prompt.
        return float("nan")

    def run(self, state, project=None, text_prompt=None, models_link=None, prompt=None, extra_pnginfo=None):
        try:
            path = (json.loads(state or "{}") or {}).get("path") or ""
        except (TypeError, ValueError):
            path = ""
        # Sortie final_cut : le dossier du projet ("" sans projet).
        result = (path if path and os.path.isdir(path) else "",)
        # Sans text_prompt : rien a enregistrer (le dossier se gere dans l'interface).
        if text_prompt is None:
            return {"result": result}
        if not result[0]:
            print("[MagicStudio Project] No project picked: this run is not recorded.")
            return {"result": result}
        workflow = extra_pnginfo.get("workflow") if isinstance(extra_pnginfo, dict) else None
        run_file = run_record.start_run(path, text_prompt, prompt, workflow=workflow)
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
        return {"required": {"final_cut": (FINAL_CUT_TYPE,)}}

    RETURN_TYPES = ()
    FUNCTION = "run"
    CATEGORY = "MagicStudio"
    DESCRIPTION = (
        "Mirror of the Picture Lock folders of a project (Images, Video, Audio) in Final-Cut_<Name>, linked in "
        "the input folder of ComfyUI: drag the files into MiniMax H3 Director."
    )

    def run(self, final_cut=None):
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
                    "tooltip": "Full path of the file, in the input folder of ComfyUI. Drop a file from "
                               "MagicStudio Final Cut on the node to fill it.",
                }),
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
        "Load an image, a video or an audio file dropped from MagicStudio Final Cut, where it is (no copy). "
        "video: a video (same type as Load Video); video_frames: all the frames of a video, as images; "
        "audio_video: the soundtrack of a video; image: an image; audio: an audio file; name: the file name."
    )

    @classmethod
    def VALIDATE_INPUTS(cls, file):
        import folder_paths
        try:
            load_media.check_path(file, folder_paths.get_input_directory())
        except ValueError as e:
            return str(e)
        return True

    @classmethod
    def IS_CHANGED(cls, file):
        # Recharge si le chemin change ou si le fichier est modifie (date, taille).
        return load_media.signature(file)

    def run(self, file):
        import folder_paths
        path, kind = load_media.check_path(file, folder_paths.get_input_directory())
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
