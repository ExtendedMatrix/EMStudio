/**
 * ASSETS · ingestion, in bulk — the graph side, pure.
 *
 * The TypeScript twin of `s3dgraphy/dtc/ingest.py` (`api.bucket_acquisition`,
 * `declare_derivation`, `attribute_batch`, `resource_usages`). No JavaScript
 * port of s3dgraphy (invariant 2): what lives here is the *writing* the browser
 * has to do locally because the document in memory IS the truth — the same acts,
 * against the same node and edge types, so a graph built here and a graph built
 * by the library are the same graph.
 *
 * The four decisions this encodes are E.D.'s, and they are why the module is
 * small:
 *
 *  1. **the serial node is the acquisition** (`DTCAcquisitionNode`, crmdig:D12).
 *     Forty photographs are ONE thing in the graph, grouped by `dtc_had_output`.
 *     The files still exist as resources — they have digests, rights and bytes —
 *     but nobody has to scroll past forty top-level entries to reach the study;
 *  2. **no doc-node**: a "document" is a sub-graph (acquisition → process →
 *     output), never a monolith that would have to be kept in step with itself;
 *  3. **the derivation is DECLARED**, with the tool named and nothing more.
 *     Nobody infers that an orthophoto came out of that flight because the dates
 *     line up;
 *  4. **attribution and provenance have different granularity.** Licence and
 *     author belong to the LOT; how-it-was-made belongs to the single OUTPUT. Two
 *     acts, offered at two moments, never fused into one form.
 *
 * Tombstones are skipped on both sides — `liveNodes`/`liveEdges` in, never a
 * write onto a corpse out. That seam has bitten twice already, in two languages.
 */

import type { EmEdge, EmNode } from "./types";

/** The bit of `DocumentStore` this module needs. A structural interface rather
 *  than an import: it keeps `ingest.ts` testable in node (check-ingest.mjs) and
 *  free of the store's own dependency tree. */
import type { AddResourceOptions } from "./resources";

export interface IngestStore {
  liveNodes(): EmNode[];
  liveEdges(): EmEdge[];
  node(id: string): EmNode | undefined | null;
  addNode(node: EmNode): EmNode;
  addEdge(source: string, target: string, edgeType: string): EmEdge;
  updateNode(id: string, patch: Partial<EmNode>): void;
  hasEdge(source: string, target: string, edgeType: string): boolean;
}

export const EDGE_HAD_OUTPUT = "dtc_had_output";
export const EDGE_HAD_INPUT = "dtc_had_input";
export const EDGE_DERIVED_FROM = "dtc_derived_from";

export const ACQUISITION_TYPE = "dtc_acquisition";
export const PROCESS_TYPE = "dtc_process";
export const RESOURCE_TYPE = "resource";

/** What StratiGraph publishes under when nobody says otherwise — the same
 *  default the library exposes (`s3dgraphy.study.DEFAULT_LICENSE`). Exposed
 *  beside the fact, never in place of it: an asset with no licence reads as no
 *  licence, and this is what a form OFFERS. */
export const DEFAULT_ASSET_LICENSE = "CC-BY-SA-4.0";

/** A batch dragged in from somebody's disk. The `acquisition` axis of the
 *  data-driven `dtc_kinds` vocabulary; `download` and `ingest` are the others. */
export const DEFAULT_ACQUISITION_KIND = "local_import";
export const DEFAULT_PROCESS_KIND = "transformation";

/** The three FENCES a resource can come from (SHELF1) and the two residencies.
 *  Re-exported shapes, not new vocabulary. */
export type Scope = "own-study" | "own-HDT" | "other-HDT";
export type Residency = "reference" | "resident";
export const SCOPES: Scope[] = ["own-study", "own-HDT", "other-HDT"];
export const RESIDENCIES: Residency[] = ["resident", "reference"];

// ── what a file IS, and what it is FOR ──────────────────────────────────────
//
// Two different questions, and keeping them apart is what makes the override
// meaningful. The KIND is a fact about the bytes (a .tif is an image, whatever
// anybody intends); the USE is a decision (this image is a IIIF source, that one
// is a page of evidence embedded in a narrative). The first is deduced and
// rarely wrong; the second is deduced as a DEFAULT and is exactly what somebody
// corrects.

export type ResourceKind =
  | "image" | "3d_model" | "point_cloud" | "document" | "video" | "unknown";

/** What a resource is used FOR. `iiif` = an image served through the image API
 *  and annotatable; `proxy` = a 3D model bound to a unit; `document` = a source
 *  to read and extract from; `evidence` = something a narrative embeds. */
export type ResourceUse = "iiif" | "proxy" | "document" | "evidence" | "raw";

const EXT_KIND: Array<[RegExp, ResourceKind]> = [
  [/\.(jpe?g|png|tiff?|bmp|webp|avif|gif)$/i, "image"],
  [/\.(gl(b|tf)|obj|fbx|3ds|blend|ply|stl|dae)$/i, "3d_model"],
  [/\.(e57|pts|las|laz|xyz)$/i, "point_cloud"],
  [/\.(pdf|docx?|txt|odt|md|rtf)$/i, "document"],
  [/\.(mp4|avi|mov|mkv|webm)$/i, "video"],
];

const MEDIA_KIND: Array<[RegExp, ResourceKind]> = [
  [/^image\//i, "image"],
  [/^model\//i, "3d_model"],
  [/^video\//i, "video"],
  [/^(application\/pdf|text\/)/i, "document"],
];

/** The kind of a file, from its name first and its media type second.
 *  The NAME wins because a browser hands `application/octet-stream` for half of
 *  what an archaeologist drags in, and an extension is at least a statement
 *  somebody made. */
export function kindOf(name: string, mediaType?: string): ResourceKind {
  for (const [re, kind] of EXT_KIND) if (re.test(name)) return kind;
  for (const [re, kind] of MEDIA_KIND) if (mediaType && re.test(mediaType)) return kind;
  return "unknown";
}

/** The DEFAULT use for a kind — deduced, and meant to be overridden. */
export function defaultUse(kind: ResourceKind): ResourceUse {
  switch (kind) {
    case "image": return "iiif";
    case "3d_model": return "proxy";
    case "document": return "document";
    case "point_cloud": return "raw";
    case "video": return "evidence";
    default: return "raw";
  }
}

// ── ids: readable, deterministic, never a tombstone's ───────────────────────
//
// The library derives uuid5 ids from the act; here they are readable strings,
// because these nodes land on a canvas somebody reads. What matters is the
// property both share: the same act asked twice must converge on ONE node.

export function slug(text: string): string {
  return text
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    .slice(0, 40) || "x";
}

/** A short deterministic hash (FNV-1a) — for an id derived from a member list
 *  when the lot has no name. Not a digest: nothing verifies it, it only has to
 *  be the same twice. */
export function shortHash(parts: string[]): string {
  let h = 0x811c9dc5;
  for (const s of parts.join("|")) {
    h ^= s.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** `base`, or `base_2`, `base_3`… — measured against EVERY node, tombstones
 *  included: reusing a removed node's id is how a "new" statement ends up
 *  wearing a dead node's clock. */
function freeId(store: IngestStore, base: string): string {
  const taken = new Set<string>();
  for (const n of store.liveNodes()) taken.add(n.id);
  // the store's own `node()` sees tombstoned ones too — ask it as well
  let id = base;
  let i = 2;
  while (taken.has(id) || store.node(id)) id = `${base}_${i++}`;
  return id;
}

export function normaliseDigest(value: string | undefined | null): string {
  if (!value) return "";
  const text = String(value).trim();
  return (text.includes(":") ? text.slice(text.lastIndexOf(":") + 1) : text).toLowerCase();
}

function dataOf(node: EmNode | null | undefined): Record<string, unknown> {
  const d = (node?.data ?? {}) as Record<string, unknown>;
  return d;
}

/** The live resource with these bytes, or null. Digest or node id. */
/**
 * RISORSA-FILE · what the ingestion asks of `addResource` for one file: the
 * implicit form (one file), with the DEDUCED kind and the (correctable) use
 * kept apart — one is a fact about the bytes, the other a decision about them.
 *
 * The weight goes in `size_bytes`, where s3Dgraphy writes it and where
 * EMStudio's own gate reads it (`space.ts`, the 200 MB threshold). Measured
 * before this: the ingestion wrote `data.size`, which nothing read — an
 * ingested file of any weight was «of unknown weight» to the gate.
 */
export function ingestResourceOptions(
  item: { name: string; size?: number; mediaType: string; kind: string; use: string },
  digest: string | null, url: string,
  draft: { residency: string; scope: string }, id: string,
): AddResourceOptions {
  return {
    resourceId: id, name: item.name, kind: item.kind,
    residency: draft.residency, scope: draft.scope,
    files: [{ path: url, checksum: digest, media_type: item.mediaType,
              ...(item.size ? { size_bytes: item.size } : {}) }],
    data: { resource_use: item.use },
  };
}

export function findResource(store: IngestStore, ref: string): EmNode | null {
  if (!ref) return null;
  const byId = store.liveNodes().find((n) => n.id === ref);
  if (byId) return byId;
  const digest = normaliseDigest(ref);
  if (!digest) return null;
  return store.liveNodes().find(
    (n) => normaliseDigest(String(dataOf(n).checksum ?? "")) === digest) ?? null;
}

// ── 1 · the bucket ──────────────────────────────────────────────────────────

export interface BucketOptions {
  /** node ids or digests */
  resources: string[];
  name?: string;
  acquisitionId?: string;
  kind?: string;
  /** representative facts of the lot: camera, date, operator, folder… */
  metadata?: Record<string, unknown>;
}

export interface BucketResult {
  acquisitionId: string;
  created: boolean;
  members: string[];
  added: string[];
  missing: string[];
  count: number;
  warnings: string[];
}

/**
 * Group resources under ONE acquisition event.
 *
 * The membership IS the `dtc_had_output` edges; `data.member_count` is written
 * beside them as a cache for a list that wants a number, recomputed on every
 * call. The edges stay the authority — a count that disagrees is a stale cache,
 * never a second truth.
 *
 * Idempotent. With no id, a NAMED lot keeps its identity (so a second drop adds
 * to it) and an unnamed one is keyed on its members.
 */
export function bucketAcquisition(
  store: IngestStore,
  opts: BucketOptions,
): BucketResult {
  const warnings: string[] = [];
  const members: string[] = [];
  const missing: string[] = [];
  for (const ref of opts.resources ?? []) {
    const node = findResource(store, ref);
    if (!node) {
      missing.push(ref);
      warnings.push(`«${ref}» is not a live resource in this graph: not bucketed`);
      continue;
    }
    if (node.node_type !== RESOURCE_TYPE) {
      missing.push(ref);
      warnings.push(`«${ref}» is a ${node.node_type}: an acquisition groups FILES`);
      continue;
    }
    if (!members.includes(node.id)) members.push(node.id);
  }

  const wanted = opts.acquisitionId
    ?? (opts.name ? `acq_${slug(opts.name)}` : `acq_${shortHash(members)}`);
  let acq = store.node(wanted);
  const created = !acq;
  if (!acq) {
    acq = store.addNode({
      id: freeId(store, wanted),
      name: opts.name || `Acquisizione di ${members.length} file`,
      node_type: ACQUISITION_TYPE,
      description: "",
      data: {
        dtc_kind: opts.kind ?? DEFAULT_ACQUISITION_KIND,
        ...(opts.metadata ?? {}),
      },
    } as unknown as EmNode);
  } else if (acq.node_type !== ACQUISITION_TYPE) {
    throw new Error(
      `«${wanted}» is a ${acq.node_type}, not an acquisition: refusing to turn `
      + "somebody else's node into a bucket");
  }
  const acqId = acq.id;

  const added: string[] = [];
  for (const member of members) {
    if (store.hasEdge(acqId, member, EDGE_HAD_OUTPUT)) continue;
    store.addEdge(acqId, member, EDGE_HAD_OUTPUT);
    added.push(member);
  }

  const live = acquisitionMembers(store, acqId);
  const patch: Record<string, unknown> = {
    ...dataOf(store.node(acqId)),
    ...(opts.metadata ?? {}),
    member_count: live.length,
  };
  store.updateNode(acqId, {
    ...(opts.name ? { name: opts.name } : {}),
    data: patch,
  } as Partial<EmNode>);

  return { acquisitionId: acqId, created, members: live, added, missing,
           count: live.length, warnings };
}

/** The resources this acquisition brought in — read off the live edges. */
export function acquisitionMembers(store: IngestStore, acquisitionId: string): string[] {
  const out: string[] = [];
  for (const e of store.liveEdges()) {
    if (e.edge_type === EDGE_HAD_OUTPUT && e.source === acquisitionId
        && !out.includes(e.target)) out.push(e.target);
  }
  return out;
}

/**
 * The SHARED LEAVES: resources more than one event consumed.
 *
 * The number that says this is a forest and not a set of trees — an orthophoto
 * made from two flights, a photograph feeding both a mesh and a rectification.
 * A stratigraphic matrix cannot draw it (everything there wants a single parent
 * to be nested under), which is why the corpus is a member of its own.
 */
export function sharedLeaves(store: IngestStore): string[] {
  const consumers = new Map<string, Set<string>>();
  for (const e of store.liveEdges()) {
    if (e.edge_type !== EDGE_HAD_INPUT) continue;
    const set = consumers.get(e.target) ?? new Set<string>();
    set.add(e.source);
    consumers.set(e.target, set);
  }
  return [...consumers.entries()]
    .filter(([, events]) => events.size > 1)
    .map(([id]) => id)
    .sort();
}

/** Every live acquisition in the graph, with its member count. */
export function acquisitions(store: IngestStore): Array<{
  id: string; name: string; count: number; kind: string;
}> {
  return store.liveNodes()
    .filter((n) => n.node_type === ACQUISITION_TYPE)
    .map((n) => ({
      id: n.id,
      name: n.name || n.id,
      count: acquisitionMembers(store, n.id).length,
      kind: String(dataOf(n).dtc_kind ?? ""),
    }));
}

// ── 2 · the declared derivation ─────────────────────────────────────────────

export interface DerivationResult {
  processId: string;
  created: boolean;
  output: string;
  inputs: string[];
  missing: string[];
  warnings: string[];
}

/**
 * Declare that `output` came out of `inputs`, with `tool` named.
 *
 * An input may be a resource — which also gets the direct
 * `output ─dtc_derived_from→ input` shortcut — or a whole ACQUISITION, which is
 * the point of the serial node: one input for a campaign, not five hundred.
 * (`dtc_derived_from` runs between files, so an acquisition input gets no
 * shortcut. Reported, not faked.)
 *
 * The tool is `data.tool = {name}` — a dict, so version and parameters are an
 * addition later rather than a migration.
 */
export function declareDerivation(
  store: IngestStore,
  opts: { output: string; inputs: string[]; tool?: string; processId?: string },
): DerivationResult {
  const warnings: string[] = [];
  const out = findResource(store, opts.output);
  if (!out || out.node_type !== RESOURCE_TYPE) {
    throw new Error(
      `«${opts.output}» is not a live resource: declare a derivation after its `
      + "output exists, not instead of it");
  }
  const resolved: EmNode[] = [];
  const missing: string[] = [];
  for (const ref of opts.inputs ?? []) {
    const node = findResource(store, ref);
    if (!node) {
      missing.push(ref);
      warnings.push(`«${ref}» is not in this graph: not recorded as input`);
      continue;
    }
    if (node.node_type !== RESOURCE_TYPE && node.node_type !== ACQUISITION_TYPE) {
      missing.push(ref);
      warnings.push(`«${ref}» is a ${node.node_type}: an input is a resource or `
        + "an acquisition");
      continue;
    }
    if (node.id === out.id) {
      missing.push(ref);
      warnings.push(`«${ref}» is the output itself: a file is not derived from itself`);
      continue;
    }
    if (!resolved.some((n) => n.id === node.id)) resolved.push(node);
  }

  const base = opts.processId
    ?? `dtc_${slug(opts.tool || "derivazione")}_${shortHash([out.id,
        ...resolved.map((n) => n.id).sort()])}`;
  let proc = store.node(base);
  const created = !proc;
  if (!proc) {
    proc = store.addNode({
      id: freeId(store, base),
      name: (opts.tool ?? "").trim() || `derivazione di ${out.name}`,
      node_type: PROCESS_TYPE,
      description: "",
      data: {
        dtc_kind: DEFAULT_PROCESS_KIND,
        ...(opts.tool?.trim() ? { tool: { name: opts.tool.trim() } } : {}),
      },
    } as unknown as EmNode);
  } else if (proc.node_type !== PROCESS_TYPE) {
    throw new Error(`«${base}» is a ${proc.node_type}, not a DTC process`);
  } else if (opts.tool?.trim()) {
    const existing = dataOf(proc).tool;
    const tool = (existing && typeof existing === "object")
      ? { ...(existing as Record<string, unknown>) } : {};
    tool.name = opts.tool.trim();
    store.updateNode(proc.id, { data: { ...dataOf(proc), tool } } as Partial<EmNode>);
  }
  const pid = proc.id;

  if (!store.hasEdge(pid, out.id, EDGE_HAD_OUTPUT))
    store.addEdge(pid, out.id, EDGE_HAD_OUTPUT);
  for (const node of resolved) {
    if (!store.hasEdge(pid, node.id, EDGE_HAD_INPUT))
      store.addEdge(pid, node.id, EDGE_HAD_INPUT);
    if (node.node_type === RESOURCE_TYPE
        && !store.hasEdge(out.id, node.id, EDGE_DERIVED_FROM))
      store.addEdge(out.id, node.id, EDGE_DERIVED_FROM);
  }

  return { processId: pid, created, output: out.id,
           inputs: resolved.map((n) => n.id), missing, warnings };
}

/** What made this file, and what consumed it — one hop each way. */
export function derivationChain(store: IngestStore, resource: string): {
  madeBy: Array<{ id: string; name: string; type: string; tool: string | null }>;
  usedBy: Array<{ id: string; name: string; type: string; tool: string | null }>;
} {
  const node = findResource(store, resource);
  const madeBy: Array<{ id: string; name: string; type: string; tool: string | null }> = [];
  const usedBy: typeof madeBy = [];
  if (!node) return { madeBy, usedBy };
  const card = (id: string) => {
    const event = store.liveNodes().find((n) => n.id === id);
    if (!event) return null;
    const tool = dataOf(event).tool as { name?: string } | undefined;
    return { id: event.id, name: event.name || event.id,
             type: event.node_type, tool: tool?.name ?? null };
  };
  for (const e of store.liveEdges()) {
    if (e.target !== node.id) continue;
    const c = e.edge_type === EDGE_HAD_OUTPUT || e.edge_type === EDGE_HAD_INPUT
      ? card(e.source) : null;
    if (!c) continue;
    if (e.edge_type === EDGE_HAD_OUTPUT) madeBy.push(c);
    else usedBy.push(c);
  }
  return { madeBy, usedBy };
}

// ── 3 · who uses this asset ─────────────────────────────────────────────────

export type UsageRole = "reference" | "annotation" | "chain" | "rights" | "other";

export interface Usage {
  id: string;
  nodeType: string;
  name: string;
  edgeType: string;
  role: UsageRole;
  direction: "incoming" | "outgoing";
}

const USAGE_ROLES: Record<string, UsageRole> = {
  has_linked_resource: "reference",
  has_visual_reference: "reference",
  has_digital_object_part: "reference",
  is_on_resource: "annotation",
  dtc_had_input: "chain",
  dtc_had_output: "chain",
  dtc_derived_from: "chain",
  has_author: "rights",
  has_license: "rights",
  has_embargo: "rights",
};

/**
 * Every live node that refers to this asset, classified by HOW.
 *
 * The question somebody must be able to answer before replacing a file: a
 * photograph cited by three units and a narrative is not a photograph you swap
 * in silence. `rights` is separated from `reference` deliberately — a licence is
 * attached to the file, it is not a use of it, and an inspector that listed them
 * together would bury the citations under the metadata.
 */
export function resourceUsages(store: IngestStore, resource: string): Usage[] {
  const node = findResource(store, resource);
  if (!node) return [];
  const byId = new Map(store.liveNodes().map((n) => [n.id, n]));
  const out: Usage[] = [];
  const seen = new Set<string>();
  for (const e of store.liveEdges()) {
    let other: string | null = null;
    let direction: "incoming" | "outgoing" = "incoming";
    if (e.source === node.id) { other = e.target; direction = "outgoing"; }
    else if (e.target === node.id) { other = e.source; direction = "incoming"; }
    if (!other) continue;
    const neighbour = byId.get(other);
    if (!neighbour) continue;
    const key = `${other}|${e.edge_type}|${direction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: neighbour.id,
      nodeType: neighbour.node_type,
      name: neighbour.name || neighbour.id,
      edgeType: e.edge_type ?? "",
      role: USAGE_ROLES[e.edge_type ?? ""] ?? "other",
      direction,
    });
  }
  out.sort((a, b) => (a.role + a.id).localeCompare(b.role + b.id));
  return out;
}

// ── 4 · supersession: replacing an asset is never silent ────────────────────

export interface Supersession {
  /** the resource already in the graph under this name */
  previous: string;
  previousName: string;
  previousDigest: string;
  /** the nodes that point at it — the reason this is a warning and not a note */
  usages: Usage[];
}

/**
 * Is this upload REPLACING something?
 *
 * Same name, different digest: somebody re-exported a file and is about to put
 * the new bytes beside the old ones. Nothing here decides what to do — the
 * point is that the person is told, with the number of citations at stake,
 * because a superseded asset may no longer be what a published text cites.
 *
 * Same name AND same digest is not a supersession: it is the same object, and
 * the store already says `created: false`.
 */
export function supersessionOf(
  store: IngestStore, name: string, digest: string,
): Supersession | null {
  const wanted = normaliseDigest(digest);
  const previous = store.liveNodes().find(
    (n) => n.node_type === RESOURCE_TYPE
      && (n.name || "") === name
      && normaliseDigest(String(dataOf(n).checksum ?? "")) !== wanted
      && !!dataOf(n).checksum);
  if (!previous) return null;
  return {
    previous: previous.id,
    previousName: previous.name || previous.id,
    previousDigest: String(dataOf(previous).checksum ?? ""),
    usages: resourceUsages(store, previous.id).filter(
      (u) => u.role === "reference" || u.role === "annotation"),
  };
}

/** The honest note on `reference` residency, in one place so every surface says
 *  the same thing. Not a warning about a bug: a statement about where the gate
 *  is. StratiGraph Server reads the graph before serving BYTES IT HOLDS — bytes that stay
 *  on somebody's NAS never pass through it, so an embargo cannot be applied to
 *  them and a licence can only be transported, not enforced. */
export const REFERENCE_NOTE_KEY = "assets.referenceNote";

/** True when this residency + embargo combination is the one that must never be
 *  offered: a file the study says is closed, whose bytes live outside the gate. */
export function referenceIsUnsafe(residency: Residency, embargoed: boolean): boolean {
  return residency === "reference" && embargoed;
}
