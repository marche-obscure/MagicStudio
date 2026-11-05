import { app } from "../../scripts/app.js";
import { TITLE_COLOR, BODY_COLOR, VIOLET, PINK, ORANGE, GREEN, apiGet, hideWidget } from "./minimax_ref_loader.js";
import { linkedProject, projectInputNames } from "./graph_links.js";
import { buildFolderWindow } from "./media_browser.js";
import { buildProjectWindow } from "./project_browser.js";
import {
    COMPARE_CLASS, parseState, formatState, effectiveKind, acceptKind, bodyDropSide, halfSide, uiHeight, initialStar,
} from "./compare_pure.js";

// --------------------------------------------------------------------
// Noeud MagicStudio Image / Video Compare (plan du 05/11/2026, tache 5 : sources).
// Deux cotes A / B : une entree branchee (video_x ou frames_x) ou un fichier choisi
// (fenetres Project | Folder, ou depot d'un lien sur tout le noeud). L'entree branchee
// gagne : le fichier reste dans l'etat (widget "state", cache), montre grise.
// Le cadre de lecture (tache 6), le lecteur (tache 7) et l'etoile (tache 8) se
// branchent sur node.__mmCompare (voir le compte rendu de la tache 5).
// --------------------------------------------------------------------

const NODE_NAME = COMPARE_CLASS;
const MIN_WIDTH = 460;
const PROJECT_NODE = "MiniMaxH3Project";
const PROJECT_TIP = "Wire the project_used output of a MagicStudio Project node";
const BROWSER_KEY = "mmcompareBrowser";
const PREVIEW_KEY = "mmComparePreview";
const SIDE_BLUE = "#1e88e5";
const SIDE_COLORS = { A: SIDE_BLUE, B: VIOLET };
const SIDES = ["A", "B"];
// Hauteur provisoire du cadre (la tache 6 la recalcule avec les modes et le lecteur).
const FRAME_HEIGHT = 250;
const mediaUrl = (path) => "/mmrefloader/media?file=" + encodeURIComponent(path);
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
            // Place des modes Side by side / Left Right / Right Left / Up Down + aide (tache 6).
            const modeSlot = document.createElement("div");
            Object.assign(modeSlot.style, { display: "flex", alignItems: "center", gap: "4px" });
            // Cadre de lecture : zone provisoire (deux moities A / B) remplacee par la tache 6.
            const frame = document.createElement("div");
            Object.assign(frame.style, {
                position: "relative", height: FRAME_HEIGHT + "px", border: "2px dashed #3b5f5b", borderRadius: "8px",
                background: "#0d0d0d", overflow: "hidden", boxSizing: "border-box", display: "flex",
            });
            frame.dataset.mmcompare = "frame";
            // Place du lecteur (tache 7) et de la ligne des etoiles (tache 8).
            const playerSlot = document.createElement("div");
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
            const folderWin = buildFolderWindow(container, pickOps);
            const projectWin = buildProjectWindow(container, pickOps);
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
                writeState(s);
                message = null;
                paint();
                relockWindows();
                await applyStoredStars();
                return true;
            }
            /** Etoile a la pose : un seul des deux fichiers deja etoile dans son projet -> ce cote. */
            async function applyStoredStars() {
                const s0 = readState();
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
                const stored = paths.map((p, i) => !!p && lists[i].includes(normPath(p)));
                const star = initialStar(s, stored[0], stored[1]);
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

            // ---- Cadre provisoire (remplace par la tache 6 via api.setRenderer) ----
            function defaultRenderer(api) {
                api.frame.innerHTML = "";
                for (const side of SIDES) {
                    const src = api.sourceOf(side);
                    const half = document.createElement("div");
                    Object.assign(half.style, {
                        position: "relative", flex: "1", minWidth: "0", display: "flex", alignItems: "center",
                        justifyContent: "center", color: "#888", textAlign: "center", overflow: "hidden",
                        borderLeft: side === "B" ? "1px solid #2a2a2a" : "none",
                    });
                    half.dataset.side = side;
                    const tag = document.createElement("div");
                    tag.textContent = side;
                    Object.assign(tag.style, {
                        position: "absolute", top: "4px", left: "4px", background: SIDE_COLORS[side], color: "white",
                        fontWeight: "bold", borderRadius: "4px", padding: "0 6px", zIndex: "2", pointerEvents: "none",
                    });
                    const text = (t, extra) => {
                        const d = document.createElement("div");
                        d.textContent = t;
                        Object.assign(d.style, { padding: "0 10px" }, extra || {});
                        return d;
                    };
                    const box = document.createElement("div");
                    Object.assign(box.style, {
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px",
                        width: "100%", height: "100%",
                    });
                    if (src.path) box.appendChild(api.mediaElement(src.path, src.kind, () => {
                        box.innerHTML = "";
                        box.appendChild(text(src.from === "input" ? "Run once to preview" : "File not found"));
                    }));
                    else if (src.from === "input") box.appendChild(text("Run once to preview"));
                    else box.appendChild(text("Pick or drop a file for side " + side));
                    if (src.kept) {
                        box.appendChild(text("kept: " + baseName(src.kept.path) + " (used when input " + side + " is unwired)",
                            { color: "#666", fontSize: "11px" }));
                    }
                    half.append(tag, box);
                    if (src.from === "file") {
                        const x = document.createElement("button");
                        x.type = "button";
                        x.textContent = "✕";
                        x.title = "Remove this file from side " + side;
                        Object.assign(x.style, {
                            position: "absolute", top: "4px", right: "4px", width: "20px", height: "20px", padding: "0",
                            border: "none", borderRadius: "50%", background: "#000a", color: "#ff6b6b", cursor: "pointer",
                            fontWeight: "bold", zIndex: "2",
                        });
                        x.addEventListener("click", (e) => {
                            e.stopPropagation();
                            api.clearSide(side);
                        });
                        half.appendChild(x);
                    }
                    api.frame.appendChild(half);
                }
            }
            /** Element d'apercu (image, ou video sans son ni lecture) ; onFail si le fichier manque. */
            function mediaElement(path, kind, onFail) {
                const el = document.createElement(kind === "video" ? "video" : "img");
                if (kind === "video") {
                    el.muted = true;
                    el.preload = "metadata";
                }
                el.draggable = false;
                el.src = mediaUrl(path);
                Object.assign(el.style, { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" });
                el.addEventListener("error", () => onFail && onFail());
                return el;
            }
            let renderer = defaultRenderer;

            // ---- Interface publique pour les taches 6 a 8 ----
            const api = {
                node, container, top, pill, sideBtns, helpSlot, status, modeSlot, frame, playerSlot, starRow,
                readState, writeState, wired, wiredKinds, comparisonKinds, sourceOf, lockFor, previewOf,
                setSide, clearSide, applyDrop, say, paint, paintStatus, mediaElement,
                /** Remplace le dessin du cadre (tache 6) ; fn(api) est appelee a chaque paint(). */
                setRenderer(fn) {
                    renderer = typeof fn === "function" ? fn : defaultRenderer;
                    paint();
                },
                /** Crochets appeles a chaque paint() (ligne des etoiles, lecteur...). */
                onPaint: [],
                /** Crochets appeles par mmCompareRelease() (lecteurs a vider). */
                onRelease: [],
            };
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
            node.mmComparePaintPill = () => paintPill();
            // Appele par le noeud Project quand son projet change (comme MedLoad).
            let pillTimer = null;
            node.mmProjectRefresh = () => {
                clearTimeout(pillTimer);
                pillTimer = setTimeout(paintPill, 100);
            };
            node.__mmcompareWindows = [folderWin, projectWin];
            node.__mmcompareOverlays = []; // aide (tache 9)
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
            container.addEventListener("dragleave", () => mark(false), true);
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
            (this.__mmcompareOverlays || []).forEach((o) => o.remove());
            (this.__mmcompareWindows || []).forEach((w) => w.remove());
            return onRemoved ? onRemoved.apply(this, arguments) : undefined;
        };
    },
});
