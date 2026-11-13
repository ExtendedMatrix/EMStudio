/**
 * MICRO-OUTLINER-UNICO (E.D., 7 Nov 2026; giro A, 12–13 Nov) · THE ONE OUTLINER,
 * as data.
 *
 * It takes the place of three lists: the EMTree (which files, which graphs),
 * the Outliner of the units, and the Outliner of the Space's scene. Its shape is
 * Blender's: the SOURCES (a file on disk, a room) hold the GRAPHS, and a graph
 * holds every dimension of itself as a list — units, documents, authors,
 * epochs, models and tilesets, proxies, GIS layers, paradata, and the rest.
 *
 *   Source (file · room · not on disk)
 *     └ Graph
 *         ├ Units            by epoch | alphabetical | by type
 *         ├ Documents        each with its RMDoc under it
 *         ├ Authors
 *         ├ Epochs           nested by `has_sub_epoch`
 *         ├ Models & tilesets
 *         ├ Proxies
 *         ├ GIS layers       (the Space's GIS block, as a branch)
 *         ├ Paradata         an option: off by default when synced with the 3D
 *         ├ Other            what no list above takes (resources, DTC, …)
 *         └ Auxiliary files  (the EMTree's, per graph)
 *
 * SYNC WITH THE 3D (E.D., 7 Nov, second answer): not with the window one is in,
 * but with «what has a 3D representation» — a unit with a proxy, a document
 * with an RMDoc, a special find with an RMSF, a model, a GIS layer. On, the rest
 * is GREY or FILTERED (the person's choice); off, the whole graph («Blender
 * File»).
 *
 * The source is the root already, so the giro B (several sources open at once)
 * adds sources, not a new tree.
 *
 * Pure: the graph and the facts in, rows out. Checked in node
 * (`scripts/check-outliner-tree.mjs`); `unified-outliner.ts` draws it.
 */
import { buildOutline } from "./outline";
import { classIsA, classOf } from "./rules";
import type { EmDocument, EmNode } from "./types";

export type Dim = "units" | "documents" | "authors" | "epochs" | "models" | "proxies" | "gis" | "paradata" | "other" | "aux";
/** every dimension, in the order the graph shows them */
export const DIMS: readonly Dim[] = ["units", "documents", "authors", "epochs", "models", "proxies", "gis", "paradata", "other", "aux"];
export type Hierarchy = "epoch" | "alpha" | "type";
export type Absent = "grey" | "filter";

export interface OutlinerOpts {
  hierarchy: Hierarchy;
  /** the dimensions shown (paradata apart: `paradata`) */
  dims: Dim[];
  /** synchronised with what has a 3D representation */
  sync3d: boolean;
  /** what the sync does with the rest */
  absent: Absent;
  /** the paradata: undefined = the default (off when synced, on when not) */
  paradata?: boolean;
  /** the dimension open at first (the window's place decides: Fonti, the documents) */
  firstOpen?: Dim;
  /** MICRO-SPAZIO-CONTAINER p.8 · the Outliner of the SPACE: its dimensions are the
   *  3D's (a unit is its proxy, a document its RMDoc, a find its RMSF, a survey
   *  its RM / container / tileset), and «by epoch» puts the epoch ABOVE them */
  space?: boolean;
  query: string;
}

export const DEFAULT_OPTS: OutlinerOpts = {
  hierarchy: "epoch",
  dims: ["units", "documents", "authors", "epochs", "models", "proxies", "gis", "aux"],
  sync3d: false,
  absent: "grey",
  query: "",
};

/** paradata shown: the person's choice, else off when synced with the 3D */
export function paradataShown(o: OutlinerOpts): boolean {
  return o.paradata ?? !o.sync3d;
}

/** What has a 3D representation, as the Space reads it (main.ts computes it). */
export interface ThreeFacts {
  /** units with a proxy that has a payload (`unitsWithout3d().with`) */
  proxies: Set<string>;
  /** document → its RMDoc (full: it has a file) */
  rmdocs: Map<string, { rm: string; full: boolean }>;
  /** special find → its RMSF models */
  rmsf: Map<string, string[]>;
  /** the representation models that are tilesets */
  tilesets: Set<string>;
  /** model → the epochs it depicts */
  rmEpochs: Map<string, string[]>;
  /** the GIS layers and surfaces of the graph */
  gis: Array<{ id: string; name: string; kind: "layer" | "raster" | "surface" }>;
  /** MICRO-SPAZIO-CONTAINER p.8 · model → the container it is in (the first) */
  rmGroup?: Map<string, string>;
  /** MICRO-OUTLINER-EPOCHE-TOOLTIP p.4 · a model's versions as the Space draws
   *  them (the one drawn, the one chosen, its level and uses): rows under it */
  versions?: (rmId: string) => VersionIn[];
  /** …the extractors with an anchor in 3D (`extracted_from` an
   *  `annotation_region` with `data.coords`), by the document they read */
  x3d?: Map<string, Array<{ id: string; name: string }>>;
  /** …the documents lit in an epoch of the Space (an RM, an RMDoc or a
   *  container they publish is drawn there) */
  docLit?: (docId: string, epochId: string) => boolean;
  /** …the sketches of the session, not yet given to a unit */
  sketches?: Array<{ id: string; name: string }>;
}

export interface VersionIn { id: string; name: string; drawn: boolean; chosen: boolean; level?: string; uses?: string[]; auto?: boolean }

export function emptyFacts(): ThreeFacts {
  return { proxies: new Set(), rmdocs: new Map(), rmsf: new Map(), tilesets: new Set(), rmEpochs: new Map(), gis: [] };
}

export interface OutlinerGraphIn {
  /** the slot of the EMTree */
  slot: string;
  name: string;
  active: boolean;
  /** the graph, read only when its row is open */
  doc: () => EmDocument | null;
  facts: () => ThreeFacts;
  aux: Array<{ id: string; name: string; type: string; mapped?: boolean }>;
  /** how many nodes it has (the graph's row says it) */
  nodes?: number;
}

export interface OutlinerSourceIn {
  id: string;
  name: string;
  /** MICRO-PIU-FONTI · `node`: a room read from a node, in reading */
  kind: "file" | "room" | "node" | "none";
  /** a path, a node: the row's tooltip */
  where?: string;
  dirty?: boolean;
  /** MICRO-PIU-FONTI · the source's colour (the title bar wears the active one's) */
  color?: string;
  /** nothing written here goes anywhere: copied out only */
  readOnly?: boolean;
  graphs: OutlinerGraphIn[];
}

export interface Texts {
  dim: Record<Dim, string>;
  noEpoch: string;
  typeLabel: (nodeType: string) => string;
  sourceNone: string;
  empty: string;
  /** the one line when nothing is open */
  noSources?: string;
  /** MICRO-SPAZIO-CONTAINER p.8 · the 3D's dimensions under an epoch (the Space) */
  space?: { proxies: string; models: string; rmdoc: string; rmsf: string; gis: string;
    /** MICRO-OUTLINER-EPOCHE-TOOLTIP p.4 */
    x3d?: string; sketches?: string; x3dOff?: string };
  /** MICRO-OUTLINER-EPOCHE-TOOLTIP p.1 · a container's alternative, a member out
   *  of its epoch, a container out of step */
  container?: { alternative: string; livesIn: (epochs: string) => string; outOfStep: (n: number, theirs: string, ref: string) => string; follows: string };
}

export type RowKind = "source" | "graph" | "dim" | "group" | "node" | "sub" | "gis" | "aux" | "empty" | "version";

export interface URow {
  /** unique in the tree: the open state and the virtual list key on it */
  key: string;
  kind: RowKind;
  depth: number;
  label: string;
  /** the node the row selects */
  id?: string;
  /** the slot of the graph the node is in (a pick in another graph activates it) */
  slot?: string;
  /** the node type its glyph is drawn from */
  glyph?: string;
  /** a text glyph, when no node type says it */
  glyphText?: string;
  /** the node's description, shown small after its name */
  desc?: string;
  /** a count after the label («12», «7 / 12» when synced) */
  count?: string;
  /** no 3D representation, while synced and greyed */
  absent?: boolean;
  /** the key of the Space's eye (`rm:<id>`, `proxy:<unit>`) or a GIS layer */
  eye?: string;
  gis?: string;
  title?: string;
  active?: boolean;
  /** the row has children (drawn or not) */
  parent: boolean;
  open: boolean;
  /** a source's id / an aux file's id: the row's menu */
  source?: string;
  aux?: string;
  /** MICRO-PIU-FONTI · a source's badge: «active», or the switch to make it so */
  badge?: "active" | "activate";
  /** a source's colour */
  color?: string;
  /** MICRO-SPAZIO-CONTAINER p.6 · the object of the Space the row stands for
   *  (`proxy:<unit>`, `rm:<id>`): selected as the Space's, not as the node's */
  skey?: string;
  /** MICRO-OUTLINER-EPOCHE-TOOLTIP p.2 · the epoch the row is listed under (a
   *  drag from here MOVES from it); "" = under «no epoch» */
  epochAt?: string;
  /** p.1 · a small chip after the name: the epochs a member lives in when not
   *  the row's (its tooltip says it) */
  note?: string;
  noteTitle?: string;
  /** p.1 · a container out of step: the line of the warning («allinea») */
  warn?: string;
  /** p.1 · the container's alternative (its tileset), marked as such */
  alt?: boolean;
  /** p.4 · a version row: the model it is of, drawn / chosen, its level and uses */
  version?: { rm: string } & VersionIn;
  /** p.4 · an extractor whose document is not lit: drawn only forced, as a ghost */
  ghost?: boolean;
}

interface TNode {
  row: Omit<URow, "depth" | "open" | "parent">;
  kids?: TNode[];
  /** built only when opened (a graph's dimensions) */
  lazy?: () => TNode[];
  /** default open */
  def?: boolean;
  /** a node of the graph: what the search and the sync read */
  present?: boolean;
  match?: string;
}

const removed = (n: EmNode): boolean => !!(n.data as Record<string, unknown> | undefined)?.removed;
const nameOf = (n: EmNode): string => String(n.name ?? n.id);
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const byName = (a: EmNode, b: EmNode): number => collator.compare(nameOf(a), nameOf(b));

const is = (n: EmNode, cls: string): boolean => classIsA(classOf(n.node_type), cls);

/** Which dimension a node is listed in (null: listed as the child of another,
 *  or not a thing of the graph to list). By the datamodel's classes. */
export function dimOf(n: EmNode, gisIds: Set<string>): Dim | null {
  const t = n.node_type;
  if (t === "representation_model_doc" || t === "representation_model_sf") return null;   // under its owner
  if (gisIds.has(n.id)) return "gis";
  if (is(n, "StratigraphicNode") && !is(n, "ContinuityNode")) return "units";
  if (is(n, "DocumentNode")) return "documents";
  if (is(n, "AuthorNode")) return "authors";
  if (t === "EpochNode") return "epochs";
  if (is(n, "RepresentationNode") || t === "RepresentationModelNodeGroup") return "models";
  if (is(n, "ParadataNode") || t === "ParadataNodeGroup") return "paradata";
  return "other";
}

export interface BuildIn {
  sources: OutlinerSourceIn[];
  opts: OutlinerOpts;
  texts: Texts;
  /** keys turned from their default state (open ↔ closed) */
  toggled: ReadonlySet<string>;
}

/** The tree of one graph's dimensions. */
function graphKids(g: OutlinerGraphIn, b: BuildIn): TNode[] {
  const doc = g.doc();
  if (!doc) return [];
  const { opts, texts } = b;
  const facts = g.facts();
  const live = doc.graph.nodes.filter((n) => !removed(n));
  const byId = new Map(live.map((n) => [n.id, n]));
  const gisIds = new Set(facts.gis.map((x) => x.id));
  const lists = new Map<Dim, EmNode[]>();
  for (const n of live) {
    const d = dimOf(n, gisIds);
    if (!d) continue;
    const l = lists.get(d);
    if (l) l.push(n); else lists.set(d, [n]);
  }
  const k = (s: string) => `${g.slot}|${s}`;
  const isUnitType = (t: string | undefined) => { const c = classOf(t); return classIsA(c, "StratigraphicNode") && !classIsA(c, "ContinuityNode"); };
  let olMemo: ReturnType<typeof buildOutline> | null = null;
  const outlineOf = () => (olMemo ??= buildOutline(doc, live, isUnitType));

  // MICRO-OUTLINER-EPOCHE-TOOLTIP p.1 · the epochs of a node as s3Dgraphy reads
  // them — an epoch's `has_representation_model` (an RM, a container), the
  // node's own `has_first_epoch` (first) and `survive_in_epoch` — and the
  // containers: their members, their alternative, the epochs they lie in.
  const liveEdges = doc.graph.edges.filter((e) => byId.has(e.source) && byId.has(e.target)
    && !(e as { attributes?: { removed?: unknown } }).attributes?.removed);
  const isEp = (id: string) => byId.get(id)?.node_type === "EpochNode";
  let epMemo: Map<string, string[]> | null = null;
  const epochsOfNode = (id: string): string[] => {
    if (!epMemo) {
      const m = new Map<string, string[]>();
      const add = (n: string, e: string) => { const l = m.get(n); if (!l) m.set(n, [e]); else if (!l.includes(e)) l.push(e); };
      for (const e of liveEdges) if (e.edge_type === "has_first_epoch" && isEp(e.target)) add(e.source, e.target);
      for (const e of liveEdges) if (e.edge_type === "has_representation_model" && isEp(e.source)) add(e.target, e.source);
      for (const e of liveEdges) if (e.edge_type === "survive_in_epoch" && isEp(e.target)) add(e.source, e.target);
      epMemo = m;
    }
    return epMemo.get(id) ?? [];
  };
  interface Cont { node: EmNode; members: EmNode[]; deep: EmNode[]; alts: EmNode[]; ref: string[]; placed: string[]; bad: EmNode[]; docs: string[] }
  let contMemo: Map<string, Cont> | null = null;
  const memberOf = new Map<string, string>();
  for (const e of liveEdges) if (e.edge_type === "is_in_representation_model_group" && byId.get(e.target)?.node_type === "RepresentationModelNodeGroup" && !memberOf.has(e.source))
    memberOf.set(e.source, e.target);
  const containers = (): Map<string, Cont> => {
    if (contMemo) return contMemo;
    const m = new Map<string, Cont>();
    const direct = (gid: string) => liveEdges.filter((e) => e.edge_type === "is_in_representation_model_group" && e.target === gid).map((e) => byId.get(e.source)!).filter(Boolean);
    const deepOf = (gid: string, seen = new Set<string>([gid])): EmNode[] => {
      const out: EmNode[] = [];
      for (const n of direct(gid)) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        out.push(n);
        if (n.node_type === "RepresentationModelNodeGroup") out.push(...deepOf(n.id, seen));
      }
      return out;
    };
    for (const g0 of live) {
      if (g0.node_type !== "RepresentationModelNodeGroup") continue;
      const members = direct(g0.id).sort(byName);
      const deep = deepOf(g0.id);
      const alts = liveEdges.filter((e) => e.source === g0.id && e.edge_type === "has_linked_resource").map((e) => byId.get(e.target)!).filter(Boolean);
      // its own epochs (s3Dgraphy `container_own_epochs`): an epoch reaching it,
      // and the epochs of the Document that publishes it
      const docs = liveEdges.filter((e) => e.target === g0.id && e.edge_type === "has_representation_model" && byId.get(e.source)?.node_type === "document").map((e) => e.source);
      const own = new Set(epochsOfNode(g0.id));
      for (const d0 of docs) for (const e of liveEdges) if (e.source === d0 && (e.edge_type === "has_first_epoch" || e.edge_type === "survive_in_epoch") && isEp(e.target)) own.add(e.target);
      // …and the reference (`container_epoch_check`): those, and its tilesets'
      const ref = new Set(own);
      const plain = deep.filter((x) => x.node_type !== "RepresentationModelNodeGroup");
      for (const x of plain) if (facts.tilesets.has(x.id)) for (const e of epochsOfNode(x.id)) ref.add(e);
      const bad = ref.size ? plain.filter((x) => !facts.tilesets.has(x.id) && epochsOfNode(x.id).length && !epochsOfNode(x.id).every((e) => ref.has(e))) : [];
      const union = new Set<string>();
      for (const x of plain) for (const e of epochsOfNode(x.id)) union.add(e);
      m.set(g0.id, { node: g0, members, deep, alts, ref: [...ref], placed: ref.size ? [...ref] : [...union], bad, docs });
    }
    contMemo = m;
    return m;
  };
  const epName = (ids: string[]) => ids.map((e) => nameOf(byId.get(e) ?? ({ id: e } as EmNode))).join(", ");
  /** a container as a BRANCH under the epoch `at` ("" = no epoch): its
   *  alternative (marked), then its members — a member living elsewhere says
   *  where (a chip and its tooltip), a sub-container is a branch again */
  const contBranch = (c: Cont, at: string, pre: string, mkModel: (n: EmNode, key: string) => TNode, space: boolean, depth = 0): TNode => {
    const C = texts.container;
    const gk = `${pre}/grp/${c.node.id}`;
    const kids: TNode[] = c.alts.map((a) => ({
      row: { key: k(`${gk}/alt/${a.id}`), kind: "sub" as const, label: nameOf(a), id: a.id, slot: g.slot, glyphText: "▦", alt: true,
        ...(C ? { title: C.alternative } : {}),
        ...(space && facts.rmEpochs.has(c.node.id) ? { eye: `rm:${c.node.id}`, skey: `rm:${c.node.id}` } : {}) },
      present: true, match: nameOf(a).toLowerCase() }));
    for (const m of c.members) {
      if (m.node_type === "RepresentationModelNodeGroup") {
        const sub = containers().get(m.id);
        if (sub && depth < 6) kids.push(contBranch(sub, at, gk, mkModel, space, depth + 1));
        continue;
      }
      const t = mkModel(m, `${gk}/m/${m.id}`);
      const eps = epochsOfNode(m.id);
      t.row = { ...t.row, epochAt: at };
      if (eps.length && !(at && eps.includes(at))) {
        t.row.note = `⟂ ${epName(eps)}`;
        if (C) t.row.noteTitle = C.livesIn(epName(eps));
      } else if (!eps.length && C) t.row.noteTitle = C.follows;
      kids.push(t);
    }
    const own = space && facts.rmEpochs.has(c.node.id) && !c.alts.length;
    return {
      row: { key: k(gk), kind: "node", label: nameOf(c.node), id: c.node.id, slot: g.slot, glyph: String(c.node.node_type), epochAt: at,
        ...(c.node.description ? { desc: String(c.node.description) } : {}),
        ...(own ? { eye: `rm:${c.node.id}`, skey: `rm:${c.node.id}`, glyphText: facts.tilesets.has(c.node.id) ? "▦" : undefined } : {}),
        ...(c.bad.length && C ? { warn: C.outOfStep(c.bad.length, epName([...new Set(c.bad.flatMap((x) => epochsOfNode(x.id)))]), epName(c.ref)) } : {}) },
      kids, def: false, present: true, match: `${nameOf(c.node)} ${String(c.node.description ?? "")}`.toLowerCase(),
    };
  };
  /** the models of an epoch: its containers as branches, then the models in no container */
  const modelsAt = (at: string, pre: string, mkModel: (n: EmNode, key: string) => TNode, inEp: (id: string) => boolean, space: boolean): TNode[] => {
    const out2: TNode[] = [];
    const cs = [...containers().values()].filter((c) => !memberOf.has(c.node.id)).sort((a, b) => byName(a.node, b.node));
    for (const c of cs) if (at ? c.placed.includes(at) : !c.placed.length) out2.push(contBranch(c, at, pre, mkModel, space));
    const loose = (lists.get("models") ?? []).filter((n) => n.node_type !== "RepresentationModelNodeGroup" && !memberOf.has(n.id) && inEp(n.id)).sort(byName);
    for (const n of loose) { const t = mkModel(n, `${pre}/rm/${n.id}`); t.row = { ...t.row, epochAt: at }; out2.push(t); }
    return out2;
  };
  const leaf = (n: EmNode, key: string, present: boolean, extra: Partial<TNode["row"]> = {}, kids?: TNode[]): TNode => ({
    row: { key: k(key), kind: "node", label: nameOf(n), id: n.id, slot: g.slot, glyph: String(n.node_type),
      ...(n.description ? { desc: String(n.description) } : {}), ...extra },
    present, match: `${nameOf(n)} ${String(n.description ?? "")}`.toLowerCase(), ...(kids?.length ? { kids, def: false } : {}),
  });
  /** a list under groups by the hierarchy chosen; `epochOf` for «by epoch» */
  const grouped = (dim: Dim, nodes: EmNode[], mk: (n: EmNode) => TNode, epochOf?: (n: EmNode) => string[]): TNode[] => {
    const sorted = [...nodes].sort(byName);
    if (opts.hierarchy === "type" || (opts.hierarchy === "epoch" && !epochOf)) {
      // by epoch without epochs to read (documents, authors…): by type, the nearest reading
      if (opts.hierarchy === "epoch" && dim !== "paradata" && dim !== "other" && dim !== "models") return sorted.map(mk);
      const by = new Map<string, EmNode[]>();
      for (const n of sorted) { const tt = String(n.node_type); const l = by.get(tt); if (l) l.push(n); else by.set(tt, [n]); }
      const types = [...by.keys()].sort((a, c) => collator.compare(texts.typeLabel(a), texts.typeLabel(c)));
      if (types.length === 1 && dim !== "other") return by.get(types[0])!.map(mk);
      return types.map((tt) => ({ row: { key: k(`${dim}/type:${tt}`), kind: "group" as const, label: texts.typeLabel(tt), glyph: tt },
        kids: by.get(tt)!.map(mk), def: dim !== "other" }));
    }
    if (opts.hierarchy === "alpha") return sorted.map(mk);
    // by epoch
    const eps = (lists.get("epochs") ?? []);
    const at = new Map<string, EmNode[]>();
    const none: EmNode[] = [];
    for (const n of sorted) {
      const e = epochOf!(n).filter((x) => byId.has(x));
      if (!e.length) none.push(n);
      for (const x of e) { const l = at.get(x); if (l) l.push(n); else at.set(x, [n]); }
    }
    const order = outlineOf().epochs.map((e) => e.node.id);
    const ordered = [...order, ...eps.map((e) => e.id).filter((id) => !order.includes(id))];
    const out: TNode[] = [];
    for (const id of ordered) {
      const l = at.get(id);
      if (!l?.length) continue;
      const ep = byId.get(id)!;
      out.push({ row: { key: k(`${dim}/ep:${id}`), kind: "group", label: nameOf(ep), id, slot: g.slot, glyph: "EpochNode" },
        kids: l.map(mk), def: true, present: true, match: nameOf(ep).toLowerCase() });
    }
    if (none.length) out.push({ row: { key: k(`${dim}/ep:-`), kind: "group", label: texts.noEpoch }, kids: none.map(mk), def: true });
    return out;
  };

  // the units, by epoch: the outline's own reading (has_first_epoch, the containers indented)
  const unitKids = (): TNode[] => {
    const units = lists.get("units") ?? [];
    const present = (n: EmNode) => facts.proxies.has(n.id) || (facts.rmsf.get(n.id)?.length ?? 0) > 0;
    const mk = (n: EmNode): TNode => {
      const sub = (facts.rmsf.get(n.id) ?? []).map((rm) => byId.get(rm)).filter((x): x is EmNode => !!x)
        .map((rm) => ({ row: { key: k(`units/${n.id}/rmsf:${rm.id}`), kind: "sub" as const, label: nameOf(rm), id: rm.id, slot: g.slot,
          glyph: String(rm.node_type), eye: `rm:${rm.id}` }, present: true, match: nameOf(rm).toLowerCase() }));
      return leaf(n, `units/${n.id}`, present(n), facts.proxies.has(n.id) ? { eye: `proxy:${n.id}` } : {}, sub);
    };
    if (opts.hierarchy !== "epoch") return grouped("units", units, mk);
    const ol = outlineOf();
    const out: TNode[] = [];
    // an epoch with no unit of its own stays as the heading of its sub-epochs
    // that have some (the outline lists them depth first: read it backwards)
    const keepEp = new Set<string>();
    ol.epochs.forEach((e, i) => {
      let has = e.units.length > 0;
      for (let j = i + 1; !has && j < ol.epochs.length && ol.epochs[j].depth > e.depth; j++) has = ol.epochs[j].units.length > 0;
      if (has) keepEp.add(e.node.id);
    });
    for (const e of ol.epochs) {
      if (!keepEp.has(e.node.id)) continue;
      out.push({ row: { key: k(`units/ep:${e.node.id}`), kind: "group", label: nameOf(e.node), id: e.node.id, slot: g.slot, glyph: "EpochNode",
        title: e.start != null || e.end != null ? `${e.start ?? "…"} – ${e.end ?? "…"}` : undefined },
        kids: e.units.map((u) => { const t = mk(u.node); t.row = { ...t.row, key: k(`units/ep:${e.node.id}/${u.node.id}`), epochAt: e.node.id }; (t as TNode & { indent?: number }).indent = u.depth; return t; }),
        def: true, present: true, match: nameOf(e.node).toLowerCase() });
      (out[out.length - 1] as TNode & { indent?: number }).indent = e.depth;
    }
    if (ol.unplaced.length) out.push({ row: { key: k("units/ep:-"), kind: "group", label: texts.noEpoch },
      kids: ol.unplaced.map((u) => { const t = mk(u.node); t.row = { ...t.row, epochAt: "" }; return t; }), def: true });
    return out;
  };

  const docKids = (): TNode[] => grouped("documents", lists.get("documents") ?? [], (n) => {
    const r = facts.rmdocs.get(n.id);
    const rm = r ? byId.get(r.rm) : undefined;
    const sub = rm ? [{ row: { key: k(`documents/${n.id}/rmdoc:${rm.id}`), kind: "sub" as const, label: nameOf(rm), id: rm.id, slot: g.slot,
      glyph: "representation_model_doc", eye: `rm:${rm.id}`, ...(r!.full ? {} : { title: "∅" }) }, present: r!.full, match: nameOf(rm).toLowerCase() }] : [];
    return leaf(n, `documents/${n.id}`, !!r?.full, {}, sub);
  });

  const epochKids = (): TNode[] => {
    const eps = lists.get("epochs") ?? [];
    const ol = outlineOf();
    const has3d = new Set<string>();
    for (const [, es] of facts.rmEpochs) for (const e of es) has3d.add(e);
    for (const e of ol.epochs) if (e.units.some((u) => facts.proxies.has(u.node.id))) has3d.add(e.node.id);
    if (opts.hierarchy === "alpha") return [...eps].sort(byName).map((n) => leaf(n, `epochs/${n.id}`, has3d.has(n.id)));
    const seen = new Set<string>();
    const out: TNode[] = [];
    for (const e of ol.epochs) {
      seen.add(e.node.id);
      const l = leaf(e.node, `epochs/${e.node.id}`, has3d.has(e.node.id),
        e.start != null || e.end != null ? { title: `${e.start ?? "…"} – ${e.end ?? "…"}` } : {});
      (l as TNode & { indent?: number }).indent = e.depth;
      out.push(l);
    }
    for (const n of eps) if (!seen.has(n.id)) out.push(leaf(n, `epochs/${n.id}`, has3d.has(n.id)));
    return out;
  };

  const modelLeaf = (n: EmNode, key: string): TNode => leaf(n, key, true, {
    ...(n.node_type !== "RepresentationModelNodeGroup" ? { eye: `rm:${n.id}` } : {}),
    ...(facts.tilesets.has(n.id) ? { glyphText: "▦", title: "tileset" } : {}),
  });
  // MICRO-OUTLINER-EPOCHE-TOOLTIP p.1 (E.D., 13 Nov 2026: «il container è un
  // ramo») · by epoch: epoch → container → its members (and its alternative);
  // a model in a container is not listed again under the epoch
  const modelKids = (): TNode[] => {
    if (opts.hierarchy !== "epoch") return grouped("models", (lists.get("models") ?? []), (n) => modelLeaf(n, `models/${n.id}`));
    const eps = lists.get("epochs") ?? [];
    const order = outlineOf().epochs.map((e) => e.node.id);
    const ordered = [...order, ...eps.map((e) => e.id).filter((id) => !order.includes(id))];
    const out: TNode[] = [];
    for (const id of ordered) {
      const kids = modelsAt(id, `models/ep:${id}`, modelLeaf, (m) => epochsOfNode(m).includes(id), false);
      if (!kids.length) continue;
      const ep = byId.get(id)!;
      out.push({ row: { key: k(`models/ep:${id}`), kind: "group", label: nameOf(ep), id, slot: g.slot, glyph: "EpochNode" },
        kids, def: true, present: true, match: nameOf(ep).toLowerCase() });
    }
    const none = modelsAt("", "models/ep:-", modelLeaf, (m) => !epochsOfNode(m).length, false);
    if (none.length) out.push({ row: { key: k("models/ep:-"), kind: "group", label: texts.noEpoch }, kids: none, def: true });
    return out;
  };

  const proxyKids = (): TNode[] => {
    const units = (lists.get("units") ?? []).filter((n) => facts.proxies.has(n.id));
    const ol = opts.hierarchy === "epoch" ? outlineOf() : null;
    const epochOf = (n: EmNode): string[] => {
      if (!ol) return [];
      for (const e of ol.epochs) if (e.units.some((u) => u.node.id === n.id)) return [e.node.id];
      return [];
    };
    return grouped("proxies", units, (n) => leaf(n, `proxies/${n.id}`, true, { eye: `proxy:${n.id}`, glyphText: "◆" }), epochOf);
  };

  const gisKids = (): TNode[] => facts.gis.map((x) => {
    const n = byId.get(x.id);
    return { row: { key: k(`gis/${x.id}`), kind: "gis" as const, label: x.name, id: n ? x.id : undefined, slot: g.slot,
      glyphText: x.kind === "surface" ? "⛰" : x.kind === "raster" ? "▦" : "◇", gis: x.id }, present: true, match: x.name.toLowerCase() };
  });

  const plain = (dim: Dim) => () => grouped(dim, lists.get(dim) ?? [], (n) => leaf(n, `${dim}/${n.id}`, false));

  const auxKids = (): TNode[] => g.aux.map((a) => ({
    row: { key: k(`aux/${a.id}`), kind: "aux" as const, label: a.name, title: a.type, aux: a.id, slot: g.slot, glyphText: a.mapped ? "◉" : "○" },
    present: false, match: a.name.toLowerCase() }));

  // MICRO-SPAZIO-CONTAINER p.8 (E.D., 13 Nov 2026: «la scansione per epoche dovrebbe
  // essere a monte delle diverse tipologie e non a valle») · the Space's tree:
  //   Epoch (its phases indented under it) → Proxy · Models (a container with
  //   its members and its own alternative) · RMDoc · RMSF · GIS, then the objects;
  // what has no epoch under «no epoch», the GIS layers there. «By type» and
  // «alphabetical» stay the graph's dimensions.
  if (opts.space && opts.hierarchy === "epoch" && texts.space) {
    const W = texts.space;
    const ol = outlineOf();
    const epochIds = new Set((lists.get("epochs") ?? []).map((n) => n.id));
    const rmEpochs = (id: string) => (facts.rmEpochs.get(id) ?? []).filter((e) => epochIds.has(e));
    const pxLeaf = (u: EmNode, at: string): TNode => leaf(u, `sp/${at}/px/${u.id}`, true, { eye: `proxy:${u.id}`, glyphText: "◆", skey: `proxy:${u.id}` });
    // MICRO-OUTLINER-EPOCHE-TOOLTIP p.4 · a model's versions under it (a click on one draws it)
    const versionRows = (n: EmNode, key: string): TNode[] => {
      const vs = facts.versions?.(n.id) ?? [];
      return vs.length > 1 ? vs.map((v) => ({ row: { key: k(`${key}/v:${v.id}`), kind: "version" as const, label: v.name, id: v.id, slot: g.slot,
        glyphText: v.drawn ? "●" : v.chosen ? "○" : "·", version: { rm: n.id, ...v } }, present: true, match: v.name.toLowerCase() })) : [];
    };
    const rmKeyed = (n: EmNode, key: string): TNode => leaf(n, key, true, { eye: `rm:${n.id}`, skey: `rm:${n.id}`,
      ...(facts.tilesets.has(n.id) ? { glyphText: "▦", title: "tileset" } : {}) }, versionRows(n, key));
    const typeGroup = (at: string, key: string, label: string, kids: TNode[], glyph?: string): TNode[] => kids.length
      ? [{ row: { key: k(`sp/${at}/${key}`), kind: "group", label, ...(glyph ? { glyph } : {}) }, kids, def: true }] : [];
    // MICRO-OUTLINER-EPOCHE-TOOLTIP p.1 · the containers as branches (the same
    // reading as the graph's «Models» by epoch), the loose models after them
    const modelsIn = (at: string, inEp: (id: string) => boolean): TNode[] =>
      modelsAt(at === "-" ? "" : at, `sp/${at}`, rmKeyed, inEp, true);
    const subOf = (at: string, map: Map<string, string[]>, owners: EmNode[], inEp: (id: string) => boolean, glyph: string): TNode[] => {
      const out2: TNode[] = [];
      for (const o of owners) for (const rid of map.get(o.id) ?? []) {
        const rm = byId.get(rid);
        if (rm && inEp(rid)) out2.push(leaf(rm, `sp/${at}/${glyph}/${rid}`, true, { eye: `rm:${rid}`, skey: `rm:${rid}`, glyph, desc: nameOf(o) },
          versionRows(rm, `sp/${at}/${glyph}/${rid}`)));
      }
      return out2;
    };
    const rmdocMap = new Map<string, string[]>([...facts.rmdocs].map(([d0, r]) => [d0, [r.rm]]));
    const docs = (lists.get("documents") ?? []).filter((n) => rmdocMap.has(n.id)).sort(byName);
    const finds = (lists.get("units") ?? []).filter((n) => (facts.rmsf.get(n.id) ?? []).length).sort(byName);
    // MICRO-OUTLINER-EPOCHE-TOOLTIP p.4 (E.D., 13 Nov 09:10) · the extractors
    // with an anchor in 3D, NESTED UNDER THEIR DOCUMENT and only where that
    // document is present through an RM, an RMDoc or a container it publishes;
    // a document published here but switched off: its extractors are ghosts
    // (the eye can force them, to compare a height with the reconstruction)
    const pubMemo = new Map<string, string[]>();
    const published = (docId: string): string[] => {
      const hit = pubMemo.get(docId);
      if (hit) return hit;
      const out2: string[] = [];
      for (const e of liveEdges) if (e.source === docId && (e.edge_type === "has_representation_model" || e.edge_type === "has_representation_model_doc")) {
        out2.push(e.target);
        const c = containers().get(e.target);
        if (c) out2.push(...c.deep.map((x) => x.id));
      }
      pubMemo.set(docId, out2);
      return out2;
    };
    const x3dIn = (at: string): TNode[] => {
      if (!facts.x3d?.size || at === "-") return [];
      const out2: TNode[] = [];
      for (const [docId, xs] of facts.x3d) {
        const d0 = byId.get(docId);
        if (!d0 || !xs.length) continue;
        const here = published(docId).some((id) => epochsOfNode(id).includes(at) || containers().get(id)?.placed.includes(at));
        if (!here) continue;
        const lit = facts.docLit ? facts.docLit(docId, at) : true;
        const kids = xs.slice().sort((a, b) => collator.compare(a.name, b.name)).map((x) => ({
          row: { key: k(`sp/${at}/x3d/${docId}/${x.id}`), kind: "node" as const, label: x.name, id: x.id, slot: g.slot, glyph: "extractor",
            eye: `x3d:${x.id}`, skey: `x3d:${x.id}`, ...(lit ? {} : { ghost: true, ...(W.x3dOff ? { title: W.x3dOff } : {}) }) },
          present: true, match: x.name.toLowerCase() }));
        out2.push(leaf(d0, `sp/${at}/x3d/${docId}`, true, {}, kids));
        out2[out2.length - 1].def = true;
      }
      return out2;
    };
    const block = (at: string, units: EmNode[], inEp: (id: string) => boolean, gis: boolean): TNode[] => [
      ...typeGroup(at, "px", W.proxies, units.filter((u) => facts.proxies.has(u.id)).sort(byName).map((u) => pxLeaf(u, at))),
      ...typeGroup(at, "models", W.models, modelsIn(at, inEp), "representation_model"),
      ...typeGroup(at, "rmdoc", W.rmdoc, subOf(at, rmdocMap, docs, inEp, "representation_model_doc"), "representation_model_doc"),
      ...typeGroup(at, "rmsf", W.rmsf, subOf(at, facts.rmsf, finds, inEp, "representation_model_sf"), "representation_model_sf"),
      ...(gis ? typeGroup(at, "gis", W.gis, facts.gis.map((x) => ({ row: { key: k(`sp/${at}/gis/${x.id}`), kind: "gis" as const, label: x.name,
        id: byId.has(x.id) ? x.id : undefined, slot: g.slot, glyphText: x.kind === "surface" ? "⛰" : x.kind === "raster" ? "▦" : "◇", gis: x.id },
        present: true, match: x.name.toLowerCase() }))) : []),
      ...(W.x3d ? typeGroup(at, "x3d", W.x3d, x3dIn(at), "extractor") : []),
    ];
    const out: TNode[] = [];
    const placed = new Set<string>();
    for (const e of ol.epochs) {
      const units = e.units.map((u) => u.node);
      for (const u of units) placed.add(u.id);
      const kids = block(e.node.id, units, (id) => rmEpochs(id).includes(e.node.id), false);
      const t: TNode & { indent?: number } = { row: { key: k(`sp/ep:${e.node.id}`), kind: "group", label: nameOf(e.node), id: e.node.id, slot: g.slot, glyph: "EpochNode",
        title: e.start != null || e.end != null ? `${e.start ?? "…"} – ${e.end ?? "…"}` : undefined },
        kids, def: true, present: true, match: nameOf(e.node).toLowerCase() };
      t.indent = e.depth;
      // an epoch with nothing of the 3D stays, empty, only when a phase under it has something
      out.push(t);
    }
    // drop the epochs without anything, unless a deeper one after them (a phase) has
    for (let i = out.length - 1; i >= 0; i--) {
      const t = out[i] as TNode & { indent?: number };
      const hasNext = i + 1 < out.length && ((out[i + 1] as TNode & { indent?: number }).indent ?? 0) > (t.indent ?? 0);
      if (!(t.kids ?? []).length && !hasNext) out.splice(i, 1);
    }
    const loose = (lists.get("units") ?? []).filter((u) => !placed.has(u.id));
    const none = block("-", loose, (id) => !rmEpochs(id).length, true);
    if (none.length) out.push({ row: { key: k("sp/ep:-"), kind: "group", label: texts.noEpoch }, kids: none, def: true });
    // MICRO-OUTLINER-EPOCHE-TOOLTIP p.4 · out of the epochs, at the bottom: the
    // shapes of the session not yet given to a unit
    if (facts.sketches?.length && W.sketches) out.push({ row: { key: k("sp/sketches"), kind: "group", label: W.sketches, glyphText: "◇" },
      kids: facts.sketches.map((x) => ({ row: { key: k(`sp/sketch/${x.id}`), kind: "node" as const, label: x.name, slot: g.slot, glyphText: "◇",
        eye: `sketch:${x.id}`, skey: `sketch:${x.id}` }, present: true, match: x.name.toLowerCase() })), def: true });
    return out;
  }

  const make: Record<Dim, () => TNode[]> = {
    units: unitKids, documents: docKids, authors: plain("authors"), epochs: epochKids, models: modelKids,
    proxies: proxyKids, gis: gisKids, paradata: plain("paradata"), other: plain("other"), aux: auxKids,
  };
  const out: TNode[] = [];
  for (const d of DIMS) {
    const shown = d === "paradata" ? paradataShown(opts) : opts.dims.includes(d);
    if (!shown) continue;
    if (d === "aux" && !g.aux.length) continue;
    if (d === "gis" && !facts.gis.length) continue;
    out.push({ row: { key: k(`dim:${d}`), kind: "dim", label: texts.dim[d], slot: g.slot }, lazy: make[d], def: d === (opts.firstOpen ?? "units") || (opts.sync3d && (d === "models" || d === "proxies")) });
  }
  return out;
}

function sourceNodes(b: BuildIn): TNode[] {
  return b.sources.map((s) => ({
    row: { key: `src:${s.id}`, kind: "source" as const, label: s.kind === "none" ? b.texts.sourceNone : s.name, title: s.where,
      glyphText: s.kind === "room" ? "⇄" : s.kind === "node" ? "◎" : s.kind === "none" ? "◌" : "▤", source: s.id,
      active: s.graphs.some((g) => g.active),
      ...(s.graphs.length ? { badge: s.graphs.some((g) => g.active) ? "active" as const : "activate" as const } : {}),
      ...(s.color ? { color: s.color } : {}),
      ...(s.dirty ? { count: "●" } : s.readOnly ? { count: "🔒" } : {}) },
    def: true,
    kids: s.graphs.map((g) => ({
      row: { key: `g:${g.slot}`, kind: "graph" as const, label: g.name, slot: g.slot, glyphText: "◆", active: g.active,
        ...(g.nodes != null ? { count: String(g.nodes) } : {}) },
      lazy: () => graphKids(g, b), def: g.active,
    })),
  }));
}

/** The node's presence while synced: nodes say it, a group follows its children. */
const presentOf = (t: TNode): boolean => t.present !== false;

/**
 * The rows to draw, in order: the tree flattened through what is open.
 *
 * With a query every graph node whose name (or description) holds it is shown
 * with the rows above it, opened; the rest goes. Synced with the 3D, a node
 * without a 3D representation is greyed or filtered, and a group left empty by
 * the filter goes with it.
 */
export function flattenOutliner(b: BuildIn): URow[] {
  const q = b.opts.query.trim().toLowerCase();
  const filter = b.opts.sync3d && b.opts.absent === "filter";
  const grey = b.opts.sync3d && b.opts.absent === "grey";
  const out: URow[] = [];
  const isOpen = (t: TNode) => (t.def ?? false) !== b.toggled.has(t.row.key);
  const kidsOf = (t: TNode): TNode[] => {
    if (t.kids) return t.kids;
    if (t.lazy) { t.kids = t.lazy(); return t.kids; }
    return [];
  };
  /** does the subtree hold a match / a present node? (graph nodes only) */
  const keep = new Map<TNode, boolean>();
  const survives = (t: TNode): boolean => {
    const hit = keep.get(t);
    if (hit !== undefined) return hit;
    let v: boolean;
    const leafish = t.row.kind === "node" || t.row.kind === "sub" || t.row.kind === "gis" || t.row.kind === "aux" || t.row.kind === "version";
    const own = (!q || (t.match ?? t.row.label.toLowerCase()).includes(q)) && (!filter || presentOf(t));
    if (leafish) v = own || (t.kids ?? []).some(survives);
    else {
      // a structural row survives when something under it does; a source's
      // and a graph's rows always stay (the place stays, even empty)
      v = t.row.kind === "source" || t.row.kind === "graph" || kidsOf(t).some(survives)
        || (t.row.kind === "group" && !!t.row.id && own && !!q);
    }
    keep.set(t, v);
    return v;
  };
  const counts = (t: TNode): { all: number; present: number } => {
    let all = 0, present = 0;
    const walk = (x: TNode) => {
      if (x.row.kind === "node" || x.row.kind === "gis" || x.row.kind === "aux") { all++; if (presentOf(x)) present++; }
      for (const c of x.row.kind === "node" ? [] : kidsOf(x)) walk(c);
    };
    for (const c of kidsOf(t)) walk(c);
    return { all, present };
  };
  const walk = (t: TNode, depth: number): void => {
    if ((q || filter) && !survives(t)) return;
    const searching = !!q && t.row.kind !== "source" && t.row.kind !== "graph";
    const hasKids = !!(t.kids?.length || t.lazy);
    const open = hasKids && (searching ? true : isOpen(t) || (!!q && t.row.kind === "graph" && !!t.lazy));
    const row: URow = { ...t.row, depth: depth + ((t as TNode & { indent?: number }).indent ?? 0), parent: hasKids, open };
    if (grey && (t.row.kind === "node" || t.row.kind === "sub") && !presentOf(t)) row.absent = true;
    if (t.row.kind === "dim" || (t.row.kind === "group" && !t.row.id)) {
      const c = counts(t);
      row.count = b.opts.sync3d ? `${c.present} / ${c.all}` : String(c.all);
    }
    out.push(row);
    if (!open) return;
    const ks = kidsOf(t);
    if (hasKids && !ks.length && (t.row.kind === "dim" || t.row.kind === "graph")) {
      out.push({ key: `${t.row.key}|empty`, kind: "empty", depth: depth + 1, label: b.texts.empty, parent: false, open: false });
      return;
    }
    for (const c of ks) walk(c, row.depth + 1);
  };
  for (const s of sourceNodes(b)) walk(s, 0);
  if (!b.sources.length && b.texts.noSources)
    out.push({ key: "none", kind: "empty", depth: 0, label: b.texts.noSources, parent: false, open: false });
  return out;
}

/** The keys to open so that the rows of a node are drawn (a pick elsewhere). */
export function opensForNode(b: BuildIn, nodeId: string): string[] {
  const path: TNode[] = [];
  const found: TNode[][] = [];
  const visit = (t: TNode): void => {
    path.push(t);
    if (t.row.id === nodeId && (t.row.kind === "node" || t.row.kind === "sub")) found.push([...path]);
    // only the active graph is searched (the others are not read until opened)
    const kids = t.kids ?? (t.lazy && (t.row.kind !== "graph" || t.row.active) ? (t.kids = t.lazy()) : []);
    for (const c of kids) visit(c);
    path.pop();
  };
  for (const s of sourceNodes(b)) visit(s);
  const first = found[0];
  if (!first) return [];
  const out: string[] = [];
  for (const t of first.slice(0, -1)) {
    const open = (t.def ?? false) !== b.toggled.has(t.row.key);
    if (!open) out.push(t.row.key);
  }
  return out;
}
