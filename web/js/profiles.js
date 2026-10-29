// Modeles et variantes du RefLoader : miroir JS pur de profiles.py (description, limites,
// calculs d'images, conversion des anciens etats). Pas d'import ComfyUI : teste par
// node --test tests/test_profiles.mjs tests/test_variants.mjs

export const LAST = -1;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const keyOf = (path) => String(path).replace(/\\/g, "/").toLowerCase(); // = trimKey / media.trim_key

/** Moment en secondes -> numero d'image ; LAST (ou < 0) reste LAST (= profiles.seconds_to_frame). */
export function secondsToFrame(s, fps, maxS) {
    if (s < 0) return LAST;
    return Math.floor(Math.min(s, maxS) * fps + 0.5);
}

// --------------------------------------------------------------------
// Moments (secondes, LAST = -1)
// --------------------------------------------------------------------
/** Miroir de profiles.default_moment : First (0) s'il est libre, sinon Last s'il est libre, sinon 0. */
export function defaultMoment(used) {
    if (!used.some((u) => u === 0)) return 0;
    if (!used.some((u) => u === LAST)) return LAST;
    return 0;
}

/**
 * Moment effectif de chaque image d'une ligne "frame" (meme calcul que media._row_moments) :
 * moment memorise (cle = chemin normalise), sinon defaultMoment sur les moments deja pris
 * (memorises d'abord, puis ceux donnes dans l'ordre de la liste).
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

/** Pour chaque image : numero (1..) de la premiere autre image au meme numero d'image, sinon 0. */
export function sameFrameAs(frames) {
    return frames.map((f, i) => {
        const j = frames.findIndex((g, k) => k !== i && g === f);
        return j < 0 ? 0 : j + 1;
    });
}

// ======================================================================
// Variantes (plan des variantes, 29/10/2026) : miroir de la description de
// profiles.py. La route /mmrefloader/profiles renvoie description() ;
// FALLBACK_DESCRIPTION sert tant qu'elle n'a pas repondu (verifiee egale par
// tests/test_variants.py).
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
            "first_index": 0,
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
            "first_index": 0,
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

/**
 * Nom d'une sortie {n} pour le fichier d'index i0 (0 = premier) : numero a partir de
 * first_index de la variante (0 pour MiniMax H3, comme ses entrees ref_image_0... ; 1 par defaut).
 */
export function outputKey(template, variantDesc, i0) {
    const first = variantDesc && typeof variantDesc.first_index === "number" ? variantDesc.first_index : 1;
    return String(template).replace("{n}", String(i0 + first));
}

/**
 * Nom de sortie d'avant la numerotation a partir de 0 (anciens workflows, Containers enregistres
 * avant le 30/10/2026 : ref_image_1 = premiere image) -> nom actuel (ref_image_0). Seulement pour
 * les variantes dont first_index n'est pas 1 ; tout autre nom est rendu tel quel.
 */
export function renumberOldName(name, desc) {
    const d = descOf(desc);
    for (const vd of Object.values(d.variants)) {
        const first = typeof vd.first_index === "number" ? vd.first_index : 1;
        if (first === 1) continue;
        for (const r of vd.rows) {
            for (const [tpl] of r.outputs) {
                if (!tpl.includes("{n}")) continue;
                const [a, b] = tpl.split("{n}");
                const m = String(name).match(new RegExp("^" + a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)" +
                    b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"));
                if (m && Number(m[1]) >= 1) return a + (Number(m[1]) - 1 + first) + b;
            }
        }
    }
    return name;
}

/** modeLinks d'avant la numerotation a partir de 0 : cles des sorties renommees (renumberOldName). */
export function renumberModeLinks(map, desc) {
    const out = {};
    for (const [v, entries] of Object.entries(map || {})) {
        out[v] = Array.isArray(entries) ? entries.map((e) => (e && typeof e === "object"
            ? Object.assign({}, e, { key: renumberOldName(e.key, desc) }) : e)) : entries;
    }
    return out;
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
                if (name.includes("{n}")) out.push({ key: outputKey(name, vd, i - 1), type, value, row: r.id, index: i - 1 });
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

// ---- Interface du RefLoader des variantes (Task 4) ----

/** Hauteur de l'interface DOM du RefLoader : ligne Model + une ligne par ligne de la variante + bas. */
export function uiHeight(desc, variant) {
    return 80 + 38 * rowsOf(desc, variant).length;
}

/** Libelles de la fenetre Limits ; "Duration (s)" quand la variante sort une longueur (reglage length). */
export function limitLabels(desc, variant) {
    const d = descOf(desc);
    const vd = d.variants[variant] || d.variants[d.default];
    const counts = {};
    for (const r of vd.rows) counts[r.id] = r.label;
    const length = vd.settings.some((s) => s[2] === "length");
    return { counts, seconds: length ? "Duration (s)" : "Max duration (s)", max_size: "Max size", fps: "Frames per second" };
}

/** Valeurs de la fenetre Limits -> ce qui differe des valeurs de la variante (state.limits[variante]). */
export function variantLimitOverrides(desc, variant, values) {
    const base = variantLimits({}, desc, variant);
    const out = {};
    const counts = {};
    for (const [rid, n] of Object.entries((values && values.counts) || {})) {
        if (rid in base.counts && Number(n) !== base.counts[rid]) counts[rid] = Number(n);
    }
    if (Object.keys(counts).length) out.counts = counts;
    for (const key of ["seconds", "fps", "frame_step", "multiple"]) {
        if (values && key in values && Number(values[key]) !== base[key]) out[key] = Number(values[key]);
    }
    const ms = values && values.max_size;
    if (Array.isArray(ms) && (Number(ms[0]) !== base.max_size[0] || Number(ms[1]) !== base.max_size[1])) {
        out.max_size = [Number(ms[0]), Number(ms[1])];
    }
    return out;
}

/** Retire, dans chaque variante, les moments des fichiers qui ne sont plus dans leur ligne. */
export function pruneVariantMoments(state) {
    for (const sel of Object.values((state && state.selections) || {})) {
        for (const [rid, table] of Object.entries((sel && sel.moments) || {})) {
            if (!isObj(table)) continue;
            const keep = new Set(((sel.rows || {})[rid] || []).map(variantTrimKey));
            for (const k of Object.keys(table)) if (!keep.has(k)) delete table[k];
        }
    }
    return state;
}

// ---- MagicStudio Container (Task 5) ----

/** Sorties d'un RefLoader d'avant les variantes (une sortie par fichier) : autre chose que project, package. */
export function isOldLoaderOutputs(names) {
    if (!Array.isArray(names) || !names.length) return false;
    return !(names.length === 2 && names[0] === "project" && names[1] === "package");
}

/**
 * Reprise d'un ancien RefLoader : chaque lien d'une sortie de fichier va sur la sortie de meme
 * nom du Container ; project reste sur la sortie project du RefLoader ; un nom absent du
 * Container (avec des liens) est signale dans dropped.
 */
export function rewirePlan(oldOutputs, containerKeys) {
    const keys = new Set(containerKeys || []);
    const plan = { toContainer: [], toProject: [], dropped: [] };
    for (const o of oldOutputs || []) {
        const links = (o && o.links) || [];
        if (!links.length) continue;
        const to = o.name === "project" ? plan.toProject : keys.has(o.name) ? plan.toContainer : null;
        if (!to) {
            plan.dropped.push(o.name);
            continue;
        }
        for (const l of links) to.push({ name: o.name, targetId: l.targetId, targetSlot: l.targetSlot });
    }
    return plan;
}

/**
 * Paires colorees du Container : dans une variante qui a une ligne de bandes-son (videos dont
 * seule la bande-son sort), la video N et la bande-son N, si les deux ont un fichier -> N.
 * Renvoie {nom de sortie: N}.
 */
export function pairedOutputs(state, desc) {
    const d = descOf(desc);
    const v = variantOf(state, d);
    const rows = rowsOf(d, v);
    const track = rows.find((r) => r.kind === "video" && r.outputs[0][2] === "audio");
    const video = rows.find((r) => r.kind === "video" && r.outputs[0][2] === "video_frames");
    const out = {};
    if (!track || !video) return out;
    const a = rowList(state, video.id, v, d);
    const b = rowList(state, track.id, v, d);
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (!a[i] || !b[i]) continue;
        out[outputKey(video.outputs[0][0], d.variants[v], i)] = i + 1;
        out[outputKey(track.outputs[0][0], d.variants[v], i)] = i + 1;
    }
    return out;
}
