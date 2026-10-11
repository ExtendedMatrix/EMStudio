/**
 * THE RAPPORTI BETWEEN THE GRAPHS OF ONE em.json — read. Pure.
 *
 * E.D., 11 Oct 2026 («i rapporti tra saggi vanno conservati, in modo
 * elegante»): an edge may point at a unit of ANOTHER graph of the same file,
 * by the address «graph → node». s3dgraphy writes it as a LINK of the graph
 * of its source (`s3dgraphy.links`), next to its edges:
 *
 *     graphs.<id>.links: [{ id, edge_type, source: "<node here>",
 *                           target: { graph_id, node_id }, attributes? }]
 *
 * An edge still joins two nodes of one graph. EMStudio keeps the key as it
 * came (the section travels whole through `parseContainer`/`buildContainer`)
 * and reads it here, both ways, with the address to navigate to.
 * `scripts/check-codice-stabile.mjs` keeps `linksOf` equal to s3dgraphy's
 * `links_of`.
 */

import type { EmDocument } from "./types";

export interface LinkAddress { graph_id: string; node_id: string }

export interface GraphLink {
  id: string;
  edge_type: string;
  source: string;
  target: LinkAddress;
  attributes?: Record<string, unknown>;
}

/** One rapporto as seen from a graph — s3dgraphy's `links_of` entry. */
export interface LinkView {
  id: string;
  edge_type: string;
  source: LinkAddress;
  target: LinkAddress;
  direction: "out" | "in";
  /** the end in the OTHER graph: where a click goes */
  other: LinkAddress;
  /** whether that end is in the documents given */
  resolved: boolean;
}

const text = (v: unknown): string => (v == null ? "" : String(v).trim());

/** The links a graph writes (its outgoing ones), the malformed ones left out
 *  (s3dgraphy's `normalise_link`). */
export function linksOfGraph(doc: EmDocument | null | undefined): GraphLink[] {
  const raw = (doc?.graph as Record<string, unknown> | undefined)?.links;
  if (!Array.isArray(raw)) return [];
  const out: GraphLink[] = [];
  for (const l of raw) {
    if (!l || typeof l !== "object") continue;
    const r = l as Record<string, unknown>;
    const tgt = (r.target ?? {}) as Record<string, unknown>;
    const tg = text(tgt.graph_id), tn = text(tgt.node_id);
    const src = text(r.source), et = text(r.edge_type);
    if (!(tg && tn && src && et)) continue;
    out.push({ id: text(r.id) || `${src}__${et}__${tg}::${tn}`, edge_type: et,
               source: src, target: { graph_id: tg, node_id: tn },
               ...(r.attributes && typeof r.attributes === "object"
                 ? { attributes: r.attributes as Record<string, unknown> } : {}) });
  }
  return out;
}

/** The graphs of one file, by graph id. */
export type GraphDocs = Array<{ graphId: string; doc: EmDocument }>;

/** The node at an address, or undefined. */
export function resolveAddress(graphs: GraphDocs, addr: LinkAddress) {
  const g = graphs.find((x) => x.graphId === addr.graph_id);
  return g?.doc.graph.nodes.find((n) => n.id === addr.node_id);
}

/** Every rapporto that touches `graphId` (or one node of it), both ways —
 *  s3dgraphy's `links_of`. */
export function linksOf(graphs: GraphDocs, graphId: string, nodeId?: string): LinkView[] {
  const found: LinkView[] = [];
  for (const { graphId: gid, doc } of graphs) {
    for (const link of linksOfGraph(doc)) {
      const src: LinkAddress = { graph_id: gid, node_id: link.source };
      const tgt = link.target;
      let direction: "out" | "in";
      let other: LinkAddress;
      if (gid === graphId && (nodeId === undefined || src.node_id === nodeId)) {
        direction = "out"; other = tgt;
      } else if (tgt.graph_id === graphId && (nodeId === undefined || tgt.node_id === nodeId)) {
        direction = "in"; other = src;
      } else continue;
      found.push({ id: link.id, edge_type: link.edge_type, source: src, target: { ...tgt },
                   direction, other: { ...other },
                   resolved: !!resolveAddress(graphs, other) });
    }
  }
  return found;
}

/** The other graphs `graphId` has rapporti with — s3dgraphy's `linked_graphs`. */
export function linkedGraphs(graphs: GraphDocs, graphId: string): string[] {
  const seen: string[] = [];
  for (const l of linksOf(graphs, graphId)) {
    if (l.other.graph_id !== graphId && !seen.includes(l.other.graph_id)) seen.push(l.other.graph_id);
  }
  return seen;
}
