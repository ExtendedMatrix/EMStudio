/**
 * FONTE · the instance is a view (E.D., 9 Oct 2026, evening: «l'istanza è una
 * vista»). In the DATA an extractor is `extracted_from` the MASTER — the
 * canonical document, or the property in its own unit; there is no instance
 * node. In the VIEW every paradata group draws, inside it, every master outside
 * it that one of its readers reaches, with the badge of where it comes from.
 *
 * The rule is DATA: `em_visual_rules.json` → `paradata_instances` (1.6.33),
 * vendored by `sync-datamodels.sh`. Its reference implementation is s3Dgraphy's
 * `paradata_view.view_instances`, which reads the same block; this module is
 * the client that draws without Python and follows the same fields — the edge
 * types, the reader and master classes, the hop through a region, the badge
 * edge and the id pattern all come from the block, the classes are judged on
 * the vendored hierarchy (`rules.classIsA`). `scripts/check-instances.mjs`
 * holds it to the library's answer on the same documents.
 *
 * Pure over an em.json document: nothing is written.
 */
import visualRules from "./assets/em_visual_rules.json";
import { isRemoved } from "./crdt";
import { ownersOf } from "./paradata-chain";
import { classIsA, classOf } from "./rules";
import { entityEpoch, epochBounds, type EpochBounds } from "./doc-dating";
import type { EmDocument, EmEdge, EmNode } from "./types";

interface MasterSpec { kind?: string; badge?: string }
interface InstanceRule {
  membership?: string;
  reads?: string;
  readers?: Record<string, string | null>;
  through?: Record<string, string>;
  masters?: Record<string, MasterSpec | string>;
  id?: string;
  /** 1.6.34 · the author of a reading is drawn in the group that reads */
  authorship?: { edge?: string; masters?: Record<string, MasterSpec | string> };
}

const RULE: InstanceRule =
  ((visualRules as unknown as { paradata_instances?: InstanceRule }).paradata_instances) ?? {};
const MEMBERSHIP = RULE.membership ?? "is_in_paradata_nodegroup";
const READS = RULE.reads ?? "extracted_from";
const READERS: Record<string, string | null> = RULE.readers ?? { ExtractorNode: null, CombinerNode: "combines" };
const THROUGH: Record<string, string> = RULE.through ?? { AnnotationRegionNode: "is_on_resource" };
const MASTERS: Record<string, MasterSpec> = Object.fromEntries(
  Object.entries(RULE.masters ?? {}).filter(([k, v]) => !k.startsWith("_") && typeof v === "object"),
) as Record<string, MasterSpec>;
// MICRO-AUTORI-LAYOUT · the authorship block (rules 1.6.34), read as
// `paradata_view.author_of` reads it
const AUTHOR_EDGE = RULE.authorship?.edge ?? "has_author";
const AUTHOR_MASTERS: Record<string, MasterSpec> = Object.fromEntries(
  Object.entries(RULE.authorship?.masters ?? {}).filter(([k, v]) => !k.startsWith("_") && typeof v === "object"),
) as Record<string, MasterSpec>;

/** One instance to draw inside a group — the fields of `view_instances`. */
export interface ViewInstance {
  /** `<master>##<group>`: the same id in every client */
  id: string;
  master: string;
  kind: string;
  node_type: string;
  name: string;
  /** the badge: the unit of a property (its original owner), the epoch of a
   *  document (`has_first_epoch`); null when there is none */
  owner: string | null;
  owner_kind: "unit" | "epoch" | null;
  owner_name: string | null;
  removed: boolean;
  /** the members of the group that read it */
  readers: string[];
  /** the extractors whose `extracted_from` the view re-attaches to the instance */
  extractors: string[];
  /** the annotation regions crossed on the way to a document */
  through: string[];
}

/** `paradata_instances.id` filled. */
export function instanceId(master: string, group: string): string {
  return (RULE.id ?? "{master}##{group}").split("{master}").join(master).split("{group}").join(group);
}

/** The master an instance id names, or null when the id is no instance's. */
export function masterOfInstanceId(id: string): string | null {
  const i = id.indexOf("##");
  return i > 0 ? id.slice(0, i) : null;
}

function classIn(nodeType: string | undefined, names: Record<string, unknown>): string | null {
  const c = classOf(nodeType);
  for (const name of Object.keys(names)) if (classIsA(c, name)) return name;
  return null;
}

/** An index of the document, built once for many groups. */
export interface ViewIndex {
  node: Map<string, EmNode>;
  out: Map<string, EmEdge[]>;
  inn: Map<string, EmEdge[]>;
  edges: EmEdge[];
  /** the epochs' bounds, read once */
  bounds: () => EpochBounds[];
}

export function viewIndex(doc: EmDocument): ViewIndex {
  const node = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  const out = new Map<string, EmEdge[]>();
  const inn = new Map<string, EmEdge[]>();
  const edges: EmEdge[] = [];
  for (const e of doc.graph.edges) {
    if (((e.attributes ?? {}) as Record<string, unknown>).removed) continue;
    edges.push(e);
    (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e);
    (inn.get(e.target) ?? inn.set(e.target, []).get(e.target)!).push(e);
  }
  let b: EpochBounds[] | null = null;
  return { node, out, inn, edges, bounds: () => (b ??= epochBounds(doc)) };
}

const removed = (n: EmNode | undefined): boolean =>
  !!n && isRemoved(n as unknown as Record<string, unknown>);

/**
 * The instances to draw inside the paradata group `groupId`, one per master in
 * the order its first reader appears. An unknown id, or a node that is not a
 * ParadataNodeGroup, gives `[]`.
 */
export function viewInstances(doc: EmDocument, groupId: string, ix: ViewIndex = viewIndex(doc)): ViewInstance[] {
  const group = ix.node.get(groupId);
  if (!group || group.node_type !== "ParadataNodeGroup") return [];
  const outOf = (id: string, type: string) => (ix.out.get(id) ?? []).filter((e) => e.edge_type === type);
  const members: string[] = [];
  for (const e of ix.inn.get(groupId) ?? [])
    if (e.edge_type === MEMBERSHIP && !members.includes(e.source)) members.push(e.source);
  const memberSet = new Set(members);
  const records = new Map<string, ViewInstance>();

  const badge = (master: EmNode, spec: MasterSpec): string | null => {
    if (spec.badge === "has_property") {
      // the original owner — the TS reading of `ownership.original_owner`
      const own = ownersOf(doc, master.id).filter((o) =>
        !((o.edge.attributes ?? {}) as Record<string, unknown>).removed);
      return own.find((o) => o.original)?.owner ?? null;
    }
    // MICRO-AUTORI-LAYOUT · the epoch a document or an author stands in: the
    // one of its own date, else its has_first_epoch (`entity_epoch`)
    if (spec.badge === "has_first_epoch") return entityEpoch(doc, master.id, ix.bounds(), ix.node).epoch;
    if (spec.badge) for (const e of outOf(master.id, spec.badge)) return e.target;
    return null;
  };

  const reach = (readerId: string, extractorId: string): void => {
    for (const e of outOf(extractorId, READS)) {
      let target = ix.node.get(e.target);
      const crossed: string[] = [];
      const via = target ? classIn(target.node_type, THROUGH) : null;
      if (target && via) {
        crossed.push(target.id);
        const hops = outOf(target.id, THROUGH[via]).map((x) => ix.node.get(x.target));
        target = hops.find((h) => !!h && !!classIn(h.node_type, MASTERS));
      }
      const cls = target ? classIn(target.node_type, MASTERS) : null;
      if (!target || !cls || memberSet.has(target.id)) continue;
      let rec = records.get(target.id);
      if (!rec) {
        const spec = MASTERS[cls];
        const owner = badge(target, spec);
        const ownerNode = owner ? ix.node.get(owner) : undefined;
        rec = {
          id: instanceId(target.id, groupId), master: target.id, kind: spec.kind ?? "",
          node_type: target.node_type, name: String(target.name ?? target.id),
          owner,
          owner_kind: owner ? (spec.badge === "has_property" ? "unit" : spec.badge === "has_first_epoch" ? "epoch" : null) : null,
          owner_name: owner ? String(ownerNode?.name ?? owner) : null,
          removed: removed(target), readers: [], extractors: [], through: [],
        };
        records.set(target.id, rec);
      }
      if (!rec.readers.includes(readerId)) rec.readers.push(readerId);
      if (!rec.extractors.includes(extractorId)) rec.extractors.push(extractorId);
      for (const r of crossed) if (!rec.through.includes(r)) rec.through.push(r);
    }
  };

  // MICRO-AUTORI-LAYOUT · `paradata_view.author_of`: the author of a reader (or
  // of an extractor a combiner reaches) is drawn in the group, badge its epoch
  const authorOf = (readerId: string, nodeId: string): void => {
    if (!Object.keys(AUTHOR_MASTERS).length) return;
    for (const e of outOf(nodeId, AUTHOR_EDGE)) {
      const author = ix.node.get(e.target);
      const cls = author ? classIn(author.node_type, AUTHOR_MASTERS) : null;
      if (!author || !cls || memberSet.has(author.id)) continue;
      let rec = records.get(author.id);
      if (!rec) {
        const owner = badge(author, AUTHOR_MASTERS[cls]);
        const ownerNode = owner ? ix.node.get(owner) : undefined;
        rec = {
          id: instanceId(author.id, groupId), master: author.id, kind: AUTHOR_MASTERS[cls].kind ?? "",
          node_type: author.node_type, name: String(author.name ?? author.id),
          owner, owner_kind: owner ? "epoch" : null, owner_name: owner ? String(ownerNode?.name ?? owner) : null,
          removed: removed(author), readers: [], extractors: [], through: [],
        };
        records.set(author.id, rec);
      }
      if (!rec.readers.includes(readerId)) rec.readers.push(readerId);
      if (nodeId !== readerId && !rec.extractors.includes(nodeId)) rec.extractors.push(nodeId);
    }
  };

  for (const mid of members) {
    const node = ix.node.get(mid);
    if (!node || removed(node)) continue;
    const cls = classIn(node.node_type, READERS);
    if (!cls) continue;
    const via = READERS[cls];
    authorOf(mid, mid);
    if (!via) { reach(mid, mid); continue; }
    for (const e of outOf(mid, via)) {
      const ext = ix.node.get(e.target);
      if (ext && !removed(ext)) { reach(mid, ext.id); authorOf(mid, ext.id); }
    }
  }
  return [...records.values()];
}

/** `viewInstances` for every live paradata group that has some. */
export function allViewInstances(doc: EmDocument): Map<string, ViewInstance[]> {
  const ix = viewIndex(doc);
  const out = new Map<string, ViewInstance[]>();
  for (const n of doc.graph.nodes) {
    if (n.node_type !== "ParadataNodeGroup" || removed(n)) continue;
    const recs = viewInstances(doc, n.id, ix);
    if (recs.length) out.set(n.id, recs);
  }
  return out;
}

// ── MICRO-SPAZIO-3D · the 3D among the computed instances (rules 1.6.35) ─────
//
// `threed_instances`: the proxy of a unit drawn in the paradata group of its
// geometry property, beside it; a representation model in the paradata group of
// every epoch that has it (directly or through an epoch property), with the
// number of its epochs. The client of s3Dgraphy's `paradata_view.threed_instances`,
// field for field; `scripts/check-threed.mjs` holds it to the library's answer.

interface ThreedRule {
  proxy?: { kind?: string; owner_edge?: string; property_type?: string; shape_edge?: string;
            file_edge?: string; file_types?: string[]; membership?: string; group_edge?: string };
  representation_model?: { kind?: string; holders?: string[]; edge?: string; via_property?: string;
                           masters?: string[]; group_edge?: string; count_word?: string };
  id?: string;
}
const THREED: ThreedRule = ((visualRules as unknown as { threed_instances?: ThreedRule }).threed_instances) ?? {};

/** One 3D instance — the fields of `threed_instances`. */
export interface ThreedInstance {
  id: string;
  kind: "proxy" | "rm";
  master: string;
  node_type: string;
  name: string;
  owner: string;
  owner_kind: "unit" | "epoch";
  owner_name: string;
  /** proxy: the geometry property it hangs from */
  beside?: string;
  /** rm: the epoch property the link passes through, null when direct */
  via?: string | null;
  /** the paradata group it is drawn in, null when the owner has none */
  group: string | null;
  /** the group, else the owner */
  place: string;
  /** proxy: its `proxy_model` resources; empty: neither file nor hulls */
  files?: string[];
  empty?: boolean;
  /** rm: every epoch it is in, how many, and «×N» when more than one */
  epochs?: string[];
  count?: number;
  count_label?: string | null;
  removed: boolean;
}

export function threedInstanceId(master: string, place: string): string {
  return (THREED.id ?? "{master}##{place}").split("{master}").join(master).split("{place}").join(place);
}

function propertyType(n: EmNode | undefined): string {
  const d = (n?.data ?? {}) as Record<string, unknown>;
  return String((n as unknown as { property_type?: unknown })?.property_type ?? d.property_type ?? "");
}

const isUnitNode = (n: EmNode): boolean => {
  const c = classOf(n.node_type);
  return classIsA(c, "StratigraphicNode") && !classIsA(c, "ContinuityNode") && !removed(n);
};

function proxyPayload(ix: ViewIndex, shape: EmNode): { files: string[]; hulls: boolean } {
  const spec = THREED.proxy ?? {};
  const types = new Set(spec.file_types ?? ["proxy_model"]);
  const files: string[] = [];
  for (const e of ix.out.get(shape.id) ?? []) {
    if (e.edge_type !== (spec.file_edge ?? "has_linked_resource")) continue;
    const r = ix.node.get(e.target);
    const d = (r?.data ?? {}) as Record<string, unknown>;
    if (!r || removed(r) || r.node_type !== "resource") continue;
    if (types.has(String(d.url_type ?? "")) || types.has(String(d.resource_type ?? ""))) files.push(r.id);
  }
  const sd = (shape.data ?? {}) as Record<string, unknown>;
  const has = (v: unknown) => Array.isArray(v) && v.length > 0;
  return { files, hulls: has(sd.convexshapes) || has(sd.spheres) };
}

function placeOf(ix: ViewIndex, owner: string, prop: string | null, membership: string, groupEdge: string): string | null {
  const live = (id: string) => { const n = ix.node.get(id); return !!n && !removed(n); };
  if (prop) for (const e of ix.out.get(prop) ?? []) if (e.edge_type === membership && live(e.target)) return e.target;
  for (const e of ix.out.get(owner) ?? []) if (e.edge_type === groupEdge && live(e.target)) return e.target;
  return null;
}

/** The proxies and the representation models as the view draws them. Pure. */
export function threedInstances(doc: EmDocument, ix: ViewIndex = viewIndex(doc)): ThreedInstance[] {
  const out: ThreedInstance[] = [];
  const outOf = (id: string, type: string) => (ix.out.get(id) ?? []).filter((e) => e.edge_type === type).map((e) => e.target);
  // proxies
  const ps = THREED.proxy ?? {};
  const membership = ps.membership ?? "is_in_paradata_nodegroup";
  const groupEdge = ps.group_edge ?? "has_paradata_nodegroup";
  const seen = new Set<string>();
  for (const unit of doc.graph.nodes) {
    if (!isUnitNode(unit)) continue;
    for (const pid of outOf(unit.id, ps.owner_edge ?? "has_property")) {
      const prop = ix.node.get(pid);
      if (!prop || removed(prop) || propertyType(prop) !== (ps.property_type ?? "geometry")) continue;
      const owners = ownersOf(doc, pid).filter((o) => !((o.edge.attributes ?? {}) as Record<string, unknown>).removed);
      const orig = owners.find((o) => o.original)?.owner ?? unit.id;
      if (orig !== unit.id) continue;
      for (const sid of outOf(pid, ps.shape_edge ?? "has_semantic_shape")) {
        const shape = ix.node.get(sid);
        if (!shape || seen.has(`${pid}|${sid}`)) continue;
        seen.add(`${pid}|${sid}`);
        const pay = proxyPayload(ix, shape);
        const group = placeOf(ix, unit.id, pid, membership, groupEdge);
        const place = group ?? unit.id;
        out.push({ id: threedInstanceId(sid, place), kind: "proxy", master: sid, node_type: shape.node_type,
                   name: String(shape.name ?? sid), owner: unit.id, owner_kind: "unit",
                   owner_name: String(unit.name ?? unit.id), beside: pid, group, place,
                   files: pay.files, empty: !pay.files.length && !pay.hulls, removed: removed(shape) });
      }
    }
  }
  // representation models
  const rs = THREED.representation_model ?? {};
  const holders = rs.holders ?? ["EpochNode"];
  const edge = rs.edge ?? "has_representation_model";
  const viaProp = rs.via_property ?? "has_property";
  const masters = rs.masters ?? ["RepresentationModelNode", "RepresentationModelDocNode", "RepresentationModelSpecialFindNode"];
  const word = rs.count_word ?? "×{n}";
  const isA = (n: EmNode | undefined, names: string[]) => !!n && names.some((c) => classIsA(classOf(n.node_type), c));
  const links = new Map<string, Array<{ owner: string; via: string | null }>>();
  for (const holder of doc.graph.nodes) {
    if (removed(holder) || !isA(holder, holders)) continue;
    const reached: Array<[string, string | null]> = outOf(holder.id, edge).map((rm) => [rm, null]);
    for (const pid of outOf(holder.id, viaProp)) {
      const p = ix.node.get(pid);
      if (p && !removed(p)) for (const rm of outOf(pid, edge)) reached.push([rm, pid]);
    }
    for (const [rmId, via] of reached) {
      if (!isA(ix.node.get(rmId), masters)) continue;
      const mine = links.get(rmId) ?? links.set(rmId, []).get(rmId)!;
      if (mine.some((x) => x.owner === holder.id)) continue;
      mine.push({ owner: holder.id, via });
    }
  }
  for (const [rmId, mine] of links) {
    const rm = ix.node.get(rmId)!;
    const epochs = mine.map((x) => x.owner);
    const n = epochs.length;
    for (const x of mine) {
      const group = placeOf(ix, x.owner, x.via, membership, rs.group_edge ?? groupEdge);
      const place = group ?? x.owner;
      out.push({ id: threedInstanceId(rmId, place), kind: "rm", master: rmId, node_type: rm.node_type,
                 name: String(rm.name ?? rmId), owner: x.owner, owner_kind: "epoch",
                 owner_name: String(ix.node.get(x.owner)?.name ?? x.owner), via: x.via, group, place,
                 epochs: [...epochs], count: n, count_label: n > 1 ? word.split("{n}").join(String(n)) : null,
                 removed: removed(rm) });
    }
  }
  return out;
}

/** `units_without_3d`: the units with a proxy, with an empty geometry, with none. */
export function unitsWithout3d(doc: EmDocument, ix: ViewIndex = viewIndex(doc)):
    { with: string[]; empty: string[]; none: string[]; without: string[] } {
  const ps = THREED.proxy ?? {};
  const res = { with: [] as string[], empty: [] as string[], none: [] as string[], without: [] as string[] };
  const outOf = (id: string, type: string) => (ix.out.get(id) ?? []).filter((e) => e.edge_type === type).map((e) => e.target);
  for (const unit of doc.graph.nodes) {
    if (!isUnitNode(unit)) continue;
    const props = outOf(unit.id, ps.owner_edge ?? "has_property").map((p) => ix.node.get(p))
      .filter((p): p is EmNode => !!p && !removed(p) && propertyType(p) === (ps.property_type ?? "geometry"));
    if (!props.length) { res.none.push(unit.id); continue; }
    let full = false;
    for (const p of props) for (const sid of outOf(p.id, ps.shape_edge ?? "has_semantic_shape")) {
      const shape = ix.node.get(sid);
      if (!shape || removed(shape)) continue;
      const pay = proxyPayload(ix, shape);
      if (pay.files.length || pay.hulls) full = true;
    }
    (full ? res.with : res.empty).push(unit.id);
  }
  res.without = [...res.empty, ...res.none];
  return res;
}
