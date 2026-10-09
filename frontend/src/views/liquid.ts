/**
 * G3 · the Graph as a «liquid» picture of discs (MICRO grafo reattivo, 9 Oct
 * 2026 — a FIRST version, to be reviewed with E.D.).
 *
 * The Matrix keeps the EM symbols; the Graph is for seeing the shape of the
 * knowledge, and it draws every node as a DISC:
 *
 *  · the FAMILY gives the colour (not the EM colours: a palette of its own, the
 *    families tell apart at a glance) — real units a full warm disc, virtual
 *    units a dark disc, paradata a light smaller disc, 3D objects a disc for
 *    their glyph, the rest a grey disc;
 *  · the SPECIALISATION gives the rings — SF a thin octagon, USV/s a double
 *    ring, USV/n a dashed ring, VSF dashed and the octagon;
 *  · paradata and 3D objects carry their G9 glyph inside the disc;
 *  · the radius grows with the degree, between a minimum and a maximum;
 *  · epochs and groups are not nodes: they are coloured HALOS behind their
 *    members (and a weak pull that keeps them together in the simulation).
 *
 * The positions come from the force simulation (`force-worker.ts`, G2): live,
 * draggable, stopping by itself when settled — `LiquidSim` below is its client.
 * The layered and radial layouts of `graph.ts` can still place the discs.
 *
 * Every class is read from the datamodel (`rules.ts`), never a list of types.
 */
import type { FoldedView } from "../folding";
import { MEMBERSHIP_EDGES } from "../folding";
import { glyphFor, type Glyph } from "../glyphs";
import { classOf, isGroupType, isParadataType, isStratigraphicType, isVirtualType, isContinuityType, ancestorsOf } from "../rules";
import type { Scene, SceneNode } from "../scene";
import type { EmDocument, EmEdge, EmNode } from "../types";

export type DiscFamily = "real" | "virtual" | "continuity" | "paradata" | "object" | "ornament" | "other";
export type DiscRing = "none" | "octagon" | "double" | "dashed" | "dashed_octagon";

/** What a disc looks like: the family's colour, its rings, its glyph. */
export interface DiscStyle {
  family: DiscFamily;
  ring: DiscRing;
  glyph: Glyph | null;
  /** the radius before the degree: paradata are smaller */
  scale: number;
}

/** The disc a node is drawn as (G3). */
export interface Disc extends DiscStyle {
  r: number;
  degree: number;
}

/** The palette of the families — the Graph's own, light and dark. */
export const FAMILY_COLOR: Record<DiscFamily, { fill: string; dark: string; ink: string }> = {
  real: { fill: "#C8643C", dark: "#D97A52", ink: "#FFFFFF" },
  virtual: { fill: "#2F3640", dark: "#C9D1DB", ink: "#FFFFFF" },
  continuity: { fill: "#111111", dark: "#E8E8E8", ink: "#FFFFFF" },
  paradata: { fill: "#8FA3C7", dark: "#6C7FA6", ink: "#1E2738" },
  object: { fill: "#E0A040", dark: "#C08A30", ink: "#3A2A10" },
  ornament: { fill: "#7FB38A", dark: "#5E8F69", ink: "#1F3A24" },
  other: { fill: "#A7ADB6", dark: "#6B717A", ink: "#2A2E35" },
};

/** The colour of a halo: the epoch's own colour, a group's family hue. */
export const HALO_FALLBACK = "#9AA7B8";

/** A node's disc style, from the datamodel's classes (G3). */
export function discStyle(nodeType: string, data?: Record<string, unknown> | null): DiscStyle {
  const cls = classOf(nodeType);
  const anc = ancestorsOf(nodeType);
  if (isContinuityType(nodeType)) return { family: "continuity", ring: "none", glyph: null, scale: 0.7 };
  if (isStratigraphicType(nodeType)) {
    const special = /SpecialFind/.test(cls);
    if (isVirtualType(nodeType)) {
      // the virtual SPECIAL FIND (VSF): dashed and the octagon; the structural
      // virtual units (USV/s) a double ring; the non-structural (USV/n) dashed
      // the datamodel's classes tell the series apart (Structural / NonStructural);
      // the two single virtual units share one class and differ by their type
      const structural = /USVs$/.test(nodeType) || (/Structural/.test(cls) && !/NonStructural/.test(cls));
      const ring: DiscRing = special ? "dashed_octagon" : structural ? "double" : "dashed";
      return { family: "virtual", ring, glyph: null, scale: 1 };
    }
    return { family: "real", ring: special ? "octagon" : "none", glyph: null, scale: 1 };
  }
  if (isParadataType(nodeType)) return { family: "paradata", ring: "none", glyph: glyphFor(nodeType, data), scale: 0.72 };
  if (anc.includes("AuthorNode") || anc.includes("LicenseNode") || anc.includes("EmbargoNode"))
    return { family: "ornament", ring: "none", glyph: glyphFor(nodeType, data), scale: 0.65 };
  const g = glyphFor(nodeType, data);
  if (anc.includes("RepresentationNode") || (g && !g.key.startsWith("dtc:")))
    return { family: "object", ring: "none", glyph: g, scale: 0.9 };
  return { family: "other", ring: "none", glyph: g, scale: 0.75 };
}

/** The radius from the degree: √ growth between R_MIN and R_MAX. */
export const R_MIN = 7;
export const R_MAX = 30;
export function discRadius(degree: number, scale: number): number {
  return Math.min(R_MAX, Math.max(R_MIN, (R_MIN + 3.2 * Math.sqrt(degree)) * scale));
}

/** A halo: a coloured area behind the members of an epoch or a group. */
export interface Halo {
  id: string;
  label: string;
  color: string;
  kind: "epoch" | "group";
  members: string[];
}

/** The scene's extra: the discs, the halos (the renderer draws them). */
export interface LiquidExtra {
  discs: Map<string, Disc>;
  halos: Halo[];
}

const EPOCH_EDGES = new Set(["has_first_epoch", "survive_in_epoch", "is_in_epoch"]);

/**
 * The Graph's liquid scene: every node but the epochs and the groups, as discs
 * at `pos` (the simulation's positions; a node without one is placed by
 * `seed`); the halos of the epochs and the groups; the edges between discs —
 * membership and epoch edges are the halos now, not lines.
 */
export function buildLiquidScene(
  doc: EmDocument,
  view: FoldedView | undefined,
  pos: Map<string, { x: number; y: number }>,
  seed: (id: string) => { x: number; y: number },
): Scene & { liquid: LiquidExtra } {
  const allNodes = view?.nodes ?? doc.graph.nodes;
  const allEdges = view?.edges ?? doc.graph.edges;
  const isHalo = (n: EmNode): boolean => n.node_type === "EpochNode" || isGroupType(n.node_type);
  const nodes = allNodes.filter((n) => !isHalo(n));
  const ids = new Set(nodes.map((n) => n.id));
  const haloNodes = new Map(allNodes.filter(isHalo).map((n) => [n.id, n]));
  const edges: EmEdge[] = [];
  const degree = new Map<string, number>();
  const members = new Map<string, Set<string>>();
  for (const e of allEdges) {
    const et = e.edge_type ?? "";
    // membership and attribution: the member joins the halo of its group/epoch
    if ((MEMBERSHIP_EDGES.has(et) || EPOCH_EDGES.has(et)) && ids.has(e.source) && haloNodes.has(e.target)) {
      (members.get(e.target) ?? members.set(e.target, new Set()).get(e.target)!).add(e.source);
      continue;
    }
    if (et === "has_paradata_nodegroup" && haloNodes.has(e.target)) continue;
    if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target) continue;
    edges.push(e);
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const discs = new Map<string, Disc>();
  const scene: Scene & { liquid: LiquidExtra } = {
    nodes: [], byId: new Map(), edges: [], lanes: [],
    liquid: { discs, halos: [] },
  };
  for (const n of nodes) {
    const st = discStyle(n.node_type, n.data as Record<string, unknown> | undefined);
    const d = degree.get(n.id) ?? 0;
    const r = discRadius(d, st.scale);
    discs.set(n.id, { ...st, r, degree: d });
    const p = pos.get(n.id) ?? seed(n.id);
    const sn: SceneNode = { id: n.id, x: p.x - r, y: p.y - r, w: 2 * r, h: 2 * r, node: n, badge: view?.badges.get(n.id),
                         // MICRO-BADGE-PD · the group's chip rides on its unit here too
                         adornments: view?.adornments?.get(n.id) };
    scene.nodes.push(sn);
    scene.byId.set(n.id, sn);
  }
  for (const e of edges) scene.edges.push({ source: e.source, target: e.target, edge: e });
  // halos: epochs first (wider), then groups; a halo of one member still shows
  for (const [hid, set] of members) {
    const hn = haloNodes.get(hid)!;
    const isEpoch = hn.node_type === "EpochNode";
    const color = String((hn.data as Record<string, unknown> | undefined)?.color ?? "") || HALO_FALLBACK;
    scene.liquid.halos.push({ id: hid, label: String(hn.name ?? hid), color, kind: isEpoch ? "epoch" : "group", members: [...set] });
  }
  scene.liquid.halos.sort((a, b) => (a.kind === b.kind ? (a.id < b.id ? -1 : 1) : a.kind === "epoch" ? -1 : 1));
  return scene;
}

export function isLiquid(s: Scene | null | undefined): s is Scene & { liquid: LiquidExtra } {
  return !!s && "liquid" in s && !!(s as { liquid?: unknown }).liquid;
}

/**
 * G3 · the «local graph»: the selection and what is N steps from it (1–3),
 * along the drawn edges. Null when off (depth 0) or nothing is selected.
 */
export function localNeighbourhood(scene: Scene, seeds: Iterable<string>, depth: number): Set<string> | null {
  if (depth <= 0) return null;
  const start = [...seeds].filter((id) => scene.byId.has(id));
  if (!start.length) return null;
  const adj = new Map<string, string[]>();
  for (const e of scene.edges) {
    (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(e.target);
    (adj.get(e.target) ?? adj.set(e.target, []).get(e.target)!).push(e.source);
  }
  const seen = new Set(start);
  let frontier = start;
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const u of frontier) for (const v of adj.get(u) ?? []) if (!seen.has(v)) { seen.add(v); next.push(v); }
    frontier = next;
  }
  return seen;
}

/**
 * G3 · the seam for the QUERIES to come (not implemented now): a query is a
 * function that says, for a node, whether it is in its answer. The filters of
 * the panel and the local graph are applied first; a registered query narrows
 * further. `registerGraphQuery(null)` removes it.
 */
export type GraphQuery = (node: EmNode) => boolean;
let activeQuery: GraphQuery | null = null;
export function registerGraphQuery(q: GraphQuery | null): void {
  activeQuery = q;
}
export function graphQuery(): GraphQuery | null {
  return activeQuery;
}

/** The Graph's filter (the panel): which types, which epochs, which text — and
 *  whether what is excluded is dimmed or hidden. */
export interface LiquidFilter {
  epochs: Set<string> | null;
  text: string;
  hide: boolean;
}

/**
 * What a node is under the filter, the local graph and the query: shown,
 * dimmed or hidden.
 */
export function discVisibility(
  n: SceneNode,
  f: LiquidFilter,
  epochOf: (id: string) => string[],
  local: Set<string> | null,
): "show" | "dim" | "hide" {
  let ok = true;
  if (local && !local.has(n.id)) return "hide";
  if (f.epochs && f.epochs.size) {
    const eps = epochOf(n.id);
    if (eps.length && !eps.some((e) => f.epochs!.has(e))) ok = false;
  }
  if (ok && f.text) {
    const q = f.text.toLowerCase();
    const hay = `${n.node.name ?? ""} ${n.node.description ?? ""} ${n.node.node_type}`.toLowerCase();
    if (!hay.includes(q)) ok = false;
  }
  if (ok && activeQuery && !activeQuery(n.node)) ok = false;
  return ok ? "show" : f.hide ? "hide" : "dim";
}

/**
 * G2 · the client of the force simulation. One per graph projection: `start`
 * hands the worker the discs, the edges and the clusters; positions come back
 * into `pos` and `onFrame` asks for a paint; `settled` says it has stopped.
 */
export class LiquidSim {
  readonly pos = new Map<string, { x: number; y: number }>();
  private worker: Worker | null = null;
  private ids: string[] = [];
  private index = new Map<string, number>();
  private key = "";
  settled = false;
  constructor(private onFrame: () => void, private makeWorker: () => Worker | null) {}

  /** (Re)start for a scene; nothing happens when the structure is the same. */
  start(scene: Scene & { liquid: LiquidExtra }): void {
    const key = `${scene.nodes.length}|${scene.edges.length}|${scene.nodes.map((n) => n.id).join(",").length}|` +
      scene.edges.map((e) => e.source + e.target).join("").length;
    if (key === this.key && this.worker) return;
    this.key = key;
    this.ids = scene.nodes.map((n) => n.id);
    this.index = new Map(this.ids.map((id, i) => [id, i]));
    const nodes = new Float64Array(this.ids.length * 3);
    scene.nodes.forEach((n, i) => {
      nodes[3 * i] = n.x + n.w / 2;
      nodes[3 * i + 1] = n.y + n.h / 2;
      nodes[3 * i + 2] = n.w / 2;
    });
    const links: number[] = [];
    for (const e of scene.edges) {
      const a = this.index.get(e.source), b = this.index.get(e.target);
      if (a !== undefined && b !== undefined && a !== b) links.push(a, b);
    }
    const clusters = scene.liquid.halos
      .map((h) => h.members.map((m) => this.index.get(m)).filter((x): x is number => x !== undefined));
    if (!this.worker) {
      this.worker = this.makeWorker();
      if (this.worker) this.worker.onmessage = (ev) => this.receive(ev.data);
    }
    this.settled = false;
    // a structure seen before restarts warm: the discs are already where they go
    const warm = scene.nodes.every((n) => this.pos.has(n.id));
    this.worker?.postMessage({ type: "init", nodes, links: Int32Array.from(links), clusters, alpha: warm ? 0.3 : 1 });
  }

  private receive(m: { type: string; xy?: Float64Array }): void {
    if (m.type === "pos" && m.xy) {
      for (let i = 0; i < this.ids.length; i++) this.pos.set(this.ids[i], { x: m.xy[2 * i], y: m.xy[2 * i + 1] });
      this.onFrame();
    } else if (m.type === "settled") {
      this.settled = true;
      this.onFrame();
    }
  }

  drag(id: string, x: number, y: number): void {
    const i = this.index.get(id);
    if (i === undefined) return;
    this.pos.set(id, { x, y });
    this.settled = false;
    this.worker?.postMessage({ type: "drag", i, x, y });
  }

  release(id: string): void {
    const i = this.index.get(id);
    if (i !== undefined) this.worker?.postMessage({ type: "release", i });
  }

  reheat(alpha = 0.5): void {
    this.settled = false;
    this.worker?.postMessage({ type: "reheat", alpha });
  }

  stop(): void {
    this.worker?.postMessage({ type: "stop" });
  }
}
