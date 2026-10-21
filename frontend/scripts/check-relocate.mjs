// MICRO-PERCORSI-WINDOWS p.3 · executable check of `src/relocate.ts` — what
// «Ritrova i file…» makes of the bridge's answers: found / ambiguous / missing /
// to be linked, and the urls it writes (relative to the em.json, Windows too).
//
//   node scripts/check-relocate.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * from "./relocate";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent",
});
const R = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const fails = [];
const eq = (a, b, what) => {
  checks++;
  try { assert.deepStrictEqual(a, b); } catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); }
};

const lost = [
  { id: "p1", name: "SU002", state: "missing", url: "proxies/SU002.glb" },
  { id: "p2", name: "Architrave", state: "missing", url: "../SB/versions/Architrave@lod0.glb" },
  { id: "p3", name: "D.05", state: "missing", url: "DosCo/D.05 è #1.pdf" },
  { id: "p4", name: "TM015", state: "missing", url: "onedrive://Dottorato Bucarest/2_Rilievo/TM015.obj" },
  { id: "p5", name: "DJI_0238", state: "empty_copy", url: "/Users/ed/Desktop/DJI_0238.JPG" },
  { id: "p6", name: "LOD0", state: "missing", url: "../RB/LOD0/a.obj" },
];
const moved = [
  { id: "p1", matches: [{ path: "D:\\Scavi\\TM\\proxies\\SU002.glb", how: "exact", size: 10 }] },
  { id: "p2", matches: [{ path: "C:\\Users\\Ed\\T6.5\\SB\\versions\\Architrave@lod0.glb", how: "exact", size: 9 },
                        { path: "C:\\Users\\Ed\\copia\\Architrave@lod0.glb", how: "exact", size: 9 }] },
  { id: "p3", matches: [{ path: "C:\\Users\\Ed\\T6.5\\EM\\DosCo\\D.05 è #1.pdf", how: "possible", size: 1 }] },
  { id: "p5", matches: [{ path: "C:\\Users\\Ed\\T6.5\\foto\\DJI_0238.JPG", how: "probable", size: 4 }] },
];
const v = R.classify(lost, moved);
eq(v.map((x) => [x.id, x.kind]), [["p1", "found"], ["p2", "ambiguous"], ["p3", "ambiguous"], ["p4", "link"], ["p5", "found"], ["p6", "missing"]],
   "one sure candidate = found; two of the surest kind = ambiguous; a namesake only = ambiguous; onedrive:// with no OneDrive folder = to link; none = missing");
eq(R.classify(lost, moved, { onedriveRoot: "C:/Users/Ed/OneDrive - CNR" }).find((x) => x.id === "p4").kind, "missing",
   "with this computer's OneDrive folder set, an onedrive:// not found is missing");
eq(R.tally(v), { found: 2, ambiguous: 2, missing: 1, link: 1 }, "the tally");

const EMJ = "C:/Users/Ed/T6.5/EM/TempluMare_v4.em.json";
const chosen = v.map((x) => (x.id === "p2" ? { ...x, choice: x.candidates[0].path } : x));
eq(R.rewritePlan(chosen, EMJ), [
  { id: "p1", from: "proxies/SU002.glb", to: "D:/Scavi/TM/proxies/SU002.glb" },
  { id: "p5", from: "/Users/ed/Desktop/DJI_0238.JPG", to: "../foto/DJI_0238.JPG" },
], "the rewrite: relative to the em.json (Windows case ignored), another drive absolute, an unchanged url (p2, picked where it was) not rewritten");
eq(R.rewritePlan([{ id: "x", name: "x", url: "a.glb", kind: "found", choice: "/tmp/s/RB/a.glb", candidates: [] }], "/tmp/s/EM/x.em.json"),
   [{ id: "x", from: "a.glb", to: "../RB/a.glb" }], "POSIX: ../RB");
eq(R.rewritePlan([{ id: "x", name: "x", url: "a.glb", kind: "found", choice: "\\\\nas\\scavi\\TM\\RB\\a.glb", candidates: [] }], "//nas/scavi/TM/EM/x.em.json"),
   [{ id: "x", from: "a.glb", to: "../RB/a.glb" }], "a share: ../RB");
eq(["proxies/a.glb", "../RB/a.obj", "/abs/a.jpg", "C:\\x\\a.jpg", "onedrive://D/a.obj", "https://x/a.jpg", "blend://../RB/a.blend#Mesh/x", ""].map(R.isDiskUrl),
   [true, true, true, true, true, false, false, false], "isDiskUrl: what the disk answers for (and onedrive://), not the web nor a datablock");

if (fails.length) {
  console.log(`check-relocate: ${fails.length} of ${checks} FAILED`);
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check-relocate: ${checks} checks OK`);
