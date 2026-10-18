import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import {
    TITLE_COLOR, BODY_COLOR, VIOLET, PINK, ORANGE, GREEN, INACTIVE_BG,
    svg, iconBadge, hList, hSteps, hTip, hNote, hCard, FOLDER_ICON, REFRESH_ICON, GEAR_ICON, START_ICON,
    IMAGE_ICON, VIDEO_ICON, AUDIO_ICON, EYE_ICON, CLOSE_ICON,
    makeOverlay, makeIconButton, makeTextButton, positionCardNextToNode, apiGet, hideWidget,
    escapeHtml, buildHelpOverlay, vueMode,
} from "./minimax_ref_loader.js";
import {
    PROJECT_SUBFOLDERS, FOLDER_COLORS, projectNameError, parseProjectState, saveItems, remapState, mapBySequence,
    mapByPrefix, UPDATE_FOLDERS, folderPaths, folderSnapshot, folderChanges,
    mapFolderBySequence, withoutMedia, MEDIA_FOLDERS, LOADABLE_FOLDERS, configRefs, loadedState, restoreItems,
    copyTabName, unusedProjectFiles, orderedFolderFiles, folderUse,
    RUN_FOLDERS, runDateText, runsOfKind, runSummary, outputFile, rushItems,
    REGISTRY_FOLDERS, OTHER_REGISTRY, setsWithRuns, promptGroups, setsOfRuns, setSummary, runTabName,
} from "./project_paths.js";
import { diffWorkflows, workflowSignature, formatLastSave, shortValue } from "./workflow_diff.js";

// Noeud "MiniMax H3 Project" : cree ou choisit un dossier de projet dans le
// Root folder recu du MiniMax H3 Reference Loader (entree "project"), ou
// dans le dossier par defaut <input de ComfyUI>/Projets.

const NODE_NAME = "MiniMaxH3Project";
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
// Dossiers avec leur pastille, comme dans le noeud.
const folderBadges = () => hList(PROJECT_SUBFOLDERS.map((f) => iconBadge(FOLDER_ICONS[f], FOLDER_COLORS[f]) + " <b>" + f + "</b>"));
// Boutons texte du bas du noeud (Load, Save), comme dans le noeud.
const textBadge = (t) => '<span style="display:inline-block;background:' + PINK + ';color:white;font-weight:bold;' +
    'font-size:11px;border-radius:5px;padding:0 7px;line-height:18px">' + t + "</span>";
// Fichiers de la configuration du projet (Load / Save).
// Noms des fichiers du projet (choix utilisateur) : workflows_<projet>.json, config_projets_<projet>.json.
const CONFIG_PATH = "99.Project-Config/config_projets_&lt;project&gt;.json";
const configPathOf = (project) => "99.Project-Config/config_projets_" + project + ".json";
const workflowNameOf = (project) => "workflows_" + project;

const HELP_SECTIONS = [
    {
        id: "start", title: "Quick start", icon: START_ICON, color: TITLE_COLOR,
        html: hSteps([
            "Wire the <b>project</b> output of the <b>MiniMax H3 Reference Loader</b> (always its last output) " +
            "to the <b>project</b> input of this node: its root folder becomes the projects folder.",
            "Click " + iconBadge(PLUS_ICON, PINK) + ", type the name of the project and click <b>Create</b>.",
            "Or pick an existing project in the drop-down list.",
        ]) +
        hCard("Buttons of the node", [
            [iconBadge(PENCIL_ICON, VIOLET), "Rename or move the project"],
            [iconBadge(PLUS_ICON, PINK), "Create a new project (a window asks for the name)"],
            [textBadge("Load"), "Load: check the files, then load the saved configuration of the project"],
            [textBadge("Save"), "Save: copy the files of the Reference Loader into the project, save the workflow and the configuration of the project"],
            [iconBadge(REFRESH_ICON, VIOLET), "Read the list of projects again"],
            [iconBadge(FOLDER_ICONS["08.Images"], FOLDER_COLORS["08.Images"]), "One row per folder of the project (greyed until a project is picked; its tooltip gives the path)"],
            [iconBadge(BELL_ICON, BELL_ORANGE), "Bell of 00.Workflows: save the workflow (orange = changes to save, green = saved)"],
            [iconBadge(WARN_ICON, INACTIVE_BG), "Left of 00.Workflows: the workflow has changed and is not saved yet (gone once saved)"],
            [iconBadge(BELL_ICON, BELL_ORANGE), "Bell of 08.Images, 10.Son, 12.Video, 14.Video-Audio: references added or removed in the Reference Loader; click to update the folder"],
            [iconBadge(ARCHIVE_ICON, VIOLET), "Open an archived workflow in a new tab"],
        ]),
    },
    {
        id: "folders", title: "Project folders", icon: PROJECT_ICON, color: VIOLET,
        html: "<p>Every project is a folder with always the same subfolders:</p>" +
            folderBadges() +
            "<p><b>08.Images</b>, <b>10.Son</b>, <b>12.Video</b> and <b>14.Video-Audio</b> follow the lists of the " +
            "Reference Loader. When a reference is added or removed there, " + iconBadge(WARN_ICON, INACTIVE_BG) +
            " appears left of the folder and its " + iconBadge(BELL_ICON, BELL_ORANGE) + " turns orange. Click the " +
            "bell: the window lists the files to copy and the references removed, and <b>Update</b> copies the new " +
            "files (the Reference Loader then uses the copies) and moves to <b>&lt;folder&gt;/Archives</b> every " +
            "file of the folder that no list of the Reference Loader uses anymore (removed references included): " +
            "no file is deleted, and they no longer show in the gallery of the project. The bell also turns orange " +
            "when the folder keeps such unused files. Then the bell goes back to grey and the sign goes away.</p>" +
            "<p>The row of 08.Images, 10.Son, 12.Video and 14.Video-Audio shows <b>Use: n/x | Orphelins: m | In " +
            "Archives: y</b>: n files of the folder are used by the Reference Loader out of x, the most it accepts " +
            "for this folder (08.Images: 9 in Ref2VA, 2 in FL2VA = first + last frame; 10.Son, 12.Video, " +
            "14.Video-Audio: 3), m orphan files (no " +
            "number, not archived yet; shown in orange, gone once Update has archived them), y files in Archives.</p>" +
            "<p>Click the button of 08.Images, 10.Son, 12.Video or 14.Video-Audio to view the folder (view " +
            "only, <b>Close</b>, Escape or a click outside closes it): first its files, in the order of the " +
            "Reference Loader with their number (<b>F</b> / <b>L</b> = First / Last frame; files without number " +
            "last, greyed), then a frame with the files of <b>Archives</b>; both rows scroll sideways. Click a " +
            "thumbnail to see it large in the <b>Preview</b> window.</p>" +
            "<p>The rows of 04.Prompt, 40.Rush Videos and 60.Rush Images show <b>Last run: dd/MM/yyyy hh:mm:ss | " +
            "Runs: n</b> once runs are recorded (40: runs with a video, 60: runs with an image). Click " +
            "<b>04.Prompt</b>: a filter <b>All / Video / Image</b> and the list of the runs (newest first), then " +
            "a <b>Configuration</b> frame (date, mode, Steps, CFG, Seed, status, size of the video, folder of the " +
            "<b>Original</b>), the <b>Prompt</b> text and a thumbnail of the output (‹ › when there are several). " +
            "Click <b>40.Rush Videos</b> or <b>60.Rush Images</b>: the videos (copies in 40.Rush Videos) or the " +
            "images (originals) named in the JSON of the runs, newest on the left, scrolling sideways; below, " +
            "the Configuration and the Prompt of the run of the picked thumbnail. At the end of a recorded run, the " +
            "models and the LoRA go into the registries <b>02.Models/yyyyMMdd_HHmmss_models.json</b> and " +
            "<b>06.LoRA/yyyyMMdd_HHmmss_LoRA.json</b> (a known set keeps its index, a new one gets the next " +
            "index) and the JSON of the run keeps their indices. Under the Configuration, two " +
            "folded blocks <b>Models</b> and <b>LoRA</b> (number in brackets): a click unfolds one (the other " +
            "folds) and shows the diffusion model, text encoder and VAE, or the LoRA with their strength, " +
            "captured when the run starts (only what the run really uses: the chosen branch of a switch, the " +
            "active LoRA of LoraManager); both fold when another run is shown (the copy icon at the top left " +
            "of the Prompt frame copies its text to the clipboard, ready to paste in your prompt node). Click a thumbnail to see it " +
            "in the <b>Preview</b> window (the same thumbnail again closes it); ✕, Escape or a click outside " +
            "closes the window. Under the thumbnail, <b>Retrieve the workflow</b> opens in a new tab the workflow " +
            "of the run, as it was when Run was clicked (<b>00.Workflows/Run</b>, same name as the JSON of the " +
            "run); for a run recorded before, it looks for the workflow kept in its output files (PNG, video of " +
            "Video Helper Suite), greyed when there is none.</p>" +
            "<p>The rows of 02.Models and 06.LoRA show <b>Sets: n | Last run: dd/MM/yyyy hh:mm:ss</b>. Click " +
            "<b>02.Models</b> or <b>06.LoRA</b>: on the left, one card per set of the registry (number, files, " +
            "number of runs, last run); on the right, the prompts of the selected set, identical texts grouped " +
            "in one card (last run, number of runs); the blue eye opens the runs of this prompt (Configuration, " +
            "thumbnail, Retrieve the workflow). Under the sets, the other side of the selected prompt: its LoRA " +
            "from 02.Models, its models from 06.LoRA.</p>" +
            "<p>Each thumbnail has a dot: <b style=\"color:#43a047\">green</b> = the original is in its folder of " +
            "the project (a video in 40.Rush Videos, an image in 60.Rush Images), <b style=\"color:#d35400\">dark " +
            "orange</b> = it is elsewhere. Then <b>Move to 40.Rush Videos</b> / <b>Move to 60.Rush Images</b> " +
            "(after a confirmation) moves it in 3 steps: copy into the project, SHA256 check of the copy, then " +
            "the original is deleted and the dot turns green. A video replaces its reduced copy (only one " +
            "version is kept); an image takes the name of the run. On an error the original is untouched: " +
            "<b>Retry</b> or <b>Abandon</b>, abandoned after 3 failed attempts.</p>" +
            "<p>A file that goes to <b>Archives</b> is named <b>yyyyMMdd_HHmmss_name.ext</b> (date of the " +
            "archiving, <b>(2)</b>-like numbers removed; a name already taken gets the next second). Coming back " +
            "from Archives, it takes its name again without the date.</p>" +
            "<p>Duplicates: the <b>Archives</b> folder of 08.Images, 10.Son, 12.Video and 14.Video-Audio is read " +
            "(even when the folder itself is empty) and its files are compared by SHA256. When identical copies " +
            "are found, " + iconBadge(DUP_ICON, BELL_ORANGE) + " appears right of the bell. It opens the window " +
            "<b>Duplicates</b>: one thumbnail per group with its number of copies and a check box; click a " +
            "thumbnail to see all its copies below (number, total size, size freed). One copy always stays in " +
            "Archives (a dated name without <b>(x)</b>, then a name without <b>(2)</b> or <b>_02</b>, otherwise the " +
            "oldest); after the deletion it is named <b>yyyyMMdd_HHmmss_name.ext</b> (its date kept, or the date " +
            "of the file added instead of the <b>(x)</b>). <b>Delete (x) file(s)</b> " +
            "(at least one box checked) asks <b>Cancel</b>, <b>Move to Recycle Bin</b> (Windows) or <b>Delete " +
            "permanently</b>; groups without duplicates then leave the window.</p>" +
            hNote("This is not a change of the workflow: no configuration is written, and the bell of 00.Workflows " +
                "ignores the content of the lists of the Reference Loader.") +
            hNote("A subfolder deleted by mistake is created again when you pick the project.") +
            hNote("<b>99.Project-Config</b> (configuration of the project, with its <b>Archives</b> folder) is " +
                "created with the project but has no row in the node.") +
            hTip("A project name cannot contain <b>&lt; &gt; : \" / \\ | ? *</b> nor end with a dot."),
    },
    {
        id: "where", title: "Where projects go", icon: GEAR_ICON, color: VIOLET,
        html: hList([
            "Wired to the Reference Loader: in its <b>Root folder</b> (its " + iconBadge(GEAR_ICON, VIOLET) +
            " button). Change it there and the list of projects follows.",
            "Not wired, or Root folder empty: the window of " + iconBadge(PLUS_ICON, PINK) + " lets you choose " +
            "the folder (type it, or " + iconBadge(FOLDER_ICON, VIOLET) + " Browse), with the fallback folder " +
            "<b>ComfyUI/input/Projets</b> already filled in (" + iconBadge(REFRESH_ICON, INACTIVE_BG) + " brings it back).",
            "The folder chosen is kept in the Root folder of the Reference Loader when it is wired, otherwise " +
            "in this node.",
            "The Root folder does not exist yet: the window of " + iconBadge(PLUS_ICON, PINK) +
            " warns you, and <b>Create</b> makes it first.",
        ]) +
        hNote("The tooltip of a folder row gives its path; the bottom line of the node only shows messages."),
    },
    {
        id: "save", title: "Load and Save", icon: SAVE_ICON, color: PINK,
        html: "<p>" + textBadge("Save") + " needs a project and the Reference Loader wired. It shows " +
            "what it will do and asks for a confirmation, then:</p>" +
            hList([
                "copies the files of the Reference Loader (both modes) into the project: Images, First and Last " +
                "frame in <b>08.Images</b>, Video in <b>12.Video</b>, Video/Audio in <b>14.Video-Audio</b>, " +
                "Audio in <b>10.Son</b>;",
                "makes the Reference Loader use the copies of the project;",
                "saves the workflow (directly the first time, through the bell window when it has changed);",
                "then saves the configuration of the project in <b>" + CONFIG_PATH + "</b> (02.Models and 06.LoRA: " +
                "current index of their registry): every folder (even " +
                "empty) with its files, their index (number in the Reference Loader, rank by name elsewhere) and " +
                "the SHA256 of the files of 00.Workflows, 04.Prompt, 08.Images, 10.Son, 12.Video and 14.Video-Audio. " +
                "The previous one goes to <b>99.Project-Config/Archives</b> as " +
                "<b>yyyyMMdd-HHmmss_config_projets_&lt;project&gt;.json</b>, never overwritten.",
            ]) +
            hNote("Every file of 08.Images, 10.Son, 12.Video and 14.Video-Audio must be used by the Reference " +
                "Loader (its number is its index): otherwise the configuration is not saved and the files are listed.") +
            "<p>" + textBadge("Load") + " first compares every file with the configuration, without changing " +
            "anything. A file that is missing or different is looked for in the <b>Archives</b> of its folder " +
            "(same SHA256). The window <b>Load the project</b> then shows each folder:</p>" +
            hList([
                "<b style=\"color:" + GREEN + "\">✓</b> same file, <b style=\"color:#d32f2f\">✗</b> missing or " +
                "different; under it, <b>→ found in Archives</b> with " + iconBadge(EYE_ICON, VIOLET) + " to view it in " +
                "a <b>Preview</b> window next to it (images, videos, sounds; ✕, Escape or a click outside closes " +
                "only the preview);",
                "a check box (checked) for 00.Workflows, 08.Images, 10.Son, 12.Video and 14.Video-Audio: " +
                "uncheck what must not be loaded;",
                "04.Prompt is only checked: loading the workflow may lose the changes of the prompt in progress; " +
                "02.Models, 06.LoRA, 40.Rush Videos and 60.Rush Images are information only.",
            ]) +
            "<p><b>Load</b> puts back the files found in Archives (a file already there under that name goes " +
            "to Archives first) and fills the Reference Loader for the checked folders. The workflow:</p>" +
            hList([
                "same structure (nodes and links) as the current one: the current workflow is replaced;",
                "another structure: the current workflow is never replaced, the saved one opens in a new tab " +
                "<b>name-copie</b> (the window lists the nodes and links in more or missing);",
                "unchecked: nothing opens, the folders checked go to the Reference Loader of this tab.",
            ]),
    },
    {
        id: "workflow", title: "Workflow", icon: BELL_ICON, color: ORANGE,
        html: "<p>The workflow is saved in <b>00.Workflows</b>. The bell of that row shows where it stands:</p>" +
            hList([
                iconBadge(BELL_ICON, INACTIVE_BG) + " grey: never saved;",
                iconBadge(BELL_ICON, BELL_ORANGE) + " orange: changes to save (also right after the first save, " +
                "until you save it once with the bell);",
                iconBadge(BELL_ICON, BELL_GREEN) + " green: saved, no change since; it turns orange again on " +
                "the next change (nodes, links, values).",
            ]) +
            "<p>Click the bell: the window lists the changes since the last save, asks whether to archive the " +
            "previous workflow (moved to <b>00.Workflows/Archives</b> as <b>yyyyMMdd-HHmmss_name.json</b>, date " +
            "of its last save; the archives button lists that folder), and proposes " +
            "the name of the project, which you can change. With <b>Archive it</b> the button is <b>Save</b> " +
            "(green), with <b>Overwrite</b> it becomes <b>Overwrite</b> (orange). After saving the window stays " +
            "open with the changes read again; only <b>Close</b> closes it.</p>" +
            hList([
                "The workflow row shows <b>Last save: dd/MM/yyyy at hh:mm:ss</b>.",
                iconBadge(ARCHIVE_ICON, VIOLET) + " (right of the bell, active when there are archives) opens an " +
                "archived workflow in a new tab; the current one is not changed.",
                "At most <b>5 archives</b> per project. With 5, the archives get a check box: check the ones to " +
                "delete, then <b>Delete</b> deletes them and proposes the save (<b>Cancel</b> closes the window). " +
                "In the bell window, <b>Save</b> with <b>Archive it</b> opens this list first; <b>Overwrite</b> " +
                "saves directly.",
                "When a project is created, the workflow is saved right away; " + textBadge("Save") +
                " also saves it (through the bell window when it has changed).",
            ]) +
            hNote("Moving nodes alone does not turn the bell orange; it is listed as a layout change."),
    },
    {
        id: "runs", title: "Run record", icon: START_ICON, color: GREEN,
        html: "<p>Wire the final prompt text to the <b>text_prompt</b> input (the same text as the prompt of the " +
            "MiniMax node). Then each <b>Run</b> is recorded in the project:</p>" +
            hList([
                "at the start, the workflow as it is when Run is clicked goes into <b>00.Workflows/Run</b>, under " +
                "the same name as the JSON of the run (named in its <b>workflow</b> field; never listed with the " +
                "workflows of the project, removed with the JSON of a run that is not kept);",
                "at the start, <b>04.Prompt/yyyyMMdd_HHmmss_run.json</b> with the date, the project, the mode, the " +
                "prompt, and the <b>CFG</b>, <b>Steps</b> and <b>Seed</b> read in the run itself (KSampler first, " +
                "then CFGGuider, RandomNoise...). A value typed in the node is read directly; a linked one is " +
                "followed (Get / Set and Reroute included): value node, switch (its boolean picks the branch), " +
                "node keeping one value per output (Pixaroma Sliders). A node that computes its value during the " +
                "run gives <b>null</b> with <b>cfg_from</b> / <b>steps_from</b> / <b>seed_from</b> = its name;",
                "at the end, the videos generated by this run are copied to <b>40.Rush Videos</b>, from the real " +
                "path given by the save node (its own folder for Pixaroma Save Video or Video Helper Suite, otherwise " +
                "the output folder of ComfyUI), with the name of the JSON (<b>_02</b>... for the next ones). A video " +
                "larger than <b>960x544</b> is reduced to fit in it (same proportions, .mp4, same frame rate, same " +
                "sound); a smaller one is copied as it is; a video saved in 40.Rush Videos itself is left alone. The " +
                "original is never changed. Images are not copied: they stay in the folder chosen by the save node. " +
                "The JSON lists them all (with <b>size</b> and <b>copy_size</b> for the videos) and gets " +
                "<b>status</b> done (or error when the run stops or fails).",
                "only the new files of the run count: a file already recorded by a previous run (sent back by the " +
                "cache of ComfyUI, older than the run) is ignored, but a file written during the run counts even if it " +
                "takes the name of an old one; a run without any new file, or that stops without any file, is not " +
                "recorded: its JSON is removed and nothing is copied.",
                "optional <b>models_link</b> input: wire the <b>model_link</b> output of <b>MultiFiles Select</b> " +
                "(directly, or through Set / Get or Reroute nodes). " +
                "Its fields give the models of the run for 02.Models (diffusion_models, text_encoders, vae), with " +
                "<b>position</b> = number of the field; not wired: the models are read in the graph (position 0). " +
                "The LoRA are always read in the graph. When MultiFiles Select has no save folder, it gets " +
                "<b>&lt;project&gt;/02.Models</b>, which follows the project; a folder chosen by hand is never " +
                "replaced, and nothing changes when the link is removed;",
                "while a run of this node is in progress, <b>Load</b> and <b>Save</b> are locked.",
            ]) +
            hNote("No project picked, or text_prompt not wired: nothing is recorded. The window of ComfyUI must " +
                "stay open until the end of the run for the files to be copied."),
    },
    {
        id: "rename", title: "Rename or move", icon: PENCIL_ICON, color: VIOLET,
        html: hList([
            iconBadge(PENCIL_ICON, VIOLET) + " opens a window with a <b>Rename | Move</b> switch.",
            "<b>Rename</b> changes the name of the project folder; <b>Move</b> moves the whole project folder " +
            "into another folder (" + iconBadge(FOLDER_ICON, VIOLET) + " Browse).",
            "The window shows the current name or folder and the new one; nothing changes before you confirm.",
            "The references of the Reference Loader in the project follow it. After a move, the projects folder " +
            "follows too (Root folder of the Reference Loader, or this node).",
        ]),
    },
    {
        id: "link", title: "Link to the Reference Loader", icon: LINK_ICON, color: ORANGE,
        html: hList([
            "The <b>project</b> output is always the last output of the Reference Loader, in both modes.",
            "It gives the Root folder only: the references and the galleries are not changed.",
            "The link stays when you switch Ref2VA / F2VA-FL2VA.",
        ]),
    },
];

const HELP_SECTIONS_FR = [
    {
        id: "start", title: "Démarrage rapide",
        html: hSteps([
            "Reliez la sortie <b>project</b> du <b>MiniMax H3 Reference Loader</b> (toujours sa dernière sortie) " +
            "à l'entrée <b>project</b> de ce nœud : son dossier racine devient le dossier des projets.",
            "Cliquez sur " + iconBadge(PLUS_ICON, PINK) + ", tapez le nom du projet et cliquez sur <b>Create</b>.",
            "Ou choisissez un projet existant dans la liste déroulante.",
        ]) +
        hCard("Boutons du nœud", [
            [iconBadge(PENCIL_ICON, VIOLET), "Renommer ou déplacer le projet"],
            [iconBadge(PLUS_ICON, PINK), "Créer un nouveau projet (une fenêtre demande le nom)"],
            [textBadge("Load"), "Load : vérifier les fichiers, puis charger la configuration sauvegardée du projet"],
            [textBadge("Save"), "Save : copier les fichiers du Reference Loader dans le projet, sauvegarder le workflow et la configuration du projet"],
            [iconBadge(REFRESH_ICON, VIOLET), "Relire la liste des projets"],
            [iconBadge(FOLDER_ICONS["08.Images"], FOLDER_COLORS["08.Images"]), "Une ligne par dossier du projet (grisée tant qu'aucun projet n'est choisi ; l'infobulle donne le chemin)"],
            [iconBadge(BELL_ICON, BELL_ORANGE), "Cloche de 00.Workflows : sauvegarder le workflow (orange = changements, vert = sauvegardé)"],
            [iconBadge(WARN_ICON, INACTIVE_BG), "À gauche de 00.Workflows : le workflow a changé et n'est pas encore sauvegardé (disparaît une fois sauvegardé)"],
            [iconBadge(BELL_ICON, BELL_ORANGE), "Cloche de 08.Images, 10.Son, 12.Video, 14.Video-Audio : références ajoutées ou retirées dans le Reference Loader ; cliquez pour mettre le dossier à jour"],
            [iconBadge(ARCHIVE_ICON, VIOLET), "Ouvrir un workflow archivé dans un nouvel onglet"],
        ]),
    },
    {
        id: "folders", title: "Dossiers du projet",
        html: "<p>Chaque projet est un dossier avec toujours les mêmes sous-dossiers :</p>" +
            folderBadges() +
            "<p><b>08.Images</b>, <b>10.Son</b>, <b>12.Video</b> et <b>14.Video-Audio</b> suivent les listes du " +
            "Reference Loader. Quand une référence y est ajoutée ou retirée, " + iconBadge(WARN_ICON, INACTIVE_BG) +
            " apparaît à gauche du dossier et sa " + iconBadge(BELL_ICON, BELL_ORANGE) + " passe à l'orange. Cliquez " +
            "sur la cloche : la fenêtre liste les fichiers à copier et les références retirées, et <b>Update</b> " +
            "copie les nouveaux fichiers (le Reference Loader utilise ensuite les copies) et déplace dans " +
            "<b>&lt;dossier&gt;/Archives</b> chaque fichier du dossier qu'aucune liste du Reference Loader n'utilise " +
            "plus (références retirées comprises) : aucun fichier n'est effacé, et ils ne s'affichent plus dans la " +
            "galerie du projet. La cloche passe aussi à l'orange quand le dossier garde de tels fichiers " +
            "inutilisés. Ensuite la cloche redevient grise et le sigle disparaît.</p>" +
            "<p>La ligne de 08.Images, 10.Son, 12.Video et 14.Video-Audio affiche <b>Use: n/x | Orphelins: m | " +
            "In Archives: y</b> : n fichiers du dossier sont utilisés par le Reference Loader sur x, le maximum " +
            "qu'il accepte pour ce dossier (08.Images : 9 en Ref2VA, 2 en FL2VA = première + dernière image ; " +
            "10.Son, 12.Video, 14.Video-Audio : 3), m fichiers " +
            "orphelins (sans numéro, pas encore archivés ; en orange, disparaît une fois archivés par Update), y " +
            "fichiers dans Archives.</p>" +
            "<p>Cliquez sur le bouton de 08.Images, 10.Son, 12.Video ou 14.Video-Audio pour voir le dossier " +
            "(visualisation seulement, <b>Close</b>, Échap ou un clic à côté la ferme) : d'abord ses fichiers, " +
            "dans l'ordre du Reference Loader avec leur numéro (<b>F</b> / <b>L</b> = First / Last frame ; les " +
            "fichiers sans numéro à la fin, grisés), puis un cadre avec les fichiers d'<b>Archives</b> ; les deux " +
            "lignes défilent horizontalement. Cliquez sur une vignette pour la voir en grand dans la fenêtre " +
            "<b>Preview</b>.</p>" +
            "<p>Les lignes de 04.Prompt, 40.Rush Videos et 60.Rush Images affichent <b>Last run: dd/MM/yyyy " +
            "hh:mm:ss | Runs: n</b> dès qu'un Run est enregistré (40 : Runs avec une vidéo, 60 : Runs avec une " +
            "image). Clic sur <b>04.Prompt</b> : un filtre <b>All / Video / Image</b> et la liste des Runs (le plus " +
            "récent d'abord), puis un cadre <b>Configuration</b> (date, mode, Steps, CFG, Seed, status, taille de " +
            "la vidéo, dossier de l'<b>Original</b>), le texte du <b>Prompt</b> et une vignette de la sortie (‹ › " +
            "s'il y en a plusieurs). Clic sur <b>40.Rush Videos</b> ou <b>60.Rush Images</b> : les vidéos (copies " +
            "de 40.Rush Videos) ou les images (originaux) citées dans les JSON des Runs, la plus récente à gauche, " +
            "défilement horizontal ; en dessous, la Configuration et le Prompt du Run de la vignette choisie. À la fin " +
            "d'un Run enregistré, les modèles et les LoRA vont dans les registres <b>02.Models/yyyyMMdd_HHmmss_models.json</b> " +
            "et <b>06.LoRA/yyyyMMdd_HHmmss_LoRA.json</b> (un ensemble connu garde son indice, un nouveau prend " +
            "l'indice suivant) et le JSON du Run garde leurs indices. Sous la " +
            "Configuration, deux blocs repliés <b>Models</b> et <b>LoRA</b> (nombre entre parenthèses) : un clic en " +
            "déplie un (l'autre se replie) et affiche le modèle de diffusion, l'encodeur de texte et les VAE, ou les " +
            "LoRA avec leur force, captés au lancement du Run (seulement ce que le Run utilise : branche choisie d'un " +
            "switch, LoRA actives de LoraManager) ; les deux se replient quand un autre Run est affiché (l'icône " +
            "de copie en haut à gauche du cadre Prompt copie son texte dans le presse-papiers, prêt à coller dans " +
            "votre nœud de prompt). Clic " +
            "sur une vignette = fenêtre <b>Preview</b> (la même vignette la referme) ; ✕, Échap ou un clic à côté " +
            "ferme la fenêtre. Sous la vignette, <b>Retrieve the workflow</b> ouvre dans un nouvel onglet le " +
            "workflow du Run, tel qu'au clic sur Run (<b>00.Workflows/Run</b>, même nom que le JSON du Run) ; pour " +
            "un Run plus ancien, il cherche le workflow gardé dans ses rendus (PNG, vidéo de Video Helper Suite), " +
            "grisé s'il n'y en a pas.</p>" +
            "<p>Les lignes de 02.Models et 06.LoRA affichent <b>Sets: n | Last run: dd/MM/yyyy hh:mm:ss</b>. Clic " +
            "sur <b>02.Models</b> ou <b>06.LoRA</b> : à gauche, une carte par ensemble du registre (numéro, " +
            "fichiers, nombre de Runs, dernier Run) ; à droite, les prompts de l'ensemble choisi, les textes " +
            "identiques regroupés en une carte (dernier Run, nombre de Runs) ; l'œil bleu ouvre les Runs de ce " +
            "prompt (Configuration, vignette, Retrieve the workflow). Sous les ensembles, l'autre côté du prompt " +
            "choisi : ses LoRA depuis 02.Models, ses modèles depuis 06.LoRA.</p>" +
            "<p>Chaque vignette a une pastille : <b style=\"color:#43a047\">verte</b> = l'original est dans son " +
            "dossier du projet (une vidéo dans 40.Rush Videos, une image dans 60.Rush Images), <b " +
            "style=\"color:#d35400\">orange foncé</b> = il est ailleurs. <b>Move to 40.Rush Videos</b> / <b>Move " +
            "to 60.Rush Images</b> (après confirmation) le déplace en 3 temps : copie dans le projet, comparaison " +
            "SHA256 de la copie, puis suppression de l'original et pastille verte. Une vidéo remplace sa copie " +
            "réduite (une seule version gardée) ; une image prend le nom du Run. En cas d'erreur l'original n'est " +
            "pas touché : <b>Retry</b> ou <b>Abandon</b>, abandon après 3 échecs.</p>" +
            "<p>Un fichier qui part dans <b>Archives</b> est nommé <b>yyyyMMdd_HHmmss_nom.ext</b> (date de " +
            "l'archivage, numéros du type <b>(2)</b> retirés ; un nom déjà pris prend la seconde suivante). En " +
            "revenant d'Archives, il reprend son nom sans la date.</p>" +
            "<p>Doublons : le dossier <b>Archives</b> de 08.Images, 10.Son, 12.Video et 14.Video-Audio est lu " +
            "(même quand le dossier lui-même est vide) et ses fichiers sont comparés par SHA256. Quand des copies " +
            "identiques sont trouvées, " + iconBadge(DUP_ICON, BELL_ORANGE) + " apparaît à droite de la cloche. Il " +
            "ouvre la fenêtre <b>Duplicates</b> : une vignette par groupe avec son nombre de copies et une case à " +
            "cocher ; cliquez sur une vignette pour voir toutes ses copies en dessous (nombre, taille totale, place " +
            "libérée). Un exemplaire reste toujours dans Archives (un nom daté sans <b>(x)</b>, puis un nom sans " +
            "<b>(2)</b> ni <b>_02</b>, sinon le plus ancien) ; après la suppression il est nommé " +
            "<b>yyyyMMdd_HHmmss_nom.ext</b> (sa date gardée, ou la date du fichier ajoutée à la place des " +
            "<b>(x)</b>). <b>Delete (x) file(s)</b> (au moins une case cochée) demande <b>Cancel</b>, <b>Move to " +
            "Recycle Bin</b> (Windows) ou <b>Delete permanently</b> ; les groupes sans doublon quittent ensuite la " +
            "fenêtre.</p>" +
            hNote("Ce n'est pas une modification du workflow : aucune configuration n'est écrite, et la cloche de " +
                "00.Workflows ignore le contenu des listes du Reference Loader.", "Remarque :") +
            hNote("Un sous-dossier supprimé par erreur est recréé quand vous choisissez le projet.", "Remarque :") +
            hNote("<b>99.Project-Config</b> (configuration du projet, avec son dossier <b>Archives</b>) est créé " +
                "avec le projet mais n'a pas de ligne dans le nœud.", "Remarque :") +
            hTip("Un nom de projet ne peut pas contenir <b>&lt; &gt; : \" / \\ | ? *</b> ni finir par un point.",
                "Astuce :"),
    },
    {
        id: "where", title: "Où vont les projets",
        html: hList([
            "Relié au Reference Loader : dans son <b>Root folder</b> (son bouton " + iconBadge(GEAR_ICON, VIOLET) +
            "). Changez-le là-bas et la liste des projets suit.",
            "Non relié, ou Root folder vide : la fenêtre de " + iconBadge(PLUS_ICON, PINK) + " vous laisse choisir " +
            "le dossier (tapez-le, ou " + iconBadge(FOLDER_ICON, VIOLET) + " Browse), avec le dossier de repli " +
            "<b>ComfyUI/input/Projets</b> déjà rempli (" + iconBadge(REFRESH_ICON, INACTIVE_BG) + " le remet).",
            "Le dossier choisi est gardé dans le Root folder du Reference Loader s'il est relié, sinon " +
            "dans ce nœud.",
            "Le Root folder n'existe pas encore : la fenêtre de " + iconBadge(PLUS_ICON, PINK) +
            " vous prévient, et <b>Create</b> le crée d'abord.",
        ]) +
        hNote("L'infobulle d'une ligne de dossier donne son chemin ; la ligne du bas du nœud ne montre que " +
            "les messages.", "Remarque :"),
    },
    {
        id: "save", title: "Load et Save",
        html: "<p>" + textBadge("Save") + " demande un projet et le Reference Loader relié. Il montre " +
            "ce qu'il va faire et demande une confirmation, puis :</p>" +
            hList([
                "copie les fichiers du Reference Loader (les deux modes) dans le projet : Images, First et Last " +
                "frame dans <b>08.Images</b>, Video dans <b>12.Video</b>, Video/Audio dans <b>14.Video-Audio</b>, " +
                "Audio dans <b>10.Son</b> ;",
                "fait utiliser au Reference Loader les copies du projet ;",
                "sauvegarde le workflow (directement la première fois, par la fenêtre de la cloche s'il a changé) ;",
                "puis enregistre la configuration du projet dans <b>" + CONFIG_PATH + "</b> (02.Models et 06.LoRA : " +
                "indice en cours de leur registre) : tous les dossiers " +
                "(même vides) avec leurs fichiers, leur indice (numéro dans le Reference Loader, rang par nom " +
                "ailleurs) et le SHA256 des fichiers de 00.Workflows, 04.Prompt, 08.Images, 10.Son, 12.Video et " +
                "14.Video-Audio. L'ancienne part dans <b>99.Project-Config/Archives</b> sous " +
                "<b>yyyyMMdd-HHmmss_config_projets_&lt;projet&gt;.json</b>, jamais écrasée.",
            ]) +
            hNote("Chaque fichier de 08.Images, 10.Son, 12.Video et 14.Video-Audio doit être utilisé par le " +
                "Reference Loader (son numéro est son indice) : sinon la configuration n'est pas enregistrée et " +
                "les fichiers sont listés.", "Remarque :") +
            "<p>" + textBadge("Load") + " compare d'abord chaque fichier à la configuration, sans rien modifier. " +
            "Un fichier manquant ou différent est cherché dans le dossier <b>Archives</b> de son dossier (même " +
            "SHA256). La fenêtre <b>Load the project</b> montre ensuite chaque dossier :</p>" +
            hList([
                "<b style=\"color:" + GREEN + "\">✓</b> fichier identique, <b style=\"color:#d32f2f\">✗</b> manquant " +
                "ou différent ; dessous, <b>→ found in Archives</b> avec " + iconBadge(EYE_ICON, VIOLET) + " pour le " +
                "voir dans une fenêtre <b>Preview</b> à côté (images, vidéos, sons ; ✕, Échap ou un clic à côté " +
                "ferment seulement l'aperçu) ;",
                "une case (cochée) pour 00.Workflows, 08.Images, 10.Son, 12.Video et 14.Video-Audio : décochez " +
                "ce qui ne doit pas être chargé ;",
                "04.Prompt est seulement vérifié : charger le workflow peut perdre les modifications du prompt en " +
                "cours ; 02.Models, 06.LoRA, 40.Rush Videos et 60.Rush Images sont pour information.",
            ]) +
            "<p><b>Load</b> remet en place les fichiers retrouvés dans Archives (un fichier déjà présent sous ce " +
            "nom part d'abord dans Archives) et remplit le Reference Loader pour les dossiers cochés. Le workflow :</p>" +
            hList([
                "même structure (nœuds et liaisons) que l'actuel : le workflow en cours est remplacé ;",
                "autre structure : le workflow en cours n'est jamais remplacé, celui sauvegardé s'ouvre dans un " +
                "nouvel onglet <b>nom-copie</b> (la fenêtre liste les nœuds et liaisons en plus ou manquants) ;",
                "décoché : rien ne s'ouvre, les dossiers cochés vont dans le Reference Loader de cet onglet.",
            ]),
    },
    {
        id: "workflow", title: "Workflow",
        html: "<p>Le workflow est sauvegardé dans <b>00.Workflows</b>. La cloche de cette ligne indique où il en est :</p>" +
            hList([
                iconBadge(BELL_ICON, INACTIVE_BG) + " grise : jamais sauvegardé ;",
                iconBadge(BELL_ICON, BELL_ORANGE) + " orange : changements à sauvegarder (aussi juste après la " +
                "première sauvegarde, jusqu'à ce que vous le sauvegardiez une fois par la cloche) ;",
                iconBadge(BELL_ICON, BELL_GREEN) + " verte : sauvegardé, aucun changement depuis ; elle repasse à " +
                "l'orange au prochain changement (nœuds, liens, valeurs).",
            ]) +
            "<p>Cliquez sur la cloche : la fenêtre liste les changements depuis la dernière sauvegarde, demande " +
            "s'il faut archiver le workflow précédent (déplacé dans <b>00.Workflows/Archives</b> sous " +
            "<b>yyyyMMdd-HHmmss_nom.json</b>, date de sa dernière sauvegarde ; le bouton d'archives liste ce " +
            "dossier) et propose le nom du projet, que vous pouvez changer. Avec <b>Archive it</b> le bouton est " +
            "<b>Save</b> (vert), avec <b>Overwrite</b> il devient <b>Overwrite</b> (orange). Après " +
            "l'enregistrement la fenêtre reste ouverte avec les changements relus ; seul <b>Close</b> la ferme.</p>" +
            hList([
                "La ligne du workflow affiche <b>Last save: dd/MM/yyyy at hh:mm:ss</b>.",
                iconBadge(ARCHIVE_ICON, VIOLET) + " (à droite de la cloche, actif s'il y a des archives) ouvre un " +
                "workflow archivé dans un nouvel onglet ; le workflow actuel ne change pas.",
                "<b>5 archives</b> au plus par projet. À 5, les archives ont une case à cocher : cochez celles à " +
                "supprimer, puis <b>Delete</b> les supprime et propose la sauvegarde (<b>Cancel</b> ferme la " +
                "fenêtre). Dans la fenêtre de la cloche, <b>Save</b> avec <b>Archive it</b> ouvre d'abord cette " +
                "liste ; <b>Overwrite</b> sauvegarde directement.",
                "À la création d'un projet, le workflow est sauvegardé tout de suite ; " + textBadge("Save") +
                " le sauvegarde aussi (par la fenêtre de la cloche s'il a changé).",
            ]) +
            hNote("Déplacer des nœuds seulement ne fait pas passer la cloche à l'orange ; c'est listé comme un " +
                "changement de disposition.", "Remarque :"),
    },
    {
        id: "runs", title: "Enregistrement des Runs",
        html: "<p>Branchez le texte final du prompt sur l'entrée <b>text_prompt</b> (le même texte que le prompt du " +
            "nœud MiniMax). Ensuite chaque <b>Run</b> est enregistré dans le projet :</p>" +
            hList([
                "au lancement, le workflow tel qu'au clic sur Run va dans <b>00.Workflows/Run</b>, sous le même " +
                "nom que le JSON du Run (cité par son champ <b>workflow</b> ; jamais listé avec les workflows du " +
                "projet, retiré avec le JSON d'un Run qui n'est pas gardé) ;",
                "au lancement, <b>04.Prompt/yyyyMMdd_HHmmss_run.json</b> avec la date, le projet, le mode, le " +
                "prompt, et les <b>CFG</b>, <b>Steps</b> et <b>Seed</b> lus dans le Run lui-même (KSampler d'abord, " +
                "puis CFGGuider, RandomNoise...). Une valeur tapée dans le nœud est lue directement ; une valeur " +
                "reliée est suivie (Get / Set et Reroute compris) : nœud valeur, switch (son booléen choisit la " +
                "branche), nœud qui garde une valeur par sortie (Pixaroma Sliders). Un nœud qui calcule sa valeur " +
                "pendant le Run donne <b>null</b> avec <b>cfg_from</b> / <b>steps_from</b> / <b>seed_from</b> = son nom ;",
                "à la fin, les vidéos générées par ce Run sont copiées dans <b>40.Rush Videos</b>, depuis le vrai " +
                "chemin donné par le nœud de sauvegarde (son propre dossier pour Pixaroma Save Video ou Video Helper " +
                "Suite, sinon le dossier output de ComfyUI), avec le nom du JSON (<b>_02</b>... pour les suivantes). " +
                "Une vidéo plus grande que <b>960x544</b> est réduite pour y tenir (mêmes proportions, .mp4, même " +
                "cadence, même son) ; une plus petite est copiée telle quelle ; une vidéo sauvegardée dans 40.Rush " +
                "Videos lui-même n'est pas touchée. L'original n'est jamais modifié. Les images ne sont pas copiées : " +
                "elles restent dans le dossier choisi par le nœud de sauvegarde. Le JSON les liste toutes (avec " +
                "<b>size</b> et <b>copy_size</b> pour les vidéos) et reçoit <b>status</b> done (ou error si le Run " +
                "s'arrête ou échoue) ;",
                "seuls les fichiers nouveaux du Run comptent : un fichier déjà enregistré par un Run précédent " +
                "(renvoyé par le cache de ComfyUI, plus ancien que le Run) est ignoré, mais un fichier écrit pendant " +
                "le Run compte même s'il reprend le nom d'un ancien ; un Run sans fichier nouveau, ou qui s'arrête sans " +
                "fichier, n'est pas enregistré : son JSON est retiré et rien n'est copié.",
                "entrée optionnelle <b>models_link</b> : branchez la sortie <b>model_link</b> de <b>MultiFiles " +
                "Select</b> (directement, ou via des nœuds Set / Get ou Reroute). Ses champs donnent les modèles du Run pour 02.Models (diffusion_models, text_encoders, " +
                "vae), avec <b>position</b> = numéro du champ ; non branchée : modèles lus dans le graphe (position " +
                "0). Les LoRA sont toujours lues dans le graphe. Sans dossier de sauvegarde, MultiFiles Select " +
                "reçoit <b>&lt;projet&gt;/02.Models</b>, qui suit le projet ; un dossier choisi à la main n'est " +
                "jamais remplacé, et rien ne change au débranchement ;",
                "pendant un Run de ce nœud, <b>Load</b> et <b>Save</b> sont verrouillés.",
            ]) +
            hNote("Aucun projet choisi, ou text_prompt non branchée : rien n'est enregistré. La fenêtre de ComfyUI " +
                "doit rester ouverte jusqu'à la fin du Run pour que les fichiers soient copiés.", "Remarque :"),
    },
    {
        id: "rename", title: "Renommer ou déplacer",
        html: hList([
            iconBadge(PENCIL_ICON, VIOLET) + " ouvre une fenêtre avec un interrupteur <b>Rename | Move</b>.",
            "<b>Rename</b> change le nom du dossier du projet ; <b>Move</b> déplace tout le dossier du projet " +
            "dans un autre dossier (" + iconBadge(FOLDER_ICON, VIOLET) + " Browse).",
            "La fenêtre montre le nom ou le dossier actuel et le nouveau ; rien ne change avant votre confirmation.",
            "Les références du Reference Loader qui sont dans le projet le suivent. Après un déplacement, le " +
            "dossier des projets suit aussi (Root folder du Reference Loader, ou ce nœud).",
        ]),
    },
    {
        id: "link", title: "Lien avec le Reference Loader",
        html: hList([
            "La sortie <b>project</b> est toujours la dernière sortie du Reference Loader, dans les deux modes.",
            "Elle ne donne que le Root folder : les références et les galeries ne changent pas.",
            "Le lien reste quand vous basculez Ref2VA / F2VA-FL2VA.",
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
    folderLabel.textContent = "No Root folder in the MiniMax H3 Reference Loader: choose the projects folder.";
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
    card.append(title, where, folderBox, warning, input, error, footer);

    let info = null; // {root, exists, fixed, fallback}
    let checkId = 0;

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
            if (id === checkId) warning.style.display = data.exists === false ? "block" : "none";
        } catch (e) {
            if (id === checkId) warning.style.display = "none";
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
        createBtn.disabled = true;
        error.textContent = "";
        try {
            await ctx.create(name, folder);
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
        if (e.target === input || e.target === folderInput) {
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
                where.innerHTML = "Create the project in the Root folder of the MiniMax H3 Reference Loader:" +
                    "<br><b style=\"color:#9fd6cf\">" + escapeHtml(info.root) + "</b>";
            } else {
                folderInput.value = info.root || info.fallback;
                folderInput.style.borderColor = "#0c3833";
                fallbackBtn.title = "Back to the fallback folder: " + info.fallback;
            }
            warning.style.display = info.exists ? "none" : "block";
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
    const okBtn = makeTextButton("OK", GREEN);
    footer.append(cancelBtn, okBtn);
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
                '<div style="color:#999;margin-top:8px">The references of the Reference Loader that are in the ' +
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
    archiveBox.append(archiveLabel, pill, limitNote);

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
    img.src = "/mmrefloader/thumb?path=" + encodeURIComponent(archDir) + "&file=" + encodeURIComponent(name);
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
        ask(names, trashOk, anchor) {
            if (resolve) finish(null);
            title.textContent = "Delete " + names.length + " duplicate file(s)?";
            const shown = names.slice(0, 15).map((n) => "<div>• " + escapeHtml(n) + "</div>").join("");
            text.innerHTML = shown + (names.length > 15 ? "<div>… (+" + (names.length - 15) + ")</div>" : "") +
                '<div style="color:#999;margin-top:8px">One copy of each group stays in Archives. Files moved to ' +
                "the Recycle Bin can be restored from it; <b>Delete permanently</b> cannot be undone.</div>";
            trashBtn.disabled = !trashOk;
            trashBtn.style.opacity = trashOk ? "1" : "0.45";
            trashBtn.style.cursor = trashOk ? "pointer" : "default";
            trashBtn.title = trashOk ? "Move the copies to the Recycle Bin (they can be restored)"
                : "The Recycle Bin is only available on Windows";
            overlay.style.display = "block";
            positionCardNextToNode(card, anchor, 440);
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
    card.append(title, rootLabel, rootRow, archLabel, archFrame, footer);
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

    return {
        /** open(folder, projectName, rootFiles [{path, badge}], archivePaths) */
        open(folder, projectName, rootFiles, archivePaths) {
            const kind = PREVIEW_KIND[folder];
            title.textContent = folder + " – " + projectName;
            rootLabel.textContent = folder + " (" + rootFiles.length + " file(s))";
            archLabel.textContent = "Archives (" + archivePaths.length + " file(s))";
            rootRow.innerHTML = "";
            archRow.innerHTML = "";
            for (const f of rootFiles) {
                rootRow.appendChild(tile(f.path, f.badge, kind, folder + "/" + baseOf(f.path), !f.badge));
            }
            for (const p of archivePaths) {
                archRow.appendChild(tile(p, "", kind, folder + "/Archives/" + baseOf(p), false));
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
// Pastille des vignettes (choix utilisateur) : vert = original dans son dossier du projet, orange fonce = ailleurs.
const DOT_GREEN = "#43a047";
const DOT_ORANGE = "#d35400";
const RUSH_FOLDER_OF = { video: "40.Rush Videos", image: "60.Rush Images" };

/** Pastille en haut a gauche d'une vignette. */
function addStatusDot(box, out) {
    box.style.position = "relative";
    const dot = document.createElement("div");
    Object.assign(dot.style, {
        position: "absolute", top: "6px", left: "6px", width: "12px", height: "12px", borderRadius: "50%",
        background: out.in_project ? DOT_GREEN : DOT_ORANGE, border: "2px solid #1e1e1e", zIndex: "1",
    });
    dot.title = out.in_project ? "Original in " + RUSH_FOLDER_OF[out.kind]
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
    if (!out) return h + row("Output", '<span style="color:#888">none</span>');
    if (out.size) h += row("Size", escapeHtml(out.size + (out.copy_size ? " → " + out.copy_size : "")));
    h += row("Original", '<span style="font-family:monospace;font-size:11px">' + escapeHtml(out.folder || "?") + "</span>" +
        (out.source_exists ? "" : ' <span style="color:' + ORANGE + '">(missing)</span>'), out.source);
    if (out.resize_error) h += row("Resize", '<span style="color:' + ORANGE + '">' + escapeHtml(out.resize_error) + "</span>");
    return h;
}

function buildRunViewer(container, onMove, onWorkflow) {
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
    head.append(title, closeBtn);

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
    card.append(head, pick, strip, grid, note);
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

    const onKey = (e) => {
        if (overlay.style.display === "none" || moving || e.key !== "Escape") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (preview.isOpen()) preview.close();
        else close();
    };
    function close() {
        preview.close();
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
                (m.text_encoder || []).map(item("Text encoder")), (m.vae || []).map(item("VAE")));
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

    /** Cadre Configuration + bouton "Move to ..." quand l'original est hors de son dossier du projet. */
    function fillConfig(run, out) {
        conf.body.innerHTML = runConfigHtml(run, out);
        fillModels(run);
        if (!out || out.in_project || !out.source_exists || !onMove) return;
        const btn = makeTextButton("Move to " + RUSH_FOLDER_OF[out.kind], DOT_ORANGE);
        btn.title = "Copy the original to " + RUSH_FOLDER_OF[out.kind] + ", check it (SHA256), then delete the original";
        Object.assign(btn.style, { marginTop: "6px", width: "100%" });
        btn.addEventListener("click", async () => {
            moving = true;
            preview.close();
            let res = null;
            try {
                res = await onMove(run, out);
            } finally {
                moving = false;
            }
            if (!res) return;
            runs = res.runs || runs;
            note.textContent = res.text || "";
            note.style.color = res.ok ? "#9fd6cf" : ORANGE;
            if (folder === "04.Prompt") renderPrompt();
            else renderRush();
        });
        conf.body.appendChild(btn);
    }

    const shownOf = (file) => folder === "40.Rush Videos" || /[\\/]40\.Rush Videos[\\/]/.test(file)
        ? "40.Rush Videos/" + baseOf(file) : file;
    const showPreview = (file, kind) => preview.toggle(file, kind, shownOf(file), card);

    // ---- 04.Prompt ----
    const filteredRuns = () => runsOfKind(runs, filter === "all" ? null : filter);
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
            d.textContent = !out ? "No output" : out.kind === "video" ? "Copy not found in 40.Rush Videos" : "Original not found";
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
    function renderRush() {
        const items = rushItems(runs, folder);
        strip.innerHTML = "";
        if (!items.length) {
            const d = document.createElement("div");
            d.textContent = "No " + (RUN_FOLDERS[folder] || "file") + " recorded by a run.";
            Object.assign(d.style, { color: "#888", alignSelf: "center" });
            strip.appendChild(d);
            conf.body.innerHTML = "";
            fillModels(null);
            setPrompt("");
            return;
        }
        rushIndex = Math.min(rushIndex, items.length - 1);
        items.forEach((it, i) => {
            const t = document.createElement("div");
            Object.assign(t.style, {
                width: "120px", padding: "5px", borderRadius: "8px", background: "#1f1f1f", cursor: "pointer",
                flex: "0 0 auto", boxSizing: "border-box",
                border: i === rushIndex ? "2px solid " + VIOLET : "1px solid #333",
            });
            const [dir, name] = splitPath(it.file);
            const pic = dupThumb(dir, name, it.output.kind, 108);
            addStatusDot(pic, it.output);
            t.appendChild(pic);
            const label = document.createElement("div");
            label.textContent = runDateText(it.run.date);
            label.title = name;
            Object.assign(label.style, { fontSize: "11px", marginTop: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
            t.appendChild(label);
            t.addEventListener("click", () => {
                if (rushIndex !== i) {
                    rushIndex = i;
                    renderRush();
                }
                showPreview(it.file, it.output.kind);
            });
            strip.appendChild(t);
        });
        const it = items[rushIndex];
        conf.label.textContent = "Configuration – " + baseOf(it.file);
        fillConfig(it.run, it.output);
        setPrompt(it.run.prompt);
    }

    return {
        /** open(folder "04.Prompt" | "40.Rush Videos" | "60.Rush Images", projectName, runs) */
        open(name, projectName, list) {
            const same = folder === name && overlay.style.display !== "none";
            folder = name;
            runs = list || [];
            if (!same) {
                runIndex = 0;
                outIndex = 0;
                rushIndex = 0;
                openBlock = null;
                modelRun = null;
            }
            const promptMode = name === "04.Prompt";
            if (!same) note.textContent = "";
            title.textContent = name + " – " + projectName;
            conf.label.textContent = "Configuration";
            pick.style.display = promptMode ? "flex" : "none";
            strip.style.display = promptMode ? "none" : "flex";
            thumb.box.style.display = promptMode ? "block" : "none";
            grid.style.gridTemplateColumns = promptMode ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)";
            if (promptMode) renderPrompt();
            else renderRush();
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
            (set.text_encoder || []).map(item("Text encoder")), (set.vae || []).map(item("VAE")));
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

function buildSetViewer(container, onMove, onWorkflow) {
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
    const setsList = scroller("1 1 60%");
    const otherHead = heading();
    Object.assign(otherHead.style, { borderTop: "2px solid #333", paddingTop: "8px", marginTop: "2px" });
    const otherList = scroller("0 1 40%");
    left.append(setsHead, setsList, otherHead, otherList);
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
    const sub = buildRunViewer(container, onMove, async (run) => {
        const res = await onWorkflow(run);
        if (res && res.ok) close();
        return res;
    });

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
        const cards = setsWithRuns(registries, runs, kind);
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
        const groups = current ? promptGroups(current.runs) : [];
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

/** open(report, projectPath) -> Promise<dossiers coches | null> (Cancel, Echap, clic a cote = null). */
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
    card.append(title, sub, body, note, footer);
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
        if (!loadBtn.disabled) finish(checkedFolders());
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
        if (wf.changes && !wf.changes.same) {
            html += '<div style="color:#bbb">Saved workflow → file:</div>' +
                structureHtml(wf.changes, "In more since the save", "Missing since the save");
        }
        if (wf.same) {
            html += '<div style="color:' + GREEN + '">Same structure (nodes and links): the current workflow is replaced.</div>';
        } else {
            html += '<div style="color:' + ORANGE + '">Different structure: the current workflow is kept, the saved ' +
                "one opens in a new tab <b>" + escapeHtml(copyTabName(wf.name)) + "</b>.</div>" +
                (wf.diff ? structureHtml(wf.diff, "Only in the saved workflow", "Only in the current workflow") : "");
        }
        return html;
    }

    return {
        open(report, projectPath) {
            if (resolve) finish(null);
            sub.textContent = "Saved on " + (report.datemodifi || "?") + " · mode " + (report.mode || "?");
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
                if (f.kind === "workflow") block.appendChild(div(workflowHtml(report.workflow), { paddingLeft: "26px" }));
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
            const reloadBtn = makeIconButton(VIOLET, REFRESH_ICON, "Read the list of projects again");
            reloadBtn.style.width = reloadBtn.style.height = "22px";
            const helpBtn = document.createElement("button");
            helpBtn.type = "button";
            helpBtn.textContent = "?";
            Object.assign(helpBtn.style, {
                width: "22px", height: "22px", borderRadius: "50%", border: "none", background: PINK,
                color: "white", fontWeight: "bold", cursor: "pointer", padding: "0", flex: "0 0 auto",
            });
            bottom.append(status, loadBtn, saveBtn, reloadBtn, helpBtn);

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
                sectionsFor: projectHelpSections, nodeTitle: "MiniMax H3 Project", sectionKey: "mmproject.helpSection",
            });
            const confirm = buildConfirm(container);
            const renameDialog = buildRenameMoveDialog(container, { confirm, apply: applyRenameMove });
            const workflowDialog = buildWorkflowDialog(container);
            const archiveMenu = buildArchiveMenu(container);
            const deleteDialog = buildDeleteArchivesDialog(container);
            const loadDialog = buildLoadDialog(container);
            const duplicatesDialog = buildDuplicatesDialog(container);
            const folderViewer = buildFolderViewer(container);
            const runViewer = buildRunViewer(container, (run, out) => moveOutput(run, out), (run) => openRunWorkflow(run));
            const setViewer = buildSetViewer(container, (run, out) => moveOutput(run, out), (run) => openRunWorkflow(run));
            node.__mmprojectOverlays = [createDialog, help, confirm, renameDialog, workflowDialog, archiveMenu, deleteDialog,
                loadDialog, duplicatesDialog, folderViewer, runViewer, setViewer];
            const wfRow = folderRows.find((f) => f.name === WORKFLOWS);

            /**
             * Dossier des projets : Root folder du Reference Loader branche, sinon
             * dossier personnalise du noeud, sinon "" (dossier de repli).
             */
            function requestedRoot() {
                const loader = linkedLoader(node);
                const root = loader ? loader.mmRootFolder() : "";
                if (root) return { root, linked: true, custom: false };
                const custom = getState().folder;
                return { root: custom, linked: false, custom: !!custom };
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
                projects.forEach((p) => add(p, p));
                const current = s.name && projects.includes(s.name);
                if (s.name && !current) add(s.name, s.name + " (not in this folder)", ORANGE);
                select.value = s.name;
                select.style.color = current ? "#ddd" : s.name ? ORANGE : "#888";

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
                });
                renderWorkflow();
                paintFolders();

                // Bas du noeud : seulement les messages (plus de chemin).
                let text = message;
                let tip = message;
                if (!text && !folder.exists) {
                    text = "Projects folder not found (created with the first project)";
                    tip = folder.root;
                }
                status.textContent = text;
                status.style.color = message && messageOk ? "#9fd6cf" : ORANGE;
                status.title = tip;

                // Crayon : un projet choisi ; Save : un projet et un Reference Loader relie.
                // Load et Save verrouilles pendant un Run de ce noeud (choix utilisateur).
                const locked = runLock.size > 0;
                const LOCKED = "Run in progress: Load and Save are locked";
                const canSave = current && !!linkedLoader(node);
                setOn(editBtn, current, VIOLET, current ? "Rename or move the project" : "Pick a project first");
                setOn(saveBtn, canSave && !locked, PINK, !current ? "Pick a project first"
                    : !canSave ? "Wire the project output of the Reference Loader first" : locked ? LOCKED
                        : "Save: copy the files of the Reference Loader into the project, save the workflow and " +
                        "the configuration of the project (" + configPathOf(s.name) + ")");
                setOn(loadBtn, current && !locked, PINK, !current ? "Pick a project first" : locked ? LOCKED
                    : "Load: check the files, then load the saved configuration of the project (" + configPathOf(s.name) + ")");
                syncModelsLink();
            }

            /** Noeud a l'origine de l'entree 'slot' de n, null sinon. */
            function originOf(n, slot) {
                const input = n && n.inputs && n.inputs[slot];
                const g = n && n.graph;
                if (!input || input.link == null || !g) return null;
                const link = g.links && (typeof g.links.get === "function" ? g.links.get(input.link) : g.links[input.link]);
                return link ? g.getNodeById(link.origin_id) : null;
            }

            /**
             * MultiFiles Select relie a l'entree models_link, null sinon : en traversant
             * Get / Set (le Set du meme nom : findSetter de KJNodes / Easy-Use, sinon un
             * noeud "Set" de meme nom dans le graphe) et les anciens noeuds Reroute.
             */
            function linkedFileSelect() {
                const slot = (node.inputs || []).findIndex((i) => i.name === MODELS_LINK);
                let src = slot >= 0 ? originOf(node, slot) : null;
                for (let hop = 0; src && hop < 10; hop++) {
                    if (src.type === FILE_SELECT_TYPE) return src;
                    const type = String(src.type || "");
                    if (/get/i.test(type) && src.widgets && src.widgets[0]) {
                        const name = src.widgets[0].value;
                        let setter = typeof src.findSetter === "function" ? src.findSetter(src.graph) : null;
                        if (setter && setter.node) setter = setter.node;
                        if (!setter && src.graph) {
                            setter = (src.graph._nodes || []).find((n) => /set/i.test(String(n.type || "")) &&
                                n.widgets && n.widgets[0] && n.widgets[0].value === name) || null;
                        }
                        src = setter ? originOf(setter, 0) : null;
                    } else if (src.isVirtualNode || /reroute/i.test(type)) {
                        src = originOf(src, 0);
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
                if (!s.name || !projects.includes(s.name)) return;
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
                    message = "";
                } catch (e) {
                    if (id !== loadId) return;
                    folder = { root: req.root, exists: false, linked: req.linked, custom: req.custom };
                    projects = [];
                    message = e.message;
                }
                const s = getState();
                // Le projet choisi est dans ce dossier : on recree ses sous-dossiers manquants.
                if (s.name && projects.includes(s.name)) await openProject(s.name, true);
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
            async function createProject(name, root) {
                const data = await apiPost("/mmproject/create", { root, name, create_root: true });
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
                    if (!first) say("Nothing to save: the Reference Loader has no reference.");
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
                    ? "<b>All the files of the Reference Loader will be copied to their folders in the project.</b><br>"
                    : "") +
                    count("copy") + " file(s) to copy" + (lines.length ? ":<br>" + lines.join("<br>") : "") +
                    (count("skip") ? "<br>" + count("skip") + " already in the project" : "") +
                    (count("missing") ? '<br><span style="color:' + ORANGE + '">' + count("missing") +
                        " missing on disk (not copied)</span>" : "") +
                    "<br>Then the workflow, and the configuration of the project in <b>" + escapeHtml(configPathOf(s.name)) + "</b> (the " +
                    "previous one goes to its Archives)." +
                    '<div style="color:#999;margin-top:8px">Then the Reference Loader uses the copies of the project.</div>';
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
                    if (same) loader.mmSetState(remapState(latest, mapBySequence(data.dsts)));
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
                const current = s.name && projects.includes(s.name);
                if (current && wfInfo.current && !wf) wf = currentWorkflow();
                const st = current ? bellState(wf) : "none";
                // Sigle a gauche du bouton : modifie mais pas encore sauvegarde.
                const changed = current && workflowChanged(wf);
                wfRow.warn.style.visibility = changed ? "visible" : "hidden";
                wfRow.warn.title = changed ? "The workflow has changed since the last save and is not saved yet" : "";
                const b = wfRow.bell;
                b.style.background = st === "orange" ? BELL_ORANGE : st === "green" ? BELL_GREEN : INACTIVE_BG;
                b.style.opacity = current ? "1" : "0.6";
                b.style.cursor = current ? "pointer" : "default";
                b.title = !current ? "" : st === "none" ? "Workflow never saved: click to save it"
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
                if (!s.name || !projects.includes(s.name)) {
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
            async function loadRuns(s) {
                try {
                    const data = await apiGet("/mmproject/runs?project=" + encodeURIComponent(s.path));
                    if (getState().path === s.path) {
                        runList = data.runs || [];
                        registries = data.registries || {};
                    }
                } catch (e) {
                    runList = [];
                    registries = {};
                }
            }

            /** Fenetre des boutons 02.Models / 06.LoRA, relue a chaque ouverture. */
            async function showSets(f) {
                const s = getState();
                if (!s.name || !projects.includes(s.name)) return;
                await loadRuns(s);
                paintFolders();
                setViewer.open(f, s.name, runList, registries);
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
             * Deplacement de l'original d'une sortie dans 40.Rush Videos / 60.Rush Images
             * (choix utilisateur) : confirmation, puis copie + SHA256 + suppression cote
             * serveur ; en cas d'erreur Retry / Abandon, abandon apres 3 echecs.
             */
            async function moveOutput(run, out) {
                const s = getState();
                const dest = out.kind === "video" ? "40.Rush Videos" : "60.Rush Images";
                const ok = await confirm.ask({
                    title: "Move the original to " + dest + "?",
                    html: escapeHtml(out.source) + '<br><span style="color:#888">→</span> <b style="color:#9fd6cf">' +
                        dest + "</b>" + (out.kind === "video" && out.copy_exists ? '<br><span style="color:#999">It ' +
                        "replaces the copy " + escapeHtml(baseOf(out.copy)) + " (only one version is kept).</span>" : "") +
                        '<br><span style="color:#999">Copy, SHA256 check, then the original is deleted.</span>',
                    okLabel: "Move", okColor: DOT_ORANGE,
                });
                if (!ok) return null;
                for (let attempt = 1; ; attempt++) {
                    try {
                        const data = await apiPost("/mmproject/move_output", { project: s.path, run: run.file, index: out.index });
                        await loadRuns(s);
                        paintFolders();
                        say("File moved to " + dest + ": " + baseOf(data.source), true);
                        return { runs: runList, text: "File moved to " + dest + ": " + baseOf(data.source), ok: true };
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
                if (!s.name || !projects.includes(s.name)) return;
                await loadRuns(s);
                paintFolders();
                runViewer.open(f, s.name, runList);
            }

            /** Bouton des doublons a droite de la cloche : visible quand <dossier>/Archives en a. */
            function paintDuplicates() {
                const s = getState();
                const current = s.name && projects.includes(s.name);
                for (const f of folderRows) {
                    if (!UPDATE_FOLDERS.includes(f.name)) continue;
                    const groups = current ? dupGroups[f.name] || [] : [];
                    const copies = groups.reduce((a, g) => a + g.files.length - 1, 0);
                    f.arch.style.visibility = groups.length ? "visible" : "hidden";
                    f.arch.title = groups.length ? groups.length + " duplicate group(s) in " + f.name + "/Archives (" +
                        copies + " extra cop" + (copies > 1 ? "ies" : "y") + "): click to see them" : "";
                }
            }

            /** Fenetre de visualisation d'un dossier : racine (ordre du Ref Loader) et Archives. */
            async function showFolder(f) {
                const s = getState();
                if (!s.name || !projects.includes(s.name)) return;
                try {
                    const data = await apiGet("/mmproject/folder_files?project=" + encodeURIComponent(s.path) +
                        "&folders=" + encodeURIComponent(f) + "&archives=1");
                    const loader = linkedLoader(node);
                    const rootFiles = orderedFolderFiles(data.files[f] || [], loader ? loader.mmGetState() : null, f);
                    folderViewer.open(f, s.name, rootFiles, (data.archives || {})[f] || []);
                } catch (e) {
                    say(e.message);
                }
            }

            /** Fenetre des doublons : suppression (Corbeille ou definitive), puis relecture ; Cancel ferme. */
            async function duplicatesStep(f) {
                const s = getState();
                if (!s.name || !projects.includes(s.name)) return;
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
                const current = s.name && projects.includes(s.name);
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
                        ch.removed.length ? ch.removed.length + " reference(s) removed in the Reference Loader" : "",
                        unused.length ? unused.length + " unused file(s) to archive" : "",
                    ].filter(Boolean).join(", ");
                    f.warn.style.visibility = changed ? "visible" : "hidden";
                    f.warn.title = changed ? f.name + " has changed and is not updated yet: " + tip : "";
                    f.bell.style.background = changed ? BELL_ORANGE : INACTIVE_BG;
                    f.bell.style.opacity = changed ? "1" : "0.6";
                    f.bell.style.cursor = changed ? "pointer" : "default";
                    f.bell.title = !current ? "" : !loader ? "Link a Reference Loader to follow " + f.name
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
                    // "Use: x/y" (choix utilisateur) : x utilises, y = maximum du dossier pour le mode.
                    const use = refState ? folderUse(files, refState, f.name) : null;
                    const parts = use ? ["Use: " + use.used + "/" + use.max] : ["Files: " + files.length];
                    if (unused.length) parts.push("Orphelins: " + unused.length);
                    parts.push("In Archives: " + inArch);
                    f.last.textContent = parts.join(" | ");
                    f.last.style.color = unused.length ? BELL_ORANGE : "#9fd6cf";
                    f.last.title = (use ? use.used + " used of " + use.max + " max (" + use.mode + "); " + files.length +
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
                if (!loader || !s.name || !projects.includes(s.name)) return;
                await loadFolderFiles();
                const refState = loader.mmGetState();
                const ch = folderChanges(refState, f, s.path, snapshotOf(s, f));
                const unused = unusedOf(f, refState);
                if (!ch.added.length && !ch.removed.length && !unused.length) return;
                const items = saveItems(refState).filter((i) => i.folder === f);
                let plan = [];
                try {
                    if (ch.added.length) plan = (await apiPost("/mmproject/save_plan", { project: s.path, items })).plan;
                } catch (e) {
                    say(e.message);
                    return;
                }
                const copies = plan.filter((x) => x.action === "copy");
                const missing = plan.filter((x) => x.action === "missing");
                const html = (copies.length ? copies.length + " file(s) to copy into <b>" + escapeHtml(f) + "</b>: " +
                    nameList(copies.map((x) => x.src)) : "No file to copy") +
                    (missing.length ? '<br><span style="color:' + ORANGE + '">' + missing.length +
                        " missing on disk (not copied): " + nameList(missing.map((x) => x.src)) + "</span>" : "") +
                    (ch.removed.length ? "<br>" + ch.removed.length + " reference(s) removed in the Reference Loader: " +
                        nameList(ch.removed) : "") +
                    (unused.length ? "<br>→ moved to <b>" + escapeHtml(f) + "/Archives</b>: " + nameList(unused) +
                        '<br><span style="color:#999">Files no list of the Reference Loader uses anymore; nothing is ' +
                        "deleted.</span>" : "") +
                    (copies.length ? '<div style="color:#999;margin-top:8px">Then the Reference Loader uses the copies ' +
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
                        if (same) loader.mmSetState(remapState(latest, mapFolderBySequence(f, data.dsts)));
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
                if (s.name && projects.includes(s.name)) {
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
                const wf = currentWorkflow();
                const info = await apiPost("/mmproject/save_workflow", {
                    project: s.path, name, content: JSON.stringify(wf, null, 2) + "\n", archive: archive || null,
                });
                setState({ wfPath: s.path, wfName: info.name, wfValidated: !!validated });
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
                if (!s.name || !projects.includes(s.name)) return;
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
                        defaultName: name, full, message, again });
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
                if (!s.name || !projects.includes(s.name)) return;
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
            const runs = new Map(); // prompt_id -> {file, files}
            // Runs en cours qui contiennent ce noeud : Load et Save verrouilles. Un Run deja
            // termine avant la reponse de /queue (Run tres court) n'est jamais verrouille.
            const endedRuns = [];
            const onRunStart = async (e) => {
                const id = e && e.detail && e.detail.prompt_id;
                if (!id) return;
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
                if (!runs.has(id)) runs.set(id, { file: "", files: [] });
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
                    const data = await apiPost("/mmproject/run_done", { run_file: run.file, files: run.files, status });
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
                setState({
                    root: data.root, name: data.name, path: data.path, folder: loader && moved ? "" : custom,
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

            select.addEventListener("change", () => openProject(select.value));
            editBtn.addEventListener("click", () => {
                const s = getState();
                if (s.name && projects.includes(s.name)) renameDialog.open(s.path);
            });
            // ---- Configuration du projet (99.Project-Config) ----

            /**
             * Ecrit config_projets_<projet>.json (l'ancien part dans Archives). Un fichier
             * d'un dossier de medias sans indice arrete la sauvegarde : liste affichee.
             */
            async function saveProjectConfig() {
                const s = getState();
                if (!s.name || !projects.includes(s.name)) return false;
                const loader = linkedLoader(node);
                const st = loader ? loader.mmGetState() : {};
                let res;
                let data = null;
                try {
                    res = await fetch("/mmproject/config/save", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            project: s.path, refs: configRefs(st), trims: st.trims || {}, mode: st.mode || "ref2va",
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
                            "needs an index: use it in the Reference Loader, or move it to the Archives folder." +
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
            async function loadProject() {
                const s = getState();
                if (!s.name || !projects.includes(s.name)) return;
                let report;
                say("Checking the files of the project...", true);
                try {
                    report = await apiPost("/mmproject/config/check", { project: s.path, current: currentWorkflow() });
                } catch (e) {
                    say(e.message);
                    return;
                }
                say("");
                const checked = await loadDialog.open(report, s.path);
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
                        if (wf.same) {
                            // Meme structure : l'onglet actuel recoit la configuration sauvegardee.
                            const active = app.extensionManager && app.extensionManager.workflow &&
                                app.extensionManager.workflow.activeWorkflow;
                            await app.loadGraphData(data, true, true, active || null);
                        } else {
                            await openInNewTab(data, copyTabName(wf.name));
                            say("Loaded in a new tab: " + copyTabName(wf.name) + "." + restored, true);
                        }
                        return;
                    }
                    if (media.length) {
                        const loader = linkedLoader(node);
                        if (!loader) {
                            say("Wire the project output of the Reference Loader to load its files." + restored);
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
            saveBtn.addEventListener("click", async () => {
                const r = await saveAll(false);
                if (r === "cancel" || r === "error") return;
                await loadWorkflowInfo();
                if (!wfInfo.current) await saveWorkflowDirect();
                else if (bellState() === "orange") await workflowStep();
                await loadWorkflowInfo();
                await saveProjectConfig();
            });
            loadBtn.addEventListener("click", () => loadProject());
            newBtn.addEventListener("click", async () => {
                await loadProjects();
                createDialog.open({
                    root: folder.linked || folder.custom ? folder.root : fallbackRoot,
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
                return s.name && projects.includes(s.name) ? { name: s.name, path: s.path } : null;
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
                // Sortie "project" d'une version de test (sens inverse) : retiree avec son lien.
                while (node.outputs && node.outputs.length) node.removeOutput(node.outputs.length - 1);
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
