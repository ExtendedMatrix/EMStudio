/**
 * THE SHELF — the wide list.
 *
 * The analogy that settles it (E.D.): in a video editor there is a file
 * BROWSER, an ASSET list, and a TIMELINE. You drag from the browser into the
 * asset list — and *there* the material gets its checksum and its index — and
 * from there into the edit. Here it is the same three: **file browser → shelf →
 * graph/annotator**. The shelf IS the asset list.
 *
 * Browser ≠ shelf, and the difference is curation. The browser shows everything
 * on the disk, including what will never belong in the documentation; the shelf
 * holds what you CHOSE, with a digest and an index. Which is why the shelf is a
 * saved list (Model A) and not a computed view of a folder's orphans (Model B).
 * The orphan scan does not disappear — it becomes an ENTRANCE, "add to the
 * shelf", rather than being the shelf.
 *
 * It is a GRAPH, so it saves and reopens like everything else: a ShelfGraph
 * (`graph.data.em_collection === "ShelfGraph"`), the same convention Heriverse
 * and s3Dgraphy already use — reuse, not a third format. Standalone across
 * studies, or a member of the multigraph.
 *
 * Each entry carries the two axes the design note calls for:
 *
 *   · **scope** — which of the three FENCES it comes from: `own-study`,
 *     `own-HDT`, or `other-HDT` (a COMPARANDUM, from another site's twin).
 *     Not decoration: search must be filterable by fence and the UI must show
 *     it, because whether a thing is mine, my twin's, or another site's changes
 *     what a comparison means.
 *   · **residency** — `reference` (the URI stays at home) or `resident` (copied
 *     into my own store). Tropy's linked/managed, same idea.
 *
 * Pure module: no DOM, no network. The checksum comes from the bridge (the
 * browser cannot hash a file it is not allowed to read), and is passed in.
 */

export type ShelfScope = "own-study" | "own-HDT" | "other-HDT";
export type ShelfResidency = "reference" | "resident";

export const SHELF_SCOPES: ShelfScope[] = ["own-study", "own-HDT", "other-HDT"];
export const SHELF_RESIDENCIES: ShelfResidency[] = ["reference", "resident"];

/** The marker that makes a graph a shelf — s3Dgraphy `shelf/core.SHELF_COLLECTION`
 *  and Heriverse's `graphs.shelf` use this same string. */
export const SHELF_COLLECTION = "ShelfGraph";

export interface ShelfEntry {
  id: string;
  name: string;
  /** file path, `s3://…`, or an http(s) URI — the shelf holds MIXED locators */
  locator: string;
  /** `sha256:<hex>`, absent for a pure URI/LOD resource: no bytes here to hash,
   *  and its identity is already the URI */
  checksum?: string;
  scope?: ShelfScope;
  residency?: ShelfResidency;
  /** resource kind from the extension (image/document/…), for the icon */
  kind?: string;
  /**
   * SHELF-B · what this resource is FOR in the argument — `comparandum` or
   * `internal_source`.
   *
   * A plain string and NOT a union, deliberately: the two values are
   * s3Dgraphy's (`api.resource_roles()`, validated by `ResourceNode.set_role`),
   * and a union here would be a second place they live — free to drift the day a
   * third one is declared. This side carries and shows it; the library decides
   * what is valid.
   *
   * **Orthogonal to `scope` and `residency`**: my own asset can be a
   * comparandum and somebody else's URI can be a source inside my own argument,
   * so it is never derived from the fence. Absent means UNSTATED — there is no
   * `effectiveRole`, because neither value is what a resource is by default.
   */
  role?: string;
  /**
   * EVERYTHING ELSE the resource's `data` carried — untouched and put back.
   *
   * Measured, and it was a real loss: a URI entry acquired through s3Dgraphy
   * comes back with `media_type`, `access`, `origin`, `size`… this list models
   * none of those, so adopting the library's shelf DROPPED them and the next
   * table read showed blank cells for fields that had been correctly filled in
   * one call earlier.
   *
   * So the fields this module does not model are carried through rather than
   * modelled: the shelf list is the in-memory form of the container's
   * ShelfGraph, and a mirror that quietly loses half of what it reflects is
   * worse than no mirror. Modelled keys always win over what is in here.
   */
  extra?: Record<string, unknown>;
}

/** The `data` keys this module models itself — everything else rides in
 *  `extra`. Named once so the reader and the writer cannot disagree. */
const MODELLED_KEYS = ["url", "url_type", "description", "checksum", "scope",
                       "residency", "role"] as const;

/** The sane READING when nothing was recorded. A method, not a default written
 *  into the entry: the document keeps saying nothing, and the assumption stays
 *  visibly on the consumer's side. */
export function effectiveScope(entry: ShelfEntry): ShelfScope {
  return entry.scope ?? "own-study";
}

export function effectiveResidency(entry: ShelfEntry): ShelfResidency {
  if (entry.residency) return entry.residency;
  return /^(https?:|s3:)/i.test(entry.locator) ? "reference" : "resident";
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif|tif|tiff)(\?|#|$)/i;
const PDF_EXT = /\.pdf(\?|#|$)/i;

export function shelfKind(locator: string): string {
  if (PDF_EXT.test(locator)) return "document";
  if (IMAGE_EXT.test(locator)) return "image";
  if (/^https?:/i.test(locator)) return "web_page";
  return "unknown";
}

/** Can the annotator work on this? (An image, or a PDF page.) */
export function isAnnotatable(entry: ShelfEntry): boolean {
  const kind = entry.kind ?? shelfKind(entry.locator);
  return kind === "image" || kind === "document";
}

// ── the list ────────────────────────────────────────────────────────────────

let entries: ShelfEntry[] = [];
let shelfName = "Shelf";
let shelfId = "shelf";
let listeners: Array<() => void> = [];

const STORAGE_KEY = "emstudio.shelf";

export function onShelfChange(fn: () => void): void {
  listeners.push(fn);
}

function changed(): void {
  persist();
  for (const fn of listeners) fn();
}

export function shelfEntries(): ShelfEntry[] {
  return entries;
}

export function shelfMeta(): { id: string; name: string } {
  return { id: shelfId, name: shelfName };
}

export function renameShelf(name: string): void {
  shelfName = name.trim() || "Shelf";
  changed();
}

/**
 * Add a resource. Returns the entry that ends up on the shelf.
 *
 * Dedup by CONTENT first: the same photograph dragged twice from two folders is
 * ONE resource, and the digest is the only thing that knows it — the file is
 * called something else and lives somewhere else, so no name-based check can
 * see it. Without this the "curated list" becomes a pile that grows every time
 * somebody drags the same folder again.
 */
export function addToShelf(input: {
  locator: string;
  name?: string;
  checksum?: string;
  scope?: ShelfScope;
  residency?: ShelfResidency;
  /** see `ShelfEntry.role` — stated, never derived, and validated by the library */
  role?: string;
  /** see `ShelfEntry.extra` — whatever the library wrote and this list does not
   *  model, carried through instead of dropped */
  extra?: Record<string, unknown>;
  id?: string;
}): ShelfEntry {
  const locator = input.locator.trim();
  const twin = input.checksum
    ? entries.find((e) => e.checksum === input.checksum)
    : entries.find((e) => e.locator === locator);
  if (twin) {
    // a re-drag may still SAY something new (a scope, a residency); it must not
    // create a second entry to say it in
    if (input.scope) twin.scope = input.scope;
    if (input.residency) twin.residency = input.residency;
    if (input.role) twin.role = input.role;
    if (input.extra) twin.extra = { ...twin.extra, ...input.extra };
    if (input.checksum && !twin.checksum) twin.checksum = input.checksum;
    changed();
    return twin;
  }
  const entry: ShelfEntry = {
    id: input.id ?? crypto.randomUUID(),
    name: input.name?.trim() || locator.split("/").pop() || locator,
    locator,
    kind: shelfKind(locator),
  };
  if (input.checksum) entry.checksum = input.checksum;
  if (input.scope) entry.scope = input.scope;
  if (input.residency) entry.residency = input.residency;
  if (input.role) entry.role = input.role;
  if (input.extra) entry.extra = { ...input.extra };
  entries = [entry, ...entries];
  changed();
  return entry;
}

export function removeFromShelf(id: string): void {
  entries = entries.filter((e) => e.id !== id);
  changed();
}

/** AUDIT N11 · remove, and hand back the gesture that puts it where it was */
export function removeFromShelfUndoable(id: string): (() => void) | null {
  const at = entries.findIndex((e) => e.id === id);
  if (at < 0) return null;
  const entry = entries[at];
  entries = entries.filter((e) => e.id !== id);
  changed();
  return () => {
    if (entries.some((e) => e.id === entry.id)) return;
    entries = [...entries.slice(0, at), entry, ...entries.slice(at)];
    changed();
  };
}

export function updateShelfEntry(id: string, patch: Partial<ShelfEntry>): void {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  Object.assign(entry, patch);
  changed();
}

export function clearShelf(): void {
  entries = [];
  changed();
}

// ── it is a GRAPH: save, open ───────────────────────────────────────────────

interface ShelfNode {
  id: string;
  node_type: "resource";
  name: string;
  description?: string;
  data: Record<string, unknown>;
}

/**
 * The shelf as an em.json document — a ShelfGraph.
 *
 * The fields go where s3Dgraphy reads them (`ResourceNode.data`), so a shelf
 * written here opens in the library and vice versa. That is the whole reason
 * for adopting the existing convention instead of inventing a third format.
 */
export function shelfToDocument(): {
  header: Record<string, unknown>;
  graph: Record<string, unknown>;
} {
  const nodes: ShelfNode[] = entries.map((e) => {
    const data: Record<string, unknown> = { url: e.locator };
    if (e.kind) data.url_type = e.kind;
    // written only when RECORDED: absent means nobody said, not a default
    if (e.checksum) data.checksum = e.checksum;
    if (e.scope) data.scope = e.scope;
    if (e.residency) data.residency = e.residency;
    // …where s3Dgraphy reads it (`ResourceNode.data.role`), so a role stated
    // here is the one the shelf table reports back
    if (e.role) data.role = e.role;
    // …and back go the fields we do not model (media_type, access, origin, …),
    // written FIRST so a modelled key always wins over a stale copy of itself
    if (e.extra) for (const [k, v] of Object.entries(e.extra)) {
      if (!(k in data)) data[k] = v;
    }
    return { id: e.id, node_type: "resource", name: e.name, description: "", data };
  });
  return {
    header: { format: "em.json", version: "1.0" },
    graph: {
      graph_id: shelfId,
      name: shelfName,
      data: { em_collection: SHELF_COLLECTION },
      nodes,
      edges: [],
    },
  };
}

/** True when this document is a shelf — the marker, not a guess about content. */
export function isShelfDocument(doc: unknown): boolean {
  const graph = (doc as { graph?: { data?: Record<string, unknown> } } | null)?.graph;
  return graph?.data?.em_collection === SHELF_COLLECTION;
}

export type ShelfLoad =
  | { ok: true; count: number }
  | { ok: false; reason: "not-a-shelf" | "unreadable" };

/**
 * Open a ShelfGraph, REPLACING the current list.
 *
 * A document that is not marked as a shelf is refused rather than read for
 * whatever resources it happens to contain: opening a study graph "as a shelf"
 * would silently turn its documents into shelf entries, and the person would
 * have no way to tell what they were now holding.
 */
export function loadShelfDocument(doc: unknown): ShelfLoad {
  if (!isShelfDocument(doc)) return { ok: false, reason: "not-a-shelf" };
  const graph = (doc as { graph: { nodes?: unknown[]; graph_id?: string; name?: string } }).graph;
  if (!Array.isArray(graph.nodes)) return { ok: false, reason: "unreadable" };
  const loaded: ShelfEntry[] = [];
  for (const raw of graph.nodes) {
    const node = raw as ShelfNode;
    if (node?.node_type !== "resource") continue;
    const data = (node.data ?? {}) as Record<string, unknown>;
    const locator = String(data.url ?? "");
    const entry: ShelfEntry = {
      id: String(node.id ?? crypto.randomUUID()),
      name: String(node.name ?? locator),
      locator,
      kind: shelfKind(locator),
    };
    if (typeof data.checksum === "string") entry.checksum = data.checksum;
    if (SHELF_SCOPES.includes(data.scope as ShelfScope)) entry.scope = data.scope as ShelfScope;
    if (SHELF_RESIDENCIES.includes(data.residency as ShelfResidency))
      entry.residency = data.residency as ShelfResidency;
    // no allow-list here on purpose: validating the role against a list written
    // on this side would silently DROP a value s3Dgraphy accepts (the day a
    // third one is declared, this reader would eat it)
    if (typeof data.role === "string" && data.role) entry.role = data.role;
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (!(MODELLED_KEYS as readonly string[]).includes(k)) extra[k] = v;
    }
    if (Object.keys(extra).length) entry.extra = extra;
    loaded.push(entry);
  }
  entries = loaded;
  shelfId = String(graph.graph_id ?? "shelf");
  shelfName = String(graph.name ?? "Shelf");
  changed();
  return { ok: true, count: loaded.length };
}

// ── keeping it across a reload ──────────────────────────────────────────────
//
// The shelf is a saved list, and a list that vanishes when the tab reloads is
// not saved. This is a convenience, NOT the save: the real one is the em.json,
// which is what travels between studies and into the multigraph.

function persist(): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ id: shelfId, name: shelfName, entries }),
    );
  } catch {
    /* storage disabled — the shelf lives for this session */
  }
}

export function restoreShelf(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { id?: string; name?: string; entries?: ShelfEntry[] };
    if (!Array.isArray(parsed.entries)) return;
    entries = parsed.entries.filter((e) => e && typeof e.locator === "string");
    shelfId = String(parsed.id ?? "shelf");
    shelfName = String(parsed.name ?? "Shelf");
  } catch {
    /* a corrupt value must not stop the app from starting */
  }
}
