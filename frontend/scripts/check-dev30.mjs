// MICRO-LE-DECISIONI-DELLA-DEV29 · part B (EMStudio): what E.D. decided on the
// dev29 report and what he saw on the desktop dev.15 (2 Oct 2026,
// `_datasets/SegniSanPietro/_lavoro-claude/UX_EMSTUDIO.md`), one case per
// promise of the pure modules. The same promises on the real canvas are the
// `W*` cases of `check-interactions.mjs`.
//
//   node scripts/check-dev30.mjs
//   DEV30_SP_DTC=/tmp/dev30-banco/segni/SanPietro_DTC.em.json node scripts/check-dev30.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { readFileSync } from "node:fs";

process.env.TZ = "Europe/Rome";   // V1 · the readable instant is the machine's local time
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
const PKG = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const bundle = await esbuild.build({
  stdin: {
    contents: `
      export { issues, twinAcquisitions, actDateOf } from "./issues";
      export { isStratigraphicType, packagings, packagingName } from "./rules";
      export { DocumentStore } from "./model";
      export { setLocale, t } from "./i18n";
      export * as compose from "./stamp-compose";
      export { buildDtcScene, dtcSetId } from "./views/dtc";
      export { packagingLabel } from "./resources";
      export { readableWhen, sealWords } from "./seal";
      export { proposeLanguages, recogniseLanguage } from "./lang-guess";
    `,
    resolveDir: SRC, loader: "ts",
  },
  bundle: true, format: "esm", write: false,
  define: { __EMSTUDIO_VERSION__: JSON.stringify(PKG.version) },
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
const { issues, twinAcquisitions, actDateOf, isStratigraphicType, packagings, packagingName, DocumentStore, setLocale,
        compose: C, buildDtcScene, dtcSetId, packagingLabel, readableWhen, sealWords, proposeLanguages, recogniseLanguage } = M;
const tt = (k, v) => `${k}${v ? JSON.stringify(v) : ""}`;

// ── V4 · the editor says the version that wrote the file ────────────────────
{
  const st = new DocumentStore({ header: {}, graph: { graph_id: "g", nodes: [], edges: [] } });
  const h = JSON.parse(st.toJSON()).header;
  eq(h.last_editor, `EMStudio ${PKG.version}`, "V4 · header.last_editor = «EMStudio <package.json version>», not «EMStudio 0.1.0»");
}

// ── V1 · the micro-card: a readable instant, and From = retrieved_from ──────
{
  eq(readableWhen("2026-09-29T19:24:39Z", "it"), "29 set 2026, 21:24", "V1 · 2026-09-29T19:24:39Z in Italian, Rome time");
  ok(/^Sep 29, 2026, 9:24\sPM$/.test(readableWhen("2026-09-29T19:24:39Z", "en")), `V1 · …in English: ${readableWhen("2026-09-29T19:24:39Z", "en")}`);
  eq(readableWhen("2026-10-02", "it"), "2 ott 2026", "V1 · a date alone stays a date");
  eq(readableWhen("not a date", "it"), "not a date", "V1 · what is not a date is shown as written");
  const st = { self: { label: "a.jpg", packaging: "file" }, from: [],
               how: { dtc_kind: "download", acquisition: { retrieved_from: "https://doi.org/10.5281/zenodo.7463211" } },
               by: { at: "2026-09-29T19:24:39Z" } };
  eq(sealWords(st).from, "https://doi.org/10.5281/zenodo.7463211", "V1 · From is the address it was retrieved from");
  const none = sealWords({ ...st, how: { dtc_kind: "download" } }, () => "Download").from;
  ok(!/^Origin: Download$/.test(none) && /Download/.test(none), `V1 · without an address it says so, not «Origin: Download»: ${none}`);
}

// ── D1 · a download says where from: REQUIRED in the compositor ─────────────
{
  const out = (n) => ({ path: `/x/${n}`, name: n, size: 1, mtime: 1 });
  const d = C.newDraft([out("a.jpg")]);
  d.origin = true; d.kind = "download"; d.retrieval = true;
  d.operator = { id: "https://orcid.org/0000-0002-5065-7970", label: "" }; d.at = "2026-09-29";
  ok(C.requiredFields(d).includes("source"), "D1 · «from where?» is a required field of a retrieval");
  eq(C.missingFields(d), ["source"], "D1 · empty → missing (no «stamp anyway?»)");
  d.source = "/Users/me/zenodo";
  eq(C.missingFields(d), ["source"], "D1 · a local path is not an origin");
  d.source = "10.5281/zenodo.7463211";
  eq(C.missingFields(d), [], "D1 · a DOI is");
  const p = C.newDraft([out("a.jpg")]);
  p.origin = true; p.kind = "photo"; p.retrieval = false;
  ok(!C.requiredFields(p).includes("source"), "D1 · not asked of a capture");
  eq(C.doiFromName("zenodo-7463211"), "10.5281/zenodo.7463211", "D1 · a Zenodo folder fills it");
}

// ── D2 · the act's name with more than one output ───────────────────────────
{
  const outs = Array.from({ length: 32 }, (_, i) => ({ path: `/x/f${i}.jpg`, name: `f${i}.jpg`, size: 1, mtime: 1 }));
  const dl = C.newDraft(outs);
  dl.origin = true; dl.kind = "download"; dl.retrieval = true; dl.source = "10.5281/zenodo.7463211";
  eq(C.proposeActName(dl, "Download", "zenodo-7463211"), "Download 10.5281/zenodo.7463211", "D2 · a download: «Download <DOI>»");
  ok(C.requiredFields(dl).includes("campaign"), "D2 · 32 outputs: the name is required");
  const ph = C.newDraft(outs.slice(0, 3));
  ph.origin = true; ph.kind = "photo"; ph.technique = "Fotogrammetria da drone";
  eq(C.proposeActName(ph, "Photo", "DCIM"), "Fotogrammetria da drone DCIM", "D2 · another kind: «<technique> <origin>»");
  ph.technique = "";
  eq(C.proposeActName(ph, "Photo", "DCIM"), "Photo DCIM", "D2 · …the kind when no technique is written");
  const one = C.newDraft(outs.slice(0, 1));
  one.origin = true; one.kind = "photo";
  eq(C.proposeActName(one, "Photo", "DCIM"), "", "D2 · one output: no name proposed");
  ok(!C.requiredFields(one).includes("campaign"), "D2 · …and none required");
}

// ── D3 · two events of one lot: kept two, linked, one block ─────────────────
{
  const FX = JSON.parse(readFileSync(new URL("../testdata/dev29-segni-lite.em.json", import.meta.url), "utf8"));
  const g = FX.graph;
  const DL = "c1eef313-29e1-5361-ad19-ca01930832e7";
  eq(actDateOf(g.nodes.find((n) => n.id === "acq-drone")), "2018-02-17", "D3 · the capture's date is its act's");
  eq(twinAcquisitions(g.nodes, g.edges), [{ later: DL, earlier: "acq-drone", members: 8 }],
     "D3 · the pair is found: the download (2026) is the later, the capture (2018) the earlier");
  const st = new DocumentStore(JSON.parse(JSON.stringify(FX)));
  let linked = null;
  const iss = issues({ doc: st.doc, nodes: st.liveNodes(), isUnit: isStratigraphicType, t: tt,
    fixers: { linkEvents: { run: (a, b) => { linked = [a, b]; } } } }).filter((i) => i.rule === "twin");
  ok(iss.length === 1 && iss[0].node === DL && iss[0].fix?.kind === "button" && /twinLink/.test(iss[0].fix.label),
     "D3 · a warning on the later event, with «Link them»");
  iss[0].fix?.run();
  eq(linked, [DL, "acq-drone"], "D3 · …whose fix links the later to the earlier (no merge)");
  const before = buildDtcScene(g.nodes, g.edges);
  const linkedEdges = [...g.edges, { id: "cite", source: DL, target: "acq-drone", edge_type: "dtc_had_input" }];
  ok(!twinAcquisitions(g.nodes, linkedEdges).length, "D3 · once linked, the warning is gone");
  const sc = buildDtcScene(g.nodes, linkedEdges);
  const blocks = sc.nodes.filter((n) => n.id.endsWith("::set")).map((n) => n.id);
  eq(blocks, [dtcSetId("acq-drone")], "D3 · the lot is ONE block, the capture's");
  ok(before.nodes.filter((n) => n.id.endsWith("::set")).length === 2, "D3 · (unlinked: one block per event, as dev29 drew it)");
  const a = sc.byId.get("acq-drone"), b = sc.byId.get(DL);
  const laneOf = (n) => sc.lanes.findIndex((l) => n.y >= l.y && n.y < l.y + l.height);
  ok(!!a && !!b && laneOf(a) === laneOf(b) && laneOf(a) === 0 && b.y > a.y && a.x === b.x,
     "D3 · the two events are two ROWS of the acquisitions' lane, the later under the earlier");
  ok(/2018-02-17/.test(a?.label ?? "") && /2026-09-29/.test(b?.label ?? ""), `D3 · each says its date: ${a?.label} / ${b?.label}`);
  ok(sc.edges.some((e) => e.source === DL && e.target === dtcSetId("acq-drone")), "D3 · the download points to the block too");
  eq(sc.nodes.filter((n) => n.node.node_type === "dtc_acquisition").length, 4, "D3 · the events stay four (none merged)");
  const SP = process.env.DEV30_SP_DTC;
  if (SP) {
    const raw = JSON.parse(readFileSync(SP, "utf8"));
    const sp = raw.graph ?? Object.values(raw.graphs)[0];
    const tw = twinAcquisitions(sp.nodes, sp.edges);
    ok(tw.length === 1, `D3 · San Pietro: one pair (${JSON.stringify(tw)})`);
    const e2 = [...sp.edges, { id: "cite", source: tw[0].later, target: tw[0].earlier, edge_type: "dtc_had_input" }];
    const s2 = buildDtcScene(sp.nodes, e2);
    const bl = s2.nodes.filter((n) => n.id.endsWith("::set"));
    eq(bl.map((n) => n.label), ["▸ 71 photos"], "D3 · San Pietro: the B2 block stays ONE");
    eq(s2.nodes.filter((n) => n.node.node_type === "dtc_acquisition").length, 5, "D3 · San Pietro: the events stay (5, two of them the lot's)");
    console.log("  San Pietro DTC:", s2.nodes.length, "boxes; lanes", JSON.stringify(s2.lanes.map((l) => l.label)));
  }
}

// ── U5 · the language recognised, as data.lang only ────────────────────────
{
  eq(recogniseLanguage("Fondazione del tempio")?.tag, "it", "U5 · «Fondazione del tempio» is Italian");
  eq(recogniseLanguage("I recongnize a wall made of three levels of stone bricks")?.tag, "en", "U5 · D.02.01's reading is English");
  eq(recogniseLanguage("Campanile"), null, "U5 · one word is too short to tell");
  const props = proposeLanguages([{ id: "a", text: "Fondazione del tempio" }, { id: "b", text: "Campanile" },
                                  { id: "c", text: "Special Find: drum of column" }]);
  eq(props, [{ id: "a", tag: "it", by: "text" }, { id: "c", tag: "en", by: "text" }, { id: "b", tag: "it", by: "others" }],
     "U5 · a short text takes the language of the others, and says so");
  const src = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("function confirmRecognisedLanguages"), src.indexOf("function confirmRecognisedLanguages") + 4500);
  ok(/lang: x\.tag/.test(fn) && !/ai_assisted|validated_by|ai_generated|markAi|aiv\./.test(fn.replace(/\/\/.*$|\/\*[\s\S]*?\*\/|\* .*$/gm, "")),
     "U5 · the apply writes data.lang and nothing of the AI marker (the exception, in the code)");
}

// ── A3 · the packagings from the datamodel ──────────────────────────────────
{
  ok(packagings().includes("file_set") && packagings().includes("datablock"), `A3 · the datamodel declares them: ${packagings()}`);
  setLocale("en");
  eq(packagingLabel({ node_type: "resource", data: { packaging: "file_set" } }), "File set", "A3 · «File set» in English");
  setLocale("it");
  eq(packagingName("file_set"), "Insieme di file", "A3 · …and in Italian, from the translations");
  setLocale("en");
  const i18n = readFileSync(new URL("../src/i18n.ts", import.meta.url), "utf8");
  ok(!/"res\.pack\./.test(i18n), "A3 · no `res.pack.*` left in i18n.ts");
}

// ── D6 · the library's warnings in the Warnings view ────────────────────────
{
  const st = new DocumentStore({ header: {}, graph: { graph_id: "g", nodes: [{ id: "lic", node_type: "license", name: "CC-BY-ND" }], edges: [] } });
  const rows = issues({ doc: st.doc, nodes: st.liveNodes(), isUnit: isStratigraphicType, t: tt,
    library: [{ txt: "license name and type disagree: 'CC-BY-ND' (lic) is of type 'CC-BY-NC-ND'", node: "lic" }] })
    .filter((i) => i.rule === "library");
  ok(rows.length === 1 && rows[0].node === "lic" && rows[0].sev === "warn", "D6 · a validate warning is a row, on the node it names");
  const bridge = readFileSync(new URL("../../tools/em_bridge.py", import.meta.url), "utf8");
  ok(/route == "\/validate"/.test(bridge) && /api\.validate\(graph\)/.test(bridge), "D6 · read from the bridge's /validate (api.validate), not rewritten");
}

// ── A1/A2 · the bridge asks the public seams ────────────────────────────────
{
  const bridge = readFileSync(new URL("../../tools/em_bridge.py", import.meta.url), "utf8");
  const code = bridge.replace(/#.*$/gm, "");
  ok(/from s3dgraphy\.resources import em_id_of/.test(code), "A2 · em_id_of, the public helper");
  ok(!/getattr\(node, "url", None\)/.test(code), "A1 · no document url read by hand");
}

if (fails.length) {
  console.error(`dev30: ${fails.length} of ${checks} checks FAILED:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`dev30: ${checks} checks passed`);
