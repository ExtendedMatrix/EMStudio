/**
 * THE ALTERNATIVES OF A 3D OBJECT — the common hat (E.D., 17 Oct 2026; s3Dgraphy
 * `resources.alternatives`, em_visual_rules 1.6.37 → `alternatives`). Pure:
 * `scripts/check-alternatives.mjs` passes s3Dgraphy's cases
 * (`alternative_cases.json`, vendored) through it.
 *
 * A set of alternatives is the group of 3D resources that represent the same
 * thing with the same coverage in different forms — `lod` (a chain of levels),
 * `fidelity` (the master against its versions), `packaging` (meshes against a
 * tileset). Two resources are alternatives IF AND ONLY IF they have the same
 * HAT: the RM, or the RM container (connections 1.6.41), that reaches their
 * asset with `has_linked_resource`. A declaration, never read from the DTC
 * (this replaces `tileset-alt.ts`, which computed the alternative of a
 * container from the derivations: on Templu Mare the tileset and the models are
 * siblings of one survey, and siblings are not alternatives).
 *
 * Two nested levels: the RM (master, LODs, formats of one piece) and the
 * container (a tileset of the whole survey: choosing it switches the members
 * off, and the members then choose their LOD). The rule is DATA — the edges, the
 * hat types, how a tileset is recognised — read from the vendored
 * `em_visual_rules.json`; the writes (`planDeclareAlternative`,
 * `planSubcontainer`) give the same ids as s3Dgraphy's `declare_alternative`
 * and `make_subcontainer`.
 */
import { assetOf, chooseVersion, versionsOf, type VersionChoice, type VersionEntry, type VersionGraph } from "./asset-versions";
import type { EmEdge, EmNode } from "./types";

export interface AlternativesRule {
  hat_edge: string;
  hats: { rm: string[]; container: string[] };
  member_edge: string;
  epoch_edge: string;
  epoch_types: string[];
  file_types: string[];
  tileset: { media_types: string[]; packaging: string[]; url_patterns: string[] };
  reasons: string[];
}

export type Reason = "lod" | "fidelity" | "packaging";
export interface AltEntry extends VersionEntry {
  asset_id: string;
  current: string;
  tileset: boolean;
  reason: Reason;
}
export interface AltSet {
  hat: string;
  hat_kind: "rm" | "container";
  name: string;
  node_type: string;
  epochs: string[];
  assets: string[];
  alternatives: AltEntry[];
  reasons: Reason[];
  members: AltSet[];
  covers: string[];
  coverage: "whole" | "partial" | "more" | "unmeasured" | null;
  parent: string | null;
}
export interface AltWarning { code: "two_hats" | "partial_coverage" | "epochs"; hat: string; ids: string[]; message: string; cure: string }
export interface AltResult {
  sets: AltSet[];
  warnings: AltWarning[];
  counts: { sets: number; with_alternatives: number; containers: number; by_reason: Record<string, number>; entries: number };
}
/** The choice of a container with an alternative: its models, the tileset, or the distance. */
export type AltMode = "models" | "tileset" | "auto";
/** A container's alternative as the Space draws it: the model that stands for
 *  it (`tileset`, the container's id), the container, the models it replaces. */
export interface TilesetAlternative { tileset: string; group: string; covered: string[]; total: number }
/** a box, [[x0, y0, z0], [x1, y1, z1]] */
export type Box = [[number, number, number], [number, number, number]];

interface DocGraph { nodes: EmNode[]; edges: EmEdge[] }

/** Two boxes cover «the same» from this intersection over union (s3Dgraphy `SAME_COVERAGE_IOU`). */
export const SAME_COVERAGE_IOU = 0.9;

const alive = (x: { data?: unknown; attributes?: unknown }): boolean =>
  !((x.data ?? {}) as Record<string, unknown>).removed && !((x.attributes ?? {}) as Record<string, unknown>).removed;
const dataOf = (n: { data?: unknown } | undefined): Record<string, unknown> =>
  (n && typeof n.data === "object" && n.data ? n.data as Record<string, unknown> : {});
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const sortU = (xs: Iterable<string>): string[] => [...new Set(xs)].sort(cmp);

/** A resource is a tileset by what it declares (the rule's `tileset`). */
export function isTilesetData(d: Record<string, unknown>, rule: AlternativesRule): boolean {
  const url = String(d.url ?? "");
  if (rule.tileset.media_types.includes(String(d.media_type ?? ""))) return true;
  if (rule.tileset.packaging.includes(String(d.packaging ?? ""))) return true;
  return rule.tileset.url_patterns.some((p) => new RegExp(p, "i").test(url));
}

/** Natural order of s3Dgraphy's `_level_key`: LOD2 before LOD10, a level without a number last. */
function levelKey(level: string | null | undefined): [number, number, string] {
  const t = String(level ?? "");
  const m = /(\d+)/.exec(t);
  return [m ? 0 : 1, m ? parseInt(m[1], 10) : 0, t];
}
function cmpKey(a: [number, number, string], b: [number, number, string]): number {
  return a[0] - b[0] || a[1] - b[1] || cmp(a[2], b[2]);
}

/** The graph seen by the rule: live nodes and edges, and the neighbours by type. */
function index(g: DocGraph) {
  const nodes = g.nodes.filter(alive);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = g.edges.filter((e) => alive(e as unknown as { data?: unknown; attributes?: unknown }) && byId.has(e.source) && byId.has(e.target));
  const out = new Map<string, EmEdge[]>(), inn = new Map<string, EmEdge[]>();
  for (const e of edges) {
    (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e);
    (inn.get(e.target) ?? inn.set(e.target, []).get(e.target)!).push(e);
  }
  const outOf = (id: string, type: string) => (out.get(id) ?? []).filter((e) => e.edge_type === type).map((e) => e.target);
  const inOf = (id: string, type: string) => (inn.get(id) ?? []).filter((e) => e.edge_type === type).map((e) => e.source);
  const vg: VersionGraph = { node: (id) => byId.get(id), out: outOf, into: inOf };
  return { nodes, byId, edges, outOf, inOf, vg };
}

function hatKind(n: EmNode | undefined, rule: AlternativesRule): "rm" | "container" | null {
  const t = String(n?.node_type ?? "");
  if (rule.hats.container.includes(t)) return "container";
  if (rule.hats.rm.includes(t)) return "rm";
  return null;
}

/** The versions of an asset as s3Dgraphy's `versions_of` orders them: the master, then by level. */
function orderedVersions(vg: VersionGraph, asset: string): VersionEntry[] {
  const all = versionsOf(vg, asset);
  const [master, ...rest] = all;
  rest.sort((a, b) => cmpKey(levelKey(a.lod_level ?? a.level), levelKey(b.lod_level ?? b.level))
    || cmpKey(levelKey(a.level), levelKey(b.level)) || cmp(a.id, b.id));
  return [master, ...rest];
}

/** The direct members of a container, in edge order. */
export function membersOf(g: DocGraph, groupId: string, rule: AlternativesRule): string[] {
  return [...new Set(g.edges.filter((e) => alive(e as unknown as { data?: unknown }) && e.edge_type === rule.member_edge && e.target === groupId).map((e) => e.source))];
}

/**
 * For every hat (an RM or an RM container) the set of its alternative
 * resources, nested, with the diagnoses — s3Dgraphy's `alternative_sets`. A
 * view: nothing written. `bounds` (node or resource id → box) are the boxes the
 * scene measured: the coverage of a container's alternative is measured on
 * them only.
 */
export function alternativeSets(g: DocGraph, rule: AlternativesRule, bounds?: Map<string, Box> | null): AltResult {
  const ix = index(g);
  const { byId, vg } = ix;
  const name = (id: string) => String(byId.get(id)?.name ?? "") || id;
  const is3d = (id: string) => byId.get(id)?.node_type === "resource" && rule.file_types.includes(String(dataOf(byId.get(id)).url_type ?? ""));
  const hatAssets = new Map<string, string[]>();
  const assetHats = new Map<string, string[]>();
  const directOnVersion: Array<[string, string, string]> = [];
  for (const e of ix.edges) {
    if (e.edge_type !== rule.hat_edge || !hatKind(byId.get(e.source), rule) || !is3d(e.target)) continue;
    const asset = assetOf(vg, e.target);
    if (asset !== e.target) directOnVersion.push([e.source, e.target, asset]);
    const ha = hatAssets.get(e.source) ?? hatAssets.set(e.source, []).get(e.source)!;
    if (!ha.includes(asset)) ha.push(asset);
    const ah = assetHats.get(asset) ?? assetHats.set(asset, []).get(asset)!;
    if (!ah.includes(e.source)) ah.push(e.source);
  }
  const versions = new Map<string, VersionEntry[]>();
  const tilesetAsset = new Map<string, boolean>();
  for (const a of sortU(assetHats.keys())) {
    const entries = orderedVersions(vg, a);
    versions.set(a, entries);
    tilesetAsset.set(a, entries.some((x) => isTilesetData(dataOf(byId.get(x.id)), rule)));
  }
  const containerOf = (id: string): string | null => ix.outOf(id, rule.member_edge)[0] ?? null;
  const deepMembers = (gid: string, seen = new Set<string>([gid])): string[] => {
    const out: string[] = [];
    for (const m of membersOf(g, gid, rule)) {
      if (!byId.has(m)) continue;
      if (hatKind(byId.get(m), rule) === "container") {
        if (!seen.has(m)) { seen.add(m); for (const x of deepMembers(m, seen)) if (!out.includes(x)) out.push(x); }
      } else if (!out.includes(m)) out.push(m);
    }
    return out;
  };
  const epochCache = new Map<string, string[]>();
  const epochs = (hat: string): string[] => {
    if (epochCache.has(hat)) return epochCache.get(hat)!;
    const ids = hatKind(byId.get(hat), rule) === "container" ? deepMembers(hat) : [hat];
    const res = sortU(ids.flatMap((i) => ix.inOf(i, rule.epoch_edge).filter((s) => rule.epoch_types.includes(String(byId.get(s)?.node_type ?? "")))));
    epochCache.set(hat, res);
    return res;
  };
  const warnings: AltWarning[] = [];

  const build = (hat: string, parent: string | null, seen: Set<string>): AltSet => {
    const node = byId.get(hat)!;
    const kind = hatKind(node, rule)!;
    const assets = sortU(hatAssets.get(hat) ?? []);
    const alts: AltEntry[] = [];
    for (const a of assets)
      for (const e of versions.get(a) ?? []) alts.push({ ...e, asset_id: a, current: e.id, tileset: !!tilesetAsset.get(a), reason: "lod" });
    const members: AltSet[] = [];
    let covers: string[] = [];
    if (kind === "container") {
      for (const m of membersOf(g, hat, rule)) {
        if (!byId.has(m) || seen.has(m) || !hatKind(byId.get(m), rule)) continue;
        seen.add(m);
        const sub = build(m, hat, seen);
        members.push(sub);
        covers = covers.concat(sub.hat_kind === "container" ? sub.covers : [m]);
      }
    }
    const mixed = alts.some((x) => x.tileset) && (kind === "container" || alts.some((x) => !x.tileset));
    for (const x of alts) x.reason = x.tileset && mixed ? "packaging" : x.master ? "fidelity" : "lod";
    const byAsset = new Map<string, AltEntry[]>();
    for (const x of alts) (byAsset.get(x.asset_id) ?? byAsset.set(x.asset_id, []).get(x.asset_id)!).push(x);
    const reasons: Reason[] = [];
    if ([...byAsset.values()].some((xs) => xs.some((x) => x.master) && xs.some((x) => !x.master))) reasons.push("fidelity");
    if ([...byAsset.values()].some((xs) => new Set(xs.filter((x) => !x.master).map((x) => x.lod_level ?? null)).size >= 2)) reasons.push("lod");
    if (mixed) reasons.push("packaging");
    let coverage: AltSet["coverage"] = null;
    if (kind === "container" && alts.length) {
      coverage = "unmeasured";
      if (bounds && bounds.size) {
        const altBox = [hat, ...alts.map((x) => x.id), ...assets].map((i) => bounds.get(i)).find(Boolean);
        const boxes = new Map(covers.filter((m) => bounds.has(m)).map((m) => [m, bounds.get(m)!] as const));
        const cov = altBox && boxes.size === covers.length ? measureCoverage(altBox, boxes) : null;
        if (cov) {
          coverage = cov.coverage;
          if (cov.coverage === "more")
            warnings.push({ code: "partial_coverage", hat, ids: cov.inside,
              message: `the alternative of ${JSON.stringify(name(hat))} covers more than its ${covers.length} models (boxes, IoU ${cov.iou.toFixed(2)})`,
              cure: "put in the container every model the alternative covers, or declare it on the container that holds them" });
          else if (cov.coverage === "partial")
            warnings.push({ code: "partial_coverage", hat, ids: cov.inside,
              message: `the alternative of ${JSON.stringify(name(hat))} covers ${cov.inside.length} of its ${covers.length} models (boxes, IoU ${cov.iou.toFixed(2)})`,
              cure: "make a sub-container of the covered models (make_subcontainer) and declare the alternative its own (declare_alternative)" });
        }
      }
    }
    if (kind === "container" && alts.length && epochs(hat).length > 1)
      warnings.push({ code: "epochs", hat, ids: epochs(hat),
        message: `${JSON.stringify(name(hat))} has an alternative and its members lie in ${epochs(hat).length} epochs: an alternative does not cross epochs`,
        cure: "one sub-container per epoch, each with its own alternative" });
    return { hat, hat_kind: kind, name: name(hat), node_type: String(node.node_type ?? ""), epochs: epochs(hat), assets,
             alternatives: alts, reasons, members, covers: kind === "container" ? covers : [hat], coverage, parent };
  };

  const seen = new Set<string>();
  const top: AltSet[] = [];
  for (const c of sortU(ix.nodes.filter((n) => hatKind(n, rule) === "container").map((n) => n.id)))
    if (containerOf(c) == null && !seen.has(c)) { seen.add(c); top.push(build(c, null, seen)); }
  for (const h of sortU(hatAssets.keys()))
    if (!seen.has(h) && hatKind(byId.get(h), rule) === "rm") { seen.add(h); top.push(build(h, null, seen)); }
  for (const h of sortU(hatAssets.keys()))
    if (!seen.has(h)) { seen.add(h); top.push(build(h, null, seen)); }

  for (const [asset, hats] of [...assetHats].sort((a, b) => cmp(a[0], b[0]))) {
    if (hats.length < 2) continue;
    const kinds = new Map(hats.map((h) => [h, hatKind(byId.get(h), rule)]));
    const both = tilesetAsset.get(asset) && [...kinds.values()].includes("container") && [...kinds.values()].includes("rm");
    warnings.push({ code: "two_hats", hat: hats[0], ids: [...sortU(hats), asset],
      message: both ? `the tileset ${JSON.stringify(name(asset))} has two hats: a container and an RM of its own`
        : `${JSON.stringify(name(asset))} has ${hats.length} hats: one object, one hat`,
      cure: both ? "if it covers the whole container, it is its alternative: remove the RM's link; if it is one piece among the others, it is a member: remove the container's link"
        : "keep the hat that says what it represents and remove the other links" });
  }
  for (const [facet, version, asset] of directOnVersion)
    for (const hat of assetHats.get(asset) ?? []) {
      if (hat === facet) continue;
      const a = epochs(hat), b = epochs(facet);
      if (a.length !== b.length || a.some((x, i) => x !== b[i]))
        warnings.push({ code: "epochs", hat, ids: [facet, version, asset],
          message: `${JSON.stringify(name(version))}, a version of ${JSON.stringify(name(asset))}, is linked by ${JSON.stringify(name(facet))} in another epoch than its hat`,
          cure: "the hat is said once, on the master: remove the link on the version" });
    }

  const flat = [...iterSets(top)];
  const by_reason: Record<string, number> = {};
  for (const k of rule.reasons) by_reason[k] = flat.filter((s) => (s.reasons as string[]).includes(k)).length;
  return { sets: top, warnings, counts: {
    sets: flat.length,
    with_alternatives: flat.filter((s) => s.alternatives.length >= 2 || (s.hat_kind === "container" && s.alternatives.length > 0)).length,
    containers: flat.filter((s) => s.hat_kind === "container").length,
    by_reason, entries: flat.reduce((n, s) => n + s.alternatives.length, 0) } };
}

/** The coverage of an alternative's box against its models' boxes: «whole»
 *  from an intersection over union of SAME_COVERAGE_IOU, else «partial» with the
 *  models whose centre falls inside. Null without boxes. */
export function measureCoverage(altBox: Box, boxes: ReadonlyMap<string, Box>): { coverage: "whole" | "partial" | "more"; iou: number; inside: string[] } | null {
  if (!boxes.size) return null;
  const all = [...boxes.values()];
  const vol = (b: Box) => Math.max(0, b[1][0] - b[0][0]) * Math.max(0, b[1][1] - b[0][1]) * Math.max(0, b[1][2] - b[0][2]);
  const union: Box = [[0, 1, 2].map((i) => Math.min(...all.map((b) => b[0][i]))) as Box[0],
                      [0, 1, 2].map((i) => Math.max(...all.map((b) => b[1][i]))) as Box[1]];
  const inter: Box = [[0, 1, 2].map((i) => Math.max(altBox[0][i], union[0][i])) as Box[0],
                      [0, 1, 2].map((i) => Math.min(altBox[1][i], union[1][i])) as Box[1]];
  const iv = vol(inter);
  const iou = iv / Math.max(1e-12, vol(altBox) + vol(union) - iv);
  const inside = [...boxes].filter(([, b]) => [0, 1, 2].every((i) => altBox[0][i] <= (b[0][i] + b[1][i]) / 2 && (b[0][i] + b[1][i]) / 2 <= altBox[1][i]))
    .map(([m]) => m).sort(cmp);
  // every model inside and the alternative much larger: it covers MORE than the
  // container (the alternative of a larger one) — never «more or less»
  return { coverage: iou >= SAME_COVERAGE_IOU ? "whole" : inside.length === boxes.size ? "more" : "partial", iou, inside };
}

/** Every set, containers before their members, depth first. */
export function* iterSets(sets: AltSet[]): Generator<AltSet> {
  for (const s of sets) { yield s; yield* iterSets(s.members); }
}
export function findSet(res: AltResult, hat: string): AltSet | null {
  for (const s of iterSets(res.sets)) if (s.hat === hat) return s;
  return null;
}

export interface AltChoice extends VersionChoice {
  level: "rm" | "container" | "members";
  hat: string;
  members: Record<string, AltChoice | null> | null;
}
const declares = (s: AltSet, u: string) => s.alternatives.some((x) => !x.master && (x.use ?? []).includes(u));
const membersDeclare = (s: AltSet, u: string): boolean => s.members.some((m) => declares(m, u) || membersDeclare(m, u));

/** The one alternative to light — s3Dgraphy's `choose_alternative`: an RM's set
 *  by `chooseVersion`; a container's own alternative when one of its versions
 *  declares ANY of the uses, else its members, each choosing with the same
 *  uses; `force` (container | members) is the hand choice. */
export function chooseAlternative(s: AltSet, use: string | string[], preferLevel: string | null = null,
                                  force: "container" | "members" | null = null,
                                  pick: (entries: VersionEntry[]) => VersionEntry[] = (e) => e): AltChoice | null {
  const uses = typeof use === "string" ? [use] : [...(use ?? [])];
  if (s.hat_kind !== "container") {
    const ch = chooseVersion(pick(s.alternatives), uses, preferLevel);
    return ch ? { ...ch, level: "rm", hat: s.hat, members: null } : null;
  }
  const members = (note = ""): AltChoice => ({ entry: null, reason: "none", use: null, note, level: "members", hat: s.hat,
    members: Object.fromEntries(s.members.map((m) => [m.hat, chooseAlternative(m, uses, preferLevel, null, pick)])) });
  const own = s.alternatives;
  if (force === "container" && own.length) {
    const ch = chooseVersion(pick(own), uses, preferLevel)!;
    return { ...ch, level: "container", hat: s.hat, members: null };
  }
  if (force === "members" || !own.length) {
    const out = members(force === "members" ? "chosen by hand" : "");
    out.use = force === "members" ? null : uses.find((u) => membersDeclare(s, u)) ?? null;
    return out;
  }
  if (uses.some((u) => declares(s, u))) {
    const ch = chooseVersion(pick(own), uses, preferLevel)!;
    return { ...ch, level: "container", hat: s.hat, members: null };
  }
  const out = members();
  out.use = uses.find((u) => membersDeclare(s, u)) ?? null;
  if (!out.use) out.note = `no version for ${uses.join(", ") || "no use"}: the members, each with its master`;
  return out;
}

// ── the writes, with s3Dgraphy's ids ─────────────────────────────────────────

export interface AltPlan {
  addNodes: EmNode[];
  addEdges: Array<{ id: string; source: string; target: string; type: string }>;
  removeEdges: string[];
  removeNodes: string[];
  hat: string;
  assets: string[];
  /** the RMs that lose their hat (and, with dropRm, go) */
  removedHats: string[];
  warnings: string[];
}

/** «Fa da alternativa a…» — s3Dgraphy's `declare_alternative`: `hatId` (an RM or
 *  a container) becomes the hat of the asset(s) of `resourceOrRm` (a resource,
 *  or the RM that hats it now); the old hats lose their edge; an RM left
 *  without resources goes with its edges when `dropRm`. */
export function planDeclareAlternative(g: DocGraph, resourceOrRm: string, hatId: string, rule: AlternativesRule,
                                       dropRm = true): AltPlan {
  const ix = index(g);
  const { byId, vg } = ix;
  if (!hatKind(byId.get(hatId), rule)) throw new Error(`«${hatId}» is neither a representation model nor an RM container`);
  const start = byId.get(resourceOrRm);
  if (!start) throw new Error(`«${resourceOrRm}» is not a node of this graph`);
  let assets: string[];
  if (start.node_type === "resource") assets = [assetOf(vg, resourceOrRm)];
  else if (hatKind(start, rule)) {
    assets = sortU(ix.outOf(resourceOrRm, rule.hat_edge).filter((r) => byId.get(r)?.node_type === "resource"
      && rule.file_types.includes(String(dataOf(byId.get(r)).url_type ?? ""))).map((r) => assetOf(vg, r)));
    if (!assets.length) throw new Error(`«${resourceOrRm}» hats no 3D resource`);
  } else throw new Error(`«${resourceOrRm}» is neither a resource nor a hat`);
  const plan: AltPlan = { addNodes: [], addEdges: [], removeEdges: [], removeNodes: [], hat: hatId, assets, removedHats: [], warnings: [] };
  const removed = new Set<string>();
  for (const a of assets) {
    for (const e of ix.edges) {
      if (e.edge_type !== rule.hat_edge || e.target !== a || e.source === hatId || !hatKind(byId.get(e.source), rule)) continue;
      if (e.id) plan.removeEdges.push(e.id);
      removed.add(e.source);
    }
    if (!ix.edges.some((e) => e.edge_type === rule.hat_edge && e.source === hatId && e.target === a))
      plan.addEdges.push({ id: `${hatId}_${rule.hat_edge}_${a}`, source: hatId, target: a, type: rule.hat_edge });
  }
  plan.removedHats = sortU(removed);
  if (dropRm)
    for (const old of plan.removedHats) {
      if (hatKind(byId.get(old), rule) !== "rm") continue;
      const still = ix.edges.filter((e) => e.edge_type === rule.hat_edge && e.source === old && !plan.removeEdges.includes(e.id ?? ""));
      if (!still.length) plan.removeNodes.push(old);
    }
  return plan;
}

/** The covered part of a container as a container inside it — s3Dgraphy's
 *  `make_subcontainer`: the group (`rmgroup_<label>`), member of the parent,
 *  and the covered members moved into it (1:1). */
export function planSubcontainer(g: DocGraph, parent: string, members: readonly string[], label: string, rule: AlternativesRule): AltPlan & { groupId: string } {
  const slug = [...(label || "unnamed")].map((ch) => (/[\p{L}\p{N}_-]/u.test(ch) ? ch : "_")).join("");
  const gid = `rmgroup_${slug}`;
  const ix = index(g);
  const plan: AltPlan & { groupId: string } = { addNodes: [], addEdges: [], removeEdges: [], removeNodes: [], hat: gid, assets: [], removedHats: [], warnings: [], groupId: gid };
  if (!ix.byId.has(gid)) plan.addNodes.push({ id: gid, node_type: rule.hats.container[0], name: label || gid, description: "" } as EmNode);
  if (!ix.outOf(gid, rule.member_edge).length)
    plan.addEdges.push({ id: `${gid}_${rule.member_edge}_${parent}`, source: gid, target: parent, type: rule.member_edge });
  for (const m of members) {
    const cur = ix.edges.filter((e) => e.edge_type === rule.member_edge && e.source === m);
    if (cur[0]?.target !== parent || m === gid) { plan.warnings.push(`«${m}» is not directly in the container: not moved`); continue; }
    for (const e of cur) if (e.id) plan.removeEdges.push(e.id);
    plan.addEdges.push({ id: `${m}_${rule.member_edge}_${gid}`, source: m, target: gid, type: rule.member_edge });
  }
  return plan;
}
