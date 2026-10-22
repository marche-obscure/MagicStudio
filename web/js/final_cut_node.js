import { app } from "../../scripts/app.js";
import {
    TITLE_COLOR, BODY_COLOR, VIOLET, PINK, ORANGE, GREEN, INACTIVE_BG,
    svg, iconBadge, hList, hSteps, hTip, hNote, hCard, IMAGE_ICON, VIDEO_ICON, AUDIO_ICON, CLOSE_ICON,
    makeOverlay, makeIconButton, makeTextButton, positionCardNextToNode, apiGet, escapeHtml, buildHelpOverlay,
} from "./minimax_ref_loader.js";

// --------------------------------------------------------------------
// Noeud MiniMax H3 Final Cut (choix utilisateur, 22/10/2026) : copies des
// Picture Lock de 60 / 40 / 70 d'un projet (ou de tous les sous-projets d'un
// MultiProject) dans Final-Cut_<Nom>, liees dans le dossier input de ComfyUI ;
// vignettes a glisser dans MiniMax H3 Director (vrai fichier joint au glisser).
// --------------------------------------------------------------------

const NODE_NAME = "MiniMaxH3FinalCut";
const PROJECT_NODE = "MiniMaxH3Project";
const MIN_WIDTH = 420;
const UI_HEIGHT = 330;
const SYNC_COLOR = "#e0793c";
const KINDS = [
    ["Images", IMAGE_ICON, VIOLET],
    ["Video", VIDEO_ICON, ORANGE],
    ["Audio", AUDIO_ICON, TITLE_COLOR],
];
const MIME = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", bmp: "image/bmp", gif: "image/gif",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska", avi: "video/x-msvideo",
    m4v: "video/mp4", wav: "audio/wav", mp3: "audio/mpeg", flac: "audio/flac", ogg: "audio/ogg", m4a: "audio/mp4",
    aac: "audio/aac",
};

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

const joinDir = (dir, name) => String(dir).replace(/[\\/]+$/, "") + (String(dir).includes("/") && !String(dir).includes("\\") ? "/" : "\\") + name;
const mimeOf = (name) => MIME[String(name).split(".").pop().toLowerCase()] || "application/octet-stream";
const hWarn = (t, label) =>
    '<div style="border-left:3px solid ' + ORANGE + ';background:#241b15;color:#efcfb6;padding:6px 10px;' +
    'margin:6px 0 10px">⚠ <b>' + label + "</b> " + t + "</div>";

// ---- Aide ----
const HELP_SECTIONS = [
    {
        id: "start", title: "Quick start", icon: VIDEO_ICON, color: TITLE_COLOR,
        html: hSteps([
            "Wire the <b>final_cut</b> output of the <b>MiniMax H3 Project</b> node to the <b>final_cut</b> input " +
            "of this node.",
            "The first time, the node creates the copies and the link in the input folder of ComfyUI.",
            "Drag a thumbnail onto <b>MiniMax H3 Director</b>, or pick the files in its windows (folder " +
            "<b>Final-Cut_&lt;Name&gt;</b>).",
        ]) +
        hCard("The node", [
            [textChip("Sync · n", SYNC_COLOR), "Shown when the Picture Lock folders changed: applies the mirror"],
            [iconBadge(IMAGE_ICON, VIOLET), "Three rows of thumbnails: Images, Video, Audio (the copies)"],
        ]),
    },
    {
        id: "copies", title: "The copies", icon: IMAGE_ICON, color: VIOLET,
        html: "<p>The copies of the final rushes are kept in a folder of their own; the originals are never touched.</p>" +
            hCard("Folder of the copies", [
                ["Simple project", "<b>&lt;Project&gt;\\Final-Cut_&lt;Project&gt;</b>"],
                ["MultiProject", "<b>&lt;Folder of projects&gt;\\Final-Cut_&lt;Folder&gt;</b>, with all its projects"],
            ]) +
            hCard("Source → copy", [
                ["60.Rush Images\\Picture Lock", "<b>Images</b>"],
                ["40.Rush Videos\\Picture Lock", "<b>Video</b>"],
                ["70.Rush Audio\\Picture Lock", "<b>Audio</b>"],
            ]) +
            hCard("Name and date", [
                ["Name", "<b>_NN_&lt;file&gt;</b>: NN = number of the project (00 for a Simple project; 01, 02… for " +
                    "the projects of a MultiProject, given silently at their creation)."],
                ["Date", "the day of the copy: the new copies come first in MiniMax H3 Director."],
            ]),
    },
    {
        id: "sync", title: "Sync", icon: VIDEO_ICON, color: SYNC_COLOR,
        html: "<p>The copies follow the Picture Lock folders exactly (mirror).</p>" +
            hCard("In a Picture Lock → in the copies", [
                ["Added", "copied"],
                ["Replaced (other content)", "the old copy goes to the Recycle Bin, the new one is copied"],
                ["Removed", "the copy goes to the Recycle Bin"],
            ]) +
            hWarn("a file put by hand in <b>Final-Cut_&lt;Name&gt;</b> is not a copy of a Picture Lock: the next " +
                "<b>Sync</b> sends it to the Recycle Bin.", "Warning:") +
            hNote("the first sync is done when the node is wired; then <b>Sync · n</b> shows when something changed " +
                "(its tooltip lists the changes)."),
    },
    {
        id: "director", title: "Into H3 Director", icon: VIDEO_ICON, color: GREEN,
        html: "<p>The folder of the copies is linked in the input folder of ComfyUI as <b>Final-Cut_&lt;Name&gt;</b>.</p>" +
            hCard("Two ways", [
                ["Drag", "a thumbnail onto a slot of MiniMax H3 Director: Director uploads it (it gets a new name)."],
                ["Pick", "in the windows of Director, folder <b>Final-Cut_&lt;Name&gt;</b>: the names <b>_NN_…</b> " +
                    "stay, no new copy."],
            ]) +
            hNote("a file deleted from the input folder is only a copy: the originals of the project are not touched."),
    },
];
const HELP_SECTIONS_FR = [
    {
        id: "start", title: "Démarrage rapide",
        html: hSteps([
            "Reliez la sortie <b>final_cut</b> du nœud <b>MiniMax H3 Project</b> à l'entrée <b>final_cut</b> de ce nœud.",
            "La première fois, le nœud crée les copies et le lien dans le dossier input de ComfyUI.",
            "Glissez une vignette sur <b>MiniMax H3 Director</b>, ou choisissez les fichiers dans ses fenêtres " +
            "(dossier <b>Final-Cut_&lt;Nom&gt;</b>).",
        ]) +
        hCard("Le nœud", [
            [textChip("Sync · n", SYNC_COLOR), "Apparaît quand les Picture Lock ont changé : applique le miroir"],
            [iconBadge(IMAGE_ICON, VIOLET), "Trois lignes de vignettes : Images, Video, Audio (les copies)"],
        ]),
    },
    {
        id: "copies", title: "Les copies",
        html: "<p>Les copies des rushs finaux sont rangées dans un dossier à part ; les originaux ne sont jamais " +
            "touchés.</p>" +
            hCard("Dossier des copies", [
                ["Projet Simple", "<b>&lt;Projet&gt;\\Final-Cut_&lt;Projet&gt;</b>"],
                ["MultiProject", "<b>&lt;Dossier de projets&gt;\\Final-Cut_&lt;Dossier&gt;</b>, avec tous ses projets"],
            ]) +
            hCard("Source → copie", [
                ["60.Rush Images\\Picture Lock", "<b>Images</b>"],
                ["40.Rush Videos\\Picture Lock", "<b>Video</b>"],
                ["70.Rush Audio\\Picture Lock", "<b>Audio</b>"],
            ]) +
            hCard("Nom et date", [
                ["Nom", "<b>_NN_&lt;fichier&gt;</b> : NN = numéro du projet (00 pour un projet Simple ; 01, 02… " +
                    "pour les projets d'un MultiProject, attribué sans affichage à leur création)."],
                ["Date", "le jour de la copie : les nouvelles copies arrivent en tête dans MiniMax H3 Director."],
            ]),
    },
    {
        id: "sync", title: "Sync",
        html: "<p>Les copies suivent exactement les Picture Lock (miroir).</p>" +
            hCard("Dans un Picture Lock → dans les copies", [
                ["Ajouté", "copié"],
                ["Remplacé (autre contenu)", "l'ancienne copie part dans la Corbeille, la nouvelle est copiée"],
                ["Retiré", "la copie part dans la Corbeille"],
            ]) +
            hWarn("un fichier déposé à la main dans <b>Final-Cut_&lt;Nom&gt;</b> n'est pas une copie d'un Picture " +
                "Lock : le prochain <b>Sync</b> l'envoie dans la Corbeille.", "Attention :") +
            hNote("la première synchronisation se fait au branchement du nœud ; ensuite <b>Sync · n</b> apparaît " +
                "quand quelque chose a changé (son infobulle liste les changements).", "Remarque :"),
    },
    {
        id: "director", title: "Vers H3 Director",
        html: "<p>Le dossier des copies est lié dans le dossier input de ComfyUI sous le nom " +
            "<b>Final-Cut_&lt;Nom&gt;</b>.</p>" +
            hCard("Deux façons", [
                ["Glisser", "une vignette sur une case de MiniMax H3 Director : Director l'envoie (elle reçoit un " +
                    "nouveau nom)."],
                ["Choisir", "dans les fenêtres de Director, dossier <b>Final-Cut_&lt;Nom&gt;</b> : les noms " +
                    "<b>_NN_…</b> restent, sans nouvelle copie."],
            ]) +
            hNote("un fichier supprimé depuis le dossier input n'est qu'une copie : les originaux du projet ne " +
                "sont pas touchés.", "Remarque :"),
    },
];
function textChip(text, color) {
    return '<span style="display:inline-block;background:' + color + ';color:white;font-weight:bold;' +
        'border-radius:4px;padding:0 5px;font-size:10px">' + escapeHtml(text) + "</span>";
}
function helpSections(lang) {
    if (lang !== "fr") return HELP_SECTIONS;
    const fr = Object.fromEntries(HELP_SECTIONS_FR.map((sec) => [sec.id, sec]));
    return HELP_SECTIONS.map((sec) => (fr[sec.id] ? Object.assign({}, sec, fr[sec.id]) : sec));
}

/** Apercu d'une copie (image, video ou son), dans une petite fenetre. */
function buildPreview(container) {
    const { overlay, card } = makeOverlay();
    overlay.style.zIndex = "10003";
    Object.assign(card.style, { width: "min(520px, 92vw)", padding: "10px 12px", borderColor: VIOLET });
    const head = document.createElement("div");
    Object.assign(head.style, { display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" });
    const title = document.createElement("div");
    Object.assign(title.style, { flex: "1", fontWeight: "bold", color: TITLE_COLOR, wordBreak: "break-all" });
    const close = makeIconButton(INACTIVE_BG, CLOSE_ICON, "Close");
    head.append(title, close);
    const body = document.createElement("div");
    card.append(head, body);
    const hide = () => {
        overlay.style.display = "none";
        body.innerHTML = "";
    };
    close.addEventListener("click", hide);
    overlay.addEventListener("mousedown", hide);
    window.addEventListener("keydown", (e) => {
        if (overlay.style.display !== "none" && e.key === "Escape") hide();
    }, true);
    return {
        show(path, kind) {
            title.textContent = path.split(/[\\/]/).pop();
            const url = "/mmrefloader/media?file=" + encodeURIComponent(path);
            const el = document.createElement(kind === "Images" ? "img" : kind === "Video" ? "video" : "audio");
            el.src = url;
            if (kind !== "Images") el.controls = true;
            Object.assign(el.style, { width: "100%", maxHeight: "60vh", objectFit: "contain", background: "#000" });
            body.innerHTML = "";
            body.appendChild(el);
            overlay.style.display = "block";
            positionCardNextToNode(card, container, 520);
        },
        remove() {
            hide();
            overlay.remove();
        },
    };
}

app.registerExtension({
    name: "ComfyUI.MiniMaxH3FinalCut",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;
            node.color = TITLE_COLOR;
            node.bgcolor = BODY_COLOR;

            const container = document.createElement("div");
            Object.assign(container.style, {
                display: "flex", flexDirection: "column", gap: "6px", padding: "6px 8px", boxSizing: "border-box",
                width: "100%", height: "100%", fontFamily: "sans-serif", fontSize: "12px", color: "#ddd",
                overflow: "hidden",
            });
            const top = document.createElement("div");
            Object.assign(top.style, { display: "flex", alignItems: "center", gap: "6px" });
            const where = document.createElement("div");
            Object.assign(where.style, {
                flex: "1", minWidth: "0", color: "#9fd6cf", fontWeight: "bold", overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
            });
            const syncBtn = makeTextButton("Sync", SYNC_COLOR);
            Object.assign(syncBtn.style, { padding: "3px 10px", fontSize: "11px", display: "none" });
            const helpBtn = document.createElement("button");
            helpBtn.type = "button";
            helpBtn.textContent = "?";
            Object.assign(helpBtn.style, {
                width: "22px", height: "22px", borderRadius: "50%", border: "none", background: PINK,
                color: "white", fontWeight: "bold", cursor: "pointer", padding: "0", flex: "0 0 auto",
            });
            top.append(where, syncBtn, helpBtn);
            container.appendChild(top);

            const rows = {};
            for (const [kind, icon, color] of KINDS) {
                const row = document.createElement("div");
                Object.assign(row.style, { display: "flex", flexDirection: "column", gap: "3px", flex: "1 1 0", minHeight: "0" });
                const label = document.createElement("div");
                label.innerHTML = iconBadge(icon, color) + ' <b style="vertical-align:middle">' + kind + "</b>";
                const count = document.createElement("span");
                Object.assign(count.style, { color: "#888", marginLeft: "6px", verticalAlign: "middle" });
                label.appendChild(count);
                const strip = document.createElement("div");
                Object.assign(strip.style, {
                    display: "flex", gap: "6px", overflowX: "auto", overflowY: "hidden", flex: "1 1 auto",
                    minHeight: "0", alignItems: "stretch", background: "#161616", border: "1px solid #2c2c2c",
                    borderRadius: "6px", padding: "4px",
                });
                row.append(label, strip);
                container.appendChild(row);
                rows[kind] = { strip, count };
            }
            const status = document.createElement("div");
            Object.assign(status.style, { color: "#999", minHeight: "14px", whiteSpace: "nowrap", overflow: "hidden",
                textOverflow: "ellipsis" });
            container.appendChild(status);

            const help = buildHelpOverlay(container, {
                sectionsFor: helpSections, nodeTitle: "MiniMax H3 Final Cut", sectionKey: "mmfinalcut.helpSection",
            });
            const preview = buildPreview(container);
            node.__mmfinalcutOverlays = [help, preview];
            helpBtn.addEventListener("click", () => help.open());

            let plan = null;
            let busy = false;
            const say = (text, ok) => {
                status.textContent = text || "";
                status.style.color = ok ? "#9fd6cf" : ORANGE;
            };

            /** Projet du noeud MiniMax H3 Project relie a l'entree final_cut ({name, path}), sinon null. */
            function linkedProject() {
                const input = (node.inputs || []).find((i) => i.name === "final_cut");
                if (!input || input.link == null || !node.graph) return { wired: false, info: null };
                const link = node.graph.links instanceof Map ? node.graph.links.get(input.link) : node.graph.links[input.link];
                const origin = link && node.graph.getNodeById(link.origin_id);
                if (!origin || origin.type !== PROJECT_NODE) return { wired: false, info: null };
                const info = typeof origin.mmProjectInfo === "function" ? origin.mmProjectInfo() : null;
                return { wired: true, info };
            }

            // ---- Vignettes : vrai fichier joint au glisser (prepare au survol) ----
            const fileCache = new Map(); // chemin|mtime -> File
            async function prepare(path, name, mtime) {
                const key = path + "|" + mtime;
                if (fileCache.has(key)) return fileCache.get(key);
                const res = await fetch("/mmrefloader/media?file=" + encodeURIComponent(path), { cache: "no-store" });
                if (!res.ok) throw new Error("File not found: " + name);
                const blob = await res.blob();
                const file = new File([blob], name, { type: blob.type || mimeOf(name), lastModified: Date.now() });
                fileCache.set(key, file);
                return file;
            }

            function tile(kind, dir, c) {
                const path = joinDir(dir, c.name);
                const t = document.createElement("div");
                t.draggable = true;
                t.title = c.name + "\nDrag onto MiniMax H3 Director · click to preview";
                Object.assign(t.style, {
                    flex: "0 0 auto", width: "96px", display: "flex", flexDirection: "column", gap: "2px",
                    background: "#222", border: "1px solid #333", borderRadius: "5px", padding: "3px", cursor: "grab",
                    boxSizing: "border-box",
                });
                const pic = document.createElement("div");
                Object.assign(pic.style, {
                    flex: "1 1 auto", minHeight: "40px", borderRadius: "3px", background: "#111 center/cover no-repeat",
                    display: "flex", alignItems: "center", justifyContent: "center",
                });
                if (kind === "Audio") pic.innerHTML = iconBadge(AUDIO_ICON, TITLE_COLOR);
                else pic.style.backgroundImage = "url('/mmrefloader/thumb?path=" + encodeURIComponent(dir) + "&file=" +
                    encodeURIComponent(c.name) + "&t=" + Math.round(c.mtime) + "')";
                const cap = document.createElement("div");
                cap.textContent = c.name;
                Object.assign(cap.style, { fontSize: "10px", color: "#bbb", overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap" });
                t.append(pic, cap);
                let file = null;
                const ready = () => prepare(path, c.name, c.mtime).then((f) => (file = f)).catch((e) => say(e.message));
                t.addEventListener("mouseenter", ready);
                // Le glisser ne doit pas deplacer le noeud (classique et Nodes 2.0).
                t.addEventListener("pointerdown", (e) => {
                    e.stopPropagation();
                    if (!file) ready();
                });
                t.addEventListener("dragstart", (e) => {
                    e.stopPropagation();
                    if (!file) {
                        e.preventDefault();
                        say("Preparing " + c.name + "… drag again in a moment.");
                        return;
                    }
                    e.dataTransfer.items.add(file);
                    e.dataTransfer.effectAllowed = "copy";
                });
                t.addEventListener("click", (e) => {
                    e.stopPropagation();
                    preview.show(path, kind);
                });
                return t;
            }

            function render() {
                const { wired, info } = linkedProject();
                syncBtn.style.display = "none";
                for (const [kind] of KINDS) {
                    rows[kind].strip.innerHTML = "";
                    rows[kind].count.textContent = "";
                }
                if (!wired) {
                    where.textContent = "Not wired";
                    say("Wire the final_cut output of the MiniMax H3 Project node.");
                    return;
                }
                if (!info) {
                    where.textContent = "No project";
                    say("Pick a project in the MiniMax H3 Project node.");
                    return;
                }
                if (!plan) return;
                where.textContent = "Final-Cut_" + plan.name;
                where.title = plan.folder + (plan.link ? "\nLinked in input: " + plan.link : "");
                for (const [kind] of KINDS) {
                    const k = plan.kinds[kind];
                    rows[kind].count.textContent = "· " + k.copies.length;
                    for (const c of k.copies.slice().sort((a, b) => b.mtime - a.mtime)) {
                        rows[kind].strip.appendChild(tile(kind, k.dir, c));
                    }
                }
                if (plan.count) {
                    syncBtn.style.display = "";
                    syncBtn.textContent = "Sync · " + plan.count;
                    const lines = [];
                    for (const [kind] of KINDS) {
                        const k = plan.kinds[kind];
                        k.add.forEach((n) => lines.push("+ " + kind + "/" + n));
                        k.replace.forEach((n) => lines.push("↻ " + kind + "/" + n));
                        k.remove.forEach((n) => lines.push("− " + kind + "/" + n));
                    }
                    syncBtn.title = "Apply the mirror of the Picture Lock folders:\n" + lines.slice(0, 20).join("\n") +
                        (lines.length > 20 ? "\n… (+" + (lines.length - 20) + ")" : "");
                }
            }

            /** Relit le plan ; premier branchement (dossier ou lien absent) : synchronise tout de suite. */
            async function refresh() {
                const { info } = linkedProject();
                if (!info) {
                    plan = null;
                    render();
                    return;
                }
                try {
                    plan = await apiGet("/mmproject/final_cut/plan?project=" + encodeURIComponent(info.path));
                    if (!plan.synced || !plan.linked) {
                        await doSync(info.path);
                        return;
                    }
                    say(plan.count ? "" : "Up to date.", true);
                } catch (e) {
                    plan = null;
                    say(e.message);
                }
                render();
            }

            async function doSync(path) {
                if (busy) return;
                busy = true;
                syncBtn.disabled = true;
                say("Synchronizing…", true);
                try {
                    const res = await apiPost("/mmproject/final_cut/sync", { project: path });
                    let n = 0;
                    for (const [kind] of KINDS) n += res.kinds[kind].add.length + res.kinds[kind].replace.length +
                        res.kinds[kind].remove.length;
                    plan = await apiGet("/mmproject/final_cut/plan?project=" + encodeURIComponent(path));
                    say("Synchronized: " + n + " change(s). Linked in input as " + (res.link.split(/[\\/]/).pop()) + ".", true);
                } catch (e) {
                    say(e.message);
                } finally {
                    busy = false;
                    syncBtn.disabled = false;
                }
                render();
            }
            syncBtn.addEventListener("click", () => {
                const { info } = linkedProject();
                if (info) doSync(info.path);
            });

            // Appele par le noeud MiniMax H3 Project (projet change, rushs ranges...).
            let timer = null;
            node.mmFinalCutRefresh = () => {
                clearTimeout(timer);
                timer = setTimeout(refresh, 300);
            };

            node.addDOMWidget("mmfinalcut_ui", "mmfinalcut", container, {
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
                refresh();
            }, 0);
            return r;
        };

        // Branchement ou debranchement du noeud Project : relecture (premier branchement = synchronisation).
        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function () {
            const r = onConnectionsChange ? onConnectionsChange.apply(this, arguments) : undefined;
            if (this.mmFinalCutRefresh) this.mmFinalCutRefresh();
            return r;
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            (this.__mmfinalcutOverlays || []).forEach((o) => o.remove());
            return onRemoved ? onRemoved.apply(this, arguments) : undefined;
        };
    },
});
