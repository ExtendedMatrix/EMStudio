// DTC view: the digital-twin-creation substrate of the WHOLE graph — the
// provenance of the digital resources the EM record rests on, read as one
// picture instead of one resource at a time.
//
// Where `buildDtcGenesisScene` (views/context.ts) answers "how was THIS resource
// made?" by walking upstream from a single Resource, this answers "what digital
// work does this graph stand on?" for every DTC chain at once.
//
// FULL RENDERING (2026-08-09). The first cut laid the substrate out with the
// generic layered algorithm, which drew a correct graph that said nothing about
// what a DTC chain IS. This lays it out as the chain reads: a lane per STAGE of
// making, in order, from what was acquired to what the record cites.
//
//   ┌ Ingressi ─────────  resources nothing produced — what entered the study
//   ├ Processi ─────────  the acquisition / processing events
//   ├ Prodotti ─────────  what they produced
//   ├ Processi (2) ─────  a second act, consuming those products…
//   ├ Prodotti (2) ─────  …and producing more
//   └ Uso nel record ───  the EM nodes that cite them
//
// The lanes are RANKS, not four fixed roles (2026-08-09b). A chain of two
// processes — scan, then model from the scan — used to fold onto four bands with
// the second process's input drawn in "Prodotti" and its arrow running back UP,
// against invariant 3. A rank is the longest path from the start of the chain,
// so every arrow points DOWN by construction and a longer chain simply gets more
// lanes. Each lane is NAMED after what it holds, and repeated roles are numbered.
//
// Same swimlane mechanism as the Matrix, so the renderer already draws the bands
// and their labels; reading down is reading one act of digital making, reading
// across a lane is comparing the same stage across the whole graph.
//
// Arrows still point DOWN (invariant 3): a process is below what it consumed
// and above what it produced.
import { t } from "../i18n";
import { dtcKindLabel, isDtcChainEdge, isDtcNodeType } from "../rules";
import type { Lane, Scene, SceneNode } from "../scene";
import type { EmEdge, EmNode } from "../types";

/** The EM→DTC bridge: an EM node citing a resource a DTC chain produced. One
 *  hop of it is kept so the projection shows where the digital output lands —
 *  the point of the view is provenance, and provenance nobody consumes is half
 *  the story. */
const BRIDGE_EDGE = "has_linked_resource";

/** The relations the DTC draws REVERSED: their TARGET sits above their source
 *  (a process is below what it consumed, a derived resource below its source,
 *  an EM node below the resource it cites). One set, read by the flow below and
 *  by the maniglia of the add menu, so «Sopra» means above IN THIS PICTURE. */
export const DTC_REVERSED_EDGES: ReadonlySet<string> =
  new Set(["dtc_had_input", "dtc_derived_from", BRIDGE_EDGE]);

/** The chain relations of the substrate — asked of the DATAMODEL, which marks
 *  them, and never derived from the name.
 *
 *  It was `startsWith("dtc_")`, and the comment beside it said «and whatever the
 *  datamodel adds next» — which was hoped rather than true: it presumed every
 *  future `dtc_*` edge would be chain. Now it is true. See
 *  `rules.isDtcChainEdge`. */
export const isDtcEdge = isDtcChainEdge;

/** A node that is DTC by its own nature: a `dtc_nodes` class, or any node
 *  stamped with a DTC kind — the DTC OUTPUT is a plain ResourceNode, so the kind
 *  is the marker, not the class (rules.ts `dtcAuthoringKinds`). Including these
 *  keeps a just-placed, not-yet-wired DTC chunk visible in the very view it was
 *  placed in. */
function isDtcNode(node: EmNode): boolean {
  if (isDtcNodeType(node.node_type)) return true;
  return !!(node.data as Record<string, unknown> | undefined)?.dtc_kind;
}

// Geometry. Boxes match the Graph projection so the two read at the same scale.
const NODE_W = 120;
const NODE_H = 34;
const H_GAP = 26;
const LANE_PAD = 26; // breathing room above/below a row inside its lane
const COL_GAP = 44; // between two process columns
// RISORSA-FILE · the files of an open resource, hung under it
const FILE_H = 22;
const FILE_GAP = 6;
const FILE_INDENT = 12;
// a resource is drawn as its GLYPH with the name UNDER it: the files start
// below that name, not under the box (measured on the first screenshot, where
// the first file covered the label)
const FILE_TOP = 18;

/** What a lane holds — decides its name and its colour. The colour tints the
 *  lane the way an epoch's own colour tints its swimlane. */
type Role = "acquisition" | "input" | "process" | "output" | "use";
const ROLE_STYLE: Record<Role, { labelKey: string; color: string }> = {
  // DAG · an ACQUISITION is not a transformation, and a corpus is mostly made of
  // them: it is where material ENTERS the study (crmdig:D12), the root of every
  // chain. Calling it "Processi" was true of the class hierarchy and useless to a
  // reader — measured on a corpus whose first lane held two flights.
  acquisition: { labelKey: "dtc.laneAcquisition", color: "#3d5a80" },
  input: { labelKey: "dtc.laneInput", color: "#2f4f6f" },
  process: { labelKey: "dtc.laneProcess", color: "#5b3f77" },
  output: { labelKey: "dtc.laneOutput", color: "#2c6249" },
  use: { labelKey: "dtc.laneUse", color: "#6f5326" },
};

/** RISORSA-FILE · the colour a DTC node READS as outside the DTC's own lanes
 *  (the minimap): the colour of the lane its kind of node stands in — an
 *  acquisition, a process (a device is part of one), what was made. */
export function dtcRoleColour(node: { node_type: string; data?: Record<string, unknown> }): string {
  if (node.node_type === "dtc_acquisition") return ROLE_STYLE.acquisition.color;
  if (isDtcNodeType(node.node_type)) return ROLE_STYLE.process.color;
  return ROLE_STYLE.output.color;
}

// ── DEV29 B2 · the DTC that reads ───────────────────────────────────────────

/** An acquisition's members are drawn as ONE block when there are at least
 *  this many («71 foto ▸»), until the block is opened. */
export const DTC_SET_MIN = 4;
/** The id of the block of an acquisition's members. */
export const DTC_SET_SUFFIX = "::set";
export const dtcSetId = (acqId: string): string => `${acqId}${DTC_SET_SUFFIX}`;
/** The acquisition a block id stands for, or null. */
export function dtcSetOwner(id: string | null | undefined): string | null {
  return id && id.endsWith(DTC_SET_SUFFIX) ? id.slice(0, -DTC_SET_SUFFIX.length) : null;
}

/** The name s3Dgraphy gives a process nobody named (`declare_derivation`:
 *  «derivation of <output>»). Such a name says the output again and hides the
 *  act — measured on San Pietro and on the Ninfeo, where every process read
 *  «derivation of …» while its technique («allineamento», «export: OBJ
 *  decimato») was declared and unseen. */
const AUTO_PROCESS_NAME = /^derivation of\b/i;

/** What a process box SAYS: its declared technique when its name is the
 *  automatic one (or absent), else its kind's label; a name a person gave
 *  stays. The D5 of dev28. */
export function processLabel(n: EmNode): string | undefined {
  const d = (n.data ?? {}) as Record<string, unknown>;
  const name = String(n.name ?? "").trim();
  if (name && !AUTO_PROCESS_NAME.test(name)) return undefined;
  const technique = String(d.technique ?? "").trim();
  if (technique) return technique;
  const kind = String(d.dtc_kind ?? "").trim();
  return kind ? dtcKindLabel(kind) : undefined;
}

/** DEV30 D3 · the day of an event's act: `data.date`, else `at`, else the day
 *  the node was made (a stamp's event: the day of its stamps). */
function actDay(n: EmNode): string {
  const d = (n.data ?? {}) as Record<string, unknown>;
  for (const k of ["date", "at", "when", "start", "created_at"])
    if (typeof d[k] === "string" && (d[k] as string).trim()) return (d[k] as string).trim().slice(0, 10);
  return "";
}

/** «71 photos» / «12 files»: images are photos, anything else is files. */
function setLabel(members: EmNode[], open: boolean): string {
  const images = members.every((m) => /^image\//.test(String(((m.data ?? {}) as Record<string, unknown>).media_type ?? ""))
    || /\.(jpe?g|png|tiff?|dng|cr2|nef|arw)$/i.test(String(m.name ?? "")));
  return `${open ? "▾" : "▸"} ${t(images ? "dtc.setPhotos" : "dtc.setFiles", { n: String(members.length) })}`;
}

/** Deterministic order: by name, then id — the same document must always draw
 *  the same picture (invariant 7 in spirit). */
function byName(a: EmNode, b: EmNode): number {
  const an = (a.name ?? "").toString();
  const bn = (b.name ?? "").toString();
  return an < bn ? -1 : an > bn ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Project the filtered graph onto its DTC substrate, laid out as provenance
 * lanes with one column per process.
 *
 * Takes the SAME filtered node/edge lists the other projections consume (so the
 * circles of detail and folding still apply). Manual drags arrive as
 * `overrides`, exactly as in Graph view.
 */
export function buildDtcScene(
  nodes: EmNode[],
  edges: EmEdge[],
  overrides?: Map<string, { x: number; y: number }>,
  opts: { openResources?: ReadonlySet<string>; allNodes?: readonly EmNode[];
          /** DEV29 B2 · the acquisitions whose members are shown one by one */
          openSets?: ReadonlySet<string> } = {},
): Scene {
  const present = new Set(nodes.map((n) => n.id));
  const keep = new Set<string>();
  for (const n of nodes) if (isDtcNode(n)) keep.add(n.id);

  const chain: EmEdge[] = [];
  for (const e of edges) {
    if (!isDtcEdge(e.edge_type)) continue;
    if (!present.has(e.source) || !present.has(e.target)) continue;
    chain.push(e);
    keep.add(e.source);
    keep.add(e.target);
  }

  // one hop out to the EM side, resolved against the chain-derived set (so a
  // bridge never drags in a second bridge and the view stays the substrate).
  const bridges: EmEdge[] = [];
  for (const e of edges) {
    if (e.edge_type !== BRIDGE_EDGE) continue;
    if (!present.has(e.source) || !present.has(e.target)) continue;
    if (keep.has(e.source) || keep.has(e.target)) bridges.push(e);
  }
  for (const e of bridges) {
    keep.add(e.source);
    keep.add(e.target);
  }

  let members = nodes.filter((n) => keep.has(n.id));
  const scene: Scene = { nodes: [], byId: new Map(), edges: [], lanes: [] };
  if (!members.length) return scene;

  // ── DEV29 B2 · an acquisition of many files is ONE block («71 foto ▸») ────
  //
  // A member folds into its acquisition's block when the acquisition is its
  // ONLY kind of producer and nothing else in the chain names it one by one
  // (no process consumes it alone, nothing derives from it, no EM node cites
  // it). A process that consumed the acquisition still hangs from the
  // acquisition. Two events that produced the same lot (the stamps' and the
  // declared one, San Pietro) each get their own block.
  const byIdAll = new Map(members.map((n) => [n.id, n]));
  // DEV30 D3 · an event that CITES another (`dtc_had_input` acquisition →
  // acquisition: the download of 2026 citing the capture of 2018) is not a
  // step of making: the two are two rows of the acquisitions' lane, with their
  // dates, and the lot they share is ONE block, the earlier event's
  const isAcq = (id: string) => byIdAll.get(id)?.node_type === "dtc_acquisition";
  const citesOf = new Map<string, string[]>();   // later event → the events it cites
  for (const e of chain)
    if (e.edge_type === "dtc_had_input" && isAcq(e.source) && isAcq(e.target) && e.source !== e.target)
      (citesOf.get(e.source) ?? citesOf.set(e.source, []).get(e.source)!).push(e.target);
  const citeEdge = (e: EmEdge) => e.edge_type === "dtc_had_input" && isAcq(e.source) && isAcq(e.target);
  const touched = new Map<string, number>();       // member → chain edges that are NOT acquisition→member outputs
  const producers = new Map<string, string[]>();   // member → acquisitions that output it
  for (const e of [...chain, ...bridges]) {
    const src = byIdAll.get(e.source);
    if (citeEdge(e)) continue;
    if (e.edge_type === "dtc_had_output" && src?.node_type === "dtc_acquisition") {
      (producers.get(e.target) ?? producers.set(e.target, []).get(e.target)!).push(e.source);
      continue;
    }
    touched.set(e.source, (touched.get(e.source) ?? 0) + 1);
    touched.set(e.target, (touched.get(e.target) ?? 0) + 1);
  }
  const foldedInto = new Map<string, string[]>();  // acquisition → its folded members
  const alsoBy = new Map<string, Set<string>>();     // root acquisition → the later events citing it that share its lot
  for (const [m, acqs] of producers) {
    if (touched.get(m) || byIdAll.get(m)?.node_type === "dtc_acquisition") continue;
    // DEV30 D3 · among events that cite one another, the lot folds into the
    // one cited (the earliest); the citing ones point to that block
    const roots = acqs.filter((a) => !(citesOf.get(a) ?? []).some((b) => acqs.includes(b)));
    for (const a of roots) (foldedInto.get(a) ?? foldedInto.set(a, []).get(a)!).push(m);
    for (const a of acqs) if (!roots.includes(a))
      for (const r of roots) (alsoBy.get(r) ?? alsoBy.set(r, new Set()).get(r)!).add(a);
  }
  const hiddenMembers = new Set<string>();
  const setNodes: EmNode[] = [];
  for (const [a, ms] of foldedInto) {
    if (ms.length < DTC_SET_MIN) continue;
    const open = !!opts.openSets?.has(a);
    const list = ms.map((m) => byIdAll.get(m)!).sort(byName);
    if (open) continue;
    for (const m of ms) hiddenMembers.add(m);
    setNodes.push({ id: dtcSetId(a), node_type: "resource", name: setLabel(list, false),
                    data: { dtc_set_of: a, member_count: ms.length,
                            dtc_kind: ((byIdAll.get(a)?.data ?? {}) as Record<string, unknown>).dtc_kind } } as unknown as EmNode);
    chain.push({ id: `${dtcSetId(a)}::out`, source: a, target: dtcSetId(a), edge_type: "dtc_had_output" } as EmEdge);
    for (const later of alsoBy.get(a) ?? [])
      chain.push({ id: `${dtcSetId(a)}::out::${later}`, source: later, target: dtcSetId(a), edge_type: "dtc_had_output" } as EmEdge);
  }
  // a member drawn by ANOTHER acquisition still open stays; one folded by all
  // its acquisitions goes
  for (const [a, ms] of foldedInto)
    if (ms.length < DTC_SET_MIN || opts.openSets?.has(a)) for (const m of ms) hiddenMembers.delete(m);
  if (hiddenMembers.size || setNodes.length) {
    members = [...members.filter((n) => !hiddenMembers.has(n.id)), ...setNodes];
    for (let i = chain.length - 1; i >= 0; i--)
      if (hiddenMembers.has(chain[i].source) || hiddenMembers.has(chain[i].target)) chain.splice(i, 1);
  }


  // ── RANKS · how far down the chain each node sits ─────────────────────────
  //
  // The flow is not the edge direction: `dtc_had_input` points from the process
  // to the resource it CONSUMED, so the resource comes first. Same for
  // `dtc_derived_from` (output → the input it derives from) and for the bridge
  // (an EM node cites a resource). Reversing those three is what makes every
  // arrow in the finished picture point down.
  const flow = new Map<string, string[]>(); // from → to, in chain order
  const addFlow = (from: string, to: string): void => {
    if (!flow.has(from)) flow.set(from, []);
    flow.get(from)!.push(to);
  };
  for (const e of chain) {
    if (citeEdge(e)) continue;   // DEV30 D3 · a citation is not a rank down
    // dtc_had_input: resource → process; dtc_derived_from: source → derived
    if (DTC_REVERSED_EDGES.has(String(e.edge_type))) addFlow(e.target, e.source);
    else addFlow(e.source, e.target); // dtc_had_output: process → resource
  }
  for (const e of bridges) addFlow(e.target, e.source); // resource → the EM node citing it

  // longest path from a source, computed by relaxation. A cycle (a chain that
  // consumes its own product) cannot raise a rank forever: the pass count is
  // bounded by the node count, and what is left keeps the rank it reached.
  const rank = new Map<string, number>(members.map((n) => [n.id, 0]));
  for (let pass = 0; pass < members.length; pass++) {
    let changed = false;
    for (const [from, tos] of flow) {
      const rf = rank.get(from);
      if (rf == null) continue;
      for (const to of tos)
        if ((rank.get(to) ?? 0) < rf + 1) {
          rank.set(to, rf + 1);
          changed = true;
        }
    }
    if (!changed) break;
  }

  // ── what each node IS, for naming its lane ────────────────────────────────
  const isOutput = new Set<string>();
  for (const e of chain)
    if (e.edge_type === "dtc_had_output") isOutput.add(e.target);
  const isConsumed = new Set<string>();
  for (const e of chain)
    if (e.edge_type === "dtc_had_input" && !citeEdge(e)) isConsumed.add(e.target);
  const roleOf = (n: EmNode): Role => {
    if (n.node_type === "dtc_acquisition") return "acquisition";
    if (isDtcNodeType(n.node_type)) return "process";
    // BEING PRODUCED is what makes a file an output — a fact in the graph, not a
    // stamp on the node. Reading `dtc_kind` instead sent every plain resource of
    // a corpus into "Uso nel record", which is where an EM node citing a product
    // belongs and no file of the documentation ever does.
    if (isOutput.has(n.id)) return "output";
    if (isConsumed.has(n.id)) return "input";
    return isDtcNode(n) ? "input" : "use";
  };

  // ── group by rank, and inside a rank keep the process columns together ────
  const byRank = new Map<number, EmNode[]>();
  for (const n of members) {
    const r = rank.get(n.id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(n);
  }
  const ranks = [...byRank.keys()].sort((a, b) => a - b);
  // a stable horizontal key: the process a node belongs to (its own id for a
  // process), so a chain reads as a column even across many ranks
  //
  // DAG · the column key is resolved to a FIXPOINT, taking the smallest
  // candidate, instead of "whatever edge came last in the array". A shared leaf
  // is reached by several edges (its producer and each of its consumers), so the
  // single array-order pass this replaces gave it a different column depending
  // on the order the edges happened to be written in — and an additive merge
  // reorders edges without changing what the document says. Measured:
  // reversing the input arrays moved img2 by three columns. Smallest-wins is
  // arbitrary but total, so the same corpus draws the same picture.
  const columnKey = new Map<string, string>();
  for (const n of members) columnKey.set(n.id, n.id);
  const flowsForColumn: Array<[string, string]> = [];
  for (const e of chain)
    if (e.edge_type === "dtc_had_input" || e.edge_type === "dtc_had_output")
      flowsForColumn.push([e.source, e.target]);
  for (const e of bridges) flowsForColumn.push([e.target, e.source]);
  flowsForColumn.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  for (let pass = 0; pass < members.length; pass++) {
    let changed = false;
    for (const [from, to] of flowsForColumn) {
      const kf = columnKey.get(from);
      const kt = columnKey.get(to);
      if (kf == null || kt == null) continue;
      if (kf < kt) {
        columnKey.set(to, kf);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // where each node's producers ended up — a product wants to be UNDER the
  // process that made it, which is the difference between a DAG you can follow
  // and a correct picture whose lines you have to trace one by one. Ranks are
  // laid out top-down, so by the time a rank is placed every predecessor of its
  // nodes already has an x (the flow only ever goes down a rank).
  const preds = new Map<string, string[]>();
  for (const [from, tos] of flow)
    for (const to of tos) {
      if (!preds.has(to)) preds.set(to, []);
      preds.get(to)!.push(from);
    }

  const inCitation = new Set<string>([...citesOf.keys(), ...[...citesOf.values()].flat()]);
  const laneH = NODE_H + LANE_PAD * 2;
  const placedX = new Map<string, number>();
  ranks.forEach((r, i) => {
    // the barycentre of a node's producers, when they are already placed
    const wanted = new Map<string, number>();
    for (const n of byRank.get(r)!) {
      const xs = (preds.get(n.id) ?? [])
        .map((id) => placedX.get(id))
        .filter((x): x is number => x != null);
      if (xs.length) wanted.set(n.id, xs.reduce((a, b) => a + b, 0) / xs.length);
    }
    const row = byRank.get(r)!.sort((a, b) => {
      const wa = wanted.get(a.id);
      const wb = wanted.get(b.id);
      if (wa != null && wb != null && wa !== wb) return wa - wb;
      if (wa != null && wb == null) return 1; // a root of its own chain goes left
      if (wa == null && wb != null) return -1;
      return (
        (columnKey.get(a.id) ?? "").localeCompare(columnKey.get(b.id) ?? "") ||
        byName(a, b)
      );
    });
    // pack left to right, but never before where a node WANTS to be: collisions
    // push right, so the alignment survives a crowded rank instead of being
    // silently dropped.
    let cursor = COL_GAP;
    row.forEach((n) => {
      const x = Math.max(cursor, Math.round(wanted.get(n.id) ?? cursor));
      cursor = x + NODE_W + H_GAP;
      placedX.set(n.id, x);
      const sn: SceneNode = {
        id: n.id,
        x,
        y: i * laneH + LANE_PAD,
        w: NODE_W,
        h: NODE_H,
        node: n,
      };
      // DEV29 B2 · a process says its technique, not «derivation of …»
      if (isDtcNodeType(n.node_type) && n.node_type !== "dtc_acquisition") {
        const pl = processLabel(n);
        if (pl) sn.label = pl;
      }
      if (dtcSetOwner(n.id)) sn.label = String(n.name);
      // DEV30 D3 · the two events of one lot say their dates
      if (n.node_type === "dtc_acquisition" && inCitation.has(n.id)) {
        const when = actDay(n);
        // the date FIRST: a box cuts a long label at its end, and the date is
        // what tells the two rows apart
        if (when) sn.label = `${when} · ${String(n.name || n.id)}`;
      }
      scene.nodes.push(sn);
      scene.byId.set(sn.id, sn);
    });
  });

  // ── the lanes: named after what they hold, repeats numbered ───────────────
  const seen: Partial<Record<Role, number>> = {};
  scene.lanes = ranks.map((r, i): Lane => {
    const row = byRank.get(r)!;
    const tally = new Map<Role, number>();
    for (const n of row) {
      const role = roleOf(n);
      tally.set(role, (tally.get(role) ?? 0) + 1);
    }
    const ordered = [...tally.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    const role = ordered[0][0];
    const nth = (seen[role] = (seen[role] ?? 0) + 1);
    const style = ROLE_STYLE[role];
    // A rank is not always of one kind: a process that consumed a whole
    // ACQUISITION sits at the same rank as the files that acquisition produced —
    // honest, and topologically necessary. Measured on a corpus, that lane said
    // "Prodotti · 5" over four images AND a process. So a mixed lane names what
    // it holds: `Prodotti · 4 + Processi · 1`.
    // DEV29 B2 · a lane says the STEP, not «Products (2)» / «Processes (2)»:
    // a lane of processes is named by what they did (their techniques, else
    // their kinds), a lane of products by what made them. The ordinal stays
    // only when no step can be named.
    const stepOf = (n: EmNode): string => processLabel(n) ?? String(n.name || n.id);
    const steps = (ns: EmNode[]): string => {
      const all = [...new Set(ns.map(stepOf))].sort();
      return all.slice(0, 2).join(" · ") + (all.length > 2 ? ` +${all.length - 2}` : "");
    };
    const roleWords = (rl: Role, first: boolean): string => {
      const ofRole = row.filter((n) => roleOf(n) === rl);
      if (rl === "process") {
        const ps = ofRole.filter((n) => n.node_type !== "dtc_acquisition");
        if (ps.length) return steps(ps);
      }
      if (rl === "output") {
        const makers = [...new Set(ofRole.flatMap((n) => preds.get(n.id) ?? []))]
          .map((id) => byIdAll.get(id)).filter((m): m is EmNode => !!m && isDtcNodeType(m.node_type));
        const procs = makers.filter((m) => m.node_type !== "dtc_acquisition");
        if (procs.length) return t("dtc.laneProductsOf", { what: steps(procs) });
        if (makers.length) return t("dtc.laneAcquired");
      }
      return `${t(ROLE_STYLE[rl].labelKey)}${first && nth > 1 ? ` (${nth})` : ""}`;
    };
    const composition = ordered
      .map(([rl, count], i) => `${roleWords(rl, i === 0)} · ${count}`)
      .join(" + ");
    return {
      id: `dtc-lane-${r}`,
      // "Processi · 2" is the count; "Processi (2) · 1" is the second act of
      // making — the ordinal only appears when a role comes round again.
      label: composition,
      y: i * laneH,
      height: laneH,
      color: style.color,
    };
  });

  // DEV30 D3 · a citing event in the rank of the event it cites goes on a
  // SECOND ROW of that lane, under it (the lane grows by one row, the lanes
  // below move down): «two rows of the same lane of acquisitions»
  {
    const ROW = NODE_H + 18;
    const extra = new Array(ranks.length).fill(0);
    const laneIdx = (id: string) => ranks.indexOf(rank.get(id) ?? 0);
    const moved: Array<[SceneNode, number]> = [];
    for (const [later, cited] of citesOf) {
      const a = scene.byId.get(later);
      const b = cited.map((c) => scene.byId.get(c)).find((x) => !!x && laneIdx(x.id) === laneIdx(later));
      if (!a || !b) continue;
      const li = laneIdx(later);
      a.x = b.x;
      moved.push([a, ROW]);
      extra[li] = Math.max(extra[li], ROW);
    }
    if (moved.length) {
      const shift: number[] = [];
      let acc = 0;
      for (let i = 0; i < ranks.length; i++) { shift.push(acc); acc += extra[i]; }
      for (const sn of scene.nodes) sn.y += shift[Math.max(0, laneIdx(sn.id))];
      for (const [sn, dy] of moved) sn.y += dy;
      scene.lanes.forEach((ln, i) => { ln.y += shift[i]; ln.height += extra[i]; });
      // nothing else may sit where the second row went: nodes of that lane
      // whose x collides move right
      for (const [sn] of moved)
        for (const o of scene.nodes)
          if (o !== sn && Math.abs(o.y - sn.y) < NODE_H && o.x < sn.x + NODE_W + H_GAP && o.x + NODE_W > sn.x)
            o.x = sn.x + NODE_W + H_GAP;
    }
  }

  for (const e of [...chain, ...bridges])
    if (scene.byId.has(e.source) && scene.byId.has(e.target))
      scene.edges.push({ source: e.source, target: e.target, edge: e });

  if (overrides)
    for (const sn of scene.nodes) {
      const o = overrides.get(sn.id);
      if (o) {
        sn.x = o.x;
        sn.y = o.y;
      }
    }

  // ── RISORSA-FILE · an OPEN resource shows its files underneath ────────────
  //
  // `has_file` is not a chain relation (it has no dtc_role): a file is not a
  // stage of making, it is a part of what was made. So the files are not ranked
  // — they hang under their resource, in its lane, which grows to hold them.
  // Each is an INSTANCE (`instanceOf` the file node): a texture shared by two
  // tiles appears under both, and a click on either selects the one file.
  const open = opts.openResources;
  if (open?.size) {
    const byNode = new Map((opts.allNodes ?? nodes).map((n) => [n.id, n]));
    const filesOf = new Map<string, EmEdge[]>();
    for (const e of edges)
      if (e.edge_type === "has_file" && open.has(e.source) && scene.byId.has(e.source))
        (filesOf.get(e.source) ?? filesOf.set(e.source, []).get(e.source)!).push(e);
    if (filesOf.size) {
      const laneOf = new Map<string, number>();
      for (const sn of scene.nodes) laneOf.set(sn.id, Math.max(0, ranks.indexOf(rank.get(sn.id) ?? 0)));
      const extra = new Array(ranks.length).fill(0);
      for (const [res, es] of filesOf) {
        const i = laneOf.get(res) ?? 0;
        extra[i] = Math.max(extra[i], es.length * (FILE_H + FILE_GAP) + FILE_TOP);
      }
      const shift: number[] = [];
      let acc = 0;
      for (let i = 0; i < ranks.length; i++) { shift.push(acc); acc += extra[i]; }
      for (const sn of scene.nodes) sn.y += shift[laneOf.get(sn.id) ?? 0];
      scene.lanes.forEach((ln, i) => { ln.y += shift[i]; ln.height += extra[i]; });
      for (const [res, es] of filesOf) {
        const owner = scene.byId.get(res)!;
        const sorted = [...es].sort((a, b) => {
          const ra = (a.attributes as Record<string, unknown> | undefined) ?? {};
          const rb = (b.attributes as Record<string, unknown> | undefined) ?? {};
          return (Number(ra.role !== "entry_point") - Number(rb.role !== "entry_point"))
            || String(ra.path ?? "").localeCompare(String(rb.path ?? ""));
        });
        sorted.forEach((e, k) => {
          const f = byNode.get(e.target);
          if (!f) return;
          const path = String(((e.attributes ?? {}) as Record<string, unknown>).path ?? f.name ?? f.id);
          const sn: SceneNode = {
            id: `${res}::file::${f.id}`, instanceOf: f.id, node: f,
            x: owner.x + FILE_INDENT, y: owner.y + NODE_H + FILE_TOP + k * (FILE_H + FILE_GAP),
            w: NODE_W - FILE_INDENT, h: FILE_H, label: path,
          };
          scene.nodes.push(sn);
          scene.byId.set(sn.id, sn);
          scene.edges.push({ source: res, target: sn.id, edge: e });
        });
      }
    }
  }

  return scene;
}
