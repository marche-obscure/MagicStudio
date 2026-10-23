import { app } from "../../scripts/app.js";
import {
    TITLE_COLOR, BODY_COLOR, VIOLET, PINK, ORANGE, GREEN, INACTIVE_BG,
    svg, iconBadge, hList, hSteps, hTip, hNote, hCard, IMAGE_ICON, VIDEO_ICON, AUDIO_ICON, CLOSE_ICON, EYE_ICON,
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
const UI_HEIGHT = 172;
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
/** Lien qui arrive sur l'entree slot d'un noeud (LinkMap ou objet), sinon null. */
function linkInto(target, slot) {
    const input = target && target.inputs && target.inputs[slot];
    if (!input || input.link == null || !target.graph) return null;
    const links = target.graph.links;
    return (links instanceof Map ? links.get(input.link) : links[input.link]) || null;
}
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
            "Click <b>Images</b>, <b>Video</b> or <b>Audio</b>: the window shows the copies; drag a file onto " +
            "<b>MiniMax H3 Director</b>.",
        ]) +
        hCard("The node", [
            [iconBadge(IMAGE_ICON, VIOLET), "<b>Images · n</b> (and Video, Audio): opens the window of the copies; " +
                "shows the date of the last sync"],
            [textChip("Sync · n", SYNC_COLOR), "grey <b>Up to date</b>, or orange <b>Sync · n</b> when the Picture " +
                "Lock folders changed"],
            [progressChip(), "progress bar: shown while the copies are initialized or synchronized"],
        ]),
    },
    {
        id: "window", title: "The window", icon: EYE_ICON, color: PINK,
        html: "<p>A click on <b>Images</b>, <b>Video</b> or <b>Audio</b> opens the copies of this type.</p>" +
            hCard("The window", [
                ["Header", "name of the project, <b>List | Thumbnails</b> (remembered) and <b>Sync</b>"],
                ["Left", "the files grouped by project (<b>01. Name</b>), newest first"],
                ["Right", "plays the clicked file, with <b>File</b>, <b>Path</b> and <b>Source</b>"],
                ["Cancel", "closes the window"],
            ]) +
            hNote("the window does not block the canvas: move it by its title to see MiniMax H3 Director, then drag."),
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
                "(its tooltip lists the changes). While it works, the node shows <b>Initializing… / Synchronizing… " +
                "n / total</b> with a progress bar."),
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
            "Cliquez sur <b>Images</b>, <b>Video</b> ou <b>Audio</b> : la fenêtre montre les copies ; glissez un " +
            "fichier sur <b>MiniMax H3 Director</b>.",
        ]) +
        hCard("Le nœud", [
            [iconBadge(IMAGE_ICON, VIOLET), "<b>Images · n</b> (et Video, Audio) : ouvre la fenêtre des copies ; " +
                "montre la date de la dernière synchro"],
            [textChip("Sync · n", SYNC_COLOR), "gris <b>Up to date</b>, ou orange <b>Sync · n</b> quand les Picture " +
                "Lock ont changé"],
            [progressChip(), "barre de progression : visible pendant l'initialisation et la synchro des copies"],
        ]),
    },
    {
        id: "window", title: "La fenêtre",
        html: "<p>Un clic sur <b>Images</b>, <b>Video</b> ou <b>Audio</b> ouvre les copies de ce type.</p>" +
            hCard("La fenêtre", [
                ["En-tête", "nom du projet, <b>List | Thumbnails</b> (retenu) et <b>Sync</b>"],
                ["Gauche", "les fichiers groupés par projet (<b>01. Nom</b>), les plus récents d'abord"],
                ["Droite", "lecture du fichier cliqué, avec <b>File</b>, <b>Path</b> et <b>Source</b>"],
                ["Cancel", "ferme la fenêtre"],
            ]) +
            hNote("la fenêtre ne bloque pas le canevas : déplacez-la par son titre pour voir MiniMax H3 Director, " +
                "puis glissez.", "Remarque :"),
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
                "quand quelque chose a changé (son infobulle liste les changements). Pendant le travail, le nœud " +
                "affiche <b>Initializing… / Synchronizing… n / total</b> avec une barre de progression.", "Remarque :"),
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
/** Petite barre de progression dessinee (carte « The node » de l'aide). */
function progressChip() {
    return '<span style="display:inline-block;width:28px;height:4px;border-radius:2px;background:#123;' +
        'vertical-align:middle;overflow:hidden"><span style="display:block;width:60%;height:100%;background:' +
        SYNC_COLOR + '"></span></span>';
}
function helpSections(lang) {
    if (lang !== "fr") return HELP_SECTIONS;
    const fr = Object.fromEntries(HELP_SECTIONS_FR.map((sec) => [sec.id, sec]));
    return HELP_SECTIONS.map((sec) => (fr[sec.id] ? Object.assign({}, sec, fr[sec.id]) : sec));
}

// Affichage de la fenetre retenu d'une ouverture a l'autre (choix utilisateur, 23/10/2026).
const VIEW_KEY = "mmfinalcut.view";
function loadView() {
    try {
        return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "thumbs";
    } catch (e) {
        return "thumbs";
    }
}
function saveView(view) {
    try {
        localStorage.setItem(VIEW_KEY, view);
    } catch (e) {
        // stockage indisponible : l'affichage n'est simplement pas retenu
    }
}

const pad2 = (n) => String(n).padStart(2, "0");
function dateText(seconds) {
    const d = new Date(seconds * 1000);
    return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear() + " " + pad2(d.getHours()) + ":" +
        pad2(d.getMinutes());
}
function sizeText(bytes) {
    if (bytes == null) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
}
const lastSyncText = (plan) => (plan && plan.last_sync ? "Last sync: " + dateText(plan.last_sync) : "Never synchronized");

/** Barre de progression fine (noeud et fenetre). */
function makeProgressBar() {
    const bar = document.createElement("div");
    Object.assign(bar.style, { height: "4px", borderRadius: "2px", background: "#123", overflow: "hidden",
        display: "none", flex: "0 0 auto" });
    const fill = document.createElement("div");
    Object.assign(fill.style, { height: "100%", width: "0%", background: SYNC_COLOR, transition: "width 0.2s" });
    bar.appendChild(fill);
    return {
        bar,
        set(done, total) {
            bar.style.display = "";
            fill.style.width = (total ? Math.round((done / total) * 100) : 0) + "%";
        },
        hide() {
            bar.style.display = "none";
            fill.style.width = "0%";
        },
    };
}

/** Pilule List | Thumbnails. */
function makeViewPill(onChange) {
    const pill = document.createElement("div");
    Object.assign(pill.style, { display: "flex", gap: "4px" });
    const make = (value, text) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        Object.assign(b.style, { background: "#252525", color: "#ddd", border: "1px solid #3a3a3a", borderRadius: "6px",
            padding: "4px 12px", cursor: "pointer", fontSize: "12px" });
        b.addEventListener("click", () => onChange(value));
        pill.appendChild(b);
        return [value, b];
    };
    const buttons = [make("list", "List"), make("thumbs", "Thumbnails")];
    return {
        pill,
        paint(view) {
            for (const [value, b] of buttons) {
                const on = value === view;
                b.style.borderColor = on ? GREEN : "#3a3a3a";
                b.style.color = on ? GREEN : "#ddd";
                b.style.fontWeight = on ? "bold" : "normal";
            }
        },
    };
}

/**
 * Fenetre des copies d'un type (choix utilisateur 23/10/2026, sur le modele des
 * fenetres de choix de H3 Director) : en-tete (projet, List | Thumbnails, Sync),
 * fichiers a gauche groupes par projet, lecture a droite, Cancel en bas a gauche.
 * Pas de fond bloquant : on glisse les fichiers sur le noeud H3 Director a cote.
 */
function buildFilesWindow(container, ctx) {
    const { overlay, card } = makeOverlay();
    overlay.style.pointerEvents = "none";
    Object.assign(card.style, {
        pointerEvents: "auto", width: "min(980px, 94vw)", height: "min(620px, 88vh)", display: "flex",
        flexDirection: "column", padding: "12px 14px", gap: "10px", borderColor: TITLE_COLOR,
    });

    // En-tete (poignee de deplacement) : projet, type, affichage, Sync.
    const head = document.createElement("div");
    Object.assign(head.style, { display: "flex", alignItems: "center", gap: "12px", cursor: "move" });
    const titles = document.createElement("div");
    Object.assign(titles.style, { flex: "1", minWidth: "0" });
    const title = document.createElement("div");
    Object.assign(title.style, { fontSize: "18px", fontWeight: "bold", color: "#eee", overflow: "hidden",
        textOverflow: "ellipsis", whiteSpace: "nowrap" });
    const sub = document.createElement("div");
    Object.assign(sub.style, { color: "#9fd6cf", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden",
        textOverflow: "ellipsis" });
    titles.append(title, sub);
    let view = loadView();
    const viewPill = makeViewPill((v) => {
        view = v;
        saveView(v);
        viewPill.paint(v);
        renderFiles();
    });
    const syncBtn = makeTextButton("Sync", INACTIVE_BG);
    Object.assign(syncBtn.style, { padding: "4px 12px" });
    head.append(titles, viewPill.pill, syncBtn);

    const bar = makeProgressBar();

    // Corps : fichiers a gauche, lecture a droite.
    const body = document.createElement("div");
    Object.assign(body.style, { flex: "1", minHeight: "0", display: "flex", gap: "12px" });
    const left = document.createElement("div");
    Object.assign(left.style, { flex: "1.3", minWidth: "0", overflowY: "auto", background: "#161616",
        border: "1px solid #2c2c2c", borderRadius: "8px", padding: "8px" });
    const right = document.createElement("div");
    Object.assign(right.style, { flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "8px" });
    const stage = document.createElement("div");
    Object.assign(stage.style, { flex: "1", minHeight: "0", background: "#000", borderRadius: "8px", display: "flex",
        alignItems: "center", justifyContent: "center", overflow: "hidden", color: "#666" });
    const info = document.createElement("div");
    Object.assign(info.style, { color: "#999", fontSize: "11px", lineHeight: "1.6", wordBreak: "break-all",
        minHeight: "54px" });
    right.append(stage, info);
    body.append(left, right);

    // Bas : Cancel a gauche (ferme), messages.
    const foot = document.createElement("div");
    Object.assign(foot.style, { display: "flex", alignItems: "center", gap: "12px" });
    const cancel = makeTextButton("Cancel", "#3a3a3a");
    const note = document.createElement("div");
    Object.assign(note.style, { flex: "1", minWidth: "0", color: "#9fd6cf", whiteSpace: "nowrap", overflow: "hidden",
        textOverflow: "ellipsis" });
    foot.append(cancel, note);
    card.append(head, bar.bar, body, foot);

    let kind = "Images";
    let selected = "";

    function close() {
        overlay.style.display = "none";
        stage.innerHTML = "";
    }
    cancel.addEventListener("click", close);
    window.addEventListener("keydown", (e) => {
        if (overlay.style.display !== "none" && e.key === "Escape") close();
    }, true);
    syncBtn.addEventListener("click", () => ctx.sync());

    function showStage(c, dir) {
        stage.innerHTML = "";
        info.innerHTML = "";
        if (!c) {
            stage.textContent = "Click a file to play it here.";
            return;
        }
        const path = joinDir(dir, c.name);
        const url = "/mmrefloader/media?file=" + encodeURIComponent(path) + "&t=" + Math.round(c.mtime);
        const el = document.createElement(kind === "Images" ? "img" : kind === "Video" ? "video" : "audio");
        el.src = url;
        if (kind !== "Images") el.controls = true;
        Object.assign(el.style, kind === "Audio" ? { width: "90%" } :
            { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" });
        stage.appendChild(el);
        const plan = ctx.getPlan();
        const source = ((plan.kinds[kind].files || []).find((f) => f.name === c.name) || {}).source;
        const line = (label, text) => "<div><b style=\"color:#bbb\">" + label + "</b> " + escapeHtml(text) + "</div>";
        info.innerHTML = line("File:", c.name) +
            line("Path:", "Final-Cut_" + plan.name + "/" + kind + "/" + c.name) +
            (source ? line("Source:", source) : "");
    }

    /** Fichier glissable : vrai fichier joint au glisser (prepare au survol, comme H3 Director l'attend). */
    function draggable(el, c, dir) {
        el.draggable = true;
        const path = joinDir(dir, c.name);
        let file = null;
        const ready = () => ctx.prepare(path, c.name, c.mtime).then((f) => (file = f)).catch((e) => say(e.message, false));
        el.addEventListener("mouseenter", ready);
        el.addEventListener("pointerdown", () => {
            if (!file) ready();
        });
        el.addEventListener("dragstart", (e) => {
            if (!file) {
                e.preventDefault();
                say("Preparing " + c.name + "… drag again in a moment.", false);
                return;
            }
            e.dataTransfer.items.add(file);
            e.dataTransfer.effectAllowed = "copy";
        });
        el.addEventListener("click", () => {
            selected = c.name;
            renderFiles();
            showStage(c, dir);
        });
    }

    function thumbOf(c, dir, size) {
        const pic = document.createElement("div");
        Object.assign(pic.style, { width: size.w, height: size.h, flex: "0 0 auto", borderRadius: "4px",
            background: "#0d0d0d center/cover no-repeat", display: "flex", alignItems: "center",
            justifyContent: "center" });
        if (kind === "Audio") pic.innerHTML = iconBadge(AUDIO_ICON, TITLE_COLOR);
        else pic.style.backgroundImage = "url('/mmrefloader/thumb?path=" + encodeURIComponent(dir) + "&file=" +
            encodeURIComponent(c.name) + "&t=" + Math.round(c.mtime) + "')";
        return pic;
    }

    function renderFiles() {
        const plan = ctx.getPlan();
        left.innerHTML = "";
        if (!plan) return;
        const k = plan.kinds[kind];
        const dir = k.dir;
        // Groupes par numero de projet (_NN_), plus recents d'abord dans chaque groupe.
        const groups = new Map();
        for (const c of k.copies) {
            const m = /^_(\d+)_/.exec(c.name);
            const num = m ? m[1] : "";
            if (!groups.has(num)) groups.set(num, []);
            groups.get(num).push(c);
        }
        if (!k.copies.length) {
            const empty = document.createElement("div");
            empty.textContent = "No file in " + kind + ": put files in the Picture Lock folders, then Sync.";
            Object.assign(empty.style, { color: "#777", padding: "10px" });
            left.appendChild(empty);
        }
        for (const num of [...groups.keys()].sort()) {
            const h = document.createElement("div");
            h.textContent = num ? num + ". " + (plan.projects[num] || "(removed project)") : "Other files";
            Object.assign(h.style, { fontWeight: "bold", color: "#eee", fontSize: "13px", margin: "4px 2px 8px" });
            left.appendChild(h);
            const box = document.createElement("div");
            Object.assign(box.style, view === "list" ? { display: "flex", flexDirection: "column", gap: "3px",
                marginBottom: "12px" } : { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(124px, 1fr))",
                gap: "8px", marginBottom: "12px" });
            for (const c of groups.get(num).sort((a, b) => b.mtime - a.mtime)) {
                const on = c.name === selected;
                const item = document.createElement("div");
                item.title = c.name + "\nDrag onto MiniMax H3 Director · click to play";
                if (view === "list") {
                    Object.assign(item.style, { display: "flex", alignItems: "center", gap: "10px", padding: "3px 6px",
                        borderRadius: "5px", cursor: "grab", background: on ? "#1f3a2a" : "#202020",
                        border: "1px solid " + (on ? GREEN : "#2c2c2c") });
                    const name = document.createElement("div");
                    name.textContent = c.name;
                    Object.assign(name.style, { flex: "1", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap" });
                    const meta = document.createElement("div");
                    meta.textContent = dateText(c.mtime) + "   " + sizeText(c.size);
                    Object.assign(meta.style, { color: "#888", fontSize: "11px", whiteSpace: "pre" });
                    item.append(thumbOf(c, dir, { w: "40px", h: "26px" }), name, meta);
                } else {
                    Object.assign(item.style, { display: "flex", flexDirection: "column", gap: "4px", padding: "4px",
                        borderRadius: "6px", cursor: "grab", background: "#202020",
                        border: "2px solid " + (on ? GREEN : "#2c2c2c") });
                    const cap = document.createElement("div");
                    cap.textContent = c.name;
                    Object.assign(cap.style, { fontSize: "11px", color: "#ccc", overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap" });
                    item.append(thumbOf(c, dir, { w: "100%", h: "92px" }), cap);
                }
                draggable(item, c, dir);
                box.appendChild(item);
            }
            left.appendChild(box);
        }
    }

    function say(text, ok) {
        note.textContent = text || "";
        note.style.color = ok === false ? ORANGE : "#9fd6cf";
    }

    function paintHead() {
        const plan = ctx.getPlan();
        if (!plan) return;
        title.textContent = plan.name;
        title.title = plan.folder;
        const k = plan.kinds[kind];
        const meta = KINDS.find((x) => x[0] === kind);
        sub.innerHTML = iconBadge(meta[1], meta[2]) + ' <b style="vertical-align:middle">' + kind + " · " +
            k.copies.length + '</b> <span style="color:#888;vertical-align:middle">· ' + escapeHtml(lastSyncText(plan)) +
            "</span>";
        paintSyncButton(syncBtn, plan, ctx.isBusy());
    }

    return {
        open(k) {
            kind = k;
            selected = "";
            viewPill.paint(view);
            paintHead();
            renderFiles();
            showStage(null);
            say("Drag a file onto MiniMax H3 Director; click it to play it.", true);
            const wasOpen = overlay.style.display !== "none";
            overlay.style.display = "block";
            if (!wasOpen) positionCardNextToNode(card, container, 980);
        },
        /** Plan relu (synchronisation, changement de projet) : la fenetre ouverte suit. */
        update() {
            if (overlay.style.display === "none") return;
            const plan = ctx.getPlan();
            if (!plan) return close();
            paintHead();
            renderFiles();
            if (selected && !plan.kinds[kind].copies.some((c) => c.name === selected)) {
                selected = "";
                showStage(null);
            }
        },
        progress(state) {
            if (!state) return bar.hide();
            bar.set(state.done, state.total);
            say(progressText(state), true);
        },
        message: say,
        remove() {
            close();
            overlay.remove();
        },
    };
}

/** Bouton Sync : orange « Sync · n » s'il y a des changements, sinon gris « Up to date ». */
function paintSyncButton(btn, plan, busy) {
    const n = plan ? plan.count : 0;
    btn.textContent = busy ? "Syncing…" : n ? "Sync · " + n : "Up to date";
    btn.style.background = n && !busy ? SYNC_COLOR : INACTIVE_BG;
    btn.style.color = n && !busy ? "white" : "#9a9a9a";
    btn.disabled = busy || !n;
    btn.style.cursor = btn.disabled ? "default" : "pointer";
    if (!plan || !n) {
        btn.title = plan ? "The copies follow the Picture Lock folders." : "";
        return;
    }
    const lines = [];
    for (const [kind] of KINDS) {
        const k = plan.kinds[kind];
        k.add.forEach((x) => lines.push("+ " + kind + "/" + x));
        k.replace.forEach((x) => lines.push("↻ " + kind + "/" + x));
        k.remove.forEach((x) => lines.push("− " + kind + "/" + x));
    }
    btn.title = "Apply the mirror of the Picture Lock folders:\n" + lines.slice(0, 20).join("\n") +
        (lines.length > 20 ? "\n… (+" + (lines.length - 20) + ")" : "");
}

function progressText(state) {
    return (state.first ? "Initializing" : "Synchronizing") + "… " + state.done + " / " + state.total +
        (state.name ? " · " + state.name : "");
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
                width: "100%", fontFamily: "sans-serif", fontSize: "12px", color: "#ddd",
                // Hauteur naturelle (pas de height 100%) : en Nodes 2.0, le noeud suit son contenu.
            });
            // Ligne du haut : nom du projet (projet mere pour un MultiProject), Sync, aide.
            const top = document.createElement("div");
            Object.assign(top.style, { display: "flex", alignItems: "center", gap: "6px" });
            const where = document.createElement("div");
            Object.assign(where.style, {
                flex: "1", minWidth: "0", color: "#eee", fontWeight: "bold", fontSize: "13px", overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
            });
            const syncBtn = makeTextButton("Up to date", INACTIVE_BG);
            Object.assign(syncBtn.style, { padding: "3px 10px", fontSize: "11px" });
            const helpBtn = document.createElement("button");
            helpBtn.type = "button";
            helpBtn.textContent = "?";
            Object.assign(helpBtn.style, {
                width: "22px", height: "22px", borderRadius: "50%", border: "none", background: PINK,
                color: "white", fontWeight: "bold", cursor: "pointer", padding: "0", flex: "0 0 auto",
            });
            top.append(where, syncBtn, helpBtn);
            container.appendChild(top);

            // Un bouton par type, comme les lignes de dossiers du noeud Project : ouvre la fenetre.
            const rows = {};
            for (const [kind, icon, color] of KINDS) {
                const btn = document.createElement("button");
                btn.type = "button";
                Object.assign(btn.style, {
                    display: "flex", alignItems: "center", gap: "8px", background: INACTIVE_BG, color: "#ddd",
                    border: "1px solid #0c3833", borderRadius: "8px", padding: "2px 8px 2px 3px", height: "28px",
                    textAlign: "left", cursor: "default", width: "100%",
                });
                const badge = document.createElement("span");
                badge.innerHTML = icon;
                Object.assign(badge.style, {
                    display: "flex", alignItems: "center", justifyContent: "center", width: "22px", height: "22px",
                    borderRadius: "5px", background: color, flex: "0 0 auto",
                });
                const label = document.createElement("span");
                Object.assign(label.style, { fontWeight: "bold", whiteSpace: "nowrap" });
                label.textContent = kind;
                const last = document.createElement("span");
                Object.assign(last.style, {
                    flex: "1", textAlign: "right", color: "#9fd6cf", fontSize: "10px", whiteSpace: "nowrap",
                    overflow: "hidden", textOverflow: "ellipsis",
                });
                btn.append(badge, label, last);
                btn.addEventListener("click", () => {
                    if (plan) win.open(kind);
                });
                container.appendChild(btn);
                rows[kind] = { btn, label, last };
            }
            const bar = makeProgressBar();
            container.appendChild(bar.bar);
            const status = document.createElement("div");
            Object.assign(status.style, { color: "#999", minHeight: "14px", whiteSpace: "nowrap", overflow: "hidden",
                textOverflow: "ellipsis" });
            container.appendChild(status);

            const help = buildHelpOverlay(container, {
                sectionsFor: helpSections, nodeTitle: "MiniMax H3 Final Cut", sectionKey: "mmfinalcut.helpSection",
            });
            helpBtn.addEventListener("click", () => help.open());

            let plan = null;
            let busy = false;
            const say = (text, ok) => {
                status.textContent = text || "";
                status.style.color = ok ? "#9fd6cf" : ORANGE;
            };

            /**
             * Projet du noeud MiniMax H3 Project relie a l'entree final_cut ({name, path}), sinon null.
             * Traverse Get / Set (le Set du meme nom : findSetter de KJNodes / Easy-Use, sinon un
             * noeud "Set" de meme nom dans le graphe) et les Reroute, comme models_link du noeud Project.
             */
            function linkedProject() {
                const slot = (node.inputs || []).findIndex((i) => i.name === "final_cut");
                let link = slot >= 0 ? linkInto(node, slot) : null;
                let src = link ? node.graph.getNodeById(link.origin_id) : null;
                for (let hop = 0; src && hop < 10; hop++) {
                    if (src.type === PROJECT_NODE) {
                        const info = typeof src.mmProjectInfo === "function" ? src.mmProjectInfo() : null;
                        return { wired: true, info };
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
                        break;
                    }
                }
                return { wired: false, info: null };
            }

            // Vrai fichier joint au glisser : prepare au survol (dragstart ne peut pas attendre).
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

            const win = buildFilesWindow(container, {
                getPlan: () => plan,
                isBusy: () => busy,
                prepare,
                sync: () => {
                    const { info } = linkedProject();
                    if (info) doSync(info.path);
                },
            });
            node.__mmfinalcutOverlays = [help, win];

            function render() {
                const { wired, info } = linkedProject();
                const ready = !!(wired && info && plan);
                for (const [kind] of KINDS) {
                    const row = rows[kind];
                    row.btn.disabled = !ready;
                    row.btn.style.cursor = ready ? "pointer" : "default";
                    row.btn.style.opacity = ready ? "1" : "0.45";
                    row.label.textContent = kind + (ready ? " · " + plan.kinds[kind].copies.length : "");
                    row.last.textContent = ready ? lastSyncText(plan) : "";
                    row.btn.title = ready ? "Show the copies of " + kind + " (" + plan.kinds[kind].dir + ")" : "";
                }
                paintSyncButton(syncBtn, ready ? plan : null, busy);
                if (!wired) {
                    where.textContent = "Not wired";
                    say("Wire the final_cut output of the MiniMax H3 Project node.");
                } else if (!info) {
                    where.textContent = "No project";
                    say("Pick a project in the MiniMax H3 Project node.");
                } else if (plan) {
                    where.textContent = plan.name;
                    where.title = plan.folder + (plan.link ? "\nLinked in input: " + plan.link : "");
                } else {
                    where.textContent = info.name.split("/")[0];
                }
                win.update();
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
                    if (!busy) say(plan.count ? plan.count + " change(s) in Picture Lock: click Sync." : "Up to date.",
                        !plan.count);
                } catch (e) {
                    plan = null;
                    say(e.message);
                }
                render();
            }

            /** Progression lue pendant la synchronisation (noeud et fenetre). */
            function showProgress(state) {
                if (!state) {
                    bar.hide();
                    win.progress(null);
                    return;
                }
                bar.set(state.done, state.total);
                say(progressText(state), true);
                win.progress(state);
            }

            async function doSync(path) {
                if (busy) return;
                busy = true;
                const first = !plan || !plan.synced;
                showProgress({ done: 0, total: plan ? plan.count : 0, name: "", first });
                render();
                let polling = true;
                const poll = async () => {
                    while (polling) {
                        await new Promise((res) => setTimeout(res, 250));
                        if (!polling) break;
                        try {
                            const p = await apiGet("/mmproject/final_cut/progress?project=" + encodeURIComponent(path));
                            if (polling && p.running) showProgress(p);
                        } catch (e) {
                            // progression indisponible : la synchronisation continue
                        }
                    }
                };
                poll();
                let text = "";
                let ok = true;
                try {
                    const res = await apiPost("/mmproject/final_cut/sync", { project: path });
                    let n = 0;
                    for (const [kind] of KINDS) n += res.kinds[kind].add.length + res.kinds[kind].replace.length +
                        res.kinds[kind].remove.length;
                    plan = await apiGet("/mmproject/final_cut/plan?project=" + encodeURIComponent(path));
                    text = (res.first ? "Initialized: " : "Synchronized: ") + n + " change(s). Linked in input as " +
                        res.link.split(/[\\/]/).pop() + ".";
                } catch (e) {
                    text = e.message;
                    ok = false;
                } finally {
                    polling = false;
                    busy = false;
                }
                showProgress(null);
                say(text, ok);
                win.message(text, ok);
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
                render();
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
