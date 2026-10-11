// R1/R2 (E.D., 4 Oct 2026) · where each file of the graph is, asked of the
// ONE resolver (s3Dgraphy `resources.locate`) through the bridge — the same
// function EMtools and StratiField call, so the same files give the same state
// in the three. The answers are kept per resource id until asked again
// («Check files»): resolving touches the disk and, in a room, the node.
export interface FileState {
  id: string; name: string; state: string; path: string; sha256: string; note: string;
  node_type: string;
}

/** S1 · a row of the Storage list (s3Dgraphy `storage_rows`): what a file IS
 *  (master, version of an asset, file of a set, link of a document), its level
 *  and uses, the RMs that use it. The page draws; the library groups. */
export interface StorageRow {
  id: string; file: string; doc: string; doc_id: string; asset: string; asset_id: string;
  kind: "master" | "version" | "file" | "link"; tier: string; level: string; use: string[];
  state: string; where: string; tag: string; rm: string[]; search: string;
}
/** S1 · a missing file and where it may have gone (s3Dgraphy `find_moved`) */
export interface MovedFile {
  id: string; name: string; state: string;
  wanted: { sha256: string; name: string; size: number };
  matches: Array<{ path: string; how: "exact" | "exact_renamed" | "probable" | "possible"; size: number }>;
}

const STATES = new Map<string, FileState>();
let ROWS: StorageRow[] = [];
let MOVED: MovedFile[] = [];
export const fileRows = (): StorageRow[] => ROWS;
export const movedFiles = (): MovedFile[] => MOVED;
export function dropMoved(ids: string[] | null): void {
  MOVED = ids === null ? [] : MOVED.filter((m) => !ids.includes(m.id));
}
/** the list's own filters (session state, like `fileFilter`) */
export const listFilter = { query: "", kind: "", use: "", selected: "" };
/** the rows a filter keeps — the same rule as s3Dgraphy `filter_rows` */
export function filterRows(rows: StorageRow[], f: { query: string; kind: string; use: string; state: string }): StorageRow[] {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((r) => (!f.kind || r.kind === f.kind) && (!f.use || r.use.includes(f.use))
    && (!f.state || r.state === f.state) && words.every((w) => r.search.includes(w)));
}
let lastSummary: Record<string, number> = {};
let projectRoot = "";
/** the state shown in Contents; "" = all */
export let fileFilter = "";
export function setFileFilter(s: string): void { fileFilter = fileFilter === s ? "" : s; }

export function fileStateOf(id: string): FileState | undefined { return STATES.get(id); }
export function fileStates(): FileState[] { return [...STATES.values()]; }
export function fileSummary(): Record<string, number> { return lastSummary; }
export function fileProjectRoot(): string { return projectRoot; }

export interface RoomRef { base: string; room_id: string; token?: string | null }

/** Ask the bridge; never throws (a bridge that is down keeps the old answers) */
export async function refreshFileStates(bridge: string, doc: unknown, opts: {
  folders?: string[]; projectRoot?: string; room?: RoomRef | null;
} = {}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${bridge}/files-state`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc, folders: opts.folders ?? [], project_root: opts.projectRoot ?? "",
                             room: opts.room ?? null }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) return { ok: false, error: String(j.error ?? `bridge ${res.status}`) };
    STATES.clear();
    for (const r of j.results as FileState[]) STATES.set(r.id, r);
    ROWS = (j.rows as StorageRow[] | undefined) ?? [];
    MOVED = MOVED.filter((m) => { const f = STATES.get(m.id); return f && (f.state === "missing" || f.state === "empty_copy"); });
    lastSummary = j.summary ?? {};
    projectRoot = String(j.project_root ?? "");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function post(bridge: string, route: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${bridge}${route}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) throw new Error(String(j.error ?? `bridge ${res.status}`));
  return j;
}

/** «Find moved files…»: the bridge looks in the folders for the files that are
 *  missing — by sha256, then by name and size — and proposes; nothing changes */
export async function findMovedFiles(bridge: string, doc: unknown, folders: string[],
                                     projectRoot: string): Promise<MovedFile[]> {
  const lost = fileStates().filter((f) => f.state === "missing" || f.state === "empty_copy");
  const j = await post(bridge, "/files-find-moved",
                       { doc, folders, project_root: projectRoot, results: lost });
  MOVED = (j.found as MovedFile[]) ?? [];
  return MOVED;
}

/** «Open where it is» */
export const revealFile = (bridge: string, path: string) => post(bridge, "/file-reveal", { path });
/** «Keep on the disk too» (R3): the node's bytes into the project's cache,
 *  named by their sha256 — the first place the resolver looks */
export const keepOnDisk = (bridge: string, room: RoomRef, sha256: string, projectRoot: string, name: string) =>
  post(bridge, "/file-keep", { room, sha256, project_root: projectRoot, name });
/** «New EM project…» */
export const newEmProject = (bridge: string, parent: string, name: string) =>
  post(bridge, "/project-new", { parent, name });
/** «Reorder by the EM standard…»: the preview, then (on a yes) the moves */
export const reorderPreview = (bridge: string, root: string) =>
  post(bridge, "/project-reorder", { root });
export const reorderApply = (bridge: string, root: string, plan: unknown) =>
  post(bridge, "/project-reorder", { root, plan, apply: true, confirm: true });

// ── R2 rimasto (E.D., 4 Oct 2026) · what a row SAYS of a file ────────────────
// The rows said «Link to D.32»: the name the GraphML importer gives every link
// (s3Dgraphy `import_graphml`), the same for every file of every document. A
// row now says the FILE's name — the last segment of where it is, or of where
// the graph says it is — and the TITLE of the document it belongs to.
interface GraphLike {
  nodes: Array<{ id: string; name?: unknown; node_type?: string; description?: unknown; data?: unknown }>;
  edges: Array<{ source: string; target: string; edge_type?: string }>;
}

const dataOf = (n: { data?: unknown } | undefined): Record<string, unknown> =>
  (n?.data && typeof n.data === "object" ? n.data : {}) as Record<string, unknown>;

/** `/DosCo/D.32.jpg`, `C:\x\D.32.jpg`, `https://h/x/P01%5Bext%5D.jpeg?v=2` → the last segment */
export function lastSegment(where: string): string {
  const s = where.trim().replace(/[?#].*$/, "").replace(/[\\/]+$/, "");
  const seg = s.split(/[\\/]/).pop() ?? "";
  try { return decodeURIComponent(seg); } catch { return seg; }
}

/** the files a document hangs (`has_linked_resource`), and the files of each set
 *  (`has_file`): the ids the resolver answers for */
export function filesOfDocument(g: GraphLike, docId: string): string[] {
  const out: string[] = [];
  for (const e of g.edges) {
    if (e.source !== docId || e.edge_type !== "has_linked_resource") continue;
    out.push(e.target);
    for (const f of g.edges) if (f.source === e.target && f.edge_type === "has_file") out.push(f.target);
  }
  return [...new Set(out)];
}

/** the node a resource belongs to: the one that links it (a document, or an
 *  extractor), through its set when it is one file of a set */
function ownerOf(g: GraphLike, id: string, seen = new Set<string>()): GraphLike["nodes"][number] | null {
  if (seen.has(id)) return null;
  seen.add(id);
  const byId = (x: string) => g.nodes.find((n) => n.id === x);
  const link = g.edges.find((e) => e.target === id && e.edge_type === "has_linked_resource");
  if (link) return byId(link.source) ?? null;
  const set = g.edges.find((e) => e.target === id && e.edge_type === "has_file");
  return set ? ownerOf(g, set.source, seen) : null;
}

/** «D.32.jpg» and «D.32 · <title>» for one resource id (and its state, when known) */
export function describeFile(g: GraphLike, id: string, f?: FileState): { file: string; doc: string; docId: string | null } {
  const n = g.nodes.find((x) => x.id === id);
  const d = dataOf(n);
  const where = [f?.path, d.url, d.filename, d.path, d.locator]
    .map((v) => (typeof v === "string" ? v : "")).find((v) => v && !/^sha256:/i.test(v)) ?? "";
  const name = String(n?.name ?? f?.name ?? "");
  const file = lastSegment(where) || (name && !/^Link to /.test(name) ? name : "") || name || id;
  const owner = ownerOf(g, id);
  let doc = "";
  if (owner) {
    const od = dataOf(owner);
    const title = String(od.title ?? owner.description ?? "").trim();
    const oname = String(owner.name ?? owner.id);
    doc = title && title !== oname ? `${oname} · ${title}` : oname;
  }
  return { file, doc, docId: owner?.id ?? null };
}
