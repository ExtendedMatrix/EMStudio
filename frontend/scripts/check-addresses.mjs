// dev27 · executable check of src/addresses.ts and src/passages.ts — the TS
// twins of s3Dgraphy `resources/addresses.py` and of «where the text lives».
//
//   node scripts/check-addresses.mjs
//
// The Vitruvius fixture is s3Dgraphy's (tests/fixtures/vitruvio/, copied in
// testdata/vitruvio.em.json): the work, two manifestations, the extractor with
// the Latin passage on page 3 of the scan, two translations.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const TD = new URL("../testdata/", import.meta.url).pathname;
const globPlugin = {
  name: "glob",
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      let text = readFileSync(args.path, "utf8");
      text = text.replace(/import\.meta\.glob\(\s*"\.\/assets\/([^/]+)\/\*\.(\{[^}]+\}|\w+)"[\s\S]*?\}\)/g,
        (_m, dir, ext) => {
          const exts = ext.startsWith("{") ? ext.slice(1, -1).split(",") : [ext];
          const files = readdirSync(`${SRC}assets/${dir}`).filter((f) => exts.some((e) => f.endsWith(`.${e}`)));
          return JSON.stringify(Object.fromEntries(files.map((f) => [`./assets/${dir}/${f}`, `url:${f}`])));
        });
      return { contents: text, loader: "ts" };
    });
  },
};
const bundle = await esbuild.build({
  stdin: { contents: `export * from "./addresses"; export * from "./passages";
    export { DocumentStore } from "./model"; export { contentLanguages, contentLanguagesValue, nodeLanguage } from "./translation";`,
    resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, plugins: [globPlugin],
  loader: { ".svg": "text", ".png": "text" }, logLevel: "silent",
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const fails = [];
const ok = (c, w) => { checks++; if (!c) fails.push(w); };
const eq = (a, b, w) => { checks++; try { assert.deepStrictEqual(a, b); } catch { fails.push(`${w}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); } };
const refused = (fn) => { try { fn(); return "accepted"; } catch (e) { return e instanceof M.AddressError ? e.code : `threw ${e}`; } };

const D = "sha256:" + "a".repeat(64);
const doc = () => ({ graph: { graph_id: "g", name: "g", data: {}, nodes: [
  { id: "scan", node_type: "resource", name: "vitruvio.pdf", description: "",
    data: { url: "scans/vitruvio.pdf", checksum: D, residency: "resident" } },
  { id: "page", node_type: "resource", name: "page", description: "", data: { url: "https://example.org/p" } },
], edges: [] } });

// ── the addresses (api.add_address / check_address) ─────────────────────────
{
  const st = new M.DocumentStore(doc());
  eq(M.addresses(st.node("scan")), [{ locator: "scans/vitruvio.pdf", residency: "resident", primary: true }],
     "one address: data.url, as it always was");
  ok(!("addresses" in st.node("scan").data), "…and no list is written for it");
  const two = M.addAddress(st, "scan", "s3://em/aaaa", { checksum: D, residency: "resident" });
  eq(two.map((a) => [a.locator, a.primary]), [["scans/vitruvio.pdf", true], ["s3://em/aaaa", false]],
     "two addresses, one digest, one resource — url stays address 0");
  eq(st.node("scan").data.url, "scans/vitruvio.pdf", "data.url unchanged (what Heriverse reads)");
  eq(M.addAddress(st, "scan", "s3://em/aaaa", { checksum: D }).length, 2, "the same address twice changes nothing");
  eq(refused(() => M.addAddress(st, "scan", "z.pdf", { checksum: "sha256:" + "b".repeat(64) })), "sister",
     "another digest is a sister resource, refused");
  eq(refused(() => M.addAddress(st, "scan", "z.pdf", {})), "their-digest", "no digest of the copy: refused");
  eq(refused(() => M.addAddress(st, "page", "https://mirror/p", { checksum: D })), "no-digest",
     "a resource with no digest cannot have copies");
  const r = M.checkAddress(st, "scan", "scans/vitruvio.pdf", false, "2026-10-31T09:00:00Z");
  eq(r, { live: 1, warning: "dead" }, "a dead address is a warning while a live one remains");
  eq(M.addresses(st.node("scan")).length, 2, "…and it stays");
  eq(M.liveAddresses(st.node("scan")).map((a) => a.locator), ["s3://em/aaaa"], "live addresses");
  eq(M.checkAddress(st, "scan", "s3://em/aaaa", false).warning, "none-alive", "none alive: said louder");
  eq(M.resourceWithDigest(st.doc.graph.nodes, D.slice(7))?.id, "scan", "the resource with a digest (bare hex too)");
  // the Storage's question (the ingest funnel, writeResourceNode)
  eq([M.isAnotherCopy(st.node("scan"), "/disco/vitruvio.pdf"), M.isAnotherCopy(st.node("scan"), "scans/vitruvio.pdf"),
      M.isAnotherCopy(null, "/x"), M.isAnotherCopy(st.node("scan"), "")], [true, false, false, false],
     "another copy at a new place is proposed as an address; the known one, none, or no locator are not");
  eq([M.addressKind("https://x"), M.addressKind("s3://b/k"), M.addressKind("/a/b.pdf"), M.addressKind("rel/b.pdf")],
     ["http", "other", "disk", "disk"], "how an address is reached");
}

// ── the language of the content (A3) ────────────────────────────────────────
{
  const v = JSON.parse(readFileSync(`${TD}vitruvio.em.json`, "utf8"));
  const st = new M.DocumentStore(v);
  eq(M.contentLanguages(st.node("scan")), ["it", "la"], "the scan is Latin and Italian (a sorted list)");
  eq(M.contentLanguages(st.node("lacus")), ["la"], "the online page is Latin");
  eq(M.nodeLanguage(st.node("lacus")), null, "…which is not the language of its description");
  eq(M.contentLanguagesValue(["la", "it", "la"]), ["it", "la"], "the canonical value: sorted, no repeats");
  eq(M.contentLanguagesValue(["la"]), "la", "one tag is a string");
  eq(M.contentLanguagesValue([]), undefined, "none: the key goes");

  // ── where the text lives: the passages of the work ──
  const ps = M.passagesOf(st.doc, "vitr");
  eq(ps.map((p) => [p.extractor.id, p.on?.id, p.page, p.geometry, p.lang]),
     [["vitr.01", "scan", 3, "region2d", "la"]],
     "the work is read through D.vitr.01, on page 3 of the scan, in Latin");
  ok(ps[0].text.startsWith("Aedium autem principia"), "the passage's own words are the extractor's");
  eq(M.manifestationsOf(st.doc, "vitr").map((r) => r.id).sort(), ["lacus", "scan"], "two manifestations of one work");
  eq(M.passagesOf(st.doc, "ed_it"), [], "the edition is not read through a passage here");
}

if (fails.length) {
  console.error(`addresses: ${fails.length} of ${checks} checks FAILED`);
  for (const f of fails) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`addresses: ${checks} checks passed`);
