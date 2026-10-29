import { app } from "../../scripts/app.js";
import {
    TITLE_COLOR, BODY_COLOR, VIOLET, PINK, ORANGE, GREEN,
    iconBadge, hList, hSteps, hTip, hNote, hCard, IMAGE_ICON, VIDEO_ICON, AUDIO_ICON, START_ICON, FOLDER_ICON,
    buildHelpOverlay, vueMode, getVariantDesc, PAIR_COLORS, rememberLinks, restoreLinks, trackVueNode,
    untrackVueNode, scheduleVueSync, hitOutputLabel, openOutputLabelEditor, setOutputLabel, closeOutputEditor,
} from "./minimax_ref_loader.js";
import { variantOf, variantLayout, pairedOutputs } from "./profiles.js";
import { traceSource, outputLinksOf, saveOutputLinks, restoreOutputLinks } from "./graph_links.js";

// --------------------------------------------------------------------
// Noeud MagicStudio Container (plan des variantes, 29/10/2026) : redonne les sorties
// de la variante choisie dans le RefLoader relie a l'entree package. Python
// (nodes.MagicStudioContainer) declare 40 sorties joker et renvoie les valeurs du
// package dans l'ordre de la variante ; ce fichier n'affiche que celles de la variante,
// par position, avec leurs vrais noms et types (IMAGE, AUDIO, INT).
// --------------------------------------------------------------------

const NODE_NAME = "MagicStudioContainer";
const LOADER_NAME = "MiniMaxH3RefLoader";
const MIN_WIDTH = 260;
const UI_HEIGHT = 34;
const NO_LOADER = "Wire the package output of a MagicStudio RefLoader";

const isLoader = (n) => n && n.type === LOADER_NAME && typeof n.mmGetState === "function";

/**
 * Aligne les sorties du noeud sur entries ([{key, type}]), par position. Les objets sortie
 * restent en place : on corrige seulement origin_slot des liens (graph.links) puis nom /
 * type / etiquette par position (jamais output.links assigne : une affectation debranche).
 * Une sortie qui disparait garde ses liens en memoire (rememberLinks) ; ils reviennent avec
 * elle si l'entree en aval est libre. relink = false : aucun lien touche (creation du noeud).
 */
function applyLayout(node, entries, pairs, relink) {
    const keys = entries.map((e) => e.key);
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
        // Nouveaux index d'abord : retirer les dernieres sorties ne debranche alors que
        // des positions devenues vides.
        keys.forEach((k, i) => (saved[k] ? saved[k].links : []).forEach((l) => (l.origin_slot = i)));
        while (node.outputs.length < keys.length) node.addOutput("tmp", "*");
        while (node.outputs.length > keys.length) node.removeOutput(node.outputs.length - 1);
        keys.forEach((k, i) => {
            const o = node.outputs[i];
            o.name = k;
            o.localized_name = k;
            o.label = saved[k] ? saved[k].label : undefined;
        });
    }
    // Paire complete (video N et sa bande-son N) : les deux points prennent la couleur
    // de la paire ; sinon couleur du type.
    node.outputs.forEach((o, i) => {
        o.type = entries[i].type;
        const n = pairs[o.name];
        const color = n ? PAIR_COLORS[(n - 1) % PAIR_COLORS.length] : undefined;
        o.color_on = color;
        o.color_off = color;
    });
    // Apres les types : une sortie qui etait AUDIO refuserait une entree IMAGE.
    if (!same && relink) restoreLinks(node);
    const min = node.computeSize();
    node.setSize([Math.max(node.size[0], MIN_WIDTH), min[1]]);
    node.setDirtyCanvas(true, true);
    scheduleVueSync();
}

// ---- Aide ----
const HELP_SECTIONS = [
    {
        id: "start", title: "Quick start", icon: START_ICON, color: TITLE_COLOR,
        html: hSteps([
            "Add a <b>MagicStudio RefLoader</b> and pick its files.",
            "Wire its <b>package</b> output to the <b>package</b> input of this node.",
            "Wire the outputs of this node to the video model (for example <b>ref_image_1</b> to <b>ref_image_0</b>).",
        ]) +
        hTip("the outputs follow the model and the variant chosen in the RefLoader: change them there, " +
            "not here."),
    },
    {
        id: "inputs", title: "Inputs", icon: FOLDER_ICON, color: VIOLET,
        html: hCard("package (required)", [
            ["Wire", "the <b>package</b> output of a <b>MagicStudio RefLoader</b> (Get / Set and Reroute nodes are " +
                "followed)"],
            ["Brings", "the files of the variant shown in the RefLoader, already loaded"],
            ["Without it", "no output, and the node says: <b>" + NO_LOADER + "</b>"],
        ]),
    },
    {
        id: "outputs", title: "Outputs", icon: VIDEO_ICON, color: ORANGE,
        html: hList([
            "One output per file of the variant, with its name and its type: " +
            iconBadge(IMAGE_ICON, VIOLET) + " images and video frames (IMAGE), " +
            iconBadge(AUDIO_ICON, TITLE_COLOR) + " sounds (AUDIO), frame numbers and settings (INT).",
            "A row of the RefLoader always has at least one output, empty while nothing is picked.",
            "Ref2VA: a video and its soundtrack of the same number have the same dot color.",
            "Double-click the name of an output (or right-click the node) to rename it.",
        ]) +
        hNote("the files are loaded once, by the RefLoader: several Containers on the same RefLoader do not " +
            "load them again."),
    },
    {
        id: "variants", title: "Variants", icon: AUDIO_ICON, color: GREEN,
        html: hList([
            "Changing the variant in the RefLoader changes the outputs of this node.",
            "The links of each variant are kept: coming back to a variant wires them again, when the input " +
            "is still free.",
            "An old workflow (RefLoader with one output per file) gets a Container next to its RefLoader, " +
            "wired the same way.",
        ]),
    },
];
const HELP_SECTIONS_FR = [
    {
        id: "start", title: "Démarrage rapide",
        html: hSteps([
            "Ajoutez un <b>MagicStudio RefLoader</b> et choisissez ses fichiers.",
            "Branchez sa sortie <b>package</b> sur l'entrée <b>package</b> de ce nœud.",
            "Branchez les sorties de ce nœud sur le modèle vidéo (par exemple <b>ref_image_1</b> sur <b>ref_image_0</b>).",
        ]) +
        hTip("les sorties suivent le modèle et la variante choisis dans le RefLoader : changez-les là-bas, " +
            "pas ici.", "Astuce :"),
    },
    {
        id: "inputs", title: "Entrées",
        html: hCard("package (obligatoire)", [
            ["Brancher", "la sortie <b>package</b> d'un <b>MagicStudio RefLoader</b> (les nœuds Get / Set et Reroute " +
                "sont suivis)"],
            ["Apporte", "les fichiers de la variante affichée dans le RefLoader, déjà chargés"],
            ["Sans elle", "aucune sortie, et le nœud indique : <b>" + NO_LOADER + "</b>"],
        ]),
    },
    {
        id: "outputs", title: "Sorties",
        html: hList([
            "Une sortie par fichier de la variante, avec son nom et son type : " +
            iconBadge(IMAGE_ICON, VIOLET) + " images et images de vidéo (IMAGE), " +
            iconBadge(AUDIO_ICON, TITLE_COLOR) + " sons (AUDIO), numéros d'image et réglages (INT).",
            "Une ligne du RefLoader a toujours au moins une sortie, vide tant que rien n'est choisi.",
            "Ref2VA : une vidéo et sa bande-son du même numéro ont la même couleur de point.",
            "Double-cliquez sur le nom d'une sortie (ou clic droit sur le nœud) pour la renommer.",
        ]) +
        hNote("les fichiers sont chargés une seule fois, par le RefLoader : plusieurs Containers sur le même " +
            "RefLoader ne les rechargent pas.", "Remarque :"),
    },
    {
        id: "variants", title: "Variantes",
        html: hList([
            "Changer de variante dans le RefLoader change les sorties de ce nœud.",
            "Les liens de chaque variante sont gardés : en revenant sur une variante, ils sont rebranchés si " +
            "l'entrée est encore libre.",
            "Un ancien workflow (RefLoader avec une sortie par fichier) reçoit un Container à côté de son " +
            "RefLoader, branché de la même façon.",
        ]),
    },
];
function helpSections(lang) {
    if (lang !== "fr") return HELP_SECTIONS;
    const fr = Object.fromEntries(HELP_SECTIONS_FR.map((sec) => [sec.id, sec]));
    return HELP_SECTIONS.map((sec) => (fr[sec.id] ? Object.assign({}, sec, fr[sec.id]) : sec));
}

app.registerExtension({
    name: "MagicStudio.Container",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;
            node.color = TITLE_COLOR;
            node.bgcolor = BODY_COLOR;
            node.properties = node.properties || {};

            const container = document.createElement("div");
            Object.assign(container.style, {
                display: "flex", alignItems: "center", gap: "6px", padding: "4px 8px", boxSizing: "border-box",
                width: "100%", fontFamily: "sans-serif", fontSize: "12px", color: "#ddd",
            });
            const status = document.createElement("div");
            Object.assign(status.style, {
                flex: "1", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                fontWeight: "bold",
            });
            const helpBtn = document.createElement("button");
            helpBtn.type = "button";
            helpBtn.textContent = "?";
            Object.assign(helpBtn.style, {
                width: "22px", height: "22px", borderRadius: "50%", border: "none", background: PINK,
                color: "white", fontWeight: "bold", cursor: "pointer", padding: "0", flex: "0 0 auto",
            });
            container.append(status, helpBtn);
            const help = buildHelpOverlay(container, {
                sectionsFor: helpSections, nodeTitle: "MagicStudio Container", sectionKey: "mmcontainer.helpSection",
            });
            helpBtn.addEventListener("click", () => help.open());
            node.__mmcontainerOverlays = [help];

            const packageSlot = () => (node.inputs || []).findIndex((i) => i.name === "package");
            /** RefLoader relie a l'entree package (Get / Set et Reroute traverses), ou null. */
            const linkedLoader = () => (node.graph ? traceSource(node, packageSlot(), isLoader) : null);

            /**
             * Sorties de la variante du RefLoader relie. Changement de variante : liens de
             * l'ancienne gardes dans properties.modeLinks[variante], ceux de la nouvelle remis.
             * relink = false (creation) : aucun lien touche.
             */
            function layoutFrom(state, relink) {
                const desc = getVariantDesc();
                const entries = state ? variantLayout(state, desc).map((o) => ({ key: o.key, type: o.type })) : [];
                const v = state ? variantOf(state, desc) : null;
                const prev = node.properties.mmVariant || null;
                const switching = relink && v && prev && v !== prev;
                if (switching) {
                    node.properties.modeLinks = Object.assign({}, node.properties.modeLinks, { [prev]: saveOutputLinks(node) });
                }
                applyLayout(node, entries, state ? pairedOutputs(state, desc) : {}, relink);
                if (switching) restoreOutputLinks(node, (node.properties.modeLinks || {})[v] || []);
                if (v) node.properties.mmVariant = v;
                const label = v ? desc.variants[v].label : "";
                status.textContent = state ? label + " · " + entries.length + " output" + (entries.length > 1 ? "s" : "")
                    : NO_LOADER;
                status.style.color = state ? "#9fd6cf" : ORANGE;
                status.title = state ? "Outputs of the " + label + " variant of the RefLoader" : NO_LOADER;
            }

            let loading = false;
            function refresh() {
                if (loading) return;
                const loader = linkedLoader();
                layoutFrom(loader ? loader.mmGetState() : null, true);
            }
            node.__mmContainerRefresh = () => refresh();
            node.__mmrefRefresh = () => refresh();
            /** Reprise d'un ancien RefLoader : sorties de son etat, sans toucher aux liens. */
            node.mmLayoutFrom = (state) => layoutFrom(state, false);

            node.addDOMWidget("mmcontainer_ui", "mmcontainer", container, {
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

            // Branchement / debranchement de package : relire (apres la fin du geste).
            const onConnectionsChange = node.onConnectionsChange;
            node.onConnectionsChange = function (type, slot) {
                const res = onConnectionsChange ? onConnectionsChange.apply(this, arguments) : undefined;
                if (type === 1 && slot === packageSlot()) setTimeout(refresh, 0);
                return res;
            };

            // Ouverture d'un workflow : le frontend renomme les sorties par position pendant
            // configure() et ajoute les sorties manquantes : les noms enregistres sont releves
            // avant, remis dans onConfigure, et les sorties en trop (sans lien) retirees.
            let savedOutputs = null;
            const configure = node.configure;
            node.configure = function (info) {
                loading = true;
                savedOutputs = info && Array.isArray(info.outputs)
                    ? info.outputs.map((o) => (o && typeof o.name === "string" ? { name: o.name, label: o.label } : null))
                    : null;
                return configure.apply(this, arguments);
            };
            const onConfigure = node.onConfigure;
            node.onConfigure = function () {
                const ret = onConfigure ? onConfigure.apply(this, arguments) : undefined;
                if (savedOutputs) {
                    savedOutputs.forEach((o, i) => {
                        const out = node.outputs && node.outputs[i];
                        if (!out || !o) return;
                        out.name = o.name;
                        out.localized_name = o.name;
                        out.label = o.label;
                    });
                    while (node.outputs.length > savedOutputs.length && !node.isOutputConnected(node.outputs.length - 1)) {
                        node.removeOutput(node.outputs.length - 1);
                    }
                }
                savedOutputs = null;
                // Tout le graphe charge (RefLoader compris) : relecture.
                setTimeout(() => {
                    loading = false;
                    refresh();
                }, 0);
                return ret;
            };

            // Nouveau noeud : aucune sortie tant qu'aucun RefLoader n'est relie (sans graphe,
            // aucun lien n'est touche).
            layoutFrom(null, false);
            trackVueNode(node);
            return r;
        };

        // Renommer une sortie par double-clic sur son nom (mode classique ; Nodes 2.0 : sur l'element DOM).
        const onDblClick = nodeType.prototype.onDblClick;
        nodeType.prototype.onDblClick = function (e, pos) {
            const r = onDblClick ? onDblClick.apply(this, arguments) : undefined;
            if (vueMode()) return r;
            const i = hitOutputLabel(this, pos);
            if (i >= 0) openOutputLabelEditor(this, i);
            return r;
        };

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

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            closeOutputEditor(this);
            untrackVueNode(this);
            (this.__mmcontainerOverlays || []).forEach((o) => o.remove());
            return onRemoved ? onRemoved.apply(this, arguments) : undefined;
        };
    },
});
