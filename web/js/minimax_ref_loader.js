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
const LIMITS = { image: 9, video: 3, video_audio: 3, audio: 3, first_frame: 1, last_frame: 1 };

// Couleur des points de sortie d'une paire complete ref_video_N / ref_video_audio_N
// (N = 1, 2, 3).
const PAIR_COLORS = [ORANGE, PINK, GREEN];

// Les 4 listes de references. video_audio : bandes-son extraites de videos
// (pistes audio ref_video_audio_N), liste independante des videos.
const LIST_KEYS = {
    image: "images", video: "videos", video_audio: "video_audios", audio: "audios",
    first_frame: "first_frame", last_frame: "last_frame",
};
const listOf = (s, kind) => s[LIST_KEYS[kind]];
/** Type de fichier selectionnable pour une liste (video_audio : des videos ; frames : des images). */
const fileKind = (kind) =>
    kind === "video_audio" ? "video" : kind === "first_frame" || kind === "last_frame" ? "image" : kind;

// Hauteur de l'interface DOM : interrupteur de mode + lignes + barre du bas
// (4 lignes en Ref2VA, 2 en F2VA/FL2VA).
const UI_HEIGHT = { ref2va: 232, fl2va: 156 };
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
const SEARCH_ICON = svg(
    '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>', 13);
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
    { id: "video", kind: "video", label: "Video", icon: VIDEO_ICON, color: ORANGE },
    { id: "video_audio", kind: "video_audio", label: "Video/Audio", icon: VIDEO_AUDIO_ICON, color: GREEN },
    { id: "audio", kind: "audio", label: "Audio", icon: AUDIO_ICON, color: TITLE_COLOR },
];

// Lignes du mode F2VA/FL2VA (MiniMax H3 Image to Video).
const FRAME_BUTTONS = [
    { id: "first_frame", kind: "first_frame", label: "First frame", icon: IMAGE_ICON, color: VIOLET },
    { id: "last_frame", kind: "last_frame", label: "Last frame", icon: IMAGE_ICON, color: TITLE_COLOR },
];

const KIND_TITLES = {
    image: "Reference images", video: "Reference videos",
    video_audio: "Video soundtracks (ref_video_audio)", audio: "Reference audio",
    first_frame: "First frame (F2VA / FL2VA)", last_frame: "Last frame (FL2VA, optional)",
};

function iconBadge(icon, bg) {
    return '<span style="display:inline-flex;align-items:center;justify-content:center;' +
        "min-width:18px;height:18px;padding:0 3px;border-radius:4px;vertical-align:middle;" +
        "background:" + bg + '">' + icon + "</span>";
}

const HELP_SECTIONS = [
    {
        title: "Two modes",
        html: "<p>The switch at the top chooses the mode. <b>Ref2VA</b> loads the references of " +
            "<b>MiniMax H3 Reference to Video</b> (four rows below). <b>F2VA / FL2VA</b> loads the " +
            "frames of <b>MiniMax H3 Image to Video</b>: a <b>First frame</b> and, optionally, a " +
            "<b>Last frame</b> (images), on the outputs <b>first_frame</b> and <b>last_frame</b>. " +
            "Without a last frame, MiniMax does F2VA; with both, FL2VA.</p>" +
            "<p>Each mode keeps its own selection and its outputs: switching back restores them, and " +
            "the wires of that mode are reconnected when their target is still there and free. In the " +
            "gallery of a frame, clicking an image replaces the current one.</p>",
    },
    {
        title: "What this node does",
        html: "<p>Loads the references of <b>MiniMax H3 Reference to Video</b>: " +
            "up to 9 images, 3 videos, 3 video soundtracks and 3 audio files. " +
            "Wire the outputs in order: <b>ref_image_1</b> goes to the first image input of " +
            "MiniMax (named <b>ref_image_0</b> there), <b>ref_image_2</b> to the next one, and so on.</p>",
    },
    {
        title: "The four buttons",
        html: "<p>" + iconBadge(IMAGE_ICON, VIOLET) + " <b>Images</b>, " +
            iconBadge(VIDEO_ICON, ORANGE) + " <b>Video</b>, " +
            iconBadge(VIDEO_AUDIO_ICON, GREEN) + " <b>Video/Audio</b>, " +
            iconBadge(AUDIO_ICON, TITLE_COLOR) + " <b>Audio</b>: each opens a gallery of the " +
            "chosen folder and fills its own list.</p>" +
            "<p><b>Video</b> gives the video frames (<b>ref_video_N</b>). <b>Video/Audio</b> picks " +
            "videos too, but only their <b>soundtrack</b> is extracted: it is an <b>audio track</b> " +
            "that goes out on <b>ref_video_audio_N</b>. The two lists are independent; pick the same " +
            "video in both to have its frames and its sound.</p>" +
            "<p><b>Note:</b> MiniMax uses the audio track wired to <b>ref_video_audio_N</b> together " +
            "with the reference video wired to <b>ref_video_N</b>. When both <b>ref_video_N</b> and " +
            "<b>ref_video_audio_N</b> have a file, their output dots share a colour (1 orange, 2 pink, " +
            "3 green).</p>" +
            "<p>The " + iconBadge(TRASH_ICON, MARK_RED) + " next to " + iconBadge(EYE_ICON, VIOLET) +
            " deletes <b>all</b> the references of its row, after a confirmation.</p>",
    },
    {
        title: "Numbering",
        html: "<p>Click order sets the number: the first image clicked is <b>ref_image_1</b>, " +
            "that is <b>&lt;Picture 1&gt;</b> in the prompt. Click again to remove it; the " +
            "others move up.</p>" +
            "<p>MiniMax numbers <b>&lt;Audio j&gt;</b> with the video soundtracks " +
            "(<b>ref_video_audio</b>) first, then the audio files: with 2 video soundtracks, " +
            "<b>ref_audio_1</b> is <b>&lt;Audio 3&gt;</b>.</p>",
    },
    {
        title: "Viewing and reordering",
        html: "<p>" + iconBadge(EYE_ICON, VIOLET) + " shows the selected files in their order, " +
            "with their number and output. Click a thumbnail to see it larger (videos and audio " +
            "can be played) with its folder, size and duration; images and videos also open in a " +
            "preview window of the same size on the right. The " + iconBadge(LEFT_ICON, INACTIVE_BG) +
            " " + iconBadge(RIGHT_ICON, INACTIVE_BG) + " arrows move a file one place: number 1 always " +
            "goes out on <b>ref_image_1</b>, number 2 on <b>ref_image_2</b>, and so on (the wires stay " +
            "on the outputs).</p>" +
            "<p>The " + iconBadge(TRASH_ICON, INACTIVE_BG) + " on a thumbnail marks it for deletion (it turns " +
            iconBadge(TRASH_ICON, MARK_RED) + "); <b>Delete</b> removes the marked files after a confirmation. " +
            "The following references move up (ref 4 becomes ref 3...) and the last output, now empty, " +
            "is removed.</p>",
    },
    {
        title: "Root folder and configuration",
        html: "<p>" + iconBadge(GEAR_ICON, VIOLET) + " sets the <b>root folder</b> of your rushes: " +
            "galleries open on it.</p>" +
            "<p>In a gallery, <b>Root folder</b> is prefilled with it and its content is shown. " +
            "<b>Subfolder</b> is a drop-down list of all its subfolders, with the number of files of " +
            "that type after each name; <b>(root folder)</b> shows the root folder itself. The " +
            iconBadge(SEARCH_ICON, VIOLET) + " of <b>Root folder</b> finds the subfolders again for the " +
            "list and shows the root folder content, the one of <b>Subfolder</b> shows the content of " +
            "the chosen subfolder. A folder with one kind of files shows a single grid; a mixed folder " +
            "shows a section per kind (Images, Video or Video/Audio, Audio). Only the files of the button " +
            "that opened the gallery can be selected, the others are shown for information. Clicking an image " +
            "or a video also shows it (image, or video with its player) in a preview window on the right. " +
            "Without a root folder " +
            "they are greyed out; Browse and Reload stay available; Reload goes back to the root folder of the gear button when the gallery shows another folder.</p>" +
            "<p>" + iconBadge(DOWNLOAD_ICON, PINK) + " saves the whole configuration (root folder, " +
            "images, videos, video soundtracks, audio) in a .txt file, one line per output, e.g. " +
            "<code>image 1 : images\\a.png</code>. Paths under the root folder are written relative " +
            "to it; an empty group is written with its first number and NaN, e.g. " +
            "<code>audio 1 : NaN</code>.</p>" +
            "<p>" + iconBadge(UPLOAD_ICON, PINK) + " loads such a file and sets the outputs from it. " +
            "It turns " + iconBadge(UPLOAD_ICON, ORANGE) + " as soon as the mode shown has a reference (the " +
            "root folder alone does not count). Loading only replaces the part of the mode shown " +
            "(Ref2VA: the four lists; F2VA / FL2VA: the two frames) and the root folder; the other mode " +
            "and the mode switch are not changed. It asks a confirmation when the button is orange. " +
            "Files missing on " +
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
    // folders[kind] : dossier de base propre a une galerie ("" = dossier racine) ;
    // subs[kind] : sous-dossier choisi, relatif a la base ("" = la base elle-meme,
    // conserve par type ; sans choix, la galerie affiche la base).
    return {
        root: "", folders: { image: "", video: "", audio: "" }, subs: { image: "", video: "", audio: "" },
        images: [], videos: [], video_audios: [], audios: [],
        // Mode F2VA/FL2VA : une image au plus dans chaque liste.
        mode: "ref2va", first_frame: [], last_frame: [],
    };
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
    const sb = data.subs || {};
    for (const k of ["image", "video", "audio"]) s.subs[k] = typeof sb[k] === "string" ? sb[k] : "";
    s.images = (Array.isArray(data.images) ? data.images : []).filter((v) => typeof v === "string" && v).slice(0, LIMITS.image);
    s.audios = (Array.isArray(data.audios) ? data.audios : []).filter((v) => typeof v === "string" && v).slice(0, LIMITS.audio);
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
        .slice(0, LIMITS.video);
    const va = (Array.isArray(data.video_audios) ? data.video_audios : []).filter((v) => typeof v === "string" && v);
    s.video_audios = (va.length ? va : oldSounds).slice(0, LIMITS.video_audio);
    s.mode = data.mode === "fl2va" ? "fl2va" : "ref2va";
    for (const k of ["first_frame", "last_frame"]) {
        const v = data[k];
        s[k] = (Array.isArray(v) ? v : [v]).filter((x) => typeof x === "string" && x).slice(0, 1);
    }
    return s;
}

/**
 * Le dossier racine change : les sous-dossiers choisis relativement a lui
 * (galeries sans dossier propre) ne sont plus valables : retour a la
 * racine elle-meme.
 */
function resetRootSubs(s) {
    for (const k of ["image", "video", "audio"]) {
        if (!s.folders[k]) s.subs[k] = "";
    }
}

/** Doit rester identique a media.layout_keys() cote Python. */
function layoutKeys(ni, nv, nva, na) {
    const clamp = (n, max) => Math.min(Math.max(1, n), max);
    const keys = [];
    for (let i = 1; i <= clamp(ni, LIMITS.image); i++) keys.push("ref_image_" + i);
    for (let i = 1; i <= clamp(nv, LIMITS.video); i++) keys.push("ref_video_" + i);
    for (let i = 1; i <= clamp(nva, LIMITS.video_audio); i++) keys.push("ref_video_audio_" + i);
    for (let i = 1; i <= clamp(na, LIMITS.audio); i++) keys.push("ref_audio_" + i);
    return keys;
}

/** Sorties visibles selon le mode (identique a media.state_layout cote Python). */
function stateLayout(state) {
    if (state.mode === "fl2va") return ["first_frame", "last_frame"];
    return layoutKeys(state.images.length, state.videos.length, state.video_audios.length, state.audios.length);
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
    const keys = stateLayout(state);
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
    // Paire complete (ref_video_N et ref_video_audio_N ont chacun une source) :
    // les deux points prennent la couleur de la paire N ; sinon couleur du type.
    const paired = (n) => state.mode === "ref2va" && !!state.videos[n - 1] && !!state.video_audios[n - 1];
    node.outputs.forEach((o) => {
        o.type = slotType(o.name);
        const m = o.name.match(/^ref_video(?:_audio)?_(\d)$/);
        const color = m && paired(Number(m[1])) ? PAIR_COLORS[Number(m[1]) - 1] : undefined;
        o.color_on = color;
        o.color_off = color;
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
// Fenetre de visualisation d'une image ou d'une video (galerie et fenetre oeil)
// --------------------------------------------------------------------
/**
 * Fenetre de meme taille que card, placee a sa droite. Ecran trop etroit :
 * retrecie a la place libre (360 px au moins) a droite, sinon a gauche ; en
 * dernier recours seulement, elle recouvre card. Elle est mise dans l'overlay
 * de la fenetre parente : un clic dedans ne ferme pas cette fenetre.
 * show(path, fileKind, sousTitre) : image, ou video avec son lecteur.
 */
function buildSidePreview(card, overlay) {
    const side = document.createElement("div");
    Object.assign(side.style, {
        position: "fixed", display: "none", flexDirection: "column", overflow: "hidden",
        background: "#1e1e1e", color: "#ddd", border: "1px solid " + VIOLET, borderRadius: "10px",
        boxShadow: "0 8px 28px rgba(0,0,0,0.6)", fontFamily: "sans-serif", fontSize: "12px",
        boxSizing: "border-box",
    });
    side.addEventListener("mousedown", (e) => e.stopPropagation());
    side.addEventListener("click", (e) => e.stopPropagation());
    const header = document.createElement("div");
    Object.assign(header.style, {
        display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderBottom: "1px solid #333",
    });
    const title = document.createElement("div");
    Object.assign(title.style, {
        fontWeight: "bold", fontSize: "13px", color: TITLE_COLOR, flex: "1", whiteSpace: "nowrap",
        overflow: "hidden", textOverflow: "ellipsis",
    });
    const subtitle = document.createElement("div");
    subtitle.style.color = "#bbb";
    const closeBtn = makeIconButton(INACTIVE_BG, CLOSE_ICON, "Close the preview");
    header.append(title, subtitle, closeBtn);
    const body = document.createElement("div");
    Object.assign(body.style, {
        flex: "1", minHeight: "0", display: "flex", alignItems: "center", justifyContent: "center",
        padding: "10px", background: "#111", margin: "10px", borderRadius: "6px", overflow: "hidden",
    });
    side.append(header, body);
    overlay.appendChild(side);

    function place() {
        const r = card.getBoundingClientRect();
        const margin = 12;
        const minW = 360;
        const w = r.width || 720;
        const h = r.height || 560;
        const roomRight = window.innerWidth - 8 - (r.right + margin);
        const roomLeft = r.left - margin - 8;
        let width = w;
        let left = r.right + margin;
        if (roomRight < w) {
            if (roomRight >= minW || roomRight >= roomLeft) {
                width = Math.max(Math.min(w, roomRight), minW);
            } else {
                width = Math.max(Math.min(w, roomLeft), minW);
                left = r.left - margin - width;
            }
            left = Math.max(8, Math.min(left, window.innerWidth - 8 - width));
        }
        side.style.width = width + "px";
        side.style.height = h + "px";
        side.style.left = left + "px";
        side.style.top = r.top + "px";
    }

    function show(path, fk, sub) {
        body.innerHTML = "";
        let el;
        if (fk === "image") {
            el = document.createElement("img");
        } else {
            el = document.createElement("video");
            el.controls = true;
            el.preload = "metadata";
        }
        el.src = "/mmrefloader/media?file=" + encodeURIComponent(path);
        Object.assign(el.style, { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" });
        body.appendChild(el);
        title.textContent = baseName(path);
        title.title = path;
        subtitle.textContent = sub || "";
        side.style.display = "flex";
        place();
    }

    function hide() {
        side.style.display = "none";
        body.innerHTML = ""; // arrete une lecture video en cours
    }

    closeBtn.addEventListener("click", hide);
    return { show, hide, isOpen: () => side.style.display !== "none" };
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
    let files = [];
    let base = "";     // champ Root folder (dossier racine, ou dossier propre a la galerie)
    let sub = "";      // sous-dossier relatif a base ; "" = base elle-meme
    let subfolders = []; // [{path, count}] reperes sous base (liste deroulante)
    let scanId = 0;      // ignore les reponses d'un reperage depasse

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

    // Ligne 1 : dossier racine + loupe (reperage des sous-dossiers), Browse, Reload.
    // Ligne 2 : liste deroulante des sous-dossiers + loupe (affiche leur contenu).
    const makeRow = (labelText) => {
        const row = document.createElement("div");
        Object.assign(row.style, { display: "flex", gap: "6px", padding: "4px 12px", alignItems: "center" });
        if (labelText) {
            const label = document.createElement("div");
            label.textContent = labelText;
            Object.assign(label.style, { flex: "0 0 70px", color: "#9fd6cf", fontSize: "11px" });
            row.appendChild(label);
        }
        return row;
    };
    const makeField = (placeholder, readOnly) => {
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = placeholder;
        input.readOnly = !!readOnly;
        Object.assign(input.style, {
            flex: "1", minWidth: "0", background: "#111", color: readOnly ? "#9fd6cf" : "#ddd",
            border: "1px solid #0c3833", borderRadius: "10px", padding: "5px 10px", fontSize: "12px",
            outline: "none", boxSizing: "border-box", cursor: readOnly ? "default" : "text",
        });
        return input;
    };

    const baseRow = makeRow("Root folder");
    baseRow.style.paddingTop = "8px";
    const baseInput = makeField("Folder path - type, paste, or Browse");
    const pickBtn = makeIconButton(VIOLET, SEARCH_ICON, "Show the root folder content and find its subfolders");
    const browseBtn = makeIconButton(VIOLET, FOLDER_ICON, "Browse");
    const refreshBtn = makeIconButton(INACTIVE_BG, REFRESH_ICON,
        "Reload (back to the root folder of the gear button when another folder is shown)");
    baseRow.append(baseInput, pickBtn, browseBtn, refreshBtn);

    const subRow = makeRow("Subfolder");
    const subSelect = document.createElement("select");
    Object.assign(subSelect.style, {
        flex: "1", minWidth: "0", background: "#111", color: "#ddd", border: "1px solid #0c3833",
        borderRadius: "10px", padding: "4px 8px", fontSize: "12px", outline: "none", boxSizing: "border-box",
        cursor: "pointer",
    });
    const showBtn = makeIconButton(VIOLET, SEARCH_ICON, "Show the content of the chosen subfolder");
    // Meme largeur que Browse + Reload a droite : les deux loupes restent alignees.
    const subSpacer = document.createElement("div");
    subSpacer.style.flex = "0 0 54px";
    subRow.append(subSelect, showBtn, subSpacer);

    const status = document.createElement("div");
    Object.assign(status.style, { padding: "4px 12px 6px", color: "#999", minHeight: "14px" });

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

    card.append(header, baseRow, subRow, status, grid, footer);

    // Apercu d'une image / video cliquee (lecteur seul, pas de vignettes).
    const sidePreview = buildSidePreview(card, overlay);
    function previewFile(f, path) {
        // Audio : pas d'apercu (et on ferme celui d'un fichier precedent).
        if (f.kind === "audio") {
            sidePreview.hide();
            return;
        }
        let sub;
        if (f.kind !== fileKind(kind)) {
            sub = "for information";
        } else {
            const idx = indexOf(path);
            sub = idx >= 0 ? outputName(kind, idx) : "not selected";
        }
        sidePreview.show(path, f.kind, sub);
    }

    /**
     * Dossier dont on affiche les miniatures : le sous-dossier choisi, ou
     * le Root folder lui-meme sans choix ("" sans Root folder).
     */
    function currentFolder() {
        if (!base) return "";
        if (!sub) return base;
        return joinPath(base, base.includes("\\") ? sub.replace(/\//g, "\\") : sub);
    }

    /** Boutons gris et inactifs quand ils ne peuvent pas servir. */
    function setEnabled(btn, on) {
        btn.disabled = !on;
        btn.style.background = on ? VIOLET : INACTIVE_BG;
        btn.style.opacity = on ? "1" : "0.45";
        btn.style.cursor = on ? "pointer" : "default";
    }

    /**
     * Remplit la liste deroulante : "(root folder)" puis les sous-dossiers
     * reperes. Un sous-dossier memorise mais pas (encore) repere reste
     * propose, pour ne pas perdre le choix.
     */
    function fillSelect() {
        subSelect.innerHTML = "";
        const add = (value, text) => {
            const o = document.createElement("option");
            o.value = value;
            o.textContent = text;
            o.style.background = "#111";
            subSelect.appendChild(o);
        };
        const rootEntry = subfolders.find((e) => !e.path);
        add("", "(root folder)" + (rootEntry ? "  ·  " + rootEntry.count : ""));
        // Tous les sous-dossiers ; le nombre est celui des fichiers du type de la galerie.
        const list = subfolders.filter((e) => e.path);
        if (sub && !list.some((e) => e.path === sub)) list.unshift({ path: sub, count: null });
        list.forEach((e) => add(e.path, e.path + (e.count != null ? "  ·  " + e.count : "")));
        subSelect.value = sub;
        const usable = !!base && subSelect.options.length > 1;
        subSelect.disabled = !usable;
        subSelect.style.opacity = usable ? "1" : "0.45";
        subSelect.style.cursor = usable ? "pointer" : "default";
        subSelect.title = !base ? "Set a root folder first"
            : usable ? "Subfolders of the root folder (number of " + fileKind(kind) + " files after the name)"
            : "No subfolder: the root folder itself is shown";
    }

    function updateNav() {
        baseInput.value = base;
        fillSelect();
        setEnabled(pickBtn, !!base);
        setEnabled(showBtn, !!base);
    }

    /**
     * Repere tous les sous-dossiers du Root folder (comme l'Explorateur, avec
     * le nombre de fichiers du type de la galerie) pour la liste deroulante.
     * announce : message dans la ligne d'etat (clic sur la loupe).
     */
    async function scanSubfolders(announce) {
        if (!base) return;
        if (announce === true) status.textContent = "Looking for subfolders...";
        const id = ++scanId;
        const scanned = base;
        pickBtn.disabled = true;
        try {
            const data = await apiGet("/mmrefloader/subfolders?path=" + encodeURIComponent(scanned) +
                "&kind=" + fileKind(kind) + "&all=1");
            if (id !== scanId || scanned !== base) return;
            subfolders = data.subfolders || [];
            if (announce === true) {
                const n = subfolders.filter((e) => e.path).length;
                const withFiles = subfolders.filter((e) => e.path && e.count).length;
                status.textContent = n
                    ? n + " subfolder" + (n > 1 ? "s" : "") + " found, " + withFiles + " with " + fileKind(kind) + " files."
                    : "No subfolder in the root folder.";
            }
        } catch (e) {
            if (id !== scanId) return;
            subfolders = [];
            status.textContent = e.message;
        } finally {
            if (id === scanId) {
                fillSelect();
                setEnabled(pickBtn, !!base);
            }
        }
    }

    /** Memorise base et sous-dossier pour ce type (base = racine : stocke ""). */
    function saveNav() {
        const s = ctx.getState();
        // Video et Video/Audio partagent la memoire de navigation des videos.
        s.folders[fileKind(kind)] = base && base !== s.root ? base : "";
        s.subs[fileKind(kind)] = sub;
        ctx.setState(s);
    }

    /** Nouveau Root folder pour cette galerie : affiche son contenu et repere ses sous-dossiers. */
    function setBase(value) {
        base = value.trim();
        sub = "";
        subfolders = [];
        saveNav();
        updateNav();
        loadFolder();
        scanSubfolders();
    }

    // ------ Selection ------
    // getState() renvoie une copie neuve a chaque appel : toujours modifier
    // la liste de l'objet s que l'on renvoie ensuite a setState().
    function list(s) {
        return listOf(s || ctx.getState(), kind);
    }
    const indexOf = (path, s) => list(s).findIndex((it) => samePath(it, path));

    function toggle(path) {
        const s = ctx.getState();
        const arr = list(s);
        const idx = indexOf(path, s);
        if (idx >= 0) arr.splice(idx, 1);
        else if (arr.length < LIMITS[kind]) arr.push(path);
        else if (LIMITS[kind] === 1) arr[0] = path; // une seule image : elle est remplacee
        else return;
        ctx.setState(s);
        render();
    }

    // ------ Affichage ------
    function updateCounters() {
        const arr = list();
        counter.textContent = arr.length + " / " + LIMITS[kind] + " selected";
        const folder = currentFolder();
        const elsewhere = folder ? arr.filter((it) => !files.some((f) => f.kind === fileKind(kind) && samePath(joinPath(folder, f.name), it))).length : arr.length;
        footerInfo.textContent = elsewhere ? "+" + elsewhere + " selected in another folder" : "";
    }

    // Ordre et titres des sections quand le dossier melange les categories.
    const SECTIONS = [
        { kind: "image", title: "Images" },
        { kind: "video", title: "Video or Video/Audio" },
        { kind: "audio", title: "Audio" },
    ];

    function sectionHeader(text) {
        const h = document.createElement("div");
        h.textContent = text;
        Object.assign(h.style, {
            gridColumn: "1 / -1", color: TITLE_COLOR, fontWeight: "bold", fontSize: "12px",
            padding: "6px 2px 2px", borderBottom: "1px solid #333", marginBottom: "2px",
        });
        return h;
    }

    /**
     * Miniature d'un fichier. Seuls les fichiers du type du bouton qui a
     * ouvert la galerie se selectionnent ; les autres sont affiches pour
     * information (meme aspect, curseur et info-bulle differents).
     */
    function makeTile(f, folder, full) {
        const path = joinPath(folder, f.name);
        const own = f.kind === fileKind(kind);
        const idx = own ? indexOf(path) : -1;
        const selected = idx >= 0;
        const selectable = own && (selected || !full);

        const tile = document.createElement("div");
        tile.title = own ? f.name : f.name + "\n(" + f.kind + ": not selectable here, use the " +
            (f.kind === "image" ? "Images" : f.kind === "video" ? "Video or Video/Audio" : "Audio") + " button)";
        Object.assign(tile.style, {
            position: "relative", background: "#151515", borderRadius: "6px", overflow: "hidden",
            cursor: selectable ? "pointer" : own ? "not-allowed" : "default",
            border: "2px solid " + (selected ? PINK : "#2c2c2c"),
            opacity: own && !selectable ? "0.35" : "1",
        });

        const thumb = document.createElement("div");
        Object.assign(thumb.style, {
            height: "84px", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0d0d",
        });
        if (f.kind === "audio") {
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

        }

        tile.addEventListener("click", () => {
            if (own) toggle(path);
            previewFile(f, path);
        });
        return tile;
    }

    /**
     * Une seule categorie dans le dossier : une grille simple. Plusieurs :
     * une section par categorie (Images, Video ou Video/Audio, Audio).
     */
    function render() {
        updateCounters();
        grid.innerHTML = "";
        const folder = currentFolder();
        // Liste d'une seule image : jamais "pleine", un clic remplace l'image.
        const full = LIMITS[kind] > 1 && list().length >= LIMITS[kind];
        const present = SECTIONS.filter((sec) => files.some((f) => f.kind === sec.kind));
        for (const sec of present) {
            const group = files.filter((f) => f.kind === sec.kind);
            if (present.length > 1) {
                grid.appendChild(sectionHeader(sec.title + "  ·  " + group.length +
                    (sec.kind === fileKind(kind) ? "" : "  (for information)")));
            }
            group.forEach((f) => grid.appendChild(makeTile(f, folder, full)));
        }
    }

    function describeFiles() {
        if (!files.length) return "No image, video or audio file in this folder.";
        const parts = SECTIONS.map((sec) => {
            const n = files.filter((f) => f.kind === sec.kind).length;
            return n ? n + " " + sec.kind + (n > 1 && sec.kind !== "audio" ? "s" : "") : null;
        }).filter(Boolean);
        const own = files.filter((f) => f.kind === fileKind(kind)).length;
        return parts.join(", ") + (own ? "" : "  (no " + fileKind(kind) + " file to select here)");
    }

    async function loadFolder() {
        const folder = currentFolder();
        files = [];
        if (!folder) {
            status.textContent = "Set a root folder (gear button of the node), type a path, or Browse.";
            render();
            return;
        }
        status.textContent = "Loading...";
        render();
        try {
            // Tous les types : les autres categories sont montrees pour information.
            const data = await apiGet("/mmrefloader/list?path=" + encodeURIComponent(folder) + "&kind=all");
            files = data.files || [];
            status.textContent = describeFiles();
        } catch (e) {
            status.textContent = e.message;
        }
        render();
    }

    /**
     * Reload : si un dossier racine est declare (roue crantee) et que la
     * galerie montre un autre dossier (Browse, saisie), revient au dossier
     * racine sur "(root folder)" ; sinon relit le dossier et ses sous-dossiers.
     */
    function reload() {
        const root = ctx.getState().root || "";
        if (root && !samePath(base, root)) {
            setBase(root);
            return;
        }
        loadFolder();
        scanSubfolders();
    }

    async function browse() {
        const prev = browseBtn.innerHTML;
        browseBtn.disabled = true;
        status.textContent = "Opening the folder dialog...";
        try {
            const data = await apiGet("/mmrefloader/browse_dir?initial=" + encodeURIComponent(baseInput.value.trim()));
            if (data.path) {
                setBase(data.path);
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
        if (e.target === baseInput || e.target === subSelect) {
            e.stopImmediatePropagation();
            if (e.key === "Enter" && e.target === baseInput) {
                e.preventDefault();
                setBase(baseInput.value);
            }
        }
    };

    function close() {
        sidePreview.hide();
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
    }

    closeBtn.addEventListener("click", close);
    doneBtn.addEventListener("click", close);
    overlay.addEventListener("mousedown", close);
    browseBtn.addEventListener("click", browse);
    refreshBtn.addEventListener("click", reload);
    // Loupe du Root folder : affiche son contenu et repere ses sous-dossiers.
    pickBtn.addEventListener("click", async () => {
        if (sub) {
            sub = "";
            saveNav();
            fillSelect();
        }
        await loadFolder();
        scanSubfolders(true);
    });
    // Loupe du Subfolder : affiche le contenu du sous-dossier choisi dans la liste.
    showBtn.addEventListener("click", () => {
        if (subSelect.value !== sub) {
            sub = subSelect.value;
            saveNav();
        }
        loadFolder();
    });
    // Choix dans la liste : memorise et affiche ce sous-dossier ("" = Root folder).
    subSelect.addEventListener("change", () => {
        sub = subSelect.value;
        saveNav();
        loadFolder();
    });
    clearBtn.addEventListener("click", () => {
        const s = ctx.getState();
        s[LIST_KEYS[kind]] = [];
        ctx.setState(s);
        render();
    });

    return {
        open(newKind) {
            kind = newKind;
            title.textContent = KIND_TITLES[kind];
            // Champ prerempli avec le dossier propre a ce type, sinon le dossier
            // racine ; on affiche le sous-dossier memorise (ou le Root folder
            // lui-meme) et on repere les sous-dossiers pour la liste deroulante.
            const st = ctx.getState();
            base = st.folders[fileKind(kind)] || st.root || "";
            sub = base ? st.subs[fileKind(kind)] || "" : "";
            subfolders = [];
            files = [];
            updateNav();
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            positionCardNextToNode(card, container, 720);
            loadFolder();
            scanSubfolders();
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
            resetRootSubs(s);
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
const VIEWER_TITLES = {
    image: "Selected images", video: "Selected videos",
    video_audio: "Selected video soundtracks", audio: "Selected audio",
};
const OUTPUT_PREFIX = { image: "ref_image_", video: "ref_video_", video_audio: "ref_video_audio_", audio: "ref_audio_" };
VIEWER_TITLES.first_frame = "First frame";
VIEWER_TITLES.last_frame = "Last frame";

/** Nom de la sortie de l'element i (index 0) d'une liste. */
function outputName(kind, i) {
    return kind === "first_frame" || kind === "last_frame" ? kind : OUTPUT_PREFIX[kind] + (i + 1);
}

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
        confirm.ask(
            "<b>Delete " + numbers.length + " reference" + (numbers.length > 1 ? "s" : "") + "?</b><br>" +
            numbers.map((n) => outputName(kind, n - 1) + " : " + escapeHtml(baseName(pathOf(arr[n - 1])))).join("<br>") +
            '<div style="color:#999;margin-top:8px">The following references move up and the last ' +
            "output that becomes empty is removed.</div>",
            "Delete", deleteMarked, card);
    }

    deleteBtn.addEventListener("click", askDelete);

    function list(s) {
        s = s || ctx.getState();
        return listOf(s, kind);
    }
    const pathOf = (item) => item;

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
            if (fileKind(kind) === "audio") {
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
            out.textContent = "→ " + outputName(kind, i) + (kind === "video_audio" ? "  (sound)" : "");
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
        hideSide();
    }

    // ------ Fenetre de visualisation (images et videos) ------
    const sidePreview = buildSidePreview(card, overlay);

    function showSide(path, idx) {
        sidePreview.show(path, fileKind(kind), outputName(kind, idx));
    }

    function hideSide() {
        sidePreview.hide();
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
        preview.innerHTML = "";
        // D'apres le type de FICHIER de la liste (first_frame / last_frame sont
        // des images, video_audio des videos) : image ou video = simple
        // vignette ici + grande vue dans la fenetre de droite ; audio = lecteur.
        const fk = fileKind(kind);
        let el;
        if (fk === "audio") {
            el = document.createElement("audio");
            el.src = "/mmrefloader/media?file=" + encodeURIComponent(path);
            el.controls = true;
            el.preload = "metadata";
            el.style.width = "95%";
            hideSide();
        } else {
            el = document.createElement("img");
            el.src = "/mmrefloader/thumb?path=" + encodeURIComponent(dirName(path)) +
                "&file=" + encodeURIComponent(baseName(path));
            Object.assign(el.style, { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" });
            showSide(path, list().findIndex((it) => samePath(pathOf(it), path)));
        }
        preview.appendChild(el);

        details.innerHTML = '<span style="color:#888">Loading...</span>';
        try {
            const info = await apiGet("/mmrefloader/info?file=" + encodeURIComponent(path));
            if (current !== path) return;
            const idx = list().findIndex((it) => samePath(pathOf(it), path));
            details.innerHTML =
                row("Number:", idx + 1 + "  →  " + outputName(kind, idx)) +
                row("File:", info.name) +
                row("Folder:", info.folder) +
                (info.width ? row("Size:", info.width + " × " + info.height + " px") : "") +
                row("Weight:", formatSize(info.size)) +
                row("Duration:", info.duration != null ? formatDuration(info.duration) : "") +
                row("Frame rate:", info.fps ? info.fps.toFixed(2) + " fps" : "") +
                (fileKind(kind) === "video" ? row("Soundtrack:", info.has_audio ? "yes" : "none in the file") : "") +
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
        preview.innerHTML = ""; // arrete une lecture audio en cours
        hideSide();
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

            // Interrupteur de mode (pilule) : Ref2VA (orange) | F2VA/FL2VA (vert).
            const modeToggle = document.createElement("div");
            Object.assign(modeToggle.style, {
                display: "flex", borderRadius: "999px", overflow: "hidden", flex: "0 0 auto",
                border: "1px solid #0c3833", height: "24px",
            });
            const modeBtns = {};
            for (const [m, text, tip] of [
                ["ref2va", "Ref2VA", "References for MiniMax H3 Reference to Video"],
                ["fl2va", "F2VA / FL2VA", "First (and last) frame for MiniMax H3 Image to Video"],
            ]) {
                const mb = document.createElement("button");
                mb.type = "button";
                mb.textContent = text;
                mb.title = tip;
                Object.assign(mb.style, {
                    flex: "1", border: "none", borderRadius: "0", cursor: "pointer", fontWeight: "bold",
                    fontSize: "11px", padding: "0",
                });
                mb.addEventListener("click", () => setMode(m));
                modeToggle.appendChild(mb);
                modeBtns[m] = mb;
            }
            container.appendChild(modeToggle);

            const rows = {};
            for (const b of BUTTONS.concat(FRAME_BUTTONS)) {
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
                btn.addEventListener("click", () => gallery.open(b.kind));
                row.appendChild(btn);

                // Oeil : fenetre de la selection (ordre, infos, reorganisation).
                const eye = makeIconButton(VIOLET, EYE_ICON, "View and reorder the selection");
                eye.addEventListener("click", () => viewer.open(b.kind));
                row.appendChild(eye);

                // Poubelle : vide toute la liste de la ligne, apres confirmation
                // (rien a vider = pas de question).
                const trash = makeIconButton(INACTIVE_BG, TRASH_ICON, "Clear the " + b.label + " selection");
                trash.addEventListener("click", () => {
                    const items = listOf(getState(), b.kind);
                    if (!items.length) return;
                    clearConfirm.ask(
                        "<b>Delete all " + items.length + " " + b.label + " reference" +
                        (items.length > 1 ? "s" : "") + "?</b><br>" +
                        items.map((it, i) => outputName(b.kind, i) + " : " + escapeHtml(baseName(it))).join("<br>") +
                        '<div style="color:#999;margin-top:8px">Only ' + outputName(b.kind, 0) + " stays, empty.</div>",
                        "Delete all", () => {
                            const s = getState();
                            s[LIST_KEYS[b.kind]] = [];
                            setState(s);
                        });
                });
                row.appendChild(trash);

                container.appendChild(row);
                rows[b.id] = { row, btn, count, trash };
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
            const uploadBtn = makeIconButton(PINK, UPLOAD_ICON, "Load a configuration (.txt)");
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

            // Une configuration "existe" des qu'une reference est selectionnee ;
            // le dossier racine seul ne compte pas.
            const ref2vaRefs = (s) => s.images.length + s.videos.length + s.video_audios.length + s.audios.length;
            const frameRefs = (s) => s.first_frame.length + s.last_frame.length;
            /** References du mode affiche (couleur du bouton Upload). */
            const modeRefs = (s) => (s.mode === "fl2va" ? frameRefs(s) : ref2vaRefs(s));

            /**
             * Liens et noms renommes des sorties d'un mode, memorises dans
             * node.properties.modeLinks : en revenant a ce mode, les liens sont
             * rebranches si le noeud cible et son entree existent encore et sont libres.
             */
            function saveModeLinks(mode) {
                const saved = [];
                node.outputs.forEach((o, i) => {
                    const links = outputLinksOf(node, i).map((l) => {
                        const target = node.graph && node.graph.getNodeById(l.target_id);
                        const input = target && target.inputs && target.inputs[l.target_slot];
                        return input ? { targetId: l.target_id, input: input.name } : null;
                    }).filter(Boolean);
                    saved.push({ key: o.name, label: o.label || null, links });
                });
                node.properties.modeLinks = Object.assign({}, node.properties.modeLinks, { [mode]: saved });
            }

            function restoreModeLinks(mode) {
                const saved = (node.properties.modeLinks || {})[mode] || [];
                for (const entry of saved) {
                    const outIdx = node.outputs.findIndex((o) => o.name === entry.key);
                    if (outIdx < 0) continue;
                    if (entry.label) node.outputs[outIdx].label = entry.label;
                    for (const l of entry.links) {
                        const target = node.graph && node.graph.getNodeById(l.targetId);
                        if (!target || !target.inputs) continue;
                        const inIdx = target.inputs.findIndex((inp) => inp.name === l.input);
                        if (inIdx >= 0 && target.inputs[inIdx].link == null) node.connect(outIdx, target, inIdx);
                    }
                }
                node.setDirtyCanvas(true, true);
            }

            /** Bascule Ref2VA <-> F2VA/FL2VA ; chaque mode garde sa configuration. */
            function setMode(mode, s) {
                s = s || getState();
                if (s.mode === mode) return;
                saveModeLinks(s.mode);
                s.mode = mode;
                setState(s);
                restoreModeLinks(mode);
            }
            // Orange = le mode affiche a deja des references.
            const hasConfig = (s) => modeRefs(s) > 0;

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

            // Upload : ne remplace que la partie du mode affiche (Ref2VA : les 4
            // listes ; F2VA/FL2VA : les deux frames). Confirmation seulement si
            // cette partie a deja des references (bouton orange).
            uploadBtn.addEventListener("click", () => {
                const s = getState();
                if (!hasConfig(s)) {
                    fileInput.click();
                    return;
                }
                const fl = s.mode === "fl2va";
                clearConfirm.ask(
                    "<b>Overwrite the " + (fl ? "F2VA / FL2VA" : "Ref2VA") + " configuration?</b><br>" +
                    "Loading a file replaces the " + modeRefs(s) + " " + (fl ? "frame" : "reference") +
                    (modeRefs(s) > 1 ? "s" : "") + " of this mode and the root folder; the other mode " +
                    "is not changed." +
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
                    // Seule la partie du mode affiche est remplacee ; le mode du
                    // noeud ne change pas. Le dossier racine (commun) est repris.
                    const s = getState();
                    if (s.root !== conf.root) resetRootSubs(s);
                    s.root = conf.root;
                    let paths;
                    if (s.mode === "fl2va") {
                        s.first_frame = conf.first_frame;
                        s.last_frame = conf.last_frame;
                        paths = conf.first_frame.concat(conf.last_frame);
                    } else {
                        s.images = conf.images;
                        s.videos = conf.videos;
                        s.video_audios = conf.video_audios;
                        s.audios = conf.audios;
                        paths = conf.images.concat(conf.videos, conf.video_audios, conf.audios);
                    }
                    setState(s);
                    // Fichiers absents du disque : charges quand meme, signales.
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
                const fl = s.mode === "fl2va";
                // Interrupteur et lignes du mode actif.
                modeBtns.ref2va.style.background = fl ? INACTIVE_BG : ORANGE;
                modeBtns.ref2va.style.color = fl ? INACTIVE_FG : "white";
                modeBtns.fl2va.style.background = fl ? GREEN : INACTIVE_BG;
                modeBtns.fl2va.style.color = fl ? "white" : INACTIVE_FG;
                BUTTONS.forEach((b) => (rows[b.id].row.style.display = fl ? "none" : "flex"));
                FRAME_BUTTONS.forEach((b) => (rows[b.id].row.style.display = fl ? "flex" : "none"));
                for (const b of FRAME_BUTTONS) {
                    const v = s[b.kind][0];
                    rows[b.id].count.textContent = v ? baseName(v) : b.id === "last_frame" ? "none (F2VA)" : "empty";
                    rows[b.id].btn.title = v || (b.id === "last_frame"
                        ? "Optional: without a last frame, MiniMax does F2VA" : "Pick the first frame");
                }
                rows.image.count.textContent = s.images.length + " / " + LIMITS.image;
                rows.video.count.textContent = s.videos.length + " / " + LIMITS.video;
                // Video/Audio : des pistes audio (bande-son extraite des videos).
                rows.video_audio.count.textContent = s.video_audios.length + " / " + LIMITS.video_audio + " · audio";
                rows.audio.count.textContent = s.audios.length + " / " + LIMITS.audio;

                // Poubelles : grises et inactives sans reference, rouges sinon.
                for (const b of BUTTONS.concat(FRAME_BUTTONS)) {
                    const t = rows[b.id].trash;
                    const on = listOf(s, b.kind).length > 0;
                    t.disabled = !on;
                    t.style.background = on ? MARK_RED : INACTIVE_BG;
                    t.style.opacity = on ? "1" : "0.45";
                    t.style.cursor = on ? "pointer" : "default";
                }

                rows.image.btn.title = listTitle(s.images);
                rows.video.btn.title = listTitle(s.videos);
                rows.video_audio.btn.title = s.video_audios.length
                    ? "Soundtracks (ref_video_audio):\n" + listTitle(s.video_audios)
                    : "No video soundtrack selected";
                rows.audio.btn.title = listTitle(s.audios);

                const refText = fl
                    ? (s.first_frame.length ? (s.last_frame.length ? "FL2VA: first + last frame" : "F2VA: first frame")
                        : "Pick a first frame")
                    // Ref2VA : nombre / plafond par groupe (les bandes-son Video/Audio
                    // ont leurs propres places, affichees sur leur ligne).
                    : s.images.length + "/" + LIMITS.image + " image(s), " +
                      s.videos.length + "/" + LIMITS.video + " video(s), " +
                      s.audios.length + "/" + LIMITS.audio + " audio(s)";
                summary.textContent = notice || refText;
                summary.style.color = notice ? ORANGE : "#9fd6cf";
                summary.title = notice ? noticeTitle : "";

                // Upload orange s'il ecrasera des references, couleur standard sinon.
                uploadBtn.style.background = hasConfig(s) ? ORANGE : PINK;
                rootBtn.title = s.root ? "Root folder: " + s.root : "Root folder of the rushes (not set)";

                applyLayout(node, s);
            }

            node.addDOMWidget("mmrefloader_ui", "mmrefloader", container, {
                serialize: false,
                hideOnZoom: false,
                getMinHeight: () => UI_HEIGHT[getState().mode],
                getHeight: () => UI_HEIGHT[getState().mode],
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
