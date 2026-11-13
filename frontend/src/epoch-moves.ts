/**
 * MICRO-OUTLINER-EPOCHE-TOOLTIP p.2 · AN OBJECT (OR A WHOLE CONTAINER) IN MORE
 * EPOCHS: MOVE OR EXTEND (E.D., 13 Nov 2026).
 *
 *   · MOVE   («Sposta qui», a plain drop): the object leaves the epoch it was
 *            in (its first one, or the one it was dragged from) for the target;
 *   · EXTEND («Estendi anche qui», a drop with Alt): it stays where it is and
 *            lives there too;
 *   · REMOVE («Togli da qui»): an epoch it was extended to is taken back (never
 *            its only one, never a unit's first).
 *
 * No rule of the interface: the edges are the ones s3Dgraphy reads.
 *
 *   · a UNIT (and whatever else has a first epoch of its own): `has_first_epoch`
 *     (moved) and `survive_in_epoch` (the extension) — the datamodel's pair;
 *   · a REPRESENTATION MODEL (RM, RMDoc, RMSF): the rule's `epoch_edge`
 *     (em_visual_rules → alternatives, `has_representation_model` FROM the
 *     epoch) — the canonical form `DocumentStore.setFirstEpoch` writes too; an
 *     RM has no «first»: moving swaps one epoch edge, extending adds one. The
 *     old form (the RM's own `has_first_epoch` / `survive_in_epoch`, the RM
 *     Manager's) is read, and a move rewrites it in the canonical one;
 *   · a CONTAINER: the same for every member (deep, `members_of`), and for the
 *     container's own epoch edge when it has one. A member with NO epoch
 *     follows its container (s3Dgraphy `container_epoch_check`) and is left
 *     alone. The Document that publishes the container keeps its date: it is
 *     who published, not which state is shown — said in the preview.
 *
 * «Alternatives do not cross epochs» (s3Dgraphy `resources/alternatives.py`):
 * the epoch is on the hat. A plan that leaves the members of a container with
 * an alternative in different epochs says so: the tileset no longer stands for
 * them (`alternative_sets` warns `epochs`).
 *
 * Pure: the graph in, the edges to remove and to add out; the store applies
 * them in ONE step of undo (`applyEpochPlan`). Checked in node
 * (`scripts/check-epoch-moves.mjs`).
 */
import type { EmDocument, EmEdge, EmNode } from "./types";

export type EpochVerb = "move" | "extend" | "remove";

export const RM_TYPES: ReadonlySet<string> = new Set(["representation_model", "representation_model_doc", "representation_model_sf"]);
export const GROUP_TYPE = "RepresentationModelNodeGroup";
export const MEMBER_EDGE = "is_in_representation_model_group";
/** em_visual_rules → alternatives.epoch_edge (from the epoch to the RM / container) */
export const RM_EPOCH_EDGE = "has_representation_model";
export const FIRST = "has_first_epoch";
export const SURVIVE = "survive_in_epoch";
export const HAT_EDGE = "has_linked_resource";

export interface EpochItem {
  id: string;
  name: string;
  /** the epochs before and after */
  before: string[];
  after: string[];
  /** a member of the container acted on */
  member?: boolean;
}

export interface EpochPlan {
  verb: EpochVerb;
  /** the target epoch (move/extend), the epoch taken back (remove) */
  epoch: string;
  /** the epoch left (move: the one dragged from, else the first) */
  from: string | null;
  /** what was asked: a node, or a container */
  root: string;
  container: boolean;
  items: EpochItem[];
  remove: EmEdge[];
  add: EmEdge[];
  /** what cannot be done, and why (a key + the node) */
  refused: Array<{ id: string; why: "only-epoch" | "first-epoch" | "not-there" | "already" | "no-epoch-kind" }>;
  /** the members without an epoch, that follow the container */
  following: string[];
  /** the documents that publish the container (their date stays) */
  documents: string[];
  /** said, not refused */
  warnings: Array<{ code: "alternative-split"; group: string }>;
}

const live = (e: EmEdge): boolean => !(e as { attributes?: { removed?: unknown } }).attributes?.removed;
const removedNode = (n: EmNode | undefined): boolean => !!(n?.data as Record<string, unknown> | undefined)?.removed;

/** How a node holds its epochs. */
export function epochKind(n: EmNode | undefined): "rm" | "group" | "unit" | null {
  if (!n) return null;
  if (RM_TYPES.has(String(n.node_type))) return "rm";
  if (n.node_type === GROUP_TYPE) return "group";
  if (n.node_type === "EpochNode") return null;
  return "unit";
}

interface G {
  byId: Map<string, EmNode>;
  edges: EmEdge[];
  isEpoch: (id: string) => boolean;
}
function view(doc: EmDocument): G {
  const byId = new Map(doc.graph.nodes.filter((n) => !removedNode(n)).map((n) => [n.id, n]));
  const edges = doc.graph.edges.filter(live).filter((e) => byId.has(e.source) && byId.has(e.target));
  return { byId, edges, isEpoch: (id) => byId.get(id)?.node_type === "EpochNode" };
}

/** The epoch edges of a node, in the forms it may carry them. */
function epochEdges(g: G, id: string): { first: EmEdge[]; survive: EmEdge[]; rmIn: EmEdge[] } {
  const first: EmEdge[] = [], survive: EmEdge[] = [], rmIn: EmEdge[] = [];
  for (const e of g.edges) {
    if (e.source === id && g.isEpoch(e.target)) {
      if (e.edge_type === FIRST) first.push(e);
      else if (e.edge_type === SURVIVE) survive.push(e);
    } else if (e.target === id && e.edge_type === RM_EPOCH_EDGE && g.isEpoch(e.source)) rmIn.push(e);
  }
  return { first, survive, rmIn };
}

/** The epochs of a node, its first one first (a unit's `has_first_epoch`; an
 *  RM's epochs as they come). */
export function epochsOf(doc: EmDocument, id: string): string[] {
  return epochsIn(view(doc), id);
}
function epochsIn(g: G, id: string): string[] {
  const k = epochEdges(g, id);
  const out: string[] = [];
  for (const e of [...k.first, ...k.rmIn]) if (!out.includes(e.source === id ? e.target : e.source)) out.push(e.source === id ? e.target : e.source);
  for (const e of k.survive) if (!out.includes(e.target)) out.push(e.target);
  return out;
}

/** The members of a container, deep (a sub-container's too), as s3Dgraphy's `members_of(deep=True)`. */
export function membersOf(doc: EmDocument, groupId: string): string[] {
  return membersIn(view(doc), groupId);
}
function membersIn(g: G, groupId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([groupId]);
  const walk = (gid: string) => {
    for (const e of g.edges) if (e.edge_type === MEMBER_EDGE && e.target === gid && !seen.has(e.source)) {
      seen.add(e.source);
      out.push(e.source);
      if (g.byId.get(e.source)?.node_type === GROUP_TYPE) walk(e.source);
    }
  };
  walk(groupId);
  return out;
}

/** The container a model is in (the first). */
export function containerOf(doc: EmDocument, id: string): string | null {
  const g = view(doc);
  return g.edges.find((e) => e.source === id && e.edge_type === MEMBER_EDGE && g.byId.get(e.target)?.node_type === GROUP_TYPE)?.target ?? null;
}

const edge = (source: string, target: string, edge_type: string): EmEdge =>
  ({ id: `${source}__${edge_type}__${target}`, source, target, edge_type });

/** One node's change, in the edges of its own form. */
function planOne(g: G, id: string, verb: EpochVerb, epoch: string, from: string | null, plan: EpochPlan, member: boolean): void {
  const n = g.byId.get(id);
  const kind = epochKind(n);
  if (!kind) { plan.refused.push({ id, why: "no-epoch-kind" }); return; }
  const k = epochEdges(g, id);
  const before = epochsIn(g, id);
  const after = before.slice();
  const drop = (e: EmEdge) => { if (!plan.remove.includes(e)) plan.remove.push(e); };
  const put = (e: EmEdge) => { if (!plan.add.some((x) => x.id === e.id)) plan.add.push(e); };
  if (kind === "rm" || kind === "group") {
    // the canonical form: epoch → RM (`has_representation_model`)
    const reaching = (ep: string) => [...k.rmIn.filter((e) => e.source === ep), ...k.first.filter((e) => e.target === ep), ...k.survive.filter((e) => e.target === ep)];
    if (verb === "remove") {
      if (!before.includes(epoch)) { plan.refused.push({ id, why: "not-there" }); return; }
      if (before.length < 2) { plan.refused.push({ id, why: "only-epoch" }); return; }
      reaching(epoch).forEach(drop);
      after.splice(after.indexOf(epoch), 1);
    } else if (verb === "extend") {
      if (before.includes(epoch)) { plan.refused.push({ id, why: "already" }); return; }
      put(edge(epoch, id, RM_EPOCH_EDGE));
      after.push(epoch);
    } else {
      const left = from && before.includes(from) ? from : before[0] ?? null;
      if (left === epoch || (before.includes(epoch) && !left)) { plan.refused.push({ id, why: "already" }); return; }
      if (left) {
        reaching(left).forEach(drop);
        after.splice(after.indexOf(left), 1);
      }
      if (!before.includes(epoch)) { put(edge(epoch, id, RM_EPOCH_EDGE)); after.push(epoch); }
      // the old form of this RM, where it pointed at the epoch left, is gone
      // with it above; another old edge stays as it is (nothing rewritten unasked)
    }
  } else {
    const first = k.first[0]?.target ?? null;
    if (verb === "remove") {
      if (epoch === first) { plan.refused.push({ id, why: "first-epoch" }); return; }
      const s = k.survive.filter((e) => e.target === epoch);
      if (!s.length) { plan.refused.push({ id, why: "not-there" }); return; }
      s.forEach(drop);
      after.splice(after.indexOf(epoch), 1);
    } else if (verb === "extend") {
      if (before.includes(epoch)) { plan.refused.push({ id, why: "already" }); return; }
      put(edge(id, epoch, SURVIVE));
      after.push(epoch);
    } else {
      // move: the first epoch changes (or the survival dragged from)
      const left = from && before.includes(from) ? from : first;
      if (left === epoch) { plan.refused.push({ id, why: "already" }); return; }
      const wasFirst = !left || left === first;
      if (wasFirst) {
        k.first.forEach(drop);
        // the survival in the target becomes its first epoch (one edge, not two)
        k.survive.filter((e) => e.target === epoch).forEach(drop);
        put(edge(id, epoch, FIRST));
      } else {
        k.survive.filter((e) => e.target === left).forEach(drop);
        if (!before.includes(epoch)) put(edge(id, epoch, SURVIVE));
      }
      if (left) after.splice(after.indexOf(left), 1);
      if (!after.includes(epoch)) { if (wasFirst) after.unshift(epoch); else after.push(epoch); }
      else if (wasFirst) { after.splice(after.indexOf(epoch), 1); after.unshift(epoch); }
    }
  }
  plan.items.push({ id, name: String(n?.name ?? id), before, after, ...(member ? { member: true } : {}) });
}

/**
 * The plan of a gesture: `verb` the node (or every member of a container) to
 * `epoch`; `from` is the epoch it was dragged from (a move), null = its first.
 */
export function planEpochs(doc: EmDocument, id: string, verb: EpochVerb, epoch: string, from: string | null = null): EpochPlan {
  const g = view(doc);
  const n = g.byId.get(id);
  const plan: EpochPlan = { verb, epoch, from, root: id, container: n?.node_type === GROUP_TYPE, items: [], remove: [], add: [],
    refused: [], following: [], documents: [], warnings: [] };
  if (!n || !g.isEpoch(epoch)) { plan.refused.push({ id, why: "no-epoch-kind" }); return plan; }
  if (!plan.container) {
    planOne(g, id, verb, epoch, from, plan, false);
  } else {
    // the container's own epoch edge, if it has one (an epoch reaching it)
    if (epochEdges(g, id).rmIn.length) planOne(g, id, verb, epoch, from, plan, false);
    for (const m of membersIn(g, id)) {
      const mn = g.byId.get(m);
      if (mn?.node_type === GROUP_TYPE) { if (epochEdges(g, m).rmIn.length) planOne(g, m, verb, epoch, from, plan, true); continue; }
      if (!epochsIn(g, m).length) { plan.following.push(m); continue; }
      planOne(g, m, verb, epoch, from, plan, true);
    }
    plan.documents = g.edges.filter((e) => e.target === id && e.edge_type === RM_EPOCH_EDGE && g.byId.get(e.source)?.node_type === "document")
      .map((e) => e.source);
    // a refusal of a member that is already there is not a refusal of the gesture
    plan.refused = plan.refused.filter((r) => r.why !== "already" || r.id === id);
  }
  // alternatives do not cross epochs: a container with an alternative whose
  // members end up in different epochs is said
  const touched = new Set(plan.items.map((x) => x.id));
  const groups = new Set<string>();
  for (const x of touched) {
    if (g.byId.get(x)?.node_type === GROUP_TYPE) groups.add(x);
    for (const e of g.edges) if (e.source === x && e.edge_type === MEMBER_EDGE) groups.add(e.target);
  }
  const afterOf = new Map(plan.items.map((x) => [x.id, x.after]));
  for (const gid of groups) {
    if (!g.edges.some((e) => e.source === gid && e.edge_type === HAT_EDGE)) continue;
    const sets = new Set<string>();
    for (const m of membersIn(g, gid)) {
      if (g.byId.get(m)?.node_type === GROUP_TYPE) continue;
      const eps = afterOf.get(m) ?? epochsIn(g, m);
      if (eps.length) sets.add([...eps].sort().join("|"));
    }
    if (sets.size > 1) plan.warnings.push({ code: "alternative-split", group: gid });
  }
  return plan;
}

/** The plan is something to do. */
export const planDoes = (p: EpochPlan): boolean => p.remove.length > 0 || p.add.length > 0;
