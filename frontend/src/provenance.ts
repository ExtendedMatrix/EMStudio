/**
 * MICRO-A-PROPRIO-EREDITATO (E.D., 14 Nov 2026) · own or inherited, and from
 * WHICH node — «la catena dei valori propri del nodo o ereditati da altro nodo è
 * essenziale nell'esperienza utente».
 *
 * The rules are s3Dgraphy's, said there once (`resolvers/provenance.py`,
 * `unit_life.py`, `attribution.py`); this is their reading in the page, so the
 * Inspector, the Tabular columns, the tooltips, the warnings and the Matrix say
 * the same thing without a round trip to the bridge.
 * `scripts/check-provenance.mjs` compares the two, node by node, on a sample of
 * every type of Templu Mare v10 (value, level, origin node).
 *
 *  - `resolveProvenance` → {value, level, origin, chain, via}: the levels are
 *    node · swimlane (an epoch) · life (a unit's end, from its continuity) ·
 *    members (an activity group) · master (a servile node follows the node it
 *    serves) · publisher (a model's Document) · container · graph;
 *  - `mastersOf`: paradata group → the node it serves, property → its owner,
 *    extractor / combiner → the unit(s) it feeds, proxy → the unit of its
 *    geometry, annotated region → its document;
 *  - `unitLife`: a real unit lives until a continuity closes it («still
 *    existing» otherwise), any other unit lives in its epoch and a continuity
 *    extends it;
 *  - `epochAttribution`, `redundancyReport`, `datingWarnings`.
 *
 * Pure: an index of the document is built once per pass (`provIndex`) and
 * memoises its answers; build a new one after the graph changes.
 */
import type { EmDocument, EmEdge, EmNode } from "./types";
import { isStratigraphicType } from "./rules";
import { t } from "./i18n";

export type ProvRule = "absolute_time_start" | "absolute_time_end" | "author" | "license" | "embargo";
export const PROV_RULES: ProvRule[] = ["absolute_time_start", "absolute_time_end", "author", "license", "embargo"];
export type ProvLevel = "node" | "swimlane" | "life" | "members" | "master" | "publisher" | "container" | "graph";

export interface Prov {
  value: number | string | null;
  level: ProvLevel | null;
  /** the node the value is WRITTEN on */
  origin: string | null;
  /** the ids from the node to the origin */
  chain: string[];
  /** the first node of an inherited hop: the master, the Document, the container, the member */
  via?: string | null;
  from_level?: ProvLevel | null;
  /** a unit's end: still_existing · ended · ended_undated · birth_only */
  status?: string;
}

const SERVILE = new Set(["ParadataNodeGroup", "property", "extractor", "combiner", "semantic_shape", "annotation_region"]);
const OWN_DATE_SERVILE = new Set(["BR"]);
const MEMBER_DATED = new Set(["ActivityNodeGroup"]);
const MODEL_TYPES = new Set(["representation_model", "representation_model_doc", "representation_model_sf"]);
const CONTAINER = "RepresentationModelNodeGroup";
const EPOCH = "EpochNode";
const PERSISTENT = new Set(["US", "serSU"]);
const TEMPORAL = new Set(["absolute_time_start", "absolute_time_end"]);
const AGG: Partial<Record<ProvRule, (xs: number[]) => number>> = {
  absolute_time_start: (xs) => Math.min(...xs),
  absolute_time_end: (xs) => Math.max(...xs),
};

const removed = (x: { data?: unknown; attributes?: unknown } | undefined): boolean => {
  const d = (x?.data ?? {}) as Record<string, unknown>;
  const a = (x?.attributes ?? {}) as Record<string, unknown>;
  return !!(d.removed || a.removed);
};

export class ProvIndex {
  nodes = new Map<string, EmNode>();
  out = new Map<string, EmEdge[]>();
  inn = new Map<string, EmEdge[]>();
  graphSelf: string | null = null;
  memo = new Map<string, Prov>();
  attrMemo = new Map<string, Attribution>();
  bounds: { starts: Map<string, number>; ends: Map<string, number> } | null = null;
  constructor(public doc: EmDocument) {
    for (const n of doc.graph.nodes) if (!removed(n as never)) this.nodes.set(n.id, n);
    for (const e of doc.graph.edges) {
      if (removed(e as never) || !this.nodes.has(e.source) || !this.nodes.has(e.target)) continue;
      (this.out.get(e.source) ?? this.out.set(e.source, []).get(e.source)!).push(e);
      (this.inn.get(e.target) ?? this.inn.set(e.target, []).get(e.target)!).push(e);
    }
    for (const n of this.nodes.values()) if (n.node_type === "graph") { this.graphSelf = n.id; break; }
  }
  node(id: string | null | undefined): EmNode | undefined { return id ? this.nodes.get(id) : undefined; }
  nt(id: string): string { return String(this.nodes.get(id)?.node_type ?? ""); }
  isEpoch(id: string): boolean { return this.nt(id) === EPOCH; }
  targets(id: string, et: string): string[] {
    return [...new Set((this.out.get(id) ?? []).filter((e) => e.edge_type === et).map((e) => e.target))];
  }
  sources(id: string, et: string): string[] {
    return [...new Set((this.inn.get(id) ?? []).filter((e) => e.edge_type === et).map((e) => e.source))];
  }
  name(id: string | null | undefined): string { const n = this.node(id); return String(n?.name || id || "?"); }
}

export function provIndex(doc: EmDocument): ProvIndex { return new ProvIndex(doc); }

const dataOf = (n: EmNode | undefined): Record<string, unknown> => ((n?.data ?? {}) as Record<string, unknown>);
const attrsOf = (n: EmNode | undefined): Record<string, unknown> => ((n as { attributes?: Record<string, unknown> } | undefined)?.attributes ?? {});

// ── the getters (builtin_rules.py) ─────────────────────────────────────────

function num(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (s === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

function temporalProperty(ix: ProvIndex, id: string, rule: string): number | null {
  for (const e of ix.out.get(id) ?? []) {
    if (e.edge_type !== "has_property") continue;
    const p = ix.node(e.target);
    if (!p || p.node_type !== "property") continue;
    const d = dataOf(p);
    if (d.property_type !== rule && p.name !== rule) continue;
    let raw: unknown = d.value ?? (p as { value?: unknown }).value;
    if ((raw == null || raw === "") && p.description && num(p.description) != null) raw = p.description;
    const v = num(raw);
    if (v != null) return v;
  }
  return null;
}

function formatAuthor(a: EmNode): string | null {
  const desc = String(a.description ?? "").trim();
  if (desc) return desc;
  const d = dataOf(a);
  const name = d.name as string | undefined;
  const surname = d.surname as string | undefined;
  if (name && name !== "noname" && surname && surname !== "nosurname") return `${name} ${surname}`.trim();
  if (name && name !== "noname") return name;
  if (surname && surname !== "nosurname") return surname;
  return a.name ? String(a.name) : null;
}
const isAuthor = (n: EmNode | undefined): boolean => n?.node_type === "author" || n?.node_type === "author_ai";

function joinAuthors(list: EmNode[]): string | null {
  const parts: string[] = [];
  for (const a of list) { const t = formatAuthor(a); if (t && !parts.includes(t)) parts.push(t); }
  return parts.length ? parts.join(" ; ") : null;
}
function formatLicense(l: EmNode): string | null {
  const d = dataOf(l);
  const t = d.license_type as string | undefined;
  const url = d.url as string | undefined;
  if (t && url) return `${t} (${url})`;
  return t || url || (l.name ? String(l.name) : null);
}
function formatEmbargo(n: EmNode): string | null {
  const d = dataOf(n);
  const s = d.embargo_start as string | undefined;
  const e = d.embargo_end as string | undefined;
  const r = (d.reason as string | undefined) ?? "";
  if (s && e) return `${s}..${e}` + (r ? ` (${r})` : "");
  if (s) return `from ${s}` + (r ? ` (${r})` : "");
  return n.name ? String(n.name) : null;
}
function firstTarget(ix: ProvIndex, id: string, et: string, types: string[]): EmNode | undefined {
  for (const e of ix.out.get(id) ?? []) if (e.edge_type === et) { const t = ix.node(e.target); if (t && types.includes(t.node_type)) return t; }
  return undefined;
}

function nodeGetter(ix: ProvIndex, id: string, rule: ProvRule): number | string | null {
  if (TEMPORAL.has(rule)) return temporalProperty(ix, id, rule);
  const a = attrsOf(ix.node(id));
  if (rule === "author") {
    if (a.author) return String(a.author);
    return joinAuthors((ix.out.get(id) ?? []).filter((e) => e.edge_type === "has_author").map((e) => ix.node(e.target)!).filter(isAuthor));
  }
  if (rule === "license") {
    if (a.license) return String(a.license);
    const l = firstTarget(ix, id, "has_license", ["license"]);
    return l ? formatLicense(l) : null;
  }
  if (a.embargo) return String(a.embargo);
  const em = firstTarget(ix, id, "has_embargo", ["embargo"]);
  return em ? formatEmbargo(em) : null;
}

function epochGetter(ix: ProvIndex, id: string, rule: ProvRule): number | string | null {
  if (TEMPORAL.has(rule)) {
    const p = temporalProperty(ix, id, rule);
    if (p != null) return p;
    return num(dataOf(ix.node(id))[rule === "absolute_time_start" ? "start_time" : "end_time"]);
  }
  return nodeGetter(ix, id, rule);
}

function graphScopeMembers(ix: ProvIndex, types: string[]): EmNode[] {
  const out: EmNode[] = [];
  for (const root of ix.nodes.values()) {
    if (root.node_type !== "graph") continue;
    for (const pdg of ix.targets(root.id, "has_paradata_nodegroup"))
      for (const m of ix.sources(pdg, "is_in_paradata_nodegroup")) { const n = ix.node(m); if (n && types.includes(n.node_type)) out.push(n); }
  }
  return out;
}
function graphGetter(ix: ProvIndex, rule: ProvRule): string | null {
  if (rule === "author") return joinAuthors(graphScopeMembers(ix, ["author", "author_ai"]));
  if (rule === "license") { for (const l of graphScopeMembers(ix, ["license"])) { const v = formatLicense(l); if (v) return v; } return null; }
  if (rule === "embargo") { for (const l of graphScopeMembers(ix, ["embargo"])) { const v = formatEmbargo(l); if (v) return v; } return null; }
  return null;
}

// ── masters ────────────────────────────────────────────────────────────────

export function servileKind(n: EmNode | undefined): "servile" | "own_date" | null {
  if (!n) return null;
  if (SERVILE.has(n.node_type)) return "servile";
  if (OWN_DATE_SERVILE.has(n.node_type)) return "own_date";
  return null;
}

function owningDocument(ix: ProvIndex, id: string): string | null {
  let cur: string | null = id;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    if (ix.nt(cur) === "document") return cur;
    const up: string[] = ix.sources(cur, "has_file").length ? ix.sources(cur, "has_file") : ix.sources(cur, "has_linked_resource");
    cur = up[0] ?? null;
  }
  return null;
}

function directMasters(ix: ProvIndex, id: string): string[] {
  const nt = ix.nt(id);
  const or = (a: string[], b: () => string[]): string[] => (a.length ? a : b());
  if (nt === "ParadataNodeGroup") return or(ix.sources(id, "has_paradata_nodegroup"), () => ix.targets(id, "is_in_activity"));
  if (nt === "property") {
    const own = [...new Set((ix.inn.get(id) ?? []).filter((e) => e.edge_type === "has_property" && !((e as { attributes?: Record<string, unknown> }).attributes?.inherited)).map((e) => e.source))];
    return or(or(own, () => ix.sources(id, "has_property")), () => ix.targets(id, "is_in_paradata_nodegroup"));
  }
  if (nt === "extractor" || nt === "combiner")
    return or([...new Set([...ix.sources(id, "has_data_provenance"), ...ix.sources(id, "combines")])], () => ix.targets(id, "is_in_paradata_nodegroup"));
  if (nt === "semantic_shape") return ix.sources(id, "has_semantic_shape");
  if (nt === "annotation_region") return [...new Set(ix.targets(id, "is_on_resource").map((t) => owningDocument(ix, t) ?? t))];
  if (nt === "BR") {
    const skip = new Set(["has_first_epoch", "survive_in_epoch", "has_property", "is_in_paradata_nodegroup"]);
    return [...new Set((ix.out.get(id) ?? []).filter((e) => !skip.has(String(e.edge_type)) && !ix.isEpoch(e.target)).map((e) => e.target))];
  }
  return [];
}

export interface Master { id: string; chain: string[] }

export function mastersOf(ix: ProvIndex, id: string): Master[] {
  const n = ix.node(id);
  if (!n || !servileKind(n)) return [];
  const out: Master[] = [];
  const seen = new Set<string>();
  const walk = (cur: string, chain: string[]): boolean => {
    let reached = false;
    for (const m of directMasters(ix, cur)) {
      if (chain.includes(m)) continue;
      const mn = ix.node(m);
      if (!mn) continue;
      if (servileKind(mn) === "servile" && walk(m, [...chain, m])) { reached = true; continue; }
      reached = true;
      if (!seen.has(m)) { seen.add(m); out.push({ id: m, chain: [...chain, m] }); }
    }
    return reached;
  };
  walk(id, [id]);
  return out;
}

// ── the walk ───────────────────────────────────────────────────────────────

const NONE: Prov = { value: null, level: null, origin: null, chain: [] };
const rec = (value: Prov["value"], level: ProvLevel, origin: string | null, chain: string[], extra: Partial<Prov> = {}): Prov =>
  ({ value, level, origin, chain: [...chain], ...extra });

export function laneEpochs(ix: ProvIndex, id: string): string[] {
  return [...ix.targets(id, "has_first_epoch"), ...ix.targets(id, "survive_in_epoch")].filter((t) => ix.isEpoch(t));
}
export function modelEpochs(ix: ProvIndex, id: string): string[] {
  const reach = ix.sources(id, "has_representation_model").filter((s) => ix.isEpoch(s));
  return [...new Set([...reach, ...laneEpochs(ix, id)])];
}

function swimlane(ix: ProvIndex, rule: ProvRule, id: string, epochs: string[]): Prov | null {
  if (!epochs.length) return null;
  const agg = AGG[rule];
  if (agg) {
    const vals: [number, string][] = [];
    for (const e of epochs) { const v = epochGetter(ix, e, rule); if (v != null) vals.push([v as number, e]); }
    if (!vals.length) return null;
    const a = agg(vals.map((x) => x[0]));
    const origin = (vals.find((x) => x[0] === a) ?? vals[0])[1];
    return rec(a, "swimlane", origin, [id, origin]);
  }
  for (const e of epochs) { const v = epochGetter(ix, e, rule); if (v != null) return rec(v, "swimlane", e, [id, e]); }
  return null;
}

function combine(rule: ProvRule, id: string, level: ProvLevel, found: Prov[], via: string[][]): Prov | null {
  const pairs = found.map((f, i) => [f, via[i]] as const).filter(([f]) => f && f.value != null && f.level !== "graph");
  if (!pairs.length) return null;
  const agg = AGG[rule];
  let f: Prov, v: string[], val: Prov["value"];
  if (agg) {
    val = agg(pairs.map(([x]) => x.value as number));
    [f, v] = (pairs.find(([x]) => x.value === val) ?? pairs[0]) as [Prov, string[]];
  } else { [f, v] = pairs[0] as [Prov, string[]]; val = f.value; }
  const chain = [...new Set([id, ...v.slice(1), ...f.chain.slice(1)])];
  return rec(val, level, f.origin, chain, { via: v.length > 1 ? v[v.length - 1] : null, from_level: f.level });
}

export function isLifeBearing(n: EmNode | undefined): boolean {
  return !!n && isStratigraphicType(n.node_type) && n.node_type !== "BR" && n.node_type !== "SE";
}

export function resolveProvenance(ix: ProvIndex, id: string, rule: ProvRule, seen: Set<string> = new Set()): Prov {
  const n = ix.node(id);
  if (!n || seen.has(id)) return { ...NONE };
  const key = `${id}\u0000${rule}`;
  const m = ix.memo.get(key);
  if (m) return { ...m };
  const s2 = new Set(seen); s2.add(id);
  const r = walk(ix, n, id, rule, s2);
  ix.memo.set(key, r);
  return { ...r };
}

function walk(ix: ProvIndex, n: EmNode, id: string, rule: ProvRule, seen: Set<string>): Prov {
  const nt = n.node_type;
  const sub = (o: string): Prov => resolveProvenance(ix, o, rule, seen);
  const graphLevel = (): Prov => {
    const v = graphGetter(ix, rule);
    if (v == null) return { ...NONE };
    return rec(v, "graph", ix.graphSelf, ix.graphSelf ? [id, ix.graphSelf] : [id]);
  };
  if (nt === EPOCH) {
    const r = swimlane(ix, rule, id, [id]);
    if (r) { r.chain = [id]; return r; }
    return graphLevel();
  }
  const own = nodeGetter(ix, id, rule);
  if (own != null) return rec(own, "node", id, [id]);
  const kind = servileKind(n);
  if (kind === "servile") {
    const real = mastersOf(ix, id).filter((x) => x.id !== id);
    if (real.length) {
      const r = combine(rule, id, "master", real.map((x) => sub(x.id)), real.map((x) => x.chain));
      if (r) return r;
      return graphLevel();
    }
    return swimlane(ix, rule, id, laneEpochs(ix, id)) ?? graphLevel();
  }
  if (kind === "own_date") {
    const r = swimlane(ix, rule, id, laneEpochs(ix, id));
    if (r) return r;
    const ms = mastersOf(ix, id);
    return combine(rule, id, "master", ms.map((x) => sub(x.id)), ms.map((x) => x.chain)) ?? graphLevel();
  }
  if (MEMBER_DATED.has(nt) && TEMPORAL.has(rule)) {
    const members = ix.sources(id, "is_in_activity");
    const r = combine(rule, id, "members", members.map(sub), members.map((x) => [id, x]));
    if (r) return r;
    return swimlane(ix, rule, id, laneEpochs(ix, id)) ?? graphLevel();
  }
  if (MODEL_TYPES.has(nt) || nt === CONTAINER) {
    const r = swimlane(ix, rule, id, modelEpochs(ix, id));
    if (r) return r;
    const pubs = [...new Set(["has_representation_model", "has_representation_model_doc"].flatMap((et) => ix.sources(id, et)).filter((s) => ix.nt(s) === "document"))];
    const rp = combine(rule, id, "publisher", pubs.map(sub), pubs.map((p) => [id, p]));
    if (rp) return rp;
    if (nt !== CONTAINER) {
      const cs = ix.targets(id, "is_in_representation_model_group");
      const rc = combine(rule, id, "container", cs.map(sub), cs.map((c) => [id, c]));
      if (rc) return rc;
    }
    return graphLevel();
  }
  if (rule === "absolute_time_end" && isLifeBearing(n)) {
    const life = unitLife(ix, id);
    if (life.end_value != null) return rec(life.end_value, "life", life.end_origin, life.end_chain, { status: life.status });
  }
  return swimlane(ix, rule, id, laneEpochs(ix, id)) ?? graphLevel();
}

// ── the life of a unit (unit_life.py) ──────────────────────────────────────

export interface Life {
  unit: string; real: boolean; birth: string | null; end_epoch: string | null; continuity: string | null;
  status: "still_existing" | "ended" | "ended_undated" | "birth_only" | "undated";
  epochs: string[]; why: string; declared: string[]; redundant: string[]; contradicting: string[];
  end_value: number | null; end_origin: string | null; end_chain: string[]; end_dated: boolean;
}

function epochBounds(ix: ProvIndex): { starts: Map<string, number>; ends: Map<string, number> } {
  if (ix.bounds) return ix.bounds;
  const starts = new Map<string, number>(), ends = new Map<string, number>();
  for (const n of ix.nodes.values()) {
    if (n.node_type !== EPOCH) continue;
    const s = epochGetter(ix, n.id, "absolute_time_start"); if (s != null) starts.set(n.id, s as number);
    const e = epochGetter(ix, n.id, "absolute_time_end"); if (e != null) ends.set(n.id, e as number);
  }
  ix.bounds = { starts, ends };
  return ix.bounds;
}

export function continuitiesOf(ix: ProvIndex, id: string): string[] {
  return [...new Set((ix.inn.get(id) ?? []).filter((e) => ix.nt(e.source) === "BR").map((e) => e.source))];
}

const fmtYear = (v: number): string => String(Number.isInteger(v) ? v : v);

export function unitLife(ix: ProvIndex, id: string): Life {
  const n = ix.node(id);
  const out: Life = { unit: id, real: PERSISTENT.has(String(n?.node_type)), birth: null, end_epoch: null, continuity: null,
    status: "undated", epochs: [], why: "", declared: [], redundant: [], contradicting: [],
    end_value: null, end_origin: null, end_chain: [], end_dated: false };
  if (!n) return out;
  const firsts = ix.targets(id, "has_first_epoch").filter((t) => ix.isEpoch(t));
  const declared = ix.targets(id, "survive_in_epoch").filter((t) => ix.isEpoch(t));
  out.declared = declared;
  if (!firsts.length) { out.contradicting = [...declared]; return out; }
  const { starts, ends } = epochBounds(ix);
  const st = (e: string): number => starts.get(e) ?? Infinity;
  const birth = firsts.reduce((a, b) => (st(b) < st(a) ? b : a));
  out.birth = birth;
  const brs = continuitiesOf(ix, id);
  let endEpoch: string | null = null, br: string | null = null;
  for (const b of brs)
    for (const ep of ix.targets(b, "has_first_epoch").filter((t) => ix.isEpoch(t)))
      if (endEpoch == null || (starts.get(ep) ?? 0) > (starts.get(endEpoch) ?? 0)) { endEpoch = ep; br = b; }
  if (br == null && brs.length) br = brs[0];
  out.continuity = br; out.end_epoch = endEpoch;
  const b0 = starts.get(birth);
  const top = endEpoch != null ? starts.get(endEpoch) : out.real ? Infinity : b0;
  const epochs = [birth];
  // epochs without dates: the life cannot be computed, the survivals written on
  // the unit are its only word (neither redundant nor contradicting)
  const undatedLanes = b0 == null || top == null;
  if (undatedLanes) for (const d of declared) { if (!epochs.includes(d)) epochs.push(d); }
  else for (const [eid, s] of starts) if (b0 <= s && s <= top && !epochs.includes(eid)) epochs.push(eid);
  if (endEpoch != null && !epochs.includes(endEpoch)) epochs.push(endEpoch);
  const mothers = new Map<string, string[]>();
  for (const e of ix.nodes.keys()) for (const t of ix.targets(e, "has_sub_epoch")) (mothers.get(t) ?? mothers.set(t, []).get(t)!).push(e);
  let grow = true;
  while (grow) {
    grow = false;
    for (const eid of [...epochs]) for (const m of mothers.get(eid) ?? []) if (!epochs.includes(m)) { epochs.push(m); grow = true; }
  }
  epochs.sort((a, b) => st(a) - st(b) || (a < b ? -1 : a > b ? 1 : 0));
  out.epochs = epochs;
  out.redundant = undatedLanes ? [] : declared.filter((d) => epochs.includes(d) && d !== birth);
  out.contradicting = undatedLanes ? [] : declared.filter((d) => !epochs.includes(d));
  const nm = (e: string | null): string => ix.name(e);
  if (br != null) {
    const date = temporalProperty(ix, br, "absolute_time_end") ?? temporalProperty(ix, br, "absolute_time_start");
    if (date != null) {
      Object.assign(out, { status: "ended", end_value: date, end_origin: br, end_chain: [id, br], end_dated: true,
        why: t("pv.why.ended", { birth: nm(birth), date: fmtYear(date) }) });
    } else {
      Object.assign(out, { status: "ended_undated", end_value: endEpoch ? (ends.get(endEpoch) ?? null) : null,
        end_origin: endEpoch ?? br, end_chain: [id, br, ...(endEpoch ? [endEpoch] : [])],
        why: endEpoch ? t("pv.why.endedUndated", { birth: nm(birth), end: nm(endEpoch) })
          : t("pv.why.endedNoEpoch", { birth: nm(birth) }) });
    }
  } else if (out.real) {
    let last: string | null = null;
    for (const e of epochs) if (ends.has(e) && (last == null || ends.get(e)! > ends.get(last)!)) last = e;
    Object.assign(out, { status: "still_existing", end_value: last ? ends.get(last)! : null, end_origin: last,
      end_chain: [id, ...(last ? [last] : [])], why: t("pv.why.still", { birth: nm(birth) }) });
  } else {
    Object.assign(out, { status: "birth_only", end_value: ends.get(birth) ?? null, end_origin: birth, end_chain: [id, birth],
      why: t("pv.why.birthOnly", { birth: nm(birth) }) });
  }
  return out;
}

// ── attribution (attribution.py) ───────────────────────────────────────────

export interface Attribution {
  epochs: string[];
  level: "node" | "life" | "master" | "members" | "publisher" | "container" | null;
  origin: string | null; chain: string[]; why: string; status?: string; masters?: string[];
}

export function epochAttribution(ix: ProvIndex, id: string, seen: Set<string> = new Set()): Attribution {
  const memo = ix.attrMemo.get(id);
  if (memo) return { ...memo };
  const none: Attribution = { epochs: [], level: null, origin: null, chain: [], why: "" };
  const n = ix.node(id);
  if (!n || seen.has(id) || ix.isEpoch(id)) return none;
  const s2 = new Set(seen); s2.add(id);
  const sub = (o: string): Attribution => epochAttribution(ix, o, s2);
  const nt = n.node_type;
  let out = none;
  const kind = servileKind(n);
  if (isLifeBearing(n)) {
    const life = unitLife(ix, id);
    out = { epochs: life.epochs, level: "life", origin: id, chain: [id], why: life.why, status: life.status };
  } else if (kind === "servile") {
    const ms = mastersOf(ix, id).filter((x) => x.id !== id);
    let eps: string[] = [];
    let first: Master | null = null;
    for (const m of ms) { const a = sub(m.id); if (a.epochs.length) { eps = eps.concat(a.epochs); first = first ?? m; } }
    if (first) out = { epochs: [...new Set(eps)], level: "master", origin: first.id, chain: first.chain, why: t("pv.why.follows", { node: ix.name(first.id) }), masters: ms.map((x) => x.id) };
    else if (laneEpochs(ix, id).length) out = { epochs: laneEpochs(ix, id), level: "node", origin: id, chain: [id], why: t("pv.why.orphan") };
  } else if (MEMBER_DATED.has(nt)) {
    const members = ix.sources(id, "is_in_activity");
    const eps = [...new Set(members.flatMap((m) => sub(m).epochs))];
    if (eps.length) out = { epochs: eps, level: "members", origin: id, chain: [id], why: t("pv.why.members", { n: String(members.length) }) };
    else if (laneEpochs(ix, id).length) out = { epochs: laneEpochs(ix, id), level: "node", origin: id, chain: [id], why: "" };
  } else if (MODEL_TYPES.has(nt) || nt === CONTAINER) {
    const own = modelEpochs(ix, id);
    if (own.length) out = { epochs: own, level: "node", origin: id, chain: [id], why: "" };
    else {
      const pubs = ["has_representation_model", "has_representation_model_doc"].flatMap((et) => ix.sources(id, et)).filter((s) => ix.nt(s) === "document");
      const steps: ["publisher" | "container", string[]][] = [["publisher", [...new Set(pubs)]], ["container", nt !== CONTAINER ? ix.targets(id, "is_in_representation_model_group") : []]];
      outer: for (const [level, ups] of steps)
        for (const u of ups) { const a = sub(u); if (a.epochs.length) { out = { epochs: a.epochs, level, origin: u, chain: [id, u], why: t("pv.why.follows", { node: ix.name(u) }) }; break outer; } }
    }
  } else if (laneEpochs(ix, id).length) out = { epochs: laneEpochs(ix, id), level: "node", origin: id, chain: [id], why: "" };
  ix.attrMemo.set(id, out);
  return { ...out };
}

function family(ix: ProvIndex, eid: string): string[] {
  const out: string[] = [];
  const todo = [eid];
  while (todo.length) { const c = todo.pop()!; if (out.includes(c)) continue; out.push(c); todo.push(...ix.targets(c, "has_sub_epoch")); }
  return out;
}
function compatible(ix: ProvIndex, eid: string, epochs: string[]): boolean {
  if (epochs.includes(eid)) return true;
  const fam = family(ix, eid);
  return epochs.some((e) => fam.includes(e) || family(ix, e).includes(eid));
}

export interface LaneEdge { source: string; target: string; edge_type: string }
export interface RedundantRec {
  id: string; name: string; node_type: string; edges: LaneEdge[]; epochs: string[];
  master?: string; master_name?: string; master_epochs?: string[]; life?: string[]; why?: string;
}
export interface Redundancy { servile: RedundantRec[]; servile_differs: RedundantRec[]; survive: RedundantRec[]; survive_contradicting: RedundantRec[] }

export function redundancyReport(ix: ProvIndex): Redundancy {
  const out: Redundancy = { servile: [], servile_differs: [], survive: [], survive_contradicting: [] };
  for (const [id, n] of ix.nodes) {
    if (servileKind(n) === "servile") {
      const own = (ix.out.get(id) ?? []).filter((e) => (e.edge_type === "has_first_epoch" || e.edge_type === "survive_in_epoch") && ix.isEpoch(e.target));
      if (!own.length) continue;
      const ms = mastersOf(ix, id).filter((x) => x.id !== id);
      if (!ms.length) continue;
      const mEps = [...new Set(ms.flatMap((m) => epochAttribution(ix, m.id).epochs))];
      if (!mEps.length) continue;
      const r: RedundantRec = { id, name: ix.name(id), node_type: n.node_type,
        edges: own.map((e) => ({ source: e.source, target: e.target, edge_type: String(e.edge_type) })),
        epochs: own.map((e) => e.target), master: ms[0].id, master_name: ix.name(ms[0].id), master_epochs: mEps };
      (own.every((e) => compatible(ix, e.target, mEps)) ? out.servile : out.servile_differs).push(r);
    } else if (isLifeBearing(n)) {
      const life = unitLife(ix, id);
      for (const [key, eps] of [["survive", life.redundant], ["survive_contradicting", life.contradicting]] as const)
        if (eps.length) out[key].push({ id, name: ix.name(id), node_type: n.node_type,
          edges: eps.map((e) => ({ source: id, target: e, edge_type: "survive_in_epoch" })), epochs: eps, life: life.epochs, why: life.why });
    }
  }
  return out;
}

export interface DatingWarning { rule: "model_vs_document" | "member_vs_container" | "servile_vs_master"; id: string; name: string; other: string; other_name: string; message: string; fix: string; epoch?: string | null }

/** the container's declared epochs (alternatives.container_own_epochs): an
 *  epoch reaching it, the epochs of the Document publishing it */
function containerOwnEpochs(ix: ProvIndex, gid: string): string[] {
  const out = new Set(ix.sources(gid, "has_representation_model").filter((s) => ix.isEpoch(s)));
  for (const w of ix.sources(gid, "has_representation_model")) if (ix.nt(w) === "document") for (const e of laneEpochs(ix, w)) out.add(e);
  return [...out];
}

export function datingWarnings(ix: ProvIndex): DatingWarning[] {
  const out: DatingWarning[] = [];
  const span = (id: string): [Prov, Prov] => [resolveProvenance(ix, id, "absolute_time_start"), resolveProvenance(ix, id, "absolute_time_end")];
  const own = (p: Prov): boolean => p.level === "node" || p.level === "swimlane";
  const fmt = (s: Prov, e: Prov): string => `${s.value ?? "?"}–${e.value ?? "?"}`;
  for (const [id, n] of ix.nodes) {
    if (!MODEL_TYPES.has(n.node_type)) continue;
    const [ms, me] = span(id);
    if (!own(ms)) continue;
    const pubs = [...new Set(["has_representation_model", "has_representation_model_doc"].flatMap((et) => ix.sources(id, et)).filter((s) => ix.nt(s) === "document"))];
    for (const d of pubs) {
      const [ds, de] = span(d);
      if (!own(ds) || ds.value == null) continue;
      if (ms.value === ds.value && me.value === de.value) continue;
      if (me.value != null && de.value != null && (me.value as number) < (ds.value as number)) continue;
      out.push({ rule: "model_vs_document", id, name: ix.name(id), other: d, other_name: ix.name(d),
        message: t("pv.msg.modelDoc", { m: ix.name(id), ms: fmt(ms, me), mo: ix.name(ms.origin), d: ix.name(d), ds: fmt(ds, de), dorig: ix.name(ds.origin) }),
        fix: "move_to_document_epoch", epoch: laneEpochs(ix, d)[0] ?? null });
    }
    for (const c of ix.targets(id, "is_in_representation_model_group")) {
      if (!containerOwnEpochs(ix, c).length) continue;
      const [cs, ce] = span(c);
      if (cs.value == null || ms.value == null) continue;
      const inside = (ms.value as number) >= (cs.value as number) && (ce.value == null || me.value == null || (me.value as number) <= (ce.value as number));
      if (!inside) out.push({ rule: "member_vs_container", id, name: ix.name(id), other: c, other_name: ix.name(c),
        message: t("pv.msg.member", { m: ix.name(id), ms: fmt(ms, me), c: ix.name(c), cs: fmt(cs, ce) }), fix: "follow_container" });
    }
  }
  for (const r of redundancyReport(ix).servile_differs)
    out.push({ rule: "servile_vs_master", id: r.id, name: r.name, other: r.master!, other_name: r.master_name!,
      message: t("pv.msg.servile", { n: r.name, e: r.epochs.map((e) => ix.name(e)).join(", "), m: r.master_name ?? "", me: (r.master_epochs ?? []).map((e) => ix.name(e)).join(", ") }),
      fix: "clean" });
  return out;
}

/** the time of the ACT of an extractor / a combiner (node datamodel 1.6.45) */
export function actTime(n: EmNode | undefined): { start: string | null; end: string | null } {
  const d = dataOf(n);
  const pick = (k: string): string | null => (d[k] == null || d[k] === "" ? null : String(d[k]));
  return { start: pick("act_start"), end: pick("act_end") };
}
