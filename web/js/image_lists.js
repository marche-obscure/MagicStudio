// Archives des listes d'images du modele Image (fenetres Archive et Lists du RefLoader).
// Les fichiers vivent dans <projet>/99.Project-Config/Image-Lists (routes /mmproject/image_lists*).
// Les imports de minimax_ref_loader.js ne servent qu'a l'appel (pas a l'evaluation du module).
import {
    makeOverlay, makeTextButton, apiGet, escapeHtml, positionCardNextToNode, buildConfirmDialog,
    ORANGE, MARK_RED, GREEN, INACTIVE_BG, INACTIVE_FG, TITLE_COLOR, VIOLET, THUMB_REVALIDATE,
} from "./minimax_ref_loader.js";
import { archiveRows, loadPlan, splitPath, imagesOfState, withImages, MAX_IMAGES } from "./image_lists_pure.js";

const THUMB = 44;

async function postJson(url, body) {
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

/** Bande de vignettes ; les images manquantes sont un carre rouge barre. */
function thumbStrip(images, missing) {
    const gone = new Set(missing || []);
    const strip = document.createElement("div");
    Object.assign(strip.style, { display: "flex", gap: "4px", overflowX: "auto", padding: "2px 0" });
    for (const p of images) {
        const box = document.createElement("div");
        Object.assign(box.style, {
            flex: "0 0 auto", width: THUMB + "px", height: THUMB + "px", borderRadius: "4px", overflow: "hidden",
            background: "#111", boxSizing: "border-box", border: "1px solid " + (gone.has(p) ? ORANGE : "#333"),
        });
        box.title = p;
        if (gone.has(p)) {
            box.textContent = "✕";
            Object.assign(box.style, { color: ORANGE, display: "flex", alignItems: "center", justifyContent: "center" });
        } else {
            const { dir, name } = splitPath(p);
            const img = document.createElement("img");
            img.loading = "lazy";
            img.src = "/mmrefloader/thumb?path=" + encodeURIComponent(dir) + "&file=" + encodeURIComponent(name) +
                THUMB_REVALIDATE;
            Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover", display: "block" });
            box.appendChild(img);
        }
        strip.appendChild(box);
    }
    return strip;
}

/**
 * ctx : getState(), setState(s), getProject() -> {name, path} | null, notify(texte, titre, couleur).
 * Renvoie { archive(anchor), open(anchor), close(), remove() }.
 */
export function buildImageLists(container, ctx) {
    const confirm = buildConfirmDialog(container);

    // ---------------- Fenetre Archive ----------------
    const arch = makeOverlay();
    Object.assign(arch.card.style, { width: "min(420px, 92vw)", padding: "10px 12px", borderColor: VIOLET });
    const aTitle = document.createElement("div");
    aTitle.textContent = "Archive the image list";
    Object.assign(aTitle.style, { fontWeight: "bold", color: TITLE_COLOR, paddingBottom: "8px" });
    const aLabel = document.createElement("div");
    aLabel.textContent = "Name";
    Object.assign(aLabel.style, { color: INACTIVE_FG, paddingBottom: "3px" });
    const aName = document.createElement("input");
    aName.type = "text";
    aName.maxLength = 60;
    Object.assign(aName.style, {
        width: "100%", boxSizing: "border-box", background: "#111", color: "#ddd", border: "1px solid #444",
        borderRadius: "4px", padding: "5px 7px", fontSize: "12px",
    });
    const aStrip = document.createElement("div");
    aStrip.style.padding = "8px 0 4px";
    const aError = document.createElement("div");
    Object.assign(aError.style, { color: MARK_RED, minHeight: "14px", padding: "4px 0" });
    const aBtns = document.createElement("div");
    Object.assign(aBtns.style, { display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "6px" });
    const aCancel = makeTextButton("Cancel", INACTIVE_BG);
    const aOk = makeTextButton("Archive it", GREEN);
    aBtns.append(aCancel, aOk);
    arch.card.append(aTitle, aLabel, aName, aStrip, aError, aBtns);

    function closeArchive() {
        arch.overlay.style.display = "none";
        window.removeEventListener("keydown", onArchiveKey, true);
    }
    function onArchiveKey(e) {
        if (arch.overlay.style.display === "none" || confirm.isOpen()) return;
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopImmediatePropagation();
            closeArchive();
        } else if (e.key === "Enter" && e.target === aName) {
            e.preventDefault();
            doArchive();
        }
    }
    let archiving = false;
    async function doArchive() {
        const project = ctx.getProject();
        const images = imagesOfState(ctx.getState());
        if (archiving) return;
        if (!project) {
            aError.textContent = "Wire a MagicStudio Project to archive the lists";
            return;
        }
        if (!images.length) {
            aError.textContent = "Nothing to archive";
            return;
        }
        archiving = true;
        aOk.disabled = true;
        try {
            const r = await postJson("/mmproject/image_lists/save",
                { project: project.path, name: aName.value, images });
            closeArchive();
            ctx.notify("✓ List archived: " + r.file, "Saved in 99.Project-Config/Image-Lists of " + project.name,
                GREEN);
        } catch (e) {
            aError.textContent = "⚠ " + e.message;
        } finally {
            archiving = false;
            aOk.disabled = false;
        }
    }
    aOk.addEventListener("click", doArchive);
    aCancel.addEventListener("click", closeArchive);
    arch.overlay.addEventListener("mousedown", closeArchive);

    function archive() {
        const project = ctx.getProject();
        const images = imagesOfState(ctx.getState());
        if (!project || !images.length) return;
        aName.value = project.name || "";
        aError.textContent = "";
        aStrip.innerHTML = "";
        aStrip.appendChild(thumbStrip(images, []));
        arch.overlay.style.display = "block";
        window.addEventListener("keydown", onArchiveKey, true);
        positionCardNextToNode(arch.card, container, 420);
        aName.focus();
        aName.select();
    }

    // ---------------- Fenetre Lists ----------------
    const lst = makeOverlay();
    Object.assign(lst.card.style, {
        width: "min(560px, 94vw)", maxHeight: "80vh", padding: "10px 12px", borderColor: VIOLET,
        display: "flex", flexDirection: "column",
    });
    const lTitle = document.createElement("div");
    Object.assign(lTitle.style, { fontWeight: "bold", color: TITLE_COLOR, paddingBottom: "8px", flex: "0 0 auto" });
    const lBody = document.createElement("div");
    Object.assign(lBody.style, { flex: "1 1 auto", overflowY: "auto", minHeight: "40px" });
    const lMsg = document.createElement("div");
    Object.assign(lMsg.style, { flex: "0 0 auto", minHeight: "14px", padding: "6px 0 2px", color: INACTIVE_FG });
    const lBtns = document.createElement("div");
    Object.assign(lBtns.style, { display: "flex", justifyContent: "space-between", gap: "8px", paddingTop: "6px", flex: "0 0 auto" });
    const lDelete = makeTextButton("Delete", MARK_RED);
    const lClose = makeTextButton("Close", INACTIVE_BG);
    lBtns.append(lDelete, lClose);
    lst.card.append(lTitle, lBody, lMsg, lBtns);

    let rows = [];
    const checked = new Set();
    let busy = false;

    function say(text, color) {
        lMsg.textContent = text || "";
        lMsg.style.color = color || INACTIVE_FG;
    }
    function paintDelete() {
        const n = checked.size;
        lDelete.disabled = !n || busy;
        lDelete.style.opacity = n && !busy ? "1" : "0.45";
        lDelete.style.cursor = n && !busy ? "pointer" : "default";
    }
    function closeLists() {
        lst.overlay.style.display = "none";
        window.removeEventListener("keydown", onListsKey, true);
        confirm.close();
    }
    function onListsKey(e) {
        // Echap ferme d'abord la confirmation (elle gere sa propre touche).
        if (lst.overlay.style.display === "none" || e.key !== "Escape" || confirm.isOpen()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        closeLists();
    }

    function paintRows() {
        lBody.innerHTML = "";
        if (!rows.length) {
            const empty = document.createElement("div");
            empty.textContent = "No archived list yet";
            Object.assign(empty.style, { color: INACTIVE_FG, padding: "14px 4px", textAlign: "center" });
            lBody.appendChild(empty);
        }
        for (const r of rows) {
            const line = document.createElement("div");
            Object.assign(line.style, {
                display: "flex", gap: "8px", alignItems: "flex-start", padding: "6px 4px",
                borderBottom: "1px solid #2f2f2f",
            });
            const box = document.createElement("input");
            box.type = "checkbox";
            box.checked = checked.has(r.file);
            box.title = "Select to delete";
            box.style.marginTop = "3px";
            box.addEventListener("change", () => {
                if (box.checked) checked.add(r.file);
                else checked.delete(r.file);
                paintDelete();
            });
            const body = document.createElement("div");
            Object.assign(body.style, { flex: "1", minWidth: "0", cursor: "pointer" });
            body.title = "Load this list in the RefLoader";
            const head = document.createElement("div");
            Object.assign(head.style, { display: "flex", gap: "8px", alignItems: "baseline", whiteSpace: "nowrap" });
            const text = document.createElement("span");
            text.textContent = r.text;
            Object.assign(text.style, { overflow: "hidden", textOverflow: "ellipsis", color: "#ddd" });
            head.appendChild(text);
            if (r.missingCount) {
                const miss = document.createElement("span");
                miss.textContent = r.missingCount + " missing";
                Object.assign(miss.style, { color: ORANGE, flex: "0 0 auto" });
                head.appendChild(miss);
            }
            body.append(head, thumbStrip(r.images, r.missing));
            body.addEventListener("click", () => loadRow(r));
            body.addEventListener("mouseenter", () => { line.style.background = "#262626"; });
            body.addEventListener("mouseleave", () => { line.style.background = ""; });
            line.append(box, body);
            lBody.appendChild(line);
        }
        paintDelete();
    }

    async function refreshLists() {
        const project = ctx.getProject();
        if (!project) {
            rows = [];
            say("Wire a MagicStudio Project to archive the lists", ORANGE);
            paintRows();
            return;
        }
        try {
            const data = await apiGet("/mmproject/image_lists?project=" + encodeURIComponent(project.path));
            rows = archiveRows(data.lists || []);
            for (const f of [...checked]) if (!rows.some((r) => r.file === f)) checked.delete(f);
        } catch (e) {
            rows = [];
            say("⚠ " + e.message, MARK_RED);
        }
        paintRows();
    }

    /** Clic sur une ligne = Load : remplace la liste Image (confirmation si elle n'est pas vide). */
    function loadRow(r) {
        const plan = loadPlan(r, MAX_IMAGES);
        if (!plan.images.length) {
            say("⚠ No image of this list was found", ORANGE);
            return;
        }
        const apply = () => {
            const s = withImages(ctx.getState(), plan.images);
            closeLists();
            ctx.setState(s);
            if (plan.missing.length) {
                ctx.notify("⚠ " + plan.missing.length + " missing image" + (plan.missing.length > 1 ? "s" : "") +
                    " removed", "Not found on disk:\n" + plan.missing.join("\n"), ORANGE);
            }
        };
        const current = imagesOfState(ctx.getState());
        if (!current.length) {
            apply();
            return;
        }
        confirm.ask("<b>Replace the image list?</b><br>The current list (" + current.length + " image" +
            (current.length > 1 ? "s" : "") + ") is replaced by <b>" + escapeHtml(r.name) + "</b> (" +
            plan.images.length + " image" + (plan.images.length > 1 ? "s" : "") + ").", "Load", apply, lst.card);
    }

    lDelete.addEventListener("click", () => {
        const files = [...checked];
        if (!files.length || busy) return;
        confirm.ask("<b>Delete " + files.length + " archived list" + (files.length > 1 ? "s" : "") + "?</b>" +
            '<div style="color:#999;margin-top:6px">The images themselves are not deleted.</div>', "Delete",
            async () => {
                const project = ctx.getProject();
                if (!project) return;
                busy = true;
                paintDelete();
                try {
                    const r = await postJson("/mmproject/image_lists/delete", { project: project.path, files });
                    for (const f of r.deleted || []) checked.delete(f);
                    say("✓ " + (r.deleted || []).length + " list" + ((r.deleted || []).length === 1 ? "" : "s") +
                        " deleted", GREEN);
                } catch (e) {
                    say("⚠ " + e.message, MARK_RED);
                }
                busy = false;
                await refreshLists();
            }, lst.card);
    });
    lClose.addEventListener("click", closeLists);
    lst.overlay.addEventListener("mousedown", () => {
        if (!confirm.isOpen()) closeLists();
    });

    function open() {
        const project = ctx.getProject();
        if (!project) return;
        lTitle.textContent = "Image lists — " + (project.name || "");
        checked.clear();
        say("");
        rows = [];
        paintRows();
        lst.overlay.style.display = "block";
        window.addEventListener("keydown", onListsKey, true);
        positionCardNextToNode(lst.card, container, 560);
        refreshLists();
    }

    function close() {
        closeArchive();
        closeLists();
    }

    return {
        archive,
        open,
        close,
        isOpen: () => arch.overlay.style.display !== "none" || lst.overlay.style.display !== "none",
        remove() {
            close();
            confirm.remove();
            arch.overlay.remove();
            lst.overlay.remove();
        },
    };
}
