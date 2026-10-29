// Profils de modele (MiniMax H3, LTX 2.x) : miroir JS pur de profiles.py.
// Pas d'import ComfyUI : testable avec true 
// Les defauts viennent de la route /mmrefloader/profiles ; FALLBACK_LIMITS sert
// tant qu'elle n'a pas repondu (verifie egal a DEFAULT_LIMITS par test_profiles.py).

export const PROFILES = ["minimax_h3", "ltx2"];
export const DEFAULT_PROFILE = "minimax_h3";
export const LABELS = { minimax_h3: "MiniMax H3", ltx2: "LTX 2.x" };
export const LAST = -1;

export const FALLBACK_LIMITS = /* FALLBACK_LIMITS */ {
    "minimax_h3": {"image": 9, "video": 3, "video_audio": 3, "audio": 3,
                   "first_frame": 1, "last_frame": 1, "seconds": 15,
                   "max_size": [768, 1344], "fps": 24, "multiple": 1},
    "ltx2": {"guide_image": 9, "guide_video": 1, "soundtrack": 1, "voice": 1,
             "seconds": 20, "max_size": [768, 1344], "fps": 24, "multiple": 32}
} /* END */;

const COUNT_KEYS = {
    minimax_h3: ["image", "video", "video_audio", "audio", "first_frame", "last_frame"],
    ltx2: ["guide_image", "guide_video", "soundtrack", "voice"],
};
const BOUNDS = { seconds: [1, 60], fps: [1, 60], max_side: [64, 4096] };

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function profileOf(state) {
    const p = state && typeof state === "object" ? state.profile : null;
    return PROFILES.includes(p) ? p : DEFAULT_PROFILE;
}

// Limites du profil : defauts (route, sinon repli) + state.limits[profil], bornees.
export function limitsOf(state, defaults) {
    const prof = profileOf(state);
    const base = (defaults && defaults[prof]) || FALLBACK_LIMITS[prof];
    const out = JSON.parse(JSON.stringify(base));
    const all = state && typeof state === "object" ? state.limits : null;
    const over = all && typeof all === "object" ? all[prof] : null;
    if (!over || typeof over !== "object") return out;
    for (const key of COUNT_KEYS[prof]) {
        const n = num(over[key]);
        if (n !== null) out[key] = clamp(Math.trunc(n), 1, base[key]);
    }
    for (const key of ["seconds", "fps"]) {
        const n = num(over[key]);
        if (n !== null) out[key] = clamp(n, BOUNDS[key][0], BOUNDS[key][1]);
    }
    const ms = over.max_size;
    if (Array.isArray(ms) && ms.length === 2 && ms.every((x) => num(x) !== null)) {
        out.max_size = ms.map((x) => Math.trunc(clamp(x, BOUNDS.max_side[0], BOUNDS.max_side[1])));
    }
    return out;
}

// Cles des sorties LTX : paires image/moment, puis video guide, bande-son, voix.
export function ltxLayoutKeys(n, limits) {
    const count = Math.min(Math.max(1, Math.trunc(n)), limits.guide_image);
    const keys = [];
    for (let i = 1; i <= count; i++) keys.push(`guide_image_${i}`, `guide_frame_${i}`);
    return keys.concat(["guide_video", "guide_video_frame", "soundtrack", "voice"]);
}

export function outputType(key) {
    if (key === "project") return "MINIMAX_PROJECT";
    if (key.startsWith("guide_frame_") || key === "guide_video_frame") return "INT";
    if (key === "soundtrack" || key === "voice" || key.startsWith("ref_video_audio_") || key.startsWith("ref_audio_")) return "AUDIO";
    return "IMAGE";
}

export function secondsToFrame(s, fps, maxS) {
    if (s < 0) return LAST;
    return Math.floor(Math.min(s, maxS) * fps + 0.5);
}

export function videoGuideFrame(f) {
    return f <= 0 ? f : Math.floor((f - 1) / 8) * 8 + 1;
}

export function frames8n1(n) {
    return n < 1 ? 0 : Math.floor((n - 1) / 8) * 8 + 1;
}
