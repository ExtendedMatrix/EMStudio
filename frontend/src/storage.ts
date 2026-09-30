/**
 * W1 · STORAGE — where the bytes live, and what a "collection" is.
 *
 * Two things live here, and they are separate on purpose:
 *
 *  1. **the bridge's filesystem client** (`fsList`, `fsFileUrl`). A window
 *     cannot read a disk path: served over http, `/Users/…/x.jpg` resolves
 *     against the origin and the dev server answers *200 text/html* — measured
 *     — so an <img> fails in decode with no honest error to catch. The bridge
 *     reads the disk because it is the only side that can, and the page reads
 *     the bridge. Every byte a window shows comes through `fsFileUrl`.
 *
 *  2. **the collection (U3)**. A resource is not always one file: it can be a
 *     FOLDER of photographs, or a multi-page PDF. Rather than teach each window
 *     the three cases, everything downstream — Viewer, Gallery, and tomorrow the
 *     annotator — iterates an ORDERED LIST OF ITEMS. A single image is a
 *     collection of one. That is the whole abstraction, and it is designed for N
 *     from the start even where this phase produces 1 (see `pdf` below).
 *
 * The module never touches em.json and never renders: it answers questions.
 */

export interface FsEntry {
  name: string;
  type: "dir" | "file";
  size: number;
  mtime: number;
  ext: string;
  path: string;
  /** a symlink whose target is outside the bridge's roots: listed, not openable */
  outside?: boolean;
}

export interface FsListing {
  /** true when this is the list of ROOTS rather than a directory's contents */
  roots: boolean;
  path: string;
  name?: string;
  /** null AT a root — there is no ".." to offer that would not be refused */
  parent: string | null;
  entries: FsEntry[];
}

/** Thrown when the bridge itself is unreachable, so a window can say "the bridge
 *  is not running" instead of "this folder is empty" — two very different facts
 *  that a bare `catch` would flatten into one. */
export class BridgeDownError extends Error {}

let resolveBridge: (() => Promise<string>) | null = null;

/** `main.ts` owns the endpoint precedence (?bridge= > EM_BRIDGE > desktop >
 *  dev default) and hands it here, exactly as it does for `geo.ts`. One place
 *  decides where the bridge is; nobody rebuilds that rule. */
export function setStorageBridgeResolver(fn: () => Promise<string>): void {
  resolveBridge = fn;
}

async function base(): Promise<string> {
  if (!resolveBridge) throw new BridgeDownError("no bridge resolver installed");
  return await resolveBridge();
}

/** The URL a window can point an <img>/<object> at for a file on disk. */
export async function fsFileUrl(path: string): Promise<string> {
  return `${await base()}/fs/file?path=${encodeURIComponent(path)}`;
}

/** MICRO-3DTILES · the same file, with its path IN the URL's path
 *  (`/fs/at/<path>`), so that what it names relatively resolves beside it: a
 *  tileset's `tiles/0/0/0.glb`, a .gltf's .bin. The query form cannot do that —
 *  a relative URI resolved against `/fs/file?path=…` lands on `/fs/tiles/…`. */
export async function fsTreeUrl(path: string): Promise<string> {
  const p = path.replace(/\\/g, "/");
  const rest = p.startsWith("/") ? p.slice(1) : p;
  return `${await base()}/fs/at/${rest.split("/").map(encodeURIComponent).join("/")}`;
}

/** List a directory — or, with no path, the roots the bridge was started with. */
export async function fsList(path?: string): Promise<FsListing> {
  const url = `${await base()}/fs/list${path ? `?path=${encodeURIComponent(path)}` : ""}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    // A network-level failure means the bridge is not answering at all. The
    // distinction matters: this one is fixed by starting the bridge, while a
    // 403 below is fixed by naming another root.
    throw new BridgeDownError("em-bridge is not answering");
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* not JSON — the status is all we have */
    }
    throw new Error(message);
  }
  return (await res.json()) as FsListing;
}

// ── the collection ──────────────────────────────────────────────────────────

export type ItemKind = "image" | "pdf" | "other";

export interface CollectionItem {
  /** stable within the collection — the path, or the node id */
  id: string;
  title: string;
  /** what a window points an element at; empty when the item is not fetchable */
  url: string;
  kind: ItemKind;
  /** the disk path, when there is one — shown, never fetched directly */
  path?: string;
  /** pages of a multi-page PDF, when it could be read out. Phase 1 shows it as
   *  a badge; phase 2 turns it into that many ITEMS, which is why the field is
   *  on the item and not on the collection. */
  pages?: number;
}

export interface Collection {
  title: string;
  items: CollectionItem[];
  /** what this collection was built from, for the window to show and re-read */
  source: { kind: "folder" | "file" | "node"; ref: string };
  /** an honest word about what is NOT in here (unreadable folder, etc.) */
  note?: string;
}

const IMAGE_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "tif", "tiff",
]);
/** Browsers decode none of these, whatever the extension suggests. A .tif IS an
 *  image and belongs in a collection — it just cannot be drawn here, and the
 *  window says so rather than showing a broken icon. */
const UNDECODABLE = new Set(["tif", "tiff"]);

export function kindOfExt(ext: string): ItemKind {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (e === "pdf") return "pdf";
  return IMAGE_EXT.has(e) ? "image" : "other";
}

export function isDecodable(item: CollectionItem): boolean {
  const ext = (item.path ?? item.url).split(".").pop()?.toLowerCase() ?? "";
  return item.kind !== "other" && !UNDECODABLE.has(ext.replace(/[?#].*$/, ""));
}

/**
 * A folder → the collection of its previewable children, in listing order
 * (dirs are not items: a collection is things to look at, not places to go).
 */
export async function collectionFromFolder(path: string): Promise<Collection> {
  const listing = await fsList(path);
  const bridge = await base();
  const files = listing.entries.filter(
    (e) => e.type === "file" && !e.outside && kindOfExt(e.ext) !== "other",
  );
  const items: CollectionItem[] = files.map((e) => ({
    id: e.path,
    title: e.name,
    url: `${bridge}/fs/file?path=${encodeURIComponent(e.path)}`,
    kind: kindOfExt(e.ext),
    path: e.path,
  }));
  const skipped = listing.entries.filter(
    (e) => e.type === "file" && kindOfExt(e.ext) === "other",
  ).length;
  return {
    title: listing.name ?? path,
    items,
    source: { kind: "folder", ref: path },
    // Said, not hidden: a folder of 40 files that yields 12 items has 28 the
    // window chose not to show, and silence there reads as data loss.
    note: skipped ? `${skipped} file non anteprimabili non elencati` : undefined,
  };
}

/**
 * Ask the bridge whether it would serve this file — a HEAD, so the question
 * costs headers and not the file.
 *
 * Worth one round trip because the alternative is worse: point an <img> at a
 * path outside the roots and the browser reports "the image did not load",
 * which reads as "the file is missing" when the file is fine and the FENCE is
 * what stopped it. Asking first is how the window can name the real reason.
 */
export async function fsProbe(path: string): Promise<{ ok: true } | { ok: false; status: number }> {
  const url = await fsFileUrl(path);
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok ? { ok: true } : { ok: false, status: res.status };
  } catch {
    throw new BridgeDownError("em-bridge is not answering");
  }
}

/** Thrown when the bridge is up but will not serve this path (403 outside the
 *  roots, 404 gone). Carries the status so the caller can say WHICH. */
export class FileRefusedError extends Error {
  constructor(readonly status: number) {
    super(`the bridge refused this file (HTTP ${status})`);
  }
}

/** A single file on disk → a collection of one. */
export async function collectionFromFile(path: string): Promise<Collection> {
  const name = path.split("/").pop() || path;
  const ext = name.split(".").pop() ?? "";
  const probe = await fsProbe(path);
  if (!probe.ok) throw new FileRefusedError(probe.status);
  const item: CollectionItem = {
    id: path,
    title: name,
    url: await fsFileUrl(path),
    kind: kindOfExt(ext),
    path,
  };
  if (item.kind === "pdf") item.pages = (await pdfPageCount(item.url)) ?? undefined;
  return { title: name, items: [item], source: { kind: "file", ref: path } };
}

/** A URL a node already carries → a collection of one, no bridge involved. */
export function collectionFromUrl(
  id: string,
  title: string,
  url: string,
): Collection {
  const ext = url.split("?")[0].split("#")[0].split(".").pop() ?? "";
  return {
    title,
    items: [{ id, title, url, kind: kindOfExt(ext) }],
    source: { kind: "node", ref: id },
  };
}

/**
 * How many pages a PDF has, or null when it cannot be told.
 *
 * DECLARED LIMIT. This reads the file's own `/Count`, which is there in plain
 * bytes in an uncompressed PDF and NOT there when the page tree lives in a
 * compressed object stream (`/ObjStm`) — most PDFs a modern tool writes. There
 * is no half-answer here: either the number is read out of the file or the badge
 * is absent. A guessed page count on a document someone is citing would be worse
 * than no badge at all. Real per-page handling means pdf.js, which is phase 2 —
 * and when it lands it fills `pages` for every PDF and turns them into items.
 */
export async function pdfPageCount(url: string): Promise<number | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const size = Number(res.headers.get("Content-Length") ?? 0);
    if (size > 8 * 1024 * 1024) return null; // not worth the bytes to count
    const text = new TextDecoder("latin1").decode(await res.arrayBuffer());
    if (/\/ObjStm/.test(text)) return null; // compressed: the count is not visible
    const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
    if (!counts.length) return null;
    // The catalog's page tree carries the largest /Count; nested Kids carry
    // their own smaller ones.
    return Math.max(...counts);
  } catch {
    return null;
  }
}
