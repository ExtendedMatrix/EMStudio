// MICRO-ARCHIVIO-1 · executable check of src/shelf-find.ts — the Shelf that
// searches: the type from the datamodel (and the tileset), where, the folder,
// the search (accents folded, every word), the pills and their numbers, the
// groups and their order, the ⇧-click range.
//
//   node scripts/check-shelf-find.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}shelf-find.ts`], bundle: true, format: "esm", write: false });
const F = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (c, what) => { assert.ok(c, what); checks++; };

// the type: the datamodel's, plus the tileset
eq(F.shelfTypeOf("/s/DJI_0220.JPG"), "image", "a .JPG is an image (the datamodel's resource_types)");
eq(F.shelfTypeOf("/s/D.07.01.pdf"), "document", "a pdf is a document");
eq(F.shelfTypeOf("/s/RB/OB_PODIO.glb"), "proxy_model", "a glb is the datamodel's proxy_model");
eq(F.shelfTypeOf("/s/RB/OB_PODIO.obj"), "3d_model", "an obj is a 3d_model");
eq(F.shelfTypeOf("/s/RM/prato.3tz"), "tileset", "a .3tz is a tileset");
eq(F.shelfTypeOf("/s/RM/prato/tileset.json"), "tileset", "a tileset.json is a tileset");
eq(F.shelfTypeOf("https://arachne.dainst.org/entity/1179876"), "web_page", "an address with no extension is a web page");
eq(F.shelfTypeOf("https://example.org/a.jpg?x=1"), "image", "an image on the web is an image");
eq(F.shelfTypeOf("/s/notes"), "unknown", "no extension on the disk: unknown");
eq([F.whereOf("/a/b.jpg"), F.whereOf("s3://em/aa"), F.whereOf("https://x.org/")], ["disk", "room", "web"], "where");
eq([F.folderOf("/a/b/c.jpg"), F.folderOf("C:\\a\\c.jpg"), F.folderOf("https://x.org/p/1"), F.folderOf("s3://bucket/k")],
   ["/a/b", "C:/a", "x.org", "s3://bucket"], "the folder of a path, the host of an address, the bucket");

const facts = [
  { id: "a", name: "DJI_0220.JPG", locator: "/s/drone/DJI_0220.JPG", type: "image", stamped: true, inUse: false, study: "this",
    where: "disk", folder: "/s/drone", act: { id: "p1", label: "Scaricato dal web · 29/09/2026" }, doc: null, words: ["Veduta da nord", "res:94bf", "Emanuel Demetrescu"] },
  { id: "b", name: "D.07.01.pdf", locator: "/s/EM/DosCo/D.07.01.pdf", type: "document", stamped: true, inUse: true, study: "other",
    where: "disk", folder: "/s/EM/DosCo", act: { id: "p2", label: "Scheda" }, doc: "D.07.01", words: ["Città di Segni"] },
  { id: "c", name: "Architrav", locator: "https://arachne.dainst.org/entity/1179876", type: "web_page", stamped: false, inUse: false, study: null,
    where: "web", folder: "arachne.dainst.org", act: null, doc: null, words: [] },
  { id: "d", name: "DJI_0221.JPG", locator: "/s/drone/DJI_0221.JPG", type: "image", stamped: false, inUse: false, study: null,
    where: "disk", folder: "/s/drone", act: null, doc: null, words: [] },
];
const Q = F.emptyQuery();
eq(F.findOnShelf(facts, Q).map((g) => g.ids), [["a", "b", "c", "d"]], "no query: one group, the shelf's order");
eq(F.queryActive(Q), false, "an empty query is not a filter");
eq(F.findOnShelf(facts, { ...Q, text: "citta segni" })[0].ids, ["b"], "the search folds accents and wants every word");
eq(F.findOnShelf(facts, { ...Q, text: "demetrescu" })[0].ids, ["a"], "…and reads the author of the stamp");
eq(F.findOnShelf(facts, { ...Q, text: "res:94bf" })[0].ids, ["a"], "…and the EM id");
eq(F.findOnShelf(facts, { ...Q, text: "arachne" })[0].ids, ["c"], "…and the address");
eq(F.findOnShelf(facts, { ...Q, types: ["image"] })[0].ids, ["a", "d"], "the type pill");
eq(F.findOnShelf(facts, { ...Q, stamped: false })[0].ids, ["c", "d"], "«da timbrare»");
eq(F.findOnShelf(facts, { ...Q, inUse: true })[0].ids, ["b"], "«in uso nel grafo»");
eq(F.findOnShelf(facts, { ...Q, study: "this" })[0].ids, ["a"], "«questo studio»");
eq(F.findOnShelf(facts, { ...Q, where: "web" })[0].ids, ["c"], "«sul web»");
eq(F.findOnShelf(facts, { ...Q, text: "nessuno" }), [], "nothing answers: no group");
const byFolder = F.findOnShelf(facts, { ...Q, group: "folder" });
eq(byFolder.map((g) => [g.label, g.ids]), [["/s/drone", ["a", "d"]], ["/s/EM/DosCo", ["b"]], ["arachne.dainst.org", ["c"]]], "grouped by folder, by label");
const byAct = F.findOnShelf(facts, { ...Q, group: "act" });
eq(byAct.map((g) => g.label), ["Scaricato dal web · 29/09/2026", "Scheda", null], "grouped by act: the group of «none» last");
eq(F.findOnShelf(facts, { ...Q, group: "doc" }).map((g) => [g.label, g.ids.length]), [["D.07.01", 1], [null, 3]], "grouped by document");
eq(F.findOnShelf(facts, { ...Q, group: "type" }).map((g) => g.label), ["document", "image", "web_page"], "grouped by type (the caller words them)");
const pc = F.pillCounts(facts, { ...Q, types: ["image"] });
eq(pc.types.get("document"), 1, "a type pill counts what pressing it would ADD (the other filters held)");
eq(pc.stamped, [1, 1], "the stamped pills count within the images");
eq(pc.where.get("web"), undefined, "no image on the web: the pill has no number to offer");
eq(F.rangeOf(["a", "b", "c", "d"], "d", "b"), ["b", "c", "d"], "⇧-click: the range shown, either way");
eq(F.rangeOf(["a", "b"], "z", "b"), ["b"], "an anchor no longer shown: just the one clicked");
ok(F.fold("Città") === "citta", "fold");
console.log(`shelf-find: ${checks} checks passed`);
