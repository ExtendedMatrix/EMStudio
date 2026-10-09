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
import type { EmDocument, EmEdge, EmNode } from "./types";

interface MasterSpec { kind?: string; badge?: string }
interface InstanceRule {
  membership?: string;
  reads?: string;
  readers?: Record<string, string | null>;
  through?: Record<string, string>;
  masters?: Record<string, MasterSpec | string>;
  id?: string;
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
  return { node, out, inn, edges };
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

  for (const mid of members) {
    const node = ix.node.get(mid);
    if (!node || removed(node)) continue;
    const cls = classIn(node.node_type, READERS);
    if (!cls) continue;
    const via = READERS[cls];
    if (!via) { reach(mid, mid); continue; }
    for (const e of outOf(mid, via)) {
      const ext = ix.node.get(e.target);
      if (ext && !removed(ext)) reach(mid, ext.id);
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
