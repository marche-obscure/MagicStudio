// Fenetre "Project" de MedLoad : medias du projet relie (dossiers par type, Archives, Extract Frames),
// 40 / 60 = originaux seulement + arbre Processing en lecture seule. Rien n'est jamais deplace ni supprime ici.
// Pur DOM (classique et Node 2.0). Modules charges une seule fois : importer project_node.js d'ici est sans risque.
import {
    makeOverlay, makeTextButton, apiGet, buildIconPicker, projectKind, TITLE_COLOR, INACTIVE_BG, ORANGE, GREEN, VIOLET,
} from "./minimax_ref_loader.js";
import {
    buildPreviewWindow, buildProcessingWindow, makeDragSource, makeFileDragSource, dupThumb, addStatusDot, addPostBadge,
    splitPath,
} from "./project_node.js";
import { rushItems, runDateText } from "./project_paths.js";
import {
    PROJECT_KINDS, projectSections, sectionQuery, rushFolderOf, kindOfName, projectPathOf, projectChoices, mtimeText,
} from "./project_browser_pure.js";

const KIND_KEY = "mmloadmedia.projectKind";
const BAR_BG = "#161616";

function readStore(key, fallback) {
    try {
        return localStorage.getItem(key) || fallback;
    } catch (e) {
        return fallback;
    }
}

function writeStore(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        // stockage indisponible : on ne retient rien
    }
}

/** Dossier des projets d'un projet : son chemin moins les segments du nom ("Groupe/Projet" = 2 segments). */
function rootOfPath(path, name) {
    const parts = String(path || "").replace(/[\\/]+$/, "").split(/[\\/]/);
    const n = String(name || "").split("/").filter(Boolean).length;
    const sep = String(path || "").includes("\\") ? "\\" : "/";
    return n && parts.length > n ? parts.slice(0, parts.length - n).join(sep) : "";
}

/**
 * buildProjectWindow(container, ops) -> {open(projectInfo, anchor), close(), isOpen()}
 * projectInfo : {name, path} du projet relie (mmProjectInfo du noeud Project) ; ops.getProjectList()
 * facultatif : {root, tree} deja connus (sinon /mmproject/list). Changer de projet ici ne modifie aucun noeud.
 */
export function buildProjectWindow(container, ops = {}) {
    const { overlay, card } = makeOverlay();
    // Fond sans blocage : le workflow reste utilisable et le depot atteint le noeud derriere.
    overlay.style.pointerEvents = "none";
    card.style.pointerEvents = "auto";
    Object.assign(card.style, {
        width: "min(860px, 94vw)", height: "min(560px, 86vh)", background: "#161616", border: "1px solid " + TITLE_COLOR,
        display: "flex", flexDirection: "column", overflow: "hidden",
    });
    const preview = buildPreviewWindow();
    // Les fonctions de glisser de project_node.js remettent la couche a "" a la fin : ici elle est toujours "none".
    const dragLayer = { style: {} };

    // ---- En-tete ----
    const head = document.createElement("div");
    Object.assign(head.style, { display: "flex", flexDirection: "column", gap: "6px", padding: "8px 10px", borderBottom: "1px solid #2a2a2a" });
    const nameRow = document.createElement("div");
    Object.assign(nameRow.style, { display: "flex", alignItems: "center", gap: "8px" });
    const nameLabel = document.createElement("div");
    nameLabel.textContent = "Project name :";
    Object.assign(nameLabel.style, { fontWeight: "bold", color: TITLE_COLOR, flex: "0 0 auto" });
    const select = document.createElement("select");
    select.style.display = "none";
    const picker = buildIconPicker(select, card,
        (o) => (o.value ? projectKind(o.dataset.multi === "1") : null), { borderRadius: "10px", padding: "4px 8px" });
    nameRow.append(nameLabel, picker.el, select);

    const mkBtn = (text, tip) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.title = tip;
        Object.assign(b.style, {
            background: INACTIVE_BG, color: "#ddd", border: "none", borderRadius: "4px", padding: "3px 9px",
            cursor: "pointer", fontSize: "12px",
        });
        return b;
    };
    const barRow = document.createElement("div");
    Object.assign(barRow.style, { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" });
    const kindBtns = {};
    for (const [k, label] of PROJECT_KINDS) {
        kindBtns[k] = mkBtn(label, "Show the " + label.toLowerCase() + " files of the project");
        barRow.appendChild(kindBtns[k]);
    }
    const archivesBtn = mkBtn("Archives", "Show the Archives folders of the chosen type (click again: back)");
    const extractBtn = mkBtn("Extract Frames", "Show the frames extracted from the Picture Lock videos (click again: back)");
    const spacer = document.createElement("div");
    spacer.style.flex = "1";
    const closeBtn = makeTextButton("Close", ORANGE);
    barRow.append(archivesBtn, extractBtn, spacer, closeBtn);
    head.append(nameRow, barRow);

    const body = document.createElement("div");
    Object.assign(body.style, { flex: "1", overflowY: "auto", overflowX: "hidden", padding: "8px 12px", background: BAR_BG });
    const note = document.createElement("div");
    Object.assign(note.style, { padding: "4px 12px", color: "#999", fontSize: "11px", minHeight: "14px", borderTop: "1px solid #2a2a2a" });
    card.append(head, body, note);

    // ---- Etat ----
    let projectName = "";
    let projectPath = "";
    let rootPath = "";
    let tree = [];
    let kind = readStore(KIND_KEY, "video");
    if (!PROJECT_KINDS.some(([k]) => k === kind)) kind = "video";
    let mode = "normal"; // normal | archives | extract
    let runs = [];
    let runsFor = ""; // projet dont les Runs sont charges
    let seq = 0;
    let procFolder = "40.Rush Videos";
    let shownPath = "";

    const isOpen = () => overlay.style.display !== "none";

    // Arbre Processing en lecture seule : aucune action de rangement, de suppression ni d'Extract Frame.
    const proc = buildProcessingWindow(container, {
        readOnly: true,
        getRuns: () => runs,
        folder: () => procFolder,
        overlay: dragLayer,
        showPreview: (file, k, anchor) => preview.show(file, k, file, anchor),
        closePreview: () => preview.close(),
        refresh40() {},
        lock() {},
    });

    function paintHead() {
        for (const [k] of PROJECT_KINDS) {
            const on = k === kind && mode !== "extract";
            kindBtns[k].style.background = on ? GREEN : INACTIVE_BG;
            kindBtns[k].style.color = on ? "#fff" : "#ddd";
        }
        archivesBtn.style.background = mode === "archives" ? GREEN : INACTIVE_BG;
        archivesBtn.style.color = mode === "archives" ? "#fff" : "#ddd";
        extractBtn.style.background = mode === "extract" ? GREEN : INACTIVE_BG;
        extractBtn.style.color = mode === "extract" ? "#fff" : "#ddd";
    }

    function fillSelect() {
        select.innerHTML = "";
        let found = false;
        for (const c of projectChoices(tree)) {
            const o = document.createElement("option");
            o.value = c.value;
            o.textContent = c.group ? c.group + " / " + c.label : c.label;
            o.dataset.multi = c.multi ? "1" : "0";
            if (c.value === projectName) found = true;
            select.appendChild(o);
        }
        if (projectName && !found) {
            const o = document.createElement("option");
            o.value = projectName;
            o.textContent = projectName;
            o.dataset.multi = projectName.includes("/") ? "1" : "0";
            select.appendChild(o);
        }
        select.value = projectName;
        picker.paint();
    }

    // ---- Vignettes ----
    function section(title, count, emptyText) {
        const box = document.createElement("div");
        Object.assign(box.style, { marginBottom: "14px" });
        const t = document.createElement("div");
        t.textContent = count ? title + " (" + count + ")" : title + " – " + emptyText;
        Object.assign(t.style, { fontWeight: "bold", marginBottom: "6px", color: count ? "#9fd6cf" : "#777" });
        box.appendChild(t);
        const row = document.createElement("div");
        Object.assign(row.style, { display: "flex", flexWrap: "wrap", gap: "10px" });
        box.appendChild(row);
        body.appendChild(box);
        return row;
    }

    function tileBox() {
        const t = document.createElement("div");
        Object.assign(t.style, {
            width: "120px", padding: "5px", borderRadius: "8px", background: "#1f1f1f", cursor: "pointer",
            flex: "0 0 auto", boxSizing: "border-box", border: "1px solid #333",
        });
        return t;
    }

    function labels(t, name, date) {
        const n = document.createElement("div");
        n.textContent = name;
        n.title = name;
        Object.assign(n.style, { fontSize: "11px", marginTop: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
        t.appendChild(n);
        const d = document.createElement("div");
        d.textContent = date;
        d.title = date;
        Object.assign(d.style, { fontSize: "10px", color: "#999", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
        t.appendChild(d);
    }

    /** Clic : lecteur ; meme fichier une 2e fois = lecteur ferme. */
    function showFile(path, k) {
        if (preview.isOpen() && shownPath === path) {
            preview.close();
            shownPath = "";
            return;
        }
        shownPath = path;
        preview.show(path, k, path, card);
    }

    function fileTile(path, k, mtime) {
        const t = tileBox();
        const [dir, name] = splitPath(path);
        const pic = dupThumb(dir, name, k, 108);
        pic.title = "Click: preview – drag onto a MiniMax H3 Load Media node";
        makeFileDragSource(pic, path, dragLayer);
        t.appendChild(pic);
        labels(t, name, mtimeText(mtime));
        t.addEventListener("click", () => showFile(path, k));
        return t;
    }

    function rushTile(it, folder) {
        const t = tileBox();
        const gone = !it.file;
        let pic;
        if (gone) {
            pic = document.createElement("div");
            pic.textContent = "Deleted";
            Object.assign(pic.style, {
                width: "108px", height: "71px", borderRadius: "6px", background: "#2b2b2b", color: "#888",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "bold",
            });
        } else {
            const [dir, name] = splitPath(it.file);
            pic = dupThumb(dir, name, it.output.kind, 108);
            addStatusDot(pic, it.output);
            addPostBadge(pic, it.output, it.run.outputs);
            makeDragSource(pic, it.output, dragLayer);
            pic.title = "Click: preview – drag onto a MiniMax H3 Load Media node";
        }
        t.appendChild(pic);
        labels(t, gone ? "Original deleted" : splitPath(it.file)[1], runDateText(it.run.date));
        const n = it.posts.length;
        if (n) {
            const b = makeTextButton("Processing (" + n + ")", VIOLET);
            Object.assign(b.style, { display: "block", width: "100%", marginTop: "4px", padding: "3px 4px", fontSize: "11px" });
            b.title = n + " post-processed version(s) of this original";
            b.addEventListener("click", (e) => {
                e.stopPropagation();
                preview.close();
                shownPath = "";
                procFolder = folder;
                proc.open(it.run, it.output.index, card);
            });
            t.appendChild(b);
        }
        if (!gone) t.addEventListener("click", () => showFile(it.file, it.output.kind));
        return t;
    }

    // ---- Chargement et dessin ----
    async function loadRuns() {
        if (runsFor === projectPath) return;
        const data = await apiGet("/mmproject/runs?project=" + encodeURIComponent(projectPath));
        runs = data.runs || [];
        runsFor = projectPath;
    }

    async function render() {
        const mine = ++seq;
        paintHead();
        body.innerHTML = "";
        if (!projectPath) {
            note.textContent = "Wire the project_used output of a MagicStudio Project node, then choose a project.";
            return;
        }
        const sections = projectSections(kind, mode);
        const secKind = mode === "extract" ? "image" : kind;
        const rushNormal = mode === "normal";
        const needRuns = rushNormal && sections.some((s) => rushFolderOf(s.folder));
        const archives = mode === "archives";
        const bases = sections.filter((s) => !(rushNormal && rushFolderOf(s.folder))).map((s) => sectionQuery(s.folder).base);
        let files = {};
        let mtimes = {};
        let error = "";
        note.textContent = "Loading...";
        try {
            if (needRuns) await loadRuns();
            if (bases.length) {
                const data = await apiGet("/mmproject/folder_files?project=" + encodeURIComponent(projectPath) +
                    "&folders=" + encodeURIComponent(bases.join("|")) + (archives ? "&archives=1" : "") + "&dates=1");
                files = (archives ? data.archives : data.files) || {};
                mtimes = data.mtimes || {};
            }
        } catch (e) {
            error = e.message || String(e);
        }
        if (mine !== seq) return; // un choix plus recent a pris la place
        body.innerHTML = "";
        if (error) {
            note.textContent = error;
            return;
        }
        let total = 0;
        for (const s of sections) {
            const q = sectionQuery(s.folder);
            if (rushNormal && rushFolderOf(s.folder)) {
                const items = rushItems(runs, q.base);
                total += items.length;
                const row = section(s.title, items.length, "empty");
                for (const it of items) row.appendChild(rushTile(it, q.base));
                continue;
            }
            const list = (files[q.base] || []).filter((p) => kindOfName(splitPath(p)[1]) === secKind);
            list.sort((a, b) => (mtimes[b] || 0) - (mtimes[a] || 0)); // plus recent d'abord
            total += list.length;
            const row = section(s.title, list.length, "empty");
            for (const p of list) row.appendChild(fileTile(p, secKind, mtimes[p]));
        }
        note.textContent = total + " file(s) – " + projectName;
    }

    function setMode(m) {
        mode = mode === m ? "normal" : m;
        preview.close();
        proc.close();
        shownPath = "";
        render();
    }

    async function chooseProject(name) {
        projectName = name;
        projectPath = name && rootPath ? projectPathOf(rootPath, name) : "";
        runs = [];
        runsFor = "";
        preview.close();
        proc.close();
        shownPath = "";
        fillSelect();
        await render();
    }

    for (const [k] of PROJECT_KINDS) {
        kindBtns[k].addEventListener("click", () => {
            kind = k;
            writeStore(KIND_KEY, k);
            if (mode === "extract") mode = "normal"; // Extract Frames ne depend pas du type : un type choisi en sort
            preview.close();
            proc.close();
            shownPath = "";
            render();
        });
    }
    archivesBtn.addEventListener("click", () => setMode("archives"));
    extractBtn.addEventListener("click", () => setMode("extract"));
    select.addEventListener("change", () => chooseProject(select.value));

    function close() {
        preview.close();
        proc.close();
        shownPath = "";
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
        body.innerHTML = "";
    }
    // Echap : le lecteur d'abord (celui de Processing ensuite avec l'arbre), puis la fenetre.
    function onKey(e) {
        if (e.key !== "Escape" || !isOpen()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (preview.isOpen()) {
            preview.close();
            shownPath = "";
        } else if (proc.isOpen()) proc.close();
        else close();
    }
    // Close ferme tout d'un clic.
    closeBtn.addEventListener("click", close);

    paintHead();
    return {
        isOpen,
        close,
        /** open({name, path}, ancre) : projet relie par defaut ; a droite de l'ancre (le noeud) s'il y a la place. */
        async open(info, anchor) {
            if (isOpen()) return;
            projectName = (info && info.name) || "";
            projectPath = (info && info.path) || "";
            rootPath = rootOfPath(projectPath, projectName);
            runs = [];
            runsFor = "";
            mode = "normal";
            overlay.style.display = "block";
            overlay.style.pointerEvents = "none";
            const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
            const w = card.offsetWidth || 860;
            const h = card.offsetHeight || 520;
            let left = Math.max(8, (window.innerWidth - w) / 2);
            let top = Math.max(8, (window.innerHeight - h) / 2);
            if (r && r.right + 12 + w <= window.innerWidth) {
                left = r.right + 12;
                top = Math.max(8, Math.min(r.top, window.innerHeight - h - 8));
            }
            card.style.left = left + "px";
            card.style.top = top + "px";
            window.addEventListener("keydown", onKey, true);
            // Liste des projets : celle du noeud Project si elle est donnee, sinon le serveur.
            try {
                const given = ops.getProjectList ? ops.getProjectList() : null;
                if (given && given.tree) {
                    tree = given.tree;
                    if (given.root) rootPath = given.root;
                } else {
                    const data = await apiGet("/mmproject/list?root=" + encodeURIComponent(rootPath));
                    tree = data.tree || [];
                    if (data.root) rootPath = data.root;
                }
            } catch (e) {
                tree = [];
            }
            fillSelect();
            await render();
        },
    };
}
