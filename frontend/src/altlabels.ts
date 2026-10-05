/**
 * A1 · the ALTERNATIVE LABELS of a unit, each with its source (5 Oct 2026).
 *
 * The unit keeps its own label (area.settore.tipoNumero, unique); every other
 * label a source gives it — a numbering of another excavation, of a thesis —
 * is a PropertyNode of quale `alternative_label` (s3Dgraphy `labels.py`,
 * em_qualia_types 1.6.7): one per label, `data.value` the label, `data.scheme`
 * the numbering, its source the ordinary chain property → has_data_provenance
 * → extractor (→ combiner → extractors) → extracted_from → document.
 *
 * Pure: read by the Inspector («Also known as»), the search and the outliner.
 */
import type { EmDocument, EmNode } from "./types";

export const ALTERNATIVE_LABEL = "alternative_label";

export interface AltLabel {
  propertyId: string;
  label: string;
  scheme: string;
  sources: Array<{ id: string; name: string }>;
}

type Edge = { source: string; target: string; edge_type: string };
type GraphLike = { nodes: EmNode[]; edges?: Edge[] };

const str = (v: unknown): string => (v == null ? "" : String(v));
const dataOf = (n: EmNode): Record<string, unknown> => (n.data ?? {}) as Record<string, unknown>;

/** Is this PropertyNode an alternative label? */
export function isAltLabel(n: EmNode | undefined | null): boolean {
  if (!n || n.node_type !== "property") return false;
  const d = dataOf(n);
  return str(d.property_type || (n as Record<string, unknown>).property_type || n.name) === ALTERNATIVE_LABEL;
}

/** The label a PropertyNode carries. */
export function altLabelText(n: EmNode): string {
  const d = dataOf(n);
  return str((n as Record<string, unknown>).value ?? d.value ?? n.description).trim();
}

/** The alternative labels of `nodeId`, in the order of the graph. */
export function altLabelsOf(graph: GraphLike, nodeId: string): AltLabel[] {
  const edges = graph.edges ?? [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out: AltLabel[] = [];
  for (const e of edges) {
    if (e.source !== nodeId || e.edge_type !== "has_property") continue;
    const p = byId.get(e.target);
    if (!p || !isAltLabel(p)) continue;
    const sources: AltLabel["sources"] = [];
    const frontier = edges.filter((x) => x.source === p.id && x.edge_type === "has_data_provenance").map((x) => x.target);
    const seen = new Set<string>();
    while (frontier.length) {
      const id = frontier.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const n = byId.get(id);
      if (n?.node_type === "combiner")
        frontier.push(...edges.filter((x) => x.source === id && x.edge_type === "combines").map((x) => x.target));
      else if (n?.node_type === "extractor")
        for (const x of edges)
          if (x.source === id && x.edge_type === "extracted_from")
            sources.push({ id: x.target, name: str(byId.get(x.target)?.name || x.target) });
    }
    out.push({ propertyId: p.id, label: altLabelText(p), scheme: str(dataOf(p).scheme).trim(), sources });
  }
  return out;
}

/** nodeId → its alternative labels' texts, for a whole document (search). */
export function altLabelIndex(doc: EmDocument | null): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!doc) return out;
  const byId = new Map(doc.graph.nodes.map((n) => [n.id, n as EmNode]));
  for (const e of (doc.graph.edges ?? []) as Edge[]) {
    if (e.edge_type !== "has_property") continue;
    const p = byId.get(e.target);
    if (!p || !isAltLabel(p)) continue;
    out.set(e.source, [...(out.get(e.source) ?? []), altLabelText(p)]);
  }
  return out;
}
