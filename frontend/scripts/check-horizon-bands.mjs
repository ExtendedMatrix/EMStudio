// MICRO-LAB orizzonti come bande · the projection of the graphs on the bands of
// the horizons (`horizon-bands.ts`), in node: where a unit is drawn (the
// overlap, the oldest horizon), the two bands of the rest, the epochs taken
// out, the ids shared by two graphs namespaced and translated back, the tints,
// and the Scena 3D read by horizons (`horizonSpace`).
// MICRO-LAB bande-2 · …the closed groups kept closed and left out of what
// em-core lays out (the tablets), a model in EVERY horizon its epochs overlap,
// the scene's «outside the visible horizons», and the overlap check with its
// «make room» and the «from …» cards grouped (`scene-overlaps.ts`).
//
//   node scripts/check-horizon-bands.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (entry) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false,
                                  loader: { ".json": "json" }, logLevel: "silent" });
  return import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString("base64")}`);
};
const B = await load("horizon-bands.ts");
const O = await load("scene-overlaps.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

const H = (id, start, end, order) => ({ id, name: id, start, end, color: "#123456", order, enabled: true });
const per = { id: "P", name: "Secoli", description: "", source: null,
              horizons: [H("rep", -509, -27, 0), H("imp", -27, 235, 1), H("tardo", 235, 568, 2), H("med", 568, 1492, 3)] };

// ── where an interval is drawn ───────────────────────────────────────────────
const vis = B.visibleHorizons(per, new Set());
eq(vis.map((h) => h.id), ["med", "tardo", "imp", "rep"], "visible horizons newest first (the lane order)");
eq(B.bandOf([100, 200], vis), { band: "hz:imp", also: [] }, "inside one horizon");
eq(B.bandOf([100, 600], vis), { band: "hz:imp", also: ["tardo", "med"] }, "in several: drawn in the OLDEST, the others listed in time order");
eq(B.bandOf([-27, 100], vis).band, "hz:imp", "touching a border is not inside (contiguous horizons)");
eq(B.bandOf([-30, 300], vis), { band: "hz:rep", also: ["imp", "tardo"] },
   "three years in the Republic are enough: the overlap is the rule");
eq(B.bandOf([1600, 1700], vis), { band: B.OUTSIDE_BAND, also: [] }, "dated outside every visible horizon");
eq(B.bandOf([null, null], vis), { band: B.UNDATED_BAND, also: [] }, "no date at all");
eq(B.bandOf(undefined, vis), { band: B.UNDATED_BAND, also: [] }, "not in the chronology");
eq(B.bandOf([300, null], vis), { band: "hz:tardo", also: ["med"] }, "an open end reaches the later horizons");
eq(B.bandOf([100, 200], B.visibleHorizons(per, new Set(["imp"]))).band, B.OUTSIDE_BAND,
   "an horizon switched off: what lies only there falls outside");

// ── the projection of two graphs ─────────────────────────────────────────────
const ep = (id, s, e) => ({ id, node_type: "EpochNode", name: id, data: { start_time: s, end_time: e } });
const us = (id) => ({ id, node_type: "US", name: id });
const E = (s, t, edge_type) => ({ id: `${s}_${edge_type}_${t}`, source: s, target: t, edge_type });
const gA = {
  key: "slotA", label: "Temple",
  nodes: [ep("EA", 100, 300), us("a1"), us("a2"), us("shared"), { id: "br", node_type: "BR", name: "br" }, us("nodate")],
  edges: [E("a1", "EA", "has_first_epoch"), E("a2", "a1", "is_after"), E("shared", "a1", "is_after"),
          E("a2", "EA", "survive_in_epoch"), E("br", "a1", "is_after")],
  intervals: new Map([["a1", [100, 200]], ["a2", [150, 700]], ["shared", [600, 700]], ["EA", [100, 300]], ["nodate", [null, null]]]),
};
const gB = {
  key: "slotB", label: "Saggio B",
  nodes: [ep("EB", -200, -30), us("b1"), us("shared")],
  edges: [E("b1", "EB", "has_first_epoch"), E("shared", "b1", "is_after")],
  intervals: new Map([["b1", [-200, -30]], ["shared", [1600, 1700]]]),
};
const P = B.projectByHorizons([gA, gB], per, new Set(), {
  outsideName: "Outside", undatedName: "No date", drop: (n) => n.node_type === "BR" });
const ids = P.graph.nodes.map((n) => n.id);
ok(!ids.includes("EA") && !ids.includes("EB"), "the graphs' epochs are not in the projection");
ok(!ids.includes("br"), "the continuity nodes are left out (an epoch's)");
ok(!P.graph.edges.some((e) => e.edge_type === "survive_in_epoch"), "no edge to an epoch survives");
eq(P.bands.map((b) => [b.id, b.kind]),
   [["hz:med", "horizon"], ["hz:tardo", "horizon"], ["hz:imp", "horizon"], ["hz:rep", "horizon"],
    [B.OUTSIDE_BAND, "outside"], [B.UNDATED_BAND, "undated"]],
   "one band per visible horizon (newest first), then outside and undated");
ok(P.graph.nodes.slice(0, 6).every((n) => n.node_type === "EpochNode"), "the bands are EpochNodes declared first (em-core's lanes)");
ok(!("start_time" in P.graph.nodes[4].data) && !("start_time" in P.graph.nodes[5].data),
   "the two bands of the rest are undated: em-core keeps them where declared, at the bottom");
eq(P.graph.edges.filter((e) => e.edge_type === "has_first_epoch" && e.source === "a1").map((e) => e.target), ["hz:imp"],
   "a unit goes to its band through has_first_epoch");
// the id two graphs share
ok(!ids.includes("shared") && ids.includes(`slotA${B.SEP}shared`) && ids.includes(`slotB${B.SEP}shared`),
   "an id two graphs share is namespaced in both");
eq([P.slotOf.get(`slotB${B.SEP}shared`), P.realOf.get(`slotB${B.SEP}shared`)], ["slotB", "shared"], "…and translated back to its graph");
eq(P.sceneOf.get(`slotA${B.SEP}a1`), "a1", "an id only one graph has keeps its id");
eq(P.slotOf.get("b1"), "slotB", "every node knows its graph");
const sharedEdge = P.graph.edges.find((e) => e.source === `slotB${B.SEP}shared`);
eq(sharedEdge?.target, "b1", "the edges follow the namespaced ids");
eq(P.placed.get(`slotB${B.SEP}shared`).band, B.OUTSIDE_BAND, "each copy is placed by ITS graph's interval");
eq(P.placed.get(`slotA${B.SEP}shared`).band, "hz:med", "…the other copy elsewhere");
eq(P.placed.get("nodate").band, B.UNDATED_BAND, "an undated unit in the band without a date");
eq(P.placed.get("b1").band, "hz:rep", "the second graph in the SAME bands");
eq(P.placed.get("a2").also, ["tardo", "med"], "a2 drawn in its oldest horizon, alive in two more");
eq([...P.tintOf.values()], [B.GRAPH_TINTS[0], B.GRAPH_TINTS[1]], "one tint per graph, in order");
eq(P.counts.get("hz:imp"), 2, "the count per band (a1 and a2, drawn there)");

// a projection with nothing outside has no band of the rest
const P2 = B.projectByHorizons([{ ...gB, nodes: [ep("EB", -200, -30), us("b1")], intervals: new Map([["b1", [-200, -30]]]) }],
  per, new Set(), { outsideName: "O", undatedName: "U" });
eq(P2.bands.map((b) => b.kind), ["horizon", "horizon", "horizon", "horizon"], "no empty band of the rest");

// ── the Scena 3D by horizons ─────────────────────────────────────────────────
const base = {
  epochs: [{ id: "E2", name: "Late", start: 300, end: 700 }, { id: "E1", name: "Early", start: 100, end: 300 }],
  rms: [], proxies: new Map(), rmGroups: new Map(), alternatives: {},
  topOf: (id) => id,
  summary: (id) => ({
    E1: { epoch: null, rms: [{ id: "rm1", epochs: ["E1"] }], units: ["u1", "u2"], withProxy: ["u1"], inScene: [], without: ["u2"],
          missing: [], refused: [], reference: [], rmMissing: ["rm1"], rmReference: [] },
    E2: { epoch: null, rms: [{ id: "rm2", epochs: ["E2"] }], units: ["u2", "u3"], withProxy: ["u3"], inScene: [], without: ["u2"],
          missing: [], refused: [], reference: [], rmMissing: [], rmReference: [] },
  })[id] ?? null,
};
const per3 = { id: "Q", name: "Q", description: "", source: null, horizons: [H("h1", 0, 250, 0), H("h2", 250, 1000, 1)] };
const S = B.horizonSpace(base, per3, new Set(), new Map([["u1", [100, 200]], ["u2", [200, 500]]]), new Map([["E1", [100, 300]], ["E2", [300, 700]]]));
eq(S.epochs.map((e) => e.id), ["hz:h2", "hz:h1"], "the scene's epochs ARE the horizons (newest first)");
const s1 = S.summary("hz:h1");
eq(s1.units.sort(), ["u1", "u2"], "h1: the units whose interval overlaps it");
eq(s1.rms.map((r) => r.id), ["rm1"], "h1: the models of the epochs that overlap it");
eq(s1.withProxy, ["u1"], "h1: the epochs' lists, kept to its units");
const s2 = S.summary("hz:h2");
eq(s2.units.sort(), ["u2", "u3"], "h2: u3 is not dated by s3Dgraphy: it counts where its epoch overlaps");
eq(s2.rms.map((r) => r.id).sort(), ["rm1", "rm2"], "h2: E1 (100–300) overlaps 250–1000 too");
eq(S.topOf("hz:h2"), "hz:h2", "an horizon is its own top");
eq(S.summary("E1"), null, "an epoch is not a band of this scene");


// ── MICRO-LAB bande-2 · a model in every horizon its epochs overlap ─────────
{
  const rmA = { id: "rmA", epochs: ["E1", "E2"] }, rmB = { id: "rmB", epochs: ["E2"] };
  const b2 = { ...base, rms: [rmA, rmB],
    summary: (id) => ({
      E1: { epoch: null, rms: [rmA], units: ["u1"], withProxy: ["u1"], inScene: [], without: [], missing: [], refused: [], reference: [], rmMissing: [], rmReference: [] },
      E2: { epoch: null, rms: [rmA, rmB], units: ["u3"], withProxy: [], inScene: [], without: ["u3"], missing: [], refused: [], reference: [], rmMissing: [], rmReference: [] },
    })[id] ?? null };
  const S2 = B.horizonSpace(b2, per3, new Set(), new Map([["u1", [100, 200]]]), new Map([["E1", [100, 300]], ["E2", [300, 700]]]));
  eq(S2.rms.find((r) => r.id === "rmA").epochs.sort(), ["hz:h1", "hz:h2"], "a model of two epochs is in BOTH horizons they overlap");
  eq(S2.rms.find((r) => r.id === "rmB").epochs, ["hz:h2"], "a model of one epoch: the horizons its dates overlap (E2 300–700 → h2)");
  ok(S2.summary("hz:h1").rms.every((r) => r.epochs.every((e) => e.startsWith("hz:"))),
     "the summary's models carry their horizons (what «show in 3D» and the sheet read)");
  // a periodization with a gap: what lives in it is «outside», as in the Matrix
  const gap = { id: "G", name: "G", description: "", source: null, horizons: [H("g1", 0, 150, 0), H("g2", 800, 1000, 1)] };
  const S3 = B.horizonSpace(b2, gap, new Set(), new Map([["u1", [170, 199]]]), new Map([["E1", [170, 300]], ["E2", [300, 700]]]),
                            { outsideName: "Outside" });
  eq(S3.epochs.map((e) => e.id), ["hz:g2", "hz:g1", B.OUTSIDE_BAND], "the scene gets «outside the visible horizons» when something lives there");
  eq(S3.summary(B.OUTSIDE_BAND).rms.map((r) => r.id).sort(), ["rmA", "rmB"], "…its models: those of the epochs no visible horizon overlaps");
  eq(S3.summary(B.OUTSIDE_BAND).units.sort(), ["u1", "u3"], "…its units: dated in the gap (u1), or by an epoch in the gap (u3)");
  eq(S3.summary("hz:g1").rms, [], "an horizon the dates do not reach: no model");
  const S4 = B.horizonSpace(b2, per3, new Set(), new Map([["u1", [100, 200]]]), new Map([["E1", [100, 300]], ["E2", [300, 700]]]),
                            { outsideName: "Outside" });
  ok(!S4.epochs.some((e) => e.id === B.OUTSIDE_BAND), "nothing outside: no such horizon in the scene");
}

// ── MICRO-LAB bande-2 · the graph's closed groups stay closed ───────────────
{
  const g = { key: "s1", label: "S1", intervals: new Map([["u1", [100, 200]]]),
    nodes: [{ id: "E", node_type: "EpochNode", name: "E" }, { id: "u1", node_type: "US", name: "US 1" },
            { id: "pdE", node_type: "ParadataNodeGroup", name: "E_PD" }, { id: "dE", node_type: "document", name: "D.E" },
            { id: "pd1", node_type: "ParadataNodeGroup", name: "US1_PD" }, { id: "pd2", node_type: "ParadataNodeGroup", name: "open_PD" },
            { id: "u2", node_type: "US", name: "US 2" }, { id: "p2", node_type: "property", name: "p" }],
    edges: [{ edge_type: "has_first_epoch", source: "u1", target: "E" },
            { edge_type: "has_paradata_nodegroup", source: "E", target: "pdE" }, { edge_type: "is_in_paradata_nodegroup", source: "dE", target: "pdE" },
            { edge_type: "has_paradata_nodegroup", source: "u1", target: "pd1" },
            { edge_type: "has_paradata_nodegroup", source: "u2", target: "pd2" }, { edge_type: "is_in_paradata_nodegroup", source: "p2", target: "pd2" }],
    folded: ["pd1"] };
  const P = B.projectByHorizons([g], per, new Set(), { outsideName: "o", undatedName: "u" });
  eq(P.folded, ["pd1"], "the graph's closed groups are closed in the bands (lab.3 opened them all)");
  eq([...P.tablets], [["pd1", "u1"]], "a closed paradata group with a unit is its tablet, on the unit");
  const lids = new Set(P.layoutGraph.nodes.map((n) => n.id));
  ok(!lids.has("pd1"), "…and em-core keeps no place for it");
  ok(!lids.has("pdE") && !lids.has("dE"), "an epoch's paradata (the lane's tag) is not laid out: here it has no epoch");
  ok(lids.has("pd2") && lids.has("p2"), "an OPEN paradata group and its members are laid out");
  ok(P.graph.nodes.some((n) => n.id === "pd1"), "the drawing still knows the closed group (its tablet)");
}

// ── MICRO-LAB bande-2 · nothing on top of something else ────────────────────
{
  const sn = (id, x, y, w = 90, h = 32, extra = {}) => ({ id, x, y, w, h, node: { id, name: id, node_type: "US" }, ...extra });
  const scene = (nodes, groups = [], memberOf = new Map(), lanes = []) => ({
    nodes, byId: new Map(nodes.map((n) => [n.id, n])), edges: [], lanes, groups,
    groupsById: new Map(groups.map((g) => [g.id, g])), memberOf,
  });
  const G = (id, x, y, w, h) => ({ id, x, y, w, h, headerH: 20, title: id, folded: false });
  let sc = scene([sn("a", 0, 0), sn("b", 50, 10)]);
  eq(O.sceneOverlaps(sc).byKind, { "node/node": 1 }, "two boxes on each other: one overlap");
  sc = scene([sn("a", 0, 0), sn("b", 100, 0)]);
  eq(O.sceneOverlaps(sc).overlaps.length, 0, "two boxes side by side: none");
  sc = scene([sn("g", 0, 0, 300, 120), sn("m", 20, 40), sn("x", 250, 60)], [G("g", 0, 0, 300, 120)], new Map([["m", "g"]]));
  eq(O.sceneOverlaps(sc).byKind, { "group/node": 1 }, "a member inside its group is fine, a stranger in it is not");
  sc = scene([sn("a", 0, 0)], [], new Map(), [{ id: "L1", label: "1", y: 0, height: 100 }, { id: "L2", label: "2", y: 90, height: 100 }]);
  eq(O.sceneOverlaps(sc).byKind, { "lane/lane": 1 }, "two bands sharing a y");
  // make room: an open box grown over its neighbour moves right, with its members, y kept
  sc = scene([sn("g", 0, 0, 300, 120), sn("m", 20, 40), sn("n", 200, 50), sn("far", 900, 0)],
             [G("g", 0, 0, 300, 120)], new Map([["m", "g"]]));
  eq(O.makeRoom(sc), 1, "make room: one block moved");
  eq(O.sceneOverlaps(sc).overlaps.length, 0, "…and nothing overlaps any more");
  eq([sc.byId.get("n").x, sc.byId.get("n").y, sc.byId.get("far").x], [324, 50, 900],
     "…the one that was covered moved right past the box (gap 24), its y kept; the far one untouched");
  // MICRO-LAB bande-3 · the hand's block never moves; the others make room around it
  sc = scene([sn("g", 0, 0, 300, 120), sn("m", 20, 40), sn("n", 200, 50), sn("far", 900, 0)],
             [G("g", 0, 0, 300, 120)], new Map([["m", "g"]]));
  eq(O.makeRoom(sc, 24, (id) => id === "n"), 1, "the hand placed «n» over the box: one block moved, not «n»");
  eq([sc.byId.get("n").x, sc.byId.get("g").x, sc.groupsById.get("g").x, sc.byId.get("m").x], [200, 314, 314, 334],
     "…«n» stays where the hand left it; the box moves past it with its member");
  eq(O.sceneOverlaps(sc).overlaps.length, 0, "…and nothing overlaps");
  sc = scene([sn("a", 0, 0), sn("b", 50, 10)]);
  eq(O.makeRoom(sc, 24, () => true), 0, "two blocks both placed by the hand, one on the other: neither moves");
  // BY LEVEL: inside an activity, an open box over a sibling unit; the activity grows
  sc = scene([sn("act", 0, 0, 400, 200), sn("pd", 10, 30, 200, 120), sn("u", 150, 60), sn("v", 300, 60)],
             [G("act", 0, 0, 400, 200), G("pd", 10, 30, 200, 120)], new Map([["pd", "act"], ["u", "act"], ["v", "act"]]));
  O.makeRoom(sc);
  eq([sc.byId.get("u").x, sc.byId.get("v").x], [234, 348], "inside the activity: the unit covered moves past the box, and its neighbour past it");
  eq(sc.groupsById.get("act").w, 348 + 90 + 12, "…the activity's box takes in what moved (right edge + pad)");
  eq(O.sceneOverlaps(sc).overlaps.length, 0, "…nothing overlaps, inside or out");
  // a parent chain that is a cycle (nested open paradata groups): each node moves once
  const arranged = new Map([["p1", "p2"], ["p2", "p1"]]);
  sc = { ...scene([sn("p1", 0, 0, 100, 50), sn("p2", 10, 10, 50, 20), sn("w", 60, 0)]), arrangedIn: arranged };
  O.makeRoom(sc);
  eq(O.sceneOverlaps(sc).overlaps.filter((o) => o.a === "w" || o.b === "w").length, 0, "a cycle in the parents: the stranger moves out, once");
  // the cards «from …»: a run from the same place is one card, «+n»
  const inst = (id, y, owner) => sn(id, 0, y, 120, 30, { instanceOf: "m", instanceBadge: { owner: null, ownerName: owner, ownerKind: "epoch", group: "G" } });
  sc = scene([inst("i1", 0, "Moderno"), inst("i2", 42, "Moderno"), inst("i3", 84, "Moderno"), inst("i4", 126, "Medioevo")]);
  const runs = O.cardRuns(sc);
  eq([runs.get("i1"), runs.get("i2").show, runs.get("i4")], [{ show: true, more: 2 }, false, { show: true, more: 0 }],
     "three instances from Moderno under one unit: one card «+2»; Medioevo its own");
  eq(O.cardItems(sc).length, 2, "two cards drawn");
  eq(O.sceneOverlaps(sc, O.cardItems(sc)).overlaps.length, 0, "the cards cover no box but their own");
}

console.log(`check-horizon-bands: ${checks} checks green`);
