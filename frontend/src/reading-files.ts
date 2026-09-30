/**
 * SPAZIO · a reading's vertices, from the glb of 7–11 ott into its node.
 *
 * From 7 to 11 ott a point, line or polyline traced on a model was
 *
 *     AnnotationRegion ──has_semantic_shape──▶ SemanticShape(generic, url readings/<id>.glb)
 *
 * with the vertices in the file and only `vertex_count` / `length` in the node.
 * Since node datamodel 1.6.15 they are the region's `data.coords` (E.D. 30 set:
 * the geometry of whoever argues is data of the node), and nothing writes a glb
 * any more. EMStudio opens an em.json itself — it does not pass through
 * s3Dgraphy — so the migration s3Dgraphy does on opening
 * (`annotation.migrate_reading.migrate_reading_glbs`) is done here too, with the
 * same rules:
 *
 *   · the glb is read (the desktop's fs, else the bridge's `/fs/file`, under the
 *     em.json's folder) and its vertices become `data.coords`, count and length
 *     recomputed from them; the shape and its edge leave the graph;
 *   · **the file stays where it is** — nothing here deletes a file; once
 *     migrated nothing in the graph points at it;
 *   · without a folder, without the file, with a file that is not this reading's
 *     glb, or with more vertices than `coords.inline_max_vertices`: the old form
 *     STAYS (it is the only road to the vertices) and the caller says why.
 *
 * Idempotent: a migrated region has no shape left to find.
 */
import { DEFAULT_CRS, DEFAULT_UNIT, HAS_SEMANTIC_SHAPE, MEASURE_KINDS, coordsOf, inlineMaxVertices, isGlbKind }
  from "./paradata-chain";
import { parseGlb, polylineLength, type GlbKind, type Vec3 } from "./reading-glb";
import type { EmDocument } from "./types";

export interface ReadingFilesDeps {
  /** the folder of the em.json (absolute), when there is one */
  projectRoot(): string | null;
  /** the bridge's base url, or null when it is not answering */
  bridge(): Promise<string | null>;
  /** the desktop's fs (absent in a browser) */
  readFile?(absPath: string): Promise<Uint8Array>;
  fetch?: typeof fetch;
}

/** A region of 7–11 ott: its vertices are still behind a shape. */
export interface LegacyReading {
  regionId: string;
  shapeId: string;
  kind: GlbKind;
  url: string;
}

export interface ReadingMigration {
  migrated: Array<{ regionId: string; url: string; vertex_count: number }>;
  pending: Array<{ regionId: string; url: string; why: "no-folder" | "no-file" | "not-a-reading" | "too-many" }>;
}

const join = (root: string, url: string) => `${root.replace(/[\\/]+$/, "")}/${url}`;

/** The 3D regions of a document whose vertices are in a glb, not in the node. */
export function legacyReadingGlbs(doc: EmDocument): LegacyReading[] {
  const nodes = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  const out: LegacyReading[] = [];
  for (const r of doc.graph.nodes) {
    if (r.node_type !== "annotation_region") continue;
    const d = (r.data ?? {}) as Record<string, unknown>;
    const kind = String(d.geometry_kind ?? "region2d");
    if (!isGlbKind(kind) || coordsOf(d)) continue;
    for (const e of doc.graph.edges) {
      if (e.source !== r.id || e.edge_type !== HAS_SEMANTIC_SHAPE) continue;
      const sh = nodes.get(e.target);
      const url = String(((sh?.data ?? {}) as Record<string, unknown>).url ?? "").trim();
      if (sh?.node_type === "semantic_shape" && url) out.push({ regionId: r.id, shapeId: sh.id, kind, url });
    }
  }
  return out;
}

/** Write the vertices into the region and take the shape (and its edge) away —
 *  in place, on the document: the caller decides how silent that is. */
export function applyReadingCoords(doc: EmDocument, lr: LegacyReading, vertices: Vec3[]): void {
  const g = doc.graph;
  const r = g.nodes.find((n) => n.id === lr.regionId);
  if (!r) return;
  const { geometry_kind: _k, coords: _c, vertex_count: _n, length: _l, unit, crs, ...rest } =
    (r.data ?? {}) as Record<string, unknown>;
  const coords = vertices.map((p) => [p[0], p[1], p[2]] as Vec3);
  r.data = {
    geometry_kind: lr.kind, coords, vertex_count: coords.length,
    ...(MEASURE_KINDS.includes(lr.kind) ? { length: polylineLength(coords), unit: unit ?? DEFAULT_UNIT } : {}),
    crs: crs ?? DEFAULT_CRS,
    ...rest,
  };
  g.edges = g.edges.filter((e) => !(e.source === lr.regionId && e.target === lr.shapeId && e.edge_type === HAS_SEMANTIC_SHAPE));
  // the shape was only the carrier of the path: it goes, unless something else hangs on it
  if (!g.edges.some((e) => e.source === lr.shapeId || e.target === lr.shapeId)) {
    g.nodes = g.nodes.filter((n) => n.id !== lr.shapeId);
    if (doc.layout?.positions) delete doc.layout.positions[lr.shapeId];
  }
}

export class ReadingFiles {
  constructor(private readonly deps: ReadingFilesDeps) {}

  private get fetch(): typeof fetch { return this.deps.fetch ?? globalThis.fetch.bind(globalThis); }

  /** The bytes of a project-relative file: the desktop's fs, else the bridge. */
  async read(url: string): Promise<Uint8Array | null> {
    const root = this.deps.projectRoot();
    if (!root) return null;
    try {
      if (this.deps.readFile) return await this.deps.readFile(join(root, url));
    } catch { /* the bridge, then */ }
    const base = await this.deps.bridge().catch(() => null);
    if (!base) return null;
    try {
      const r = await this.fetch(`${base}/fs/file?path=${encodeURIComponent(join(root, url))}`);
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
    } catch {
      return null;
    }
  }

  /** Migrate every region of 7–11 ott of `doc`. `apply` writes (the caller
   *  wraps it: silent, like the other load-time migrations). */
  async migrate(doc: EmDocument, apply: (write: () => void) => void): Promise<ReadingMigration> {
    const out: ReadingMigration = { migrated: [], pending: [] };
    const todo = legacyReadingGlbs(doc);
    if (!todo.length) return out;
    const root = this.deps.projectRoot();
    for (const lr of todo) {
      if (!root) { out.pending.push({ regionId: lr.regionId, url: lr.url, why: "no-folder" }); continue; }
      const bytes = await this.read(lr.url);
      if (!bytes) { out.pending.push({ regionId: lr.regionId, url: lr.url, why: "no-file" }); continue; }
      let v: Vec3[];
      try {
        const g = parseGlb(bytes);
        if (g.geometry_kind !== lr.kind) throw new Error("kind");
        v = g.vertices;
      } catch {
        out.pending.push({ regionId: lr.regionId, url: lr.url, why: "not-a-reading" });
        continue;
      }
      if (v.length > inlineMaxVertices()) {
        out.pending.push({ regionId: lr.regionId, url: lr.url, why: "too-many" });
        continue;
      }
      apply(() => applyReadingCoords(doc, lr, v));
      out.migrated.push({ regionId: lr.regionId, url: lr.url, vertex_count: v.length });
    }
    return out;
  }
}
