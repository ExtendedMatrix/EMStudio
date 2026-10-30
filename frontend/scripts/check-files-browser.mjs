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
eq(F.OPTIMIZE_PRESETS.map((p) => `${p.lod}-${p.destination}`), ["lod4-web", "lod4-mobile", "lod3-aton-heriverse", "lod1-print", "lod3-realtime"],
   "the suffixes, as SM_…@lod4-web.glb and @lod3-aton-heriverse.glb");
ok(F.OPTIMIZE_PRESETS.every((p) => p.ratio > 0 && p.ratio <= 1), "every ratio is a share of the triangles");
// MICRO-OTTIMIZZA-1 · compression only where the Viewer and the destination read it
const P = Object.fromEntries(F.OPTIMIZE_PRESETS.map((p) => [p.id, p]));
ok(P.web.ktx2 && P.web.meshopt && P.web.texturePx === 1024 && P.web.ratio === 0.1, "web: 10% of the triangles, KTX2 at 1024, meshopt (round 0)");
ok(P.mobile.ktx2 && P.mobile.meshopt && P.mobile.texturePx === 512, "mobile: KTX2 at 512, meshopt");
ok(!P.heriverse.ktx2 && !P.heriverse.meshopt && P.heriverse.ratio === 1, "Heriverse/ATON: whole, nothing compressed (not proved there)");
ok(!P.print.ktx2 && !P.print.meshopt && P.print.ratio === 1, "print: whole, nothing compressed");
eq(P.heriverse.use, ["heriverse", "aton"], "the uses are s3Dgraphy's");
eq(P.mobile.use, ["mobile_ar"], "mobile is s3Dgraphy's mobile_ar");
// the engines (precisazione 3): each destination its default, said and changeable
eq(F.engineFor(P.web, null), "gltfpack", "the web's engine is gltfpack");
eq(F.engineFor(P.experience, {}), "blender3dsc", "the experiences' engine is Blender + 3DSC");
eq(F.engineFor(P.experience, { experience: "gltfpack" }), "gltfpack", "the person may change it");
eq(F.engineFor(P.web, { web: "nonsense" }), "gltfpack", "an engine the destination does not have is not taken");
ok(F.ENGINES_TODAY.has("gltfpack") && !F.ENGINES_TODAY.has("blender3dsc"), "Blender + 3DSC is round 3's");
ok(F.OPTIMIZE_PRESETS.every((p) => p.engines.includes(p.engine)), "every default is one of its engines");
// the memory said before a job starts (round 0's measures)
ok(F.variantMemoryMb(47 * 1048576) >= 220 && F.variantMemoryMb(47 * 1048576) < 400, "a 47 MB obj asks about 265 MB (measured 220)");
ok(F.variantMemoryMb(1100 * 1048576) >= 3100, "1.1 GB asks over 3.1 GB (measured 3.1)");
// a job in the status line
eq(F.jobLine({ id: "a", kind: "variants", label: "gltfpack · Web", state: "running", progress: 0.42, stage: "X@lod4-web.glb" }),
   "gltfpack · Web · X@lod4-web.glb 42%", "the job's line: label, stage, share");
ok(F.jobRunning({ state: "queued" }) && F.jobRunning({ state: "running" }) && !F.jobRunning({ state: "done" }), "queued and running are running");

// the places: favourites and recent folders
eq(F.pushRecentDir(["/a", "/b", "/c"], "/b"), ["/b", "/a", "/c"], "a recent folder goes to the head, once");
eq(F.pushRecentDir(["1", "2", "3"], "4", 3), ["4", "1", "2"], "the recent folders have a cap");
eq(F.toggleFavorite(["/a"], "/b"), ["/a", "/b"], "a star on");
eq(F.toggleFavorite(["/a", "/b"], "/a"), ["/b"], "a star off");
mem.set(F.FAVORITES_KEY, JSON.stringify(["/x", 3, ""]));
eq(F.readPathList(store, F.FAVORITES_KEY), ["/x"], "only paths are read");

// MICRO-OTTIMIZZA-2 · the tileset's queue as the tab says it before it starts
{
  const it = (name, mb, extra = {}) => ({ source: `/p/${name}.obj`, name, estimate_mb: mb, ...extra });
  const s1 = F.tilesetSchedule([it("a", 1000), it("b", 1000), it("c", 1000)], 2500, 4);
  ok(s1.parallel === 2 && s1.startMb === 2000 && s1.totalMb === 3000, "two start side by side under a 2.5 GB ceiling, the third waits");
  const s2 = F.tilesetSchedule([it("a", 1000), it("b", 1000), it("c", 1000)], 99999, 2);
  ok(s2.parallel === 2, "never more than the workers");
  const s3 = F.tilesetSchedule([it("big", 40000), it("a", 900), it("x", 10, { error: "no" }), it("y", 10, { exists: true })], 39000, 4);
  ok(s3.over.length === 1 && s3.over[0].name === "big" && s3.todo.length === 1 && s3.parallel === 1,
     "one that alone passes the ceiling is refused; refused and made ones are not counted");
  ok(F.formatMb(977) === "977 MB" && F.formatMb(15360, "it") === "15 GB" && F.formatMb(1536, "en") === "1.5 GB", "megabytes as a person reads them");
  ok(F.TILES_ENGINES[0] === "obj2tiles" && F.TILES_ENGINES_TODAY.has("obj2tiles") && !F.TILES_ENGINES_TODAY.has("blender3dsc"),
     "the tileset's engines: Obj2Tiles from here, Blender + 3DSC in Blender itself");
  ok(F.jobItemOpen({ state: "running" }) && !F.jobItemOpen({ state: "invalid" }), "a file of a batch is open while queued or running");
}

// MICRO-OTTIMIZZA-3 · Blender as the second way: what each way needs, the
// engines that run, the probe in sentences
{
  const p52 = { ok: true, path: "/B", blender: "5.2.0 LTS", python: "3.13.13", seconds: 1.1, peak_mb: 303,
    emtools: { loaded: false, why: { code: "wheels", wheels: "3.11", python: "3.13", version: "1.6.0-dev.32" } },
    dsc: { loaded: true, headless: "bl_ext.x.dsc.headless", rebake_atlas: true, stamps: false } };
  ok(F.blenderCan(p52, "lod_set") && F.blenderCan(p52, "atlas") && !F.blenderCan(p52, "prepare"),
     "5.2 with EM Tools on cp311 wheels: the LOD set and the atlas yes, «Prepare» no");
  ok(!F.blenderCan({ ...p52, dsc: { loaded: true, headless: null } }, "lod_set"), "a 3DSC without its headless module cannot make the LOD set");
  ok(!F.blenderCan(null, "lod_set") && !F.blenderCan({ ok: false, path: "/B" }, "atlas"), "no probe, or a silent Blender: nothing");
  ok(F.blenderCan({ ...p52, emtools: { loaded: true, prepare_for_use: true } }, "prepare"), "EM Tools loaded with its operator: «Prepare» yes");
  ok(F.enginesToday(true, p52).has("blender3dsc") && !F.enginesToday(false, p52).has("blender3dsc")
     && !F.enginesToday(true, { ...p52, dsc: { loaded: false } }).has("blender3dsc") && F.enginesToday(false, null).has("gltfpack"),
     "Blender + 3DSC runs only with its switch on and 3DSC's LOD set found");
  const L = F.blenderLines(p52);
  eq(L.map((l) => [l.key, l.ok]), [["files.bl.answered", true], ["files.bl.why.wheels", false], ["files.bl.dscOkNoStamp", true]],
     "the probe in sentences: answered · EM Tools why not · 3DSC without stamps");
  eq([L[0].vars.python, L[1].vars.wheels, L[1].vars.python, L[1].vars.name], ["3.13", "3.11", "3.13", "EM Tools"],
     "«EM Tools does not load in Blender 5.2: its libraries are for Python 3.11, this Blender has Python 3.13»");
  eq(F.blenderLines({ ok: false, path: "/B", error: "exit 1" }).map((l) => l.key), ["files.bl.noAnswer"], "a Blender that did not answer");
  eq(F.blenderLines({ ...p52, dsc: { loaded: false, why: { code: "missing" } } })[2].key, "files.bl.why.missing", "3DSC not installed");
  ok(F.blenderMemoryMb("objects", 1e9) === 600 && F.blenderMemoryMb("lod_set", 47 * 1048576, 2 * 1048576) > F.blenderMemoryMb("atlas", 47 * 1048576, 2 * 1048576),
     "the memory of a Blender job: the LOD set asks more than the atlas");
  ok(F.BLENDER_EXPERIMENTAL_KEY === "emstudio.blenderExperimental", "the switch's key");
  const exp = F.OPTIMIZE_PRESETS.find((p) => p.id === "experience");
  ok(exp.engine === "blender3dsc" && F.engineFor(exp, {}) === "blender3dsc", "the experiences' default engine is Blender + 3DSC");
}

console.log(`check-files-browser: ${checks} checks passed`);
