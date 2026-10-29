// MagicStudio SelectMod (choix utilisateur 28/10/2026) : copie adaptee de
// multi_file_select.js (MultiFiles Select), sans aucun import de ce paquet.
// Ne lit que les dossiers de modeles (models, Models (Linker)) : routes
// /mmselectmod/... controlees par le serveur (select_mod.py). Le bouton dossier
// ouvre une fenetre MagicStudio (arbre + tableau des fichiers, buildModelPicker).
import { app } from "../../scripts/app.js";
import { filterSections, findMatches, queryWords, pickLanguage, HELP_LANGUAGES } from "./help_search.js";
import { exportFileName, buildExport, parseFieldsFile, sortFiles, sizeText } from "./select_mod.js";

const NODE_NAME = "MagicStudioSelectMod";

const TITLE_COLOR = "#3eaca5";
const BODY_COLOR = "#097267";
const VIOLET = "#6a5fd3";
const PINK = "#d35fa8";
const ORANGE = "#e0793c";
const GREEN = "#43a047";
const INACTIVE_BG = "#2a2a2a";
const INACTIVE_FG = "#888";
// Fond des boutons ronds discrets (aide "?", roue du dossier de sauvegarde).
const SETTINGS_BG = "#0c3833";

// 5 champs de base + 2 champs optionnels ajoutes a la demande (bouton
// "+"), un par un, chacun avec sa propre sortie ("Option 1", "Option 2").
const BASE_FIELDS = 5;
const MAX_FIELDS = 7;
const OPTION_OUTPUT_NAMES = ["Option 1", "Option 2"];
// Sortie "model_link" (dossier de sauvegarde) : toujours presente, juste
// apres les 5 sorties de base et avant les options.
const LINK_OUTPUT = BASE_FIELDS;
const LINK_OUTPUT_NAME = "model_link";

/** Index de la sortie du champ f (1..7) : les options passent apres model_link. */
function fieldOutIndex(f) {
    return f <= BASE_FIELDS ? f - 1 : f;
}

/**
 * Workflow enregistre avant model_link : insere la sortie a son index
 * (avant Option 1 / Option 2) dans les donnees sauvegardees, et decale
 * les liens et les noms manuels des options. A appeler AVANT configure()
 * de ComfyUI, qui renomme les sorties d'apres leur index. Ne fait rien
 * si la sortie est deja la.
 */
function migrateLinkOutput(node, info) {
    const outs = info && info.outputs;
    if (!Array.isArray(outs) || outs.length < LINK_OUTPUT) return;
    if (outs.some((o) => o && o.name === LINK_OUTPUT_NAME)) return;
    outs.splice(LINK_OUTPUT, 0, { name: LINK_OUTPUT_NAME, type: "*", links: null });
    const links = node.graph && node.graph.links;
    for (let k = LINK_OUTPUT + 1; k < outs.length; k++) {
        for (const id of (outs[k] && outs[k].links) || []) {
            const l = links && (typeof links.get === "function" ? links.get(id) : links[id]);
            if (l) l.origin_slot = k;
        }
    }
    const manual = info.properties && info.properties.manualLabels;
    if (manual) {
        for (let key = outs.length - 1; key > LINK_OUTPUT; key--) {
            if (manual[key]) {
                manual[key + 1] = true;
                delete manual[key];
            }
        }
    }
}
// Hauteur ajoutee au noeud par option : une ligne de champ (~26px) plus
// une ligne de sortie sur le canvas (~20px).
const OPTION_ROW_HEIGHT = 46;

const SEARCH_ICON =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="11" cy="11" r="7"></circle>' +
    '<line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';

const GEAR_ICON =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="3"></circle>' +
    '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>' +
    "</svg>";

const TRASH_ICON =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="white" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="3 6 5 6 21 6"></polyline>' +
    '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>' +
    '<path d="M10 11v6"></path><path d="M14 11v6"></path>' +
    '<path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>';

const DOWNLOAD_ICON =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 3v12"></path>' +
    '<path d="M7 10l5 5 5-5"></path>' +
    '<path d="M5 21h14"></path></svg>';

const UPLOAD_ICON =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 21V9"></path>' +
    '<path d="M7 14l5-5 5 5"></path>' +
    '<path d="M5 3h14"></path></svg>';

/**
 * Petit badge rond ou carre arrondi (comme les vrais boutons icone) a
 * inserer directement dans le texte d'aide, pour montrer l'icone reelle
 * plutot que d'ecrire son nom ("icone de televersement", etc.).
 */
function iconBadge(icon, bg, round) {
    return (
        '<span style="display:inline-flex;align-items:center;justify-content:center;' +
        "width:18px;height:18px;border-radius:" + (round ? "50%" : "4px") + ";" +
        "background:" + bg + ";vertical-align:middle;margin:0 2px;flex:0 0 auto;\">" +
        icon +
        "</span>"
    );
}

// ------ Aide : icones des rubriques et petits blocs de mise en page ------
const helpSvg = (inner, size) =>
    '<svg viewBox="0 0 24 24" width="' + (size || 13) + '" height="' + (size || 13) + '" fill="none" ' +
    'stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + inner + "</svg>";
const START_ICON = helpSvg('<polygon points="6 4 20 12 6 20 6 4"></polygon>');
const FOLDER_ICON = helpSvg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>');
const FIELDS_ICON = helpSvg(
    '<line x1="9" y1="6" x2="20" y2="6"></line><line x1="9" y1="12" x2="20" y2="12"></line>' +
    '<line x1="9" y1="18" x2="20" y2="18"></line><circle cx="4.5" cy="6" r="1"></circle>' +
    '<circle cx="4.5" cy="12" r="1"></circle><circle cx="4.5" cy="18" r="1"></circle>');
const TAG_ICON = helpSvg(
    '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"></path>' +
    '<circle cx="7.5" cy="7.5" r="1.2"></circle>');
const PLUS_ICON = helpSvg('<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>');
const MINUS_ICON = helpSvg('<line x1="5" y1="12" x2="19" y2="12"></line>');
const OUTPUT_ICON = helpSvg(
    '<path d="M3 12h11"></path><polyline points="10 8 14 12 10 16"></polyline><circle cx="19" cy="12" r="2.5"></circle>');
const INFO_ICON = helpSvg(
    '<circle cx="12" cy="12" r="9"></circle><line x1="12" y1="11" x2="12" y2="16"></line>' +
    '<line x1="12" y1="8" x2="12" y2="8"></line>');
const GLOBE_ICON = helpSvg(
    '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path>' +
    '<path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"></path>', 14);
const CLOSE_ICON = helpSvg('<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>', 14);

// Badges des boutons du noeud, tels qu'ils apparaissent a l'ecran.
const B_FOLDER = iconBadge(FOLDER_ICON, VIOLET);
const B_GEAR = iconBadge(GEAR_ICON, SETTINGS_BG, true);
const B_DIRS = iconBadge(SEARCH_ICON, VIOLET);
const B_FILES = iconBadge(SEARCH_ICON, PINK);
const B_DOWNLOAD = iconBadge(DOWNLOAD_ICON, PINK, true);
const B_UPLOAD = iconBadge(UPLOAD_ICON, PINK, true);
const B_TRASH = iconBadge(TRASH_ICON, "#6b2b2b");
const B_PLUS = iconBadge(PLUS_ICON, PINK, true);
const B_MINUS = iconBadge(MINUS_ICON, "#6b2b2b", true);
const B_C = iconBadge('<b style="color:#f0c98a;font-size:10px;">C</b>', "#5a3d1a", true);
const B_HELP = iconBadge('<b style="color:#bfe9e3;font-size:11px;">?</b>', "#0c3833", true);
const B_FIELD = (n) => iconBadge('<b style="color:#fff;font-size:10px;">' + n + "</b>", PINK);

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
            "Choose the active field (" + B_FIELD(1) + " to " + B_FIELD(5) + ") and <b>Absolute</b> or <b>Relative</b>.",
            "Click " + B_FOLDER + ": the window of the models folders opens next to the node.",
            "Click a file: its path goes into the active field and out on its output. A double-click also closes the window.",
        ]) +
        hCard("Buttons of the node", [
            [B_FOLDER, "Open the window of the models folders (tree and files)"],
            [B_DIRS, "List the subfolders of the origin directory"],
            [B_FILES, "List the files of the selected directory"],
            [B_DOWNLOAD, "Export the filled fields (.json)"],
            [B_UPLOAD, "Import a fields file (SelectMod or MultiFiles Select)"],
            [B_GEAR, "Choose the save folder of the exports"],
            [B_TRASH, "Clear a field and its Type"],
            [B_PLUS + " " + B_MINUS, "Add / remove the optional fields 6 and 7"],
            [B_C, "Turn the overwrite confirmation back on"],
            [B_HELP, "This help"],
        ]) +
        hNote("SelectMod only reads the models folders: <b>models</b> of ComfyUI and <b>Models (Linker)</b>."),
    },
    {
        id: "fields", title: "Fields", icon: FIELDS_ICON, color: PINK,
        html: hList([
            "The square buttons choose the field that receives the next file. Only one is active at a time.",
            "The small <b>Type</b> field fills in with the folder that follows <b>models</b>, e.g. <b>vae</b>.",
            "A field can be typed or edited by hand.",
            B_TRASH + " clears the field and its <b>Type</b> at once.",
            B_PLUS + " adds field 6 (<b>Option 1</b>), then field 7 (<b>Option 2</b>); " + B_MINUS + " removes the last one.",
            "Outputs: <b>unused 1</b> to <b>unused 5</b> (fields 1 to 5), <b>model_link</b> (the save folder), " +
                "<b>Option 1</b> / <b>Option 2</b>. A double-click on an output name renames it.",
        ]) +
        hCard("Overwriting a filled field", [
            ["⚠️", "A confirmation is asked before a file replaces a value."],
            ["☑️", "<b>Don't ask again</b> turns it off for this node."],
            [B_C, "Shown while it is off: click it to turn the confirmation back on."],
        ]),
    },
    {
        id: "window", title: "The folder window", icon: FOLDER_ICON, color: VIOLET,
        html: hList([
            "<b>Left</b>: the folders of <b>models</b> and <b>Models (Linker)</b>; ▸ opens a folder, the number is its model files.",
            "<b>Right</b>: the files of the chosen folder, with size and date. A click on a column title sorts it.",
            "<b>Search</b> (top): files of the folder and of its subfolders whose name holds every word.",
            "<b>One click</b> fills the active field and keeps the window open; <b>double-click</b> fills and closes.",
            "<b>↺</b> reads the folders again. The bottom line shows the full path of the file under the mouse.",
            "Close, Escape or a click outside closes the window.",
        ]) +
        hTip("the window opens on the folder of the active field, otherwise on the last folder used."),
    },
    {
        id: "mode", title: "Absolute / Relative", icon: TAG_ICON, color: ORANGE,
        html: hCard("Format of the path written at the click", [
            ["<b>Absolute</b>", "the full path, e.g. <b>G:\\GenerateurIA\\models\\vae\\v.safetensors</b>"],
            ["<b>Relative</b>", "the path from the models folder, e.g. <b>vae/v.safetensors</b>"],
        ]) +
        hList([
            "A filled field keeps its format, even if you switch the mode to fill another one.",
            "At run time, a path outside the models folders is refused with a message.",
        ]),
    },
    {
        id: "export", title: "Export / Import", icon: DOWNLOAD_ICON, color: PINK,
        html: hCard("Fields file (.json)", [
            [B_DOWNLOAD, "Exports the filled fields to <b>yyyyMMdd-HHmmss_selectmod_fields.json</b>."],
            [B_GEAR, "Sets the <b>save folder</b>: the export is written there; without it, the browser downloads it."],
            [B_UPLOAD, "Imports a SelectMod file, or a file exported by <b>MultiFiles Select</b> (.json or old .txt)."],
        ]) +
        hTip("to move from MultiFiles Select to SelectMod: export from MultiFiles Select, import in SelectMod."),
    },
    {
        id: "project", title: "Link to the Project node", icon: OUTPUT_ICON, color: GREEN,
        html: hSteps([
            "Wire the <b>model_link</b> output to the <b>models_link</b> input of <b>MagicStudio Project</b>.",
            "Without a save folder, the Project node sets it to <b>02.Models</b> of the project.",
            "Each run then records the models of the fields (window <b>02.Models</b> of the Project node).",
        ]) +
        hNote("it works like MultiFiles Select: old workflows with MultiFiles Select keep working."),
    },
    {
        id: "good", title: "Good to know", icon: INFO_ICON, color: TITLE_COLOR,
        html: hList([
            "<b>.json</b>, <b>.info</b>, <b>.md</b> and <b>.sha*</b> files are never listed.",
            "A folder typed by hand outside the models folders is refused; the old value is kept.",
            "Works with the classic node design and with <b>Nodes 2.0</b>.",
            "The value of an output is a text string: a node waiting for an image or a model refuses it at run time.",
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
            "Choisissez le champ actif (" + B_FIELD(1) + " à " + B_FIELD(5) + ") et <b>Absolute</b> ou <b>Relative</b>.",
            "Cliquez sur " + B_FOLDER + " : la fenêtre des dossiers de modèles s'ouvre à côté du nœud.",
            "Cliquez sur un fichier : son chemin va dans le champ actif et sort sur sa sortie. Un double-clic ferme aussi la fenêtre.",
        ]) +
        hCard("Boutons du nœud", [
            [B_FOLDER, "Ouvrir la fenêtre des dossiers de modèles (arbre et fichiers)"],
            [B_DIRS, "Lister les sous-dossiers du répertoire d'origine"],
            [B_FILES, "Lister les fichiers du répertoire sélectionné"],
            [B_DOWNLOAD, "Exporter les champs remplis (.json)"],
            [B_UPLOAD, "Importer un fichier de champs (SelectMod ou MultiFiles Select)"],
            [B_GEAR, "Choisir le dossier de sauvegarde des exports"],
            [B_TRASH, "Vider un champ et son Type"],
            [B_PLUS + " " + B_MINUS, "Ajouter / retirer les champs optionnels 6 et 7"],
            [B_C, "Réactiver la confirmation avant écrasement"],
            [B_HELP, "Cette aide"],
        ]) +
        hNote("SelectMod ne lit que les dossiers de modèles : <b>models</b> de ComfyUI et <b>Models (Linker)</b>.", NOTE_FR),
    },
    {
        id: "fields", title: "Champs",
        html: hList([
            "Les boutons carrés choisissent le champ qui reçoit le prochain fichier. Un seul est actif à la fois.",
            "Le petit champ <b>Type</b> se remplit avec le dossier qui suit <b>models</b>, par ex. <b>vae</b>.",
            "Un champ peut être tapé ou modifié à la main.",
            B_TRASH + " vide le champ et son <b>Type</b> d'un coup.",
            B_PLUS + " ajoute le champ 6 (<b>Option 1</b>), puis le champ 7 (<b>Option 2</b>) ; " + B_MINUS + " retire le dernier.",
            "Sorties : <b>unused 1</b> à <b>unused 5</b> (champs 1 à 5), <b>model_link</b> (le dossier de sauvegarde), " +
                "<b>Option 1</b> / <b>Option 2</b>. Un double-clic sur le nom d'une sortie la renomme.",
        ]) +
        hCard("Écraser un champ rempli", [
            ["⚠️", "Une confirmation est demandée avant qu'un fichier remplace une valeur."],
            ["☑️", "<b>Don't ask again</b> la désactive pour ce nœud."],
            [B_C, "Affiché tant qu'elle est désactivée : cliquez pour la réactiver."],
        ]),
    },
    {
        id: "window", title: "La fenêtre des dossiers",
        html: hList([
            "<b>À gauche</b> : les dossiers de <b>models</b> et <b>Models (Linker)</b> ; ▸ ouvre un dossier, le nombre est celui de ses fichiers de modèles.",
            "<b>À droite</b> : les fichiers du dossier choisi, avec taille et date. Un clic sur le titre d'une colonne la trie.",
            "<b>Recherche</b> (en haut) : fichiers du dossier et de ses sous-dossiers dont le nom contient tous les mots.",
            "<b>Un clic</b> remplit le champ actif et garde la fenêtre ouverte ; <b>double-clic</b> remplit et ferme.",
            "<b>↺</b> relit les dossiers. La ligne du bas montre le chemin complet du fichier sous la souris.",
            "Close, Échap ou un clic à côté ferme la fenêtre.",
        ]) +
        hTip("la fenêtre s'ouvre sur le dossier du champ actif, sinon sur le dernier dossier utilisé.", TIP_FR),
    },
    {
        id: "mode", title: "Absolute / Relative",
        html: hCard("Format du chemin écrit au clic", [
            ["<b>Absolute</b>", "le chemin complet, par ex. <b>G:\\GenerateurIA\\models\\vae\\v.safetensors</b>"],
            ["<b>Relative</b>", "le chemin depuis le dossier de modèles, par ex. <b>vae/v.safetensors</b>"],
        ]) +
        hList([
            "Un champ rempli garde son format, même si vous changez de mode pour en remplir un autre.",
            "Au Run, un chemin hors des dossiers de modèles est refusé avec un message.",
        ]),
    },
    {
        id: "export", title: "Export / Import",
        html: hCard("Fichier de champs (.json)", [
            [B_DOWNLOAD, "Exporte les champs remplis dans <b>yyyyMMdd-HHmmss_selectmod_fields.json</b>."],
            [B_GEAR, "Fixe le <b>dossier de sauvegarde</b> : l'export y est écrit ; sans lui, le navigateur le télécharge."],
            [B_UPLOAD, "Importe un fichier SelectMod, ou un fichier exporté par <b>MultiFiles Select</b> (.json ou ancien .txt)."],
        ]) +
        hTip("pour passer de MultiFiles Select à SelectMod : exportez depuis MultiFiles Select, importez dans SelectMod.", TIP_FR),
    },
    {
        id: "project", title: "Lien avec le nœud Project",
        html: hSteps([
            "Branchez la sortie <b>model_link</b> sur l'entrée <b>models_link</b> de <b>MagicStudio Project</b>.",
            "Sans dossier de sauvegarde, le nœud Project le règle sur <b>02.Models</b> du projet.",
            "Chaque Run enregistre alors les modèles des champs (fenêtre <b>02.Models</b> du nœud Project).",
        ]) +
        hNote("cela marche comme MultiFiles Select : les anciens workflows avec MultiFiles Select continuent de marcher.", NOTE_FR),
    },
    {
        id: "good", title: "Bon à savoir",
        html: hList([
            "Les fichiers <b>.json</b>, <b>.info</b>, <b>.md</b> et <b>.sha*</b> ne sont jamais listés.",
            "Un dossier tapé à la main hors des dossiers de modèles est refusé ; l'ancienne valeur est gardée.",
            "Marche avec le design classique des nœuds et avec <b>Nodes 2.0</b>.",
            "La valeur d'une sortie est un texte : un nœud qui attend une image ou un modèle la refuse au Run.",
        ]),
    },
];

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

function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Zone (coordonnees locales au noeud) de l'etiquette de la sortie i :
 * de 45% de la largeur du noeud jusqu'a son bord droit, sur la hauteur
 * d'une ligne de slot centree sur le point de connexion.
 */
function outputLabelRect(node, i) {
    const slotH = (window.LiteGraph && window.LiteGraph.NODE_SLOT_HEIGHT) || 20;
    const dot = node.getConnectionPos(false, i);
    const x = node.size[0] * 0.45;
    return {
        x: x,
        y: dot[1] - node.pos[1] - slotH / 2,
        w: node.size[0] - x,
        h: slotH,
    };
}

/** Index de la sortie dont l'etiquette est sous pos (local), sinon -1. */
function hitOutputLabel(node, pos) {
    if (!node.outputs || (node.flags && node.flags.collapsed)) return -1;
    for (let i = 0; i < node.outputs.length; i++) {
        const r = outputLabelRect(node, i);
        if (pos[0] >= r.x && pos[0] <= r.x + r.w &&
            pos[1] >= r.y && pos[1] <= r.y + r.h) {
            return i;
        }
    }
    return -1;
}

let activeOutputEditor = null;

/**
 * Renommage manuel de la sortie i (index 0) : un nom saisi a la main
 * est marque "manuel" (node.properties.manualLabels) et n'est plus
 * ecrase par le nommage automatique d'apres le champ Type ; un nom vide
 * retire la marque et rend la sortie au nommage automatique. Valider
 * sans rien changer ne fait rien.
 */
function setManualOutputLabel(node, i, value) {
    const out = node.outputs[i];
    const trimmed = (value || "").trim();
    if (trimmed === (out.label || out.name)) return;
    if (!node.properties.manualLabels) node.properties.manualLabels = {};
    if (trimmed) {
        out.label = trimmed;
        node.properties.manualLabels[i + 1] = true;
    } else {
        out.label = undefined;
        delete node.properties.manualLabels[i + 1];
    }
    if (node.__mfsApplyAutoLabels) node.__mfsApplyAutoLabels();
    node.setDirtyCanvas(true, true);
}

/**
 * Ouvre un champ de saisie par-dessus l'etiquette de la sortie i.
 * Entree / clic ailleurs : valide (vide = retour au nom par defaut).
 * Echap : annule. Ne modifie que node.outputs[i].label.
 */
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
        if (save) setManualOutputLabel(node, i, input.value);
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
// Nodes 2.0 (rendu Vue des noeuds) : les sorties sont des elements DOM, et
// les widgets caches restent affiches comme lignes d'entree (nom + point).
// En mode classique, rien de ce qui suit ne s'execute.
// --------------------------------------------------------------------
const vueMode = () => !!(window.LiteGraph && window.LiteGraph.vueNodesMode);
const vueNodes = new Set(); // noeuds SelectMod du graphe
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

/** Cache les lignes des widgets caches et branche le double-clic (Nodes 2.0). */
function syncVueNode(node) {
    const el = vueNodeEl(node);
    if (!el) return;
    (node.inputs || []).forEach((inp, i) => {
        if (!inp.widget) return;
        const dot = vueSlotDot(el, node, "in", i);
        const slot = dot && dot.closest(".lg-slot");
        // Ligne du widget (grille des widgets), sinon la ligne du point.
        const row = (slot && slot.closest(".lg-node-widgets > *")) || slot;
        if (row && row.style.display !== "none") row.style.display = "none";
    });
    if (el.__mfsWired) return;
    el.__mfsWired = true;
    // Vue recree les lignes a chaque changement : masquer a nouveau.
    new MutationObserver(scheduleVueSync).observe(el, { subtree: true, childList: true });
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

/**
 * Positionne une carte flottante ("fixed") contre le bord droit du noeud
 * (repere par son conteneur DOM), ou contre son bord gauche si la place
 * manque a droite, avec une marge fixe : elle ne touche jamais le noeud
 * et ne se superpose jamais dessus.
 */
function positionCardNextToNode(card, container, maxWidth) {
    const rect = container.getBoundingClientRect();
    const margin = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(maxWidth, vw - margin * 2);

    let left = rect.right + margin;
    if (left + width + margin > vw) {
        left = rect.left - margin - width;
    }
    left = Math.max(margin, Math.min(left, vw - width - margin));

    let top = rect.top;
    const height = Math.min(card.offsetHeight || 320, vh - margin * 2);
    top = Math.max(margin, Math.min(top, vh - height - margin));

    card.style.left = left + "px";
    card.style.top = top + "px";
}

/**
 * Fenetre d'aide : menu des rubriques a gauche, une rubrique a la fois a
 * droite, recherche, precedente / suivante, choix de la langue (EN/FR).
 * Placee a cote du noeud (positionCardNextToNode).
 */
function buildHelpOverlay(container) {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
        position: "fixed", inset: "0", background: "transparent", zIndex: "10000", display: "none",
    });
    const card = document.createElement("div");
    Object.assign(card.style, {
        position: "fixed", background: "#1e1e1e", color: "#ddd", border: "1px solid " + PINK,
        borderRadius: "10px", boxShadow: "0 8px 28px rgba(0,0,0,0.6)", fontFamily: "sans-serif",
        fontSize: "12px", boxSizing: "border-box", width: "min(760px, 94vw)", height: "min(560px, 84vh)",
        display: "flex", flexDirection: "column", overflow: "hidden", padding: "0",
    });
    card.addEventListener("mousedown", (e) => e.stopPropagation());
    card.addEventListener("click", (e) => e.stopPropagation());
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const makeHeaderButton = (icon) => {
        const b = document.createElement("button");
        b.type = "button";
        b.innerHTML = icon;
        Object.assign(b.style, {
            flex: "0 0 auto", width: "24px", height: "24px", display: "flex", alignItems: "center",
            justifyContent: "center", background: INACTIVE_BG, border: "none", borderRadius: "4px",
            cursor: "pointer", padding: "0",
        });
        return b;
    };

    // En-tete : titre, langue, recherche, fermeture.
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
    const closeBtn = makeHeaderButton(CLOSE_ICON);

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
    const langClose = makeHeaderButton(CLOSE_ICON);
    langClose.style.background = "transparent";
    langHead.append(langTitle, langClose);
    const langGrid = document.createElement("div");
    Object.assign(langGrid.style, { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" });
    langPop.append(langArrow, langHead, langGrid);
    card.appendChild(langPop);

    // Menu des rubriques a gauche, rubrique affichee a droite.
    const main = document.createElement("div");
    Object.assign(main.style, { flex: "1", minHeight: "0", display: "flex" });
    const nav = document.createElement("div");
    Object.assign(nav.style, {
        flex: "0 0 180px", borderRight: "1px solid #333", background: "#181818", padding: "8px 6px",
        overflowX: "hidden", overflowY: "auto", boxSizing: "border-box",
    });
    const content = document.createElement("div");
    Object.assign(content.style, {
        flex: "1", minWidth: "0", overflowX: "hidden", overflowY: "auto", padding: "14px 18px",
        lineHeight: "1.55", boxSizing: "border-box",
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
    let sections = helpSectionsFor(lang);
    let byId = Object.fromEntries(sections.map((sec) => [sec.id, sec]));
    let visible = sections.map((sec) => sec.id);
    let currentId = loadHelpSection();

    /** Textes de la fenetre dans la langue choisie. */
    function applyLanguage() {
        const ui = HELP_UI[lang];
        sections = helpSectionsFor(lang);
        byId = Object.fromEntries(sections.map((sec) => [sec.id, sec]));
        visible = filterSections(sections, search.value);
        if (visible.length && !visible.includes(currentId)) currentId = visible[0];
        title.textContent = "MagicStudio SelectMod — " + ui.title;
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
        saveHelpSection(id);
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
            if (!byId[currentId]) currentId = HELP_SECTIONS[0].id;
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
const HELP_LANG_KEY = "mmselectmod.helpLanguage";
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

// Derniere rubrique consultee (memoire du navigateur, facultative).
const HELP_SECTION_KEY = "mmselectmod.helpSection";
let helpSection = null;
function loadHelpSection() {
    if (helpSection) return helpSection;
    try {
        helpSection = localStorage.getItem(HELP_SECTION_KEY);
    } catch (e) {
        helpSection = null;
    }
    return helpSection || HELP_SECTIONS[0].id;
}
function saveHelpSection(id) {
    helpSection = id;
    try {
        localStorage.setItem(HELP_SECTION_KEY, id);
    } catch (e) {
        // Stockage indisponible : la rubrique est gardee pour cette session.
    }
}

/**
 * Petite fenetre de confirmation utilisee quand un clic sur un fichier va
 * remplacer une valeur deja presente dans un des 5 champs numerotes.
 * Construite une seule fois (lazy) puis reutilisee, avec un message et un
 * callback differents a chaque appel de show().
 */
function buildFieldOverwriteConfirmOverlay(container) {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "transparent";
    overlay.style.zIndex = "10001";
    overlay.style.display = "none";
    overlay.style.fontFamily = "sans-serif";

    const card = document.createElement("div");
    card.style.position = "fixed";
    card.style.background = "#181818";
    card.style.color = "#e6e6e6";
    card.style.width = "min(300px, 90vw)";
    card.style.borderRadius = "10px";
    card.style.padding = "16px 18px";
    card.style.boxShadow = "0 10px 40px rgba(0,0,0,0.5)";
    card.style.border = "1px solid #2a2a2a";

    const msg = document.createElement("div");
    msg.style.fontSize = "12px";
    msg.style.lineHeight = "1.5";
    msg.style.marginBottom = "12px";
    card.appendChild(msg);

    const checkRow = document.createElement("label");
    checkRow.style.display = "flex";
    checkRow.style.alignItems = "center";
    checkRow.style.gap = "6px";
    checkRow.style.fontSize = "11px";
    checkRow.style.color = "#aaa";
    checkRow.style.cursor = "pointer";
    checkRow.style.marginBottom = "14px";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    const checkLabel = document.createElement("span");
    checkLabel.textContent = "Don't ask again";
    checkRow.appendChild(checkbox);
    checkRow.appendChild(checkLabel);
    card.appendChild(checkRow);

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";
    btnRow.style.justifyContent = "flex-end";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.padding = "6px 12px";
    cancelBtn.style.borderRadius = "6px";
    cancelBtn.style.border = "none";
    cancelBtn.style.background = "#2a2a2a";
    cancelBtn.style.color = "#ddd";
    cancelBtn.style.fontSize = "11px";
    cancelBtn.style.cursor = "pointer";

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.textContent = "Confirm";
    confirmBtn.style.padding = "6px 12px";
    confirmBtn.style.borderRadius = "6px";
    confirmBtn.style.border = "none";
    confirmBtn.style.background = "#e0793c";
    confirmBtn.style.color = "#fff";
    confirmBtn.style.fontWeight = "700";
    confirmBtn.style.fontSize = "11px";
    confirmBtn.style.cursor = "pointer";

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    card.appendChild(btnRow);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    let currentOnResult = null;

    function close() {
        overlay.style.display = "none";
        currentOnResult = null;
    }

    cancelBtn.addEventListener("click", () => {
        const cb = currentOnResult;
        close();
        if (cb) cb(false, false);
    });
    confirmBtn.addEventListener("click", () => {
        const skip = checkbox.checked;
        const cb = currentOnResult;
        close();
        if (cb) cb(true, skip);
    });
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
            const cb = currentOnResult;
            close();
            if (cb) cb(false, false);
        }
    });

    return {
        show(fieldNumber, path, onResult) {
            msg.textContent =
                "Field " + fieldNumber + " already holds a value. " +
                "Replace it with:\n" + path + " ?";
            msg.style.whiteSpace = "pre-wrap";
            checkbox.checked = false;
            currentOnResult = onResult;
            overlay.style.display = "block";
            positionCardNextToNode(card, container, 320);
        },
    };
}

/**
 * Fenetre de confirmation simple (message + Annuler/Confirmer), meme
 * famille visuelle que celle d'ecrasement de champ. Utilisee avant de
 * retirer une option dont la sortie est connectee.
 */
function buildSimpleConfirmOverlay(container) {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "transparent";
    overlay.style.zIndex = "10001";
    overlay.style.display = "none";
    overlay.style.fontFamily = "sans-serif";

    const card = document.createElement("div");
    card.style.position = "fixed";
    card.style.background = "#181818";
    card.style.color = "#e6e6e6";
    card.style.width = "min(300px, 90vw)";
    card.style.borderRadius = "10px";
    card.style.padding = "16px 18px";
    card.style.boxShadow = "0 10px 40px rgba(0,0,0,0.5)";
    card.style.border = "1px solid #2a2a2a";

    const msg = document.createElement("div");
    msg.style.fontSize = "12px";
    msg.style.lineHeight = "1.5";
    msg.style.marginBottom = "14px";
    msg.style.whiteSpace = "pre-wrap";
    card.appendChild(msg);

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";
    btnRow.style.justifyContent = "flex-end";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.padding = "6px 12px";
    cancelBtn.style.borderRadius = "6px";
    cancelBtn.style.border = "none";
    cancelBtn.style.background = "#2a2a2a";
    cancelBtn.style.color = "#ddd";
    cancelBtn.style.fontSize = "11px";
    cancelBtn.style.cursor = "pointer";

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.textContent = "Confirm";
    confirmBtn.style.padding = "6px 12px";
    confirmBtn.style.borderRadius = "6px";
    confirmBtn.style.border = "none";
    confirmBtn.style.background = "#e0793c";
    confirmBtn.style.color = "#fff";
    confirmBtn.style.fontWeight = "700";
    confirmBtn.style.fontSize = "11px";
    confirmBtn.style.cursor = "pointer";

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    card.appendChild(btnRow);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    let currentOnResult = null;
    function finish(result) {
        const cb = currentOnResult;
        overlay.style.display = "none";
        currentOnResult = null;
        if (cb) cb(result);
    }
    cancelBtn.addEventListener("click", () => finish(false));
    confirmBtn.addEventListener("click", () => finish(true));
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) finish(false);
    });

    return {
        show(message, onResult) {
            msg.textContent = message;
            currentOnResult = onResult;
            overlay.style.display = "block";
            positionCardNextToNode(card, container, 320);
        },
    };
}

/**
 * Fenetre "Save folder" (roue crantee) : chemin modifiable, Browse
 * (explorateur Windows), effacer, Cancel / OK. Avertit si le dossier
 * n'existe pas. show(actuel, onOk(dossier)) ; dossier vide = pas de
 * dossier de sauvegarde (l'export est telecharge par le navigateur).
 */
function buildSaveFolderDialog(container) {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
        position: "fixed", inset: "0", background: "transparent", zIndex: "10001", display: "none",
        fontFamily: "sans-serif",
    });
    const card = document.createElement("div");
    Object.assign(card.style, {
        position: "fixed", background: "#181818", color: "#e6e6e6", width: "min(420px, 92vw)",
        borderRadius: "10px", padding: "14px 16px", boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
        border: "1px solid " + PINK, boxSizing: "border-box", fontSize: "12px",
    });
    card.addEventListener("mousedown", (e) => e.stopPropagation());

    const title = document.createElement("div");
    title.innerHTML = iconBadge(GEAR_ICON, SETTINGS_BG, true) + " Save folder";
    Object.assign(title.style, { fontWeight: "700", fontSize: "14px", color: TITLE_COLOR, marginBottom: "6px" });
    const info = document.createElement("div");
    info.textContent = "Exports (.json) are written in this folder. Empty: the browser downloads them.";
    Object.assign(info.style, { color: "#aaa", lineHeight: "1.4", marginBottom: "10px" });

    const row = document.createElement("div");
    Object.assign(row.style, { display: "flex", gap: "6px", alignItems: "center" });
    const input = makeTextInput("No save folder (download)", false);
    const browseBtn = makeIconButton(VIOLET, FOLDER_ICON);
    browseBtn.title = "Browse...";
    const clearBtn = makeIconButton("#6b2b2b", CLOSE_ICON);
    clearBtn.title = "Clear (no save folder)";
    row.append(input, browseBtn, clearBtn);

    const warn = document.createElement("div");
    Object.assign(warn.style, { color: ORANGE, marginTop: "6px", minHeight: "16px" });

    const btnRow = document.createElement("div");
    Object.assign(btnRow.style, { display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "8px" });
    const mk = (text, bg, bold) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        Object.assign(b.style, {
            padding: "6px 14px", borderRadius: "6px", border: "none", background: bg, color: "#fff",
            fontSize: "11px", fontWeight: bold ? "700" : "400", cursor: "pointer",
        });
        return b;
    };
    const cancelBtn = mk("Cancel", INACTIVE_BG, false);
    const okBtn = mk("OK", ORANGE, true);
    btnRow.append(cancelBtn, okBtn);

    card.append(title, info, row, warn, btnRow);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    let onOk = null;
    let checkSeq = 0;
    async function check() {
        const path = input.value.trim();
        const seq = ++checkSeq;
        if (!path) {
            warn.textContent = "";
            return;
        }
        try {
            const data = await apiGet("/mmselectmod/dir_exists?path=" + encodeURIComponent(path));
            if (seq === checkSeq) warn.textContent = data.exists ? "" : "⚠ This folder does not exist.";
        } catch (e) {
            if (seq === checkSeq) warn.textContent = "";
        }
    }
    function close() {
        overlay.style.display = "none";
        onOk = null;
        window.removeEventListener("keydown", onKey, true);
    }
    function confirm() {
        const cb = onOk;
        const value = input.value.trim();
        close();
        if (cb) cb(value);
    }
    // Les touches ne vont pas au canvas (Suppr effacerait le noeud).
    const onKey = (e) => {
        if (overlay.style.display === "none") return;
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopImmediatePropagation();
            close();
        } else if (e.key === "Enter" && e.target === input) {
            e.preventDefault();
            e.stopImmediatePropagation();
            confirm();
        } else if (card.contains(e.target)) {
            e.stopImmediatePropagation();
        }
    };

    input.addEventListener("input", check);
    clearBtn.addEventListener("click", () => {
        input.value = "";
        check();
    });
    browseBtn.addEventListener("click", async () => {
        browseBtn.disabled = true;
        browseBtn.style.opacity = "0.5";
        try {
            const initial = input.value.trim();
            const data = await apiGet(
                "/mmrefloader/browse_dir" + (initial ? "?initial=" + encodeURIComponent(initial) : "")
            );
            if (data && data.path) {
                input.value = data.path;
                check();
            }
        } catch (e) {
            warn.textContent = "Error: " + e.message;
        } finally {
            browseBtn.disabled = false;
            browseBtn.style.opacity = "1";
        }
    });
    cancelBtn.addEventListener("click", close);
    okBtn.addEventListener("click", confirm);
    overlay.addEventListener("mousedown", (e) => {
        if (e.target === overlay) close();
    });

    return {
        show(current, cb) {
            onOk = cb;
            input.value = current || "";
            warn.textContent = "";
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            positionCardNextToNode(card, container, 420);
            check();
            setTimeout(() => input.focus(), 0);
        },
    };
}

function findWidget(node, name) {
    return node.widgets.find((w) => w.name === name);
}

/**
 * Cache un widget standard du canvas LiteGraph (tout en le laissant dans
 * node.widgets) afin qu'il continue d'etre serialise et envoye au serveur
 * Python lors de l'execution, sans etre dessine sur le noeud.
 */
function hideWidget(node, widget) {
    if (!widget || widget.__mmselectmod_hidden) return;
    widget.__mmselectmod_hidden = true;
    widget.origType = widget.type;
    widget.origComputeSize = widget.computeSize;
    widget.computeSize = () => [0, -4];
    // "converted-widget" est le type sentinelle reconnu en interne par
    // ComfyUI/LiteGraph pour exclure vraiment un widget du dessin ET du
    // hit-testing des connexions (voir notes FileSelect).
    widget.type = "converted-widget";
    widget.draw = () => {};
    widget.onDrawBackground = () => {};
    // Nodes 2.0 (rendu Vue) : lit options.hidden, sinon le widget apparait
    // comme une ligne d'entree (nom + point de connexion).
    if (!widget.options) widget.options = {};
    widget.options.hidden = true;
}

/**
 * Cherche un segment de chemin nomme "models" (insensible a la casse)
 * dans le chemin d'origine + sous-repertoire, et renvoie le nom du
 * dossier qui le suit immediatement (ex: pour un chemin
 * ".../ComfyUI/models/diffusion_models", renvoie "diffusion_models").
 * Si "models" n'apparait pas dans le chemin (ou si c'est le dernier
 * segment, rien apres), reprend simplement le nom du dernier dossier du
 * chemin (ex: pour ".../User/Input", renvoie "Input"). Renvoie une
 * chaine vide seulement si le chemin lui-meme est vide.
 */
function extractModelTypeFromPath(origin, subdir) {
    const combined = [origin, subdir].filter(Boolean).join("/");
    const parts = combined.split(/[\\/]+/).filter(Boolean);
    if (parts.length === 0) return "";
    const idx = parts.findIndex((p) => p.toLowerCase() === "models");
    if (idx !== -1 && idx + 1 < parts.length) return parts[idx + 1];
    return parts[parts.length - 1];
}

async function apiGet(url) {
    const res = await fetch(url);
    let data = null;
    try {
        data = await res.json();
    } catch (e) {
        data = null;
    }
    if (!res.ok) {
        const msg = (data && data.error) || `HTTP error ${res.status}`;
        throw new Error(msg);
    }
    return data;
}

function makeIconButton(color, icon) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = icon || SEARCH_ICON;
    btn.style.flex = "0 0 auto";
    btn.style.width = "22px";
    btn.style.height = "22px";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.background = color;
    btn.style.border = "none";
    btn.style.borderRadius = "4px";
    btn.style.cursor = "pointer";
    btn.style.padding = "0";
    return btn;
}

function makeTextInput(placeholder, readOnly) {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder || "";
    input.readOnly = !!readOnly;
    input.style.flex = "1";
    input.style.minWidth = "0";
    input.style.background = "#111";
    input.style.color = "#ddd";
    input.style.border = "1px solid #0c3833";
    input.style.borderRadius = "10px";
    input.style.padding = "4px 8px";
    input.style.fontSize = "11px";
    input.style.boxSizing = "border-box";
    input.style.outline = "none";
    if (readOnly) {
        input.style.color = "#9fd6cf";
        input.style.cursor = "default";
    }
    return input;
}


// ----------------------------------------------------------------------
// Fenetre de choix (bouton dossier, choix utilisateur 28/10/2026) : a cote du
// noeud, sans fond assombri ; arbre des dossiers (models, Models (Linker)) a
// gauche, fichiers a droite (nom, taille, date, tri par en-tete), recherche,
// ↺ ; clic = remplit le champ actif (fenetre gardee), double-clic = remplit et
// ferme ; pied = chemin du fichier survole. Close, Echap, clic a cote ferment.
// ----------------------------------------------------------------------
const LAST_DIR_KEY = "mmselectmod.lastDir";

function loadLastDir() {
    try {
        return localStorage.getItem(LAST_DIR_KEY) || "";
    } catch (e) {
        return "";
    }
}

function saveLastDir(path) {
    try {
        localStorage.setItem(LAST_DIR_KEY, path);
    } catch (e) {
        // stockage indisponible : rien a retenir
    }
}

const sepOf = (p) => (String(p).includes("\\") ? "\\" : "/");
const normKey = (p) => String(p || "").replace(/[\\/]+/g, "/").replace(/\/$/, "").toLowerCase();

function buildModelPicker(container, ctx) {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, { position: "fixed", inset: "0", zIndex: "10000", display: "none", background: "transparent" });
    const card = document.createElement("div");
    Object.assign(card.style, {
        position: "fixed", width: "min(760px, 94vw)", height: "min(520px, 84vh)", background: "#161616",
        border: "1px solid " + TITLE_COLOR, borderRadius: "10px", boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
        display: "flex", flexDirection: "column", color: "#ddd", fontFamily: "sans-serif", fontSize: "12px",
        overflow: "hidden",
    });
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // En-tete : champ actif, recherche, relire, fermer.
    const head = document.createElement("div");
    Object.assign(head.style, { display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderBottom: "1px solid #2a2a2a" });
    const title = document.createElement("div");
    Object.assign(title.style, { fontWeight: "bold", color: TITLE_COLOR, flex: "0 0 auto" });
    const search = document.createElement("input");
    search.type = "text";
    search.placeholder = "Search in this folder...";
    Object.assign(search.style, {
        flex: "1", minWidth: "0", background: "#0b0b0b", color: "#ddd", border: "1px solid #0c3833", borderRadius: "4px",
        padding: "4px 8px", fontSize: "12px",
    });
    const mkBtn = (text, tip) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.title = tip;
        Object.assign(b.style, {
            background: INACTIVE_BG, color: "#ddd", border: "none", borderRadius: "4px", padding: "3px 9px",
            cursor: "pointer", fontSize: "13px",
        });
        return b;
    };
    const reloadBtn = mkBtn("↺", "Read the folders again");
    const closeBtn = mkBtn("✕", "Close (Esc)");
    head.append(title, search, reloadBtn, closeBtn);

    const body = document.createElement("div");
    Object.assign(body.style, { flex: "1", display: "flex", minHeight: "0" });
    const treeBox = document.createElement("div");
    Object.assign(treeBox.style, { width: "38%", overflow: "auto", borderRight: "1px solid #2a2a2a", padding: "6px 4px" });
    const right = document.createElement("div");
    Object.assign(right.style, { flex: "1", display: "flex", flexDirection: "column", minWidth: "0" });
    const table = document.createElement("div");
    Object.assign(table.style, { flex: "1", overflow: "auto" });
    const note = document.createElement("div");
    Object.assign(note.style, { padding: "4px 8px", color: "#999", fontSize: "11px", minHeight: "14px" });
    right.append(table, note);
    body.append(treeBox, right);

    const foot = document.createElement("div");
    Object.assign(foot.style, {
        padding: "5px 10px", borderTop: "1px solid #2a2a2a", color: "#9fd6cf", fontFamily: "monospace", fontSize: "11px",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minHeight: "14px",
    });
    card.append(head, body, foot);

    let roots = [];
    let current = ""; // dossier choisi
    let currentRoot = null;
    let files = [];
    let sortCol = "name";
    let sortAsc = true;
    const expanded = new Set();
    const children = new Map(); // dossier -> sous-dossiers
    let searchSeq = 0;

    const rootOf = (path) => roots.find((r) => normKey(path) === normKey(r.path) || normKey(path).startsWith(normKey(r.path) + "/"));

    async function childrenOf(path) {
        if (!children.has(normKey(path))) {
            const data = await apiGet("/mmselectmod/tree?path=" + encodeURIComponent(path));
            children.set(normKey(path), data.dirs || []);
        }
        return children.get(normKey(path));
    }

    function treeRow(label, path, count, depth, hasChildren) {
        const row = document.createElement("div");
        const isOpen = expanded.has(normKey(path));
        const active = normKey(path) === normKey(current);
        Object.assign(row.style, {
            display: "flex", alignItems: "center", gap: "4px", padding: "3px 4px 3px " + (4 + depth * 14) + "px",
            borderRadius: "4px", cursor: "pointer", whiteSpace: "nowrap", background: active ? "#145048" : "transparent",
        });
        const arrow = document.createElement("span");
        arrow.textContent = hasChildren ? (isOpen ? "▾" : "▸") : "";
        Object.assign(arrow.style, { width: "12px", flex: "0 0 12px", color: "#9fd6cf" });
        const name = document.createElement("span");
        name.textContent = label;
        Object.assign(name.style, { overflow: "hidden", textOverflow: "ellipsis" });
        row.append(arrow, name);
        if (count !== null && count !== undefined) {
            const c = document.createElement("span");
            c.textContent = "(" + count + ")";
            Object.assign(c.style, { color: "#888", fontSize: "11px" });
            row.appendChild(c);
        }
        row.title = path;
        arrow.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!hasChildren) return;
            if (isOpen) expanded.delete(normKey(path));
            else expanded.add(normKey(path));
            await renderTree();
        });
        row.addEventListener("click", async () => {
            expanded.add(normKey(path));
            await choose(path);
        });
        return row;
    }

    async function renderTree() {
        const scroll = treeBox.scrollTop;
        const out = [];
        async function walk(dirs, depth) {
            for (const d of dirs) {
                out.push(treeRow(d.name, d.path, d.count, depth, d.has_children));
                if (d.has_children && expanded.has(normKey(d.path))) {
                    try {
                        await walk(await childrenOf(d.path), depth + 1);
                    } catch (e) {
                        // dossier refuse ou illisible : pas de sous-dossiers montres
                    }
                }
            }
        }
        for (const r of roots) {
            out.push(treeRow(r.label, r.path, null, 0, true));
            if (expanded.has(normKey(r.path))) {
                try {
                    await walk(await childrenOf(r.path), 1);
                } catch (e) {
                    // racine illisible
                }
            }
        }
        treeBox.innerHTML = "";
        treeBox.append(...out);
        treeBox.scrollTop = scroll;
    }

    function header(label, col) {
        const h = document.createElement("div");
        h.textContent = label + (sortCol === col ? (sortAsc ? " ▲" : " ▼") : "");
        Object.assign(h.style, { cursor: "pointer", color: "#9fd6cf", fontWeight: "bold" });
        h.title = "Sort by " + label.toLowerCase();
        h.addEventListener("click", () => {
            sortAsc = sortCol === col ? !sortAsc : true;
            sortCol = col;
            renderTable();
        });
        return h;
    }

    const GRID = "minmax(0, 1fr) 80px 120px";

    function renderTable() {
        table.innerHTML = "";
        const head2 = document.createElement("div");
        Object.assign(head2.style, {
            display: "grid", gridTemplateColumns: GRID, gap: "8px", padding: "6px 8px", position: "sticky", top: "0",
            background: "#161616", borderBottom: "1px solid #2a2a2a",
        });
        head2.append(header("Name", "name"), header("Size", "size"), header("Modified", "mtime"));
        table.appendChild(head2);
        for (const f of sortFiles(files, sortCol, sortAsc)) {
            const row = document.createElement("div");
            Object.assign(row.style, {
                display: "grid", gridTemplateColumns: GRID, gap: "8px", padding: "4px 8px", cursor: "pointer",
                borderRadius: "4px",
            });
            const name = document.createElement("div");
            name.textContent = f.name;
            name.title = f.name;
            Object.assign(name.style, { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
            const size = document.createElement("div");
            size.textContent = sizeText(f.size);
            size.style.color = "#aaa";
            const date = document.createElement("div");
            date.textContent = new Date(f.mtime * 1000).toLocaleString(undefined, {
                year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
            });
            date.style.color = "#aaa";
            row.append(name, size, date);
            row.addEventListener("mouseenter", () => {
                row.style.background = "#1f2a29";
                foot.textContent = f.path;
            });
            row.addEventListener("mouseleave", () => {
                row.style.background = "transparent";
            });
            row.addEventListener("click", () => pick(f, false));
            row.addEventListener("dblclick", () => pick(f, true));
            table.appendChild(row);
        }
        if (!files.length) {
            const d = document.createElement("div");
            d.textContent = search.value.trim() ? "No file matches the search." : "No model file in this folder.";
            Object.assign(d.style, { color: "#888", padding: "16px 8px" });
            table.appendChild(d);
        }
    }

    async function loadFiles() {
        const q = search.value.trim();
        const seq = ++searchSeq;
        note.textContent = q ? "Searching..." : "";
        try {
            if (q) {
                const data = await apiGet("/mmselectmod/search?path=" + encodeURIComponent(current) + "&q=" + encodeURIComponent(q));
                if (seq !== searchSeq) return;
                files = data.files || [];
                note.textContent = files.length + " file(s) found" + (data.truncated ? " (first results only: refine the search)" : "") + ".";
            } else {
                const data = await apiGet("/mmselectmod/files?path=" + encodeURIComponent(current));
                if (seq !== searchSeq) return;
                files = data.files || [];
            }
        } catch (e) {
            if (seq !== searchSeq) return;
            files = [];
            note.textContent = e.message;
        }
        renderTable();
    }

    async function choose(path) {
        current = path;
        currentRoot = rootOf(path);
        saveLastDir(path);
        await renderTree();
        await loadFiles();
    }

    async function pick(f, close_) {
        const root = rootOf(f.path) || currentRoot;
        if (!root) return;
        const dir = f.path.slice(0, Math.max(f.path.lastIndexOf("\\"), f.path.lastIndexOf("/")));
        const rel = dir.length > root.path.length ? dir.slice(root.path.length).replace(/^[\\/]+/, "") : "";
        foot.textContent = f.path;
        await ctx.pick(root.path, rel.replace(/\\/g, "/"), f.name);
        title.textContent = "Field " + ctx.activeField();
        if (close_) close();
    }

    /** Ouvre l'arbre jusqu'au dossier (ses parents depuis la racine). */
    async function reveal(path) {
        const root = rootOf(path);
        if (!root) return false;
        expanded.add(normKey(root.path));
        const rest = normKey(path).slice(normKey(root.path).length).split("/").filter(Boolean);
        let p = root.path;
        for (const part of rest) {
            p = p + sepOf(root.path) + part;
            expanded.add(normKey(p));
        }
        await choose(path);
        return true;
    }

    function startDir() {
        const v = ctx.fieldValue();
        if (v && /^([a-zA-Z]:[\\/]|[\\/])/.test(v)) return v.slice(0, Math.max(v.lastIndexOf("\\"), v.lastIndexOf("/")));
        if (v && ctx.origin()) return ctx.origin() + sepOf(ctx.origin()) + v.slice(0, Math.max(v.lastIndexOf("\\"), v.lastIndexOf("/"), 0));
        return loadLastDir() || ctx.origin();
    }

    const onKey = (e) => {
        if (overlay.style.display === "none") return;
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopImmediatePropagation();
            close();
        } else if (card.contains(e.target)) {
            e.stopImmediatePropagation(); // les touches ne vont pas au canvas
        }
    };
    function close() {
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
    }
    overlay.addEventListener("mousedown", (e) => {
        if (e.target === overlay) close();
    });
    closeBtn.addEventListener("click", close);
    let searchTimer = null;
    search.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(loadFiles, 300);
    });
    reloadBtn.addEventListener("click", async () => {
        children.clear();
        try {
            roots = (await apiGet("/mmselectmod/roots")).roots || [];
        } catch (e) {
            note.textContent = e.message;
        }
        await renderTree();
        if (current) await loadFiles();
    });

    return {
        async open() {
            title.textContent = "Field " + ctx.activeField();
            search.value = "";
            foot.textContent = "";
            overlay.style.display = "block";
            window.addEventListener("keydown", onKey, true);
            positionCardNextToNode(card, container, 760);
            try {
                roots = (await apiGet("/mmselectmod/roots")).roots || [];
            } catch (e) {
                roots = [];
                note.textContent = e.message;
            }
            if (!roots.length) {
                treeBox.innerHTML = "";
                note.textContent = note.textContent || "No models folder found.";
                return;
            }
            const start = startDir();
            if (!(start && rootOf(start) && (await reveal(start).catch(() => false)))) {
                await reveal(roots[0].path);
            }
            setTimeout(() => search.focus(), 0);
        },
    };
}

app.registerExtension({
    name: "MagicStudio.SelectMod",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== NODE_NAME) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;

            node.color = TITLE_COLOR;
            node.bgcolor = BODY_COLOR;

            // Persiste avec le workflow sauvegarde : une fois coche,
            // "Ne plus demander" reste actif meme apres rechargement.
            if (!node.properties) node.properties = {};
            if (node.properties.fileOverwriteSkipConfirm === undefined) {
                node.properties.fileOverwriteSkipConfirm = false;
            }
            // Nombre de champs optionnels ajoutes (0 a 2), persiste avec
            // le workflow.
            if (node.properties.extraFields === undefined) {
                node.properties.extraFields = 0;
            }
            // Sorties renommees a la main ({numero de champ: true}) :
            // exclues du nommage automatique d'apres le champ Type.
            if (node.properties.manualLabels === undefined) {
                node.properties.manualLabels = {};
            }

            const originWidget = findWidget(node, "origin_dir");
            const selectedDirWidget = findWidget(node, "selected_dir");
            const outputModeWidget = findWidget(node, "output_mode");
            const saveFolderWidget = findWidget(node, "save_folder");
            const fieldWidgets = [
                null,
                findWidget(node, "field_1"),
                findWidget(node, "field_2"),
                findWidget(node, "field_3"),
                findWidget(node, "field_4"),
                findWidget(node, "field_5"),
                findWidget(node, "field_6"),
                findWidget(node, "field_7"),
            ];
            const modelTypeWidgets = [
                null,
                findWidget(node, "model_type_1"),
                findWidget(node, "model_type_2"),
                findWidget(node, "model_type_3"),
                findWidget(node, "model_type_4"),
                findWidget(node, "model_type_5"),
                findWidget(node, "model_type_6"),
                findWidget(node, "model_type_7"),
            ];

            hideWidget(node, originWidget);
            hideWidget(node, selectedDirWidget);
            hideWidget(node, outputModeWidget);
            if (saveFolderWidget) hideWidget(node, saveFolderWidget);
            for (let i = 1; i <= MAX_FIELDS; i++) {
                hideWidget(node, fieldWidgets[i]);
                hideWidget(node, modelTypeWidgets[i]);
            }

            node.fileSelectMode = "dirs";

            // --------------------------------------------------------
            // Conteneur principal
            // --------------------------------------------------------
            const container = document.createElement("div");
            container.style.display = "flex";
            container.style.flexDirection = "column";
            container.style.gap = "4px";
            container.style.width = "100%";
            container.style.height = "100%";
            container.style.boxSizing = "border-box";
            container.style.padding = "2px 2px 4px 2px";
            container.style.overflow = "hidden";
            container.style.fontFamily = "sans-serif";

            // Ligne 1 : raccourcis vers les dossiers standards de ComfyUI
            // (models, output, input, temp, user, custom_nodes, racine)
            // pour remplir "Repertoire d'origine" en un clic. Placee
            // au-dessus du champ qu'elle remplit. Se remplit de facon
            // asynchrone au chargement du noeud ; si la route n'est pas
            // disponible (hors ComfyUI, ou module folder_paths absent),
            // le menu reste desactive sans erreur visible.
            const quickRow = document.createElement("div");
            quickRow.style.position = "relative";
            quickRow.style.flex = "0 0 auto";
            const quickSelect = document.createElement("select");
            quickSelect.style.width = "100%";
            quickSelect.style.boxSizing = "border-box";
            quickSelect.style.background = "#0b0b0b";
            quickSelect.style.color = "#ddd";
            quickSelect.style.border = "1px solid #0c3833";
            quickSelect.style.borderRadius = "4px";
            quickSelect.style.padding = "4px 24px 4px 8px";
            quickSelect.style.fontSize = "10px";
            quickSelect.style.appearance = "none";
            quickSelect.style.webkitAppearance = "none";
            quickSelect.style.cursor = "pointer";
            quickSelect.disabled = true;
            const quickArrow = document.createElement("span");
            quickArrow.textContent = "▾";
            quickArrow.style.position = "absolute";
            quickArrow.style.right = "8px";
            quickArrow.style.top = "50%";
            quickArrow.style.transform = "translateY(-50%)";
            quickArrow.style.color = "#ddd";
            quickArrow.style.pointerEvents = "none";
            quickRow.appendChild(quickSelect);
            quickRow.appendChild(quickArrow);
            container.appendChild(quickRow);

            // Ligne 2 : repertoire d'origine (sous le menu de raccourcis)
            const originRow = document.createElement("div");
            originRow.style.display = "flex";
            originRow.style.gap = "4px";
            originRow.style.alignItems = "center";
            const originInput = makeTextInput("Origin directory (full path)", false);
            const originBtn = makeIconButton(VIOLET, SEARCH_ICON);
            originBtn.title = "List folders";
            const originBrowseBtn = makeIconButton(VIOLET, FOLDER_ICON);
            originBrowseBtn.title = "Browse...";
            originRow.appendChild(originInput);
            originRow.appendChild(originBrowseBtn);
            originRow.appendChild(originBtn);
            container.appendChild(originRow);

            function setQuickPlaceholder(text) {
                quickSelect.innerHTML = "";
                const opt = document.createElement("option");
                opt.value = "";
                opt.textContent = text;
                quickSelect.appendChild(opt);
                quickSelect.value = "";
            }
            setQuickPlaceholder("Models folder shortcut...");

            let quickDirsCache = [];

            function rebuildQuickOptions(placeholderText) {
                setQuickPlaceholder(placeholderText);
                quickDirsCache.forEach((d) => {
                    const opt = document.createElement("option");
                    opt.value = d.path;
                    opt.textContent = d.label;
                    quickSelect.appendChild(opt);
                });
            }

            apiGet("/mmselectmod/roots")
                .then((data) => {
                    const dirs = (data && data.roots) || [];
                    if (dirs.length === 0) return;
                    quickDirsCache = dirs;
                    rebuildQuickOptions("Models folder shortcut...");
                    quickSelect.disabled = false;
                })
                .catch(() => {
                    // Hors ComfyUI (ou folder_paths indisponible) : le
                    // menu reste simplement desactive, sans avertir
                    // l'utilisateur pour une fonctionnalite de confort.
                });

            function applyQuickDir(path) {
                originInput.value = path;
                originWidget.value = path;
                lastGoodOrigin = path;
                status.textContent = "Directory chosen: " + path;
                rebuildQuickOptions("Models folder shortcut...");
            }

            quickSelect.addEventListener("change", () => {
                const path = quickSelect.value;
                if (!path) return;
                applyQuickDir(path);
            });

            // Ligne 2 : repertoire selectionne
            const selectedDirRow = document.createElement("div");
            selectedDirRow.style.display = "flex";
            selectedDirRow.style.gap = "4px";
            selectedDirRow.style.alignItems = "center";
            const selectedDirInput = makeTextInput("Selected directory", false);
            const selectedDirBtn = makeIconButton(PINK);
            selectedDirBtn.title = "List files";
            selectedDirRow.appendChild(selectedDirInput);
            selectedDirRow.appendChild(selectedDirBtn);
            container.appendChild(selectedDirRow);

            // Filtre par extension. Desactive automatiquement s'il n'y a
            // 0 ou 1 seul type d'extension dans le dossier (rien a
            // filtrer). La liste des extensions ne change jamais suite a
            // une selection : elle reste celle du dernier dossier de
            // fichiers charge. Placee au-dessus de la fenetre resultat
            // (deplace suite a un retour explicite).
            const extRow = document.createElement("div");
            extRow.style.position = "relative";
            extRow.style.flex = "0 0 auto";
            const extSelect = document.createElement("select");
            extSelect.style.width = "100%";
            extSelect.style.boxSizing = "border-box";
            extSelect.style.background = "#0b0b0b";
            extSelect.style.color = "#ddd";
            extSelect.style.border = "1px solid #0c3833";
            extSelect.style.borderRadius = "4px";
            extSelect.style.padding = "5px 24px 5px 8px";
            extSelect.style.fontSize = "11px";
            extSelect.style.appearance = "none";
            extSelect.style.webkitAppearance = "none";
            extSelect.style.cursor = "pointer";
            const extArrow = document.createElement("span");
            extArrow.textContent = "▾";
            extArrow.style.position = "absolute";
            extArrow.style.right = "8px";
            extArrow.style.top = "50%";
            extArrow.style.transform = "translateY(-50%)";
            extArrow.style.color = "#ddd";
            extArrow.style.pointerEvents = "none";
            extRow.appendChild(extSelect);
            extRow.appendChild(extArrow);
            container.appendChild(extRow);

            // Ligne de statut (sous le selecteur d'extension, deplace
            // suite a un retour explicite)
            const status = document.createElement("div");
            status.style.fontSize = "10px";
            status.style.color = "#bfe9e3";
            status.style.padding = "0 2px";
            status.style.minHeight = "13px";
            status.textContent = "Click the purple magnifier to start.";
            container.appendChild(status);

            // Fenetre de liste
            const listBox = document.createElement("div");
            listBox.style.flex = "1";
            listBox.style.minHeight = "50px";
            listBox.style.overflowY = "auto";
            listBox.style.border = "1px solid #0c3833";
            listBox.style.borderRadius = "8px";
            listBox.style.background = "#07211d";
            listBox.style.fontSize = "11px";
            listBox.style.color = "#ddd";
            listBox.style.boxSizing = "border-box";
            container.appendChild(listBox);

            // --------------------------------------------------------
            // Boutons carres 1-5 : choix du champ actif
            // --------------------------------------------------------
            const fieldSelectRow = document.createElement("div");
            fieldSelectRow.style.display = "flex";
            fieldSelectRow.style.gap = "6px";
            fieldSelectRow.style.flex = "0 0 auto";
            const fieldSelectButtons = new Array(MAX_FIELDS + 1).fill(null);
            for (let i = 1; i <= MAX_FIELDS; i++) {
                const b = document.createElement("button");
                b.type = "button";
                b.textContent = String(i);
                b.title = i > BASE_FIELDS
                    ? `Field ${i} active (${OPTION_OUTPUT_NAMES[i - BASE_FIELDS - 1]})`
                    : `Field ${i} active`;
                b.style.flex = "1";
                b.style.padding = "5px 0";
                b.style.borderRadius = "8px";
                b.style.border = "none";
                b.style.fontWeight = "700";
                b.style.fontSize = "12px";
                b.style.cursor = "pointer";
                fieldSelectRow.appendChild(b);
                fieldSelectButtons[i] = b;
            }
            container.appendChild(fieldSelectRow);

            // --------------------------------------------------------
            // Interrupteur Absolu/Relatif (pilule en un seul bloc, les
            // deux moities se touchent sans espace visible) + aide
            // --------------------------------------------------------
            const toggleRow = document.createElement("div");
            toggleRow.style.display = "flex";
            toggleRow.style.gap = "6px";

            const toggleGroup = document.createElement("div");
            toggleGroup.style.display = "flex";
            toggleGroup.style.flex = "1";
            toggleGroup.style.borderRadius = "999px";
            toggleGroup.style.overflow = "hidden";

            const absBtn = document.createElement("button");
            absBtn.type = "button";
            absBtn.textContent = "Absolute";
            const relBtn = document.createElement("button");
            relBtn.type = "button";
            relBtn.textContent = "Relative";
            [absBtn, relBtn].forEach((b) => {
                b.style.flex = "1";
                b.style.padding = "7px 0";
                b.style.borderRadius = "0";
                b.style.border = "none";
                b.style.fontWeight = "700";
                b.style.fontSize = "11px";
                b.style.cursor = "pointer";
            });
            toggleGroup.appendChild(absBtn);
            toggleGroup.appendChild(relBtn);
            toggleRow.appendChild(toggleGroup);

            // Icone "C" : n'apparait que si "Ne plus demander" est actif
            // sur le menu de raccourcis, pour reactiver la confirmation.
            const fieldOverwriteCancelBtn = document.createElement("button");
            fieldOverwriteCancelBtn.type = "button";
            fieldOverwriteCancelBtn.textContent = "C";
            fieldOverwriteCancelBtn.title =
                "Turn the confirmation back on before overwriting a filled field";
            fieldOverwriteCancelBtn.style.flex = "0 0 auto";
            fieldOverwriteCancelBtn.style.width = "26px";
            fieldOverwriteCancelBtn.style.height = "26px";
            fieldOverwriteCancelBtn.style.borderRadius = "50%";
            fieldOverwriteCancelBtn.style.border = "none";
            fieldOverwriteCancelBtn.style.background = "#5a3d1a";
            fieldOverwriteCancelBtn.style.color = "#f0c98a";
            fieldOverwriteCancelBtn.style.fontWeight = "700";
            fieldOverwriteCancelBtn.style.fontSize = "13px";
            fieldOverwriteCancelBtn.style.cursor = "pointer";
            fieldOverwriteCancelBtn.style.alignItems = "center";
            fieldOverwriteCancelBtn.style.justifyContent = "center";
            fieldOverwriteCancelBtn.style.display = "none";
            toggleRow.appendChild(fieldOverwriteCancelBtn);

            function updateFieldOverwriteCancelBtn() {
                fieldOverwriteCancelBtn.style.display = node.properties.fileOverwriteSkipConfirm
                    ? "flex"
                    : "none";
            }
            updateFieldOverwriteCancelBtn();

            fieldOverwriteCancelBtn.addEventListener("click", () => {
                node.properties.fileOverwriteSkipConfirm = false;
                updateFieldOverwriteCancelBtn();
                status.textContent = "Confirmation turned back on before overwriting a field.";
            });

            // Bouton "telechargement" : exporte dans un fichier .txt une
            // ligne par champ numerote rempli, au format "N - <model_type> :
            // <field_N>" (champs vides ignores). Place juste a gauche du
            // bouton d'aide "?". S'appuie sur fieldInputs/modelTypeInputs,
            // remplis plus bas dans cette meme fonction : sans risque, le
            // gestionnaire de clic ne s'execute qu'apres coup (l'utilisateur
            // doit d'abord cliquer), quand ces tableaux sont deja remplis.
            const saveBtn = document.createElement("button");
            saveBtn.type = "button";
            saveBtn.innerHTML = DOWNLOAD_ICON;
            saveBtn.title = "Export the filled fields (.json)";
            saveBtn.style.flex = "0 0 auto";
            saveBtn.style.width = "26px";
            saveBtn.style.height = "26px";
            saveBtn.style.borderRadius = "50%";
            saveBtn.style.border = "none";
            saveBtn.style.background = PINK;
            saveBtn.style.color = "#fff";
            saveBtn.style.fontWeight = "700";
            saveBtn.style.fontSize = "13px";
            saveBtn.style.cursor = "pointer";
            saveBtn.style.display = "flex";
            saveBtn.style.alignItems = "center";
            saveBtn.style.justifyContent = "center";
            toggleRow.appendChild(saveBtn);

            // Export JSON : ecrit dans le dossier de sauvegarde (roue
            // crantee) s'il est choisi, sinon telecharge par le navigateur.
            saveBtn.addEventListener("click", async () => {
                const rows = [];
                for (let i = 1; i <= fieldCount(); i++) {
                    const path = (fieldInputs[i].value || "").trim();
                    if (!path) continue;
                    rows.push({ field: i, type: (modelTypeInputs[i].value || "").trim(), path });
                }
                if (rows.length === 0) {
                    status.textContent = "No filled field to export.";
                    return;
                }
                const text = buildExport(rows);
                const name = exportFileName(new Date());
                const folder = (node.properties.mmselectmodSaveFolder || "").trim();
                if (folder) {
                    try {
                        const res = await fetch("/mmselectmod/save_export", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ folder, name, content: text }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(data.error || `HTTP error ${res.status}`);
                        status.textContent = `Exported (${rows.length} field(s)): ${data.path}`;
                    } catch (e) {
                        status.textContent = "Error: " + e.message;
                    }
                    return;
                }
                const blob = new Blob([text], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = name;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                status.textContent = `File downloaded (${rows.length} field(s)).`;
            });

            // Bouton "televersement" : recharge un fichier .txt au meme
            // format que l'export ("N - <model_type> : <field_N>", une
            // ligne par numero) pour remplir automatiquement les champs
            // Type et principal correspondants. S'appuie sur setFieldValue/
            // setModelTypeValue, definies plus bas dans cette meme fonction
            // (meme raisonnement de securite que pour saveBtn ci-dessus :
            // le gestionnaire de clic/changement ne s'execute qu'apres
            // interaction de l'utilisateur, une fois ces fonctions definies).
            const uploadInput = document.createElement("input");
            uploadInput.type = "file";
            uploadInput.accept = ".json,.txt,application/json,text/plain";
            uploadInput.style.display = "none";
            toggleRow.appendChild(uploadInput);

            const uploadBtn = document.createElement("button");
            uploadBtn.type = "button";
            uploadBtn.innerHTML = UPLOAD_ICON;
            uploadBtn.title = "Import a fields file (.json, or an old .txt)";
            uploadBtn.style.flex = "0 0 auto";
            uploadBtn.style.width = "26px";
            uploadBtn.style.height = "26px";
            uploadBtn.style.borderRadius = "50%";
            uploadBtn.style.border = "none";
            uploadBtn.style.background = PINK;
            uploadBtn.style.color = "#fff";
            uploadBtn.style.fontWeight = "700";
            uploadBtn.style.fontSize = "13px";
            uploadBtn.style.cursor = "pointer";
            uploadBtn.style.display = "flex";
            uploadBtn.style.alignItems = "center";
            uploadBtn.style.justifyContent = "center";
            toggleRow.appendChild(uploadBtn);

            uploadBtn.addEventListener("click", () => uploadInput.click());

            uploadInput.addEventListener("change", () => {
                const file = uploadInput.files && uploadInput.files[0];
                // Reinitialise tout de suite pour pouvoir reselectionner le
                // meme fichier une seconde fois (sinon "change" ne se
                // redeclenche pas).
                uploadInput.value = "";
                if (!file) return;

                const reader = new FileReader();
                reader.onload = () => {
                    // JSON (export actuel) ou ancien .txt ("N - Type : chemin") :
                    // voir fields_format.js. Numero absent ou valeur vide ->
                    // champ vide ; un champ 6 ou 7 rempli ajoute l'option.
                    let parsed;
                    try {
                        parsed = parseFieldsFile(String(reader.result || ""), MAX_FIELDS);
                    } catch (e) {
                        status.textContent = "Error: " + e.message;
                        return;
                    }
                    for (let i = MAX_FIELDS; i > BASE_FIELDS; i--) {
                        if (parsed[i].fieldValue || parsed[i].modelType) {
                            while (fieldCount() < i) addOption();
                            break;
                        }
                    }
                    for (let i = 1; i <= fieldCount(); i++) {
                        setFieldValue(i, parsed[i].fieldValue);
                        setModelTypeValue(i, parsed[i].modelType);
                    }
                    status.textContent = `File imported: ${file.name}.`;
                };
                reader.onerror = () => {
                    status.textContent = "Error reading the file.";
                };
                reader.readAsText(file);
            });

            // Roue crantee : dossier de sauvegarde des exports
            // (node.properties.mmselectmodSaveFolder, garde avec le workflow).
            const settingsBtn = document.createElement("button");
            settingsBtn.type = "button";
            settingsBtn.innerHTML = GEAR_ICON;
            Object.assign(settingsBtn.style, {
                flex: "0 0 auto", width: "26px", height: "26px", borderRadius: "50%", border: "none",
                background: SETTINGS_BG, cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", padding: "0",
            });
            toggleRow.appendChild(settingsBtn);

            function updateSettingsBtn() {
                const folder = (node.properties.mmselectmodSaveFolder || "").trim();
                // Valeur envoyee a l'execution sur la sortie model_link.
                if (saveFolderWidget) saveFolderWidget.value = folder;
                settingsBtn.title = folder
                    ? "Save folder: " + folder
                    : "Save folder: none (exports are downloaded)";
            }
            updateSettingsBtn();

            let saveFolderDialog = null;
            settingsBtn.addEventListener("click", () => {
                if (!saveFolderDialog) saveFolderDialog = buildSaveFolderDialog(container);
                saveFolderDialog.show(node.properties.mmselectmodSaveFolder || "", (folder) => {
                    node.properties.mmselectmodSaveFolder = folder;
                    updateSettingsBtn();
                    status.textContent = folder ? "Save folder: " + folder : "No save folder: exports are downloaded.";
                });
            });

            const helpBtn = document.createElement("button");
            helpBtn.type = "button";
            helpBtn.textContent = "?";
            helpBtn.title = "Help";
            helpBtn.style.flex = "0 0 auto";
            helpBtn.style.width = "26px";
            helpBtn.style.height = "26px";
            helpBtn.style.borderRadius = "50%";
            helpBtn.style.border = "none";
            helpBtn.style.background = "#0c3833";
            helpBtn.style.color = "#bfe9e3";
            helpBtn.style.fontWeight = "700";
            helpBtn.style.fontSize = "13px";
            helpBtn.style.cursor = "pointer";
            helpBtn.style.display = "flex";
            helpBtn.style.alignItems = "center";
            helpBtn.style.justifyContent = "center";
            toggleRow.appendChild(helpBtn);

            container.appendChild(toggleRow);

            let helpOverlay = null;
            helpBtn.addEventListener("click", () => {
                if (!helpOverlay) helpOverlay = buildHelpOverlay(container);
                helpOverlay.open();
            });

            function updateToggleUI(mode) {
                if (mode === "Relative") {
                    relBtn.style.background = GREEN;
                    relBtn.style.color = "#fff";
                    absBtn.style.background = INACTIVE_BG;
                    absBtn.style.color = INACTIVE_FG;
                } else {
                    absBtn.style.background = ORANGE;
                    absBtn.style.color = "#fff";
                    relBtn.style.background = INACTIVE_BG;
                    relBtn.style.color = INACTIVE_FG;
                }
            }

            function setOutputMode(mode) {
                outputModeWidget.value = mode;
                updateToggleUI(mode);
                node.setDirtyCanvas(true, true);
            }

            absBtn.addEventListener("click", () => setOutputMode("Absolute"));
            relBtn.addEventListener("click", () => setOutputMode("Relative"));

            // --------------------------------------------------------
            // Les 5 champs numerotes (affichage du resultat)
            // --------------------------------------------------------
            const fieldsWrap = document.createElement("div");
            fieldsWrap.style.display = "flex";
            fieldsWrap.style.flexDirection = "column";
            fieldsWrap.style.gap = "4px";
            fieldsWrap.style.flex = "0 0 auto";
            const fieldRows = new Array(MAX_FIELDS + 1).fill(null);
            const fieldInputs = new Array(MAX_FIELDS + 1).fill(null);
            const fieldBadges = new Array(MAX_FIELDS + 1).fill(null);
            const modelTypeInputs = new Array(MAX_FIELDS + 1).fill(null);
            for (let i = 1; i <= MAX_FIELDS; i++) {
                const row = document.createElement("div");
                row.style.display = "flex";
                row.style.gap = "4px";
                row.style.alignItems = "center";
                row.style.border = "1px solid transparent";
                row.style.borderRadius = "10px";
                row.style.padding = "1px";
                row.style.boxSizing = "border-box";

                const badge = document.createElement("div");
                badge.textContent = String(i);
                badge.style.flex = "0 0 auto";
                badge.style.width = "18px";
                badge.style.height = "18px";
                badge.style.borderRadius = "5px";
                badge.style.background = INACTIVE_BG;
                badge.style.color = INACTIVE_FG;
                badge.style.fontSize = "10px";
                badge.style.fontWeight = "700";
                badge.style.display = "flex";
                badge.style.alignItems = "center";
                badge.style.justifyContent = "center";

                // Champ "type de modele" (precede le champ principal) :
                // rempli automatiquement a chaque selection de fichier
                // en cherchant un segment "models" dans le chemin, mais
                // reste modifiable a la main. Largeur fixe et reduite
                // pour laisser toute la place au champ principal.
                const modelTypeInput = makeTextInput("Type", false);
                modelTypeInput.style.flex = "0 0 72px";
                modelTypeInput.style.width = "72px";
                modelTypeInput.title = "Model type (auto, e.g. diffusion_models)";

                const input = makeTextInput(
                    i > BASE_FIELDS
                        ? `Field ${i} (${OPTION_OUTPUT_NAMES[i - BASE_FIELDS - 1]})`
                        : `Field ${i}`,
                    true
                );
                input.style.width = "100%";
                input.style.flex = "1";

                const clearBtn = makeIconButton("#6b2b2b", TRASH_ICON);
                clearBtn.title = `Clear field ${i}`;

                row.appendChild(badge);
                row.appendChild(modelTypeInput);
                row.appendChild(input);
                row.appendChild(clearBtn);
                fieldsWrap.appendChild(row);
                fieldRows[i] = row;
                fieldInputs[i] = input;
                fieldBadges[i] = badge;
                modelTypeInputs[i] = modelTypeInput;

                input.addEventListener("input", () => {
                    fieldWidgets[i].value = input.value;
                });

                modelTypeInput.addEventListener("input", () => {
                    modelTypeWidgets[i].value = modelTypeInput.value;
                    applyAutoLabels();
                });

                clearBtn.addEventListener("click", () => {
                    setFieldValue(i, "");
                    setModelTypeValue(i, "");
                    status.textContent = `Field ${i} cleared.`;
                });
            }
            container.appendChild(fieldsWrap);

            // --------------------------------------------------------
            // Champs optionnels : "+" ajoute le champ suivant (6 puis 7)
            // et sa sortie, "-" retire le dernier ajoute (confirmation si
            // sa sortie est connectee).
            // --------------------------------------------------------
            const optionRow = document.createElement("div");
            optionRow.style.display = "flex";
            optionRow.style.gap = "6px";
            optionRow.style.flex = "0 0 auto";

            function makeRoundTextButton(text, bg) {
                const b = document.createElement("button");
                b.type = "button";
                b.textContent = text;
                b.style.flex = "0 0 auto";
                b.style.width = "22px";
                b.style.height = "22px";
                b.style.borderRadius = "50%";
                b.style.border = "none";
                b.style.background = bg;
                b.style.color = "#fff";
                b.style.fontWeight = "700";
                b.style.fontSize = "14px";
                b.style.lineHeight = "1";
                b.style.cursor = "pointer";
                b.style.padding = "0";
                b.style.alignItems = "center";
                b.style.justifyContent = "center";
                return b;
            }
            const addOptionBtn = makeRoundTextButton("+", PINK);
            const removeOptionBtn = makeRoundTextButton("\u2212", "#6b2b2b");
            optionRow.appendChild(addOptionBtn);
            optionRow.appendChild(removeOptionBtn);
            container.appendChild(optionRow);

            let removeConfirmOverlay = null;

            function fieldCount() {
                return BASE_FIELDS + (node.properties.extraFields || 0);
            }

            function minHeight() {
                return MIN_HEIGHT + OPTION_ROW_HEIGHT * (node.properties.extraFields || 0);
            }

            // Aligne node.outputs sur le nombre de champs affiches :
            // retire les sorties en trop (et leurs liens), ajoute celles
            // qui manquent avec leur nom "Option N".
            function syncOptionOutputs() {
                if (!node.outputs) return;
                const want = fieldCount() + 1;
                while (node.outputs.length > want) {
                    const idx = node.outputs.length - 1;
                    node.disconnectOutput(idx);
                    node.removeOutput(idx);
                }
                while (node.outputs.length < want) {
                    const idx = node.outputs.length;
                    node.addOutput(idx === LINK_OUTPUT ? LINK_OUTPUT_NAME : OPTION_OUTPUT_NAMES[idx - LINK_OUTPUT - 1], "*");
                }
                scheduleVueSync();
            }

            function updateOptionUI() {
                const count = fieldCount();
                for (let i = BASE_FIELDS + 1; i <= MAX_FIELDS; i++) {
                    const shown = i <= count;
                    fieldRows[i].style.display = shown ? "flex" : "none";
                    fieldSelectButtons[i].style.display = shown ? "" : "none";
                }
                if (activeField > count) setActiveField(count);
                if (count < MAX_FIELDS) {
                    addOptionBtn.style.display = "flex";
                    addOptionBtn.title = `Add field ${count + 1} ("${OPTION_OUTPUT_NAMES[count - BASE_FIELDS]}" output)`;
                } else {
                    addOptionBtn.style.display = "none";
                }
                if (count > BASE_FIELDS) {
                    removeOptionBtn.style.display = "flex";
                    removeOptionBtn.title = `Remove field ${count} ("${OPTION_OUTPUT_NAMES[count - BASE_FIELDS - 1]}" output)`;
                } else {
                    removeOptionBtn.style.display = "none";
                }
            }

            function addOption() {
                if (fieldCount() >= MAX_FIELDS) return;
                node.properties.extraFields = (node.properties.extraFields || 0) + 1;
                syncOptionOutputs();
                updateOptionUI();
                node.setSize([node.size[0], node.size[1] + OPTION_ROW_HEIGHT]);
                node.setDirtyCanvas(true, true);
            }

            function removeOption() {
                const i = fieldCount();
                if (i <= BASE_FIELDS) return;
                setFieldValue(i, "");
                setModelTypeValue(i, "");
                node.properties.extraFields -= 1;
                if (node.properties.manualLabels) delete node.properties.manualLabels[fieldOutIndex(i) + 1];
                syncOptionOutputs();
                applyAutoLabels();
                updateOptionUI();
                node.setSize([node.size[0], Math.max(minHeight(), node.size[1] - OPTION_ROW_HEIGHT)]);
                node.setDirtyCanvas(true, true);
            }

            addOptionBtn.addEventListener("click", () => {
                addOption();
                status.textContent = `Field ${fieldCount()} added.`;
            });

            removeOptionBtn.addEventListener("click", () => {
                const i = fieldCount();
                if (i <= BASE_FIELDS) return;
                const out = node.outputs && node.outputs[fieldOutIndex(i)];
                const links = (out && out.links) ? out.links.length : 0;
                const done = () => {
                    removeOption();
                    status.textContent = `Field ${i} removed.`;
                };
                if (!links) {
                    done();
                    return;
                }
                if (!removeConfirmOverlay) {
                    removeConfirmOverlay = buildSimpleConfirmOverlay(container);
                }
                const label = out.label || out.name;
                removeConfirmOverlay.show(
                    `The "${label}" output is connected (${links} link(s)).\n` +
                    `Removing field ${i} will delete the link(s) and clear the field. Continue?`,
                    (confirmed) => {
                        if (confirmed) done();
                        else status.textContent = `Removal of field ${i} cancelled.`;
                    }
                );
            });

            // --------------------------------------------------------
            // Champ actif (1 a 5) : determine quel champ recoit la
            // prochaine selection de fichier. Le numero en face du champ
            // (badge) suit le meme etat actif/inactif que le bouton de
            // selection correspondant : un seul actif a la fois, changer
            // de champ desactive automatiquement le precedent.
            // --------------------------------------------------------
            let activeField = 1;

            function updateFieldSelectUI() {
                for (let i = 1; i <= MAX_FIELDS; i++) {
                    const isActive = i === activeField;
                    fieldSelectButtons[i].style.background = isActive ? PINK : INACTIVE_BG;
                    fieldSelectButtons[i].style.color = isActive ? "#fff" : INACTIVE_FG;
                    fieldBadges[i].style.background = isActive ? PINK : INACTIVE_BG;
                    fieldBadges[i].style.color = isActive ? "#fff" : INACTIVE_FG;
                    fieldRows[i].style.borderColor = isActive ? PINK : "transparent";
                }
            }

            function setActiveField(i) {
                activeField = i;
                updateFieldSelectUI();
            }

            for (let i = 1; i <= MAX_FIELDS; i++) {
                fieldSelectButtons[i].addEventListener("click", () => setActiveField(i));
            }
            updateFieldSelectUI();

            function setFieldValue(i, value) {
                fieldWidgets[i].value = value;
                fieldInputs[i].value = value;
            }

            function setModelTypeValue(i, value) {
                modelTypeWidgets[i].value = value;
                modelTypeInputs[i].value = value;
                applyAutoLabels();
            }

            // --------------------------------------------------------
            // Nom automatique des sorties : chaque sortie prend le texte
            // du champ Type de sa ligne (champ i -> sortie i-1). Types
            // identiques -> tous indices dans l'ordre des sorties
            // ("loras (1)", "loras (2)"). Type vide -> nom par defaut.
            // Les sorties renommees a la main (manualLabels) ne sont ni
            // modifiees ni comptees.
            // --------------------------------------------------------
            function applyAutoLabels() {
                if (!node.outputs) return;
                const manual = node.properties.manualLabels || {};
                const count = fieldCount();
                const types = [];
                const totals = {};
                for (let i = 1; i <= count; i++) {
                    const out = node.outputs[fieldOutIndex(i)];
                    const t = (!out || manual[fieldOutIndex(i) + 1]) ? "" : (modelTypeWidgets[i].value || "").trim();
                    types[i] = t;
                    if (t) totals[t] = (totals[t] || 0) + 1;
                }
                const seen = {};
                for (let i = 1; i <= count; i++) {
                    const out = node.outputs[fieldOutIndex(i)];
                    if (!out || manual[fieldOutIndex(i) + 1]) continue;
                    const t = types[i];
                    let label;
                    if (t) {
                        seen[t] = (seen[t] || 0) + 1;
                        label = totals[t] > 1 ? `${t} (${seen[t]})` : t;
                    }
                    out.label = label;
                }
                node.setDirtyCanvas(true, true);
            }
            node.__mfsApplyAutoLabels = applyAutoLabels;

            // --------------------------------------------------------
            // Rendu de la liste des dossiers/fichiers
            // --------------------------------------------------------
            function renderList(items, emptyMessage, onPick) {
                listBox.innerHTML = "";
                if (!items || items.length === 0) {
                    const empty = document.createElement("div");
                    empty.style.padding = "6px";
                    empty.style.color = "#7fb8b0";
                    empty.style.fontStyle = "italic";
                    empty.textContent = emptyMessage;
                    listBox.appendChild(empty);
                    return;
                }
                items.forEach((item) => {
                    const row = document.createElement("div");
                    row.textContent = item;
                    row.style.padding = "3px 8px";
                    row.style.cursor = "pointer";
                    row.style.whiteSpace = "nowrap";
                    row.style.overflow = "hidden";
                    row.style.textOverflow = "ellipsis";
                    row.addEventListener("mouseenter", () => {
                        if (!row.__active) row.style.background = "#0c3833";
                    });
                    row.addEventListener("mouseleave", () => {
                        if (!row.__active) row.style.background = "transparent";
                    });
                    row.addEventListener("click", () => {
                        [...listBox.children].forEach((c) => {
                            c.__active = false;
                            c.style.background = "transparent";
                        });
                        row.__active = true;
                        row.style.background = "#145048";
                        onPick(item, row);
                    });
                    listBox.appendChild(row);
                });
            }

            // --------------------------------------------------------
            // Filtre par extension
            // --------------------------------------------------------
            let currentFiles = [];
            let fieldOverwriteConfirmOverlay = null;

            async function onFilePick(item) {
                const origin = originInput.value.trim();
                const subdir = selectedDirInput.value.trim();
                const mode = outputModeWidget.value || "Absolute";
                status.textContent = `Saving into field ${activeField}...`;
                try {
                    const url =
                        "/mmselectmod/join_path?origin=" +
                        encodeURIComponent(origin) +
                        "&dir=" +
                        encodeURIComponent(subdir) +
                        "&file=" +
                        encodeURIComponent(item) +
                        "&mode=" +
                        encodeURIComponent(mode);
                    const data = await apiGet(url);
                    const newPath = data.path || "";
                    const fieldToFill = activeField;
                    const detectedModelType = extractModelTypeFromPath(origin, subdir);

                    const apply = () => {
                        setFieldValue(fieldToFill, newPath);
                        setModelTypeValue(fieldToFill, detectedModelType);
                        status.textContent = `Field ${fieldToFill} filled (${mode === "Relative" ? "Relative" : "Absolute"}).`;
                    };

                    const currentFieldValue = (fieldInputs[fieldToFill].value || "").trim();
                    if (currentFieldValue && !node.properties.fileOverwriteSkipConfirm) {
                        if (!fieldOverwriteConfirmOverlay) {
                            fieldOverwriteConfirmOverlay = buildFieldOverwriteConfirmOverlay(container);
                        }
                        fieldOverwriteConfirmOverlay.show(fieldToFill, newPath, (confirmed, skip) => {
                            if (!confirmed) {
                                status.textContent = `Replacement of field ${fieldToFill} cancelled.`;
                                return;
                            }
                            if (skip) {
                                node.properties.fileOverwriteSkipConfirm = true;
                                updateFieldOverwriteCancelBtn();
                            }
                            apply();
                        });
                    } else {
                        apply();
                    }
                } catch (e) {
                    status.textContent = "Error: " + e.message;
                }
            }

            function clearExtensionOptions() {
                currentFiles = [];
                extSelect.innerHTML = "";
                const opt = document.createElement("option");
                opt.value = "";
                opt.textContent = "Choose the extension type...";
                extSelect.appendChild(opt);
                extSelect.value = "";
                extSelect.disabled = true;
            }

            function populateExtensionOptions(files) {
                const exts = new Set();
                files.forEach((f) => {
                    const idx = f.lastIndexOf(".");
                    if (idx > 0 && idx < f.length - 1) {
                        exts.add(f.slice(idx + 1).toLowerCase());
                    }
                });
                const sorted = [...exts].sort();
                extSelect.innerHTML = "";
                const defaultOpt = document.createElement("option");
                defaultOpt.value = "";
                defaultOpt.textContent = "Choose the extension type...";
                extSelect.appendChild(defaultOpt);
                sorted.forEach((ext) => {
                    const opt = document.createElement("option");
                    opt.value = ext;
                    opt.textContent = "." + ext;
                    extSelect.appendChild(opt);
                });
                extSelect.value = "";
                // Rien a filtrer si le dossier ne contient qu'un seul
                // type d'extension (ou aucune extension detectee).
                extSelect.disabled = sorted.length <= 1;
            }

            function applyExtensionFilter() {
                const ext = extSelect.value;
                if (!ext) {
                    renderList(currentFiles, "Empty directory", onFilePick);
                    return;
                }
                const filtered = currentFiles.filter((f) =>
                    f.toLowerCase().endsWith("." + ext)
                );
                renderList(filtered, `No .${ext} file`, onFilePick);
            }

            extSelect.addEventListener("change", applyExtensionFilter);
            clearExtensionOptions();

            // --------------------------------------------------------
            // Actions
            // --------------------------------------------------------
            // Bouton dossier (SelectMod) : fenetre de choix MagicStudio (arbre + fichiers).
            let modelPicker = null;
            originBrowseBtn.title = "Choose a model file...";
            originBrowseBtn.addEventListener("click", () => {
                if (!modelPicker) {
                    modelPicker = buildModelPicker(container, {
                        activeField: () => activeField,
                        fieldValue: () => (fieldInputs[activeField].value || "").trim(),
                        origin: () => originInput.value.trim(),
                        pick: async (root, subdir, fileName) => {
                            originInput.value = root;
                            originWidget.value = root;
                            lastGoodOrigin = root;
                            selectedDirInput.value = subdir;
                            selectedDirWidget.value = subdir;
                            await onFilePick(fileName);
                        },
                    });
                }
                modelPicker.open();
            });

            originBtn.addEventListener("click", async () => {
                if (!(await checkOrigin())) return;
                const origin = originInput.value.trim();
                if (!origin) {
                    status.textContent = "Enter an origin directory first.";
                    return;
                }
                originWidget.value = origin;
                status.textContent = "Loading folders...";
                clearExtensionOptions();
                try {
                    const data = await apiGet(
                        "/mmselectmod/list_dirs?path=" + encodeURIComponent(origin)
                    );
                    node.fileSelectMode = "dirs";
                    const dirs = data.dirs || [];
                    status.textContent =
                        dirs.length > 0
                            ? `${dirs.length} folder(s) found.`
                            : "No subdirectory with files.";
                    renderList(dirs, "No subdirectory with files.", (item) => {
                        selectedDirWidget.value = item;
                        selectedDirInput.value = item;
                    });
                } catch (e) {
                    status.textContent = "Error: " + e.message;
                    renderList([], e.message, () => {});
                }
            });

            selectedDirBtn.addEventListener("click", async () => {
                const origin = originInput.value.trim();
                const subdir = selectedDirInput.value.trim();
                if (!origin) {
                    status.textContent = "Enter an origin directory first.";
                    return;
                }
                originWidget.value = origin;
                selectedDirWidget.value = subdir;
                status.textContent = "Loading files...";
                try {
                    const url =
                        "/mmselectmod/list_files?origin=" +
                        encodeURIComponent(origin) +
                        "&subdir=" +
                        encodeURIComponent(subdir);
                    const data = await apiGet(url);
                    node.fileSelectMode = "files";
                    const files = data.files || [];
                    currentFiles = files;
                    populateExtensionOptions(files);
                    status.textContent =
                        files.length > 0 ? `${files.length} file(s) found.` : "Empty directory";
                    renderList(files, "Empty directory", onFilePick);
                } catch (e) {
                    status.textContent = "Error: " + e.message;
                    clearExtensionOptions();
                    renderList([], e.message, () => {});
                }
            });

            // Dossier tape a la main (SelectMod) : verifie par le serveur ; hors des dossiers de
            // modeles -> message et ancienne valeur remise.
            let lastGoodOrigin = originWidget.value || "";
            async function checkOrigin() {
                const path = originInput.value.trim();
                if (!path || path === lastGoodOrigin) {
                    originWidget.value = path;
                    return true;
                }
                try {
                    await apiGet("/mmselectmod/tree?path=" + encodeURIComponent(path));
                    originWidget.value = path;
                    lastGoodOrigin = path;
                    return true;
                } catch (e) {
                    status.textContent = e.message;
                    originInput.value = lastGoodOrigin;
                    originWidget.value = lastGoodOrigin;
                    return false;
                }
            }
            originInput.addEventListener("change", checkOrigin);
            selectedDirInput.addEventListener("input", () => {
                selectedDirWidget.value = selectedDirInput.value;
            });

            // --------------------------------------------------------
            // Widget DOM englobant + taille du noeud
            // --------------------------------------------------------
            const MIN_WIDTH = 340;
            const MIN_HEIGHT = 460;

            node.addDOMWidget("mmselectmod_ui", "mmselectmod", container, {
                serialize: false,
                hideOnZoom: false,
            });

            const onResize = node.onResize;
            node.onResize = function (size) {
                if (size[0] < MIN_WIDTH) size[0] = MIN_WIDTH;
                if (size[1] < minHeight()) size[1] = minHeight();
                return onResize ? onResize.apply(this, arguments) : undefined;
            };

            function refreshFromWidgets() {
                originInput.value = originWidget.value || "";
                selectedDirInput.value = selectedDirWidget.value || "";
                updateToggleUI(outputModeWidget.value || "Absolute");
                for (let i = 1; i <= MAX_FIELDS; i++) {
                    fieldInputs[i].value = fieldWidgets[i].value || "";
                    modelTypeInputs[i].value = modelTypeWidgets[i].value || "";
                }
                // Options ajoutees : relues depuis node.properties (rempli
                // par configure() apres onNodeCreated), puis sorties
                // realignees (un workflow d'avant les options n'en a pas).
                const extra = Number(node.properties.extraFields) || 0;
                node.properties.extraFields = Math.min(Math.max(extra, 0), MAX_FIELDS - BASE_FIELDS);
                syncOptionOutputs();
                updateOptionUI();
                updateFieldSelectUI();
                // Le "C" (Ne plus demander) est calcule une premiere fois
                // a la creation du widget, avant que node.properties ne
                // soit rempli par les valeurs sauvegardees du workflow
                // (configure() s'execute apres onNodeCreated). Sans ce
                // rafraichissement ici, un workflow sauvegarde avec "Ne
                // plus demander" actif rechargeait avec la confirmation
                // reellement desactivee (proprete lue correctement par
                // onFilePick) mais le bouton C invisible, donnant
                // l'impression a tort que la confirmation etait cassee.
                updateFieldOverwriteCancelBtn();
                updateSettingsBtn();
            }

            const onConfigure = node.onConfigure;
            node.onConfigure = function (info) {
                const ret = onConfigure ? onConfigure.apply(this, arguments) : undefined;
                // Workflow enregistre avant le nommage automatique : les
                // noms deja poses a la main sont marques "manuels" pour
                // ne pas etre ecrases au prochain changement de Type.
                if (!(info && info.properties && info.properties.manualLabels)) {
                    node.properties.manualLabels = {};
                    (node.outputs || []).forEach((out, k) => {
                        if (out.label && out.label !== out.name) {
                            node.properties.manualLabels[k + 1] = true;
                        }
                    });
                }
                refreshFromWidgets();
                return ret;
            };

            refreshFromWidgets();
            vueNodes.add(node);
            watchVueNodes();
            scheduleVueSync();
            node.setSize([Math.max(node.size[0], MIN_WIDTH), Math.max(node.size[1], minHeight())]);
            node.setDirtyCanvas(true, true);

            return r;
        };

        // ------------------------------------------------------------
        // Renommer une sortie (clic droit sur le noeud) : ne change que
        // l'etiquette affichee sur le canvas (node.outputs[i].label),
        // jamais le nom technique ("unused N") utilise par
        // ComfyUI pour l'execution du workflow. Persiste avec le
        // workflow sauvegarde (les outputs sont serialises tels quels).
        // ------------------------------------------------------------
        // Meme renommage, directement par double-clic sur le nom d'une
        // sortie (comme sur le noeud Switch Pixaroma) : un <input>
        // temporaire est pose par-dessus l'etiquette sur le canvas.
        const configure = nodeType.prototype.configure;
        nodeType.prototype.configure = function (info) {
            migrateLinkOutput(this, info);
            return configure.apply(this, arguments);
        };

        const onDblClick = nodeType.prototype.onDblClick;
        nodeType.prototype.onDblClick = function (e, pos) {
            const r = onDblClick ? onDblClick.apply(this, arguments) : undefined;
            // En Nodes 2.0, le double-clic est gere sur l'element DOM du noeud.
            if (vueMode()) return r;
            const i = hitOutputLabel(this, pos);
            if (i >= 0) openOutputLabelEditor(this, i);
            return r;
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            if (activeOutputEditor && activeOutputEditor.node === this) {
                activeOutputEditor.close(false);
            }
            vueNodes.delete(this);
            return onRemoved ? onRemoved.apply(this, arguments) : undefined;
        };

        const onExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function (canvas, options) {
            const r = onExtraMenuOptions
                ? onExtraMenuOptions.apply(this, arguments)
                : undefined;
            const node = this;
            if (node.outputs && node.outputs.length) {
                options.push(null);
                node.outputs.forEach((out, i) => {
                    const current = out.label || out.name;
                    options.push({
                        content: "Rename output \"" + current + "\"...",
                        callback: () => {
                            const value = window.prompt(
                                "New name for this output:",
                                current
                            );
                            if (value === null) return;
                            setManualOutputLabel(node, i, value);
                        },
                    });
                });
            }
            return r;
        };
    },
});
