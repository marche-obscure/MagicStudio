import { app } from "../../scripts/app.js";
import {
    TITLE_COLOR, BODY_COLOR, VIOLET, PINK, ORANGE, GREEN, apiGet, hideWidget,
    hList, hSteps, hTip, hNote, hCard, FOLDER_ICON, VIDEO_ICON, START_ICON, buildHelpOverlay,
} from "./minimax_ref_loader.js";
import { linkedProject, projectInputNames } from "./graph_links.js";
import { buildFolderWindow } from "./media_browser.js";
import { buildProjectWindow } from "./project_browser.js";
import {
    COMPARE_CLASS, MODES, parseState, formatState, effectiveKind, acceptKind, bodyDropSide, halfSide, uiHeight,
    initialStar, hintText, sideFps, starPlan, starAfterSet, syncShown, STAR_GOLD, STAR_TIP,
} from "./compare_pure.js";
import { buildCompareViewer } from "./compare_viewer.js";

// --------------------------------------------------------------------
// Noeud MagicStudio Image / Video Compare (plan du 05/11/2026, tache 5 : sources).
// Deux cotes A / B : une entree branchee (video_x ou frames_x) ou un fichier choisi
// (fenetres Project | Folder, ou depot d'un lien sur tout le noeud). L'entree branchee
// gagne : le fichier reste dans l'etat (widget "state", cache), montre grise.
// Le cadre de lecture (tache 6, compare_viewer.js), le lecteur (tache 7) et l'etoile
// (tache 8) se branchent sur node.__mmCompare (voir les comptes rendus des taches 5 a 7).
// --------------------------------------------------------------------

// ---- Aide ----
const HELP_SECTIONS = [
    {
        id: "start", title: "Quick start", icon: START_ICON, color: TITLE_COLOR,
        html: hSteps([
            "Click <b>A</b> (<b>Select Source :</b>), then click a file in the window that opens. The file goes to side <b>A</b>.",
            "Click <b>B</b>, then click the second file. It goes to side <b>B</b>.",
            "Move the mouse over the viewer to compare the two files. Click <b>Side by side</b>, <b>Left Right</b>, " +
            "<b>Right Left</b> or <b>Up Down</b> to change the view.",
            "Click <b>★ Source A</b> or <b>Source B ★</b> under the viewer to mark the file you prefer.",
        ]) +
        hCard("Parts of the node", [
            ["<b>Project | Folder</b>", "choose where the picking window looks: the wired project, or the <b>input</b> and <b>output</b> folders of ComfyUI"],
            ["<b>A</b> / <b>B</b>", "pick the file of each side"],
            ["Viewer", "shows the two files; drop a file here to fill a side"],
            ["<b>Sync</b>", "videos only: one clock for A and B"],
            ["<b>★ Source A</b> / <b>Source B ★</b>", "mark the preferred file"],
        ]),
    },
    {
        id: "inputs", title: "Inputs", icon: FOLDER_ICON, color: GREEN,
        html: hCard("Optional inputs", [
            ["<b>project_used</b>", "the <b>project_used</b> output of a <b>MagicStudio Project</b> node; it lets <b>Project</b> open that project"],
            ["<b>video_a</b> / <b>video_b</b>", "a video for side A / side B"],
            ["<b>frames_a</b> / <b>frames_b</b>", "images for side A / side B: one image is an image, several images are a video"],
        ]) +
        hNote("a wired input wins over the file of the same side. The file stays in the node (shown in grey) and " +
            "comes back when you unwire the input.") +
        hNote("do not wire <b>video_a</b> and <b>frames_a</b> together (same for B): the link is refused.") +
        hTip("a wired <b>frames_a</b> or <b>frames_b</b> has no known type until the first Run. Run the workflow " +
            "once: the node runs with it, even when none of its outputs is wired. The viewer shows " +
            "<b>Run once to preview</b> until the preview exists.") +
        hNote("with no file and no wired input, the node does nothing and the Run goes on, unless one of its " +
            "outputs is wired: then the Run stops with <b>Pick or wire at least one source</b>."),
    },
    {
        id: "viewer", title: "The viewer", icon: VIDEO_ICON, color: ORANGE,
        html: hCard("Views", [
            ["<b>Side by side</b>", "A on the left, B on the right"],
            ["<b>Left Right</b>", "A and B on top of each other; move the mouse left / right to slide the curtain"],
            ["<b>Right Left</b>", "same, with B on the left"],
            ["<b>Up Down</b>", "same, from top to bottom"],
        ]) +
        hCard("Sound", [
            ["Mouse over the viewer", "you hear only the side under the mouse"],
            ["Mouse outside", "you hear the starred side, or A if there is no star"],
        ]) +
        hCard("Player (videos)", [
            ["<b>Play / Pause</b>", "start or stop"],
            ["<b>Previous frame</b> / <b>Next frame</b>", "one image back / forward"],
            ["<b>Stop</b>", "stop and go back to the start"],
            ["<b>Loop</b>", "green = play again at the end"],
            ["<b>Volume</b>", "sound level"],
            ["<b>Sync</b>", "on (default): one bar for A and B, B follows A. Off: one bar for A and one for B, one under the other; each side plays alone"],
        ]) +
        hNote("images have no player: the <b>Sync</b> button is hidden for an image comparison."),
    },
    {
        id: "picking", title: "Picking files", icon: FOLDER_ICON, color: VIOLET,
        html: hSteps([
            "Click <b>Project</b> or <b>Folder</b>. <b>Project</b> is greyed until <b>project_used</b> is wired.",
            "Click <b>A</b> or <b>B</b>: the window opens.",
            "Click a file. It goes to the side you chose, and the window stays open. Click <b>B</b>, then a second file.",
        ]) +
        hCard("Good to know", [
            ["Drop", "drag a file from a window onto the viewer: it goes to the half under the mouse. Elsewhere on the node, it goes to the first free side"],
            ["Same type", "the first file sets the type: two images or two videos. The window greys the other type. Sound files are refused"],
            ["<b>✕</b>", "removes the file from that side. The node forgets the star; the file keeps its saved star"],
            ["Wired input", "its button <b>A</b> / <b>B</b> is greyed: unwire the input to pick a file"],
        ]),
    },
    {
        id: "star", title: "The star", icon: START_ICON, color: GREEN,
        html: hSteps([
            "Click <b>★ Source A</b> (or <b>Source B ★</b>): the file of that side becomes the preferred file.",
            "Click the same star again to remove it. Click the other star to move it.",
        ]) +
        "<p>The star belongs to the <b>file</b>, not to the side. It is kept:</p>" +
        hList([
            "in the Run record, when the file is the output of a Run;",
            "in <b>99.Project-Config/stars.json</b>, for another file of a project;",
            "in the node only, for a wired input or a file outside a project.",
        ]) +
        "<p>A gold <b>★</b> shows the preferred file in <b>40.Rush Videos</b> / <b>60.Rush Images</b>, " +
        "<b>Processing</b>, the <b>Project</b> window and the <b>Folder</b> window.</p>" +
        hNote("the star follows the sorting and the archives done by MagicStudio. A file moved by hand loses its star.") +
        hCard("Good to know", [
            ["New file on the starred side", "the node forgets the star, unless the new file is already starred"],
            ["Empty side", "its star is greyed and does nothing"],
            ["Opening a workflow", "the saved stars of the two files are read again; a star already in the node stays"],
        ]),
    },
    {
        id: "outputs", title: "Outputs", icon: VIDEO_ICON, color: ORANGE,
        html: "<p>The outputs come from the <b>preferred</b> side (the starred one, else <b>A</b>).</p>" +
        hCard("Outputs", [
            ["<b>video</b>", "the video; empty for an image"],
            ["<b>images</b>", "the image, or all the frames of the video"],
            ["<b>path</b>", "the path of the file; empty for a wired input"],
            ["<b>choice</b>", "<b>A</b> or <b>B</b>"],
        ]) +
        hNote("if the chosen side is empty, the other side is used. With no file and no input, the node does " +
            "nothing, unless one of its outputs is wired: then the Run stops with <b>Pick or wire at least one source</b>."),
    },
];

const HELP_SECTIONS_FR = [
    {
        id: "start", title: "Démarrage rapide",
        html: hSteps([
            "Cliquez sur <b>A</b> (<b>Select Source :</b>), puis sur un fichier dans la fenêtre qui s'ouvre. Le fichier va du côté <b>A</b>.",
            "Cliquez sur <b>B</b>, puis sur le deuxième fichier. Il va du côté <b>B</b>.",
            "Passez la souris sur le cadre pour comparer les deux fichiers. Cliquez sur <b>Side by side</b>, " +
            "<b>Left Right</b>, <b>Right Left</b> ou <b>Up Down</b> pour changer la vue.",
            "Cliquez sur <b>★ Source A</b> ou <b>Source B ★</b> sous le cadre pour marquer le fichier que vous préférez.",
        ]) +
        hCard("Parties du nœud", [
            ["<b>Project | Folder</b>", "choisit où la fenêtre cherche : le projet relié, ou les dossiers <b>input</b> et <b>output</b> de ComfyUI"],
            ["<b>A</b> / <b>B</b>", "choisissent le fichier de chaque côté"],
            ["Cadre", "montre les deux fichiers ; déposez un fichier ici pour remplir un côté"],
            ["<b>Sync</b>", "vidéos seulement : une seule horloge pour A et B"],
            ["<b>★ Source A</b> / <b>Source B ★</b>", "marquent le fichier préféré"],
        ]),
    },
    {
        id: "inputs", title: "Entrées",
        html: hCard("Entrées facultatives", [
            ["<b>project_used</b>", "la sortie <b>project_used</b> d'un nœud <b>MagicStudio Project</b> ; elle permet à <b>Project</b> d'ouvrir ce projet"],
            ["<b>video_a</b> / <b>video_b</b>", "une vidéo pour le côté A / le côté B"],
            ["<b>frames_a</b> / <b>frames_b</b>", "des images pour le côté A / le côté B : une image seule est une image, plusieurs images sont une vidéo"],
        ]) +
        hNote("une entrée branchée gagne sur le fichier du même côté. Le fichier reste dans le nœud (affiché en " +
            "gris) et revient quand vous débranchez l'entrée.") +
        hNote("ne branchez pas <b>video_a</b> et <b>frames_a</b> ensemble (idem pour B) : le lien est refusé.") +
        hTip("une entrée <b>frames_a</b> ou <b>frames_b</b> branchée n'a pas de type connu avant le premier Run. " +
            "Lancez le workflow une fois : le nœud tourne avec lui, même si aucune de ses sorties n'est branchée. " +
            "Le cadre affiche <b>Run once to preview</b> tant que l'aperçu n'existe pas.") +
        hNote("sans fichier ni entrée branchée, le nœud ne fait rien et le Run continue, sauf si une de ses " +
            "sorties est branchée : le Run s'arrête alors avec <b>Pick or wire at least one source</b>."),
    },
    {
        id: "viewer", title: "Le cadre",
        html: hCard("Vues", [
            ["<b>Side by side</b>", "A à gauche, B à droite"],
            ["<b>Left Right</b>", "A et B l'un sur l'autre ; bougez la souris à gauche / à droite pour faire glisser le rideau"],
            ["<b>Right Left</b>", "pareil, avec B à gauche"],
            ["<b>Up Down</b>", "pareil, de haut en bas"],
        ]) +
        hCard("Son", [
            ["Souris sur le cadre", "vous n'entendez que le côté sous la souris"],
            ["Souris hors du cadre", "vous entendez le côté étoilé, ou A s'il n'y a pas d'étoile"],
        ]) +
        hCard("Lecteur (vidéos)", [
            ["<b>Play / Pause</b>", "lancer ou arrêter"],
            ["<b>Previous frame</b> / <b>Next frame</b>", "une image en arrière / en avant"],
            ["<b>Stop</b>", "arrêter et revenir au début"],
            ["<b>Loop</b>", "vert = relire au bout"],
            ["<b>Volume</b>", "niveau du son"],
            ["<b>Sync</b>", "allumé (par défaut) : une seule barre pour A et B, B suit A. Éteint : une barre pour A et une pour B, l'une sous l'autre ; chacun joue seul"],
        ]) +
        hNote("les images n'ont pas de lecteur : le bouton <b>Sync</b> est caché pour une comparaison d'images."),
    },
    {
        id: "picking", title: "Choisir les fichiers",
        html: hSteps([
            "Cliquez sur <b>Project</b> ou <b>Folder</b>. <b>Project</b> est grisé tant que <b>project_used</b> n'est pas relié.",
            "Cliquez sur <b>A</b> ou <b>B</b> : la fenêtre s'ouvre.",
            "Cliquez sur un fichier. Il va du côté choisi, et la fenêtre reste ouverte. Cliquez sur <b>B</b>, puis sur un deuxième fichier.",
        ]) +
        hCard("Bon à savoir", [
            ["Glisser", "glissez un fichier d'une fenêtre sur le cadre : il va à la moitié sous la souris. Ailleurs sur le nœud, il va au premier côté libre"],
            ["Même type", "le premier fichier fixe le type : deux images ou deux vidéos. La fenêtre grise l'autre type. Les sons sont refusés"],
            ["<b>✕</b>", "retire le fichier de ce côté. Le nœud oublie l'étoile ; le fichier garde son étoile enregistrée"],
            ["Entrée branchée", "son bouton <b>A</b> / <b>B</b> est grisé : débranchez l'entrée pour choisir un fichier"],
        ]),
    },
    {
        id: "star", title: "L'étoile",
        html: hSteps([
            "Cliquez sur <b>★ Source A</b> (ou <b>Source B ★</b>) : le fichier de ce côté devient le fichier préféré.",
            "Cliquez de nouveau sur la même étoile pour la retirer. Cliquez sur l'autre étoile pour la déplacer.",
        ]) +
        "<p>L'étoile appartient au <b>fichier</b>, pas au côté. Elle est gardée :</p>" +
        hList([
            "dans l'enregistrement du Run, quand le fichier est la sortie d'un Run ;",
            "dans <b>99.Project-Config/stars.json</b>, pour un autre fichier d'un projet ;",
            "dans le nœud seulement, pour une entrée branchée ou un fichier hors projet.",
        ]) +
        "<p>Une <b>★</b> dorée montre le fichier préféré dans <b>40.Rush Videos</b> / <b>60.Rush Images</b>, " +
        "<b>Processing</b>, la fenêtre <b>Project</b> et la fenêtre <b>Folder</b>.</p>" +
        hNote("l'étoile suit les rangements et les archives faits par MagicStudio. Un fichier déplacé à la main perd son étoile.") +
        hCard("Bon à savoir", [
            ["Nouveau fichier du côté étoilé", "le nœud oublie l'étoile, sauf si le nouveau fichier est déjà étoilé"],
            ["Côté vide", "son étoile est grisée et ne fait rien"],
            ["Ouverture d'un workflow", "les étoiles enregistrées des deux fichiers sont relues ; une étoile déjà dans le nœud reste"],
        ]),
    },
    {
        id: "outputs", title: "Sorties",
        html: "<p>Les sorties viennent du côté <b>préféré</b> (l'étoilé, sinon <b>A</b>).</p>" +
        hCard("Sorties", [
            ["<b>video</b>", "la vidéo ; vide pour une image"],
            ["<b>images</b>", "l'image, ou toutes les images de la vidéo"],
            ["<b>path</b>", "le chemin du fichier ; vide pour une entrée branchée"],
            ["<b>choice</b>", "<b>A</b> ou <b>B</b>"],
        ]) +
        hNote("si le côté choisi est vide, l'autre côté est utilisé. Sans fichier ni entrée, le nœud ne fait rien, " +
            "sauf si une de ses sorties est branchée : le Run s'arrête alors avec <b>Pick or wire at least one source</b>."),
    },
];

function helpSections(lang) {
    if (lang !== "fr") return HELP_SECTIONS;
    const fr = Object.fromEntries(HELP_SECTIONS_FR.map((sec) => [sec.id, sec]));
    return HELP_SECTIONS.map((sec) => (fr[sec.id] ? Object.assign({}, sec, fr[sec.id]) : sec));
}

const NODE_NAME = COMPARE_CLASS;
const MIN_WIDTH = 460;
const PROJECT_NODE = "MiniMaxH3Project";
const PROJECT_TIP = "Wire the project_used output of a MagicStudio Project node";
const BROWSER_KEY = "mmcompareBrowser";
const PREVIEW_KEY = "mmComparePreview";
const SIDE_BLUE = "#1e88e5";
const SIDE_COLORS = { A: SIDE_BLUE, B: VIOLET };
const SIDES = ["A", "B"];
// Hauteur du cadre : uiHeight(sync) moins le haut, la ligne d'etat, les modes, le lecteur et les etoiles.
const FRAME_HEIGHT = 236;
/** POST JSON (comme project_node.js) ; erreur HTTP -> exception avec le texte du serveur. */
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
const STAR_OFF = "#9e9e9e";
const baseName = (p) => String(p || "").split(/[\\/]/).pop();
const normPath = (p) => String(p || "").replace(/[\\/]+/g, "/").toLowerCase();
const key = (side) => (side === "A" ? "a" : "b");

/** Texte depose : lien text/uri-list d'abord, sinon texte simple (copie de load_media_node.js). */
function droppedText(dt) {
    if (!dt) return "";
    return dt.getData("text/uri-list") || dt.getData("text/plain") || "";
}
const carriesLink = (dt) => !!dt && Array.from(dt.types || []).some((t) => t === "text/uri-list" || t === "text/plain");

/**
 * Nodes 2.0 : le rendu Vue garde une ligne "state" (point d'entree + nom) meme avec le widget
 * cache ; on la cache pour chaque noeud Compare (comme hideVuePostRow de MedLoad). Une seule
 * surveillance pour la page ; sans effet en mode classique.
 */
function hideVueStateRow() {
    if (window.__mmCompareStateRowObserver) return;
    let pending = false;
    const apply = () => {
        pending = false;
        for (const span of document.querySelectorAll("[data-node-id] .text-node-component-slot-text")) {
            if (span.textContent.trim() !== "state") continue;
            const host = span.closest("[data-node-id]");
            const owner = host && app.graph && app.graph.getNodeById(Number(host.getAttribute("data-node-id")));
            if (!owner || owner.type !== NODE_NAME) continue;
            const row = span.closest(".lg-slot");
            const box = row && row.parentElement;
            if (box && box.style.display !== "none") box.style.display = "none";
        }
    };
    window.__mmCompareStateRowObserver = new MutationObserver(() => {
        if (pending) return;
        pending = true;
        setTimeout(apply, 50);
    });
    window.__mmCompareStateRowObserver.observe(document.body, { childList: true, subtree: true });
    apply();
}

/** Entrees d'un cote, dans l'ordre (video puis frames). */
const sideInputs = (side) => ["video_" + side.toLowerCase(), "frames_" + side.toLowerCase()];

app.registerExtension({
    name: "ComfyUI.MagicStudioCompare",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;
            node.color = TITLE_COLOR;
            node.bgcolor = BODY_COLOR;
            if (!node.properties) node.properties = {};

            // ---- Etat (widget "state" cache) ----
            const stateWidget = (node.widgets || []).find((w) => w.name === "state");
            if (stateWidget) {
                hideWidget(stateWidget);
                // Nodes 2.0 (rendu Vue) : lit options.hidden, sinon le widget reste affiche.
                if (!stateWidget.options) stateWidget.options = {};
                stateWidget.options.hidden = true;
                hideVueStateRow();
            }
            const readState = () => parseState(stateWidget ? stateWidget.value : "{}");
            function writeState(s) {
                const text = formatState(s);
                if (stateWidget && stateWidget.value !== text) {
                    stateWidget.value = text;
                    if (stateWidget.callback) stateWidget.callback(text);
                }
                node.setDirtyCanvas(true, true);
            }

            // ---- Entrees branchees ----
            const linkedInput = (name) => {
                const inp = (node.inputs || []).find((i) => i && i.name === name);
                return !!inp && inp.link !== null && inp.link !== undefined;
            };
            const previews = () => {
                const p = node.properties[PREVIEW_KEY];
                return p && typeof p === "object" ? p : {};
            };
            const previewOf = (side) => {
                const p = previews()[side];
                if (!p) return null;
                if (typeof p === "string") return { path: p, kind: /\.png$/i.test(p) ? "image" : "video" };
                return p.path ? p : null;
            };
            /** {A: bool, B: bool} : un cote est-il pris par une entree branchee ? */
            const wired = () => Object.fromEntries(SIDES.map((s) => [s, sideInputs(s).some(linkedInput)]));
            /**
             * {A: type|"", B: ...} : type d'une entree branchee (video_x -> video ; frames_x -> type de son
             * dernier apercu, "" tant qu'il n'y a pas eu de Run : 1 image ou plusieurs, inconnu avant).
             */
            const wiredKinds = () => Object.fromEntries(SIDES.map((s) => {
                const [v, f] = sideInputs(s);
                if (linkedInput(v)) return [s, "video"];
                if (linkedInput(f)) return [s, (previewOf(s) && previewOf(s).kind) || ""];
                return [s, ""];
            }));
            /** Type impose a un cote = celui de l'AUTRE cote (entree ou fichier) ; les deux vides = libre. */
            function lockFor(side) {
                const s = readState();
                const w = wired();
                const k = wiredKinds();
                const other = side === "A" ? "B" : "A";
                const view = { a: { path: "", kind: "" }, b: { path: "", kind: "" } };
                if (!w[other]) view[key(other)] = s[key(other)];
                return effectiveKind(view, { [side]: null, [other]: w[other] ? k[other] || null : null });
            }
            /** Type de la comparaison (les deux cotes, entree branchee gagnante). */
            function comparisonKinds() {
                const s = readState();
                const w = wired();
                const k = wiredKinds();
                return Object.fromEntries(SIDES.map((x) => [x, w[x] ? k[x] : (s[key(x)].path ? s[key(x)].kind : "")]));
            }
            /**
             * Source d'un cote : {side, from: "input"|"file"|null, path, kind, kept} ; path d'une entree =
             * son apercu (vide avant le premier Run) ; kept = fichier garde sous une entree branchee.
             */
            function sourceOf(side) {
                const s = readState()[key(side)];
                if (wired()[side]) {
                    const p = previewOf(side);
                    return {
                        side, from: "input", path: p ? p.path : "", kind: wiredKinds()[side] || (p ? p.kind : ""),
                        kept: s.path ? { path: s.path, kind: s.kind } : null,
                    };
                }
                if (s.path) return { side, from: "file", path: s.path, kind: s.kind, kept: null };
                return { side, from: null, path: "", kind: "", kept: null };
            }

            // ---- Interface ----
            const container = document.createElement("div");
            Object.assign(container.style, {
                display: "flex", flexDirection: "column", gap: "6px", padding: "6px 8px", boxSizing: "border-box",
                width: "100%", fontFamily: "sans-serif", fontSize: "12px", color: "#ddd",
                // Hauteur naturelle (pas de height 100%) : en Nodes 2.0, le noeud suit son contenu.
            });
            // Ligne du haut : pilule Project | Folder, "Select Source :", A, B, place de l'aide.
            const top = document.createElement("div");
            Object.assign(top.style, { display: "flex", alignItems: "center", gap: "6px" });
            const pillBtns = {};
            const pill = document.createElement("div");
            Object.assign(pill.style, { display: "flex", gap: "4px", alignItems: "center", flex: "0 0 auto" });
            for (const [value, text] of [["project", "Project"], ["folder", "Folder"]]) {
                const b = document.createElement("button");
                b.type = "button";
                b.textContent = text;
                Object.assign(b.style, {
                    background: "#252525", color: "#ddd", border: "1px solid #3a3a3a", borderRadius: "6px",
                    padding: "4px 12px", cursor: "pointer", fontSize: "12px",
                });
                pillBtns[value] = b;
                pill.appendChild(b);
            }
            const selLabel = document.createElement("span");
            selLabel.textContent = "Select Source :";
            Object.assign(selLabel.style, { fontWeight: "bold", marginLeft: "8px", flex: "0 0 auto" });
            const sideBtns = {};
            for (const side of SIDES) {
                const b = document.createElement("button");
                b.type = "button";
                b.textContent = side;
                Object.assign(b.style, {
                    width: "30px", height: "24px", border: "none", borderRadius: "6px", background: SIDE_COLORS[side],
                    color: "white", fontWeight: "bold", cursor: "pointer", padding: "0", fontSize: "13px", flex: "0 0 auto",
                });
                sideBtns[side] = b;
            }
            const spacer = document.createElement("div");
            spacer.style.flex = "1";
            // Place du bouton d'aide "?" (tache 9).
            const helpSlot = document.createElement("span");
            Object.assign(helpSlot.style, { flex: "0 0 auto", display: "flex", alignItems: "center" });
            top.append(pill, selLabel, sideBtns.A, sideBtns.B, spacer, helpSlot);

            // Ligne d'etat : type de la comparaison, consigne, refus et erreurs en orange.
            const status = document.createElement("div");
            Object.assign(status.style, {
                fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minHeight: "15px",
            });
            // Modes Side by side / Left Right / Right Left / Up Down, aide dessous.
            const modeSlot = document.createElement("div");
            Object.assign(modeSlot.style, { display: "flex", flexDirection: "column", gap: "3px" });
            const modeRow = document.createElement("div");
            Object.assign(modeRow.style, { display: "flex", alignItems: "center", gap: "4px", height: "22px" });
            const modeBtns = {};
            for (const [value, text] of MODES) {
                const b = document.createElement("button");
                b.type = "button";
                b.textContent = text;
                Object.assign(b.style, {
                    background: "#252525", color: "#ddd", border: "1px solid #3a3a3a", borderRadius: "6px",
                    padding: "2px 8px", cursor: "pointer", fontSize: "11px", flex: "0 0 auto",
                });
                b.addEventListener("click", () => {
                    const s = readState();
                    if (s.mode === value) return;
                    s.mode = value;
                    writeState(s);
                    paint();
                });
                modeBtns[value] = b;
                modeRow.appendChild(b);
            }
            const modeSpacer = document.createElement("div");
            modeSpacer.style.flex = "1";
            modeRow.appendChild(modeSpacer);
            // Bouton Sync (tache 7) : une horloge pour A et B, ou un lecteur par cote.
            const syncBtn = document.createElement("button");
            syncBtn.type = "button";
            syncBtn.textContent = "Sync";
            syncBtn.title = "On: one clock for A and B. Off: each side plays on its own";
            Object.assign(syncBtn.style, {
                background: "#252525", color: "#ddd", border: "1px solid #3a3a3a", borderRadius: "6px",
                padding: "2px 10px", cursor: "pointer", fontSize: "11px", flex: "0 0 auto",
            });
            syncBtn.addEventListener("click", () => {
                const s = readState();
                s.sync = !s.sync;
                writeState(s);
                paint();
                // Hauteur du noeud = uiHeight(sync) (une ou deux barres).
                const min = typeof node.computeSize === "function" ? node.computeSize() : null;
                node.setSize([node.size[0], min ? min[1] : node.size[1]]);
                node.setDirtyCanvas(true, true);
            });
            modeRow.appendChild(syncBtn);
            function paintSync(on, kinds) {
                syncBtn.style.borderColor = on ? GREEN : "#3a3a3a";
                syncBtn.style.color = on ? GREEN : "#ddd";
                syncBtn.style.fontWeight = on ? "bold" : "normal";
                // Sans cote rempli, le bouton reste utilisable mais estompe (rien a lire).
                syncBtn.style.opacity = kinds.includes("video") ? "1" : "0.5";
                // Comparaison d'images : bouton cache (revue finale), la ligne garde sa hauteur.
                syncBtn.style.visibility = syncShown(kinds) ? "visible" : "hidden";
            }
            const hint = document.createElement("div");
            Object.assign(hint.style, { color: "#999", fontSize: "11px", height: "14px", lineHeight: "14px" });
            modeSlot.append(modeRow, hint);
            function paintModes(mode) {
                for (const [value] of MODES) {
                    const b = modeBtns[value];
                    const on = value === mode;
                    b.style.borderColor = on ? ORANGE : "#3a3a3a";
                    b.style.color = on ? ORANGE : "#ddd";
                    b.style.fontWeight = on ? "bold" : "normal";
                }
                hint.textContent = hintText(mode);
            }
            // Cadre de lecture (compare_viewer.js).
            const frame = document.createElement("div");
            Object.assign(frame.style, {
                position: "relative", height: FRAME_HEIGHT + "px", border: "2px dashed #3b5f5b", borderRadius: "8px",
                background: "#0d0d0d", overflow: "hidden", boxSizing: "border-box", display: "flex",
            });
            frame.dataset.mmcompare = "frame";
            // Lecteur (barres de compare_viewer.js) et ligne des etoiles (tache 8).
            const playerSlot = document.createElement("div");
            Object.assign(playerSlot.style, { flex: "0 0 auto", overflow: "hidden" });
            const starRow = document.createElement("div");
            Object.assign(starRow.style, { display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: "18px" });
            starRow.dataset.mmcompare = "stars";
            container.append(top, status, modeSlot, frame, playerSlot, starRow);

            // ---- Messages ----
            let message = null; // {text, error} : refus ou erreur gardes jusqu'a la prochaine action
            let pickSide = null; // cote qui a ouvert la fenetre de choix
            function say(text, error = true) {
                message = text ? { text, error } : null;
                paintStatus();
            }
            function paintStatus() {
                let text = "";
                let color = "#eee";
                const k = comparisonKinds();
                const windowOpen = folderWin.isOpen() || projectWin.isOpen();
                if (message) {
                    text = message.text;
                    color = message.error ? ORANGE : "#eee";
                } else if (k.A && k.B && k.A !== k.B) {
                    text = "A and B must both be images or both be videos";
                    color = ORANGE;
                } else if (windowOpen && pickSide) {
                    text = "Click a file to put it on side " + pickSide;
                } else if (k.A || k.B) {
                    text = (k.A || k.B) === "video" ? "Video comparison" : "Image comparison";
                } else {
                    text = "Pick or drop a file on side A and side B";
                    color = "#999";
                }
                status.textContent = text;
                status.title = text;
                status.style.color = color;
            }

            // ---- Fenetres de choix ----
            const linkState = () => linkedProject(node, projectInputNames(NODE_NAME), PROJECT_NODE);
            let projectWired = false;
            const pickOps = {
                pickOnly: true,
                kindLock: () => (pickSide ? lockFor(pickSide) : ""),
                onPick: (p) => {
                    if (pickSide) pickFile(pickSide, p);
                },
            };
            // Type retenu sous des cles propres au Compare (celui de MedLoad n'est pas touche).
            const folderWin = buildFolderWindow(container, { ...pickOps, kindKey: "mmcompare.folderKind" });
            const projectWin = buildProjectWindow(container, { ...pickOps, kindKey: "mmcompare.projectKind" });
            const browserChoice = () => (node.properties[BROWSER_KEY] === "project" ? "project" : "folder");
            const activeBrowser = () => (projectWired ? browserChoice() : "folder");
            function paintPill() {
                projectWired = !!linkState().wired;
                const active = activeBrowser();
                for (const value of ["project", "folder"]) {
                    const b = pillBtns[value];
                    const on = value === active;
                    const off = value === "project" && !projectWired;
                    b.style.borderColor = on ? GREEN : "#3a3a3a";
                    b.style.color = on ? GREEN : "#ddd";
                    b.style.fontWeight = on ? "bold" : "normal";
                    b.style.opacity = off ? "0.4" : "1";
                    b.style.cursor = off ? "default" : "pointer";
                    b.title = off ? PROJECT_TIP : value === "project"
                        ? "Pick the files in the wired project" : "Pick the files in the input and output folders of ComfyUI";
                }
                // Sans projet, la fenetre Project ouverte se ferme.
                if (!projectWired && projectWin.isOpen()) projectWin.close();
                paintStatus();
            }
            function openWindow() {
                const value = activeBrowser();
                const win = value === "project" ? projectWin : folderWin;
                const other = value === "project" ? folderWin : projectWin;
                if (other.isOpen()) other.close();
                if (win.isOpen()) win.relock();
                else if (value === "project") projectWin.open(linkState().info, container);
                else folderWin.open(container);
                // La fenetre se ferme par Close ou Echap : la ligne d'etat suit a la fermeture.
                setTimeout(watchWindows, 300);
            }
            // Fenetre fermee (Close, Echap) : plus de consigne "Click a file...".
            let watchTimer = null;
            function watchWindows() {
                clearTimeout(watchTimer);
                if (folderWin.isOpen() || projectWin.isOpen()) {
                    watchTimer = setTimeout(watchWindows, 500);
                    return;
                }
                pickSide = null;
                paintStatus();
            }
            function chooseBrowser(value) {
                if (value === "project" && !projectWired) return;
                node.properties[BROWSER_KEY] = value;
                paintPill();
                // Une fenetre deja ouverte passe a l'autre moitie, pour le meme cote.
                if (pickSide && (folderWin.isOpen() || projectWin.isOpen())) openWindow();
            }
            pillBtns.project.addEventListener("click", () => chooseBrowser("project"));
            pillBtns.folder.addEventListener("click", () => chooseBrowser("folder"));
            for (const side of SIDES) {
                sideBtns[side].addEventListener("click", () => {
                    if (wired()[side]) return; // entree branchee : bouton grise
                    pickSide = side;
                    message = null;
                    paintPill();
                    openWindow();
                    paintStatus();
                });
            }
            function paintSideButtons() {
                const w = wired();
                for (const side of SIDES) {
                    const b = sideBtns[side];
                    b.style.opacity = w[side] ? "0.4" : "1";
                    b.style.cursor = w[side] ? "default" : "pointer";
                    b.title = w[side] ? "Input " + side + " is wired" : "Pick the file of side " + side;
                }
            }

            // ---- Cote rempli par un fichier ----
            const relockWindows = () => {
                if (folderWin.isOpen()) folderWin.relock();
                if (projectWin.isOpen()) projectWin.relock();
            };
            /** Pose un fichier deja verifie sur un cote ; false si refuse (texte dans la ligne d'etat). */
            async function setSide(side, path, kind) {
                if (wired()[side]) {
                    say("Input " + side + " is wired: unwire it to drop a file here");
                    return false;
                }
                const ok = acceptKind(lockFor(side), kind);
                if (!ok.ok) {
                    say(kind === "audio" ? ok.text + ": " + baseName(path) : ok.text);
                    return false;
                }
                const s = readState();
                s[key(side)] = { path, kind };
                // L'etoile appartient au fichier : elle part avec l'ancien (revue finale) ;
                // applyStoredStars la rend si le nouveau fichier est deja etoile.
                s.star = starAfterSet(s, side);
                writeState(s);
                message = null;
                paint();
                relockWindows();
                await applyStoredStars({ placed: side });
                return true;
            }
            /**
             * Etoile a la pose : un seul des deux fichiers deja etoile dans son projet -> ce cote.
             * opts.placed = cote qui vient de recevoir un fichier ; opts.keep = ouverture d'un workflow :
             * un etat qui a deja une etoile n'est pas touche.
             */
            async function applyStoredStars(opts = {}) {
                const s0 = readState();
                if (opts.keep && s0.star) return;
                const w = wired();
                const paths = SIDES.map((x) => (w[x] ? "" : s0[key(x)].path));
                const lists = await Promise.all(paths.map(async (p) => {
                    if (!p) return [];
                    try {
                        return ((await apiGet("/mmproject/stars?path=" + encodeURIComponent(p))).stars || []).map(normPath);
                    } catch (e) {
                        return []; // hors projet ou projet illisible : etoile du noeud seule
                    }
                }));
                const s = readState();
                // L'etat a pu changer pendant la lecture : seulement si les fichiers sont les memes.
                if (SIDES.some((x, i) => (w[x] ? "" : s[key(x)].path) !== paths[i])) return;
                if (opts.keep && s.star) return; // etoile posee pendant la lecture
                const stored = paths.map((p, i) => !!p && lists[i].includes(normPath(p)));
                const star = initialStar(s, stored[0], stored[1], opts.placed);
                if (star !== s.star) {
                    s.star = star;
                    writeState(s);
                    paint();
                }
            }
            /** Fichier clique dans une fenetre : verifie par le serveur (input / output seulement). */
            async function pickFile(side, path) {
                try {
                    const info = await apiGet("/mmrefloader/load_media/check?file=" + encodeURIComponent(path));
                    await setSide(side, info.path, info.kind);
                } catch (e) {
                    say(e.message);
                }
            }
            /** Vide un cote (bouton ✕) ; les deux cotes vides = type libre. */
            function clearSide(side) {
                const s = readState();
                s[key(side)] = { path: "", kind: "" };
                // L'etoile appartient au fichier : retiree avec lui.
                if (s.star === side) s.star = "";
                writeState(s);
                message = null;
                paint();
                relockWindows();
            }

            /** Depot d'un lien ; side = moitie du cadre, ou null (premier cote libre). */
            async function applyDrop(text, side) {
                if (!text) {
                    say("No path in this drop: drag the file from MagicStudio Final Cut, 40 / 60, Processing or a window of this node.");
                    return false;
                }
                const w = wired();
                const target = side || bodyDropSide(readState(), w);
                if (!target) {
                    say("Both sides are taken: drop on side A or B of the viewer");
                    return false;
                }
                if (w[target]) {
                    say("Input " + target + " is wired: unwire it to drop a file here");
                    return false;
                }
                let info;
                try {
                    info = await apiGet("/mmrefloader/load_media/check?drop=" + encodeURIComponent(text));
                } catch (e) {
                    say(e.message);
                    return false;
                }
                return setSide(target, info.path, info.kind);
            }

            // ---- Cadre de comparaison (compare_viewer.js) ----
            const viewer = buildCompareViewer(frame, {
                onRemove: (side) => clearSide(side),
                barHost: playerSlot,
            });
            /** Source d'un cote pour le cadre : null si rien (ni fichier ni entree branchee). */
            function viewSource(side) {
                const src = sourceOf(side);
                if (!src.from) return null;
                return { path: src.path, kind: src.kind, from: src.from, kept: src.kept };
            }
            // Cadence de chaque cote : /mmrefloader/info (fps) ; apercu de frames branchees = 24.
            const fps = { A: 24, B: 24 };
            const fpsKeys = { A: "", B: "" };
            function refreshFps(side, src) {
                const fromFrames = !!src && src.from === "input" && linkedInput(sideInputs(side)[1]);
                const k = src && src.path && src.kind === "video" ? (fromFrames ? "f|" : "v|") + src.path : "";
                if (k === fpsKeys[side]) return;
                fpsKeys[side] = k;
                fps[side] = 24;
                viewer.setFps(fps);
                if (!k || fromFrames) return;
                apiGet("/mmrefloader/info?file=" + encodeURIComponent(src.path)).then((info) => {
                    if (fpsKeys[side] !== k) return; // source changee pendant la lecture
                    fps[side] = sideFps(false, info && info.fps);
                    viewer.setFps(fps);
                }).catch(() => {
                    // fichier illisible : 24 images / s
                });
            }
            function defaultRenderer(api) {
                const s = api.readState();
                paintModes(s.mode);
                const sources = { A: viewSource("A"), B: viewSource("B") };
                for (const side of SIDES) refreshFps(side, sources[side]);
                viewer.setMode(s.mode);
                viewer.setStar(s.star);
                viewer.setSync(s.sync);
                viewer.setSources(sources);
                paintSync(s.sync, SIDES.map((x) => (sources[x] ? sources[x].kind : "")));
            }
            let renderer = defaultRenderer;

            // ---- Interface publique pour les taches 6 a 8 ----
            const api = {
                node, container, top, pill, sideBtns, helpSlot, status, modeSlot, modeRow, frame, playerSlot, starRow,
                viewer,
                readState, writeState, wired, wiredKinds, comparisonKinds, sourceOf, lockFor, previewOf,
                setSide, clearSide, applyDrop, say, paint, paintStatus,
                /** Remplace le dessin du cadre (tache 6) ; fn(api) est appelee a chaque paint(). */
                setRenderer(fn) {
                    renderer = typeof fn === "function" ? fn : defaultRenderer;
                    paint();
                },
                /** Crochets appeles a chaque paint() (ligne des etoiles, lecteur...). */
                onPaint: [],
                /** Crochets appeles par mmCompareRelease() (lecteurs a vider). */
                onRelease: [],
                /** Crochets appeles par dispose() (minuteurs, boucles, ecouteurs a arreter). */
                onDispose: [],
                /** Efface un refus garde (branchement change) et repeint la ligne d'etat. */
                clearMessage() {
                    if (!message) return;
                    message = null;
                    paintStatus();
                },
                /** Noeud supprime : minuteurs, boucles de lecture et ecouteurs arretes. */
                dispose() {
                    clearTimeout(watchTimer);
                    clearTimeout(pillTimer);
                    viewer.dispose();
                    for (const fn of api.onDispose) {
                        try {
                            fn(api);
                        } catch (e) {
                            console.error("[MagicStudio] Compare dispose:", e);
                        }
                    }
                },
            };
            // ---- Ligne des etoiles (tache 8) : ★ Source A a gauche, Source B ★ a droite ----
            const starBtns = {};
            for (const side of SIDES) {
                const b = document.createElement("button");
                b.type = "button";
                // Bouton bien visible sur le fond du noeud (demande utilisateur 05/11/2026 : etoiles peu visibles) :
                // fond sombre, texte clair, etoile plus grande ; allumee = etoile et bord dores.
                Object.assign(b.style, {
                    display: "inline-flex", alignItems: "center", gap: "5px",
                    background: "rgba(0,0,0,0.45)", border: "1px solid " + STAR_OFF, borderRadius: "12px",
                    padding: "2px 10px", cursor: "pointer", fontSize: "12px", color: "#eee",
                    fontFamily: "inherit", maxWidth: "48%", overflow: "hidden", whiteSpace: "nowrap",
                });
                b.addEventListener("click", () => clickStar(side));
                starBtns[side] = b;
            }
            starRow.append(starBtns.A, starBtns.B);
            function paintStars(api2) {
                const s = api2.readState();
                for (const side of SIDES) {
                    const b = starBtns[side];
                    const on = s.star === side;
                    const star = document.createElement("span");
                    star.textContent = on ? "★" : "☆";
                    Object.assign(star.style, { fontSize: "17px", lineHeight: "1", color: on ? STAR_GOLD : "#ddd" });
                    const label = document.createElement("span");
                    label.textContent = "Source " + side;
                    b.replaceChildren(...(side === "A" ? [star, label] : [label, star]));
                    b.style.borderColor = on ? STAR_GOLD : STAR_OFF;
                    b.style.color = on ? STAR_GOLD : "#eee";
                    const src = sourceOf(side);
                    b.title = src.from === "input" ? "Input " + side : (src.path ? baseName(src.path) : STAR_TIP);
                    // Cote vide : etoile grisee, sans effet.
                    b.style.opacity = src.from ? "1" : "0.4";
                    b.style.cursor = src.from ? "pointer" : "default";
                }
            }
            api.onPaint.push(paintStars);
            /** Clic sur une etoile : l'etoile du noeud change tout de suite, le serveur garde celle du fichier. */
            async function clickStar(side) {
                // Cote vide (ni fichier ni entree branchee) : rien (revue finale : sinon l'etoile
                // enregistree du fichier de l'autre cote etait retiree).
                if (!sourceOf(side).from) return;
                const before = readState();
                const plan = starPlan(before, side, wired());
                const s = readState();
                s.star = plan.star;
                writeState(s);
                paint();
                if (!plan.on && !plan.off) {
                    if (plan.star) say("Star kept in this node only (file outside a project or wired input)", false);
                    return;
                }
                try {
                    const r = await apiPost("/mmproject/star", { on: plan.on, off: plan.off });
                    if (plan.star && (!plan.on || (r && r.on === "node"))) {
                        say("Star kept in this node only (file outside a project or wired input)", false);
                    } else {
                        say("");
                    }
                } catch (e) {
                    // Echec : etoile du noeud remise comme avant, texte dans la ligne d'etat.
                    const back = readState();
                    back.star = before.star;
                    writeState(back);
                    paint();
                    say(e.message || String(e));
                }
            }
            // Lecteurs du cadre vides avec les autres (verrou Windows).
            api.onRelease.push(() => viewer.release());
            function paint() {
                paintSideButtons();
                renderer(api);
                for (const fn of api.onPaint) {
                    try {
                        fn(api);
                    } catch (e) {
                        console.error("[MagicStudio] Compare paint:", e);
                    }
                }
                paintStatus();
            }
            node.__mmCompare = api;
            node.mmCompareState = () => readState();
            node.mmCompareSet = (side, path, kind) => setSide(side, path, kind);
            node.mmCompareDrop = (text, side) => applyDrop(text, side || null);
            /** Ferme les lecteurs du noeud (fichier verrouille sous Windows avant un deplacement). */
            node.mmCompareRelease = () => {
                for (const el of container.querySelectorAll("video, audio")) {
                    try {
                        el.pause();
                        el.removeAttribute("src");
                        el.load();
                    } catch (e) {
                        // element deja retire
                    }
                }
                for (const fn of api.onRelease) {
                    try {
                        fn(api);
                    } catch (e) {
                        console.error("[MagicStudio] Compare release:", e);
                    }
                }
            };
            node.mmComparePaint = () => paint();
            // Ouverture d'un workflow : etoiles enregistrees relues, sans ecraser une etoile du noeud.
            node.mmCompareStoredStars = () => applyStoredStars({ keep: true });
            node.mmComparePaintPill = () => paintPill();
            // Appele par le noeud Project quand son projet change (comme MedLoad).
            let pillTimer = null;
            node.mmProjectRefresh = () => {
                clearTimeout(pillTimer);
                pillTimer = setTimeout(paintPill, 100);
            };
            node.__mmcompareWindows = [folderWin, projectWin];
            const helpBtn = document.createElement("button");
            helpBtn.type = "button";
            helpBtn.textContent = "?";
            Object.assign(helpBtn.style, {
                width: "22px", height: "22px", borderRadius: "50%", border: "none", background: PINK,
                color: "white", fontWeight: "bold", cursor: "pointer", padding: "0", flex: "0 0 auto",
            });
            helpSlot.append(helpBtn);
            const help = buildHelpOverlay(container, {
                sectionsFor: helpSections, nodeTitle: "MagicStudio Image / Video Compare", sectionKey: "mmcompare.helpSection",
            });
            helpBtn.addEventListener("click", () => help.open());
            node.__mmcompareOverlays = [help];
            node.__mmcompareSay = say;

            // ---- Depot sur tout le cadre du noeud (capture : le canevas ne doit pas le recevoir) ----
            const mark = (on) => (frame.style.borderColor = on ? PINK : "#3b5f5b");
            const accepts = (dt) => carriesLink(dt) || !!(dt && Array.from(dt.types || []).includes("Files"));
            container.addEventListener("dragover", (e) => {
                if (!accepts(e.dataTransfer)) return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "copy";
                mark(true);
            }, true);
            // Passage d'une moitie a l'autre : la souris reste dans le widget, le cadre ne clignote pas.
            container.addEventListener("dragleave", (e) => {
                if (e.relatedTarget && container.contains(e.relatedTarget)) return;
                mark(false);
            }, true);
            container.addEventListener("drop", (e) => {
                if (!accepts(e.dataTransfer)) return;
                e.preventDefault();
                e.stopPropagation();
                mark(false);
                const inFrame = frame.contains(e.target);
                const side = inFrame ? halfSide(readState().mode, frame.getBoundingClientRect(), e.clientX, e.clientY) : null;
                applyDrop(droppedText(e.dataTransfer), side);
            }, true);

            node.addDOMWidget("mmcompare_ui", "mmcompare", container, {
                serialize: false,
                hideOnZoom: false,
                getMinHeight: () => uiHeight(readState().sync),
                getHeight: () => uiHeight(readState().sync),
            });
            const onResize = node.onResize;
            node.onResize = function (size) {
                if (size[0] < MIN_WIDTH) size[0] = MIN_WIDTH;
                return onResize ? onResize.apply(this, arguments) : undefined;
            };
            paintPill();
            paint();
            setTimeout(() => {
                if (node.size[0] < MIN_WIDTH) node.setSize([MIN_WIDTH, node.size[1]]);
                paintPill();
                paint();
            }, 0);
            return r;
        };

        // Workflow ouvert : l'etat et les liens arrivent apres la creation du noeud.
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = onConfigure ? onConfigure.apply(this, arguments) : undefined;
            if (this.mmComparePaint) setTimeout(() => {
                this.mmComparePaintPill();
                this.mmComparePaint();
                if (this.mmCompareStoredStars) this.mmCompareStoredStars();
            }, 0);
            return r;
        };

        // video_x et frames_x du meme cote ne se branchent pas ensemble (meme regle que le Run).
        const onConnectInput = nodeType.prototype.onConnectInput;
        nodeType.prototype.onConnectInput = function (slot, type, output, origin) {
            const inp = (this.inputs || [])[slot];
            const m = inp && /^(video|frames)_([ab])$/.exec(inp.name);
            if (m) {
                const side = m[2].toUpperCase();
                const otherName = (m[1] === "video" ? "frames_" : "video_") + m[2];
                const other = (this.inputs || []).find((i) => i && i.name === otherName);
                if (other && other.link !== null && other.link !== undefined) {
                    if (this.__mmcompareSay) this.__mmcompareSay("Side " + side + " already has an input");
                    return false;
                }
            }
            return onConnectInput ? onConnectInput.apply(this, arguments) : true;
        };

        // Branchement / debranchement : boutons A / B, cadre et pilule relus.
        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function () {
            const res = onConnectionsChange ? onConnectionsChange.apply(this, arguments) : undefined;
            // Un refus garde (ex. "Side A already has an input") ne vaut plus apres un changement de liens.
            if (this.__mmCompare) this.__mmCompare.clearMessage();
            if (this.mmProjectRefresh) this.mmProjectRefresh();
            if (this.mmComparePaint) setTimeout(() => this.mmComparePaint(), 0);
            return res;
        };

        // Apercus des entrees branchees ecrits par le Run : chemins gardes dans properties.
        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (msg) {
            const res = onExecuted ? onExecuted.apply(this, arguments) : undefined;
            const list = msg && msg.mmcompare;
            if (Array.isArray(list)) {
                if (!this.properties) this.properties = {};
                const map = {};
                for (const it of list) {
                    if (it && (it.side === "A" || it.side === "B") && it.path) map[it.side] = { path: it.path, kind: it.kind };
                }
                this.properties[PREVIEW_KEY] = map;
                if (this.mmComparePaint) this.mmComparePaint();
            }
            return res;
        };

        // Depot sur le corps du noeud (hors widget) : premier cote libre.
        nodeType.prototype.onDragOver = function (e) {
            return carriesLink(e && e.dataTransfer);
        };
        nodeType.prototype.onDragDrop = function (e) {
            const text = droppedText(e && e.dataTransfer);
            if (!text || !this.mmCompareDrop) return false;
            this.mmCompareDrop(text, null);
            return true;
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            if (this.mmCompareRelease) this.mmCompareRelease();
            if (this.__mmCompare) this.__mmCompare.dispose();
            (this.__mmcompareOverlays || []).forEach((o) => o.remove());
            (this.__mmcompareWindows || []).forEach((w) => w.remove());
            return onRemoved ? onRemoved.apply(this, arguments) : undefined;
        };
    },
});
