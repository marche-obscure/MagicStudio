import { app } from "../../scripts/app.js";
import { formatConfig, parseConfig } from "./config_format.js";

const NODE_NAME = "MiniMaxH3RefLoader";

const TITLE_COLOR = "#3eaca5";
const BODY_COLOR = "#097267";
const VIOLET = "#6a5fd3";
const PINK = "#d35fa8";
const ORANGE = "#e0793c";
const GREEN = "#43a047";
const DARK_RED = "#6b2b2b";
// Rouge vif : vignette marquee "a supprimer", bouton Delete et poubelles du
// noeud quand leur ligne contient au moins une reference (grises sinon).
const MARK_RED = "#d32f2f";
const INACTIVE_BG = "#2a2a2a";
const INACTIVE_FG = "#888";

// Plafonds des entrees de MiniMaxH3ReferenceToVideo (identiques a media.py).
const LIMITS = { image: 9, video: 3, audio: 3 };

// Hauteur de l'interface DOM (4 boutons + barre du bas).
const UI_HEIGHT = 196;
const MIN_WIDTH = 340;

const svg = (body, size) =>
    '<svg viewBox="0 0 24 24" width="' + (size || 15) + '" height="' + (size || 15) +
    '" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round">' + body + "</svg>";

const IMAGE_ICON = svg(
    '<rect x="3" y="3" width="18" height="18" rx="2"></rect>' +
    '<circle cx="8.5" cy="8.5" r="1.5"></circle><path d="M21 15l-5-5L5 21"></path>');
const VIDEO_ICON = svg(
    '<rect x="2" y="6" width="14" height="12" rx="2"></rect>' +
    '<path d="M16 10l6-3v10l-6-3z"></path>');
const SPEAKER_BODY =
    '<path d="M11 5L6 9H2v6h4l5 4V5z"></path>' +
    '<path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M19 5a10 10 0 0 1 0 14"></path>';
const SPEAKER_ICON = svg(SPEAKER_BODY);
const MUTE_ICON = svg(
    '<path d="M11 5L6 9H2v6h4l5 4V5z"></path>' +
    '<line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>');
const VIDEO_AUDIO_ICON =
    '<span style="display:flex;gap:1px">' + svg(
        '<rect x="2" y="6" width="14" height="12" rx="2"></rect>' +
        '<path d="M16 10l6-3v10l-6-3z"></path>', 13) + svg(SPEAKER_BODY, 13) + "</span>";
const AUDIO_ICON = svg(
    '<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle>' +
    '<circle cx="18" cy="16" r="3"></circle>');
const FOLDER_ICON = svg(
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>', 13);
const REFRESH_ICON = svg(
    '<polyline points="23 4 23 10 17 10"></polyline>' +
    '<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>', 13);
const TRASH_ICON = svg(
    '<polyline points="3 6 5 6 21 6"></polyline>' +
    '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>' +
    '<path d="M10 11v6"></path><path d="M14 11v6"></path>' +
    '<path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path>', 12);
const CLOSE_ICON = svg(
    '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>', 14);
const EYE_ICON = svg(
    '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>', 13);
const GEAR_ICON = svg(
    '<circle cx="12" cy="12" r="3"></circle>' +
    '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>', 13);
const DOWNLOAD_ICON = svg('<path d="M12 3v12"></path><path d="M7 10l5 5 5-5"></path><path d="M5 21h14"></path>', 13);
const UPLOAD_ICON = svg('<path d="M12 21V9"></path><path d="M7 14l5-5 5 5"></path><path d="M5 3h14"></path>', 13);
const LEFT_ICON = svg('<polyline points="15 18 9 12 15 6"></polyline>', 12);
const RIGHT_ICON = svg('<polyline points="9 18 15 12 9 6"></polyline>', 12);

// Une ligne par bouton : type de galerie ouverte, son par defaut d'une
// nouvelle video selectionnee depuis ce bouton.
const BUTTONS = [
    { id: "image", kind: "image", label: "Images", icon: IMAGE_ICON, color: VIOLET },
    { id: "video", kind: "video", label: "Video", icon: VIDEO_ICON, color: ORANGE, sound: false },
    { id: "video_audio", kind: "video", label: "Video/Audio", icon: VIDEO_AUDIO_ICON, color: GREEN, sound: true },
    { id: "audio", kind: "audio", label: "Audio", icon: AUDIO_ICON, color: TITLE_COLOR },
];

const KIND_TITLES = { image: "Reference images", video: "Reference videos", audio: "Reference audio" };

function iconBadge(icon, bg) {
    return '<span style="display:inline-flex;align-items:center;justify-content:center;' +
        "min-width:18px;height:18px;padding:0 3px;border-radius:4px;vertical-align:middle;" +
        "background:" + bg + '">' + icon + "</span>";
}

const HELP_SECTIONS = [
    {
        title: "What this node does",
        html: "<p>Loads the references of <b>MiniMax H3 Reference to Video</b>: " +
            "up to 9 images, 3 videos (each with or without its soundtrack) and 3 audio files. " +
            "Wire the outputs in order: <b>ref_image_1</b> goes to the first image input of " +
            "MiniMax (named <b>ref_image_0</b> there), <b>ref_image_2</b> to the next one, and so on.</p>",
    },
    {
        title: "The four buttons",
        html: "<p>" + iconBadge(IMAGE_ICON, VIOLET) + " <b>Images</b>, " +
            iconBadge(VIDEO_ICON, ORANGE) + " <b>Video</b>, " +
            iconBadge(VIDEO_AUDIO_ICON, GREEN) + " <b>Video/Audio</b>, " +
            iconBadge(AUDIO_ICON, TITLE_COLOR) + " <b>Audio</b>: each opens a gallery of the " +
            "chosen folder. <b>Video</b> and <b>Video/Audio</b> open the same video gallery and " +
            "share the same 3 slots: a video picked from <b>Video/Audio</b> keeps its sound, one " +
            "picked from <b>Video</b> is muted. The " + iconBadge(SPEAKER_ICON, GREEN) +
            " switch on a selected video changes it at any time.</p>" +
            "<p>The " + iconBadge(TRASH_ICON, MARK_RED) + " next to " + iconBadge(EYE_ICON, VIOLET) +
            " deletes <b>all</b> the references of its row, after a confirmation. On the " +
            "<b>Video/Audio</b> row it mutes all the videos instead (they stay selected).</p>",
    },
    {
        title: "Numbering",
        html: "<p>Click order sets the number: the first image clicked is <b>ref_image_1</b>, " +
            "that is <b>&lt;Picture 1&gt;</b> in the prompt. Click again to remove it; the " +
            "others move up. <b>ref_video_audio_N</b> is the soundtrack of <b>ref_video_N</b> " +
            "(empty when muted).</p>" +
            "<p>MiniMax numbers <b>&lt;Audio j&gt;</b> with the video soundtracks first, then " +
            "the audio files: with 2 videos with sound, <b>ref_audio_1</b> is " +
            "<b>&lt;Audio 3&gt;</b>.</p>",
    },
    {
        title: "Viewing and reordering",
        html: "<p>" + iconBadge(EYE_ICON, VIOLET) + " shows the selected files in their order, " +
            "with their number and output. Click a thumbnail to see it larger (videos and audio " +
            "can be played) with its folder, size and duration. The " + iconBadge(LEFT_ICON, INACTIVE_BG) +
            " " + iconBadge(RIGHT_ICON, INACTIVE_BG) + " arrows move a file one place: number 1 always " +
            "goes out on <b>ref_image_1</b>, number 2 on <b>ref_image_2</b>, and so on (the wires stay " +
            "on the outputs). A video keeps its sound setting when it moves.</p>" +
            "<p>The " + iconBadge(TRASH_ICON, INACTIVE_BG) + " on a thumbnail marks it for deletion (it turns " +
            iconBadge(TRASH_ICON, MARK_RED) + "); <b>Delete</b> removes the marked files after a confirmation. " +
            "The following references move up (ref 4 becomes ref 3...) and the last output, now empty, " +
            "is removed.</p>",
    },
    {
        title: "Root folder and configuration",
        html: "<p>" + iconBadge(GEAR_ICON, VIOLET) + " sets the <b>root folder</b> of your rushes: " +
            "galleries without their own folder open there.</p>" +
            "<p>" + iconBadge(DOWNLOAD_ICON, PINK) + " saves the whole configuration (root folder, " +
            "images, videos, video sound, audio) in a .txt file, one line per output, e.g. " +
            "<code>image 1 : images\\a.png</code>. Paths under the root folder are written relative " +
            "to it; an empty group is written <code>audio 1 : NaN</code>, a muted video " +
            "<code>video_audio 1 : NaN</code>.</p>" +
            "<p>" + iconBadge(UPLOAD_ICON, GREEN) + " loads such a file and sets the outputs from it. " +
            "It turns " + iconBadge(UPLOAD_ICON, ORANGE) + " when a configuration already exists: " +
            "loading then asks a confirmation, since it overwrites the current one. Files missing on " +
            "disk are still loaded and reported under the buttons.</p>",
    },
    {
        title: "Loading",
        html: "<p>Videos are read at 24 fps, cut to 15 s and reduced to 768×1344 pixels at most " +
            "(MiniMax would reduce them anyway). Audio files are cut to 15 s.</p>",
    },
    {
        title: "Outputs",
        html: "<p>An output appears for each selected file (at least one per type). " +
            "Double-click an output name to rename it (empty = default name), or use the " +
            "right-click menu.</p>",
    },
];

// --------------------------------------------------------------------
// Etat et disposition des sorties
// --------------------------------------------------------------------
function emptyState() {
    return { root: "", folders: { image: "", video: "", audio: "" }, images: [], videos: [], audios: [] };
}

function parseState(raw) {
    const s = emptyState();
    let data = null;
    try {
        data = JSON.parse(raw || "{}");
    } catch (e) {
        data = null;
    }
    if (!data || typeof data !== "object") return s;
    const f = data.folders || {};
    for (const k of ["image", "video", "audio"]) s.folders[k] = typeof f[k] === "string" ? f[k] : "";
    s.root = typeof data.root === "string" ? data.root : "";
    s.images = (Array.isArray(data.images) ? data.images : []).filter((v) => typeof v === "string" && v).slice(0, LIMITS.image);
    s.audios = (Array.isArray(data.audios) ? data.audios : []).filter((v) => typeof v === "string" && v).slice(0, LIMITS.audio);
    s.videos = (Array.isArray(data.videos) ? data.videos : [])
        .filter((v) => v && typeof v.file === "string" && v.file)
        .map((v) => ({ file: v.file, sound: !!v.sound }))
        .slice(0, LIMITS.video);
    return s;
}

/** Doit rester identique a media.layout_keys() cote Python. */
function layoutKeys(ni, nv, na) {
    const clamp = (n, max) => Math.min(Math.max(1, n), max);
    const keys = [];
    for (let i = 1; i <= clamp(ni, LIMITS.image); i++) keys.push("ref_image_" + i);
    const v = clamp(nv, LIMITS.video);
    for (let i = 1; i <= v; i++) keys.push("ref_video_" + i);
    for (let i = 1; i <= v; i++) keys.push("ref_video_audio_" + i);
    for (let i = 1; i <= clamp(na, LIMITS.audio); i++) keys.push("ref_audio_" + i);
    return keys;
}

function slotType(key) {
    return key.startsWith("ref_video_audio_") || key.startsWith("ref_audio_") ? "AUDIO" : "IMAGE";
}

/**
 * Aligne les sorties du noeud sur la selection, dans l'ordre de
 * layoutKeys(). Les sorties en trop sont d'abord debranchees ; pour les
 * autres, nom renomme et liens sont relus puis reecrits position par
 * position, en corrigeant l'index d'origine des liens, sans jamais
 * debrancher les noeuds en aval (debrancher retrecirait les entrees
 * Autogrow du MiniMax).
 *
 * Dans le frontend actuel, les liens d'une sortie sont deduits de la
 * liste des liens du graphe (link.origin_id / link.origin_slot) : les
 * objets sortie restent donc a leur place, on ne fait que corriger
 * origin_slot des liens et reecrire nom/type/etiquette par position.
 * Ne jamais assigner output.links (obsolete : une affectation debranche).
 */
function outputLinksOf(node, slot) {
    const graph = node.graph;
    if (!graph || !graph.links) return [];
    const all = typeof graph.links.values === "function" ? [...graph.links.values()] : Object.values(graph.links);
    return all.filter((l) => l && l.origin_id === node.id && l.origin_slot === slot);
}

function applyLayout(node, state) {
    const keys = layoutKeys(state.images.length, state.videos.length, state.audios.length);
    const same = node.outputs.length === keys.length && node.outputs.every((o, i) => o.name === keys[i]);
    if (!same) {
        for (let i = node.outputs.length - 1; i >= 0; i--) {
            if (!keys.includes(node.outputs[i].name) && node.isOutputConnected(i)) node.disconnectOutput(i);
        }
        // Instantane des sorties conservees : etiquette et objets lien.
        const saved = {};
        node.outputs.forEach((o, i) => {
            if (keys.includes(o.name)) saved[o.name] = { label: o.label, links: outputLinksOf(node, i) };
        });
        // Nouveaux index d'abord : ainsi, retirer les dernieres sorties ne
        // debranche que des positions devenues vides.
        keys.forEach((k, i) => {
            (saved[k] ? saved[k].links : []).forEach((l) => (l.origin_slot = i));
        });
        while (node.outputs.length < keys.length) node.addOutput("ref_tmp", "*");
        while (node.outputs.length > keys.length) node.removeOutput(node.outputs.length - 1);

        keys.forEach((k, i) => {
            const o = node.outputs[i];
            o.name = k;
            o.localized_name = k;
            o.label = saved[k] ? saved[k].label : undefined;
        });
    }
    node.outputs.forEach((o) => {
        o.type = slotType(o.name);
    });
    const min = node.computeSize();
    // La hauteur suit le contenu (elle rapetisse quand des sorties disparaissent).
    node.setSize([Math.max(node.size[0], MIN_WIDTH), min[1]]);
    node.setDirtyCanvas(true, true);
}

// --------------------------------------------------------------------
// Renommage des sorties (double-clic sur l'etiquette ou clic droit)
// --------------------------------------------------------------------
function outputLabelRect(node, i) {
    const slotH = (window.LiteGraph && window.LiteGraph.NODE_SLOT_HEIGHT) || 20;
    const dot = node.getConnectionPos(false, i);
    const x = node.size[0] * 0.45;
    return { x: x, y: dot[1] - node.pos[1] - slotH / 2, w: node.size[0] - x, h: slotH };
}

function hitOutputLabel(node, pos) {
    if (!node.outputs || (node.flags && node.flags.collapsed)) return -1;
    for (let i = 0; i < node.outputs.length; i++) {
        const r = outputLabelRect(node, i);
        if (pos[0] >= r.x && pos[0] <= r.x + r.w && pos[1] >= r.y && pos[1] <= r.y + r.h) return i;
    }
    return -1;
}

/** Ne change que l'etiquette affichee (jamais .name) ; vide = nom par defaut. */
function setOutputLabel(node, i, value) {
    const out = node.outputs[i];
    const trimmed = (value || "").trim();
    out.label = trimmed && trimmed !== out.name ? trimmed : undefined;
    node.setDirtyCanvas(true, true);
}

let activeOutputEditor = null;

function openOutputLabelEditor(node, i) {
    if (activeOutputEditor) activeOutputEditor.close(true);
    const out = node.outputs[i];
    const ds = app.canvas.ds;
    const scale = ds.scale || 1;
    const canvasRect = app.canvas.canvas.getBoundingClientRect();
    const r = outputLabelRect(node, i);

    const input = document.createElement("input");
    input.type = "text";
    input.value = out.label || out.name;
    input.placeholder = out.name;
    Object.assign(input.style, {
        position: "fixed",
        left: canvasRect.left + (node.pos[0] + r.x + ds.offset[0]) * scale + "px",
        top: canvasRect.top + (node.pos[1] + r.y + ds.offset[1]) * scale + "px",
        width: r.w * scale + "px",
        height: r.h * scale + "px",
        zIndex: "10000",
        background: "#1f1f1f",
        color: "#e6e6e6",
        border: Math.max(1, 2 * scale) + "px solid " + PINK,
        borderRadius: "3px",
        padding: "0 " + 6 * scale + "px",
        font: 12 * scale + "px sans-serif",
        textAlign: "right",
        outline: "none",
        boxSizing: "border-box",
    });
    document.body.appendChild(input);

    let closed = false;
    const editor = { node: node };
    // Capture au niveau window : les raccourcis du canvas (Ctrl+Z,
    // Suppr, ...) ne doivent pas partir pendant la saisie.
    const onKey = (e) => {
        if (e.target !== input) return;
        e.stopImmediatePropagation();
        if (e.key === "Enter") {
            e.preventDefault();
            editor.close(true);
        } else if (e.key === "Escape") {
            e.preventDefault();
            editor.close(false);
        }
    };
    const onBlur = () => editor.close(true);
    editor.close = (save) => {
        if (closed) return;
        closed = true;
        window.removeEventListener("keydown", onKey, true);
        input.removeEventListener("blur", onBlur);
        if (save) setOutputLabel(node, i, input.value);
        input.remove();
        if (activeOutputEditor === editor) activeOutputEditor = null;
    };
    window.addEventListener("keydown", onKey, true);
    activeOutputEditor = editor;

    // Focus differe : le double-clic en cours de propagation rendrait
    // sinon le focus au canvas, fermant le champ aussitot ouvert.
    setTimeout(() => {
        if (closed) return;
        input.focus();
        input.select();
        input.addEventListener("blur", onBlur);
    }, 0);
}

// --------------------------------------------------------------------
// Utilitaires DOM
// --------------------------------------------------------------------
/**
 * Positionne une carte flottante contre le bord droit du noeud (ou le
 * bord gauche si la place manque), sans jamais le recouvrir.
 */
function positionCardNextToNode(card, container, maxWidth) {
    const rect = container.getBoundingClientRect();
    const margin = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(maxWidth, vw - margin * 2);

    let left = rect.right + margin;
    if (left + width + margin > vw) left = rect.left - margin - width;
    left = Math.max(margin, Math.min(left, vw - width - margin));

    const height = Math.min(card.offsetHeight || 320, vh - margin * 2);
    const top = Math.max(margin, Math.min(rect.top, vh - height - margin));

    card.style.left = left + "px";
    card.style.top = top + "px";
}

function makeOverlay() {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
        position: "fixed", inset: "0", background: "transparent", zIndex: "10000", display: "none",
    });
    const card = document.createElement("div");
    Object.assign(card.style, {
        position: "fixed", background: "#1e1e1e", color: "#ddd", border: "1px solid " + BODY_COLOR,
        borderRadius: "10px", boxShadow: "0 8px 28px rgba(0,0,0,0.6)", fontFamily: "sans-serif",
        fontSize: "12px", boxSizing: "border-box",
    });
    card.addEventListener("mousedown", (e) => e.stopPropagation());
    card.addEventListener("click", (e) => e.stopPropagation());
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    return { overlay, card };
}

function makeIconButton(color, icon, title) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = icon;
    if (title) btn.title = title;
    Object.assign(btn.style, {
        flex: "0 0 auto", width: "24px", height: "24px", display: "flex", alignItems: "center",
        justifyContent: "center", background: color, border: "none", borderRadius: "4px",
        cursor: "pointer", padding: "0",
    });
    return btn;
}

function makeTextButton(text, bg) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = text;
    Object.assign(btn.style, {
        background: bg, color: "white", border: "none", borderRadius: "6px", padding: "6px 14px",
        cursor: "pointer", fontSize: "12px", fontWeight: "bold",
    });
    return btn;
}

async function apiGet(url) {
    const res = await fetch(url, { cache: "no-store" });
    let data = null;
    try {
        data = await res.json();
    } catch (e) {
        data = null;
    }
    if (!res.ok) throw new Error((data && data.error) || "HTTP error " + res.status);
    return data;
}

function joinPath(folder, name) {
    const sep = folder.includes("\\") ? "\\" : "/";
    return folder.replace(/[\\/]+$/, "") + sep + name;
}

function baseName(path) {
    return path.split(/[\\/]/).pop();
}

function samePath(a, b) {
    return a.replace(/\\/g, "/").toLowerCase() === b.replace(/\\/g, "/").toLowerCase();
}

function dirName(path) {
    const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    return i >= 0 ? path.slice(0, i) : "";
}

function formatSize(bytes) {
    if (bytes == null) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDuration(sec) {
    if (sec == null) return "";
    if (sec < 60) return sec.toFixed(1) + " s";
    const m = Math.floor(sec / 60);
    return m + ":" + String(Math.floor(sec % 60)).padStart(2, "0");
}

function hideWidget(widget) {
    if (!widget || widget.__mmref_hidden) return;
    widget.__mmref_hidden = true;
    widget.computeSize = () => [0, -4];
    // Type sentinelle : exclut vraiment le widget du dessin et du hit-testing.
    widget.type = "converted-widget";
    widget.draw = () => {};
    widget.onDrawBackground = () => {};
}

// --------------------------------------------------------------------
// Fenetre d'aide
// --------------------------------------------------------------------
function buildHelpOverlay(container) {
    const { overlay, card } = makeOverlay();
    card.style.width = "min(520px, 92vw)";
    card.style.maxHeight = "80vh";
    card.style.overflowX = "hidden";
    card.style.overflowY = "auto";
    card.style.padding = "14px 18px";
    let html = '<div style="font-size:14px;font-weight:bold;color:' + TITLE_COLOR +
        ';margin-bottom:8px">MiniMax H3 Reference Loader</div>';
    for (const s of HELP_SECTIONS) {
        html += '<div style="font-weight:bold;color:' + PINK + ';margin:10px 0 4px">' + s.title +
            '</div><div style="line-height:1.5">' + s.html + "</div>";
    }
    card.innerHTML = html;
    overlay.addEventListener("mousedown", () => (overlay.style.display = "none"));
    return {
        open() {
            overlay.style.display = "block";
            positionCardNextToNode(card, container, 520);
        },
        remove() {
            overlay.remove();
        },
    };
}

// --------------------------------------------------------------------
// Galerie de selection (une seule fenetre, reutilisee pour les 3 types)
// --------------------------------------------------------------------
function buildGallery(container, ctx) {
    const { overlay, card } = makeOverlay();
    Object.assign(card.style, {
        width: "min(720px, 92vw)", height: "min(560px, 82vh)", display: "flex",
        flexDirection: "column", overflow: "hidden", borderColor: PINK,
    });

    let kind = "image";
    let defaultSound = false;
    let files = [];

    // En-tete : titre, compteur, fermeture.
    const header = document.createElement("div");
    Object.assign(header.style, {
        display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px",
        borderBottom: "1px solid #333",
    });
    const title = document.createElement("div");
    Object.assign(title.style, { fontWeight: "bold", fontSize: "13px", color: TITLE_COLOR, flex: "1" });
    const counter = document.createElement("div");
    counter.style.color = "#bbb";
    const closeBtn = makeIconButton(INACTIVE_BG, CLOSE_ICON, "Close");
    header.append(title, counter, closeBtn);

    // Dossier : champ, Browse, actualiser.
    const folderRow = document.createElement("div");
    Object.assign(folderRow.style, { display: "flex", gap: "6px", padding: "8px 12px", alignItems: "center" });
    const folderInput = document.createElement("input");
    folderInput.type = "text";
    folderInput.placeholder = "Folder path - type, paste, or Browse";
    Object.assign(folderInput.style, {
        flex: "1", minWidth: "0", background: "#111", color: "#ddd", border: "1px solid #0c3833",
        borderRadius: "10px", padding: "5px 10px", fontSize: "12px", outline: "none", boxSizing: "border-box",
    });
    const browseBtn = makeIconButton(VIOLET, FOLDER_ICON, "Browse");
    const refreshBtn = makeIconButton(INACTIVE_BG, REFRESH_ICON, "Reload the folder");
    folderRow.append(folderInput, browseBtn, refreshBtn);

    const status = document.createElement("div");
    Object.assign(status.style, { padding: "0 12px 6px", color: "#999", minHeight: "14px" });

    // Grille de miniatures.
    const grid = document.createElement("div");
    Object.assign(grid.style, {
        flex: "1", overflowX: "hidden", overflowY: "auto", padding: "4px 12px 10px",
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))",
        gap: "8px", alignContent: "start",
    });

    // Pied : vider, terminer.
    const footer = document.createElement("div");
    Object.assign(footer.style, {
        display: "flex", gap: "8px", padding: "10px 12px", borderTop: "1px solid #333", alignItems: "center",
    });
    const clearBtn = makeTextButton("Clear", DARK_RED);
    const footerInfo = document.createElement("div");
    Object.assign(footerInfo.style, { flex: "1", color: "#999" });
    const doneBtn = makeTextButton("Done", PINK);
    footer.append(clearBtn, footerInfo, doneBtn);

    card.append(header, folderRow, status, grid, footer);

    // ------ Selection ------
    // getState() renvoie une copie neuve a chaque appel : toujours modifier
    // la liste de l'objet s que l'on renvoie ensuite a setState().
    function list(s) {
        s = s || ctx.getState();
        return kind === "image" ? s.images : kind === "audio" ? s.audios : s.videos;
    }
    const pathOf = (item) => (kind === "video" ? item.file : item);
    const indexOf = (path, s) => list(s).findIndex((it) => samePath(pathOf(it), path));

    function toggle(path) {
        const s = ctx.getState();
        const arr = list(s);
        const idx = indexOf(path, s);
        if (idx >= 0) arr.splice(idx, 1);
        else if (arr.length < LIMITS[kind]) arr.push(kind === "video" ? { file: path, sound: defaultSound } : path);
        else return;
        ctx.setState(s);
        render();
    }

    function toggleSound(path) {
        const s = ctx.getState();
        const item = s.videos[indexOf(path, s)];
        if (!item) return;
        item.sound = !item.sound;
        ctx.setState(s);
        render();
    }

    // ------ Affichage ------
    function updateCounters() {
        const arr = list();
        let text = arr.length + " / " + LIMITS[kind] + " selected";
        if (kind === "video") text += " · " + arr.filter((v) => v.sound).length + " 🔊";
        counter.textContent = text;
        const folder = folderInput.value.trim();
        const elsewhere = folder ? arr.filter((it) => !files.some((f) => samePath(joinPath(folder, f.name), pathOf(it)))).length : arr.length;
        footerInfo.textContent = elsewhere ? "+" + elsewhere + " selected in another folder" : "";
    }

    function render() {
        updateCounters();
        grid.innerHTML = "";
        const folder = folderInput.value.trim();
        const full = list().length >= LIMITS[kind];
        for (const f of files) {
            const path = joinPath(folder, f.name);
            const idx = indexOf(path);
            const selected = idx >= 0;

            const tile = document.createElement("div");
            tile.title = f.name;
            Object.assign(tile.style, {
                position: "relative", background: "#151515", borderRadius: "6px", overflow: "hidden",
                cursor: selected || !full ? "pointer" : "not-allowed",
                border: "2px solid " + (selected ? PINK : "#2c2c2c"),
                opacity: selected || !full ? "1" : "0.35",
            });

            const thumb = document.createElement("div");
            Object.assign(thumb.style, {
                height: "84px", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0d0d",
            });
            if (kind === "audio") {
                thumb.innerHTML = svg(
                    '<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle>' +
                    '<circle cx="18" cy="16" r="3"></circle>', 34);
                thumb.style.opacity = "0.7";
            } else {
                const img = document.createElement("img");
                img.loading = "lazy";
                img.src = "/mmrefloader/thumb?path=" + encodeURIComponent(folder) + "&file=" +
                    encodeURIComponent(f.name) + "&mt=" + Math.floor(f.mtime || 0);
                Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover", display: "block" });
                thumb.appendChild(img);
            }

            const name = document.createElement("div");
            name.textContent = f.name;
            Object.assign(name.style, {
                padding: "3px 5px", fontSize: "10px", whiteSpace: "nowrap", overflow: "hidden",
                textOverflow: "ellipsis", color: selected ? "#fff" : "#bbb",
            });
            tile.append(thumb, name);

            if (f.duration != null) {
                const dur = document.createElement("div");
                dur.textContent = formatDuration(f.duration);
                Object.assign(dur.style, {
                    position: "absolute", right: "4px", bottom: "22px", background: "rgba(0,0,0,0.7)",
                    padding: "1px 5px", borderRadius: "4px", fontSize: "10px",
                });
                tile.appendChild(dur);
            }

            if (selected) {
                const badge = document.createElement("div");
                badge.textContent = String(idx + 1);
                Object.assign(badge.style, {
                    position: "absolute", left: "4px", top: "4px", minWidth: "20px", height: "20px",
                    borderRadius: "10px", background: PINK, color: "white", fontWeight: "bold",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px",
                    boxShadow: "0 0 6px rgba(211,95,168,0.8)",
                });
                tile.appendChild(badge);

                if (kind === "video") {
                    const on = list()[idx].sound;
                    const snd = makeIconButton(on ? GREEN : INACTIVE_BG, on ? SPEAKER_ICON : MUTE_ICON,
                        on ? "Soundtrack kept (click to mute)" : "Muted (click to keep the soundtrack)");
                    Object.assign(snd.style, { position: "absolute", right: "4px", top: "4px" });
                    snd.addEventListener("click", (e) => {
                        e.stopPropagation();
                        toggleSound(path);
                    });
                    tile.appendChild(snd);
                }
            }

            tile.addEventListener("click", () => toggle(path));
            grid.appendChild(tile);
        }
    }

    async function loadFolder() {
        const folder = folderInput.value.trim();
        const s = ctx.getState();
        if (s.folders[kind] !== folder) {
            s.folders[kind] = folder;
            ctx.setState(s);
        }
        files = [];
        if (!folder) {
            status.textContent = "Set a folder first (type, paste, or Browse).";
            render();
            return;
        }
        status.textContent = "Loading...";
        render();
        try {
            const data = await apiGet("/mmrefloader/list?path=" + encodeURIComponent(folder) + "&kind=" + kind);
            files = data.files || [];
            status.textContent = files.length ? files.length + " file(s)" : "No " + kind + " file in this folder.";
        } catch (e) {
            status.textContent = e.message;
        }
        render();
    }

    async function browse() {
        const prev = browseBtn.innerHTML;
        browseBtn.disabled = true;
        status.textContent = "Opening the folder dialog...";
        try {
            const data = await apiGet("/mmrefloader/browse_dir?initial=" + encodeURIComponent(folderInput.value.trim()));
            if (data.path) {
                folderInput.value = data.path;
                await loadFolder();
            } else {
                status.textContent = "";
            }
        } catch (e) {
            status.textContent = e.message;
        } finally {
            browseBtn.disabled = false;
            browseBtn.innerHTML = prev;
        }
    }

    // Clavier : tant que la galerie est ouverte, les touches tapees dans le
    // champ dossier ne doivent pas atteindre le canvas (Suppr supprimerait
    // le noeud) ; Entree charge le dossier, Echap ferme.
    const onKey = (e) => {
        if (overlay.style.display === "none") return;
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopImmediatePropagation();
            close();
            return;
        }
        if (e.target === folderInput) {
            e.stopImmediatePropagation();
            if (e.key === "Enter") {
                e.preventDefault();
                loadFolder();
            }
        }
    };

    function close() {
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
    }

    closeBtn.addEventListener("click", close);
    doneBtn.addEventListener("click", close);
    overlay.addEventListener("mousedown", close);
    browseBtn.addEventListener("click", browse);
    refreshBtn.addEventListener("click", loadFolder);
    clearBtn.addEventListener("click", () => {
        const s = ctx.getState();
        if (kind === "image") s.images = [];
        else if (kind === "audio") s.audios = [];
        else s.videos = [];
        ctx.setState(s);
        render();
    });

    return {
        open(newKind, sound) {
            kind = newKind;
            defaultSound = !!sound;
            title.textContent = KIND_TITLES[kind] + (kind === "video"
                ? (defaultSound ? " — new picks keep their sound" : " — new picks are muted")
                : "");
            // Sans dossier pour ce type, la galerie demarre sur le dossier racine.
            const st = ctx.getState();
            folderInput.value = st.folders[kind] || st.root || "";
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            positionCardNextToNode(card, container, 720);
            loadFolder();
        },
        close,
        remove() {
            close();
            overlay.remove();
        },
    };
}

function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --------------------------------------------------------------------
// Fenetre de confirmation (suppression, vidage d'une liste)
// --------------------------------------------------------------------
/**
 * Petite fenetre flottante : message, Cancel, bouton de confirmation
 * rouge. ask(html, label, onConfirm, anchor) la centre sur l'element
 * anchor (ex. la fenetre de selection), ou la place a cote du noeud sans
 * anchor. Echap, Cancel ou un clic a cote annulent.
 */
function buildConfirmDialog(container) {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
        position: "fixed", inset: "0", background: "transparent", zIndex: "10001", display: "none",
    });
    const card = document.createElement("div");
    Object.assign(card.style, {
        position: "fixed", width: "min(360px, 90vw)", background: "#1e1e1e", color: "#ddd",
        border: "1px solid " + MARK_RED, borderRadius: "10px", boxShadow: "0 8px 28px rgba(0,0,0,0.7)",
        padding: "14px 16px", fontFamily: "sans-serif", fontSize: "12px", boxSizing: "border-box",
    });
    const text = document.createElement("div");
    text.style.lineHeight = "1.5";
    const btns = document.createElement("div");
    Object.assign(btns.style, { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "14px" });
    const cancelBtn = makeTextButton("Cancel", INACTIVE_BG);
    const okBtn = makeTextButton("Delete", MARK_RED);
    btns.append(cancelBtn, okBtn);
    card.append(text, btns);
    card.addEventListener("mousedown", (e) => e.stopPropagation());
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    let onConfirm = null;
    const isOpen = () => overlay.style.display !== "none";

    const onKey = (e) => {
        if (!isOpen() || e.key !== "Escape") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
    };

    function close() {
        overlay.style.display = "none";
        onConfirm = null;
        window.removeEventListener("keydown", onKey, true);
    }

    function ask(html, label, callback, anchor) {
        text.innerHTML = html;
        okBtn.textContent = label;
        onConfirm = callback;
        overlay.style.display = "block";
        window.addEventListener("keydown", onKey, true);
        if (anchor) {
            let r = anchor.getBoundingClientRect();
            // Element pas encore mesurable : centrer sur l'ecran.
            if (!r.width) r = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
            card.style.left = Math.max(8, r.left + (r.width - card.offsetWidth) / 2) + "px";
            card.style.top = Math.max(8, r.top + (r.height - card.offsetHeight) / 2) + "px";
        } else {
            positionCardNextToNode(card, container, 360);
        }
    }

    cancelBtn.addEventListener("click", close);
    overlay.addEventListener("mousedown", close);
    okBtn.addEventListener("click", () => {
        const cb = onConfirm;
        close();
        if (cb) cb();
    });

    return {
        ask,
        close,
        isOpen,
        remove() {
            close();
            overlay.remove();
        },
    };
}

// --------------------------------------------------------------------
// Fenetre du dossier racine (roue crantee)
// --------------------------------------------------------------------
/**
 * Dossier racine des rushs : les galeries sans dossier propre demarrent
 * dessus, et le fichier de configuration y ecrit les chemins en relatif.
 * Entree ou Done enregistre ; Echap ou clic a cote ferment sans changer.
 */
function buildRootDialog(container, ctx) {
    const { overlay, card } = makeOverlay();
    Object.assign(card.style, { width: "min(460px, 92vw)", padding: "12px 14px", borderColor: VIOLET });

    const title = document.createElement("div");
    title.textContent = "Root folder of the rushes";
    Object.assign(title.style, { fontWeight: "bold", fontSize: "13px", color: TITLE_COLOR, marginBottom: "6px" });
    const hint = document.createElement("div");
    hint.textContent = "Galleries without their own folder open here; the saved configuration " +
        "stores the paths under it relative to it.";
    Object.assign(hint.style, { color: "#999", marginBottom: "10px", lineHeight: "1.4" });

    const row = document.createElement("div");
    Object.assign(row.style, { display: "flex", gap: "6px", alignItems: "center" });
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Folder path - type, paste, or Browse";
    Object.assign(input.style, {
        flex: "1", minWidth: "0", background: "#111", color: "#ddd", border: "1px solid #0c3833",
        borderRadius: "10px", padding: "5px 10px", fontSize: "12px", outline: "none", boxSizing: "border-box",
    });
    const browseBtn = makeIconButton(VIOLET, FOLDER_ICON, "Browse");
    const clearBtn = makeIconButton(MARK_RED, TRASH_ICON, "Clear the root folder");
    row.append(input, browseBtn, clearBtn);

    const status = document.createElement("div");
    Object.assign(status.style, { color: "#999", minHeight: "14px", margin: "6px 0 0" });

    const footer = document.createElement("div");
    Object.assign(footer.style, { display: "flex", justifyContent: "flex-end", marginTop: "10px" });
    const doneBtn = makeTextButton("Done", PINK);
    footer.appendChild(doneBtn);

    card.append(title, hint, row, status, footer);

    function save() {
        const s = ctx.getState();
        const value = input.value.trim();
        if (s.root !== value) {
            s.root = value;
            ctx.setState(s);
        }
        close();
    }

    async function browse() {
        browseBtn.disabled = true;
        status.textContent = "Opening the folder dialog...";
        try {
            const data = await apiGet("/mmrefloader/browse_dir?initial=" + encodeURIComponent(input.value.trim()));
            if (data.path) input.value = data.path;
            status.textContent = "";
        } catch (e) {
            status.textContent = e.message;
        } finally {
            browseBtn.disabled = false;
        }
    }

    // Les touches tapees dans le champ ne doivent pas atteindre le canvas.
    const onKey = (e) => {
        if (overlay.style.display === "none") return;
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopImmediatePropagation();
            close();
            return;
        }
        if (e.target === input) {
            e.stopImmediatePropagation();
            if (e.key === "Enter") {
                e.preventDefault();
                save();
            }
        }
    };

    function close() {
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
    }

    browseBtn.addEventListener("click", browse);
    clearBtn.addEventListener("click", () => {
        input.value = "";
        input.focus();
    });
    doneBtn.addEventListener("click", save);
    overlay.addEventListener("mousedown", close);

    return {
        open() {
            input.value = ctx.getState().root || "";
            status.textContent = "";
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            positionCardNextToNode(card, container, 460);
            setTimeout(() => input.focus(), 0);
        },
        close,
        remove() {
            close();
            overlay.remove();
        },
    };
}

// --------------------------------------------------------------------
// Fenetre de la selection : ordre, reorganisation et infos d'un fichier
// --------------------------------------------------------------------
const VIEWER_TITLES = { image: "Selected images", video: "Selected videos", audio: "Selected audio" };
const OUTPUT_PREFIX = { image: "ref_image_", video: "ref_video_", audio: "ref_audio_" };

function buildSelectionViewer(container, ctx) {
    const { overlay, card } = makeOverlay();
    Object.assign(card.style, {
        width: "min(720px, 92vw)", height: "min(620px, 86vh)", display: "flex",
        flexDirection: "column", overflow: "hidden", borderColor: VIOLET,
    });

    let kind = "image";
    let current = null; // chemin du fichier affiche dans l'encadre

    const header = document.createElement("div");
    Object.assign(header.style, {
        display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderBottom: "1px solid #333",
    });
    const title = document.createElement("div");
    Object.assign(title.style, { fontWeight: "bold", fontSize: "13px", color: TITLE_COLOR, flex: "1" });
    const counter = document.createElement("div");
    counter.style.color = "#bbb";
    const closeBtn = makeIconButton(INACTIVE_BG, CLOSE_ICON, "Close");
    header.append(title, counter, closeBtn);

    const grid = document.createElement("div");
    Object.assign(grid.style, {
        flex: "1", overflowX: "hidden", overflowY: "auto", padding: "10px 12px",
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))",
        gap: "8px", alignContent: "start",
    });

    // Encadre d'infos : apercu a gauche, details a droite.
    const infoBox = document.createElement("div");
    Object.assign(infoBox.style, {
        flex: "0 0 190px", margin: "0 12px", border: "1px solid " + VIOLET, borderRadius: "8px",
        background: "#161616", display: "flex", gap: "12px", padding: "8px", boxSizing: "border-box",
        overflow: "hidden",
    });
    const preview = document.createElement("div");
    Object.assign(preview.style, {
        flex: "0 0 260px", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#0d0d0d", borderRadius: "6px", overflow: "hidden",
    });
    const details = document.createElement("div");
    Object.assign(details.style, {
        flex: "1", minWidth: "0", overflowX: "hidden", overflowY: "auto", lineHeight: "1.6",
    });
    infoBox.append(preview, details);

    const footer = document.createElement("div");
    Object.assign(footer.style, {
        display: "flex", justifyContent: "flex-end", padding: "10px 12px",
    });
    footer.style.gap = "8px";
    const deleteBtn = makeTextButton("Delete", MARK_RED);
    const doneBtn = makeTextButton("Done", PINK);
    footer.append(deleteBtn, doneBtn);

    card.append(header, grid, infoBox, footer);

    // ------ Marquage pour suppression ------
    // Cles normalisees (casse, separateurs) des fichiers marques "a supprimer".
    const marked = new Set();
    const markKey = (p) => p.replace(/\\/g, "/").toLowerCase();

    function toggleMark(path) {
        const k = markKey(path);
        if (marked.has(k)) marked.delete(k);
        else marked.add(k);
        render();
    }

    function updateDeleteBtn() {
        const n = marked.size;
        deleteBtn.textContent = n ? "Delete (" + n + ")" : "Delete";
        deleteBtn.disabled = !n;
        deleteBtn.style.background = n ? MARK_RED : INACTIVE_BG;
        deleteBtn.style.color = n ? "white" : INACTIVE_FG;
        deleteBtn.style.cursor = n ? "pointer" : "default";
    }

    /**
     * Retire les fichiers marques. Les suivants remontent (la ref 4 devient
     * la ref 3...) : comme les liens restent sur les sorties, chaque sortie
     * recoit simplement le fichier qui porte desormais son numero, et la
     * derniere sortie devenue vide est retiree par applyLayout() (une
     * sortie de base par type reste toujours presente).
     */
    function deleteMarked() {
        const s = ctx.getState();
        const arr = list(s);
        const kept = arr.filter((it) => !marked.has(markKey(pathOf(it))));
        arr.splice(0, arr.length, ...kept);
        marked.clear();
        ctx.setState(s);
        render();
    }

    // Confirmation centree sur la fenetre de selection.
    const confirm = buildConfirmDialog(container);
    const confirmOpen = () => confirm.isOpen();
    const closeConfirm = () => confirm.close();

    function askDelete() {
        if (!marked.size) return;
        const arr = list();
        const numbers = arr
            .map((it, i) => (marked.has(markKey(pathOf(it))) ? i + 1 : null))
            .filter((v) => v !== null);
        const prefix = OUTPUT_PREFIX[kind];
        confirm.ask(
            "<b>Delete " + numbers.length + " reference" + (numbers.length > 1 ? "s" : "") + "?</b><br>" +
            numbers.map((n) => prefix + n + " : " + escapeHtml(baseName(pathOf(arr[n - 1])))).join("<br>") +
            '<div style="color:#999;margin-top:8px">The following references move up and the last ' +
            "output that becomes empty is removed.</div>",
            "Delete", deleteMarked, card);
    }

    deleteBtn.addEventListener("click", askDelete);

    function list(s) {
        s = s || ctx.getState();
        return kind === "image" ? s.images : kind === "audio" ? s.audios : s.videos;
    }
    const pathOf = (item) => (kind === "video" ? item.file : item);

    /**
     * Deplace l'element i d'une place (delta = -1 ou +1). L'element n de la
     * liste sort toujours sur la sortie n : les liens restant sur les
     * sorties, c'est le contenu qui change de sortie. Une video garde son
     * reglage de son (il fait partie de l'element deplace).
     */
    function move(i, delta) {
        const s = ctx.getState();
        const arr = list(s);
        const j = i + delta;
        if (j < 0 || j >= arr.length) return;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        ctx.setState(s);
        render();
    }

    function arrowButton(icon, enabled, onClick, tip) {
        const b = makeIconButton(enabled ? INACTIVE_BG : "#1a1a1a", icon, tip);
        b.disabled = !enabled;
        Object.assign(b.style, {
            width: "26px", height: "20px", cursor: enabled ? "pointer" : "default",
            opacity: enabled ? "1" : "0.3", border: "1px solid " + (enabled ? "#444" : "#262626"),
        });
        if (enabled) {
            b.addEventListener("click", (e) => {
                e.stopPropagation();
                onClick();
            });
        }
        return b;
    }

    function render() {
        const arr = list();
        counter.textContent = arr.length + " / " + LIMITS[kind];
        grid.innerHTML = "";
        if (!arr.length) {
            const empty = document.createElement("div");
            empty.textContent = "Nothing selected yet: use the button of the node to pick files.";
            Object.assign(empty.style, { color: "#999", gridColumn: "1 / -1", padding: "20px 0" });
            grid.appendChild(empty);
        }
        if (current && !arr.some((it) => samePath(pathOf(it), current))) current = null;
        // Oublier les marques de fichiers qui ne sont plus dans la selection.
        const present = new Set(arr.map((it) => markKey(pathOf(it))));
        [...marked].forEach((k) => {
            if (!present.has(k)) marked.delete(k);
        });
        updateDeleteBtn();

        arr.forEach((item, i) => {
            const path = pathOf(item);
            const active = current && samePath(path, current);
            const isMarked = marked.has(markKey(path));

            const tile = document.createElement("div");
            tile.title = path;
            Object.assign(tile.style, {
                position: "relative", background: "#151515", borderRadius: "6px", overflow: "hidden",
                cursor: "pointer", border: "2px solid " + (isMarked ? MARK_RED : active ? VIOLET : PINK),
                boxShadow: active ? "0 0 8px rgba(106,95,211,0.8)" : "none",
            });

            const thumb = document.createElement("div");
            Object.assign(thumb.style, {
                height: "80px", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0d0d",
            });
            if (kind === "audio") {
                thumb.innerHTML = AUDIO_ICON.replace(/width="15" height="15"/, 'width="32" height="32"');
                thumb.style.opacity = "0.7";
            } else {
                const img = document.createElement("img");
                img.loading = "lazy";
                img.src = "/mmrefloader/thumb?path=" + encodeURIComponent(dirName(path)) +
                    "&file=" + encodeURIComponent(baseName(path));
                Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover", display: "block" });
                thumb.appendChild(img);
            }

            const badge = document.createElement("div");
            badge.textContent = String(i + 1);
            Object.assign(badge.style, {
                position: "absolute", left: "4px", top: "4px", minWidth: "20px", height: "20px",
                borderRadius: "10px", background: PINK, color: "white", fontWeight: "bold",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px",
                boxShadow: "0 0 6px rgba(211,95,168,0.8)",
            });

            const name = document.createElement("div");
            name.textContent = baseName(path);
            Object.assign(name.style, {
                padding: "3px 5px 0", fontSize: "10px", whiteSpace: "nowrap", overflow: "hidden",
                textOverflow: "ellipsis", color: "#fff",
            });
            const out = document.createElement("div");
            out.textContent = "→ " + OUTPUT_PREFIX[kind] + (i + 1) +
                (kind === "video" ? (item.sound ? "  🔊" : "  (muted)") : "");
            Object.assign(out.style, { padding: "0 5px", fontSize: "10px", color: "#9fd6cf" });

            // Fleches : la premiere vignette n'a que ▶ actif, la derniere que ◀.
            const arrows = document.createElement("div");
            Object.assign(arrows.style, { display: "flex", justifyContent: "center", gap: "8px", padding: "4px 0 6px" });
            arrows.append(
                arrowButton(LEFT_ICON, i > 0, () => move(i, -1), "Move before"),
                arrowButton(RIGHT_ICON, i < arr.length - 1, () => move(i, +1), "Move after"),
            );

            // Poubelle en haut a droite : grise, rouge quand la vignette est marquee.
            const bin = makeIconButton(isMarked ? MARK_RED : INACTIVE_BG, TRASH_ICON,
                isMarked ? "Marked for deletion (click to unmark)" : "Mark for deletion");
            Object.assign(bin.style, {
                position: "absolute", right: "4px", top: "4px", width: "22px", height: "22px",
                opacity: isMarked ? "1" : "0.75", boxShadow: isMarked ? "0 0 6px rgba(211,47,47,0.9)" : "none",
            });
            bin.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleMark(path);
            });
            if (isMarked) thumb.style.opacity = "0.45";

            tile.append(thumb, badge, bin, name, out, arrows);
            tile.addEventListener("click", () => showInfo(path));
            grid.appendChild(tile);
        });

        if (!current) clearInfo();
    }

    function clearInfo() {
        preview.innerHTML = "";
        details.innerHTML = '<span style="color:#888">Click a thumbnail to see its details.</span>';
    }

    function row(label, value) {
        if (value == null || value === "") return "";
        const safe = String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");
        return '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' +
            safe.replace(/"/g, "&quot;") + '"><span style="color:' + PINK + '">' + label +
            "</span> " + safe + "</div>";
    }

    async function showInfo(path) {
        current = path;
        render();
        const url = "/mmrefloader/media?file=" + encodeURIComponent(path);
        preview.innerHTML = "";
        let el;
        if (kind === "image") {
            el = document.createElement("img");
            el.src = url;
        } else {
            el = document.createElement(kind === "video" ? "video" : "audio");
            el.src = url;
            el.controls = true;
            el.preload = "metadata";
        }
        Object.assign(el.style, kind === "audio"
            ? { width: "95%" }
            : { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" });
        preview.appendChild(el);

        details.innerHTML = '<span style="color:#888">Loading...</span>';
        try {
            const info = await apiGet("/mmrefloader/info?file=" + encodeURIComponent(path));
            if (current !== path) return;
            const idx = list().findIndex((it) => samePath(pathOf(it), path));
            details.innerHTML =
                row("Number:", idx + 1 + "  →  " + OUTPUT_PREFIX[kind] + (idx + 1)) +
                row("File:", info.name) +
                row("Folder:", info.folder) +
                (info.width ? row("Size:", info.width + " × " + info.height + " px") : "") +
                row("Weight:", formatSize(info.size)) +
                row("Duration:", info.duration != null ? formatDuration(info.duration) : "") +
                row("Frame rate:", info.fps ? info.fps.toFixed(2) + " fps" : "") +
                (kind === "video" ? row("Soundtrack:", info.has_audio ? "yes" : "none in the file") : "") +
                row("Audio:", info.sample_rate ? info.sample_rate + " Hz, " + info.channels + " ch" : "");
        } catch (e) {
            if (current === path) details.textContent = e.message;
        }
    }

    const onKey = (e) => {
        if (overlay.style.display === "none" || e.key !== "Escape") return;
        if (confirmOpen()) {
            // Echap ferme d'abord la confirmation, pas la fenetre.
            e.preventDefault();
            e.stopImmediatePropagation();
            closeConfirm();
            return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
    };

    function close() {
        closeConfirm();
        overlay.style.display = "none";
        preview.innerHTML = ""; // arrete une lecture video/audio en cours
        window.removeEventListener("keydown", onKey, true);
    }

    closeBtn.addEventListener("click", close);
    doneBtn.addEventListener("click", close);
    overlay.addEventListener("mousedown", close);

    return {
        open(newKind) {
            kind = newKind;
            current = null;
            marked.clear();
            title.textContent = VIEWER_TITLES[kind];
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            render();
            positionCardNextToNode(card, container, 720);
        },
        close,
        remove() {
            close();
            overlay.remove();
            confirm.remove();
        },
    };
}

// --------------------------------------------------------------------
// Extension
// --------------------------------------------------------------------
app.registerExtension({
    name: "ComfyUI.MiniMaxRefLoader",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;
            node.color = TITLE_COLOR;
            node.bgcolor = BODY_COLOR;

            const stateWidget = node.widgets.find((w) => w.name === "state");
            hideWidget(stateWidget);

            const getState = () => parseState(stateWidget.value);
            // Message temporaire du resume (ex. fichiers manquants apres un
            // Upload) : efface au prochain changement de la selection.
            let notice = "";
            let noticeTitle = "";
            const setState = (s) => {
                notice = "";
                noticeTitle = "";
                stateWidget.value = JSON.stringify(s);
                refresh();
            };

            // ---- Interface ----
            const container = document.createElement("div");
            Object.assign(container.style, {
                display: "flex", flexDirection: "column", gap: "6px", padding: "6px 8px",
                boxSizing: "border-box", width: "100%", fontFamily: "sans-serif", fontSize: "12px",
            });

            const rows = {};
            for (const b of BUTTONS) {
                const row = document.createElement("div");
                Object.assign(row.style, { display: "flex", gap: "6px", alignItems: "center", flex: "0 0 auto" });

                const btn = document.createElement("button");
                btn.type = "button";
                Object.assign(btn.style, {
                    flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "8px",
                    background: INACTIVE_BG, color: "#ddd", border: "1px solid #0c3833",
                    borderRadius: "8px", padding: "4px 8px 4px 4px", cursor: "pointer", height: "32px",
                    textAlign: "left",
                });
                const icon = document.createElement("span");
                icon.innerHTML = b.icon;
                Object.assign(icon.style, {
                    display: "flex", alignItems: "center", justifyContent: "center", minWidth: "24px",
                    height: "24px", padding: "0 3px", borderRadius: "5px", background: b.color, flex: "0 0 auto",
                    boxSizing: "border-box",
                });
                const label = document.createElement("span");
                label.textContent = b.label;
                Object.assign(label.style, { fontWeight: "bold", flex: "0 0 auto" });
                const count = document.createElement("span");
                Object.assign(count.style, {
                    flex: "1", textAlign: "right", color: INACTIVE_FG, whiteSpace: "nowrap",
                    overflow: "hidden", textOverflow: "ellipsis",
                });
                btn.append(icon, label, count);
                btn.addEventListener("click", () => gallery.open(b.kind, b.sound));
                row.appendChild(btn);

                // Oeil : fenetre de la selection (ordre, infos, reorganisation).
                const eye = makeIconButton(VIOLET, EYE_ICON, "View and reorder the selection");
                eye.addEventListener("click", () => viewer.open(b.kind));
                row.appendChild(eye);

                // Poubelle : vide le type (Video/Audio : coupe le son de toutes les videos).
                const trash = makeIconButton(INACTIVE_BG, TRASH_ICON,
                    b.id === "video_audio" ? "Mute all videos" : "Clear the " + b.label.toLowerCase() + " selection");
                // Confirmation avant d'agir ; rien a faire = pas de question.
                trash.addEventListener("click", () => {
                    const s0 = getState();
                    let count, html, label;
                    if (b.id === "video_audio") {
                        count = s0.videos.filter((v) => v.sound).length;
                        html = "<b>Mute all videos?</b><br>" + count + " video" + (count > 1 ? "s" : "") +
                            " will lose " + (count > 1 ? "their" : "its") + " soundtrack " +
                            '(the videos stay selected).<div style="color:#999;margin-top:8px">' +
                            "The ref_video_audio outputs become empty.</div>";
                        label = "Mute all";
                    } else {
                        const items = b.id === "image" ? s0.images : b.id === "video" ? s0.videos : s0.audios;
                        count = items.length;
                        html = "<b>Delete all " + count + " " + b.kind + " reference" +
                            (count > 1 ? "s" : "") + "?</b><br>" +
                            items.map((it, i) => i + 1 + ". " + escapeHtml(baseName(it.file || it))).join("<br>") +
                            '<div style="color:#999;margin-top:8px">Only the first ' +
                            b.kind + " output stays, empty.</div>";
                        label = "Delete all";
                    }
                    if (!count) return;
                    clearConfirm.ask(html, label, () => {
                        const s = getState();
                        if (b.id === "image") s.images = [];
                        else if (b.id === "video") s.videos = [];
                        else if (b.id === "video_audio") s.videos.forEach((v) => (v.sound = false));
                        else s.audios = [];
                        setState(s);
                    });
                });
                row.appendChild(trash);

                container.appendChild(row);
                rows[b.id] = { btn, count, trash };
            }

            const bottom = document.createElement("div");
            Object.assign(bottom.style, { display: "flex", alignItems: "center", gap: "6px", flex: "0 0 auto" });
            const summary = document.createElement("div");
            Object.assign(summary.style, {
                flex: "1", color: "#9fd6cf", fontSize: "11px", whiteSpace: "nowrap", overflow: "hidden",
                textOverflow: "ellipsis",
            });
            const helpBtn = document.createElement("button");
            helpBtn.type = "button";
            helpBtn.textContent = "?";
            Object.assign(helpBtn.style, {
                width: "22px", height: "22px", borderRadius: "50%", border: "none", background: PINK,
                color: "white", fontWeight: "bold", cursor: "pointer", padding: "0", flex: "0 0 auto",
            });
            // Dossier racine, sauvegarde et chargement de la configuration.
            const rootBtn = makeIconButton(VIOLET, GEAR_ICON, "Root folder of the rushes");
            const downloadBtn = makeIconButton(PINK, DOWNLOAD_ICON, "Save the configuration (.txt)");
            const uploadBtn = makeIconButton(GREEN, UPLOAD_ICON, "Load a configuration (.txt)");
            [rootBtn, downloadBtn, uploadBtn].forEach((b) => {
                b.style.width = "22px";
                b.style.height = "22px";
            });
            const fileInput = document.createElement("input");
            fileInput.type = "file";
            fileInput.accept = ".txt,text/plain";
            fileInput.style.display = "none";

            bottom.append(summary, rootBtn, downloadBtn, uploadBtn, helpBtn, fileInput);
            container.appendChild(bottom);

            const gallery = buildGallery(container, { getState, setState });
            const viewer = buildSelectionViewer(container, { getState, setState });
            const clearConfirm = buildConfirmDialog(container);
            const rootDialog = buildRootDialog(container, { getState, setState });
            const help = buildHelpOverlay(container);
            helpBtn.addEventListener("click", () => help.open());
            rootBtn.addEventListener("click", () => rootDialog.open());
            node.__mmrefOverlays = [gallery, viewer, clearConfirm, rootDialog, help];

            const hasConfig = (s) => !!(s.root || s.images.length || s.videos.length || s.audios.length);

            // Download : fichier texte genere dans le navigateur.
            downloadBtn.addEventListener("click", () => {
                const blob = new Blob([formatConfig(getState())], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "minimax_ref_config.txt";
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            });

            // Upload : confirmation seulement s'il y a deja une configuration.
            uploadBtn.addEventListener("click", () => {
                const s = getState();
                if (!hasConfig(s)) {
                    fileInput.click();
                    return;
                }
                const n = s.images.length + s.videos.length + s.audios.length;
                clearConfirm.ask(
                    "<b>Overwrite the current configuration?</b><br>Loading a file replaces the root " +
                    "folder and all the references (" + n + " now)." +
                    '<div style="color:#999;margin-top:8px">Save it first with the download button ' +
                    "if you want to keep it.</div>",
                    "Overwrite", () => fileInput.click());
            });

            fileInput.addEventListener("change", () => {
                const file = fileInput.files && fileInput.files[0];
                fileInput.value = "";
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async () => {
                    let conf;
                    try {
                        conf = parseConfig(String(reader.result || ""));
                    } catch (e) {
                        notice = "⚠ " + e.message;
                        refresh();
                        return;
                    }
                    const s = getState();
                    s.root = conf.root;
                    s.images = conf.images;
                    s.videos = conf.videos;
                    s.audios = conf.audios;
                    setState(s);
                    // Fichiers absents du disque : charges quand meme, signales.
                    const paths = conf.images.concat(conf.videos.map((v) => v.file), conf.audios);
                    const missing = [];
                    await Promise.all(paths.map(async (p) => {
                        const res = await fetch("/mmrefloader/info?file=" + encodeURIComponent(p)).catch(() => null);
                        if (!res || res.status === 404) missing.push(baseName(p));
                    }));
                    if (missing.length) {
                        notice = "⚠ " + missing.length + " missing file" + (missing.length > 1 ? "s" : "");
                        noticeTitle = "Not found on disk:\n" + missing.join("\n");
                        refresh();
                    }
                };
                reader.readAsText(file);
            });

            // ---- Rafraichissement (compteurs, info-bulles, sorties) ----
            function listTitle(paths) {
                return paths.length ? paths.map((p, i) => i + 1 + ". " + baseName(p)).join("\n") : "Nothing selected";
            }

            function refresh() {
                const s = getState();
                const withSound = s.videos.filter((v) => v.sound);
                rows.image.count.textContent = s.images.length + " / " + LIMITS.image;
                rows.video.count.textContent = s.videos.length + " / " + LIMITS.video +
                    (withSound.length ? " · " + withSound.length + " 🔊" : "");
                rows.video_audio.count.textContent = withSound.length + " 🔊 = video";
                rows.audio.count.textContent = s.audios.length + " / " + LIMITS.audio;

                // Poubelles : grises et inactives sans reference, rouges sinon
                // (Video/Audio : selon les videos dont le son est garde).
                const counts = { image: s.images.length, video: s.videos.length,
                    video_audio: withSound.length, audio: s.audios.length };
                for (const id in counts) {
                    const t = rows[id].trash;
                    const on = counts[id] > 0;
                    t.disabled = !on;
                    t.style.background = on ? MARK_RED : INACTIVE_BG;
                    t.style.opacity = on ? "1" : "0.45";
                    t.style.cursor = on ? "pointer" : "default";
                }

                rows.image.btn.title = listTitle(s.images);
                rows.video.btn.title = s.videos.length
                    ? s.videos.map((v, i) => i + 1 + ". " + baseName(v.file) + (v.sound ? "  🔊" : "")).join("\n")
                    : "Nothing selected";
                rows.video_audio.btn.title = withSound.length
                    ? s.videos.map((v, i) => (v.sound ? i + 1 + ". " + baseName(v.file) + "  🔊" : null)).filter(Boolean).join("\n")
                    : "No video with sound";
                rows.audio.btn.title = listTitle(s.audios);

                const total = s.images.length + s.videos.length + s.audios.length;
                summary.textContent = notice || (total
                    ? s.images.length + " image(s), " + s.videos.length + " video(s), " + s.audios.length + " audio"
                    : "Click a button to pick references");
                summary.style.color = notice ? ORANGE : "#9fd6cf";
                summary.title = notice ? noticeTitle : "";

                // Upload orange s'il ecrasera une configuration, vert sinon.
                uploadBtn.style.background = hasConfig(s) ? ORANGE : GREEN;
                rootBtn.title = s.root ? "Root folder: " + s.root : "Root folder of the rushes (not set)";

                applyLayout(node, s);
            }

            node.addDOMWidget("mmrefloader_ui", "mmrefloader", container, {
                serialize: false,
                hideOnZoom: false,
                getMinHeight: () => UI_HEIGHT,
                getHeight: () => UI_HEIGHT,
            });

            const onResize = node.onResize;
            node.onResize = function (size) {
                if (size[0] < MIN_WIDTH) size[0] = MIN_WIDTH;
                return onResize ? onResize.apply(this, arguments) : undefined;
            };

            // configure() (rechargement d'un workflow) s'execute apres
            // onNodeCreated : relire l'etat a ce moment-la.
            const onConfigure = node.onConfigure;
            node.onConfigure = function () {
                const ret = onConfigure ? onConfigure.apply(this, arguments) : undefined;
                refresh();
                return ret;
            };

            refresh();
            return r;
        };

        // Renommer une sortie par double-clic sur son nom.
        const onDblClick = nodeType.prototype.onDblClick;
        nodeType.prototype.onDblClick = function (e, pos) {
            const r = onDblClick ? onDblClick.apply(this, arguments) : undefined;
            const i = hitOutputLabel(this, pos);
            if (i >= 0) openOutputLabelEditor(this, i);
            return r;
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            if (activeOutputEditor && activeOutputEditor.node === this) activeOutputEditor.close(false);
            (this.__mmrefOverlays || []).forEach((o) => o.remove());
            return onRemoved ? onRemoved.apply(this, arguments) : undefined;
        };

        // Secours : renommer par le menu clic droit.
        const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function (canvas, options) {
            const r = getExtraMenuOptions ? getExtraMenuOptions.apply(this, arguments) : undefined;
            const node = this;
            if (node.outputs && node.outputs.length) {
                options.push(null);
                node.outputs.forEach((out, i) => {
                    const current = out.label || out.name;
                    options.push({
                        content: 'Rename output "' + current + '"...',
                        callback: () => {
                            const value = window.prompt("New name for this output:", current);
                            if (value !== null) setOutputLabel(node, i, value);
                        },
                    });
                });
            }
            return r;
        };
    },
});
