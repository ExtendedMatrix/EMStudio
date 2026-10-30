/**
 * MICRO-TILESET-SHIFT-E-EPOCHE p.3 (25 Oct 2026) · files and folders dropped
 * from the Finder (Explorer, Files) on the DESKTOP app.
 *
 * In Tauri v2 the shell takes the system's file drops (`dragDropEnabled`, true
 * by default and written in tauri.conf.json): the page receives no HTML5
 * `drop` with Files, it receives the shell's drag-drop event — absolute PATHS
 * and the pointer's position. So the desktop drop is the STORAGE provenance,
 * not the browser's Files: a path on disk the bridge reads (and «Prepara»
 * packs beside it), routed by `droppedFromPath` exactly as a Storage drag.
 *
 * What goes where, said once here and checked by
 * `scripts/check-desktop-drop.mjs`:
 *
 *   · on a Viewer or a Scene, a tileset's business is claimed — a folder, a
 *     .zip / .3tz, a `tileset.json`. Several paths: a folder first (X/ beside
 *     its X.json: the folder; `droppedFromPath` finds the root beside it),
 *     then an archive (X/ alone in a zip finds its X.json beside the zip),
 *     then `tileset.json`. A folder on a Viewer that holds no tileset is
 *     pinned as a collection, as a Storage folder is;
 *   · everything else is the window-wide drop of the browser: the first file
 *     opens as a document (em.json, .emj, GraphML) through the door the OS's
 *     «Open With» uses (`openPathFromDesktop`);
 *   · a folder or an archive anywhere else is said, not opened as a graph;
 *   · MICRO-INGRESSO-ASSET-1 · on the ARCHIVE (the File window), the files and
 *     folders that are not a graph ENTER: «Fai entrare un asset» opens on
 *     them (a graph among them still opens as before).
 *
 * Pure (no DOM, no Tauri).
 */

import { basename } from "./paths";
export type PathKind = "dir" | "file";
export interface DroppedPath { path: string; kind: PathKind }
export interface DropTarget { win: string; type: string }

export type DesktopDropPlan =
  | { action: "tileset"; win: string; path: string; type: PathKind; pinFolder: boolean }
  | { action: "open"; path: string }
  | { action: "ingress"; win: string; paths: string[] }
  | { action: "none"; why: "empty" | "folder-elsewhere" | "archive-elsewhere" };

/** the window types a tileset is dropped on (as `dropTilesetOn`) */
export const TILESET_TARGETS = ["viewer", "scene"] as const;

const ARCHIVE = /\.(3tz|zip)$/i;
const DOC = /\.(em\.json|emj|json|graphml|xml)$/i;
/** a graph, which a drop on the Archive still opens */
const GRAPH = /\.(em\.json|emj|graphml)$/i;
/** extensions a dropped path is a FILE by, without asking the disk */
const KNOWN_FILE = /\.(em\.json|emj|json|graphml|xml|3tz|zip|ttl|xlsx|csv|txt|md|pdf|png|jpe?g|tiff?|webp|gif|obj|glb|gltf|ply|las|laz|e57|b3dm|blend)$/i;

const strip = (p: string): string => String(p ?? "").replace(/\\/g, "/").replace(/(?<=.)\/+$/, "");
const base = (p: string): string => basename(strip(p));

/** a dropped path's kind when the disk cannot be asked: a known extension is a
 *  file, a name without one a folder (`Geometry`, `tileset_X`) */
export function guessKind(path: string): PathKind {
  const b = base(path);
  return KNOWN_FILE.test(b) || /\.[A-Za-z0-9]{1,5}$/.test(b) ? "file" : "dir";
}

/** might these paths be a tileset? Only names — during the hover the disk is
 *  not asked: an archive, `tileset.json`, a name with no extension. */
export function mightBeTileset(paths: string[]): boolean {
  return paths.some((p) => {
    const b = base(p);
    return ARCHIVE.test(b) || b.toLowerCase() === "tileset.json" || guessKind(p) === "dir";
  });
}

const isTilesetTarget = (t: DropTarget | null): t is DropTarget =>
  !!t && (TILESET_TARGETS as readonly string[]).includes(t.type);

/** what a drop of `items` on `target` (the window under the pointer, or null)
 *  does */
export function planDesktopDrop(items: DroppedPath[], target: DropTarget | null): DesktopDropPlan {
  const list = items.map((i) => ({ path: strip(i.path), kind: i.kind })).filter((i) => i.path);
  if (!list.length) return { action: "none", why: "empty" };
  const dirs = list.filter((i) => i.kind === "dir");
  const files = list.filter((i) => i.kind === "file");
  const archives = files.filter((i) => ARCHIVE.test(base(i.path)));
  if (isTilesetTarget(target)) {
    const pick = dirs[0] ?? archives[0] ?? files.find((i) => base(i.path).toLowerCase() === "tileset.json");
    if (pick) return { action: "tileset", win: target.win, path: pick.path, type: pick.kind,
                       pinFolder: target.type === "viewer" && pick.kind === "dir" };
  }
  const notArchives = files.filter((i) => !ARCHIVE.test(base(i.path)));
  if (target?.type === "storage" && !notArchives.some((i) => GRAPH.test(base(i.path))))
    return { action: "ingress", win: target.win, paths: list.map((i) => i.path) };
  const doc = notArchives.find((i) => DOC.test(base(i.path))) ?? notArchives[0];
  if (doc) return { action: "open", path: doc.path };
  return { action: "none", why: dirs.length ? "folder-elsewhere" : "archive-elsewhere" };
}

/** the shell's position in CSS pixels, what `elementFromPoint` takes. Tauri
 *  types it PHYSICAL, and on Windows it is (WebView2: client pixels); on macOS
 *  wry hands the NSView's POINTS (`draggingLocation`, y flipped), which are
 *  already CSS pixels, and GTK's are logical too (wry 0.55, read in its source).
 *  So the device pixel ratio divides on Windows only. */
export function toCssPoint(pos: { x: number; y: number } | null | undefined, dpr: number,
                           physical: boolean): { x: number; y: number } | null {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null;
  const s = physical && dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  return { x: pos.x / s, y: pos.y / s };
}

/** whether the shell's positions are physical pixels (Windows) */
export const positionsArePhysical = (userAgent: string): boolean => /Windows/i.test(userAgent);
