import { app } from "../../scripts/app.js";
import { formatConfigJson, parseConfigJson, trimKey } from "./config_format.js";
import { filterSections, findMatches, queryWords, pickLanguage, HELP_LANGUAGES } from "./help_search.js";
import { LIST_FOLDERS, gallerySession, replaceSelection, unusedProjectFiles, duplicateColors, remapState } from "./project_paths.js";

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
// Listes dont les fichiers peuvent etre rognes (identique a media.TRIM_KINDS).
const TRIM_KINDS = ["video", "video_audio", "audio"];
/** Rognage [debut, fin] d'un fichier d'une liste, ou null. */
const trimOf = (s, kind, path) => (s.trims && s.trims[kind] ? s.trims[kind][trimKey(path)] || null : null);
const fmtSec = (x) => String(Number(Number(x).toFixed(2)));
const fmtTrim = (t) => fmtSec(t[0]) + "–" + fmtSec(t[1]) + " s";

/** Type de fichier selectionnable pour une liste (video_audio : des videos ; frames : des images). */
const fileKind = (kind) =>
    kind === "video_audio" ? "video" : kind === "first_frame" || kind === "last_frame" ? "image" : kind;

// Extensions video (identiques a media.KIND_EXTS["video"]).
const VIDEO_EXTS = [".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"];
const isVideoPath = (p) => VIDEO_EXTS.some((e) => String(p).toLowerCase().endsWith(e));
/** Fichiers de type fk selectionnables dans la liste kind : Audio accepte aussi les videos ("son seul"). */
const canPick = (kind, fk) => fk === fileKind(kind) || (kind === "audio" && fk === "video");
/** Video choisie dans la liste Audio : seule sa bande-son sort, sur ref_audio_N. */
const soundOnly = (kind, path) => kind === "audio" && isVideoPath(path);

/** Badge "son seul" pose sur la vignette d'une video de la liste Audio. */
function soundOnlyBadge(pos) {
    const b = document.createElement("div");
    b.textContent = "🔊 sound only";
    b.title = "Only the soundtrack of this video goes out (as an audio track)";
    Object.assign(b.style, {
        position: "absolute", background: "rgba(0,0,0,0.75)", color: GREEN, padding: "1px 5px",
        borderRadius: "4px", fontSize: "10px", whiteSpace: "nowrap",
    }, pos);
    return b;
}

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
const GLOBE_ICON = svg(
    '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path>' +
    '<path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"></path>', 14);
const GEAR_ICON = svg(
    '<circle cx="12" cy="12" r="3"></circle>' +
    '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>', 13);
const DOWNLOAD_ICON = svg('<path d="M12 3v12"></path><path d="M7 10l5 5 5-5"></path><path d="M5 21h14"></path>', 13);
const UPLOAD_ICON = svg('<path d="M12 21V9"></path><path d="M7 14l5-5 5 5"></path><path d="M5 3h14"></path>', 13);
// Mosaique (4 carres) : bouton de la vue d'ensemble.
const OVERVIEW_ICON = svg(
    '<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect>' +
    '<rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect>', 13);
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

// ------ Aide : petits blocs de mise en page ------
const START_ICON = svg('<polygon points="6 4 20 12 6 20 6 4"></polygon>', 13);
const MODE_ICON = svg('<rect x="2" y="7" width="20" height="10" rx="5"></rect><circle cx="16" cy="12" r="3"></circle>', 13);
const SCISSORS_ICON = svg(
    '<circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle>' +
    '<line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line>' +
    '<line x1="8.12" y1="8.12" x2="12" y2="12"></line>', 13);
const OUTPUT_ICON = svg('<path d="M3 12h11"></path><polyline points="10 8 14 12 10 16"></polyline><circle cx="19" cy="12" r="2.5"></circle>', 13);
const INFO_ICON = svg('<circle cx="12" cy="12" r="9"></circle><line x1="12" y1="11" x2="12" y2="16"></line><line x1="12" y1="8" x2="12" y2="8"></line>', 13);

const hList = (items) =>
    '<ul style="margin:4px 0 10px;padding-left:18px">' +
    items.map((t) => '<li style="margin:4px 0">' + t + "</li>").join("") + "</ul>";
const hSteps = (items) => items.map((t, i) =>
    '<div style="display:flex;gap:10px;align-items:flex-start;margin:0 0 8px">' +
    '<span style="flex:0 0 auto;min-width:20px;height:20px;border-radius:50%;background:' + VIOLET +
    ';color:white;font-weight:bold;font-size:11px;display:flex;align-items:center;justify-content:center">' +
    (i + 1) + "</span><span>" + t + "</span></div>").join("");
const hTip = (t, label) =>
    '<div style="border-left:3px solid ' + ORANGE + ';background:#241b15;color:#efcfb6;padding:6px 10px;' +
    'margin:10px 0">💡 <b>' + (label || "Tip:") + "</b> " + t + "</div>";
const hNote = (t, label) =>
    '<div style="border-left:3px solid ' + VIOLET + ';background:#1c1a2b;color:#cfcaf2;padding:6px 10px;' +
    'margin:10px 0"><b>' + (label || "Note:") + "</b> " + t + "</div>";
/** Carte memo : rows = [[iconeHtml, texte], ...]. */
const hCard = (title, rows) =>
    '<div style="border:1px solid #2c2c2c;border-radius:8px;background:#161616;padding:8px 10px;margin:8px 0">' +
    '<div style="color:#9fd6cf;font-weight:bold;margin-bottom:6px">' + title + "</div>" +
    '<div style="display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center">' +
    rows.map(([icon, text]) => "<span>" + icon + "</span><span>" + text + "</span>").join("") +
    "</div></div>";
const hCode = (t) =>
    '<pre style="background:#111;border:1px solid #2c2c2c;border-radius:6px;padding:8px;margin:6px 0 10px;' +
    'font-size:11px;white-space:pre-wrap;color:#cfe">' + t + "</pre>";

// Rubriques de l'aide : menu a gauche, une rubrique affichee a la fois.
const HELP_SECTIONS = [
    {
        id: "start", title: "Quick start", icon: START_ICON, color: TITLE_COLOR,
        html: hSteps([
            "Choose the mode with the switch at the top: <b>Ref2VA</b> (references for MiniMax H3 " +
            "Reference to Video) or <b>F2VA / FL2VA</b> (frames for MiniMax H3 Image to Video).",
            "Click a row button (" + iconBadge(IMAGE_ICON, VIOLET) + " Images, " + iconBadge(VIDEO_ICON, ORANGE) +
            " Video...) and click files in the gallery. Click order sets the number.",
            "Wire the outputs in order to MiniMax: <b>ref_image_1</b> goes to <b>ref_image_0</b>, and so on.",
        ]) +
        hCard("Buttons of the node", [
            [iconBadge(EYE_ICON, VIOLET), "View, reorder, delete and trim the files of a row"],
            [iconBadge(TRASH_ICON, MARK_RED), "Clear all the files of a row"],
            [iconBadge(OVERVIEW_ICON, VIOLET), "Overview of the whole selection"],
            [iconBadge(GEAR_ICON, VIOLET), "Root folder of your rushes"],
            [iconBadge(DOWNLOAD_ICON, PINK), "Save the configuration (.json)"],
            [iconBadge(UPLOAD_ICON, PINK), "Load a configuration (.json)"],
        ]) +
        hTip("<b>ref_image_1</b> is <b>&lt;Picture 1&gt;</b> in the prompt."),
    },
    {
        id: "modes", title: "Modes", icon: MODE_ICON, color: ORANGE,
        html: hList([
            "<b>Ref2VA</b>: four rows for MiniMax H3 Reference to Video, up to 9 images, 3 videos, " +
            "3 video soundtracks and 3 audio files.",
            "<b>F2VA / FL2VA</b>: a <b>First frame</b> and an optional <b>Last frame</b> (images) on the " +
            "outputs <b>first_frame</b> and <b>last_frame</b>, for MiniMax H3 Image to Video.",
            "Without a last frame MiniMax does F2VA; with both, FL2VA.",
            "Each mode keeps its own selection and outputs. Switching back restores them and reconnects " +
            "the wires of that mode when their target is still there and free.",
        ]) +
        hTip("In the gallery of a frame, clicking an image replaces the current one."),
    },
    {
        id: "pick", title: "Picking files", icon: IMAGE_ICON, color: VIOLET,
        html: hCard("The four rows", [
            [iconBadge(IMAGE_ICON, VIOLET), "<b>Images</b>: up to 9, on <b>ref_image_N</b>"],
            [iconBadge(VIDEO_ICON, ORANGE), "<b>Video</b>: the video frames, on <b>ref_video_N</b>"],
            [iconBadge(VIDEO_AUDIO_ICON, GREEN), "<b>Video/Audio</b>: videos too, but only their " +
                "<b>soundtrack</b> is extracted: an audio track on <b>ref_video_audio_N</b>"],
            [iconBadge(AUDIO_ICON, TITLE_COLOR), "<b>Audio</b>: up to 3, on <b>ref_audio_N</b>: audio files, " +
                "or videos used for their sound only (🔊 sound only)"],
        ]) +
        hList([
            "<b>Root folder</b> is prefilled with the folder of " + iconBadge(GEAR_ICON, VIOLET) +
            " and its content is shown.",
            "<b>Subfolder</b> is a drop-down list of all its subfolders, with the number of files of that " +
            "type after each name; <b>(root folder)</b> shows the root folder itself. The choice is kept per type.",
            iconBadge(SEARCH_ICON, VIOLET) + " of <b>Root folder</b> finds the subfolders again and shows the " +
            "root folder; the one of <b>Subfolder</b> shows the chosen subfolder. Greyed out without a root folder.",
            "A mixed folder shows a section per kind. Only the files of the button that opened the gallery " +
            "can be picked; the others are shown for information.",
            "Clicking an image or a video also shows it larger in a preview window on the right.",
            "<b>Browse</b> opens the Windows folder dialog; <b>Reload</b> goes back to the root folder.",
        ]) +
        hTip("Pick the same video in <b>Video</b> and <b>Video/Audio</b> to have its frames and its sound.") +
        hNote("in the <b>Audio</b> gallery, videos can be picked too: only their soundtrack goes out on " +
            "<b>ref_audio_N</b>, as an independent audio track (not tied to <b>ref_video_N</b>). They show a " +
            "<b>🔊 sound only</b> badge and can be trimmed like any audio file. A video without soundtrack is refused."),
    },
    {
        id: "project", title: "Gallery with a project", icon: FOLDER_ICON, color: ORANGE,
        html: "<p>When the <b>project</b> output is wired to a <b>MiniMax H3 Project</b> node with a project " +
            "picked, the gallery shows two zones:</p>" +
            hList([
                "above: the content of the selected folder (Root folder / Subfolder), as usual;",
                "below the line: the content of the matching folder of the project (Images → <b>08.Images</b>, " +
                "Video → <b>12.Video</b>, Video/Audio → <b>14.Video-Audio</b>, Audio → <b>10.Son</b>). The orange " +
                "badge always gives the selection number; clicking a file of the project that is not selected " +
                "selects it.",
                "The check box under a selected file of the project (unchecked at first) marks it <b>to replace</b>. " +
                "The next file you pick above goes to the <b>pending replacements</b> (shown above the line, greyed " +
                "out in the top row) with that number; the replaced file is locked and shows <b>n → A</b>.",
                "In the pending replacements, the orange number under the green ✓ is the number the file takes. " +
                "The green ✓ validates one replacement (confirmed), the red ✕ cancels " +
                "it and frees the locked file. <b>Validate changes</b> applies them all: each new file takes its " +
                "number and the replaced files go to <b>Archives</b>; <b>Cancel changes</b> (confirmed) puts " +
                "everything back. Closing with pending replacements asks Validate or Discard.",
                "On validation the new file enters the project folder: <b>copied</b> from the selected folder (the " +
                "original stays), <b>moved</b> when it comes from <b>Archives</b>. If its name is taken there it gets " +
                "<b>_02</b>, <b>_03</b>…; a file that replaces one with the same name keeps its name.",
                "A small coloured bar under the name marks <b>duplicates</b> (same SHA256 content) among the " +
                "pending replacements and the files of the project folder: one colour per group of identical files.",
                "Only one file can wait for its replacement: while a checked file has none, the other boxes are " +
                "greyed out; pick its replacement above or uncheck it.",
                "Closing with a checked file that has no replacement asks <b>Cancel</b> (back to the gallery) or " +
                "<b>Continue</b>: that file stays as it was, the pending replacements are applied and the window " +
                "closes (no Add or Replace question).",
                "On closing, <b>every file of the list goes to its folder of the project</b> (08.Images, 12.Video, " +
                "14.Video-Audio, 10.Son): copied from elsewhere (the original stays), moved from <b>Archives</b>, " +
                "<b>_02</b> added if the name is taken; the trims follow.",
                "The selection is full: a message above the line asks you to check below the file to replace, " +
                "then to pick the new one above.",
                "When the <b>Archives</b> folder of the project folder has files, a <b>View archives</b> button " +
                "appears: it turns green and shows them above instead of the selected folder; click it again to " +
                "go back to the selected folder.",
                "<b>Clear</b> is greyed out: the order of the files of the project cannot be emptied at once; " +
                "check the files to replace instead.",
                "On closing (Done, ✕, Escape): new files added to an existing selection ask <b>Add</b> (keep the " +
                "current files) or <b>Replace</b> (only the new ones stay). <b>Cancel</b> there cancels all the " +
                "changes made in the window (the selection goes back to what it was when you opened it, replacements " +
                "already validated stay) and closes it.",
            ]) +
            hNote("no unused file stays in the project: the files of its folder that no list of the node uses " +
                "anymore go to <b>Archives</b> inside that folder (e.g. 08.Images/Archives), after a confirmation. " +
                "Cancel in that window goes back to the gallery. Nothing is ever deleted."),
    },
    {
        id: "selection", title: "Selection", icon: EYE_ICON, color: VIOLET,
        html: hList([
            iconBadge(EYE_ICON, VIOLET) + " shows the files of a row in their order, with their number and output.",
            "Click a thumbnail to see its details (folder, size, duration) and to open it larger on the right.",
            iconBadge(LEFT_ICON, INACTIVE_BG) + " " + iconBadge(RIGHT_ICON, INACTIVE_BG) + " move a file one " +
            "place: number 1 always goes out on <b>ref_image_1</b> (the wires stay on the outputs).",
            iconBadge(TRASH_ICON, INACTIVE_BG) + " on a thumbnail marks it (it turns " +
            iconBadge(TRASH_ICON, MARK_RED) + "); <b>Delete</b> removes the marked files after a confirmation.",
            "The following files move up (ref 4 becomes ref 3...) and the last output, now empty, is removed.",
        ]) +
        hNote("the " + iconBadge(TRASH_ICON, MARK_RED) + " next to " + iconBadge(EYE_ICON, VIOLET) +
            " on the node deletes <b>all</b> the files of its row, after a confirmation."),
    },
    {
        id: "trim", title: "Trim", icon: SCISSORS_ICON, color: ORANGE,
        html: hSteps([
            "Open " + iconBadge(EYE_ICON, VIOLET) + " of <b>Video</b>, <b>Video/Audio</b> or <b>Audio</b> " +
            "and click a thumbnail.",
            "In the preview window, set <b>Start</b> and <b>End</b>: type them, or use <b>Set start</b> / " +
            "<b>Set end</b> at the current playback position.",
            "Check with <b>Play trim</b>, or <b>Reset</b> to keep the whole file.",
        ]) +
        hList([
            "The file itself is never changed: only that part goes to the output (frames and sound).",
            "A trimmed file shows a <b>✂</b> badge; the trim is saved in the configuration " +
            "(<code>\"trim\": [2.5, 8]</code>).",
            "A warning shows when a video part is shorter than 2 s or a part is longer than 15 s.",
        ]),
    },
    {
        id: "overview", title: "Overview", icon: OVERVIEW_ICON, color: VIOLET,
        html: hList([
            iconBadge(OVERVIEW_ICON, VIOLET) + " shows the whole selection of the mode shown in one window, " +
            "a section per row.",
            "Each file shows its number, its output and its <b>✂</b> badge.",
            "Click a thumbnail to open it on the right (image, video or audio with its player).",
            "The trim is shown and can be played with <b>Play trim</b>, but not changed there.",
            "Greyed out while the mode shown has no reference.",
        ]) +
        hTip("Reorder, delete and trim with the " + iconBadge(EYE_ICON, VIOLET) + " of each row."),
    },
    {
        id: "config", title: "Save and load", icon: DOWNLOAD_ICON, color: PINK,
        html: hCard("Configuration files", [
            [iconBadge(DOWNLOAD_ICON, PINK), "Saves the mode shown in its own .json file: " +
                "<b>REF2VA_minimax_config_yyyyMMdd-HHmmss.json</b> or <b>FL2VA_...json</b>. Greyed out " +
                "while the mode has no reference (the root folder alone does not count)."],
            [iconBadge(UPLOAD_ICON, PINK), "Loads a .json file of the mode shown and sets its outputs. " +
                "It turns " + iconBadge(UPLOAD_ICON, ORANGE) + " when the mode already has references, " +
                "and then asks a confirmation."],
        ]) +
        hList([
            "A file of the other mode is refused with a warning; nothing is changed.",
            "The other mode and the mode switch are never changed; the root folder is taken from the file.",
            "The date and time in the name keep a new save from overwriting an older one.",
            "Files missing on disk are still loaded and reported under the buttons.",
            "Paths under the root folder are written relative to it; an empty group is <code>[]</code> " +
            "or <code>null</code>.",
        ]) +
        hCode('{\n  "format": "MiniMax H3 Reference Loader",\n  "version": 1,\n  "mode": "REF2VA",\n' +
            '  "root": "F:\\\\Rushs\\\\Project",\n  "images": ["images\\\\a.png"],\n' +
            '  "videos": [{ "path": "rush\\\\shot.mp4", "trim": [5, 7] }],\n  "video_audios": [],\n' +
            '  "audios": []\n}'),
    },
    {
        id: "outputs", title: "Outputs", icon: OUTPUT_ICON, color: GREEN,
        html: hList([
            "An output appears for each selected file (at least one per type).",
            "Double-click an output name to rename it (empty = default name), or use the right-click menu.",
            "MiniMax numbers its inputs from 0: <b>ref_image_1</b> goes to <b>ref_image_0</b>.",
            "MiniMax numbers <b>&lt;Audio j&gt;</b> with the video soundtracks first, then the audio files: " +
            "with 2 video soundtracks, <b>ref_audio_1</b> is <b>&lt;Audio 3&gt;</b>.",
            "When <b>ref_video_N</b> and <b>ref_video_audio_N</b> both have a file, their output dots share " +
            "a colour (1 orange, 2 pink, 3 green).",
        ]) +
        hNote("MiniMax uses the audio track wired to <b>ref_video_audio_N</b> together with the reference " +
            "video wired to <b>ref_video_N</b>."),
    },
    {
        id: "limits", title: "Limits", icon: INFO_ICON, color: TITLE_COLOR,
        html: hList([
            "Videos are read at 24 fps, cut to 15 s and reduced to 768×1344 pixels at most " +
            "(MiniMax would reduce them anyway).",
            "Audio files are cut to 15 s.",
            "<b>Browse</b> uses the Windows folder dialog; on other systems type or paste the folder path.",
            "Works with the classic node design and with <b>Modern Node Design (Nodes 2.0)</b>: renaming the " +
            "outputs and the pair colours work in both.",
        ]),
    },
];

// Rubriques en francais : memes id que HELP_SECTIONS (icone et couleur
// reprises de la version anglaise ; une rubrique absente s'affiche en anglais).
const TIP_FR = "Astuce :";
const NOTE_FR = "Remarque :";
const HELP_SECTIONS_FR = [
    {
        id: "start", title: "Démarrage rapide",
        html: hSteps([
            "Choisissez le mode avec l'interrupteur en haut : <b>Ref2VA</b> (références pour MiniMax H3 " +
            "Reference to Video) ou <b>F2VA / FL2VA</b> (images de début et de fin pour MiniMax H3 Image to Video).",
            "Cliquez sur le bouton d'une ligne (" + iconBadge(IMAGE_ICON, VIOLET) + " Images, " +
            iconBadge(VIDEO_ICON, ORANGE) + " Video...) puis sur des fichiers dans la galerie. L'ordre des " +
            "clics donne le numéro.",
            "Branchez les sorties dans l'ordre sur MiniMax : <b>ref_image_1</b> va sur <b>ref_image_0</b>, etc.",
        ]) +
        hCard("Boutons du nœud", [
            [iconBadge(EYE_ICON, VIOLET), "Voir, réordonner, supprimer et rogner les fichiers d'une ligne"],
            [iconBadge(TRASH_ICON, MARK_RED), "Vider tous les fichiers d'une ligne"],
            [iconBadge(OVERVIEW_ICON, VIOLET), "Vue d'ensemble de toute la sélection"],
            [iconBadge(GEAR_ICON, VIOLET), "Dossier racine de vos rushs"],
            [iconBadge(DOWNLOAD_ICON, PINK), "Sauvegarder la configuration (.json)"],
            [iconBadge(UPLOAD_ICON, PINK), "Charger une configuration (.json)"],
        ]) +
        hTip("<b>ref_image_1</b> correspond à <b>&lt;Picture 1&gt;</b> dans le prompt.", TIP_FR),
    },
    {
        id: "modes", title: "Modes",
        html: hList([
            "<b>Ref2VA</b> : quatre lignes pour MiniMax H3 Reference to Video, jusqu'à 9 images, 3 vidéos, " +
            "3 bandes-son de vidéo et 3 fichiers audio.",
            "<b>F2VA / FL2VA</b> : une <b>First frame</b> et une <b>Last frame</b> facultative (images) sur " +
            "les sorties <b>first_frame</b> et <b>last_frame</b>, pour MiniMax H3 Image to Video.",
            "Sans last frame, MiniMax fait du F2VA ; avec les deux, du FL2VA.",
            "Chaque mode garde sa sélection et ses sorties. En y revenant, elles sont restaurées et les " +
            "câbles de ce mode sont rebranchés si leur cible existe encore et est libre.",
        ]) +
        hTip("Dans la galerie d'une frame, cliquer sur une image remplace l'image actuelle.", TIP_FR),
    },
    {
        id: "pick", title: "Choisir les fichiers",
        html: hCard("Les quatre lignes", [
            [iconBadge(IMAGE_ICON, VIOLET), "<b>Images</b> : jusqu'à 9, sur <b>ref_image_N</b>"],
            [iconBadge(VIDEO_ICON, ORANGE), "<b>Video</b> : les images de la vidéo, sur <b>ref_video_N</b>"],
            [iconBadge(VIDEO_AUDIO_ICON, GREEN), "<b>Video/Audio</b> : des vidéos aussi, mais seule leur " +
                "<b>bande-son</b> est extraite : une piste audio sur <b>ref_video_audio_N</b>"],
            [iconBadge(AUDIO_ICON, TITLE_COLOR), "<b>Audio</b> : jusqu'à 3, sur <b>ref_audio_N</b> : des " +
                "fichiers audio, ou des vidéos utilisées pour leur son seul (🔊 sound only)"],
        ]) +
        hList([
            "<b>Root folder</b> est prérempli avec le dossier de " + iconBadge(GEAR_ICON, VIOLET) +
            " et son contenu est affiché.",
            "<b>Subfolder</b> est une liste déroulante de tous ses sous-dossiers, avec le nombre de fichiers " +
            "du type après chaque nom ; <b>(root folder)</b> affiche le dossier racine lui-même. Le choix est " +
            "gardé par type.",
            "La " + iconBadge(SEARCH_ICON, VIOLET) + " de <b>Root folder</b> retrouve les sous-dossiers et " +
            "affiche le dossier racine ; celle de <b>Subfolder</b> affiche le sous-dossier choisi. Grisées " +
            "sans dossier racine.",
            "Un dossier mixte affiche une section par type. Seuls les fichiers du bouton qui a ouvert la " +
            "galerie peuvent être choisis ; les autres sont affichés pour information.",
            "Cliquer sur une image ou une vidéo l'affiche aussi en grand dans une fenêtre à droite.",
            "<b>Browse</b> ouvre la fenêtre de dossiers de Windows ; <b>Reload</b> revient au dossier racine.",
        ]) +
        hTip("Choisissez la même vidéo dans <b>Video</b> et <b>Video/Audio</b> pour avoir ses images et son son.",
            TIP_FR) +
        hNote("dans la galerie <b>Audio</b>, les vidéos sont aussi sélectionnables : seule leur bande-son sort " +
            "sur <b>ref_audio_N</b>, comme une piste audio indépendante (sans lien avec <b>ref_video_N</b>). " +
            "Elles portent un badge <b>🔊 sound only</b> et se rognent comme un fichier audio. Une vidéo sans " +
            "bande-son est refusée.", NOTE_FR),
    },
    {
        id: "project", title: "Galerie avec un projet",
        html: "<p>Quand la sortie <b>project</b> est reliée à un nœud <b>MiniMax H3 Project</b> dont un projet " +
            "est choisi, la galerie affiche deux zones :</p>" +
            hList([
                "en haut : le contenu du dossier choisi (Root folder / Subfolder), comme d'habitude ;",
                "sous le trait : le contenu du dossier correspondant du projet (Images → <b>08.Images</b>, " +
                "Video → <b>12.Video</b>, Video/Audio → <b>14.Video-Audio</b>, Audio → <b>10.Son</b>). La " +
                "pastille orange donne toujours le numéro dans la sélection ; cliquer sur un fichier du projet non " +
                "sélectionné le sélectionne.",
                "La case à cocher sous un fichier sélectionné du projet (décochée au départ) le marque <b>à " +
                "remplacer</b>. Le prochain fichier choisi en haut entre dans le <b>pool de remplacements</b> " +
                "(au-dessus du trait, grisé dans la ligne du haut) avec ce numéro ; le fichier remplacé est " +
                "verrouillé et affiche <b>n → A</b>.",
                "Dans le pool, le numéro orange sous la ✓ verte est le numéro que prendra le fichier. " +
                "La ✓ verte valide un remplacement (avec confirmation), la ✕ rouge l'annule et " +
                "libère le fichier verrouillé. <b>Validate changes</b> les applique tous : chaque nouveau fichier " +
                "prend son numéro et les fichiers remplacés partent dans <b>Archives</b> ; <b>Cancel changes</b> " +
                "(avec confirmation) remet tout en place. Fermer avec un pool non vide demande Validate ou Discard.",
                "À la validation, le nouveau fichier entre dans le dossier du projet : <b>copié</b> depuis le " +
                "dossier choisi (l'original reste), <b>déplacé</b> s'il vient d'<b>Archives</b>. Si son nom y est " +
                "pris, il reçoit <b>_02</b>, <b>_03</b>… ; un fichier qui en remplace un du même nom garde son nom.",
                "Une petite barre de couleur sous le nom signale les <b>doublons</b> (même contenu SHA256) entre le " +
                "pool de remplacements et les fichiers du dossier du projet : une couleur par groupe de fichiers " +
                "identiques.",
                "Un seul fichier peut attendre son remplaçant : tant qu'un fichier coché n'en a pas, les autres " +
                "cases sont grisées ; choisissez son remplaçant en haut ou décochez-le.",
                "Fermer avec un fichier coché sans remplaçant demande <b>Cancel</b> (retour à la galerie) ou " +
                "<b>Continue</b> : ce fichier reste tel quel, les remplacements en attente sont appliqués et la " +
                "fenêtre se ferme (sans question Add ou Replace).",
                "À la fermeture, <b>tous les fichiers de la liste vont dans leur dossier du projet</b> (08.Images, " +
                "12.Video, 14.Video-Audio, 10.Son) : copiés d'ailleurs (l'original reste), déplacés depuis " +
                "<b>Archives</b>, <b>_02</b> ajouté si le nom est pris ; les rognages suivent.",
                "Sélection pleine : un message au-dessus du trait invite à cocher en bas le fichier à remplacer, " +
                "puis à choisir le nouveau en haut.",
                "Quand le dossier <b>Archives</b> du dossier du projet contient des fichiers, un bouton <b>View " +
                "archives</b> apparaît : il passe au vert et les affiche en haut à la place du dossier choisi ; " +
                "un nouveau clic revient au dossier choisi.",
                "<b>Clear</b> est grisé : l'ordre des fichiers du projet ne peut pas être vidé d'un coup ; cochez " +
                "plutôt les fichiers à remplacer.",
                "À la fermeture (Done, ✕, Échap) : de nouveaux fichiers ajoutés à une sélection existante " +
                "demandent <b>Add</b> (garder les fichiers actuels) ou <b>Replace</b> (seuls les nouveaux restent). " +
                "<b>Cancel</b> y annule toutes les modifications faites dans la fenêtre (la sélection revient à " +
                "celle de l'ouverture, les remplacements déjà validés restent) et la ferme.",
            ]) +
            hNote("aucun fichier inutilisé ne reste dans le projet : les fichiers de son dossier qu'aucune liste " +
                "du nœud n'utilise plus partent dans <b>Archives</b> de ce dossier (ex. 08.Images/Archives), après " +
                "confirmation. Cancel dans cette fenêtre revient à la galerie. Rien n'est jamais effacé.", NOTE_FR),
    },
    {
        id: "selection", title: "Sélection",
        html: hList([
            iconBadge(EYE_ICON, VIOLET) + " affiche les fichiers d'une ligne dans leur ordre, avec leur numéro " +
            "et leur sortie.",
            "Cliquez sur une vignette pour voir ses détails (dossier, taille, durée) et l'ouvrir en grand à droite.",
            iconBadge(LEFT_ICON, INACTIVE_BG) + " " + iconBadge(RIGHT_ICON, INACTIVE_BG) + " déplacent un " +
            "fichier d'une place : le numéro 1 sort toujours sur <b>ref_image_1</b> (les câbles restent sur les sorties).",
            iconBadge(TRASH_ICON, INACTIVE_BG) + " sur une vignette la marque (elle devient " +
            iconBadge(TRASH_ICON, MARK_RED) + ") ; <b>Delete</b> retire les fichiers marqués après confirmation.",
            "Les fichiers suivants remontent (la réf 4 devient la réf 3...) et la dernière sortie, devenue " +
            "vide, est retirée.",
        ]) +
        hNote("la " + iconBadge(TRASH_ICON, MARK_RED) + " à côté de " + iconBadge(EYE_ICON, VIOLET) +
            " sur le nœud supprime <b>tous</b> les fichiers de sa ligne, après confirmation.", NOTE_FR),
    },
    {
        id: "trim", title: "Rognage",
        html: hSteps([
            "Ouvrez " + iconBadge(EYE_ICON, VIOLET) + " de <b>Video</b>, <b>Video/Audio</b> ou <b>Audio</b> " +
            "et cliquez sur une vignette.",
            "Dans la fenêtre de visualisation, réglez <b>Start</b> et <b>End</b> : tapez-les, ou utilisez " +
            "<b>Set start</b> / <b>Set end</b> à la position de lecture.",
            "Vérifiez avec <b>Play trim</b>, ou <b>Reset</b> pour garder tout le fichier.",
        ]) +
        hList([
            "Le fichier lui-même n'est jamais modifié : seule cette partie va à la sortie (images et son).",
            "Un fichier rogné porte un badge <b>✂</b> ; le rognage est enregistré dans la configuration " +
            "(<code>\"trim\": [2.5, 8]</code>).",
            "Un avertissement s'affiche si une partie de vidéo dure moins de 2 s, ou si une partie dépasse 15 s.",
        ]),
    },
    {
        id: "overview", title: "Vue d'ensemble",
        html: hList([
            iconBadge(OVERVIEW_ICON, VIOLET) + " affiche toute la sélection du mode affiché dans une seule " +
            "fenêtre, une section par ligne.",
            "Chaque fichier montre son numéro, sa sortie et son badge <b>✂</b>.",
            "Cliquez sur une vignette pour l'ouvrir à droite (image, vidéo ou audio avec son lecteur).",
            "Le rognage est affiché et peut être écouté avec <b>Play trim</b>, mais pas modifié ici.",
            "Grisé tant que le mode affiché n'a aucune référence.",
        ]) +
        hTip("Réordonnez, supprimez et rognez avec l'" + iconBadge(EYE_ICON, VIOLET) + " de chaque ligne.", TIP_FR),
    },
    {
        id: "config", title: "Sauvegarder et charger",
        html: hCard("Fichiers de configuration", [
            [iconBadge(DOWNLOAD_ICON, PINK), "Sauvegarde le mode affiché dans son propre fichier .json : " +
                "<b>REF2VA_minimax_config_yyyyMMdd-HHmmss.json</b> ou <b>FL2VA_...json</b>. Grisé tant que " +
                "le mode n'a aucune référence (le dossier racine seul ne compte pas)."],
            [iconBadge(UPLOAD_ICON, PINK), "Charge un fichier .json du mode affiché et règle ses sorties. " +
                "Il devient " + iconBadge(UPLOAD_ICON, ORANGE) + " quand le mode a déjà des références, " +
                "et demande alors une confirmation."],
        ]) +
        hList([
            "Un fichier de l'autre mode est refusé avec un avertissement ; rien n'est modifié.",
            "L'autre mode et l'interrupteur ne changent jamais ; le dossier racine est repris du fichier.",
            "La date et l'heure dans le nom évitent d'écraser une sauvegarde précédente.",
            "Les fichiers absents du disque sont quand même chargés et signalés sous les boutons.",
            "Les chemins sous le dossier racine sont écrits en relatif ; un groupe vide vaut <code>[]</code> " +
            "ou <code>null</code>.",
        ]) +
        hCode('{\n  "format": "MiniMax H3 Reference Loader",\n  "version": 1,\n  "mode": "REF2VA",\n' +
            '  "root": "F:\\\\Rushs\\\\Project",\n  "images": ["images\\\\a.png"],\n' +
            '  "videos": [{ "path": "rush\\\\shot.mp4", "trim": [5, 7] }],\n  "video_audios": [],\n' +
            '  "audios": []\n}'),
    },
    {
        id: "outputs", title: "Sorties",
        html: hList([
            "Une sortie apparaît pour chaque fichier choisi (au moins une par type).",
            "Double-cliquez sur le nom d'une sortie pour la renommer (vide = nom par défaut), ou utilisez le " +
            "menu du clic droit.",
            "MiniMax numérote ses entrées à partir de 0 : <b>ref_image_1</b> va sur <b>ref_image_0</b>.",
            "MiniMax numérote <b>&lt;Audio j&gt;</b> avec d'abord les bandes-son de vidéo, puis les fichiers " +
            "audio : avec 2 bandes-son, <b>ref_audio_1</b> est <b>&lt;Audio 3&gt;</b>.",
            "Quand <b>ref_video_N</b> et <b>ref_video_audio_N</b> ont tous deux un fichier, leurs points de " +
            "sortie ont la même couleur (1 orange, 2 rose, 3 vert).",
        ]) +
        hNote("MiniMax utilise la piste audio branchée sur <b>ref_video_audio_N</b> avec la vidéo de " +
            "référence branchée sur <b>ref_video_N</b>.", NOTE_FR),
    },
    {
        id: "limits", title: "Limites",
        html: hList([
            "Les vidéos sont lues à 24 i/s, coupées à 15 s et réduites à 768×1344 pixels au plus " +
            "(MiniMax les réduirait de toute façon).",
            "Les fichiers audio sont coupés à 15 s.",
            "<b>Browse</b> utilise la fenêtre de dossiers de Windows ; sur un autre système, tapez ou collez " +
            "le chemin du dossier.",
            "Fonctionne avec le design classique des nœuds et avec <b>Modern Node Design (Nodes 2.0)</b> : le " +
            "renommage des sorties et les couleurs des paires marchent dans les deux.",
        ]),
    },
];

// Textes de la fenetre d'aide et du choix de langue.
const HELP_UI = {
    en: {
        name: "English", title: "Help", search: "Search help...", close: "Close (Esc)", next: "Next: ",
        none: "No result", noneText: (q) => 'No section contains "' + q + '". Try another word.',
        choose: "Select your language", language: "Language",
    },
    fr: {
        name: "français", title: "Aide", search: "Rechercher dans l'aide...", close: "Fermer (Échap)",
        next: "Suivant : ", none: "Aucun résultat",
        noneText: (q) => "Aucune rubrique ne contient « " + q + " ». Essayez un autre mot.",
        choose: "Choisissez votre langue", language: "Langue",
    },
};

/** Rubriques dans une langue : version anglaise si la traduction manque. */
function helpSectionsFor(lang) {
    if (lang !== "fr") return HELP_SECTIONS;
    const fr = Object.fromEntries(HELP_SECTIONS_FR.map((sec) => [sec.id, sec]));
    return HELP_SECTIONS.map((sec) => (fr[sec.id] ? Object.assign({}, sec, fr[sec.id]) : sec));
}

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
        // Rognages par liste : {cle du chemin: [debut, fin]} en secondes.
        trims: { video: {}, video_audio: {}, audio: {} },
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
    const tr = data.trims && typeof data.trims === "object" ? data.trims : {};
    for (const k of TRIM_KINDS) {
        const entries = tr[k] && typeof tr[k] === "object" ? tr[k] : {};
        for (const [key, v] of Object.entries(entries)) {
            if (Array.isArray(v) && v.length === 2 && v[0] >= 0 && v[1] > v[0]) {
                s.trims[k][trimKey(key)] = [Number(v[0]), Number(v[1])];
            }
        }
    }
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

// Derniere sortie : le Root folder, pour le noeud MiniMax H3 Project
// (identique a media.PROJECT_KEY ; Python renvoie sa valeur a cette position).
const PROJECT_KEY = "project";
const PROJECT_TYPE = "MINIMAX_PROJECT";

/** Sorties affichees : celles du mode puis project (identique a media.output_names). */
function outputNames(state) {
    return stateLayout(state).concat([PROJECT_KEY]);
}

function slotType(key) {
    if (key === PROJECT_KEY) return PROJECT_TYPE;
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

/**
 * Liens d'une sortie retiree (selection reduite, meme un instant) : gardes
 * en memoire par nom de sortie (jamais enregistres dans le workflow), puis
 * rebranches quand la sortie revient, si l'entree en aval est encore libre.
 */
function rememberLinks(node, name, links) {
    const graph = node.graph;
    const list = links.map((l) => {
        const t = graph && graph.getNodeById ? graph.getNodeById(l.target_id) : null;
        const inp = t && t.inputs ? t.inputs[l.target_slot] : null;
        return { id: l.target_id, slot: l.target_slot, input: inp ? inp.name : null };
    });
    if (!list.length) return;
    node.__mmLostLinks = node.__mmLostLinks || {};
    node.__mmLostLinks[name] = list;
}

function restoreLinks(node) {
    const lost = node.__mmLostLinks;
    const graph = node.graph;
    if (!lost || !graph) return;
    node.outputs.forEach((o, i) => {
        const list = lost[o.name];
        if (!list) return;
        delete lost[o.name];
        // Sortie deja rebranchee a la main : on ne touche a rien.
        if (outputLinksOf(node, i).length) return;
        list.forEach((t) => {
            const target = graph.getNodeById ? graph.getNodeById(t.id) : null;
            if (!target || !target.inputs) return;
            let slot = t.input ? target.inputs.findIndex((x) => x.name === t.input) : -1;
            if (slot < 0) slot = t.slot;
            const inp = target.inputs[slot];
            if (!inp || inp.link != null) return; // entree prise entre-temps
            try {
                node.connect(i, target, slot);
            } catch (e) {
                console.warn("[MiniMaxRefLoader] relink", o.name, e);
            }
        });
    });
}

/** Previent les noeuds MiniMax H3 Project du graphe (Root folder change). */
function notifyProjectNodes(node) {
    const graph = node.graph;
    const nodes = (graph && (graph._nodes || graph.nodes)) || [];
    nodes.forEach((n) => {
        if (n && typeof n.__mmprojectRefresh === "function") n.__mmprojectRefresh();
    });
}

/**
 * relink = false a la creation du noeud : il n'a encore aucun lien a lui,
 * mais au chargement d'un workflow le graphe contient deja les liens
 * enregistres sous son id (charges avant les noeuds). Les renumeroter ici,
 * avec l'etat par defaut, deplacait les noeuds en aval (ref_image_2 et 3
 * passaient sur ref_video_1 et ref_video_audio_1) ; configure() remet
 * ensuite les sorties enregistrees.
 */
function applyLayout(node, state, relink = true) {
    const keys = outputNames(state);
    const same = node.outputs.length === keys.length && node.outputs.every((o, i) => o.name === keys[i]);
    if (!same) {
        if (relink) {
            for (let i = node.outputs.length - 1; i >= 0; i--) {
                if (!keys.includes(node.outputs[i].name) && node.isOutputConnected(i)) {
                    rememberLinks(node, node.outputs[i].name, outputLinksOf(node, i));
                    node.disconnectOutput(i);
                }
            }
        }
        // Instantane des sorties conservees : etiquette et objets lien.
        const saved = {};
        node.outputs.forEach((o, i) => {
            if (keys.includes(o.name)) saved[o.name] = { label: o.label, links: relink ? outputLinksOf(node, i) : [] };
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
    // Apres les types : une sortie qui etait AUDIO refuserait une entree IMAGE.
    if (!same && relink) restoreLinks(node);
    const min = node.computeSize();
    // La hauteur suit le contenu (elle rapetisse quand des sorties disparaissent).
    node.setSize([Math.max(node.size[0], MIN_WIDTH), min[1]]);
    node.setDirtyCanvas(true, true);
    scheduleVueSync();
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
    let scale = ds.scale || 1;
    let box;
    const label = vueOutputLabel(node, i);
    if (label) {
        // Nodes 2.0 : la sortie est un element DOM, on se cale sur son etiquette.
        const lr = label.closest(".lg-slot").getBoundingClientRect();
        const w = Math.max(lr.width * 0.6, 120);
        box = { left: lr.right - w, top: lr.top, width: w, height: lr.height };
        scale = Math.max(lr.height / 20, 0.5);
    } else {
        const canvasRect = app.canvas.canvas.getBoundingClientRect();
        const r = outputLabelRect(node, i);
        box = {
            left: canvasRect.left + (node.pos[0] + r.x + ds.offset[0]) * scale,
            top: canvasRect.top + (node.pos[1] + r.y + ds.offset[1]) * scale,
            width: r.w * scale,
            height: r.h * scale,
        };
    }

    const input = document.createElement("input");
    input.type = "text";
    input.value = out.label || out.name;
    input.placeholder = out.name;
    Object.assign(input.style, {
        position: "fixed",
        left: box.left + "px",
        top: box.top + "px",
        width: box.width + "px",
        height: box.height + "px",
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
// Nodes 2.0 (rendu Vue des noeuds) : les sorties sont des elements DOM et
// ignorent color_on/color_off ; le widget cache "state" y apparait comme
// une entree. En mode classique, rien de ce qui suit ne s'execute.
// --------------------------------------------------------------------
const vueMode = () => !!(window.LiteGraph && window.LiteGraph.vueNodesMode);
const vueNodes = new Set(); // noeuds MiniMax du graphe
const vueNodeEl = (node) => document.querySelector('[data-node-id="' + node.id + '"]');
const vueSlotDot = (el, node, dir, i) => el.querySelector('[data-slot-key="' + node.id + "-" + dir + "-" + i + '"]');

/** Etiquette DOM de la sortie i (Nodes 2.0), ou null en mode classique. */
function vueOutputLabel(node, i) {
    if (!vueMode()) return null;
    const el = vueNodeEl(node);
    const dot = el && vueSlotDot(el, node, "out", i);
    const slot = dot && dot.closest(".lg-slot");
    return slot ? slot.querySelector(".text-node-component-slot-text") || slot : null;
}

/** Cache l'entree "state" et colore les points des paires (Nodes 2.0). */
function syncVueNode(node) {
    const el = vueNodeEl(node);
    if (!el) return;
    (node.inputs || []).forEach((inp, i) => {
        if (inp.name !== "state") return;
        const slot = vueSlotDot(el, node, "in", i);
        const row = slot && slot.closest(".lg-slot");
        if (row && row.style.display !== "none") row.style.display = "none";
    });
    (node.outputs || []).forEach((o, i) => {
        const dot = vueSlotDot(el, node, "out", i);
        if (!dot) return;
        // Sans paire : la couleur du type, comme le rendu Vue par defaut.
        const want = o.color_on || (dot.dataset.mmrefPaint ? "var(--color-datatype-" + o.type + ", #AAA)" : "");
        if (!want) return;
        dot.dataset.mmrefPaint = "1";
        // Ecrire seulement si la couleur voulue change, ou si Vue a remis
        // la couleur du type (une variable CSS) a la place de la notre.
        const reset = !want.startsWith("var(") && dot.style.backgroundColor.startsWith("var(");
        if (dot.dataset.mmrefColor !== want || reset) {
            dot.dataset.mmrefColor = want;
            dot.style.backgroundColor = want;
        }
    });
    if (el.__mmrefWired) return;
    el.__mmrefWired = true;
    // Vue reecrit le style des points : repeindre a chaque changement.
    new MutationObserver(scheduleVueSync).observe(el, {
        subtree: true, childList: true, attributes: true, attributeFilter: ["style"],
    });
    // Double-clic sur le nom d'une sortie : renommer.
    el.addEventListener("dblclick", (e) => {
        const slot = e.target.closest && e.target.closest(".lg-slot--output");
        if (!slot || !el.contains(slot)) return;
        const dot = slot.querySelector("[data-slot-key]");
        const m = dot && dot.dataset.slotKey.match(/-out-(\d+)$/);
        if (!m) return;
        e.preventDefault();
        e.stopPropagation();
        openOutputLabelEditor(node, Number(m[1]));
    }, true);
}

let vueSyncPending = false;
function scheduleVueSync() {
    if (vueSyncPending || !vueMode()) return;
    vueSyncPending = true;
    // Minuteur plutot que requestAnimationFrame (suspendu quand l'onglet est cache).
    setTimeout(() => {
        vueSyncPending = false;
        vueNodes.forEach(syncVueNode);
    }, 16);
}

// Les elements des noeuds apparaissent (ou sont recrees) apres coup.
let vueWatcher = null;
function watchVueNodes() {
    if (vueWatcher) return;
    vueWatcher = new MutationObserver(() => {
        if (vueMode() && vueNodes.size) scheduleVueSync();
    });
    vueWatcher.observe(document.body, { childList: true, subtree: true });
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

async function apiPost(url, body) {
    const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
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
/**
 * opts (facultatif, pour un autre noeud) : sectionsFor(lang) = rubriques,
 * nodeTitle = nom dans le titre, sectionKey = cle localStorage de la
 * derniere rubrique consultee.
 */
function buildHelpOverlay(container, opts) {
    const o = Object.assign({
        sectionsFor: helpSectionsFor, nodeTitle: "MiniMax H3 Reference Loader", sectionKey: HELP_SECTION_KEY,
    }, opts);
    const { overlay, card } = makeOverlay();
    Object.assign(card.style, {
        width: "min(760px, 94vw)", height: "min(560px, 84vh)", display: "flex", flexDirection: "column",
        overflow: "hidden", padding: "0", borderColor: PINK,
    });

    // En-tete : titre, recherche, fermeture.
    const header = document.createElement("div");
    Object.assign(header.style, {
        display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderBottom: "1px solid #333",
    });
    const badge = document.createElement("span");
    badge.textContent = "?";
    Object.assign(badge.style, {
        width: "20px", height: "20px", borderRadius: "50%", background: PINK, color: "white",
        fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto",
    });
    const title = document.createElement("div");
    Object.assign(title.style, {
        fontWeight: "bold", fontSize: "14px", color: TITLE_COLOR, flex: "1", whiteSpace: "nowrap",
        overflow: "hidden", textOverflow: "ellipsis",
    });
    const search = document.createElement("input");
    search.type = "search";
    Object.assign(search.style, {
        width: "170px", background: "#111", color: "#ddd", border: "1px solid #0c3833", borderRadius: "8px",
        padding: "4px 8px", fontSize: "12px", outline: "none", boxSizing: "border-box",
    });
    const closeBtn = makeIconButton(INACTIVE_BG, CLOSE_ICON, "Close (Esc)");

    // Bouton de langue (globe + code) et sa fenetre de choix.
    const langBtn = document.createElement("button");
    langBtn.type = "button";
    Object.assign(langBtn.style, {
        display: "flex", alignItems: "center", gap: "6px", background: "#111", color: "#ddd",
        border: "1px solid #0c3833", borderRadius: "8px", padding: "3px 9px", cursor: "pointer",
        fontSize: "12px", fontWeight: "bold", flex: "0 0 auto",
    });
    header.append(badge, title, langBtn, search, closeBtn);

    const langPop = document.createElement("div");
    Object.assign(langPop.style, {
        position: "absolute", display: "none", zIndex: "2", background: "#202020", color: "#ddd",
        border: "1px solid #3a3a3a", borderRadius: "8px", boxShadow: "0 10px 28px rgba(0,0,0,0.6)",
        padding: "16px 20px 18px", width: "320px", boxSizing: "border-box",
    });
    const langArrow = document.createElement("div");
    Object.assign(langArrow.style, {
        position: "absolute", top: "-7px", width: "12px", height: "12px", background: "#202020",
        borderLeft: "1px solid #3a3a3a", borderTop: "1px solid #3a3a3a", transform: "rotate(45deg)",
    });
    const langHead = document.createElement("div");
    Object.assign(langHead.style, { display: "flex", alignItems: "center", marginBottom: "12px" });
    const langTitle = document.createElement("div");
    Object.assign(langTitle.style, { flex: "1", fontSize: "16px", color: "#eee" });
    const langClose = makeIconButton("transparent", CLOSE_ICON, "Close");
    langHead.append(langTitle, langClose);
    const langGrid = document.createElement("div");
    Object.assign(langGrid.style, { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" });
    langPop.append(langArrow, langHead, langGrid);
    card.style.position = card.style.position || "fixed";
    card.appendChild(langPop);

    // Menu des rubriques a gauche, rubrique affichee a droite.
    const main = document.createElement("div");
    Object.assign(main.style, { flex: "1", minHeight: "0", display: "flex" });
    const nav = document.createElement("div");
    Object.assign(nav.style, {
        flex: "0 0 180px", borderRight: "1px solid #333", background: "#181818", padding: "8px 6px",
        overflowY: "auto", boxSizing: "border-box",
    });
    const content = document.createElement("div");
    Object.assign(content.style, {
        flex: "1", minWidth: "0", overflowY: "auto", padding: "14px 18px", lineHeight: "1.55",
        boxSizing: "border-box",
    });
    main.append(nav, content);

    // Pied : precedente / position / suivante.
    const footer = document.createElement("div");
    Object.assign(footer.style, {
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
        padding: "8px 14px", borderTop: "1px solid #333",
    });
    const navLink = () => {
        const b = document.createElement("button");
        b.type = "button";
        Object.assign(b.style, {
            background: "none", border: "none", color: TITLE_COLOR, cursor: "pointer", fontSize: "12px",
            padding: "2px 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        });
        return b;
    };
    const prevBtn = navLink();
    const nextBtn = navLink();
    const position = document.createElement("span");
    position.style.color = "#888";
    footer.append(prevBtn, position, nextBtn);
    card.append(header, main, footer);

    let lang = loadHelpLanguage();
    let sections = o.sectionsFor(lang);
    let byId = Object.fromEntries(sections.map((sec) => [sec.id, sec]));
    let visible = sections.map((sec) => sec.id);
    let currentId = loadHelpSection(o.sectionKey, sections[0].id);

    /** Textes de la fenetre dans la langue choisie. */
    function applyLanguage() {
        const ui = HELP_UI[lang];
        sections = o.sectionsFor(lang);
        byId = Object.fromEntries(sections.map((sec) => [sec.id, sec]));
        visible = filterSections(sections, search.value);
        if (visible.length && !visible.includes(currentId)) currentId = visible[0];
        title.textContent = o.nodeTitle + " — " + ui.title;
        search.placeholder = ui.search;
        closeBtn.title = ui.close;
        langBtn.innerHTML = GLOBE_ICON + "<span>" + lang.toUpperCase() + "</span>";
        langBtn.title = ui.language;
        langTitle.textContent = ui.choose;
        langClose.title = ui.close;
        langGrid.innerHTML = "";
        for (const code of HELP_LANGUAGES) {
            const active = code === lang;
            const item = document.createElement("button");
            item.type = "button";
            Object.assign(item.style, {
                display: "flex", alignItems: "center", gap: "10px", textAlign: "left", border: "none",
                borderLeft: "3px solid " + (active ? TITLE_COLOR : "transparent"), borderRadius: "0",
                padding: "7px 10px", cursor: active ? "default" : "pointer", fontSize: "14px",
                background: active ? "#173a37" : "transparent",
            });
            item.innerHTML = '<span style="color:#eee;font-weight:' + (active ? "bold" : "normal") +
                ';min-width:22px">' + code.toUpperCase() + '</span><span style="color:' +
                (active ? "#eee" : "#7fb8ff") + '">' + HELP_UI[code].name + "</span>";
            item.addEventListener("mouseenter", () => {
                if (!active) item.style.background = "#2a2a2a";
            });
            item.addEventListener("mouseleave", () => {
                if (!active) item.style.background = "transparent";
            });
            item.addEventListener("click", () => {
                closeLangPop();
                if (active) return;
                lang = code;
                saveHelpLanguage(code);
                applyLanguage();
                renderNav();
                renderContent();
            });
            langGrid.appendChild(item);
        }
    }

    // Fenetre de langue sous le bouton, fleche pointee sur lui.
    function openLangPop() {
        langPop.style.display = "block";
        const c = card.getBoundingClientRect();
        const b = langBtn.getBoundingClientRect();
        const w = langPop.offsetWidth;
        const left = Math.max(8, Math.min(b.left + b.width / 2 - w / 2 - c.left, c.width - w - 8));
        langPop.style.left = left + "px";
        langPop.style.top = (b.bottom - c.top + 10) + "px";
        langArrow.style.left = (b.left + b.width / 2 - c.left - left - 6) + "px";
    }
    function closeLangPop() {
        langPop.style.display = "none";
    }
    const langOpen = () => langPop.style.display !== "none";
    langBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (langOpen()) closeLangPop();
        else openLangPop();
    });
    langClose.addEventListener("click", closeLangPop);
    langPop.addEventListener("mousedown", (e) => e.stopPropagation());
    card.addEventListener("mousedown", (e) => {
        if (langOpen() && !langPop.contains(e.target) && !langBtn.contains(e.target)) closeLangPop();
    });

    /** Surligne les mots de la recherche dans les textes de root. */
    function highlight(root, words) {
        if (!words.length) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const node of nodes) {
            const text = node.nodeValue;
            const matches = findMatches(text, words); // sans casse ni accents
            if (!matches.length) continue;
            const frag = document.createDocumentFragment();
            let pos = 0;
            for (const [a, b] of matches) {
                if (a > pos) frag.appendChild(document.createTextNode(text.slice(pos, a)));
                const mark = document.createElement("mark");
                mark.textContent = text.slice(a, b);
                Object.assign(mark.style, { background: ORANGE, color: "white", borderRadius: "3px", padding: "0 1px" });
                frag.appendChild(mark);
                pos = b;
            }
            if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
            node.parentNode.replaceChild(frag, node);
        }
    }

    function renderNav() {
        nav.innerHTML = "";
        if (!visible.length) {
            const none = document.createElement("div");
            none.textContent = HELP_UI[lang].none;
            Object.assign(none.style, { color: "#888", padding: "6px 8px" });
            nav.appendChild(none);
        }
        for (const id of visible) {
            const sec = byId[id];
            const active = id === currentId;
            const item = document.createElement("button");
            item.type = "button";
            Object.assign(item.style, {
                display: "flex", alignItems: "center", gap: "8px", width: "100%", textAlign: "left",
                border: "none", borderRadius: "6px", padding: "5px 8px", margin: "0 0 2px", cursor: "pointer",
                fontSize: "12px", background: active ? TITLE_COLOR : "transparent",
                color: active ? "white" : "#ccc", fontWeight: active ? "bold" : "normal",
            });
            item.innerHTML = iconBadge(sec.icon, sec.color) + "<span>" + sec.title + "</span>";
            item.addEventListener("mouseenter", () => {
                if (id !== currentId) item.style.background = "#262626";
            });
            item.addEventListener("mouseleave", () => {
                if (id !== currentId) item.style.background = "transparent";
            });
            item.addEventListener("click", () => select(id));
            nav.appendChild(item);
        }
    }

    function renderContent() {
        const sec = byId[currentId];
        content.scrollTop = 0;
        if (!visible.length) {
            content.innerHTML = '<div style="color:#888">' + HELP_UI[lang].noneText(escapeHtml(search.value.trim())) +
                "</div>";
        } else {
            content.innerHTML = '<div style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:bold;' +
                "color:" + PINK + ';margin-bottom:10px">' + iconBadge(sec.icon, sec.color) + sec.title + "</div>" +
                sec.html;
            highlight(content, queryWords(search.value));
        }
        const i = visible.indexOf(currentId);
        const prev = i > 0 ? byId[visible[i - 1]] : null;
        const next = i >= 0 && i < visible.length - 1 ? byId[visible[i + 1]] : null;
        prevBtn.textContent = prev ? "‹ " + prev.title : "";
        prevBtn.style.visibility = prev ? "visible" : "hidden";
        nextBtn.textContent = next ? HELP_UI[lang].next + next.title + " ›" : "";
        nextBtn.style.visibility = next ? "visible" : "hidden";
        position.textContent = visible.length ? i + 1 + " / " + visible.length : "";
    }

    function select(id) {
        currentId = id;
        saveHelpSection(o.sectionKey, id);
        renderNav();
        renderContent();
    }

    function step(delta) {
        const i = visible.indexOf(currentId);
        const j = i + delta;
        if (i >= 0 && j >= 0 && j < visible.length) select(visible[j]);
    }

    prevBtn.addEventListener("click", () => step(-1));
    nextBtn.addEventListener("click", () => step(+1));
    search.addEventListener("input", () => {
        visible = filterSections(sections, search.value);
        if (visible.length && !visible.includes(currentId)) currentId = visible[0];
        renderNav();
        renderContent();
    });

    // Echap ferme ; fleches = rubrique precedente / suivante (hors champ de
    // recherche) ; les touches ne vont pas au canvas (Suppr...).
    const onKey = (e) => {
        if (overlay.style.display === "none") return;
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (langOpen()) closeLangPop();
            else close();
            return;
        }
        if (e.target !== search && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
            e.preventDefault();
            e.stopImmediatePropagation();
            step(e.key === "ArrowLeft" ? -1 : +1);
            return;
        }
        if (card.contains(e.target)) e.stopImmediatePropagation();
    };

    function close() {
        closeLangPop();
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
    }

    closeBtn.addEventListener("click", close);
    overlay.addEventListener("mousedown", close);
    return {
        open() {
            search.value = "";
            if (!byId[currentId]) currentId = sections[0].id;
            applyLanguage();
            renderNav();
            renderContent();
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            positionCardNextToNode(card, container, 760);
        },
        close,
        remove() {
            close();
            overlay.remove();
        },
    };
}

// Langue de l'aide : choix memorise, sinon langue de ComfyUI, sinon navigateur.
const HELP_LANG_KEY = "mmrefloader.helpLanguage";
function loadHelpLanguage() {
    let saved = null;
    let comfy = null;
    try {
        saved = localStorage.getItem(HELP_LANG_KEY);
    } catch (e) {
        saved = null;
    }
    try {
        comfy = app.ui.settings.getSettingValue("Comfy.Locale");
    } catch (e) {
        comfy = null;
    }
    return pickLanguage(saved, comfy, navigator.language);
}
function saveHelpLanguage(code) {
    try {
        localStorage.setItem(HELP_LANG_KEY, code);
    } catch (e) {
        // Stockage indisponible : la langue revient au choix par defaut.
    }
}

// Derniere rubrique consultee (memoire du navigateur, facultative), par noeud.
const HELP_SECTION_KEY = "mmrefloader.helpSection";
const helpSections = {};
function loadHelpSection(key, first) {
    if (helpSections[key]) return helpSections[key];
    try {
        helpSections[key] = localStorage.getItem(key);
    } catch (e) {
        helpSections[key] = null;
    }
    return helpSections[key] || first;
}
function saveHelpSection(key, id) {
    helpSections[key] = id;
    try {
        localStorage.setItem(key, id);
    } catch (e) {
        // Stockage indisponible : la rubrique est gardee pour cette session.
    }
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

    // ------ Barre de rognage (videos et audios de la fenetre oeil) ------
    const trimBar = document.createElement("div");
    Object.assign(trimBar.style, {
        display: "none", flexWrap: "wrap", alignItems: "center", gap: "6px", padding: "0 10px 10px",
    });
    side.appendChild(trimBar);
    const numField = (tip) => {
        const f = document.createElement("input");
        f.type = "number";
        f.step = "0.1";
        f.min = "0";
        f.title = tip;
        Object.assign(f.style, {
            width: "64px", background: "#111", color: "#ddd", border: "1px solid #0c3833", borderRadius: "8px",
            padding: "3px 6px", fontSize: "12px", outline: "none", boxSizing: "border-box",
        });
        return f;
    };
    const smallBtn = (text, bg, tip) => {
        const b = makeTextButton(text, bg);
        b.title = tip;
        Object.assign(b.style, { padding: "4px 8px", fontSize: "11px" });
        return b;
    };
    const label = (text) => {
        const l = document.createElement("span");
        l.textContent = text;
        l.style.color = "#9fd6cf";
        return l;
    };
    const startField = numField("Start of the part kept (seconds)");
    const endField = numField("End of the part kept (seconds)");
    const setStartBtn = smallBtn("⟦ Set start", VIOLET, "Start = current playback position");
    const setEndBtn = smallBtn("Set end ⟧", VIOLET, "End = current playback position");
    const playTrimBtn = smallBtn("▶ Play trim", GREEN, "Play only the part kept");
    const resetTrimBtn = smallBtn("Reset", INACTIVE_BG, "Keep the whole file");
    const trimInfo = document.createElement("span");
    Object.assign(trimInfo.style, { flex: "1 1 100%", color: "#bbb" });
    trimBar.append(label("✂ Start"), startField, setStartBtn, label("End"), endField, setEndBtn,
        playTrimBtn, resetTrimBtn, trimInfo);

    let media = null;     // element video / audio affiche
    let trimCtx = null;   // { range, onChange, isVideo }
    let stopAt = null;    // fin de la lecture "Play trim"

    const duration = () => (media && isFinite(media.duration) ? media.duration : null);

    function trimValues() {
        const d = duration();
        const r = trimCtx.range;
        return { start: r ? r[0] : 0, end: r ? r[1] : d };
    }

    function updateTrimUI() {
        if (!trimCtx) return;
        const d = duration();
        const { start, end } = trimValues();
        startField.value = fmtSec(start);
        endField.value = end != null ? fmtSec(end) : "";
        if (d != null) {
            startField.max = String(d);
            endField.max = String(d);
        }
        if (end == null) {
            trimInfo.textContent = "Loading...";
            return;
        }
        const kept = end - start;
        let text = (trimCtx.range ? "Trimmed: " : "Whole file: ") + fmtSec(kept) + " s kept" +
            (d != null ? " of " + fmtSec(d) + " s" : "");
        let warn = "";
        if (kept > 15) warn = "only the first 15 s are used";
        else if (trimCtx.isVideo && kept < 2) warn = "MiniMax expects 2 to 15 s";
        trimInfo.textContent = text + (warn ? "  —  ⚠ " + warn : "") +
            (trimCtx.readOnly ? "  (view only)" : "");
        trimInfo.style.color = warn ? ORANGE : "#bbb";
    }

    /** Enregistre le rognage ; [0, duree] (fichier entier) = pas de rognage. */
    function commitTrim(start, end) {
        const d = duration();
        if (d == null) return;
        start = Math.max(0, Math.min(Number(start) || 0, d));
        end = Math.max(0, Math.min(end === "" || end == null ? d : Number(end), d));
        if (end <= start) end = Math.min(d, start + 0.1);
        if (end <= start) start = Math.max(0, end - 0.1);
        const whole = start <= 0.01 && end >= d - 0.05;
        const range = whole ? null : [Number(start.toFixed(3)), Number(end.toFixed(3))];
        trimCtx.range = range;
        trimCtx.onChange(range);
        updateTrimUI();
    }

    startField.addEventListener("change", () => commitTrim(startField.value, trimValues().end));
    endField.addEventListener("change", () => commitTrim(trimValues().start, endField.value));
    setStartBtn.addEventListener("click", () => media && commitTrim(media.currentTime, trimValues().end));
    setEndBtn.addEventListener("click", () => media && commitTrim(trimValues().start, media.currentTime));
    resetTrimBtn.addEventListener("click", () => {
        if (!trimCtx) return;
        trimCtx.range = null;
        trimCtx.onChange(null);
        updateTrimUI();
    });
    playTrimBtn.addEventListener("click", () => {
        if (!media || duration() == null) return;
        const { start, end } = trimValues();
        stopAt = end;
        media.currentTime = start;
        media.play();
    });

    // Touches tapees dans les champs : ne pas les laisser au canvas (Suppr...).
    const onKey = (e) => {
        if (side.style.display !== "none" && e.key !== "Escape" && side.contains(e.target)) {
            e.stopImmediatePropagation();
        }
    };

    /**
     * show(path, fileKind, sousTitre, trim) : image, video ou audio avec son
     * lecteur. trim = { range: [debut, fin] | null, onChange(range | null),
     * readOnly } affiche la barre de rognage (videos et audios seulement) ;
     * readOnly : valeurs non modifiables, seul Play trim reste.
     */
    function show(path, fk, sub, trim) {
        body.innerHTML = "";
        stopAt = null;
        let el;
        if (fk === "image") {
            el = document.createElement("img");
        } else {
            el = document.createElement(fk === "audio" ? "audio" : "video");
            el.controls = true;
            el.preload = "metadata";
        }
        el.src = "/mmrefloader/media?file=" + encodeURIComponent(path);
        Object.assign(el.style, fk === "audio"
            ? { width: "95%" }
            : { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" });
        body.appendChild(el);
        media = fk === "image" ? null : el;
        trimCtx = trim && media
            ? { range: trim.range, onChange: trim.onChange, isVideo: fk === "video", readOnly: !!trim.readOnly }
            : null;
        trimBar.style.display = trimCtx ? "flex" : "none";
        // Lecture seule (vue d'ensemble) : rognage affiche, seul Play trim reste.
        const ro = !!(trimCtx && trimCtx.readOnly);
        startField.disabled = ro;
        endField.disabled = ro;
        [setStartBtn, setEndBtn, resetTrimBtn].forEach((b) => (b.style.display = ro ? "none" : ""));
        if (media) {
            media.addEventListener("loadedmetadata", () => {
                updateTrimUI();
                if (trimCtx && trimCtx.range) media.currentTime = trimCtx.range[0];
            });
            media.addEventListener("timeupdate", () => {
                if (stopAt != null && media.currentTime >= stopAt) {
                    media.pause();
                    stopAt = null;
                }
            });
        }
        updateTrimUI();
        title.textContent = baseName(path);
        title.title = path;
        subtitle.textContent = sub || "";
        side.style.display = "flex";
        window.addEventListener("keydown", onKey, true);
        place();
    }

    function hide() {
        side.style.display = "none";
        body.innerHTML = ""; // arrete une lecture en cours
        media = null;
        trimCtx = null;
        window.removeEventListener("keydown", onKey, true);
    }

    closeBtn.addEventListener("click", hide);
    return { show, hide, isOpen: () => side.style.display !== "none" };
}

// --------------------------------------------------------------------
// Petite fenetre de choix centree sur la galerie (Add / Replace, Archives)
// --------------------------------------------------------------------
/** ask(anchor, {title, html, buttons: [{label, color, value}]}) -> Promise<value | null> (Echap, clic a cote = null). */
function buildChoiceDialog() {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, { position: "fixed", inset: "0", background: "transparent", zIndex: "10002", display: "none" });
    const card = document.createElement("div");
    Object.assign(card.style, {
        position: "fixed", width: "min(400px, 90vw)", background: "#1e1e1e", color: "#ddd",
        border: "1px solid " + ORANGE, borderRadius: "10px", boxShadow: "0 8px 28px rgba(0,0,0,0.7)",
        padding: "14px 16px", fontFamily: "sans-serif", fontSize: "12px", boxSizing: "border-box",
    });
    const title = document.createElement("div");
    Object.assign(title.style, { fontWeight: "bold", fontSize: "13px", color: TITLE_COLOR, marginBottom: "8px" });
    const text = document.createElement("div");
    Object.assign(text.style, { lineHeight: "1.5", wordBreak: "break-word" });
    const btns = document.createElement("div");
    Object.assign(btns.style, { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "14px" });
    card.append(title, text, btns);
    card.addEventListener("mousedown", (e) => e.stopPropagation());
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    let resolve = null;
    const onKey = (e) => {
        if (overlay.style.display === "none" || e.key !== "Escape") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        finish(null);
    };
    function finish(value) {
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
        const r = resolve;
        resolve = null;
        if (r) r(value);
    }
    overlay.addEventListener("mousedown", () => finish(null));

    return {
        ask(anchor, opts) {
            if (resolve) finish(null);
            title.textContent = opts.title || "";
            text.innerHTML = opts.html || "";
            btns.innerHTML = "";
            for (const b of opts.buttons) {
                const btn = makeTextButton(b.label, b.color || INACTIVE_BG);
                btn.addEventListener("click", () => finish(b.value));
                btns.appendChild(btn);
            }
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            let r = anchor.getBoundingClientRect();
            if (!r.width) r = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
            card.style.left = Math.max(8, r.left + (r.width - card.offsetWidth) / 2) + "px";
            card.style.top = Math.max(8, r.top + (r.height - card.offsetHeight) / 2) + "px";
            return new Promise((res) => (resolve = res));
        },
        remove() {
            finish(null);
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
    let files = [];
    let base = "";     // champ Root folder (dossier racine, ou dossier propre a la galerie)
    let sub = "";      // sous-dossier relatif a base ; "" = base elle-meme
    let subfolders = []; // [{path, count}] reperes sous base (liste deroulante)
    let scanId = 0;      // ignore les reponses d'un reperage depasse
    // Sortie project reliee a un projet choisi : zone du dossier du projet sous
    // le dossier choisi. project = {name, path} ; projFolder = 08.Images, etc.
    let project = null;
    let projFolder = "";
    let projDir = "";
    let projFiles = [];  // fichiers du dossier du projet (tous types)
    let initial = [];    // selection a l'ouverture (Add / Replace a la fermeture)
    // Fichiers du projet coches = a remplacer, dans l'ordre ou ils ont ete coches :
    // le prochain fichier choisi prend la place (le numero) du premier.
    let marked = [];
    // Remplacements en attente (pool) : {path, old, f, folder}. Le remplacant
    // prend le numero de old a la validation ; old part alors dans Archives.
    let pool = [];
    // Doublons (pool + dossier du projet) : SHA256 connus et couleur par chemin.
    let hashes = {};
    let dupColors = {};
    let hashing = false;
    const inPool = (path) => pool.some((it) => samePath(it.path, path));
    const poolOf = (old) => pool.find((it) => samePath(it.old, old));
    // Archives du dossier du projet : bouton "View archives" (vert = affichees a la
    // place du dossier choisi, dans la zone du haut).
    let archFiles = [];
    let showArchives = false;
    const archDir = () => (projDir ? joinPath(projDir, "Archives") : "");
    let closing = false;
    const choice = buildChoiceDialog();

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
        // Lignes a la hauteur de leur contenu : la grille defile au lieu d'ecraser les vignettes.
        gridAutoRows: "max-content", gap: "8px", alignContent: "start",
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
        if (!canPick(kind, f.kind)) {
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
            : usable ? "Subfolders of the root folder (number of " + (kind === "audio" ? "audio or video" : fileKind(kind)) + " files after the name)"
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
            // Galerie Audio : les videos comptent aussi (son seul).
            if (kind === "audio") {
                const vids = await apiGet("/mmrefloader/subfolders?path=" + encodeURIComponent(scanned) +
                    "&kind=video&all=1");
                if (id !== scanId || scanned !== base) return;
                const byPath = new Map((vids.subfolders || []).map((e) => [e.path, e.count || 0]));
                subfolders = subfolders.map((e) => ({ path: e.path, count: (e.count || 0) + (byPath.get(e.path) || 0) }));
            }
            if (announce === true) {
                const n = subfolders.filter((e) => e.path).length;
                const withFiles = subfolders.filter((e) => e.path && e.count).length;
                status.textContent = n
                    ? n + " subfolder" + (n > 1 ? "s" : "") + " found, " + withFiles + " with " + (kind === "audio" ? "audio or video" : fileKind(kind)) + " files."
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

    async function toggle(path, f, folder) {
        if (inPool(path)) return; // deja en attente de remplacement
        // Son seul : une video sans bande-son est refusee des la galerie.
        const s0 = ctx.getState();
        const room = list(s0).length < LIMITS[kind] || marked.length > 0;
        if (soundOnly(kind, path) && indexOf(path, s0) < 0 && room) {
            try {
                const info = await apiGet("/mmrefloader/info?file=" + encodeURIComponent(path));
                if (!info.has_audio) {
                    status.textContent = "No soundtrack in this video: " + baseName(path);
                    return;
                }
            } catch (e) {
                status.textContent = e.message;
                return;
            }
        }
        const s = ctx.getState();
        const arr = list(s);
        const idx = indexOf(path, s);
        if (idx >= 0) {
            arr.splice(idx, 1);
        } else if (marked.length) {
            // Fichier du projet coche : le nouveau va dans le pool (pas de changement
            // immediat) ; il prendra la place et le numero de l'ancien a la validation.
            pool.push({ path, old: marked.shift(), f, folder });
            render();
            return;
        } else if (arr.length < LIMITS[kind]) {
            arr.push(path);
        } else if (LIMITS[kind] === 1) {
            arr[0] = path; // une seule image : elle est remplacee
        } else {
            if (project) status.textContent = "The selection is full: check below the file to replace.";
            return;
        }
        ctx.setState(s);
        marked = marked.filter((m) => indexOf(m) >= 0);
        render();
    }

    /** Coche / decoche un fichier du projet a remplacer. */
    function toggleMark(path) {
        const i = marked.findIndex((m) => samePath(m, path));
        if (i >= 0) marked.splice(i, 1);
        else if (!marked.length) marked.push(path); // une seule a la fois (choix utilisateur)
        render();
    }

    // ------ Affichage ------
    function updateCounters() {
        const arr = list();
        counter.textContent = arr.length + " / " + LIMITS[kind] + " selected";
        const folder = currentFolder();
        const shown = (it) => (folder && files.some((f) => canPick(kind, f.kind) && samePath(joinPath(folder, f.name), it))) ||
            (project && projFiles.some((f) => canPick(kind, f.kind) && samePath(joinPath(projDir, f.name), it))) ||
            (showArchives && archFiles.some((f) => canPick(kind, f.kind) && samePath(joinPath(archDir(), f.name), it)));
        const elsewhere = arr.filter((it) => !shown(it)).length;
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
    function makeTile(f, folder, full, inProject) {
        const path = joinPath(folder, f.name);
        const own = canPick(kind, f.kind);
        const idx = own ? indexOf(path) : -1;
        const selected = idx >= 0;
        const pooled = !inProject && own && !selected && inPool(path);
        const selectable = own && !pooled && (selected || !full || marked.length > 0);

        const tile = document.createElement("div");
        tile.title = own ? f.name + (soundOnly(kind, path) ? "\n(sound only: its soundtrack goes out on ref_audio)" : "")
            : f.name + "\n(" + f.kind + ": not selectable here, use the " +
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
        if (own && soundOnly(kind, path)) tile.appendChild(soundOnlyBadge({ right: "4px", top: "4px" }));

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
            // Projet : pastille orange (ordre de selection).
            const color = inProject ? ORANGE : PINK;
            Object.assign(badge.style, {
                position: "absolute", left: "4px", top: "4px", minWidth: "20px", height: "20px",
                borderRadius: "10px", background: color, color: "white", fontWeight: "bold",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px",
                boxShadow: inProject ? "0 0 6px rgba(224,121,60,0.8)" : "0 0 6px rgba(211,95,168,0.8)",
            });
            tile.appendChild(badge);

        }

        if (inProject) {
            // Numero toujours affiche ; case a cocher (decochee au depart) sous un fichier
            // selectionne = a remplacer : le prochain fichier choisi prend son numero.
            const isMarked = selected && marked.some((m) => samePath(m, path));
            const order = isMarked ? marked.findIndex((m) => samePath(m, path)) : -1;
            const locked = selected && !!poolOf(path);
            tile.style.cursor = selected ? "default" : tile.style.cursor;
            tile.style.border = "2px " + (isMarked || locked ? "dashed " + MARK_RED : "solid " + (selected ? ORANGE : "#2c2c2c"));
            const boxRow = document.createElement("div");
            Object.assign(boxRow.style, { display: "flex", justifyContent: "center", alignItems: "center", gap: "4px",
                padding: "2px 0 5px", minHeight: "17px", fontSize: "10px", color: MARK_RED });
            if (locked) {
                // Remplacement en attente : verrouille, "n -> A" (A comme Archives).
                tile.style.opacity = "0.6";
                const tag = document.createElement("div");
                tag.textContent = (idx + 1) + " → A";
                tag.title = "Locked: replaced by " + poolOf(path).f.name + " when the changes are validated, then archived";
                Object.assign(tag.style, { fontWeight: "bold", fontSize: "11px", color: "#fff", background: MARK_RED,
                    borderRadius: "8px", padding: "0 8px" });
                boxRow.appendChild(tag);
            } else if (selected) {
                const box = document.createElement("input");
                box.type = "checkbox";
                box.checked = isMarked;
                // Un fichier coche attend son remplacant : les autres cases sont bloquees.
                const blocked = !isMarked && marked.length > 0;
                box.disabled = blocked;
                box.title = blocked ? "Pick a replacement for the checked file first, or uncheck it" : isMarked ? "To replace: the " + (order === 0 ? "next" : "#" + (order + 1) + " next") +
                    " file you pick above takes number " + (idx + 1) + "; this one goes to Archives"
                    : "Check to replace this file: the next file you pick above takes number " + (idx + 1);
                Object.assign(box.style, { width: "15px", height: "15px", margin: "0", accentColor: MARK_RED,
                    cursor: blocked ? "not-allowed" : "pointer", opacity: blocked ? "0.35" : "1" });
                box.addEventListener("click", (e) => e.stopPropagation());
                box.addEventListener("change", () => toggleMark(path));
                boxRow.appendChild(box);
                if (isMarked) boxRow.appendChild(document.createTextNode("to replace"));
            }
            tile.append(dupBar(path), boxRow);
            tile.addEventListener("click", async () => {
                // Fichier du projet non selectionne : le clic le selectionne.
                if (own && !selected) await toggle(path, f, folder);
                previewFile(f, path);
            });
            return tile;
        }

        if (pooled) {
            tile.title = f.name + "\n(in the pending replacements below)";
            tile.style.cursor = "default";
            tile.addEventListener("click", () => previewFile(f, path));
            return tile;
        }
        tile.addEventListener("click", async () => {
            // Attendre la selection (verification de la bande-son) avant l'apercu.
            if (own) await toggle(path, f, folder);
            previewFile(f, path);
        });
        return tile;
    }

    /** Barre de la largeur de la vignette : meme couleur = meme contenu (SHA256). */
    function dupBar(path) {
        const bar = document.createElement("div");
        const color = dupColors[path];
        bar.title = color ? "Same content as the other files with this colour" : "";
        Object.assign(bar.style, { height: "4px", margin: "0 5px 3px", borderRadius: "2px",
            background: color || "transparent" });
        return bar;
    }

    /** Fichiers compares : le pool puis le dossier du projet. */
    function dupPaths() {
        if (!project) return [];
        return pool.map((it) => it.path).concat(projFiles.filter((f) => canPick(kind, f.kind))
            .map((f) => joinPath(projDir, f.name)));
    }

    /** Empreintes manquantes demandees au serveur, puis nouveau rendu. */
    async function fetchHashes() {
        const missing = dupPaths().filter((p) => !(p in hashes));
        if (!missing.length || hashing) return;
        hashing = true;
        try {
            const data = await apiPost("/mmproject/hashes", { paths: missing });
            missing.forEach((p) => (hashes[p] = (data.hashes || {})[p] || null));
        } catch (e) {
            missing.forEach((p) => (hashes[p] = null));
        } finally {
            hashing = false;
        }
        if (overlay.style.display !== "none") render();
    }

    /** Vignette du pool : numero vise, coche verte (valider celui-ci), croix rouge (l'annuler). */
    function poolTile(it) {
        const num = indexOf(it.old) + 1;
        const tile = document.createElement("div");
        tile.title = it.f.name + "\nWill replace number " + num + " (" + baseName(it.old) + ")";
        Object.assign(tile.style, {
            position: "relative", flex: "0 0 120px", background: "#151515", borderRadius: "6px", overflow: "hidden",
            border: "2px solid " + ORANGE,
        });
        const thumb = document.createElement("div");
        Object.assign(thumb.style, { height: "84px", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0d0d" });
        if (it.f.kind === "audio") {
            thumb.innerHTML = svg('<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle>' +
                '<circle cx="18" cy="16" r="3"></circle>', 34);
            thumb.style.opacity = "0.7";
        } else {
            const img = document.createElement("img");
            img.src = "/mmrefloader/thumb?path=" + encodeURIComponent(it.folder) + "&file=" +
                encodeURIComponent(it.f.name) + "&mt=" + Math.floor(it.f.mtime || 0);
            Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover", display: "block" });
            thumb.appendChild(img);
        }
        const name = document.createElement("div");
        name.textContent = it.f.name;
        Object.assign(name.style, { padding: "3px 5px", fontSize: "10px", whiteSpace: "nowrap", overflow: "hidden",
            textOverflow: "ellipsis", color: "#fff" });
        tile.append(thumb, name, dupBar(it.path));
        const corner = (html, bg, pos, title, onClick) => {
            const b = document.createElement("button");
            b.type = "button";
            b.innerHTML = html;
            b.title = title;
            Object.assign(b.style, Object.assign({
                position: "absolute", top: "4px", width: "20px", height: "20px", borderRadius: "10px", border: "none",
                background: bg, color: "white", fontWeight: "bold", fontSize: "12px", lineHeight: "20px", padding: "0",
                cursor: "pointer", boxShadow: "0 0 4px rgba(0,0,0,0.6)",
            }, pos));
            b.addEventListener("click", (e) => {
                e.stopPropagation();
                onClick();
            });
            tile.appendChild(b);
        };
        corner("✓", GREEN, { left: "4px" }, "Validate this replacement", () => validateOne(it));
        const badge = document.createElement("div");
        badge.textContent = String(num);
        badge.title = "Will take number " + num;
        Object.assign(badge.style, {
            position: "absolute", left: "4px", top: "28px", minWidth: "20px", height: "20px",
            borderRadius: "10px", background: ORANGE, color: "white", fontWeight: "bold",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px",
            boxShadow: "0 0 6px rgba(224,121,60,0.8)",
        });
        tile.appendChild(badge);
        corner("✕", MARK_RED, { right: "4px" }, "Cancel this replacement", () => {
            pool = pool.filter((x) => x !== it);
            render();
        });
        tile.addEventListener("click", () => previewFile(it.f, it.path));
        return tile;
    }

    /** Applique des remplacements du pool : nouveaux a la place des anciens, anciens dans Archives. */
    async function applyPool(items) {
        const s = ctx.getState();
        const arr = list(s);
        const at = items.map((it) => indexOf(it.old, s));
        items.forEach((it, k) => {
            if (at[k] >= 0) arr[at[k]] = it.path;
        });
        const inProj = (p) => projFiles.some((f) => samePath(joinPath(projDir, f.name), p));
        const toArchive = unusedProjectFiles(items.map((it) => it.old).filter(inProj), s);
        // Anciens d'abord : un remplacant du meme nom garde ainsi son nom.
        if (toArchive.length) {
            await apiPost("/mmproject/archive_files", { project: project.path, folder: projFolder, names: toArchive.map(baseName) });
        }
        // Remplacants dans le dossier du projet : copies, deplaces depuis Archives ("_02" si le nom est pris).
        const data = await apiPost("/mmproject/import_files", { project: project.path, folder: projFolder,
            paths: items.map((it) => it.path) });
        items.forEach((it, k) => {
            if (at[k] >= 0) arr[at[k]] = data.dsts[k];
            const i0 = initial.findIndex((p) => samePath(p, it.old));
            if (i0 >= 0) initial[i0] = data.dsts[k];
        });
        ctx.setState(s);
        // Contenus changes sous les memes chemins (remplacant du meme nom) : empreintes relues.
        hashes = {};
        if (ctx.resnapProject) ctx.resnapProject(projFolder);
        pool = pool.filter((x) => !items.includes(x));
        await loadProject();
        render();
    }

    const replaceLine = (it) => "number " + (indexOf(it.old) + 1) + ": <b>" + escapeHtml(baseName(it.old)) + "</b> → <b>" +
        escapeHtml(it.f.name) + "</b>";

    /** Ce que fait la validation, sous la liste des remplacements. */
    const validateNote = (n) => "<div style=\"color:#999;margin-top:6px\">The replaced file" + (n > 1 ? "s go" : " goes") +
        " to <b>" + escapeHtml(projFolder) + "/Archives</b>; the new " + (n > 1 ? "ones are" : "one is") +
        " copied into <b>" + escapeHtml(projFolder) + "</b> (moved if " + (n > 1 ? "they come" : "it comes") +
        " from Archives, <b>_02</b> added if the name is taken).</div>";

    async function validateOne(it) {
        const ok = await choice.ask(card, {
            title: "Validate this replacement?",
            html: "Replace " + replaceLine(it) + "." + validateNote(1),
            buttons: [{ label: "Cancel", value: null }, { label: "Validate", color: GREEN, value: true }],
        });
        if (!ok) return;
        try {
            await applyPool([it]);
        } catch (e) {
            status.textContent = e.message;
        }
    }

    async function validateAll() {
        if (!pool.length) return;
        const ok = await choice.ask(card, {
            title: "Validate the changes?",
            html: pool.length + " replacement(s):<br>" + pool.map(replaceLine).join("<br>") + validateNote(pool.length),
            buttons: [{ label: "Cancel", value: null }, { label: "Validate changes", color: GREEN, value: true }],
        });
        if (!ok) return;
        try {
            await applyPool(pool.slice());
        } catch (e) {
            status.textContent = e.message;
        }
    }

    async function cancelAll() {
        if (!pool.length) return;
        const ok = await choice.ask(card, {
            title: "Cancel the changes?",
            html: "The " + pool.length + " pending replacement(s) are dropped and everything goes back as it was.",
            buttons: [{ label: "Keep them", value: null }, { label: "Cancel changes", color: MARK_RED, value: true }],
        });
        if (!ok) return;
        pool = [];
        marked = [];
        render();
    }

    /**
     * Une seule categorie dans le dossier : une grille simple. Plusieurs :
     * une section par categorie (Images, Video ou Video/Audio, Audio).
     */
    /** Titre de zone sur toute la largeur : texte a gauche, compte a droite. */
    function zoneHeader(html, right) {
        const h = document.createElement("div");
        Object.assign(h.style, {
            gridColumn: "1 / -1", display: "flex", alignItems: "baseline", gap: "8px", color: TITLE_COLOR,
            fontWeight: "bold", fontSize: "12px", padding: "6px 2px 2px",
        });
        const left = document.createElement("div");
        left.innerHTML = html;
        left.style.flex = "1";
        const r = document.createElement("div");
        r.textContent = right || "";
        Object.assign(r.style, { color: "#bbb", fontWeight: "normal" });
        h.append(left, r);
        return h;
    }

    const countText = (n) => n + " " + (kind === "audio" ? "audio file" : fileKind(kind)) + (n > 1 ? "s" : "");

    function render() {
        marked = marked.filter((m) => indexOf(m) >= 0);
        pool = pool.filter((it) => indexOf(it.old) >= 0);
        dupColors = duplicateColors(dupPaths(), hashes);
        fetchHashes();
        // Projet relie : Clear viderait l'ordre des fichiers du projet, il est bloque.
        clearBtn.disabled = !!project;
        clearBtn.style.opacity = project ? "0.45" : "1";
        clearBtn.style.cursor = project ? "not-allowed" : "pointer";
        clearBtn.title = project ? "Not available with a project: check below the files to replace instead" : "";
        updateCounters();
        grid.innerHTML = "";
        if (showArchives && !archFiles.length) showArchives = false;
        // Zone du haut : le dossier choisi, ou les archives du projet (bouton vert).
        const folder = showArchives ? archDir() : currentFolder();
        const topFiles = showArchives ? archFiles : files;
        // Liste d'une seule image : jamais "pleine", un clic remplace l'image.
        const full = LIMITS[kind] > 1 && list().length >= LIMITS[kind];
        if (project) {
            const head = zoneHeader(showArchives
                ? "Content of " + escapeHtml(projFolder) + "/Archives of the project"
                : "Content of the selected folder",
            countText(topFiles.filter((f) => canPick(kind, f.kind)).length));
            if (archFiles.length) {
                const btn = makeTextButton("View archives", showArchives ? GREEN : INACTIVE_BG);
                Object.assign(btn.style, { padding: "2px 10px", fontSize: "11px", alignSelf: "center" });
                btn.title = showArchives ? "Back to the selected folder"
                    : archFiles.length + " file(s) in " + projFolder + "/Archives: show them instead of the selected folder";
                btn.addEventListener("click", () => {
                    showArchives = !showArchives;
                    render();
                });
                head.appendChild(btn);
            }
            grid.appendChild(head);
        }
        const present = SECTIONS.filter((sec) => topFiles.some((f) => f.kind === sec.kind));
        for (const sec of present) {
            const group = topFiles.filter((f) => f.kind === sec.kind);
            if (present.length > 1) {
                const note = !canPick(kind, sec.kind) ? "  (for information)"
                    : sec.kind !== fileKind(kind) ? "  (sound only)" : "";
                grid.appendChild(sectionHeader(sec.title + "  ·  " + group.length + note));
            }
            if (!project) {
                group.forEach((f) => grid.appendChild(makeTile(f, folder, full)));
                continue;
            }
            // Avec un projet : le dossier choisi tient sur une seule ligne qui defile
            // horizontalement (meme largeur de fenetre), le projet garde la grille.
            const strip = document.createElement("div");
            Object.assign(strip.style, {
                gridColumn: "1 / -1", display: "flex", flexWrap: "nowrap", gap: "8px", overflowX: "auto",
                overflowY: "hidden", paddingBottom: "6px", minWidth: "0",
            });
            group.forEach((f) => {
                const tile = makeTile(f, folder, full);
                tile.style.flex = "0 0 120px";
                strip.appendChild(tile);
            });
            grid.appendChild(strip);
        }
        if (!project) return;
        if (pool.length) {
            const head = zoneHeader("Pending replacements", "");
            const actions = document.createElement("div");
            Object.assign(actions.style, { display: "flex", gap: "6px", alignSelf: "center" });
            const okBtn = makeTextButton("Validate changes", GREEN);
            const noBtn = makeTextButton("Cancel changes", INACTIVE_BG);
            [okBtn, noBtn].forEach((b) => Object.assign(b.style, { padding: "2px 10px", fontSize: "11px" }));
            okBtn.addEventListener("click", validateAll);
            noBtn.addEventListener("click", cancelAll);
            actions.append(noBtn, okBtn);
            head.appendChild(actions);
            grid.appendChild(head);
            const strip = document.createElement("div");
            Object.assign(strip.style, {
                gridColumn: "1 / -1", display: "flex", flexWrap: "nowrap", gap: "8px", overflowX: "auto",
                overflowY: "hidden", paddingBottom: "6px", minWidth: "0",
            });
            pool.forEach((it) => strip.appendChild(poolTile(it)));
            grid.appendChild(strip);
        }
        // Dossier du projet plein : choisir en bas le fichier a remplacer. Pas de place
        // reservee sans message (choix utilisateur : eviter l'ascenseur).
        if (full && !marked.length) {
            const msg = document.createElement("div");
            msg.innerHTML = "The selection is full: <b>check below</b> the file to replace, then pick the new one above: it " +
                "takes the same number, and the replaced file will be archived in <b>" + escapeHtml(projFolder) +
                "/Archives</b> of the project.";
            Object.assign(msg.style, { gridColumn: "1 / -1", color: ORANGE, padding: "2px 2px 0", lineHeight: "1.35" });
            grid.appendChild(msg);
        }
        const sep = document.createElement("div");
        Object.assign(sep.style, { gridColumn: "1 / -1", height: "3px", background: "#e8e8e8", borderRadius: "2px", margin: "8px 0 2px" });
        grid.appendChild(sep);
        const own = projFiles.filter((f) => canPick(kind, f.kind));
        grid.appendChild(zoneHeader("Content of " + escapeHtml(projFolder) + " of the project <span style=\"color:#ddd\">" +
            escapeHtml(project.name) + "</span>", countText(own.length)));
        if (!own.length) {
            const none = document.createElement("div");
            none.textContent = "No " + (kind === "audio" ? "audio" : fileKind(kind)) + " file in this folder of the project yet.";
            Object.assign(none.style, { gridColumn: "1 / -1", color: "#888", padding: "2px" });
            grid.appendChild(none);
        }
        // Rangees par numero de selection, puis les fichiers sans numero par nom (choix utilisateur).
        const rank = (f) => {
            const i = indexOf(joinPath(projDir, f.name));
            return i >= 0 ? i : Infinity;
        };
        own.slice().sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
            .forEach((f) => grid.appendChild(makeTile(f, projDir, full, true)));
    }

    /** Relit le dossier du projet (zone du bas). */
    async function loadProject() {
        hashes = {};
        projFiles = [];
        archFiles = [];
        if (!project) return;
        try {
            const data = await apiGet("/mmrefloader/list?path=" + encodeURIComponent(projDir) + "&kind=all");
            projFiles = data.files || [];
        } catch (e) {
            projFiles = []; // dossier absent : rien a montrer
        }
        try {
            const data = await apiGet("/mmrefloader/list?path=" + encodeURIComponent(archDir()) + "&kind=all");
            archFiles = data.files || [];
        } catch (e) {
            archFiles = []; // pas encore d'archives
        }
    }

    function describeFiles() {
        if (!files.length) return "No image, video or audio file in this folder.";
        const parts = SECTIONS.map((sec) => {
            const n = files.filter((f) => f.kind === sec.kind).length;
            return n ? n + " " + sec.kind + (n > 1 && sec.kind !== "audio" ? "s" : "") : null;
        }).filter(Boolean);
        const own = files.filter((f) => canPick(kind, f.kind)).length;
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
            finish();
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

    /**
     * Fermeture (Done, X, Echap, clic a cote). Projet relie : Add ou Replace
     * si de nouveaux fichiers s'ajoutent a une selection existante, puis les
     * fichiers du dossier du projet que plus rien n'utilise partent dans
     * Archives (confirme ; Cancel revient a la galerie, rien ne change).
     */
    async function finish() {
        if (!project) {
            close();
            return;
        }
        if (closing) return;
        closing = true;
        try {
            // Continue : pas de question Add / Replace ensuite (les ajouts sont gardes).
            let direct = false;
            if (marked.length) {
                const names = marked.map((m) => escapeHtml(baseName(m)));
                const go = await choice.ask(card, {
                    title: "Marked files without replacement",
                    html: marked.length + " file(s) marked to replace have no replacement file: " + names.join(", ") +
                        '<div style="color:#999;margin-top:6px">Continue: they stay as they were' +
                        (pool.length ? ", the " + pool.length + " pending replacement(s) are applied (replaced files " +
                            "archived)" : "") + ", and the files of the selection go to <b>" + escapeHtml(projFolder) +
                        "</b>.</div>",
                    buttons: [
                        { label: "Cancel", value: null },
                        { label: "Continue", color: ORANGE, value: true },
                    ],
                });
                if (!go) return;
                marked = [];
                if (pool.length) await applyPool(pool.slice());
                direct = true;
            }
            if (pool.length) {
                const answer = await choice.ask(card, {
                    title: "Pending replacements",
                    html: pool.length + " replacement(s) are not validated:<br>" + pool.map(replaceLine).join("<br>"),
                    buttons: [
                        { label: "Cancel", value: null },
                        { label: "Discard", color: MARK_RED, value: "discard" },
                        { label: "Validate", color: GREEN, value: "validate" },
                    ],
                });
                if (!answer) return;
                if (answer === "validate") await applyPool(pool.slice());
                else {
                    pool = [];
                    marked = [];
                }
            }
            let s = ctx.getState();
            const final = list(s).slice();
            const sess = gallerySession(initial, final);
            let next = final;
            if (sess.ask && !direct) {
                const answer = await choice.ask(card, {
                    title: "Add, replace or cancel?",
                    html: sess.added.length + " new file(s) picked. <b>Add</b> them to the current selection (" +
                        initial.length + "), or <b>Replace</b> the current selection with them?" +
                        '<div style="color:#999;margin-top:6px">With Replace, the files of the project that are not ' +
                        "used anymore go to <b>" + escapeHtml(projFolder) + "/Archives</b>.</div>" +
                        '<div style="color:#999;margin-top:4px">Cancel: cancels all the changes made in this window.</div>',
                    buttons: [
                        { label: "Cancel", value: null },
                        { label: "Replace", color: ORANGE, value: "replace" },
                        { label: "Add", color: PINK, value: "add" },
                    ],
                });
                if (!answer) {
                    // Cancel (choix utilisateur) : selection de l'ouverture, rien d'archive, fenetre fermee.
                    const back = ctx.getState();
                    back[LIST_KEYS[kind]] = initial.slice();
                    ctx.setState(back);
                    pool = [];
                    marked = [];
                    close();
                    return;
                }
                if (answer === "replace") next = replaceSelection(initial, final);
            }
            s[LIST_KEYS[kind]] = next;
            await loadProject();
            const unused = unusedProjectFiles(projFiles.map((f) => joinPath(projDir, f.name)), s);
            if (unused.length) {
                const names = unused.map((p) => escapeHtml(baseName(p)));
                const ok = await choice.ask(card, {
                    title: "Archive the files not used anymore?",
                    html: unused.length + " file(s) of <b>" + escapeHtml(projFolder) + "</b> are not used anymore by the " +
                        "Reference Loader and go to <b>" + escapeHtml(projFolder) + "/Archives</b>: " +
                        names.slice(0, 8).join(", ") + (names.length > 8 ? ", … (+" + (names.length - 8) + ")" : "") +
                        '<div style="color:#999;margin-top:6px">No unused file stays in the project; nothing is deleted.</div>',
                    buttons: [
                        { label: "Cancel", value: null },
                        { label: "Archive", color: ORANGE, value: true },
                    ],
                });
                if (!ok) {
                    render();
                    return;
                }
                await apiPost("/mmproject/archive_files", {
                    project: project.path, folder: projFolder, names: unused.map(baseName),
                });
            }
            // Projet associe (choix utilisateur) : tous les fichiers de la liste vont dans son dossier
            // (copies, deplaces depuis Archives, "_02" si le nom est pris) ; les rognages suivent.
            const listKey = LIST_KEYS[kind];
            const inDir = (p) => samePath(p.replace(/[\\/][^\\/]*$/, ""), projDir);
            const outside = list(s).filter((p) => !inDir(p));
            if (outside.length) {
                const data = await apiPost("/mmproject/import_files", { project: project.path, folder: projFolder,
                    paths: outside });
                s = remapState(s, (p, l) => {
                    if (l !== listKey) return p;
                    const k = outside.findIndex((o) => samePath(o, p));
                    return k >= 0 ? data.dsts[k] : p;
                });
            }
            ctx.setState(s);
            if (ctx.resnapProject) ctx.resnapProject(projFolder);
            marked = [];
            close();
        } catch (e) {
            status.textContent = e.message;
            render();
        } finally {
            closing = false;
        }
    }

    closeBtn.addEventListener("click", finish);
    doneBtn.addEventListener("click", finish);
    overlay.addEventListener("mousedown", finish);
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
        if (project) return; // l'ordre des fichiers du projet ne se vide pas
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
            // Sortie project reliee a un projet : zone de son dossier (Images -> 08.Images...).
            project = ctx.getProject ? ctx.getProject() : null;
            projFolder = project ? LIST_FOLDERS[LIST_KEYS[kind]] : "";
            projDir = project ? joinPath(project.path, projFolder) : "";
            projFiles = [];
            initial = list(st).slice();
            marked = [];
            pool = [];
            archFiles = [];
            showArchives = false;
            // Deux zones avec un projet : fenetre plus haute (meme largeur).
            card.style.height = project ? "min(720px, 90vh)" : "min(560px, 82vh)";
            updateNav();
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            positionCardNextToNode(card, container, 720);
            loadFolder();
            scanSubfolders();
            if (project) loadProject().then(render);
        },
        close,
        remove() {
            choice.remove();
            close();
            overlay.remove();
        },
    };
}

/** Date et heure locales au format yyyyMMdd-HHmmss (noms de sauvegarde). */
function timestamp(d) {
    d = d || new Date();
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" +
        p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
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

    /** info = simple avertissement : un seul bouton (label), sans Cancel. */
    function ask(html, label, callback, anchor, info) {
        text.innerHTML = html;
        okBtn.textContent = label;
        cancelBtn.style.display = info ? "none" : "";
        okBtn.style.background = info ? PINK : MARK_RED;
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
        // Lignes a la hauteur de leur contenu : la grille defile au lieu d'ecraser les vignettes.
        gridAutoRows: "max-content", gap: "8px", alignContent: "start",
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
            if (fileKind(kind) === "audio" && !soundOnly(kind, path)) {
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
            const soundTag = soundOnly(kind, path) ? soundOnlyBadge({ right: "4px", top: "58px" }) : null;

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

            // Fichier rogne : badge avec la portion gardee.
            const tr = TRIM_KINDS.includes(kind) ? trimOf(ctx.getState(), kind, path) : null;
            if (tr) {
                const cut = document.createElement("div");
                cut.textContent = "✂ " + fmtTrim(tr);
                cut.title = "Trimmed: " + fmtTrim(tr);
                Object.assign(cut.style, {
                    position: "absolute", left: "4px", top: "58px", background: "rgba(0,0,0,0.75)",
                    color: ORANGE, padding: "1px 5px", borderRadius: "4px", fontSize: "10px",
                });
                thumb.style.position = "relative";
                tile.append(thumb, badge, bin, cut, name, out, arrows);
            } else {
                tile.append(thumb, badge, bin, name, out, arrows);
            }
            if (soundTag) tile.appendChild(soundTag);
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
        const trim = TRIM_KINDS.includes(kind) ? {
            range: trimOf(ctx.getState(), kind, path),
            onChange: (range) => {
                const s = ctx.getState();
                if (range) s.trims[kind][trimKey(path)] = range;
                else delete s.trims[kind][trimKey(path)];
                ctx.setState(s);
                render();
            },
        } : null;
        sidePreview.show(path, fileKind(kind), outputName(kind, idx), trim);
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
        if (fk === "audio" && !soundOnly(kind, path)) {
            // Audio : icone ici, lecteur + rognage dans la fenetre de droite.
            el = document.createElement("div");
            el.innerHTML = AUDIO_ICON.replace(/width="15" height="15"/, 'width="40" height="40"');
            el.style.opacity = "0.7";
            showSide(path, list().findIndex((it) => samePath(pathOf(it), path)));
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
                (fileKind(kind) === "video" || soundOnly(kind, path)
                    ? row("Soundtrack:", info.has_audio ? "yes" : "none in the file") : "") +
                (soundOnly(kind, path) ? row("Used as:", "sound only (audio track)") : "") +
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
// Vue d'ensemble : toutes les rubriques du mode affiche, en lecture seule
// --------------------------------------------------------------------
function buildOverview(container, ctx) {
    const { overlay, card } = makeOverlay();
    Object.assign(card.style, {
        width: "min(720px, 92vw)", height: "min(620px, 86vh)", display: "flex",
        flexDirection: "column", overflow: "hidden", borderColor: VIOLET,
    });

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

    const body = document.createElement("div");
    Object.assign(body.style, { flex: "1", overflowX: "hidden", overflowY: "auto", padding: "4px 12px 10px" });

    const footer = document.createElement("div");
    Object.assign(footer.style, { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px",
        padding: "10px 12px" });
    const hint = document.createElement("div");
    hint.textContent = "View only: reorder, delete and trim with the eye button of each row.";
    Object.assign(hint.style, { flex: "1", color: "#888", fontSize: "11px" });
    const doneBtn = makeTextButton("Done", PINK);
    footer.append(hint, doneBtn);
    card.append(header, body, footer);

    // Fenetre de visualisation a droite ; rognage affiche mais non modifiable.
    const sidePreview = buildSidePreview(card, overlay);
    let current = null; // { kind, path } de la vignette affichee

    function showSide(kind, path, idx) {
        current = { kind, path };
        const trim = TRIM_KINDS.includes(kind)
            ? { range: trimOf(ctx.getState(), kind, path), onChange: () => {}, readOnly: true } : null;
        sidePreview.show(path, fileKind(kind), outputName(kind, idx), trim);
        render();
    }

    function makeTile(kind, path, i, color) {
        const active = current && current.kind === kind && samePath(current.path, path);
        const tile = document.createElement("div");
        tile.title = path;
        Object.assign(tile.style, {
            position: "relative", background: "#151515", borderRadius: "6px", overflow: "hidden",
            cursor: "pointer", border: "2px solid " + (active ? VIOLET : color),
            boxShadow: active ? "0 0 8px rgba(106,95,211,0.8)" : "none",
        });
        const thumb = document.createElement("div");
        Object.assign(thumb.style, {
            height: "80px", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0d0d",
        });
        if (fileKind(kind) === "audio" && !soundOnly(kind, path)) {
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
            borderRadius: "10px", background: color, color: "white", fontWeight: "bold",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px",
        });
        const name = document.createElement("div");
        name.textContent = baseName(path);
        Object.assign(name.style, {
            padding: "3px 5px 0", fontSize: "10px", whiteSpace: "nowrap", overflow: "hidden",
            textOverflow: "ellipsis", color: "#fff",
        });
        const out = document.createElement("div");
        out.textContent = "→ " + outputName(kind, i) + (kind === "video_audio" ? "  (sound)" : "");
        Object.assign(out.style, { padding: "0 5px 5px", fontSize: "10px", color: "#9fd6cf" });
        tile.append(thumb, badge);
        const tr = TRIM_KINDS.includes(kind) ? trimOf(ctx.getState(), kind, path) : null;
        if (tr) {
            const cut = document.createElement("div");
            cut.textContent = "✂ " + fmtTrim(tr);
            cut.title = "Trimmed: " + fmtTrim(tr);
            Object.assign(cut.style, {
                position: "absolute", left: "4px", top: "58px", background: "rgba(0,0,0,0.75)",
                color: ORANGE, padding: "1px 5px", borderRadius: "4px", fontSize: "10px",
            });
            tile.appendChild(cut);
        }
        if (soundOnly(kind, path)) tile.appendChild(soundOnlyBadge({ right: "4px", top: "58px" }));
        tile.append(name, out);
        tile.addEventListener("click", () => showSide(kind, path, i));
        return tile;
    }

    function render() {
        const s = ctx.getState();
        const fl = s.mode === "fl2va";
        const rows = fl ? FRAME_BUTTONS : BUTTONS;
        title.textContent = "Project overview — " + (fl ? "F2VA / FL2VA" : "Ref2VA");
        let total = 0;
        body.innerHTML = "";
        for (const b of rows) {
            const arr = listOf(s, b.kind);
            total += arr.length;
            const head = document.createElement("div");
            Object.assign(head.style, {
                display: "flex", alignItems: "center", gap: "8px", margin: "10px 0 6px",
                paddingBottom: "4px", borderBottom: "1px solid #2c2c2c", fontWeight: "bold", color: "#ddd",
            });
            head.innerHTML = iconBadge(b.icon, b.color) + "<span>" + b.label + "</span>" +
                '<span style="color:#888;font-weight:normal">' + arr.length + " / " + LIMITS[b.kind] +
                (b.kind === "video_audio" ? " · audio" : "") + "</span>";
            body.appendChild(head);
            if (!arr.length) {
                const empty = document.createElement("div");
                empty.textContent = "No reference";
                Object.assign(empty.style, { color: "#777", padding: "2px 0 4px" });
                body.appendChild(empty);
                continue;
            }
            const grid = document.createElement("div");
            Object.assign(grid.style, {
                display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: "8px",
            });
            arr.forEach((path, i) => grid.appendChild(makeTile(b.kind, path, i, b.color)));
            body.appendChild(grid);
        }
        counter.textContent = total + " reference" + (total > 1 ? "s" : "");
    }

    const onKey = (e) => {
        if (overlay.style.display === "none" || e.key !== "Escape") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
    };

    function close() {
        overlay.style.display = "none";
        sidePreview.hide(); // arrete une lecture en cours
        current = null;
        window.removeEventListener("keydown", onKey, true);
    }

    closeBtn.addEventListener("click", close);
    doneBtn.addEventListener("click", close);
    overlay.addEventListener("mousedown", close);

    return {
        open() {
            current = null;
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            render();
            positionCardNextToNode(card, container, 720);
        },
        close,
        remove() {
            close();
            overlay.remove();
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
            // Creation du noeud : pas de liens a lui (voir applyLayout).
            let creating = false;
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
            const overviewBtn = makeIconButton(VIOLET, OVERVIEW_ICON, "Project overview (all the references)");
            const rootBtn = makeIconButton(VIOLET, GEAR_ICON, "Root folder of the rushes");
            const downloadBtn = makeIconButton(PINK, DOWNLOAD_ICON, "Save the configuration (.json)");
            const uploadBtn = makeIconButton(PINK, UPLOAD_ICON, "Load a configuration (.json)");
            [overviewBtn, rootBtn, downloadBtn, uploadBtn].forEach((b) => {
                b.style.width = "22px";
                b.style.height = "22px";
            });
            const fileInput = document.createElement("input");
            fileInput.type = "file";
            // Configurations JSON uniquement (les anciens .txt ne sont plus lus).
            fileInput.accept = ".json,application/json";
            fileInput.style.display = "none";

            bottom.append(summary, overviewBtn, rootBtn, downloadBtn, uploadBtn, helpBtn, fileInput);
            container.appendChild(bottom);

            let lastRoot = null;
            // Projet choisi dans un noeud MiniMax H3 Project relie a la sortie project.
            const getProject = () => {
                const i = node.outputs.findIndex((o) => o.name === PROJECT_KEY);
                if (i < 0) return null;
                for (const l of outputLinksOf(node, i)) {
                    const t = node.graph && node.graph.getNodeById(l.target_id);
                    const info = t && typeof t.mmProjectInfo === "function" ? t.mmProjectInfo() : null;
                    if (info) return info;
                }
                return null;
            };
            // Remplacements valides dans la galerie : le noeud Projet reprend l'instantane du dossier.
            const resnapProject = (folder) => {
                const i = node.outputs.findIndex((o) => o.name === PROJECT_KEY);
                if (i < 0) return;
                for (const l of outputLinksOf(node, i)) {
                    const t = node.graph && node.graph.getNodeById(l.target_id);
                    if (t && typeof t.mmResnapFolder === "function") t.mmResnapFolder(folder);
                }
            };
            const gallery = buildGallery(container, { getState, setState, getProject, resnapProject });
            const viewer = buildSelectionViewer(container, { getState, setState });
            const clearConfirm = buildConfirmDialog(container);
            const rootDialog = buildRootDialog(container, { getState, setState });
            const help = buildHelpOverlay(container);
            const overview = buildOverview(container, { getState });
            helpBtn.addEventListener("click", () => help.open());
            overviewBtn.addEventListener("click", () => overview.open());
            rootBtn.addEventListener("click", () => rootDialog.open());
            node.__mmrefOverlays = [gallery, viewer, clearConfirm, rootDialog, help, overview];

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

            // Download : fichier du mode affiche seulement (un fichier par mode).
            downloadBtn.addEventListener("click", () => {
                const s = getState();
                if (!hasConfig(s)) return; // mode vide : rien a sauvegarder (bouton grise)
                const blob = new Blob([formatConfigJson(s)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                // Nom prefixe par le mode et suffixe par la date / heure locales
                // (yyyyMMdd-HHmmss) : une nouvelle sauvegarde n'ecrase pas la precedente.
                a.download = (s.mode === "fl2va" ? "FL2VA" : "REF2VA") + "_minimax_config_" + timestamp() + ".json";
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
                        conf = parseConfigJson(String(reader.result || ""));
                    } catch (e) {
                        notice = "⚠ " + e.message;
                        refresh();
                        return;
                    }
                    // Fichier de l'autre mode : refuse, rien n'est modifie (il
                    // viderait la partie du mode affiche).
                    const s = getState();
                    if (conf.mode !== s.mode) {
                        // Type lu dans l'en-tete du fichier (ou sa ligne mode pour
                        // un ancien fichier) : avertissement visible + message.
                        const name = (m) => (m === "fl2va" ? "FL2VA" : "REF2VA");
                        notice = "⚠ " + name(conf.mode) + " file: switch to " + name(conf.mode) + " to load it";
                        noticeTitle = "This configuration file was saved in " + name(conf.mode) +
                            " mode; the node is in " + name(s.mode) + " mode. Nothing was changed.";
                        refresh();
                        clearConfirm.ask(
                            "<b>Wrong configuration file</b><br>" + escapeHtml(file.name) + " is a <b>" +
                            name(conf.mode) + "</b> configuration" +
                            ", but the node is in <b>" + name(s.mode) + "</b> mode." +
                            '<div style="color:#999;margin-top:8px">Nothing was changed. Switch the node to ' +
                            name(conf.mode) + " first, or load a " + name(s.mode) + " file.</div>",
                            "OK", () => {}, null, true);
                        return;
                    }
                    // Seule la partie du mode affiche est remplacee ; le mode du
                    // noeud ne change pas. Le dossier racine (commun) est repris.
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
                        s.trims = conf.trims;
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
            function listTitle(paths, kind, s) {
                if (!paths.length) return "Nothing selected";
                return paths.map((p, i) => {
                    const t = kind && s ? trimOf(s, kind, p) : null;
                    return i + 1 + ". " + baseName(p) + (t ? "  ✂ " + fmtTrim(t) : "");
                }).join("\n");
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
                rows.video.btn.title = listTitle(s.videos, "video", s);
                rows.video_audio.btn.title = s.video_audios.length
                    ? "Soundtracks (ref_video_audio):\n" + listTitle(s.video_audios, "video_audio", s)
                    : "No video soundtrack selected";
                rows.audio.btn.title = listTitle(s.audios, "audio", s);

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
                // Download grise et inactif si le mode affiche n'a aucune reference
                // (le dossier racine seul ne compte pas).
                const canSave = hasConfig(s);
                downloadBtn.disabled = !canSave;
                downloadBtn.style.background = canSave ? PINK : INACTIVE_BG;
                downloadBtn.style.opacity = canSave ? "1" : "0.45";
                downloadBtn.style.cursor = canSave ? "pointer" : "default";
                downloadBtn.title = canSave ? "Save the configuration (.json)"
                    : "Save the configuration (.json) - nothing to save in this mode";
                // Vue d'ensemble grisee tant que le mode affiche est vide.
                overviewBtn.disabled = !canSave;
                overviewBtn.style.background = canSave ? VIOLET : INACTIVE_BG;
                overviewBtn.style.opacity = canSave ? "1" : "0.45";
                overviewBtn.style.cursor = canSave ? "pointer" : "default";
                rootBtn.title = s.root ? "Root folder: " + s.root : "Root folder of the rushes (not set)";
                // Root folder change : le noeud Projet branche relit ses projets.
                if (s.root !== lastRoot) {
                    const first = lastRoot === null;
                    lastRoot = s.root;
                    if (!first) notifyProjectNodes(node);
                }

                applyLayout(node, s, !creating);
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
            // configure() garde les noms des sorties creees par onNodeCreated (etat par
            // defaut), n'ajoute que les sorties en plus et recopie ces noms dans les
            // donnees recues : on releve les noms et etiquettes enregistres avant lui
            // et on les remet dans onConfigure, sinon applyLayout suivrait de faux noms
            // et deplacerait les liens (ref_image_2 et 3 -> ref_video_1 et ref_video_audio_1).
            let savedOutputs = null;
            const configure = node.configure;
            node.configure = function (info) {
                savedOutputs = info && Array.isArray(info.outputs)
                    ? info.outputs.map((o) => (o && typeof o.name === "string" ? { name: o.name, label: o.label } : null))
                    : null;
                return configure.apply(this, arguments);
            };
            const onConfigure = node.onConfigure;
            node.onConfigure = function () {
                const ret = onConfigure ? onConfigure.apply(this, arguments) : undefined;
                (savedOutputs || []).forEach((o, i) => {
                    const out = node.outputs && node.outputs[i];
                    if (!out || !o) return;
                    out.name = o.name;
                    out.localized_name = o.name;
                    out.label = o.label;
                });
                savedOutputs = null;
                // Entree "project" d'une version de test (sens inverse) : retiree.
                const old = (node.inputs || []).findIndex((inp) => inp.name === "project");
                if (old >= 0) node.removeInput(old);
                refresh();
                return ret;
            };

            // Root folder lu par le noeud MiniMax H3 Project branche sur la sortie project.
            node.mmRootFolder = () => getState().root || "";
            // Le noeud Projet y memorise le dossier personnalise choisi a la
            // creation d'un projet (Root folder vide), comme la roue crantee.
            node.mmSetRootFolder = (root) => {
                const s = getState();
                if (s.root === root) return;
                s.root = root;
                resetRootSubs(s);
                setState(s);
            };
            // Save, renommer / deplacer du noeud Projet : il lit la selection et
            // la remplace par les chemins des copies (ou du projet deplace).
            node.mmGetState = () => getState();
            node.mmSetState = (s) => setState(parseState(JSON.stringify(s)));
            creating = true;
            try {
                refresh();
            } finally {
                creating = false;
            }
            vueNodes.add(node);
            watchVueNodes();
            scheduleVueSync();
            return r;
        };

        // Renommer une sortie par double-clic sur son nom (mode classique ;
        // en Nodes 2.0, le double-clic est gere sur l'element DOM du noeud).
        const onDblClick = nodeType.prototype.onDblClick;
        nodeType.prototype.onDblClick = function (e, pos) {
            const r = onDblClick ? onDblClick.apply(this, arguments) : undefined;
            if (vueMode()) return r;
            const i = hitOutputLabel(this, pos);
            if (i >= 0) openOutputLabelEditor(this, i);
            return r;
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            if (activeOutputEditor && activeOutputEditor.node === this) activeOutputEditor.close(false);
            vueNodes.delete(this);
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

// Utilitaires partages avec le noeud MiniMax H3 Project (web/js/project_node.js).
export {
    TITLE_COLOR, BODY_COLOR, VIOLET, PINK, ORANGE, GREEN, MARK_RED, INACTIVE_BG, INACTIVE_FG,
    svg, iconBadge, hList, hSteps, hTip, hNote, hCard, FOLDER_ICON, REFRESH_ICON, CLOSE_ICON, GEAR_ICON,
    START_ICON, IMAGE_ICON, VIDEO_ICON, AUDIO_ICON, TRASH_ICON, EYE_ICON,
    makeOverlay, makeIconButton, makeTextButton, positionCardNextToNode, apiGet, hideWidget,
    escapeHtml, buildHelpOverlay, vueMode, PROJECT_TYPE,
};
