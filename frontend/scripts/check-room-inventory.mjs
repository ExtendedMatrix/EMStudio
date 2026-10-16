/**
 * MICRO-LA-BARRA-E-LE-STANZE · P2 — the inventory of a graph's resources before
 * it goes into a room: the DIALOG's half (`src/room-inventory.ts`, pure). Since
 * MICRO-PORTA-IN-STANZA-DAL-MOTORE (16 Oct 2026) the RULES are the engine's
 * (`s3dgraphy.room_import`: which files, where a path resolves, what the node
 * has, the photo sessions of L1, what goes up and how it is hosted) and are
 * tested there (`s3Dgraphy/tests/test_room_import*.py`, the L1 cases EMtools'
 * `test_inventory.py` had); here: the engine's plan read into the dialog's five
 * groups, the defaults, the person's choices, those choices handed back in the
 * engine's terms, the confirmation of «Move here» (F1), the closing report.
 * Bundled with the project's esbuild, run in node.
 *
 *   node scripts/check-room-inventory.mjs
 *
 * The plan is written by hand here in the shape the bridge hands it
 * (`_RI_ROW_KEYS`); the bridge against a fake node is
 * `check-room-import-bridge.mjs`, the live half `check-interactions.mjs TP2.live`.
 */

import assert from "node:assert/strict";
import * as esbuild from "esbuild";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}room-inventory.ts`], bundle: true, format: "esm", write: false });
const I = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const SHA = (n) => "sha256:" + String(n).repeat(64).slice(0, 64);

console.log("1 · the engine's groups are the dialog's");
eq(I.ENGINE_GROUP, { found: "on_disk", stored: "in_store", elsewhere: "elsewhere", external: "external", missing: "missing" },
   "found/stored ↔ on this computer/already in the storage");
eq(I.INV_GROUPS, ["on_disk", "in_store", "elsewhere", "external", "missing"], "five groups, in the dialog's order");
ok(!("candidatesOf" in I) && !("buildInventory" in I) && !("locatorKind" in I) && !("resolveLocal" in I)
   && !("sessionLots" in I), "the rules are not here any more: no second implementation of the engine's");

console.log("2 · a plan read: groups, sizes, defaults, lots");
const photos = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, graph_id: "study", name: `DJI_${i}.JPG`,
  locator: `/Users/x/drone/DJI_${i}.JPG`, path: `/Users/x/drone/DJI_${i}.JPG`, group: "found", choice: "upload",
  size: 100, sha256: SHA(3 + (i % 6)), batch_id: "session:DJI FC3582@2026:09:30 10:00:00",
  batch_name: "DJI FC3582 · 2026-09-30 10:00–10:11", batch_proposed: true }));
const plan = {
  rows: [
    { id: "doc", graph_id: "study", name: "D.01", locator: "DosCo/D.01.jpeg", path: "/a/EM/DosCo/D.01.jpeg",
      group: "found", choice: "upload", size: 1000, sha256: SHA(1) },
    { id: "ext", graph_id: "study", name: "Link", locator: "http://osiris.itabc.cnr.it/x.jpeg", group: "external",
      choice: "reference", note: "stays where it is" },
    { id: "blend", graph_id: "study", name: "ME a", locator: "blend://x.blend#Mesh/ME_a", group: "external",
      choice: "reference", note: "a datablock in a .blend: a reference by digest" },
    { id: "f1", graph_id: "study", name: "m.obj", locator: "RM/m.obj", group: "missing", choice: "skip",
      note: "not on this disk: RM/m.obj" },
    { id: "scan", graph_id: "study", name: "scan.e57", locator: "/scans/scan.e57", group: "stored", choice: "skip",
      size: 5000, sha256: SHA(2), batch_id: "acq", batch_name: "Laser 2026" },
    { id: "tiles", graph_id: "study", name: "TempluMare", locator: "../RB/cesium/TempluMare/tileset.json",
      path: "/a/RB/cesium/TempluMare/tileset.json", tree: "/a/RB/cesium/TempluMare", group: "found",
      choice: "upload", size: 198000, note: "a tree: every file of it goes up" },
    { id: "photos-dir", graph_id: "study", name: "raw", locator: "/a/raw", path: "/a/raw", group: "found",
      choice: "reference", size: 7000, note: "a folder: pack it (.3tz) to upload it as one asset" },
    ...photos,
  ],
  lots: [{ key: photos[0].batch_id, name: photos[0].batch_name, ids: photos.map((p) => p.id), camera: "DJI FC3582",
           from: "2026:09:30 10:00:00", to: "2026:09:30 10:11:00", graph_id: "study", confirmed: false },
         { key: "acq", name: "Laser 2026", ids: ["scan"], graph_id: "study", confirmed: true, declared: true }],
  where: { created: true, seedable: true },
};
const inv = I.inventoryFromPlan(plan);
eq(I.INV_GROUPS.map((k) => inv.groups[k].count), [15, 1, 0, 2, 1], "five groups with their counts");
eq(inv.groups.on_disk.bytes, 1000 + 198000 + 7000 + 1200, "…and their sizes (a tree weighs its files)");
ok(inv.items.filter((i) => i.group === "on_disk" && !i.fixed).every((i) => i.choice === "upload"),
   "on the disk → upload is the default («sale tutto»), a tileset folder too (file by file)");
const dir = inv.items.find((i) => i.id === "photos-dir");
ok(dir.fixed && dir.choice === "reference" && /pack it/.test(dir.why), "a folder that is not a tileset stays a reference, and says why");
ok(inv.items.find((i) => i.id === "tiles").tree, "the tileset is a tree");
ok(inv.items.filter((i) => i.group !== "on_disk").every((i) => i.choice === "skip"), "the rest has nothing to send");
eq(inv.items.find((i) => i.id === "doc").sha256, SHA(1), "the digest, normalised");
eq(I.toUpload(inv), { count: 14, bytes: 1000 + 198000 + 1200 }, "what is about to go up");
const drone = inv.lots.find((l) => l.proposed);
ok(drone && drone.ids.length === 12 && drone.camera === "DJI FC3582" && drone.bytes === 1200,
   "L1 · the engine's PROPOSED session, with its members and weight");
ok(drone.confirmed === false, "…not confirmed until the person says so");
I.confirmLot(inv, drone.key, true);
ok(drone.confirmed, "…the yes makes it one acquisition");
const acq = inv.lots.find((l) => l.key === "acq");
ok(acq && !acq.proposed && acq.confirmed && acq.acquisition === "acq", "a lot the graph declares (an acquisition) is no proposal");
I.confirmLot(inv, "acq", false);
ok(acq.confirmed, "…and cannot be un-confirmed");

console.log("3 · the choices");
I.choose(inv, { lot: drone.key }, "reference");
eq(I.toUpload(inv).count, 2, "a lot is chosen with ONE choice");
I.choose(inv, { group: "on_disk" }, "upload");
eq(I.toUpload(inv).count, 14, "…and a whole group with one");
eq(dir.choice, "reference", "…which does not touch the folder the engine keeps a reference");
I.choose(inv, { id: "doc" }, "skip");
eq(I.toUpload(inv).count, 13, "…and one file by itself");
I.choose(inv, { id: "scan" }, "upload");
eq(inv.items.find((i) => i.id === "scan").choice, "skip", "something already in the store cannot be «uploaded»");
const ch = I.engineChoices(inv);
eq(ch.per_item.doc, "skip", "the choices in the engine's terms: per_item by id");
ok(!("photos-dir" in ch.per_item) && !("scan" in ch.per_item) && !("ext" in ch.per_item),
   "…only the files there is something to decide about");
eq([ch.move, ch.elsewhere, ch.lots], [[], "host", [drone.key]], "…no move, the engine's default for the elsewhere, the confirmed lot");

console.log("4 · F1 · a file at home in another room: hosted here, or «Move here», confirmed");
const finv = I.inventoryFromPlan({ rows: [
  { id: "podio", name: "podio.glb", locator: "/x/podio.glb", group: "elsewhere", choice: "move", size: 900,
    sha256: SHA(7), home: "tempio-a", note: "at home in the room tempio-a" },
  { id: "pianta", name: "pianta.pdf", locator: "/x/pianta.pdf", group: "elsewhere", choice: "move", size: 50,
    sha256: SHA(8), home: "tempio-a" },
  { id: "nuovo", name: "nuovo.jpg", locator: "/x/nuovo.jpg", path: "/x/nuovo.jpg", group: "found", choice: "upload",
    size: 10, sha256: SHA(9) }] });
eq(finv.groups.elsewhere.count, 2, "bytes the node has, kept in another room, are their own group");
ok(finv.items.filter((i) => i.group === "elsewhere").every((i) => i.choice === "host") && finv.elsewhereMode === "host",
   "the default is the ENGINE's: hosted here as they are, their home unchanged");
eq(I.toUpload(finv).count, 1, "…and they are never uploaded again");
I.choose(finv, { id: "pianta" }, "upload");
eq(finv.items.find((i) => i.id === "pianta").choice, "host", "a file at home elsewhere cannot be «uploaded»");
I.choose(finv, { id: "nuovo" }, "move");
eq(finv.items.find((i) => i.id === "nuovo").choice, "upload", "a file only on this disk cannot be «moved»");
I.choose(finv, { id: "podio" }, "move");
I.choose(finv, { id: "pianta" }, "reference");
eq(finv.items.find((i) => i.id === "pianta").choice, "host",
   "one by one: «Move here» or the group's answer — a reference for ONE file is not something the engine takes");
eq(I.toMove(finv).map((i) => i.id), ["podio"], "…move this one");
I.choose(finv, { group: "elsewhere" }, "reference");
eq([finv.elsewhereMode, finv.items.find((i) => i.id === "pianta").choice], ["reference", "reference"],
   "the GROUP can say: leave them references to the room they live in");
I.choose(finv, { group: "elsewhere" }, "move");
const mp = I.movePlan(I.toMove(finv), new Map([
  ["podio", { home: "tempio-a", references: ["tempio-a", "tempio-c"], can_move: true }],
  ["pianta", { home: "tempio-a", references: ["tempio-a"], can_move: false, why_not: "only its owner may move it out" }]]));
eq(mp.movable.map((i) => i.id), ["podio"], "the confirmation lists what may move…");
eq(mp.blocked.map((b) => [b.item.id, b.why]), [["pianta", "only its owner may move it out"]], "…what may not, with the node's reason…");
eq([mp.leave, mp.references], [["tempio-a"], ["tempio-a", "tempio-c"]], "…the rooms it leaves and the rooms whose graphs will hold a reference");
eq(I.movePlan(I.toMove(finv), new Map([["podio", { error: "403 nope" }]])).blocked.length, 2, "an unanswered question moves nothing");
eq(I.engineChoices(finv, ["podio"]), { per_item: { nuovo: "upload" }, move: ["podio"], elsewhere: "reference", lots: [] },
   "to the engine: what the node let move, and what the others become");

console.log("5 · the report is the engine's");
const rep = I.reportOf({ uploaded: { files: 7352, bytes: 394000000 }, already: { files: 412 }, references: 146,
  plan: { missing: 0 }, failed: [], rewritten: { moved_here: 1 }, seeded: { applied: 5147 } });
eq(rep, { uploaded: 7352, bytes: 394000000, already: 412, moved: 1, references: 146, missing: 0, failed: 0, seeded: 5147 },
   "uploaded N (bytes) · already on the node · moved here · references · missing · failed · operations seated");
eq(I.reportOf({}).uploaded, 0, "…and an empty answer is zeros, not a throw");
eq(I.humanBytes(1536), "1.50 KB", "bytes for a person");
eq(I.humanBytes(2 * 1024 ** 3), "2.00 GB", "…in GB");

console.log("6 · L1 · the thresholds of the lot are the person's (Settings), the rule is the engine's");
// D3 (E.D., 4 Oct 2026) · 30 minutes and 5 photos are the DEFAULTS, changeable
// in Settings: the thresholds reach the proposal, which stays unconfirmed
{
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)),
                              removeItem: (k) => mem.delete(k) };
  const sb = await esbuild.build({ entryPoints: [`${SRC}settings.ts`], bundle: true, format: "esm", write: false });
  const S = await import("data:text/javascript;base64," + Buffer.from(sb.outputFiles[0].text).toString("base64"));
  eq(S.lotThresholds(), { gapSeconds: 1800, minPhotos: 5 }, "D3 · the defaults: 30 minutes, 5 photos");
  const s = S.getSettings();
  s.interaction.lotGapMinutes = 45; s.interaction.lotMinPhotos = 3;
  S.saveSettings(s);
  const th = S.lotThresholds();
  eq(th, { gapSeconds: 2700, minPhotos: 3 }, "D3 · changed in Settings, read back");
  // …and they reach the ENGINE: the dialog sends them with the plan
  const { readFileSync, existsSync } = await import("node:fs");
  const main = readFileSync(`${SRC}main.ts`, "utf8");
  ok(/lot_gap_seconds: gapSeconds, lot_min_photos: minPhotos/.test(main), "D3 · the plan is asked with the person's thresholds");
  const S3D = new URL("../../../s3Dgraphy/", import.meta.url).pathname;
  if (existsSync(`${S3D}.venv/bin/python`)) {
    const { execFileSync } = await import("node:child_process");
    const T0 = Date.UTC(2026, 8, 30, 10, 0, 0) / 1000;
    const at = (x) => { const d = new Date((T0 + x) * 1000).toISOString(); return `${d.slice(0, 4)}:${d.slice(5, 7)}:${d.slice(8, 10)} ${d.slice(11, 19)}`; };
    const wide = Array.from({ length: 3 }, (_, i) => ({ id: `w${i}`, path: `/w/${i}.jpg`, exif: { camera: "X", taken_at: at(2400 * i) } }));
    const lots = (gap, least) => JSON.parse(execFileSync(`${S3D}.venv/bin/python`, ["-c",
      "import json,sys; from s3dgraphy.room_import import inventory as i; print(json.dumps(i.session_lots(json.loads(sys.argv[1]), gap_seconds=float(sys.argv[2]), min_photos=int(sys.argv[3]))))",
      JSON.stringify(wide), String(gap), String(least)], { env: { ...process.env, PYTHONPATH: `${S3D}src` } }).toString());
    eq(lots(1800, 5).length, 0, "D3 · the engine, with the defaults: 3 shots 40 min apart are no lot");
    eq(lots(th.gapSeconds, th.minPhotos).map((l) => l.ids.length), [3], "D3 · …with 45 min / 3 photos they are one");
  } else console.log("  (the engine's half skipped: no s3Dgraphy venv beside this checkout)");
  s.interaction.lotGapMinutes = -1; s.interaction.lotMinPhotos = "x";
  S.saveSettings(s);
  eq(S.lotThresholds(), { gapSeconds: 1800, minPhotos: 5 }, "D3 · a value that is not a number falls back to the default");
}

console.log(`\nroom-inventory: ${checks} checks passed`);
