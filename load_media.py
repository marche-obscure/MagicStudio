"""
Noeud MagicStudio MedLoad (choix utilisateur, 24/10/2026) : logique pure,
sans dependance a ComfyUI, pour pouvoir etre testee seule.

Un fichier glisse depuis le noeud MagicStudio Final Cut arrive comme un lien
text/uri-list vers /mmrefloader/media?file=<chemin> (Chromium perd le fichier
joint pendant un vrai glisser). Le chemin est lu dans ce lien, garde dans le
champ "file" du noeud, et le fichier est charge la ou il est (pas de copie),
seulement s'il est dans le dossier input de ComfyUI.
"""

import os
from urllib.parse import urlsplit, parse_qs, unquote

try:
    from . import media
except ImportError:  # tests : modules charges seuls
    import media

# Route qui sert les fichiers de l'extension (lien ajoute au glisser par Final Cut).
MEDIA_ROUTE = "/mmrefloader/media"


def _unquote_path(text):
    """Chemin sans espaces ni guillemets autour (« Copier en tant que chemin » de Windows)."""
    text = (text or "").strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        text = text[1:-1].strip()
    return text


def path_from_drop(text):
    """
    Chemin lu dans ce qui est depose sur le noeud : lien text/uri-list vers
    /mmrefloader/media (absolu ou relatif), lien file:///, ou chemin tape.
    Les lignes "#" (commentaires d'une uri-list) sont ignorees ; un autre lien -> "".
    """
    for line in (text or "").splitlines():
        line = _unquote_path(line)
        if not line or line.startswith("#"):
            continue
        low = line.lower()
        if low.startswith("file:"):
            path = unquote(urlsplit(line).path)
            # file:///C:/x -> "/C:/x" : on retire la barre devant la lettre du lecteur.
            if len(path) > 2 and path[0] == "/" and path[2] == ":":
                path = path[1:]
            return path
        if low.startswith(("http:", "https:", "/")):
            parts = urlsplit(line)
            if parts.path.rstrip("/") == MEDIA_ROUTE:
                return (parse_qs(parts.query).get("file") or [""])[0].strip()
            return ""
        return line
    return ""


def is_within_directory(directory, target):
    """Comme folder_paths.is_within_directory : realpath des deux, puis meme racine."""
    try:
        directory = os.path.realpath(directory)
        target = os.path.realpath(target)
        return os.path.commonpath((directory, target)) == directory
    except ValueError:
        # Octet nul dans le chemin, ou lecteurs differents sous Windows.
        return False


def check_path(text, input_dir):
    """
    (chemin absolu, type "image" / "video" / "audio") d'un fichier du dossier input.
    ValueError (message en anglais, affiche par ComfyUI) sinon.
    """
    path = _unquote_path(text)
    if not path:
        raise ValueError("No file: drop a file from MagicStudio Final Cut, or type its path.")
    path = os.path.abspath(path)
    if not is_within_directory(input_dir, path):
        raise ValueError("Only files in the input folder of ComfyUI can be loaded: " + path)
    if not os.path.isfile(path):
        raise ValueError("File not found: " + path)
    kind = media.kind_of(path)
    if kind is None:
        raise ValueError("Unsupported file type (image, video or audio only): " + os.path.basename(path))
    return path, kind


def file_name(path):
    """Sortie name (choix utilisateur 28/10/2026) : nom du fichier charge, extension comprise."""
    return os.path.basename(path)


def signature(path):
    """Change quand le fichier change (date et taille) : ComfyUI le recharge alors."""
    try:
        st = os.stat(_unquote_path(path))
    except (OSError, ValueError):
        return "missing"
    return "%s|%s|%s" % (os.path.normcase(os.path.abspath(_unquote_path(path))), st.st_mtime_ns, st.st_size)


def soundtrack(path):
    """Bande-son entiere d'une video (dict AUDIO), ou None si elle n'en a pas."""
    try:
        return media.load_audio(path, max_seconds=None)
    except ValueError:
        return None


def load_still(path, kind):
    """(IMAGE ou None, AUDIO ou None) d'une image ou d'un son, en entier (pas de limite de duree)."""
    if kind == "image":
        return media.load_image(path), None
    if kind == "audio":
        return None, media.load_audio(path, max_seconds=None)
    raise ValueError("Not an image or an audio file: " + os.path.basename(path))
