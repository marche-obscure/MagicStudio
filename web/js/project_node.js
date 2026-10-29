import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import {
    TITLE_COLOR, BODY_COLOR, VIOLET, PINK, ORANGE, GREEN, INACTIVE_BG,
    svg, iconBadge, hList, hSteps, hTip, hNote, hCard, FOLDER_ICON, REFRESH_ICON, GEAR_ICON, START_ICON,
    IMAGE_ICON, VIDEO_ICON, AUDIO_ICON, EYE_ICON, CLOSE_ICON, TRASH_ICON,
    makeOverlay, makeIconButton, makeTextButton, positionCardNextToNode, apiGet, hideWidget,
    escapeHtml, buildHelpOverlay, vueMode,
    FOLDER_OPEN_ICON, TREE_ICON, SIMPLE_COLOR, MULTI_COLOR, projectKind, buildIconPicker, THUMB_REVALIDATE,
    profileLimitDefaults,
} from "./minimax_ref_loader.js";
import { profileOf, LABELS as PROFILE_LABELS } from "./profiles.js";
import {
    PROJECT_SUBFOLDERS, FOLDER_COLORS, projectNameError, parseProjectState, saveItems, remapState, mapBySequence,
    mapByPrefix, UPDATE_FOLDERS, folderPaths, folderSnapshot, folderChanges, anchoredSubs, projectNameOfPath, sameGroup, mergeData,
    mapFolderBySequence, withoutMedia, MEDIA_FOLDERS, LOADABLE_FOLDERS, configRefs, loadedState, restoreItems,
    unusedProjectFiles, orderedFolderFiles, folderUse, hiddenFolderItems,
    RUN_FOLDERS, runDateText, durationText, runsOfKind, runSummary, outputFile, rushItems, SORT_FOLDERS, sortDot, sortTargets,
    batchSortTargets, canDeleteRush, deletedText,
    REGISTRY_FOLDERS, OTHER_REGISTRY, setsWithRuns, promptGroups, setsOfRuns, setSummary, runTabName,
    switchSourceInput, withoutPaths, inDateOrder, orderSetCards, orderByMtime, DOT_FILTER, filterByDot, dotCounts, groupByDot, rushKey,
} from "./project_paths.js";
import { diffWorkflows, workflowSignature, formatLastSave, shortValue } from "./workflow_diff.js";

// Noeud "MiniMax H3 Project" : cree ou choisit un dossier de projet dans le
// Root folder recu du MiniMax H3 Reference Loader (entree "project"), ou
// dans le dossier par defaut <input de ComfyUI>/Projets.

const NODE_NAME = "MiniMaxH3Project";
// Sortie vers le noeud MiniMax H3 Final Cut (choix utilisateur, 22/10/2026).
const FINAL_CUT_TYPE = "MINIMAX_FINAL_CUT";
// Entree reliee a la sortie model_link de MultiFiles Select (choix utilisateur).
const MODELS_LINK = "models_link";
const FILE_SELECT_TYPE = "MultiFileSelect";
const REF_LOADER_NAME = "MiniMaxH3RefLoader";
// Liste des projets + une ligne par dossier (28 px + 6 px d'ecart) + ligne du bas.
const FOLDER_ROW_HEIGHT = 28;
const UI_HEIGHT = 66 + PROJECT_SUBFOLDERS.length * (FOLDER_ROW_HEIGHT + 6) + 4;
// Assez large pour « Last save: dd/MM/yyyy at hh:mm:ss » sur la ligne 00.Workflows.
const MIN_WIDTH = 420;
// Verification de secours de la cloche (l'evenement graphChanged fait le reste).
const FALLBACK_CHECK_MS = 30000;
// Relecture juste apres un evenement graphChanged (valeurs de widget mises a jour apres lui).
const RECHECK_MS = 300;

const PLUS_ICON = svg('<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>', 14);
const PROJECT_ICON = svg(
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>' +
    '<line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line>', 13);
const LINK_ICON = svg(
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>' +
    '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>', 13);
/** Titre d'un bloc de l'aide avec son icone. */
const hTitle = (icon, color, text) =>
    '<div style="display:flex;align-items:center;gap:8px;margin:14px 0 4px;font-weight:bold;color:#e6e6e6">' +
    iconBadge(icon, color) + "<span>" + text + "</span></div>";
/** Avertissement de l'aide (orange). */
const hWarn = (t, label) =>
    '<div style="border-left:3px solid ' + ORANGE + ';background:#241b15;color:#efcfb6;padding:6px 10px;' +
    'margin:6px 0 10px">⚠ <b>' + label + "</b> " + t + "</div>";
const PENCIL_ICON = svg('<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>', 13);
const SAVE_ICON = svg('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>' +
    '<polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline>', 13);
// Boite d'archives (workflows archives).
// Deux feuilles superposees (doublons dans Archives).
const DUP_ICON = svg('<rect x="8" y="8" width="13" height="13" rx="2"></rect>' +
    '<path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path>', 12);
const ARCHIVE_ICON = svg('<rect x="2" y="3" width="20" height="5" rx="1"></rect><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"></path>' +
    '<line x1="10" y1="12" x2="14" y2="12"></line>', 12);
// Archives : 5 au plus par projet (comme projects.MAX_ARCHIVES) ; rouge = suppression.
const TRASH_RED = "#d32f2f";
const MAX_ARCHIVES = 5;
// Avertissement a gauche du bouton 00.Workflows : workflow modifie, pas encore sauvegarde.
const WARN_ICON = '<svg viewBox="0 0 24 24" width="16" height="16">' +
    '<path d="M12 2.5 22.5 21h-21z" fill="#e0793c" stroke="#e0793c" stroke-width="1.5" stroke-linejoin="round"></path>' +
    '<path d="M12 9v5.5" stroke="#1b1b1b" stroke-width="2.4" stroke-linecap="round"></path>' +
    '<circle cx="12" cy="17.6" r="1.3" fill="#1b1b1b"></circle></svg>';
const WARN_WIDTH = 16;
// Couleurs de la cloche du workflow : orange = changements a sauvegarder, vert = a jour.
const BELL_ORANGE = "#e0793c";
const BELL_GREEN = "#43a047";
// Cloche rouge : Load "Data only" avec une autre structure, workflow a sauvegarder (22/10/2026).
const BELL_RED = "#d32f2f";
const WORKFLOWS = "00.Workflows";
const BELL_ICON = svg(
    '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>', 12);

// Icone de la pastille de chaque sous-dossier (couleurs : FOLDER_COLORS).
const FOLDER_ICONS = {
    // Noeuds relies (workflow).
    "00.Workflows": svg('<rect x="2" y="3" width="7" height="6" rx="1"></rect><rect x="15" y="15" width="7" height="6" rx="1"></rect>' +
        '<path d="M9 6h3a3 3 0 0 1 3 3v6"></path>', 14),
    // Cube (modele).
    "02.Models": svg('<path d="M21 16V8l-9-5-9 5v8l9 5 9-5z"></path><path d="M3.3 7L12 12l8.7-5"></path><path d="M12 22V12"></path>', 14),
    // Crayon (texte du prompt).
    "04.Prompt": svg('<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>', 14),
    // Calques (LoRA).
    "06.LoRA": svg('<polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline>' +
        '<polyline points="2 12 12 17 22 12"></polyline>', 14),
    "08.Images": IMAGE_ICON,
    "10.Son": AUDIO_ICON,
    "12.Video": VIDEO_ICON,
    // Camera + haut-parleur (video avec son).
    "14.Video-Audio": svg('<rect x="1" y="7" width="12" height="10" rx="2"></rect><path d="M13 11l4-2v6l-4-2z"></path>' +
        '<path d="M19.5 9a4.5 4.5 0 0 1 0 6"></path><path d="M21.8 7a7.5 7.5 0 0 1 0 10"></path>', 14),
    // Clap (rushs video).
    "40.Rush Videos": svg('<rect x="3" y="10" width="18" height="11" rx="2"></rect><path d="M3 10l1.5-5.5 15.5 0-1.5 5.5"></path>' +
        '<path d="M8.5 4.5L7 10M13.5 4.5L12 10M18.5 4.5L17 10"></path>', 14),
    // Image + pellicule (rushs images).
    "60.Rush Images": svg('<rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M2 8h20M2 16h20"></path>' +
        '<path d="M6 4v4M10 4v4M14 4v4M18 4v4M6 16v4M10 16v4M14 16v4M18 16v4"></path>', 14),
};

function samePath(a, b) {
    const norm = (p) => String(p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    return norm(a) === norm(b);
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

// --------------------------------------------------------------------
// Aide (anglais et francais)
// --------------------------------------------------------------------
const folderList = PROJECT_SUBFOLDERS.map((f) => "<b>" + f + "</b>").join(", ");
// Entree project obligatoire (choix utilisateur, 19/10/2026) : message du noeud sans lien.
const WIRE_PROJECT = "Wire the project output of the MagicStudio RefLoader";
// Bouton Purge du noeud (choix utilisateur, 19/10/2026) : rouge fonce.
const PURGE_RED = "#8b1a1a";
// Carte d'une entree du noeud pour l'aide (choix utilisateur, 19/10/2026) : nom, badge
// "Optional" bien visible, puis lignes [libelle, texte].
const inputCard = (name, badge, rows) =>
    '<div style="border:1px solid #2c2c2c;border-radius:8px;background:#161616;padding:8px 10px;margin:8px 0">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><b style="color:#9fd6cf;font-size:13px">' +
    name + '</b><span style="background:' + (/^(Required|Obligatoire)$/.test(badge) ? "#c62828" : "#2e7d32") + ';color:#fff;font-weight:bold;font-size:10px;border-radius:9px;' +
    'padding:1px 8px">' + badge + "</span></div>" +
    '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 10px">' +
    rows.map(([k, v]) => '<span style="color:#999;white-space:nowrap">' + k + "</span><span>" + v + "</span>").join("") +
    "</div></div>";
// Pastille d'un dossier et pastille de couleur des vignettes, pour l'aide.
const folderBadge = (f) => iconBadge(FOLDER_ICONS[f], FOLDER_COLORS[f]);
const helpDot = (c) => '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' + c +
    ';vertical-align:middle"></span>';
// Boutons texte du bas du noeud (Load, Save, Purge), comme dans le noeud.
const textBadge = (t, color) => '<span style="display:inline-block;background:' + (color || PINK) + ';color:white;font-weight:bold;' +
    'font-size:11px;border-radius:5px;padding:0 7px;line-height:18px">' + t + "</span>";
// Fichiers de la configuration du projet (Load / Save).
// Noms des fichiers du projet (choix utilisateur) : workflows_<projet>.json, config_projets_<projet>.json.
const CONFIG_PATH = "99.Project-Config/config_projets_&lt;project&gt;.json";
// Nom d'un sous-projet : "<dossier de projets>/<projet>" (choix utilisateur, 22/10/2026) ;
// fichiers et titres prennent le nom du dossier du projet seul.
const GROUP_SEP = "/";
const shortName = (name) => String(name || "").split(GROUP_SEP).pop();
const configPathOf = (project) => "99.Project-Config/config_projets_" + shortName(project) + ".json";
const workflowNameOf = (project) => "workflows_" + shortName(project);

const HELP_SECTIONS = [
    {
        id: "start", title: "Quick start", icon: START_ICON, color: TITLE_COLOR,
        html: hSteps([
            "Wire the <b>project</b> output of the <b>MiniMax H3 Reference Loader</b> (its last output) to the " +
            "<b>project</b> input of this node.",
            "Click " + iconBadge(PLUS_ICON, PINK) + ", type the name of the project: <b>Simple</b> (one project) or " +
            "<b>MultiProject</b> (a folder of projects), then <b>Create</b>.",
            "Or pick an existing project in the list.",
        ]) +
        hCard("Buttons of the node", [
            [iconBadge(PENCIL_ICON, VIOLET), "Rename or move the project"],
            [iconBadge(PLUS_ICON, PINK), "New project"],
            [textBadge("Load"), "Put the project back (see <b>Load and Save</b>)"],
            [textBadge("Save"), "Record the project (see <b>Load and Save</b>)"],
            [textBadge("Copy", "#1e88e5"), "Copy the media 08 to 14 of another project (identical files skipped)"],
            [textBadge("Reset", "#e53935"), "Empty the project (see the warning below)"],
            [textBadge("Purge", PURGE_RED), "Clean the runs: left “running”, or in error (to 98.Error)"],
            [textBadge("Date ↓", INACTIVE_BG), "Order of the windows: newest or oldest first"],
            [iconBadge(REFRESH_ICON, VIOLET), "Read the list of projects again"],
            [iconBadge(BELL_ICON, BELL_ORANGE), "Bells: workflow (see <b>Workflow</b>) and media 08 to 14 (see <b>Media 08 to 14</b>)"],
            [iconBadge(ARCHIVE_ICON, VIOLET), "Archived workflows"],
        ]) +
        hWarn("<b>Reset</b> sends <b>every file of the project</b> to the Recycle Bin (after a summary and typing " +
            "the name of the project); the folders stay and the selection of the Reference Loader is emptied.",
            "Warning:"),
    },
    {
        id: "inputs", title: "Inputs", icon: LINK_ICON, color: ORANGE,
        html: "<p>The node has three inputs: <b>project is required</b> (it is the point of this node), " +
            "<b>text_prompt</b> and <b>models_link</b> are optional and each adds a feature.</p>" +
            inputCard("project", "Required", [
                ["Wire", "the <b>project</b> output of the <b>MiniMax H3 Reference Loader</b>: always its last output, in " +
                    "both modes; the link stays when you switch Ref2VA / F2VA-FL2VA."],
                ["Gives", "the projects folder (Root folder of the Reference Loader) and the link to the Reference " +
                    "Loader: needed by <b>Save</b>, by <b>Load</b> to fill the Reference Loader, and by the bells of " +
                    "08 to 14. It gives the Root folder only: the references and the galleries are not changed."],
                ["Without it", "the node is greyed (projects, folders, Load, Save, Purge) with the message " +
                    "<b>Wire the project output of the MiniMax H3 Reference Loader</b>, and ComfyUI refuses the run " +
                    "(required input missing)."],
            ]) +
            inputCard("text_prompt", "Optional", [
                ["Wire", "the final prompt text (the same text as the prompt of the MiniMax node)."],
                ["Gives", "the record of each run: JSON in <b>04.Prompt</b>, copies in <b>40.Rush Videos</b>, " +
                    "registries in <b>02.Models</b> / <b>06.LoRA</b> (see <b>Run record</b>)."],
                ["Without it", "nothing is recorded; the windows 04, 40 and 60 stay empty."],
            ]) +
            inputCard("models_link", "Optional", [
                ["Wire", "the <b>model_link</b> output of <b>MultiFiles Select</b> (directly, or through Set / Get, " +
                    "Reroute, or a Switch MultiIN-OUT: the input of its active group)."],
                ["Gives", "the models of the run with their <b>position</b> (number of the field), and " +
                    "<b>&lt;project&gt;/02.Models</b> as save folder of MultiFiles Select when it is empty (a folder " +
                    "chosen by hand is never replaced)."],
                ["Without it", "the models are read in the graph (position 0). The LoRA are always read in the graph."],
            ]) +
            hNote("output <b>final_cut</b>: wire it to the <b>MiniMax H3 Final Cut</b> node (copies of the " +
                "Picture Lock folders for MiniMax H3 Director)."),
    },
    {
        id: "folders", title: "Project folders", icon: PROJECT_ICON, color: VIOLET,
        html: "<p>Every project is a folder with always the same subfolders. Click a row to open its window.</p>" +
            hCard("Folders of the project", [
                [folderBadge("00.Workflows"), "<b>00.Workflows</b>: the workflow of the project and its archives (see <b>Workflow</b>)"],
                [folderBadge("02.Models"), "<b>02.Models</b>, <b>06.LoRA</b>: the sets of models and LoRA used by the runs (see <b>Sets 02 / 06</b>)"],
                [folderBadge("04.Prompt"), "<b>04.Prompt</b>: the recorded runs (see <b>Run windows</b>)"],
                [folderBadge("08.Images"), "<b>08.Images</b>, <b>10.Son</b>, <b>12.Video</b>, <b>14.Video-Audio</b>: the files of the Reference Loader (see <b>Media 08 to 14</b>)"],
                [folderBadge("40.Rush Videos"), "<b>40.Rush Videos</b>, <b>60.Rush Images</b>: the outputs of the runs (see <b>Run windows</b> and <b>Sorting the rushes</b>)"],
            ]) +
            hCard("Good to know", [
                [textBadge("Date ↓", INACTIVE_BG), "Top of each window: newest first, or oldest first (Date ↑); one setting for all the windows."],
                ["Repair", "A subfolder deleted by mistake is created again when you pick the project."],
                ["Hidden", "<b>99.Project-Config</b> (configuration and its Archives) and <b>98.Error</b> (runs in error) " +
                    "are in the project folder but have no row in the node."],
                ["70.Rush Audio", "same four sort folders as 40 and 60, no row yet; its Picture Lock feeds the Audio " +
                    "of <b>MiniMax H3 Final Cut</b>."],
            ]) +
            hTip("A project name cannot contain <b>&lt; &gt; : \" / \\ | ? *</b> nor end with a dot."),
    },
    {
        id: "media", title: "Media 08 to 14", icon: FOLDER_ICONS["08.Images"], color: FOLDER_COLORS["08.Images"],
        html: "<p><b>08.Images</b>, <b>10.Son</b>, <b>12.Video</b> and <b>14.Video-Audio</b> follow the lists of the " +
            "Reference Loader.</p>" +
            hCard("The row of the folder", [
                ["Use: n/x", "files used out of the most allowed (08: 9 in Ref2VA, 2 in FL2VA; 10, 12 and 14: 3)."],
                ["Orphelins: m", "files no list uses anymore, in orange."],
                ["In Archives: y", "files in <b>&lt;folder&gt;/Archives</b>."],
            ]) +
            "<p><b>Update the folder</b> (orange bell)</p>" +
            hSteps([
                "A reference added or removed in the Reference Loader turns the bell " +
                iconBadge(BELL_ICON, BELL_ORANGE) + " orange, with " + iconBadge(WARN_ICON, INACTIVE_BG) + " left of the folder.",
                "Click the bell, then <b>Update</b>: the new files are copied (the Reference Loader then uses the " +
                "copies) and the unused files go to <b>&lt;folder&gt;/Archives</b>.",
                "The bell turns grey again. No file is deleted.",
            ]) +
            hCard("The window of the folder", [
                ["Files", "in the order of the Reference Loader with their number (<b>F</b> / <b>L</b> = First / Last " +
                    "frame; files without number at the end, greyed), then the <b>Archives</b> frame."],
                ["Thumbnail", "opens the <b>Preview</b>; Close, Escape or a click outside closes the window."],
            ]) +
            hCard("Special cases", [
                ["Missing files", "references pointing to files no longer on the disk: Update copies nothing and " +
                    "proposes <b>Remove missing references</b>."],
                ["Archives", "a file is named <b>yyyyMMdd_HHmmss_name.ext</b> there and takes its name back when it " +
                    "leaves."],
            ]) +
            hNote("this is not a change of the workflow: no configuration is written, and the bell of 00.Workflows " +
                "ignores the lists of the Reference Loader."),
    },
    {
        id: "duplicates", title: "Duplicates in Archives", icon: DUP_ICON, color: BELL_ORANGE,
        html: "<p>The <b>Archives</b> of 08.Images, 10.Son, 12.Video and 14.Video-Audio are compared by SHA256 (even " +
            "when the folder itself is empty). Identical copies show " + iconBadge(DUP_ICON, BELL_ORANGE) +
            " right of the bell.</p>" +
            hSteps([
                "Click it: the <b>Duplicates</b> window shows one thumbnail per group, with its number of copies and a " +
                "check box.",
                "Click a thumbnail to see all its copies below (number, total size, size freed).",
                "<b>Delete (x) file(s)</b> asks <b>Cancel</b>, <b>Move to Recycle Bin</b> (Windows) or <b>Delete " +
                "permanently</b>.",
            ]) +
            hNote("One copy always stays: a dated name without <b>(x)</b>, then a name without <b>(2)</b> or " +
                "<b>_02</b>, otherwise the oldest. It is then named <b>yyyyMMdd_HHmmss_name.ext</b>. Groups without " +
                "duplicates leave the window."),
    },
    {
        id: "runwindows", title: "Run windows (04, 40, 60)", icon: FOLDER_ICONS["04.Prompt"], color: FOLDER_COLORS["04.Prompt"],
        html: "<p>Each recorded run shows in three windows: <b>click the row of the folder</b> to open its window. " +
            "The row shows <b>Last run: date | Runs: n</b> (40: runs with a video, 60: runs with an image).</p>" +
            hCard("The three windows", [
                [folderBadge("04.Prompt"), "<b>04.Prompt</b>: all the runs, filter <b>All / Video / Image</b>; one run " +
                    "at a time (list), with its thumbnail (‹ › when it has several outputs)."],
                [folderBadge("40.Rush Videos"), "<b>40.Rush Videos</b>: the videos of the runs (copies), as scrolling thumbnails."],
                [folderBadge("60.Rush Images"), "<b>60.Rush Images</b>: the images of the runs (originals), as scrolling thumbnails."],
            ]) +
            hCard("For the chosen run", [
                ["Configuration", "date and mode, Steps, CFG, Seed, status, <b>Duration</b> (total time of the run, " +
                    "model loading included), size of the video, folder of the <b>Original</b>."],
                ["Models / LoRA", "two folded blocks, one open at a time: what the run really used (chosen branch of " +
                    "a switch, active LoRA)."],
                ["Prompt", "the text of the run; the icon at the top left copies it."],
                ["Retrieve the workflow", "opens the workflow of the run in a new tab (greyed when there is none)."],
                ["Thumbnail", "a click opens it large (<b>Preview</b>); a new click, ✕, Escape or a click outside closes it."],
            ]) +
            hNote("at the end of a run, its models and LoRA are noted in the registries of <b>02.Models</b> and " +
                "<b>06.LoRA</b>.") +
            hNote(textBadge("Purge", PURGE_RED) + " deletes the runs left “running” and moves the runs in error to " +
                "<b>98.Error</b> (their files stay in place)."),
    },
    {
        id: "rushsort", title: "Sorting the rushes", icon: FOLDER_ICONS["40.Rush Videos"], color: FOLDER_COLORS["40.Rush Videos"],
        html: "<p><b>40.Rush Videos</b> and <b>60.Rush Images</b> each have four folders; the new rushes arrive in " +
            "<b>Footage</b>.</p>" +
            hCard("Dot of each thumbnail", [
                [helpDot("#f5c518"), "Picture Lock"],
                [helpDot("#7ee081"), "Rough Cut"],
                [helpDot("#fb8c00"), "Footage"],
                [helpDot("#d32f2f"), "No Good"],
                [helpDot("#8a8a8a"), "the original is outside the project"],
            ]) +
            hWarn("a click on a folder button <b>moves the selected file into that folder at once, without " +
                "confirmation</b> (only bringing back an original from outside the project and the Swap of Picture Lock " +
                "ask first). To go back, click the button of its previous folder.", "Warning:") +
            "<p><b>Sort a file</b></p>" +
            hSteps([
                "Click the thumbnail.",
                "Click the button of the folder: <b>Picture Lock</b>, <b>Rough Cut</b>, <b>Footage</b> or <b>No Good</b>.",
            ]) +
            "<p>The button of the current folder is greyed; each button shows the number of files of its folder " +
            "(<b>Rough Cut · 3</b>).</p>" +
            hCard("Several files at once", [
                ["☑", "Check the boxes under the thumbnails: the buttons move <b>all the checked files</b>, one by one, " +
                    "with a progress bar."],
                ['<span style="color:#e53935;font-weight:bold">✕</span>', "A failed file is skipped and the others go " +
                    "on; it stays checked with a red ✕."],
            ]) +
            hCard("Picture Lock", [
                [iconBadge(FOLDER_OPEN_ICON, SIMPLE_COLOR), "<b>Simple</b> project: any number of files."],
                [iconBadge(TREE_ICON, MULTI_COLOR), "Project of a <b>MultiProject</b>: <b>one file</b>, the final rush; " +
                    "when it is taken, <b>Swap</b> exchanges them (the old one goes to the folder of the new one)."],
            ]) +
            hCard("Delete (No Good only)", [
                [iconBadge(TRASH_ICON, INACTIVE_BG), "Check the files, then <b>Delete</b>: Recycle Bin, or delete " +
                    "permanently (type <b>CONFIRMER</b>)."],
            ]) +
            hCard("Safety of the moves", [
                ["SHA256", "Each move is done in three steps: copy, SHA256 check, then the original is deleted. On an " +
                    "error the original is untouched: <b>Retry</b> or <b>Abandon</b>."],
                ["Duplicate", "A file copied by hand that is identical to the file of a run: when the window opens, " +
                    "a window asks which one to keep; the other goes to the Recycle Bin."],
            ]) +
            hCard("Display", [
                ["Order", "Thumbnails grouped by dot, then by date (Date ↓ / ↑)."],
                ["Filter", "Click dots to show only those colours."],
            ]),
    },
    {
        id: "sets", title: "Sets 02 / 06", icon: FOLDER_ICONS["02.Models"], color: FOLDER_COLORS["02.Models"],
        html: "<p>The rows of 02.Models and 06.LoRA show <b>Sets: n | Last run: date</b>. A click opens the window.</p>" +
            hCard("The window", [
                ["Left", "the sets of the registry: number, files, number of runs, last run."],
                ["Right", "the prompts of the chosen set, identical texts grouped; the blue " +
                    iconBadge(EYE_ICON, "#3b82f6") + " opens the runs of the prompt."],
                ["Below", "the other side of the chosen prompt (its LoRA from 02.Models, its models from 06.LoRA)."],
            ]),
    },
    {
        id: "where", title: "Where projects go", icon: GEAR_ICON, color: VIOLET,
        html: "<p>The projects are created in the <b>Root folder</b> of the Reference Loader.</p>" +
            hCard("Projects folder", [
                ["Wired", "the Root folder (" + iconBadge(GEAR_ICON, VIOLET) + " of the Reference Loader); change it " +
                    "there and the list follows."],
                ["Root folder empty", "the window of " + iconBadge(PLUS_ICON, PINK) + " proposes " +
                    "<b>ComfyUI/input/Projets</b>, or " + iconBadge(FOLDER_ICON, VIOLET) + " Browse."],
                ["Root folder missing", "<b>Create</b> makes it first."],
                ["Not wired", "the node is greyed (the <b>project</b> input is required)."],
            ]) +
            hTitle(FOLDER_OPEN_ICON, SIMPLE_COLOR, "Simple project") +
            hList([
                "One folder = one project.",
                "Its folders <b>00.Workflows</b> to <b>99.Project-Config</b> are created inside it.",
            ]) +
            hWarn("a Simple project cannot hold other projects.", "Warning:") +
            hTitle(TREE_ICON, MULTI_COLOR, "MultiProject") +
            hList([
                "One folder that holds several projects (for example the shots of one film).",
                "<b>(new)</b>: type the name of the folder, then the name of its first project.",
                "To add a project later: pick the folder in <b>Folder of projects</b>.",
                "In the <b>Project name</b> list, the folder is a title and its projects are under it.",
            ]) +
            hNote("the tooltip of a folder row gives its path; the bottom line of the node only shows messages."),
    },
    {
        id: "save", title: "Load and Save", icon: SAVE_ICON, color: PINK,
        html: "<p>" + textBadge("Save") + " records the state of the project, " + textBadge("Load") + " puts it back. " +
            "Both need a project picked and the Reference Loader wired.</p>" +
            "<p><b>Save: record the project</b> (it first shows what it will do and asks for a confirmation)</p>" +
            hSteps([
                "<b>Copies the files of the Reference Loader into the project</b>; the Reference Loader then uses " +
                "these copies.",
                "<b>Saves the workflow</b> (through the window of the bell when it has changed).",
                "<b>Records the configuration</b> in <b>" + CONFIG_PATH + "</b>: the files of each folder, their number " +
                "and their SHA256. The previous configuration goes to Archives, never overwritten.",
            ]) +
            hCard("List of the Reference Loader → folder", [
                [folderBadge("08.Images"), "Images, First / Last frame → <b>08.Images</b>"],
                [folderBadge("10.Son"), "Audio → <b>10.Son</b>"],
                [folderBadge("12.Video"), "Video → <b>12.Video</b>"],
                [folderBadge("14.Video-Audio"), "Video/Audio → <b>14.Video-Audio</b>"],
            ]) +
            hNote("each file of 08, 10, 12 and 14 must be used by the Reference Loader; otherwise the configuration " +
                "is not recorded and those files are listed.") +
            "<p><b>Load: put the project back</b></p>" +
            hSteps([
                "<b>Checks each file</b> against the configuration, without changing anything; a missing or different " +
                "file is looked for in the Archives of its folder.",
                "The <b>Load the project</b> window shows each folder: <b style=\"color:" + GREEN + "\">✓</b> identical, " +
                "<b style=\"color:#d32f2f\">✗</b> missing or different, <b>→ found in Archives</b> (" +
                iconBadge(EYE_ICON, VIOLET) + " to see it). Uncheck what must not be loaded (00.Workflows, 08 to 14).",
                "<b>Load</b> puts back the files found, fills the Reference Loader and loads the workflow.",
            ]) +
            hCard("The workflow when loading", [
                ["Same structure", "replaces the workflow of this tab"],
                ["Other structure, same project", "replaces the workflow of this tab"],
                ["Other structure, other project", "new tab, then <b>OK</b> (stay here) or <b>Open the project</b>"],
                ["Project of the same MultiProject", "<b>Whole workflow | Data only</b> switch"],
                ["00.Workflows unchecked", "no workflow: only the checked folders go to the Reference Loader"],
            ]) +
            "<p>Replacing the workflow of the tab always asks first: the changes not saved are lost.</p>" +
            hCard("Data only", [
                [iconBadge(TREE_ICON, MULTI_COLOR), "This tab keeps its workflow; only the files and the values of the " +
                    "common nodes (same number, same type) come from the project. Same structure: bell " +
                    "<b style=\"color:" + BELL_ORANGE + "\">orange</b>. Other structure: bell <b style=\"color:" + BELL_RED +
                    "\">red</b>, and <b>Overwrite</b> will replace the saved workflow of the project."],
            ]) +
            hNote("picking another project in the list opens the Load window by itself. 04.Prompt is only checked; " +
                "02.Models, 06.LoRA, 40 and 60 are for information."),
    },
    {
        id: "workflow", title: "Workflow", icon: BELL_ICON, color: ORANGE,
        html: "<p>The workflow of the project is saved in <b>00.Workflows</b>. Its row shows <b>Last save: date</b>.</p>" +
            hCard("Colour of the bell", [
                [iconBadge(BELL_ICON, INACTIVE_BG), "grey: never saved."],
                [iconBadge(BELL_ICON, BELL_ORANGE), "orange: changes to save (" + iconBadge(WARN_ICON, INACTIVE_BG) +
                    " left of the row)."],
                [iconBadge(BELL_ICON, BELL_GREEN), "green: saved, no change since."],
                [iconBadge(BELL_ICON, BELL_RED), "red: <b>Data only</b> with another structure, to save. While it is " +
                    "red, changing or creating a project asks <b>Yes, save</b> / <b>No</b> / <b>Cancel</b>."],
            ]) +
            "<p><b>Save the workflow</b></p>" +
            hSteps([
                "Click the bell: the window lists the changes since the last save.",
                "Choose <b>Archive it</b> (the previous one goes to <b>00.Workflows/Archives</b>) or <b>Overwrite</b>.",
                "<b>Save</b> or <b>Overwrite</b>; the window stays open, <b>Close</b> closes it.",
            ]) +
            hCard("Archives", [
                [iconBadge(ARCHIVE_ICON, VIOLET), "Opens an archived workflow in a new tab (the current one does not change)."],
                ["5 max", "At 5 archives, <b>Archive it</b> first asks which ones to delete."],
            ]) +
            hNote("moving nodes only does not turn the bell orange; it is listed as a layout change."),
    },
    {
        id: "runs", title: "Run record", icon: START_ICON, color: GREEN,
        html: "<p>To record the runs: a <b>project picked</b> and the <b>text_prompt</b> input wired to the final " +
            "prompt text.</p>" +
            hCard("When the run starts", [
                [folderBadge("04.Prompt"), "<b>yyyyMMdd_HHmmss_run.json</b>: date, project, mode, prompt, and the CFG, " +
                    "Steps and Seed read in the run."],
                [folderBadge("00.Workflows"), "<b>00.Workflows/Run</b>: the workflow as it was when Run was clicked."],
            ]) +
            hCard("At the end of the run", [
                [folderBadge("40.Rush Videos"), "<b>Videos</b> copied to <b>40.Rush Videos/Footage</b> under the name of " +
                    "the run; a video larger than 960x544 is reduced. The original is never changed."],
                [folderBadge("60.Rush Images"), "<b>Images</b> stay where the save node puts them; the run names them " +
                    "and 60.Rush Images shows them."],
                [folderBadge("04.Prompt"), "The <b>JSON</b> gets the status (done / error), the duration and the sizes."],
                [folderBadge("02.Models"), "<b>Models and LoRA</b> are noted in the registries of 02.Models and 06.LoRA."],
            ]) +
            hCard("Not recorded", [
                ["Cache", "A run without any <b>new file</b> (a result sent back by the cache of ComfyUI, for example): " +
                    "its JSON is removed and nothing is copied."],
            ]) +
            hCard("How CFG, Steps and Seed are read", [
                ["Typed", "a value typed in the node is read directly."],
                ["Linked", "a linked value is followed (Get / Set, Reroute, switch, Pixaroma Sliders)."],
                ["Computed", "a value computed during the run gives <b>null</b>, with the name of the node in " +
                    "<b>cfg_from</b> / <b>steps_from</b> / <b>seed_from</b>."],
            ]) +
            hCard("Optional input models_link", [
                [iconBadge(LINK_ICON, ORANGE), "Wire the <b>model_link</b> output of <b>MultiFiles Select</b> (directly, " +
                    "or through Set / Get, Reroute or a Switch MultiIN-OUT): its fields give the models of the run. " +
                    "Not wired: the models are read in the graph. The LoRA are always read in the graph. An empty save " +
                    "folder of MultiFiles Select gets <b>&lt;project&gt;/02.Models</b>."],
            ]) +
            hNote("during a run, <b>Load</b> and <b>Save</b> are locked. The end of the run is recorded by the server: " +
                "changing tab or closing the page no longer loses it."),
    },
    {
        id: "rename", title: "Rename or move", icon: PENCIL_ICON, color: VIOLET,
        html: "<p>" + iconBadge(PENCIL_ICON, VIOLET) + " opens a window with a <b>Rename | Move</b> switch; nothing " +
            "changes before you confirm.</p>" +
            hSteps([
                "<b>Rename</b>: new name of the project folder. <b>Move</b>: new parent folder (" +
                iconBadge(FOLDER_ICON, VIOLET) + " Browse).",
                "Check the current and the new one, then confirm.",
            ]) +
            hCard("What follows", [
                ["References", "the references of the Reference Loader that are in the project."],
                ["Projects folder", "after a move, the Root folder of the Reference Loader."],
                ["Runs", "their paths are relinked by themselves the next time the runs are read."],
            ]),
    },
];

const HELP_SECTIONS_FR = [
    {
        id: "start", title: "Démarrage rapide",
        html: hSteps([
            "Reliez la sortie <b>project</b> du <b>MiniMax H3 Reference Loader</b> (sa dernière sortie) à l'entrée " +
            "<b>project</b> de ce nœud.",
            "Cliquez sur " + iconBadge(PLUS_ICON, PINK) + ", tapez le nom du projet : <b>Simple</b> (un projet) ou " +
            "<b>MultiProject</b> (un dossier de projets), puis <b>Create</b>.",
            "Ou choisissez un projet existant dans la liste.",
        ]) +
        hCard("Boutons du nœud", [
            [iconBadge(PENCIL_ICON, VIOLET), "Renommer ou déplacer le projet"],
            [iconBadge(PLUS_ICON, PINK), "Nouveau projet"],
            [textBadge("Load"), "Remettre le projet en place (voir <b>Load et Save</b>)"],
            [textBadge("Save"), "Enregistrer le projet (voir <b>Load et Save</b>)"],
            [textBadge("Copy", "#1e88e5"), "Copier les médias 08 à 14 d'un autre projet (fichiers identiques sautés)"],
            [textBadge("Reset", "#e53935"), "Vider le projet (voir l'avertissement ci-dessous)"],
            [textBadge("Purge", PURGE_RED), "Nettoyer les Runs : restés « running », ou en erreur (vers 98.Error)"],
            [textBadge("Date ↓", INACTIVE_BG), "Ordre des fenêtres : plus récent ou plus ancien d'abord"],
            [iconBadge(REFRESH_ICON, VIOLET), "Relire la liste des projets"],
            [iconBadge(BELL_ICON, BELL_ORANGE), "Cloches : workflow (voir <b>Workflow</b>) et médias 08 à 14 (voir <b>Médias 08 à 14</b>)"],
            [iconBadge(ARCHIVE_ICON, VIOLET), "Workflows archivés"],
        ]) +
        hWarn("<b>Reset</b> envoie <b>tous les fichiers du projet</b> dans la Corbeille (après un bilan et la saisie " +
            "du nom du projet) ; les dossiers restent et la sélection du Reference Loader est vidée.", "Attention :"),
    },
    {
        id: "inputs", title: "Entrées",
        html: "<p>Le nœud a trois entrées : <b>project est obligatoire</b> (c'est tout l'intérêt de ce nœud), " +
            "<b>text_prompt</b> et <b>models_link</b> sont optionnelles et ajoutent chacune une fonction.</p>" +
            inputCard("project", "Obligatoire", [
                ["Brancher", "la sortie <b>project</b> du <b>MiniMax H3 Reference Loader</b> : toujours sa dernière " +
                    "sortie, dans les deux modes ; le lien reste quand vous basculez Ref2VA / F2VA-FL2VA."],
                ["Apporte", "le dossier des projets (Root folder du Reference Loader) et le lien avec le Reference " +
                    "Loader : indispensable pour <b>Save</b>, pour que <b>Load</b> remplisse le Reference Loader, et " +
                    "pour les cloches de 08 à 14. Elle ne donne que le Root folder : les références et les galeries ne " +
                    "changent pas."],
                ["Sans elle", "le nœud est grisé (projets, dossiers, Load, Save, Purge) avec le message <b>Wire the " +
                    "project output of the MiniMax H3 Reference Loader</b>, et ComfyUI refuse le Run (entrée " +
                    "obligatoire manquante)."],
            ]) +
            inputCard("text_prompt", "Optionnelle", [
                ["Brancher", "le texte final du prompt (le même texte que le prompt du nœud MiniMax)."],
                ["Apporte", "l'enregistrement de chaque Run : JSON dans <b>04.Prompt</b>, copies dans <b>40.Rush " +
                    "Videos</b>, registres dans <b>02.Models</b> / <b>06.LoRA</b> (voir <b>Enregistrement des Runs</b>)."],
                ["Sans elle", "rien n'est enregistré ; les fenêtres 04, 40 et 60 restent vides."],
            ]) +
            inputCard("models_link", "Optionnelle", [
                ["Brancher", "la sortie <b>model_link</b> de <b>MultiFiles Select</b> (directement, ou via Set / Get, " +
                    "Reroute, ou un Switch MultiIN-OUT : l'entrée de son groupe actif)."],
                ["Apporte", "les modèles du Run avec leur <b>position</b> (numéro du champ), et " +
                    "<b>&lt;projet&gt;/02.Models</b> comme dossier de sauvegarde de MultiFiles Select quand il est vide " +
                    "(un dossier choisi à la main n'est jamais remplacé)."],
                ["Sans elle", "les modèles sont lus dans le graphe (position 0). Les LoRA sont toujours lues dans le " +
                    "graphe."],
            ]) +
            hNote("sortie <b>final_cut</b> : reliez-la au nœud <b>MiniMax H3 Final Cut</b> (copies des Picture " +
                "Lock pour MiniMax H3 Director).", "Remarque :"),
    },
    {
        id: "folders", title: "Dossiers du projet",
        html: "<p>Chaque projet est un dossier avec toujours les mêmes sous-dossiers. Cliquez sur une ligne pour " +
            "ouvrir sa fenêtre.</p>" +
            hCard("Dossiers du projet", [
                [folderBadge("00.Workflows"), "<b>00.Workflows</b> : le workflow du projet et ses archives (voir <b>Workflow</b>)"],
                [folderBadge("02.Models"), "<b>02.Models</b>, <b>06.LoRA</b> : les ensembles de modèles et de LoRA utilisés par les Runs (voir <b>Ensembles 02 / 06</b>)"],
                [folderBadge("04.Prompt"), "<b>04.Prompt</b> : les Runs enregistrés (voir <b>Fenêtres des Runs</b>)"],
                [folderBadge("08.Images"), "<b>08.Images</b>, <b>10.Son</b>, <b>12.Video</b>, <b>14.Video-Audio</b> : les fichiers du Reference Loader (voir <b>Médias 08 à 14</b>)"],
                [folderBadge("40.Rush Videos"), "<b>40.Rush Videos</b>, <b>60.Rush Images</b> : les sorties des Runs (voir <b>Fenêtres des Runs</b> et <b>Tri des rushs</b>)"],
            ]) +
            hCard("Bon à savoir", [
                [textBadge("Date ↓", INACTIVE_BG), "En haut de chaque fenêtre : plus récent d'abord, ou plus ancien d'abord (Date ↑) ; un seul réglage pour toutes les fenêtres."],
                ["Réparation", "Un sous-dossier supprimé par erreur est recréé quand vous choisissez le projet."],
                ["Cachés", "<b>99.Project-Config</b> (configuration et ses Archives) et <b>98.Error</b> (Runs en " +
                    "erreur) sont dans le dossier du projet mais n'ont pas de ligne dans le nœud."],
                ["70.Rush Audio", "mêmes quatre dossiers de tri que 40 et 60, pas encore de ligne ; son Picture Lock " +
                    "alimente l'Audio de <b>MiniMax H3 Final Cut</b>."],
            ]) +
            hTip("Un nom de projet ne peut pas contenir <b>&lt; &gt; : \" / \\ | ? *</b> ni finir par un point.",
                "Astuce :"),
    },
    {
        id: "media", title: "Médias 08 à 14",
        html: "<p><b>08.Images</b>, <b>10.Son</b>, <b>12.Video</b> et <b>14.Video-Audio</b> suivent les listes du " +
            "Reference Loader.</p>" +
            hCard("La ligne du dossier", [
                ["Use: n/x", "fichiers utilisés sur le maximum permis (08 : 9 en Ref2VA, 2 en FL2VA ; 10, 12 et 14 : 3)."],
                ["Orphelins: m", "fichiers qu'aucune liste n'utilise plus, en orange."],
                ["In Archives: y", "fichiers dans <b>&lt;dossier&gt;/Archives</b>."],
            ]) +
            "<p><b>Mettre le dossier à jour</b> (cloche orange)</p>" +
            hSteps([
                "Une référence ajoutée ou retirée dans le Reference Loader passe la cloche " +
                iconBadge(BELL_ICON, BELL_ORANGE) + " à l'orange, avec " + iconBadge(WARN_ICON, INACTIVE_BG) +
                " à gauche du dossier.",
                "Cliquez sur la cloche, puis <b>Update</b> : les nouveaux fichiers sont copiés (le Reference Loader " +
                "utilise ensuite les copies) et les fichiers inutilisés partent dans <b>&lt;dossier&gt;/Archives</b>.",
                "La cloche redevient grise. Aucun fichier n'est effacé.",
            ]) +
            hCard("La fenêtre du dossier", [
                ["Fichiers", "dans l'ordre du Reference Loader avec leur numéro (<b>F</b> / <b>L</b> = First / Last " +
                    "frame ; sans numéro à la fin, grisés), puis le cadre <b>Archives</b>."],
                ["Vignette", "ouvre l'aperçu (<b>Preview</b>) ; Close, Échap ou un clic à côté ferme la fenêtre."],
            ]) +
            hCard("Cas particuliers", [
                ["Fichiers manquants", "des références pointent vers des fichiers qui ne sont plus sur le disque : " +
                    "Update ne copie rien et propose <b>Remove missing references</b>."],
                ["Archives", "un fichier y est nommé <b>yyyyMMdd_HHmmss_nom.ext</b> et reprend son nom en sortant."],
            ]) +
            hNote("ce n'est pas une modification du workflow : aucune configuration n'est écrite, et la cloche de " +
                "00.Workflows ignore les listes du Reference Loader.", "Remarque :"),
    },
    {
        id: "duplicates", title: "Doublons d'Archives",
        html: "<p>Les <b>Archives</b> de 08.Images, 10.Son, 12.Video et 14.Video-Audio sont comparées par SHA256 " +
            "(même quand le dossier lui-même est vide). Des copies identiques affichent " + iconBadge(DUP_ICON, BELL_ORANGE) +
            " à droite de la cloche.</p>" +
            hSteps([
                "Cliquez dessus : la fenêtre <b>Duplicates</b> montre une vignette par groupe, avec son nombre de " +
                "copies et une case à cocher.",
                "Cliquez sur une vignette pour voir toutes ses copies en dessous (nombre, taille totale, place libérée).",
                "<b>Delete (x) file(s)</b> demande <b>Cancel</b>, <b>Move to Recycle Bin</b> (Windows) ou <b>Delete " +
                "permanently</b>.",
            ]) +
            hNote("Un exemplaire reste toujours : un nom daté sans <b>(x)</b>, puis un nom sans <b>(2)</b> ni " +
                "<b>_02</b>, sinon le plus ancien. Il est ensuite nommé <b>yyyyMMdd_HHmmss_nom.ext</b>. Les groupes " +
                "sans doublon quittent la fenêtre.", "Remarque :"),
    },
    {
        id: "runwindows", title: "Fenêtres des Runs (04, 40, 60)",
        html: "<p>Chaque Run enregistré apparaît dans trois fenêtres : <b>cliquez sur la ligne du dossier</b> pour " +
            "ouvrir la sienne. La ligne affiche <b>Last run: date | Runs: n</b> (40 : Runs avec une vidéo, 60 : " +
            "Runs avec une image).</p>" +
            hCard("Les trois fenêtres", [
                [folderBadge("04.Prompt"), "<b>04.Prompt</b> : tous les Runs, filtre <b>All / Video / Image</b> ; un " +
                    "Run à la fois (liste), avec sa vignette (‹ › s'il a plusieurs sorties)."],
                [folderBadge("40.Rush Videos"), "<b>40.Rush Videos</b> : les vidéos des Runs (copies), en vignettes qui défilent."],
                [folderBadge("60.Rush Images"), "<b>60.Rush Images</b> : les images des Runs (originaux), en vignettes qui défilent."],
            ]) +
            hCard("Pour le Run choisi", [
                ["Configuration", "date et mode, Steps, CFG, Seed, statut, <b>Duration</b> (temps total du Run, " +
                    "chargement des modèles compris), taille de la vidéo, dossier de l'<b>Original</b>."],
                ["Models / LoRA", "deux blocs repliés, un seul ouvert à la fois : ce que le Run a vraiment utilisé " +
                    "(branche choisie d'un switch, LoRA actives)."],
                ["Prompt", "le texte du Run ; l'icône en haut à gauche le copie."],
                ["Retrieve the workflow", "rouvre le workflow du Run dans un nouvel onglet (grisé s'il n'existe pas)."],
                ["Vignette", "un clic l'ouvre en grand (<b>Preview</b>) ; un nouveau clic, ✕, Échap ou un clic à " +
                    "côté la ferme."],
            ]) +
            hNote("à la fin d'un Run, ses modèles et LoRA sont notés dans les registres de <b>02.Models</b> et " +
                "<b>06.LoRA</b>.", "Remarque :") +
            hNote(textBadge("Purge", PURGE_RED) + " supprime les Runs restés « running » et range les Runs en erreur " +
                "dans <b>98.Error</b> (leurs fichiers restent en place).", "Remarque :"),
    },
    {
        id: "rushsort", title: "Tri des rushs",
        html: "<p><b>40.Rush Videos</b> et <b>60.Rush Images</b> ont chacun quatre dossiers ; les nouveaux rushs " +
            "arrivent dans <b>Footage</b>.</p>" +
            hCard("Pastille de chaque vignette", [
                [helpDot("#f5c518"), "Picture Lock"],
                [helpDot("#7ee081"), "Rough Cut"],
                [helpDot("#fb8c00"), "Footage"],
                [helpDot("#d32f2f"), "No Good"],
                [helpDot("#8a8a8a"), "l'original est hors du projet"],
            ]) +
            hWarn("un clic sur un bouton de dossier <b>déplace aussitôt le fichier sélectionné dans ce dossier, sans " +
                "confirmation</b> (seuls le rapatriement d'un original hors du projet et le Swap de Picture Lock " +
                "demandent confirmation). Pour revenir en arrière, cliquez sur le bouton de son ancien dossier.",
                "Attention :") +
            "<p><b>Ranger un fichier</b></p>" +
            hSteps([
                "Cliquez sur la vignette.",
                "Cliquez sur le bouton du dossier : <b>Picture Lock</b>, <b>Rough Cut</b>, <b>Footage</b> ou <b>No Good</b>.",
            ]) +
            "<p>Le bouton du dossier actuel est grisé ; chaque bouton indique le nombre de fichiers de son dossier " +
            "(<b>Rough Cut · 3</b>).</p>" +
            hCard("Plusieurs fichiers à la fois", [
                ["☑", "Cochez les cases sous les vignettes : les boutons déplacent <b>tous les fichiers cochés</b>, un " +
                    "par un, avec une barre de progression."],
                ['<span style="color:#e53935;font-weight:bold">✕</span>', "Un fichier en échec est passé, les autres " +
                    "continuent ; il reste coché avec un ✕ rouge."],
            ]) +
            hCard("Picture Lock", [
                [iconBadge(FOLDER_OPEN_ICON, SIMPLE_COLOR), "Projet <b>Simple</b> : autant de fichiers que voulu."],
                [iconBadge(TREE_ICON, MULTI_COLOR), "Projet d'un <b>MultiProject</b> : <b>un seul fichier</b>, le rush " +
                    "final ; s'il est occupé, <b>Swap</b> échange les deux (l'ancien part dans le dossier du nouveau)."],
            ]) +
            hCard("Supprimer (No Good seulement)", [
                [iconBadge(TRASH_ICON, INACTIVE_BG), "Cochez les fichiers, puis <b>Delete</b> : Corbeille, ou " +
                    "suppression définitive (taper <b>CONFIRMER</b>)."],
            ]) +
            hCard("Sécurité des déplacements", [
                ["SHA256", "Un déplacement se fait toujours en trois temps : copie, contrôle SHA256, puis suppression " +
                    "de l'original. En cas d'erreur, l'original n'est pas touché : <b>Retry</b> ou <b>Abandon</b>."],
                ["Doublon", "Un fichier copié à la main, identique à celui d'un Run : à l'ouverture, une fenêtre " +
                    "demande lequel garder ; l'autre part dans la Corbeille."],
            ]) +
            hCard("Affichage", [
                ["Ordre", "Vignettes groupées par pastille, puis par date (Date ↓ / ↑)."],
                ["Filter", "Cliquez sur des pastilles pour n'afficher que ces couleurs."],
            ]),
    },
    {
        id: "sets", title: "Ensembles 02 / 06",
        html: "<p>Les lignes de 02.Models et 06.LoRA affichent <b>Sets: n | Last run: date</b>. Un clic ouvre la " +
            "fenêtre.</p>" +
            hCard("La fenêtre", [
                ["À gauche", "les ensembles du registre : numéro, fichiers, nombre de Runs, dernier Run."],
                ["À droite", "les prompts de l'ensemble choisi, textes identiques regroupés ; l'" +
                    iconBadge(EYE_ICON, "#3b82f6") + " bleu ouvre les Runs du prompt."],
                ["Dessous", "l'autre côté du prompt choisi (ses LoRA depuis 02.Models, ses modèles depuis 06.LoRA)."],
            ]),
    },
    {
        id: "where", title: "Où vont les projets",
        html: "<p>Les projets sont créés dans le <b>Root folder</b> du Reference Loader.</p>" +
            hCard("Dossier des projets", [
                ["Relié", "le Root folder (" + iconBadge(GEAR_ICON, VIOLET) + " du Reference Loader) ; changez-le là-bas " +
                    "et la liste suit."],
                ["Root folder vide", "la fenêtre de " + iconBadge(PLUS_ICON, PINK) + " propose " +
                    "<b>ComfyUI/input/Projets</b>, ou " + iconBadge(FOLDER_ICON, VIOLET) + " Browse."],
                ["Root folder absent", "<b>Create</b> le crée d'abord."],
                ["Non relié", "le nœud est grisé (l'entrée <b>project</b> est obligatoire)."],
            ]) +
            hTitle(FOLDER_OPEN_ICON, SIMPLE_COLOR, "Projet Simple") +
            hList([
                "Un dossier = un projet.",
                "Ses dossiers <b>00.Workflows</b> à <b>99.Project-Config</b> sont créés dedans.",
            ]) +
            hWarn("un projet Simple ne peut pas contenir d'autres projets.", "Attention :") +
            hTitle(TREE_ICON, MULTI_COLOR, "MultiProject") +
            hList([
                "Un dossier qui contient plusieurs projets (par exemple les plans d'un même film).",
                "<b>(new)</b> : tapez le nom du dossier, puis le nom de son premier projet.",
                "Pour ajouter un projet plus tard : choisissez le dossier dans <b>Folder of projects</b>.",
                "Dans la liste <b>Project name</b>, le dossier est un titre et ses projets sont en dessous.",
            ]) +
            hNote("l'infobulle d'une ligne de dossier donne son chemin ; la ligne du bas du nœud ne montre que " +
                "les messages.", "Remarque :"),
    },
    {
        id: "save", title: "Load et Save",
        html: "<p>" + textBadge("Save") + " enregistre l'état du projet, " + textBadge("Load") + " le remet en place. " +
            "Les deux demandent un projet choisi et le Reference Loader relié.</p>" +
            "<p><b>Save : enregistrer le projet</b> (il montre d'abord ce qu'il va faire et demande confirmation)</p>" +
            hSteps([
                "<b>Copie les fichiers du Reference Loader dans le projet</b> ; le Reference Loader utilise ensuite " +
                "ces copies.",
                "<b>Sauvegarde le workflow</b> (par la fenêtre de la cloche s'il a changé).",
                "<b>Enregistre la configuration</b> dans <b>" + CONFIG_PATH + "</b> : les fichiers de chaque dossier, " +
                "leur numéro et leur SHA256. L'ancienne part dans Archives, jamais écrasée.",
            ]) +
            hCard("Liste du Reference Loader → dossier", [
                [folderBadge("08.Images"), "Images, First / Last frame → <b>08.Images</b>"],
                [folderBadge("10.Son"), "Audio → <b>10.Son</b>"],
                [folderBadge("12.Video"), "Video → <b>12.Video</b>"],
                [folderBadge("14.Video-Audio"), "Video/Audio → <b>14.Video-Audio</b>"],
            ]) +
            hNote("chaque fichier de 08, 10, 12 et 14 doit être utilisé par le Reference Loader ; sinon la " +
                "configuration n'est pas enregistrée et les fichiers en cause sont listés.", "Remarque :") +
            "<p><b>Load : remettre le projet en place</b></p>" +
            hSteps([
                "<b>Vérifie chaque fichier</b> par rapport à la configuration, sans rien modifier ; un fichier manquant " +
                "ou différent est cherché dans les Archives de son dossier.",
                "La fenêtre <b>Load the project</b> montre chaque dossier : <b style=\"color:" + GREEN + "\">✓</b> " +
                "identique, <b style=\"color:#d32f2f\">✗</b> manquant ou différent, <b>→ found in Archives</b> (" +
                iconBadge(EYE_ICON, VIOLET) + " pour le voir). Décochez ce qui ne doit pas être chargé (00.Workflows, " +
                "08 à 14).",
                "<b>Load</b> remet les fichiers retrouvés, remplit le Reference Loader et charge le workflow.",
            ]) +
            hCard("Le workflow au chargement", [
                ["Même structure", "remplace le workflow de cet onglet"],
                ["Autre structure, même projet", "remplace le workflow de cet onglet"],
                ["Autre structure, autre projet", "nouvel onglet, puis <b>OK</b> (rester ici) ou <b>Open the project</b>"],
                ["Projet du même MultiProject", "interrupteur <b>Whole workflow | Data only</b>"],
                ["00.Workflows décoché", "pas de workflow : seuls les dossiers cochés vont dans le Reference Loader"],
            ]) +
            "<p>Remplacer le workflow de l'onglet demande toujours confirmation : les modifications non " +
            "sauvegardées sont perdues.</p>" +
            hCard("Data only", [
                [iconBadge(TREE_ICON, MULTI_COLOR), "L'onglet garde son workflow ; seuls les fichiers et les valeurs des " +
                    "nœuds communs (même numéro, même type) viennent du projet. Même structure : cloche " +
                    "<b style=\"color:" + BELL_ORANGE + "\">orange</b>. Autre structure : cloche <b style=\"color:" +
                    BELL_RED + "\">rouge</b>, et <b>Overwrite</b> remplacera le workflow sauvegardé du projet."],
            ]) +
            hNote("choisir un autre projet dans la liste ouvre la fenêtre Load d'elle-même. 04.Prompt est seulement " +
                "vérifié ; 02.Models, 06.LoRA, 40 et 60 sont pour information.", "Remarque :"),
    },
    {
        id: "workflow", title: "Workflow",
        html: "<p>Le workflow du projet est sauvegardé dans <b>00.Workflows</b>. Sa ligne affiche <b>Last save: date</b>.</p>" +
            hCard("Couleur de la cloche", [
                [iconBadge(BELL_ICON, INACTIVE_BG), "grise : jamais sauvegardé."],
                [iconBadge(BELL_ICON, BELL_ORANGE), "orange : changements à sauvegarder (" +
                    iconBadge(WARN_ICON, INACTIVE_BG) + " à gauche de la ligne)."],
                [iconBadge(BELL_ICON, BELL_GREEN), "verte : sauvegardé, aucun changement depuis."],
                [iconBadge(BELL_ICON, BELL_RED), "rouge : <b>Data only</b> avec une autre structure, à sauvegarder. " +
                    "Tant qu'elle est rouge, changer ou créer un projet demande <b>Yes, save</b> / <b>No</b> / " +
                    "<b>Cancel</b>."],
            ]) +
            "<p><b>Sauvegarder le workflow</b></p>" +
            hSteps([
                "Cliquez sur la cloche : la fenêtre liste les changements depuis la dernière sauvegarde.",
                "Choisissez <b>Archive it</b> (l'ancien part dans <b>00.Workflows/Archives</b>) ou <b>Overwrite</b>.",
                "<b>Save</b> ou <b>Overwrite</b> ; la fenêtre reste ouverte, <b>Close</b> la ferme.",
            ]) +
            hCard("Archives", [
                [iconBadge(ARCHIVE_ICON, VIOLET), "Ouvre un workflow archivé dans un nouvel onglet (l'actuel ne change pas)."],
                ["5 au plus", "À 5 archives, <b>Archive it</b> demande d'abord lesquelles supprimer."],
            ]) +
            hNote("déplacer des nœuds seulement ne fait pas passer la cloche à l'orange ; c'est listé comme un " +
                "changement de disposition.", "Remarque :"),
    },
    {
        id: "runs", title: "Enregistrement des Runs",
        html: "<p>Pour que les Runs soient enregistrés : <b>un projet choisi</b> et l'entrée <b>text_prompt</b> " +
            "branchée sur le texte final du prompt.</p>" +
            hCard("Au lancement du Run", [
                [folderBadge("04.Prompt"), "<b>yyyyMMdd_HHmmss_run.json</b> : date, projet, mode, prompt, et les CFG, " +
                    "Steps et Seed lus dans le Run."],
                [folderBadge("00.Workflows"), "<b>00.Workflows/Run</b> : le workflow tel qu'au clic sur Run."],
            ]) +
            hCard("À la fin du Run", [
                [folderBadge("40.Rush Videos"), "<b>Vidéos</b> copiées dans <b>40.Rush Videos/Footage</b>, au nom du " +
                    "Run ; une vidéo plus grande que 960x544 est réduite. L'original n'est jamais modifié."],
                [folderBadge("60.Rush Images"), "<b>Images</b> : elles restent où le nœud de sauvegarde les met ; le Run " +
                    "les cite et 60.Rush Images les montre."],
                [folderBadge("04.Prompt"), "Le <b>JSON</b> reçoit le statut (done / error), la durée et les tailles."],
                [folderBadge("02.Models"), "<b>Modèles et LoRA</b> : notés dans les registres de 02.Models et 06.LoRA."],
            ]) +
            hCard("Ce qui n'est pas enregistré", [
                ["Cache", "Un Run sans <b>fichier nouveau</b> (par exemple un résultat renvoyé par le cache de " +
                    "ComfyUI) : son JSON est retiré et rien n'est copié."],
            ]) +
            hCard("Comment CFG, Steps et Seed sont lus", [
                ["Tapée", "une valeur tapée dans le nœud est lue directement."],
                ["Reliée", "une valeur reliée est suivie (Get / Set, Reroute, switch, Pixaroma Sliders)."],
                ["Calculée", "une valeur calculée pendant le Run donne <b>null</b>, avec le nom du nœud dans " +
                    "<b>cfg_from</b> / <b>steps_from</b> / <b>seed_from</b>."],
            ]) +
            hCard("Entrée models_link (optionnelle)", [
                [iconBadge(LINK_ICON, ORANGE), "Branchez la sortie <b>model_link</b> de <b>MultiFiles Select</b> " +
                    "(directement, ou par Set / Get, Reroute ou un Switch MultiIN-OUT) : ses champs donnent les modèles " +
                    "du Run. Non branchée : les modèles sont lus dans le graphe. Les LoRA sont toujours lues dans le " +
                    "graphe. Un dossier de sauvegarde vide de MultiFiles Select reçoit <b>&lt;projet&gt;/02.Models</b>."],
            ]) +
            hNote("pendant un Run, <b>Load</b> et <b>Save</b> sont verrouillés. La fin du Run est enregistrée par le " +
                "serveur : changer d'onglet ou fermer la page ne la perd plus.", "Remarque :"),
    },
    {
        id: "rename", title: "Renommer ou déplacer",
        html: "<p>" + iconBadge(PENCIL_ICON, VIOLET) + " ouvre une fenêtre avec un interrupteur <b>Rename | Move</b> ; " +
            "rien ne change avant votre confirmation.</p>" +
            hSteps([
                "<b>Rename</b> : nouveau nom du dossier du projet. <b>Move</b> : nouveau dossier parent (" +
                iconBadge(FOLDER_ICON, VIOLET) + " Browse).",
                "Vérifiez l'ancien et le nouveau, puis confirmez.",
            ]) +
            hCard("Ce qui suit", [
                ["Références", "les références du Reference Loader qui sont dans le projet."],
                ["Dossier des projets", "après un déplacement, le Root folder du Reference Loader."],
                ["Runs", "leurs chemins sont recâblés d'eux-mêmes à la prochaine lecture des Runs."],
            ]),
    },
];

function projectHelpSections(lang) {
    if (lang !== "fr") return HELP_SECTIONS;
    const fr = Object.fromEntries(HELP_SECTIONS_FR.map((sec) => [sec.id, sec]));
    return HELP_SECTIONS.map((sec) => (fr[sec.id] ? Object.assign({}, sec, fr[sec.id]) : sec));
}

// --------------------------------------------------------------------
// Lien avec le Reference Loader (entree "project")
// --------------------------------------------------------------------
function linkById(graph, id) {
    if (!graph || !graph.links || id == null) return null;
    return typeof graph.links.get === "function" ? graph.links.get(id) : graph.links[id];
}

/** Reference Loader branche sur l'entree "project" (Reroute traverses), ou null. */
function linkedLoader(node) {
    const graph = node.graph;
    let input = (node.inputs || []).find((inp) => inp.name === "project");
    for (let hop = 0; input && hop < 20; hop++) {
        const link = linkById(graph, input.link);
        const origin = link && graph.getNodeById(link.origin_id);
        if (!origin) return null;
        if (typeof origin.mmRootFolder === "function") return origin;
        input = origin.inputs && origin.inputs.length === 1 ? origin.inputs[0] : null;
    }
    return null;
}

// --------------------------------------------------------------------
// Fenetre "New project" (bouton +)
// --------------------------------------------------------------------
function buildCreateDialog(container, ctx) {
    const { overlay, card } = makeOverlay();
    Object.assign(card.style, { width: "min(460px, 92vw)", padding: "12px 14px", borderColor: PINK });

    const title = document.createElement("div");
    title.textContent = "New project";
    Object.assign(title.style, { fontWeight: "bold", fontSize: "13px", color: TITLE_COLOR, marginBottom: "8px" });

    // Destination fixe : Root folder du Reference Loader.
    const where = document.createElement("div");
    Object.assign(where.style, { color: "#bbb", lineHeight: "1.5", marginBottom: "8px", wordBreak: "break-all" });

    // Destination libre (aucun Root folder) : champ + Browse + retour au dossier de repli.
    const folderBox = document.createElement("div");
    Object.assign(folderBox.style, { display: "none", marginBottom: "8px" });
    const folderLabel = document.createElement("div");
    folderLabel.textContent = "No Root folder in the MagicStudio RefLoader: choose the projects folder.";
    Object.assign(folderLabel.style, { color: "#bbb", lineHeight: "1.5", marginBottom: "6px" });
    const folderRow = document.createElement("div");
    Object.assign(folderRow.style, { display: "flex", gap: "6px", alignItems: "center" });
    const fieldStyle = {
        flex: "1", minWidth: "0", background: "#111", color: "#ddd", border: "1px solid #0c3833", borderRadius: "10px",
        padding: "6px 10px", fontSize: "12px", outline: "none", boxSizing: "border-box",
    };
    const folderInput = document.createElement("input");
    folderInput.type = "text";
    folderInput.placeholder = "Projects folder";
    Object.assign(folderInput.style, fieldStyle);
    const browseBtn = makeIconButton(VIOLET, FOLDER_ICON, "Browse");
    const fallbackBtn = makeIconButton(INACTIVE_BG, REFRESH_ICON, "");
    folderRow.append(folderInput, browseBtn, fallbackBtn);
    folderBox.append(folderLabel, folderRow);

    const warning = document.createElement("div");
    warning.textContent = "This folder does not exist: it will be created.";
    Object.assign(warning.style, {
        display: "none", borderLeft: "3px solid " + ORANGE, background: "#241b15", color: "#efcfb6",
        padding: "6px 10px", marginBottom: "8px",
    });

    // Simple ou MultiProject (choix utilisateur, 22/10/2026) : MultiProject = projet cree dans
    // un dossier de projets, nouveau ((new) + son nom) ou existant.
    let multi = false;
    const modeRow = document.createElement("div");
    Object.assign(modeRow.style, { display: "flex", gap: "6px", marginBottom: "8px" });
    const simpleBtn = makeTextButton("Simple", PINK);
    const multiBtn = makeTextButton("MultiProject", INACTIVE_BG);
    simpleBtn.title = "A project: its folders 00 to 99 are created in it";
    multiBtn.title = "A folder of projects: the project is created inside it, with its folders 00 to 99";
    modeRow.append(simpleBtn, multiBtn);
    const groupBox = document.createElement("div");
    Object.assign(groupBox.style, { display: "none", marginBottom: "8px" });
    const groupRow = document.createElement("div");
    Object.assign(groupRow.style, { display: "flex", gap: "6px", alignItems: "center" });
    const groupLab = document.createElement("span");
    groupLab.textContent = "Folder of projects:";
    Object.assign(groupLab.style, { color: "#9fd6cf", fontWeight: "bold", whiteSpace: "nowrap" });
    const groupSelect = document.createElement("select");
    Object.assign(groupSelect.style, fieldStyle, { padding: "4px 8px" });
    groupRow.append(groupLab, groupSelect);
    const groupInput = document.createElement("input");
    groupInput.type = "text";
    groupInput.placeholder = "Name of the new folder of projects";
    Object.assign(groupInput.style, fieldStyle, { width: "100%", flex: "0 0 auto", marginTop: "6px" });
    groupBox.append(groupRow, groupInput);

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Project name";
    Object.assign(input.style, fieldStyle, { width: "100%", flex: "0 0 auto" });
    const error = document.createElement("div");
    Object.assign(error.style, { color: ORANGE, minHeight: "14px", margin: "6px 0 0" });

    const footer = document.createElement("div");
    Object.assign(footer.style, { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" });
    const cancelBtn = makeTextButton("Cancel", INACTIVE_BG);
    const createBtn = makeTextButton("Create", GREEN);
    footer.append(cancelBtn, createBtn);
    card.append(title, where, folderBox, warning, modeRow, groupBox, input, error, footer);

    let info = null; // {root, exists, fixed, fallback}
    let checkId = 0;

    function paintMode() {
        simpleBtn.style.background = multi ? INACTIVE_BG : PINK;
        multiBtn.style.background = multi ? PINK : INACTIVE_BG;
        groupBox.style.display = multi ? "block" : "none";
        groupInput.style.display = multi && !groupSelect.value ? "block" : "none";
        input.placeholder = multi ? "Project name (inside the folder of projects)" : "Project name";
    }
    /** Dossiers de projets de la destination : (new), puis les existants. */
    function fillGroups(list) {
        const keep = groupSelect.value;
        groupSelect.innerHTML = "";
        for (const [value, text] of [["", "(new)"], ...list.map((g) => [g, g])]) {
            const o = document.createElement("option");
            o.value = value;
            o.textContent = text;
            o.style.background = "#111";
            groupSelect.appendChild(o);
        }
        groupSelect.value = list.includes(keep) ? keep : "";
        paintMode();
    }

    /** Dossier ou le projet sera cree. */
    const destination = () => (info.fixed ? info.root : folderInput.value.trim());

    /** Avertissement si le dossier choisi n'existe pas (demande au serveur). */
    async function checkFolder() {
        const id = ++checkId;
        const path = destination();
        if (!path) {
            warning.style.display = "none";
            return;
        }
        try {
            const data = await ctx.check(path);
            if (id !== checkId) return;
            warning.style.display = data.exists === false ? "block" : "none";
            fillGroups((data.tree || []).filter((e) => e.projects).map((e) => e.name));
        } catch (e) {
            if (id !== checkId) return;
            warning.style.display = "none";
            fillGroups([]);
        }
    }

    async function create() {
        const name = input.value.trim();
        const err = projectNameError(name);
        if (err) {
            error.textContent = err;
            input.style.borderColor = ORANGE;
            return;
        }
        const folder = destination();
        if (!folder) {
            error.textContent = "Choose the projects folder.";
            folderInput.style.borderColor = ORANGE;
            return;
        }
        const newGroup = multi && !groupSelect.value;
        const group = !multi ? null : newGroup ? groupInput.value.trim() : groupSelect.value;
        if (newGroup) {
            const gErr = projectNameError(group);
            if (gErr) {
                error.textContent = gErr.replace("project name", "name of the folder of projects");
                groupInput.style.borderColor = ORANGE;
                return;
            }
        }
        createBtn.disabled = true;
        error.textContent = "";
        try {
            await ctx.create(name, folder, group, newGroup);
            close();
        } catch (e) {
            error.textContent = e.message;
            input.style.borderColor = ORANGE;
        } finally {
            createBtn.disabled = false;
        }
    }

    async function browse() {
        browseBtn.disabled = true;
        error.textContent = "Opening the folder dialog...";
        try {
            const data = await apiGet("/mmrefloader/browse_dir?initial=" + encodeURIComponent(folderInput.value.trim()));
            if (data.path) folderInput.value = data.path;
            error.textContent = "";
            checkFolder();
        } catch (e) {
            error.textContent = e.message;
        } finally {
            browseBtn.disabled = false;
        }
    }

    // Les touches tapees ne partent pas vers le canvas ; Entree cree, Echap annule.
    const onKey = (e) => {
        if (overlay.style.display === "none") return;
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopImmediatePropagation();
            close();
            return;
        }
        if (e.target === input || e.target === folderInput || e.target === groupInput) {
            e.stopImmediatePropagation();
            if (e.key === "Enter") {
                e.preventDefault();
                create();
            }
        }
    };

    function close() {
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
    }

    input.addEventListener("input", () => {
        error.textContent = "";
        input.style.borderColor = "#0c3833";
    });
    folderInput.addEventListener("input", () => {
        error.textContent = "";
        folderInput.style.borderColor = "#0c3833";
        checkFolder();
    });
    groupInput.addEventListener("input", () => {
        error.textContent = "";
        groupInput.style.borderColor = "#0c3833";
    });
    groupSelect.addEventListener("change", paintMode);
    simpleBtn.addEventListener("click", () => {
        multi = false;
        paintMode();
    });
    multiBtn.addEventListener("click", () => {
        multi = true;
        paintMode();
        (groupSelect.value ? input : groupInput).focus();
    });
    browseBtn.addEventListener("click", browse);
    fallbackBtn.addEventListener("click", () => {
        folderInput.value = info.fallback;
        folderInput.style.borderColor = "#0c3833";
        checkFolder();
    });
    cancelBtn.addEventListener("click", close);
    createBtn.addEventListener("click", create);
    overlay.addEventListener("mousedown", close);

    return {
        /**
         * info = {root, exists, fixed, fallback} : fixed = Root folder du
         * Reference Loader (non modifiable) ; sinon root = dossier propose
         * (personnalise ou de repli), modifiable.
         */
        open(newInfo) {
            info = newInfo;
            where.style.display = info.fixed ? "block" : "none";
            folderBox.style.display = info.fixed ? "none" : "block";
            if (info.fixed) {
                where.innerHTML = "Create the project in the Root folder of the MagicStudio RefLoader:" +
                    "<br><b style=\"color:#9fd6cf\">" + escapeHtml(info.root) + "</b>";
            } else {
                folderInput.value = info.root || info.fallback;
                folderInput.style.borderColor = "#0c3833";
                fallbackBtn.title = "Back to the fallback folder: " + info.fallback;
            }
            warning.style.display = info.exists ? "none" : "block";
            multi = false;
            groupInput.value = "";
            groupInput.style.borderColor = "#0c3833";
            fillGroups([]);
            checkFolder();
            input.value = "";
            input.style.borderColor = "#0c3833";
            error.textContent = "";
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
// Confirmation (toute modification la demande)
// --------------------------------------------------------------------
/** ask({title, html, okLabel, okColor}) -> Promise<boolean> ; Echap ou clic a cote = non. */
// --------------------------------------------------------------------
// Reset du projet (choix utilisateur, 19/10/2026) : bilan par dossier, puis le
// bouton Reset ne s'active qu'une fois le nom du projet tape.
// --------------------------------------------------------------------
const RESET_RED = "#e53935";
// Au-dessus de l'apercu (10003) : fenetres de suppression ouvertes depuis 40 / 60.
const TOP_DIALOG_Z = "10005";

/**
 * Place la fenetre juste sous l'element (bouton Delete, choix utilisateur
 * 20/10/2026), au-dessus s'il n'y a pas la place, toujours dans l'ecran.
 */
function positionCardBelow(card, el, maxWidth) {
    const rect = el.getBoundingClientRect();
    const margin = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(maxWidth, vw - margin * 2);
    const left = Math.max(margin, Math.min(rect.left, vw - width - margin));
    const height = Math.min(card.offsetHeight || 200, vh - margin * 2);
    let top = rect.bottom + 6;
    if (top + height + margin > vh) top = rect.top - 6 - height;
    card.style.left = left + "px";
    card.style.top = Math.max(margin, Math.min(top, vh - height - margin)) + "px";
}
const COPY_BLUE = "#1e88e5";
// Copy depuis un dossier de projets : tous ses sous-projets (= project_config.ALL_SUBS).
const ALL_SUBS = "*";

function buildResetDialog(container) {
    const { overlay, card } = makeOverlay();
    overlay.style.zIndex = "10002";
    Object.assign(card.style, { width: "min(480px, 92vw)", padding: "12px 14px", borderColor: RESET_RED });
    const title = document.createElement("div");
    Object.assign(title.style, { fontWeight: "bold", fontSize: "13px", color: RESET_RED, marginBottom: "8px" });
    const text = document.createElement("div");
    Object.assign(text.style, { lineHeight: "1.5", color: "#ccc", wordBreak: "break-word" });
    const label = document.createElement("div");
    Object.assign(label.style, { marginTop: "10px", color: "#ddd" });
    const input = document.createElement("input");
    input.type = "text";
    Object.assign(input.style, {
        width: "100%", boxSizing: "border-box", marginTop: "4px", background: "#111", color: "#ddd",
        border: "1px solid #444", borderRadius: "6px", padding: "5px 8px", fontSize: "12px",
    });
    const footer = document.createElement("div");
    Object.assign(footer.style, { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" });
    const cancelBtn = makeTextButton("Cancel", INACTIVE_BG);
    const okBtn = makeTextButton("Reset", RESET_RED);
    footer.append(cancelBtn, okBtn);
    card.append(title, text, label, input, footer);

    let resolve = null;
    let expected = "";
    const matches = () => input.value.trim() === expected;
    const paint = () => {
        okBtn.disabled = !matches();
        okBtn.style.opacity = matches() ? "1" : "0.4";
        okBtn.style.cursor = matches() ? "pointer" : "default";
    };
    const onKey = (e) => {
        if (overlay.style.display === "none") return;
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopImmediatePropagation();
            finish(false);
        }
    };
    function finish(answer) {
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
        const r = resolve;
        resolve = null;
        if (r) r(answer);
    }
    input.addEventListener("input", paint);
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && matches()) finish(true);
    });
    cancelBtn.addEventListener("click", () => finish(false));
    okBtn.addEventListener("click", () => matches() && finish(true));
    overlay.addEventListener("mousedown", () => finish(false));

    return {
        /** ask({name, html}) -> Promise<true si le nom tape est confirme> */
        ask(opts) {
            if (resolve) finish(false);
            expected = opts.name;
            title.textContent = opts.title || "Reset the project " + opts.name + "?";
            okBtn.textContent = opts.okLabel || "Reset";
            text.innerHTML = opts.html;
            label.innerHTML = "Type <b>" + escapeHtml(opts.name) + "</b> to confirm:";
            input.value = "";
            paint();
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            overlay.style.zIndex = opts.below ? TOP_DIALOG_Z : "10002";
            if (opts.below) positionCardBelow(card, opts.below, 480);
            else positionCardNextToNode(card, container, 480);
            setTimeout(() => input.focus(), 0);
            return new Promise((r) => (resolve = r));
        },
        remove() {
            finish(false);
            overlay.remove();
        },
    };
}

// --------------------------------------------------------------------
// Copy (choix utilisateur, 19/10/2026) : fichiers de 08 a 14 (et leurs Archives)
// d'un autre projet ; liste deroulante (premier projet propose), bilan relu a
// chaque choix ; la configuration de l'autre projet remplit le Reference Loader.
// --------------------------------------------------------------------
function buildCopyDialog(container) {
    const { overlay, card } = makeOverlay();
    overlay.style.zIndex = "10002";
    Object.assign(card.style, { width: "min(520px, 92vw)", padding: "12px 14px", borderColor: COPY_BLUE });
    const title = document.createElement("div");
    Object.assign(title.style, { fontWeight: "bold", fontSize: "13px", color: TITLE_COLOR, marginBottom: "8px" });
    const row = document.createElement("div");
    Object.assign(row.style, { display: "flex", alignItems: "center", gap: "8px" });
    const lab = document.createElement("span");
    lab.textContent = "From:";
    Object.assign(lab.style, { color: "#9fd6cf", fontWeight: "bold" });
    const select = document.createElement("select");
    Object.assign(select.style, {
        flex: "1", minWidth: "0", background: "#111", color: "#ddd", border: "1px solid #0c3833",
        borderRadius: "6px", padding: "3px 6px", fontSize: "12px",
    });
    // Liste From avec les icones de l'aide (choix utilisateur, 22/10/2026) : liste a
    // icones partagee avec la galerie du Reference Loader ; select (cache) garde la valeur.
    const picker = buildIconPicker(select, card, (o) => projectKind(o.dataset.multi === "1"));
    row.append(lab, picker.el);
    // Dossier de projets (choix utilisateur, 21/10/2026) : All ou un de ses sous-projets.
    const subRow = document.createElement("div");
    Object.assign(subRow.style, { display: "none", alignItems: "center", gap: "8px", marginTop: "6px" });
    const subLab = document.createElement("span");
    subLab.textContent = "Project:";
    Object.assign(subLab.style, { color: "#9fd6cf", fontWeight: "bold" });
    const subSelect = document.createElement("select");
    subSelect.style.cssText = select.style.cssText;
    subRow.append(subLab, subSelect);
    select.style.display = "none";
    row.append(select);
    const body = document.createElement("div");
    Object.assign(body.style, { lineHeight: "1.5", color: "#ccc", marginTop: "10px", minHeight: "60px" });
    const footer = document.createElement("div");
    Object.assign(footer.style, { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" });
    const cancelBtn = makeTextButton("Cancel", INACTIVE_BG);
    const okBtn = makeTextButton("Copy", COPY_BLUE);
    footer.append(cancelBtn, okBtn);
    card.append(title, row, subRow, body, footer);

    let resolve = null;
    let plan = null;
    let probe = null;
    let reqId = 0;
    const setOk = (on) => {
        okBtn.disabled = !on;
        okBtn.style.opacity = on ? "1" : "0.4";
        okBtn.style.cursor = on ? "pointer" : "default";
    };
    const fillSubs = (subs) => {
        subSelect.innerHTML = "";
        for (const [value, label] of [[ALL_SUBS, "All"], ...subs.map((n) => [n, n])]) {
            const o = document.createElement("option");
            o.value = value;
            o.textContent = label;
            o.style.background = "#111";
            subSelect.appendChild(o);
        }
    };
    /** fromChanged : nouveau dossier dans From, ses sous-projets sont relus (All d'abord). */
    async function refresh(fromChanged) {
        const id = ++reqId;
        plan = null;
        setOk(false);
        body.textContent = "Reading the project…";
        try {
            let sub = subRow.style.display === "none" || fromChanged === true ? "" : subSelect.value;
            let data = await probe(select.value, sub);
            if (id !== reqId) return;
            if (fromChanged === true) {
                const subs = data.subs || [];
                subRow.style.display = subs.length ? "flex" : "none";
                fillSubs(subs);
                if (subs.length) {
                    sub = ALL_SUBS;
                    data = await probe(select.value, sub);
                    if (id !== reqId) return;
                }
            }
            plan = data;
            const total = data.folders.reduce((a, f) => a + f.files + f.archives, 0);
            body.innerHTML = '<table style="border-collapse:collapse;width:100%;font-size:12px">' +
                '<tr style="color:#9fd6cf"><td>Folder</td><td style="text-align:right">Files</td>' +
                '<td style="text-align:right">Archives</td><td style="text-align:right">To copy</td>' +
                '<td style="text-align:right">Same SHA256</td></tr>' +
                data.folders.map((f) => "<tr><td><b>" + f.folder + '</b></td><td style="text-align:right">' + f.files +
                    '</td><td style="text-align:right">' + f.archives + '</td><td style="text-align:right">' + f.copy +
                    '</td><td style="text-align:right;color:#888">' + f.skip + "</td></tr>").join("") + "</table>" +
                '<div style="margin-top:8px;color:' + (data.report ? "#9fd6cf" : ORANGE) + '">' + (data.report
                    ? "The MagicStudio RefLoader will be filled with the saved configuration of this project " +
                    "(same order and trims, pointing to the copies)."
                    : sub === ALL_SUBS
                        ? "All: the files of every project of this folder are copied (a file only once); " +
                        "no configuration is loaded: pick them in the gallery."
                        : "This project has no saved configuration: the files are only copied; pick them in the gallery.") +
                "</div>" + '<div style="color:#999;margin-top:4px">The other project is never changed. A file whose ' +
                "SHA256 is already in the folder is not copied again; a taken name gets _02, _03…</div>";
            setOk(total > 0);
        } catch (e) {
            if (id !== reqId) return;
            body.textContent = e.message;
        }
    }
    const onKey = (e) => {
        if (overlay.style.display === "none" || e.key !== "Escape") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        finish(null);
    };
    function finish(answer) {
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
        const r = resolve;
        resolve = null;
        if (r) r(answer);
    }
    select.addEventListener("change", () => {
        picker.paint();
        refresh(true);
    });
    subSelect.addEventListener("change", () => refresh(false));
    cancelBtn.addEventListener("click", () => finish(null));
    okBtn.addEventListener("click", () => plan && finish({
        source: select.value, sub: subRow.style.display === "none" ? "" : subSelect.value }));
    overlay.addEventListener("mousedown", () => finish(null));

    return {
        /**
         * ask({project, sources: [{name, path, multi}], probe(path, sub) -> Promise<bilan>})
         * -> Promise<{source, sub} | null> ; sub : "" (projet), ALL_SUBS ou un sous-projet.
         */
        ask(opts) {
            if (resolve) finish(null);
            probe = opts.probe;
            title.textContent = "Copy media files into " + opts.project;
            select.innerHTML = "";
            for (const src of opts.sources) {
                const o = document.createElement("option");
                o.value = src.path;
                o.textContent = src.name;
                o.dataset.multi = src.multi ? "1" : "";
                o.style.background = "#111";
                select.appendChild(o);
            }
            picker.close();
            picker.paint();
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            positionCardNextToNode(card, container, 520);
            refresh(true);
            return new Promise((r) => (resolve = r));
        },
        remove() {
            finish(null);
            overlay.remove();
        },
    };
}

function buildConfirm(container) {
    const { overlay, card } = makeOverlay();
    overlay.style.zIndex = "10002";
    Object.assign(card.style, { width: "min(420px, 92vw)", padding: "12px 14px", borderColor: ORANGE });
    const title = document.createElement("div");
    Object.assign(title.style, { fontWeight: "bold", fontSize: "13px", color: TITLE_COLOR, marginBottom: "8px" });
    const text = document.createElement("div");
    Object.assign(text.style, { lineHeight: "1.5", color: "#ccc", wordBreak: "break-word" });
    const footer = document.createElement("div");
    Object.assign(footer.style, { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" });
    const cancelBtn = makeTextButton("Cancel", INACTIVE_BG);
    // Troisieme bouton (altLabel) : la reponse est "alt".
    const altBtn = makeTextButton("", INACTIVE_BG);
    const okBtn = makeTextButton("OK", GREEN);
    footer.append(cancelBtn, altBtn, okBtn);
    card.append(title, text, footer);

    let resolve = null;
    const onKey = (e) => {
        if (overlay.style.display === "none") return;
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopImmediatePropagation();
            finish(false);
        } else if (e.key === "Enter") {
            e.preventDefault();
            e.stopImmediatePropagation();
            finish(true);
        }
    };
    function finish(answer) {
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
        const r = resolve;
        resolve = null;
        if (r) r(answer);
    }
    cancelBtn.addEventListener("click", () => finish(false));
    altBtn.addEventListener("click", () => finish("alt"));
    okBtn.addEventListener("click", () => finish(true));
    overlay.addEventListener("mousedown", () => finish(false));

    return {
        ask(opts) {
            if (resolve) finish(false);
            title.textContent = opts.title || "Confirm";
            text.innerHTML = opts.html || "";
            okBtn.textContent = opts.okLabel || "OK";
            okBtn.style.background = opts.okColor || GREEN;
            cancelBtn.textContent = opts.cancelLabel || "Cancel";
            cancelBtn.style.display = opts.noCancel ? "none" : "";
            altBtn.textContent = opts.altLabel || "";
            altBtn.style.background = opts.altColor || INACTIVE_BG;
            altBtn.style.display = opts.altLabel ? "" : "none";
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            positionCardNextToNode(card, container, 420);
            return new Promise((r) => (resolve = r));
        },
        remove() {
            finish(false);
            overlay.remove();
        },
    };
}

// --------------------------------------------------------------------
// Fenetre "Rename or move the project" (bouton crayon)
// --------------------------------------------------------------------
function joinDir(dir, name) {
    const sep = dir.includes("\\") || !dir.includes("/") ? "\\" : "/";
    return dir.replace(/[\\/]+$/, "") + sep + name;
}
function parentOf(path) {
    const i = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
    return i > 0 ? path.slice(0, i) : "";
}
function baseOf(path) {
    return path.split(/[\\/]/).pop();
}

function buildRenameMoveDialog(container, ctx) {
    const { overlay, card } = makeOverlay();
    Object.assign(card.style, { width: "min(500px, 92vw)", padding: "12px 14px", borderColor: VIOLET });

    const title = document.createElement("div");
    title.textContent = "Rename or move the project";
    Object.assign(title.style, { fontWeight: "bold", fontSize: "13px", color: TITLE_COLOR, marginBottom: "8px" });

    // Interrupteur pilule : Rename (orange) | Move (vert).
    const pill = document.createElement("div");
    Object.assign(pill.style, {
        display: "flex", borderRadius: "999px", overflow: "hidden", border: "1px solid #0c3833", height: "24px",
        marginBottom: "10px",
    });
    const pillBtn = (text, tip) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.title = tip;
        Object.assign(b.style, {
            flex: "1", border: "none", borderRadius: "0", cursor: "pointer", fontWeight: "bold", fontSize: "11px",
            padding: "0",
        });
        pill.appendChild(b);
        return b;
    };
    const renameTab = pillBtn("Rename", "Change the name of the project folder");
    const moveTab = pillBtn("Move", "Move the whole project folder to another folder");

    const fieldStyle = {
        flex: "1", minWidth: "0", background: "#111", color: "#ddd", border: "1px solid #0c3833", borderRadius: "10px",
        padding: "6px 10px", fontSize: "12px", outline: "none", boxSizing: "border-box",
    };
    const row = document.createElement("div");
    Object.assign(row.style, { display: "flex", gap: "6px", alignItems: "center" });
    const input = document.createElement("input");
    input.type = "text";
    Object.assign(input.style, fieldStyle);
    const browseBtn = makeIconButton(VIOLET, FOLDER_ICON, "Browse");
    row.append(input, browseBtn);

    // Nom / dossier actuel -> nouveau.
    const summary = document.createElement("div");
    Object.assign(summary.style, {
        margin: "10px 0 0", padding: "8px 10px", background: "#161616", border: "1px solid #2c2c2c",
        borderRadius: "8px", lineHeight: "1.6", wordBreak: "break-all",
    });
    const error = document.createElement("div");
    Object.assign(error.style, { color: ORANGE, minHeight: "14px", margin: "6px 0 0" });

    const footer = document.createElement("div");
    Object.assign(footer.style, { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" });
    const cancelBtn = makeTextButton("Cancel", INACTIVE_BG);
    const goBtn = makeTextButton("Rename...", ORANGE);
    footer.append(cancelBtn, goBtn);
    card.append(title, pill, row, summary, error, footer);

    let mode = "rename";
    let current = "";   // chemin actuel du projet
    let values = { rename: "", move: "" };

    /** Nouveau chemin du projet ("" si la saisie ne change rien ou est invalide). */
    function target() {
        const v = input.value.trim();
        if (!v) return "";
        return mode === "rename" ? joinDir(parentOf(current), v) : joinDir(v, baseOf(current));
    }

    function update() {
        const rename = mode === "rename";
        renameTab.style.background = rename ? ORANGE : INACTIVE_BG;
        renameTab.style.color = rename ? "white" : "#888";
        moveTab.style.background = rename ? INACTIVE_BG : GREEN;
        moveTab.style.color = rename ? "#888" : "white";
        browseBtn.style.display = rename ? "none" : "flex";
        input.placeholder = rename ? "New name" : "New folder (the project folder goes inside)";
        goBtn.textContent = rename ? "Rename..." : "Move...";
        goBtn.style.background = rename ? ORANGE : GREEN;
        const t = target();
        const label = (k) => '<span style="color:#888">' + k + "</span> ";
        summary.innerHTML = label(rename ? "Current name:" : "Current folder:") + escapeHtml(current) + "<br>" +
            label("→ New:") + (t ? '<b style="color:#9fd6cf">' + escapeHtml(t) + "</b>" : '<span style="color:#888">-</span>');
    }

    function setMode(m) {
        values[mode] = input.value;
        mode = m;
        input.value = values[m];
        error.textContent = "";
        input.style.borderColor = "#0c3833";
        update();
        setTimeout(() => input.focus(), 0);
    }

    async function go() {
        const v = input.value.trim();
        let err = "";
        if (mode === "rename") {
            err = projectNameError(v) || (v === baseOf(current) ? "The new name is the current name." : "");
        } else if (!v) {
            err = "Choose the destination folder.";
        } else if (samePath(v, parentOf(current))) {
            err = "The project is already in this folder.";
        }
        if (err) {
            error.textContent = err;
            input.style.borderColor = ORANGE;
            return;
        }
        const t = target();
        const ok = await ctx.confirm.ask({
            title: mode === "rename" ? "Rename the project?" : "Move the project?",
            html: escapeHtml(current) + '<br><span style="color:#888">→</span> <b style="color:#9fd6cf">' +
                escapeHtml(t) + "</b>" +
                '<div style="color:#999;margin-top:8px">The references of the MagicStudio RefLoader that are in the ' +
                "project follow it.</div>",
            okLabel: mode === "rename" ? "Rename" : "Move",
            okColor: mode === "rename" ? ORANGE : GREEN,
        });
        if (!ok) return;
        goBtn.disabled = true;
        error.textContent = mode === "rename" ? "Renaming..." : "Moving...";
        try {
            await ctx.apply(mode, v);
            close();
        } catch (e) {
            error.textContent = e.message;
        } finally {
            goBtn.disabled = false;
        }
    }

    async function browse() {
        browseBtn.disabled = true;
        error.textContent = "Opening the folder dialog...";
        try {
            const start = input.value.trim() || parentOf(current);
            const data = await apiGet("/mmrefloader/browse_dir?initial=" + encodeURIComponent(start));
            if (data.path) input.value = data.path;
            error.textContent = "";
            update();
        } catch (e) {
            error.textContent = e.message;
        } finally {
            browseBtn.disabled = false;
        }
    }

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
                go();
            }
        }
    };

    function close() {
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
    }

    input.addEventListener("input", () => {
        error.textContent = "";
        input.style.borderColor = "#0c3833";
        update();
    });
    renameTab.addEventListener("click", () => setMode("rename"));
    moveTab.addEventListener("click", () => setMode("move"));
    browseBtn.addEventListener("click", browse);
    cancelBtn.addEventListener("click", close);
    goBtn.addEventListener("click", go);
    overlay.addEventListener("mousedown", close);

    return {
        open(path) {
            current = path;
            values = { rename: baseOf(path), move: parentOf(path) };
            mode = "rename";
            input.value = values.rename;
            error.textContent = "";
            input.style.borderColor = "#0c3833";
            update();
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            positionCardNextToNode(card, container, 500);
            setTimeout(() => {
                input.focus();
                input.select();
            }, 0);
        },
        close,
        remove() {
            close();
            overlay.remove();
        },
    };
}

// --------------------------------------------------------------------
// Fenetre "Save the workflow" (cloche de 00.Workflows)
// --------------------------------------------------------------------
/**
 * open({changesHtml, previous, defaultName}) -> Promise<{name, archive}|null>.
 * previous = nom du workflow deja sauvegarde ("" s'il n'y en a pas) : la
 * question d'archivage n'apparait que s'il existe.
 */
function buildWorkflowDialog(container) {
    const { overlay, card } = makeOverlay();
    Object.assign(card.style, { width: "min(520px, 92vw)", padding: "12px 14px", borderColor: ORANGE });

    const title = document.createElement("div");
    title.textContent = "Save the workflow";
    Object.assign(title.style, { fontWeight: "bold", fontSize: "13px", color: TITLE_COLOR, marginBottom: "8px" });

    const changesTitle = document.createElement("div");
    Object.assign(changesTitle.style, { color: "#9fd6cf", fontWeight: "bold", marginBottom: "4px" });
    const changes = document.createElement("div");
    Object.assign(changes.style, {
        maxHeight: "180px", overflowX: "hidden", overflowY: "auto", padding: "8px 10px", background: "#161616",
        border: "1px solid #2c2c2c", borderRadius: "8px", lineHeight: "1.5", wordBreak: "break-word",
    });

    // Archiver l'ancien workflow : interrupteur pilule Overwrite (orange) | Archive it (vert).
    const archiveBox = document.createElement("div");
    Object.assign(archiveBox.style, { margin: "10px 0 0" });
    const archiveLabel = document.createElement("div");
    Object.assign(archiveLabel.style, { color: "#bbb", marginBottom: "6px", lineHeight: "1.4" });
    const pill = document.createElement("div");
    Object.assign(pill.style, {
        display: "flex", borderRadius: "999px", overflow: "hidden", border: "1px solid #0c3833", height: "24px",
        width: "200px",
    });
    const pillBtn = (text) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        Object.assign(b.style, {
            flex: "1", border: "none", borderRadius: "0", cursor: "pointer", fontWeight: "bold", fontSize: "11px",
            padding: "0",
        });
        pill.appendChild(b);
        return b;
    };
    const noBtn = pillBtn("Overwrite");
    const yesBtn = pillBtn("Archive it");
    // Limite atteinte : Save avec Archive it ouvre d'abord la fenetre "Delete archives".
    const limitNote = document.createElement("div");
    Object.assign(limitNote.style, { color: ORANGE, margin: "6px 0 0" });
    limitNote.textContent = MAX_ARCHIVES + " archives already: Save asks which ones to delete first.";
    // Cloche rouge (Data only, autre structure) : Overwrite remplace le workflow sauvegarde.
    const redNote = document.createElement("div");
    Object.assign(redNote.style, { color: ORANGE, margin: "6px 0 0", lineHeight: "1.4" });
    archiveBox.append(archiveLabel, pill, limitNote, redNote);
    let redName = "";

    const nameLabel = document.createElement("div");
    nameLabel.textContent = "Name of the workflow (in 00.Workflows):";
    Object.assign(nameLabel.style, { color: "#bbb", margin: "10px 0 6px" });
    const input = document.createElement("input");
    input.type = "text";
    Object.assign(input.style, {
        width: "100%", background: "#111", color: "#ddd", border: "1px solid #0c3833", borderRadius: "10px",
        padding: "6px 10px", fontSize: "12px", outline: "none", boxSizing: "border-box",
    });
    const error = document.createElement("div");
    Object.assign(error.style, { color: ORANGE, minHeight: "14px", margin: "6px 0 0" });

    const footer = document.createElement("div");
    Object.assign(footer.style, { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" });
    // Seul Close ferme la fenetre (choix utilisateur) ; apres un enregistrement elle reste ouverte.
    const cancelBtn = makeTextButton("Close", INACTIVE_BG);
    const saveBtn = makeTextButton("Save", GREEN);
    footer.append(cancelBtn, saveBtn);
    card.append(title, changesTitle, changes, archiveBox, nameLabel, input, error, footer);

    let archive = true;
    let full = false;
    let resolve = null;

    function paintPill() {
        yesBtn.style.background = archive ? GREEN : INACTIVE_BG;
        yesBtn.style.color = archive ? "white" : "#888";
        noBtn.style.background = archive ? INACTIVE_BG : ORANGE;
        noBtn.style.color = archive ? "#888" : "white";
        limitNote.style.display = full && archive ? "block" : "none";
        redNote.style.display = redName && !archive ? "block" : "none";
        redNote.innerHTML = redName ? "<b>Overwrite</b> replaces the saved workflow of <b>" + escapeHtml(redName) +
            "</b> with the workflow of this tab; to find it again, use the Archives." : "";
        // Bouton principal : Save (vert) avec Archive it, Overwrite (orange) sinon.
        const over = archiveBox.style.display !== "none" && !archive;
        saveBtn.textContent = over ? "Overwrite" : "Save";
        saveBtn.style.background = over ? ORANGE : GREEN;
    }

    /** null = Close (fenetre fermee) ; sinon la fenetre reste ouverte jusqu'au prochain open(). */
    function finish(result) {
        if (result === null) {
            overlay.style.display = "none";
            window.removeEventListener("keydown", onKey, true);
        }
        const r = resolve;
        resolve = null;
        if (r) r(result);
    }

    function submit() {
        if (!resolve) return; // enregistrement en cours
        const name = input.value.trim().replace(/\.json$/i, "").trim();
        const err = projectNameError(name).replace("The project name", "The workflow name") ||
            (/^\d{8}-\d{6}_/.test(name) ? "A workflow name cannot start with a date (kept for the archives)." : "");
        if (err) {
            error.style.color = ORANGE;
            error.textContent = err;
            input.style.borderColor = ORANGE;
            return;
        }
        error.style.color = "#999";
        error.textContent = "Saving...";
        finish({ name, archive: archiveBox.style.display !== "none" && archive });
    }

    const onKey = (e) => {
        if (overlay.style.display === "none") return;
        // Echap ne ferme pas cette fenetre (seul Close la ferme).
        if (e.key === "Escape") {
            e.preventDefault();
            return;
        }
        if (e.target === input) {
            e.stopImmediatePropagation();
            if (e.key === "Enter") {
                e.preventDefault();
                submit();
            }
        }
    };

    yesBtn.addEventListener("click", () => {
        archive = true;
        paintPill();
    });
    noBtn.addEventListener("click", () => {
        archive = false;
        paintPill();
    });
    input.addEventListener("input", () => {
        error.textContent = "";
        input.style.borderColor = "#0c3833";
    });
    cancelBtn.addEventListener("click", () => finish(null));
    saveBtn.addEventListener("click", submit);

    return {
        /**
         * opts.full = la limite d'archives est atteinte (note sous la pilule) ;
         * opts.again = fenetre deja ouverte (apres un enregistrement) : choix de la
         * pilule garde ; opts.message = {text, ok} sous le nom.
         */
        open(opts) {
            if (resolve) finish(null);
            const again = !!opts.again && overlay.style.display !== "none";
            changesTitle.textContent = opts.previous ? "Changes since the last save of " + opts.previous + ":"
                : "No saved workflow yet.";
            changes.innerHTML = opts.changesHtml;
            changes.style.display = opts.previous ? "block" : "none";
            archiveBox.style.display = opts.previous ? "block" : "none";
            archiveLabel.innerHTML = "Archive the previous workflow? It goes to <b>00.Workflows/Archives</b> as " +
                "<b>yyyyMMdd-HHmmss_" + escapeHtml(opts.previous || "") + "</b> (date of its last save).";
            if (!again) archive = true;
            full = !!opts.full;
            redName = opts.red || "";
            paintPill();
            input.value = opts.defaultName;
            input.style.borderColor = "#0c3833";
            error.style.color = opts.message && opts.message.ok ? GREEN : ORANGE;
            error.textContent = opts.message ? opts.message.text : "";
            if (!again) {
                overlay.style.display = "block";
                window.addEventListener("keydown", onKey, true);
                positionCardNextToNode(card, container, 520);
            }
            setTimeout(() => input.focus(), 0);
            return new Promise((r) => (resolve = r));
        },
        remove() {
            finish(null);
            overlay.remove();
        },
    };
}

/** "dd/MM/yyyy hh:mm:ss" d'une archive (stamp yyyyMMdd-HHmmss). */
function archiveWhen(a) {
    const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(a.stamp) || [];
    return m.length ? m[3] + "/" + m[2] + "/" + m[1] + " " + m[4] + ":" + m[5] + ":" + m[6] : a.stamp;
}

/**
 * Ligne d'archive : date + workflow d'origine. onOpen (facultatif) au clic sur
 * la ligne ; check = case a cocher au bout (row.box), onCheck a chaque changement.
 */
function archiveRow(a, { onOpen, check, onCheck }) {
    const row = document.createElement("div");
    Object.assign(row.style, { display: "flex", alignItems: "center", gap: "6px", borderRadius: "6px" });
    const label = document.createElement(onOpen ? "button" : "label");
    if (onOpen) label.type = "button";
    label.innerHTML = '<span style="color:#9fd6cf">' + escapeHtml(archiveWhen(a)) + "</span>  " + escapeHtml(a.of);
    label.title = a.name;
    Object.assign(label.style, {
        flex: "1", minWidth: "0", textAlign: "left", background: "transparent", color: "#ddd", border: "none",
        borderRadius: "6px", padding: "5px 8px", cursor: "pointer", fontSize: "12px",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    });
    label.addEventListener("mouseenter", () => (label.style.background = "#173a37"));
    label.addEventListener("mouseleave", () => (label.style.background = "transparent"));
    row.appendChild(label);
    if (check) {
        const box = document.createElement("input");
        box.type = "checkbox";
        box.title = "Check to delete: " + a.name;
        Object.assign(box.style, { width: "15px", height: "15px", margin: "0 6px", flex: "none", cursor: "pointer",
            accentColor: TRASH_RED });
        box.addEventListener("change", () => onCheck && onCheck());
        row.appendChild(box);
        row.box = box;
    }
    if (onOpen) label.addEventListener("click", () => onOpen(a));
    else if (row.box) label.addEventListener("click", () => {
        row.box.checked = !row.box.checked;
        if (onCheck) onCheck();
    });
    return row;
}

/**
 * Liste d'archives a cocher + Cancel | Delete (Delete rouge, actif des
 * qu'une case est cochee). onDelete(noms coches) au clic sur Delete.
 */
function checkList(archives, { onOpen, onCancel, onDelete }) {
    const box = document.createElement("div");
    const list = document.createElement("div");
    Object.assign(list.style, { maxHeight: "260px", overflowX: "hidden", overflowY: "auto" });
    const footer = document.createElement("div");
    Object.assign(footer.style, { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" });
    const cancelBtn = makeTextButton("Cancel", INACTIVE_BG);
    const deleteBtn = makeTextButton("Delete", TRASH_RED);
    footer.append(cancelBtn, deleteBtn);
    const rows = [];
    const checked = () => rows.filter((r) => r.box.checked).map((r) => r.archive.name);
    const paint = () => {
        const on = checked().length > 0;
        deleteBtn.disabled = !on;
        deleteBtn.style.opacity = on ? "1" : "0.45";
        deleteBtn.style.cursor = on ? "pointer" : "default";
    };
    for (const a of archives) {
        const row = archiveRow(a, { onOpen, check: true, onCheck: paint });
        row.archive = a;
        rows.push(row);
        list.appendChild(row);
    }
    cancelBtn.addEventListener("click", onCancel);
    deleteBtn.addEventListener("click", () => {
        const names = checked();
        if (names.length) onDelete(names);
    });
    paint();
    box.append(list, footer);
    return box;
}

/** Liste HTML des changements (diffWorkflows) pour la fenetre. */
function changesHtml(d) {
    if (d.same) return '<span style="color:#888">No change since the last save.</span>';
    const out = [];
    const item = (color, text) => out.push('<div><span style="color:' + color + '">●</span> ' + text + "</div>");
    d.added.forEach((n) => item(GREEN, "Added: <b>" + escapeHtml(n.label) + "</b>"));
    d.removed.forEach((n) => item("#d32f2f", "Removed: <b>" + escapeHtml(n.label) + "</b>"));
    d.changed.forEach((c) => item(ORANGE, "<b>" + escapeHtml(c.label) + "</b> · " + escapeHtml(c.field) + ": " +
        escapeHtml(shortValue(c.before)) + " → " + escapeHtml(shortValue(c.after))));
    if (d.linksAdded || d.linksRemoved) {
        item(VIOLET, "Links: " + d.linksAdded + " added, " + d.linksRemoved + " removed");
    }
    if (d.layout) item("#888", "Layout changed (nodes moved or resized)");
    return out.join("");
}

// --------------------------------------------------------------------
// Fenetre "Delete archives" (limite atteinte, avant d'archiver)
// --------------------------------------------------------------------
/** open(archives) -> Promise<noms a supprimer | null> (Cancel, Echap, clic a cote = null). */
function buildDeleteArchivesDialog(container) {
    const { overlay, card } = makeOverlay();
    Object.assign(card.style, { width: "min(420px, 92vw)", padding: "12px 14px", borderColor: TRASH_RED });
    const title = document.createElement("div");
    title.textContent = "Delete archives";
    Object.assign(title.style, { fontWeight: "bold", fontSize: "13px", color: TITLE_COLOR, marginBottom: "6px" });
    const text = document.createElement("div");
    text.textContent = MAX_ARCHIVES + " archives max: check the ones to delete.";
    Object.assign(text.style, { color: ORANGE, marginBottom: "6px" });
    const slot = document.createElement("div");
    card.append(title, text, slot);

    let resolve = null;
    const onKey = (e) => {
        if (overlay.style.display === "none" || e.key !== "Escape") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        finish(null);
    };
    function finish(result) {
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
        const r = resolve;
        resolve = null;
        if (r) r(result);
    }
    overlay.addEventListener("mousedown", () => finish(null));

    return {
        open(archives) {
            if (resolve) finish(null);
            slot.innerHTML = "";
            slot.appendChild(checkList(archives, { onCancel: () => finish(null), onDelete: (names) => finish(names) }));
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            positionCardNextToNode(card, container, 420);
            return new Promise((r) => (resolve = r));
        },
        remove() {
            finish(null);
            overlay.remove();
        },
    };
}

// --------------------------------------------------------------------
// Liste des workflows archives (bouton a droite de la cloche)
// --------------------------------------------------------------------
function buildArchiveMenu(container) {
    const { overlay, card } = makeOverlay();
    Object.assign(card.style, { width: "min(380px, 92vw)", padding: "8px", borderColor: VIOLET });
    const title = document.createElement("div");
    title.textContent = "Open an archived workflow (new tab)";
    Object.assign(title.style, { fontWeight: "bold", color: TITLE_COLOR, padding: "4px 6px 8px" });
    const note = document.createElement("div");
    note.textContent = MAX_ARCHIVES + " archives max: check the ones to delete.";
    Object.assign(note.style, { color: ORANGE, padding: "0 6px 6px" });
    const slot = document.createElement("div");
    card.append(title, note, slot);

    const onKey = (e) => {
        if (overlay.style.display === "none" || e.key !== "Escape") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
    };
    function close() {
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
    }
    overlay.addEventListener("mousedown", close);

    return {
        /**
         * archives = [{name, stamp, of}] ; onPick(archive) a l'ouverture ;
         * onDelete(noms) quand la limite est atteinte (cases a cocher + Cancel | Delete).
         */
        open(archives, onPick, onDelete) {
            const open = (a) => {
                close();
                onPick(a);
            };
            slot.innerHTML = "";
            const full = !!onDelete && archives.length >= MAX_ARCHIVES;
            note.style.display = full ? "block" : "none";
            if (full) {
                slot.appendChild(checkList(archives, {
                    onOpen: open,
                    onCancel: close,
                    onDelete: (names) => {
                        close();
                        onDelete(names);
                    },
                }));
            } else {
                for (const a of archives) slot.appendChild(archiveRow(a, { onOpen: open }));
            }
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            positionCardNextToNode(card, container, 380);
        },
        remove() {
            close();
            overlay.remove();
        },
    };
}

// --------------------------------------------------------------------
// Fenetre "Load the project" (bouton Load) : verification avant toute
// modification ; une case par dossier chargeable (cochee) ; Load = confirmation.
// --------------------------------------------------------------------
const PREVIEW_KIND = { "08.Images": "image", "10.Son": "audio", "12.Video": "video", "14.Video-Audio": "video" };
const MARK_OK = '<b style="color:' + GREEN + '">✓</b>';
const MARK_BAD = '<b style="color:#d32f2f">✗</b>';
const MARK_WARN = '<b style="color:' + ORANGE + '">⚠</b>';
const FOLDER_INFO = {
    "02.Models": "not loaded: no node of the project uses them",
    "06.LoRA": "not loaded: no node of the project uses them",
    "40.Rush Videos": "information only",
    "60.Rush Images": "information only",
};
const LIST_LABEL = { first_frame: "first frame", last_frame: "last frame" };
const PROMPT_WARNING = "Loading the workflow may lose the changes of the prompt in progress.";

/** Lignes HTML des noeuds et liaisons en plus (+) ou manquants (−). */
function structureHtml(d, plusLabel, minusLabel) {
    const out = [];
    const part = (items, label, color, sign) => {
        if (!items.length) return;
        const shown = items.slice(0, 12).map((x) => escapeHtml(x)).join(", ");
        out.push('<div><span style="color:' + color + '">' + sign + "</span> " + label + ": " + shown +
            (items.length > 12 ? ", … (+" + (items.length - 12) + ")" : "") + "</div>");
    };
    part(d.nodes_added, plusLabel + " (nodes)", GREEN, "+");
    part(d.nodes_missing, minusLabel + " (nodes)", "#d32f2f", "−");
    part(d.links_added, plusLabel + " (links)", GREEN, "+");
    part(d.links_missing, minusLabel + " (links)", "#d32f2f", "−");
    return out.join("");
}

/**
 * Fenetre "Preview" de l'oeil de "Load the project" : a cote de la fenetre
 * Load, image agrandie ou lecteur video / son. Croix, Echap (gere par la
 * fenetre Load) ou clic a cote = fermeture de l'apercu seulement.
 */
function buildPreviewWindow() {
    const { overlay, card } = makeOverlay();
    overlay.style.zIndex = "10003";
    Object.assign(card.style, {
        width: "min(520px, 46vw)", padding: "10px 12px", borderColor: VIOLET, display: "flex",
        flexDirection: "column", gap: "6px",
    });
    const head = document.createElement("div");
    Object.assign(head.style, { display: "flex", alignItems: "flex-start", gap: "8px" });
    const titles = document.createElement("div");
    Object.assign(titles.style, { flex: "1", minWidth: "0" });
    const title = document.createElement("div");
    Object.assign(title.style, {
        fontWeight: "bold", fontSize: "13px", color: TITLE_COLOR, whiteSpace: "nowrap", overflow: "hidden",
        textOverflow: "ellipsis",
    });
    const path = document.createElement("div");
    Object.assign(path.style, { color: "#888", fontSize: "11px", wordBreak: "break-all" });
    titles.append(title, path);
    const closeBtn = makeIconButton(INACTIVE_BG, CLOSE_ICON, "Close the preview");
    Object.assign(closeBtn.style, { width: "22px", height: "22px" });
    head.append(titles, closeBtn);
    const body = document.createElement("div");
    Object.assign(body.style, {
        display: "flex", alignItems: "center", justifyContent: "center", background: "#111",
        borderRadius: "8px", minHeight: "120px", maxHeight: "70vh", overflow: "hidden",
    });
    card.append(head, body);
    // Le fond laisse passer les clics : avec l'apercu ouvert, les vignettes de la
    // fenetre en dessous restent cliquables ; son clic a cote ferme l'apercu.
    overlay.style.pointerEvents = "none";
    card.style.pointerEvents = "auto";

    let current = "";
    function close() {
        overlay.style.display = "none";
        body.innerHTML = ""; // arrete la lecture
        current = "";
    }
    closeBtn.addEventListener("click", close);

    return {
        isOpen: () => overlay.style.display !== "none",
        close,
        /**
         * Clic sur une vignette : meme fichier deja affiche = fermeture ; sinon
         * l'apercu s'ouvre ou change seulement de contenu.
         */
        toggle(file, kind, shown, anchor) {
            if (overlay.style.display !== "none" && current === file) close();
            else this.show(file, kind, shown, anchor);
        },
        /** show(cheminAbsolu, "image" | "video" | "audio", cheminAffiche, carteDeReference) */
        show(file, kind, shown, anchor) {
            current = file;
            title.textContent = file.split(/[\\/]/).pop();
            path.textContent = shown;
            body.innerHTML = "";
            const el = document.createElement(kind === "image" ? "img" : kind);
            if (kind !== "image") {
                el.controls = true;
                el.preload = "metadata";
            }
            el.src = "/mmrefloader/media?file=" + encodeURIComponent(file);
            Object.assign(el.style, kind === "audio" ? { width: "95%", margin: "40px 0" } : {
                // Les petites images sont agrandies (largeur de la fenetre), sans depasser 70vh.
                width: "100%", height: "auto", maxHeight: "70vh", objectFit: "contain", display: "block",
            });
            body.appendChild(el);
            overlay.style.display = "block";
            // A droite de la fenetre Load (retrecie a la place libre, 240 px au moins),
            // sinon a gauche ; sans place des deux cotes, par-dessus, au bord droit.
            const r = anchor.getBoundingClientRect();
            const max = Math.min(520, window.innerWidth * 0.46);
            const right = window.innerWidth - r.right - 18;
            const leftRoom = r.left - 18;
            let w = max;
            let left = Math.max(8, window.innerWidth - 8 - max);
            if (right >= 240) {
                w = Math.min(max, right);
                left = r.right + 10;
            } else if (leftRoom >= 240) {
                w = Math.min(max, leftRoom);
                left = r.left - 10 - w;
            }
            card.style.width = w + "px";
            card.style.left = left + "px";
            card.style.top = Math.max(8, Math.min(r.top, window.innerHeight - 200)) + "px";
        },
        remove() {
            close();
            overlay.remove();
        },
    };
}

// --------------------------------------------------------------------
// Fenetre "Duplicates" (icone a droite de la cloche de 08.Images, 10.Son,
// 12.Video, 14.Video-Audio) : copies identiques (SHA256) dans <dossier>/Archives.
// --------------------------------------------------------------------
function fmtSize(bytes) {
    return bytes < 1048576 ? (bytes / 1024).toFixed(1) + " KB" : (bytes / 1048576).toFixed(1) + " MB";
}

/** Vignette d'un fichier de <dossier>/Archives : image ou video (miniature), icone pour un son. */
function dupThumb(archDir, name, kind, size) {
    const box = document.createElement("div");
    Object.assign(box.style, {
        width: size + "px", height: Math.round(size * 0.66) + "px", borderRadius: "6px", overflow: "hidden",
        background: "#111", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto",
    });
    if (kind === "audio") {
        box.innerHTML = iconBadge(AUDIO_ICON, FOLDER_COLORS["10.Son"]);
        return box;
    }
    const img = document.createElement("img");
    img.src = "/mmrefloader/thumb?path=" + encodeURIComponent(archDir) + "&file=" + encodeURIComponent(name) +
        THUMB_REVALIDATE;
    Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover", display: "block" });
    box.appendChild(img);
    return box;
}

/** Confirmation : Promise<"trash" | "delete" | null> ; Echap = Cancel (gere par la fenetre Duplicates). */
function buildDeleteChoice() {
    const { overlay, card } = makeOverlay();
    overlay.style.zIndex = "10003";
    Object.assign(card.style, { width: "min(440px, 92vw)", padding: "12px 14px", borderColor: TRASH_RED });
    const title = document.createElement("div");
    Object.assign(title.style, { fontWeight: "bold", fontSize: "13px", color: TITLE_COLOR, marginBottom: "8px" });
    const text = document.createElement("div");
    Object.assign(text.style, { lineHeight: "1.5", color: "#ccc", wordBreak: "break-word", maxHeight: "40vh", overflowY: "auto" });
    const footer = document.createElement("div");
    Object.assign(footer.style, { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px", flexWrap: "wrap" });
    const cancelBtn = makeTextButton("Cancel", INACTIVE_BG);
    const trashBtn = makeTextButton("Move to Recycle Bin", VIOLET);
    const deleteBtn = makeTextButton("Delete permanently", TRASH_RED);
    footer.append(cancelBtn, trashBtn, deleteBtn);
    card.append(title, text, footer);
    let resolve = null;
    function finish(r) {
        overlay.style.display = "none";
        const f = resolve;
        resolve = null;
        if (f) f(r);
    }
    cancelBtn.addEventListener("click", () => finish(null));
    trashBtn.addEventListener("click", () => {
        if (!trashBtn.disabled) finish("trash");
    });
    deleteBtn.addEventListener("click", () => finish("delete"));
    overlay.addEventListener("mousedown", () => finish(null));
    return {
        isOpen: () => overlay.style.display !== "none",
        cancel: () => finish(null),
        /** ask(noms, trashOk, ancre, {title, note, below}?) : title / note remplacent ceux des doublons ; below = element sous lequel s'ouvrir. */
        ask(names, trashOk, anchor, opts = {}) {
            if (resolve) finish(null);
            title.textContent = opts.title || "Delete " + names.length + " duplicate file(s)?";
            const shown = names.slice(0, 15).map((n) => "<div>• " + escapeHtml(n) + "</div>").join("");
            text.innerHTML = shown + (names.length > 15 ? "<div>… (+" + (names.length - 15) + ")</div>" : "") +
                '<div style="color:#999;margin-top:8px">' + (opts.note || "One copy of each group stays in Archives. " +
                "Files moved to the Recycle Bin can be restored from it; <b>Delete permanently</b> cannot be undone.") + "</div>";
            trashBtn.disabled = !trashOk;
            trashBtn.style.opacity = trashOk ? "1" : "0.45";
            trashBtn.style.cursor = trashOk ? "pointer" : "default";
            trashBtn.title = trashOk ? "Move the copies to the Recycle Bin (they can be restored)"
                : "The Recycle Bin is only available on Windows";
            overlay.style.display = "block";
            overlay.style.zIndex = opts.below ? TOP_DIALOG_Z : "10003";
            if (opts.below) positionCardBelow(card, opts.below, 440);
            else positionCardNextToNode(card, anchor, 440);
            return new Promise((r) => (resolve = r));
        },
        remove() {
            finish(null);
            overlay.remove();
        },
    };
}

/**
 * open(folder, groups, projectPath, trashOk, message) -> Promise<{shas, trash} | null>.
 * null = Cancel (fenetre fermee) ; apres une suppression la fenetre reste
 * ouverte jusqu'au prochain open() ou close().
 */
function buildDuplicatesDialog(container) {
    const { overlay, card } = makeOverlay();
    Object.assign(card.style, {
        width: "min(720px, 94vw)", padding: "12px 14px", borderColor: BELL_ORANGE, display: "flex",
        flexDirection: "column", maxHeight: "86vh", gap: "8px",
    });
    const title = document.createElement("div");
    Object.assign(title.style, { fontWeight: "bold", fontSize: "13px", color: TITLE_COLOR });
    const message = document.createElement("div");
    Object.assign(message.style, { minHeight: "0" });
    const strip = document.createElement("div");
    Object.assign(strip.style, { display: "flex", gap: "10px", overflowX: "auto", overflowY: "hidden", paddingBottom: "4px", flex: "0 0 auto" });
    const frame = document.createElement("div");
    Object.assign(frame.style, {
        flex: "1 1 auto", minHeight: "180px", overflowY: "auto", padding: "8px 10px", background: "#161616",
        border: "1px solid " + BELL_ORANGE, borderRadius: "8px",
    });
    const footer = document.createElement("div");
    Object.assign(footer.style, { display: "flex", justifyContent: "flex-end", gap: "8px" });
    const cancelBtn = makeTextButton("Cancel", INACTIVE_BG);
    const deleteBtn = makeTextButton("Delete", TRASH_RED);
    footer.append(cancelBtn, deleteBtn);
    card.append(title, message, strip, frame, footer);
    const choice = buildDeleteChoice();

    let resolve = null;
    let ctx = null; // {folder, groups, archDir, kind, trashOk}
    let checked = new Set();
    let current = null;
    const onKey = (e) => {
        if (overlay.style.display === "none" || e.key !== "Escape") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (choice.isOpen()) choice.cancel();
        else close();
    };
    function close() {
        choice.cancel();
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
        frame.innerHTML = "";
        const r = resolve;
        resolve = null;
        if (r) r(null);
    }
    const toDelete = () => ctx.groups.filter((g) => checked.has(g.sha)).flatMap((g) => g.files.filter((f) => !f.keep));
    function paintButton() {
        const n = ctx ? toDelete().length : 0;
        deleteBtn.textContent = n ? "Delete (" + n + ") file(s)" : "Delete";
        deleteBtn.disabled = !n;
        deleteBtn.style.opacity = n ? "1" : "0.45";
        deleteBtn.style.cursor = n ? "pointer" : "default";
    }
    function showGroup(g) {
        current = g.sha;
        [...strip.children].forEach((t) => (t.style.borderColor = t.dataset.sha === g.sha ? BELL_ORANGE : "#333"));
        const total = g.files.reduce((a, f) => a + f.size, 0);
        const freed = g.files.filter((f) => !f.keep).reduce((a, f) => a + f.size, 0);
        frame.innerHTML = "";
        const head = document.createElement("div");
        head.innerHTML = "<b>" + g.files.length + " copies</b> · " + fmtSize(total) + ' in total · <span style="color:' +
            TRASH_RED + '">' + fmtSize(freed) + " freed</span> when the extra copies are deleted";
        Object.assign(head.style, { color: "#ccc", marginBottom: "8px" });
        const grid = document.createElement("div");
        Object.assign(grid.style, { display: "flex", flexWrap: "wrap", gap: "10px" });
        for (const f of g.files) {
            const cell = document.createElement("div");
            Object.assign(cell.style, {
                width: "140px", padding: "6px", borderRadius: "8px", background: "#1f1f1f",
                border: "1px solid " + (f.keep ? GREEN : "#333"), boxSizing: "border-box",
            });
            cell.appendChild(dupThumb(ctx.archDir, f.name, ctx.kind, 126));
            const info = document.createElement("div");
            info.innerHTML = '<div style="font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' +
                escapeHtml(f.name) + '">' + escapeHtml(f.name) + "</div>" +
                '<div style="color:#888;font-size:10px">' + escapeHtml(formatLastSave(new Date(f.mtime * 1000))) + "</div>" +
                '<div style="color:#888;font-size:10px">' + fmtSize(f.size) + "</div>" +
                '<div style="font-weight:bold;font-size:11px;color:' + (f.keep ? GREEN : TRASH_RED) + '">' +
                (f.keep ? "Kept" : "To delete") + "</div>";
            Object.assign(info.style, { marginTop: "4px", lineHeight: "1.4" });
            cell.appendChild(info);
            grid.appendChild(cell);
        }
        frame.append(head, grid);
    }
    function render(msg) {
        title.textContent = "Duplicates – " + ctx.folder + "/Archives";
        message.style.color = msg && msg.ok ? GREEN : ORANGE;
        message.textContent = msg ? msg.text : "";
        message.style.display = msg ? "block" : "none";
        strip.innerHTML = "";
        for (const g of ctx.groups) {
            const tile = document.createElement("div");
            tile.dataset.sha = g.sha;
            Object.assign(tile.style, {
                width: "128px", padding: "5px", borderRadius: "8px", border: "2px solid #333", background: "#1f1f1f",
                cursor: "pointer", flex: "0 0 auto", boxSizing: "border-box",
            });
            const kept = g.files.find((f) => f.keep);
            tile.appendChild(dupThumb(ctx.archDir, kept.name, ctx.kind, 114));
            const name = document.createElement("div");
            name.textContent = kept.name;
            name.title = kept.name;
            Object.assign(name.style, { fontSize: "11px", marginTop: "3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
            const row = document.createElement("label");
            Object.assign(row.style, { display: "flex", alignItems: "center", gap: "6px", marginTop: "3px", cursor: "pointer", color: BELL_ORANGE, fontWeight: "bold", fontSize: "11px" });
            const box = document.createElement("input");
            box.type = "checkbox";
            box.checked = checked.has(g.sha);
            Object.assign(box.style, { margin: "0" });
            box.addEventListener("click", (e) => e.stopPropagation());
            box.addEventListener("change", () => {
                if (box.checked) checked.add(g.sha);
                else checked.delete(g.sha);
                paintButton();
            });
            row.addEventListener("click", (e) => e.stopPropagation());
            row.append(box, document.createTextNode(g.files.length + " copies"));
            tile.append(name, row);
            tile.addEventListener("click", () => showGroup(g));
            strip.appendChild(tile);
        }
        const g = ctx.groups.find((x) => x.sha === current) || ctx.groups[0];
        if (g) showGroup(g);
        paintButton();
    }
    cancelBtn.addEventListener("click", close);
    deleteBtn.addEventListener("click", async () => {
        if (deleteBtn.disabled || !resolve) return;
        const names = toDelete().map((f) => f.name);
        const how = await choice.ask(names, ctx.trashOk, card);
        if (!how || !resolve) return;
        const shas = [...checked];
        const r = resolve;
        resolve = null;
        message.style.display = "block";
        message.style.color = "#999";
        message.textContent = "Deleting...";
        r({ shas, trash: how === "trash" });
    });
    overlay.addEventListener("mousedown", () => {
        if (!choice.isOpen()) close();
    });

    return {
        open(folder, groups, projectPath, trashOk, msg) {
            const again = overlay.style.display !== "none" && ctx && ctx.folder === folder;
            if (!again) {
                checked = new Set();
                current = null;
            }
            // Groupes disparus : leurs cases sont oubliees.
            checked = new Set([...checked].filter((sha) => groups.some((g) => g.sha === sha)));
            ctx = { folder, groups, archDir: joinDir(joinDir(projectPath, folder), "Archives"), kind: PREVIEW_KIND[folder], trashOk };
            render(msg);
            if (!again) {
                overlay.style.display = "block";
                window.addEventListener("keydown", onKey, true);
                positionCardNextToNode(card, container, 720);
            }
            return new Promise((r) => (resolve = r));
        },
        close,
        remove() {
            close();
            choice.remove();
            overlay.remove();
        },
    };
}

// --------------------------------------------------------------------
// Fenetre de visualisation d'un dossier (bouton de 08.Images ... 14.Video-Audio) :
// fichiers de la racine (numero du Ref Loader) et de Archives ; Close seulement.
// --------------------------------------------------------------------
// Tri par date des fenetres des dossiers (choix utilisateur, 19/10/2026) : un
// seul reglage pour toutes les fenetres, garde dans le navigateur.
const DATE_ORDER_KEY = "mmproject.dateOrder";
let dateOrder = "desc";
try {
    if (localStorage.getItem(DATE_ORDER_KEY) === "asc") dateOrder = "asc";
} catch (e) {
    // stockage indisponible : plus recent d'abord
}

/** Bouton Date ↓ / Date ↑ d'une fenetre : onChange() apres un clic ; b.refresh() relit le reglage. */
function makeDateOrderButton(onChange) {
    const b = makeTextButton("", INACTIVE_BG);
    Object.assign(b.style, { height: "22px", padding: "0 10px", fontSize: "11px", flex: "0 0 auto" });
    b.refresh = () => {
        b.textContent = dateOrder === "asc" ? "Date ↑" : "Date ↓";
        b.title = dateOrder === "asc" ? "Oldest first (click: newest first)" : "Newest first (click: oldest first)";
    };
    b.refresh();
    b.addEventListener("click", () => {
        dateOrder = dateOrder === "asc" ? "desc" : "asc";
        try {
            localStorage.setItem(DATE_ORDER_KEY, dateOrder);
        } catch (e) {
            // reglage non garde
        }
        b.refresh();
        onChange();
    });
    return b;
}

function buildFolderViewer(container) {
    const { overlay, card } = makeOverlay();
    Object.assign(card.style, {
        width: "min(860px, 94vw)", padding: "12px 14px", borderColor: VIOLET, display: "flex",
        flexDirection: "column", gap: "8px", maxHeight: "86vh",
    });
    const title = document.createElement("div");
    Object.assign(title.style, { fontWeight: "bold", fontSize: "13px", color: TITLE_COLOR });
    const rootLabel = document.createElement("div");
    Object.assign(rootLabel.style, { color: "#9fd6cf", fontWeight: "bold" });
    const rootRow = document.createElement("div");
    const archLabel = document.createElement("div");
    Object.assign(archLabel.style, { color: "#9fd6cf", fontWeight: "bold" });
    const archFrame = document.createElement("div");
    Object.assign(archFrame.style, {
        padding: "8px", background: "#161616", border: "1px solid " + VIOLET, borderRadius: "8px",
    });
    const archRow = document.createElement("div");
    archFrame.appendChild(archRow);
    for (const row of [rootRow, archRow]) {
        Object.assign(row.style, {
            display: "flex", gap: "10px", overflowX: "auto", overflowY: "hidden", paddingBottom: "6px", minHeight: "60px",
        });
    }
    const footer = document.createElement("div");
    Object.assign(footer.style, { display: "flex", justifyContent: "flex-end" });
    const closeBtn = makeTextButton("Close", INACTIVE_BG);
    footer.appendChild(closeBtn);
    // Date ↓ / ↑ a droite de la ligne Archives (choix utilisateur, 19/10/2026).
    let current = null;
    const orderBtn = makeDateOrderButton(() => current && render());
    const archHead = document.createElement("div");
    Object.assign(archHead.style, { display: "flex", alignItems: "center", gap: "8px" });
    archLabel.style.flex = "1";
    archHead.append(archLabel, orderBtn);
    card.append(title, rootLabel, rootRow, archHead, archFrame, footer);
    const preview = buildPreviewWindow();

    const onKey = (e) => {
        if (overlay.style.display === "none" || e.key !== "Escape") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (preview.isOpen()) preview.close();
        else close();
    };
    function close() {
        preview.close();
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
        rootRow.innerHTML = "";
        archRow.innerHTML = "";
    }
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("mousedown", () => (preview.isOpen() ? preview.close() : close()));

    function tile(path, badge, kind, shown, dim) {
        const t = document.createElement("div");
        Object.assign(t.style, {
            position: "relative", width: "120px", padding: "5px", borderRadius: "8px", background: "#1f1f1f",
            border: "1px solid " + (dim ? "#333" : BELL_ORANGE), cursor: "pointer", flex: "0 0 auto",
            boxSizing: "border-box", opacity: dim ? "0.6" : "1",
        });
        const sep = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
        t.appendChild(dupThumb(path.slice(0, sep), path.slice(sep + 1), kind, 108));
        if (badge) {
            const b = document.createElement("div");
            b.textContent = badge;
            Object.assign(b.style, {
                position: "absolute", top: "8px", left: "8px", minWidth: "18px", height: "18px", padding: "0 4px",
                borderRadius: "9px", background: BELL_ORANGE, color: "white", fontWeight: "bold", fontSize: "11px",
                display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box",
            });
            t.appendChild(b);
        }
        const name = document.createElement("div");
        name.textContent = baseOf(path);
        name.title = baseOf(path);
        Object.assign(name.style, { fontSize: "11px", marginTop: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
        t.appendChild(name);
        t.addEventListener("click", () => preview.toggle(path, kind, shown, card));
        return t;
    }

    function render() {
        const { folder, projectName, rootFiles, archivePaths, mtimes } = current;
        const kind = PREVIEW_KIND[folder];
        orderBtn.refresh();
        title.textContent = folder + " – " + projectName;
        rootLabel.textContent = folder + " (" + rootFiles.length + " file(s))";
        archLabel.textContent = "Archives (" + archivePaths.length + " file(s))";
        rootRow.innerHTML = "";
        archRow.innerHTML = "";
        for (const f of orderByMtime(rootFiles, mtimes, dateOrder)) {
            rootRow.appendChild(tile(f.path, f.badge, kind, folder + "/" + baseOf(f.path), !f.badge));
        }
        for (const f of orderByMtime(archivePaths.map((p) => ({ path: p, badge: "" })), mtimes, dateOrder)) {
            archRow.appendChild(tile(f.path, "", kind, folder + "/Archives/" + baseOf(f.path), false));
        }
        const empty = (row, text) => {
            if (row.children.length) return;
            const d = document.createElement("div");
            d.textContent = text;
            Object.assign(d.style, { color: "#888", alignSelf: "center" });
            row.appendChild(d);
        };
        empty(rootRow, "No file in " + folder + ".");
        empty(archRow, "No file in Archives.");
    }

    return {
        /** open(folder, projectName, rootFiles [{path, badge}], archivePaths, mtimes {chemin: secondes}) */
        open(folder, projectName, rootFiles, archivePaths, mtimes) {
            current = { folder, projectName, rootFiles, archivePaths, mtimes: mtimes || {} };
            render();
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            positionCardNextToNode(card, container, 860);
        },
        remove() {
            close();
            preview.remove();
            overlay.remove();
        },
    };
}

// --------------------------------------------------------------------
// Fenetres des Runs (boutons 04.Prompt, 40.Rush Videos, 60.Rush Images) :
// 04 = filtre All / Video / Image + liste des Runs, cadres Configuration,
// Prompt et vignette ; 40 / 60 = vignettes des sorties citees par les JSON
// (defilement horizontal), puis Configuration et Prompt du Run. Clic sur une
// vignette = fenetre Preview a droite (meme vignette = fermeture).
// --------------------------------------------------------------------
const RUN_FILTERS = [["all", "All"], ["video", "Video"], ["image", "Image"]];
// Pastille des vignettes (choix utilisateur, 19/10/2026) : sous-dossier de tri de
// l'original dans 40 / 60 (dore Picture Lock, vert clair Rough Cut, orange Footage,
// rouge No Good), gris = original hors du projet.
const DOT_GREEN = "#43a047";
const DOT_ORANGE = "#d35400";
const DOT_GREY = "#8a8a8a";
const SORT_COLORS = { picture_lock: "#f5c518", rejected: "#e53935", validated: "#7ee081", footage: "#fb8c00" };
const SORT_TEXT_COLORS = { picture_lock: "#1a1400", rejected: "#fff", validated: "#102010", footage: "#1a1000" };
// Pastilles (vignettes et filtre) : rouge = celui de la poubelle des vignettes (choix utilisateur, 21/10/2026).
const DOT_COLORS = { ...SORT_COLORS, rejected: TRASH_RED };
const RUSH_FOLDER_OF = { video: "40.Rush Videos", image: "60.Rush Images" };
const SORT_NAME = Object.fromEntries(SORT_FOLDERS.map(([key, , name]) => [key, name]));

/** Pastille en haut a gauche d'une vignette. */
function addStatusDot(box, out) {
    box.style.position = "relative";
    const dot = document.createElement("div");
    const key = sortDot(out);
    Object.assign(dot.style, {
        position: "absolute", top: "6px", left: "6px", width: "12px", height: "12px", borderRadius: "50%",
        background: DOT_COLORS[key] || DOT_GREY, border: "2px solid #1e1e1e", zIndex: "1",
    });
    dot.title = key !== "outside" ? "In " + RUSH_FOLDER_OF[out.kind] + "/" + SORT_NAME[key]
        : "Original outside the project: " + (out.folder || "?");
    box.appendChild(dot);
}

/** Dossier et nom d'un chemin complet. */
function splitPath(path) {
    const sep = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
    return [path.slice(0, sep), path.slice(sep + 1)];
}

/** Lignes du cadre Configuration d'un Run (et de la sortie montree). */
function runConfigHtml(run, out) {
    const row = (k, v, tip) => '<div style="display:flex;justify-content:space-between;gap:10px;line-height:1.7"' +
        (tip ? ' title="' + escapeHtml(tip) + '"' : "") + '><span style="color:#999;flex:0 0 auto">' + k +
        '</span><span style="text-align:right;word-break:break-all">' + v + "</span></div>";
    const val = (key) => run[key] !== null && run[key] !== undefined ? escapeHtml(String(run[key]))
        : '<span style="color:' + ORANGE + '">null' + (run[key + "_from"] ? " (" + escapeHtml(run[key + "_from"]) + ")" : "") + "</span>";
    const color = run.status === "done" ? GREEN : run.status === "error" ? "#d32f2f" : ORANGE;
    let h = row("Run", escapeHtml(runDateText(run.date)) + (run.mode ? " – " + escapeHtml(run.mode) : "")) +
        row("Steps", val("steps")) + row("CFG", val("cfg")) + row("Seed", val("seed")) +
        row("Status", '<span style="color:' + color + '">' + escapeHtml(run.status || "?") + "</span>");
    const took = durationText(run.duration);
    if (took) h += row("Duration", escapeHtml(took), "Total time of the run, model loading included");
    if (!out) return h + row("Output", '<span style="color:#888">none</span>');
    if (out.size) h += row("Size", escapeHtml(out.size + (out.copy_size ? " → " + out.copy_size : "")));
    h += row("Original", '<span style="font-family:monospace;font-size:11px">' + escapeHtml(out.folder || "?") + "</span>" +
        (out.source_exists ? "" : out.deleted ? ' <span style="color:#888">(deleted)</span>'
            : ' <span style="color:' + ORANGE + '">(missing)</span>'), out.source);
    if (out.resize_error) h += row("Resize", '<span style="color:' + ORANGE + '">' + escapeHtml(out.resize_error) + "</span>");
    return h;
}

/**
 * rush (40 / 60, choix utilisateur 20/10/2026) : {move(run, out, key), remove(run, out, trash),
 * reload() -> runs, askDelete(noms, ancre, bouton) -> "trash" | "delete" | null, askWord(n, bouton) -> bool}.
 */
function buildRunViewer(container, onSort, onWorkflow, rush) {
    const { overlay, card } = makeOverlay();
    Object.assign(card.style, {
        width: "min(760px, 94vw)", padding: "12px 14px", borderColor: VIOLET, display: "flex",
        flexDirection: "column", gap: "8px", maxHeight: "86vh",
    });
    const head = document.createElement("div");
    Object.assign(head.style, { display: "flex", alignItems: "center", gap: "8px" });
    const title = document.createElement("div");
    Object.assign(title.style, { flex: "1", fontWeight: "bold", fontSize: "13px", color: TITLE_COLOR });
    const closeBtn = makeIconButton(INACTIVE_BG, CLOSE_ICON, "Close");
    Object.assign(closeBtn.style, { width: "22px", height: "22px" });
    // Date ↓ / ↑ : ordre inverse, la meme vignette (selKey) ou le meme Run reste choisi.
    const orderBtn = makeDateOrderButton(() => {
        if (folder === "04.Prompt") {
            runIndex = Math.max(0, filteredRuns().length - 1 - runIndex);
            renderPrompt();
        } else {
            renderRush();
        }
    });
    // 40 / 60 : filtre par pastille (choix utilisateur, 19/10/2026) ; plusieurs pastilles
    // possibles, aucune active = tout ; remis a "tout" a chaque ouverture.
    const dotFilter = new Set();
    const filterBox = document.createElement("div");
    Object.assign(filterBox.style, { display: "flex", alignItems: "center", gap: "6px", flex: "0 0 auto" });
    const filterLabel = document.createElement("span");
    filterLabel.textContent = "Filter:";
    Object.assign(filterLabel.style, { color: "#9fd6cf", fontWeight: "bold", fontSize: "12px" });
    const filterDots = DOT_FILTER.map((key) => {
        const d = document.createElement("button");
        d.type = "button";
        Object.assign(d.style, {
            width: "16px", height: "16px", borderRadius: "50%", padding: "0", cursor: "pointer",
            background: DOT_COLORS[key] || DOT_GREY, boxSizing: "border-box",
        });
        d.addEventListener("click", () => {
            if (dotFilter.has(key)) dotFilter.delete(key);
            else dotFilter.add(key);
            preview.close();
            renderRush();
        });
        return { key, d };
    });
    filterBox.append(filterLabel, ...filterDots.map((x) => x.d));
    head.append(title, filterBox, orderBtn, closeBtn);

    // 04.Prompt : filtre et liste des Runs.
    const pick = document.createElement("div");
    Object.assign(pick.style, { display: "flex", alignItems: "center", gap: "6px" });
    const filterBtns = RUN_FILTERS.map(([key, text]) => {
        const b = makeTextButton(text, INACTIVE_BG);
        b.dataset.filter = key;
        return b;
    });
    const listLabel = document.createElement("span");
    listLabel.textContent = "Runs";
    Object.assign(listLabel.style, { color: "#9fd6cf", fontWeight: "bold", marginLeft: "8px" });
    const select = document.createElement("select");
    Object.assign(select.style, {
        flex: "1", minWidth: "0", background: "#111", color: "#ddd", border: "1px solid #0c3833",
        borderRadius: "6px", padding: "3px 6px", fontSize: "12px",
    });
    pick.append(...filterBtns, listLabel, select);

    // 40 / 60 : vignettes.
    const strip = document.createElement("div");
    Object.assign(strip.style, {
        display: "flex", gap: "10px", overflowX: "auto", overflowY: "hidden", padding: "2px 2px 8px",
        minHeight: "60px", borderBottom: "2px solid " + VIOLET,
    });

    const frame = (text) => {
        const box = document.createElement("div");
        Object.assign(box.style, {
            padding: "8px 10px", background: "#161616", border: "1px solid #2c2c2c", borderRadius: "8px", minWidth: "0",
        });
        const label = document.createElement("div");
        label.textContent = text;
        Object.assign(label.style, { color: "#9fd6cf", fontWeight: "bold", fontSize: "11px", marginBottom: "4px" });
        const body = document.createElement("div");
        box.append(label, body);
        return { box, label, body };
    };
    const conf = frame("Configuration");
    const prompt = frame("Prompt");
    Object.assign(prompt.body.style, {
        whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: "1.5", overflowY: "auto", maxHeight: "28vh",
        userSelect: "text", cursor: "text",
    });
    // Icone de copie en haut a gauche du cadre Prompt (choix utilisateur) : texte dans le presse-papiers.
    const copyBtn = makeIconButton(INACTIVE_BG, DUP_ICON, "Copy the prompt to the clipboard");
    Object.assign(copyBtn.style, { width: "18px", height: "18px", flex: "0 0 auto" });
    const copyDone = document.createElement("span");
    Object.assign(copyDone.style, { color: DOT_GREEN, fontWeight: "normal", marginLeft: "auto" });
    const promptTitle = document.createElement("span");
    promptTitle.textContent = "Prompt";
    prompt.label.textContent = "";
    Object.assign(prompt.label.style, { display: "flex", alignItems: "center", gap: "6px" });
    prompt.label.append(copyBtn, promptTitle, copyDone);
    let copyTimer = 0;
    function setPrompt(text) {
        prompt.body.textContent = text || "";
        copyBtn.disabled = !text;
        copyBtn.style.opacity = text ? "1" : "0.4";
        copyBtn.style.cursor = text ? "pointer" : "default";
        copyBtn.style.background = INACTIVE_BG;
        copyDone.textContent = "";
    }
    /** Copie : API du presse-papiers, sinon zone de texte temporaire (execCommand). */
    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            const area = document.createElement("textarea");
            area.value = text;
            Object.assign(area.style, { position: "fixed", left: "-9999px", top: "0" });
            card.appendChild(area);
            area.select();
            let ok = false;
            try {
                ok = document.execCommand("copy");
            } catch (err) {
                ok = false;
            }
            area.remove();
            return ok;
        }
    }
    copyBtn.addEventListener("click", async () => {
        const text = prompt.body.textContent;
        if (!text) return;
        const ok = await copyText(text);
        clearTimeout(copyTimer);
        copyBtn.style.background = ok ? DOT_GREEN : INACTIVE_BG;
        copyDone.textContent = ok ? "Copied" : "Could not copy to the clipboard";
        copyDone.style.color = ok ? DOT_GREEN : ORANGE;
        copyTimer = setTimeout(() => {
            copyBtn.style.background = INACTIVE_BG;
            copyDone.textContent = "";
        }, 1500);
    });
    const thumb = frame("Output");
    Object.assign(thumb.body.style, { display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" });
    // Blocs repliables Models / LoRA (choix utilisateur) : un seul ouvert a la fois,
    // tous deux replies des que le Run affiche change.
    const models = document.createElement("div");
    Object.assign(models.style, { display: "flex", flexDirection: "column", gap: "6px" });
    const modelBar = document.createElement("div");
    Object.assign(modelBar.style, { display: "flex", gap: "8px" });
    const blockBtns = { models: makeTextButton("Models", INACTIVE_BG), loras: makeTextButton("LoRA", INACTIVE_BG) };
    Object.values(blockBtns).forEach((b) => Object.assign(b.style, { flex: "1", textAlign: "left" }));
    modelBar.append(blockBtns.models, blockBtns.loras);
    const modelPanel = document.createElement("div");
    Object.assign(modelPanel.style, {
        padding: "6px 10px", background: "#161616", border: "1px solid " + VIOLET, borderRadius: "8px", display: "none",
    });
    models.append(modelBar, modelPanel);
    const left = document.createElement("div");
    Object.assign(left.style, { display: "flex", flexDirection: "column", gap: "8px", minWidth: "0" });
    left.append(conf.box, models, prompt.box);
    const grid = document.createElement("div");
    Object.assign(grid.style, { display: "grid", gap: "8px", alignItems: "start", minHeight: "0", overflowY: "auto" });
    grid.append(left, thumb.box);
    const note = document.createElement("div");
    Object.assign(note.style, { minHeight: "14px", fontSize: "11px", color: "#9fd6cf" });
    // 40 / 60 : boutons de tri du fichier choisi (ou des fichiers coches), sous les vignettes.
    const rushSort = document.createElement("div");
    // Barre de progression des deplacements / suppressions par lot.
    const progress = document.createElement("div");
    Object.assign(progress.style, { display: "none", flexDirection: "column", gap: "3px" });
    const progressText = document.createElement("div");
    Object.assign(progressText.style, { fontSize: "11px", color: "#9fd6cf", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
    const progressTrack = document.createElement("div");
    Object.assign(progressTrack.style, { height: "6px", background: "#2a2a2a", borderRadius: "3px", overflow: "hidden" });
    const progressFill = document.createElement("div");
    Object.assign(progressFill.style, { height: "100%", width: "0%", background: VIOLET, transition: "width 0.15s" });
    progressTrack.appendChild(progressFill);
    progress.append(progressText, progressTrack);
    card.append(head, pick, strip, rushSort, progress, grid, note);
    const preview = buildPreviewWindow();
    let moving = false;

    let runs = [];
    let folder = "";
    let openBlock = null;
    let modelRun = null;
    let filter = "all";
    let runIndex = 0;
    let outIndex = 0;
    let rushIndex = 0;
    // Vignette choisie de 40 / 60 (rushKey) : suivie quand l'ordre, le filtre ou son dossier change.
    let selKey = null;
    // Cases cochees (rushKey) et fichiers en echec (rushKey -> erreur), vides a chaque ouverture.
    const checked = new Set();
    const failed = new Map();

    const onKey = (e) => {
        if (overlay.style.display === "none" || moving || e.key !== "Escape") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (preview.isOpen()) preview.close();
        else close();
    };
    function close() {
        preview.close();
        checked.clear();
        failed.clear();
        note.textContent = "";
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
        strip.innerHTML = "";
        thumb.body.innerHTML = "";
    }
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("mousedown", () => (moving ? null : preview.isOpen() ? preview.close() : close()));

    /** Lignes des blocs Models / LoRA d'un Run (nom sans sous-dossier, chemin complet au survol). */
    function blockRows(run, key) {
        const m = (run && run.models) || {};
        const row = (k, name, extra) => '<div style="display:flex;justify-content:space-between;gap:10px;line-height:1.7"' +
            ' title="' + escapeHtml(name) + '"><span style="color:#999;flex:0 0 auto">' + k + '</span><span style="' +
            'text-align:right;word-break:break-all">' + escapeHtml(baseOf(name)) + (extra ? '<span style="color:#9fd6cf">' +
            extra + "</span>" : "") + "</span></div>";
        if (key === "models") {
            // {position, name} (position = champ de MultiFiles Select, 0 = lu dans le graphe) ; ancien format : texte.
            const item = (label) => (n) => {
                const name = typeof n === "string" ? n : String((n && n.name) || "");
                const pos = n && typeof n === "object" && n.position ? " #" + n.position : "";
                return row(label + pos, name);
            };
            return [].concat((m.diffusion_model || []).map(item("Model")),
                (m.text_encoder || []).map(item("Text encoder")), (m.vae || []).map(item("VAE")),
                (m.audio_vae || []).map(item("Audio VAE")));
        }
        const num = (v) => (typeof v === "number" ? String(Math.round(v * 1000) / 1000) : "?");
        return (m.loras || []).map((l) => row("LoRA", String(l.name), " — " + num(l.strength_model) +
            (l.strength_clip !== null && l.strength_clip !== undefined ? " / clip " + num(l.strength_clip) : "")));
    }
    function paintBlocks(run) {
        for (const [key, btn] of Object.entries(blockBtns)) {
            const n = blockRows(run, key).length;
            const open = openBlock === key && n > 0;
            btn.textContent = (open ? "▾ " : "▸ ") + (key === "models" ? "Models" : "LoRA") + " (" + n + ")";
            btn.style.background = open ? VIOLET : INACTIVE_BG;
            btn.style.opacity = n ? "1" : "0.45";
            btn.style.cursor = n ? "pointer" : "default";
            btn.title = n ? (open ? "Fold" : "Unfold") + " the " + (key === "models" ? "models" : "LoRA") + " of the run"
                : "No " + (key === "models" ? "model" : "LoRA") + " recorded for this run";
        }
        const rows = openBlock ? blockRows(run, openBlock) : [];
        modelPanel.innerHTML = rows.join("");
        modelPanel.style.display = rows.length ? "block" : "none";
    }
    /** Blocs du Run affiche : replies quand le Run change (deja replies : rien). */
    function fillModels(run) {
        if (!run || !modelRun || run.file !== modelRun.file) openBlock = null;
        modelRun = run;
        models.style.display = run ? "flex" : "none";
        paintBlocks(run);
    }
    for (const [key, btn] of Object.entries(blockBtns)) {
        btn.addEventListener("click", () => {
            if (!modelRun || !blockRows(modelRun, key).length) return;
            openBlock = openBlock === key ? null : key;
            paintBlocks(modelRun);
        });
    }

    /** Cadre Configuration du Run et de la sortie montree. */
    function fillConfig(run, out) {
        conf.body.innerHTML = runConfigHtml(run, out);
        fillModels(run);
    }

    /**
     * Nombre de fichiers sur le disque du dossier de tri (choix utilisateur, 22/10/2026),
     * fichiers deposes a la main compris : " · n" apres le nom du bouton, detail en infobulle.
     */
    function countText(kind, key) {
        const n = rush && rush.counts ? rush.counts(kind, key) : null;
        return n == null ? "" : " · " + n;
    }
    function countTip(kind, key) {
        const n = rush && rush.counts ? rush.counts(kind, key) : null;
        if (n == null) return "";
        const lone = rush.orphanCount ? rush.orphanCount(kind, key) : 0;
        return "\n" + n + " file(s) in the folder" + (lone ? ", " + lone + " not linked to a run" : "");
    }

    /**
     * Boutons Picture Lock / Rough Cut / Footage / No Good sous l'image (choix utilisateur,
     * 19/10 et 22/10/2026) : le fichier va dans ce sous-dossier de 40 / 60 ; bouton du
     * dossier actuel grise ; original hors du projet : tous le rapatrient (copie, SHA256, suppression).
     */
    function sortBar(run, out) {
        const bar = document.createElement("div");
        Object.assign(bar.style, { display: "flex", gap: "6px", width: "100%" });
        const active = sortTargets(out);
        const where = RUSH_FOLDER_OF[out.kind] + "/";
        for (const [key, label, name] of SORT_FOLDERS) {
            // Fichier supprime : plus de dossier actuel, les boutons grises.
            const here = out.in_project && out.place === key && !out.deleted;
            const b = makeTextButton(label + countText(out.kind, key), here ? SORT_COLORS[key] : INACTIVE_BG);
            Object.assign(b.style, { flex: "1", border: "2px solid " + SORT_COLORS[key] });
            if (here) Object.assign(b.style, { color: SORT_TEXT_COLORS[key], fontWeight: "bold" });
            if (!onSort || !active.includes(key)) {
                b.disabled = true;
                Object.assign(b.style, { cursor: "default", opacity: here ? "1" : "0.45" });
                b.title = (here ? "Already in " + where + name : out.deleted ? "File deleted" : "File not found") + countTip(out.kind, key);
                bar.appendChild(b);
                continue;
            }
            b.title = (!out.in_project && out.source_exists
                ? "Move the original into " + where + name + " (copy, SHA256 check, then the original is deleted)"
                : "Move the file into " + where + name) + countTip(out.kind, key);
            b.addEventListener("click", async () => {
                moving = true;
                preview.close();
                let res = null;
                try {
                    res = await onSort(run, out, key);
                } finally {
                    moving = false;
                }
                if (!res) return;
                runs = res.runs || runs;
                if (modelRun) modelRun = runs.find((r) => r.file === modelRun.file) || modelRun;
                note.textContent = res.text || "";
                note.style.color = res.ok ? "#9fd6cf" : ORANGE;
                if (folder === "04.Prompt") renderPrompt();
                else renderRush();
            });
            bar.appendChild(b);
        }
        return bar;
    }

    const shownOf = (file) => folder === "40.Rush Videos" || /[\\/]40\.Rush Videos[\\/]/.test(file)
        ? "40.Rush Videos/" + baseOf(file) : file;
    const showPreview = (file, kind) => preview.toggle(file, kind, shownOf(file), card);

    // ---- 04.Prompt ----
    const filteredRuns = () => inDateOrder(runsOfKind(runs, filter === "all" ? null : filter), dateOrder);
    function renderPrompt() {
        filterBtns.forEach((b) => {
            const on = b.dataset.filter === filter;
            b.style.background = on ? VIOLET : INACTIVE_BG;
            b.style.fontWeight = on ? "bold" : "normal";
        });
        const list = filteredRuns();
        select.innerHTML = "";
        list.forEach((r, i) => {
            const o = document.createElement("option");
            o.value = String(i);
            const kinds = [...new Set((r.outputs || []).map((x) => x.kind))];
            o.textContent = runDateText(r.date) + " – " + (r.mode || "?") + " – " + (kinds.join(" / ") || "no output");
            o.style.background = "#111";
            select.appendChild(o);
        });
        if (!list.length) {
            const o = document.createElement("option");
            o.textContent = "No run" + (filter === "all" ? "" : " with a " + filter);
            select.appendChild(o);
            conf.body.innerHTML = '<span style="color:#888">No run recorded.</span>';
            fillModels(null);
            setPrompt("");
            thumb.body.innerHTML = "";
            return;
        }
        runIndex = Math.min(runIndex, list.length - 1);
        select.value = String(runIndex);
        showRun(list[runIndex]);
    }
    function showRun(run) {
        const outs = (run.outputs || []).filter((o) => filter === "all" || o.kind === filter);
        outIndex = Math.min(outIndex, Math.max(0, outs.length - 1));
        const out = outs[outIndex];
        fillConfig(run, out);
        setPrompt(run.prompt);
        thumb.body.innerHTML = "";
        thumb.label.textContent = out ? "Output – click the thumbnail to view the " + out.kind : "Output";
        const file = outputFile(out);
        if (!out || !file) {
            const d = document.createElement("div");
            d.textContent = !out ? "No output" : out.deleted ? deletedText(out.deleted)
                : out.kind === "video" ? "Copy not found in 40.Rush Videos" : "Original not found";
            Object.assign(d.style, { color: "#888", padding: "40px 0" });
            thumb.body.appendChild(d);
        } else {
            const [dir, name] = splitPath(file);
            const t = dupThumb(dir, name, out.kind, 300);
            Object.assign(t.style, { width: "100%", height: "auto", aspectRatio: "16 / 10", cursor: "pointer" });
            t.title = "Preview " + name;
            addStatusDot(t, out);
            t.addEventListener("click", () => showPreview(file, out.kind));
            const n = document.createElement("div");
            n.textContent = name;
            Object.assign(n.style, { fontSize: "11px", color: "#999", wordBreak: "break-all", textAlign: "center" });
            thumb.body.append(t, n);
        }
        if (out) thumb.body.appendChild(sortBar(run, out));
        if (outs.length > 1) {
            const nav = document.createElement("div");
            Object.assign(nav.style, { display: "flex", alignItems: "center", gap: "8px" });
            const prev = makeTextButton("‹", INACTIVE_BG);
            const next = makeTextButton("›", INACTIVE_BG);
            const count = document.createElement("span");
            count.textContent = outIndex + 1 + "/" + outs.length;
            prev.addEventListener("click", () => {
                outIndex = (outIndex + outs.length - 1) % outs.length;
                showRun(run);
            });
            next.addEventListener("click", () => {
                outIndex = (outIndex + 1) % outs.length;
                showRun(run);
            });
            nav.append(prev, count, next);
            thumb.body.appendChild(nav);
        }
        if (onWorkflow) thumb.body.appendChild(workflowButton(run));
    }

    /**
     * "Retrieve the workflow" sous la vignette (choix utilisateur) : workflow du Run
     * (00.Workflows/Run) dans un nouvel onglet ; Run plus ancien : cherche dans ses rendus.
     */
    function workflowButton(run) {
        const files = (run.outputs || []).some((o) => o.source_exists || o.copy_exists);
        const b = makeTextButton("Retrieve the workflow", run.workflow ? GREEN : files ? VIOLET : INACTIVE_BG);
        Object.assign(b.style, { width: "100%", marginTop: "4px" });
        b.title = run.workflow ? "Open the workflow of this run in a new tab (00.Workflows/Run/" + run.file + ")"
            : files ? "Run recorded before the workflows were saved: look for the workflow in its output files, then open it in a new tab"
                : "No workflow saved for this run";
        if (!run.workflow && !files) {
            b.disabled = true;
            Object.assign(b.style, { opacity: "0.45", cursor: "default" });
            return b;
        }
        b.addEventListener("click", async () => {
            b.disabled = true;
            let res = null;
            try {
                res = await onWorkflow(run);
            } finally {
                b.disabled = false;
            }
            if (res && res.ok) {
                close();
                return;
            }
            note.textContent = (res && res.text) || "";
            note.style.color = ORANGE;
        });
        return b;
    }
    filterBtns.forEach((b) => b.addEventListener("click", () => {
        filter = b.dataset.filter;
        runIndex = 0;
        outIndex = 0;
        preview.close();
        renderPrompt();
    }));
    select.addEventListener("change", () => {
        runIndex = Number(select.value) || 0;
        outIndex = 0;
        preview.close();
        const list = filteredRuns();
        if (list[runIndex]) showRun(list[runIndex]);
    });

    // ---- 40.Rush Videos / 60.Rush Images ----
    // Groupes par pastille (vert, orange, rouge, gris), puis date dans chaque groupe (choix utilisateur).
    const allRush = () => groupByDot(rushItems(inDateOrder(runs, dateOrder), folder));
    const shownRush = () => filterByDot(allRush(), dotFilter);
    function paintFilter(all) {
        const counts = dotCounts(all);
        for (const { key, d } of filterDots) {
            const on = dotFilter.has(key);
            d.style.opacity = on ? "1" : "0.35";
            d.style.border = on ? "2px solid #fff" : "2px solid transparent";
            d.title = (key === "outside" ? "Outside the project" : SORT_NAME[key]) + ": " + counts[key] +
                (on ? " (click: hide)" : " (click: show only these)");
        }
    }
    let lockNote = "";
    function renderRush() {
        const all = allRush();
        paintFilter(all);
        // Picture Lock d'un projet de MultiProject avec plusieurs fichiers (deposes a la main).
        const warn = rush && rush.lockWarning ? rush.lockWarning(folder === "40.Rush Videos" ? "video" : "image") : "";
        if (warn && (!note.textContent || note.textContent === lockNote)) {
            note.textContent = warn;
            note.style.color = ORANGE;
        } else if (!warn && lockNote && note.textContent === lockNote) {
            note.textContent = "";
        }
        lockNote = warn;
        const items = filterByDot(all, dotFilter);
        // Cases des vignettes masquees (filtre) ou disparues : decochees.
        const visible = new Set(items.map(rushKey));
        for (const k of [...checked]) if (!visible.has(k)) checked.delete(k);
        const scroll = strip.scrollLeft;
        strip.innerHTML = "";
        if (!items.length) {
            const d = document.createElement("div");
            d.textContent = all.length ? "No file with this dot." : "No " + (RUN_FOLDERS[folder] || "file") + " recorded by a run.";
            Object.assign(d.style, { color: "#888", alignSelf: "center" });
            strip.appendChild(d);
            rushSort.innerHTML = "";
            conf.body.innerHTML = "";
            fillModels(null);
            setPrompt("");
            return;
        }
        if (selKey) {
            // Vignette choisie masquee par le filtre : la premiere visible.
            const k = items.findIndex((x) => rushKey(x) === selKey);
            rushIndex = k >= 0 ? k : 0;
        } else {
            rushIndex = Math.min(rushIndex, items.length - 1);
        }
        selKey = rushKey(items[rushIndex]);
        items.forEach((it, i) => {
            const t = document.createElement("div");
            Object.assign(t.style, {
                width: "120px", padding: "5px", borderRadius: "8px", background: "#1f1f1f", cursor: "pointer",
                flex: "0 0 auto", boxSizing: "border-box",
                border: i === rushIndex ? "2px solid " + VIOLET : "1px solid #333",
            });
            const [dir, name] = splitPath(it.file);
            const key = rushKey(it);
            const pic = dupThumb(dir, name, it.output.kind, 108);
            addStatusDot(pic, it.output);
            if (failed.has(key)) {
                // Echec du dernier lot : ✕ rouge a droite de la pastille.
                const x = document.createElement("div");
                x.textContent = "✕";
                Object.assign(x.style, {
                    position: "absolute", top: "2px", left: "22px", color: "#ff3b30", fontWeight: "bold",
                    fontSize: "14px", lineHeight: "16px", textShadow: "0 0 3px #000", zIndex: "1",
                });
                x.title = "Failed: " + failed.get(key);
                pic.appendChild(x);
            }
            let trash = null;
            if (canDeleteRush(it.output)) {
                // Poubelle des fichiers de No Good : grise, rouge quand la case est cochee.
                trash = document.createElement("div");
                trash.innerHTML = TRASH_ICON;
                Object.assign(trash.style, {
                    position: "absolute", top: "4px", right: "4px", width: "18px", height: "18px", borderRadius: "4px",
                    display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", zIndex: "1",
                    pointerEvents: "none",
                });
                pic.appendChild(trash);
            }
            const paintTrash = () => {
                if (!trash) return;
                trash.style.background = checked.has(key) ? TRASH_RED : INACTIVE_BG;
                trash.title = checked.has(key) ? "Checked: Delete removes it" : "In No Good: check it to delete it";
            };
            paintTrash();
            t.appendChild(pic);
            const label = document.createElement("div");
            label.textContent = runDateText(it.run.date);
            label.title = name;
            Object.assign(label.style, { fontSize: "11px", marginTop: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
            t.appendChild(label);
            if (rush) {
                const cb = document.createElement("input");
                cb.type = "checkbox";
                cb.checked = checked.has(key);
                cb.title = "Check to move or delete several files at once";
                Object.assign(cb.style, { display: "block", margin: "4px auto 0", cursor: "pointer" });
                cb.addEventListener("click", (e) => e.stopPropagation());
                cb.addEventListener("change", () => {
                    if (cb.checked) checked.add(key);
                    else checked.delete(key);
                    paintTrash();
                    paintRushSort(items);
                });
                t.appendChild(cb);
            }
            t.addEventListener("click", () => {
                if (rushIndex !== i) {
                    rushIndex = i;
                    selKey = rushKey(it);
                    renderRush();
                }
                showPreview(it.file, it.output.kind);
            });
            strip.appendChild(t);
        });
        strip.scrollLeft = scroll;
        const it = items[rushIndex];
        paintRushSort(items);
        conf.label.textContent = "Configuration – " + baseOf(it.file);
        fillConfig(it.run, it.output);
        setPrompt(it.run.prompt);
    }

    /** Sous les vignettes : boutons du fichier choisi, ou boutons du lot s'il y a des cases cochees. */
    function paintRushSort(items) {
        rushSort.innerHTML = "";
        const sel = items.filter((x) => checked.has(rushKey(x)));
        if (!sel.length) {
            const it = items[rushIndex];
            if (it) rushSort.appendChild(sortBar(it.run, it.output));
            return;
        }
        rushSort.appendChild(batchBar(sel));
    }

    /**
     * Boutons du lot (choix utilisateur, 20/10/2026) : Picture Lock / Rough Cut / Footage /
     * No Good deplacent tous les fichiers coches, sans confirmation (sauf l'echange du
     * Picture Lock d'un projet de MultiProject) ; Delete (sous No Good) apparait si un
     * fichier coche est dans No Good.
     */
    function batchBar(sel) {
        const bar = document.createElement("div");
        Object.assign(bar.style, { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "6px", width: "100%" });
        const single = !!(rush && rush.singleLock && rush.singleLock());
        const active = batchSortTargets(sel.map((x) => x.output), single);
        const where = RUSH_FOLDER_OF[sel[0].output.kind] + "/";
        for (const [key, label, name] of SORT_FOLDERS) {
            const kind = sel[0].output.kind;
            const b = makeTextButton(label + " (" + sel.length + ")" + countText(kind, key), INACTIVE_BG);
            Object.assign(b.style, { border: "2px solid " + SORT_COLORS[key] });
            if (!active.includes(key)) {
                b.disabled = true;
                Object.assign(b.style, { cursor: "default", opacity: "0.45" });
                b.title = (key === "picture_lock" && single && sel.length > 1
                    ? "Picture Lock holds only one file in a project of a MultiProject: check a single file"
                    : "All the checked files are already in " + where + name) + countTip(kind, key);
            } else {
                b.title = "Move the " + sel.length + " checked file(s) into " + where + name +
                    " (copy, SHA256 check, then the original is deleted)" + countTip(kind, key);
                b.addEventListener("click", () => moveChecked(sel, key, where + name));
            }
            bar.appendChild(b);
        }
        const doomed = sel.filter((x) => canDeleteRush(x.output));
        if (doomed.length) {
            const d = makeTextButton("Delete (" + doomed.length + ")", SORT_COLORS.rejected);
            Object.assign(d.style, { gridColumn: "4", border: "2px solid " + SORT_COLORS.rejected });
            d.title = "Delete the " + doomed.length + " checked file(s) of " + where + SORT_NAME.rejected;
            d.addEventListener("click", () => deleteChecked(doomed, d));
            bar.appendChild(d);
        }
        return bar;
    }

    /** Lot : un fichier apres l'autre, barre de progression ; un echec n'arrete pas les autres. */
    async function runBatch(list, op) {
        moving = true;
        preview.close();
        note.textContent = "";
        strip.style.pointerEvents = "none";
        rushSort.style.pointerEvents = "none";
        progress.style.display = "flex";
        let ok = 0;
        let ko = 0;
        try {
            for (let i = 0; i < list.length; i++) {
                const it = list[i];
                const key = rushKey(it);
                progressText.textContent = i + 1 + " / " + list.length + " – " + baseOf(it.file);
                progressFill.style.width = Math.round((i / list.length) * 100) + "%";
                try {
                    await op(it);
                    ok++;
                    failed.delete(key);
                    checked.delete(key);
                } catch (e) {
                    ko++;
                    failed.set(key, (e && e.message) || String(e));
                }
            }
            progressFill.style.width = "100%";
            try {
                runs = (await rush.reload()) || runs;
            } catch (e) {
                // liste gardee : relue a la prochaine ouverture
            }
            if (modelRun) modelRun = runs.find((r) => r.file === modelRun.file) || modelRun;
        } finally {
            progress.style.display = "none";
            progressFill.style.width = "0%";
            strip.style.pointerEvents = "";
            rushSort.style.pointerEvents = "";
            moving = false;
        }
        return { ok, ko };
    }
    function report(text, ko) {
        note.textContent = text;
        note.style.color = ko ? ORANGE : "#9fd6cf";
    }
    async function moveChecked(sel, key, dest) {
        const list = sel.filter((x) => sortTargets(x.output).includes(key));
        const skipped = sel.length - list.length;
        // Picture Lock d'un projet de MultiProject : un seul fichier, echange confirme.
        const lock = list.length ? await rush.lockSwap(list[0].output, key) : { swap: false };
        if (!lock) return;
        const { ok, ko } = await runBatch(list, (it) => rush.move(it.run, it.output, key, lock.swap));
        renderRush();
        report(ok + " file(s) moved to " + dest + " – " + ko + " failed" +
            (skipped ? " – " + skipped + " already there" : ""), ko);
    }
    async function deleteChecked(doomed, button) {
        moving = true;
        let how = null;
        try {
            how = await rush.askDelete(doomed.map((x) => baseOf(x.file)), card, button);
            if (how === "delete" && !(await rush.askWord(doomed.length, button))) how = null;
        } finally {
            moving = false;
        }
        if (!how) return;
        const trash = how === "trash";
        const { ok, ko } = await runBatch(doomed, (it) => rush.remove(it.run, it.output, trash));
        renderRush();
        report(ok + " file(s) deleted " + (trash ? "(Recycle Bin)" : "permanently") + " – " + ko + " failed", ko);
    }

    return {
        /**
         * open(folder "04.Prompt" | "40.Rush Videos" | "60.Rush Images", projectName, runs, message)
         * message = {text, ok} affiche en bas (resultat des doublons resolus a l'ouverture).
         */
        open(name, projectName, list, message) {
            const same = folder === name && overlay.style.display !== "none";
            folder = name;
            runs = list || [];
            if (!same) {
                runIndex = 0;
                outIndex = 0;
                rushIndex = 0;
                selKey = null;
                dotFilter.clear();
                checked.clear();
                failed.clear();
                openBlock = null;
                modelRun = null;
            }
            const promptMode = name === "04.Prompt";
            orderBtn.refresh();
            if (!same) note.textContent = "";
            title.textContent = name + " – " + projectName;
            conf.label.textContent = "Configuration";
            pick.style.display = promptMode ? "flex" : "none";
            strip.style.display = promptMode ? "none" : "flex";
            rushSort.style.display = promptMode ? "none" : "block";
            filterBox.style.display = promptMode ? "none" : "flex";
            thumb.box.style.display = promptMode ? "block" : "none";
            grid.style.gridTemplateColumns = promptMode ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)";
            if (promptMode) renderPrompt();
            else renderRush();
            if (message && message.text) {
                note.textContent = message.text;
                note.style.color = message.ok ? "#9fd6cf" : ORANGE;
            }
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            positionCardNextToNode(card, container, 760);
        },
        isOpen: () => overlay.style.display !== "none",
        close,
        remove() {
            close();
            preview.remove();
            overlay.remove();
        },
    };
}

// ----------------------------------------------------------------------
// Fenetre des boutons 02.Models / 06.LoRA (choix utilisateur, 18/10/2026) :
// colonne 1 = ensembles du registre (un par carte), colonne 2 = prompts de
// l'ensemble choisi (textes identiques regroupes), zone A = l'autre registre
// des Runs du prompt choisi ; bouton bleu = fenetre des Runs de ce prompt.
// ----------------------------------------------------------------------
const SET_BLUE = "#3b82f6";

/** Lignes d'un ensemble : [{label, name, extra}] (Models : modele, encodeur, VAE ; LoRA : nom et forces). */
function setLines(kind, set) {
    const num = (v) => (typeof v === "number" ? String(Math.round(v * 1000) / 1000) : "?");
    if (kind === "models") {
        const item = (label) => (n) => ({
            label: label + (n && typeof n === "object" && n.position ? " #" + n.position : ""),
            name: typeof n === "string" ? n : String((n && n.name) || ""), extra: "",
        });
        return [].concat((set.diffusion_model || []).map(item("Model")),
            (set.text_encoder || []).map(item("Text encoder")), (set.vae || []).map(item("VAE")),
            (set.audio_vae || []).map(item("Audio VAE")));
    }
    return (set.loras || []).map((l) => ({
        label: "LoRA", name: String(l.name),
        extra: " — " + num(l.strength_model) + (l.strength_clip !== null && l.strength_clip !== undefined
            ? " / clip " + num(l.strength_clip) : ""),
    }));
}

function setLinesHtml(lines) {
    return lines.map((x) => '<div style="display:flex;justify-content:space-between;gap:10px;line-height:1.6" title="' +
        escapeHtml(x.name) + '"><span style="color:#999;flex:0 0 auto">' + escapeHtml(x.label) + '</span><span style="' +
        'text-align:right;word-break:break-all">' + escapeHtml(baseOf(x.name)) + (x.extra ? '<span style="color:#9fd6cf">' +
        escapeHtml(x.extra) + "</span>" : "") + "</span></div>").join("");
}

const SET_NAMES = { models: "Models", lora: "LoRA" };

function buildSetViewer(container, onSort, onWorkflow, rush) {
    const { overlay, card } = makeOverlay();
    Object.assign(card.style, {
        width: "min(980px, 96vw)", height: "min(660px, 86vh)", padding: "12px 14px", display: "flex",
        flexDirection: "column", gap: "8px",
    });
    const head = document.createElement("div");
    Object.assign(head.style, { display: "flex", alignItems: "center", gap: "8px" });
    const title = document.createElement("div");
    Object.assign(title.style, { flex: "1", fontWeight: "bold", fontSize: "13px", color: TITLE_COLOR });
    const closeBtn = makeIconButton(INACTIVE_BG, CLOSE_ICON, "Close");
    Object.assign(closeBtn.style, { width: "22px", height: "22px" });
    head.append(title, closeBtn);

    const column = () => {
        const c = document.createElement("div");
        Object.assign(c.style, { display: "flex", flexDirection: "column", gap: "6px", minHeight: "0", minWidth: "0" });
        return c;
    };
    const heading = () => {
        const h = document.createElement("div");
        Object.assign(h.style, { color: "#9fd6cf", fontWeight: "bold", fontSize: "12px", flex: "0 0 auto" });
        return h;
    };
    const scroller = (flex) => {
        const d = document.createElement("div");
        Object.assign(d.style, {
            display: "flex", flexDirection: "column", gap: "6px", overflowY: "auto", minHeight: "0", flex, paddingRight: "2px",
        });
        return d;
    };
    const left = column();
    const setsHead = heading();
    // Date ↓ / ↑ a droite du titre des ensembles (choix utilisateur, 19/10/2026) : ensembles par
    // date de leur dernier Run, prompts du plus recent ou du plus ancien.
    const orderBtn = makeDateOrderButton(() => {
        const c = setsWithRuns(registries, runs, kind).find((x) => x.set.index === setIndex);
        promptIndex = Math.max(0, (c ? promptGroups(c.runs).length : 0) - 1 - promptIndex);
        render();
    });
    const setsHeadRow = document.createElement("div");
    Object.assign(setsHeadRow.style, { display: "flex", alignItems: "center", gap: "8px", flex: "0 0 auto" });
    setsHead.style.flex = "1";
    setsHeadRow.append(setsHead, orderBtn);
    const setsList = scroller("1 1 60%");
    const otherHead = heading();
    Object.assign(otherHead.style, { borderTop: "2px solid #333", paddingTop: "8px", marginTop: "2px" });
    const otherList = scroller("0 1 40%");
    left.append(setsHeadRow, setsList, otherHead, otherList);
    const right = column();
    Object.assign(right.style, { borderLeft: "2px solid #333", paddingLeft: "10px" });
    const promptHead = heading();
    const promptList = scroller("1 1 auto");
    right.append(promptHead, promptList);
    const body = document.createElement("div");
    Object.assign(body.style, {
        display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "10px", flex: "1 1 auto", minHeight: "0",
    });
    body.append(left, right);
    const note = document.createElement("div");
    Object.assign(note.style, { minHeight: "14px", fontSize: "11px", color: "#9fd6cf" });
    card.append(head, body, note);

    // Fenetre des Runs du prompt : creee apres, donc au-dessus de celle-ci.
    const sub = buildRunViewer(container, onSort, async (run) => {
        const res = await onWorkflow(run);
        if (res && res.ok) close();
        return res;
    }, rush);

    let folder = "";
    let kind = "models";
    let projectName = "";
    let runs = [];
    let registries = {};
    let setIndex = null;
    let promptIndex = 0;

    const onKey = (e) => {
        if (overlay.style.display === "none" || sub.isOpen() || e.key !== "Escape") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
    };
    function close() {
        sub.close();
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
    }
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("mousedown", close);

    const empty = (text) => {
        const d = document.createElement("div");
        d.textContent = text;
        Object.assign(d.style, { color: "#888", padding: "6px 2px" });
        return d;
    };
    const box = (selected, color) => {
        const b = document.createElement("div");
        Object.assign(b.style, {
            padding: "6px 10px", background: "#161616", borderRadius: "8px", flex: "0 0 auto",
            border: selected ? "2px solid " + color : "1px solid #2c2c2c", margin: selected ? "0" : "1px",
        });
        return b;
    };
    const setHeader = (index, list, color) => '<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">' +
        '<b style="background:' + color + ';color:#fff;border-radius:4px;padding:0 6px">#' + index + "</b>" +
        '<span style="color:#9fd6cf">' + list.length + " run" + (list.length > 1 ? "s" : "") +
        (list.length ? " · last " + escapeHtml(runDateText(list[0].date)) : "") + "</span></div>";

    function render() {
        const color = FOLDER_COLORS[folder] || VIOLET;
        const cards = orderSetCards(setsWithRuns(registries, runs, kind), dateOrder);
        setsHead.textContent = SET_NAMES[kind] + " (" + cards.length + ")";
        setsList.innerHTML = "";
        if (!cards.length) {
            setsList.appendChild(empty("No " + SET_NAMES[kind] + " set recorded yet: a set is added at the end of each recorded run."));
        }
        if (!cards.some((c) => c.set.index === setIndex)) {
            const first = cards.find((c) => c.runs.length) || cards[0];
            setIndex = first ? first.set.index : null;
            promptIndex = 0;
        }
        let current = null;
        for (const c of cards) {
            const selected = c.set.index === setIndex;
            if (selected) current = c;
            const b = box(selected, color);
            b.style.cursor = "pointer";
            b.innerHTML = setHeader(c.set.index, c.runs, color) + setLinesHtml(setLines(kind, c.set));
            b.addEventListener("click", () => {
                if (setIndex === c.set.index) return;
                setIndex = c.set.index;
                promptIndex = 0;
                render();
            });
            setsList.appendChild(b);
        }
        renderPrompts(current, color);
    }

    function renderPrompts(current, color) {
        const groups = current ? inDateOrder(promptGroups(current.runs), dateOrder) : [];
        promptHead.textContent = "Prompts (" + groups.length + ")";
        promptList.innerHTML = "";
        if (current && !groups.length) promptList.appendChild(empty("No run uses this set."));
        promptIndex = Math.min(promptIndex, Math.max(0, groups.length - 1));
        groups.forEach((g, i) => {
            const b = box(i === promptIndex, color);
            Object.assign(b.style, { display: "flex", gap: "8px", alignItems: "flex-start", cursor: "pointer" });
            const textCol = document.createElement("div");
            Object.assign(textCol.style, { flex: "1", minWidth: "0" });
            const text = document.createElement("div");
            text.textContent = g.prompt || "(empty prompt)";
            text.title = g.prompt;
            Object.assign(text.style, {
                display: "-webkit-box", WebkitLineClamp: "3", WebkitBoxOrient: "vertical", overflow: "hidden",
                lineHeight: "1.45", wordBreak: "break-word", color: g.prompt ? "#ddd" : "#888",
            });
            const meta = document.createElement("div");
            meta.textContent = runDateText(g.runs[0].date) + " · " + g.runs.length + " run" + (g.runs.length > 1 ? "s" : "");
            Object.assign(meta.style, { color: "#9fd6cf", fontSize: "11px", marginTop: "3px" });
            textCol.append(text, meta);
            const show = makeIconButton(SET_BLUE, EYE_ICON, "Show the run" + (g.runs.length > 1 ? "s" : "") +
                " of this prompt (configuration, rendering, workflow)");
            show.addEventListener("click", (e) => {
                e.stopPropagation();
                sub.open("04.Prompt", projectName, g.runs);
            });
            b.append(textCol, show);
            b.addEventListener("click", () => {
                if (promptIndex === i) return;
                promptIndex = i;
                renderPrompts(current, color);
            });
            promptList.appendChild(b);
        });
        renderOther(groups[promptIndex], color);
    }

    function renderOther(group, color) {
        const other = OTHER_REGISTRY[kind];
        otherHead.textContent = SET_NAMES[other] + " of the selected prompt";
        otherList.innerHTML = "";
        if (!group) return;
        for (const { index, count } of setsOfRuns(group.runs, other)) {
            const b = box(false, color);
            const runsText = count + " run" + (count > 1 ? "s" : "");
            const set = index ? ((registries[other] || []).find((x) => x.index === index)) : null;
            if (!index) {
                b.innerHTML = '<span style="color:#888">No ' + SET_NAMES[other] + " (" + runsText + ")</span>";
            } else {
                b.innerHTML = '<div style="margin-bottom:2px"><b style="background:' + (FOLDER_COLORS[other === "models" ?
                    "02.Models" : "06.LoRA"] || VIOLET) + ';color:#fff;border-radius:4px;padding:0 6px">#' + index +
                    '</b> <span style="color:#9fd6cf">' + runsText + "</span></div>" +
                    (set ? setLinesHtml(setLines(other, set)) : '<span style="color:#888">Not in the registry.</span>');
            }
            otherList.appendChild(b);
        }
    }

    return {
        /** open(folder "02.Models" | "06.LoRA", projectName, runs, registries) */
        open(name, project, list, regs) {
            const same = folder === name && overlay.style.display !== "none";
            folder = name;
            kind = REGISTRY_FOLDERS[name] || "models";
            projectName = project;
            runs = list || [];
            registries = regs || {};
            if (!same) {
                setIndex = null;
                promptIndex = 0;
                note.textContent = "";
            }
            title.textContent = name + " – " + project;
            card.style.borderColor = FOLDER_COLORS[name] || VIOLET;
            orderBtn.refresh();
            render();
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            positionCardNextToNode(card, container, 980);
        },
        close,
        remove() {
            close();
            sub.remove();
            overlay.remove();
        },
    };
}

/**
 * open(report, projectPath, switching, group, name) -> Promise<dossiers coches | null> (Cancel,
 * Echap, clic a cote = null) ; switching = changement de projet (autre structure -> nouvel
 * onglet) ; group = meme MultiProject : interrupteur Data only (dossiers.dataOnly).
 */
function buildLoadDialog(container) {
    const { overlay, card } = makeOverlay();
    Object.assign(card.style, {
        width: "min(560px, 94vw)", padding: "12px 14px", borderColor: PINK, display: "flex",
        flexDirection: "column", maxHeight: "86vh",
    });
    const title = document.createElement("div");
    title.textContent = "Load the project";
    Object.assign(title.style, { fontWeight: "bold", fontSize: "13px", color: TITLE_COLOR, marginBottom: "4px" });
    const sub = document.createElement("div");
    Object.assign(sub.style, { color: "#999", marginBottom: "8px" });
    const body = document.createElement("div");
    Object.assign(body.style, {
        flex: "1 1 auto", minHeight: "0", overflowX: "hidden", overflowY: "auto", padding: "6px 10px",
        background: "#161616", border: "1px solid #2c2c2c", borderRadius: "8px", lineHeight: "1.5",
        wordBreak: "break-word",
    });
    const note = document.createElement("div");
    note.textContent = "Load replaces the current files of the checked folders.";
    Object.assign(note.style, { color: "#999", margin: "8px 0 0" });
    const footer = document.createElement("div");
    Object.assign(footer.style, { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" });
    const cancelBtn = makeTextButton("Cancel", INACTIVE_BG);
    const loadBtn = makeTextButton("Load", PINK);
    footer.append(cancelBtn, loadBtn);
    // Projet du meme MultiProject (choix utilisateur, 22/10/2026) : interrupteur pilule
    // Whole workflow (workflow et donnees) | Data only (le workflow de l'onglet reste).
    const modePill = document.createElement("div");
    Object.assign(modePill.style, {
        display: "none", borderRadius: "999px", overflow: "hidden", border: "1px solid #0c3833", height: "24px",
        marginBottom: "8px",
    });
    const modeBtn = (text, tip) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.title = tip;
        Object.assign(b.style, {
            flex: "1", border: "none", borderRadius: "0", cursor: "pointer", fontWeight: "bold", fontSize: "11px",
            padding: "0",
        });
        modePill.appendChild(b);
        return b;
    };
    const wholeBtn = modeBtn("Whole workflow", "Load the workflow of the project and its data (usual rules)");
    const dataBtn = modeBtn("Data only", "Keep the workflow of this tab: only the files and the values of the common " +
        "nodes come from the project");
    card.append(title, sub, modePill, body, note, footer);
    const preview = buildPreviewWindow();

    let resolve = null;
    let boxes = [];
    // Echap : ferme d'abord l'apercu, puis la fenetre Load.
    const onKey = (e) => {
        if (overlay.style.display === "none" || e.key !== "Escape") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (preview.isOpen()) preview.close();
        else finish(null);
    };
    function finish(result) {
        preview.close();
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
        body.innerHTML = ""; // arrete les lecteurs ouverts
        const r = resolve;
        resolve = null;
        if (r) r(result);
    }
    const checkedFolders = () => boxes.filter((b) => b.box.checked && !b.box.disabled).map((b) => b.folder);
    function paintLoad() {
        const on = checkedFolders().length > 0;
        loadBtn.disabled = !on;
        loadBtn.style.opacity = on ? "1" : "0.45";
        loadBtn.style.cursor = on ? "pointer" : "default";
        boxes.forEach((b) => b.onChange && b.onChange());
    }
    cancelBtn.addEventListener("click", () => finish(null));
    loadBtn.addEventListener("click", () => {
        if (loadBtn.disabled) return;
        const folders = checkedFolders();
        folders.dataOnly = !!dataGroup && dataOnly; // Data only : lu par loadProject
        finish(folders);
    });
    function paintMode() {
        wholeBtn.style.background = dataOnly ? INACTIVE_BG : PINK;
        wholeBtn.style.color = dataOnly ? "#888" : "white";
        dataBtn.style.background = dataOnly ? VIOLET : INACTIVE_BG;
        dataBtn.style.color = dataOnly ? "white" : "#888";
        if (wfEl && lastReport) wfEl.innerHTML = workflowHtml(lastReport.workflow);
    }
    wholeBtn.addEventListener("click", () => {
        dataOnly = false;
        paintMode();
    });
    dataBtn.addEventListener("click", () => {
        dataOnly = true;
        paintMode();
    });
    overlay.addEventListener("mousedown", () => (preview.isOpen() ? preview.close() : finish(null)));

    const div = (html, style) => {
        const d = document.createElement("div");
        if (html) d.innerHTML = html;
        if (style) Object.assign(d.style, style);
        return d;
    };

    /** Ligne d'un fichier : ✓ / ✗ (⚠ pour le prompt), puis l'archive retrouvee avec son oeil. */
    function fileLine(f, x, projectPath) {
        const wrap = div("", { padding: "1px 0 1px 26px" });
        const ok = x.status === "ok";
        const mark = ok ? MARK_OK : f.kind === "prompt" ? MARK_WARN : MARK_BAD;
        const extra = (x.Liste && LIST_LABEL[x.Liste] ? " · " + LIST_LABEL[x.Liste] : "") +
            (f.kind === "media" ? " · #" + x.Indice : "") + (ok ? "" : " (" + x.status + ")");
        wrap.appendChild(div(mark + " " + escapeHtml(x.nom) + '<span style="color:#888">' + escapeHtml(extra) + "</span>"));
        if (ok || !(f.kind === "media" || f.kind === "workflow")) return wrap;
        if (!x.archive) {
            wrap.appendChild(div("→ not found in Archives", { color: "#888", paddingLeft: "16px" }));
            return wrap;
        }
        const line = div("→ found in Archives: <b>" + escapeHtml(x.archive) + "</b>",
            { color: "#9fd6cf", paddingLeft: "16px", display: "flex", alignItems: "center", gap: "6px" });
        const kind = PREVIEW_KIND[f.folder];
        if (kind) {
            const eye = makeIconButton(VIOLET, EYE_ICON, "View the file found in Archives (new window)");
            Object.assign(eye.style, { width: "20px", height: "20px" });
            eye.addEventListener("click", () => {
                const file = joinDir(joinDir(joinDir(projectPath, f.folder), "Archives"), x.archive);
                preview.toggle(file, kind, f.folder + "/Archives/" + x.archive, card);
            });
            line.appendChild(eye);
        }
        wrap.appendChild(line);
        return wrap;
    }

    /** Bloc du workflow : fichier sauvegarde vs disque, puis remplace ou nouvel onglet. */
    function workflowHtml(wf) {
        if (!wf) return '<div style="color:#888">No project workflow in the configuration.</div>';
        if (!wf.source) {
            return '<div style="color:#d32f2f">The workflow file is missing and not in Archives: it cannot be loaded.</div>';
        }
        let html = "";
        if (dataGroup && dataOnly) {
            // Data only : le workflow de l'onglet reste ; meme structure -> cloche orange, sinon rouge.
            const name = escapeHtml(dataProject);
            if (wf.same) {
                return '<div style="color:' + GREEN + '">Data only, same structure: the files and the values of the ' +
                    "nodes of <b>" + name + "</b> come into this tab; the bell turns orange.</div>";
            }
            return '<div style="color:' + ORANGE + '">Data only: this tab keeps its workflow; the files and the ' +
                "values of the common nodes (same number and type) come from <b>" + name + "</b>. The bell turns " +
                '<b style="color:' + BELL_RED + '">red</b>. Saving with <b>Overwrite</b> will replace the saved ' +
                "workflow of <b>" + name + "</b>; to find it again, use the Archives.</div>" +
                (wf.diff ? structureHtml(wf.diff, "Only in the saved workflow", "Only in the current workflow") : "");
        }
        if (wf.changes && !wf.changes.same) {
            html += '<div style="color:#bbb">Saved workflow → file:</div>' +
                structureHtml(wf.changes, "In more since the save", "Missing since the save");
        }
        if (wf.same) {
            html += '<div style="color:' + GREEN + '">Same structure (nodes and links): the current workflow is replaced.</div>';
        } else {
            // Autre projet : nouvel onglet ; meme projet : l'onglet actuel le recoit (choix utilisateur, 22/10/2026).
            html += '<div style="color:' + ORANGE + '">' + (switching
                ? "Different structure: this tab keeps its project, the saved workflow opens in a new tab <b>" +
                    escapeHtml(String(wf.name).replace(/\.json$/i, "")) + "</b>."
                : "Different structure: the current workflow is replaced by the saved one.") + "</div>" +
                (wf.diff ? structureHtml(wf.diff, "Only in the saved workflow", "Only in the current workflow") : "");
        }
        return html;
    }

    let switching = false;
    let dataGroup = "";     // MultiProject commun : interrupteur Whole workflow | Data only
    let dataProject = "";
    let dataOnly = false;
    let wfEl = null;
    let lastReport = null;
    return {
        /** group = MultiProject commun au projet quitte et a celui-ci ("" : pas d'interrupteur). */
        open(report, projectPath, isSwitching, group, projectName) {
            switching = !!isSwitching;
            if (resolve) finish(null);
            dataGroup = group || "";
            dataProject = projectName || "";
            dataOnly = false;
            wfEl = null;
            lastReport = report;
            modePill.style.display = dataGroup ? "flex" : "none";
            paintMode();
            sub.textContent = "Saved on " + (report.datemodifi || "?") + (report.profile === "ltx2"
                ? " · " + PROFILE_LABELS.ltx2 : " · mode " + (report.mode || "?"));
            body.innerHTML = "";
            boxes = [];
            let promptWarn = null;
            for (const f of report.folders || []) {
                const block = div("", { padding: "4px 0", borderBottom: "1px solid #222" });
                const head = document.createElement("label");
                Object.assign(head.style, { display: "flex", alignItems: "center", gap: "6px" });
                const loadable = LOADABLE_FOLDERS.includes(f.folder);
                const box = document.createElement("input");
                box.type = "checkbox";
                Object.assign(box.style, { margin: "0", width: "14px", height: "14px", flex: "0 0 auto" });
                if (loadable) {
                    const wfLost = f.kind === "workflow" && !(report.workflow && report.workflow.source);
                    box.checked = !wfLost;
                    box.disabled = wfLost;
                    head.style.cursor = wfLost ? "default" : "pointer";
                } else {
                    box.style.visibility = "hidden";
                }
                const bad = f.files.filter((x) => x.status !== "ok").length;
                const info = FOLDER_INFO[f.folder];
                head.appendChild(box);
                head.insertAdjacentHTML("beforeend", iconBadge(FOLDER_ICONS[f.folder], FOLDER_COLORS[f.folder]) +
                    " <b>" + escapeHtml(f.folder) + '</b><span style="color:#888">' + f.count + " file(s)" +
                    (info ? " · " + info : "") + "</span>" +
                    (bad && !info ? '<span style="color:' + (f.kind === "prompt" ? ORANGE : "#d32f2f") + '">' +
                        bad + (f.kind === "prompt" ? " changed" : " to check") + "</span>" : ""));
                block.appendChild(head);
                if (!info) for (const x of f.files) block.appendChild(fileLine(f, x, projectPath));
                if (f.kind === "workflow") {
                    wfEl = div(workflowHtml(report.workflow), { paddingLeft: "26px" });
                    block.appendChild(wfEl);
                }
                if (f.kind === "prompt") {
                    promptWarn = div(MARK_WARN + " " + PROMPT_WARNING, { color: ORANGE, paddingLeft: "26px" });
                    block.appendChild(promptWarn);
                }
                body.appendChild(block);
                if (loadable) {
                    const entry = { folder: f.folder, box };
                    box.addEventListener("change", paintLoad);
                    boxes.push(entry);
                }
            }
            // Avertissement du prompt : seulement si le workflow sera charge.
            const wfBox = boxes.find((b) => b.folder === WORKFLOWS);
            if (wfBox && promptWarn) {
                const warn = promptWarn;
                wfBox.onChange = () => (warn.style.display = wfBox.box.checked && !wfBox.box.disabled ? "block" : "none");
            } else if (promptWarn) {
                promptWarn.style.display = "none";
            }
            paintLoad();
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            positionCardNextToNode(card, container, 560);
            return new Promise((r) => (resolve = r));
        },
        remove() {
            finish(null);
            preview.remove();
            overlay.remove();
        },
    };
}

// --------------------------------------------------------------------
// Nodes 2.0 : le widget cache "state" apparait comme une entree, on la masque.
// --------------------------------------------------------------------
function hideVueStateInput(node) {
    if (!vueMode()) return;
    const el = document.querySelector('[data-node-id="' + node.id + '"]');
    if (!el) return;
    (node.inputs || []).forEach((inp, i) => {
        if (inp.name !== "state") return;
        const dot = el.querySelector('[data-slot-key="' + node.id + "-in-" + i + '"]');
        const row = dot && dot.closest(".lg-slot");
        if (row && row.style.display !== "none") row.style.display = "none";
    });
}

const vueProjectNodes = new Set();
let vueTimer = null;
function scheduleVueHide() {
    if (vueTimer || !vueMode()) return;
    vueTimer = setTimeout(() => {
        vueTimer = null;
        vueProjectNodes.forEach(hideVueStateInput);
    }, 16);
}
let vueWatcher = null;
function watchVue() {
    if (vueWatcher) return;
    vueWatcher = new MutationObserver(() => {
        if (vueMode() && vueProjectNodes.size) scheduleVueHide();
    });
    vueWatcher.observe(document.body, { childList: true, subtree: true });
}

// --------------------------------------------------------------------
// Extension
// --------------------------------------------------------------------
app.registerExtension({
    name: "ComfyUI.MiniMaxH3Project",
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
            const getState = () => parseProjectState(stateWidget.value);
            // Fusion : les champs non donnes (dossier personnalise, workflow) sont gardes.
            const setState = (s) => {
                stateWidget.value = JSON.stringify(Object.assign(getState(), s));
            };

            // Dossier des projets actuel (donne par le serveur) et ses projets.
            // linked : Root folder du Reference Loader ; custom : dossier personnalise du noeud.
            let folder = { root: "", exists: true, linked: false, custom: false };
            let fallbackRoot = ""; // dossier de repli <input de ComfyUI>/Projets
            let projects = [];
            let anchorNotice = ""; // message de l'ancrage du Root folder, montre apres la relecture
            // Projets de la racine et dossiers de projets ([{name, projects: null | [noms]}], /mmproject/list).
            let tree = [];
            // Entree project obligatoire (choix utilisateur, 19/10/2026) : sans Reference Loader
            // relie, le noeud est grise ; un projet n'est "choisi" qu'avec ce lien.
            const wired = () => !!linkedLoader(node);
            const inProject = (name) => !!name && projects.includes(name) && wired();
            let message = "";   // erreur ou avertissement (orange), ou resultat (messageOk)
            let messageOk = false;
            // Workflow du projet : fichiers de 00.Workflows, workflow courant
            // ({name, mtime} ou null), son contenu et son empreinte.
            let wfInfo = { workflows: [], archives: [], current: null };
            let savedWf = null;
            let savedSig = null;
            let loadId = 0;
            // Fichiers a la racine des dossiers suivis du projet choisi : {dossier: [chemins]}.
            let folderFiles = {};
            // Fichiers de <dossier>/Archives des dossiers suivis : {dossier: [chemins]}.
            let archiveFiles = {};
            // Runs en cours de ce noeud (prompt_id) : Load et Save verrouilles.
            const runLock = new Set();
            // Runs enregistres (04.Prompt), le plus recent d'abord : boutons et fenetres 04 / 40 / 60.
            let runList = [];
            // Picture Lock (choix utilisateur, 22/10/2026) : un seul fichier dans un projet de
            // MultiProject (lu par /mmproject/runs) ; fichiers de Picture Lock par type.
            let singleLock = false;
            let lockedFiles = {};
            // Fichiers sur le disque par dossier de tri, fichiers deposes a la main (22/10/2026).
            let sortCounts = {};
            let orphanList = [];
            // Registres 02.Models / 06.LoRA : {models: [ensembles], lora: [ensembles]}.
            let registries = {};
            // Doublons de <dossier>/Archives : {dossier: [{sha, files}]} ; Corbeille disponible (Windows).
            let dupGroups = {};
            let trashOk = false;

            // ---- Interface ----
            const container = document.createElement("div");
            Object.assign(container.style, {
                display: "flex", flexDirection: "column", gap: "6px", padding: "6px 8px",
                boxSizing: "border-box", width: "100%", fontFamily: "sans-serif", fontSize: "12px",
            });

            // Ligne 1 : "Project name:", liste deroulante des projets, crayon
            // (renommer / deplacer), bouton Nouveau.
            const pickRow = document.createElement("div");
            Object.assign(pickRow.style, { display: "flex", gap: "6px", alignItems: "center", flex: "0 0 auto" });
            const nameLabel = document.createElement("span");
            nameLabel.textContent = "Project name:";
            Object.assign(nameLabel.style, { color: "#9fd6cf", fontWeight: "bold", whiteSpace: "nowrap", flex: "0 0 auto" });
            const select = document.createElement("select");
            Object.assign(select.style, {
                flex: "1", minWidth: "0", height: "26px", background: "#111", color: "#ddd",
                border: "1px solid #0c3833", borderRadius: "8px", padding: "2px 8px", fontSize: "12px",
                outline: "none", boxSizing: "border-box", cursor: "pointer",
            });
            select.title = "Project";
            const editBtn = makeIconButton(VIOLET, PENCIL_ICON, "Rename or move the project");
            editBtn.style.width = editBtn.style.height = "26px";
            const newBtn = makeIconButton(PINK, PLUS_ICON, "New project");
            newBtn.style.width = newBtn.style.height = "26px";
            pickRow.append(nameLabel, select, editBtn, newBtn);

            // Ligne du bas : messages (erreurs, resultat d'un Save), Save, Relire, aide.
            const bottom = document.createElement("div");
            Object.assign(bottom.style, { display: "flex", alignItems: "center", gap: "6px", flex: "0 0 auto" });
            const status = document.createElement("div");
            Object.assign(status.style, {
                flex: "1", minWidth: "0", fontSize: "11px", whiteSpace: "nowrap", overflow: "hidden",
                textOverflow: "ellipsis",
            });
            // Load et Save : configuration du projet (99.Project-Config).
            const smallText = (text) => {
                const b = makeTextButton(text, PINK);
                Object.assign(b.style, { height: "22px", padding: "0 10px", fontSize: "11px", flex: "0 0 auto" });
                return b;
            };
            const loadBtn = smallText("Load");
            const saveBtn = smallText("Save");
            // Purge (choix utilisateur, 19/10/2026) : Runs "running" orphelins supprimes, Runs en erreur -> 98.Error.
            const purgeBtn = smallText("Purge");
            // Copy et Reset (choix utilisateur, 19/10/2026), a gauche de Purge.
            const copyBtn = smallText("Copy");
            const resetBtn = smallText("Reset");
            const reloadBtn = makeIconButton(VIOLET, REFRESH_ICON, "Read the list of projects again");
            reloadBtn.style.width = reloadBtn.style.height = "22px";
            const helpBtn = document.createElement("button");
            helpBtn.type = "button";
            helpBtn.textContent = "?";
            Object.assign(helpBtn.style, {
                width: "22px", height: "22px", borderRadius: "50%", border: "none", background: PINK,
                color: "white", fontWeight: "bold", cursor: "pointer", padding: "0", flex: "0 0 auto",
            });
            bottom.append(status, copyBtn, resetBtn, purgeBtn, loadBtn, saveBtn, reloadBtn, helpBtn);

            // Une ligne par sous-dossier : bouton (pastille coloree + nom) et
            // petite cloche. Pas encore d'action : leur role viendra plus tard.
            const folderRows = PROJECT_SUBFOLDERS.map((name) => {
                const row = document.createElement("div");
                Object.assign(row.style, { display: "flex", gap: "6px", alignItems: "center", flex: "0 0 auto" });
                const btn = document.createElement("button");
                btn.type = "button";
                Object.assign(btn.style, {
                    flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "8px",
                    background: INACTIVE_BG, color: "#ddd", border: "1px solid #0c3833", borderRadius: "8px",
                    padding: "2px 8px 2px 3px", height: FOLDER_ROW_HEIGHT + "px", textAlign: "left", cursor: "default",
                });
                const icon = document.createElement("span");
                icon.innerHTML = FOLDER_ICONS[name];
                Object.assign(icon.style, {
                    display: "flex", alignItems: "center", justifyContent: "center", width: "22px", height: "22px",
                    borderRadius: "5px", background: FOLDER_COLORS[name], flex: "0 0 auto",
                });
                const label = document.createElement("span");
                label.textContent = name;
                Object.assign(label.style, {
                    fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                });
                const last = document.createElement("span");
                Object.assign(last.style, {
                    flex: "1", textAlign: "right", color: "#9fd6cf", fontSize: "10px", whiteSpace: "nowrap",
                    overflow: "hidden", textOverflow: "ellipsis",
                });
                btn.append(icon, label, last);
                const bell = makeIconButton(INACTIVE_BG, BELL_ICON, "");
                Object.assign(bell.style, { width: "22px", height: "22px", cursor: "default", opacity: "0.6" });
                // Cloches gardees sur 00.Workflows et 08.Images ... 14.Video-Audio (Update) ; ailleurs,
                // place gardee : tous les boutons ont la largeur et l'alignement de 00.Workflows
                // (choix utilisateur, 18/10/2026).
                if (name !== WORKFLOWS && !UPDATE_FOLDERS.includes(name)) bell.style.visibility = "hidden";
                // 00.Workflows : bouton des archives a droite de la cloche ; ailleurs, un espace.
                // 08.Images ... 14.Video-Audio : bouton des doublons d'Archives (visible s'il y en a).
                const arch = name === WORKFLOWS ? makeIconButton(INACTIVE_BG, ARCHIVE_ICON, "")
                    : UPDATE_FOLDERS.includes(name) ? makeIconButton(BELL_ORANGE, DUP_ICON, "") : document.createElement("span");
                if (UPDATE_FOLDERS.includes(name)) arch.style.visibility = "hidden";
                Object.assign(arch.style, { width: "22px", height: "22px", flex: "0 0 auto" });
                // Place du sigle d'avertissement sur toutes les lignes (boutons alignes) ;
                // seul 00.Workflows l'affiche, quand le workflow a change sans etre sauvegarde.
                const warn = document.createElement("span");
                if (name === WORKFLOWS || UPDATE_FOLDERS.includes(name)) warn.innerHTML = WARN_ICON;
                Object.assign(warn.style, {
                    width: WARN_WIDTH + "px", height: "22px", flex: "0 0 auto", display: "flex", alignItems: "center",
                    justifyContent: "center", visibility: "hidden", cursor: "help",
                });
                row.append(warn, btn, bell, arch);
                return { name, row, btn, bell, arch, last, warn };
            });

            container.append(pickRow, ...folderRows.map((f) => f.row), bottom);

            const createDialog = buildCreateDialog(container, {
                create: createProject,
                check: (path) => apiGet("/mmproject/list?root=" + encodeURIComponent(path)),
            });
            const help = buildHelpOverlay(container, {
                sectionsFor: projectHelpSections, nodeTitle: "MagicStudio Project", sectionKey: "mmproject.helpSection",
            });
            const confirm = buildConfirm(container);
            const resetDialog = buildResetDialog(container);
            const copyDialog = buildCopyDialog(container);
            const renameDialog = buildRenameMoveDialog(container, { confirm, apply: applyRenameMove });
            const workflowDialog = buildWorkflowDialog(container);
            const archiveMenu = buildArchiveMenu(container);
            const deleteDialog = buildDeleteArchivesDialog(container);
            const loadDialog = buildLoadDialog(container);
            const duplicatesDialog = buildDuplicatesDialog(container);
            const folderViewer = buildFolderViewer(container);
            // Lots de 40 / 60 (choix utilisateur, 20/10/2026) : deplacement sans confirmation,
            // suppression de No Good avec Corbeille ou definitive (mot CONFIRMER a taper).
            const rushDeleteChoice = buildDeleteChoice();
            const rushOps = {
                move: (run, out, key, swap) => apiPost("/mmproject/sort_output",
                    { project: getState().path, run: run.file, index: out.index, target: key, swap: !!swap }),
                singleLock: () => singleLock,
                counts: (kind, key) => (sortCounts[kind] ? sortCounts[kind][key] : null),
                orphanCount: (kind, key) => orphanList.filter((o) => o.kind === kind && o.place === key).length,
                lockSwap: (out, key) => lockSwap(out, key),
                lockWarning: (kind) => {
                    const n = (lockedFiles[kind] || []).length;
                    return singleLock && n > 1 ? RUSH_FOLDER_OF[kind] + "/Picture Lock holds " + n + " files: only one " +
                        "is allowed in a project of a MultiProject. Move the others out by hand." : "";
                },
                remove: (run, out, trash) => apiPost("/mmproject/delete_rush",
                    { project: getState().path, run: run.file, index: out.index, trash }),
                async reload() {
                    await loadRuns(getState());
                    paintFolders();
                    return runList;
                },
                askDelete: (names, anchor, below) => rushDeleteChoice.ask(names, /Windows/i.test(navigator.userAgent), anchor, {
                    below,
                    title: "Delete " + names.length + " file(s) of No Good?",
                    note: "Files moved to the Recycle Bin can be restored from it; <b>Delete permanently</b> cannot be " +
                        "undone. The runs keep a <b>deleted</b> mark.",
                }),
                askWord: (n, below) => resetDialog.ask({
                    name: "CONFIRMER", below, title: "Delete " + n + " file(s) permanently?", okLabel: "Delete permanently",
                    html: '<span style="color:#e53935;font-weight:bold">These files will be destroyed: this cannot be undone.</span>',
                }),
            };
            const runViewer = buildRunViewer(container, (run, out, key) => sortOutput(run, out, key), (run) => openRunWorkflow(run), rushOps);
            const setViewer = buildSetViewer(container, (run, out, key) => sortOutput(run, out, key), (run) => openRunWorkflow(run), rushOps);
            node.__mmprojectOverlays = [createDialog, help, confirm, resetDialog, copyDialog, renameDialog, workflowDialog, archiveMenu, deleteDialog,
                loadDialog, duplicatesDialog, folderViewer, runViewer, setViewer, rushDeleteChoice];
            const wfRow = folderRows.find((f) => f.name === WORKFLOWS);

            /**
             * Dossier des projets : Root folder du Reference Loader branche, sinon ""
             * (dossier de repli). Le dossier personnalise du noeud n'est plus lu :
             * l'entree project est obligatoire (choix utilisateur, 19/10/2026).
             */
            function requestedRoot() {
                const loader = linkedLoader(node);
                const root = loader ? loader.mmRootFolder() : "";
                return root ? { root, linked: true, custom: false } : { root: "", linked: false, custom: false };
            }

            function render() {
                const s = getState();
                select.innerHTML = "";
                const add = (value, text, color) => {
                    const o = document.createElement("option");
                    o.value = value;
                    o.textContent = text;
                    o.style.background = "#111";
                    if (color) o.style.color = color;
                    select.appendChild(o);
                };
                add("", "(no project)", "#888");
                // Dossier de projets : titre de groupe (non choisissable), ses projets en dessous.
                for (const e of tree) {
                    if (!e.projects) {
                        add(e.name, e.name);
                        continue;
                    }
                    const g = document.createElement("optgroup");
                    g.label = e.name;
                    Object.assign(g.style, { background: "#111", color: "#9fd6cf" });
                    for (const p of e.projects) {
                        const o = document.createElement("option");
                        o.value = e.name + GROUP_SEP + p;
                        o.textContent = p;
                        Object.assign(o.style, { background: "#111", color: "#ddd" });
                        g.appendChild(o);
                    }
                    select.appendChild(g);
                }
                const current = inProject(s.name);
                if (s.name && !current) add(s.name, s.name + " (not in this folder)", ORANGE);
                select.value = s.name;
                select.style.color = current ? "#ddd" : s.name ? ORANGE : "#888";
                select.disabled = !wired();
                select.style.opacity = wired() ? "1" : "0.45";
                select.title = wired() ? "" : WIRE_PROJECT;

                // Lignes des dossiers : grisees sans projet choisi ; infobulle = chemin.
                const sep = s.path.includes("\\") ? "\\" : "/";
                folderRows.forEach((f) => {
                    const path = current ? s.path + sep + f.name : "";
                    f.row.style.opacity = current ? "1" : "0.45";
                    const viewable = current && (UPDATE_FOLDERS.includes(f.name) || f.name in RUN_FOLDERS ||
                        f.name in REGISTRY_FOLDERS);
                    f.btn.title = viewable ? (f.name in RUN_FOLDERS ? "Show the runs of " : f.name in REGISTRY_FOLDERS
                        ? "Show the sets and their prompts of " : "Show the files of ") + f.name + " (" + path + ")"
                        : current ? path : "Pick or create a project first";
                    f.btn.style.cursor = viewable ? "pointer" : "default";
                    f.btn.disabled = !viewable;
                    if (!wired()) f.btn.title = WIRE_PROJECT;
                });
                renderWorkflow();
                paintFolders();

                // Bas du noeud : seulement les messages (plus de chemin).
                let text = message;
                let tip = message;
                if (!wired()) {
                    text = WIRE_PROJECT;
                    tip = WIRE_PROJECT;
                } else if (!text && !folder.exists) {
                    text = "Projects folder not found (created with the first project)";
                    tip = folder.root;
                }
                status.textContent = text;
                status.style.color = wired() && message && messageOk ? "#9fd6cf" : ORANGE;
                status.title = tip;

                // Crayon : un projet choisi ; Save : un projet et un Reference Loader relie.
                // Load et Save verrouilles pendant un Run de ce noeud (choix utilisateur).
                const locked = runLock.size > 0;
                const LOCKED = "Run in progress: Load and Save are locked";
                const canSave = current && !!linkedLoader(node);
                setOn(editBtn, current, VIOLET, current ? "Rename or move the project" : !wired() ? WIRE_PROJECT
                    : "Pick a project first");
                setOn(newBtn, wired(), PINK, wired() ? "New project" : WIRE_PROJECT);
                setOn(saveBtn, canSave && !locked, PINK, !current ? "Pick a project first"
                    : !canSave ? "Wire the project output of the MagicStudio RefLoader first" : locked ? LOCKED
                        : "Save: copy the files of the MagicStudio RefLoader into the project, save the workflow and " +
                        "the configuration of the project (" + configPathOf(s.name) + ")");
                setOn(loadBtn, current && !locked, PINK, !current ? "Pick a project first" : locked ? LOCKED
                    : "Load: check the files, then load the saved configuration of the project (" + configPathOf(s.name) + ")");
                setOn(copyBtn, current && !locked, COPY_BLUE, !current ? "Pick a project first" : locked ? LOCKED
                    : "Copy: copy the files of 08.Images to 14.Video-Audio (and their Archives) from another project");
                setOn(resetBtn, current && !locked, RESET_RED, !current ? "Pick a project first" : locked ? LOCKED
                    : "Reset: every file of the project goes to the Recycle Bin, and the MagicStudio RefLoader is emptied");
                setOn(purgeBtn, current, PURGE_RED, current ? "Purge: delete the runs still marked running while no " +
                    "run is in progress, move the runs in error to 98.Error" : "Pick a project first");
                syncModelsLink();
            }

            /** Lien arrivant sur l'entree 'slot' de n (lien du graphe), null sinon. */
            function linkInto(n, slot) {
                const g = n && n.graph;
                if (!g || slot < 0 || !n.inputs || !n.inputs[slot]) return null;
                if (typeof n.getInputLink === "function") return n.getInputLink(slot) || null;
                const id = n.inputs[slot].link;
                return id == null ? null : (typeof g.links.get === "function" ? g.links.get(id) : g.links[id]) || null;
            }


            /**
             * MultiFiles Select relie a l'entree models_link, null sinon : en traversant
             * Get / Set (le Set du meme nom : findSetter de KJNodes / Easy-Use, sinon un
             * noeud "Set" de meme nom dans le graphe) et les anciens noeuds Reroute.
             */
            function linkedFileSelect() {
                const slot = (node.inputs || []).findIndex((i) => i.name === MODELS_LINK);
                let link = slot >= 0 ? linkInto(node, slot) : null;
                let src = link ? node.graph.getNodeById(link.origin_id) : null;
                for (let hop = 0; src && hop < 10; hop++) {
                    if (src.type === FILE_SELECT_TYPE) return src;
                    // Switch MultiIN-OUT : entree du groupe actif sur la ligne de la sortie suivie.
                    if (src.type === "SwitchMultiInOut") {
                        link = linkInto(src, switchSourceInput(src, link ? link.origin_slot : 0));
                        src = link ? src.graph.getNodeById(link.origin_id) : null;
                        continue;
                    }
                    const type = String(src.type || "");
                    if (/get/i.test(type) && typeof src.getInputLink === "function") {
                        // Get Pixaroma / KJNodes : le Get donne lui-meme le lien de la source
                        // (Pixaroma lit la premiere entree branchee du Set, pas toujours la 0).
                        const from = src;
                        link = from.getInputLink(0) || null;
                        src = link ? from.graph.getNodeById(link.origin_id) : null;
                    } else if (/get/i.test(type) && src.widgets && src.widgets[0]) {
                        const name = src.widgets[0].value;
                        let setter = typeof src.findSetter === "function" ? src.findSetter(src.graph) : null;
                        if (setter && setter.node) setter = setter.node;
                        if (!setter && src.graph) {
                            setter = (src.graph._nodes || []).find((n) => /set/i.test(String(n.type || "")) &&
                                n.widgets && n.widgets[0] && n.widgets[0].value === name) || null;
                        }
                        link = setter ? linkInto(setter, 0) : null;
                        src = link ? setter.graph.getNodeById(link.origin_id) : null;
                    } else if (src.isVirtualNode || /reroute/i.test(type)) {
                        const from = src;
                        link = linkInto(from, 0);
                        src = link ? from.graph.getNodeById(link.origin_id) : null;
                    } else {
                        return null;
                    }
                }
                return null;
            }

            /**
             * Dossier de sauvegarde de MultiFiles Select relie (choix utilisateur) : vide =
             * <projet>/02.Models ; rempli ainsi, il suit le projet ; un dossier choisi a la
             * main n'est jamais remplace ; rien ne change au debranchement.
             */
            function syncModelsLink() {
                const s = getState();
                if (!inProject(s.name)) return;
                const fs = linkedFileSelect();
                if (!fs) return;
                const sep = s.path.includes("\\") ? "\\" : "/";
                const target = s.path + sep + "02.Models";
                fs.properties = fs.properties || {};
                const cur = String(fs.properties.saveFolder || "").trim();
                const auto = String(fs.properties.mmAutoSaveFolder || "");
                if (cur === target || (cur && cur !== auto)) return;
                fs.properties.saveFolder = target;
                fs.properties.mmAutoSaveFolder = target;
                const w = (fs.widgets || []).find((x) => x.name === "save_folder");
                if (w) w.value = target;
                if (fs.graph && fs.graph.setDirtyCanvas) fs.graph.setDirtyCanvas(true, true);
            }

            function setOn(btn, on, color, title) {
                btn.disabled = !on;
                btn.style.background = on ? color : INACTIVE_BG;
                btn.style.opacity = on ? "1" : "0.45";
                btn.style.cursor = on ? "pointer" : "default";
                btn.title = title;
            }

            function say(text, ok) {
                message = text;
                messageOk = !!ok;
                render();
            }

            /** Relit le dossier des projets (Root folder du Ref Loader ou dossier par defaut). */
            async function loadProjects() {
                const id = ++loadId;
                const req = requestedRoot();
                try {
                    const data = await apiGet("/mmproject/list?root=" + encodeURIComponent(req.root));
                    if (id !== loadId) return;
                    folder = { root: data.root || "", exists: data.exists !== false, linked: req.linked, custom: req.custom };
                    fallbackRoot = data.default_root || fallbackRoot;
                    projects = data.projects || [];
                    tree = data.tree || projects.map((name) => ({ name, projects: null }));
                    message = anchorNotice;
                    anchorNotice = "";
                    // Root folder sur un projet ou un dossier de projets : ancre sur le dossier mere
                    // (choix utilisateur, 22/10/2026) ; le projet ouvert garde son dossier, son nom
                    // suit, et le Reference Loader recoit le nouveau Root folder (liste relue).
                    const loader = linkedLoader(node);
                    if (data.anchored && req.linked && loader && typeof loader.mmAnchorRoot === "function") {
                        const s = getState();
                        const name = s.path ? projectNameOfPath(data.root, projects, s.path) : "";
                        if (name) setState({ root: data.root, name, path: s.path });
                        anchorNotice = "Root folder set to " + data.root + ", the parent folder of " +
                            data.anchored.split("/").pop() + " (a project or a folder of projects is never the Root folder).";
                        loader.mmAnchorRoot(data.root, data.anchored);
                        return;
                    }
                } catch (e) {
                    if (id !== loadId) return;
                    folder = { root: req.root, exists: false, linked: req.linked, custom: req.custom };
                    projects = [];
                    tree = [];
                    message = e.message;
                }
                const s = getState();
                // Le projet choisi est dans ce dossier : on recree ses sous-dossiers manquants.
                if (inProject(s.name)) await openProject(s.name, true);
                else render();
            }

            /** Choisit un projet du dossier ; sous-dossiers manquants recrees. */
            async function openProject(name, quiet) {
                if (!name) {
                    setState({ root: folder.root, name: "", path: "" });
                    loadWorkflowInfo();
                    loadFolderFiles();
                    message = "";
                    render();
                    return;
                }
                try {
                    const data = await apiPost("/mmproject/open", { root: folder.root, name });
                    setState({ root: folder.root, name, path: data.path });
                    loadWorkflowInfo();
                    loadFolderFiles();
                    if (!quiet) message = "";
                } catch (e) {
                    message = e.message;
                }
                render();
            }

            /**
             * Appele par la fenetre "New project" (dossier cree s'il manque, la
             * fenetre l'a signale) ; une erreur reste affichee dans la fenetre.
             * Dossier choisi sans Root folder : memorise dans le Reference Loader
             * branche (sa roue), sinon dans le noeud ; le dossier de repli ne
             * se memorise pas.
             */
            async function createProject(name, root, group, newGroup) {
                const data = await apiPost("/mmproject/create",
                    { root, name, create_root: true, group: group || null, new_group: !!newGroup });
                const custom = folder.linked || samePath(data.root, fallbackRoot) ? "" : data.root;
                const loader = linkedLoader(node);
                if (!folder.linked && loader && custom) {
                    setState({ root: data.root, name: data.name, path: data.path, folder: "" });
                    loader.mmSetRootFolder(custom); // previent ensuite ce noeud (liste relue)
                } else {
                    setState({ root: data.root, name: data.name, path: data.path, folder: folder.linked ? getState().folder : custom });
                }
                await loadProjects();
                // Proposee apres la fermeture de la fenetre de creation.
                // puis le workflow est sauvegarde (cloche orange).
                setTimeout(async () => {
                    const r = await saveAll(true);
                    await saveWorkflowDirect();
                    if (r !== "cancel" && r !== "error") await saveProjectConfig();
                }, 0);
            }

            /**
             * Save : copie les fichiers du Reference Loader dans les dossiers du
             * projet, puis le Reference Loader pointe sur les copies (la
             * configuration du projet est ecrite ensuite par saveProjectConfig).
             * first = premiere sauvegarde proposee juste apres la creation du projet.
             */
            async function saveAll(first) {
                const loader = linkedLoader(node);
                const s = getState();
                if (!loader || !s.name) return "error";
                const refState = loader.mmGetState();
                const items = saveItems(refState);
                if (!items.length) {
                    if (!first) say("Nothing to save: the MagicStudio RefLoader has no reference.");
                    return "none";
                }
                let plan;
                try {
                    plan = (await apiPost("/mmproject/save_plan", { project: s.path, items })).plan;
                } catch (e) {
                    say(e.message);
                    return "error";
                }
                const count = (a) => plan.filter((x) => x.action === a).length;
                const byFolder = {};
                plan.filter((x) => x.action === "copy").forEach((x) => (byFolder[x.folder] = (byFolder[x.folder] || 0) + 1));
                const lines = Object.entries(byFolder).map(([f, n]) => n + " → <b>" + f + "</b>");
                const html = (first
                    ? "<b>All the files of the MagicStudio RefLoader will be copied to their folders in the project.</b><br>"
                    : "") +
                    count("copy") + " file(s) to copy" + (lines.length ? ":<br>" + lines.join("<br>") : "") +
                    (count("skip") ? "<br>" + count("skip") + " already in the project" : "") +
                    (count("missing") ? '<br><span style="color:' + ORANGE + '">' + count("missing") +
                        " missing on disk (not copied)</span>" : "") +
                    "<br>Then the workflow, and the configuration of the project in <b>" + escapeHtml(configPathOf(s.name)) + "</b> (the " +
                    "previous one goes to its Archives)." +
                    '<div style="color:#999;margin-top:8px">Then the MagicStudio RefLoader uses the copies of the project.</div>';
                const ok = await confirm.ask({
                    title: first ? "Initialize a first save?" : "Save the project?", html,
                    okLabel: first ? "Copy and save" : "Save", okColor: PINK,
                });
                if (!ok) return "cancel";
                say("Saving...", true);
                try {
                    const data = await apiPost("/mmproject/save", { project: s.path, items, configs: [] });
                    // Le Reference Loader a pu changer pendant la confirmation : on repart de son etat.
                    const latest = loader.mmGetState();
                    const same = JSON.stringify(saveItems(latest)) === JSON.stringify(items);
                    if (same) loader.mmSetState(remapState(latest, mapBySequence(data.dsts, latest)));
                    setState({ snap: folderSnapshot(loader.mmGetState()), snapPath: getState().path });
                    paintFolders();
                    say("Saved: " + count("copy") + " file(s) copied.", true);
                    loadFolderFiles();
                    return "saved";
                } catch (e) {
                    say(e.message);
                    return "error";
                }
            }

            // ---- Workflow du projet (00.Workflows) ----

            /** Workflow actuel de ComfyUI (objet JSON). */
            function currentWorkflow() {
                return JSON.parse(JSON.stringify(app.graph.serialize()));
            }

            /**
             * Pour comparer : sans les valeurs des noeuds Projet (leur etat change
             * quand on sauvegarde, ce n'est pas un changement du workflow).
             */
            function forCompare(wf) {
                if (!wf || !Array.isArray(wf.nodes)) return wf;
                const copy = Object.assign({}, wf);
                copy.nodes = wf.nodes.map((n) => {
                    if (n && n.type === NODE_NAME) return Object.assign({}, n, { widgets_values: [] });
                    // Contenu des listes du Ref Loader : suivi par les cloches des dossiers (choix utilisateur).
                    if (n && n.type === REF_LOADER_NAME && Array.isArray(n.widgets_values)) {
                        try {
                            const st = withoutMedia(JSON.parse(n.widgets_values[0] || "{}"));
                            return Object.assign({}, n, { widgets_values: [JSON.stringify(st)].concat(n.widgets_values.slice(1)) });
                        } catch (e) {
                            return n;
                        }
                    }
                    return n;
                });
                return copy;
            }

            /** Noms des widgets par noeud (libelles des changements). */
            function widgetNames() {
                const out = {};
                for (const n of app.graph._nodes || []) out[String(n.id)] = (n.widgets || []).map((w) => w.name);
                return out;
            }

            /**
             * gris = jamais sauvegarde ; orange = changements (ou pas encore valide) ; vert = a jour.
             * wf = workflow deja serialise (evenement graphChanged), sinon il est lu.
             */
            function bellState(wf) {
                const s = getState();
                if (!wfInfo.current || !s.name) return "none";
                // Data only avec une autre structure : rouge jusqu'a la sauvegarde du workflow.
                if (s.wfRed && s.wfRed === s.path) return "red";
                if (!(s.wfValidated && s.wfPath === s.path)) return "orange";
                return workflowChanged(wf) ? "orange" : "green";
            }

            /** Nœuds, liens ou valeurs differents du workflow sauvegarde (la disposition ne compte pas). */
            function workflowChanged(wf) {
                if (!wfInfo.current || savedSig === null) return false;
                return workflowSignature(forCompare(wf || currentWorkflow())) !== savedSig;
            }

            function paintBell(wf) {
                const s = getState();
                const current = inProject(s.name);
                if (current && wfInfo.current && !wf) wf = currentWorkflow();
                const st = current ? bellState(wf) : "none";
                // Sigle a gauche du bouton : modifie mais pas encore sauvegarde.
                const changed = current && workflowChanged(wf);
                wfRow.warn.style.visibility = changed ? "visible" : "hidden";
                wfRow.warn.title = changed ? "The workflow has changed since the last save and is not saved yet" : "";
                const b = wfRow.bell;
                b.style.background = st === "red" ? BELL_RED : st === "orange" ? BELL_ORANGE
                    : st === "green" ? BELL_GREEN : INACTIVE_BG;
                b.style.opacity = current ? "1" : "0.6";
                b.style.cursor = current ? "pointer" : "default";
                b.title = !current ? "" : st === "none" ? "Workflow never saved: click to save it"
                    : st === "red" ? "Data only: this tab keeps another workflow; save the workflow of " +
                        shortName(s.name)
                    : st === "green" ? "Workflow saved, no change since the last save"
                        : "Changes to save: click to compare and save the workflow";
            }

            // ---- Dossiers suivis (08.Images, 10.Son, 12.Video, 14.Video-Audio) ----

            /** Instantane du dossier a la derniere mise a jour (null si aucun pour ce projet). */
            function snapshotOf(s, f) {
                return s.snapPath === s.path && Array.isArray(s.snap[f]) ? s.snap[f] : null;
            }

            /** Relit les fichiers des dossiers suivis du projet choisi, puis les cloches. */
            async function loadFolderFiles() {
                const s = getState();
                if (!inProject(s.name)) {
                    folderFiles = {};
                    archiveFiles = {};
                    runList = [];
                    paintFolders();
                    return;
                }
                await loadRuns(s);
                try {
                    const data = await apiGet("/mmproject/folder_files?project=" + encodeURIComponent(s.path) +
                        "&folders=" + encodeURIComponent(UPDATE_FOLDERS.join("|")) + "&archives=1");
                    if (getState().path === s.path) {
                        folderFiles = data.files || {};
                        archiveFiles = data.archives || {};
                    }
                } catch (e) {
                    folderFiles = {};
                    archiveFiles = {};
                }
                try {
                    const data = await apiGet("/mmproject/archive_duplicates?project=" + encodeURIComponent(s.path) +
                        "&folders=" + encodeURIComponent(UPDATE_FOLDERS.join("|")));
                    if (getState().path === s.path) {
                        dupGroups = data.duplicates || {};
                        trashOk = !!data.trash;
                    }
                } catch (e) {
                    dupGroups = {};
                }
                paintFolders();
            }

            /** Runs enregistres du projet (boutons 04 / 40 / 60). */
            /**
             * Noeuds MagicStudio Final Cut du graphe : ils relisent leur plan (chacun remonte
             * lui-meme jusqu'a son noeud Project, directement ou par Get / Set et Reroute).
             */
            function notifyFinalCut() {
                for (const t of (node.graph && node.graph._nodes) || []) {
                    if (t && typeof t.mmFinalCutRefresh === "function") t.mmFinalCutRefresh();
                }
            }

            async function loadRuns(s) {
                setTimeout(notifyFinalCut, 0);
                try {
                    const data = await apiGet("/mmproject/runs?project=" + encodeURIComponent(s.path));
                    if (getState().path === s.path) {
                        runList = data.runs || [];
                        registries = data.registries || {};
                        singleLock = !!data.single_lock;
                        lockedFiles = data.locked || {};
                        sortCounts = data.counts || {};
                        orphanList = data.orphans || [];
                    }
                } catch (e) {
                    runList = [];
                    registries = {};
                    singleLock = false;
                    lockedFiles = {};
                    sortCounts = {};
                    orphanList = [];
                }
            }

            /** Fenetre des boutons 02.Models / 06.LoRA, relue a chaque ouverture. */
            async function showSets(f) {
                const s = getState();
                if (!inProject(s.name)) return;
                await loadRuns(s);
                paintFolders();
                setViewer.open(f, shortName(s.name), runList, registries);
            }

            /**
             * Nouvel onglet temporaire (rien d'ecrit) : onglet vide, workflow charge dedans, puis
             * renomme. loadGraphData(workflow, ..., "nom") echoue sur certains workflows (MiniMaxH3Easy :
             * proprietes que le frontend ne sait plus copier) et charge alors dans l'onglet courant.
             */
            async function openInNewTab(workflow, name) {
                const ext = app.extensionManager;
                const wm = ext && ext.workflow;
                if (!wm || !ext.command) {
                    await app.loadGraphData(workflow, true, true, name);
                    return;
                }
                await ext.command.execute("Comfy.NewBlankWorkflow");
                const tab = wm.activeWorkflow;
                await app.loadGraphData(workflow, true, true, tab);
                try {
                    await wm.renameWorkflow(tab, tab.directory + "/" + name + ".json");
                } catch (e) {
                    // Nom deja pris par un onglet ouvert : nom par defaut garde.
                }
            }

            /**
             * Workflow dans un nouvel onglet SANS y basculer (choix utilisateur, 22/10/2026) ;
             * renvoie {name, open()} (open() bascule dessus), null si ComfyUI ne le permet pas.
             */
            function openInBackground(workflow, name) {
                const wm = app.extensionManager && app.extensionManager.workflow;
                if (!wm || typeof wm.createTemporary !== "function" || typeof wm.openWorkflowsInBackground !== "function") {
                    return null;
                }
                let tab;
                try {
                    tab = wm.createTemporary(name + ".json", workflow);
                } catch (e) {
                    return null;
                }
                wm.openWorkflowsInBackground({ right: [tab.path] });
                // Nom deja pris par un onglet ouvert : ComfyUI en donne un autre ("name (2)").
                const tabName = String(tab.path || name).split("/").pop().replace(/\.json$/i, "");
                return { name: tabName, open: () => app.loadGraphData(workflow, true, true, tab) };
            }

            /** Workflow d'un Run dans un nouvel onglet (nom du JSON du Run) ; {ok, text}. */
            async function openRunWorkflow(run) {
                const s = getState();
                try {
                    const data = await apiGet("/mmproject/run_workflow?project=" + encodeURIComponent(s.path) +
                        "&name=" + encodeURIComponent(run.file));
                    await openInNewTab(data.workflow, runTabName(run.file));
                    return { ok: true };
                } catch (e) {
                    return { ok: false, text: e.message };
                }
            }

            /**
             * Picture Lock d'un projet de MultiProject (choix utilisateur, 22/10/2026) : un
             * seul fichier ; occupe -> echange confirme (l'ancien part dans le dossier du
             * nouveau, Rough Cut s'il vient d'ailleurs). {swap} ou null (annule, plusieurs fichiers).
             */
            async function lockSwap(out, key) {
                if (key !== "picture_lock" || !singleLock) return { swap: false };
                const held = lockedFiles[out.kind] || [];
                if (!held.length) return { swap: false };
                const where = RUSH_FOLDER_OF[out.kind] + "/";
                if (held.length > 1) {
                    await confirm.ask({
                        title: "Picture Lock holds " + held.length + " files",
                        html: "In a project of a MultiProject, " + where + "Picture Lock keeps only one file. Move the " +
                            "others out by hand first.",
                        okLabel: "OK", okColor: INACTIVE_BG, noCancel: true,
                    });
                    return null;
                }
                const name = baseOf(outputFile(out) || out.source || "");
                const inside = out.in_project && ["validated", "footage", "rejected"].includes(out.place);
                const back = inside ? out.place : "validated";
                const ok = await confirm.ask({
                    title: "Swap with the Picture Lock file?",
                    html: "<b>" + escapeHtml(name) + "</b> replaces <b>" + escapeHtml(held[0]) + "</b> in " + where +
                        "Picture Lock;<br><b>" + escapeHtml(held[0]) + "</b> goes to <b>" + where + SORT_NAME[back] + "</b> " +
                        '<span style="color:#999">(' + (inside ? "the folder of " + escapeHtml(name)
                            : "the new file comes from outside the project") + ").</span>" +
                        '<br><span style="color:#999">A project of a MultiProject keeps one file in Picture Lock.</span>',
                    okLabel: "Swap", okColor: SORT_COLORS.picture_lock,
                });
                return ok ? { swap: true } : null;
            }

            /**
             * Tri d'une sortie dans Picture Lock / Rough Cut / Footage / No Good de 40 / 60
             * (choix utilisateur, 19/10/2026). Fichier deja dans le projet : renommage direct.
             * Original hors du projet : confirmation, puis copie + SHA256 + suppression
             * cote serveur. En cas d'erreur Retry / Abandon, abandon apres 3 echecs.
             */
            async function sortOutput(run, out, key) {
                const s = getState();
                const dest = (out.kind === "video" ? "40.Rush Videos/" : "60.Rush Images/") +
                    SORT_FOLDERS.find((x) => x[0] === key)[2];
                const lock = await lockSwap(out, key);
                if (!lock) return null;
                if (out.source_exists && !out.in_project) {
                    const ok = await confirm.ask({
                        title: "Move the original to " + dest + "?",
                        html: escapeHtml(out.source) + '<br><span style="color:#888">→</span> <b style="color:#9fd6cf">' +
                            dest + "</b>" + (out.kind === "video" && out.copy_exists ? '<br><span style="color:#999">It ' +
                            "replaces the copy " + escapeHtml(baseOf(out.copy)) + " (only one version is kept).</span>" : "") +
                            '<br><span style="color:#999">Copy, SHA256 check, then the original is deleted.</span>',
                        okLabel: "Move", okColor: SORT_COLORS[key],
                    });
                    if (!ok) return null;
                }
                for (let attempt = 1; ; attempt++) {
                    try {
                        const data = await apiPost("/mmproject/sort_output",
                            { project: s.path, run: run.file, index: out.index, target: key, swap: lock.swap });
                        await loadRuns(s);
                        paintFolders();
                        const name = baseOf(data.copy || data.source || "");
                        const text = "File moved to " + dest + ": " + name + (data.swapped ? " – " +
                            baseOf(data.swapped.file) + " went to " + SORT_NAME[data.swapped.place] : "");
                        say(text, true);
                        return { runs: runList, text, ok: true };
                    } catch (e) {
                        if (attempt >= 3) {
                            await confirm.ask({
                                title: "Move abandoned",
                                html: escapeHtml(e.message) + "<br>3 attempts failed: the original stays in place.",
                                okLabel: "OK", okColor: INACTIVE_BG, noCancel: true,
                            });
                            return { runs: runList, text: "Move abandoned after 3 attempts: " + e.message, ok: false };
                        }
                        const retry = await confirm.ask({
                            title: "Move failed (attempt " + attempt + "/3)",
                            html: escapeHtml(e.message) + "<br>The original is untouched.",
                            okLabel: "Retry", okColor: DOT_ORANGE, cancelLabel: "Abandon",
                        });
                        if (!retry) return { runs: runList, text: "Move abandoned: the original stays in place.", ok: false };
                    }
                }
            }

            /** Fenetre des Runs (04 / 40 / 60), relue a chaque ouverture. */
            async function showRuns(f) {
                const s = getState();
                if (!inProject(s.name)) return;
                await loadRuns(s);
                const message = f === "40.Rush Videos" || f === "60.Rush Images" ? await resolveDuplicates(s, f) : null;
                paintFolders();
                runViewer.open(f, shortName(s.name), runList, message);
            }

            /**
             * Fichier depose a la main dans un dossier de tri de 40 / 60, identique (SHA256)
             * au fichier d'un Run range ailleurs (choix utilisateur, 22/10/2026) : garder l'un
             * des deux, l'autre va dans la Corbeille (le Run suit celui qu'on garde) ; Cancel :
             * rien ne change, la question revient a la prochaine ouverture. Erreur (fichier en
             * cours d'utilisation...) : fenetre visible avec Retry (avant : ligne d'etat cachee
             * par la fenetre 40 / 60). Renvoie {text, ok} pour la fenetre des Runs, ou null.
             */
            async function resolveDuplicates(s, f) {
                const kind = f === "40.Rush Videos" ? "video" : "image";
                const dups = orphanList.filter((o) => o.kind === kind && o.dup);
                if (!dups.length) return null;
                const done = [];
                let failedCount = 0;
                for (const o of dups) {
                    const mine = SORT_NAME[o.place];
                    const other = SORT_NAME[o.dup.place] || "the root of " + f;
                    const answer = await confirm.ask({
                        title: "Duplicate in " + f,
                        html: "<b>" + escapeHtml(baseOf(o.path)) + "</b> is in <b>" + mine + "</b> and <b>" +
                            escapeHtml(baseOf(o.dup.path)) + "</b> in <b>" + other + "</b>: the same file (SHA256)." +
                            '<br><span style="color:#999">The one in ' + mine + " was put there by hand: no run " +
                            "links to it. Keep one; the other goes to the Recycle Bin and the run follows the one " +
                            "kept.</span>",
                        okLabel: "Keep " + mine, okColor: SORT_COLORS[o.place],
                        altLabel: "Keep " + other, altColor: SORT_COLORS[o.dup.place] || INACTIVE_BG,
                    });
                    if (!answer) continue;
                    const keptPlace = answer === "alt" ? o.dup.place : o.place;
                    let args = { project: s.path, run: o.dup.run, index: o.dup.index, orphan: o.path,
                        keep: answer === "alt" ? "run" : "orphan" };
                    for (;;) {
                        let res = null;
                        let error = "";
                        try {
                            res = await apiPost("/mmproject/resolve_duplicate", args);
                            error = res.trash_error || "";
                        } catch (e) {
                            error = e.message;
                        }
                        if (!error) {
                            done.push(baseOf(o.path) + ": kept in " + (SORT_NAME[keptPlace] || keptPlace));
                            break;
                        }
                        // Le Run suit deja l'exemplaire garde : Retry ne met plus que l'autre a la Corbeille.
                        if (res && res.trash_error) args = Object.assign({}, args, { orphan: res.other, keep: "run" });
                        const retry = await confirm.ask({
                            title: "The Recycle Bin refused " + baseOf((res && res.other) || args.orphan),
                            html: (res && res.trash_error
                                ? "The run now follows the copy in <b>" + escapeHtml(SORT_NAME[keptPlace] || "") +
                                    "</b>, but the other copy could not go to the Recycle Bin."
                                : "Nothing was changed.") +
                                '<br><span style="color:#999">' + escapeHtml(error) + "</span>" +
                                "<br>The file is probably in use (a video preview, the Explorer...). Close the " +
                                "previews or reload the page, then <b>Retry</b>. <b>Later</b>: asked again at the " +
                                "next opening.",
                            okLabel: "Retry", okColor: DOT_ORANGE, cancelLabel: "Later",
                        });
                        if (!retry) {
                            failedCount++;
                            break;
                        }
                    }
                }
                await loadRuns(s);
                if (!done.length && !failedCount) return null;
                return {
                    text: (done.length ? "Duplicates resolved (other copy in the Recycle Bin): " + done.join(", ") : "") +
                        (failedCount ? (done.length ? " – " : "") + failedCount + " duplicate(s) left: asked again " +
                            "at the next opening." : ""),
                    ok: !failedCount,
                };
            }

            /** Bouton des doublons a droite de la cloche : visible quand <dossier>/Archives en a. */
            function paintDuplicates() {
                const s = getState();
                const current = inProject(s.name);
                for (const f of folderRows) {
                    if (!UPDATE_FOLDERS.includes(f.name)) continue;
                    const groups = current ? dupGroups[f.name] || [] : [];
                    const copies = groups.reduce((a, g) => a + g.files.length - 1, 0);
                    f.arch.style.visibility = groups.length ? "visible" : "hidden";
                    f.arch.title = groups.length ? groups.length + " duplicate group(s) in " + f.name + "/Archives (" +
                        copies + " extra cop" + (copies > 1 ? "ies" : "y") + "): click to see them" : "";
                }
            }

            /**
             * Purge (choix utilisateur, 19/10/2026) : compte d'abord (rien n'est touche),
             * avertissement avec rappel de 98.Error, puis purge et relecture des listes.
             */
            async function purgeProject() {
                const s = getState();
                if (!inProject(s.name)) return;
                let plan;
                try {
                    plan = await apiPost("/mmproject/purge", { project: s.path, dry_run: true });
                } catch (e) {
                    say(e.message);
                    return;
                }
                const keptText = plan.kept.length ? plan.kept.length + " run(s) marked running kept: ComfyUI is " +
                    "running something, purge again later." : "";
                const empty = plan.empty || [];
                if (!plan.deleted.length && !plan.moved.length && !empty.length) {
                    say("Nothing to purge." + (keptText ? " " + keptText : ""), !keptText);
                    return;
                }
                // Runs "done" sans sortie image ou video (choix utilisateur, 19/10/2026) : case
                // decochee par defaut, lue apres la reponse (le texte de la fenetre reste en place).
                const boxId = "mmPurgeEmpty" + Date.now();
                const lines = [];
                if (plan.deleted.length) {
                    lines.push("<b>" + plan.deleted.length + "</b> run(s) marked <b>running</b> while no run is in " +
                        "progress: deleted (JSON in 04.Prompt and its workflow in 00.Workflows/Run).");
                }
                if (plan.moved.length) {
                    lines.push("<b>" + plan.moved.length + "</b> run(s) in <b>error</b>: moved to <b>98.Error</b> " +
                        "(workflow in 98.Error/Workflows); their files stay in place.");
                }
                if (keptText) lines.push('<span style="color:' + ORANGE + '">' + keptText + "</span>");
                if (empty.length) {
                    lines.push('<label style="display:flex;gap:6px;align-items:flex-start;cursor:pointer;margin:4px 0">' +
                        '<input type="checkbox" id="' + boxId + '" style="margin-top:3px">' +
                        "<span>Also delete the <b>" + empty.length + "</b> run(s) <b>done</b> without image or video " +
                        "output (JSON and workflow).</span></label>");
                }
                lines.push('<span style="color:#999">98.Error is in the project folder; it is not shown in the node.</span>');
                const ok = await confirm.ask({
                    title: "Purge the project " + shortName(s.name) + "?",
                    html: lines.map((l) => "<div>" + l + "</div>").join(""),
                    okLabel: "Purge", okColor: PURGE_RED,
                });
                const box = document.getElementById(boxId);
                const emptyDone = !!(box && box.checked);
                if (!ok) return;
                try {
                    const data = await apiPost("/mmproject/purge", { project: s.path, empty_done: emptyDone });
                    await loadFolderFiles();
                    say("Purge: " + data.deleted.length + " run(s) deleted, " + data.moved.length +
                        " moved to 98.Error" + (emptyDone ? ", " + (data.empty || []).length + " done run(s) without " +
                        "output deleted" : "") + (data.kept.length ? ", " + data.kept.length + " running kept" : "") + ".", true);
                } catch (e) {
                    say(e.message);
                    await loadFolderFiles();
                }
            }

            /**
             * Reset (choix utilisateur, 19/10/2026) : bilan sans rien toucher, nom du projet a
             * taper, puis tous les fichiers du projet vers la Corbeille ; le Reference Loader
             * relie est vide dans les deux modes (son Root folder ne change pas).
             */
            async function resetProject() {
                const s = getState();
                if (!inProject(s.name)) return;
                let plan;
                try {
                    plan = await apiPost("/mmproject/reset", { project: s.path, dry_run: true });
                } catch (e) {
                    say(e.message);
                    return;
                }
                const rows = plan.folders.map((f) => "<tr><td>" + escapeHtml(f.folder) + '</td><td style="text-align:right">' +
                    f.files + '</td><td style="text-align:right">' + fmtSize(f.size) + "</td></tr>").join("");
                const ok = await resetDialog.ask({
                    name: shortName(s.name),
                    html: "<b>" + plan.total + "</b> file(s), " + fmtSize(plan.size) + ", will be " + (plan.trash
                        ? "moved to the <b>Recycle Bin</b>" : '<b style="color:' + RESET_RED + '">deleted permanently</b>') +
                        ". The folders stay, empty." + (rows ? '<table style="border-collapse:collapse;width:100%;margin:6px 0;' +
                        'font-size:12px">' + rows + "</table>" : "") +
                        "The selection of the <b>MagicStudio RefLoader</b> is emptied in both modes (its root folder does not change)." +
                        '<div style="color:#999;margin-top:4px">Files outside the project are never touched.</div>',
                });
                if (!ok) return;
                try {
                    const data = await apiPost("/mmproject/reset", { project: s.path });
                    const loader = linkedLoader(node);
                    if (loader) {
                        const st = loader.mmGetState();
                        // Les deux profils : tous leurs fichiers etaient dans le projet.
                        for (const k of ["images", "videos", "video_audios", "audios", "first_frame", "last_frame",
                            "guide_images", "guide_video", "soundtrack", "voice"]) st[k] = [];
                        st.trims = { video: {}, video_audio: {}, audio: {}, guide_video: {}, soundtrack: {}, voice: {} };
                        st.moments = { guide_images: {}, guide_video: {} };
                        loader.mmSetState(st);
                        setState({ snap: folderSnapshot(loader.mmGetState()), snapPath: s.path });
                    }
                    await loadWorkflowInfo();
                    await loadFolderFiles();
                    say("Reset: " + data.total + " file(s) " + (data.trash ? "moved to the Recycle Bin" : "deleted") +
                        "; the MagicStudio RefLoader is empty.", true);
                } catch (e) {
                    say(e.message);
                    await loadFolderFiles();
                }
            }

            /**
             * Copy (choix utilisateur, 19/10/2026) : fichiers de 08 a 14 et de leurs Archives
             * d'un autre projet ; la configuration sauvegardee de l'autre projet remplit le
             * Reference Loader (ordre et rognages, chemins des copies).
             */
            async function copyFromProject() {
                const s = getState();
                if (!inProject(s.name)) return;
                const sep = folder.root.includes("\\") || !folder.root.includes("/") ? "\\" : "/";
                // Projets de la racine et dossiers de projets (All ou l'un d'eux), sans le projet ouvert.
                const sources = tree.filter((e) => e.projects
                    ? e.projects.some((p) => e.name + GROUP_SEP + p !== s.name) : e.name !== s.name)
                    .map((e) => ({ name: e.name, path: folder.root.replace(/[\\/]+$/, "") + sep + e.name, multi: !!e.projects }));
                if (!sources.length) {
                    say("No other project in this folder to copy from.");
                    return;
                }
                const source = await copyDialog.ask({
                    project: shortName(s.name), sources,
                    probe: (path, sub) => apiPost("/mmproject/copy_media",
                        { project: s.path, source: path, sub, dry_run: true }),
                });
                if (!source) return;
                try {
                    const data = await apiPost("/mmproject/copy_media", { project: s.path, ...source });
                    const loader = linkedLoader(node);
                    let filled = "";
                    if (loader && data.report) {
                        const media = Object.keys(MEDIA_FOLDERS);
                        loader.mmSetState(loadedState(loader.mmGetState(), data.report, s.path, media));
                        setState({ snap: folderSnapshot(loader.mmGetState()), snapPath: s.path });
                        filled = "; the MagicStudio RefLoader follows its configuration";
                    }
                    await loadFolderFiles();
                    say("Copy: " + data.copied + " file(s) copied, " + data.skipped + " already there (same SHA256)" +
                        filled + ".", true);
                } catch (e) {
                    say(e.message);
                    await loadFolderFiles();
                }
            }

            /** Fenetre de visualisation d'un dossier : racine (ordre du Ref Loader) et Archives. */
            async function showFolder(f) {
                const s = getState();
                if (!inProject(s.name)) return;
                try {
                    const data = await apiGet("/mmproject/folder_files?project=" + encodeURIComponent(s.path) +
                        "&folders=" + encodeURIComponent(f) + "&archives=1&dates=1");
                    const loader = linkedLoader(node);
                    const rootFiles = orderedFolderFiles(data.files[f] || [], loader ? loader.mmGetState() : null, f);
                    folderViewer.open(f, shortName(s.name), rootFiles, (data.archives || {})[f] || [], data.mtimes);
                } catch (e) {
                    say(e.message);
                }
            }

            /** Fenetre des doublons : suppression (Corbeille ou definitive), puis relecture ; Cancel ferme. */
            async function duplicatesStep(f) {
                const s = getState();
                if (!inProject(s.name)) return;
                let msg = null;
                for (;;) {
                    const groups = dupGroups[f] || [];
                    if (!groups.length) {
                        duplicatesDialog.close();
                        if (msg) say(msg.text, msg.ok);
                        return;
                    }
                    const res = await duplicatesDialog.open(f, groups, s.path, trashOk, msg);
                    if (!res) return;
                    try {
                        const data = await apiPost("/mmproject/delete_duplicates",
                            { project: s.path, folder: f, shas: res.shas, trash: res.trash });
                        msg = { text: data.deleted.length + " file(s) " + (res.trash ? "moved to the Recycle Bin"
                            : "deleted permanently") + " from " + f + "/Archives.", ok: true };
                    } catch (e) {
                        msg = { text: e.message, ok: false };
                    }
                    await loadFolderFiles();
                }
            }

            /** Fichiers du dossier que plus aucune liste du Reference Loader n'utilise (a archiver). */
            function unusedOf(f, refState) {
                return refState && Array.isArray(folderFiles[f]) ? unusedProjectFiles(folderFiles[f], refState) : [];
            }

            /**
             * Avertissement + cloche orange quand des references sont ajoutees ou
             * retirees, ou quand le dossier garde des fichiers inutilises.
             */
            function paintFolders() {
                paintDuplicates();
                const s = getState();
                const current = inProject(s.name);
                const loader = current ? linkedLoader(node) : null;
                const refState = loader ? loader.mmGetState() : null;
                // Premier passage sur ce projet : l'etat actuel sert de reference pour les suppressions.
                if (refState && s.snapPath !== s.path) {
                    setState({ snap: folderSnapshot(refState), snapPath: s.path });
                    return paintFolders();
                }
                for (const f of folderRows) {
                    if (f.name in REGISTRY_FOLDERS) {
                        // "Sets: n | Last run: dd/MM/yyyy hh:mm:ss".
                        f.last.textContent = current ? setSummary(registries, runList, f.name) : "";
                        f.last.title = f.last.textContent;
                        f.last.style.color = "#9fd6cf";
                    }
                    if (f.name in RUN_FOLDERS) {
                        // "Last run: dd/MM/yyyy hh:mm:ss | Runs: n" (choix utilisateur).
                        f.last.textContent = current ? runSummary(runList, f.name) : "";
                        f.last.title = f.last.textContent;
                        f.last.style.color = "#9fd6cf";
                    }
                    if (!UPDATE_FOLDERS.includes(f.name)) continue;
                    const ch = refState ? folderChanges(refState, f.name, s.path, snapshotOf(s, f.name)) : null;
                    const unused = unusedOf(f.name, refState);
                    const changed = !!ch && (ch.added.length > 0 || ch.removed.length > 0 || unused.length > 0);
                    const tip = !changed ? "" : [
                        ch.added.length ? ch.added.length + " new reference(s) to copy" : "",
                        ch.removed.length ? ch.removed.length + " reference(s) removed in the MagicStudio RefLoader" : "",
                        unused.length ? unused.length + " unused file(s) to archive" : "",
                    ].filter(Boolean).join(", ");
                    f.warn.style.visibility = changed ? "visible" : "hidden";
                    f.warn.title = changed ? f.name + " has changed and is not updated yet: " + tip : "";
                    f.bell.style.background = changed ? BELL_ORANGE : INACTIVE_BG;
                    f.bell.style.opacity = changed ? "1" : "0.6";
                    f.bell.style.cursor = changed ? "pointer" : "default";
                    f.bell.title = !current ? "" : !loader ? "Link a MagicStudio RefLoader to follow " + f.name
                        : changed ? tip + ": click to update " + f.name : f.name + " is up to date";
                    // A droite du nom : "Use: n/x | Orphelins: m | In Archives: y" (choix utilisateur ;
                    // Orphelins = fichiers de la racine sans numero, pas encore archives, cache a 0).
                    const files = current ? folderFiles[f.name] : null;
                    if (!Array.isArray(files)) {
                        f.last.textContent = "";
                        f.last.title = "";
                        continue;
                    }
                    const inArch = (archiveFiles[f.name] || []).length;
                    // "Use: x/y" (choix utilisateur) : x utilises, y = maximum du dossier pour le profil et le mode
                    // (max 0 = dossier non utilise par le profil : "Not used", 14.Video-Audio en LTX 2.x).
                    const use = refState ? folderUse(files, refState, f.name, profileLimitDefaults()) : null;
                    const parts = !use ? ["Files: " + files.length] : use.max ? ["Use: " + use.used + "/" + use.max]
                        : ["Not used"];
                    if (unused.length) parts.push("Orphelins: " + unused.length);
                    parts.push("In Archives: " + inArch);
                    f.last.textContent = parts.join(" | ");
                    f.last.style.color = unused.length ? BELL_ORANGE : "#9fd6cf";
                    f.last.title = (use && !use.max ? "Not used in " + use.mode + "; " + files.length +
                        " file(s) in " + f.name : use ? use.used + " used of " + use.max + " max (" + use.mode + "); " + files.length +
                        " file(s) in " + f.name : files.length + " file(s) in " + f.name) +
                        (unused.length ? "; " + unused.length + " orphan file(s) (no number, not archived yet): " +
                            unused.map(baseOf).join(", ") : "") + "; " + inArch + " file(s) in " + f.name + "/Archives";
                }
            }

            const baseName = (p) => String(p).split(/[\\/]/).pop();
            const nameList = (paths) => {
                const shown = paths.slice(0, 8).map((p) => escapeHtml(baseName(p))).join(", ");
                return shown + (paths.length > 8 ? ", … (+" + (paths.length - 8) + ")" : "");
            };

            /**
             * Cloche d'un dossier suivi : copie des ajouts et archivage des fichiers
             * que le Reference Loader n'utilise plus (references retirees comprises),
             * dans <dossier>/Archives ; le tout confirme, rien n'est efface.
             */
            async function updateFolder(f) {
                const loader = linkedLoader(node);
                const s = getState();
                if (!loader || !inProject(s.name)) return;
                await loadFolderFiles();
                const refState = loader.mmGetState();
                const ch = folderChanges(refState, f, s.path, snapshotOf(s, f));
                const unused = unusedOf(f, refState);
                // Copies : profil actif seulement ; verification des fichiers manquants : les deux
                // profils (references du profil cache ajoutees apres, jamais copiees).
                const items = saveItems(refState).filter((i) => i.folder === f);
                const checked = items.concat(hiddenFolderItems(refState, f));
                let plan = [];
                try {
                    if (checked.length) plan = (await apiPost("/mmproject/save_plan", { project: s.path, items: checked })).plan;
                } catch (e) {
                    say(e.message);
                    return;
                }
                const copies = plan.slice(0, items.length).filter((x) => x.action === "copy");
                const missing = plan.filter((x) => x.action === "missing");
                if (!ch.added.length && !ch.removed.length && !unused.length && !missing.length) return;
                // References vers des fichiers introuvables (choix utilisateur, 19/10/2026) : on peut
                // les retirer du Reference Loader ; tant qu'il en reste, rien n'est archive (un
                // dossier renomme hors de ComfyUI ferait passer tous les fichiers pour orphelins).
                if (missing.length) {
                    const ok = await confirm.ask({
                        title: "Missing files in " + f,
                        html: missing.length + " reference(s) of the MagicStudio RefLoader point to files that are not on " +
                            "disk anymore: " + nameList(missing.map((x) => x.src)) +
                            '<div style="color:' + ORANGE + ';margin-top:6px">Nothing is copied or archived while ' +
                            "references are missing.</div>" + '<div style="color:#999;margin-top:4px">Their folder may ' +
                            "have been renamed or moved: set the root folder of the MagicStudio RefLoader again (gear " +
                            "button) to relink them, or remove them here, then click the bell again.</div>",
                        okLabel: "Remove missing references", okColor: ORANGE,
                    });
                    if (!ok) return;
                    const gone = missing.map((x) => x.src);
                    const st = loader.mmGetState();
                    for (const list of MEDIA_FOLDERS[f] || []) st[list] = withoutPaths(st[list], gone);
                    loader.mmSetState(remapState(st, (p) => p));
                    say(gone.length + " missing reference(s) removed from the MagicStudio RefLoader; click the bell of " + f +
                        " again to update it.", true);
                    await loadFolderFiles();
                    return;
                }
                const html = (copies.length ? copies.length + " file(s) to copy into <b>" + escapeHtml(f) + "</b>: " +
                    nameList(copies.map((x) => x.src)) : "No file to copy") +
                    (missing.length ? '<br><span style="color:' + ORANGE + '">' + missing.length +
                        " missing on disk (not copied): " + nameList(missing.map((x) => x.src)) + "</span>" : "") +
                    (ch.removed.length ? "<br>" + ch.removed.length + " reference(s) removed in the MagicStudio RefLoader: " +
                        nameList(ch.removed) : "") +
                    (unused.length ? "<br>→ moved to <b>" + escapeHtml(f) + "/Archives</b>: " + nameList(unused) +
                        '<br><span style="color:#999">Files no list of the MagicStudio RefLoader uses anymore; nothing is ' +
                        "deleted.</span>" : "") +
                    (copies.length ? '<div style="color:#999;margin-top:8px">Then the MagicStudio RefLoader uses the copies ' +
                        "of the project.</div>" : "");
                const ok = await confirm.ask({ title: "Update " + f + "?", html, okLabel: "Update", okColor: BELL_ORANGE });
                if (!ok) return;
                try {
                    // Archives d'abord : un fichier copie peut reprendre le nom d'un fichier archive.
                    if (unused.length) {
                        await apiPost("/mmproject/archive_files", { project: s.path, folder: f, names: unused.map(baseName) });
                    }
                    if (copies.length) {
                        const data = await apiPost("/mmproject/save", { project: s.path, items, configs: [] });
                        // Le Reference Loader a pu changer pendant la confirmation : on repart de son etat.
                        const latest = loader.mmGetState();
                        const same = JSON.stringify(saveItems(latest).filter((i) => i.folder === f)) === JSON.stringify(items);
                        if (same) loader.mmSetState(remapState(latest, mapFolderBySequence(f, data.dsts, latest)));
                    }
                    const now = getState();
                    const snap = Object.assign({}, now.snapPath === now.path ? now.snap : {});
                    snap[f] = folderPaths(loader.mmGetState(), f);
                    setState({ snap, snapPath: now.path });
                    say(f + " updated: " + copies.length + " file(s) copied" +
                        (unused.length ? ", " + unused.length + " archived" : "") + ".", true);
                } catch (e) {
                    say(e.message);
                }
                await loadFolderFiles();
            }

            function renderWorkflow() {
                const c = wfInfo.current;
                wfRow.last.textContent = c ? "Last save: " + formatLastSave(new Date(c.mtime * 1000)) : "";
                wfRow.last.title = c ? c.name : "";
                const n = wfInfo.archives.length;
                setOn(wfRow.arch, n > 0, VIOLET, n ? n + " archived workflow(s): open one in a new tab"
                    : "No archived workflow yet");
                paintBell();
            }

            /** Relit les workflows du projet choisi et le contenu du workflow courant. */
            async function loadWorkflowInfo() {
                const s = getState();
                wfInfo = { workflows: [], archives: [], current: null };
                savedWf = null;
                savedSig = null;
                if (inProject(s.name)) {
                    try {
                        const data = await apiGet("/mmproject/workflows?project=" + encodeURIComponent(s.path));
                        const mine = s.wfPath === s.path && data.workflows.find((w) => w.name === s.wfName);
                        wfInfo = { workflows: data.workflows, archives: data.archives, current: mine || data.workflows[0] || null };
                        if (wfInfo.current) {
                            const res = await fetch("/mmproject/workflow?project=" + encodeURIComponent(s.path) +
                                "&name=" + encodeURIComponent(wfInfo.current.name), { cache: "no-store" });
                            savedWf = res.ok ? JSON.parse(await res.text()) : null;
                            savedSig = workflowSignature(forCompare(savedWf));
                        }
                    } catch (e) {
                        say(e.message);
                    }
                }
                renderWorkflow();
            }

            /** Ecrit le workflow actuel ; validated = sauvegarde confirmee par la cloche (vert). */
            async function writeWorkflow(name, archive, validated) {
                const s = getState();
                // Etat final du noeud Projet AVANT d'ecrire le fichier (choix utilisateur, 22/10/2026) :
                // le workflow sauvegarde porte cet etat ; avant, il gardait l'etat d'avant la sauvegarde
                // (wfValidated false) et se rechargeait avec la cloche orange.
                const after = { wfPath: s.path, wfName: String(name || "").replace(/\.json$/i, "").trim() + ".json",
                    wfValidated: !!validated, wfRed: "" };
                setState(after);
                let info;
                try {
                    info = await apiPost("/mmproject/save_workflow", {
                        project: s.path, name, content: JSON.stringify(currentWorkflow(), null, 2) + "\n",
                        archive: archive || null,
                    });
                } catch (e) {
                    setState({ wfPath: s.wfPath, wfName: s.wfName, wfValidated: s.wfValidated, wfRed: s.wfRed });
                    throw e;
                }
                setState(Object.assign(after, { wfName: info.name }));
                await loadWorkflowInfo();
                return info;
            }

            /** Premiere sauvegarde du workflow (initialisation, ou Save sans workflow) : cloche orange. */
            async function saveWorkflowDirect() {
                const s = getState();
                if (!s.name) return;
                try {
                    const info = await writeWorkflow(workflowNameOf(s.name), null, false);
                    say("Workflow saved: " + info.name, true);
                } catch (e) {
                    say(e.message);
                }
            }

            /** Cloche : changements, archiver l'ancien ?, nom, puis sauvegarde (cloche verte). */
            async function workflowStep() {
                const s = getState();
                if (!inProject(s.name)) return;
                let name = workflowNameOf(s.name);
                let message = null;
                let again = false;
                // Seul Close ferme la fenetre : apres chaque enregistrement (ou suppression
                // d'archives) elle est relue et reste ouverte.
                for (;;) {
                    await loadWorkflowInfo();
                    const prev = wfInfo.current ? wfInfo.current.name : "";
                    const diff = diffWorkflows(forCompare(savedWf), forCompare(currentWorkflow()), widgetNames());
                    const full = wfInfo.archives.length >= MAX_ARCHIVES;
                    const result = await workflowDialog.open({ changesHtml: changesHtml(diff), previous: prev,
                        defaultName: name, full, message, again, red: bellState() === "red" ? shortName(s.name) : "" });
                    again = true;
                    if (!result) return;
                    name = result.name;
                    if (result.archive && full) {
                        // Limite atteinte : choisir les archives a supprimer, puis retour a la fenetre.
                        const names = await deleteDialog.open(wfInfo.archives);
                        message = null;
                        if (names) {
                            await deleteArchives(names);
                            message = { text: names.length + " archive(s) deleted: Save again to archive.", ok: true };
                        }
                        continue;
                    }
                    try {
                        const info = await writeWorkflow(result.name, result.archive ? prev : null, true);
                        const text = "Workflow saved: " + info.name +
                            (info.archived ? " (previous one archived: " + info.archived + ")" : "");
                        say(text, true);
                        message = { text, ok: true };
                    } catch (e) {
                        say(e.message);
                        message = { text: e.message, ok: false };
                    }
                }
            }

            /** Supprime les archives cochees (Delete de la liste = confirmation), puis relit la liste. */
            async function deleteArchives(names) {
                const s = getState();
                let done = 0;
                try {
                    for (const n of names) {
                        await apiPost("/mmproject/delete_archive", { project: s.path, name: n });
                        done++;
                    }
                    say(done + " archive(s) deleted.", true);
                } catch (e) {
                    say(e.message);
                }
                await loadWorkflowInfo();
            }

            /** Ouvre une archive dans un nouvel onglet de workflow. */
            async function openArchive(a) {
                const s = getState();
                try {
                    const res = await fetch("/mmproject/workflow?project=" + encodeURIComponent(s.path) +
                        "&name=" + encodeURIComponent(a.name) + "&archive=1", { cache: "no-store" });
                    if (!res.ok) throw new Error("Archive not found: " + a.name);
                    await openInNewTab(JSON.parse(await res.text()), a.name.replace(/\.json$/i, ""));
                } catch (e) {
                    say(e.message);
                }
            }

            wfRow.bell.addEventListener("click", () => {
                const s = getState();
                if (!inProject(s.name)) return;
                if (wfInfo.current) workflowStep();
                else saveWorkflowDirect();
            });
            wfRow.arch.addEventListener("click", () => {
                if (!wfInfo.archives.length) return;
                // Delete : suppression puis la sauvegarde du workflow est proposee.
                archiveMenu.open(wfInfo.archives, openArchive, async (names) => {
                    await deleteArchives(names);
                    await workflowStep();
                });
            });
            // Changements surveilles sans minuteur rapide : le ChangeTracker de ComfyUI emet
            // "graphChanged" (workflow deja serialise) a chaque modification de l'onglet actif.
            // Nodes 2.0 : le ChangeTracker verifie a l'appui, avant que la valeur du widget
            // change, et peut ne rien emettre ; une relecture peu apres chaque geste
            // (souris relachee, touche, saisie) donne l'etat final.
            let recheck = null;
            /** Cloche du workflow et cloches des dossiers suivis. */
            const refreshIndicators = (wf) => {
                if (!node.graph) return;
                if (wfInfo.current) paintBell(wf);
                paintFolders();
                syncModelsLink();
            };
            const scheduleRecheck = () => {
                if (!node.graph) return;
                clearTimeout(recheck);
                recheck = setTimeout(() => refreshIndicators(), RECHECK_MS);
            };
            const onGraphChanged = (e) => {
                if (!node.graph) return;
                const wf = e && e.detail && Array.isArray(e.detail.nodes) ? e.detail : null;
                refreshIndicators(wf);
                scheduleRecheck();
            };
            const GESTURES = ["pointerup", "keyup", "change"];
            api.addEventListener("graphChanged", onGraphChanged);
            GESTURES.forEach((t) => document.addEventListener(t, scheduleRecheck, true));

            // ---- Enregistrement des Runs (entree text_prompt) ----
            // Le noeud ecrit 04.Prompt/yyyyMMdd_HHmmss_run.json au Run (ui.mmrun) ; les
            // fichiers des noeuds de sortie du meme Run sont notes, puis associes a la fin.
            const runs = new Map(); // prompt_id -> {file, files, start}
            // Runs en cours qui contiennent ce noeud : Load et Save verrouilles. Un Run deja
            // termine avant la reponse de /queue (Run tres court) n'est jamais verrouille.
            const endedRuns = [];
            const onRunStart = async (e) => {
                const id = e && e.detail && e.detail.prompt_id;
                if (!id) return;
                // Heure de debut donnee par ComfyUI (ms) : duree totale du Run a la fin.
                if (typeof e.detail.timestamp === "number") runOf(id).start = e.detail.timestamp;
                try {
                    const q = await apiGet("/queue");
                    const item = (q.queue_running || []).find((x) => x[1] === id);
                    const p = item && item[2];
                    if (endedRuns.includes(id)) return;
                    if (p && p[String(node.id)] && p[String(node.id)].class_type === NODE_NAME) {
                        runLock.add(id);
                        render();
                    }
                } catch (err) {
                    // file d'attente illisible : pas de verrou
                }
            };
            const unlockRun = (e) => {
                const id = e && e.detail && e.detail.prompt_id;
                if (!id) return;
                endedRuns.push(id);
                if (endedRuns.length > 16) endedRuns.shift();
                if (runLock.delete(id)) render();
            };
            const runOf = (id) => {
                if (!runs.has(id)) runs.set(id, { file: "", files: [], start: null });
                while (runs.size > 8) runs.delete(runs.keys().next().value);
                return runs.get(id);
            };
            const onExecuted = (e) => {
                const d = e && e.detail;
                if (!d || !d.prompt_id || !d.output) return;
                const run = runOf(d.prompt_id);
                if (Array.isArray(d.output.mmrun) && String(d.node) === String(node.id)) run.file = d.output.mmrun[0];
                for (const v of Object.values(d.output)) {
                    if (!Array.isArray(v)) continue;
                    for (const f of v) {
                        if (f && typeof f === "object" && typeof f.filename === "string") {
                            // Chemin reel quand le noeud le donne : fullpath (Video Helper Suite),
                            // dossier choisi (Pixaroma Save Video) ; sinon output + subfolder.
                            const folder = (f._pixaroma_status && f._pixaroma_status.folder) || f.folder || "";
                            run.files.push({
                                filename: f.filename, subfolder: f.subfolder || "", type: f.type || "output",
                                fullpath: typeof f.fullpath === "string" ? f.fullpath : "",
                                folder: typeof folder === "string" ? folder : "",
                            });
                        }
                    }
                }
            };
            const onRunEnd = (status) => async (e) => {
                unlockRun(e);
                const id = e && e.detail && e.detail.prompt_id;
                const run = id && runs.get(id);
                if (!run) return;
                runs.delete(id);
                if (!run.file) return;
                try {
                    const end = e.detail.timestamp;
                    const duration = typeof end === "number" && typeof run.start === "number" && end >= run.start
                        ? (end - run.start) / 1000 : null;
                    const data = await apiPost("/mmproject/run_done", { run_file: run.file, files: run.files, status, duration });
                    if (data.skipped) {
                        say(data.same_as ? "Run not recorded: nothing changed since " + data.same_as + "."
                            : "Run not recorded: stopped or failed without any file.", !!data.same_as);
                        return;
                    }
                    const copied = (data.outputs || []).filter((o) => o.copy && !o.in_place).length;
                    say("Run recorded: " + baseOf(run.file) + (copied ? ", " + copied + " video(s) copied to 40.Rush Videos"
                        : "") + (status === "done" ? "." : " (run stopped or failed)."), status === "done");
                    loadFolderFiles();
                } catch (err) {
                    say(err.message);
                }
            };
            const onSuccess = onRunEnd("done");
            const onError = onRunEnd("error");
            api.addEventListener("executed", onExecuted);
            api.addEventListener("execution_start", onRunStart);
            api.addEventListener("execution_success", onSuccess);
            api.addEventListener("execution_error", onError);
            api.addEventListener("execution_interrupted", onError);
            node.__mmprojectUnlisten = () => {
                api.removeEventListener("graphChanged", onGraphChanged);
                GESTURES.forEach((t) => document.removeEventListener(t, scheduleRecheck, true));
                api.removeEventListener("executed", onExecuted);
                api.removeEventListener("execution_start", onRunStart);
                api.removeEventListener("execution_success", onSuccess);
                api.removeEventListener("execution_error", onError);
                api.removeEventListener("execution_interrupted", onError);
                clearTimeout(recheck);
            };
            // Secours espace : changements faits par un script, sans action de l'utilisateur.
            node.__mmprojectTimer = setInterval(() => {
                refreshIndicators();
                loadFolderFiles();
            }, FALLBACK_CHECK_MS);
            for (const f of folderRows) {
                if (UPDATE_FOLDERS.includes(f.name)) {
                    f.bell.addEventListener("click", () => updateFolder(f.name));
                    f.arch.addEventListener("click", () => duplicatesStep(f.name));
                    f.btn.addEventListener("click", () => showFolder(f.name));
                }
                if (f.name in RUN_FOLDERS) f.btn.addEventListener("click", () => showRuns(f.name));
                if (f.name in REGISTRY_FOLDERS) f.btn.addEventListener("click", () => showSets(f.name));
            }

            /** Renomme ou deplace le projet (deja confirme) ; le Reference Loader suit. */
            async function applyRenameMove(mode, value) {
                const s = getState();
                const data = await apiPost(mode === "rename" ? "/mmproject/rename" : "/mmproject/move",
                    mode === "rename" ? { path: s.path, name: value } : { path: s.path, dest: value });
                const loader = linkedLoader(node);
                const moved = mode === "move";
                // Le dossier des projets suit un deplacement : Root folder du Ref Loader relie, sinon le noeud.
                const custom = moved ? (samePath(data.root, fallbackRoot) ? "" : data.root) : s.folder;
                // Sous-projet renomme : il reste dans son dossier de projets.
                const group = !moved && s.name.includes(GROUP_SEP) ? s.name.slice(0, s.name.lastIndexOf(GROUP_SEP) + 1) : "";
                setState({
                    root: group ? s.root : data.root, name: group + data.name, path: data.path,
                    folder: loader && moved ? "" : custom,
                    wfPath: s.wfPath === s.path ? data.path : s.wfPath,
                    snap: s.snapPath === s.path ? Object.fromEntries(Object.entries(s.snap)
                        .map(([f, list]) => [f, list.map(mapByPrefix(s.path, data.path))])) : {},
                    snapPath: s.snapPath === s.path ? data.path : "",
                });
                if (loader) {
                    const st = remapState(loader.mmGetState(), mapByPrefix(s.path, data.path));
                    if (moved) st.root = data.root;
                    loader.mmSetState(st); // previent ce noeud si le Root folder change
                }
                await loadProjects();
                // Apres la relecture (qui efface les messages).
                say((moved ? "Moved to " : "Renamed: ") + data.path, true);
            }

            /**
             * Cloche rouge (Data only, workflow pas encore sauvegarde, choix utilisateur
             * 22/10/2026) : avant de charger ou creer un projet, Yes = comme le bouton Save
             * puis on continue, No = on continue, Cancel / Echap = on reste. true = continuer.
             */
            async function guardUnsaved() {
                const s = getState();
                if (!inProject(s.name) || bellState() !== "red") return true;
                const answer = await confirm.ask({
                    title: "The workflow of " + shortName(s.name) + " is not saved",
                    html: "This tab keeps a workflow that is not the saved one of <b>" + escapeHtml(shortName(s.name)) +
                        '</b> (bell <b style="color:' + BELL_RED + '">red</b>). Save it before?',
                    okLabel: "Yes, save", okColor: BELL_RED, altLabel: "No", altColor: INACTIVE_BG,
                });
                if (!answer) return false;
                if (answer === true) await saveProjectAll();
                return true;
            }

            // D'un projet a un autre (choix utilisateur, 22/10/2026) : Load du nouveau projet,
            // comme un clic sur Load ; depuis (no project), rien de plus.
            select.addEventListener("change", async () => {
                const prev = getState();
                if (!(await guardUnsaved())) {
                    select.value = prev.name;
                    return;
                }
                await openProject(select.value);
                const s = getState();
                if (prev.name && s.name && prev.name !== s.name && inProject(s.name)) {
                    await loadProject({ root: prev.root, name: prev.name, path: prev.path });
                }
            });
            editBtn.addEventListener("click", () => {
                const s = getState();
                if (inProject(s.name)) renameDialog.open(s.path);
            });
            // ---- Configuration du projet (99.Project-Config) ----

            /**
             * Ecrit config_projets_<projet>.json (l'ancien part dans Archives). Un fichier
             * d'un dossier de medias sans indice arrete la sauvegarde : liste affichee.
             */
            async function saveProjectConfig() {
                const s = getState();
                if (!inProject(s.name)) return false;
                const loader = linkedLoader(node);
                const st = loader ? loader.mmGetState() : {};
                let res;
                let data = null;
                try {
                    res = await fetch("/mmproject/config/save", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            project: s.path, refs: configRefs(st), trims: st.trims || {}, mode: st.mode || "ref2va",
                            profile: profileOf(st), moments: st.moments || {},
                            workflow: wfInfo.current ? wfInfo.current.name : "",
                        }),
                    });
                    data = await res.json();
                } catch (e) {
                    say(e.message);
                    return false;
                }
                if (res.ok) {
                    say("Saved: configuration of the project" + (data.archived ? " (previous one archived: " +
                        data.archived + ")" : "") + ".", true);
                    return true;
                }
                say((data && data.error) || "HTTP error " + res.status);
                const errors = (data && data.errors) || [];
                if (errors.length) {
                    const shown = errors.slice(0, 20).map((e) => "<div>" + MARK_BAD + " " + escapeHtml(e) + "</div>").join("");
                    await confirm.ask({
                        title: "Project configuration not saved",
                        html: "Every file of <b>08.Images</b>, <b>10.Son</b>, <b>12.Video</b> and <b>14.Video-Audio</b> " +
                            "needs an index: use it in the MagicStudio RefLoader, or move it to the Archives folder." +
                            '<div style="margin-top:8px">' + shown + (errors.length > 20 ? "<div>… (+" +
                            (errors.length - 20) + ")</div>" : "") + "</div>",
                        okLabel: "OK", okColor: ORANGE, noCancel: true,
                    });
                }
                return false;
            }

            /** Reference Loader d'un workflow serialise : celui relie au noeud Projet, sinon le premier. */
            function loaderNodeOf(wf) {
                const nodes = Array.isArray(wf.nodes) ? wf.nodes : [];
                const proj = nodes.find((n) => n && n.type === NODE_NAME);
                const input = proj && (proj.inputs || []).find((i) => i.name === "project" && i.link != null);
                if (input) {
                    const link = (wf.links || []).find((l) => (Array.isArray(l) ? l[0] : l && l.id) === input.link);
                    const origin = link && (Array.isArray(link) ? link[1] : link.origin_id);
                    const n = nodes.find((x) => x && x.id === origin && x.type === REF_LOADER_NAME);
                    if (n) return n;
                }
                return nodes.find((n) => n && n.type === REF_LOADER_NAME) || null;
            }

            /**
             * Load : verification (rien n'est modifie), fenetre "Load the project"
             * (confirmation), remise en place depuis Archives, puis chargement :
             * workflow de meme structure = remplace celui de l'onglet ; autre
             * structure = nouvel onglet "<nom>-copie" ; decoche = medias dans le
             * Reference Loader de cet onglet.
             */
            /**
             * Load (bouton) ou changement de projet (from = projet quitte {root, name, path}).
             * Choix utilisateur, 22/10/2026 : workflow de meme structure -> l'onglet actuel le
             * recoit ; autre structure : meme projet -> l'onglet actuel aussi, autre projet ->
             * nouvel onglet en arriere-plan, l'onglet actuel garde son projet, puis message
             * (OK = rester, Open the project = y aller). Remplacer l'onglet actuel demande
             * confirmation (modifications non sauvegardees perdues).
             */
            async function loadProject(from) {
                const s = getState();
                if (!inProject(s.name)) return;
                let report;
                say("Checking the files of the project...", true);
                try {
                    report = await apiPost("/mmproject/config/check", { project: s.path, current: currentWorkflow() });
                } catch (e) {
                    say(e.message);
                    return;
                }
                say("");
                const group = from ? sameGroup(from.name, s.name) : "";
                const checked = await loadDialog.open(report, s.path, !!from, group, shortName(s.name));
                if (!checked) return;
                try {
                    const items = restoreItems(report, checked);
                    if (items.length) await apiPost("/mmproject/config/restore", { project: s.path, items });
                    const restored = items.length ? " " + items.length + " file(s) put back from Archives." : "";
                    const media = checked.filter((f) => MEDIA_FOLDERS[f]);
                    const wf = report.workflow;
                    if (checked.includes(WORKFLOWS) && wf && wf.source) {
                        const res = await fetch("/mmproject/workflow?project=" + encodeURIComponent(s.path) +
                            "&name=" + encodeURIComponent(wf.name), { cache: "no-store" });
                        if (!res.ok) throw new Error("Workflow not found: " + wf.name);
                        const data = JSON.parse(await res.text());
                        const ln = media.length ? loaderNodeOf(data) : null;
                        if (ln && Array.isArray(ln.widgets_values)) {
                            let st = {};
                            try {
                                st = JSON.parse(ln.widgets_values[0] || "{}");
                            } catch (e) {
                                st = {};
                            }
                            ln.widgets_values[0] = JSON.stringify(loadedState(st, report, s.path, media));
                        }
                        if (checked.dataOnly) {
                            // Data only (choix utilisateur, 22/10/2026) : le workflow de l'onglet reste,
                            // valeurs des noeuds communs et fichiers du projet ; cloche orange (meme
                            // structure) ou rouge (autre structure, a sauvegarder).
                            const merged = mergeData(currentWorkflow(), data);
                            const savedNode = (data.nodes || []).find((n) => n && n.type === NODE_NAME);
                            let st = {};
                            try {
                                st = savedNode && Array.isArray(savedNode.widgets_values)
                                    ? JSON.parse(savedNode.widgets_values[0] || "{}") : {};
                            } catch (e) {
                                st = {};
                            }
                            st = Object.assign({}, getState(), st, { root: s.root, name: s.name, path: s.path },
                                wf.same ? { wfValidated: false, wfRed: "" } : { wfRed: s.path });
                            for (const n of merged.nodes || []) {
                                if (!n || n.type !== NODE_NAME || !Array.isArray(n.widgets_values)) continue;
                                n.widgets_values[0] = JSON.stringify(st);
                                if (n.widgets_values_named) n.widgets_values_named.state = n.widgets_values[0];
                            }
                            const active = app.extensionManager && app.extensionManager.workflow &&
                                app.extensionManager.workflow.activeWorkflow;
                            await app.loadGraphData(merged, true, true, active || null);
                            return;
                        }
                        if (from && !wf.same) {
                            // Autre projet, autre structure : nouvel onglet, l'onglet actuel garde son projet.
                            const tabName = String(wf.name).replace(/\.json$/i, "");
                            setState(from);
                            loadWorkflowInfo();
                            loadFolderFiles();
                            render();
                            const tab = openInBackground(data, tabName);
                            if (!tab) {
                                await openInNewTab(data, tabName);
                                return;
                            }
                            const go = await confirm.ask({
                                title: "Project opened in a new tab",
                                html: "The project <b>" + escapeHtml(shortName(s.name)) + "</b> is open in a new tab named <b>" +
                                    escapeHtml(tab.name) + "</b>." + restored,
                                okLabel: "Open the project", okColor: PINK, cancelLabel: "OK",
                            });
                            if (go) await tab.open();
                            else say("Project " + shortName(s.name) + " is open in the tab " + tab.name + "." + restored, true);
                            return;
                        }
                        // L'onglet actuel recoit le workflow sauvegarde : modifications non sauvegardees perdues.
                        const replace = await confirm.ask({
                            title: "Load the project " + shortName(s.name) + " in this tab?",
                            html: "All the changes made in this tab since the last save will be lost.",
                            okLabel: "Load", okColor: PINK,
                        });
                        if (!replace) return;
                        const active = app.extensionManager && app.extensionManager.workflow &&
                            app.extensionManager.workflow.activeWorkflow;
                        await app.loadGraphData(data, true, true, active || null);
                        return;
                    }
                    if (media.length) {
                        const loader = linkedLoader(node);
                        if (!loader) {
                            say("Wire the project output of the MagicStudio RefLoader to load its files." + restored);
                            return;
                        }
                        loader.mmSetState(loadedState(loader.mmGetState(), report, s.path, media));
                        setState({ snap: folderSnapshot(loader.mmGetState()), snapPath: s.path });
                    }
                    loadFolderFiles();
                    say("Project loaded." + restored, true);
                } catch (e) {
                    say(e.message);
                }
            }

            // Save : fichiers, le workflow (directement s'il n'a jamais ete
            // sauvegarde, sinon la fenetre de la cloche s'il a change), puis la
            // configuration du projet.
            /** Save du noeud : fichiers du Reference Loader, workflow (cloche orange ou rouge), configuration. */
            async function saveProjectAll() {
                const r = await saveAll(false);
                if (r === "cancel" || r === "error") return false;
                await loadWorkflowInfo();
                const bell = bellState();
                if (!wfInfo.current) await saveWorkflowDirect();
                else if (bell === "orange" || bell === "red") await workflowStep();
                await loadWorkflowInfo();
                await saveProjectConfig();
                return true;
            }
            saveBtn.addEventListener("click", () => saveProjectAll());
            loadBtn.addEventListener("click", async () => {
                if (await guardUnsaved()) loadProject();
            });
            purgeBtn.addEventListener("click", () => purgeProject());
            resetBtn.addEventListener("click", () => resetProject());
            copyBtn.addEventListener("click", () => copyFromProject());
            newBtn.addEventListener("click", async () => {
                if (!wired()) return;
                if (!(await guardUnsaved())) return;
                await loadProjects();
                createDialog.open({
                    root: folder.linked ? folder.root : fallbackRoot,
                    exists: folder.exists, fixed: folder.linked, fallback: fallbackRoot,
                });
            });
            reloadBtn.addEventListener("click", () => loadProjects());
            helpBtn.addEventListener("click", () => help.open());

            // Appele par le Reference Loader quand son Root folder change.
            node.__mmprojectRefresh = () => loadProjects();
            // Galerie du Reference Loader : remplacements valides, le dossier est a jour.
            node.mmResnapFolder = (f) => {
                const loader = linkedLoader(node);
                const now = getState();
                if (!loader || !UPDATE_FOLDERS.includes(f)) return;
                const snap = Object.assign({}, now.snapPath === now.path ? now.snap : {});
                snap[f] = folderPaths(loader.mmGetState(), f);
                setState({ snap, snapPath: now.path });
                loadFolderFiles();
            };
            // Lu par la galerie du Reference Loader : projet choisi (et existant), sinon null.
            node.mmProjectInfo = () => {
                const s = getState();
                return inProject(s.name) ? { name: s.name, path: s.path } : null;
            };
            // Lu par la galerie du Reference Loader (filtre "Project", choix utilisateur
            // 19/10/2026) : dossier des projets, leurs noms, projet choisi ("" sans).
            node.mmProjectList = () => {
                const s = getState();
                return { root: folder.root, names: projects.slice(), current: inProject(s.name) ? s.name : "",
                    tree: tree.map((e) => ({ name: e.name, projects: e.projects ? e.projects.slice() : null })) };
            };

            node.addDOMWidget("mmproject_ui", "mmproject", container, {
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
            const fitWidth = () => {
                if (node.size[0] < MIN_WIDTH) node.setSize([MIN_WIDTH, node.size[1]]);
            };

            // Rechargement d'un workflow : liens et etat sont en place, on relit.
            const onConfigure = node.onConfigure;
            node.onConfigure = function () {
                const ret = onConfigure ? onConfigure.apply(this, arguments) : undefined;
                // Sortie "project" d'une version de test (sens inverse) : retiree avec son lien ;
                // la sortie final_cut (22/10/2026) reste, et s'ajoute aux anciens workflows.
                for (let i = (node.outputs || []).length - 1; i >= 0; i--) {
                    if (node.outputs[i].name !== "final_cut") node.removeOutput(i);
                }
                if (!(node.outputs || []).some((o) => o.name === "final_cut")) node.addOutput("final_cut", FINAL_CUT_TYPE);
                fitWidth();
                render();
                setTimeout(loadProjects, 0);
                return ret;
            };

            render();
            setTimeout(fitWidth, 0);
            setTimeout(loadProjects, 0);
            vueProjectNodes.add(node);
            watchVue();
            scheduleVueHide();
            return r;
        };

        // Branchement ou debranchement du Reference Loader : autre dossier des projets.
        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function () {
            const r = onConnectionsChange ? onConnectionsChange.apply(this, arguments) : undefined;
            if (this.__mmprojectRefresh) setTimeout(() => this.__mmprojectRefresh && this.__mmprojectRefresh(), 0);
            return r;
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            vueProjectNodes.delete(this);
            clearInterval(this.__mmprojectTimer);
            if (this.__mmprojectUnlisten) this.__mmprojectUnlisten();
            (this.__mmprojectOverlays || []).forEach((o) => o.remove());
            return onRemoved ? onRemoved.apply(this, arguments) : undefined;
        };
    },
});
