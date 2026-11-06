// MICRO-MEMORIA-SESSIONE p.4 · executable check of `src/save-rebase.ts` — «Salva
// come» in another folder rewrites the urls written relative to the em.json, so
// each one names the same file from the new place (E.D., 1 Nov 2026: v7 saved on
// the Desktop → 536 files missing).
//
//   node scripts/check-save-rebase.mjs
//   TEMPLU=<a copy of Templu Mare v6's em.json> node scripts/check-save-rebase.mjs
//
// With TEMPLU (default: /tmp/vpu/T0/EM/TempluMare_v6_optimized.em.json, a clone
// of OneDrive's): the document is written into ANOTHER folder (a «Desktop» in a
// temporary directory), as it is and rewritten, and every disk url is looked for
// from there. As it is: hundreds missing. Rewritten: as many as in its own folder.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * from "./save-rebase"; export { resolveRelative } from "./paths"; export { parseBlendLocator } from "./resources";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent",
});
const R = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const fails = [];
const eq = (a, b, what) => {
  checks++;
  try { assert.deepStrictEqual(a, b); } catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); }
};

// ── pure ─────────────────────────────────────────────────────────────────────
const OLD = "/Users/ed/OneDrive/T6.5/EM/TempluMare_v6.em.json";
const DESK = "/Users/ed/Desktop/TempluMare_v7.em.json";
eq(["DosCo/D.05.pdf", "../RB/a.glb", "/abs/a.glb", "onedrive://D/a.obj", "https://x/a.jpg", "blend://../RB/T.blend#Mesh/x", "blend:///abs/T.blend#Mesh/x", "", null]
  .map(R.isRelativeDiskUrl), [true, true, false, false, false, true, false, false, false],
  "relative: a path or a .blend written relative; not an absolute path, onedrive://, the web, nothing");
eq(R.rebaseUrl("DosCo/D.05 è #1.pdf", OLD, DESK), "../OneDrive/T6.5/EM/DosCo/D.05 è #1.pdf", "a document beside the em.json, from the Desktop");
eq(R.rebaseUrl("../RB/LOD0/a.obj", OLD, DESK), "../OneDrive/T6.5/RB/LOD0/a.obj", "a model in a sibling folder");
eq(R.rebaseUrl("blend://../RB/TempluMare_2021.blend#Mesh/ME_EST_L_LOD0", OLD, DESK),
   "blend://../OneDrive/T6.5/RB/TempluMare_2021.blend#Mesh/ME_EST_L_LOD0", "a datablock keeps its type and name, its .blend is rewritten");
eq(R.rebaseUrl("DosCo/a.pdf", OLD, "/Users/ed/OneDrive/T6.5/EM/TempluMare_v7.em.json"), null, "the same folder: nothing to rewrite");
eq(R.rebaseUrl("../RB/a.glb", OLD, "/Users/ed/OneDrive/T6.5/EM/sub/v7.em.json"), "../../RB/a.glb", "a folder below: one more ..");
eq(R.rebaseUrl("/abs/a.glb", OLD, DESK), null, "an absolute path stays");
eq(R.rebaseUrl("onedrive://Dottorato/a.obj", OLD, DESK), null, "onedrive:// stays");
eq(R.rebaseUrl("../RB/a.glb", "C:/Users/Ed/T6.5/EM/x.em.json", "D:/Copia/x.em.json"), "C:/Users/Ed/T6.5/RB/a.glb",
   "another drive: the path made absolute (still found)");
eq(R.rebaseUrl("proxies/SU002.glb", "C:/Users/Ed/T6.5/EM/x.em.json", "C:/Users/Ed/Desktop/x.em.json"), "../T6.5/EM/proxies/SU002.glb",
   "Windows, the same drive: relative again");
eq(R.sameFolder("/a/b/x.em.json", "/a/b/y.em.json"), true, "same folder");
eq(R.sameFolder("/a/b/x.em.json", "/a/c/x.em.json"), false, "another folder");

const doc = { graphs: {
  g1: { nodes: [{ id: "n1", data: { url: "DosCo/a.pdf" } }, { id: "n2", data: { url: "https://x" } }, { id: "n3", data: {} }, { id: "n4" }] },
  shelf: { nodes: [{ id: "s1", data: { url: "../SB/foto/1.jpg" } }] },
  bad: "not a section",
} };
eq(R.relativeUrlCount(doc), 2, "two relative urls in the container (the shelf counts)");
const plan = R.rebasePlan(doc, OLD, DESK);
eq(plan.map((p) => [p.graph, p.id, p.to]), [["g1", "n1", "../OneDrive/T6.5/EM/DosCo/a.pdf"], ["shelf", "s1", "../OneDrive/T6.5/SB/foto/1.jpg"]],
   "the plan, graph by graph (a node with no url, a web url: untouched)");
const copy = JSON.parse(JSON.stringify(doc));
R.applyRebase(copy, plan);
eq([copy.graphs.g1.nodes[0].data.url, copy.graphs.g1.nodes[1].data.url, copy.graphs.shelf.nodes[0].data.url],
   ["../OneDrive/T6.5/EM/DosCo/a.pdf", "https://x", "../OneDrive/T6.5/SB/foto/1.jpg"], "applied to the container");
// two graphs with a node of the same id: each keeps its own
const twin = { graphs: { a: { nodes: [{ id: "x", data: { url: "a.glb" } }] }, b: { nodes: [{ id: "x", data: { url: "b.glb" } }] } } };
R.applyRebase(twin, R.rebasePlan(twin, OLD, DESK));
eq([twin.graphs.a.nodes[0].data.url, twin.graphs.b.nodes[0].data.url], ["../OneDrive/T6.5/EM/a.glb", "../OneDrive/T6.5/EM/b.glb"], "a node id in two graphs: each its own url");

// ── the real Templu Mare v6, saved into another folder ──────────────────────
const TEMPLU = process.env.TEMPLU ?? "/tmp/vpu/T0/EM/TempluMare_v6_optimized.em.json";
let real = null;
if (existsSync(TEMPLU)) {
  const text = readFileSync(TEMPLU, "utf8");
  const container = JSON.parse(text);
  const missingFrom = (c, emjson) => {
    let disk = 0, missing = 0;
    for (const g of Object.values(c.graphs ?? {})) for (const n of g.nodes ?? []) {
      const u = n.data?.url;
      if (typeof u !== "string" || !u.trim()) continue;
      const blend = R.parseBlendLocator(u);
      const p = blend ? blend[0] : u;
      if (/^[a-z][a-z0-9+.-]+:/i.test(p)) continue;          // onedrive://, the web: not this folder's business
      disk++;
      if (!existsSync(R.resolveRelative(emjson, p).replace(/\/$/, ""))) missing++;
    }
    return { disk, missing };
  };
  const tmp = mkdtempSync(join(tmpdir(), "save-rebase-"));
  const desk = join(tmp, "Desktop");
  mkdirSync(desk, { recursive: true });
  const asIs = join(desk, "TempluMare_v7_asis.em.json");
  const rewritten = join(desk, "TempluMare_v7.em.json");
  writeFileSync(asIs, text);
  const rows = R.rebasePlan(container, TEMPLU, rewritten);
  const c2 = JSON.parse(text);
  R.applyRebase(c2, rows);
  writeFileSync(rewritten, JSON.stringify(c2, null, 1));
  const home = missingFrom(container, TEMPLU);
  const broken = missingFrom(JSON.parse(readFileSync(asIs, "utf8")), asIs);
  const fixed = missingFrom(JSON.parse(readFileSync(rewritten, "utf8")), rewritten);
  real = { em: TEMPLU, desktop: desk, relative: R.relativeUrlCount(container), rewritten: rows.length, home, asIs: broken, after: fixed };
  writeFileSync(join(tmp, "result.json"), JSON.stringify(real, null, 1));
  eq(rows.length, R.relativeUrlCount(container), "every relative url of Templu Mare is rewritten for the Desktop");
  eq(broken.missing > 400, true, `saved as it is on the Desktop, hundreds of files are missing (${broken.missing})`);
  eq(fixed.missing, home.missing, `rewritten, as many missing as in its own folder (${fixed.missing} = ${home.missing})`);
  eq(fixed.missing, 0, "and that is 0: every file found from the Desktop");
  console.log(`Templu Mare v6: ${real.relative} relative urls · as it is from the Desktop ${broken.missing}/${broken.disk} missing · rewritten ${fixed.missing}/${fixed.disk} · in its folder ${home.missing}/${home.disk} · ${tmp}`);
} else console.log(`(no ${TEMPLU}: the real case skipped)`);

if (fails.length) {
  console.error(`check-save-rebase: ${fails.length} FAILED of ${checks}\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log(`check-save-rebase: ${checks} checks OK${real ? "" : " (pure only)"}`);

