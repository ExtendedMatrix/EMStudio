/**
 * MICRO-LAB orizzonti come bande · THE HORIZONS IN PLACE OF THE EPOCHS.
 *
 * E.D. (25 Oct 2026): «gli orizzonti si vedono come si vedono le epoche: al
 * posto delle epoche». A Matrix window switched to horizons draws the horizons
 * of the chosen periodization as its swimlanes, and every graph of the em.json
 * that is switched on is laid out in those SAME bands — the horizons are the
 * measure the graphs share, each graph keeping its own epochs for itself.
 *
 * This module builds the projection, and only that (pure: no DOM, no store):
 *
 *  · one compound graph, the union of the graphs switched on, WITHOUT their
 *    epochs (nor the edges that put a unit in an epoch) and WITH one synthetic
 *    EpochNode per visible horizon, so the layout engine (em-core, invariant 2)
 *    lays the units out in the bands exactly as it lays them out in epochs —
 *    arrows down, groups as containers, determinism;
 *  · `has_first_epoch` from each dated node to the band it is placed in. The
 *    rule (the overlap, `horizons.overlaps`, already decided): a unit is IN an
 *    horizon when its interval intersects it. Where it falls in several, it is
 *    DRAWN in the OLDEST of them — the band where its life begins, as a unit
 *    stands in its `has_first_epoch` — and the others are listed (`also`), for
 *    the tooltip and the count;
 *  · two more bands, at the bottom, only when they hold something: what is
 *    dated but outside every visible horizon, and what has no date at all;
 *  · ids: a node keeps its own id unless two graphs switched on share it (a
 *    graph opened twice, two copies of one study): then, in every graph, it is
 *    `<slot>␟<id>`. `slotOf` / `realOf` / `sceneOf` translate both ways, so a
 *    selection or an edit reaches the graph the node belongs to (`graph_id`).
 *
 * The intervals are s3Dgraphy's (`Graph.chronology()` through the bridge), one
 * map per graph: nothing is computed here.
 */
import { overlaps, type Horizon, type Interval, type Periodization } from "./horizons";
import type { EpochSummary, Space, SpaceEpoch } from "./space";
import type { EmEdge, EmNode } from "./types";

/** the window's state keys (`win.state["current.<key>"]`, like the lens) */
export const BANDS_KEY = "lens.bands";
export const BANDS_PER_KEY = "lens.bands.per";
export const BANDS_OFF_KEY = "lens.bands.off";
export type Bands = "epochs" | "horizons";

/** the lanes of the projection: `hz:<horizon id>`, and the two bands of the rest */
export const HZ_LANE = "hz:";
export const OUTSIDE_BAND = "hz:~outside";
export const UNDATED_BAND = "hz:~undated";
/** the separator of a namespaced id (U+241F, never in an id) */
export const SEP = "␟";

/** the edges that put a unit in an EPOCH (space.ts `EPOCH_LINKS`, + the phases) */
export const EPOCH_EDGES: ReadonlySet<string> = new Set(
  ["has_first_epoch", "survive_in_epoch", "is_in_epoch", "has_sub_epoch"]);
const isEpochType = (t: string | undefined): boolean => t === "EpochNode" || t === "epoch";

export type BandKind = "horizon" | "outside" | "undated";
export interface Band {
  id: string;
  name: string;
  start: number | null;
  end: number | null;
  color: string;
  kind: BandKind;
}

export interface BandGraphInput {
  /** the slot (the open graph) — the key every translation uses */
  key: string;
  label: string;
  nodes: EmNode[];
  edges: EmEdge[];
  /** s3Dgraphy's intervals for this graph (units, documents, authors, epochs) */
  intervals: Map<string, Interval>;
  /** MICRO-LAB bande-2 · the groups this graph keeps closed (its
   *  `layout.folded_groups`): closed in the bands as in its epochs */
  folded?: readonly string[];
}

export interface Placement {
  band: string;
  /** the other visible horizons its interval overlaps */
  also: string[];
}

export interface HorizonProjection {
  graph: { graph_id: string; name: string; nodes: EmNode[]; edges: EmEdge[] };
  /** MICRO-LAB bande-2 · what em-core lays out: only what the Matrix draws as
   *  a box (as `refreshMatrixViewLayout` for the epochs) — not a closed
   *  paradata group (a «PD» tablet on its unit, `tablets`), not an epoch's
   *  paradata (the lane's tag: here, with no epoch, an orphan) */
  layoutGraph: { graph_id: string; name: string; nodes: EmNode[]; edges: EmEdge[] };
  /** the groups closed, in projection ids (every graph's own) */
  folded: string[];
  /** a closed paradata group → the unit its tablet sits on */
  tablets: Map<string, string>;
  bands: Band[];
  slotOf: Map<string, string>;
  realOf: Map<string, string>;
  /** `${slot}${SEP}${raw}` → the id in the projection */
  sceneOf: Map<string, string>;
  placed: Map<string, Placement>;
  /** band id → nodes drawn in it */
  counts: Map<string, number>;
  /** slot → its tint (the small tab on its nodes, the chip in the bar) */
  tintOf: Map<string, string>;
}

/** Tints of the graphs: muted, away from the EM unit colours (white, red,
 *  blue-greys of the virtual units), told apart by hue. */
export const GRAPH_TINTS = ["#2f6fb0", "#b0602f", "#2f9a62", "#8a3fb0", "#9a8a1f", "#1f8f9a", "#b02f6a"];

/** Where an interval is drawn among the visible horizons (see the header). */
export function bandOf(iv: Interval | undefined, visible: readonly Horizon[]): Placement {
  if (!iv || (iv[0] === null && iv[1] === null)) return { band: UNDATED_BAND, also: [] };
  const hits = visible.filter((h) => overlaps(iv, [h.start, h.end]));
  if (!hits.length) return { band: OUTSIDE_BAND, also: [] };
  const byTime = [...hits].sort((a, b) => (a.start ?? -Infinity) - (b.start ?? -Infinity)
    || (a.end ?? Infinity) - (b.end ?? Infinity) || a.order - b.order);
  return { band: HZ_LANE + byTime[0].id, also: byTime.slice(1).map((h) => h.id) };
}

/** The visible horizons of a periodization, newest first (the lane order). */
export function visibleHorizons(per: Periodization | null, hidden: ReadonlySet<string>): Horizon[] {
  return (per?.horizons ?? []).filter((h) => !hidden.has(h.id))
    .sort((a, b) => (b.start ?? -Infinity) - (a.start ?? -Infinity) || a.order - b.order);
}

export function projectByHorizons(
  inputs: readonly BandGraphInput[],
  per: Periodization | null,
  hidden: ReadonlySet<string>,
  opts: {
    /** the names of the two bands of the rest (translated by the caller) */
    outsideName: string;
    undatedName: string;
    /** nodes the projection leaves out (the continuity nodes: an epoch's) */
    drop?: (n: EmNode) => boolean;
  },
): HorizonProjection {
  const visible = visibleHorizons(per, hidden);
  // ids shared by two graphs switched on → namespaced in every graph
  const seen = new Map<string, number>();
  for (const g of inputs) for (const n of g.nodes) seen.set(n.id, (seen.get(n.id) ?? 0) + 1);
  const shared = (id: string): boolean => (seen.get(id) ?? 0) > 1;
  const out: HorizonProjection = {
    graph: { graph_id: "horizons", name: per?.name ?? "", nodes: [], edges: [] },
    layoutGraph: { graph_id: "horizons", name: per?.name ?? "", nodes: [], edges: [] },
    folded: [], tablets: new Map(),
    bands: [], slotOf: new Map(), realOf: new Map(), sceneOf: new Map(),
    placed: new Map(), counts: new Map(), tintOf: new Map(),
  };
  const bandNodes: EmNode[] = [];
  const unitNodes: EmNode[] = [];
  const edges: EmEdge[] = [];
  const firstEdges: EmEdge[] = [];
  const undrawn = new Set<string>();
  inputs.forEach((g, gi) => {
    out.tintOf.set(g.key, GRAPH_TINTS[gi % GRAPH_TINTS.length]);
    const idOf = new Map<string, string>();
    for (const n of g.nodes) {
      if (isEpochType(n.node_type) || opts.drop?.(n)) continue;
      const sid = shared(n.id) ? `${g.key}${SEP}${n.id}` : n.id;
      idOf.set(n.id, sid);
      out.slotOf.set(sid, g.key);
      out.realOf.set(sid, n.id);
      out.sceneOf.set(`${g.key}${SEP}${n.id}`, sid);
      unitNodes.push(sid === n.id ? n : { ...n, id: sid });
      const iv = g.intervals.get(n.id);
      if (!iv) continue;           // not dated by s3Dgraphy: follows its chain / group
      const p = bandOf(iv, visible);
      out.placed.set(sid, p);
      out.counts.set(p.band, (out.counts.get(p.band) ?? 0) + 1);
      firstEdges.push({ id: `${sid}${SEP}band`, edge_type: "has_first_epoch", source: sid, target: p.band } as EmEdge);
    }
    for (const e of g.edges) {
      if (EPOCH_EDGES.has(e.edge_type ?? "")) continue;
      const s = idOf.get(e.source), t = idOf.get(e.target);
      if (!s || !t) continue;
      const renamed = s !== e.source || t !== e.target;
      edges.push(renamed ? { ...e, id: `${g.key}${SEP}${e.id ?? `${e.source}|${e.edge_type}|${e.target}`}`, source: s, target: t } : e);
    }
    // what the Matrix does not draw as a box (views/matrix.ts, the same rules):
    // a paradata group nobody holds (an epoch's: the epoch is not here) and its
    // members; a CLOSED paradata group with a unit — its tablet
    const folded = new Set(g.folded ?? []);
    for (const f of folded) { const sid = idOf.get(f); if (sid) out.folded.push(sid); }
    const typeOf = new Map(g.nodes.map((n) => [n.id, n.node_type]));
    const referent = new Map<string, string>();
    const pdMembers = new Map<string, string[]>();
    for (const e of g.edges) {
      if (e.edge_type === "has_paradata_nodegroup" && idOf.has(e.source)) referent.set(e.target, e.source);
      if (e.edge_type === "is_in_paradata_nodegroup")
        (pdMembers.get(e.target) ?? pdMembers.set(e.target, []).get(e.target)!).push(e.source);
    }
    for (const n of g.nodes) {
      if (n.node_type !== "ParadataNodeGroup" || !idOf.has(n.id)) continue;
      const ref = referent.get(n.id);
      if (!ref) {
        undrawn.add(idOf.get(n.id)!);
        for (const m of pdMembers.get(n.id) ?? []) if (idOf.has(m) && typeOf.get(m) !== "ParadataNodeGroup") undrawn.add(idOf.get(m)!);
      } else if (folded.has(n.id)) {
        undrawn.add(idOf.get(n.id)!);
        out.tablets.set(idOf.get(n.id)!, idOf.get(ref)!);
      }
    }
  });
  // the bands: the visible horizons newest first, then the two of the rest
  // (declared last and undated, so em-core keeps them at the bottom)
  for (const h of visible) {
    const id = HZ_LANE + h.id;
    out.bands.push({ id, name: h.name, start: h.start, end: h.end, color: h.color, kind: "horizon" });
    bandNodes.push({ id, node_type: "EpochNode", name: h.name, description: "",
                     data: { start_time: h.start, end_time: h.end, color: h.color } } as EmNode);
  }
  for (const [id, name, kind] of [[OUTSIDE_BAND, opts.outsideName, "outside"],
                                  [UNDATED_BAND, opts.undatedName, "undated"]] as const) {
    if (!out.counts.get(id)) continue;
    out.bands.push({ id, name, start: null, end: null, color: "", kind });
    bandNodes.push({ id, node_type: "EpochNode", name, description: "", data: {} } as EmNode);
  }
  out.graph.nodes = [...bandNodes, ...unitNodes];
  out.graph.edges = [...edges, ...firstEdges];
  out.layoutGraph.nodes = out.graph.nodes.filter((n) => !undrawn.has(n.id));
  out.layoutGraph.edges = out.graph.edges.filter((e) => !undrawn.has(e.source) && !undrawn.has(e.target));
  return out;
}

/**
 * The Scena 3D read by horizons: the same Space with the horizons IN PLACE of
 * its epochs. Where the scene shows «the representation models and the proxies
 * of an epoch», it shows those of an horizon:
 *
 *  · the units whose interval overlaps it (s3Dgraphy's `chronology()`; a unit
 *    it does not date counts in the horizons its epochs overlap);
 *  · the models of the epochs whose effective interval overlaps it
 *    (`epoch_intervals()`, else the epoch's own bounds).
 *
 * Every list of the summary (with proxy, missing, refused…) is the epochs'
 * lists united and kept to those units. Pure, like the rest of this module.
 */
export function horizonSpace(base: Space, per: Periodization | null, hidden: ReadonlySet<string>,
                             unitIv: Map<string, Interval>, epochIv: Map<string, Interval>,
                             opts: { outsideName?: string } = {}): Space {
  const visible = visibleHorizons(per, hidden);
  const epochs: SpaceEpoch[] = visible.map((h) => ({ id: HZ_LANE + h.id, name: h.name, start: h.start, end: h.end }));
  const ivOf = (e: SpaceEpoch): Interval => epochIv.get(e.id) ?? [e.start, e.end];
  const dated = (iv: Interval | undefined): iv is Interval => !!iv && (iv[0] !== null || iv[1] !== null);
  // MICRO-LAB bande-2 · «outside the visible horizons», as the Matrix's band:
  // what is dated and overlaps none of them (CronoFilter leaves 160–500 AD
  // uncovered, where the whole Temple of GT16 lives: lab.3's scene showed none
  // of its 87 models in any horizon)
  const nowhere = (iv: Interval): boolean => !visible.some((h) => overlaps(iv, [h.start, h.end]));
  const memo = new Map<string, EpochSummary | null>();
  const raw = (id: string): EpochSummary | null => {
    if (memo.has(id)) return memo.get(id)!;
    const h = visible.find((x) => HZ_LANE + x.id === id);
    const ep = id === OUTSIDE_BAND ? { id, name: opts.outsideName ?? id, start: null, end: null }
      : epochs.find((e) => e.id === id);
    if ((!h && id !== OUTSIDE_BAND) || !ep) return null;
    // (an horizon: as lab.3; outside: only what is dated)
    const hit = (iv: Interval): boolean => (h ? overlaps(iv, [h.start, h.end]) : dated(iv) && nowhere(iv));
    const sums = base.epochs.map((e) => ({ e, s: base.summary(e.id) }))
      .filter((x): x is { e: SpaceEpoch; s: EpochSummary } => !!x.s);
    const epochsHit = new Set(sums.filter((x) => hit(ivOf(x.e))).map((x) => x.e.id));
    const unitEpochs = new Map<string, string[]>();
    for (const { e, s } of sums) for (const u of s.units) (unitEpochs.get(u) ?? unitEpochs.set(u, []).get(u)!).push(e.id);
    const inside = (u: string): boolean => {
      const iv = unitIv.get(u);
      if (dated(iv)) return hit(iv);
      return (unitEpochs.get(u) ?? []).some((e) => epochsHit.has(e));
    };
    const units = [...unitEpochs.keys()].filter(inside);
    const keep = new Set(units);
    const union = (pick: (s: EpochSummary) => string[]): string[] =>
      [...new Set(sums.flatMap((x) => pick(x.s)))].filter((u) => keep.has(u));
    const rmSeen = new Set<string>();
    const rms = sums.filter((x) => epochsHit.has(x.e.id)).flatMap((x) => x.s.rms)
      .filter((r) => !rmSeen.has(r.id) && !!rmSeen.add(r.id));
    const rmIds = new Set(rms.map((r) => r.id));
    const out: EpochSummary = {
      epoch: ep, rms, units,
      withProxy: union((s) => s.withProxy), inScene: union((s) => s.inScene), without: union((s) => s.without),
      missing: union((s) => s.missing), refused: union((s) => s.refused), reference: union((s) => s.reference),
      rmMissing: [...new Set(sums.flatMap((x) => x.s.rmMissing))].filter((r) => rmIds.has(r)),
      rmReference: [...new Set(sums.flatMap((x) => x.s.rmReference))].filter((r) => rmIds.has(r)),
    };
    memo.set(id, out);
    return out;
  };
  // MICRO-LAB bande-2 · a model's `epochs` ARE its horizons here: every
  // horizon its epochs' dates overlap (creation, survivals, its container's
  // epochs), as many as they are — what the scene, the «show in 3D», the
  // alternatives and the «Modelli e proxy» sheet read
  const out0 = opts.outsideName ? raw(OUTSIDE_BAND) : null;
  if (out0 && (out0.units.length || out0.rms.length)) epochs.push(out0.epoch);
  const hzOfRm = new Map<string, string[]>();
  for (const e of epochs) for (const r of raw(e.id)?.rms ?? [])
    (hzOfRm.get(r.id) ?? hzOfRm.set(r.id, []).get(r.id)!).push(e.id);
  const rms = base.rms.map((r) => ({ ...r, epochs: hzOfRm.get(r.id) ?? [] }));
  const rmById = new Map(rms.map((r) => [r.id, r]));
  const done = new Map<string, EpochSummary | null>();
  const summary = (id: string): EpochSummary | null => {
    if (done.has(id)) return done.get(id)!;
    const r0 = raw(id);
    const out = r0 ? { ...r0, rms: r0.rms.map((r) => rmById.get(r.id) ?? r) } : null;
    done.set(id, out);
    return out;
  };
  return { ...base, epochs, rms, summary, topOf: (id: string) => (id.startsWith(HZ_LANE) ? id : base.topOf(id)) };
}
