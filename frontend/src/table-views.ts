/**
 * STRUTTURA · what the TABLE window shows, sheet by sheet, as data.
 *
 * Two groups (scrivania v5, E.D. 28 set):
 *  · «Fogli EMdb» — Units, Epochs, Claims, Authors, Documents (+ the US view):
 *    the em_data sheets, EDITABLE, built by `em-data.ts`;
 *  · «Viste calcolate» — Chronology and Warnings: read-only, computed here.
 *
 * For every sheet this module says which FACETS it has and what each row
 * carries for them (`facets.ts` does the filtering), and builds the CARDS of the
 * three sheets that have a card view (Units, Documents, Chronology).
 *
 * Pure: the document, the live nodes, the issues and a translator come in.
 * Nothing is written, and the one computation that is not ours — the propagated
 * chronology — is ASKED of s3Dgraphy through the bridge (`chron-bridge.ts`,
 * `POST /chronology`) and handed in as a map, never recomputed here (CLAUDE.md,
 * invariant 2). It used to be read from `CALCUL_START_T/END_T` in the document;
 * since MICRO-cronologia the document no longer carries them: the chronology is
 * derived state, and its provenance is the stratigraphic relations themselves.
 */
import type { EmDocument, EmNode } from "./types";
import type { FacetDef, FacetRow, FacetValue } from "./facets";
import type { Issue } from "./issues";
import { epochSpan, epochStart } from "./outline";
import type { ChronEntry } from "./chron-bridge";

export type EmdbSheet = "US" | "Units" | "Epochs" | "Authors" | "Documents" | "Claims";
export type ComputedView = "Chron" | "Issues" | "Models";
export type TableView = EmdbSheet | ComputedView;

export const EMDB_SHEETS: EmdbSheet[] = ["Units", "US", "Epochs", "Claims", "Authors", "Documents"];
export const COMPUTED_VIEWS: ComputedView[] = ["Chron", "Issues", "Models"];
/** the sheets that ALSO have a card view; the others are rows only */
export const CARD_VIEWS: TableView[] = ["Units", "Documents", "Chron"];

export interface ViewCtx {
  doc: EmDocument;
  nodes: EmNode[];
  isUnit: (nodeType: string | undefined) => boolean;
  issues: Issue[];
  /** the unit an issue belongs to (outliner/table marks) */
  unitOfIssue: (nodeId: string) => string | null;
  t: (key: string, vars?: Record<string, string>) => string;
}

const str = (v: unknown): string => (v == null ? "" : String(v));
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).trim().split(/\s+/)[0]);
  return Number.isFinite(n) ? n : null;
};

/** The graph read once per render: indices every sheet needs. */
export interface Index {
  byId: Map<string, EmNode>;
  out: (id: string, type: string) => string[];
  inn: (id: string, type: string) => string[];
}

export function indexOf(ctx: ViewCtx): Index {
  const byId = new Map(ctx.nodes.map((n) => [n.id, n]));
  const o = new Map<string, string[]>();
  const i = new Map<string, string[]>();
  for (const e of ctx.doc.graph.edges ?? []) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    const t = e.edge_type ?? "";
    const ko = `${e.source}|${t}`;
    const ki = `${e.target}|${t}`;
    o.set(ko, [...(o.get(ko) ?? []), e.target]);
    i.set(ki, [...(i.get(ki) ?? []), e.source]);
  }
  return {
    byId,
    out: (id, type) => o.get(`${id}|${type}`) ?? [],
    inn: (id, type) => i.get(`${id}|${type}`) ?? [],
  };
}

const nameOf = (ix: Index, id: string | undefined): string =>
  id ? str(ix.byId.get(id)?.name || id) : "";

// ── epochs: the tree, from has_sub_epoch only ───────────────────────────────
export function epochTree(ctx: ViewCtx, ix: Index): Array<{ node: EmNode; depth: number; parent: string | null }> {
  const out: Array<{ node: EmNode; depth: number; parent: string | null }> = [];
  const newest = (a: EmNode, b: EmNode): number =>
    (epochStart(b) ?? -Infinity) - (epochStart(a) ?? -Infinity);
  const seen = new Set<string>();
  const rec = (n: EmNode, depth: number, parent: string | null): void => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    out.push({ node: n, depth, parent });
    ix.out(n.id, "has_sub_epoch").map((c) => ix.byId.get(c)!).filter(Boolean)
      .sort(newest).forEach((c) => rec(c, depth + 1, n.id));
  };
  ctx.nodes.filter((n) => n.node_type === "EpochNode" && !ix.inn(n.id, "has_sub_epoch").length)
    .sort(newest).forEach((e) => rec(e, 0, null));
  return out;
}

/** an epoch and every epoch above it (a unit in a sub-epoch is in its mother) */
function epochLine(ix: Index, id: string | undefined): string[] {
  const r: string[] = [];
  const seen = new Set<string>();
  let x = id;
  while (x && !seen.has(x)) { seen.add(x); r.push(x); x = ix.inn(x, "has_sub_epoch")[0]; }
  return r;
}

function descendants(ix: Index, id: string): string[] {
  const r: string[] = [];
  const walk = (x: string): void => {
    for (const c of ix.out(x, "has_sub_epoch")) if (!r.includes(c)) { r.push(c); walk(c); }
  };
  walk(id);
  return r;
}

// ── the provenance chain of one property ────────────────────────────────────
export interface Chain {
  prop: EmNode;
  value: string;
  combiner: EmNode | null;
  extractors: EmNode[];
  docs: EmNode[];
  authors: EmNode[];
}

const propValue = (p: EmNode): string =>
  str((p as Record<string, unknown>).value ?? p.data?.value ?? p.description);
const propType = (p: EmNode): string =>
  str((p as Record<string, unknown>).property_type ?? p.data?.property_type ?? p.name);

export function chainOf(ix: Index, p: EmNode): Chain {
  const prov = ix.out(p.id, "has_data_provenance").map((x) => ix.byId.get(x)!).filter(Boolean);
  const combiner = prov.find((x) => x.node_type === "combiner") ?? null;
  const extractors = prov.flatMap((x) => x.node_type === "combiner"
    ? ix.out(x.id, "combines").map((c) => ix.byId.get(c)!).filter(Boolean) : [x])
    .filter((x) => x.node_type === "extractor");
  const docs = [...new Set(extractors.flatMap((x) => ix.out(x.id, "extracted_from")))]
    .map((d) => ix.byId.get(d)!).filter(Boolean);
  const authors = [...new Set([...extractors, ...prov, p].flatMap((x) => ix.out(x.id, "has_author")))]
    .map((a) => ix.byId.get(a)!).filter(Boolean);
  return { prop: p, value: propValue(p), combiner, extractors, docs, authors };
}

const propsOf = (ix: Index, id: string): EmNode[] =>
  ix.out(id, "has_property").map((p) => ix.byId.get(p)!).filter(Boolean);

// ── chronology: written · from contained finds · propagated ────────────────
/** The date WRITTEN on a unit: its own `absolute_time_start` property. */
export function writtenStart(ix: Index, id: string): number | null {
  const p = propsOf(ix, id).find((x) => propType(x) === "absolute_time_start");
  return p ? num(propValue(p)) : null;
}

/**
 * The date a unit gets FROM THE FINDS it contains: the highest TPQ among its
 * `is_part_of` members, recursively. A member with no date of its own is read
 * through `changed_from` back to its original (a reused capital is dated by the
 * capital it was). This is reading the graph, not propagating it.
 *
 * PREVIEW ONLY (MICRO-cronologia). The rule is s3Dgraphy's `contained`
 * (`member_start` / `containment_tpq_detail`), and with the bridge on the view
 * shows THAT. This copy stays for one reason: with the bridge off, the one
 * reading of the chronology a user can still get is a pure read of the document
 * — no propagation, no epochs of the container, no TPQ/TAQ — and hiding it would
 * leave the column empty for a question the file can answer. It is marked as a
 * preview wherever it is shown, and `check-chronology.mjs` pins it to the same
 * answer s3Dgraphy gives on pancia A, so a drift is a failing check rather than
 * two rules.
 */
export type FindDate = { v: number; via: string; origin?: string; fromEpoch?: boolean };

export function fromFinds(ix: Index, id: string): FindDate | null {
  let best: FindDate | null = null;
  const seen = new Set<string>([id]);
  const dateOf = (m: string): FindDate | null => {
    const own = writtenStart(ix, m);
    if (own != null) return { v: own, via: m };
    const back = new Set<string>([m]);
    let x = ix.out(m, "changed_from")[0];
    let last: string | undefined;
    while (x && !back.has(x)) {
      back.add(x);
      last = x;
      const w = writtenStart(ix, x);
      if (w != null) return { v: w, via: m, origin: x };
      x = ix.out(x, "changed_from")[0];
    }
    // the ORIGINAL with no date written on it is still dated by the epoch it was
    // born in — s3Dgraphy's own base chronology (epoch first, then the specific
    // properties). Only for the original: an instance's own epoch is the time
    // of its REUSE, which is exactly what must not date the wall.
    if (last) {
      const ep = ix.byId.get(ix.out(last, "has_first_epoch")[0] ?? "");
      const v = ep ? epochStart(ep) : null;
      if (v != null) return { v, via: m, origin: last, fromEpoch: true };
    }
    return null;
  };
  const walk = (u: string): void => {
    for (const m of ix.inn(u, "is_part_of")) {
      if (seen.has(m)) continue;
      seen.add(m);
      const d = dateOf(m);
      if (d && (!best || d.v > best.v)) best = d;
      walk(m);
    }
  };
  walk(id);
  return best;
}

export interface ChronRow {
  node: EmNode;
  epoch: string;
  written: number | null;
  /** the TS preview of the `contained` rule (see `fromFinds`) */
  finds: FindDate | null;
  /** s3Dgraphy's answer for this node, when the bridge gave one */
  chron: ChronEntry | null;
}

/** `chron` is the map `POST /chronology` returned, or null when there is none
 *  (bridge off, not asked yet). */
export function chronRows(ctx: ViewCtx, ix: Index,
                          chron: Record<string, ChronEntry> | null = null): ChronRow[] {
  return ctx.nodes.filter((n) => ctx.isUnit(n.node_type)).map((n) => ({
    node: n,
    epoch: nameOf(ix, ix.out(n.id, "has_first_epoch")[0]),
    written: writtenStart(ix, n.id),
    finds: fromFinds(ix, n.id),
    chron: chron?.[n.id] ?? null,
  }));
}

// ── facets, per sheet ───────────────────────────────────────────────────────
export const STATE_VALUES = ["pd", "warn", "ai"] as const;

/** Is this unit's naming the work of an AI author? — its own `has_author`, or
 *  the author of an extractor in its paradata group. */
function aiNamed(ix: Index, id: string): boolean {
  const isAi = (a: string): boolean => ix.byId.get(a)?.node_type === "author_ai";
  if (ix.out(id, "has_author").some(isAi)) return true;
  for (const g of ix.out(id, "has_paradata_nodegroup"))
    for (const m of ix.inn(g, "is_in_paradata_nodegroup"))
      if (ix.byId.get(m)?.node_type === "extractor" && ix.out(m, "has_author").some(isAi))
        return true;
  return false;
}

export function unitFacts(ix: Index, warned: Set<string>, n: EmNode): FacetRow {
  const ep = ix.out(n.id, "has_first_epoch")[0];
  const state: string[] = [];
  if (propsOf(ix, n.id).length || ix.out(n.id, "has_paradata_nodegroup").length) state.push("pd");
  if (warned.has(n.id)) state.push("warn");
  if (aiNamed(ix, n.id)) state.push("ai");
  const text = [n.name, n.id, n.node_type, n.description, nameOf(ix, ep),
                ...propsOf(ix, n.id).flatMap((p) => [propType(p), propValue(p)])]
    .map(str).join(" ").toLowerCase();
  return { text, fx: { type: [n.node_type], epoch: epochLine(ix, ep), state } };
}

export interface ClaimFacts extends FacetRow {
  kind: "qualia" | "epoch" | "relation";
}

export function claimFacts(ix: Index, p: EmNode): ClaimFacts {
  const c = chainOf(ix, p);
  const tgt = ix.inn(p.id, "has_property")[0];
  return {
    kind: "qualia",
    text: [nameOf(ix, tgt), propType(p), c.value, ...c.extractors.map((x) => x.name),
           ...c.docs.map((d) => d.name), ...c.authors.map((a) => a.name)]
      .map(str).join(" ").toLowerCase(),
    fx: { kind: ["qualia"], prop: [propType(p)], author: c.authors.map((a) => a.id),
          doc: c.docs.map((d) => d.id) },
  };
}

export function facetsFor(view: TableView, ctx: ViewCtx, ix: Index): FacetDef[] {
  const t = ctx.t;
  const unitTypes = (): FacetValue[] =>
    [...new Set(ctx.nodes.filter((n) => ctx.isUnit(n.node_type)).map((n) => n.node_type))]
      .sort().map((v) => ({ v, label: v }));
  const epochs = (): FacetValue[] =>
    epochTree(ctx, ix).map(({ node, depth }) => ({
      v: node.id, label: str(node.name || node.id), depth, hint: epochSpan(node),
      children: descendants(ix, node.id),
    }));
  const states = (): FacetValue[] => STATE_VALUES.map((v) => ({ v, label: t(`table.st.${v}`) }));
  switch (view) {
    case "Units": case "US": case "Chron":
      return [
        { key: "type", labelKey: "table.fx.type", values: unitTypes },
        { key: "epoch", labelKey: "table.fx.epoch", values: epochs },
        { key: "state", labelKey: "table.fx.state", values: states },
      ];
    case "Claims":
      return [
        { key: "kind", labelKey: "table.fx.kind",
          values: () => ["qualia", "epoch", "relation"].map((v) => ({ v, label: t(`table.k.${v}`) })) },
        { key: "prop", labelKey: "table.fx.prop",
          values: () => [...new Set(ctx.nodes.filter((n) => n.node_type === "property").map(propType))]
            .filter(Boolean).sort().map((v) => ({ v, label: v })) },
        { key: "author", labelKey: "table.fx.author",
          values: () => ctx.nodes.filter((n) => n.node_type === "author" || n.node_type === "author_ai")
            .map((a) => ({ v: a.id, label: str(a.name || a.id) })) },
        { key: "doc", labelKey: "table.fx.doc",
          values: () => ctx.nodes.filter((n) => n.node_type === "document")
            .map((d) => ({ v: d.id, label: str(d.name || d.id), hint: str(d.description).slice(0, 24) })) },
      ];
    case "Authors":
      return [{ key: "akind", labelKey: "table.fx.akind",
                values: () => ["human", "ai"].map((v) => ({ v, label: t(`table.ak.${v}`) })) }];
    case "Issues":
      return [
        { key: "sev", labelKey: "table.fx.sev",
          values: () => ["warn", "info"].map((v) => ({ v, label: t(`issues.sev.${v}`) })) },
        { key: "rule", labelKey: "table.fx.rule",
          values: () => [...new Set(ctx.issues.map((i) => i.rule))].sort().map((v) => ({ v, label: v })) },
      ];
    default:
      return [];
  }
}

/** The facet row of every row id a sheet shows (EMdb sheets: node ids). */
export function factsFor(view: TableView, ctx: ViewCtx, ix: Index): Map<string, FacetRow> {
  const out = new Map<string, FacetRow>();
  const warned = new Set(ctx.issues.filter((i) => i.sev === "warn")
    .map((i) => ctx.unitOfIssue(i.node)).filter((x): x is string => !!x));
  if (view === "Units" || view === "US" || view === "Chron")
    for (const n of ctx.nodes) if (ctx.isUnit(n.node_type)) out.set(n.id, unitFacts(ix, warned, n));
  if (view === "Claims") {
    for (const n of ctx.nodes) if (n.node_type === "property") out.set(n.id, claimFacts(ix, n));
    // the read-only edge claims, under the SAME ids `em-data.ts` gives them
    for (const c of edgeClaims(ctx, ix)) out.set(c.id, c.row);
  }
  if (view === "Authors")
    for (const n of ctx.nodes)
      if (n.node_type === "author" || n.node_type === "author_ai")
        out.set(n.id, { text: [n.name, n.id, n.description].map(str).join(" ").toLowerCase(),
                        fx: { akind: [n.node_type === "author_ai" ? "ai" : "human"] } });
  if (view === "Issues")
    for (const i of ctx.issues)
      out.set(i.id, { text: [nameOf(ix, i.node), i.txt, i.rule].join(" ").toLowerCase(),
                      fx: { sev: [i.sev], rule: [i.rule] } });
  return out;
}

/**
 * The Claims sheet's two OTHER kinds, as read-only rows: membership in an epoch
 * and the stratigraphic relations. Qualia rows are `em-data.ts`'s (editable);
 * these are edges, edited on the canvas.
 */
export const RELATION_CLAIMS = ["is_after", "is_before", "cuts", "is_cut_by", "overlies",
  "is_overlain_by", "fills", "is_filled_by", "abuts", "is_abutted_by", "is_part_of",
  "changed_from", "has_same_time", "is_bonded_to", "is_physically_equal_to"];

export function edgeClaims(ctx: ViewCtx, ix: Index):
    Array<{ id: string; kind: "epoch" | "relation"; target: string; prop: string; value: string; row: FacetRow }> {
  const out: Array<{ id: string; kind: "epoch" | "relation"; target: string; prop: string; value: string; row: FacetRow }> = [];
  (ctx.doc.graph.edges ?? []).forEach((e, i) => {
    const s = ix.byId.get(e.source);
    if (!s || !ix.byId.get(e.target) || !ctx.isUnit(s.node_type)) return;
    const et = e.edge_type ?? "";
    const kind = et === "has_first_epoch" ? "epoch" : RELATION_CLAIMS.includes(et) ? "relation" : null;
    if (!kind) return;
    const value = nameOf(ix, e.target);
    out.push({ id: `claim:${e.id ?? i}`, kind, target: s.id, prop: et, value,
               row: { text: [s.name, et, value].map(str).join(" ").toLowerCase(),
                      fx: { kind: [kind], prop: [et], author: [], doc: [] } } });
  });
  return out;
}

// ── cards ───────────────────────────────────────────────────────────────────
export interface UnitCard {
  node: EmNode;
  epoch: string;
  hasPd: boolean;
  chains: Chain[];
}

export function unitCards(ctx: ViewCtx, ix: Index, ids: Set<string>): UnitCard[] {
  return ctx.nodes.filter((n) => ctx.isUnit(n.node_type) && ids.has(n.id)).map((n) => ({
    node: n,
    epoch: nameOf(ix, ix.out(n.id, "has_first_epoch")[0]),
    hasPd: ix.out(n.id, "has_paradata_nodegroup").length > 0,
    chains: propsOf(ix, n.id).map((p) => chainOf(ix, p)),
  }));
}

export interface DocCard {
  node: EmNode;
  uses: number;
  /** the units whose paradata group holds an extractor of this document — the
   *  "instances in the PNGs" (invariant 6: one master, re-instanced per use) */
  owners: Array<{ unit: EmNode; extractors: EmNode[] }>;
}

export function docCards(ctx: ViewCtx, ix: Index, ids: Set<string>): DocCard[] {
  return ctx.nodes.filter((n) => n.node_type === "document" && ids.has(n.id)).map((d) => {
    const ex = ix.inn(d.id, "extracted_from").map((x) => ix.byId.get(x)!).filter(Boolean);
    const owners = new Map<string, EmNode[]>();
    for (const x of ex)
      for (const g of ix.out(x.id, "is_in_paradata_nodegroup"))
        for (const u of ix.inn(g, "has_paradata_nodegroup"))
          owners.set(u, [...(owners.get(u) ?? []), x]);
    return {
      node: d, uses: ex.length,
      owners: [...owners].map(([u, xs]) => ({ unit: ix.byId.get(u)!, extractors: xs }))
        .filter((o) => o.unit),
    };
  });
}
