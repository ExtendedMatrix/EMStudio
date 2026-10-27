// MICRO-ARCHIVIO-2 · executable check of src/files-browser.ts — the File window
// «alla Blender»: the system files hidden, the kinds of the type filter, the
// columns' order, the line of state, the tab the panel opens on, the presets
// of Timbro (built-in and saved) and of Ottimizza, the favourites and the
// recent folders.
//
//   node scripts/check-files-browser.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}files-browser.ts`], bundle: true, format: "esm", write: false });
const F = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (c, what) => { assert.ok(c, what); checks++; };

// the system files (AR9): Templu Mare's EM folder has them all
for (const n of ["D.01.jpg.stamp.json", "TempluMare_v4.em.json.bak-20261022-143029", "x.bak", "x.bak2",
                 "TempluMare_v4.em.json.prima-shiftz-2026-10-23", "GreatTemple_2026_v2.blend1", "~$scheda.docx", ".DS_Store", "a.tmp"])
  ok(F.isSystemFile(n), `${n} is a system file`);
for (const n of ["GT16_piu_SaggioB.em.json", "OB_PODIO_LOD1.obj", "OB_PODIO_LOD1.mtl", "TempluMare_2021.blend", "D.07.01.pdf", "README.md"])
  ok(!F.isSystemFile(n), `${n} is not a system file`);

// the kinds
const k = (name, type = "file") => F.kindOf({ name, type });
eq([k("DJI_0220.JPG"), k("D.07.01.pdf"), k("SM_X@lod4-web.glb"), k("OB.obj"), k("TempluMare.3tz"), k("tileset.json"),
    k("GT16_piu_SaggioB.em.json"), k("forum.shp"), k("scavi.gpkg"), k("mura.geojson"), k("orto.tif"), k("EM", "dir"), k("notes")],
   ["image", "document", "model", "model", "tileset", "tileset", "emjson", "gis", "gis", "gis", "image", "dir", "other"], "the kinds");
eq(F.KIND_FILTERS, ["all", "image", "document", "model", "tileset", "emjson", "gis"], "the type filter's kinds, GIS among them (V4)");
ok(F.isOptimizable("a.glb") && F.isOptimizable("a.OBJ") && F.isOptimizable("a.gltf") && !F.isOptimizable("a.ply") && !F.isOptimizable("a.3tz"),
   "gltfpack's inputs: glb, gltf, obj");

// the rows: folders first, filtered, ordered by the column
const E = (name, type = "file", size = 0, mtime = 0) => ({ path: `/p/${name}`, name, type, size, mtime });
const list = [E("b.jpg", "file", 10, 3), E("A.pdf", "file", 50, 1), E("versions", "dir"), E("c.jpg.stamp.json", "file", 1, 9),
              E("D.10.jpg", "file", 30, 2), E("D.9.jpg", "file", 20, 4), E("època.png", "file", 5, 5)];
const stamped = new Set(["/p/b.jpg", "/p/D.9.jpg"]);
const used = new Set(["/p/A.pdf"]);
const facts = { stamped: (p) => stamped.has(p), used: (p) => used.has(p) };
const names = (o) => F.visibleEntries(list, { facts, ...o }).map((e) => e.name);
eq(names({}), ["versions", "A.pdf", "b.jpg", "D.9.jpg", "D.10.jpg", "època.png"], "by name: folders first, numbers in order, the stamp hidden");
eq(names({ showSystem: true }).includes("c.jpg.stamp.json"), true, "the system files shown when asked");
eq(names({ desc: true }), ["versions", "època.png", "D.10.jpg", "D.9.jpg", "b.jpg", "A.pdf"], "by name, the other way round");
eq(names({ sort: "size" }), ["versions", "A.pdf", "D.10.jpg", "D.9.jpg", "b.jpg", "època.png"], "by weight: the heaviest first");
eq(names({ sort: "date" }), ["versions", "època.png", "D.9.jpg", "b.jpg", "D.10.jpg", "A.pdf"], "by date: the newest first");
eq(names({ sort: "stamp" }), ["versions", "b.jpg", "D.9.jpg", "A.pdf", "D.10.jpg", "època.png"], "by stamp: the stamped first, then by name");
eq(names({ sort: "use" })[1], "A.pdf", "in the graph first");
eq(names({ query: "EPOCA" }), ["època.png"], "the search folds case and accents (and no folder matches)");
eq(names({ kind: "document" }), ["versions", "A.pdf"], "a kind keeps the folders, the way to its files");

// the line of state (AR10)
const s = F.statusCounts(list, ["/p/b.jpg", "/p/D.10.jpg"], facts, 6, false);
eq([s.files, s.stamped, s.unstamped, s.chosen, s.chosenStamped, s.hidden], [5, 2, 3, 2, 1, 1], "the counts: files, stamped, to stamp, chosen, hidden");
eq(F.statusCounts(list, [], facts, 7, true).hidden, 0, "nothing hidden when the system files are shown");

// the tab when nobody chose one
eq(F.autoTab({ drafting: true, chosen: 0, chosenUnstamped: 0, chosenModels: 0 }), "stamp", "the composer open → Timbro");
eq(F.autoTab({ drafting: false, chosen: 3, chosenUnstamped: 1, chosenModels: 0 }), "stamp", "files to stamp → Timbro");
eq(F.autoTab({ drafting: false, chosen: 3, chosenUnstamped: 0, chosenModels: 0 }), "info", "all stamped → Info");
eq(F.autoTab({ drafting: false, chosen: 2, chosenUnstamped: 0, chosenModels: 2 }), "optimize", "stamped models → Ottimizza");
eq(F.autoTab({ drafting: false, chosen: 0, chosenUnstamped: 0, chosenModels: 0 }), "info", "nothing chosen → Info, the folder's gestures");
eq(F.TOOL_TABS, ["stamp", "optimize", "room", "info"], "four tabs (V2 = 4)");

// the presets of Timbro: the kinds exist in the DTC vocabulary
const rules = JSON.parse(readFileSync(new URL("../src/assets/em_visual_rules.json", import.meta.url), "utf8"));
const findKinds = (o) => { if (o && typeof o === "object") { if (o.acquisition && o.process) return o; for (const v of Object.values(o)) { const r = findKinds(v); if (r) return r; } } return null; };
const kinds = findKinds(rules);
for (const p of F.BUILTIN_STAMP_PRESETS) {
  ok(p.origin ? kinds.acquisition[p.kind] : kinds.process[p.kind], `preset ${p.id}: «${p.kind}» is a kind of the vocabulary`);
  ok(p.labelKey && p.builtin, `preset ${p.id} is a built-in with its label`);
}
const mem = new Map();
const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
eq(F.readStampPresets(store), [], "no preset of the person at first");
F.saveStampPreset(store, { id: "", name: "Volo Segni", origin: true, kind: "photo", instrument: "DJI FC300X" });
F.saveStampPreset(store, { id: "", name: "volo segni", origin: true, kind: "photo", instrument: "DJI FC330" });
const saved = F.readStampPresets(store);
eq(saved.length, 1, "a name already used is replaced");
eq([saved[0].name, saved[0].instrument, saved[0].builtin], ["volo segni", "DJI FC330", false], "the preset saved, with its instrument");
eq(F.saveStampPreset(store, { id: "", name: "  ", origin: true, kind: "photo" }).length, 1, "a preset without a name is not saved");
eq(F.dropStampPreset(store, saved[0].id), [], "a preset of the person is removed");
mem.set(F.STAMP_PRESETS_KEY, "{broken");
eq(F.readStampPresets(store), [], "a broken store reads as none");

// the destinations of Ottimizza: the names of Templu Mare's RB/versions
eq(F.OPTIMIZE_PRESETS.map((p) => `${p.lod}-${p.destination}`), ["lod4-web", "lod4-mobile", "lod3-vr", "lod3-aton-heriverse", "lod1-print"],
   "the suffixes, as SM_…@lod4-web.glb and @lod3-aton-heriverse.glb");
ok(F.OPTIMIZE_PRESETS.every((p) => p.ratio > 0 && p.ratio <= 1), "every ratio is a share of the triangles");

// the places: favourites and recent folders
eq(F.pushRecentDir(["/a", "/b", "/c"], "/b"), ["/b", "/a", "/c"], "a recent folder goes to the head, once");
eq(F.pushRecentDir(["1", "2", "3"], "4", 3), ["4", "1", "2"], "the recent folders have a cap");
eq(F.toggleFavorite(["/a"], "/b"), ["/a", "/b"], "a star on");
eq(F.toggleFavorite(["/a", "/b"], "/a"), ["/b"], "a star off");
mem.set(F.FAVORITES_KEY, JSON.stringify(["/x", 3, ""]));
eq(F.readPathList(store, F.FAVORITES_KEY), ["/x"], "only paths are read");

console.log(`check-files-browser: ${checks} checks passed`);
