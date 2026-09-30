// NIGHT-RISORSA-FILE · parte 3 · executable check of the choice of the
// representation and of the addresses of its files (`src/representation.ts`).
//
//   node scripts/check-representation.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const TD = new URL("../testdata/", import.meta.url).pathname;
const bundle = await esbuild.build({
  stdin: { contents: `export * from "./representation"; export * from "./resources";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const R = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const fails = [];
const ok = (c, what) => { checks++; if (!c) fails.push(what); };
const eq = (a, b, what) => {
  checks++;
  try { assert.deepStrictEqual(a, b); } catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); }
};

const doc = JSON.parse(readFileSync(`${TD}risorsa-file.em.json`, "utf8"));
const g = R.plainGraph(doc.graph);

// D.2 → RM_PODIO → the file set
const s2 = R.startResources(g, "D2");
eq(s2, ["podio_lod1"], "D.2 reaches the resource of its RM");
const c2 = R.chooseModel(g, s2);
eq([c2.kind, c2.resourceId, c2.packaging, c2.entry.path, c2.files.length], ["open", "podio_lod1", "file_set", "OB_PODIO_LOD1.obj", 3],
  "the web viewer opens the file set, its door is the obj");
// from the MASTER (the datablock), the web viewer is handed the distribution
const cb = R.chooseModel(g, ["podio_blend"]);
eq([cb.kind, cb.resourceId], ["open", "podio_lod1"], "starting from the datablock, the web viewer gets its file_set");
eq(R.chooseModel(g, ["podio_blend"], ["datablock"]).kind, "open", "…and Blender, asked with {datablock}, gets the datablock");
// D.4 → RM_BLEND → a datablock nothing was exported from
const c4 = R.chooseModel(g, R.startResources(g, "D4"));
eq([c4.kind, c4.blendFile, c4.datablock], ["blender", "RB/TempluMare_2021.blend", "OB_PRATO_LOD1"], "D.4: only in Blender, with its .blend");

// the addresses: offline beside the em.json, online by digest
const off = R.addressMap(c2, { mode: "offline", baseDir: "/base", fileUrl: (p) => `file:${p}` });
eq(off.entryUrl, "https://emres.invalid/podio_lod1/OB_PODIO_LOD1.obj", "the loader is handed a VIRTUAL entry");
eq(off.modifier(off.entryUrl), "file:/base/RM/TempluMare_tiles/LOD1/OB_PODIO_LOD1.obj", "offline: the door by its locator beside the em.json");
eq(off.modifier("https://emres.invalid/podio_lod1/textures/T_OB_PODIO_LOD1.jpg"),
  "file:/base/RM/TempluMare_tiles/LOD1/textures/T_OB_PODIO_LOD1.jpg", "…a texture by the path of its has_file, beside the door");
eq(off.modifier("https://emres.invalid/podio_lod1/textures/cc_T_OB_PODIO_LOD1.png"),
  "file:/base/RM/TempluMare_tiles/LOD1/textures/cc_T_OB_PODIO_LOD1.png", "…a file the graph does not list: beside the door…");
eq(off.unlisted, ["textures/cc_T_OB_PODIO_LOD1.png"], "…and reported");
eq(off.modifier("https://other.example/x.png"), "https://other.example/x.png", "a URL outside the resource is not touched");
const sums = JSON.parse(readFileSync(`${TD}risorsa-file.sums.json`, "utf8"));
const on = R.addressMap(c2, { mode: "online", assetUrl: (c) => `https://store/asset/${c}` });
eq(on.modifier("https://emres.invalid/podio_lod1/OB_PODIO_LOD1.mtl"),
  `https://store/asset/${sums["LOD1/OB_PODIO_LOD1.mtl"].checksum}`, "online: every file by its digest");
ok(/unlisted/.test(on.modifier("https://emres.invalid/podio_lod1/not-listed.jpg")) && on.unlisted.includes("not-listed.jpg"),
  "…and a file the graph does not list has no address online, and is reported");
// a revision: the viewer opens the CURRENT one
const tex = R.resourceFiles(g, "podio_lod1").find((f) => f.path.endsWith(".jpg")).node.id;
const rev = R.replaceFile(g, "podio_lod1", tex, { checksum: "sha256:" + "e".repeat(64) });
const cr = R.chooseModel(g, R.startResources(g, "D2"));
eq(cr.resourceId, rev.new_resource_id, "after a revision the viewer opens the current one");
ok(/current revision/.test(cr.reason), "…and says so");
// a plain one-file resource needs no choice (the old path stays)
R.addResource(g, { resourceId: "plain", name: "muro.glb", files: [{ path: "/em/studio/testdata/muro.glb" }] });
ok(!R.needsChoice(g, "plain"), "a plain one-file resource keeps the old path (its url)");

if (fails.length) {
  console.error(fails.map((f) => `  ✗ ${f}`).join("\n"));
  console.error(`representation: ${fails.length} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`representation: ${checks} checks passed`);
