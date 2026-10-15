"""
Noeud MiniMaxH3RefLoader : charge des images, videos (avec ou sans leur
bande-son) et audios de reference, a brancher sur MiniMaxH3ReferenceToVideo.

La selection est faite dans l'interface JS (web/js/minimax_ref_loader.js)
et transmise en JSON dans le widget cache "state". Le noeud declare toutes
les sorties possibles (18) en type joker ; le JS n'affiche que celles qui
servent, dans l'ordre de media.layout_keys(), et leur donne leur vrai type
(IMAGE ou AUDIO) pour les branchements.
"""

from . import media


class AnyType(str):
    """Type joker : accepte par n'importe quelle entree lors de la validation."""

    def __eq__(self, other):
        return True

    def __ne__(self, other):
        return False

    def __hash__(self):
        return hash(str(self))


ANY_TYPE = AnyType("*")

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
            }
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
    def IS_CHANGED(cls, state):
        # Recharge si la selection change ou si un fichier selectionne est modifie.
        return media.state_signature(media.parse_state(state))

    def run(self, state):
        return media.build_outputs(media.parse_state(state))
