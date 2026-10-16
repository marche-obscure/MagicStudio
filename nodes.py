"""
Noeud MiniMaxH3RefLoader : charge des images, videos (avec ou sans leur
bande-son) et audios de reference, a brancher sur MiniMaxH3ReferenceToVideo.

La selection est faite dans l'interface JS (web/js/minimax_ref_loader.js)
et transmise en JSON dans le widget cache "state". Le noeud declare toutes
les sorties possibles (18) en type joker ; le JS n'affiche que celles qui
servent, dans l'ordre de media.layout_keys(), et leur donne leur vrai type
(IMAGE ou AUDIO) pour les branchements.
"""

import os

from . import media
from . import projects


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
            # Projet (noeud MiniMax H3 Project) : utilise seulement par
            # l'interface (dossier racine des galeries), ignore a l'execution.
            "optional": {
                "project": (PROJECT_TYPE,),
            },
        }

    RETURN_TYPES = tuple(ANY_TYPE for _ in _ALL_KEYS)
    RETURN_NAMES = tuple(_ALL_KEYS)
    FUNCTION = "run"
    CATEGORY = "loaders/minimax"
    DESCRIPTION = (
        "Pick reference images, videos, video soundtracks and audio for "
        "MiniMax H3 Reference to Video."
    )

    @classmethod
    def IS_CHANGED(cls, state, project=None):
        # Recharge si la selection change ou si un fichier selectionne est modifie.
        return media.state_signature(media.parse_state(state))

    def run(self, state, project=None):
        return media.build_outputs(media.parse_state(state))


def default_projects_root():
    """Racine des projets par defaut : <input de ComfyUI>/Projets."""
    import folder_paths
    return os.path.join(folder_paths.get_input_directory(), projects.DEFAULT_ROOT_NAME)


class MiniMaxH3Project:
    """
    Dossier de projet (Workflows, Prompt, Images, Son, Rush Videos,
    Rush Images) choisi ou cree dans l'interface JS (web/js/project_node.js) ;
    la sortie "project" donne son chemin au MiniMax H3 Reference Loader.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "state": ("STRING", {"default": "{}", "multiline": False}),
            }
        }

    RETURN_TYPES = (PROJECT_TYPE,)
    RETURN_NAMES = ("project",)
    FUNCTION = "run"
    CATEGORY = "loaders/minimax"
    DESCRIPTION = (
        "Create or pick a project folder (Workflows, Prompt, Images, Son, Rush Videos, "
        "Rush Images) and give it to the MiniMax H3 Reference Loader."
    )

    @classmethod
    def IS_CHANGED(cls, state):
        return state

    def run(self, state):
        path = projects.project_path(projects.parse_state(state), default_projects_root())
        if not path:
            raise ValueError("MiniMax H3 Project: no project selected.")
        projects.ensure_project(path)
        return (path,)
