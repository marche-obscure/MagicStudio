import { app } from "../../scripts/app.js";
import {
    TITLE_COLOR, BODY_COLOR, VIOLET, PINK, ORANGE,
    iconBadge, hList, hSteps, hTip, hNote, hCard, IMAGE_ICON, VIDEO_ICON, AUDIO_ICON, START_ICON, FOLDER_ICON,
    apiGet, buildHelpOverlay,
} from "./minimax_ref_loader.js";

// --------------------------------------------------------------------
// Noeud MiniMax H3 Load Media (choix utilisateur, 24/10/2026) : on y depose
// une vignette du noeud MiniMax H3 Final Cut. Le glisser apporte un lien
// text/uri-list vers /mmrefloader/media?file=<chemin> ; le serveur en lit le
// chemin (load_media.path_from_drop) et le verifie (dossier input seulement),
// puis le chemin est mis dans le champ "file" : Python charge le fichier la
// ou il est, sans copie.
// --------------------------------------------------------------------

const NODE_NAME = "MiniMaxH3LoadMedia";
const MIN_WIDTH = 320;
const UI_HEIGHT = 236;
const PREVIEW_HEIGHT = 180;
const KINDS = {
    image: ["Image", IMAGE_ICON, VIOLET],
    video: ["Video", VIDEO_ICON, ORANGE],
    audio: ["Audio", AUDIO_ICON, TITLE_COLOR],
};
const mediaUrl = (path) => "/mmrefloader/media?file=" + encodeURIComponent(path);
// Ordre des sorties, identique a RETURN_NAMES de nodes.py (choix utilisateur 24/10/2026 :
// video_frames puis audio_video sous video ; audio = fichiers son seulement ; name en
// dernier, 28/10/2026).
const OUTPUTS = [
    ["video", "VIDEO"], ["video_frames", "IMAGE"], ["audio_video", "AUDIO"], ["image", "IMAGE"], ["audio", "AUDIO"],
    ["name", "STRING"],
];

/** Liens qui partent de la sortie slot du noeud (graph.links : LinkMap ou objet). */
function outputLinksOf(node, slot) {
    const links = node.graph && node.graph.links;
    if (!links) return [];
    const all = typeof links.values === "function" ? [...links.values()] : Object.values(links);
    return all.filter((l) => l && l.origin_id === node.id && l.origin_slot === slot);
}

/**
 * Workflow enregistre avec un ancien ordre (video, image, audio[, video_frames] ou
 * video, video_frames, image, audio) :
 * chaque lien reprend la sortie de meme nom. Comme dans le Reference Loader, les
 * objets sortie restent a leur place : on corrige origin_slot des liens, puis on
 * reecrit nom / type / etiquette position par position (ne jamais assigner output.links).
 */
function migrateOutputs(node) {
    // Noms enregistres, releves avant que configure() ne renomme les sorties par position
    // (frontend recent, 29/10/2026) ; sinon les noms actuels.
    const saved0 = node.__mmSavedOutputNames;
    delete node.__mmSavedOutputNames;
    // Sorties ajoutees par le frontend apres les sorties enregistrees : sans lien, nom ignore
    // (elles reprennent les noms actuels, ex. une 2e "image" qui ecraserait l'ancienne).
    const names = (node.outputs || []).map((o, i) => (saved0 ? saved0[i] || "" : o.name));
    if (names.length === OUTPUTS.length && OUTPUTS.every(([n], i) => names[i] === n)) return;
    const saved = {};
    names.forEach((name, i) => {
        if (name && !saved[name]) saved[name] = { label: node.outputs[i].label, links: outputLinksOf(node, i) };
    });
    OUTPUTS.forEach(([name], i) => (saved[name] ? saved[name].links : []).forEach((l) => (l.origin_slot = i)));
    while (node.outputs.length < OUTPUTS.length) node.addOutput("tmp", "*");
    OUTPUTS.forEach(([name, type], i) => {
        const o = node.outputs[i];
        o.name = name;
        o.localized_name = name;
        o.type = type;
        o.label = saved[name] ? saved[name].label : undefined;
        (saved[name] ? saved[name].links : []).forEach((l) => (l.type = type));
    });
    node.setDirtyCanvas(true, true);
}

// ---- Aide ----
const HELP_SECTIONS = [
    {
        id: "start", title: "Quick start", icon: START_ICON, color: TITLE_COLOR,
        html: hSteps([
            "Open the window of <b>MagicStudio Final Cut</b> (<b>Images</b>, <b>Video</b> or <b>Audio</b>), or " +
            "the window <b>40.Rush Videos</b> / <b>60.Rush Images</b> or <b>Processing</b> of the Project node.",
            "Drag a file onto this node.",
            "Wire the outputs that match the file: <b>video</b>, <b>video_frames</b> or <b>audio_video</b> " +
            "for a video, <b>image</b> for an image, <b>audio</b> for an audio file.",
        ]) +
        hCard("Parts of the node", [
            ["<b>file</b>", "full path of the file; filled by the drop, or typed by hand"],
            ["Drop zone", "shows the file (picture, video player or audio player)"],
            [iconBadge(VIDEO_ICON, ORANGE), "type and name of the file, or what is wrong in orange"],
        ]),
    },
    {
        id: "outputs", title: "Outputs", icon: VIDEO_ICON, color: ORANGE,
        html: hCard("File dropped → outputs", [
            [iconBadge(VIDEO_ICON, ORANGE), "<b>Video</b>: <b>video</b> (same type as <b>Load Video</b>), " +
                "<b>video_frames</b> (all its frames as images, original size) and <b>audio_video</b> (its " +
                "soundtrack, if it has one)"],
            [iconBadge(IMAGE_ICON, VIOLET), "<b>Image</b>: <b>image</b>"],
            [iconBadge(AUDIO_ICON, TITLE_COLOR), "<b>Audio</b>: <b>audio</b>, whole length"],
            ["<b>name</b>", "the name of the loaded file, with its extension (text)"],
        ]) +
        hNote("an output that does not match the file is empty: the optional inputs of the native nodes " +
            "ignore it.") +
        hTip("<b>video_frames</b> holds every frame in memory: for a long or large video, prefer <b>video</b>.") +
        hTip("the file is loaded again only when the path changes or when the file is modified.") +
        hNote("a file saved after this node, when it loads a file of a run, is added to that run as " +
            "<b>Post A</b>, <b>Post B</b>… (help of the Project node, <b>Post-processing</b>)."),
    },
    {
        id: "files", title: "Accepted files", icon: FOLDER_ICON, color: VIOLET,
        html: hList([
            "Only files <b>in the input folder of ComfyUI</b> (or its subfolders) are loaded.",
            "The file is read where it is: <b>no copy</b> is made.",
            "Types: images, videos and audio files (the same as the RefLoader).",
        ]) +
        hNote("a file dragged from the Windows Explorer has no path for the browser: drag it from " +
            "<b>MagicStudio Final Cut</b>, <b>40 / 60</b> or <b>Processing</b>, or type its path in <b>file</b>.") +
        hNote("from <b>40 / 60</b> or <b>Processing</b>, the full-quality original is sent when it is in the " +
            "project; otherwise the copy shown in 40. A grey <b>Deleted</b> card cannot be dragged."),
    },
];
const HELP_SECTIONS_FR = [
    {
        id: "start", title: "Démarrage rapide",
        html: hSteps([
            "Ouvrez la fenêtre de <b>MagicStudio Final Cut</b> (<b>Images</b>, <b>Video</b> ou <b>Audio</b>), ou " +
            "la fenêtre <b>40.Rush Videos</b> / <b>60.Rush Images</b> ou <b>Processing</b> du nœud Project.",
            "Glissez un fichier sur ce nœud.",
            "Branchez les sorties qui correspondent au fichier : <b>video</b>, <b>video_frames</b> ou " +
            "<b>audio_video</b> pour une vidéo, <b>image</b> pour une image, <b>audio</b> pour un son.",
        ]) +
        hCard("Parties du nœud", [
            ["<b>file</b>", "chemin complet du fichier ; rempli par le dépôt, ou tapé à la main"],
            ["Zone de dépôt", "montre le fichier (image, lecteur vidéo ou lecteur audio)"],
            [iconBadge(VIDEO_ICON, ORANGE), "type et nom du fichier, ou ce qui ne va pas, en orange"],
        ]),
    },
    {
        id: "outputs", title: "Sorties",
        html: hCard("Fichier déposé → sorties", [
            [iconBadge(VIDEO_ICON, ORANGE), "<b>Vidéo</b> : <b>video</b> (même type que <b>Load Video</b>), " +
                "<b>video_frames</b> (toutes ses images, taille d'origine) et <b>audio_video</b> (sa bande-son, " +
                "s'il en a une)"],
            [iconBadge(IMAGE_ICON, VIOLET), "<b>Image</b> : <b>image</b>"],
            [iconBadge(AUDIO_ICON, TITLE_COLOR), "<b>Son</b> : <b>audio</b>, en entier"],
            ["<b>name</b>", "le nom du fichier chargé, avec son extension (texte)"],
        ]) +
        hNote("une sortie qui ne correspond pas au fichier est vide : les entrées optionnelles des nœuds " +
            "natifs l'ignorent.", "Remarque :") +
        hTip("<b>video_frames</b> garde toutes les images en mémoire : pour une vidéo longue ou grande, " +
            "préférez <b>video</b>.", "Astuce :") +
        hTip("le fichier n'est rechargé que si le chemin change ou si le fichier est modifié.", "Astuce :") +
        hNote("un fichier enregistré après ce nœud, quand il charge un fichier d'un Run, est ajouté à ce Run " +
            "comme <b>Post A</b>, <b>Post B</b>… (aide du nœud Project, <b>Post-traitements</b>).", "Remarque :"),
    },
    {
        id: "files", title: "Fichiers acceptés",
        html: hList([
            "Seuls les fichiers <b>du dossier input de ComfyUI</b> (ou de ses sous-dossiers) sont chargés.",
            "Le fichier est lu là où il est : <b>aucune copie</b>.",
            "Types : images, vidéos et sons (les mêmes que le RefLoader).",
        ]) +
        hNote("un fichier glissé depuis l'Explorateur Windows n'a pas de chemin pour le navigateur : glissez-le " +
            "depuis <b>MagicStudio Final Cut</b>, <b>40 / 60</b> ou <b>Processing</b>, ou tapez son chemin dans " +
            "<b>file</b>.", "Remarque :") +
        hNote("depuis <b>40 / 60</b> ou <b>Processing</b>, l'original pleine qualité est envoyé quand il est dans " +
            "le projet ; sinon la copie montrée dans 40. Une carte grise <b>Deleted</b> ne se glisse pas.",
            "Remarque :"),
    },
];
function helpSections(lang) {
    if (lang !== "fr") return HELP_SECTIONS;
    const fr = Object.fromEntries(HELP_SECTIONS_FR.map((sec) => [sec.id, sec]));
    return HELP_SECTIONS.map((sec) => (fr[sec.id] ? Object.assign({}, sec, fr[sec.id]) : sec));
}

/** Texte depose : lien text/uri-list de Final Cut d'abord, sinon texte simple. */
function droppedText(dt) {
    if (!dt) return "";
    return dt.getData("text/uri-list") || dt.getData("text/plain") || "";
}
const carriesLink = (dt) => !!dt && Array.from(dt.types || []).some((t) => t === "text/uri-list" || t === "text/plain");

app.registerExtension({
    name: "ComfyUI.MiniMaxH3LoadMedia",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;
            node.color = TITLE_COLOR;
            node.bgcolor = BODY_COLOR;
            const fileWidget = (node.widgets || []).find((w) => w.name === "file");

            const container = document.createElement("div");
            Object.assign(container.style, {
                display: "flex", flexDirection: "column", gap: "6px", padding: "6px 8px", boxSizing: "border-box",
                width: "100%", fontFamily: "sans-serif", fontSize: "12px", color: "#ddd",
                // Hauteur naturelle (pas de height 100%) : en Nodes 2.0, le noeud suit son contenu.
            });
            // Ligne du haut : type + nom du fichier (ou message), aide.
            const top = document.createElement("div");
            Object.assign(top.style, { display: "flex", alignItems: "center", gap: "6px" });
            const badge = document.createElement("span");
            Object.assign(badge.style, { flex: "0 0 auto", display: "none" });
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

            // Zone de depot : apercu du fichier, ou consigne quand il n'y en a pas.
            const zone = document.createElement("div");
            Object.assign(zone.style, {
                height: PREVIEW_HEIGHT + "px", border: "2px dashed #3b5f5b", borderRadius: "8px",
                background: "#0d0d0d", display: "flex", alignItems: "center", justifyContent: "center",
                overflow: "hidden", color: "#888", textAlign: "center", boxSizing: "border-box",
            });
            container.append(top, zone);

            const help = buildHelpOverlay(container, {
                sectionsFor: helpSections, nodeTitle: "MagicStudio MedLoad", sectionKey: "mmloadmedia.helpSection",
            });
            helpBtn.addEventListener("click", () => help.open());
            node.__mmloadmediaOverlays = [help];

            const say = (text, kind) => {
                status.textContent = text || "";
                status.title = text || "";
                status.style.color = kind ? "#eee" : ORANGE;
                if (kind && KINDS[kind]) {
                    badge.innerHTML = iconBadge(KINDS[kind][1], KINDS[kind][2]);
                    badge.style.display = "";
                } else {
                    badge.style.display = "none";
                }
            };
            const empty = (text) => {
                zone.innerHTML = "";
                const hint = document.createElement("div");
                hint.style.padding = "0 12px";
                hint.textContent = text;
                zone.appendChild(hint);
            };

            // Apercu du chemin du champ "file" (verifie par le serveur, memes regles que le Run).
            let shown = null;
            async function render() {
                const path = String((fileWidget && fileWidget.value) || "").trim();
                if (path === shown) return;
                shown = path;
                if (!path) {
                    say("", null);
                    empty("Drop a file from Final Cut, 40 / 60 or Processing here");
                    return;
                }
                let info;
                try {
                    info = await apiGet("/mmrefloader/load_media/check?file=" + encodeURIComponent(path));
                } catch (e) {
                    if (shown !== path) return;
                    say(e.message, null);
                    empty("Drop a file from Final Cut, 40 / 60 or Processing here");
                    return;
                }
                if (shown !== path) return;
                const name = info.path.split(/[\\/]/).pop();
                say(KINDS[info.kind][0] + " · " + name, info.kind);
                zone.innerHTML = "";
                let el;
                if (info.kind === "image") {
                    el = document.createElement("img");
                } else {
                    el = document.createElement(info.kind === "video" ? "video" : "audio");
                    el.controls = true;
                    el.preload = "metadata";
                }
                el.src = mediaUrl(info.path);
                el.draggable = false;
                Object.assign(el.style, info.kind === "audio"
                    ? { width: "94%" }
                    : { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" });
                zone.appendChild(el);
            }

            /** Depot d'un lien : le serveur en lit le chemin et le verifie, puis il va dans "file". */
            async function applyDrop(text) {
                if (!text) {
                    say("No path in this drop: drag the file from MagicStudio Final Cut, 40 / 60 or Processing.", null);
                    return;
                }
                try {
                    const info = await apiGet("/mmrefloader/load_media/check?drop=" + encodeURIComponent(text));
                    if (fileWidget) {
                        fileWidget.value = info.path;
                        if (fileWidget.callback) fileWidget.callback(info.path);
                    }
                    shown = null;
                    render();
                    node.setDirtyCanvas(true, true);
                } catch (e) {
                    say(e.message, null);
                }
            }
            node.mmLoadMediaDrop = applyDrop;

            // Depot sur la zone (element DOM) : le canvas ne doit pas le recevoir.
            const mark = (on) => (zone.style.borderColor = on ? PINK : "#3b5f5b");
            zone.addEventListener("dragover", (e) => {
                if (!carriesLink(e.dataTransfer) && !(e.dataTransfer && e.dataTransfer.types.includes("Files"))) return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "copy";
                mark(true);
            });
            zone.addEventListener("dragleave", () => mark(false));
            zone.addEventListener("drop", (e) => {
                e.preventDefault();
                e.stopPropagation();
                mark(false);
                applyDrop(droppedText(e.dataTransfer));
            });

            // Chemin tape a la main : l'apercu suit.
            if (fileWidget) {
                const cb = fileWidget.callback;
                fileWidget.callback = function () {
                    const res = cb ? cb.apply(this, arguments) : undefined;
                    render();
                    return res;
                };
            }
            node.mmLoadMediaRender = () => render();

            node.addDOMWidget("mmloadmedia_ui", "mmloadmedia", container, {
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
                render();
            }, 0);
            return r;
        };

        // Le frontend recent renomme les sorties par position pendant configure() : les noms
        // enregistres sont releves avant, pour que migrateOutputs suive les liens par nom.
        const configure = nodeType.prototype.configure;
        nodeType.prototype.configure = function (info) {
            this.__mmSavedOutputNames = Array.isArray(info && info.outputs)
                ? info.outputs.map((o) => (o && typeof o.name === "string" ? o.name : "")) : null;
            return configure.apply(this, arguments);
        };

        // Workflow ouvert : la valeur de "file" arrive apres la creation du noeud.
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = onConfigure ? onConfigure.apply(this, arguments) : undefined;
            migrateOutputs(this);
            if (this.mmLoadMediaRender) setTimeout(() => this.mmLoadMediaRender(), 0);
            return r;
        };

        // Depot sur le corps du noeud (hors zone) : ComfyUI appelle onDragOver / onDragDrop.
        nodeType.prototype.onDragOver = function (e) {
            return carriesLink(e && e.dataTransfer);
        };
        nodeType.prototype.onDragDrop = function (e) {
            const text = droppedText(e && e.dataTransfer);
            if (!text || !this.mmLoadMediaDrop) return false;
            this.mmLoadMediaDrop(text);
            return true;
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            (this.__mmloadmediaOverlays || []).forEach((o) => o.remove());
            return onRemoved ? onRemoved.apply(this, arguments) : undefined;
        };
    },
});
