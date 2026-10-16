import { app } from "../../scripts/app.js";
import {
    TITLE_COLOR, BODY_COLOR, VIOLET, PINK, ORANGE, GREEN, MARK_RED, INACTIVE_BG,
    svg, iconBadge, hList, hSteps, hTip, hNote, hCard, FOLDER_ICON, REFRESH_ICON, CLOSE_ICON, GEAR_ICON,
    START_ICON, IMAGE_ICON, VIDEO_ICON, AUDIO_ICON, TRASH_ICON,
    makeOverlay, makeIconButton, makeTextButton, positionCardNextToNode, apiGet, hideWidget,
    buildHelpOverlay, vueMode,
} from "./minimax_ref_loader.js";
import { PROJECT_SUBFOLDERS, projectNameError, parseProjectState } from "./project_paths.js";

// Noeud "MiniMax H3 Project" : choisit ou cree un dossier de projet et
// donne son chemin (sortie "project") au MiniMax H3 Reference Loader.

const NODE_NAME = "MiniMaxH3Project";
const UI_HEIGHT = 96;
const MIN_WIDTH = 300;
// Derniere racine choisie : racine des nouveaux noeuds Projet.
const ROOT_KEY = "mmproject.root";

const PLUS_ICON = svg('<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>', 14);
const CHECK_ICON = svg('<polyline points="20 6 9 17 4 12"></polyline>', 14);
const PROJECT_ICON = svg(
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>' +
    '<line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line>', 13);
const LINK_ICON = svg(
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>' +
    '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>', 13);

function loadSavedRoot() {
    try {
        return localStorage.getItem(ROOT_KEY) || "";
    } catch (e) {
        return "";
    }
}
function saveRoot(root) {
    try {
        localStorage.setItem(ROOT_KEY, root);
    } catch (e) {
        // Stockage indisponible : les nouveaux noeuds partent de la racine par defaut.
    }
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

const HELP_SECTIONS = [
    {
        id: "start", title: "Quick start", icon: START_ICON, color: TITLE_COLOR,
        html: hSteps([
            "Click " + iconBadge(PLUS_ICON, PINK) + ", type the name of your project and press <b>Enter</b>: " +
            "its folder is created with " + folderList + ".",
            "Or pick an existing project in the drop-down list.",
            "Wire the <b>project</b> output to the <b>project</b> input of the <b>MiniMax H3 Reference Loader</b>: " +
            "its galleries now open in the project folders.",
        ]) +
        hCard("Buttons of the node", [
            [iconBadge(PLUS_ICON, PINK), "Create a new project"],
            [iconBadge(REFRESH_ICON, VIOLET), "Read the list of projects again"],
            [iconBadge(GEAR_ICON, VIOLET), "Projects folder (where the projects are created)"],
        ]),
    },
    {
        id: "folders", title: "Project folders", icon: PROJECT_ICON, color: VIOLET,
        html: "<p>Every project is a folder with always the same subfolders:</p>" +
            hList(PROJECT_SUBFOLDERS.map((f) => "<b>" + f + "</b>")) +
            hNote("A subfolder deleted by mistake is created again when you pick the project, or when the " +
                "workflow runs.") +
            hTip("A project name cannot contain <b>&lt; &gt; : \" / \\ | ? *</b> nor end with a dot."),
    },
    {
        id: "root", title: "Projects folder", icon: GEAR_ICON, color: VIOLET,
        html: "<p>" + iconBadge(GEAR_ICON, VIOLET) + " sets the folder where the projects are created and " +
            "listed.</p>" +
            hList([
                "Empty: the default folder <b>ComfyUI/input/Projets</b> (created if needed).",
                "The last folder chosen is used by the next Project nodes you add.",
                "Changing the folder clears the selected project.",
            ]),
    },
    {
        id: "link", title: "Link to the Reference Loader", icon: LINK_ICON, color: ORANGE,
        html: "<p>While the <b>project</b> output is wired to the Reference Loader:</p>" +
            hList([
                "Its root folder is the project folder, and its " + iconBadge(GEAR_ICON, VIOLET) + " is greyed.",
                iconBadge(IMAGE_ICON, VIOLET) + " Images, First and Last frame open in <b>Images</b>.",
                iconBadge(VIDEO_ICON, ORANGE) + " Video and Video/Audio open in <b>Rush Videos</b>.",
                iconBadge(AUDIO_ICON, TITLE_COLOR) + " Audio opens in <b>Son</b>.",
                "The <b>Subfolder</b> list of the gallery stays free: pick <b>Rush Images</b> or any other.",
            ]) +
            hNote("Unwire the project: the Reference Loader gets its own root folder back."),
    },
];

const HELP_SECTIONS_FR = [
    {
        id: "start", title: "Démarrage rapide",
        html: hSteps([
            "Cliquez sur " + iconBadge(PLUS_ICON, PINK) + ", tapez le nom du projet et appuyez sur <b>Entrée</b> : " +
            "son dossier est créé avec " + folderList + ".",
            "Ou choisissez un projet existant dans la liste déroulante.",
            "Reliez la sortie <b>project</b> à l'entrée <b>project</b> du <b>MiniMax H3 Reference Loader</b> : " +
            "ses galeries s'ouvrent alors dans les dossiers du projet.",
        ]) +
        hCard("Boutons du nœud", [
            [iconBadge(PLUS_ICON, PINK), "Créer un nouveau projet"],
            [iconBadge(REFRESH_ICON, VIOLET), "Relire la liste des projets"],
            [iconBadge(GEAR_ICON, VIOLET), "Dossier des projets (où ils sont créés)"],
        ]),
    },
    {
        id: "folders", title: "Dossiers du projet",
        html: "<p>Chaque projet est un dossier avec toujours les mêmes sous-dossiers :</p>" +
            hList(PROJECT_SUBFOLDERS.map((f) => "<b>" + f + "</b>")) +
            hNote("Un sous-dossier supprimé par erreur est recréé quand vous choisissez le projet, ou quand " +
                "le workflow s'exécute.", "Remarque :") +
            hTip("Un nom de projet ne peut pas contenir <b>&lt; &gt; : \" / \\ | ? *</b> ni finir par un point.",
                "Astuce :"),
    },
    {
        id: "root", title: "Dossier des projets",
        html: "<p>" + iconBadge(GEAR_ICON, VIOLET) + " règle le dossier où les projets sont créés et " +
            "listés.</p>" +
            hList([
                "Vide : le dossier par défaut <b>ComfyUI/input/Projets</b> (créé si besoin).",
                "Le dernier dossier choisi sert aux prochains nœuds Projet que vous ajoutez.",
                "Changer de dossier vide le projet choisi.",
            ]),
    },
    {
        id: "link", title: "Lien avec le Reference Loader",
        html: "<p>Tant que la sortie <b>project</b> est reliée au Reference Loader :</p>" +
            hList([
                "Son dossier racine est celui du projet, et sa " + iconBadge(GEAR_ICON, VIOLET) + " est grisée.",
                iconBadge(IMAGE_ICON, VIOLET) + " Images, First et Last frame s'ouvrent dans <b>Images</b>.",
                iconBadge(VIDEO_ICON, ORANGE) + " Video et Video/Audio s'ouvrent dans <b>Rush Videos</b>.",
                iconBadge(AUDIO_ICON, TITLE_COLOR) + " Audio s'ouvre dans <b>Son</b>.",
                "La liste <b>Subfolder</b> de la galerie reste libre : choisissez <b>Rush Images</b> ou un autre.",
            ]) +
            hNote("Débranchez le projet : le Reference Loader retrouve son propre dossier racine.", "Remarque :"),
    },
];

function projectHelpSections(lang) {
    if (lang !== "fr") return HELP_SECTIONS;
    const fr = Object.fromEntries(HELP_SECTIONS_FR.map((sec) => [sec.id, sec]));
    return HELP_SECTIONS.map((sec) => (fr[sec.id] ? Object.assign({}, sec, fr[sec.id]) : sec));
}

// --------------------------------------------------------------------
// Fenetre du dossier des projets (roue crantee)
// --------------------------------------------------------------------
function buildProjectsRootDialog(container, ctx) {
    const { overlay, card } = makeOverlay();
    Object.assign(card.style, { width: "min(460px, 92vw)", padding: "12px 14px", borderColor: VIOLET });

    const title = document.createElement("div");
    title.textContent = "Projects folder";
    Object.assign(title.style, { fontWeight: "bold", fontSize: "13px", color: TITLE_COLOR, marginBottom: "6px" });
    const hint = document.createElement("div");
    Object.assign(hint.style, { color: "#999", marginBottom: "10px", lineHeight: "1.4" });

    const row = document.createElement("div");
    Object.assign(row.style, { display: "flex", gap: "6px", alignItems: "center" });
    const input = document.createElement("input");
    input.type = "text";
    Object.assign(input.style, {
        flex: "1", minWidth: "0", background: "#111", color: "#ddd", border: "1px solid #0c3833",
        borderRadius: "10px", padding: "5px 10px", fontSize: "12px", outline: "none", boxSizing: "border-box",
    });
    const browseBtn = makeIconButton(VIOLET, FOLDER_ICON, "Browse");
    const clearBtn = makeIconButton(MARK_RED, TRASH_ICON, "Back to the default folder");
    row.append(input, browseBtn, clearBtn);

    const status = document.createElement("div");
    Object.assign(status.style, { color: "#999", minHeight: "14px", margin: "6px 0 0" });
    const footer = document.createElement("div");
    Object.assign(footer.style, { display: "flex", justifyContent: "flex-end", marginTop: "10px" });
    const doneBtn = makeTextButton("Done", PINK);
    footer.appendChild(doneBtn);
    card.append(title, hint, row, status, footer);

    function save() {
        ctx.setRoot(input.value.trim());
        close();
    }

    async function browse() {
        browseBtn.disabled = true;
        status.textContent = "Opening the folder dialog...";
        try {
            const start = input.value.trim() || ctx.getDefaultRoot();
            const data = await apiGet("/mmrefloader/browse_dir?initial=" + encodeURIComponent(start));
            if (data.path) input.value = data.path;
            status.textContent = "";
        } catch (e) {
            status.textContent = e.message;
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
                save();
            }
        }
    };

    function close() {
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
    }

    browseBtn.addEventListener("click", browse);
    clearBtn.addEventListener("click", () => {
        input.value = "";
        input.focus();
    });
    doneBtn.addEventListener("click", save);
    overlay.addEventListener("mousedown", close);

    return {
        open() {
            const def = ctx.getDefaultRoot();
            input.value = ctx.getRoot();
            input.placeholder = def ? "Default: " + def : "Default folder (ComfyUI/input/Projets)";
            hint.textContent = "New projects are created in this folder. Empty: the default folder" +
                (def ? " (" + def + ")" : "") + ".";
            status.textContent = "";
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

/** Previent les Reference Loader du graphe que le projet a change. */
function notifyLoaders(node) {
    const graph = node.graph;
    const nodes = (graph && (graph._nodes || graph.nodes)) || [];
    nodes.forEach((n) => {
        if (n && typeof n.__mmrefRefresh === "function") n.__mmrefRefresh();
    });
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
            const setState = (s) => {
                stateWidget.value = JSON.stringify({ root: s.root, name: s.name, path: s.path });
            };
            // Nouveau noeud : la derniere racine choisie (un workflow recharge la remplace).
            if (stateWidget.value === "{}" || !stateWidget.value) {
                setState({ root: loadSavedRoot(), name: "", path: "" });
            }

            let defaultRoot = "";   // racine par defaut (ComfyUI/input/Projets), donnee par le serveur
            let effectiveRoot = ""; // racine reellement listee
            let projects = [];
            let message = "";       // erreur ou avertissement (orange), sinon le chemin
            let loadId = 0;

            // ---- Interface ----
            const container = document.createElement("div");
            Object.assign(container.style, {
                display: "flex", flexDirection: "column", gap: "6px", padding: "6px 8px",
                boxSizing: "border-box", width: "100%", fontFamily: "sans-serif", fontSize: "12px",
            });

            // Ligne 1 : liste deroulante des projets + bouton Nouveau.
            const pickRow = document.createElement("div");
            Object.assign(pickRow.style, { display: "flex", gap: "6px", alignItems: "center", flex: "0 0 auto" });
            const select = document.createElement("select");
            Object.assign(select.style, {
                flex: "1", minWidth: "0", height: "26px", background: "#111", color: "#ddd",
                border: "1px solid #0c3833", borderRadius: "8px", padding: "2px 8px", fontSize: "12px",
                outline: "none", boxSizing: "border-box", cursor: "pointer",
            });
            select.title = "Project";
            const newBtn = makeIconButton(PINK, PLUS_ICON, "New project");
            newBtn.style.width = newBtn.style.height = "26px";
            pickRow.append(select, newBtn);

            // Ligne 2 (pendant la creation) : nom du projet, Creer, Annuler.
            const newRow = document.createElement("div");
            Object.assign(newRow.style, { display: "none", gap: "6px", alignItems: "center", flex: "0 0 auto" });
            const nameInput = document.createElement("input");
            nameInput.type = "text";
            nameInput.placeholder = "New project name";
            Object.assign(nameInput.style, {
                flex: "1", minWidth: "0", height: "26px", background: "#111", color: "#ddd",
                border: "1px solid " + PINK, borderRadius: "8px", padding: "2px 8px", fontSize: "12px",
                outline: "none", boxSizing: "border-box",
            });
            const createBtn = makeIconButton(GREEN, CHECK_ICON, "Create the project (Enter)");
            const cancelBtn = makeIconButton(INACTIVE_BG, CLOSE_ICON, "Cancel (Esc)");
            createBtn.style.width = createBtn.style.height = "26px";
            cancelBtn.style.width = cancelBtn.style.height = "26px";
            newRow.append(nameInput, createBtn, cancelBtn);

            // Ligne du bas : chemin du projet (ou message), Relire, roue, aide.
            const bottom = document.createElement("div");
            Object.assign(bottom.style, { display: "flex", alignItems: "center", gap: "6px", flex: "0 0 auto" });
            const status = document.createElement("div");
            Object.assign(status.style, {
                flex: "1", minWidth: "0", fontSize: "11px", whiteSpace: "nowrap", overflow: "hidden",
                textOverflow: "ellipsis", direction: "rtl", textAlign: "left",
            });
            const reloadBtn = makeIconButton(VIOLET, REFRESH_ICON, "Read the list of projects again");
            const rootBtn = makeIconButton(VIOLET, GEAR_ICON, "Projects folder");
            const helpBtn = document.createElement("button");
            helpBtn.type = "button";
            helpBtn.textContent = "?";
            Object.assign(helpBtn.style, {
                width: "22px", height: "22px", borderRadius: "50%", border: "none", background: PINK,
                color: "white", fontWeight: "bold", cursor: "pointer", padding: "0", flex: "0 0 auto",
            });
            [reloadBtn, rootBtn].forEach((b) => {
                b.style.width = "22px";
                b.style.height = "22px";
            });
            bottom.append(status, reloadBtn, rootBtn, helpBtn);
            container.append(pickRow, newRow, bottom);

            const rootDialog = buildProjectsRootDialog(container, {
                getRoot: () => getState().root,
                getDefaultRoot: () => defaultRoot,
                setRoot: (root) => {
                    const s = getState();
                    saveRoot(root);
                    if (root === s.root) return;
                    // Autre dossier : le projet choisi n'en fait pas partie.
                    setState({ root, name: "", path: "" });
                    message = "";
                    notifyLoaders(node);
                    loadProjects();
                },
            });
            const help = buildHelpOverlay(container, {
                sectionsFor: projectHelpSections, nodeTitle: "MiniMax H3 Project", sectionKey: "mmproject.helpSection",
            });
            node.__mmprojectOverlays = [rootDialog, help];

            // Chemin du projet pour le Reference Loader ("" si aucun).
            node.mmProjectPath = () => {
                const s = getState();
                return s.name ? s.path : "";
            };

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
                if (s.name && !projects.includes(s.name)) add(s.name, s.name + " (missing)", ORANGE);
                select.value = s.name;
                select.style.color = s.name ? "#ddd" : "#888";

                const text = message || (s.name ? s.path : "No project selected");
                // rtl : la fin du chemin (le nom du projet) reste visible ; "‎" garde la ponctuation en place.
                status.textContent = "‎" + text + "‎";
                status.style.color = message ? ORANGE : s.name ? "#9fd6cf" : "#888";
                status.title = text;
                rootBtn.title = "Projects folder: " + (effectiveRoot || s.root || "default");
            }

            /** Relit les projets de la racine. */
            async function loadProjects() {
                const id = ++loadId;
                const s = getState();
                try {
                    const data = await apiGet("/mmproject/list?root=" + encodeURIComponent(s.root));
                    if (id !== loadId) return;
                    projects = data.projects || [];
                    defaultRoot = data.default_root || "";
                    effectiveRoot = data.root || "";
                    if (s.name && !projects.includes(s.name)) message = 'Project "' + s.name + '" not found';
                    else if (message.startsWith("Projects folder")) message = "";
                } catch (e) {
                    if (id !== loadId) return;
                    projects = [];
                    message = e.message;
                }
                render();
            }

            /** Choisit un projet : sous-dossiers manquants recrees, chemin memorise. */
            async function openProject(name) {
                const s = getState();
                if (!name) {
                    setState({ root: s.root, name: "", path: "" });
                    message = "";
                    render();
                    notifyLoaders(node);
                    return;
                }
                try {
                    const data = await apiPost("/mmproject/open", { root: s.root, name });
                    setState({ root: s.root, name, path: data.path });
                    message = "";
                } catch (e) {
                    message = e.message;
                }
                render();
                notifyLoaders(node);
            }

            function showNewRow(on) {
                newRow.style.display = on ? "flex" : "none";
                pickRow.style.display = on ? "none" : "flex";
                if (on) {
                    nameInput.value = "";
                    nameInput.style.borderColor = PINK;
                    message = "";
                    render();
                    setTimeout(() => nameInput.focus(), 0);
                }
            }

            async function createProject() {
                const name = nameInput.value.trim();
                const err = projectNameError(name);
                if (err) {
                    message = err;
                    nameInput.style.borderColor = ORANGE;
                    render();
                    return;
                }
                const s = getState();
                try {
                    const data = await apiPost("/mmproject/create", { root: s.root, name });
                    setState({ root: s.root, name: data.name, path: data.path });
                    message = "";
                    showNewRow(false);
                    await loadProjects();
                    notifyLoaders(node);
                } catch (e) {
                    message = e.message;
                    nameInput.style.borderColor = ORANGE;
                    render();
                }
            }

            // Les touches tapees dans le champ ne partent pas vers le canvas
            // (Suppr supprimerait le noeud) ; Entree cree, Echap annule.
            nameInput.addEventListener("keydown", (e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                    e.preventDefault();
                    createProject();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    showNewRow(false);
                    message = "";
                    render();
                }
            });
            nameInput.addEventListener("input", () => {
                if (message) {
                    message = "";
                    nameInput.style.borderColor = PINK;
                    render();
                }
            });
            select.addEventListener("change", () => openProject(select.value));
            newBtn.addEventListener("click", () => showNewRow(true));
            createBtn.addEventListener("click", createProject);
            cancelBtn.addEventListener("click", () => {
                showNewRow(false);
                message = "";
                render();
            });
            reloadBtn.addEventListener("click", async () => {
                message = "";
                await loadProjects();
                const s = getState();
                if (s.name && projects.includes(s.name)) openProject(s.name);
            });
            rootBtn.addEventListener("click", () => rootDialog.open());
            helpBtn.addEventListener("click", () => help.open());

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

            // Rechargement d'un workflow : relire la liste et verifier le projet
            // (sous-dossiers manquants recrees, chemin a jour).
            const onConfigure = node.onConfigure;
            node.onConfigure = function () {
                const ret = onConfigure ? onConfigure.apply(this, arguments) : undefined;
                message = "";
                render();
                loadProjects().then(() => {
                    const s = getState();
                    if (s.name && projects.includes(s.name)) openProject(s.name);
                });
                return ret;
            };

            render();
            loadProjects();
            vueProjectNodes.add(node);
            watchVue();
            scheduleVueHide();
            return r;
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            vueProjectNodes.delete(this);
            (this.__mmprojectOverlays || []).forEach((o) => o.remove());
            const graph = this.graph;
            // Le noeud disparait : les Reference Loader branches reprennent leur racine.
            setTimeout(() => {
                const nodes = (graph && (graph._nodes || graph.nodes)) || [];
                nodes.forEach((n) => n && n.__mmrefRefresh && n.__mmrefRefresh());
            }, 0);
            return onRemoved ? onRemoved.apply(this, arguments) : undefined;
        };
    },
});
