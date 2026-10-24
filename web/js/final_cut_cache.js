// Fichiers prepares pour le glisser du noeud MiniMax H3 Final Cut (sans dependance
// a ComfyUI, teste par node --test tests/test_final_cut_cache.mjs). Relecture du
// 24/10/2026 : sans limite, survoler des videos gardait chaque fichier entier en
// memoire jusqu'a la fermeture de l'onglet. Budget en octets et en nombre ; les
// fichiers les moins recemment utilises partent d'abord ; le dernier prepare reste
// toujours, meme plus gros que le budget (on peut toujours le glisser).

export function makeFileCache({ maxBytes, maxItems }) {
    const map = new Map(); // ordre d'insertion = du plus ancien au plus recent
    let total = 0;
    const sizeOf = (file) => (file && file.size) || 0;

    function drop(key) {
        if (!map.has(key)) return;
        total -= sizeOf(map.get(key));
        map.delete(key);
    }

    return {
        get(key) {
            if (!map.has(key)) return undefined;
            const file = map.get(key);
            map.delete(key);
            map.set(key, file); // utilise : redevient le plus recent
            return file;
        },
        set(key, file) {
            drop(key);
            map.set(key, file);
            total += sizeOf(file);
            for (const old of map.keys()) {
                if (old === key || (total <= maxBytes && map.size <= maxItems)) break;
                drop(old);
            }
        },
        clear() {
            map.clear();
            total = 0;
        },
        bytes: () => total,
        keys: () => [...map.keys()],
    };
}
