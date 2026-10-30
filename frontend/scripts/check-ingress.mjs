// MICRO-INGRESSO-ASSET-1 · «Fai entrare un asset»: what the procedure decides
// without the DOM (ingress.ts) — the five steps in E.D.'s order (V2: the
// frame first), the defaults read off the context (a SHIFT.txt, the study's
// georeference), the lot (V4: a document each, or one container), a choice
// changed for one file, the act each provenance is (an origin only for the
// LiDAR; the texturing with two inputs), the scale never for a LiDAR, the
// frame as `data.frame`, the stamp's parameters, the summary's piece of
// Chain, why «Fai entrare» waits — and the Archive's desktop drop.
//
//   node scripts/check-ingress.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (f) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${f}`], bundle: true, format: "esm", write: false });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const I = await load("ingress.ts");
const D = await load("desktop-drop.ts");

let checks = 0;
const ok = (c, what) => { checks++; assert.ok(c, what); };
const eq = (a, b, what) => { checks++; assert.deepEqual(a, b, what); };

const obj = (name, dir = "/p/TempluMare/RB/LOD0") => ({ path: `${dir}/${name}`, name, size: 1000, mtime: 1, type: "file" });
const ctx = (over = {}) => ({ nextDocName: "D.41", takenNames: ["D.01", "D.12", "D.38", "D.40", "US402"], today: "2026-10-31",
  operator: { id: "https://orcid.org/0000-0002-1825-0097", label: "E. D." }, graphFrame: null, shiftFile: null, ...over });

// 1 · the steps, V2
eq([...I.STEPS], ["choose", "frame", "document", "stamp", "after"], "the five steps, the frame before the document");

// 2 · the defaults
{
  const s = I.newIngress([obj("OB_EST_LOD0.obj")], ctx());
  eq(s.step, "choose", "it opens on Choose");
  eq(s.grouping, "each", "one asset: a document of its own");
  eq(s.frame.mode, "points", "no georeference anywhere: by points");
  eq(s.doc.name, "D.41", "the next free D.xx");
  eq(s.doc.description, "OB EST LOD0", "the description from the file's name");
  eq(s.frame.points.length, 3, "three empty points to start");
  const g = I.newIngress([obj("a.obj")], ctx({ graphFrame: { epsg: 3844, shift: [583000, 4921000, 0] } }));
  eq(g.frame.mode, "already", "a georeferenced study: «already georeferenced» proposed");
  const f = I.newIngress([obj("a.obj"), obj("b.obj")], ctx({ shiftFile: { epsg: 3844, shift: [583000, 4921000, 300], name: "SHIFT.txt" } }));
  eq([f.frame.mode, f.frame.epsg, f.frame.shiftSource, f.frame.shiftNote], ["epsg", 3844, "file", "SHIFT.txt"], "a SHIFT.txt beside: EPSG + shift from it");
  eq(f.grouping, "container", "a lot: one container-document by default");
  eq(f.doc.description, "RB LOD0", "a lot's description: its folder");
  eq(I.guessProvenance([obj("scan.obj", "/p/ipad_lidar")]), "lidar", "an iPad folder says LiDAR");
  eq(I.guessProvenance([obj("m.obj", "/p/RealityScan/out")]), "realityscan", "RealityScan by its folder");
}

// 3 · the lot: names, container, one choice changed per file
{
  const lot = ["OB_EST_LOD0.obj", "OB_NORD_LOD0.obj", "OB_SUD_LOD0.obj"].map((n) => obj(n));
  const s = I.newIngress(lot, ctx());
  eq(I.documentsOf(s, ctx().takenNames).map((d) => [d.name, d.assets.length]), [["D.41", 3]], "container: ONE document, three files");
  s.grouping = "each";
  eq(I.documentsOf(s, ["D.42"]).map((d) => d.name), ["D.41", "D.43", "D.44"], "a document each, the taken names skipped");
  s.overrides[lot[1].path] = { docName: "D.50" };
  eq(I.documentsOf(s, []).map((d) => d.name), ["D.41", "D.50", "D.42"], "a name changed for one file");
  s.overrides[lot[2].path] = { skip: true, provenance: "lidar" };
  eq(I.entering(s).length, 2, "an unticked file stays out");
  s.overrides[lot[0].path] = { master: "complete" };
  eq(I.effective(s, lot[0]).master, "complete", "the master changed for one file");
  eq(I.effective(s, lot[1]).master, "vhr", "…the others keep the lot's");
  eq(I.nextNames("D.09", 3, ["D.10"]), ["D.09", "D.11", "D.12"], "the digits kept, the taken skipped");
  s.doc.mode = "existing"; s.doc.existingId = "doc-7"; s.doc.name = "D.07";
  eq(I.documentsOf(s, []).map((d) => [d.name, d.existingId, d.assets.length]), [["D.07", "doc-7", 2]], "an existing document takes all");
}

// 4 · the act of each provenance (the origin is not the easy road)
{
  const a = (p, m = "vhr", w = { text: "" }) => I.actFor(p, m, w);
  eq([a("lidar").origin, a("lidar").kind, a("lidar").parents.length], [true, "laserscanner", 0], "a LiDAR scan IS the capture");
  eq([a("metashape").origin, a("metashape").kind, a("metashape").technique], [false, "photogrammetry", "Agisoft Metashape"], "Metashape: photogrammetry");
  eq(a("metashape").parents.map((p) => p.labelKey), ["ingress.parent.images"], "…from the images, declared");
  eq(a("realityscan").technique, "RealityScan", "RealityScan named");
  const c = a("realityscan", "complete", { text: "", reducedMesh: "/p/RB/mesh_ridotta.obj", alignedImages: "foto 2026" });
  eq([c.kind, c.parents.length, c.parents[0].kind, c.parents[0].path, c.parents[1].label], ["texturing", 2, "file", "/p/RB/mesh_ridotta.obj", "foto 2026"],
     "a complete master: texturing with TWO inputs, the mesh a file when it is a path");
  eq([a("existing", "vhr", { text: "rilievo 2019" }).kind, a("existing", "vhr", { text: "rilievo 2019" }).parents[0].label],
     ["format_conversion", "rilievo 2019"], "a pre-existing model: declared by its words, not an origin");
  eq(a("other", "vhr", { text: "Polycam" }).kind, "transformation", "other: a transformation");
  ok(!I.scaleAllowed("lidar") && I.scaleAllowed("metashape"), "the scale: never for a LiDAR");
}

// 5 · the frame
{
  const s = I.newIngress([obj("a.obj")], ctx());
  eq(I.frameMissing(s.frame), "ingress.why.points", "by points: three pairs needed");
  s.frame.points = [
    { id: "P1", local: [0, 0, 0], world: [583412.31, 4921087.66, 312.45], use: true },
    { id: "P2", local: [12, 0, 0], world: [583424.3, 4921087.7, 312.5], use: true },
    { id: "P3", local: [0, 9, 1], world: [583412.3, 4921096.6, 313.4], use: false },
  ];
  eq(I.pairs(s.frame.points).length, 3, "the pairs");
  eq(I.frameMissing(s.frame), "ingress.why.points", "a switched-off pair does not count");
  s.frame.points[2].use = true;
  eq(I.frameMissing(s.frame), "ingress.why.fit", "three pairs: compute");
  s.frame.fit = { ok: true, n: 3, rms: 0.004, mean: 0.003, scale: 1, scaled: false, residuals: {} };
  eq(I.frameMissing(s.frame), null, "computed: ready");
  s.frame.epsg = 3844;
  eq(I.stampParameters(s.frame, "points").registration.crs, "EPSG:3844", "the stamp carries the registration");
  eq(I.nextPointId(s.frame.points), "P4", "the next point's name");
  s.frame.mode = "epsg"; s.frame.shift = [583000, 4921000, 300]; s.frame.shiftSource = "file"; s.frame.shiftNote = "SHIFT.txt";
  eq(I.frameData(s.frame), { crs: "EPSG:3844", shift: [583000, 4921000, 300], note: "SHIFT.txt", source: "file" }, "data.frame as s3Dgraphy writes it");
  eq(I.stampParameters(s.frame, "epsg"), { frame: I.frameData(s.frame) }, "…and in the stamp");
  s.frame.epsg = null;
  eq(I.frameMissing(s.frame), "ingress.why.epsg", "EPSG + shift without the code waits");
  eq(I.residualText(0.0042), "4.20 mm", "a residual in millimetres");
  eq(I.residualText(1.5), "1.500 m", "…in metres from one up");
}

// 6 · the summary and why «Fai entrare» waits
{
  const s = I.newIngress([obj("a.obj"), obj("b.obj")], ctx({ shiftFile: { epsg: 3844, shift: [1, 2, 3], name: "SHIFT.txt" } }));
  const rows = I.summary(s, []);
  eq(rows.length, 1, "one container, one row");
  eq(rows[0].chain.map((c) => c.sign), ["parent", "act", "file", "frame", "doc"], "the piece of Chain: parent → act → files → frame → document");
  eq(I.readyToEnter(s), null, "ready");
  s.doc.provenance = "other";
  eq(I.readyToEnter(s), "ingress.why.provenance", "«other» says from where");
  s.doc.provenanceText = "Polycam";
  s.stamp.operator = { id: "", label: "" };
  eq(I.readyToEnter(s), "ingress.why.operator", "the stamp needs who signs it");
  s.stamp.operator = { id: "", label: "E. D." };
  s.stamp.master = "complete";
  eq(I.readyToEnter(s), "ingress.why.texturing", "a complete master names its inputs");
  s.stamp.alignedImages = "foto";
  for (const a of s.assets) s.overrides[a.path] = { skip: true };
  eq(I.readyToEnter(s), "ingress.why.noAssets", "nothing ticked");
  const one = I.newIngress([obj("a.obj")], ctx());
  const node = I.documentNode("d1", I.documentsOf(one, [])[0], one, (p) => p.replace("/p/TempluMare/", ""));
  eq(node, { id: "d1", name: "D.41", node_type: "document", description: "a", data: { filename: "RB/LOD0/a.obj", absolute_time_start: "2026" } },
     "the document: name, description, the file, the year (a string, as the importers write it)");
}

// 7 · the Archive's desktop drop
{
  const files = [{ path: "/p/RB/LOD0/a.obj", kind: "file" }, { path: "/p/RB/LOD0", kind: "dir" }];
  eq(D.planDesktopDrop(files, { win: "w3", type: "storage" }), { action: "ingress", win: "w3", paths: ["/p/RB/LOD0/a.obj", "/p/RB/LOD0"] },
     "files and folders on the Archive enter");
  eq(D.planDesktopDrop([{ path: "/p/x.em.json", kind: "file" }], { win: "w3", type: "storage" }).action, "open",
     "a graph on the Archive still opens");
  eq(D.planDesktopDrop([{ path: "/p/a.obj", kind: "file" }], { win: "w1", type: "graph" }).action, "open",
     "elsewhere nothing changes");
}

console.log(`ingress: ${checks} checks passed`);
