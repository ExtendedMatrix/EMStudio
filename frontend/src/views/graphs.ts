// MICRO-AUTORI-LAYOUT · part 5: the MULTIGRAPH view (E.D., 11 Oct 2026). Every
// graph open in the workspace is ONE node (`graph`), with its own paradata
// attached — the members of its «Graph paradata» group (authors, licence,
// embargo) and the properties of the graph itself (its date) — and the graphs
// joined by the rapporti the datamodel already has between them: the LINKS of
// s3dgraphy (`graphs.<id>.links`, «I-4»: an edge from a unit here to a unit of
// another graph of the same file), one line per pair of graphs and edge type,
// the count in its label. There is no edge from a graph to a graph in the
// datamodel (connections 1.6.40): none is invented here.
//
// Pure: the documents in, a document out (the nodes keep their ids, so a click
// reaches the real node in its own graph). Nothing is written.
import { linksOfGraph } from "../links";
import type { EmDocument, EmEdge, EmNode } from "../types";

export interface GraphsInput {
  /** the slot (the workspace's graph) */
  slotId: string;
  graphId: string;
  /** the name the workspace shows (name and code) */
  label: string;
  doc: EmDocument;
}

/** the edge a graph's paradata member hangs from its graph by */
const HANG: Record<string, string> = {
  author: "has_author",
  author_ai: "has_author",
  license: "has_license",
  embargo: "has_embargo",
  property: "has_property",
};

export interface GraphsDoc {
  doc: EmDocument;
  /** view node id → the slot whose graph holds it */
  slotOf: Map<string, string>;
  /** view node id → the node's id in its own graph (two copies of one graph —
   *  v2 and v3.2 of the same study — share ids: the second is renamed here) */
  realOf: Map<string, string>;
  /** graph id → its node in the view (the first graph with that id) */
  rootOf: Map<string, string>;
}

const rootIdOf = (g: GraphsInput): string => {
  const root = g.doc.graph.nodes.find((n) => n.node_type === "graph");
  return root?.id ?? `${g.graphId}_graphroot`;
};

export function buildGraphsDoc(graphs: GraphsInput[]): GraphsDoc {
  const nodes: EmNode[] = [];
  const edges: EmEdge[] = [];
  const slotOf = new Map<string, string>();
  const realOf = new Map<string, string>();
  const rootOf = new Map<string, string>();
  const rootOfSlot = new Map<string, string>();
  for (const g of graphs) {
    const local = new Map<string, string>();
    const vid = (id: string): string => {
      let v = local.get(id);
      if (!v) {
        v = slotOf.has(id) ? `${g.slotId}::${id}` : id;
        local.set(id, v);
      }
      return v;
    };
    const add = (n: EmNode): string => {
      const v = vid(n.id);
      if (!slotOf.has(v)) {
        nodes.push({ ...n, id: v });
        slotOf.set(v, g.slotId);
        realOf.set(v, n.id);
      }
      return v;
    };
    const rootId = rootIdOf(g);
    const root = g.doc.graph.nodes.find((n) => n.id === rootId);
    const rv = add({ ...(root ?? {}), id: rootId, node_type: "graph", name: g.label,
                     data: { ...((root?.data ?? {}) as Record<string, unknown>), graph_id: g.graphId } } as EmNode);
    if (!rootOf.has(g.graphId)) rootOf.set(g.graphId, rv);
    rootOfSlot.set(g.slotId, rv);
    const byId = new Map(g.doc.graph.nodes.map((n) => [n.id, n]));
    // the «Graph paradata» group of this graph: the target of the root's
    // has_paradata_nodegroup, and its members; and what hangs from the root
    const groups = new Set(g.doc.graph.edges
      .filter((e) => e.source === rootId && e.edge_type === "has_paradata_nodegroup").map((e) => e.target));
    const hung = new Set<string>();
    for (const e of g.doc.graph.edges) {
      const member = groups.has(e.target) && e.edge_type === "is_in_paradata_nodegroup" ? e.source
        : e.source === rootId && Object.values(HANG).includes(e.edge_type ?? "") ? e.target : null;
      if (!member || hung.has(member)) continue;
      const m = byId.get(member);
      if (!m) continue;
      hung.add(member);
      const mv = add(m);
      edges.push({ id: `graphs:${rv}:${mv}`, source: rv, target: mv,
                   edge_type: HANG[m.node_type] ?? "generic_connection" });
    }
  }
  // the rapporti between graphs: one line per (graph, graph, edge type)
  const count = new Map<string, number>();
  for (const g of graphs) {
    const from = rootOfSlot.get(g.slotId)!;
    for (const l of linksOfGraph(g.doc)) {
      const to = rootOf.get(l.target.graph_id);
      if (!to || to === from) continue;
      const k = `${from}|${to}|${l.edge_type}`;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  for (const [k, n] of count) {
    const [source, target, edge_type] = k.split("|");
    edges.push({ id: `graphs:link:${k}`, source, target, edge_type,
                 attributes: { label: `${edge_type} × ${n}`, links: n } });
  }
  return { doc: { graph: { graph_id: "graphs", name: "Multigraph", nodes, edges } } as EmDocument, slotOf, realOf, rootOf };
}
