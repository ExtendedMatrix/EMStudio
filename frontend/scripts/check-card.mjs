// MICRO-ARCHIVIO-3 · executable check of src/card-facts.ts — what the card of
// what is chosen says (§5 of «L'Archivio ripensato»): the rights each with its
// source (stamp › resource › room › graph), the facts of an act read off a
// stamp-born node and off a corpus node, the act that made a resource and the
// acts that use it, the three lines of the hover over the Chain; and that the
// pieces the card needs are wired (the Viewer's card box, the preference off by
// default, the words in Italian and English).
//
//   node scripts/check-card.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}card-facts.ts`], bundle: true, format: "esm", write: false });
const C = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (c, what) => { assert.ok(c, what); checks++; };

// ── the rights, each with where it was read ──────────────────────────────────
const r = C.rightsOf({
  stamp: { authors: "Emanuel Demetrescu", licence: "", embargo: "" },
  resource: { licence: "CC BY-NC 4.0" },
  room: { licence: "CC BY 4.0", embargo: "2027-03-01" },
  graph: { authors: "E.D.", licence: "CC0", embargo: "" },
});
eq(r.map((l) => l.key), ["authors", "licence", "embargo"], "three lines, in order");
eq(r[0].said, { value: "Emanuel Demetrescu", source: "stamp" }, "the stamp's operator holds over the graph's author");
eq(r[0].others, [{ value: "E.D.", source: "graph" }], "the graph's author said under it");
eq(r[1].said, { value: "CC BY-NC 4.0", source: "resource" }, "what the graph says of THIS resource holds over the room and the graph");
eq(r[1].others.map((o) => o.source), ["room", "graph"], "the room and the graph said under it, in order");
eq(r[2].said, { value: "2027-03-01", source: "room" }, "the room's embargo when the object says none");
const none = C.rightsOf({});
ok(none.every((l) => l.said === null && !l.others.length), "nobody says anything: three empty lines");
eq(C.rightsOf({ graph: { licence: "  " } })[1].said, null, "a blank is not a value");
eq(C.RIGHT_SOURCES, ["stamp", "resource", "room", "graph"], "the order of the sources");

// ── which nodes have a card ──────────────────────────────────────────────────
ok(C.isActType("dtc_process") && C.isActType("dtc_acquisition") && !C.isActType("resource"), "the acts");
ok(C.hasCard("resource") && C.hasCard("dtc_process") && !C.hasCard("US") && !C.hasCard(undefined), "the nodes with a card");

// ── an act born of a stamp (views/stamps.ts processNode) ─────────────────────
const nodes = new Map();
const N = (n) => (nodes.set(n.id, n), n);
const act = N({ id: "p1", node_type: "dtc_process", name: "decimation",
  data: { dtc_kind: "lod_generation", technique: "decimation", parameters: { ratio: 0.5, draco: true, max_texture_px: 1024 },
          software: [{ name: "EM Tools", version: "1.6.0-dev.31" }, { name: "Blender", version: "5.2" }],
          operator: { id: "https://orcid.org/0000-0002-5065-7970", label: "Emanuel Demetrescu" },
          created_at: "2026-10-05T22:08:00Z", declared: { license: "CC BY 4.0", embargo_until: "2027-01-01" } } });
N({ id: "r0", node_type: "resource", name: "OB_PODIO_LOD1.obj", data: { path: "/p/RB/LOD1/OB_PODIO_LOD1.obj" } });
N({ id: "r1", node_type: "resource", name: "SM_OB_PODIO_LOD1@lod4-web.glb", data: { path: "/p/RB/versions/SM_OB_PODIO_LOD1@lod4-web.glb" } });
N({ id: "p2", node_type: "dtc_process", name: "tiling", data: { dtc_kind: "tiling", tool: { name: "Obj2Tiles", version: "1.8.0" }, created_at: "2026-10-27" } });
N({ id: "a1", node_type: "author", name: "Mario Rossi" });
const edges = [
  { source: "p1", target: "r0", edge_type: "dtc_had_input" },
  { source: "p1", target: "r1", edge_type: "dtc_had_output" },
  { source: "p2", target: "r1", edge_type: "dtc_had_input" },
  { source: "p2", target: "a1", edge_type: "has_author" },
];
const of = (id) => nodes.get(id);
const f = C.actFacts(act, edges, of);
eq([f.kind, f.name, f.technique, f.operator], ["lod_generation", "decimation", "decimation", "Emanuel Demetrescu"], "kind, name, technique, the stamp's operator");
eq(f.tools, ["EM Tools 1.6.0-dev.31", "Blender 5.2"], "the software, «name version»");
eq(f.parameters, [["ratio", "0.5"], ["draco", "true"], ["max_texture_px", "1024"]], "the parameters, as written");
eq(f.date, "2026-10-05T22:08:00Z", "the date");
eq(f.inputs, [{ id: "r0", name: "OB_PODIO_LOD1.obj", path: "/p/RB/LOD1/OB_PODIO_LOD1.obj" }], "the inputs, clickable to their file");
eq(f.outputs.map((o) => o.id), ["r1"], "the outputs");
eq(f.declared, { licence: "CC BY 4.0", embargo: "2027-01-01" }, "what the act's stamp declared");

// ── an act of the corpus: the tool, the author the graph ties to it ─────────
const g = C.actFacts(of("p2"), edges, of);
eq([g.operator, g.tools.join(), g.date], ["Mario Rossi", "Obj2Tiles 1.8.0", "2026-10-27"], "the operator from has_author, the tool");
eq(g.declared, { licence: "", embargo: "" }, "no declaration: empty, not invented");
eq(C.actFacts({ id: "x", node_type: "dtc_process", data: { tool: "Metashape", software: [{ name: "Metashape" }] } }, [], of).tools, ["Metashape"], "a tool named twice is said once");

// ── the act that made a resource, the acts that use it ──────────────────────
eq(C.producerOf("r1", edges, of)?.id, "p1", "the producer of the variant");
eq(C.producerOf("r0", edges, of), null, "the obj has no producer here");
eq(C.consumersOf("r1", edges, of).map((x) => x.id), ["p2"], "the tiling uses the variant");

// ── the three lines of the hover ─────────────────────────────────────────────
const W = { who: (v) => `chi: ${v}`, when: (v) => `quando: ${v}`, rights: (l, e) => `${l || "licenza da dichiarare"} · ${e || "senza embargo"}`, nobody: "da dichiarare", undated: "data da dichiarare" };
const rights = C.rightsOf({ stamp: { licence: f.declared.licence, embargo: f.declared.embargo } });
eq(C.hoverLines(of("r1"), edges, of, rights, W, (s) => s.slice(0, 10)),
   ["chi: Emanuel Demetrescu", "quando: 2026-10-05", "CC BY 4.0 · 2027-01-01"], "over a resource: the act that made it");
eq(C.hoverLines(of("p2"), edges, of, C.rightsOf({}), W),
   ["chi: Mario Rossi", "quando: 2026-10-27", "licenza da dichiarare · senza embargo"], "over an act: its own");
eq(C.hoverLines(of("r0"), edges, of, C.rightsOf({}), W),
   ["chi: da dichiarare", "quando: data da dichiarare", "licenza da dichiarare · senza embargo"], "over a resource nothing made: said, not invented");

// ── wired: the Viewer's card box, the click on the Chain, the preference ─────
const main = readFileSync(`${SRC}main.ts`, "utf8");
const types = readFileSync(`${SRC}shell/types.ts`, "utf8");
const settings = readFileSync(`${SRC}settings.ts`, "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const i18n = readFileSync(`${SRC}i18n.ts`, "utf8");
ok(/card\.className = "viewer-card"/.test(types) && /renderViewerInto\(w, s, c, b, k\)/.test(types), "the Viewer surface has its card box");
ok(/if \(view === "dtc"\) showCardIn\(null, dragNodeId\)/.test(main), "the click on a node of the Chain opens its card");
ok(/dtcHoverCard: false/.test(settings), "the three lines are OFF by default");
ok(/id="set-dtc-hover-card"/.test(html), "and a person turns them on in Settings");
ok(/getSettings\(\)\.interaction\.dtcHoverCard/.test(main), "the hover reads the preference");
ok(/return resourceCard\(\{ kind: "file", path: entry\.path \}, "compact"/.test(main), "Info is the same component, compact");
ok(/resourceCard\(subject, "full"/.test(main), "the Viewer draws it full");
for (const key of ["card.rights", "card.src.stamp", "card.src.resource", "card.src.room", "card.src.graph", "card.act", "card.inputs", "card.outputs", "card.hoverWho", "settings.dtcHoverCard", "card.unreadable"])
  ok((i18n.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g")) ?? []).length === 2, `${key} in Italian and English`);
ok(/"win\.viewer": "Viewer e scheda"/.test(i18n), "the window is «Viewer e scheda»");

console.log(`check-card: ${checks} checks, all green`);
