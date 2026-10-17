import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import {
    TITLE_COLOR, BODY_COLOR, VIOLET, PINK, ORANGE, GREEN, INACTIVE_BG,
    svg, iconBadge, hList, hSteps, hTip, hNote, hCard, FOLDER_ICON, REFRESH_ICON, GEAR_ICON, START_ICON,
    IMAGE_ICON, VIDEO_ICON, AUDIO_ICON,
    makeOverlay, makeIconButton, makeTextButton, positionCardNextToNode, apiGet, hideWidget,
    escapeHtml, buildHelpOverlay, vueMode,
} from "./minimax_ref_loader.js";
import {
    PROJECT_SUBFOLDERS, FOLDER_COLORS, projectNameError, parseProjectState, saveItems, remapState, mapBySequence,
    mapByPrefix, configFileName, modeHasRefs, UPDATE_FOLDERS, folderPaths, folderSnapshot, folderChanges,
    mapFolderBySequence, withoutMedia,
} from "./project_paths.js";
import { formatConfigJson } from "./config_format.js";
import { diffWorkflows, workflowSignature, formatLastSave, shortValue } from "./workflow_diff.js";

// Noeud "MiniMax H3 Project" : cree ou choisit un dossier de projet dans le
// Root folder recu du MiniMax H3 Reference Loader (entree "project"), ou
// dans le dossier par defaut <input de ComfyUI>/Projets.

const NODE_NAME = "MiniMaxH3Project";
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
            [iconBadge(SAVE_ICON, PINK), "Save: copy the files of the Reference Loader into the project"],
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
            "files (the Reference Loader then uses the copies). Removed references are only taken into account: " +
            "no file is deleted. The bell goes back to grey and the sign goes away.</p>" +
            hNote("This is not a change of the workflow: no configuration is written, and the bell of 00.Workflows " +
                "ignores the content of the lists of the Reference Loader.") +
            hNote("A subfolder deleted by mistake is created again when you pick the project.") +
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
        id: "save", title: "Save", icon: SAVE_ICON, color: PINK,
        html: "<p>" + iconBadge(SAVE_ICON, PINK) + " needs a project and the Reference Loader wired. It shows " +
            "what it will do and asks for a confirmation, then:</p>" +
            hList([
                "copies the files of the Reference Loader (both modes) into the project: Images, First and Last " +
                "frame in <b>08.Images</b>, Video in <b>12.Video</b>, Video/Audio in <b>14.Video-Audio</b>, " +
                "Audio in <b>10.Son</b>;",
                "saves the configuration of each mode in <b>00.Workflows</b>, named " +
                "<b>yyyyMMdd-HHmmss_REF2VA_minimax_config.json</b> (and FL2VA);",
                "makes the Reference Loader use the copies of the project;",
                "then saves the workflow (directly the first time, through the bell window when it has changed).",
            ]) +
            hNote("A file already in the project is not copied again; another file with the same name is " +
                "copied as <b>name (2)</b>.") +
            hTip("Right after creating a project, a first save is offered: all the files are copied to their " +
                "folders once you confirm."),
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
            "the name of the project, which you can change. <b>Save</b> confirms.</p>" +
            hList([
                "The workflow row shows <b>Last save: dd/MM/yyyy at hh:mm:ss</b>.",
                iconBadge(ARCHIVE_ICON, VIOLET) + " (right of the bell, active when there are archives) opens an " +
                "archived workflow in a new tab; the current one is not changed.",
                "At most <b>5 archives</b> per project. With 5, the archives get a check box: check the ones to " +
                "delete, then <b>Delete</b> deletes them and proposes the save (<b>Cancel</b> closes the window). " +
                "In the bell window, <b>Save</b> with <b>Archive it</b> opens this list first; <b>Overwrite</b> " +
                "saves directly.",
                "When a project is created, the workflow is saved right away; " + iconBadge(SAVE_ICON, PINK) +
                " also saves it (through the bell window when it has changed).",
            ]) +
            hNote("Moving nodes alone does not turn the bell orange; it is listed as a layout change."),
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
            [iconBadge(SAVE_ICON, PINK), "Save : copier les fichiers du Reference Loader dans le projet"],
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
            "copie les nouveaux fichiers (le Reference Loader utilise ensuite les copies). Les références retirées " +
            "sont seulement prises en compte : aucun fichier n'est effacé. La cloche redevient grise et le sigle " +
            "disparaît.</p>" +
            hNote("Ce n'est pas une modification du workflow : aucune configuration n'est écrite, et la cloche de " +
                "00.Workflows ignore le contenu des listes du Reference Loader.", "Remarque :") +
            hNote("Un sous-dossier supprimé par erreur est recréé quand vous choisissez le projet.", "Remarque :") +
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
        id: "save", title: "Save",
        html: "<p>" + iconBadge(SAVE_ICON, PINK) + " demande un projet et le Reference Loader relié. Il montre " +
            "ce qu'il va faire et demande une confirmation, puis :</p>" +
            hList([
                "copie les fichiers du Reference Loader (les deux modes) dans le projet : Images, First et Last " +
                "frame dans <b>08.Images</b>, Video dans <b>12.Video</b>, Video/Audio dans <b>14.Video-Audio</b>, " +
                "Audio dans <b>10.Son</b> ;",
                "enregistre la configuration de chaque mode dans <b>00.Workflows</b>, nommée " +
                "<b>yyyyMMdd-HHmmss_REF2VA_minimax_config.json</b> (et FL2VA) ;",
                "fait utiliser au Reference Loader les copies du projet ;",
                "puis sauvegarde le workflow (directement la première fois, par la fenêtre de la cloche s'il a changé).",
            ]) +
            hNote("Un fichier déjà dans le projet n'est pas recopié ; un autre fichier de même nom est copié " +
                "en <b>nom (2)</b>.", "Remarque :") +
            hTip("Juste après la création d'un projet, une première sauvegarde est proposée : tous les fichiers " +
                "sont copiés dans leurs dossiers une fois confirmé.", "Astuce :"),
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
            "dossier) et propose le nom du projet, que vous pouvez changer. <b>Save</b> confirme.</p>" +
            hList([
                "La ligne du workflow affiche <b>Last save: dd/MM/yyyy at hh:mm:ss</b>.",
                iconBadge(ARCHIVE_ICON, VIOLET) + " (à droite de la cloche, actif s'il y a des archives) ouvre un " +
                "workflow archivé dans un nouvel onglet ; le workflow actuel ne change pas.",
                "<b>5 archives</b> au plus par projet. À 5, les archives ont une case à cocher : cochez celles à " +
                "supprimer, puis <b>Delete</b> les supprime et propose la sauvegarde (<b>Cancel</b> ferme la " +
                "fenêtre). Dans la fenêtre de la cloche, <b>Save</b> avec <b>Archive it</b> ouvre d'abord cette " +
                "liste ; <b>Overwrite</b> sauvegarde directement.",
                "À la création d'un projet, le workflow est sauvegardé tout de suite ; " + iconBadge(SAVE_ICON, PINK) +
                " le sauvegarde aussi (par la fenêtre de la cloche s'il a changé).",
            ]) +
            hNote("Déplacer des nœuds seulement ne fait pas passer la cloche à l'orange ; c'est listé comme un " +
                "changement de disposition.", "Remarque :"),
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
    const cancelBtn = makeTextButton("Cancel", INACTIVE_BG);
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
    }

    function finish(result) {
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
        const r = resolve;
        resolve = null;
        if (r) r(result);
    }

    function submit() {
        const name = input.value.trim().replace(/\.json$/i, "").trim();
        const err = projectNameError(name).replace("The project name", "The workflow name") ||
            (/^\d{8}-\d{6}_/.test(name) ? "A workflow name cannot start with a date (kept for the archives)." : "");
        if (err) {
            error.textContent = err;
            input.style.borderColor = ORANGE;
            return;
        }
        finish({ name, archive: archiveBox.style.display !== "none" && archive });
    }

    const onKey = (e) => {
        if (overlay.style.display === "none") return;
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopImmediatePropagation();
            finish(null);
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
    overlay.addEventListener("mousedown", () => finish(null));

    return {
        /** opts.full = la limite d'archives est atteinte (note sous la pilule). */
        open(opts) {
            if (resolve) finish(null);
            changesTitle.textContent = opts.previous ? "Changes since the last save of " + opts.previous + ":"
                : "No saved workflow yet.";
            changes.innerHTML = opts.changesHtml;
            changes.style.display = opts.previous ? "block" : "none";
            archiveBox.style.display = opts.previous ? "block" : "none";
            archiveLabel.innerHTML = "Archive the previous workflow? It goes to <b>00.Workflows/Archives</b> as " +
                "<b>yyyyMMdd-HHmmss_" + escapeHtml(opts.previous || "") + "</b> (date of its last save).";
            archive = true;
            full = !!opts.full;
            paintPill();
            input.value = opts.defaultName;
            input.style.borderColor = "#0c3833";
            error.textContent = "";
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            positionCardNextToNode(card, container, 520);
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
            const saveBtn = makeIconButton(PINK, SAVE_ICON, "Save");
            saveBtn.style.width = saveBtn.style.height = "22px";
            const reloadBtn = makeIconButton(VIOLET, REFRESH_ICON, "Read the list of projects again");
            reloadBtn.style.width = reloadBtn.style.height = "22px";
            const helpBtn = document.createElement("button");
            helpBtn.type = "button";
            helpBtn.textContent = "?";
            Object.assign(helpBtn.style, {
                width: "22px", height: "22px", borderRadius: "50%", border: "none", background: PINK,
                color: "white", fontWeight: "bold", cursor: "pointer", padding: "0", flex: "0 0 auto",
            });
            bottom.append(status, saveBtn, reloadBtn, helpBtn);

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
                // 00.Workflows : bouton des archives a droite de la cloche ; ailleurs, un espace.
                const arch = name === WORKFLOWS ? makeIconButton(INACTIVE_BG, ARCHIVE_ICON, "") : document.createElement("span");
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
            node.__mmprojectOverlays = [createDialog, help, confirm, renameDialog, workflowDialog, archiveMenu, deleteDialog];
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
                    f.btn.title = current ? path : "Pick or create a project first";
                    if (f.name !== WORKFLOWS && !UPDATE_FOLDERS.includes(f.name)) {
                        f.bell.title = current ? f.name + " - coming soon" : "";
                    }
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
                const canSave = current && !!linkedLoader(node);
                setOn(editBtn, current, VIOLET, current ? "Rename or move the project" : "Pick a project first");
                setOn(saveBtn, canSave, PINK, !current ? "Pick a project first"
                    : !canSave ? "Wire the project output of the Reference Loader first"
                        : "Save: copy the files of the Reference Loader into the project and save its configuration");
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
                    message = "";
                    render();
                    return;
                }
                try {
                    const data = await apiPost("/mmproject/open", { root: folder.root, name });
                    setState({ root: folder.root, name, path: data.path });
                    loadWorkflowInfo();
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
                    await saveAll(true);
                    await saveWorkflowDirect();
                }, 0);
            }

            /**
             * Save : copie les fichiers du Reference Loader dans les dossiers du
             * projet, enregistre sa configuration (par mode) dans 00.Workflows,
             * puis le Reference Loader pointe sur les copies. first = premiere
             * sauvegarde proposee juste apres la creation du projet.
             */
            async function saveAll(first) {
                const loader = linkedLoader(node);
                const s = getState();
                if (!loader || !s.name) return "error";
                const refState = loader.mmGetState();
                const items = saveItems(refState);
                const modes = ["ref2va", "fl2va"].filter((m) => modeHasRefs(refState, m));
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
                const now = new Date();
                const names = modes.map((m) => configFileName(now, m));
                const lines = Object.entries(byFolder).map(([f, n]) => n + " → <b>" + f + "</b>");
                const html = (first
                    ? "<b>All the files of the Reference Loader will be copied to their folders in the project.</b><br>"
                    : "") +
                    count("copy") + " file(s) to copy" + (lines.length ? ":<br>" + lines.join("<br>") : "") +
                    (count("skip") ? "<br>" + count("skip") + " already in the project" : "") +
                    (count("missing") ? '<br><span style="color:' + ORANGE + '">' + count("missing") +
                        " missing on disk (not copied)</span>" : "") +
                    "<br>Configuration in <b>00.Workflows</b>: " + names.map(escapeHtml).join(", ") +
                    '<div style="color:#999;margin-top:8px">Then the Reference Loader uses the copies of the project.</div>';
                const ok = await confirm.ask({
                    title: first ? "Initialize a first save?" : "Save the project?", html,
                    okLabel: first ? "Copy and save" : "Save", okColor: PINK,
                });
                if (!ok) return "cancel";
                say("Saving...", true);
                try {
                    // Destinations du plan : la configuration pointe deja sur les copies.
                    const planned = remapState(refState, mapBySequence(plan.map((x) => x.dst)));
                    const configs = modes.map((m, i) => ({
                        name: names[i], content: formatConfigJson(Object.assign({}, planned, { mode: m })),
                    }));
                    const data = await apiPost("/mmproject/save", { project: s.path, items, configs });
                    // Le Reference Loader a pu changer pendant la confirmation : on repart de son etat.
                    const latest = loader.mmGetState();
                    const same = JSON.stringify(saveItems(latest)) === JSON.stringify(items);
                    if (same) loader.mmSetState(remapState(latest, mapBySequence(data.dsts)));
                    setState({ snap: folderSnapshot(loader.mmGetState()), snapPath: getState().path });
                    paintFolders();
                    say("Saved: " + count("copy") + " file(s) copied, " + data.configs.length + " configuration(s).", true);
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

            /** Avertissement + cloche orange quand des references sont ajoutees ou retirees. */
            function paintFolders() {
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
                    if (!UPDATE_FOLDERS.includes(f.name)) continue;
                    const ch = refState ? folderChanges(refState, f.name, s.path, snapshotOf(s, f.name)) : null;
                    const changed = !!ch && (ch.added.length > 0 || ch.removed.length > 0);
                    const tip = !changed ? "" : (ch.added.length ? ch.added.length + " new reference(s) to copy" : "") +
                        (ch.added.length && ch.removed.length ? ", " : "") +
                        (ch.removed.length ? ch.removed.length + " reference(s) removed in the Reference Loader" : "");
                    f.warn.style.visibility = changed ? "visible" : "hidden";
                    f.warn.title = changed ? f.name + " has changed and is not updated yet: " + tip : "";
                    f.bell.style.background = changed ? BELL_ORANGE : INACTIVE_BG;
                    f.bell.style.opacity = changed ? "1" : "0.6";
                    f.bell.style.cursor = changed ? "pointer" : "default";
                    f.bell.title = !current ? "" : !loader ? "Link a Reference Loader to follow " + f.name
                        : changed ? tip + ": click to update " + f.name : f.name + " is up to date";
                }
            }

            const baseName = (p) => String(p).split(/[\\/]/).pop();
            const nameList = (paths) => {
                const shown = paths.slice(0, 8).map((p) => escapeHtml(baseName(p))).join(", ");
                return shown + (paths.length > 8 ? ", … (+" + (paths.length - 8) + ")" : "");
            };

            /** Cloche d'un dossier suivi : copie des ajouts (confirmee), prise en compte des retraits. */
            async function updateFolder(f) {
                const loader = linkedLoader(node);
                const s = getState();
                if (!loader || !s.name || !projects.includes(s.name)) return;
                const refState = loader.mmGetState();
                const ch = folderChanges(refState, f, s.path, snapshotOf(s, f));
                if (!ch.added.length && !ch.removed.length) return;
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
                        nameList(ch.removed) + '<br><span style="color:#999">The files stay in the folder.</span>' : "") +
                    (copies.length ? '<div style="color:#999;margin-top:8px">Then the Reference Loader uses the copies ' +
                        "of the project.</div>" : "");
                const ok = await confirm.ask({ title: "Update " + f + "?", html, okLabel: "Update", okColor: BELL_ORANGE });
                if (!ok) return;
                try {
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
                    say(f + " updated: " + copies.length + " file(s) copied.", true);
                } catch (e) {
                    say(e.message);
                }
                paintFolders();
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
                    const info = await writeWorkflow(s.name, null, false);
                    say("Workflow saved: " + info.name, true);
                } catch (e) {
                    say(e.message);
                }
            }

            /** Cloche : changements, archiver l'ancien ?, nom, puis sauvegarde (cloche verte). */
            async function workflowStep() {
                const s = getState();
                if (!s.name || !projects.includes(s.name)) return;
                await loadWorkflowInfo();
                const prev = wfInfo.current ? wfInfo.current.name : "";
                const diff = diffWorkflows(forCompare(savedWf), forCompare(currentWorkflow()), widgetNames());
                let name = s.name;
                let result = null;
                for (;;) {
                    const full = wfInfo.archives.length >= MAX_ARCHIVES;
                    result = await workflowDialog.open({ changesHtml: changesHtml(diff), previous: prev, defaultName: name, full });
                    if (!result) return;
                    if (!(result.archive && full)) break;
                    // Limite atteinte : choisir les archives a supprimer, puis la sauvegarde est reproposee.
                    name = result.name;
                    const names = await deleteDialog.open(wfInfo.archives);
                    if (!names) return;
                    await deleteArchives(names);
                }
                try {
                    const info = await writeWorkflow(result.name, result.archive ? prev : null, true);
                    say("Workflow saved: " + info.name + (info.archived ? " (previous one archived: " + info.archived + ")" : ""), true);
                } catch (e) {
                    say(e.message);
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
                    await app.loadGraphData(JSON.parse(await res.text()), true, true, a.name);
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
            node.__mmprojectUnlisten = () => {
                api.removeEventListener("graphChanged", onGraphChanged);
                GESTURES.forEach((t) => document.removeEventListener(t, scheduleRecheck, true));
                clearTimeout(recheck);
            };
            // Secours espace : changements faits par un script, sans action de l'utilisateur.
            node.__mmprojectTimer = setInterval(() => refreshIndicators(), FALLBACK_CHECK_MS);
            for (const f of folderRows) {
                if (UPDATE_FOLDERS.includes(f.name)) f.bell.addEventListener("click", () => updateFolder(f.name));
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
            // Save : fichiers et configuration, puis le workflow (directement s'il
            // n'a jamais ete sauvegarde, sinon la fenetre de la cloche s'il a change).
            saveBtn.addEventListener("click", async () => {
                const r = await saveAll(false);
                if (r === "cancel" || r === "error") return;
                await loadWorkflowInfo();
                if (!wfInfo.current) await saveWorkflowDirect();
                else if (bellState() === "orange") await workflowStep();
            });
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
                paintFolders();
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
