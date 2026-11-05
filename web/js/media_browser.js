// Fenetre "Folder" de MedLoad : dossiers input / output de ComfyUI, medias seulement.
// Meme presentation que la fenetre de SelectMod (arbre, tableau Name / Size / Modified).
// Modules charges une seule fois par le navigateur : importer project_node.js d'ici est sans risque.
import { makeOverlay, apiGet, TITLE_COLOR, INACTIVE_BG, ORANGE, GREEN } from "./minimax_ref_loader.js";
import { buildPreviewWindow, blockStrayDrop } from "./project_node.js";
import { STAR_GOLD, STAR_TIP, starSetOf, isStarred } from "./compare_pure.js";
import { dragLink } from "./post_tree.js";
import { sizeText, matchesSearch } from "./select_mod.js";
import { sortMedia, kindFilter, KINDS, lockedKinds, lockTip } from "./media_browser_pure.js";

const KIND_KEY = "mmloadmedia.folderKind";
const DIR_KEY = "mmloadmedia.folderDir";
const KIND_LABELS = { all: "All", video: "Video", image: "Image", audio: "Son" };
const normKey = (p) => String(p || "").replace(/[\\/]+/g, "/").replace(/\/$/, "").toLowerCase();

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

/**
 * buildFolderWindow(container, ops) -> {open(anchor), close(), isOpen()}
 * ops (tout facultatif ; MedLoad passe {} : clic = lecteur) :
 *   onPick(path, kind) : appele a chaque clic sur un fichier ;
 *   pickOnly : le clic appelle seulement onPick (pas de lecteur), la fenetre reste ouverte (Compare) ;
 *   kindLock() -> "" | "image" | "video" : type impose, les autres boutons de type sont grises.
 * Renvoie aussi relock() : relit kindLock() et redessine (cote ou type impose change).
 */
export function buildFolderWindow(container, ops = {}) {
    const { overlay, card } = makeOverlay();
    // Fond sans blocage : le workflow reste utilisable et le depot atteint le noeud derriere.
    overlay.style.pointerEvents = "none";
    card.style.pointerEvents = "auto";
    Object.assign(card.style, {
        width: "min(760px, 94vw)", height: "min(520px, 84vh)", background: "#161616", border: "1px solid " + TITLE_COLOR,
        display: "flex", flexDirection: "column", overflow: "hidden",
    });
    const preview = buildPreviewWindow();

    // En-tete : type, recherche, relire.
    const head = document.createElement("div");
    Object.assign(head.style, { display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderBottom: "1px solid #2a2a2a" });
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
    const kindBtns = {};
    const kindBox = document.createElement("div");
    Object.assign(kindBox.style, { display: "flex", gap: "4px", flex: "0 0 auto" });
    for (const k of KINDS) {
        kindBtns[k] = mkBtn(KIND_LABELS[k], k === "all" ? "Show all media files" : "Show " + KIND_LABELS[k].toLowerCase() + " files only");
        kindBox.appendChild(kindBtns[k]);
    }
    const searchLabel = document.createElement("div");
    searchLabel.textContent = "Search file :";
    Object.assign(searchLabel.style, { fontWeight: "bold", color: TITLE_COLOR, flex: "0 0 auto" });
    const search = document.createElement("input");
    search.type = "text";
    search.placeholder = "Search in this folder...";
    Object.assign(search.style, {
        flex: "1", minWidth: "0", background: "#0b0b0b", color: "#ddd", border: "1px solid #0c3833", borderRadius: "4px",
        padding: "4px 8px", fontSize: "12px",
    });
    const reloadBtn = mkBtn("↺", "Read the folders again");
    head.append(kindBox, searchLabel, search, reloadBtn);

    const body = document.createElement("div");
    Object.assign(body.style, { flex: "1", display: "flex", minHeight: "0" });
    const treeBox = document.createElement("div");
    Object.assign(treeBox.style, { width: "34%", overflow: "auto", borderRight: "1px solid #2a2a2a", padding: "6px 4px" });
    const right = document.createElement("div");
    Object.assign(right.style, { flex: "1", display: "flex", flexDirection: "column", minWidth: "0" });
    const table = document.createElement("div");
    Object.assign(table.style, { flex: "1", overflow: "auto" });
    const note = document.createElement("div");
    Object.assign(note.style, { padding: "4px 8px", color: "#999", fontSize: "11px", minHeight: "14px" });
    right.append(table, note);
    body.append(treeBox, right);

    const footRow = document.createElement("div");
    Object.assign(footRow.style, { display: "flex", alignItems: "center", gap: "10px", padding: "6px 10px", borderTop: "1px solid #2a2a2a" });
    const foot = document.createElement("div");
    Object.assign(foot.style, {
        flex: "1", minWidth: "0", color: "#9fd6cf", fontFamily: "monospace", fontSize: "11px",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minHeight: "14px",
    });
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "Close";
    closeBtn.title = "Close the window";
    Object.assign(closeBtn.style, {
        background: ORANGE, color: "#fff", border: "none", borderRadius: "6px", padding: "6px 22px",
        fontSize: "13px", fontWeight: "bold", cursor: "pointer", flex: "0 0 auto",
    });
    footRow.append(foot, closeBtn);
    card.append(head, body, footRow);

    let roots = [];
    let rootsError = ""; // erreur de /mmmedia/roots, gardee visible
    let current = "";
    let files = []; // tous les types du dossier (ou de la recherche) ; le filtre de type s'applique a l'affichage
    // Cle du type retenu : ops.kindKey (fenetres du Compare), sinon celle de MedLoad.
    const kindKey = ops.kindKey || KIND_KEY;
    let kind = readStore(kindKey, "all");
    if (!KINDS.includes(kind)) kind = "all";
    let sortKey = "name";
    let sortDir = "asc";
    let truncated = false;
    let searchSeq = 0;
    let shownPath = ""; // fichier dans le lecteur
    const expanded = new Set();
    const children = new Map();

    // Type impose (Compare) : le type actif suit, les autres boutons sont grises (rien n'est retenu).
    const lockNow = () => lockedKinds(KINDS, ops.kindLock ? ops.kindLock() : "");
    function paintKinds() {
        const lk = lockNow();
        if (lk.active) kind = lk.active;
        for (const k of KINDS) {
            const on = k === kind;
            const off = lk.off.includes(k);
            kindBtns[k].style.background = on ? GREEN : INACTIVE_BG;
            kindBtns[k].style.color = on ? "#fff" : "#ddd";
            kindBtns[k].style.opacity = off ? "0.4" : "1";
            kindBtns[k].style.cursor = off ? "default" : "pointer";
            kindBtns[k].title = off ? lockTip(lk.active)
                : k === "all" ? "Show all media files" : "Show " + KIND_LABELS[k].toLowerCase() + " files only";
        }
    }

    async function childrenOf(path) {
        if (!children.has(normKey(path))) {
            const data = await apiGet("/mmmedia/tree?path=" + encodeURIComponent(path));
            children.set(normKey(path), data.dirs || []);
        }
        return children.get(normKey(path));
    }

    function treeRow(label, path, count, depth, hasChildren) {
        const row = document.createElement("div");
        const isOpen = expanded.has(normKey(path));
        const active = normKey(path) === normKey(current);
        Object.assign(row.style, {
            display: "flex", alignItems: "center", gap: "4px", padding: "3px 4px 3px " + (4 + depth * 14) + "px",
            borderRadius: "4px", cursor: "pointer", whiteSpace: "nowrap", background: active ? "#145048" : "transparent",
        });
        const arrow = document.createElement("span");
        arrow.textContent = hasChildren ? (isOpen ? "▾" : "▸") : "";
        Object.assign(arrow.style, { width: "12px", flex: "0 0 12px", color: "#9fd6cf" });
        const name = document.createElement("span");
        name.textContent = label;
        Object.assign(name.style, { overflow: "hidden", textOverflow: "ellipsis" });
        row.append(arrow, name);
        if (count !== null && count !== undefined) {
            const c = document.createElement("span");
            c.textContent = "(" + count + ")";
            Object.assign(c.style, { color: "#888", fontSize: "11px" });
            row.appendChild(c);
        }
        row.title = path;
        arrow.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!hasChildren) return;
            if (isOpen) expanded.delete(normKey(path));
            else expanded.add(normKey(path));
            await renderTree();
        });
        row.addEventListener("click", async () => {
            expanded.add(normKey(path));
            await choose(path);
        });
        return row;
    }

    async function renderTree(showCurrent) {
        const scroll = treeBox.scrollTop;
        const out = [];
        async function walk(dirs, depth) {
            for (const d of dirs) {
                out.push(treeRow(d.name, d.path, d.count, depth, d.has_children));
                if (d.has_children && expanded.has(normKey(d.path))) {
                    try {
                        await walk(await childrenOf(d.path), depth + 1);
                    } catch (e) {
                        // dossier refuse ou illisible : pas de sous-dossiers montres
                    }
                }
            }
        }
        for (const r of roots) {
            out.push(treeRow(r.label, r.path, null, 0, true));
            if (expanded.has(normKey(r.path))) {
                try {
                    await walk(await childrenOf(r.path), 1);
                } catch (e) {
                    // racine illisible
                }
            }
        }
        treeBox.innerHTML = "";
        treeBox.append(...out);
        treeBox.scrollTop = scroll;
        if (showCurrent) {
            const row = out.find((r) => normKey(r.title) === normKey(current));
            if (row) row.scrollIntoView({ block: "nearest" });
        }
    }

    function header(label, col) {
        const h = document.createElement("div");
        h.textContent = label + (sortKey === col ? (sortDir === "asc" ? " ▲" : " ▼") : "");
        Object.assign(h.style, { cursor: "pointer", color: "#9fd6cf", fontWeight: "bold" });
        h.title = "Sort by " + label.toLowerCase();
        h.addEventListener("click", () => {
            sortDir = sortKey === col && sortDir === "asc" ? "desc" : "asc";
            sortKey = col;
            renderTable();
        });
        return h;
    }

    const GRID = "minmax(0, 1fr) 80px 120px";
    let starSet = new Set(); // fichiers etoiles du projet du dossier courant (une lecture par chargement)

    /** Clic sur un nom : lecteur a cote ; meme fichier une 2e fois = lecteur ferme (pickOnly : onPick seul). */
    function showFile(f) {
        if (ops.onPick) ops.onPick(f.path, f.kind);
        if (ops.pickOnly) return;
        if (preview.isOpen() && shownPath === f.path) {
            preview.close();
            shownPath = "";
            return;
        }
        shownPath = f.path;
        preview.show(f.path, f.kind, f.path, card);
    }

    /** Glisser un nom : lien vers MedLoad ; la couche laisse passer le depot, un depot ailleurs ne change rien. */
    function makeDrag(row, f) {
        row.draggable = true;
        let dragging = false;
        row.addEventListener("dragstart", (e) => {
            if (e.dataTransfer) {
                e.dataTransfer.setData("text/uri-list", dragLink(f.path, location.origin));
                e.dataTransfer.effectAllowed = "copy";
            }
            dragging = true;
            window.addEventListener("drop", blockStrayDrop, true);
            // Chrome annule un glisser si un style change tout de suite : on attend la fin de l'evenement.
            setTimeout(() => {
                if (dragging) overlay.style.pointerEvents = "none";
            }, 0);
        });
        row.addEventListener("dragend", () => {
            dragging = false;
            window.removeEventListener("drop", blockStrayDrop, true);
            overlay.style.pointerEvents = "none"; // etat normal de la couche : le fond ne bloque rien
        });
    }

    function renderTable() {
        table.innerHTML = "";
        const head2 = document.createElement("div");
        Object.assign(head2.style, {
            display: "grid", gridTemplateColumns: GRID, gap: "8px", padding: "6px 8px", position: "sticky", top: "0",
            background: "#161616", borderBottom: "1px solid #2a2a2a",
        });
        head2.append(header("Name", "name"), header("Size", "size"), header("Modified", "mtime"));
        table.appendChild(head2);
        const shown = sortMedia(kindFilter(files, kind), sortKey, sortDir);
        for (const f of shown) {
            const row = document.createElement("div");
            Object.assign(row.style, {
                display: "grid", gridTemplateColumns: GRID, gap: "8px", padding: "4px 8px", cursor: "pointer", borderRadius: "4px",
            });
            const name = document.createElement("div");
            name.textContent = f.name;
            name.title = f.name;
            Object.assign(name.style, { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
            if (isStarred(starSet, f.path)) {
                // ★ doree avant le nom (plan Compare, tache 8)
                const star = document.createElement("span");
                star.textContent = "★ ";
                Object.assign(star.style, { color: STAR_GOLD });
                star.title = STAR_TIP;
                name.prepend(star);
            }
            const size = document.createElement("div");
            size.textContent = sizeText(f.size);
            size.style.color = "#aaa";
            const date = document.createElement("div");
            date.textContent = new Date(f.mtime * 1000).toLocaleString(undefined, {
                year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
            });
            date.style.color = "#aaa";
            row.append(name, size, date);
            row.addEventListener("mouseenter", () => {
                row.style.background = "#1f2a29";
                foot.textContent = f.path;
            });
            row.addEventListener("mouseleave", () => {
                row.style.background = "transparent";
            });
            row.addEventListener("click", () => showFile(f));
            makeDrag(row, f);
            table.appendChild(row);
        }
        if (!shown.length) {
            const d = document.createElement("div");
            d.textContent = search.value.trim() ? "No file matches the search." : "No media file in this folder.";
            Object.assign(d.style, { color: "#888", padding: "16px 8px" });
            table.appendChild(d);
        }
        const q = search.value.trim();
        note.textContent = q ? shown.length + " file(s) found" + (truncated ? " (first results only: refine the search)" : "") + "."
            : shown.length + " file(s).";
    }

    async function loadFiles() {
        const q = search.value.trim();
        const seq = ++searchSeq;
        note.textContent = q ? "Searching..." : "";
        truncated = false;
        try {
            if (q) {
                const data = await apiGet("/mmmedia/search?path=" + encodeURIComponent(current) + "&q=" + encodeURIComponent(q) + "&kind=all");
                if (seq !== searchSeq) return;
                files = (data.files || []).filter((f) => matchesSearch(f.name, q));
                truncated = !!data.truncated;
            } else {
                const data = await apiGet("/mmmedia/files?path=" + encodeURIComponent(current) + "&kind=all");
                if (seq !== searchSeq) return;
                files = data.files || [];
            }
        } catch (e) {
            if (seq !== searchSeq) return;
            files = [];
            renderTable();
            note.textContent = e.message;
            return;
        }
        // Etoiles : seulement utiles dans un projet (project vide sinon) ; une erreur = pas d'etoile.
        let stars = new Set();
        try {
            const r = await apiGet("/mmproject/stars?path=" + encodeURIComponent(current));
            if (r && r.project) stars = starSetOf(r.stars);
        } catch (e) {
            stars = new Set();
        }
        if (seq !== searchSeq) return;
        starSet = stars;
        renderTable();
    }

    async function choose(path) {
        current = path;
        writeStore(DIR_KEY, path);
        await renderTree(true);
        await loadFiles();
    }

    async function load() {
        children.clear();
        rootsError = "";
        try {
            roots = ((await apiGet("/mmmedia/roots")).roots) || [];
        } catch (e) {
            roots = [];
            rootsError = e.message;
        }
        if (!roots.length) {
            current = "";
            files = [];
            await renderTree();
            renderTable();
            if (rootsError) note.textContent = rootsError;
            return;
        }
        for (const r of roots) expanded.add(normKey(r.path));
        // Dernier dossier retenu s'il est encore sous une racine, sinon la premiere racine.
        const last = current || readStore(DIR_KEY, "");
        const under = (r) => normKey(last) === normKey(r.path) || normKey(last).startsWith(normKey(r.path) + "/");
        const root = last ? roots.find(under) : null;
        current = root ? last : roots[0].path;
        if (root) {
            // dossiers parents ouverts, pour voir le dossier retenu dans l'arbre
            const sep = root.path.includes("\\") ? "\\" : "/";
            let acc = root.path.replace(/[\\/]+$/, "");
            for (const p of current.slice(root.path.length).split(/[\\/]+/).filter(Boolean)) {
                acc += sep + p;
                expanded.add(normKey(acc));
            }
        }
        await choose(current);
    }

    // Type, recherche, relire.
    for (const k of KINDS) {
        kindBtns[k].addEventListener("click", () => {
            if (lockNow().off.includes(k)) return; // type grise par la comparaison
            kind = k;
            writeStore(kindKey, k);
            paintKinds();
            renderTable();
        });
    }
    let searchTimer = 0;
    search.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(loadFiles, 250);
    });
    reloadBtn.addEventListener("click", () => load());

    function isOpen() {
        return overlay.style.display !== "none";
    }

    function close() {
        preview.close();
        shownPath = "";
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
    }

    // Echap : le lecteur d'abord, puis la fenetre.
    function onKey(e) {
        if (e.key !== "Escape" || !isOpen()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (preview.isOpen()) {
            preview.close();
            shownPath = "";
        } else close();
    }
    // Close ferme tout d'un clic (close() ferme aussi le lecteur) ; seul Echap passe par le lecteur d'abord.
    closeBtn.addEventListener("click", close);

    paintKinds();
    return {
        isOpen,
        close,
        /** Type impose relu (Compare : cote ou premier fichier change) ; tableau redessine. */
        relock() {
            paintKinds();
            if (isOpen()) renderTable();
        },
        /** Detruit la fenetre (couche dans document.body) : appele quand le noeud est supprime. */
        remove() {
            close();
            preview.remove(); // lecteur aussi retire de la page
            overlay.remove();
        },
        /** open(ancre) : a droite de l'element donne (le noeud) s'il y a la place, sinon au centre. */
        open(anchor) {
            if (isOpen()) return;
            overlay.style.display = "block";
            overlay.style.pointerEvents = "none";
            const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
            const w = card.offsetWidth || 760;
            const h = card.offsetHeight || 440;
            let left = Math.max(8, (window.innerWidth - w) / 2);
            let top = Math.max(8, (window.innerHeight - h) / 2);
            if (r && r.right + 12 + w <= window.innerWidth) {
                left = r.right + 12;
                top = Math.max(8, Math.min(r.top, window.innerHeight - h - 8));
            }
            card.style.left = left + "px";
            card.style.top = top + "px";
            window.addEventListener("keydown", onKey, true);
            paintKinds();
            load();
        },
    };
}
