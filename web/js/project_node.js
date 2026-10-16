import { app } from "../../scripts/app.js";
import {
    TITLE_COLOR, BODY_COLOR, VIOLET, PINK, ORANGE, GREEN, INACTIVE_BG,
    svg, iconBadge, hList, hSteps, hTip, hNote, hCard, FOLDER_ICON, REFRESH_ICON, GEAR_ICON, START_ICON,
    makeOverlay, makeIconButton, makeTextButton, positionCardNextToNode, apiGet, hideWidget,
    escapeHtml, buildHelpOverlay, vueMode,
} from "./minimax_ref_loader.js";
import { PROJECT_SUBFOLDERS, projectNameError, parseProjectState } from "./project_paths.js";

// Noeud "MiniMax H3 Project" : cree ou choisit un dossier de projet dans le
// Root folder recu du MiniMax H3 Reference Loader (entree "project"), ou
// dans le dossier par defaut <input de ComfyUI>/Projets.

const NODE_NAME = "MiniMaxH3Project";
const UI_HEIGHT = 66;
const MIN_WIDTH = 300;

const PLUS_ICON = svg('<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>', 14);
const PROJECT_ICON = svg(
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>' +
    '<line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line>', 13);
const LINK_ICON = svg(
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>' +
    '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>', 13);

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
            [iconBadge(PLUS_ICON, PINK), "Create a new project (a window asks for the name)"],
            [iconBadge(REFRESH_ICON, VIOLET), "Read the list of projects again"],
        ]),
    },
    {
        id: "folders", title: "Project folders", icon: PROJECT_ICON, color: VIOLET,
        html: "<p>Every project is a folder with always the same subfolders:</p>" +
            hList(PROJECT_SUBFOLDERS.map((f) => "<b>" + f + "</b>")) +
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
        hNote("The bottom line of the node shows the folder used, or the path of the selected project."),
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
            [iconBadge(PLUS_ICON, PINK), "Créer un nouveau projet (une fenêtre demande le nom)"],
            [iconBadge(REFRESH_ICON, VIOLET), "Relire la liste des projets"],
        ]),
    },
    {
        id: "folders", title: "Dossiers du projet",
        html: "<p>Chaque projet est un dossier avec toujours les mêmes sous-dossiers :</p>" +
            hList(PROJECT_SUBFOLDERS.map((f) => "<b>" + f + "</b>")) +
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
        hNote("La ligne du bas du nœud montre le dossier utilisé, ou le chemin du projet choisi.", "Remarque :"),
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
            const setState = (s) => {
                const folder = s.folder !== undefined ? s.folder : getState().folder;
                stateWidget.value = JSON.stringify({ root: s.root, name: s.name, path: s.path, folder });
            };

            // Dossier des projets actuel (donne par le serveur) et ses projets.
            // linked : Root folder du Reference Loader ; custom : dossier personnalise du noeud.
            let folder = { root: "", exists: true, linked: false, custom: false };
            let fallbackRoot = ""; // dossier de repli <input de ComfyUI>/Projets
            let projects = [];
            let message = "";   // erreur ou avertissement (orange)
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

            // Ligne du bas : dossier utilise ou chemin du projet, Relire, aide.
            const bottom = document.createElement("div");
            Object.assign(bottom.style, { display: "flex", alignItems: "center", gap: "6px", flex: "0 0 auto" });
            const status = document.createElement("div");
            Object.assign(status.style, {
                flex: "1", minWidth: "0", fontSize: "11px", whiteSpace: "nowrap", overflow: "hidden",
                textOverflow: "ellipsis", direction: "rtl", textAlign: "left",
            });
            const reloadBtn = makeIconButton(VIOLET, REFRESH_ICON, "Read the list of projects again");
            reloadBtn.style.width = reloadBtn.style.height = "22px";
            const helpBtn = document.createElement("button");
            helpBtn.type = "button";
            helpBtn.textContent = "?";
            Object.assign(helpBtn.style, {
                width: "22px", height: "22px", borderRadius: "50%", border: "none", background: PINK,
                color: "white", fontWeight: "bold", cursor: "pointer", padding: "0", flex: "0 0 auto",
            });
            bottom.append(status, reloadBtn, helpBtn);
            container.append(pickRow, bottom);

            const createDialog = buildCreateDialog(container, {
                create: createProject,
                check: (path) => apiGet("/mmproject/list?root=" + encodeURIComponent(path)),
            });
            const help = buildHelpOverlay(container, {
                sectionsFor: projectHelpSections, nodeTitle: "MiniMax H3 Project", sectionKey: "mmproject.helpSection",
            });
            node.__mmprojectOverlays = [createDialog, help];

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

                let text;
                let color;
                if (message) {
                    text = message;
                    color = ORANGE;
                } else if (current) {
                    text = s.path;
                    color = "#9fd6cf";
                } else if (!folder.exists) {
                    text = "Folder not found (created with the first project): " + folder.root;
                    color = ORANGE;
                } else {
                    text = (folder.linked ? "Root folder: " : folder.custom ? "Projects folder: " : "Default folder: ") +
                        folder.root;
                    color = "#888";
                }
                // rtl : la fin du chemin reste visible ; les marques LRM gardent la ponctuation en place.
                status.textContent = "‎" + text + "‎";
                status.style.color = color;
                status.title = text;
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
                    message = "";
                    render();
                    return;
                }
                try {
                    const data = await apiPost("/mmproject/open", { root: folder.root, name });
                    setState({ root: folder.root, name, path: data.path });
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
            }

            select.addEventListener("change", () => openProject(select.value));
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

            // Rechargement d'un workflow : liens et etat sont en place, on relit.
            const onConfigure = node.onConfigure;
            node.onConfigure = function () {
                const ret = onConfigure ? onConfigure.apply(this, arguments) : undefined;
                // Sortie "project" d'une version de test (sens inverse) : retiree avec son lien.
                while (node.outputs && node.outputs.length) node.removeOutput(node.outputs.length - 1);
                render();
                setTimeout(loadProjects, 0);
                return ret;
            };

            render();
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
            (this.__mmprojectOverlays || []).forEach((o) => o.remove());
            return onRemoved ? onRemoved.apply(this, arguments) : undefined;
        };
    },
});
