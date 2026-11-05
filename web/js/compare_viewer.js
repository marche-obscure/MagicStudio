import { VIOLET } from "./minimax_ref_loader.js";
import { clipA, wipePos, halfSide, soundSide, tagCorner } from "./compare_pure.js";

// --------------------------------------------------------------------
// Cadre de comparaison du noeud MagicStudio Image / Video Compare (plan du 05/11/2026, tache 6).
// Quatre modes : side (A a gauche, B a droite), lr / rl / ud (couche B dessous, couche A
// dessus decoupee par clip-path, rideau qui suit la souris sans clic). Son : seule la video
// de la moitie sous la souris parle ; hors du cadre, le cote etoile (sinon A).
// release() vide chaque <video> (verrou des fichiers sous Windows).
// --------------------------------------------------------------------

const SIDES = ["A", "B"];
const SIDE_COLORS = { A: "#1e88e5", B: VIOLET };
const mediaUrl = (path) => "/mmrefloader/media?file=" + encodeURIComponent(path);
const baseName = (p) => String(p || "").split(/[\\/]/).pop();
const sourceKey = (src) => (src && src.path ? src.kind + "|" + src.path : "");

const CORNERS = {
    tl: { top: "4px", left: "4px" },
    tr: { top: "4px", right: "4px" },
    bl: { bottom: "4px", left: "4px" },
};

/**
 * Cadre de comparaison dans `host` (cadre du noeud, position relative, hauteur fixe).
 * ops = {onHover(side|null), onPos(pos), onRemove(side)}.
 * setSources({A, B}) : sources[side] = {path, kind, from?, kept?} | null (from = "input" | "file").
 */
export function buildCompareViewer(host, ops = {}) {
    const state = { mode: "side", star: "", hover: null, pos: 0.5, sources: { A: null, B: null } };
    const els = { A: null, B: null }; // element <img> / <video> de chaque cote
    const keys = { A: "", B: "" };
    const failed = { A: false, B: false };
    let released = false; // lecteurs vides par release() : rien n'est relu avant le prochain setSources

    const root = document.createElement("div");
    Object.assign(root.style, { position: "absolute", inset: "0", overflow: "hidden" });
    host.innerHTML = "";
    host.appendChild(root);

    const div = (style) => {
        const d = document.createElement("div");
        Object.assign(d.style, style || {});
        return d;
    };

    /** Element d'un cote, cree une seule fois par source (le temps de lecture reste au changement de mode). */
    function mediaOf(side) {
        const src = state.sources[side];
        const k = sourceKey(src);
        if (released) return null;
        if (k === keys[side] && (els[side] || !k)) return els[side];
        dropMedia(side);
        keys[side] = k;
        failed[side] = false;
        if (!k) return null;
        const el = document.createElement(src.kind === "video" ? "video" : "img");
        if (src.kind === "video") {
            el.preload = "auto";
            el.playsInline = true;
            el.muted = true;
        }
        el.draggable = false;
        Object.assign(el.style, {
            width: "100%", height: "100%", objectFit: "contain", display: "block", pointerEvents: "none",
        });
        el.addEventListener("error", () => {
            if (!el.getAttribute("src")) return; // vide par release()
            failed[side] = true;
            layout();
        });
        if (src.kind === "video") el.addEventListener("loadedmetadata", () => viewer.onMedia && viewer.onMedia(side, el));
        el.src = mediaUrl(src.path);
        els[side] = el;
        return el;
    }
    function dropMedia(side) {
        const el = els[side];
        els[side] = null;
        keys[side] = "";
        if (el && el.tagName === "VIDEO") {
            try {
                el.pause();
                el.removeAttribute("src");
                el.load();
            } catch (e) {
                // element deja retire
            }
        }
        if (el) el.remove();
    }

    function tag(side) {
        const t = div(Object.assign({
            position: "absolute", background: SIDE_COLORS[side], color: "white", fontWeight: "bold",
            borderRadius: "4px", padding: "0 6px", zIndex: "4", pointerEvents: "none",
        }, CORNERS[tagCorner(state.mode, side)]));
        t.textContent = side;
        return t;
    }
    function note(text, extra) {
        const d = div(Object.assign({ padding: "0 10px", color: "#888", textAlign: "center" }, extra || {}));
        d.textContent = text;
        return d;
    }
    /** Contenu d'un cote : media, ou texte (Empty, Run once to preview, File not found) + fichier garde. */
    function sideBox(side) {
        const src = state.sources[side];
        const box = div({
            position: "absolute", inset: "0", display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: "6px",
        });
        const el = mediaOf(side);
        if (el && !failed[side]) box.appendChild(el);
        else if (el && failed[side]) box.appendChild(note(src.from === "input" ? "Run once to preview" : "File not found"));
        else if (released && src && src.path) box.appendChild(note("Player closed", { color: "#666" }));
        else if (src && src.from === "input") box.appendChild(note("Run once to preview"));
        else box.appendChild(note("Empty", { color: "#666" }));
        if (src && src.kept) {
            box.appendChild(note("kept: " + baseName(src.kept.path) + " (used when input " + side + " is unwired)",
                { color: "#666", fontSize: "11px", position: el && !failed[side] ? "absolute" : "static", bottom: "4px" }));
        }
        return box;
    }
    function removeButton(side, corner) {
        const src = state.sources[side];
        if (!src || src.from !== "file" || !ops.onRemove) return null;
        const x = document.createElement("button");
        x.type = "button";
        x.textContent = "✕";
        x.title = "Remove this file from side " + side;
        const at = corner === "tl" || corner === "bl" ? { left: "28px" } : { right: "28px" };
        Object.assign(x.style, {
            position: "absolute", width: "20px", height: "20px", padding: "0", border: "none", borderRadius: "50%",
            background: "#000a", color: "#ff6b6b", cursor: "pointer", fontWeight: "bold", zIndex: "5",
        }, corner === "bl" ? { bottom: "4px" } : { top: "4px" }, at);
        x.addEventListener("click", (e) => {
            e.stopPropagation();
            ops.onRemove(side);
        });
        return x;
    }

    let layer = { A: null }; // couche A decoupee (lr / rl / ud)
    let line = null;
    let handle = null;
    /** Redessine le cadre (les elements media sont gardes). */
    function layout() {
        // Detacher sans vider les medias (appendChild les deplace plus loin).
        root.innerHTML = "";
        layer = { A: null };
        line = null;
        handle = null;
        if (state.mode === "side") {
            const row = div({ position: "absolute", inset: "0", display: "flex" });
            for (const side of SIDES) {
                const cell = div({
                    position: "relative", flex: "1", minWidth: "0", overflow: "hidden",
                    borderLeft: side === "B" ? "1px solid #2a2a2a" : "none",
                });
                cell.dataset.side = side;
                cell.appendChild(sideBox(side));
                cell.appendChild(tag(side));
                const x = removeButton(side, tagCorner("side", side));
                if (x) cell.appendChild(x);
                row.appendChild(cell);
            }
            root.appendChild(row);
        } else {
            const b = div({ position: "absolute", inset: "0", background: "#0d0d0d" });
            b.dataset.side = "B";
            b.appendChild(sideBox("B"));
            const a = div({ position: "absolute", inset: "0", background: "#0d0d0d" });
            a.dataset.side = "A";
            a.appendChild(sideBox("A"));
            layer.A = a;
            const vertical = state.mode === "ud";
            line = div(Object.assign({ position: "absolute", background: "white", zIndex: "3", pointerEvents: "none" },
                vertical ? { left: "0", right: "0", height: "2px" } : { top: "0", bottom: "0", width: "2px" }));
            handle = div({
                position: "absolute", width: "14px", height: "14px", borderRadius: "50%", background: "white",
                boxShadow: "0 0 3px #000", zIndex: "3", pointerEvents: "none",
            });
            root.append(b, a, line, handle);
            for (const side of SIDES) {
                root.appendChild(tag(side));
                const x = removeButton(side, tagCorner(state.mode, side));
                if (x) root.appendChild(x);
            }
        }
        paintWipe();
        paintSound();
    }
    /** Rideau : decoupe de la couche A, trait blanc 2 px et poignee ronde 14 px. */
    function paintWipe() {
        if (!layer.A) return;
        layer.A.style.clipPath = clipA(state.mode, state.pos);
        const p = (100 * state.pos).toFixed(2) + "%";
        if (state.mode === "ud") {
            line.style.top = "calc(" + p + " - 1px)";
            handle.style.top = "calc(" + p + " - 7px)";
            handle.style.left = "calc(50% - 7px)";
        } else {
            line.style.left = "calc(" + p + " - 1px)";
            handle.style.left = "calc(" + p + " - 7px)";
            handle.style.top = "calc(50% - 7px)";
        }
    }
    /** Son : seul le cote sous la souris (sinon etoile, sinon A) ; le volume reste celui du lecteur. */
    function paintSound() {
        const speak = soundSide(state.hover, state.star);
        for (const side of SIDES) {
            const el = els[side];
            if (el && el.tagName === "VIDEO") el.muted = side !== speak;
        }
    }

    function onMove(e) {
        const rect = host.getBoundingClientRect();
        const hover = halfSide(state.mode, rect, e.clientX, e.clientY);
        const pos = wipePos(state.mode, rect, e.clientX, e.clientY);
        if (pos !== state.pos) {
            state.pos = pos;
            paintWipe();
            if (ops.onPos) ops.onPos(pos);
        }
        if (hover !== state.hover) {
            state.hover = hover;
            paintSound();
            if (ops.onHover) ops.onHover(hover);
        }
    }
    function onLeave() {
        state.pos = 0.5;
        state.hover = null;
        paintWipe();
        paintSound();
        if (ops.onPos) ops.onPos(0.5);
        if (ops.onHover) ops.onHover(null);
    }
    host.addEventListener("mousemove", onMove);
    host.addEventListener("mouseleave", onLeave);

    const viewer = {
        el: root,
        /** Sources des deux cotes ; un cote inchange garde son element (et son temps de lecture). */
        setSources(sources) {
            const next = { A: (sources && sources.A) || null, B: (sources && sources.B) || null };
            state.sources = next;
            released = false;
            layout();
        },
        setMode(mode) {
            if (mode === state.mode) return;
            state.mode = mode;
            state.pos = 0.5;
            layout();
        },
        setStar(side) {
            state.star = side === "A" || side === "B" ? side : "";
            paintSound();
        },
        /** <video> d'un cote (null pour une image ou un cote vide). */
        media(side) {
            const el = els[side];
            return el && el.tagName === "VIDEO" && !failed[side] ? el : null;
        },
        /** Vide les videos (pause, src retire, load) : le fichier n'est plus verrouille. */
        release() {
            for (const side of SIDES) dropMedia(side);
            released = true;
            layout();
        },
        /** Arret complet (noeud supprime). */
        dispose() {
            for (const side of SIDES) dropMedia(side);
            host.removeEventListener("mousemove", onMove);
            host.removeEventListener("mouseleave", onLeave);
        },
        /** Crochet : video prete (metadonnees lues), fixe par le lecteur. */
        onMedia: null,
    };
    return viewer;
}
