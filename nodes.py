"""
Noeud MiniMaxH3RefLoader : charge des images, videos (avec ou sans leur
bande-son) et audios de reference, a brancher sur MiniMaxH3ReferenceToVideo.

La selection est faite dans l'interface JS (web/js/minimax_ref_loader.js)
et transmise en JSON dans le widget cache "state". Le noeud declare toutes
les sorties possibles (18) en type joker ; le JS n'affiche que celles qui
servent, dans l'ordre de media.layout_keys(), et leur donne leur vrai type
(IMAGE ou AUDIO) pour les branchements.
"""

import json
import os

from . import media
from . import projects
from . import run_record


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

# Noms techniques des 18 sorties (dans l'ordre maximal) : le JS les
# renomme et les reordonne selon la selection.
_ALL_KEYS = media.layout_keys(media.MAX_IMAGES, media.MAX_VIDEOS, media.MAX_VIDEO_AUDIOS,
                               media.MAX_AUDIOS)


class MiniMaxH3RefLoader:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "state": ("STRING", {"default": "{}", "multiline": False}),
            },
        }

    # Derniere sortie declaree "project" (Root folder pour le noeud Projet) :
    # le JS l'affiche toujours apres les sorties du mode, et run() renvoie
    # sa valeur a cette position (media.outputs_with_project).
    RETURN_TYPES = tuple(ANY_TYPE for _ in range(len(_ALL_KEYS) + 1))
    RETURN_NAMES = tuple(_ALL_KEYS) + (media.PROJECT_KEY,)
    FUNCTION = "run"
    CATEGORY = "loaders/minimax"
    DESCRIPTION = (
        "Pick reference images, videos, video soundtracks and audio for "
        "MiniMax H3 Reference to Video."
    )

    @classmethod
    def IS_CHANGED(cls, state):
        # Recharge si la selection ou le Root folder change, ou si un fichier selectionne est modifie.
        return media.state_signature(media.parse_state(state)) + "|" + media.parse_root(state)

    def run(self, state):
        s = media.parse_state(state)
        return media.outputs_with_project(s, media.build_outputs(s), media.parse_root(state))


def default_projects_root():
    """Racine des projets par defaut : <input de ComfyUI>/Projets."""
    import folder_paths
    return os.path.join(folder_paths.get_input_directory(), projects.DEFAULT_ROOT_NAME)


class MiniMaxH3Project:
    """
    Dossier de projet (00.Workflows ... 60.Rush Images) choisi ou cree dans
    l'interface JS (web/js/project_node.js), dans le Root folder recu du
    MiniMax H3 Reference Loader (entree "project", obligatoire : choix
    utilisateur 19/10/2026), ou <input de ComfyUI>/Projets si ce Root folder
    est vide. Le dossier se gere dans l'interface ; avec
    l'entree text_prompt branchee, chaque Run est enregistre dans
    04.Prompt (voir run_record.py). Le noeud n'a pas de sortie.
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

    RETURN_TYPES = ()
    # Noeud de sortie : execute a chaque Run pour l'enregistrer (choix utilisateur).
    OUTPUT_NODE = True
    FUNCTION = "run"
    CATEGORY = "loaders/minimax"
    DESCRIPTION = (
        "Create or pick a project folder (00.Workflows, 02.Models, 04.Prompt, 06.LoRA, 08.Images, "
        "10.Son, 40.Rush Videos, 60.Rush Images) in the root folder of the MiniMax H3 Reference Loader."
    )

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Chaque Run est enregistre, meme avec le meme prompt. ComfyUI ne donne pas ici
        # les entrees branchees (text_prompt) : le noeud s'execute donc a chaque Run,
        # ce qui ne fait rien sans text_prompt.
        return float("nan")

    def run(self, state, project=None, text_prompt=None, models_link=None, prompt=None, extra_pnginfo=None):
        # Sans text_prompt : rien a faire (le dossier se gere dans l'interface).
        if text_prompt is None:
            return {}
        try:
            path = (json.loads(state or "{}") or {}).get("path") or ""
        except (TypeError, ValueError):
            path = ""
        if not path or not os.path.isdir(path):
            print("[MiniMax H3 Project] No project picked: this run is not recorded.")
            return {}
        workflow = extra_pnginfo.get("workflow") if isinstance(extra_pnginfo, dict) else None
        run_file = run_record.start_run(path, text_prompt, prompt, workflow=workflow)
        # Lu par l'interface : a la fin du Run, les fichiers generes sont associes a ce JSON.
        return {"ui": {"mmrun": [run_file]}}
