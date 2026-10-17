/**
 * MICRO-SPAZIO-3D p.4 · a sketch becomes a unit's PROXY — the parts that are
 * rules, pure (`scripts/check-space-associate.mjs`).
 *
 * EM Tools' rule, measured in the Heriverse report of 6 Oct 2026: the glb at
 * `proxies/<unit name>.glb`, relative to the project's folder, Y-up; the chain
 * property `geometry` → `has_semantic_shape` → SemanticShape →
 * `has_linked_resource` → a `proxy_model` resource, written by s3Dgraphy's
 * `create_geometry_proxy` (through the bridge: the ids are the library's). What
 * EMStudio adds is what it knows and the library does not: the file is THERE —
 * its digest, resident, its media type and size — so the Space draws it at once,
 * from the folder or from the room's store by digest.
 */
import type { EmNode } from "./types";

/** A file name from a unit's name: what a file system takes, nothing else. */
export function proxyFileName(name: string): string {
  return (name.trim() || "proxy").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_");
}

/** `proxies/<unit>.glb`, relative to the em.json's folder. */
export function proxyRelPath(unitName: string): string {
  return `proxies/${proxyFileName(unitName)}.glb`;
}

/** The nodes the library returned, the proxy's resource told that its file is
 *  there: `checksum` sha256, `residency` resident, glb, its size. MICRO-SPAZIO-
 *  3D-2 · `transform` (the `data.transform` of `transform3d.ts`) goes on the
 *  SemanticShape: the glb holds the shape in its own frame, the pose is apart. */
export function patchProxyNodes(nodes: EmNode[], rel: string, sha256hex: string, size: number,
                                transform?: Record<string, unknown>): EmNode[] {
  return nodes.map((n) => {
    const d = (n.data ?? {}) as Record<string, unknown>;
    if (transform && n.node_type === "semantic_shape") return { ...n, data: { ...d, transform } };
    if (n.node_type !== "resource" || d.url_type !== "proxy_model") return n;
    return { ...n, data: { ...d, url: rel, checksum: `sha256:${sha256hex}`, residency: "resident",
      media_type: "model/gltf-binary", size_bytes: size } };
  });
}

// ── MICRO-PROVA-DEV47 p.5 · a proxy taken away, and a unit told in brief ─────

interface GraphLike { nodes: EmNode[]; edges: Array<{ id?: string; source: string; target: string; edge_type: string }> }

export interface ProxyParts {
  /** the `geometry` properties, their SemanticShapes, the shapes' resources */
  propertyIds: string[];
  shapeIds: string[];
  resourceIds: string[];
  /** the files those resources name (they stay on disk, in the store) */
  files: string[];
  /** a proxy EM Tools wrote (its resource without the digest's company EMStudio
   *  gives its own: `media_type` and `size_bytes`) — asked with its own words */
  fromEmTools: boolean;
}

/**
 * What «Elimina il proxy» takes away, and only that: the unit's `geometry`
 * properties that hold a SemanticShape, the shapes, and the shapes' proxy
 * resources no other shape links (the edges go with their nodes). The unit
 * stays, and the files: a glb in `proxies/` is left as an orphan asset (the
 * rule of the rooms of 16 Oct: the bytes are never taken away with the graph).
 */
export function proxyPartsOf(g: GraphLike, unitId: string): ProxyParts {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const out = (id: string, type: string) => g.edges.filter((e) => e.source === id && e.edge_type === type).map((e) => e.target);
  const data = (id: string) => ((byId.get(id)?.data ?? {}) as Record<string, unknown>);
  const parts: ProxyParts = { propertyIds: [], shapeIds: [], resourceIds: [], files: [], fromEmTools: false };
  for (const p of out(unitId, "has_property")) {
    if (byId.get(p)?.node_type !== "property" || data(p).property_type !== "geometry") continue;
    const shapes = out(p, "has_semantic_shape").filter((s) => byId.get(s)?.node_type === "semantic_shape");
    if (!shapes.length) continue;
    parts.propertyIds.push(p);
    for (const s of shapes) {
      parts.shapeIds.push(s);
      for (const r of out(s, "has_linked_resource")) {
        if (byId.get(r)?.node_type !== "resource") continue;
        const others = g.edges.some((e) => e.edge_type === "has_linked_resource" && e.target === r && e.source !== s);
        if (others) continue;
        parts.resourceIds.push(r);
        const d = data(r);
        if (typeof d.url === "string" && d.url) parts.files.push(d.url);
        if (!(d.media_type && d.size_bytes != null)) parts.fromEmTools = true;
      }
    }
  }
  return parts;
}

export interface UnitBrief {
  description: string;
  /** the documents its properties come from (property → extractor/combiner → document) */
  documents: string[];
  /** its first stratigraphic relations: the edge, the way, the other unit's name */
  relations: Array<{ type: string; out: boolean; other: string }>;
}

/** A unit told in brief, for the row of «Associa a un'unità»: what one needs
 *  to know to choose it. `isUnit` says which node types are units. */
export function unitBrief(g: GraphLike, unitId: string, isUnit: (type: string) => boolean, maxRelations = 3): UnitBrief {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const n = byId.get(unitId);
  const d = (n?.data ?? {}) as Record<string, unknown>;
  const description = String((n as { description?: unknown } | undefined)?.description || d.description || "").trim();
  // the documents: down the paradata, four steps at most
  const PATH = new Set(["has_property", "has_data_provenance", "combines", "extracted_from"]);
  const docs = new Set<string>();
  let front = [unitId];
  const seen = new Set(front);
  for (let depth = 0; depth < 4 && front.length; depth++) {
    const next: string[] = [];
    for (const id of front)
      for (const e of g.edges) {
        if (e.source !== id || !PATH.has(e.edge_type) || seen.has(e.target)) continue;
        seen.add(e.target);
        const t = byId.get(e.target);
        if (t?.node_type === "document") docs.add(String(t.name ?? t.id)); else next.push(e.target);
      }
    front = next;
  }
  const relations: UnitBrief["relations"] = [];
  for (const e of g.edges) {
    if (relations.length >= maxRelations) break;
    const out = e.source === unitId;
    if (!out && e.target !== unitId) continue;
    const other = byId.get(out ? e.target : e.source);
    if (!other || !isUnit(String(other.node_type))) continue;
    relations.push({ type: e.edge_type, out, other: String(other.name ?? other.id) });
  }
  return { description, documents: [...docs].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), relations };
}
