/**
 * MICRO-VIEWER-UNICO · WHAT THE VIEWER OPENS, for one node of the graph.
 *
 * The Viewer shows ONE node at a time, of two kinds (E.D., 20 Oct 2026):
 *
 *   · a RESOURCE — one file with its versions;
 *   · a node that GROUPS coherent resources, typically a DOCUMENT: the Viewer
 *     opens the whole document, not its first file. Its images are scrolled
 *     inside it; a container of 3D models (D.01 → Survey2015, ten models and
 *     the container's own tileset) becomes a small scene of that document only.
 *
 * And it says WHERE what it shows comes from: a document's own file, a linked
 * resource, the crop an extractor took, a representation model, a container.
 * A document that declares no file and shows a model (D.09: «0 file» in the old
 * Doc, 87 models) is not a mystery any more — the line says «87 modelli di
 * rappresentazione».
 *
 * Pure: a graph in, a description out. `main.ts` draws it (`renderViewerInto`).
 */
import type { EmEdge, EmNode } from "./types";
import { mediumOfFile } from "./doc-form";

export type ViewerMedium = "image" | "text" | "pdf" | "3d";

/** Where a part reaches the node shown: its own locator, a linked resource,
 *  the crop of one of its extractors, a representation model, a container. */
export type ViewerVia = "own" | "linked" | "extractor" | "rm" | "container";

/** One thing the Viewer can show of the node — an image, a text, a PDF, or a
 *  file of 3D that is not a representation model (a model is in `models`). */
export interface ViewerPart {
  /** the node that holds the locator (the document itself, or a resource) */
  id: string;
  name: string;
  medium: ViewerMedium;
  locator: string;
  via: ViewerVia;
  /** the node it came through (the extractor of a crop), when not the target */
  through?: string;
}

export interface ViewerTarget {
  /** what kind of node is shown — `none` when the node holds nothing to see */
  kind: "document" | "resource" | "model" | "group" | "none";
  /** the node shown (an extractor selected shows its DOCUMENT) */
  id: string;
  /** the document annotations go to: the document shown, or the document of
   *  the model / container / resource; null for a resource nobody records */
  docId: string | null;
  parts: ViewerPart[];
  /** the representation models of the scene (ids), in the graph's order */
  models: string[];
  /** the RM containers the models are in */
  groups: string[];
  /** the reading to highlight: the extractor (or region) that was selected */
  reading: string | null;
  /** the node selected, when it is not the one shown (an extractor → its document) */
  from: string | null;
}

export const RM_TYPES = new Set(["representation_model", "representation_model_doc", "representation_model_sf"]);
const RM_GROUP_TYPE = "RepresentationModelNodeGroup";
const RM_GROUP_EDGE = "is_in_representation_model_group";

interface G { nodes: EmNode[]; edges: EmEdge[] }

const removed = (n: EmNode | undefined): boolean => !!((n?.data ?? {}) as Record<string, unknown>).removed;
const edgeRemoved = (e: EmEdge): boolean => !!((e as { attributes?: Record<string, unknown> }).attributes ?? {}).removed;

/** The medium of a locator for the Viewer: the Doc's rule (`mediumOfFile`) with
 *  the PDF told apart from a text — it has its own reader. */
export function viewerMediumOf(locator: string): ViewerMedium {
  const clean = locator.split(/[?#]/)[0];
  if (/\.pdf$/i.test(clean)) return "pdf";
  return mediumOfFile(clean);
}

/** A node's locator: `data.url`, `filename` or `path` (the Viewer's old rule). */
export function locatorOf(n: EmNode | undefined): string | null {
  const d = (n?.data ?? {}) as Record<string, unknown>;
  for (const k of ["url", "filename", "path"]) {
    const v = d[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** The last segment of a locator, to tell one file from its copy («DosCo/D.02 x.pdf» = «D.02 x.pdf»). */
const leafOf = (s: string): string => decodeURIComponent(s.split(/[?#]/)[0]).split(/[\\/]/).pop()?.toLowerCase() ?? s;

export function viewerTargetOf(g: G, nodeId: string | null): ViewerTarget | null {
  if (!nodeId) return null;
  const byId = new Map<string, EmNode>();
  for (const n of g.nodes) if (!removed(n)) byId.set(n.id, n);
  const outE = new Map<string, EmEdge[]>(), inE = new Map<string, EmEdge[]>();
  for (const e of g.edges) {
    if (edgeRemoved(e)) continue;
    (outE.get(e.source) ?? outE.set(e.source, []).get(e.source)!).push(e);
    (inE.get(e.target) ?? inE.set(e.target, []).get(e.target)!).push(e);
  }
  const out = (id: string, type: string) => (outE.get(id) ?? []).filter((e) => e.edge_type === type).map((e) => e.target).filter((x) => byId.has(x));
  const inn = (id: string, type: string) => (inE.get(id) ?? []).filter((e) => e.edge_type === type).map((e) => e.source).filter((x) => byId.has(x));
  const node = byId.get(nodeId);
  if (!node) return null;
  const type = node.node_type;
  const isDoc = (id: string) => byId.get(id)?.node_type === "document";
  const isRm = (id: string) => RM_TYPES.has(byId.get(id)?.node_type ?? "");
  const isGroup = (id: string) => byId.get(id)?.node_type === RM_GROUP_TYPE;
  const groupOf = (rm: string) => out(rm, RM_GROUP_EDGE).find(isGroup) ?? null;
  const membersOf = (grp: string) => inn(grp, RM_GROUP_EDGE).filter(isRm);
  const docOfRm = (rm: string) => inn(rm, "has_representation_model").find(isDoc) ?? null;
  const docOfGroup = (grp: string) => inn(grp, "has_representation_model").find(isDoc)
    ?? membersOf(grp).map(docOfRm).find(Boolean) ?? null;
  const empty = (kind: ViewerTarget["kind"], id: string, docId: string | null): ViewerTarget =>
    ({ kind, id, docId, parts: [], models: [], groups: [], reading: null, from: null });

  const docTarget = (docId: string): ViewerTarget => {
    const t = empty("document", docId, docId);
    const seen = new Map<string, ViewerPart>();
    const push = (holder: EmNode, via: ViewerVia, through?: string) => {
      const loc = locatorOf(holder);
      if (!loc) return;
      const medium = viewerMediumOf(loc);
      const key = leafOf(loc);
      const twin = seen.get(key);
      if (twin) {
        // the same file twice: the document's own locator and the resource
        // linked to it («D.08 Ordine_Corinzio.jpg» and «DosCo/D.08 …», measured
        // on the v3.3). The RESOURCE wins: it carries the folder, the checksum
        // and the state the resolver reads — the bare name of the document was
        // the «image not reachable» of the old Doc on D.08
        if (twin.via === "own" && via === "linked") Object.assign(twin, { id: holder.id, name: String(holder.name || holder.id), locator: loc, via });
        return;
      }
      const part: ViewerPart = { id: holder.id, name: String(holder.name || holder.id), medium, locator: loc, via, ...(through ? { through } : {}) };
      seen.set(key, part);
      t.parts.push(part);
    };
    const d = byId.get(docId)!;
    push(d, "own");
    for (const r of out(docId, "has_linked_resource")) push(byId.get(r)!, "linked");
    // the crops its extractors took (D.07.01 … D.07.05 of D.07): pictures OF the document
    for (const x of inn(docId, "extracted_from")) {
      if (byId.get(x)?.node_type !== "extractor") continue;
      for (const r of out(x, "has_linked_resource")) {
        const loc = locatorOf(byId.get(r));
        // an external link that is not a picture of this study (osiris…) is shown too: the
        // Viewer says it is a link; the medium decides
        if (loc) push(byId.get(r)!, "extractor", x);
      }
    }
    for (const m of out(docId, "has_representation_model")) {
      if (isRm(m)) { if (!t.models.includes(m)) t.models.push(m); const grp = groupOf(m); if (grp && !t.groups.includes(grp)) t.groups.push(grp); }
      else if (isGroup(m)) {
        if (!t.groups.includes(m)) t.groups.push(m);
        for (const r of membersOf(m)) if (!t.models.includes(r)) t.models.push(r);
      }
    }
    return t;
  };

  if (type === "document") return docTarget(nodeId);
  if (type === "extractor" || type === "annotation_region") {
    // an extractor reads the document directly, or a region that is on it
    const regions = type === "annotation_region" ? [nodeId] : out(nodeId, "extracted_from").filter((x) => byId.get(x)?.node_type === "annotation_region");
    const doc = (type === "extractor" ? out(nodeId, "extracted_from").find(isDoc) : undefined)
      ?? regions.flatMap((r) => out(r, "is_on_resource")).find(isDoc) ?? null;
    if (!doc) return empty("none", nodeId, null);
    const x = type === "extractor" ? nodeId : inn(nodeId, "extracted_from").find((e) => byId.get(e)?.node_type === "extractor") ?? null;
    return { ...docTarget(doc), reading: x, from: nodeId };
  }
  if (RM_TYPES.has(type)) {
    const t = empty("model", nodeId, docOfRm(nodeId));
    t.models = [nodeId];
    const grp = groupOf(nodeId);
    if (grp) t.groups = [grp];
    return t;
  }
  if (type === RM_GROUP_TYPE) {
    const t = empty("group", nodeId, docOfGroup(nodeId));
    t.models = membersOf(nodeId);
    t.groups = [nodeId];
    return t;
  }
  if (type === "resource" || type === "resource_file") {
    // a resource is shown as itself; a 3D one that a model holds is shown as
    // that model (its versions are the model's), and records the model's document
    const holders = inn(nodeId, "has_linked_resource");
    const rm = holders.find(isRm);
    if (rm) {
      const t = empty("resource", nodeId, docOfRm(rm));
      t.models = [rm];
      return t;
    }
    const t = empty("resource", nodeId, holders.find(isDoc)
      ?? holders.map((h) => byId.get(h)?.node_type === "extractor" ? out(h, "extracted_from").find(isDoc) : undefined).find(Boolean) ?? null);
    const loc = locatorOf(node);
    if (loc) t.parts.push({ id: nodeId, name: String(node.name || nodeId), medium: viewerMediumOf(loc), locator: loc, via: "own" });
    return t;
  }
  return empty("none", nodeId, null);
}

/** What the Viewer shows, in one line of words for its bar — the reader of the
 *  sentence is E.D. looking at D.09 and asking where that model came from.
 *  `texts` are the translated pieces (main.ts gives them). */
export function viewerSourceLine(t: ViewerTarget, texts: {
  models: (n: number) => string; group: (name: string) => string; own: string; linked: (n: number) => string;
  crops: (n: number) => string; nothing: string; name: (id: string) => string;
}): string {
  const bits: string[] = [];
  const own = t.parts.filter((p) => p.via === "own").length;
  const linked = t.parts.filter((p) => p.via === "linked").length;
  const crops = t.parts.filter((p) => p.via === "extractor").length;
  if (own) bits.push(texts.own);
  if (linked) bits.push(texts.linked(linked));
  if (crops) bits.push(texts.crops(crops));
  if (t.models.length) bits.push(texts.models(t.models.length));
  for (const grp of t.groups) bits.push(texts.group(texts.name(grp)));
  return bits.length ? bits.join(" · ") : texts.nothing;
}

// ── PARTE 2 · the version: one, the lightest or the tileset; the higher ones by hand ──

/** One version as the Viewer weighs it (`main.ts` fills it from the Space's rows). */
export interface WeighedVersion {
  id: string;
  /** «derivata lod4», «LOD0» */
  label: string;
  /** who made it: the author's level, or a version derived by a recipe */
  origin: "author" | "recipe" | "other";
  /** the weight, measured (the file's `size_bytes`, a set's files summed) — null unknown */
  bytes: number | null;
  /** the triangles, the graph's or the measures' cache — the tiebreak, and the
   *  order when the weight is unknown */
  tris: number | null;
  /** the order of the chain (lod-levels' rank: 0 = the finest) */
  rank: number;
}

/** The versions of one model, from the lightest to the heaviest: by the weight
 *  measured, then by the triangles, then by the chain (a coarser rank is
 *  lighter). Unknown weights go after the known ones of the same rank. */
export function ladderOf(vs: readonly WeighedVersion[]): WeighedVersion[] {
  return [...vs].sort((a, b) => {
    if (a.bytes != null && b.bytes != null && a.bytes !== b.bytes) return a.bytes - b.bytes;
    if (a.tris != null && b.tris != null && a.tris !== b.tris) return a.tris - b.tris;
    if ((a.bytes == null) !== (b.bytes == null)) return b.rank - a.rank || (a.bytes == null ? 1 : -1);
    return b.rank - a.rank;
  });
}

/**
 * MICRO-VIEWER-SPAZIO-EMTREE p.2 (E.D., 21 Oct 2026: «dopo 2 s partiva la
 * grande e rallentava tutta l'interfaccia») · the Viewer loads ONE version and
 * never climbs by itself: the higher ones are E.D.'s to choose. A choice is a
 * level of the document's models (the same label on every model that has it,
 * the bytes summed), or the tileset of one of its containers — the container's
 * hat, which joins the high and the low resolution and is the best way to work
 * on it, so it is the default when there is one; else the lightest level.
 */
export interface VersionChoice {
  /** the level's label, or `tileset:<container>` */
  key: string;
  /** «derivata lod4», «LOD2», the tileset's name */
  label: string;
  /** who made it (the level), or a tileset */
  kind: WeighedVersion["origin"] | "tileset";
  /** the bytes: summed over the models that have it; a tileset's own (0: unknown) */
  bytes: number;
  /** how many models have that level (a tileset: the models it covers) */
  models: number;
  /** over the threshold of the Preferences: loaded only when chosen */
  over: boolean;
}

/** A container of the document that has a tileset: its id, its name, the tileset's weight. */
export interface TilesetOfDoc { group: string; name: string; bytes: number | null; covers: number }

/** The Viewer's «Versioni»: the tilesets first, then the levels from the
 *  lightest; `def` the one shown when nobody chose. */
export function versionChoices(ladders: Map<string, WeighedVersion[]>, tilesets: readonly TilesetOfDoc[],
  limitBytes: number): { choices: VersionChoice[]; def: string | null } {
  const levels = new Map<string, VersionChoice>();
  for (const l of ladders.values()) for (const v of l) {
    const c = levels.get(v.label) ?? { key: v.label, label: v.label, kind: v.origin, bytes: 0, models: 0, over: false };
    c.bytes += v.bytes ?? 0;
    c.models++;
    levels.set(v.label, c);
  }
  // the order of the levels: the lightest first — by the bytes, then by the
  // chain of the first model that has it (a coarser rank is lighter)
  const rankOf = (label: string) => Math.max(...[...ladders.values()].map((l) => l.find((v) => v.label === label)?.rank ?? -1));
  const lv = [...levels.values()].sort((a, b) => a.bytes - b.bytes || rankOf(b.label) - rankOf(a.label));
  for (const c of lv) c.over = c.bytes > limitBytes;
  const ts: VersionChoice[] = tilesets.map((x) => ({ key: `tileset:${x.group}`, label: x.name, kind: "tileset", bytes: x.bytes ?? 0, models: x.covers, over: false }));
  const choices = [...ts, ...lv];
  return { choices, def: ts[0]?.key ?? lv[0]?.key ?? null };
}
