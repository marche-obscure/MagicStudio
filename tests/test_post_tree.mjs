// Tests de post_tree.js : noms Post A / Post A.01, arbre, disposition, glisser (choix utilisateur 30/10/2026).
import test from "node:test";
import assert from "node:assert/strict";
import { letters, postNames, rootOf, postTree, postsOf, treeLayout, dragPath, dragLink, pruneGone, treeFiles, isFiltered } from "../web/js/post_tree.js";

const v = (index, extra) => Object.assign({ index, kind: "video", copy: "P/" + index + ".mp4", copy_exists: true }, extra);
const post = (index, of, level, time, extra) =>
    v(index, Object.assign({ post_of: of, post_level: level, post_date: "2026-10-30 " + time }, extra));

// A(0) <- B1(1, 10h), B2(2, 11h) ; B1 <- C(3, 12h), D(4, 13h) ; C <- E(5)
const sample = (extraB1) => [
    v(0),
    post(1, 0, 1, "10:00:00", extraB1),
    post(2, 0, 1, "11:00:00"),
    post(3, 1, 2, "12:00:00"),
    post(4, 1, 2, "13:00:00"),
    post(5, 3, 3, "14:00:00"),
];

test("letters : A..Z puis AA, AB", () => {
    assert.equal(letters(0), "A");
    assert.equal(letters(25), "Z");
    assert.equal(letters(26), "AA");
    assert.equal(letters(27), "AB");
    assert.equal(letters(51), "AZ");
    assert.equal(letters(52), "BA");
});

test("names : Original, Post A, Post B, Post A.01...", () => {
    const n = postNames(sample());
    assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => n.get(i)),
        ["Original", "Post A", "Post B", "Post A.01", "Post A.02", "Post A.01.01"]);
});

test("names stable after delete", () => {
    const n = postNames(sample({ deleted: { how: "trash" } }));
    assert.equal(n.get(2), "Post B");
    assert.equal(n.get(3), "Post A.01");
});

test("sortie sans post : absente de la Map", () => {
    const n = postNames([v(0), v(1), post(2, 1, 1, "10:00:00")]);
    assert.ok(!n.has(0));
    assert.equal(n.get(1), "Original");
});

test("orphan post : sous le premier original, nomme apres ses enfants", () => {
    const outs = sample().slice(0, 3).concat([post(7, 9, 1, "09:00:00")]);
    const n = postNames(outs);
    assert.equal(n.get(7), "Post C");
    assert.equal(rootOf(outs[3], outs).index, 0);
    assert.equal(rootOf(outs[2], outs).index, 0);
    assert.equal(rootOf(outs[0], outs).index, 0);
});

test("orphan sans aucun original : Post ? et pas de boucle", () => {
    const lone = post(7, 9, 1, "09:00:00");
    const n = postNames([lone]);
    assert.equal(n.get(7), "Post ?");
    assert.equal(rootOf(lone, [lone]), lone);
});

test("cycle post_of : ne boucle pas", () => {
    const a = post(1, 2, 1, "10:00:00");
    const b = post(2, 1, 1, "11:00:00");
    const outs = [v(0), a, b];
    assert.equal(rootOf(a, outs).index, 0);
    assert.equal(postNames(outs).get(1), "Post ?");
    assert.ok(postsOf(outs, 0).length <= 2);
});

test("tree : ordre d'affichage selon order, noms inchanges", () => {
    const outs = sample();
    const names = (t) => t.children.map((c) => c.name);
    assert.deepEqual(names(postTree(outs, 0, "asc")), ["Post A", "Post B"]);
    assert.deepEqual(names(postTree(outs, 0, "desc")), ["Post B", "Post A"]);
    assert.deepEqual(names(postTree(outs, 0)), ["Post B", "Post A"]);
    assert.equal(postTree(outs, 0).name, "Original");
    assert.equal(postTree(outs, 0).output.index, 0);
});

test("postsOf : tous les descendants, supprimes compris", () => {
    const outs = sample({ deleted: { how: "trash" } });
    assert.deepEqual(postsOf(outs, 0).map((o) => o.index).sort(), [1, 2, 3, 4, 5]);
    assert.deepEqual(postsOf(outs, 1).map((o) => o.index).sort(), [3, 4, 5]);
});

test("layout : colonnes et parents centres", () => {
    const outs = [v(0), post(1, 0, 1, "10:00:00"), post(2, 0, 1, "11:00:00"),
        post(3, 1, 2, "12:00:00"), post(4, 1, 2, "13:00:00")];
    const L = treeLayout(postTree(outs, 0, "asc"));
    assert.equal(L.width, 3);
    assert.equal(L.depth, 3);
    const by = (i) => L.cards.find((c) => c.node.output.index === i);
    assert.equal(by(0).x, 1.25);
    assert.equal(by(1).x, 0.5);
    assert.equal(by(3).x, 0);
    assert.equal(by(4).x, 1);
    assert.equal(by(2).x, 2);
    assert.equal(by(0).depth, 0);
    assert.equal(by(3).depth, 2);
    assert.equal(L.links.length, 4);
    assert.ok(L.cards.includes(L.links[0][0]) && L.cards.includes(L.links[0][1]));
});

test("layout : original seul", () => {
    const L = treeLayout(postTree([v(0)], 0));
    assert.equal(L.width, 1);
    assert.equal(L.depth, 1);
    assert.equal(L.cards[0].x, 0);
    assert.equal(L.links.length, 0);
});

test("dragPath", () => {
    const inProj = v(0, { in_project: true, source_exists: true, source: "P/src.mp4" });
    assert.equal(dragPath(inProj), "P/src.mp4");
    const outside = v(1, { in_project: false, source_exists: true, source: "X/src.mp4" });
    assert.equal(dragPath(outside), "P/1.mp4");
    const gone = v(2, { deleted: { how: "trash" }, copy_exists: false, source_exists: false });
    assert.equal(dragPath(gone), "");
    const img = { index: 3, kind: "image", source: "P/i.png", source_exists: true, in_project: true };
    assert.equal(dragPath(img), "P/i.png");
    assert.equal(dragPath(null), "");
});

test("dragLink", () => {
    assert.equal(dragLink("G:\\P\\a b.mp4", "http://127.0.0.1:8188"),
        "http://127.0.0.1:8188/mmrefloader/media?file=G%3A%5CP%5Ca%20b.mp4&filename=a%20b.mp4");
});

test("pruneGone : supprime sans descendant retire, supprime avec descendant garde", () => {
    // B1(1) supprime mais C(3) present dessous ; B2(2) supprime sans enfant ; D(4), E(5) presents
    const gone = { copy_exists: false, deleted: { how: "trash" } };
    const outs = sample(gone);
    outs[2] = post(2, 0, 1, "11:00:00", gone);
    const tree = pruneGone(postTree(outs, 0, "asc"));
    assert.deepEqual(tree.children.map((c) => c.output.index), [1]);
    assert.deepEqual(tree.children[0].children.map((c) => c.output.index), [3, 4]);
    assert.deepEqual(treeFiles(tree).map((o) => o.index), [0, 3, 5, 4]);
});

test("pruneGone : racine toujours gardee, arbre vide -> null", () => {
    const outs = [v(0, { copy_exists: false })];
    assert.equal(pruneGone(postTree(outs, 0)).children.length, 0);
    assert.equal(pruneGone(null), null);
});

test("isFiltered : jamais l'original ni un supprime", () => {
    const place = (index, p) => v(index, { in_project: true, place: p });
    const active = new Set(["picture_lock"]);
    assert.equal(isFiltered(place(0, "footage"), 0, active), false); // original
    assert.equal(isFiltered(place(1, "footage"), 0, active), true);
    assert.equal(isFiltered(place(2, "picture_lock"), 0, active), false);
    assert.equal(isFiltered(v(3, { copy_exists: false }), 0, active), false); // sans fichier
    assert.equal(isFiltered(place(1, "footage"), 0, new Set()), false);
});
