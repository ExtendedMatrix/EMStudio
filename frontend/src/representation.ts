// NIGHT-RISORSA-FILE · parte 3 · the viewer CHOOSES the representation, and
// resolves the paths of its files — offline and online.
//
// From a document (or a Representation Model) the viewer reaches its
// resources; `pickRepresentation` (the mirror of s3Dgraphy's) walks the
// representations of the same thing and returns the first whose PACKAGING this
// viewer opens — `file_set`, `file`, `directory`, `archive` — then the current
// revision of it (s3Dgraphy leaves that to the reader: «(a) i lettori chiamano
// current_revision»). A `datablock` opens only in Blender, and says so with the
// name of its `.blend`.
//
// THE PATHS. A file set is asked under a VIRTUAL base (`https://emres.invalid/
// <resource>/`), so the obj asks its mtl and the mtl its textures relative to
// it, as the files themselves say; three's `LoadingManager.setURLModifier` then
// turns each such URL into a real address, from the `has_file` edges:
//   offline — the file's own locator, beside the em.json (through the bridge);
//   online  — the file's digest in the store (`…/asset/sha256:…`).
// The entry point is found by its own locator beside the em.json; every other
// file by the `path` of its `has_file` edge, relative to the entry point. A path
// the graph does not list is not guessed online (there is no address for it)
// and is resolved beside the entry point offline; both are reported.
//
// Pure: `check-representation.mjs` asks it directly.
import {
  currentRevision,
  parseBlendLocator,
  pickRepresentation,
  resourceFiles,
  type ResourceGraph,
} from "./resources";

/** The packagings EMStudio's viewer opens (a datablock only Blender does). */
export const WEB_OPENS = ["file_set", "file", "directory", "archive"];

export interface ChosenFile { role: string; path: string; locator: string; checksum: string | null }

export type ModelChoice =
  | { kind: "open"; resourceId: string; name: string; packaging: string; entry: ChosenFile;
      files: ChosenFile[]; reason: string; startId: string }
  | { kind: "blender"; resourceId: string; name: string; blendFile: string; datablock: string; reason: string }
  | { kind: "none"; reason: string };

/** The resources a document or an RM reaches: its own `has_linked_resource`,
 *  and — for a document — those of the RMs it has (`has_representation_model`). */
export function startResources(g: ResourceGraph, nodeId: string): string[] {
  const edges = g.edges();
  const linked = (id: string) => edges.filter((e) => e.source === id && e.edge_type === "has_linked_resource")
    .map((e) => e.target).filter((t) => g.node(t)?.node_type === "resource");
  const rms = edges.filter((e) => e.source === nodeId && /^has_representation_model/.test(String(e.edge_type)))
    .map((e) => e.target);
  return [...new Set([...linked(nodeId), ...rms.flatMap(linked)])];
}

/** Does a resource need the choice (files, a datablock, representations), or
 *  is it the plain one-file resource the viewer always opened by its url? */
export function needsChoice(g: ResourceGraph, resId: string): boolean {
  const d = (g.node(resId)?.data ?? {}) as Record<string, unknown>;
  if (!d.url || String(d.url).startsWith("blend://")) return true;
  if (d.packaging === "file_set" || d.packaging === "datablock") return true;
  return g.edges().some((e) => (e.edge_type === "has_file" && e.source === resId)
    || (e.edge_type === "dtc_derived_from" && (e.source === resId || e.target === resId)));
}

export function chooseModel(g: ResourceGraph, starts: string[], canOpen: string[] = WEB_OPENS): ModelChoice {
  let blender: ModelChoice | null = null;
  const reasons: string[] = [];
  for (const start of starts) {
    const pick = pickRepresentation(g, start, canOpen);
    if (pick.picked) {
      let id = pick.picked.id;
      try { id = currentRevision(g, id); } catch { /* a fork: the pick stays, the inspector says why */ }
      const files = resourceFiles(g, id).map((f) => {
        const d = (f.node.data ?? {}) as Record<string, unknown>;
        return { role: f.role, path: f.path, locator: String(d.url ?? ""),
                 checksum: typeof d.checksum === "string" ? d.checksum : null };
      });
      const entry = files.find((f) => f.role === "entry_point") ?? files[0];
      if (!entry) { reasons.push(`${id}: no file`); continue; }
      const node = g.node(id)!;
      return { kind: "open", resourceId: id, name: String(node.name ?? id),
               packaging: pick.picked.packaging, entry, files,
               reason: id === pick.picked.id ? pick.reason : `${pick.reason}; its current revision is ${id}`,
               startId: start };
    }
    reasons.push(pick.reason);
    const db = pick.candidates.find((c) => c.packaging === "datablock");
    if (db && !blender) {
      const url = String(((g.node(db.id)?.data ?? {}) as Record<string, unknown>).url ?? "");
      const parsed = parseBlendLocator(url);
      blender = { kind: "blender", resourceId: db.id, name: db.name,
                  blendFile: parsed?.[0] ?? "", datablock: parsed?.[2] ?? db.name, reason: pick.reason };
    }
  }
  return blender ?? { kind: "none", reason: reasons.join("; ") || "no resource" };
}

// ── the addresses ───────────────────────────────────────────────────────────

export type AddressContext =
  /** offline: the folder of the em.json, and how a path on disk is fetched */
  | { mode: "offline"; baseDir: string; fileUrl: (absPath: string) => string }
  /** online: how a digest is fetched from the store */
  | { mode: "online"; assetUrl: (checksum: string) => string };

export const VIRTUAL = "https://emres.invalid/";

const isAbsolute = (p: string) => p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p);
function joinPath(a: string, b: string): string {
  // an empty base joins nothing: `b` stays relative (measured: "" + "x.obj" was
  // "/x.obj", and the file was then asked at the root of the disk)
  const parts = (isAbsolute(b) || !a ? b : `${a.replace(/\/*$/, "/")}${b}`).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop(); else if (p !== "." && (p || !out.length)) out.push(p);
  }
  return out.join("/");
}

export interface AddressMap {
  /** the URL a loader is handed: the entry point under the virtual base */
  entryUrl: string;
  /** three's `setURLModifier` (and the tiles' `preprocessURL`): virtual → real */
  modifier: (url: string) => string;
  /** the virtual paths a loader asked that the graph does not list */
  unlisted: string[];
  /** what each file resolved to, for the probes */
  resolved: Map<string, string>;
}

export function addressMap(choice: Extract<ModelChoice, { kind: "open" }>, ctx: AddressContext): AddressMap {
  const base = `${VIRTUAL}${encodeURIComponent(choice.resourceId)}/`;
  const byPath = new Map(choice.files.map((f) => [joinPath("", f.path), f]));
  const resolved = new Map<string, string>();
  const unlisted: string[] = [];
  // offline: where the entry is on disk (its own locator, beside the em.json)
  const entryAbs = ctx.mode === "offline" ? joinPath(ctx.baseDir, choice.entry.locator || choice.entry.path) : "";
  const entryRoot = entryAbs ? entryAbs.slice(0, entryAbs.length - choice.entry.path.length) : "";
  const real = (rel: string): string => {
    const f = byPath.get(rel);
    if (ctx.mode === "online") {
      if (f?.checksum) return ctx.assetUrl(f.checksum);
      unlisted.push(rel);
      return `${VIRTUAL}unlisted/${encodeURIComponent(rel)}`;
    }
    // the path on the edge is relative to the entry point: that is what it
    // declares, and what the obj and the mtl themselves ask
    if (!f) unlisted.push(rel);
    return ctx.fileUrl(joinPath(entryRoot, rel));
  };
  const modifier = (url: string): string => {
    if (!url.startsWith(base)) return url;
    const rel = joinPath("", decodeURIComponent(url.slice(base.length).split(/[?#]/)[0]));
    const r = real(rel);
    resolved.set(rel, r);
    return r;
  };
  return { entryUrl: `${base}${choice.entry.path.split("/").map(encodeURIComponent).join("/")}`,
           modifier, unlisted, resolved };
}
