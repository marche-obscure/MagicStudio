import { VIOLET, GREEN } from "./minimax_ref_loader.js";
import { clipA, wipePos, halfSide, soundSide, tagCorner, syncFix, frameStep, timeText } from "./compare_pure.js";

// --------------------------------------------------------------------
// Cadre de comparaison du noeud MagicStudio Image / Video Compare (plan du 05/11/2026, tache 6).
// Quatre modes : side (A a gauche, B a droite), lr / rl / ud (couche B dessous, couche A
// dessus decoupee par clip-path, rideau qui suit la souris sans clic). Son : seule la video
// de la moitie sous la souris parle ; hors du cadre, le cote etoile (sinon A).
// release() vide chaque <video> (verrou des fichiers sous Windows).
// Lecteur (tache 7) : Sync allume = une barre, A donne l'heure et B suit (recale au-dela de
// 0,05 s) ; Sync eteint = une barre par cote. Images seulement : barres cachees, place gardee.
// --------------------------------------------------------------------

// Hauteur de la zone du lecteur : une barre (Sync) ou deux (la hauteur du noeud = uiHeight).
const BAR_HEIGHT = 26;
const BARS_GAP = 4;
export const playerHeight = (sync) => (sync ? BAR_HEIGHT : 2 * BAR_HEIGHT + BARS_GAP);

function barButton(text, title) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.title = title;
    Object.assign(b.style, {
        minWidth: "24px", height: "22px", padding: "0 4px", border: "1px solid #3a3a3a", borderRadius: "5px",
        background: "#252525", color: "#ddd", cursor: "pointer", fontSize: "11px", flex: "0 0 auto", lineHeight: "1",
    });
    return b;
}

/**
 * Barre de lecture pour une ou deux videos : videos[0] donne l'heure, les autres la suivent
 * (play / pause / seek / image par image, boucle requestAnimationFrame avec syncFix).
 * fpsOf(video) -> cadence (pas d'image = 1 / fps). label = "A" / "B" (barres l'une sous l'autre) ou "".
 * opts = {loop, onLoop(on)} : Loop repris d'une barre precedente (la barre est refaite au changement de mode).
 * Chaque video garde son propre volume ; le curseur Volume montre celui de l'horloge et regle toutes les videos.
 */
export function buildBar(videos, fpsOf, label, opts = {}) {
    const clock = videos[0];
    const followers = videos.slice(1);
    let loop = !!opts.loop;
    let raf = 0;
    let scrubbing = false; // curseur de temps tenu : tick() ne le reecrit pas
    const pending = new Map(); // suiveur sans duree connue -> temps a appliquer a loadedmetadata
    const el = document.createElement("div");
    Object.assign(el.style, { display: "flex", alignItems: "center", gap: "4px", height: BAR_HEIGHT + "px", minWidth: "0" });
    if (label) {
        const t = document.createElement("span");
        t.textContent = label;
        Object.assign(t.style, {
            background: SIDE_COLORS[label], color: "white", fontWeight: "bold", borderRadius: "4px",
            padding: "0 5px", flex: "0 0 auto",
        });
        el.appendChild(t);
    }
    const playBtn = barButton("▶", "Play / Pause");
    const prevBtn = barButton("◀|", "Previous frame");
    const stopBtn = barButton("■", "Stop");
    const nextBtn = barButton("|▶", "Next frame");
    const loopBtn = barButton("⟲", "Loop");
    const range = document.createElement("input");
    range.type = "range";
    range.min = "0";
    range.max = "1000";
    range.step = "1";
    range.value = "0";
    Object.assign(range.style, { flex: "1", minWidth: "40px", margin: "0", cursor: "pointer" });
    const time = document.createElement("span");
    Object.assign(time.style, { color: "#aaa", fontSize: "11px", flex: "0 0 auto", fontVariantNumeric: "tabular-nums" });
    const vol = document.createElement("input");
    vol.type = "range";
    vol.min = "0";
    vol.max = "1";
    vol.step = "0.05";
    vol.value = String(clock.volume);
    vol.title = "Volume";
    Object.assign(vol.style, { width: "54px", flex: "0 0 auto", margin: "0", cursor: "pointer" });
    el.append(playBtn, prevBtn, stopBtn, nextBtn, loopBtn, range, time, vol);

    const dur = (v) => (Number.isFinite(v.duration) ? v.duration : 0);
    /**
     * Met les suiveurs au temps t, exactement (seek, image par image, arret : un pas d'image est
     * plus petit que la tolerance de syncFix) ; une video plus courte se fige sur sa derniere image.
     */
    function follow(t) {
        for (const f of followers) {
            // Duree encore inconnue : on attend les metadonnees (sinon B partirait a 0).
            if (!(dur(f) > 0)) {
                pending.set(f, t);
                continue;
            }
            pending.delete(f);
            const target = Math.min(t, dur(f));
            if (f.currentTime !== target) f.currentTime = target;
        }
    }
    const onFollowerMeta = (e) => {
        const f = e.target;
        if (!pending.has(f) || !(dur(f) > 0)) return;
        const t = pending.get(f);
        pending.delete(f);
        f.currentTime = Math.min(t, dur(f));
    };
    for (const f of followers) f.addEventListener("loadedmetadata", onFollowerMeta);
    function paintTime() {
        const d = dur(clock);
        if (!scrubbing) range.value = String(d > 0 ? Math.round((clock.currentTime / d) * 1000) : 0);
        time.textContent = timeText(clock.currentTime) + " / " + timeText(d);
        playBtn.textContent = clock.paused ? "▶" : "❚❚";
        loopBtn.style.borderColor = loop ? GREEN : "#3a3a3a";
        loopBtn.style.color = loop ? GREEN : "#ddd";
    }
    function tick() {
        raf = 0;
        if (clock.paused) {
            paintTime();
            return;
        }
        const t = clock.currentTime;
        for (const f of followers) {
            if (t < dur(f)) {
                const fix = syncFix(t, f.currentTime);
                if (fix !== null) f.currentTime = fix;
                if (f.paused) f.play().catch(() => {});
            }
        }
        paintTime();
        raf = requestAnimationFrame(tick);
    }
    const startLoop = () => {
        if (!raf) raf = requestAnimationFrame(tick);
    };
    function play() {
        if (clock.ended || (dur(clock) > 0 && clock.currentTime >= dur(clock))) {
            clock.currentTime = 0;
            follow(0);
        }
        clock.play().catch(() => {});
        for (const f of followers) if (clock.currentTime < dur(f)) f.play().catch(() => {});
    }
    function pause() {
        for (const v of videos) v.pause();
        follow(clock.currentTime);
    }
    function seek(t) {
        clock.currentTime = t;
        follow(t);
        paintTime();
    }
    function step(dir) {
        pause();
        seek(frameStep(clock.currentTime, fpsOf(clock), dir, dur(clock)));
    }
    const onPlayBtn = () => (clock.paused ? play() : pause());
    const onStop = () => {
        pause();
        seek(0);
    };
    const onLoop = () => {
        loop = !loop;
        if (opts.onLoop) opts.onLoop(loop);
        paintTime();
    };
    // Curseur tenu (souris ou doigt) : la boucle de lecture ne le deplace pas.
    const scrubStart = () => {
        scrubbing = true;
    };
    const scrubEnd = () => {
        if (!scrubbing) return;
        scrubbing = false;
        paintTime();
    };
    const onRange = () => {
        const d = dur(clock);
        if (d > 0) seek((Number(range.value) / 1000) * d);
    };
    const onVol = () => {
        for (const v of videos) v.volume = Number(vol.value);
    };
    // Fin de A : arret des deux, ou retour a 0 des deux avec la boucle.
    const onEnded = () => {
        if (loop) {
            seek(0);
            play();
        } else {
            for (const v of videos) v.pause();
            paintTime();
        }
    };
    playBtn.addEventListener("click", onPlayBtn);
    prevBtn.addEventListener("click", () => step(-1));
    stopBtn.addEventListener("click", onStop);
    nextBtn.addEventListener("click", () => step(1));
    loopBtn.addEventListener("click", onLoop);
    range.addEventListener("input", onRange);
    range.addEventListener("pointerdown", scrubStart);
    range.addEventListener("change", scrubEnd);
    window.addEventListener("pointerup", scrubEnd);
    window.addEventListener("pointercancel", scrubEnd);
    vol.addEventListener("input", onVol);
    const clockEvents = [["play", startLoop], ["pause", paintTime], ["ended", onEnded], ["loadedmetadata", paintTime],
        ["seeked", paintTime], ["timeupdate", () => clock.paused && paintTime()]];
    for (const [name, fn] of clockEvents) clock.addEventListener(name, fn);
    paintTime();
    if (!clock.paused) startLoop();
    return {
        el,
        videos,
        dispose() {
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
            for (const [name, fn] of clockEvents) clock.removeEventListener(name, fn);
            for (const f of followers) f.removeEventListener("loadedmetadata", onFollowerMeta);
            window.removeEventListener("pointerup", scrubEnd);
            window.removeEventListener("pointercancel", scrubEnd);
            pending.clear();
            el.remove();
        },
    };
}

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
 * ops = {onHover(side|null), onPos(pos), onRemove(side), barHost (zone du lecteur, sous le cadre)}.
 * setSources({A, B}) : sources[side] = {path, kind, from?, kept?} | null (from = "input" | "file").
 */
export function buildCompareViewer(host, ops = {}) {
    const state = {
        mode: "side", star: "", hover: null, pos: 0.5, sources: { A: null, B: null }, sync: true, fps: { A: 24, B: 24 },
    };
    const els = { A: null, B: null }; // element <img> / <video> de chaque cote
    const keys = { A: "", B: "" };
    const failed = { A: false, B: false };
    let released = false; // lecteurs vides par release() : rien n'est relu avant le prochain setSources
    let disposed = false; // noeud supprime : plus aucun media cree (un paint tardif ne reverrouille rien)

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
        if (released || disposed) return null;
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
        if (disposed) return;
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
        paintBars();
    }

    // ---- Lecteur ----
    const barHost = ops.barHost || null;
    let bars = [];
    let barsKey = null; // {sync, layout, A, B} : barres refaites seulement si l'un change
    // Loop de chaque barre, repris quand la barre est refaite (mode, nouvelle source).
    const loops = { sync: false, A: false, B: false };
    const loopOpts = (k) => ({ loop: loops[k], onLoop: (on) => (loops[k] = on) });
    const fpsOf = (v) => state.fps[v === els.A ? "A" : "B"] || 24;
    function clearBars() {
        for (const b of bars) b.dispose();
        bars = [];
        if (barHost) barHost.innerHTML = "";
    }
    function paintBars() {
        if (!barHost || disposed) return;
        const vA = viewer.media("A");
        const vB = viewer.media("B");
        barHost.style.height = playerHeight(state.sync) + "px";
        // Sync allume : une seule barre quel que soit le mode (Loop et volume restent) ;
        // Sync eteint : deux barres empilees, quel que soit le mode.
        const lay = state.sync ? "one" : "column";
        const k = barsKey;
        if (k && k.sync === state.sync && k.layout === lay && k.A === vA && k.B === vB) return;
        barsKey = { sync: state.sync, layout: lay, A: vA, B: vB };
        clearBars();
        // Images seulement (ou rien) : barres cachees, la hauteur reste (pas de saut).
        barHost.style.visibility = vA || vB ? "visible" : "hidden";
        if (!vA && !vB) return;
        if (state.sync) {
            const bar = buildBar([vA, vB].filter(Boolean), fpsOf, "", loopOpts("sync"));
            bars.push(bar);
            barHost.appendChild(bar.el);
            return;
        }
        // Sync eteint : les deux barres l'une sous l'autre avec A / B, dans tous les modes
        // (cote a cote en side, chaque barre etait trop etroite : curseur minuscule, temps coupe).
        const box = document.createElement("div");
        Object.assign(box.style, { display: "flex", flexDirection: "column", gap: BARS_GAP + "px" });
        for (const [s, v] of [["A", vA], ["B", vB]]) {
            const cell = document.createElement("div");
            Object.assign(cell.style, { height: BAR_HEIGHT + "px" });
            if (v) {
                const bar = buildBar([v], fpsOf, s, loopOpts(s));
                bars.push(bar);
                cell.appendChild(bar.el);
            }
            box.appendChild(cell);
        }
        barHost.appendChild(box);
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
            if (disposed) return;
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
        /** Sync allume : une barre (A donne l'heure) ; eteint : une barre par cote. */
        setSync(on) {
            const v = on !== false;
            if (v === state.sync) return;
            state.sync = v;
            // Chaque cote garde son temps : tout s'arrete au changement.
            for (const side of SIDES) {
                const m = viewer.media(side);
                if (m) m.pause();
            }
            paintBars();
        },
        /** Cadence de chaque cote (pas d'image = 1 / fps ; 24 par defaut). */
        setFps(fps) {
            for (const side of SIDES) {
                const f = fps ? Number(fps[side]) : 0;
                state.fps[side] = f > 0 ? f : 24;
            }
        },
        /** Vide les videos (pause, src retire, load) : le fichier n'est plus verrouille. */
        release() {
            clearBars();
            barsKey = null;
            for (const side of SIDES) dropMedia(side);
            released = true;
            layout();
        },
        /** Arret complet (noeud supprime). */
        dispose() {
            disposed = true;
            clearBars();
            for (const side of SIDES) dropMedia(side);
            host.removeEventListener("mousemove", onMove);
            host.removeEventListener("mouseleave", onLeave);
        },
        /** Crochet : video prete (metadonnees lues), fixe par le lecteur. */
        onMedia: null,
    };
    return viewer;
}
