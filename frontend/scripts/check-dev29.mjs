// VLONG-DEV29 · part B (EMStudio): what Cowork saw on the Segni records on the
// night of 1 Oct 2026 (`_datasets/SegniSanPietro/_lavoro-claude/UX_EMSTUDIO.md`),
// one case per promise of the pure modules. The same promises on the real
// canvas are the `V*` cases of `check-interactions.mjs`.
//
//   node scripts/check-dev29.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { readFileSync } from "node:fs";

let checks = 0;
const fails = [];
const ok = (c, what) => { checks++; if (!c) fails.push(what); };
const eq = (a, b, what) => {
  checks++;
  try { assert.deepStrictEqual(a, b); } catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); }
};

const { window, document } = parseHTML(`<!doctype html><html><body></body></html>`);
globalThis.window = window;
globalThis.document = document;
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: {
    contents: `
      export { issues, doubleSlashFix, georeferenceState } from "./issues";
      export { ancestorsOf, isStratigraphicType } from "./rules";
      export { DocumentStore } from "./model";
      export { setLocale, t } from "./i18n";
      export * as compose from "./stamp-compose";
      export { adaptDraft } from "./views/stamps";
      export { dtcKindFamily } from "./rules";
      export { geoOf } from "./geo";
    `,
    resolveDir: SRC, loader: "ts",
  },
  bundle: true, format: "esm", write: false,
  plugins: [{
    name: "stub-icons",
    setup(build) {
      build.onResolve({ filter: /\.\/icons$/ }, () => ({ path: "icons-stub", namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: `export const ICON_NODE_TYPES = new Set(["extractor", "combiner"]);`, loader: "ts" }));
    },
  }],
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const { geoOf, compose, adaptDraft, dtcKindFamily, doubleSlashFix, georeferenceState, issues, ancestorsOf, isStratigraphicType, DocumentStore, setLocale, t } = M;
const tt = (k, v) => `${k}${v ? JSON.stringify(v) : ""}`;
const doc = (nodes, edges = []) => ({ header: {}, graph: { id: "g", nodes, edges } });

// ── A9b · a continuity node has no property to document ─────────────────────
{
  const d = doc([
    { id: "u1", node_type: "US", name: "US1" },
    { id: "br1", node_type: "BR", name: "continuity_node" },
    { id: "br2", node_type: "BR", name: "continuity_node" },
  ]);
  const iss = issues({ doc: d, nodes: d.graph.nodes, isUnit: isStratigraphicType, t: tt,
    namedByConstruction: (nt) => ancestorsOf(nt).includes("ContinuityNode") });
  const para = iss.filter((i) => i.rule === "paradata").map((i) => i.node);
  eq(para, ["u1"], "A9b · «no documented property» for the US, never for a continuity node");
}

// ── B8 · the new warnings ───────────────────────────────────────────────────
{
  eq(doubleSlashFix("//DosCo/D.33.jpg"), "/DosCo/D.33.jpg", "B8 · `//DosCo/…` → `/DosCo/…`");
  eq(doubleSlashFix("https://zenodo.org/record//7463211"), "https://zenodo.org/record/7463211", "B8 · inside a path, after a scheme");
  eq(doubleSlashFix("https://zenodo.org/record/7463211"), null, "B8 · the scheme's // is not a double slash");
  eq(doubleSlashFix("/DosCo/D.02.jpg"), null, "B8 · an ordinary path");
  const geo = (data) => [{ id: "g", node_type: "geo_position", data }];
  eq(georeferenceState(geo({ epsg: 4326, shift_x: 0, shift_y: 0, shift_z: 0 })), "legacy_default", "B8 · 4326 + zero shift = legacy_default");
  eq(georeferenceState(geo({ shift_x: 0 })), "undeclared", "B8 · no epsg = undeclared");
  eq(georeferenceState([]), "undeclared", "B8 · no GeoPositionNode = undeclared");
  eq(georeferenceState(geo({ epsg: 3004, shift_x: 2355500, shift_y: 4617500, shift_z: 0 })), "declared", "B8 · EPSG:3004 + SHIFT = declared");
  const d = doc([
    { id: "geo", node_type: "geo_position", data: { epsg: 4326, shift_x: 0, shift_y: 0, shift_z: 0 } },
    { id: "d02", node_type: "document", name: "D.02", data: { url: "/DosCo/D.02.jpg" } },
    { id: "d32", node_type: "document", name: "D.32", data: { url: "/DosCo/D.02.jpg" } },
    { id: "d33", node_type: "document", name: "D.33", data: { url: "//DosCo/D.33.jpg" } },
    { id: "d33_link", node_type: "resource", name: "Link to D.33", data: { url: "//DosCo/D.33.jpg" } },
    { id: "pano", node_type: "resource", name: "pano8k.rar", data: { packaging: "archive", missing: true } },
  ]);
  let fixedTo = null, shiftAsked = 0;
  const iss = issues({ doc: d, nodes: d.graph.nodes, isUnit: isStratigraphicType, t: tt,
    fixers: { setUrl: { label: "fix", run: (a, b) => { fixedTo = [a, b]; } }, readShift: { label: "SHIFT", run: () => shiftAsked++ } } });
  const by = (r) => iss.filter((i) => i.rule === r);
  eq(by("address").filter((i) => i.txt.startsWith("issues.sameFile")).map((i) => i.node).sort(), ["d02", "d32"],
     "B8 · D.32 and D.02 point to the same file: both rows");
  const ds = by("address").filter((i) => i.txt.startsWith("issues.doubleSlash"));
  eq(ds.map((i) => i.node), ["d33"], "B8 · the double slash is said once, on the document");
  ds[0].fix.run();
  eq(fixedTo, ["//DosCo/D.33.jpg", "/DosCo/D.33.jpg"], "B8 · its fix corrects that address");
  const g = by("georef");
  ok(g.length === 1 && g[0].sev === "warn" && g[0].fix?.label === "SHIFT", "B8 · not georeferenced (WGS84 at 0,0): a warning with «Read a SHIFT.txt…»");
  g[0].fix.run();
  eq(shiftAsked, 1, "B8 · …which asks for the file");
  eq(by("missing").map((i) => i.node), ["pano"], "B8 · a resource declared missing");
  const SP = process.env.DEV29_SP_PRIMA;   // optional: San Pietro before the 2 Oct correction (a copy in /tmp)
  if (SP) {
    const sp = JSON.parse(readFileSync(SP, "utf8"));
    const r = issues({ doc: sp, nodes: sp.graph.nodes, isUnit: isStratigraphicType, t: tt });
    const names = (rule, prefix) => r.filter((i) => i.rule === rule && i.txt.startsWith(prefix)).map((i) => sp.graph.nodes.find((n) => n.id === i.node)?.name).sort();
    console.log("  San Pietro (prima):", JSON.stringify({ same: names("address", "issues.sameFile"), dbl: names("address", "issues.doubleSlash"), geo: r.filter((i) => i.rule === "georef").map((i) => i.sev) }));
    eq([names("address", "issues.sameFile"), names("address", "issues.doubleSlash"), r.filter((i) => i.rule === "georef").length],
       [["D.02", "D.32"], ["D.33"], 1], "B8 · San Pietro before the correction: D.32/D.02, D.33, not georeferenced");
  }
}

// ── B5 · the compositor: one act is one act ────────────────────────────────
{
  const C = compose;
  const outs = (n) => Array.from({ length: n }, (_, i) => ({ path: `/z/f${i}`, name: `f${i}`, size: 1, mtime: 0 }));
  const d1 = C.newDraft(outs(1)); d1.origin = true;
  const d11 = C.newDraft(outs(11)); d11.origin = true;
  ok(!C.requiredFields(d1).includes("campaign"), "B5 · one file needs no act's name");
  ok(C.requiredFields(d11).includes("campaign"), "B5 · eleven files, one act: its name is required");
  d11.kind = "download"; d11.at = "2026-10-02"; d11.operator = { id: "https://orcid.org/0000-0002-5065-7970", label: "" };
  eq(C.readyToStamp(d11), "campaign", "B5 · …and «Stamp» stops on it");
  const der = C.newDraft(outs(3));
  ok(C.requiredFields(der).includes("campaign"), "B5 · a derivation with N outputs too (one process, N dtc_had_output)");
  eq(C.normalizeSource("10.5281/zenodo.7463211"), { uri: "https://doi.org/10.5281/zenodo.7463211" }, "B5 · a DOI → its resolver");
  eq(C.normalizeSource("doi:10.5281/zenodo.7463211"), { uri: "https://doi.org/10.5281/zenodo.7463211" }, "B5 · doi: form");
  eq(C.normalizeSource("https://zenodo.org/records/7463211"), { uri: "https://zenodo.org/records/7463211" }, "B5 · a URL stays");
  eq(C.normalizeSource("/Users/ed/Downloads/x"), { error: "path" }, "B5 · a path is refused (a stamp never carries one)");
  eq(C.normalizeSource("boh"), { error: "form" }, "B5 · neither DOI nor URL");
  eq(C.normalizeSource("  "), null, "B5 · empty is nothing");
  eq(C.doiFromName("zenodo-7463211"), "10.5281/zenodo.7463211", "B5 · a folder named after a Zenodo record proposes its DOI");
  eq(C.doiFromName("10.5281_zenodo.7463211_RA.xlsx"), "10.5281/zenodo.7463211", "B5 · …a file name too");
  eq(C.doiFromName("DosCo"), null, "B5 · …and nothing else does");
  d11.source = "10.5281/zenodo.7463211";
  eq(C.proposeActName(d11, "Download", "zenodo-7463211"), "Download 10.5281/zenodo.7463211", "B5 · the proposed name: «Download 10.5281/zenodo.7463211»");
  d11.source = "";
  eq(C.proposeActName(d11, "Download", "zenodo-7463211"), "Download · zenodo-7463211", "B5 · without a source: kind · folder");
  eq(C.proposeActName(d1, "Download", "x"), "", "B5 · one file: nothing proposed");
  d11.source = "https://doi.org/10.5281/zenodo.7463211";
  eq(C.actMetadata(d11), { retrieved_from: "https://doi.org/10.5281/zenodo.7463211" }, "B5 · the source travels as how.acquisition.retrieved_from");
  eq(dtcKindFamily("download", "acquisition"), "retrieval", "B5 · «from where?» is asked by the family the vocabulary gives (retrieval)");
  eq(dtcKindFamily("photo", "acquisition"), "capture", "B5 · …not for a capture");
  const pic = adaptDraft({ outputs: outs(2), inputs: [], origin: true, kind: "download", technique: "", at: "", operator: { id: "", label: "" }, campaign: "Download 10.5281/zenodo.7463211" });
  const step = pic.nodes.find((n) => n.id === "draft:step");
  eq([step.node_type, step.name], ["dtc_acquisition", "Download 10.5281/zenodo.7463211"], "B5 · the preview of an origin draws an acquisition with the act's name");
  ok(!pic.edges.some((e) => e.edge_type === "dtc_had_input"), "B5 · …and no input lane");
}

// ── A6 → B8 · an absent epsg places nothing (never «WGS84 at the shift») ───────
{
  eq(geoOf({ shift_x: 13.02, shift_y: 41.69 }).ok, false, "A6 · no epsg: not georeferenced, even with a shift");
  eq(geoOf({ epsg: 4326, shift_x: 13.02, shift_y: 41.69 }).ok, true, "A6 · EPSG:4326 declared: placed");
  eq(geoOf({ epsg: 3004, shift_x: 2355500, shift_y: 4617500 }).reason, "needs-reprojection", "A6 · EPSG:3004: asks PROJ");
  const d = doc([{ id: "geo", node_type: "geo_position", data: { shift_x: 0, shift_y: 0, shift_z: 0 } }, { id: "u", node_type: "US", name: "US1" }]);
  const g = issues({ doc: d, nodes: d.graph.nodes, isUnit: isStratigraphicType, t: tt }).filter((i) => i.rule === "georef");
  eq(g.map((i) => [i.sev, i.txt]), [["info", "issues.georefNone"]], "A6 · a GeoPositionNode without epsg (dev29 import): «not georeferenced», information");
}

// ── B9a · the default name of a phase is in the interface language ─────────
{
  setLocale("it");
  const st = new DocumentStore(doc([{ id: "ep1", node_type: "EpochNode", name: "Età romana", data: { start_time: -100, end_time: 300 } }]));
  const p1 = st.addPhase("ep1", (n) => t("l.phaseDefault", { n }));
  const p2 = st.addPhase("ep1", (n) => t("l.phaseDefault", { n }));
  eq([p1.name, p2.name], ["Fase 1", "Fase 2"], "B9a · in Italian the phases are «Fase 1», «Fase 2»");
  eq(t("l.phaseCreated", { name: p2.name }), "fase Fase 2 creata", "B9a · …and the toast says «fase Fase 2 creata»");
  setLocale("en");
  eq(t("l.phaseDefault", { n: 3 }), "Phase 3", "B9a · in English «Phase 3»");
}

// ── B9c · the status bar says how many nodes are the epochs' dates ──────────
{
  const d = doc([
    { id: "ep1", node_type: "EpochNode", name: "A", data: { start_time: 0, end_time: 100 } },
    { id: "ep2", node_type: "EpochNode", name: "B", data: { start_time: 100, end_time: 200 } },
    { id: "u1", node_type: "US", name: "US1" },
  ], [{ id: "e1", source: "u1", target: "ep1", edge_type: "has_first_epoch" }]);
  const st = new DocumentStore(d);
  eq(st.epochDateCounts(), { nodes: 0, edges: 0 }, "B9c · as imported: no epoch dates yet");
  const before = [st.liveNodes().length, st.liveEdges().length];
  st.ensureAllEpochParadata();
  const c = st.epochDateCounts();
  eq(c, { nodes: 6, edges: 6 }, "B9c · two epochs → 2 groups + 4 absolute_time properties, 6 edges");
  eq([st.liveNodes().length - c.nodes, st.liveEdges().length - c.edges], before,
     "B9c · count minus the epochs' dates = the file's count (s3Dgraphy's)");
  ok(t("info.epochDates", { n: 24, e: 24 }).includes("24"), "B9c · the bar's words carry both numbers");
  const SP = process.env.DEV29_SP_CONVERTED;   // optional: the San Pietro GraphML, converted (a copy in /tmp)
  if (SP) {
    const sp = new DocumentStore(JSON.parse(readFileSync(SP, "utf8")));
    const raw = [sp.liveNodes().length, sp.liveEdges().length];
    sp.ensureAllEpochParadata();
    const k = sp.epochDateCounts();
    console.log(`  San Pietro: file ${raw.join("/")}, after load ${sp.liveNodes().length}/${sp.liveEdges().length}, epoch dates ${k.nodes}/${k.edges}`);
    eq([raw, [sp.liveNodes().length, sp.liveEdges().length], [k.nodes, k.edges]], [[66, 142], [90, 166], [24, 24]],
       "B9c · San Pietro: 66/142 in the file, 90/166 after load, 24/24 of them the epochs' dates");
  }
}

// ── A5 · the sidecar does not install SQLAlchemy for a GraphML import ───────
{
  const ROOT = new URL("../../", import.meta.url).pathname;
  const req = readFileSync(`${ROOT}tools/requirements.txt`, "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
  ok(!req.some((l) => /sqlalchemy/i.test(l)), "A5 · tools/requirements.txt installs no sqlalchemy");
  const pin = /s3dgraphy\[[^\]]*\]==1\.6\.0\.dev(\d+)/.exec(req.join("\n"));
  ok(!pin || Number(pin[1]) >= 29 || process.env.DEV29_PIN_PENDING !== "0",
     "A5 · …which holds with a pin at dev29 or later (the release moves it)");
  const yml = readFileSync(`${ROOT}.github/workflows/release.yml`, "utf8");
  ok(!/pip install[^\n]*\\\n[^\n]*sqlalchemy/i.test(yml) && !/pyinstaller pandas lxml sqlalchemy/.test(yml),
     "A5 · the release's sidecar venv installs no sqlalchemy");
}

// ── B9d · devrel announces as many installers as release.yml builds ─────────
{
  const ROOT = new URL("../../", import.meta.url).pathname;
  const yml = readFileSync(`${ROOT}.github/workflows/release.yml`, "utf8");
  const builds = (yml.match(/^\s*- \{ os: /gm) ?? []).length;
  eq(builds, 3, "B9d · release.yml builds three installers (macOS Intel retired)");
  const words = ["", "one", "two", "three", "four", "five"];
  for (const f of ["em.sh", "docs/DEVELOPMENT.md", ".github/workflows/release.yml", ".github/workflows/nightly.yml"]) {
    const txt = readFileSync(`${ROOT}${f}`, "utf8");
    const wrong = [...txt.matchAll(/\b(one|two|three|four|five)\s+(installers|builds|runners|targets)\b/gi)]
      .filter((m) => words.indexOf(m[1].toLowerCase()) !== builds).map((m) => m[0]);
    eq(wrong, [], `B9d · ${f} counts the installers as release.yml does`);
  }
}

if (fails.length) {
  console.error(`dev29: ${fails.length} of ${checks} checks FAILED:\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log(`dev29: ${checks} checks passed`);
