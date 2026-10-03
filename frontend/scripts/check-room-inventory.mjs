/**
 * MICRO-LA-BARRA-E-LE-STANZE · P2 — the inventory of a graph's resources before
 * it goes into a room, as `src/room-inventory.ts` (pure) decides it: which file
 * is which group, which photos travel as a LOT, what the default choices are,
 * and the closing report. Bundled with the project's esbuild, run in node.
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
ok(c.filter((x) => x.lotKey === "dir:/Users/x/drone").length === 12, "12 raw photos of one folder are ONE lot");
eq(c.find((x) => x.id === "p0").lotName, "drone", "…named after the folder");
eq(c.find((x) => x.id === "doc").lotKey, null, "a single document is not a lot");
const few = I.candidatesOf([{ id: "s", edges: [], nodes: photos.slice(0, 3) }]);
ok(few.every((x) => !x.lotKey), "three photos are three files, not a lot");

console.log("3 · the groups, the defaults, the choices");
const SHA = (n) => "sha256:" + String(n).repeat(64).slice(0, 64);
const probes = new Map([
  ["doc", { group: "on_disk", size: 1000, sha256: SHA(1), path: "/a/EM/DosCo/D.01.jpeg" }],
  ["ext", { group: "external", size: null, sha256: null }],
  ["f1", { group: "missing", size: null, sha256: null, why: "bridge 404" }],
  ["scan", { group: "in_store", size: 5000, sha256: SHA(2) }],
  ...photos.map((p, i) => [p.id, { group: "on_disk", size: 100, sha256: SHA(3 + (i % 6)) }]),
]);
const inv = I.buildInventory(c, probes);
eq(I.INV_GROUPS.map((k) => inv.groups[k].count), [13, 1, 1, 1], "four groups with their counts");
eq(inv.groups.on_disk.bytes, 2200, "…and their sizes");
ok(inv.items.filter((i) => i.group === "on_disk").every((i) => i.choice === "upload"), "on the disk → upload is the default («sale tutto»)");
ok(inv.items.filter((i) => i.group !== "on_disk").every((i) => i.choice === "skip"), "the rest has nothing to send");
eq(I.toUpload(inv), { count: 13, bytes: 2200 }, "what is about to go up");
I.choose(inv, { lot: "dir:/Users/x/drone" }, "reference");
eq(I.toUpload(inv), { count: 1, bytes: 1000 }, "a lot is chosen with ONE choice");
I.choose(inv, { group: "on_disk" }, "upload");
eq(I.toUpload(inv).count, 13, "…and a whole group with one");
I.choose(inv, { id: "doc" }, "skip");
eq(I.toUpload(inv).count, 12, "…and one file by itself");
I.choose(inv, { id: "scan" }, "upload");
ok(inv.items.find((i) => i.id === "scan").choice === "skip", "something already in the store cannot be «uploaded»");
eq(inv.lots.map((l) => [l.key, l.ids.length, l.bytes]),
   [["acq", 1, 5000], ["dir:/Users/x/drone", 12, 1200]], "the lots, with their members and weight");

console.log("4 · the report");
const outcomes = photos.map((p, i) => ({ id: p.id, ok: true, sent: i < 10, bytes: i < 10 ? 100 : 0 }));
eq(I.inventoryReport(inv, outcomes), { uploaded: 10, bytes: 1000, already: 3, references: 1, missing: 1, failed: 0 },
   "uploaded N (bytes) · already there (HEAD said so, or in_store) · references · missing");
const again = I.inventoryReport(inv, photos.map((p) => ({ id: p.id, ok: true, sent: false, bytes: 0 })));
eq([again.uploaded, again.bytes], [0, 0], "a second pass where the store has everything uploads nothing");
eq(I.humanBytes(1536), "1.50 KB", "bytes for a person");
eq(I.humanBytes(2 * 1024 ** 3), "2.00 GB", "…in GB");

console.log(`\nroom-inventory: ${checks} checks passed`);
