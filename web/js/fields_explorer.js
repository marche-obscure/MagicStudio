// MagicStudio SelectMod (22/11/2026) : explorateur des fichiers de champs (Export / Import / dossier
// par defaut). Allure reprise de la fenetre Folder de MedLoad (media_browser.js, non modifie) :
// arbre a gauche, tableau Name / Size / Modified, chemin en bas, Close orange.
// Calque bloquant pose sur document.body : independant du noeud (classique et Node 2.0).
import { makeOverlay, TITLE_COLOR, INACTIVE_BG, ORANGE, GREEN } from "./minimax_ref_loader.js";
import { sortFiles, sizeText, matchesSearch, defaultSaveName, checkSaveName, explorerStart } from "./select_mod.js";

export const EXPLORER_DIR_KEY = "mmselectmod.explorerDir";
const SORT_KEY = "mmselectmod.explorerSort";
const SORT_COLUMNS = ["name", "size", "mtime"];
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

/** Dernier dossier utilise par l'explorateur ("" si aucun). */
export function lastExplorerDir() {
    return readStore(EXPLORER_DIR_KEY, "");
}

/** Dernier dossier retenu sous une autre cle (storeKey d'un autre noeud), "" si aucun. */
export function storedDir(key) {
    return readStore(key, "");
}

/**
 * Appel des routes /mmselectmod/fs/* : renvoie le JSON, sinon Error avec status, data et
 * remote (403 {remote: true} : ComfyUI ouvert au reseau, explorateur refuse).
 * apiGet de minimax_ref_loader.js ne garde que le message : on lit la reponse nous-memes.
 */
async function fsCall(url, body) {
    const init = body === undefined ? { cache: "no-store" }
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    const res = await fetch(url, init);
    let data = null;
    try {
        data = await res.json();
    } catch (e) {
        data = null;
    }
    if (!res.ok) {
        const err = new Error((data && data.error) || "HTTP error " + res.status);
        err.status = res.status;
        err.data = data || {};
        err.remote = !!(data && data.remote);
        throw err;
    }
    return data;
}

/** Chemin d'un fichier dans un dossier (disque "G:\" compris, sans separateur double). */
function joinPath(folder, name) {
    const sep = folder.includes("\\") || !folder.includes("/") ? "\\" : "/";
    return folder.replace(/[\\/]+$/, "") + sep + name;
}

/**
 * buildFieldsExplorer() -> {open(opts), close(), isOpen(), remove()} ; une instance par noeud.
 * opts = {mode: "save" | "open" | "folder", start, defaultFolder, content?, onDone(result)}
 *   save   : bandeau = nom, Save ecrit opts.content dans le dossier ouvert -> onDone({path}) ;
 *   open   : bandeau = recherche, Load (ou double-clic) lit le fichier -> onDone({text, name, path}) ;
 *            si onDone leve une erreur (fichier d'un autre format), son message s'affiche et la fenetre reste ;
 *   folder : bandeau = recherche, Select folder -> onDone({path}) (dossier ouvert).
 * start vide : dossier par defaut, sinon dernier dossier (explorerStart), sinon les disques.
 * Options pour les autres noeuds (23/11/2026, choix d'un dossier dans RefLoader / Project, a la place
 * de la boite Windows) : kind = fichiers listes ("media" : images, videos, sons montres pour
 * information) ; storeKey = cle localStorage du dernier dossier (defaut EXPLORER_DIR_KEY, celle de SelectMod).
 * Save / Load du RefLoader (23/11/2026) : saveName = nom propose, writeKind = type ecrit par /fs/write
 * ("refloader" ; defaut "fields"), saveTip = infobulle de Save, emptyText = message d'un dossier sans fichier.
 */
export function buildFieldsExplorer() {
    const { overlay, card } = makeOverlay();
    // Calque bloquant, au-dessus de la fenetre « Save folder » (10001).
    overlay.style.zIndex = "10002";
    Object.assign(card.style, {
        width: "min(760px, 94vw)", height: "min(520px, 84vh)", background: "#161616", border: "1px solid " + TITLE_COLOR,
        display: "flex", flexDirection: "column", overflow: "hidden",
    });

    const mkBtn = (text, tip) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.title = tip;
        Object.assign(b.style, {
            background: INACTIVE_BG, color: "#ddd", border: "none", borderRadius: "4px", padding: "3px 9px",
            cursor: "pointer", fontSize: "12px", flex: "0 0 auto",
        });
        return b;
    };

    // En-tete : libelle, champ (nom ou recherche), bouton vert, relire.
    const head = document.createElement("div");
    Object.assign(head.style, { display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderBottom: "1px solid #2a2a2a" });
    const label = document.createElement("div");
    Object.assign(label.style, { fontWeight: "bold", color: TITLE_COLOR, flex: "0 0 auto" });
    const field = document.createElement("input");
    field.type = "text";
    Object.assign(field.style, {
        flex: "1", minWidth: "0", background: "#0b0b0b", color: "#ddd", border: "1px solid #0c3833", borderRadius: "4px",
        padding: "4px 8px", fontSize: "12px",
    });
    const mainBtn = mkBtn("Save", "");
    Object.assign(mainBtn.style, { background: GREEN, color: "#fff", fontWeight: "bold", padding: "4px 14px" });
    const reloadBtn = mkBtn("↺", "Read the folder again");
    head.append(label, field, mainBtn, reloadBtn);

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

    // Message du serveur quand l'explorateur est refuse (acces depuis le reseau) : remplace le contenu.
    const remoteBox = document.createElement("div");
    Object.assign(remoteBox.style, {
        flex: "1", display: "none", alignItems: "center", justifyContent: "center", padding: "24px",
        color: ORANGE, fontSize: "14px", textAlign: "center",
    });

    const footRow = document.createElement("div");
    Object.assign(footRow.style, { display: "flex", alignItems: "center", gap: "10px", padding: "6px 10px", borderTop: "1px solid #2a2a2a" });
    const footText = document.createElement("div");
    Object.assign(footText.style, { flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" });
    const foot = document.createElement("div");
    Object.assign(foot.style, {
        color: "#9fd6cf", fontFamily: "monospace", fontSize: "11px",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minHeight: "14px",
    });
    const msg = document.createElement("div");
    Object.assign(msg.style, {
        color: ORANGE, fontSize: "11px", minHeight: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    });
    footText.append(foot, msg);
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "Close";
    closeBtn.title = "Close the window";
    Object.assign(closeBtn.style, {
        background: ORANGE, color: "#fff", border: "none", borderRadius: "6px", padding: "6px 22px",
        fontSize: "13px", fontWeight: "bold", cursor: "pointer", flex: "0 0 auto",
    });
    footRow.append(footText, closeBtn);

    // Petite confirmation « Replace <nom> ? » dans la fenetre.
    const askLayer = document.createElement("div");
    Object.assign(askLayer.style, {
        position: "absolute", inset: "0", background: "rgba(0,0,0,0.55)", display: "none",
        alignItems: "center", justifyContent: "center", zIndex: "1",
    });
    const askCard = document.createElement("div");
    Object.assign(askCard.style, {
        background: "#1e1e1e", border: "1px solid " + ORANGE, borderRadius: "8px", padding: "14px 16px",
        maxWidth: "80%", display: "flex", flexDirection: "column", gap: "12px",
    });
    const askText = document.createElement("div");
    Object.assign(askText.style, { color: "#e6e6e6", fontSize: "13px", wordBreak: "break-all" });
    const askBtns = document.createElement("div");
    Object.assign(askBtns.style, { display: "flex", gap: "8px", justifyContent: "flex-end" });
    const cancelAsk = mkBtn("Cancel", "Keep the existing file");
    const replaceBtn = mkBtn("Replace", "Write over the existing file");
    Object.assign(replaceBtn.style, { background: ORANGE, color: "#fff", fontWeight: "bold" });
    askBtns.append(cancelAsk, replaceBtn);
    askCard.append(askText, askBtns);
    askLayer.appendChild(askCard);

    card.append(head, body, remoteBox, footRow, askLayer);

    let opts = null;
    let mode = "save";
    let drives = [];
    let current = ""; // dossier ouvert ("" = liste des disques)
    let files = [];
    let selected = null; // fichier choisi (open)
    let busy = false;
    let openSeq = 0; // une ouverture plus recente annule les lectures en cours
    let askResolve = null;
    const listings = new Map(); // normKey(dossier) -> reponse de /fs/list
    const expanded = new Set();
    // Dernier dossier : cle propre a l'appelant, pour ne pas changer celui de SelectMod.
    const dirKey = () => (opts && opts.storeKey) || EXPLORER_DIR_KEY;
    let [sortKey, sortDir] = readStore(SORT_KEY, "name:asc").split(":");
    if (!SORT_COLUMNS.includes(sortKey)) sortKey = "name";
    if (sortDir !== "desc") sortDir = "asc";

    function setMsg(text) {
        msg.textContent = text || "";
        msg.title = text || "";
    }

    function showRemote(text) {
        head.style.display = "none";
        body.style.display = "none";
        remoteBox.style.display = "flex";
        remoteBox.textContent = text || "Only available on the computer running ComfyUI.";
        foot.textContent = "";
        setMsg("");
    }

    /** Erreur d'une route : 403 remote = message du serveur a la place du contenu, sinon message orange. */
    function report(e) {
        if (e && e.remote) showRemote(e.message);
        else setMsg(e ? e.message : "");
    }

    async function listing(path) {
        const key = normKey(path);
        if (!listings.has(key)) {
            const data = await fsCall("/mmselectmod/fs/list?path=" + encodeURIComponent(path) + "&kind=" + ((opts && opts.kind) || mode));
            listings.set(key, data);
            if (normKey(data.path) !== key) listings.set(normKey(data.path), data);
        }
        return listings.get(key);
    }

    function paintFoot() {
        if (mode === "save") {
            const c = checkSaveName(field.value);
            foot.textContent = current ? joinPath(current, c.name || field.value.trim()) : "";
        } else if (mode === "open" && selected) {
            foot.textContent = selected.path;
        } else {
            foot.textContent = current;
        }
        foot.title = foot.textContent;
    }

    function paintMain() {
        const off = busy || (mode === "open" && !selected);
        mainBtn.disabled = off;
        mainBtn.style.opacity = off ? "0.45" : "1";
        mainBtn.style.cursor = off ? "default" : "pointer";
    }

    function treeRow(text, path, count, depth, hasChildren) {
        const row = document.createElement("div");
        const isOpen = expanded.has(normKey(path));
        const active = !!current && normKey(path) === normKey(current);
        Object.assign(row.style, {
            display: "flex", alignItems: "center", gap: "4px", padding: "3px 4px 3px " + (4 + depth * 14) + "px",
            borderRadius: "4px", cursor: "pointer", whiteSpace: "nowrap", background: active ? "#145048" : "transparent",
        });
        const arrow = document.createElement("span");
        arrow.textContent = hasChildren ? (isOpen ? "▾" : "▸") : "";
        Object.assign(arrow.style, { width: "12px", flex: "0 0 12px", color: "#9fd6cf" });
        const name = document.createElement("span");
        name.textContent = text;
        Object.assign(name.style, { overflow: "hidden", textOverflow: "ellipsis" });
        row.append(arrow, name);
        if (count !== null && count !== undefined) {
            const c = document.createElement("span");
            c.textContent = "(" + count + ")";
            Object.assign(c.style, { color: "#888", fontSize: "11px" });
            row.appendChild(c);
        }
        row.title = path;
        row.dataset.path = path;
        arrow.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!hasChildren || busy) return;
            if (isOpen) expanded.delete(normKey(path));
            else expanded.add(normKey(path));
            await renderTree();
        });
        row.addEventListener("click", async () => {
            if (busy) return;
            setMsg("");
            expanded.add(normKey(path));
            await choose(path);
        });
        return row;
    }

    /** Arbre : dossier par defaut en tete, puis les disques ; seules les branches ouvertes sont lues. */
    async function renderTree(showCurrent) {
        const seq = openSeq;
        const scroll = treeBox.scrollTop;
        const out = [];
        let remoteErr = null;
        async function walk(path, depth) {
            let data;
            try {
                data = await listing(path);
            } catch (e) {
                if (e.remote) remoteErr = e;
                return; // dossier refuse ou disparu : pas de sous-dossiers montres
            }
            for (const d of data.dirs || []) {
                out.push(treeRow(d.name, d.path, d.count, depth, d.has_dirs));
                if (d.has_dirs && expanded.has(normKey(d.path))) await walk(d.path, depth + 1);
            }
        }
        const def = opts && String(opts.defaultFolder || "").trim();
        if (def) {
            const known = listings.get(normKey(def));
            out.push(treeRow("★ Default folder", def, known ? (known.files || []).length : null, 0, true));
            if (expanded.has(normKey(def))) await walk(def, 1);
        }
        for (const d of drives) {
            out.push(treeRow(d, d, null, 0, true));
            if (expanded.has(normKey(d))) await walk(d, 1);
        }
        if (seq !== openSeq) return;
        if (remoteErr) {
            showRemote(remoteErr.message);
            return;
        }
        treeBox.innerHTML = "";
        treeBox.append(...out);
        treeBox.scrollTop = scroll;
        if (showCurrent && current) {
            const row = out.find((r) => normKey(r.dataset.path) === normKey(current) && r !== out[0])
                || out.find((r) => normKey(r.dataset.path) === normKey(current));
            if (row) row.scrollIntoView({ block: "nearest" });
        }
    }

    function header(text, col) {
        const h = document.createElement("div");
        h.textContent = text + (sortKey === col ? (sortDir === "asc" ? " ▲" : " ▼") : "");
        Object.assign(h.style, { cursor: "pointer", color: "#9fd6cf", fontWeight: "bold" });
        h.title = "Sort by " + text.toLowerCase();
        h.addEventListener("click", () => {
            sortDir = sortKey === col && sortDir === "asc" ? "desc" : "asc";
            sortKey = col;
            writeStore(SORT_KEY, sortKey + ":" + sortDir);
            renderTable();
        });
        return h;
    }

    const GRID = "minmax(0, 1fr) 80px 120px";

    function renderTable() {
        table.innerHTML = "";
        const head2 = document.createElement("div");
        Object.assign(head2.style, {
            display: "grid", gridTemplateColumns: GRID, gap: "8px", padding: "6px 8px", position: "sticky", top: "0",
            background: "#161616", borderBottom: "1px solid #2a2a2a",
        });
        head2.append(header("Name", "name"), header("Size", "size"), header("Modified", "mtime"));
        table.appendChild(head2);
        const q = mode === "save" ? "" : field.value.trim();
        const shown = sortFiles(files.filter((f) => matchesSearch(f.name, q)), sortKey, sortDir === "asc");
        for (const f of shown) {
            const row = document.createElement("div");
            const isSel = selected && selected.path === f.path;
            Object.assign(row.style, {
                display: "grid", gridTemplateColumns: GRID, gap: "8px", padding: "4px 8px", borderRadius: "4px",
                cursor: mode === "folder" ? "default" : "pointer", background: isSel ? "#145048" : "transparent",
            });
            const name = document.createElement("div");
            name.textContent = f.name;
            name.title = f.name;
            // Choix d'un dossier : fichiers montres pour information seulement (plus pales).
            if (mode === "folder") name.style.color = "#aaa";
            Object.assign(name.style, { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
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
                if (!(selected && selected.path === f.path)) row.style.background = "#1f2a29";
            });
            row.addEventListener("mouseleave", () => {
                row.style.background = selected && selected.path === f.path ? "#145048" : "transparent";
            });
            row.addEventListener("click", () => pickFile(f));
            row.addEventListener("dblclick", () => {
                if (mode !== "open") return;
                pickFile(f);
                doLoad();
            });
            table.appendChild(row);
        }
        if (!shown.length) {
            const d = document.createElement("div");
            d.textContent = !current ? "Choose a folder in the tree."
                : q ? "No file matches the search."
                : opts && opts.emptyText ? opts.emptyText
                : opts && opts.kind === "media" ? "No image, video or audio file in this folder." : "No fields file in this folder.";
            Object.assign(d.style, { color: "#888", padding: "16px 8px" });
            table.appendChild(d);
        }
        note.textContent = !current ? "" : q ? shown.length + " file(s) found." : shown.length + " file(s).";
    }

    /** Clic sur un fichier : save = nom dans le bandeau, open = selection, folder = rien. */
    function pickFile(f) {
        if (busy) return;
        if (mode === "save") {
            field.value = f.name.replace(/\.json$/i, "");
            setMsg("");
        } else if (mode === "open") {
            selected = f;
            setMsg("");
            renderTable();
        } else {
            return;
        }
        paintFoot();
        paintMain();
    }

    /** Ouvre un dossier (lecture du serveur) ; faux si introuvable (message laisse a l'appelant). */
    async function choose(path, quiet) {
        const seq = openSeq;
        let data;
        try {
            data = await listing(path);
        } catch (e) {
            if (seq !== openSeq) return false;
            if (e.remote) showRemote(e.message);
            else if (!quiet) setMsg(e.message);
            return false;
        }
        if (seq !== openSeq) return false;
        current = data.path || path;
        files = data.files || [];
        // Fichier choisi oublie s'il n'est plus dans le dossier affiche.
        if (selected && !files.some((f) => normKey(f.path) === normKey(selected.path))) selected = null;
        await renderTree(true);
        renderTable();
        paintFoot();
        paintMain();
        return true;
    }

    /** Deplie les dossiers parents de path depuis son disque (le dossier par defaut reste aussi en tete). */
    function unfold(path) {
        const key = normKey(path);
        const drive = drives.find((d) => {
            const k = normKey(d);
            return key === k || key.startsWith(k + "/") || (k === "" && key.startsWith("/"));
        });
        if (!drive) return;
        expanded.add(normKey(drive));
        const sep = drive.includes("\\") ? "\\" : "/";
        let acc = drive.replace(/[\\/]+$/, "");
        for (const p of path.slice(drive.length).split(/[\\/]+/).filter(Boolean)) {
            acc += sep + p;
            expanded.add(normKey(acc));
        }
    }

    async function openAt(path) {
        if (!path) return false;
        unfold(path);
        return choose(path, true);
    }

    /** Relit tout : disques, dossier ouvert (ou dossier de depart a la premiere ouverture). */
    async function load(first) {
        const seq = openSeq;
        listings.clear();
        try {
            drives = (await fsCall("/mmselectmod/fs/drives")).drives || [];
        } catch (e) {
            if (seq !== openSeq) return;
            drives = [];
            if (e.remote) {
                showRemote(e.message);
                return;
            }
            setMsg(e.message);
        }
        if (seq !== openSeq) return;
        if (!first) {
            const keep = current;
            current = "";
            files = [];
            if (keep && !(await choose(keep, true)) && seq === openSeq && remoteBox.style.display === "none") {
                setMsg("Folder not found: " + keep);
                await renderTree();
                renderTable();
                paintFoot();
            } else if (!keep && seq === openSeq) {
                // ↺ sur la liste des disques : on redessine l'arbre (disques relus).
                await renderTree();
                renderTable();
                paintFoot();
                paintMain();
            }
            return;
        }
        const def = String(opts.defaultFolder || "").trim();
        if (def) expanded.add(normKey(def));
        const start = String(opts.start || "").trim() || explorerStart(def, readStore(dirKey(), ""));
        if (start && (await openAt(start))) return;
        if (seq !== openSeq || remoteBox.style.display !== "none") return;
        if (start) setMsg("Folder not found: " + start);
        const last = readStore(dirKey(), "").trim();
        if (last && normKey(last) !== normKey(start) && (await openAt(last))) return;
        if (seq !== openSeq || remoteBox.style.display !== "none") return;
        current = "";
        files = [];
        await renderTree();
        renderTable();
        paintFoot();
        paintMain();
    }

    function ask(text) {
        askText.textContent = text;
        askLayer.style.display = "flex";
        return new Promise((resolve) => {
            askResolve = resolve;
        });
    }

    function answer(value) {
        askLayer.style.display = "none";
        const r = askResolve;
        askResolve = null;
        if (r) r(value);
    }

    function finish(result) {
        const done = opts && opts.onDone;
        close();
        if (done) done(result);
    }

    async function doSave() {
        if (busy) return;
        setMsg("");
        const c = checkSaveName(field.value);
        if (c.error) return setMsg(c.error);
        if (!current) return setMsg("Choose a folder first.");
        const folder = current;
        // Une reponse arrivee apres fermeture / reouverture est ignoree (seq) ; le fichier etant
        // deja ecrit, on previent quand meme le noeud avec le onDone de cette ouverture.
        const seq = openSeq, done = opts && opts.onDone;
        busy = true;
        paintMain();
        try {
            let replace = false;
            for (;;) {
                try {
                    const data = await fsCall("/mmselectmod/fs/write",
                        { folder, name: c.name, content: (opts && opts.content) || "", replace,
                          kind: (opts && opts.writeKind) || "fields" });
                    writeStore(dirKey(), folder);
                    if (seq !== openSeq) {
                        if (done) done({ path: data.path });
                        return;
                    }
                    busy = false;
                    finish({ path: data.path });
                    return;
                } catch (e) {
                    if (seq !== openSeq) return;
                    if (e.status === 409 && e.data && e.data.exists && !replace) {
                        if (!(await ask("Replace " + c.name + " ?"))) return;
                        replace = true;
                        continue;
                    }
                    report(e);
                    return;
                }
            }
        } finally {
            // Une ouverture plus recente garde son propre etat busy (elle a pu lancer sa propre action).
            if (seq === openSeq) {
                busy = false;
                if (isOpen()) paintMain();
            }
        }
    }

    async function doLoad() {
        if (busy || !selected) return;
        setMsg("");
        const folder = current;
        // Reponse arrivee apres fermeture / reouverture : ignoree (rien n'est rempli).
        const seq = openSeq, done = opts && opts.onDone;
        busy = true;
        paintMain();
        try {
            const data = await fsCall("/mmselectmod/fs/read?path=" + encodeURIComponent(selected.path));
            if (seq !== openSeq) return;
            // onDone analyse le fichier : une erreur (autre format), meme d'un onDone asynchrone,
            // reste affichee ici, fenetre ouverte.
            try {
                if (done) await done(data);
            } catch (e) {
                if (seq === openSeq) setMsg(e.message);
                return;
            }
            writeStore(dirKey(), folder);
            if (seq === openSeq) close();
        } catch (e) {
            if (seq === openSeq) report(e);
        } finally {
            // Une ouverture plus recente garde son propre etat busy (elle a pu lancer sa propre action).
            if (seq === openSeq) {
                busy = false;
                if (isOpen()) paintMain();
            }
        }
    }

    function doSelectFolder() {
        if (busy) return;
        setMsg("");
        if (!current) return setMsg("Choose a folder first.");
        writeStore(dirKey(), current);
        finish({ path: current });
    }

    mainBtn.addEventListener("click", () => {
        if (mode === "save") doSave();
        else if (mode === "open") doLoad();
        else doSelectFolder();
    });
    reloadBtn.addEventListener("click", () => {
        if (busy) return;
        setMsg("");
        load(false);
    });
    field.addEventListener("input", () => {
        if (mode === "save") {
            paintFoot();
            return;
        }
        // Open : le fichier choisi cache par la recherche n'est plus choisi (Load grise).
        if (mode === "open" && selected && !matchesSearch(selected.name, field.value.trim())) {
            selected = null;
            paintFoot();
            paintMain();
        }
        renderTable();
    });
    replaceBtn.addEventListener("click", () => answer(true));
    cancelAsk.addEventListener("click", () => answer(false));
    closeBtn.addEventListener("click", () => close());

    // Fenetre bloquante : aucune touche ne va au canvas (Suppr effacerait le noeud) ; Echap ferme
    // (d'abord la confirmation), Entree dans le nom = Save. La frappe dans les champs reste normale.
    function onKey(e) {
        if (!isOpen()) return;
        if (e.type === "keydown" && e.key === "Escape") {
            e.preventDefault();
            if (askResolve) answer(false);
            else close();
        } else if (e.type === "keydown" && e.key === "Enter" && e.target === field && mode === "save" && !askResolve) {
            e.preventDefault();
            doSave();
        } else if (e.type === "keydown" && (e.ctrlKey || e.metaKey) && !e.altKey && String(e.key).toLowerCase() === "s") {
            // Ctrl / Cmd+S : ni la fenetre "Enregistrer la page" du navigateur, ni la sauvegarde du workflow.
            e.preventDefault();
        }
        e.stopImmediatePropagation();
    }

    function isOpen() {
        return overlay.style.display !== "none";
    }

    function close() {
        if (askResolve) answer(false);
        openSeq++;
        overlay.style.display = "none";
        window.removeEventListener("keydown", onKey, true);
        window.removeEventListener("keyup", onKey, true);
        window.removeEventListener("keypress", onKey, true);
    }

    return {
        overlay,
        isOpen,
        close,
        /** Detruit la fenetre (couche dans document.body) : a appeler quand le noeud est supprime. */
        remove() {
            close();
            overlay.remove();
        },
        open(o) {
            if (isOpen()) close();
            opts = o || {};
            mode = ["save", "open", "folder"].includes(opts.mode) ? opts.mode : "save";
            openSeq++;
            current = "";
            files = [];
            selected = null;
            busy = false;
            listings.clear();
            expanded.clear();
            setMsg("");
            head.style.display = "flex";
            body.style.display = "flex";
            remoteBox.style.display = "none";
            askLayer.style.display = "none";
            if (mode === "save") {
                label.textContent = "Name :";
                field.placeholder = "Name of the file";
                field.value = opts.saveName || defaultSaveName(new Date());
                mainBtn.textContent = "Save";
                mainBtn.title = opts.saveTip || "Save the fields in the open folder (.json added)";
            } else {
                label.textContent = "Search file :";
                field.placeholder = "Search in this folder...";
                field.value = "";
                mainBtn.textContent = mode === "open" ? "Load" : "Select folder";
                mainBtn.title = mode === "open" ? "Load the selected file" : "Use the open folder";
            }
            treeBox.innerHTML = "";
            renderTable();
            paintFoot();
            paintMain();
            overlay.style.display = "block";
            const w = card.offsetWidth || 760;
            const h = card.offsetHeight || 520;
            card.style.left = Math.max(8, (window.innerWidth - w) / 2) + "px";
            card.style.top = Math.max(8, (window.innerHeight - h) / 2) + "px";
            window.addEventListener("keydown", onKey, true);
            window.addEventListener("keyup", onKey, true);
            window.addEventListener("keypress", onKey, true);
            setTimeout(() => {
                if (!isOpen()) return;
                field.focus();
                if (mode === "save") field.select();
            }, 0);
            load(true);
        },
    };
}

// --------------------------------------------------------------------
// Choix d'un dossier dans RefLoader et Project (23/11/2026, choix utilisateur) : remplace la boite
// Windows « Rechercher un dossier » (route /mmrefloader/browse_dir retiree). Meme fenetre que
// l'Import de SelectMod, en mode dossier, images / videos / sons montres pour information.
// --------------------------------------------------------------------
export const PICK_DIR_KEY = "mmrefloader.pickDir";
let folderPicker = null;

/**
 * Ouvre l'explorateur sur start (sinon le dernier dossier choisi, sinon les disques) ;
 * onPick(chemin) quand l'utilisateur clique Select folder (rien si la fenetre est fermee).
 */
export function pickFolder(start, onPick) {
    if (!folderPicker) {
        folderPicker = buildFieldsExplorer();
        // Au-dessus des fenetres qui ont un bouton dossier (jusqu'a 10004).
        folderPicker.overlay.style.zIndex = "10010";
    }
    folderPicker.open({
        mode: "folder", kind: "media", start: String(start || "").trim(), storeKey: PICK_DIR_KEY,
        onDone: (r) => r && r.path && onPick(r.path),
    });
}
