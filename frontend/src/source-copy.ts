/**
 * MICRO-PIU-FONTI · «Copia in…»: between two open sources one COPIES, never
 * moves (E.D., 7 Nov 2026, the note «un outliner unico e più fonti»).
 *
 * Pure (no DOM, no store): `planCopy` says what would pass from the active
 * source to a destination, `applyCopy` turns the plan and the person's choices
 * into the operations the destination's store performs (one undo step there),
 * `wouldBe` + `newContradictions` say whether the destination «as it would be»
 * still passes the checks it passes now. `scripts/check-source-copy.mjs`.
 *
 * The rules, as decided:
 *
 * - **The ids are kept, always.** A node already in the destination is a
 *   COLLISION, never a second node with a new id.
 * - **What travels with a unit** is what it depends on, read off the edges in
 *   their direction: its paradata (properties, extractors, combiners, the
 *   documents they are extracted from), its paradata group and the group's
 *   members, its proxies (the semantic shapes) and the resources and files they
 *   point at, the DTC that produced those resources, their authors, licences
 *   and embargoes. Never another unit, an epoch, an activity or a container:
 *   a relation towards one of those enters only when its other end is already
 *   in the destination (or is copied too); otherwise it is LEFT OUT, and said.
 * - **The epochs**: the destination's epoch with the same id, else the one with
 *   the same name, else the epoch is copied (its id kept); or, chosen, every
 *   first epoch becomes one epoch of the destination.
 * - **Divergence with the same ids**: for every collision, the fields that
 *   differ and, apart, the RELATIONS — in more, in less, turned round. A
 *   relation in conflict does not enter by itself: by default the destination
 *   wins, and whoever copies chooses case by case. So do the fields.
 * - **Rights**: an asset (a node with a file: `data.url` / `data.checksum`)
 *   under a running embargo does not leave by default; chosen, it leaves
 *   SIGNALLED — with its embargo node, so the embargo keeps holding where it
 *   lands. The embargo is read as `s3dgraphy.rights` reads it (on the asset,
 *   then through its DTC chain) plus the resource that holds a file
 *   (`has_file`) and the graph's own embargo: copying out errs on the side of
 *   the embargo.
 * - **Provenance**: every node that enters carries `data.derived_from` — the
 *   source, its graph, its state (version, room cursor or instant), when.
 */
import { orderContradictions } from "./issues";
import { classIsA, classOf } from "./rules";
import type { EmDocument, EmEdge, EmNode } from "./types";

export type SourceKind = "file" | "room" | "node" | "none";

/** where a copy comes from, and in which state */
export interface CopyOrigin {
  kind: SourceKind;
  /** a file's name, a room's title */
  name: string;
  /** a path, `<node>/<room>`, «» for a graph with no file */
  locator: string;
  graphId: string;
  /** the file's version, the room's cursor, the read's instant */
  version?: string | null;
  cursor?: string | null;
  takenAt?: string | null;
}

export interface CopyChoices {
  /** collisions whose SOURCE fields win */
  fields?: Iterable<string>;
  /** relation conflicts (their `key`) where the SOURCE wins */
  relations?: Iterable<string>;
  /** assets under embargo let out, signalled */
  embargoed?: Iterable<string>;
  /** every first epoch of the copied units becomes this epoch of the destination */
  epoch?: string | null;
}

export interface FieldDiff { field: string; src: string; dst: string }
export interface Collision { id: string; name: string; type: string; fields: FieldDiff[] }
export type RelationKind = "added" | "removed" | "reversed";
export interface RelationConflict {
  key: string;
  kind: RelationKind;
  /** the source's edge (added, reversed) or the destination's (removed) */
  edge: EmEdge;
  /** reversed: the destination's edge, turned the other way */
  theirs?: EmEdge;
}
export interface LeftOut { edge: EmEdge; why: "missing_end" | "embargo" }
export interface EpochMap { id: string; name: string; to: string; how: "same_id" | "same_name" | "copied" | "chosen" }
export interface EmbargoedAsset { id: string; name: string; until: string | null; out: boolean }
export interface CopiedFile { id: string; name: string; url: string | null; checksum: string | null; bytes: number | null }

export interface CopyPlan {
  /** what enters as new nodes (ids kept), already stamped with `derived_from` */
  nodes: EmNode[];
  /** the relations that enter without a question */
  edges: EmEdge[];
  collisions: Collision[];
  relations: RelationConflict[];
  left: LeftOut[];
  epochs: EpochMap[];
  embargo: EmbargoedAsset[];
  files: CopiedFile[];
  counts: Record<CountKey, number>;
  /** the selected ids the source does not have (gone since the selection) */
  unknown: string[];
}

export type CountKey = "units" | "paradata" | "documents" | "resources" | "files" | "rights" | "dtc" | "epochs" | "other";

export interface CopyIn {
  src: EmDocument;
  dst: EmDocument;
  ids: Iterable<string>;
  origin: CopyOrigin;
  choices?: CopyChoices;
  /** the instant of the copy (ISO); the check fixes it */
  at?: string;
  /** «today» for the embargo (YYYY-MM-DD) */
  today?: string;
}

const is = (n: EmNode | undefined, cls: string): boolean => !!n && classIsA(classOf(n.node_type), cls);
const removedNode = (n: EmNode): boolean => !!(n.data as Record<string, unknown> | undefined)?.removed;
const removedEdge = (e: EmEdge): boolean => !!((e.attributes ?? {}) as Record<string, unknown>).removed;

/** never pulled in by a relation: another unit, an epoch, a container, the
 *  graph itself. Copied only when selected (or, an epoch, when it is missing). */
function structural(n: EmNode | undefined): boolean {
  if (!n) return true;
  if (is(n, "ParadataNodeGroup")) return false;
  return is(n, "StratigraphicNode") || is(n, "LandscapeUnitNode") || n.node_type === "EpochNode"
    || is(n, "GroupNode") || is(n, "GraphNode") || is(n, "GeoPositionNode");
}

/** relations followed BACKWARDS into what is copied: a paradata group brings
 *  its members, a resource the DTC step that produced it */
const PULL_IN = new Set(["is_in_paradata_nodegroup", "dtc_had_output"]);
/** relations never followed forwards: a membership does not bring the group
 *  (a document cited by two units sits in both units' groups) */
const NO_PULL_OUT = new Set(["is_in_paradata_nodegroup"]);
/** an edge towards an epoch: mapped, not followed */
const EPOCH_EDGES_CHOSEN = new Set(["has_first_epoch"]);
/** the relations that say the same thing either way round */
const SYMMETRIC = new Set(["has_same_time", "is_physically_equal_to", "equals", "bonded_to", "is_bonded_to", "contrasts_with"]);

/** the bookkeeping of a node: not a difference anybody wrote */
const BOOKKEEPING = new Set(["field_clocks", "modified_at", "modified_by", "modified_auth", "created_at", "created_by",
  "created_auth", "derived_from", "original_id", "original_emid", "graph_id", "instances", "_aux_overrides"]);

const key3 = (t: string, s: string, g: string): string => `${t}|${s}|${g}`;
const say = (v: unknown): string => (v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v));

/** `s3dgraphy.study.embargo_active`: a date in the future is a running
 *  embargo; anything unparseable is not (an embargo nobody can read is not a
 *  gate anybody could lift) */
export function embargoActive(value: unknown, today: string): boolean {
  if (value == null || value === "" || value === false) return false;
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!m) return false;
  return `${m[1]}-${m[2]}-${m[3]}` > today;
}

/** the date an embargo node runs until (s3dgraphy `_embargo_of`) */
function embargoOf(n: EmNode): string | null {
  const d = (n.data ?? {}) as Record<string, unknown>;
  const v = d.embargo_end ?? n.name;
  return v == null || v === "" ? null : String(v);
}

const CHAIN = new Set(["has_linked_resource", "dtc_had_output", "dtc_had_input", "has_file"]);

/** The running embargo on an asset, or null. */
function assetEmbargo(id: string, byId: Map<string, EmNode>, edges: EmEdge[], graphEmbargo: string | null, today: string): string | null | undefined {
  const own = (x: string): string | null | undefined => {
    for (const e of edges) {
      if (e.edge_type !== "has_embargo" || removedEdge(e)) continue;
      const other = e.source === x ? e.target : e.target === x ? e.source : null;
      const n = other ? byId.get(other) : undefined;
      if (n && n.node_type !== undefined && is(n, "EmbargoNode")) {
        const until = embargoOf(n);
        return embargoActive(until, today) ? until : undefined;
      }
    }
    return undefined;
  };
  const direct = own(id);
  if (direct !== undefined) return direct;
  for (const e of edges) {
    if (!CHAIN.has(e.edge_type ?? "") || removedEdge(e)) continue;
    const other = e.source === id ? e.target : e.target === id ? e.source : null;
    if (!other) continue;
    const via = own(other);
    if (via !== undefined) return via;
  }
  return graphEmbargo !== null && embargoActive(graphEmbargo, today) ? graphEmbargo : undefined;
}

/** the graph's own embargo (graph node, or its paradata group) */
function graphEmbargoOf(nodes: EmNode[], edges: EmEdge[], byId: Map<string, EmNode>): string | null {
  const roots = new Set(nodes.filter((n) => is(n, "GraphNode")).map((n) => n.id));
  for (const e of edges)
    if (e.edge_type === "has_paradata_nodegroup" && roots.has(e.source)) roots.add(e.target);
  for (const e of edges) {
    if (e.edge_type === "has_embargo" && roots.has(e.source)) { const n = byId.get(e.target); if (n) return embargoOf(n); }
    if (e.edge_type === "is_in_paradata_nodegroup" && roots.has(e.target)) {
      const n = byId.get(e.source);
      if (n && is(n, "EmbargoNode")) return embargoOf(n);
    }
  }
  return null;
}

const isAsset = (n: EmNode): boolean => {
  const d = (n.data ?? {}) as Record<string, unknown>;
  return (typeof d.checksum === "string" && !!d.checksum) || (typeof d.url === "string" && !!d.url);
};

function countKey(n: EmNode): CountKey {
  if (is(n, "StratigraphicNode")) return "units";
  if (n.node_type === "EpochNode") return "epochs";
  if (is(n, "DocumentNode")) return "documents";
  if (is(n, "ParadataNode") || is(n, "ParadataNodeGroup")) return "paradata";
  if (is(n, "ResourceFileNode")) return "files";
  if (is(n, "ResourceNode") || is(n, "RepresentationModelNode") || is(n, "RepresentationModelDocNode")
      || is(n, "RepresentationModelSpecialFindNode") || is(n, "SemanticShapeNode")) return "resources";
  if (is(n, "AuthorNode") || is(n, "LicenseNode") || is(n, "EmbargoNode")) return "rights";
  if (is(n, "DTCNode") || is(n, "DTCDeviceNode")) return "dtc";
  return "other";
}

/** what a copy's provenance says on a node */
export function provenance(o: CopyOrigin, at: string): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  if (o.version != null && o.version !== "") state.version = o.version;
  if (o.cursor) state.cursor = o.cursor;
  state.at = o.takenAt || at;
  return { kind: o.kind, source: o.name, locator: o.locator, graph_id: o.graphId, state, copied_at: at };
}

function fieldDiffs(a: EmNode, b: EmNode): FieldDiff[] {
  const out: FieldDiff[] = [];
  for (const f of ["name", "description", "node_type"] as const)
    if (say(a[f] ?? "") !== say(b[f] ?? "")) out.push({ field: f, src: say(a[f]), dst: say(b[f]) });
  const da = (a.data ?? {}) as Record<string, unknown>, db = (b.data ?? {}) as Record<string, unknown>;
  for (const k of [...new Set([...Object.keys(da), ...Object.keys(db)])].sort()) {
    if (BOOKKEEPING.has(k)) continue;
    if (say(da[k]) !== say(db[k])) out.push({ field: `data.${k}`, src: say(da[k]), dst: say(db[k]) });
  }
  return out;
}

/** What a copy of `ids` from `src` into `dst` would be. */
export function planCopy(inp: CopyIn): CopyPlan {
  const at = inp.at ?? new Date().toISOString();
  const today = inp.today ?? at.slice(0, 10);
  const ch = inp.choices ?? {};
  const letOut = new Set(ch.embargoed ?? []);
  const sNodes = inp.src.graph.nodes.filter((n) => !removedNode(n));
  const sEdges = inp.src.graph.edges.filter((e) => !removedEdge(e));
  const sById = new Map(sNodes.map((n) => [n.id, n]));
  const dNodes = inp.dst.graph.nodes.filter((n) => !removedNode(n));
  const dEdges = inp.dst.graph.edges.filter((e) => !removedEdge(e));
  const dById = new Map(dNodes.map((n) => [n.id, n]));
  const outOf = new Map<string, EmEdge[]>(), into = new Map<string, EmEdge[]>();
  for (const e of sEdges) {
    (outOf.get(e.source) ?? outOf.set(e.source, []).get(e.source)!).push(e);
    (into.get(e.target) ?? into.set(e.target, []).get(e.target)!).push(e);
  }

  // ── the closure (twice: the second time an asset held by its embargo
  //    does not bring what hangs from it) ───────────────────────────────────
  const unknown: string[] = [];
  const seeds: string[] = [];
  for (const id of inp.ids) {
    if (!sById.has(id)) unknown.push(id);
    else if (!seeds.includes(id)) seeds.push(id);
  }
  const closure = (blocked: Set<string>): Set<string> => {
    const C = new Set<string>();
    const queue: string[] = [];
    for (const id of seeds) if (!blocked.has(id)) { C.add(id); queue.push(id); }
    const take = (n: EmNode | undefined): void => {
      if (!n || structural(n) || C.has(n.id) || blocked.has(n.id)) return;
      C.add(n.id); queue.push(n.id);
    };
    while (queue.length) {
      const id = queue.shift()!;
      for (const e of outOf.get(id) ?? []) if (!NO_PULL_OUT.has(e.edge_type ?? "")) take(sById.get(e.target));
      for (const e of into.get(id) ?? []) if (PULL_IN.has(e.edge_type ?? "")) take(sById.get(e.source));
    }
    return C;
  };

  // ── rights: an asset under a running embargo stays out unless let out ────
  const gEmb = graphEmbargoOf(sNodes, sEdges, sById);
  const embargo: EmbargoedAsset[] = [];
  const held = new Set<string>();
  for (const id of closure(new Set())) {
    const n = sById.get(id)!;
    if (!isAsset(n)) continue;
    const until = assetEmbargo(id, sById, sEdges, gEmb, today);
    if (until === undefined) continue;
    const out = letOut.has(id);
    embargo.push({ id, name: String(n.name ?? id), until, out });
    if (!out) held.add(id);
  }
  const C = closure(held);

  // ── the epochs ───────────────────────────────────────────────────────────
  const epochs: EpochMap[] = [];
  const epochTo = new Map<string, string>();
  const dEpochByName = new Map<string, string>();
  for (const n of dNodes) if (n.node_type === "EpochNode") dEpochByName.set(String(n.name ?? "").trim().toLowerCase(), n.id);
  const chosen = ch.epoch && dById.get(ch.epoch)?.node_type === "EpochNode" ? ch.epoch : null;
  const mapEpoch = (eid: string): string | null => {
    if (epochTo.has(eid)) return epochTo.get(eid)!;
    const ep = sById.get(eid);
    if (!ep) return null;
    let to: string, how: EpochMap["how"];
    if (dById.has(eid)) { to = eid; how = "same_id"; }
    else if (dEpochByName.has(String(ep.name ?? "").trim().toLowerCase())) { to = dEpochByName.get(String(ep.name ?? "").trim().toLowerCase())!; how = "same_name"; }
    else { to = eid; how = "copied"; C.add(eid); }
    epochTo.set(eid, to);
    epochs.push({ id: eid, name: String(ep.name ?? eid), to, how });
    return to;
  };

  // ── the relations ────────────────────────────────────────────────────────
  const dKeys = new Map<string, EmEdge>();
  for (const e of dEdges) dKeys.set(key3(e.edge_type ?? "", e.source, e.target), e);
  const dEdgeIds = new Set(dEdges.map((e) => e.id).filter(Boolean));
  const edges: EmEdge[] = [];
  const relations: RelationConflict[] = [];
  const left: LeftOut[] = [];
  const seen = new Set<string>();
  const there = (id: string): boolean => C.has(id) || dById.has(id);
  for (const e0 of sEdges) {
    const sIn = C.has(e0.source), tIn = C.has(e0.target);
    if (!sIn && !tIn) continue;
    let e = e0;
    const tNode = sById.get(e0.target);
    if (sIn && tNode?.node_type === "EpochNode" && !C.has(e0.target)) {
      const toChosen = !!chosen && EPOCH_EDGES_CHOSEN.has(e0.edge_type ?? "") && is(sById.get(e0.source), "StratigraphicNode");
      const to = toChosen ? chosen : mapEpoch(e0.target);
      if (toChosen && !epochs.some((x) => x.id === e0.target && x.how === "chosen"))
        epochs.push({ id: e0.target, name: String(tNode.name ?? e0.target), to: chosen!, how: "chosen" });
      if (to && to !== e0.target) e = { ...e0, id: `${e0.source}_${e0.edge_type}_${to}`, target: to };
    }
    if (held.has(e.source) || held.has(e.target)) { left.push({ edge: e0, why: "embargo" }); continue; }
    if (!there(e.source) || !there(e.target)) { left.push({ edge: e0, why: "missing_end" }); continue; }
    const ty = e.edge_type ?? "";
    const k = key3(ty, e.source, e.target);
    if (seen.has(k)) continue;
    seen.add(k);
    if (dKeys.has(k) || (SYMMETRIC.has(ty) && dKeys.has(key3(ty, e.target, e.source)))) continue;   // already there
    const rev = !SYMMETRIC.has(ty) ? dKeys.get(key3(ty, e.target, e.source)) : undefined;
    if (rev) { relations.push({ key: `reversed:${k}`, kind: "reversed", edge: e, theirs: rev }); continue; }
    if (dById.has(e.source) && dById.has(e.target)) { relations.push({ key: `added:${k}`, kind: "added", edge: e }); continue; }
    edges.push(e.id && dEdgeIds.has(e.id) ? { ...e, id: `${e.source}_${ty}_${e.target}` } : e);
  }
  // relations the destination has between two colliding nodes and the source has not
  const both = new Set([...C].filter((id) => dById.has(id)));
  const sKeys = new Set(sEdges.map((e) => key3(e.edge_type ?? "", e.source, e.target)));
  for (const e of dEdges) {
    if (!both.has(e.source) || !both.has(e.target)) continue;
    const ty = e.edge_type ?? "";
    const k = key3(ty, e.source, e.target);
    if (sKeys.has(k) || sKeys.has(key3(ty, e.target, e.source))) continue;
    relations.push({ key: `removed:${k}`, kind: "removed", edge: e });
  }

  // ── the nodes ────────────────────────────────────────────────────────────
  const prov = provenance(inp.origin, at);
  const nodes: EmNode[] = [];
  const collisions: Collision[] = [];
  const counts = { units: 0, paradata: 0, documents: 0, resources: 0, files: 0, rights: 0, dtc: 0, epochs: 0, other: 0 } as Record<CountKey, number>;
  const files: CopiedFile[] = [];
  for (const n of sNodes) {
    if (!C.has(n.id)) continue;
    const mine = dById.get(n.id);
    if (mine) {
      const f = fieldDiffs(n, mine);
      collisions.push({ id: n.id, name: String(n.name ?? n.id), type: n.node_type, fields: f });
      continue;
    }
    const copy = JSON.parse(JSON.stringify(n)) as EmNode;
    copy.data = { ...((copy.data ?? {}) as Record<string, unknown>), derived_from: prov };
    if (embargo.some((a) => a.id === n.id && a.out)) (copy.data as Record<string, unknown>).embargo_signalled = embargo.find((a) => a.id === n.id)!.until ?? true;
    nodes.push(copy);
    counts[countKey(n)]++;
    if (isAsset(n)) {
      const d = (n.data ?? {}) as Record<string, unknown>;
      files.push({ id: n.id, name: String(n.name ?? n.id), url: typeof d.url === "string" ? d.url : null,
        checksum: typeof d.checksum === "string" ? d.checksum : null,
        bytes: typeof d.size_bytes === "number" ? d.size_bytes : null });
    }
  }
  return { nodes, edges, collisions, relations, left, epochs, embargo, files, counts, unknown };
}

export interface CopyOps {
  add: EmNode[];
  edges: EmEdge[];
  update: Array<{ id: string; patch: Partial<EmNode> }>;
  removeEdges: EmEdge[];
}

/** The operations a plan becomes, with the person's choices: the fields of a
 *  collision and each conflicting relation stay the destination's unless
 *  chosen. */
export function applyCopy(plan: CopyPlan, src: EmDocument, choices: CopyChoices = {}): CopyOps {
  const takeFields = new Set(choices.fields ?? []);
  const takeRel = new Set(choices.relations ?? []);
  const sById = new Map(src.graph.nodes.map((n) => [n.id, n]));
  const update: CopyOps["update"] = [];
  for (const c of plan.collisions) {
    if (!takeFields.has(c.id) || !c.fields.length) continue;
    const n = sById.get(c.id);
    if (!n) continue;
    const patch: Partial<EmNode> = {};
    const data: Record<string, unknown> = {};
    let anyData = false;
    for (const f of c.fields) {
      if (f.field.startsWith("data.")) { data[f.field.slice(5)] = ((n.data ?? {}) as Record<string, unknown>)[f.field.slice(5)]; anyData = true; }
      else (patch as Record<string, unknown>)[f.field] = n[f.field];
    }
    if (anyData) patch.data = data;
    update.push({ id: c.id, patch });
  }
  const edges = [...plan.edges];
  const removeEdges: EmEdge[] = [];
  for (const r of plan.relations) {
    if (!takeRel.has(r.key)) continue;
    if (r.kind === "added") edges.push(r.edge);
    else if (r.kind === "removed") removeEdges.push(r.edge);
    else if (r.theirs) { removeEdges.push(r.theirs); edges.push(r.edge); }
  }
  return { add: plan.nodes, edges, update, removeEdges };
}

/** The destination as it would be after the operations (nodes and edges only:
 *  what the checks read). The destination itself is not touched. */
export function wouldBe(dst: EmDocument, ops: CopyOps): EmDocument {
  const gone = new Set(ops.removeEdges.map((e) => `${e.id ?? ""}|${e.edge_type}|${e.source}|${e.target}`));
  const upd = new Map(ops.update.map((u) => [u.id, u.patch]));
  const nodes = dst.graph.nodes.map((n) => {
    const p = upd.get(n.id);
    if (!p) return n;
    return { ...n, ...p, ...(p.data ? { data: { ...((n.data ?? {}) as Record<string, unknown>), ...p.data } } : {}) } as EmNode;
  });
  const edges = dst.graph.edges.filter((e) => !gone.has(`${e.id ?? ""}|${e.edge_type}|${e.source}|${e.target}`));
  return { ...dst, graph: { ...dst.graph, nodes: [...nodes, ...ops.add], edges: [...edges, ...ops.edges] } };
}

export interface CopyProblem { kind: string; nodes: string[]; text?: string }

const liveNodes = (d: EmDocument): EmNode[] => d.graph.nodes.filter((n) => !removedNode(n));

/** the relations that are not an order between two units (issues.ts reads the same) */
const NOT_AN_ORDER = new Set(["is_in_activity", "is_in_paradata_nodegroup", "is_in_location", "is_in_timebranch", "is_part_of",
  "has_first_epoch", "survive_in_epoch", "has_sub_epoch"]);
const isUnit = (n: EmNode | undefined): boolean => is(n, "StratigraphicNode") || is(n, "LandscapeUnitNode");

/**
 * The chronology against the epochs: «A after B» while A's first epoch ENDS
 * before B's first epoch BEGINS — the relation says the opposite of the
 * epochs (what the Matrix draws as an arrow towards a newer lane). Epochs
 * without numeric dates say nothing.
 */
export function epochOrderContradictions(d: EmDocument): CopyProblem[] {
  const nodes = liveNodes(d);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const first = new Map<string, string>();
  for (const e of d.graph.edges)
    if (e.edge_type === "has_first_epoch" && !removedEdge(e) && !first.has(e.source)) first.set(e.source, e.target);
  const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const span = (id: string | undefined): { s: number | null; e: number | null } => {
    const dd = ((id ? byId.get(id)?.data : null) ?? {}) as Record<string, unknown>;
    return { s: num(dd.start_time), e: num(dd.end_time) };
  };
  const out: CopyProblem[] = [];
  for (const e of d.graph.edges) {
    const ty = e.edge_type ?? "";
    if (removedEdge(e) || NOT_AN_ORDER.has(ty) || SYMMETRIC.has(ty)) continue;
    if (!isUnit(byId.get(e.source)) || !isUnit(byId.get(e.target))) continue;
    const a = span(first.get(e.source)), b = span(first.get(e.target));
    if (a.e !== null && b.s !== null && a.e < b.s)
      out.push({ kind: "epoch_order", nodes: [e.source, e.target], text: ty });
  }
  return out;
}

/**
 * The checks the destination passes now and would no longer pass: a cycle in
 * the sequence and a contemporaneity contradicted by an order
 * (`orderContradictions`, the twin of what the layout engine breaks, read on
 * the units), a relation against the epochs (`epochOrderContradictions`), and
 * whatever `extra` says (the caller hands the epochs' own coherence and
 * overlaps, read by a store). A problem the destination ALREADY had is not the
 * copy's.
 */
export function newContradictions(before: EmDocument, after: EmDocument,
                                  extra?: (d: EmDocument) => CopyProblem[]): CopyProblem[] {
  const keyOf = (p: CopyProblem): string => `${p.kind}|${p.text ?? ""}|${[...p.nodes].sort().join(",")}`;
  const read = (d: EmDocument): CopyProblem[] => [
    ...orderContradictions(liveNodes(d).filter(isUnit), d.graph.edges).map((c) => ({ kind: c.kind, nodes: c.nodes })),
    ...epochOrderContradictions(d),
    ...(extra ? extra(d) : []),
  ];
  const had = new Set(read(before).map(keyOf));
  return read(after).filter((p) => !had.has(keyOf(p)));
}
