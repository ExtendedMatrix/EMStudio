// MICRO-SEG28 (E.D., 22 Nov 2026) · Archive: the Outliner becomes the index of the
// documents and their files.
//
//   node scripts/check-archive-outliner.mjs
//        (EM_V9=<a copy of Templu Mare v11>, PORT=<a Vite of this tree>, BRIDGE=<optional>)
//
// 1 · in node (`archive-tree.ts`, `outliner-tree.ts`), on a small graph: what a
//     document holds by the three roads (its own files, its models', their
//     containers' tilesets — and the versions, the members under them); its state
//     (with · without · changed · missing) and its kind (models, images, PDF,
//     drawings, other); the line «2 models and 1 tileset linked · 3 of 3 files
//     stamped»; the tree by state and by type, a file's sign, the licence's mark,
//     the DTC branch; the graph's view untouched. With Templu Mare v11 (EM_V9):
//     D.01 = «10 models and 1 tileset linked · 11 of 11 files stamped».
// 2 · in a real page (page-bench, the v11 copy): the Archive's Outliner is the
//     documents' index by default, grouped by state, by type from its selector;
//     the other workspaces keep the graph, the selector offers the documents
//     there too; a click on D.01: the Archive's card and the Sources' Inspector
//     say the SAME line; a file of Files dropped on a document without files asks,
//     stamps (the bridge's sha256, routed here) and links it, one undo step.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const FE = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(FE, "src");
let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

const out = await esbuild.build({ stdin: { contents: `export * from "./outliner-tree"; export * as A from "./archive-tree";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, loader: { ".json": "json" } });
const O = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
const A = O.A;

const N = (id, node_type, name = id, data = {}) => ({ id, node_type, name, data });
const E = (source, target, edge_type) => ({ source, target, edge_type });
const S = (h) => ({ checksum: `sha256:${h.repeat(64).slice(0, 64)}` });
const doc = { graph: { graph_id: "g", nodes: [
  N("D1", "document", "D.01", {}), N("D2", "document", "D.02"), N("D3", "document", "D.03"), N("D4", "document", "D.04"),
  N("D5", "document", "D.05"), N("D6", "document", "D.06"), N("D7", "document", "D.07"),
  N("RM1", "representation_model", "Cella"), N("RM2", "representation_model", "Podio"), N("RMSF", "representation_model_sf", "Reperto"),
  N("G", "RepresentationModelNodeGroup", "Survey2015"),
  N("R1", "resource", "cella (master)", { url: "blend://../RB/T.blend#Mesh/cella", media_type: "application/x-blender", ...S("a") }),
  N("V1", "resource", "cella LOD0 (OBJ)", { url: "../RB/LOD0/cella.obj", ...S("b") }),
  N("TX", "resource_file", "cella.jpg", { url: "../RB/LOD0/cella.jpg", ...S("c") }),
  N("R2", "resource", "podio (master)", { url: "../RB/podio.glb", ...S("d") }),
  N("TS", "resource", "Templu (tileset)", { url: "../RB/cesium/T.zip", media_type: "application/zip", size_bytes: 190795328, ...S("e") }),
  N("RP", "resource", "D.02.pdf", { url: "DosCo/D.02.pdf", media_type: "application/pdf", ...S("f") }),
  N("RJ", "resource", "D.04.jpg", { url: "DosCo/D.04.jpg" }),
  N("RX", "resource", "D.05.pdf", { url: "DosCo/D.05.pdf", ...S("1") }),
  N("RC", "resource", "D.06.dxf", { url: "DosCo/D.06.dxf", ...S("2") }),
  N("RQ", "resource", "D.07.tif", { url: "DosCo/D.07.tif", ...S("3") }),
  N("LIC", "license", "CC-BY", { license_type: "CC-BY" }), N("EMB", "embargo", "2027", { embargo_end: "2027-01-01" }),
  N("P1", "dtc_process", "LOD generation lod0 of cella", { dtc_kind: "lod_generation" }),
  N("GONE", "document", "D.99", { removed: true }),
], edges: [
  E("D1", "RM1", "has_representation_model"), E("D1", "RM2", "has_representation_model"),
  E("RM1", "R1", "has_linked_resource"), E("RM2", "R2", "has_linked_resource"),
  E("V1", "R1", "dtc_derived_from"), E("V1", "TX", "has_file"),
  E("RM1", "G", "is_in_representation_model_group"), E("RMSF", "G", "is_in_representation_model_group"), E("G", "TS", "has_linked_resource"),
  E("D2", "RP", "has_linked_resource"), E("D2", "LIC", "has_license"), E("D2", "EMB", "has_embargo"),
  E("D4", "RJ", "has_linked_resource"), E("D5", "RX", "has_linked_resource"), E("D6", "RC", "has_linked_resource"), E("D7", "RQ", "has_linked_resource"),
  E("P1", "R1", "dtc_had_input"), E("P1", "V1", "dtc_had_output"),
] } };
const FACTS = { RX: { state: "missing" }, RC: { state: "on_disk", changed: true } };
const W = { models: (n) => `${n} model${n === 1 ? "" : "s"}`, tilesets: (n) => `${n} tileset${n === 1 ? "" : "s"}`, files: (n) => `${n} file${n === 1 ? "" : "s"}`,
  and: "and", linked: (w) => `${w} linked`, stamped: (s, n) => `${s} of ${n} files stamped`, nothing: "No file yet: stamp a file and promote it" };

// ── 1 · what a document holds ───────────────────────────────────────────────
{
  const h = A.documentHoldings(doc.graph, "D1");
  eq(h.models.map((m) => m.id), ["RM1", "RM2"], "D1's models, by has_representation_model");
  eq(h.tilesets.map((t) => [t.group, t.resource.id, t.models]), [["G", "TS", 2]], "the tileset of the container its model is in (2 models in it)");
  eq(h.top.map((x) => x.id), ["R1", "R2", "TS"], "the files linked: its models' and the container's tileset");
  eq(h.all.map((x) => x.id).sort(), ["R1", "R2", "TS", "TX", "V1"], "everything reached: the version (dtc_derived_from) and its member too");
  eq(h.models[0].files.map((x) => [x.id, x.kind, x.via]), [["R1", "resource", "RM1"], ["V1", "version", "R1"], ["TX", "file", "V1"]], "R1 → its version → the version's file");
  const c = A.holdingCounts(h);
  eq(A.holdingLine(c, W), "2 models and 1 tileset linked · 3 of 3 files stamped", "D1's line");
  eq(A.holdingLine(A.holdingCounts(A.documentHoldings(doc.graph, "D3")), W), W.nothing, "a document with nothing: «No file yet…»");
  eq(A.holdingLine(A.holdingCounts(A.documentHoldings(doc.graph, "D4")), W), "1 file linked · 0 of 1 files stamped", "a linked file not stamped");
  const fact = (id) => FACTS[id] ?? null;
  const st = (d) => A.docState(A.documentHoldings(doc.graph, d), fact);
  eq(["D1", "D2", "D3", "D4", "D5", "D6"].map(st), ["with", "with", "without", "without", "missing", "changed"], "the states");
  const kd = (d) => A.docKind(A.documentHoldings(doc.graph, d));
  eq(["D1", "D2", "D3", "D4", "D6", "D7"].map(kd), ["models", "pdf", "other", "images", "drawings", "images"], "the kinds");
  eq(A.docRights(A.indexOf(doc.graph), "D2"), { license: "CC-BY", embargo: "2027-01-01" }, "D2's own licence and embargo");
  eq(A.dtcProcesses(doc.graph).map((p) => [p.id, p.inputs, p.outputs]), [["P1", ["R1"], ["V1"]]], "the DTC process, input → product");
  eq(A.fileSign(h.top[0], null), "stamped", "a file with a digest: stamped");
  eq(A.fileSign({ stamped: true }, { state: "missing" }), "missing", "the resolver's missing wins");
}

// ── 1b · the tree ───────────────────────────────────────────────────────────
const texts = { dim: { units: "Units", documents: "Documents", authors: "Authors", epochs: "Epochs", models: "Models", proxies: "Proxies",
  gis: "GIS", paradata: "Paradata", other: "Other", aux: "Aux" }, noEpoch: "No epoch", typeLabel: (t) => t, sourceNone: "Not on disk", empty: "—",
  docs: { state: { with: "With files", without: "Without files", changed: "Changed", missing: "Missing" },
    kind: { models: "Models and tilesets", images: "Images", pdf: "PDF", drawings: "Drawings", other: "Other" },
    models: "Models", sign: { stamped: "stamped", unstamped: "not stamped", changed: "changed", missing: "missing" },
    line: (c) => A.holdingLine(c, W), tilesetOf: (g, n) => `tileset of ${g} (${n})`, version: "a version",
    license: (v) => `Licence: ${v}`, embargo: (v) => `Embargo: ${v}`, dtc: "DTC processes", input: "input", output: "output" } };
const facts = () => ({ proxies: new Set(), rmdocs: new Map(), rmsf: new Map(), tilesets: new Set(), rmEpochs: new Map(), gis: [], fileFact: (id) => FACTS[id] ?? null });
const sources = [{ id: "f1", name: "T.em.json", kind: "file", graphs: [{ slot: "s1", name: "Templu", active: true, doc: () => doc, facts, aux: [] }] }];
const run = (opts = {}, toggled = new Set()) => O.flattenOutliner({ sources, opts: { ...O.DEFAULT_OPTS, ...opts }, texts, toggled });
const labels = (rows) => rows.map((r) => `${"  ".repeat(r.depth)}${r.label}${r.count ? ` (${r.count})` : ""}`);
{
  const rows = run({ view: "documents" });
  const L = labels(rows); if (process.env.DUMP) console.log(L.join("\n"));
  eq(rows.filter((r) => r.kind === "group" && r.depth === 2).map((r) => r.label), ["With files (2)", "Without files (2)", "Changed (1)", "Missing (1)"].map((x) => x.replace(/ \(\d+\)$/, "")),
    "by state, in the MICRO's order (with · without · changed · missing)");
  eq(rows.filter((r) => r.kind === "group" && r.depth === 2).map((r) => r.count), ["3", "2", "1", "1"], "each state counts its documents (D7's tif is stamped: with files)");
  ok(!rows.some((r) => r.kind === "dim"), "no dimension of the graph in the documents' view");
  ok(!rows.some((r) => r.label === "D.99"), "a removed document is not listed");
  const d1 = rows.find((r) => r.id === "D1");
  ok(d1 && d1.docDrop && d1.title === "2 models and 1 tileset linked · 3 of 3 files stamped", `D1's row: a drop target, its line as tooltip (${d1?.title})`);
  const d2 = rows.find((r) => r.id === "D2");
  ok(d2.note === "© ⏳" && /Licence: CC-BY/.test(d2.noteTitle) && /Embargo/.test(d2.noteTitle), `D2: the quiet marks of its licence and embargo (${d2.note} ${d2.noteTitle})`);
  // open D1: its models, the tileset; open the models, the model, its master
  const open = new Set([d1.key]);
  const r1 = run({ view: "documents" }, open);
  const kids = r1.filter((r) => r.key.startsWith(d1.key + "/"));
  eq(kids.filter((r) => r.depth === d1.depth + 1).map((r) => r.label), ["Models", "Survey2015 · Templu (tileset)"], "under D1: its models, then the container's tileset");
  const ts = kids.find((r) => r.id === "TS");
  ok(ts.icon === "tileset" && ts.sign === "stamped" && ts.note === "✓" && /tileset of Survey2015 \(2\)/.test(ts.title) && ts.desc === "191 MB", `the tileset row (${JSON.stringify({ i: ts.icon, s: ts.sign, t: ts.title, d: ts.desc })})`);
  const mg = kids.find((r) => r.label === "Models");
  const r2 = run({ view: "documents" }, new Set([d1.key, mg.key, `${d1.key}/rm:RM1`, `${d1.key}/rm:RM1/f:R1`]));
  const deep = labels(r2.filter((r) => r.key.startsWith(d1.key + "/")));
  ok(deep.some((x) => /^\s+cella \(master\)$/.test(x)) && deep.some((x) => /^\s+cella LOD0 \(OBJ\)$/.test(x)), `the model's master, its version under it (${deep.join(" | ")})`);
  const v1 = r2.find((r) => r.id === "V1");
  ok(v1 && /a version/.test(v1.noteTitle) && v1.depth > r2.find((r) => r.id === "R1").depth, "the version under the master, said a version");
  // a file's signs: missing, changed, unstamped
  const all = run({ view: "documents" }, new Set(["s1|docs/state:missing/D5", "s1|docs/state:changed/D6", "s1|docs/state:without/D4"]));
  eq(["RX", "RC", "RJ"].map((id) => all.find((r) => r.id === id)?.sign), ["missing", "changed", "unstamped"], "the files' signs");
  // by type
  const byType = run({ view: "documents", docGroup: "type" });
  eq(byType.filter((r) => r.kind === "group" && r.depth === 2).map((r) => `${r.label} (${r.count})`),
    ["Models and tilesets (1)", "Images (2)", "PDF (2)", "Drawings (1)", "Other (1)"], "by type, the kinds in order");
  // the DTC branch
  const dtc = run({ view: "documents", dtc: true }, new Set(["s1|docs/dtc", "s1|docs/dtc/P1"]));
  eq(labels(dtc.filter((r) => r.key.startsWith("s1|docs/dtc"))).map((x) => x.trim()),
    ["DTC processes (1)", "LOD generation lod0 of cella", "← cella (master)", "→ cella LOD0 (OBJ)"], "the DTC branch: input ← process → product");
  // the search
  const q = run({ view: "documents", query: "podio" });
  ok(q.some((r) => r.id === "R2") && q.some((r) => r.id === "D1") && !q.some((r) => r.id === "D2"), "the search finds a model's file and opens its document");
  // the graph's view is untouched
  const g = run({});
  ok(g.some((r) => r.kind === "dim") && !g.some((r) => r.docDrop), "no view chosen: the graph's dimensions, as before");
}

// ── 1c · Templu Mare v11 ────────────────────────────────────────────────────
const V = process.env.EM_V9;
if (V && existsSync(V)) {
  const j = JSON.parse(readFileSync(V, "utf8"));
  const g = j.graph ?? Object.values(j.graphs)[0];
  const d01 = g.nodes.find((n) => n.node_type === "document" && n.name === "D.01");
  if (d01) {
    const h = A.documentHoldings(g, d01.id);
    eq(A.holdingLine(A.holdingCounts(h), W), "10 models and 1 tileset linked · 11 of 11 files stamped", "Templu Mare v11 · D.01");
    eq(h.tilesets.map((t) => [t.groupName, t.models]), [["Survey2015", 11]], "…its tileset is Survey2015's, 11 models in the container (Sources' «11 models»)");
    ok(!g.edges.some((e) => e.source === d01.id && e.edge_type === "has_linked_resource"), "…and D.01 links no file of its own (why the Archive said «No file yet»)");
  }
}
console.log(`archive-outliner (node): ${checks} checks passed`);

// ── 2 · the page ────────────────────────────────────────────────────────────
const { bench } = await import("./page-bench.mjs");
const B = await bench("check-archive-outliner (page)");
if (!B) process.exit(0);
const fails = [];
const pk = (c, what) => { if (c) checks++; else fails.push(what); };
try {
  const { page, errors } = await B.open({ width: 1600, height: 950, ws: "assets" });
  await page.route("**/fs/checksum**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ checksum: `sha256:${"9".repeat(64)}` }) }));
  await page.waitForSelector('.uo-row[data-doc-row="1"]', { timeout: 30000 });
  const head = await page.evaluate(() => ({
    view: document.querySelector("[data-uo-selector]")?.dataset.uoView ?? null,
    groups: [...document.querySelectorAll(".uo-row.uo-group")].map((e) => e.querySelector(".uo-label")?.textContent),
    docs: document.querySelectorAll('.uo-row[data-doc-row="1"]').length,
  }));
  pk(head.view === "documents", `Archive: the Outliner is the documents' index by default (${head.view})`);
  pk(head.groups.some((x) => /^Con file/.test(x ?? "")) && head.docs > 5, `…grouped by state, documents listed (${head.groups.join(", ")} · ${head.docs})`);
  // by type, from the selector
  await page.click("[data-uo-selector]");
  pk(await page.$('[data-uo-opt="view:documents"]') && await page.$('[data-uo-opt="docgroup:type"]') && await page.$('[data-uo-opt="dtc"]'), "the selector: the kind of Outliner, the grouping, the DTC branch");
  await page.click('[data-uo-opt="docgroup:type"]');
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const types = await page.evaluate(() => [...document.querySelectorAll(".uo-row.uo-group")].map((e) => e.querySelector(".uo-label")?.textContent));
  pk(types.includes("Modelli e tileset") && types.includes("PDF"), `by type (${types.join(", ")})`);
  // D.01: the Archive's card and the Sources' Inspector say the same line
  const d01 = await page.evaluate(() => window.__EM_DRAG__.uoRows().find((r) => r.docDrop && r.label === "D.01")?.id ?? null);
  pk(!!d01, "D.01 is a row of the index");
  await page.evaluate((id) => document.querySelector(`.uo-row[data-doc-row="1"][data-id="${CSS.escape(id)}"]`)?.click(), d01);
  await page.waitForTimeout(900);
  const card = await page.evaluate(() => {
    const c = document.querySelector(".dcard");
    return c ? { line: c.querySelector("[data-doc-holdings]")?.textContent ?? "", text: c.textContent } : null;
  });
  pk(card && /10 modelli e 1 tileset legati · 11 di 11 file timbrati/.test(card.line), `Archive's card: what D.01 holds (${card?.line})`);
  pk(card && !/Nessun file ancora|No file yet/i.test(card.text), `…no «No file yet» any more (${card?.text?.slice(0, 160)})`);
  pk((await page.evaluate(() => window.__EM_DRAG__.selected())).includes(d01), "the selection is D.01 (shared with the Inspector)");
  // B · with a bridge serving the survey's folder (BRIDGE, its fs-root holding
  // the copy's ../RB): Files goes there, D.01's first file selected
  if (process.env.BRIDGE && process.env.ARC_RB) {
    await page.waitForTimeout(1500);
    const at = await page.evaluate(() => window.__EM_DRAG__.storageAt());
    pk(at.length && at.some((w) => w.path === null ? false : w.path.replace(/\/+$/, "") === process.env.ARC_RB.replace(/\/+$/, "")),
      `Files shows D.01's folder (${JSON.stringify(at)})`);
    pk(at.some((w) => /TempluMare_2021\.blend$/.test(String(w.selected))), `…its file selected, the chain DTC follows it (${JSON.stringify(at)})`);
    const shelf = await page.evaluate(() => document.querySelector("[data-shelf-doc]")?.textContent ?? null);
    pk(shelf && /File di D\.01/.test(shelf) && /OB_EST_L/.test(shelf), `the Shelf lists D.01's files (${shelf?.slice(0, 140)})`);
  }
  await page.evaluate(() => document.querySelector('#workspace-bar .ws-tab[data-ws="provenance"]')?.click());
  await page.waitForTimeout(2500);
  const insp = await page.evaluate(() => document.querySelector(".insp-holdings")?.textContent ?? null);
  pk(insp && card && insp.replace(/\s+/g, " ").trim() === card.line.replace(/\s+/g, " ").trim(), `Sources' Inspector says the same line (${insp} ≟ ${card?.line})`);
  // another workspace: the graph, the documents offered
  await page.evaluate(() => document.querySelector('#workspace-bar .ws-tab[data-ws="canvas"]')?.click());
  await page.waitForTimeout(1500);
  const cv = await page.evaluate(() => ({ docs: document.querySelectorAll('.uo-row[data-doc-row="1"]').length, dims: document.querySelectorAll(".uo-row.uo-dim").length }));
  pk(cv.docs === 0 && cv.dims > 0, `Stratigraphy keeps the graph's Outliner (${JSON.stringify(cv)})`);
  await page.click("[data-uo-selector]");
  pk(!!(await page.$('[data-uo-opt="view:documents"]')), "…and its selector offers the documents' index");
  await page.keyboard.press("Escape");
  // C · a file of Files dropped on a document without files
  await page.evaluate(() => document.querySelector('#workspace-bar .ws-tab[data-ws="assets"]')?.click());
  await page.waitForTimeout(1500);
  await page.click("[data-uo-selector]");
  await page.click('[data-uo-opt="docgroup:state"]');
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const target = await page.evaluate(() => window.__EM_DRAG__.uoRows().find((r) => r.docDrop && /\|docs\/state:without\//.test(r.key))?.id ?? null);
  pk(!!target, "a document without files to drop on");
  const before = await page.evaluate((id) => window.__EM_DRAG__.edgesOf("has_linked_resource").filter((e) => e.source === id).length, target);
  const over = await page.evaluate(([id, mime]) => {
    const el = document.querySelector(`.uo-row[data-doc-row="1"][data-id="${CSS.escape(id)}"]`);
    const dt = new DataTransfer();
    dt.setData(mime, JSON.stringify({ path: "/tmp/seg28-drop/foto.jpg", type: "file", name: "foto.jpg", ext: "jpg" }));
    const o = new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt });
    el.querySelector(".uo-label").dispatchEvent(o);
    const lit = el.classList.contains("uo-drop") && /foto|Timbra|Stamp/.test(el.title + " ");
    el.querySelector(".uo-label").dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    return { prevented: o.defaultPrevented, lit, title: el.title };
  }, [target, "application/x-em-storage-entry"]);
  pk(over.prevented, `the row accepts the file while dragging (${JSON.stringify(over)})`);
  await page.waitForSelector('[data-app-dialog="stamp-onto-doc"]', { timeout: 5000 }).catch(() => {});
  const asked = await page.evaluate(() => document.querySelector('[data-app-dialog="stamp-onto-doc"]')?.textContent ?? null);
  pk(asked && /foto\.jpg/.test(asked), `asked first (${asked?.slice(0, 120)})`);
  await page.click('[data-app-dialog="stamp-onto-doc"] [data-dialog-ok]').catch(() => {});
  await page.waitForTimeout(800);
  const after = await page.evaluate((id) => {
    const e = window.__EM_DRAG__.edgesOf("has_linked_resource").filter((x) => x.source === id);
    const res = e.map((x) => window.__EM_DRAG__.data(x.target));
    return { n: e.length, res };
  }, target);
  pk(after.n === before + 1 && after.res.some((d) => d?.checksum === `sha256:${"9".repeat(64)}` && /foto\.jpg$/.test(String(d?.url))),
    `stamped (the bridge's sha256) and linked (${JSON.stringify(after).slice(0, 300)})`);
  const moved = await page.evaluate((id) => window.__EM_DRAG__.uoRows().find((r) => r.id === id && r.docDrop)?.key ?? "", target);
  pk(/docs\/state:with\//.test(moved), `the document moved to «with files» (${moved})`);
  await page.evaluate(() => window.__EM_DRAG__.undo());
  await page.waitForTimeout(500);
  const undone = await page.evaluate((id) => window.__EM_DRAG__.edgesOf("has_linked_resource").filter((e) => e.source === id).length, target);
  pk(undone === before, `one undo step takes it back (${undone} = ${before})`);
  pk(!errors.length, `no page error (${errors.join(" | ")})`);
} finally {
  await B.close();
}
if (fails.length) { console.error(`archive-outliner: ${fails.length} FAILED\n - ${fails.join("\n - ")}`); process.exit(1); }
console.log(`archive-outliner: ${checks} checks passed`);
