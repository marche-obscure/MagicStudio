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

// Nombres de fichiers reglables par profil (= profiles.COUNT_KEYS en Python).
export const COUNT_KEYS = {
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

// --------------------------------------------------------------------
// Liens memorises par profil (node.properties.modeLinks du RefLoader)
// --------------------------------------------------------------------
/** Cle des liens d'un profil : "minimax_h3:ref2va", "minimax_h3:fl2va" ou "ltx2". */
export function profileKey(state) {
    const prof = profileOf(state);
    if (prof !== "minimax_h3") return prof;
    return "minimax_h3:" + (state && state.mode === "fl2va" ? "fl2va" : "ref2va");
}

/** Anciens workflows : cles ref2va / fl2va lues comme minimax_h3:* (une cle nouvelle l'emporte). */
export function legacyModeLinks(map) {
    if (!map || typeof map !== "object" || Array.isArray(map)) return {};
    const out = {};
    for (const [k, v] of Object.entries(map)) {
        if (k === "ref2va" || k === "fl2va") {
            const nk = "minimax_h3:" + k;
            if (!(nk in map)) out[nk] = v;
        } else {
            out[k] = v;
        }
    }
    return out;
}

/** Reponse de GET /mmrefloader/profiles -> {profil: limites}, ou null si illisible. */
export function routeDefaults(json) {
    const items = json && Array.isArray(json.profiles) ? json.profiles : null;
    if (!items) return null;
    const out = {};
    for (const it of items) {
        if (it && PROFILES.includes(it.id) && it.limits && typeof it.limits === "object") out[it.id] = it.limits;
    }
    return out;
}

// --------------------------------------------------------------------
// Etat du RefLoader et disposition des sorties (miroir de media.parse_state /
// media.state_layout : memes resultats, verifies par les cas state_cases)
// --------------------------------------------------------------------
const MM = FALLBACK_LIMITS.minimax_h3;
const LTX = FALLBACK_LIMITS.ltx2;
// Listes rognables (identique a media.TRIM_KINDS).
export const TRIM_KINDS = ["video", "video_audio", "audio", "guide_video", "soundtrack", "voice"];
const keyOf = (path) => String(path).replace(/\\/g, "/").toLowerCase(); // = trimKey / media.trim_key

/** Doit rester identique a media.layout_keys() (bornes du module : 9, 3, 3, 3). */
export function layoutKeys(ni, nv, nva, na) {
    const clampN = (n, max) => Math.min(Math.max(1, n), max);
    const keys = [];
    for (let i = 1; i <= clampN(ni, MM.image); i++) keys.push("ref_image_" + i);
    for (let i = 1; i <= clampN(nv, MM.video); i++) keys.push("ref_video_" + i);
    for (let i = 1; i <= clampN(nva, MM.video_audio); i++) keys.push("ref_video_audio_" + i);
    for (let i = 1; i <= clampN(na, MM.audio); i++) keys.push("ref_audio_" + i);
    return keys;
}

/** Sorties visibles selon le profil et le mode (identique a media.state_layout). */
export function stateLayout(state, defaults) {
    const lim = limitsOf(state, defaults);
    const n = (k) => (Array.isArray(state[k]) ? state[k].length : 0);
    if (profileOf(state) === "ltx2") return ltxLayoutKeys(n("guide_images"), lim);
    if (state.mode === "fl2va") return ["first_frame", "last_frame"];
    return layoutKeys(Math.min(n("images"), lim.image), Math.min(n("videos"), lim.video),
        Math.min(n("video_audios"), lim.video_audio), Math.min(n("audios"), lim.audio));
}

export function emptyState() {
    // folders[kind] : dossier de base propre a une galerie ("" = dossier racine) ;
    // subs[kind] : sous-dossier choisi, relatif a la base ("" = la base elle-meme).
    const trims = {};
    for (const k of TRIM_KINDS) trims[k] = {};
    return {
        profile: DEFAULT_PROFILE,
        // Limites reglees par profil (gardees telles quelles, bornees a l'usage par limitsOf).
        limits: {},
        root: "", folders: { image: "", video: "", audio: "" }, subs: { image: "", video: "", audio: "" },
        images: [], videos: [], video_audios: [], audios: [],
        // Mode F2VA/FL2VA : une image au plus dans chaque liste.
        mode: "ref2va", first_frame: [], last_frame: [],
        // Profil LTX 2.x : listes propres (les deux jeux restent dans l'etat).
        guide_images: [], guide_video: [], soundtrack: [], voice: [],
        // Moments (secondes, -1 = Last) par cle de chemin.
        moments: { guide_images: {}, guide_video: {} },
        // Rognages par liste : {cle du chemin: [debut, fin]} en secondes.
        trims,
    };
}

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v) => (Array.isArray(v) ? v : []).filter((x) => typeof x === "string" && x);

/** Normalise l'etat JSON du noeud (identique a media.parse_state pour les champs communs). */
export function parseState(raw) {
    const s = emptyState();
    let data = null;
    try {
        data = JSON.parse(raw || "{}");
    } catch (e) {
        data = null;
    }
    if (!isObj(data)) return s;
    const f = isObj(data.folders) ? data.folders : {};
    for (const k of ["image", "video", "audio"]) s.folders[k] = typeof f[k] === "string" ? f[k] : "";
    s.root = typeof data.root === "string" ? data.root : "";
    const sb = isObj(data.subs) ? data.subs : {};
    for (const k of ["image", "video", "audio"]) s.subs[k] = typeof sb[k] === "string" ? sb[k] : "";
    s.profile = profileOf(data);
    s.limits = isObj(data.limits) ? data.limits : {};
    s.images = strings(data.images).slice(0, MM.image);
    s.audios = strings(data.audios).slice(0, MM.audio);
    // Videos : chemins simples. Ancien format {file, sound} : la video reste
    // une video et, si sound, devient aussi une piste ref_video_audio.
    const oldSounds = [];
    s.videos = (Array.isArray(data.videos) ? data.videos : [])
        .map((v) => {
            if (v && typeof v === "object") {
                if (v.sound && typeof v.file === "string" && v.file) oldSounds.push(v.file);
                return v.file;
            }
            return v;
        })
        .filter((v) => typeof v === "string" && v)
        .slice(0, MM.video);
    const va = strings(data.video_audios);
    s.video_audios = (va.length ? va : oldSounds).slice(0, MM.video_audio);
    s.mode = data.mode === "fl2va" ? "fl2va" : "ref2va";
    s.guide_images = strings(data.guide_images).slice(0, LTX.guide_image);
    s.guide_video = strings(data.guide_video).slice(0, LTX.guide_video);
    s.soundtrack = strings(data.soundtrack).slice(0, LTX.soundtrack);
    s.voice = strings(data.voice).slice(0, LTX.voice);
    const tr = isObj(data.trims) ? data.trims : {};
    for (const k of TRIM_KINDS) {
        const entries = isObj(tr[k]) ? tr[k] : {};
        for (const [key, v] of Object.entries(entries)) {
            if (Array.isArray(v) && v.length === 2 && num(Number(v[0])) !== null && num(Number(v[1])) !== null &&
                Number(v[0]) >= 0 && Number(v[1]) > Number(v[0])) {
                s.trims[k][keyOf(key)] = [Number(v[0]), Number(v[1])];
            }
        }
    }
    const mo = isObj(data.moments) ? data.moments : {};
    for (const k of ["guide_images", "guide_video"]) {
        const entries = isObj(mo[k]) ? mo[k] : {};
        for (const [key, v] of Object.entries(entries)) {
            if (num(v) !== null) s.moments[k][keyOf(key)] = v;
        }
    }
    for (const k of ["first_frame", "last_frame"]) {
        const v = data[k];
        s[k] = (Array.isArray(v) ? v : [v]).filter((x) => typeof x === "string" && x).slice(0, 1);
    }
    return s;
}

// --------------------------------------------------------------------
// Moments des guides LTX 2.x (secondes, LAST = -1) et fenetre Limits
// --------------------------------------------------------------------
/** Miroir de profiles.default_moment : First (0) s'il est libre, sinon Last s'il est libre, sinon 0. */
export function defaultMoment(used) {
    if (!used.some((u) => u === 0)) return 0;
    if (!used.some((u) => u === LAST)) return LAST;
    return 0;
}

/**
 * Moment effectif de chaque image guide (meme calcul que media._build_ltx_outputs) :
 * moment memorise (cle = chemin normalise), sinon defaultMoment sur les moments
 * deja pris (memorises d'abord, puis ceux donnes dans l'ordre de la liste).
 */
export function guideMoments(paths, stored) {
    const st = stored && typeof stored === "object" ? stored : {};
    const has = (p) => Object.prototype.hasOwnProperty.call(st, keyOf(p));
    const used = paths.filter(has).map((p) => st[keyOf(p)]);
    return paths.map((p) => {
        if (has(p)) return st[keyOf(p)];
        const m = defaultMoment(used);
        used.push(m);
        return m;
    });
}

/** Moment tape dans un champ : 0..maxS (arrondi au dixieme) accepte, le reste refuse. */
export function checkMoment(raw, maxS) {
    const txt = String(raw).trim().replace(",", ".");
    const v = txt === "" ? NaN : Number(txt);
    if (!Number.isFinite(v) || v < 0 || v > maxS) return { ok: false, value: null };
    return { ok: true, value: Math.round(v * 10) / 10 };
}

/** Pour chaque guide : numero (1..) du premier autre guide au meme numero d'image, sinon 0. */
export function sameFrameAs(frames) {
    return frames.map((f, i) => {
        const j = frames.findIndex((g, k) => k !== i && g === f);
        return j < 0 ? 0 : j + 1;
    });
}

/** Bornes des champs de la fenetre Limits (= bounds de la route /mmrefloader/profiles). */
export function limitBounds(profile, defaults) {
    const prof = PROFILES.includes(profile) ? profile : DEFAULT_PROFILE;
    const base = (defaults && defaults[prof]) || FALLBACK_LIMITS[prof];
    const out = { seconds: BOUNDS.seconds.slice(), fps: BOUNDS.fps.slice(), max_side: BOUNDS.max_side.slice() };
    for (const k of COUNT_KEYS[prof]) out[k] = [1, base[k]];
    return out;
}

/** state.limits[profil] a ecrire : seulement les valeurs differentes des defauts du modele. */
export function limitOverrides(profile, values, defaults) {
    const prof = PROFILES.includes(profile) ? profile : DEFAULT_PROFILE;
    const base = (defaults && defaults[prof]) || FALLBACK_LIMITS[prof];
    const out = {};
    for (const k of COUNT_KEYS[prof].concat(["seconds", "fps"])) {
        if (num(values[k]) !== null && values[k] !== base[k]) out[k] = values[k];
    }
    const ms = values.max_size;
    if (Array.isArray(ms) && ms.length === 2 && (ms[0] !== base.max_size[0] || ms[1] !== base.max_size[1])) {
        out.max_size = [ms[0], ms[1]];
    }
    return out;
}

/** Retire de state.moments les cles des fichiers qui ne sont plus dans leur liste (renvoie state). */
export function pruneMoments(state) {
    if (!state || !isObj(state.moments)) return state;
    for (const list of ["guide_images", "guide_video"]) {
        const m = state.moments[list];
        if (!isObj(m)) continue;
        const keep = new Set((Array.isArray(state[list]) ? state[list] : []).map(keyOf));
        for (const k of Object.keys(m)) if (!keep.has(k)) delete m[k];
    }
    return state;
}
