import { app } from "../../scripts/app.js";
import {
    TITLE_COLOR, BODY_COLOR, VIOLET, PINK, ORANGE, GREEN, INACTIVE_BG,
    iconBadge, hList, hSteps, hTip, hNote, hCard, AUDIO_ICON, START_ICON, FOLDER_ICON, GEAR_ICON,
    buildHelpOverlay, vueMode,
} from "./minimax_ref_loader.js";
import { linkedProject } from "./graph_links.js";
import { qualityChoices, fixQuality, voicePath, NO_QUALITY } from "./save_voice.js";

// --------------------------------------------------------------------
// Noeud MagicStudio SaveVoice (plan du 30/10/2026) : enregistre une voix de
// reference dans <projet>\90.Pick Up\Son. Le projet vient de la sortie
// final_cut du noeud MagicStudio Project (entree "project"), suivie a travers
// Get / Set et Reroute (graph_links.linkedProject, partage avec Final Cut).
// Interface : qualite selon le format, ligne du dossier + Copy, lecteur du
// dernier fichier enregistre (ui.mmvoice du Run).
// --------------------------------------------------------------------

const NODE_NAME = "MagicStudioSaveVoice";
const PROJECT_NODE = "MiniMaxH3Project";
const MIN_WIDTH = 340;
const UI_HEIGHT = 140;
const RECHECK_MS = 2000; // relecture legere du projet relie et du format
const COPIED_MS = 1500;
const WIRE_TEXT = "Wire the final_cut output of a MagicStudio Project node";
const CHOOSE_TEXT = "Choose a project in the MagicStudio Project node";
const mediaUrl = (path) => "/mmrefloader/media?file=" + encodeURIComponent(path);
const baseName = (path) => String(path || "").split(/[\\/]/).pop();

/** Copie : API du presse-papiers, sinon zone de texte temporaire dans host (execCommand). */
async function clipboardCopy(text, host) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        const area = document.createElement("textarea");
        area.value = text;
        Object.assign(area.style, { position: "fixed", left: "-9999px", top: "0" });
        (host || document.body).appendChild(area);
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

// ---- Aide ----
const HELP_SECTIONS = [
    {
        id: "start", title: "Quick start", icon: START_ICON, color: TITLE_COLOR,
        html: hSteps([
            "Wire the <b>final_cut</b> output of the <b>MagicStudio Project</b> node to the <b>project</b> input.",
            "Wire a sound to the <b>audio</b> input (for example a voice made by a text-to-speech node).",
            "Choose the <b>format</b>: <b>wav</b> or <b>flac</b> for a voice reference.",
            "Click <b>Run</b>: the file is saved in <b>90.Pick Up\\Son</b> of the project, and the player shows it.",
        ]) +
        hCard("Parts of the node", [
            [iconBadge(AUDIO_ICON, TITLE_COLOR), "name of the linked project, or what to wire, in grey"],
            ["<b>Copy</b>", "copies the path of the folder where the voices are saved"],
            ["Player", "plays the last file saved by this node, with its name"],
        ]),
    },
    {
        id: "inputs", title: "Inputs", icon: FOLDER_ICON, color: VIOLET,
        html: hCard("Inputs (both required)", [
            ["<b>audio</b>", "the sound to save"],
            ["<b>project</b>", "the <b>final_cut</b> output of <b>MagicStudio Project</b>, directly or " +
                "through Get / Set or Reroute nodes"],
        ]) +
        hNote("without a linked project, the Run stops with the message <b>" + WIRE_TEXT + "</b>.") +
        hNote("the project must be chosen in the <b>MagicStudio Project</b> node."),
    },
    {
        id: "settings", title: "Settings", icon: GEAR_ICON, color: ORANGE,
        html: hCard("Settings", [
            ["<b>prefix</b>", "start of the file name; empty = <b>voice</b>"],
            ["<b>format</b>", "<b>wav</b> (no loss, big file), <b>flac</b> (no loss, smaller), " +
                "<b>mp3</b> or <b>opus</b> (smaller, with a loss of quality)"],
            ["<b>quality</b>", "mp3: <b>V0</b>, <b>128k</b>, <b>320k</b> (default V0); opus: <b>64k</b> to " +
                "<b>320k</b> (default 128k); greyed for wav and flac"],
        ]) +
        hList([
            "File name: <b>prefix_yyyyMMdd_HHmmss.format</b> (date and time of the save).",
            "A file is never overwritten: if the name is taken, one second is added.",
        ]) +
        hTip("for a voice reference, prefer <b>wav</b> or <b>flac</b>: the voice keeps all its quality."),
    },
    {
        id: "outputs", title: "Outputs", icon: AUDIO_ICON, color: PINK,
        html: hCard("Outputs", [
            ["<b>audio</b>", "the same sound, to wire to another node"],
            ["<b>path</b>", "the full path of the saved file (text)"],
        ]) +
        hNote("the file is not linked to a run: it does not appear in the run windows (04, 40, 60) of " +
            "<b>MagicStudio Project</b>.") +
        hTip("the <b>Son</b> icon of <b>MagicStudio Project</b> copies the path of the same folder."),
    },
];
const HELP_SECTIONS_FR = [
    {
        id: "start", title: "Démarrage rapide",
        html: hSteps([
            "Branchez la sortie <b>final_cut</b> du nœud <b>MagicStudio Project</b> sur l'entrée <b>project</b>.",
            "Branchez un son sur l'entrée <b>audio</b> (par exemple une voix créée par un nœud de synthèse vocale).",
            "Choisissez le <b>format</b> : <b>wav</b> ou <b>flac</b> pour une référence de voix.",
            "Cliquez sur <b>Run</b> : le fichier est enregistré dans <b>90.Pick Up\\Son</b> du projet, et le " +
            "lecteur le montre.",
        ]) +
        hCard("Parties du nœud", [
            [iconBadge(AUDIO_ICON, TITLE_COLOR), "nom du projet relié, ou ce qu'il faut brancher, en gris"],
            ["<b>Copy</b>", "copie le chemin du dossier où les voix sont enregistrées"],
            ["Lecteur", "joue le dernier fichier enregistré par ce nœud, avec son nom"],
        ]),
    },
    {
        id: "inputs", title: "Entrées",
        html: hCard("Entrées (obligatoires toutes les deux)", [
            ["<b>audio</b>", "le son à enregistrer"],
            ["<b>project</b>", "la sortie <b>final_cut</b> de <b>MagicStudio Project</b>, directement ou " +
                "par des nœuds Get / Set ou Reroute"],
        ]) +
        hNote("sans projet relié, le Run s'arrête avec le message <b>" + WIRE_TEXT + "</b>.", "Remarque :") +
        hNote("le projet doit être choisi dans le nœud <b>MagicStudio Project</b>.", "Remarque :"),
    },
    {
        id: "settings", title: "Réglages",
        html: hCard("Réglages", [
            ["<b>prefix</b>", "début du nom du fichier ; vide = <b>voice</b>"],
            ["<b>format</b>", "<b>wav</b> (sans perte, gros fichier), <b>flac</b> (sans perte, plus petit), " +
                "<b>mp3</b> ou <b>opus</b> (plus petits, avec une perte de qualité)"],
            ["<b>quality</b>", "mp3 : <b>V0</b>, <b>128k</b>, <b>320k</b> (V0 par défaut) ; opus : de <b>64k</b> " +
                "à <b>320k</b> (128k par défaut) ; grisé pour wav et flac"],
        ]) +
        hList([
            "Nom du fichier : <b>prefix_yyyyMMdd_HHmmss.format</b> (date et heure de l'enregistrement).",
            "Un fichier n'est jamais écrasé : si le nom est pris, une seconde est ajoutée.",
        ]) +
        hTip("pour une référence de voix, préférez <b>wav</b> ou <b>flac</b> : la voix garde toute sa qualité.",
            "Astuce :"),
    },
    {
        id: "outputs", title: "Sorties",
        html: hCard("Sorties", [
            ["<b>audio</b>", "le même son, à brancher sur un autre nœud"],
            ["<b>path</b>", "le chemin complet du fichier enregistré (texte)"],
        ]) +
        hNote("le fichier n'est rattaché à aucun Run : il n'apparaît pas dans les fenêtres des Runs " +
            "(04, 40, 60) de <b>MagicStudio Project</b>.", "Remarque :") +
        hTip("l'icône <b>Son</b> de <b>MagicStudio Project</b> copie le chemin du même dossier.", "Astuce :"),
    },
];
function helpSections(lang) {
    if (lang !== "fr") return HELP_SECTIONS;
    const fr = Object.fromEntries(HELP_SECTIONS_FR.map((sec) => [sec.id, sec]));
    return HELP_SECTIONS.map((sec) => (fr[sec.id] ? Object.assign({}, sec, fr[sec.id]) : sec));
}

// ---- Nodes 2.0 : ligne du widget quality grisee (le rendu Vue ne suit pas toujours widget.disabled) ----
const vueNodeEl = (node) => document.querySelector('[data-node-id="' + node.id + '"]');

/** Ligne DOM du widget name (Nodes 2.0), ou null (mode classique, pas encore rendue). */
function vueWidgetRow(node, name) {
    if (!vueMode()) return null;
    const el = vueNodeEl(node);
    if (!el) return null;
    const i = (node.inputs || []).findIndex((inp) => inp.widget && inp.widget.name === name);
    if (i < 0) return null;
    const dot = el.querySelector('[data-slot-key="' + node.id + "-in-" + i + '"]');
    const slot = dot && dot.closest(".lg-slot");
    return (slot && slot.closest(".lg-node-widgets > *")) || null;
}

app.registerExtension({
    name: "ComfyUI.MagicStudioSaveVoice",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;
            node.color = TITLE_COLOR;
            node.bgcolor = BODY_COLOR;
            node.properties = node.properties || {};
            const widget = (name) => (node.widgets || []).find((w) => w.name === name);
            const fmtW = widget("format");
            const qW = widget("quality");

            const container = document.createElement("div");
            Object.assign(container.style, {
                display: "flex", flexDirection: "column", gap: "6px", padding: "6px 8px", boxSizing: "border-box",
                width: "100%", fontFamily: "sans-serif", fontSize: "12px", color: "#ddd",
                // Hauteur naturelle (pas de height 100%) : en Nodes 2.0, le noeud suit son contenu.
            });

            // Ligne du haut : projet relie (ou consigne en gris), aide.
            const top = document.createElement("div");
            Object.assign(top.style, { display: "flex", alignItems: "center", gap: "6px" });
            const badge = document.createElement("span");
            badge.style.flex = "0 0 auto";
            badge.innerHTML = iconBadge(AUDIO_ICON, TITLE_COLOR);
            const status = document.createElement("div");
            Object.assign(status.style, {
                flex: "1", minWidth: "0", fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap",
            });
            const helpBtn = document.createElement("button");
            helpBtn.type = "button";
            helpBtn.textContent = "?";
            Object.assign(helpBtn.style, {
                width: "22px", height: "22px", borderRadius: "50%", border: "none", background: PINK,
                color: "white", fontWeight: "bold", cursor: "pointer", padding: "0", flex: "0 0 auto",
            });
            top.append(badge, status, helpBtn);

            // Ligne du dossier : chemin en lecture seule + Copy.
            const pathRow = document.createElement("div");
            Object.assign(pathRow.style, { display: "flex", alignItems: "center", gap: "6px" });
            const pathBox = document.createElement("input");
            pathBox.type = "text";
            pathBox.readOnly = true;
            Object.assign(pathBox.style, {
                flex: "1", minWidth: "0", height: "24px", boxSizing: "border-box", padding: "0 6px",
                background: "#111", border: "1px solid #333", borderRadius: "4px", color: "#ccc",
                fontSize: "11px", outline: "none",
            });
            const copyBtn = document.createElement("button");
            copyBtn.type = "button";
            copyBtn.textContent = "Copy";
            Object.assign(copyBtn.style, {
                flex: "0 0 auto", height: "24px", minWidth: "62px", padding: "0 10px", border: "none",
                borderRadius: "4px", background: INACTIVE_BG, color: "white", fontSize: "11px",
                fontWeight: "bold", cursor: "pointer",
            });
            pathRow.append(pathBox, copyBtn);

            // Lecteur du dernier fichier enregistre.
            const player = document.createElement("div");
            Object.assign(player.style, { display: "flex", flexDirection: "column", gap: "4px" });
            const fileName = document.createElement("div");
            Object.assign(fileName.style, {
                color: "#999", minHeight: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            });
            const audio = document.createElement("audio");
            audio.controls = true;
            audio.preload = "metadata";
            Object.assign(audio.style, { width: "100%", height: "36px", display: "none" });
            player.append(fileName, audio);
            container.append(top, pathRow, player);

            const help = buildHelpOverlay(container, {
                sectionsFor: helpSections, nodeTitle: "MagicStudio SaveVoice", sectionKey: "mmsavevoice.helpSection",
            });
            helpBtn.addEventListener("click", () => help.open());
            node.__mmsavevoiceOverlays = [help];

            // ---- Projet relie et dossier des voix ----
            let shownKey = null;
            let folder = "";
            function paintCopy(state) {
                const on = !!folder;
                copyBtn.disabled = !on;
                copyBtn.style.opacity = on ? "1" : "0.4";
                copyBtn.style.cursor = on ? "pointer" : "default";
                copyBtn.style.background = state === "ok" ? GREEN : INACTIVE_BG;
                copyBtn.textContent = state === "ok" ? "Copied" : state === "fail" ? "Failed" : "Copy";
            }
            function render(force) {
                const { wired, info } = linkedProject(node, "project", PROJECT_NODE);
                const key = (wired ? "1" : "0") + "|" + (info ? info.name + "|" + info.path : "");
                if (!force && key === shownKey) return;
                shownKey = key;
                folder = info ? voicePath(info.path) : "";
                const text = info ? info.name : wired ? CHOOSE_TEXT : WIRE_TEXT;
                status.textContent = text;
                status.title = info ? info.path : text;
                status.style.color = info ? "#eee" : "#888";
                status.style.fontWeight = info ? "bold" : "normal";
                pathBox.value = folder;
                pathBox.title = folder;
                pathBox.placeholder = info ? "" : WIRE_TEXT;
                paintCopy();
            }
            let copyTimer = null;
            copyBtn.addEventListener("click", async () => {
                if (!folder) return;
                const ok = await clipboardCopy(folder, container);
                clearTimeout(copyTimer);
                paintCopy(ok ? "ok" : "fail");
                copyTimer = setTimeout(() => paintCopy(), COPIED_MS);
            });

            // ---- Qualite selon le format ----
            // Copie propre au noeud de la liste des valeurs (celle de la definition peut etre partagee
            // entre les noeuds) ; ensuite modifiee sur place (le rendu Vue garde la meme reference).
            if (qW) {
                qW.options = qW.options || {};
                const all = typeof qW.options.values === "function" ? qW.options.values() : qW.options.values;
                qW.options.values = Array.isArray(all) ? all.slice() : [];
            }
            let appliedFormat = null;
            function paintVueQuality() {
                const row = qW && vueWidgetRow(node, "quality");
                if (!row) return;
                const off = !!qW.disabled;
                const want = off ? "0.45" : "";
                if (row.style.opacity !== want) row.style.opacity = want;
                const pe = off ? "none" : "";
                if (row.style.pointerEvents !== pe) row.style.pointerEvents = pe;
            }
            function applyQuality() {
                if (!fmtW || !qW) return;
                const fmt = fmtW.value;
                appliedFormat = fmt;
                const choices = qualityChoices(fmt);
                const values = qW.options.values;
                const list = choices.length ? choices : [NO_QUALITY];
                if (values.length !== list.length || values.some((v, i) => v !== list[i])) {
                    values.splice(0, values.length, ...list);
                }
                const value = fixQuality(fmt, qW.value);
                if (qW.value !== value) {
                    qW.value = value;
                    if (qW.callback) qW.callback(value);
                }
                qW.disabled = !choices.length;
                paintVueQuality();
                node.setDirtyCanvas(true, true);
            }
            if (fmtW) {
                const cb = fmtW.callback;
                fmtW.callback = function () {
                    const res = cb ? cb.apply(this, arguments) : undefined;
                    applyQuality();
                    return res;
                };
            }

            // ---- Lecteur ----
            function showPlayer() {
                const last = node.properties.mmvoiceLast;
                if (last && last.path) {
                    const name = last.name || baseName(last.path);
                    fileName.textContent = "Last saved: " + name;
                    fileName.title = last.path;
                    fileName.style.color = "#ccc";
                    const src = mediaUrl(last.path);
                    if (audio.dataset.src !== src) {
                        audio.dataset.src = src;
                        audio.src = src;
                    }
                    audio.style.display = "";
                } else {
                    fileName.textContent = "No voice saved yet";
                    fileName.title = "";
                    fileName.style.color = "#888";
                    audio.removeAttribute("src");
                    delete audio.dataset.src;
                    audio.style.display = "none";
                }
            }
            node.mmSaveVoiceShow = (entry) => {
                if (entry && entry.path) {
                    // Nouveau fichier : relu meme si le chemin etait deja affiche.
                    delete audio.dataset.src;
                    node.properties.mmvoiceLast = { path: entry.path, name: entry.name || baseName(entry.path) };
                }
                showPlayer();
            };

            // Appele par le noeud Project (notifyFinalCut) quand son projet change ; branchements et
            // relecture legere en plus (rien d'autre ne previent d'un Get / Set rebranche).
            let refreshTimer = null;
            node.mmProjectRefresh = () => {
                clearTimeout(refreshTimer);
                refreshTimer = setTimeout(() => render(), 100);
            };
            node.mmSaveVoiceSync = () => {
                render(true);
                applyQuality();
                showPlayer();
            };
            node.__mmsavevoiceTimer = setInterval(() => {
                render();
                if (fmtW && fmtW.value !== appliedFormat) applyQuality();
                else paintVueQuality(); // Vue recree les lignes des widgets
            }, RECHECK_MS);

            node.addDOMWidget("mmsavevoice_ui", "mmsavevoice", container, {
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
            setTimeout(() => {
                if (node.size[0] < MIN_WIDTH) node.setSize([MIN_WIDTH, node.size[1]]);
                node.mmSaveVoiceSync();
            }, 0);
            return r;
        };

        // Workflow ouvert : valeurs des widgets et proprietes arrivent apres la creation.
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = onConfigure ? onConfigure.apply(this, arguments) : undefined;
            if (this.mmSaveVoiceSync) setTimeout(() => this.mmSaveVoiceSync(), 0);
            return r;
        };

        // Fin du Run : ui.mmvoice = [{path, name}] (aucune cle filename : pas un fichier de Run).
        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            const r = onExecuted ? onExecuted.apply(this, arguments) : undefined;
            const entry = message && Array.isArray(message.mmvoice) ? message.mmvoice[0] : null;
            if (entry && this.mmSaveVoiceShow) this.mmSaveVoiceShow(entry);
            return r;
        };

        // Branchement ou debranchement : projet relu.
        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function () {
            const r = onConnectionsChange ? onConnectionsChange.apply(this, arguments) : undefined;
            if (this.mmProjectRefresh) this.mmProjectRefresh();
            return r;
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            clearInterval(this.__mmsavevoiceTimer);
            (this.__mmsavevoiceOverlays || []).forEach((o) => o.remove());
            return onRemoved ? onRemoved.apply(this, arguments) : undefined;
        };
    },
});
