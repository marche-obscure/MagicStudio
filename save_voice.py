"""
MagicStudio SaveVoice : noms, dossier Pick Up, qualites et encodage (module pur, sans ComfyUI).
Reglages d'encodage = comfy_api AudioSaveHelper.save_audio (opus, mp3, flac) + wav PCM 16 bits.
"""
import os
import re
from datetime import datetime, timedelta

import av

try:
    from . import projects
except ImportError:  # tests : module charge seul
    import projects

FORMATS = ("wav", "flac", "mp3", "opus")
DEFAULT_FORMAT = "wav"
QUALITIES = {
    "mp3": ("V0", "128k", "320k"),
    "opus": ("64k", "96k", "128k", "192k", "320k"),
    "wav": (),
    "flac": (),
}
DEFAULT_QUALITY = {"mp3": "V0", "opus": "128k"}
VOICE_DIR = ("90.Pick Up", "Son")

_OPUS_RATES = [8000, 12000, 16000, 24000, 48000]
_FORBIDDEN = re.compile(r'[<>:"/\|?*\x00-\x1f]')


def voice_dir(project):
    return os.path.join(project, *VOICE_DIR)


def clean_prefix(prefix):
    """Retire les caracteres interdits sous Windows ; vide -> voice."""
    text = _FORBIDDEN.sub("", prefix or "").strip().rstrip(". ").strip()
    return text or "voice"


def voice_name(prefix, fmt, now, exists):
    """<prefixe>_yyyyMMdd_HHmmss.<fmt>, +1 s tant que le nom est pris."""
    base = clean_prefix(prefix)
    when = now.replace(microsecond=0)
    while True:
        name = "%s_%s.%s" % (base, when.strftime("%Y%m%d_%H%M%S"), fmt)
        if not exists(name):
            return name
        when += timedelta(seconds=1)


def check_quality(fmt, quality):
    if fmt not in QUALITIES:
        raise ValueError("Unsupported audio format: %r" % (fmt,))
    if not QUALITIES[fmt]:
        return None
    return quality if quality in QUALITIES[fmt] else DEFAULT_QUALITY[fmt]


def _opus_rate(rate):
    """Meme choix que comfy_api : debit autorise egal ou juste au-dessus, 48 kHz au plus."""
    if rate > 48000:
        return 48000
    if rate in _OPUS_RATES:
        return rate
    for r in _OPUS_RATES:
        if r > rate:
            return r
    return 48000


def _frame(waveform, rate, layout):
    # waveform [C, L] -> trame "flt" entrelacee, comme comfy_api
    return _frame_from(waveform.movedim(0, 1).reshape(1, -1).float().numpy(), rate, layout)


def _frame_from(array, rate, layout):
    frame = av.AudioFrame.from_ndarray(array, format="flt", layout=layout)
    frame.sample_rate = rate
    frame.pts = 0
    return frame


def encode(waveform, sample_rate, path, fmt, quality):
    """Ecrit path (via .part puis os.replace) ; en cas d'erreur le .part est retire."""
    if fmt not in FORMATS:
        raise ValueError("Unsupported audio format: %r" % (fmt,))
    waveform = waveform.cpu()
    layout = "mono" if waveform.shape[0] == 1 else "stereo"
    rate = _opus_rate(sample_rate) if fmt == "opus" else sample_rate
    part = path + ".part"
    try:
        with av.open(part, mode="w", format=("wav" if fmt == "wav" else fmt)) as out:
            if fmt == "opus":
                stream = out.add_stream("libopus", rate=rate, layout=layout)
                stream.bit_rate = int(quality[:-1]) * 1000
            elif fmt == "mp3":
                stream = out.add_stream("libmp3lame", rate=rate, layout=layout)
                if quality == "V0":
                    stream.codec_context.qscale = 1
                else:
                    stream.bit_rate = int(quality[:-1]) * 1000
            elif fmt == "flac":
                stream = out.add_stream("flac", rate=rate, layout=layout)
            else:
                stream = out.add_stream("pcm_s16le", rate=rate, layout=layout)
            frame = _frame(waveform, sample_rate, layout)
            if rate != sample_rate:
                # reechantillonnage PyAV (comfy.audio.resample demande torchaudio)
                resampler = av.AudioResampler(format="flt", layout=layout, rate=rate)
                frames = resampler.resample(frame) + resampler.resample(None)
            else:
                frames = [frame]
            for fr in frames:
                for packet in stream.encode(fr):
                    out.mux(packet)
            for packet in stream.encode(None):
                out.mux(packet)
        os.replace(part, path)
    except BaseException:
        try:
            os.remove(part)
        except OSError:
            pass
        raise


def _suffixed(name, index):
    if index <= 1:
        return name
    stem, ext = os.path.splitext(name)
    return "%s_%02d%s" % (stem, index, ext)


def save(audio, project, prefix, fmt, quality, now=None):
    """Un fichier par element du lot dans <projet>/90.Pick Up/Son ; renvoie les chemins."""
    projects.require_project(project)
    quality = check_quality(fmt, quality)
    folder = voice_dir(project)
    os.makedirs(folder, exist_ok=True)
    waveforms = audio["waveform"]
    count = int(waveforms.shape[0])
    now = now or datetime.now()

    def taken(name):  # le nom de base et ceux des autres elements du lot doivent etre libres
        return any(os.path.exists(os.path.join(folder, _suffixed(name, i)))
                   for i in range(1, count + 1))

    first = voice_name(prefix, fmt, now, taken)
    paths = []
    for i in range(count):
        path = os.path.join(folder, _suffixed(first, i + 1))
        encode(waveforms[i], audio["sample_rate"], path, fmt, quality)
        paths.append(path)
    return paths
