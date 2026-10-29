// Profils de modele (MiniMax H3, LTX 2.x) : miroir JS pur de profiles.py.
// Pas d'import ComfyUI : testable avec node --test tests/test_profiles.mjs
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

// ======================================================================
// Variantes (plan des variantes, 29/10/2026) : miroir de la description de
// profiles.py. La route /mmrefloader/profiles renvoie description() ;
// FALLBACK_DESCRIPTION sert tant qu'elle n'a pas repondu (verifiee egale par
// tests/test_variants.py). Les fonctions ci-dessus (PROFILES, limitsOf...)
// restent le temps que tous les fichiers passent a cette description.
// ======================================================================

export const FALLBACK_DESCRIPTION = /* FALLBACK_DESCRIPTION */ {
    "models": {
        "minimax_h3": {
            "label": "MiniMax H3"
        },
        "ltx": {
            "label": "LTX"
        }
    },
    "variants": {
        "minimax_h3.ref2va": {
            "model": "minimax_h3",
            "label": "Ref2VA",
            "limits": {
                "seconds": 15,
                "max_size": [
                    768,
                    1344
                ],
                "fps": 24,
                "multiple": 1,
                "frame_step": 1
            },
            "settings": [],
            "rows": [
                {
                    "id": "images",
                    "label": "Images",
                    "kind": "image",
                    "max": 9,
                    "folder": "08.Images",
                    "tags": true,
                    "outputs": [
                        [
                            "ref_image_{n}",
                            "IMAGE",
                            "image"
                        ]
                    ]
                },
                {
                    "id": "videos",
                    "label": "Video",
                    "kind": "video",
                    "max": 3,
                    "folder": "12.Video",
                    "trim": true,
                    "outputs": [
                        [
                            "ref_video_{n}",
                            "IMAGE",
                            "video_frames"
                        ]
                    ]
                },
                {
                    "id": "video_audios",
                    "label": "Video/Audio",
                    "kind": "video",
                    "max": 3,
                    "folder": "14.Video-Audio",
                    "trim": true,
                    "outputs": [
                        [
                            "ref_video_audio_{n}",
                            "AUDIO",
                            "audio"
                        ]
                    ]
                },
                {
                    "id": "audios",
                    "label": "Audio",
                    "kind": "audio",
                    "max": 3,
                    "folder": "10.Son",
                    "trim": true,
                    "accepts_video": true,
                    "outputs": [
                        [
                            "ref_audio_{n}",
                            "AUDIO",
                            "audio"
                        ]
                    ]
                }
            ]
        },
        "minimax_h3.fl2va": {
            "model": "minimax_h3",
            "label": "F2VA / FL2VA",
            "limits": {
                "seconds": 15,
                "max_size": [
                    768,
                    1344
                ],
                "fps": 24,
                "multiple": 1,
                "frame_step": 1
            },
            "settings": [],
            "rows": [
                {
                    "id": "first_frame",
                    "label": "First frame",
                    "kind": "image",
                    "max": 1,
                    "folder": "08.Images",
                    "outputs": [
                        [
                            "first_frame",
                            "IMAGE",
                            "image"
                        ]
                    ]
                },
                {
                    "id": "last_frame",
                    "label": "Last frame",
                    "kind": "image",
                    "max": 1,
                    "folder": "08.Images",
                    "outputs": [
                        [
                            "last_frame",
                            "IMAGE",
                            "image"
                        ]
                    ]
                }
            ]
        },
        "ltx.2_3": {
            "model": "ltx",
            "label": "LTX 2.3",
            "limits": {
                "seconds": 20,
                "max_size": [
                    768,
                    1344
                ],
                "fps": 24,
                "multiple": 32,
                "frame_step": 8
            },
            "settings": [
                [
                    "fps",
                    "INT",
                    "fps"
                ],
                [
                    "width",
                    "INT",
                    "width"
                ],
                [
                    "height",
                    "INT",
                    "height"
                ],
                [
                    "length",
                    "INT",
                    "length"
                ]
            ],
            "rows": [
                {
                    "id": "guide_images",
                    "label": "Guide images",
                    "kind": "image",
                    "max": 9,
                    "folder": "08.Images",
                    "moment": "frame",
                    "outputs": [
                        [
                            "guide_image_{n}",
                            "IMAGE",
                            "image"
                        ],
                        [
                            "guide_frame_{n}",
                            "INT",
                            "frame"
                        ]
                    ]
                },
                {
                    "id": "guide_video",
                    "label": "Guide video",
                    "kind": "video",
                    "max": 1,
                    "folder": "12.Video",
                    "moment": "video_frame",
                    "trim": true,
                    "outputs": [
                        [
                            "guide_video",
                            "IMAGE",
                            "video_frames"
                        ],
                        [
                            "guide_video_frame",
                            "INT",
                            "frame"
                        ]
                    ]
                },
                {
                    "id": "soundtrack",
                    "label": "Soundtrack",
                    "kind": "audio",
                    "max": 1,
                    "folder": "10.Son",
                    "trim": true,
                    "accepts_video": true,
                    "outputs": [
                        [
                            "soundtrack",
                            "AUDIO",
                            "audio"
                        ]
                    ]
                },
                {
                    "id": "voice",
                    "label": "Voice",
                    "kind": "audio",
                    "max": 1,
                    "folder": "10.Son",
                    "trim": true,
                    "accepts_video": true,
                    "outputs": [
                        [
                            "voice",
                            "AUDIO",
                            "audio"
                        ]
                    ]
                }
            ]
        },
        "ltx.2_5": {
            "model": "ltx",
            "label": "LTX 2.5",
            "limits": {
                "seconds": 20,
                "max_size": [
                    768,
                    1344
                ],
                "fps": 24,
                "multiple": 32,
                "frame_step": 8
            },
            "settings": [
                [
                    "fps",
                    "INT",
                    "fps"
                ],
                [
                    "width",
                    "INT",
                    "width"
                ],
                [
                    "height",
                    "INT",
                    "height"
                ],
                [
                    "length",
                    "INT",
                    "length"
                ]
            ],
            "rows": [
                {
                    "id": "guide_images",
                    "label": "Guide images",
                    "kind": "image",
                    "max": 9,
                    "folder": "08.Images",
                    "moment": "frame",
                    "outputs": [
                        [
                            "guide_image_{n}",
                            "IMAGE",
                            "image"
                        ],
                        [
                            "guide_frame_{n}",
                            "INT",
                            "frame"
                        ]
                    ]
                },
                {
                    "id": "guide_video",
                    "label": "Guide video",
                    "kind": "video",
                    "max": 1,
                    "folder": "12.Video",
                    "moment": "video_frame",
                    "trim": true,
                    "outputs": [
                        [
                            "guide_video",
                            "IMAGE",
                            "video_frames"
                        ],
                        [
                            "guide_video_frame",
                            "INT",
                            "frame"
                        ]
                    ]
                },
                {
                    "id": "soundtrack",
                    "label": "Soundtrack",
                    "kind": "audio",
                    "max": 1,
                    "folder": "10.Son",
                    "trim": true,
                    "accepts_video": true,
                    "outputs": [
                        [
                            "soundtrack",
                            "AUDIO",
                            "audio"
                        ]
                    ]
                },
                {
                    "id": "voice",
                    "label": "Voice",
                    "kind": "audio",
                    "max": 1,
                    "folder": "10.Son",
                    "trim": true,
                    "accepts_video": true,
                    "outputs": [
                        [
                            "voice",
                            "AUDIO",
                            "audio"
                        ]
                    ]
                }
            ]
        }
    },
    "bounds": {
        "seconds": [
            1,
            60
        ],
        "fps": [
            1,
            60
        ],
        "max_side": [
            64,
            4096
        ],
        "frame_step": [
            1,
            16
        ],
        "multiple": [
            1,
            64
        ]
    },
    "default": "minimax_h3.ref2va"
} /* END */;
export const CONTAINER_OUTPUTS = 40;

const descOf = (desc) => (desc && desc.variants ? desc : FALLBACK_DESCRIPTION);

export function variantOf(state, desc) {
    const d = descOf(desc);
    if (!state || typeof state !== "object") return d.default;
    if (d.variants[state.variant]) return state.variant;
    if (state.profile === "ltx2") return "ltx.2_3";
    return state.mode === "fl2va" ? "minimax_h3.fl2va" : d.default;
}

export function modelOf(desc, variant) {
    const d = descOf(desc);
    return (d.variants[variant] || d.variants[d.default]).model;
}

export function variantsOfModel(desc, model) {
    const d = descOf(desc);
    return Object.keys(d.variants).filter((v) => d.variants[v].model === model);
}

export function rowsOf(desc, variant) {
    const d = descOf(desc);
    return (d.variants[variant] || d.variants[d.default]).rows;
}

export function rowOf(desc, variant, rowId) {
    return rowsOf(desc, variant).find((r) => r.id === rowId) || null;
}

/** Cle d'un chemin pour les rognages et les moments (= profiles.trim_key). */
export function variantTrimKey(path) {
    return String(path).replace(/\\/g, "/").toLowerCase();
}

export function rowList(state, rowId, variant, desc) {
    const v = variant || variantOf(state, desc);
    const sel = ((state && state.selections) || {})[v] || {};
    return [...((sel.rows || {})[rowId] || [])];
}

/** Ecrit la liste d'une ligne d'une variante (les autres variantes ne bougent pas). */
export function setRowList(state, rowId, list, variant, desc) {
    const v = variant || variantOf(state, desc);
    state.selections = state.selections || {};
    const sel = (state.selections[v] = state.selections[v] || { rows: {}, trims: {}, moments: {} });
    sel.rows = sel.rows || {};
    sel.rows[rowId] = [...list];
    return state;
}

export function variantLimits(state, desc, variant) {
    const d = descOf(desc);
    const v = variant || variantOf(state, d);
    const vd = d.variants[v] || d.variants[d.default];
    const out = JSON.parse(JSON.stringify(vd.limits));
    out.counts = {};
    for (const r of vd.rows) out.counts[r.id] = r.max;
    const all = state && typeof state === "object" ? state.limits : null;
    const over = all && typeof all === "object" ? all[v] : null;
    if (!over || typeof over !== "object") return out;
    const counts = over.counts && typeof over.counts === "object" ? over.counts : {};
    for (const r of vd.rows) {
        const n = num(counts[r.id]);
        if (n !== null) out.counts[r.id] = clamp(Math.trunc(n), 1, r.max);
    }
    for (const key of ["seconds", "fps", "frame_step", "multiple"]) {
        const n = num(over[key]);
        if (n !== null) {
            const [lo, hi] = d.bounds[key];
            out[key] = clamp(key === "seconds" || key === "fps" ? n : Math.trunc(n), lo, hi);
        }
    }
    const ms = over.max_size;
    if (Array.isArray(ms) && ms.length === 2 && ms.every((x) => num(x) !== null)) {
        const [lo, hi] = d.bounds.max_side;
        out.max_size = ms.map((x) => Math.trunc(clamp(x, lo, hi)));
    }
    return out;
}

export function stepFrame(frame, step) {
    const s = Math.max(1, Math.trunc(step));
    if (frame <= 0) return frame;
    return Math.floor((frame - 1) / s) * s + 1;
}

export function framesStep(count, step) {
    const s = Math.max(1, Math.trunc(step));
    if (count < 1) return 0;
    return Math.floor((count - 1) / s) * s + 1;
}

export function settingValue(name, limits) {
    const m = Math.max(1, Math.trunc(limits.multiple || 1));
    if (name === "fps") return Math.trunc(limits.fps);
    if (name === "width" || name === "height") {
        const side = limits.max_size[name === "width" ? 0 : 1];
        return Math.max(m, Math.floor(Math.trunc(side) / m) * m);
    }
    if (name === "length") return framesStep(Math.round(limits.seconds * limits.fps) + 1, limits.frame_step || 1);
    throw new Error("Unknown setting: " + name);
}

export function variantLayout(state, desc) {
    const d = descOf(desc);
    const v = variantOf(state, d);
    const vd = d.variants[v];
    const lim = variantLimits(state, d, v);
    const out = vd.settings.map(([key, type, value]) => ({ key, type, value, row: null, index: null }));
    for (const r of vd.rows) {
        const n = Math.min(Math.max(1, rowList(state, r.id, v, d).length), lim.counts[r.id]);
        for (let i = 1; i <= n; i++) {
            for (const [name, type, value] of r.outputs) {
                if (name.includes("{n}")) out.push({ key: name.replace("{n}", String(i)), type, value, row: r.id, index: i - 1 });
                else if (i === 1) out.push({ key: name, type, value, row: r.id, index: 0 });
            }
        }
    }
    return out;
}

export function variantLayoutKeys(state, desc) {
    return variantLayout(state, desc).map((o) => o.key);
}

const OLD_ROWS = {
    images: ["minimax_h3.ref2va", "images"], videos: ["minimax_h3.ref2va", "videos"],
    video_audios: ["minimax_h3.ref2va", "video_audios"], audios: ["minimax_h3.ref2va", "audios"],
    first_frame: ["minimax_h3.fl2va", "first_frame"], last_frame: ["minimax_h3.fl2va", "last_frame"],
    guide_images: ["ltx.2_3", "guide_images"], guide_video: ["ltx.2_3", "guide_video"],
    soundtrack: ["ltx.2_3", "soundtrack"], voice: ["ltx.2_3", "voice"],
};
const OLD_TRIMS = {
    video: ["minimax_h3.ref2va", "videos"], video_audio: ["minimax_h3.ref2va", "video_audios"],
    audio: ["minimax_h3.ref2va", "audios"], guide_video: ["ltx.2_3", "guide_video"],
    soundtrack: ["ltx.2_3", "soundtrack"], voice: ["ltx.2_3", "voice"],
};
const OLD_COUNTS = {
    image: "images", video: "videos", video_audio: "video_audios", audio: "audios", first_frame: "first_frame",
    last_frame: "last_frame", guide_image: "guide_images", guide_video: "guide_video", soundtrack: "soundtrack", voice: "voice",
};
const KEEP_KEYS = ["root", "folders", "subs"];

function names(value) {
    const items = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    const out = [];
    for (let v of items) {
        if (isObj(v)) v = v.file; // ancienne video {"file", "sound"}
        if (typeof v === "string" && v.trim()) out.push(v.trim());
    }
    return out;
}

function emptySelection(d, v) {
    const rows = d.variants[v].rows;
    const sel = { rows: {}, trims: {}, moments: {} };
    for (const r of rows) {
        sel.rows[r.id] = [];
        if (r.trim) sel.trims[r.id] = {};
        if (r.moment) sel.moments[r.id] = {};
    }
    return sel;
}

function cleanTrims(entries) {
    const out = {};
    if (!isObj(entries)) return out;
    for (const [k, v] of Object.entries(entries)) {
        if (!Array.isArray(v) || v.length < 2) continue;
        const a = Number(v[0]);
        const b = Number(v[1]);
        if (Number.isFinite(a) && Number.isFinite(b) && 0 <= a && a < b) out[variantTrimKey(k)] = [a, b];
    }
    return out;
}

function cleanMoments(entries) {
    const out = {};
    if (!isObj(entries)) return out;
    for (const [k, v] of Object.entries(entries)) if (num(v) !== null) out[variantTrimKey(k)] = v;
    return out;
}

function normalize(data, d) {
    const out = {};
    for (const k of KEEP_KEYS) if (k in data) out[k] = data[k];
    out.variant = d.variants[data.variant] ? data.variant : d.default;
    const last = isObj(data.lastVariant) ? data.lastVariant : {};
    out.lastVariant = {};
    for (const [m, v] of Object.entries(last)) {
        if (d.models[m] && d.variants[v] && d.variants[v].model === m) out.lastVariant[m] = v;
    }
    out.lastVariant[d.variants[out.variant].model] = out.variant;
    const sels = isObj(data.selections) ? data.selections : {};
    out.selections = {};
    for (const v of Object.keys(d.variants)) {
        const sel = isObj(sels[v]) ? sels[v] : {};
        const clean = emptySelection(d, v);
        const rowsIn = isObj(sel.rows) ? sel.rows : {};
        for (const r of d.variants[v].rows) clean.rows[r.id] = names(rowsIn[r.id]).slice(0, r.max);
        for (const rid of Object.keys(clean.trims)) clean.trims[rid] = cleanTrims((sel.trims || {})[rid]);
        for (const rid of Object.keys(clean.moments)) clean.moments[rid] = cleanMoments((sel.moments || {})[rid]);
        out.selections[v] = clean;
    }
    const lim = isObj(data.limits) ? data.limits : {};
    out.limits = {};
    for (const [v, x] of Object.entries(lim)) if (d.variants[v] && isObj(x)) out.limits[v] = x;
    return out;
}

/** Etat du RefLoader au format des variantes (= profiles.migrate_state). */
export function migrateState(data, desc) {
    const d = descOf(desc);
    if (!isObj(data)) data = {};
    if ("selections" in data || d.variants[data.variant]) return normalize(data, d);
    const fresh = {};
    for (const k of KEEP_KEYS) if (k in data) fresh[k] = data[k];
    fresh.variant = variantOf(data, d);
    const sels = {};
    for (const v of Object.keys(d.variants)) sels[v] = emptySelection(d, v);
    for (const [key, [v, rid]] of Object.entries(OLD_ROWS)) if (sels[v]) sels[v].rows[rid] = names(data[key]);
    const ref = sels["minimax_h3.ref2va"];
    if (ref && !ref.rows.video_audios.length && Array.isArray(data.videos)) {
        ref.rows.video_audios = data.videos
            .filter((v) => isObj(v) && v.sound && typeof v.file === "string" && v.file.trim())
            .map((v) => v.file.trim());
    }
    const trims = isObj(data.trims) ? data.trims : {};
    for (const [kind, [v, rid]] of Object.entries(OLD_TRIMS)) if (sels[v]) sels[v].trims[rid] = isObj(trims[kind]) ? trims[kind] : {};
    const moments = isObj(data.moments) ? data.moments : {};
    for (const rid of ["guide_images", "guide_video"]) {
        if (sels["ltx.2_3"]) sels["ltx.2_3"].moments[rid] = isObj(moments[rid]) ? moments[rid] : {};
    }
    fresh.selections = sels;
    const limits = {};
    const old = isObj(data.limits) ? data.limits : {};
    for (const [prof, variants] of [["minimax_h3", ["minimax_h3.ref2va", "minimax_h3.fl2va"]], ["ltx2", ["ltx.2_3"]]]) {
        const o = old[prof];
        if (!isObj(o)) continue;
        for (const v of variants) {
            const ids = new Set(d.variants[v].rows.map((r) => r.id));
            const entry = {};
            for (const k of ["seconds", "fps", "max_size", "multiple"]) if (k in o) entry[k] = o[k];
            const counts = {};
            for (const [k, n] of Object.entries(o)) if (OLD_COUNTS[k] && ids.has(OLD_COUNTS[k])) counts[OLD_COUNTS[k]] = n;
            if (Object.keys(counts).length) entry.counts = counts;
            if (Object.keys(entry).length) limits[v] = entry;
        }
    }
    fresh.limits = limits;
    return normalize(fresh, d);
}

/** Lit l'etat JSON du widget (texte) au format des variantes. */
export function parseVariantState(raw, desc) {
    let data = {};
    try {
        data = typeof raw === "string" && raw ? JSON.parse(raw) : isObj(raw) ? raw : {};
    } catch (e) {
        data = {};
    }
    return migrateState(data, desc);
}

/**
 * Anciens liens par mode -> variantes : ref2va / minimax_h3:ref2va -> minimax_h3.ref2va,
 * fl2va / minimax_h3:fl2va -> minimax_h3.fl2va, ltx2 -> ltx.2_3 ; une cle nouvelle l'emporte.
 */
export function variantModeLinks(map) {
    const out = {};
    if (!isObj(map)) return out;
    const old = { ref2va: "minimax_h3.ref2va", "minimax_h3:ref2va": "minimax_h3.ref2va", fl2va: "minimax_h3.fl2va",
        "minimax_h3:fl2va": "minimax_h3.fl2va", ltx2: "ltx.2_3" };
    for (const [k, v] of Object.entries(map)) if (old[k] && !(old[k] in out)) out[old[k]] = v;
    for (const [k, v] of Object.entries(map)) if (FALLBACK_DESCRIPTION.variants[k]) out[k] = v;
    return out;
}

/** Description renvoyee par la route, sinon la copie de secours. */
export function routeDescription(json) {
    const d = json && isObj(json.description) ? json.description : json; // route : sous la cle "description"
    return d && isObj(d.variants) && isObj(d.models) && d.default ? d : FALLBACK_DESCRIPTION;
}
