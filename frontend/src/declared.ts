// NIGHT-RISORSA-FILE · parte 2: the HANDLE of a step and its DECLARED parents.
//
// Two things a stamp of TempluMare needs and the composer did not have:
//
// * THE HANDLE (la maniglia): a tile at one level is ONE resource of a few
//   files — the obj, the mtl it calls, the textures the mtl calls — found by
//   following the references of the entry point (dtcstamp `follow_references`,
//   asked through the bridge), never by the folder. `bundleOutputs` turns the
//   files a person picked into the resources they are: the members of a set
//   are absorbed by its door, so the folder LOD1/ (11 obj + 11 mtl) is 11
//   resources, not 22 outputs.
//
// * THE DECLARED PARENT: what an asset comes from is often not a stamped file —
//   an object inside a .blend (`packaging: datablock`, a `blend://` locator), a
//   file nobody stamped, a set of sources (the photographs of Metashape). It is
//   DECLARED, not stamped: the stamp names it by id and label (`from` carries no
//   path: the locator is private, dtcstamp «Il datablock»), the graph keeps it
//   with `data.declared_only`, and the DTC draws it with another border.
//
// A declared CHAIN is written once and reused: its names may say `{name}` (the
// output's stem) and `{base}` (the stem without `_LOD<n>`), so composing the
// folder LOD1/ instantiates it for each of the 11 tiles.
//
// Pure: no DOM, no network. `check-declared.mjs` asks it directly.
import { uuid5 } from "./commands";
import {
  addResource,
  makeBlendLocator,
  type FileSpec,
  type ResourceGraph,
} from "./resources";
import type { EmNode } from "./types";

export type DeclaredKind = "datablock" | "file" | "sources";
export const DECLARED_KINDS: DeclaredKind[] = ["datablock", "file", "sources"];

export interface DeclaredParent {
  kind: DeclaredKind;
  /** what a person reads; for a datablock, the object's name when empty */
  label: string;
  /** datablock: the .blend (as written, relative to the project) and the object */
  blend_file?: string;
  datablock?: string;
  /** file: its path; sources: a folder (optional — a label is enough) */
  path?: string;
  size_bytes?: number;
}

/** One level of the chain, going UP: level 0 are the parents of what is being
 *  stamped (made by the composer's own act); level i > 0 are the parents of
 *  level i−1, made by the act this level names. */
export interface DeclaredLevel {
  parents: DeclaredParent[];
  technique?: string;
  dtc_kind?: string;
}

/** A member of a file set, as dtcstamp lists it. */
export interface Member {
  role: "entry_point" | "member";
  path: string;
  digest: string;
  size_bytes: number;
}

/** The answer of the bridge for one path (`/stamp/members`). */
export interface FollowedSet {
  members: Member[];
  digest: string;
  warnings?: string[];
  missing?: string[];
  outside?: string[];
  ceiling?: number;
  error?: string;
}

// ── ids ──────────────────────────────────────────────────────────────────────

/** `uuid5(NAMESPACE_URL, "https://extendedmatrix.org/emstudio/declared")` */
const NS = uuid5("6ba7b811-9dad-11d1-80b4-00c04fd430c8", "https://extendedmatrix.org/emstudio/declared");

/** The locator a declared parent is known by, or its label: the SAME object of
 *  the same .blend is one node wherever it is declared (a shared leaf). */
export function declaredKey(p: DeclaredParent): string {
  if (p.kind === "datablock" && p.blend_file && p.datablock)
    return makeBlendLocator(p.blend_file, "Object", p.datablock);
  if (p.path) return `${p.kind}:${p.path}`;
  return `${p.kind}:label:${p.label}`;
}
export const declaredId = (p: DeclaredParent): string => `declared:${uuid5(NS, declaredKey(p))}`;
export const declaredProcessId = (level: DeclaredLevel, outputs: string[]): string =>
  `declared-step:${uuid5(NS, `${level.technique ?? ""}|${level.dtc_kind ?? ""}|${[...outputs].sort().join(",")}`)}`;

// ── {name} and {base}: a chain written once, for every tile ────────────────
//
// Two placeholders, both read from the output's own file name and neither from
// the batch (a first draft read `{tile}` as «the part that varies across the
// batch», and a batch of ONE made it the whole stem — measured: «OB_OB_PODIO_LOD1»):
//   {name}  the stem            OB_PODIO_LOD1.obj → OB_PODIO_LOD1
//   {base}  the stem without _LOD<n>, the LOD-set convention EMStudio already
//           reads (`embed3d-native.ts` LOD_RE)          → OB_PODIO

export const stemOf = (name: string): string => name.replace(/\.[^./]+$/, "");
export const baseOf = (stem: string): string => stem.replace(/_LOD\d+$/i, "");

const fill = (text: string | undefined, stem: string): string | undefined =>
  text === undefined ? undefined
    : text.split("{name}").join(stem).split("{base}").join(baseOf(stem));

/** The chain for ONE output (its stem): every {name} and {base} replaced. */
export function instantiateChain(levels: DeclaredLevel[], stem: string): DeclaredLevel[] {
  return levels.map((lv) => ({
    ...lv,
    technique: fill(lv.technique, stem),
    parents: lv.parents.map((p) => ({
      ...p, label: fill(p.label, stem)!, datablock: fill(p.datablock, stem),
      path: fill(p.path, stem), blend_file: fill(p.blend_file, stem),
    })),
  }));
}

/** Does the chain name something per output? Then each output is its own act. */
export const chainIsTemplate = (levels: DeclaredLevel[]): boolean =>
  /\{(name|base)\}/.test(JSON.stringify(levels));

/** A declared parent's label as a person reads it (a datablock without a label
 *  is its object's name). */
export const parentLabel = (p: DeclaredParent): string =>
  p.label.trim() || p.datablock || (p.path ?? "").split("/").filter(Boolean).pop() || p.kind;

// ── the handle: files → resources ───────────────────────────────────────────

export interface PickedFile { path: string; name: string; size: number }
export interface Bundled<F extends PickedFile> {
  /** the door (the entry point), or the lone file */
  file: F;
  /** the set it opens, when it calls other files (more than one member) */
  set?: FollowedSet;
}

/** The files a person picked, as the RESOURCES they are. A file that another
 *  picked file's set calls is absorbed by that set (its door stands for it); a
 *  door keeps its whole set, members that were not picked included (a texture
 *  in `textures/` is part of the tile even though the folder listing did not
 *  show it). `sets` = the bridge's answer, by path. */
export function bundleOutputs<F extends PickedFile>(files: F[], sets: Map<string, FollowedSet>):
    { resources: Bundled<F>[]; absorbed: string[] } {
  const dirOf = (p: string) => p.slice(0, p.lastIndexOf("/") + 1);
  const called = new Set<string>();
  for (const f of files) {
    const s = sets.get(f.path);
    if (!s || s.error || s.members.length < 2) continue;
    for (const m of s.members) if (m.role !== "entry_point") called.add(dirOf(f.path) + m.path);
  }
  const resources: Bundled<F>[] = [];
  const absorbed: string[] = [];
  for (const f of files) {
    if (called.has(f.path)) { absorbed.push(f.path); continue; }
    const s = sets.get(f.path);
    resources.push(s && !s.error && s.members.length > 1 ? { file: f, set: s } : { file: f });
  }
  return { resources, absorbed };
}

// ── landing a step in the corpus ────────────────────────────────────────────

export const isDeclaredOnly = (n: EmNode | undefined): boolean =>
  !!(n?.data as Record<string, unknown> | undefined)?.declared_only;

/** The resource a declared parent is, as `addResource` makes it. */
export function declaredResource(g: ResourceGraph | null, p: DeclaredParent): EmNode {
  let files: FileSpec[] = [];
  const o: { packaging?: string; tier?: string; kind?: string; dtc?: string } = {};
  if (p.kind === "datablock") {
    if (p.blend_file && p.datablock) files = [{ blend_file: p.blend_file, datablock: p.datablock }];
    Object.assign(o, { packaging: "datablock", tier: "master", kind: "3d_model", dtc: "mesh" });
  } else if (p.kind === "file") {
    if (p.path) files = [{ path: p.path, ...(p.size_bytes ? { size_bytes: p.size_bytes } : {}) }];
    Object.assign(o, { packaging: "file" });
  } else {
    if (p.path) files = [{ path: p.path.replace(/\/*$/, "/") }];
    // a set of sources — the photographs of a model — reads as photographs
    Object.assign(o, { packaging: "directory", kind: "image", dtc: "photo" });
  }
  const id = declaredId(p);
  const existing = g?.node(id);
  if (existing) return existing;
  return addResource(g, {
    resourceId: id, name: parentLabel(p), files,
    ...(o.kind ? { kind: o.kind } : {}),
    ...(o.packaging ? { packaging: o.packaging } : {}),
    ...(o.tier ? { tier: o.tier } : {}),
    data: { declared_only: true, declared_kind: p.kind, ...(o.dtc ? { dtc_kind: o.dtc } : {}) },
  });
}

export interface StepOutput {
  resourceId: string;
  name: string;
  /** the file set, when there is one */
  members?: Member[];
  digest?: string;
  path?: string;
  receipt?: unknown;
}

/** The step just stamped, into the corpus: its outputs (a file set with its
 *  files), the act, and the declared chain above it — every level an act of
 *  its own, `dtc_had_input` / `dtc_had_output` as the DTC reads them. Ids are
 *  derived: landing the same step twice changes nothing, and two tiles that
 *  declare the same photographs share one node. Returns the ids it touched. */
export function landStep(g: ResourceGraph, step: {
  processId: string; dtcKind: string; technique?: string;
  outputs: StepOutput[];
  stampedInputs?: Array<{ resource_id: string; digest?: string; label: string }>;
  levels: DeclaredLevel[];
}): string[] {
  const touched: string[] = [];
  return g.batch(() => {
    const edge = (source: string, target: string, type: string) => {
      const id = `${source}__${type}__${target}`;
      if (!g.edges().some((e) => e.id === id)) g.addEdge({ id, source, target, edge_type: type });
    };
    const process = (id: string, name: string, dtcKind: string, declared: boolean) => {
      if (!g.node(id))
        g.addNode({ id, name, node_type: "dtc_process", description: "",
                    data: { dtc_kind: dtcKind, ...(declared ? { declared_only: true } : {}) } });
      touched.push(id);
    };
    process(step.processId, step.technique || step.dtcKind, step.dtcKind, false);
    for (const o of step.outputs) {
      if (!g.node(o.resourceId)) {
        const files: FileSpec[] = o.members?.length && o.members.length > 1
          ? o.members.map((m) => ({ path: m.path, checksum: m.digest, size_bytes: m.size_bytes, role: m.role }))
          : o.path ? [{ path: o.path, ...(o.digest ? { checksum: o.digest } : {}) }] : [];
        addResource(g, { resourceId: o.resourceId, name: o.name, kind: "3d_model",
          ...(o.members && o.members.length > 1 ? { packaging: "file_set" } : {}),
          files,
          data: { dtc_kind: "mesh",
                  ...(o.members && o.members.length > 1 && o.digest
                    ? { checksum: o.digest, digest_covers: "members" } : {}),
                  ...(o.receipt ? { stamp_receipt: o.receipt } : {}) } });
      }
      touched.push(o.resourceId);
      edge(step.processId, o.resourceId, "dtc_had_output");
    }
    for (const i of step.stampedInputs ?? []) {
      if (!g.node(i.resource_id))
        addResource(g, { resourceId: i.resource_id, name: i.label,
                         data: i.digest ? { checksum: i.digest } : {} });
      edge(step.processId, i.resource_id, "dtc_had_input");
    }
    let below = [step.processId];
    let belowResources: string[] = step.outputs.map((o) => o.resourceId);
    step.levels.forEach((lv, i) => {
      const ids = lv.parents.map((p) => declaredResource(g, p).id);
      touched.push(...ids);
      if (i === 0) {
        for (const pid of ids) for (const b of below) edge(b, pid, "dtc_had_input");
      } else {
        const pid = declaredProcessId(lv, belowResources);
        process(pid, lv.technique || lv.dtc_kind || "step", lv.dtc_kind || "transformation", true);
        for (const r of belowResources) edge(pid, r, "dtc_had_output");
        for (const x of ids) edge(pid, x, "dtc_had_input");
        below = [pid];
      }
      belowResources = ids;
    });
    return touched;
  });
}
