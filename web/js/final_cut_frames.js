// Modele de la bande d'images a cote de chaque video du Final Cut (sans dependance
// a ComfyUI, teste par true 
// a l'ordre du serveur : classement par prefixe du nom, tri par numero d'image.

const numberInName = (name) => {
    const m = /^FRAME_(\d+)_/.exec(name || "");
    return m ? parseInt(m[1], 10) : null;
};

// Cle de tri : numero connu (frame), sinon numero du nom, sinon aucun.
const sortNumber = (entry) => {
    if (typeof entry.frame === "number") return entry.frame;
    return numberInName(entry.name);
};

export function frameStrip(entries) {
    const list = Array.isArray(entries) ? entries : [];
    let first = null;
    let last = null;
    const numbered = [];
    for (const entry of list) {
        const name = (entry && entry.name) || "";
        if (name.startsWith("FIRST_FRAME_")) { if (!first) first = entry; }
        else if (name.startsWith("LAST_FRAME_")) { if (!last) last = entry; }
        else if (name.startsWith("FRAME_")) numbered.push(entry);
    }
    numbered.sort((a, b) => {
        const na = sortNumber(a);
        const nb = sortNumber(b);
        if (na !== null && nb !== null && na !== nb) return na - nb;
        if (na !== null && nb === null) return -1; // numero connu avant inconnu
        if (na === null && nb !== null) return 1;
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    return { first, last, numbered };
}

// Avance ou recule en boucle ; count 0 -> 0.
export function stepIndex(i, count, dir) {
    if (!count) return 0;
    return (((i + dir) % count) + count) % count;
}

export function numberedLabel(entry) {
    const f = entry && typeof entry.frame === "number" ? entry.frame : null;
    return "N · " + (f === null ? "?" : f);
}

// Images du projet d'une copie Final Cut (_NN_ au debut du nom), sinon [].
export function framesOfCopy(plan, copyName) {
    const m = /^_(\d+)_/.exec(copyName || "");
    if (!m || !plan || !plan.frames) return [];
    return plan.frames[m[1]] || [];
}
