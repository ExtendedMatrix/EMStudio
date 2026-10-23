/**
 * MICRO-SERVSF-FINE-ISTANZE p.3 · the INSTANCES of one object across the epochs
 * — pure (`scripts/check-epoch-instances.mjs`).
 *
 * E.D., 23 Oct 2026: «lo stesso SF si istanzia più volte nel tempo, con
 * coordinate e stato di conservazione diversi per epoca». s3Dgraphy measured
 * that the graph already says it (`spatiotemporal.epoch_instances`, connections
 * 1.6.46 on `changed_from`): the same object in several epochs is an INSTANCE
 * CHAIN — one unit per epoch linked by `changed_from` (or `changed_to`), each a
 * unit with what a unit has: its epochs, its representation models (RM / RMSF)
 * with their own `transform` — the position for that epoch — and its
 * `conservation_state` property. The proxy's GEOMETRY is ONE (the `geometry`
 * property of one instance); every other instance is drawn with it
 * (`geometry_from`: its own, else the nearest in the chain that has one).
 *
 * `epochInstances` is that reader, record for record (the check compares it
 * with s3Dgraphy's on the same documents). Beside s3Dgraphy's fields each
 * record carries what EMStudio needs to WRITE: the conservation property's id,
 * the model that holds the position (the first placement), and the proxy shape
 * — whose `data.transform` is where EMStudio keeps a proxy's pose
 * (MICRO-SPAZIO-3D-2) — when the instance has a geometry of its own.
 *
 * `planInstance` is the minimal gesture «a new instance in an epoch»: the unit,
 * its epoch, the `changed_from` (the newer changed from the older), its state,
 * and a model with only the transform, hatted to the same asset — no geometry
 * is copied.
 */
import type { EmDocument, EmEdge, EmNode } from "./types";

export interface InstancePlacement {
  model: string;
  node_type: string | null;
  transform: Record<string, unknown> | null;
}

export interface EpochInstance {
  id: string;
  name: string;
  node_type: string | null;
  first_epoch: string | null;
  epochs: string[];
  conservation_state: string | null;
  placements: InstancePlacement[];
  /** the id of its own `geometry` property (the proxy), or null */
  geometry: string | null;
  /** the instance whose geometry draws it */
  geometry_from: string | null;
  // ── EMStudio's, beside s3Dgraphy's ──
  /** the `conservation_state` property, to write its value */
  conservation_property: string | null;
  /** the proxy's SemanticShape when the geometry is its own */
  shape: string | null;
}

const RM_EDGES = new Set(["has_representation_model", "has_representation_model_sf"]);
const CHAIN_EDGES = new Set(["changed_from", "changed_to"]);

const goneN = (n: EmNode | undefined): boolean => !!(n?.data as { removed?: unknown } | undefined)?.removed;
const goneE = (e: EmEdge): boolean => !!((e as { attributes?: unknown }).attributes as { removed?: unknown } | undefined)?.removed;

const yearOf = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null || v === "") return null;
  const m = /^\s*(-?\d+(?:\.\d+)?)/.exec(String(v));
  return m ? Number(m[1]) : null;
};

/** a property's value as s3Dgraphy's PropertyNode reads it: data.value, else
 *  the description */
function propValue(p: EmNode): string | null {
  const v = (p.data as Record<string, unknown> | undefined)?.value;
  if (v != null && v !== "") return String(v);
  return p.description != null && p.description !== "" ? String(p.description) : null;
}

/** the ids of the chain a node is in, in s3Dgraphy's walk order */
export function chainOf(doc: EmDocument, nodeId: string): string[] {
  const links = new Map<string, string[]>();
  for (const e of doc.graph.edges) {
    if (!CHAIN_EDGES.has(e.edge_type ?? "") || goneE(e)) continue;
    (links.get(e.source) ?? links.set(e.source, []).get(e.source)!).push(e.target);
    (links.get(e.target) ?? links.set(e.target, []).get(e.target)!).push(e.source);
  }
  const seen: string[] = [];
  const todo = [nodeId];
  while (todo.length) {
    const cur = todo.pop()!;
    if (seen.includes(cur)) continue;
    seen.push(cur);
    for (const x of links.get(cur) ?? []) if (!seen.includes(x)) todo.push(x);
  }
  return seen;
}

/** the chain of `nodeId`, oldest first; [] for an unknown id, a chain of one
 *  for a unit outside any chain */
export function epochInstances(doc: EmDocument, nodeId: string): EpochInstance[] {
  const byId = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  if (!byId.has(nodeId) || goneN(byId.get(nodeId))) return [];
  const edges = doc.graph.edges.filter((e) => !goneE(e));
  const out = (id: string, type: string) => edges.filter((e) => e.source === id && e.edge_type === type);
  const propsOf = (id: string, quale: string): EmNode[] => out(id, "has_property").map((e) => byId.get(e.target))
    .filter((p): p is EmNode => !!p && !goneN(p) && p.node_type === "property"
      && ((p.data as Record<string, unknown> | undefined)?.property_type === quale || p.name === quale));
  const records: EpochInstance[] = chainOf(doc, nodeId).filter((id) => byId.has(id)).map((id) => {
    const node = byId.get(id)!;
    const first = out(id, "has_first_epoch").map((e) => e.target);
    const surv = out(id, "survive_in_epoch").map((e) => e.target);
    const states = propsOf(id, "conservation_state");
    const geoms = propsOf(id, "geometry");
    const placements: InstancePlacement[] = edges.filter((e) => e.source === id && RM_EDGES.has(e.edge_type ?? "")).map((e) => {
      const rm = byId.get(e.target);
      const raw = (rm?.data as Record<string, unknown> | undefined)?.transform;
      return { model: e.target, node_type: rm?.node_type ?? null,
        transform: raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null };
    });
    const shape = geoms.length ? out(geoms[0].id, "has_semantic_shape")[0]?.target ?? null : null;
    return {
      id, name: String(node.name ?? id), node_type: node.node_type ?? null,
      first_epoch: first[0] ?? null, epochs: [...new Set([...first, ...surv])],
      conservation_state: states.length ? propValue(states[0]) : null,
      placements, geometry: geoms[0]?.id ?? null, geometry_from: null,
      conservation_property: states[0]?.id ?? null, shape,
    };
  });
  // oldest first: by the start of the first epoch, units without one last
  // (a stable sort, as Python's)
  const startOf = (ep: string | null): number => {
    if (!ep) return Infinity;
    return yearOf((byId.get(ep)?.data as Record<string, unknown> | undefined)?.start_time) ?? -Infinity;
  };
  records.sort((a, b) => { const x = startOf(a.first_epoch), y = startOf(b.first_epoch); return x < y ? -1 : x > y ? 1 : 0; });
  records.forEach((r, i) => {
    if (r.geometry) { r.geometry_from = r.id; return; }
    let best: [number, number] | null = null;
    records.forEach((o, j) => { if (o.geometry && (!best || Math.abs(j - i) < best[0] || (Math.abs(j - i) === best[0] && j < best[1]))) best = [Math.abs(j - i), j]; });
    r.geometry_from = best ? records[(best as [number, number])[1]].id : null;
  });
  return records;
}

/** the position an instance stands at: the first placement with a transform,
 *  else its own proxy's (`data.transform` of the shape); null = where the file
 *  puts it */
export function instanceTransform(doc: EmDocument, r: EpochInstance): { node: string; transform: Record<string, unknown> } | null {
  for (const p of r.placements) if (p.transform) return { node: p.model, transform: p.transform };
  if (r.shape) {
    const t = (doc.graph.nodes.find((n) => n.id === r.shape)?.data as Record<string, unknown> | undefined)?.transform;
    if (t && typeof t === "object") return { node: r.shape, transform: t as Record<string, unknown> };
  }
  return null;
}

/** the unit types the instance gesture offers: the source's own first, then
 *  the special finds (an SF today, a VSF in its ancient place, an RSF put back) */
export function instanceTypes(sourceType: string): string[] {
  return [...new Set([sourceType, "SF", "VSF", "RSF"])];
}

export interface InstanceRequest {
  /** the instance the new one is linked to (the one the panel is for) */
  from: string;
  /** its first epoch, and the new one's (top epochs) */
  fromEpoch: string | null;
  epoch: string;
  /** the top epochs, OLDEST first */
  chrono: readonly string[];
  node_type: string;
  name: string;
  /** the conservation state, "" = none */
  state: string;
  /** the transform the new model holds (s3Dgraphy's form), null = none */
  transform: Record<string, unknown> | null;
  /** the resource the geometry instance's proxy is drawn from (the same asset) */
  resource: string | null;
}

export interface InstancePlan {
  nodes: Array<{ key: "$unit" | "$state" | "$model"; node: Omit<EmNode, "id"> }>;
  edges: Array<{ source: string; target: string; edge_type: string }>;
}

/** what «a new instance in an epoch» writes: `$unit`, `$state`, `$model` stand
 *  for the nodes born */
export function planInstance(req: InstanceRequest): InstancePlan {
  const nodes: InstancePlan["nodes"] = [
    { key: "$unit", node: { node_type: req.node_type, name: req.name, description: "", data: {} } as Omit<EmNode, "id"> },
  ];
  const edges: InstancePlan["edges"] = [{ source: "$unit", target: req.epoch, edge_type: "has_first_epoch" }];
  // the newer changed from the older (connections 1.6.46: «the same capital as
  // an SF found today, as the USD of its collapse, as a US in its Roman place»)
  const iNew = req.chrono.indexOf(req.epoch), iFrom = req.fromEpoch ? req.chrono.indexOf(req.fromEpoch) : -1;
  if (iFrom >= 0 && iNew < iFrom) edges.push({ source: req.from, target: "$unit", edge_type: "changed_from" });
  else edges.push({ source: "$unit", target: req.from, edge_type: "changed_from" });
  if (req.state.trim()) {
    nodes.push({ key: "$state", node: { node_type: "property", name: "conservation_state", description: req.state.trim(),
      data: { property_type: "conservation_state", value: req.state.trim() } } as Omit<EmNode, "id"> });
    edges.push({ source: "$unit", target: "$state", edge_type: "has_property" });
  }
  // the position: a model with ONLY the transform, hatted to the same asset —
  // an RMSF for a special find (has_representation_model_sf is the SF's), an RM
  // for the others
  if (req.transform) {
    const sf = req.node_type === "SF";
    nodes.push({ key: "$model", node: { node_type: sf ? "representation_model_sf" : "representation_model",
      name: `${req.name}_position`, description: "", data: { transform: req.transform } } as Omit<EmNode, "id"> });
    edges.push({ source: "$unit", target: "$model", edge_type: sf ? "has_representation_model_sf" : "has_representation_model" });
    if (req.resource) edges.push({ source: "$model", target: req.resource, edge_type: "has_linked_resource" });
  }
  return { nodes, edges };
}
