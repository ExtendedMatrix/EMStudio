/**
 * MICRO-LA-BARRA-E-LE-STANZE · P2 — the inventory of a graph's resources before
 * it goes into a room, as `src/room-inventory.ts` (pure) decides it: which file
 * is which group, which photos travel as a LOT, what the default choices are,
 * and the closing report. Bundled with the project's esbuild, run in node.
 *
 * MICRO-ASSET-VERSIONI · F1 (a file at home in another room: «Move here»,
 * confirmed after the citing rooms are listed) and L1 (the lot rule: EM
 * document names and the DosCo are never a lot; a lot is a PROPOSED photo
 * session — same camera, EXIF times ≤ 30 min apart, ≥ 5 photos). Section 6
 * holds the same cases as EMtools' `tests/test_inventory.py::test_l1_*`.
 *
 *   node scripts/check-room-inventory.mjs
 *
 * The probes are given by hand here (the bridge and the store are the caller's);
 * the live half — Templu Mare carried into a room of the dev node — is
 * `check-interactions.mjs TP2.live`.
 */

import assert from "node:assert/strict";
import * as esbuild from "esbuild";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}room-inventory.ts`], bundle: true, format: "esm", write: false });
const I = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

console.log("1 · where a locator points");
eq(I.locatorKind("https://em.localhost:8443/em/v1/rooms/r/asset/sha256:" + "a".repeat(64)), "store", "a room asset is the store");
eq(I.locatorKind("s3://em/abc"), "store", "s3:// is a store");
eq(I.locatorKind("http://osiris.itabc.cnr.it/x.jpeg"), "external", "a URL is an external reference");
eq(I.locatorKind("smb://nas/scavo/foto.jpg"), "external", "a NAS share by smb:// is external");
eq(I.locatorKind("\\\\nas\\scavo\\foto.jpg"), "external", "a UNC path is external");
eq(I.locatorKind("/Users/x/DosCo/D.01.jpg"), "disk", "an absolute path is the disk");
eq(I.locatorKind("DosCo/D.01.jpg"), "disk", "a relative path is the disk");
eq(I.locatorKind("file:///Users/x/a.pdf"), "disk", "file:// is the disk");
eq(I.locatorKind(""), "none", "nothing is nothing");
eq(I.resolveLocal("DosCo/D.01.jpg", "/a/EM"), "/a/EM/DosCo/D.01.jpg", "relative → under the em.json's folder");
eq(I.resolveLocal("file:///a/b%20c.pdf", "/z"), "/a/b c.pdf", "file:// decoded");
eq(I.digestInLocator("https://n/v1/rooms/r/asset/sha256:" + "B".repeat(64)), "sha256:" + "b".repeat(64), "the digest a store URL names");
eq(I.normDigest("A".repeat(64)), "sha256:" + "a".repeat(64), "a bare hex gets its algorithm");

console.log("2 · the candidates, and the lots");
const photos = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `DJI_${i}.JPG`, node_type: "resource",
  data: { url: `/Users/x/drone/DJI_${i}.JPG` } }));
const g = { id: "study", edges: [
    { id: "e1", source: "set", target: "f1", edge_type: "has_file" },
    { id: "e2", source: "acq", target: "scan", edge_type: "dtc_had_output" },
  ], nodes: [
    { id: "doc", name: "D.01", node_type: "resource", data: { url: "DosCo/D.01.jpeg" } },
    { id: "ext", name: "Link", node_type: "resource", data: { url: "http://osiris.itabc.cnr.it/x.jpeg" } },
    { id: "set", name: "a model", node_type: "resource", data: { url: "RM/m.obj" } },
    { id: "f1", name: "m.obj", node_type: "resource_file", data: { path: "RM/m.obj" } },
    { id: "scan", name: "scan.e57", node_type: "resource", data: { url: "/scans/scan.e57" } },
    { id: "acq", name: "Laser 2026", node_type: "dtc_acquisition", data: {} },
    { id: "us", name: "US 1", node_type: "US", data: {} },
    ...photos,
  ] };
const c = I.candidatesOf([g]);
eq(c.map((x) => x.id).sort(), ["doc", "ext", "f1", "scan", ...photos.map((p) => p.id)].sort(),
   "every file the graph cites — the SET with has_file is not a file, its file is; a unit is nothing");
eq(c.find((x) => x.id === "scan").lotKey, "acq", "a file an acquisition produced travels in that acquisition's lot");
ok(c.filter((x) => photos.some((p) => p.id === x.id)).every((x) => !x.lotKey),
   "L1 · 12 photos in one folder are NOT a lot by themselves any more (the folder rule is gone)");
eq(c.find((x) => x.id === "doc").lotKey, null, "a single document is not a lot");

console.log("3 · the groups, the defaults, the choices");
const SHA = (n) => "sha256:" + String(n).repeat(64).slice(0, 64);
const probes = new Map([
  ["doc", { group: "on_disk", size: 1000, sha256: SHA(1), path: "/a/EM/DosCo/D.01.jpeg" }],
  ["ext", { group: "external", size: null, sha256: null }],
  ["f1", { group: "missing", size: null, sha256: null, why: "bridge 404" }],
  ["scan", { group: "in_store", size: 5000, sha256: SHA(2) }],
  ...photos.map((p, i) => [p.id, { group: "on_disk", size: 100, sha256: SHA(3 + (i % 6)),
    path: `/Users/x/drone/DJI_${i}.JPG`,
    exif: { camera: "DJI FC3582", takenAt: `2026:09:30 10:${String(i).padStart(2, "0")}:00` } }]),
]);
const inv = I.buildInventory(c, probes);
eq(I.INV_GROUPS.map((k) => inv.groups[k].count), [13, 1, 0, 1, 1], "five groups with their counts (none at home elsewhere)");
eq(inv.groups.on_disk.bytes, 2200, "…and their sizes");
ok(inv.items.filter((i) => i.group === "on_disk").every((i) => i.choice === "upload"), "on the disk → upload is the default («sale tutto»)");
ok(inv.items.filter((i) => i.group !== "on_disk").every((i) => i.choice === "skip"), "the rest has nothing to send");
eq(I.toUpload(inv), { count: 13, bytes: 2200 }, "what is about to go up");
const drone = inv.lots.find((l) => l.proposed);
ok(drone && drone.ids.length === 12 && drone.camera === "DJI FC3582", "L1 · 12 shots of one drone a minute apart: a session, PROPOSED");
ok(drone && drone.confirmed === false, "…and not confirmed until the person says so");
I.confirmLot(inv, drone.key, true);
ok(drone.confirmed, "…the yes makes it one acquisition");
I.confirmLot(inv, "acq", false);
ok(inv.lots.find((l) => l.key === "acq").confirmed, "a lot the graph declares (an acquisition) is not a proposal to un-confirm");
I.choose(inv, { lot: drone.key }, "reference");
eq(I.toUpload(inv), { count: 1, bytes: 1000 }, "a lot is chosen with ONE choice");
I.choose(inv, { group: "on_disk" }, "upload");
eq(I.toUpload(inv).count, 13, "…and a whole group with one");
I.choose(inv, { id: "doc" }, "skip");
eq(I.toUpload(inv).count, 12, "…and one file by itself");
I.choose(inv, { id: "scan" }, "upload");
ok(inv.items.find((i) => i.id === "scan").choice === "skip", "something already in the store cannot be «uploaded»");
eq(inv.lots.map((l) => [l.key, l.ids.length, l.bytes]),
   [["acq", 1, 5000], [drone.key, 12, 1200]], "the lots, with their members and weight");

console.log("4 · the report");
const outcomes = photos.map((p, i) => ({ id: p.id, ok: true, sent: i < 10, bytes: i < 10 ? 100 : 0 }));
eq(I.inventoryReport(inv, outcomes), { uploaded: 10, bytes: 1000, already: 3, moved: 0, references: 1, missing: 1, failed: 0 },
   "uploaded N (bytes) · already there (HEAD said so, or in_store) · references · missing");
const again = I.inventoryReport(inv, photos.map((p) => ({ id: p.id, ok: true, sent: false, bytes: 0 })));
eq([again.uploaded, again.bytes], [0, 0], "a second pass where the store has everything uploads nothing");
eq(I.humanBytes(1536), "1.50 KB", "bytes for a person");

console.log("5 · F1 · a file at home in another room: «Move here», confirmed");
const fc = I.candidatesOf([{ id: "b", edges: [], nodes: [
  { id: "podio", name: "podio.glb", node_type: "resource", data: { url: "/x/podio.glb" } },
  { id: "pianta", name: "pianta.pdf", node_type: "resource", data: { url: "/x/pianta.pdf" } },
  { id: "nuovo", name: "nuovo.jpg", node_type: "resource", data: { url: "/x/nuovo.jpg" } }] }]);
const finv = I.buildInventory(fc, new Map([
  ["podio", { group: "elsewhere", size: 900, sha256: SHA(7), path: "/x/podio.glb", home: "tempio-a" }],
  ["pianta", { group: "elsewhere", size: 50, sha256: SHA(8), path: "/x/pianta.pdf", home: "tempio-a" }],
  ["nuovo", { group: "on_disk", size: 10, sha256: SHA(9), path: "/x/nuovo.jpg" }]]));
eq(finv.groups.elsewhere.count, 2, "bytes the node has, kept in another room, are their own group");
ok(finv.items.filter((i) => i.group === "elsewhere").every((i) => i.choice === "move"), "the proposal is «Move here»");
eq(I.toUpload(finv).count, 1, "…and they are never uploaded again");
I.choose(finv, { id: "pianta" }, "upload");
eq(finv.items.find((i) => i.id === "pianta").choice, "move", "a file at home elsewhere cannot be «uploaded»");
I.choose(finv, { id: "nuovo" }, "move");
eq(finv.items.find((i) => i.id === "nuovo").choice, "upload", "a file only on this disk cannot be «moved»");
I.choose(finv, { id: "pianta" }, "reference");
eq(I.toMove(finv).map((i) => i.id), ["podio"], "one by one: move this, leave that as a reference");
I.choose(finv, { group: "elsewhere" }, "move");
const plan = I.movePlan(I.toMove(finv), new Map([
  ["podio", { home: "tempio-a", references: ["tempio-a", "tempio-c"], can_move: true }],
  ["pianta", { home: "tempio-a", references: ["tempio-a"], can_move: false, why_not: "only its owner may move it out" }]]));
eq(plan.movable.map((i) => i.id), ["podio"], "the confirmation lists what may move…");
eq(plan.blocked.map((b) => [b.item.id, b.why]), [["pianta", "only its owner may move it out"]], "…what may not, with the node's reason…");
eq([plan.leave, plan.references], [["tempio-a"], ["tempio-a", "tempio-c"]], "…the rooms it leaves and the rooms whose graphs will hold a reference");
eq(I.movePlan(I.toMove(finv), new Map([["podio", { error: "403 nope" }]])).blocked.length, 2, "an unanswered question moves nothing");
const frep = I.inventoryReport(finv, [{ id: "podio", ok: true, sent: false, bytes: 0, moved: true, home: "b" },
  { id: "nuovo", ok: true, sent: true, bytes: 10 }]);
eq([frep.uploaded, frep.moved, frep.already, frep.references], [1, 1, 0, 1],
   "the report: uploaded 1 · moved here 1 · the one that did not move is a reference");
eq(I.humanBytes(2 * 1024 ** 3), "2.00 GB", "…in GB");

console.log("6 · L1 · the lot rule (same cases as EMtools test_inventory.py)");
for (const n of ["D.01", "D.1.jpg", "D.12.jpg", "D.01.01.jpeg", "D.07 Maison Carree Nimes.png", "D.11_scan.tif", "D.3-bis.jpg"])
  ok(I.isEmDocumentName(n), `«${n}» is an EM document`);
for (const n of ["DSC_0001.JPG", "D.jpg", "DJI_0001.JPG", "D.01a.jpg", "IMG_D.01.jpg", "d.01.jpg"])
  ok(!I.isEmDocumentName(n), `«${n}» is not`);
ok(I.inDosco("/a/DosCo/x.jpg") && I.inDosco("/a/dosco/sub/x.jpg"), "a folder called DosCo is the DosCo");
ok(!I.inDosco("/a/DosCoX/x.jpg"), "…not one whose name only starts so");
ok(I.inDosco("/b/docs/x.jpg", ["/b/docs"]) && !I.inDosco("/b/docs2/x.jpg", ["/b/docs"]), "a declared DosCo folder, by path");
const T0 = Date.UTC(2026, 8, 30, 10, 0, 0) / 1000;
const at = (s) => { const d = new Date((T0 + s) * 1000).toISOString(); return `${d.slice(0, 4)}:${d.slice(5, 7)}:${d.slice(8, 10)} ${d.slice(11, 19)}`; };
const CANON = "Canon EOS R5 #012345";
const shots = [
  ...Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, path: `/f/session/IMG_${i}.JPG`, exif: { camera: CANON, takenAt: at(15 * i) } })),
  { id: "tif", path: "/f/session/IMG_0200.tif", exif: { camera: CANON, takenAt: at(200) } },
  { id: "doc-out", path: "/f/session/D.20.jpg", exif: { camera: CANON, takenAt: at(100) } },
  ...[0, 1].map((i) => ({ id: `late${i}`, path: `/f/session/IMG_10${i}.JPG`, exif: { camera: CANON, takenAt: at(7200 + 10 * i) } })),
  ...[0, 1, 2].map((i) => ({ id: `px${i}`, path: `/f/session/PXL_${i}.jpg`, exif: { camera: "Google Pixel 8", takenAt: at(20 * i) } })),
  ...[1, 2, 3, 4, 5].map((i) => ({ id: `dosco${i}`, path: `/f/DosCo/D.07.0${i}.jpg`, exif: { camera: CANON, takenAt: at(5 * i) } })),
  ...[1, 2, 3, 4, 5].map((i) => ({ id: `ddir${i}`, path: `/f/docs/scan_${i}.jpg`, exif: { camera: CANON, takenAt: at(6 * i) } })),
  ...Array.from({ length: 8 }, (_, i) => ({ id: `nx${i}`, path: `/f/noexif/foto_${i}.jpg`, exif: null })),
  { id: "pdf", path: "/f/session/report.pdf", exif: { camera: CANON, takenAt: at(30) } },
];
const L = I.sessionLots(shots, { doscoDirs: ["/f/docs"] });
eq(L.map((l) => [l.camera, l.ids.length, l.from, l.to]), [[CANON, 13, at(0), at(200)]],
   "one session: 12 shots + the TIFF of one body; not the 2 two hours later, not the phone's 3, not the DosCo, not a D.nn, not the declared DosCo, not the photos with no EXIF, not a PDF");
eq(I.sessionLots(Array.from({ length: 5 }, (_, i) => ({ id: `g${i}`, path: `/g/${i}.jpg`, exif: { camera: "X", takenAt: at(1800 * i) } }))).length, 1,
   "shots exactly 30 min apart are one session (the gap is inclusive)");
eq(I.sessionLots(Array.from({ length: 5 }, (_, i) => ({ id: `h${i}`, path: `/h/${i}.jpg`, exif: { camera: "X", takenAt: at(1801 * i) } }))).length, 0,
   "one second more and every shot is its own session: no lot");
const twoBodies = [0, 1].flatMap((b) => Array.from({ length: 6 }, (_, i) => ({ id: `b${b}-${i}`, path: `/k/${b}_${i}.jpg`,
  exif: { camera: `Nikon Z7 #${b}`, takenAt: at(10 * i + b) } })));
eq(I.sessionLots(twoBodies).map((l) => l.ids.length), [6, 6], "two bodies of one model, interleaved: two sessions");
eq(I.sessionLots(shots.filter((x) => x.id.startsWith("dosco") || x.id.startsWith("nx"))).length, 0,
   "T-L1 · Templu Mare's DosCo (D.nn, in a DosCo) and photos without EXIF: no lot");

console.log(`\nroom-inventory: ${checks} checks passed`);
