/**
 * QOL1 · recent files — the last em.json / .emj documents opened.
 *
 * Persisted in localStorage (browser) so the list survives a reload; on the
 * Tauri desktop the same store works and a path lets a click reopen the file.
 * A browser drop has no path (the sandbox forbids reopening a file by path), so
 * such entries are listed for memory but cannot be reopened — the caller says
 * so honestly rather than silently failing.
 *
 * MICRO-DOVE-CHI-MENU p.2 · …and the ROOMS entered (node + room): File ▸ Open
 * Recent, the system's File and the Stratigraphy panel read THIS list, the one
 * source; whoever draws it subscribes with `onRecentsChange`.
 *
 * Dedup by path (or name when there is no path; node + room for a room),
 * newest first, capped.
 */
import { dirname, toNative } from "./paths";

export interface RecentFile {
  /** Absolute path (desktop) or null (browser drop — not reopenable). */
  path: string | null;
  /** Display name (file basename, or the room's title). */
  name: string;
  /** Epoch ms of the last open. */
  ts: number;
  /** p.2 · a room on a node rather than a file (absent = a file) */
  kind?: "file" | "room";
  /** the node's address, for a room */
  node?: string;
  /** the room's id, for a room */
  room?: string;
}

const KEY = "em.recentFiles";
const CAP = 10;
const listeners: Array<() => void> = [];

function read(): RecentFile[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (r): r is RecentFile =>
        !!r && typeof (r as RecentFile).name === "string",
    );
  } catch {
    return [];
  }
}

function write(list: RecentFile[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, CAP)));
  } catch {
    /* storage disabled / full — recents are a convenience, never fatal */
  }
  for (const fn of listeners) {
    try { fn(); } catch { /* a drawer that fails does not stop the others */ }
  }
}

/** p.2 · told whenever the list changes (the menus, the panel). */
export function onRecentsChange(fn: () => void): void {
  listeners.push(fn);
}

/** The recent files and rooms, newest first. */
export function getRecents(): RecentFile[] {
  return read().sort((a, b) => b.ts - a.ts);
}

function keyOf(r: Pick<RecentFile, "path" | "name" | "kind" | "node" | "room">): string {
  if (r.kind === "room") return `r:${(r.node ?? "").replace(/\/+$/, "")}|${r.room ?? ""}`;
  return r.path ? `p:${r.path}` : `n:${r.name}`;
}

/** Record an open. Dedups by path (or name when path-less), keeps newest, caps.
 *  `ts` is passed in so the module stays free of ambient Date for tests. */
export function addRecent(
  entry: { path: string | null; name: string },
  ts: number,
): void {
  const k = keyOf(entry);
  const rest = read().filter((r) => keyOf(r) !== k);
  write([{ path: entry.path, name: entry.name, ts }, ...rest]);
}

/** p.2 · record a room entered: reopening it is entering it again. */
export function addRecentRoom(entry: { node: string; room: string; name: string }, ts: number): void {
  const item: RecentFile = { kind: "room", path: null, name: entry.name || entry.room,
                             node: entry.node.replace(/\/+$/, ""), room: entry.room, ts };
  const k = keyOf(item);
  const rest = read().filter((r) => keyOf(r) !== k);
  write([item, ...rest]);
}

/** Drop an entry (e.g. a desktop path that no longer exists). */
export function removeRecent(pathOrName: string): void {
  write(read().filter((r) => (r.path ?? r.name) !== pathOrName));
}

/** p.2 · drop exactly this entry (a room, a file). */
export function removeRecentEntry(entry: RecentFile): void {
  const k = keyOf(entry);
  write(read().filter((r) => keyOf(r) !== k));
}

/** Clear the whole list. */
export function clearRecents(): void {
  write([]);
}

/** p.2 · where an entry lives, said small under its name: the folder of a
 *  file, «node · room» for a room, nothing to reopen for a browser drop. */
export function recentWhere(r: RecentFile): string {
  if (r.kind === "room") {
    const node = (r.node ?? "").replace(/^https?:\/\//, "").replace(/\/em$/, "");
    return `${node} · ${r.room ?? ""}`;
  }
  if (!r.path) return "";
  // said as the platform writes it (`C:\…` on Windows), kept as `/` inside
  return toNative(dirname(r.path)) || r.path;
}

/** p.2 · can this entry be reopened here (a room always; a file by its path). */
export function recentReopenable(r: RecentFile): boolean {
  return r.kind === "room" ? !!(r.node && r.room) : !!r.path;
}
