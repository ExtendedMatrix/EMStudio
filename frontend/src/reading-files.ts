/**
 * LUOGO · where a reading's glb goes, and where its vertices come back from.
 *
 * The nodes of a placed reading are made in the client, in ONE undo step
 * (`paradata-chain.setReadingGeometry`). The FILE is not undoable and needs a
 * folder, so it is written here, after, by the first of:
 *
 *   1. the bridge — `POST /place-reading`, i.e. `api.place_reading` with the
 *      project folder: s3Dgraphy writes `<project>/readings/<region>.glb`
 *      (the same ids, so the replay finds the nodes the client made);
 *   2. the desktop's own fs (Tauri), the same bytes (`reading-glb.glbBytes`,
 *      byte-identical to s3Dgraphy's writer);
 *   3. nowhere yet: no project folder (a browser, a document never saved). The
 *      bytes stay PENDING in memory — the markers still draw from them — and a
 *      Save to a folder writes them. Said, never silent: the node points at a
 *      file that does not exist until then.
 *
 * The markers read the vertices FROM THE GLB (the node has only vertex_count):
 * pending bytes, else the file through the bridge's /fs/file or the desktop fs.
 */
import { parseGlb, type Vec3 } from "./reading-glb";
import type { PlacedReading, TraceGeometry } from "./paradata-chain";
import type { EmDocument } from "./types";

export interface ReadingFilesDeps {
  /** the folder of the em.json (absolute), when there is one */
  projectRoot(): string | null;
  /** the bridge's base url, or null when it is not answering */
  bridge(): Promise<string | null>;
  /** the desktop's fs (absent in a browser) */
  writeFile?(absPath: string, bytes: Uint8Array): Promise<void>;
  readFile?(absPath: string): Promise<Uint8Array>;
  fetch?: typeof fetch;
  /** vertices arrived for a url that was being loaded: repaint */
  onLoaded?(url: string): void;
}

export type PlaceOutcome =
  | { where: "bridge"; path: string; agrees: boolean | null }
  | { where: "desktop"; path: string }
  | { where: "pending"; why: string }
  | { where: "none" };

const join = (root: string, url: string) => `${root.replace(/[\\/]+$/, "")}/${url}`;

export class ReadingFiles {
  /** url → bytes not on disk yet */
  readonly pending = new Map<string, Uint8Array>();
  /** url → vertices; null = asked and not (yet) readable */
  private readonly vertexCache = new Map<string, Vec3[] | null>();
  private readonly loading = new Set<string>();

  constructor(private readonly deps: ReadingFilesDeps) {}

  private get fetch(): typeof fetch { return this.deps.fetch ?? globalThis.fetch.bind(globalThis); }

  /** Write the glb of a reading just placed. Never throws: the outcome says. */
  async place(placed: PlacedReading | null, doc: EmDocument, trace: TraceGeometry): Promise<PlaceOutcome> {
    if (!placed?.glb || !placed.glbUrl) return { where: "none" };
    const url = placed.glbUrl;
    this.vertexCache.set(url, placed.vertices);
    this.pending.set(url, placed.glb);
    const root = this.deps.projectRoot();
    if (!root) return { where: "pending", why: "no-folder" };
    const base = await this.deps.bridge().catch(() => null);
    if (base) {
      try {
        const r = await this.fetch(`${base}/place-reading`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doc, extractor_id: placed.extractorId, on_id: placed.onId,
                                 geometry: { geometry_kind: placed.geometry_kind,
                                             vertices: "vertices" in trace ? trace.vertices : placed.vertices },
                                 project_root: root }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.ok && j.region_id === placed.regionId && j.glb_path) {
          this.pending.delete(url);
          return { where: "bridge", path: String(j.glb_path), agrees: j.measure?.glb?.agrees ?? null };
        }
      } catch { /* the bridge went away: the desktop, or pending */ }
    }
    if (this.deps.writeFile) {
      try {
        const path = join(root, url);
        await this.deps.writeFile(path, placed.glb);
        this.pending.delete(url);
        return { where: "desktop", path };
      } catch { /* fall through: pending */ }
    }
    return { where: "pending", why: "not-written" };
  }

  /** Write the pending glbs THIS document points at under its project folder
   *  (a Save found one). Another document's pending files are not its to write. */
  async flush(doc: EmDocument): Promise<{ written: string[]; left: string[] }> {
    const root = this.deps.projectRoot();
    const written: string[] = [];
    const mine = new Set(doc.graph.nodes.map((n) => ((n.data ?? {}) as Record<string, unknown>).url)
      .filter((u): u is string => typeof u === "string"));
    if (root && this.deps.writeFile) {
      for (const [url, bytes] of [...this.pending]) {
        if (!mine.has(url)) continue;
        try {
          await this.deps.writeFile(join(root, url), bytes);
          this.pending.delete(url);
          written.push(url);
        } catch { /* stays pending */ }
      }
    }
    return { written, left: [...this.pending.keys()].filter((u) => mine.has(u)) };
  }

  /** The vertices of a glb, now if known; else null, and they are fetched (the
   *  caller is told through `onLoaded`). */
  vertices(url: string | null | undefined): Vec3[] | null {
    if (!url) return null;
    const known = this.vertexCache.get(url);
    if (known) return known;
    const bytes = this.pending.get(url);
    if (bytes) {
      const v = parseGlb(bytes).vertices;
      this.vertexCache.set(url, v);
      return v;
    }
    if (!this.vertexCache.has(url) && !this.loading.has(url)) void this.load(url);
    return null;
  }

  private async load(url: string): Promise<void> {
    const root = this.deps.projectRoot();
    if (!root) { this.vertexCache.set(url, null); return; }
    this.loading.add(url);
    let bytes: Uint8Array | null = null;
    try {
      if (this.deps.readFile) bytes = await this.deps.readFile(join(root, url));
    } catch { bytes = null; }
    if (!bytes) {
      const base = await this.deps.bridge().catch(() => null);
      if (base) {
        try {
          const r = await this.fetch(`${base}/fs/file?path=${encodeURIComponent(join(root, url))}`);
          if (r.ok) bytes = new Uint8Array(await r.arrayBuffer());
        } catch { bytes = null; }
      }
    }
    this.loading.delete(url);
    let v: Vec3[] | null = null;
    try { v = bytes ? parseGlb(bytes).vertices : null; } catch { v = null; }
    this.vertexCache.set(url, v);
    if (v) this.deps.onLoaded?.(url);
  }

  /** Forget what was read (another document opened). Pending bytes stay. */
  reset(): void {
    this.vertexCache.clear();
    for (const [url, b] of this.pending) this.vertexCache.set(url, parseGlb(b).vertices);
  }
}
