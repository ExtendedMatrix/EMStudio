/**
 * MICRO-WINDOWS-MODELLI p.5 · «Raccogli le risorse…» — Maya's «Collect Files»,
 * Blender's «Pack Resources» for a study: the files it names OUTSIDE its folder
 * (an absolute path, `onedrive://`, `smb://`, a `blend://` whose .blend is
 * elsewhere, a relative one that climbs out) are listed with where each would
 * go inside it, by type; the bridge copies them (`POST /fs/collect`, never a
 * move, every copy checked by sha256) and the urls are written again relative
 * to the em.json, in one undo.
 *
 * Pure: `check-collect.mjs`. Paths are `/`-shaped (paths.ts), Windows too.
 */
import { basename, dirname, hasScheme, isAbsolute, isInside, join, normalize, relativeTo, resolveRelative, rootOf } from "./paths";
import { parseBlendLocator } from "./resources";

/** a file of the document: a node with a `data.url` */
export interface DocFile { id: string; name: string; url: string; urlType?: string; packaging?: string }

export type OutsideKind = "absolute" | "onedrive" | "smb" | "blend";
export type CollectType = "model" | "document" | "image" | "other";

export interface OutsideFile {
  id: string; name: string; url: string; kind: OutsideKind; type: CollectType;
  /** the file (or folder) on this computer; null when it cannot be reached from here */
  src: string | null;
  /** why it cannot be collected: an `onedrive://` with no OneDrive folder set, a share */
  why?: "onedrive" | "smb";
  /** a folder (a file set), not one file */
  folder: boolean;
  /** what the bridge reads to know what the set needs (`file_set` of `image`: its images) */
  packaging?: string; urlType?: string;
}

const MODEL = /\.(obj|glb|gltf|ply|fbx|stl|dae|3ds|3tz|las|laz|e57|xyz|pts|blend|x3d|usd[az]?|abc)$/i;
const DOC = /\.(pdf|docx?|odt|rtf|txt|md|xlsx?|ods|csv|tsv|pptx?|xml|json|html?)$/i;
const IMAGE = /\.(jpe?g|png|tiff?|webp|gif|bmp|heic|svg|exr|hdr)$/i;

const MAX_UP = 2;

/** the study's folder: the em.json's own, or the one its relative locators
 *  climb to (`../RB/x.glb` → the folder above `EM/`), at most two levels up —
 *  the same rule as the bridge's `_doc_roots` */
export function studyRootOf(emjson: string, locators: string[]): string {
  const folder = dirname(emjson);
  let top = folder;
  for (const loc0 of locators) {
    const loc = parseBlendLocator(loc0)?.[0] ?? loc0;
    if (!loc || hasScheme(loc) || isAbsolute(loc)) continue;
    const target = dirname(resolveRelative(emjson, loc));
    const a = folder.slice(rootOf(folder).length).split("/").filter(Boolean);
    const b = target.slice(rootOf(target).length).split("/").filter(Boolean);
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    const ups = a.length - i;
    const common = rootOf(folder) + a.slice(0, i).join("/");
    if (ups > 0 && ups <= MAX_UP && common.length < top.length && i > 0) top = normalize(common);
  }
  return top;
}

function typeOf(f: DocFile, folder: boolean, path: string): CollectType {
  const ut = (f.urlType ?? "").toLowerCase();
  if (ut === "3d_model" || MODEL.test(path)) return "model";
  if (folder) return ut === "document" ? "document" : ut === "image" ? "image" : "other";
  if (ut === "image" || IMAGE.test(path)) return "image";
  if (ut === "document" || DOC.test(path)) return "document";
  return "other";
}

/** the files of the document that live outside the study's folder `root` */
export function outsideFiles(files: DocFile[], emjson: string, root: string, onedriveRoot?: string | null): OutsideFile[] {
  const out: OutsideFile[] = [];
  for (const f of files) {
    const url = String(f.url ?? "").trim();
    if (!url) continue;
    const folder = /\/$/.test(url) || f.packaging === "file_set" || f.packaging === "directory";
    const od = /^onedrive:\/\/(.*)$/i.exec(url);
    if (od) {
      const src = onedriveRoot ? join(onedriveRoot, decodeURIComponentSafe(od[1])) : null;
      if (src && isInside(root, src)) continue;
      out.push({ id: f.id, name: f.name, url, kind: "onedrive", type: typeOf(f, folder, od[1]), src, folder,
        packaging: f.packaging, urlType: f.urlType, ...(src ? {} : { why: "onedrive" as const }) });
      continue;
    }
    if (/^smb:\/\//i.test(url)) {
      out.push({ id: f.id, name: f.name, url, kind: "smb", type: typeOf(f, folder, url), src: null, folder, why: "smb" });
      continue;
    }
    const blend = parseBlendLocator(url);
    if (blend) {
      const src = resolveRelative(emjson, blend[0]);
      if (!isAbsolute(src) || isInside(root, src)) continue;
      out.push({ id: f.id, name: f.name, url, kind: "blend", type: "model", src, folder: false });
      continue;
    }
    if (hasScheme(url)) continue;                 // a web locator: not a file of this computer
    const src = resolveRelative(emjson, url);
    if (!isAbsolute(src) || isInside(root, src)) continue;
    out.push({ id: f.id, name: f.name, url, kind: "absolute", type: typeOf(f, folder, src), src, folder, packaging: f.packaging, urlType: f.urlType });
  }
  return out;
}

function decodeURIComponentSafe(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

export interface CollectRoots { models: string; documents: string }

/** the type folders proposed: the models under `RB/<the folder that holds
 *  their folders at the source>` (`3DModels` for Templu Mare's blocks), the
 *  documents and images in `DosCo/` beside the em.json (`EM/DosCo` in v4) */
export function defaultRoots(items: OutsideFile[], emjson: string, root: string): CollectRoots {
  const names = new Map<string, number>();
  for (const it of items) {
    if (it.type !== "model" || !it.src) continue;
    const parent = it.folder ? normalize(it.src).replace(/\/$/, "") : dirname(it.src);
    const gp = basename(dirname(parent));
    if (gp) names.set(gp, (names.get(gp) ?? 0) + 1);
  }
  const best = [...names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  const emDir = dirname(emjson);
  const rel = isInside(root, emDir) && normalize(emDir) !== normalize(root) ? emDir.slice(normalize(root).replace(/\/$/, "").length + 1) : "";
  return { models: best ? `RB/${best}` : "RB/raccolti", documents: rel ? `${rel}/DosCo` : "DosCo" };
}

/** where each collectable file goes, relative to the study's folder: the
 *  files that share a folder at the source share one inside the study (an
 *  OBJ and its renders, `RB/3DModels/TM015/`), under the models' folder when
 *  one of them is a model, else the documents'. Two source folders with one
 *  name get `-2`, `-3`. */
export function proposeDest(items: OutsideFile[], roots: CollectRoots): Map<string, string> {
  const groups = new Map<string, OutsideFile[]>();
  for (const it of items) {
    if (!it.src) continue;
    const key = it.folder ? normalize(it.src).replace(/\/$/, "") : dirname(it.src);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(it);
  }
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const [srcFolder, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const model = list.some((x) => x.type === "model");
    const base = model ? roots.models : roots.documents;
    // documents keep their names in one folder; a model's folder keeps its name
    const keepFolder = model || list.some((x) => x.folder);
    let rel = keepFolder ? `${base}/${basename(srcFolder) || "file"}` : base;
    if (keepFolder) {
      let n = 2;
      const stem = rel;
      while (taken.has(rel.toLowerCase())) rel = `${stem}-${n++}`;
      taken.add(rel.toLowerCase());
    }
    for (const it of list) out.set(it.id, normalize(rel));
  }
  return out;
}

/** the url a collected file gets: relative to the em.json — a folder with its
 *  `/`, a `blend://` with its datablock */
export function collectedUrl(it: OutsideFile, destFolderAbs: string, emjson: string): string {
  if (!it.src) return it.url;
  const target = it.folder ? `${normalize(destFolderAbs).replace(/\/$/, "")}/` : join(destFolderAbs, basename(it.src));
  const rel = relativeTo(emjson, target);
  if (it.kind === "blend") {
    const frag = it.url.slice(it.url.indexOf("#"));
    return `blend://${rel}${frag}`;
  }
  return rel;
}

/** the bridge's plan or result, per item */
export interface CollectRow { id: string; ok: boolean; error?: string; notes: string[];
  files: Array<{ src: string; dest: string; bytes: number; state: "new" | "shared" | "there" | "conflict" | "copied" | "failed"; sha256?: string; error?: string }> }

/** what a plan or a run comes to: files, bytes, conflicts */
export function totals(rows: CollectRow[]): { files: number; bytes: number; there: number; conflicts: number; copied: number; copiedBytes: number; failed: number } {
  let files = 0, bytes = 0, there = 0, conflicts = 0, copied = 0, copiedBytes = 0, failed = 0;
  for (const r of rows) for (const f of r.files) {
    if (f.state === "shared") continue;      // another item of the plan brings it
    files++;
    if (f.state === "new") bytes += f.bytes;
    if (f.state === "there") there++;
    if (f.state === "conflict") conflicts++;
    if (f.state === "copied") { copied++; copiedBytes += f.bytes; }
    if (f.state === "failed") failed++;
  }
  return { files, bytes, there, conflicts, copied, copiedBytes, failed };
}
