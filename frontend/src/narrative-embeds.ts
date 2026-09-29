/**
 * DP-79 · P1 — the embeds that were still placeholders, made real.
 *
 * Five view types (`matrix`, `timeline`, `table`, `paradata`, `un_scene`) plus
 * two enrichments the design asks for on cards that already existed: the
 * **existence certainty** of a stratigraphic unit, and the **IIIF thumbnail** of
 * a document or image.
 *
 * They all obey the rule the viewer is built on and this module does not get to
 * bend: **an embed is a REFERENCE.** Everything here is computed from the node
 * index and the edge list *at render time* — no copies, no cache, no snapshot.
 * Rename a unit and the matrix says the new name; retract a source and the
 * evidence chain says so, in words, rather than showing what used to be true.
 *
 * Two more rules, inherited:
 *
 * * **one palette.** Colours come from `nodeStyle` / the vendored visual rules,
 *   never from a literal in this file. The one exception is the certainty
 *   ladder, whose colours come from `document_variant_styles` — which is the
 *   same table, read through `variantColor`.
 * * **read-only.** Nothing here mutates the document. The authoring surface is
 *   `narrative-edit.ts`, and an embed that could write would make the story a
 *   second place where the graph is edited.
 *
 * When a reference resolves but the thing it points at is empty — an epoch with
 * no units, an activity nobody attached anything to — the answer is an honest
 * placeholder, not an error. *Nothing here yet* is a true statement about a
 * graph being built; a red box would be a lie about a mistake nobody made.
 */

import { t } from "./i18n";
import { fetchImageInfo, fittedUrl, imageUrl, isImageResource, regionUrl,
         thumbnailUrl } from "./iiif";
import { nodeStyle } from "./palette";
import rules from "./assets/em_visual_rules.json";
import { typeDescription } from "./rules";
import type { EmDocument, EmEdge, EmNode } from "./types";

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function box(kind: string, title: string, cls: string): HTMLElement {
  const b = el("div", `nv-embed ${cls}`);
  b.appendChild(el("div", "nv-embed-kind", kind));
  b.appendChild(el("div", "nv-embed-title", title));
  return b;
}

/** The honest empty state: the reference is fine, there is simply nothing on the
 *  other end of it yet. */
function nothingYet(b: HTMLElement, what: string): HTMLElement {
  b.appendChild(el("div", "nv-embed-note nv-empty", what));
  return b;
}

export const nameOf = (n: EmNode | undefined): string =>
  n ? String(n.name || n.id) : "";

/** "1 rapporto" / "3 rapporti". A story that says "1 rapporti" reads as a fault
 *  in the study rather than in the viewer, which is the wrong place to spend a
 *  reader's trust. */
const plural = (n: number, oneKey: string, manyKey: string): string =>
  `${n} ${t(n === 1 ? oneKey : manyKey)}`;

// ── the graph, read ──────────────────────────────────────────────────────────
//
// Small readers rather than one index object: an embed asks two or three
// questions, and building a full adjacency map per embed would cost more than
// the scans it saves. They take the document because the document IS the truth
// (model.ts) — there is no second in-memory model to consult.

const edgesOf = (doc: EmDocument | null): EmEdge[] => doc?.graph?.edges ?? [];
const nodesOf = (doc: EmDocument | null): EmNode[] => doc?.graph?.nodes ?? [];

function indexOf(doc: EmDocument | null): Map<string, EmNode> {
  const m = new Map<string, EmNode>();
  for (const n of nodesOf(doc)) m.set(n.id, n);
  return m;
}

/** Every node reached from `id` by an edge of one of `types`, in graph order. */
function outgoing(doc: EmDocument | null, id: string,
                  types: readonly string[]): string[] {
  const want = new Set(types);
  return edgesOf(doc)
    .filter((e) => e.source === id && want.has(String(e.edge_type ?? "")))
    .map((e) => e.target);
}

/** …and the mirror. Both exist because EM relations are read in both
 *  directions: an epoch does not point at its units, its units point at it. */
function incoming(doc: EmDocument | null, id: string,
                  types: readonly string[]): string[] {
  const want = new Set(types);
  return edgesOf(doc)
    .filter((e) => e.target === id && want.has(String(e.edge_type ?? "")))
    .map((e) => e.source);
}

/** The stratigraphic families, from the datamodel's own naming. Deliberately a
 *  prefix test rather than a hardcoded list: `serSU`, `serUSVn`, `TSU`, `UL`
 *  and whatever 1.7 adds are all stratigraphic, and a list here would be a
 *  second vocabulary to keep in sync (invariant 1). */
const STRAT = /^(US|USV|USVn|USVs|USD|SF|VSF|RSF|ser|TSU|UL|USN|USNt|BR|SE)/;
const isStrat = (n: EmNode | undefined): boolean =>
  !!n && STRAT.test(String(n.node_type ?? ""));

// ── the scope of an embed ────────────────────────────────────────────────────

/**
 * What a `matrix` / `timeline` / `table` embed is ABOUT.
 *
 * The `ref` names one node, and what that node is decides the scope — which is
 * the whole reason these three can share a resolver:
 *
 * * an **epoch** → the units of that epoch (a slice);
 * * an **activity** or any group → its members;
 * * a **stratigraphic unit** → itself and what it is directly related to, so an
 *   embed pointing at a unit shows it *in context* rather than alone;
 * * the **graph-self node** → the whole graph.
 *
 * Returns the units, plus a phrase saying what was scoped — the reader of a
 * story deserves to know whether they are looking at an epoch or an activity.
 */
export interface Scope {
  units: EmNode[];
  what: string;
  epochs: EmNode[];
}

const EPOCH_LINKS = ["has_first_epoch", "survive_in_epoch", "is_in_epoch"] as const;

/** Every phase under this epoch, transitively (`has_sub_epoch`).
 *
 *  A phase is an EpochNode hanging off its parent, and the units of a
 *  periodised epoch belong to the phases — so "the units of this epoch" has to
 *  walk down, exactly as the matrix's lane inheritance does. Cycle-safe: a
 *  hand-edited document that made an epoch its own ancestor gets a finite
 *  answer, not a hang. */
function subEpochsOf(doc: EmDocument | null, epochId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([epochId]);
  const queue = [epochId];
  while (queue.length) {
    const here = queue.shift()!;
    for (const e of edgesOf(doc)) {
      if (e.edge_type !== "has_sub_epoch" || e.source !== here) continue;
      const child = String(e.target ?? "");
      if (!child || seen.has(child)) continue;
      seen.add(child);
      out.push(child);
      queue.push(child);
    }
  }
  return out;
}
const GROUP_LINKS = [
  "is_in_activity", "is_in_paradata_nodegroup", "is_group_of",
  "is_in_location_nodegroup", "is_in_timebranch",
] as const;

export function scopeOf(node: EmNode, doc: EmDocument | null): Scope {
  const index = indexOf(doc);
  const type = String(node.node_type ?? "");
  const epochs = nodesOf(doc).filter((n) => n.node_type === "epoch"
    || n.node_type === "EpochNode");

  if (type === "epoch" || type === "EpochNode") {
    // PARITY WITH THE CANVAS, FIRST.
    //
    // Matrix Mode does not resolve epoch→units by walking edges at all: it reads
    // `layout.swimlanes` and places each node by its POSITION, because the
    // layout engine assigned the lanes semantically (`has_first_epoch`, plus the
    // `is_after` chain and group membership inherited in both directions —
    // CLAUDE.md invariant 4). So a unit the engine laned through the chain is
    // drawn in that epoch on the canvas and is invisible to any edge walk.
    //
    // That is the gap E.D. measured on 20 Aug: Matrix Mode showed the epoch's
    // units and the embed of the same epoch said there were none. So the embed
    // asks the layout the way the canvas does, and only falls back to the edges
    // when the document carries no layout (a graph nobody has laid out yet, for
    // which the canvas would have nothing to show either).
    const laned = unitsFromLayout(node.id, doc, index);
    if (laned.length)
      return { units: laned, what: t("nv.scopeEpoch", { name: nameOf(node) }),
               epochs: [node] };
    // AN EPOCH INCLUDES ITS PHASES.
    //
    // Measured (2026-08-20): a chapter anchored to an epoch whose units hang off
    // its PHASES (`has_sub_epoch`, the periodisation of DP-… phases) said
    // "nessuna unità stratigrafica in questo ambito" while the graph's matrix
    // drew those very units in that epoch's lane — because the matrix inherits
    // membership down the phases and this walk stopped at the parent. The
    // reference was valid, the units were there, and the embed said the chapter
    // was about nothing.
    //
    // So the scope of an epoch is the epoch AND its phases (transitively: a
    // phase can have phases). Ordering and lane labels are unchanged — a unit
    // still declares its own lane through `epochOf`, so it appears under the
    // PHASE it belongs to, which is what the matrix shows too.
    const lanes = [node.id, ...subEpochsOf(doc, node.id)];
    const seen = new Set<string>();
    const units: EmNode[] = [];
    for (const lane of lanes) {
      for (const id of incoming(doc, lane, EPOCH_LINKS)) {
        if (seen.has(id)) continue;
        seen.add(id);
        const unit = index.get(id);
        if (isStrat(unit)) units.push(unit as EmNode);
      }
    }
    return { units, what: t("nv.scopeEpoch", { name: nameOf(node) }),
             epochs: [node] };
  }

  if (type === "graph") {
    const units = nodesOf(doc).filter(isStrat);
    return { units, what: t("nv.scopeWholeGraph"), epochs };
  }

  // a group of any family — activity, location, time branch, paradata
  const members = incoming(doc, node.id, GROUP_LINKS)
    .map((id) => index.get(id))
    .filter(isStrat) as EmNode[];
  if (members.length) {
    return { units: members, what: `«${nameOf(node)}»`, epochs };
  }

  if (isStrat(node)) {
    // the unit itself, in context: what it is directly related to, so the
    // reader sees a fragment of matrix rather than one lonely box
    const near = new Set<string>([node.id]);
    for (const e of edgesOf(doc)) {
      if (e.source === node.id) near.add(e.target);
      if (e.target === node.id) near.add(e.source);
    }
    const units = [...near].map((id) => index.get(id)).filter(isStrat) as EmNode[];
    return { units, what: `«${nameOf(node)}» e i suoi rapporti`, epochs };
  }

  return { units: [], what: `«${nameOf(node)}»`, epochs };
}

/**
 * The units the LAYOUT puts in this epoch's lane — what the canvas actually draws.
 *
 * `layout.swimlanes` gives the band (`y`, `height`) for an epoch and
 * `layout.positions` the rect of every node; a node whose vertical centre falls
 * in the band is in that lane. Exactly the test `views/matrix.ts` applies
 * (`laneIdxOfY`), so the story and the canvas cannot disagree about which units
 * an epoch has.
 *
 * A PHASE's band sits inside its parent's, so a periodised epoch collects its
 * phases' units here too, by geometry, without a second rule.
 *
 * Empty when the document has no layout, no lane for this epoch, or no node in
 * the band — the caller then walks the edges instead.
 */
function unitsFromLayout(epochId: string, doc: EmDocument | null,
                         index: Map<string, EmNode>): EmNode[] {
  const layout = (doc as { layout?: {
    swimlanes?: Array<{ epoch_id?: string; y?: number; height?: number }>;
    positions?: Record<string, { y?: number; h?: number }>;
  } } | null)?.layout;
  const lane = (layout?.swimlanes ?? []).find((l) => l?.epoch_id === epochId);
  const positions = layout?.positions;
  if (!lane || !positions || typeof lane.y !== "number") return [];
  const top = lane.y;
  const bottom = lane.y + (typeof lane.height === "number" ? lane.height : 0);
  if (!(bottom > top)) return [];
  const out: EmNode[] = [];
  for (const [id, rect] of Object.entries(positions)) {
    const y = typeof rect?.y === "number" ? rect.y : NaN;
    if (!Number.isFinite(y)) continue;
    const centre = y + (typeof rect?.h === "number" ? rect.h / 2 : 0);
    if (centre < top || centre >= bottom) continue;
    const unit = index.get(id);
    if (isStrat(unit)) out.push(unit as EmNode);
  }
  return out;
}

/** Which epoch a unit belongs to — its FIRST one, which is the lane the matrix
 *  draws it in (invariant 4: lanes are semantic, from `has_first_epoch`). */
function epochOf(unit: EmNode, doc: EmDocument | null): string | null {
  const first = outgoing(doc, unit.id, ["has_first_epoch"]);
  if (first.length) return first[0];
  const any = outgoing(doc, unit.id, EPOCH_LINKS);
  return any.length ? any[0] : null;
}

export function epochStart(e: EmNode): number {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const raw = d["start_time"] ?? d["start"] ?? (e as Record<string, unknown>)["start_time"];
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
}

// ── 1 · matrix / epoch slice ─────────────────────────────────────────────────

/**
 * The Harris matrix, or a slice of one epoch, inline and small.
 *
 * Deliberately NOT the canvas engine. The layout in `em-core` is a WASM call
 * that returns absolute geometry for a whole graph; running it per embed, on
 * every keystroke in the paragraph above, would cost more than the story is
 * worth — and its output is a canvas, which cannot be read by a screen reader
 * or exported to a Word file. So this is the same *semantics* (epochs are
 * lanes, newest on top, arrows point down) rendered as rows of chips: what the
 * matrix MEANS, at the size a paragraph can hold.
 *
 * The chips carry the palette's colours, so a reader who knows the canvas
 * recognises the families immediately.
 */
export function matrixEmbed(node: EmNode, doc: EmDocument | null): HTMLElement {
  const b = box("matrix", nameOf(node), "nv-matrix");
  const scope = scopeOf(node, doc);
  b.appendChild(el("div", "nv-embed-note",
                    t("nv.capMatrix", { what: scope.what })));
  if (!scope.units.length) {
    // SAY WHICH QUESTION CAME UP EMPTY. "nessuna unità in questo ambito" was
    // true and useless: on 20 Aug it appeared for an epoch whose units the
    // canvas was drawing, and there was no way to tell from the message whether
    // the reference was wrong, the graph empty, or the resolution broken. So the
    // empty state names what was asked — a reader can check the same thing.
    const isEpoch = String(node.node_type ?? "") === "EpochNode"
      || String(node.node_type ?? "") === "epoch";
    const laid = !!(doc as { layout?: { swimlanes?: unknown[] } } | null)
      ?.layout?.swimlanes?.length;
    // NARRATIVE-DESK · ONE line on the page («Nessuna unità in quest'epoca»);
    // the questions that came up empty stay, in the tooltip, for whoever asks
    if (!isEpoch) return nothingYet(b, t("nv.emptyScope"));
    nothingYet(b, t("nv.emptyEpochShort"));
    (b.lastElementChild as HTMLElement).title = t("nv.emptyEpoch")
      + (laid ? "" : " " + t("nv.notLaidOut")) + t("nv.emptyEpochRest");
    return b;
  }

  const index = indexOf(doc);
  // lanes, newest on top (invariant 4)
  const lanes = new Map<string, EmNode[]>();
  for (const u of scope.units) {
    const key = epochOf(u, doc) ?? "";
    (lanes.get(key) ?? lanes.set(key, []).get(key)!).push(u);
  }
  const ordered = [...lanes.keys()].sort((a, b2) => {
    const ea = index.get(a), eb = index.get(b2);
    if (!ea) return 1;
    if (!eb) return -1;
    return epochStart(eb) - epochStart(ea);   // newest first
  });

  const grid = el("div", "nv-matrix-lanes");
  for (const key of ordered) {
    const lane = el("div", "nv-matrix-lane");
    const epoch = index.get(key);
    const label = el("div", "nv-matrix-lane-label",
      epoch ? nameOf(epoch) : t("nv.noEpoch"));
    if (epoch) {
      const style = nodeStyle(String(epoch.node_type ?? "epoch"));
      label.style.borderLeftColor = style.border;
    }
    lane.appendChild(label);
    const row = el("div", "nv-matrix-row");
    for (const u of lanes.get(key)!) row.appendChild(unitChip(u));
    lane.appendChild(row);
    grid.appendChild(lane);
  }
  b.appendChild(grid);

  // the relations INSIDE the scope, said in words: a picture of boxes without
  // the relations would be a picture of a list
  const ids = new Set(scope.units.map((u) => u.id));
  const rel = edgesOf(doc).filter((e) =>
    ids.has(e.source) && ids.has(e.target)
    && String(e.edge_type ?? "").startsWith("is_"));
  b.appendChild(el("div", "nv-embed-note",
    rel.length
      ? `${plural(scope.units.length, "nv.unit", "nv.units")} · `
        + `${plural(rel.length, "nv.relation", "nv.relations")}`
      : `${plural(scope.units.length, "nv.unit", "nv.units")} · `
        + t("nv.noRelations")));
  return b;
}

function unitChip(u: EmNode): HTMLElement {
  const style = nodeStyle(String(u.node_type ?? ""));
  const chip = el("span", "nv-chip", nameOf(u));
  chip.style.background = style.fill;
  chip.style.borderColor = style.border;
  // …and the TEXT colour comes from the palette too. It computes contrast from
  // the fill's luminance (`nodeStyle.textColor`), so a dark family stays
  // readable — writing a literal here made the USV chip black on black.
  chip.style.color = style.textColor;
  chip.title = `${u.node_type} — ${typeDescription(String(u.node_type ?? "")) || nameOf(u)}`;
  return chip;
}

// ── 2 · the existence certainty of a unit ────────────────────────────────────

/**
 * How sure we are that this unit EXISTED — the rung, and the whole ladder.
 *
 * Read in this order, and the order is the point:
 *
 * 1. a **qualia claim** on the node (`certainty_level`, `confidence_level`,
 *    `existence`) reached through `has_property`. An author who said it wins;
 * 2. the node's own **geometry / certainty_class** field, the axis documents
 *    already carry;
 * 3. failing both, the **family** the node type implies — a virtual unit is
 *    asserted, a real one is observable. Marked as *implied*, because a
 *    default presented as a statement is how a guess becomes a citation.
 *
 * The ladder is drawn whole, with the current rung lit: a reader needs to see
 * that "asserted" is the third of four, not a word on its own.
 */
const LADDER = ["reality_based", "observable", "asserted", "symbolic"] as const;

const QUALIA_TO_RUNG: Record<string, string> = {
  certain: "reality_based",
  highly_probable: "observable",
  probable: "observable",
  possible: "asserted",
  doubtful: "asserted",
  speculative: "symbolic",
  // the pre-1.6 spellings, still on older graphs
  direct: "reality_based",
  reconstructed: "observable",
  hypothetical: "asserted",
};

const VIRTUAL = /^(USV|USVn|USVs|USD|VSF|serUSV|serUSD)/;

export interface Certainty {
  rung: string;
  source: "qualia" | "field" | "implied";
  detail?: string;
}

export function existenceCertainty(node: EmNode,
                                   doc: EmDocument | null): Certainty | null {
  const index = indexOf(doc);
  for (const pid of outgoing(doc, node.id, ["has_property"])) {
    const p = index.get(pid);
    if (!p) continue;
    const key = String(p.name ?? "").toLowerCase();
    if (!/certain|confidence|existence/.test(key)) continue;
    const data = (p.data ?? {}) as Record<string, unknown>;
    const raw = String(data["value"] ?? p.description ?? "").trim();
    const rung = QUALIA_TO_RUNG[raw.toLowerCase()];
    if (rung) return { rung, source: "qualia", detail: `${p.name}: ${raw}` };
    if (raw) return { rung: "", source: "qualia", detail: `${p.name}: ${raw}` };
  }
  const data = (node.data ?? {}) as Record<string, unknown>;
  const field = String(data["geometry"] ?? data["certainty_class"] ?? "").trim();
  if (field) {
    const rung = QUALIA_TO_RUNG[field.toLowerCase()] ?? field;
    if ((LADDER as readonly string[]).includes(rung))
      return { rung, source: "field" };
  }
  const type = String(node.node_type ?? "");
  if (!type) return null;
  return VIRTUAL.test(type)
    ? { rung: "asserted", source: "implied" }
    : { rung: "observable", source: "implied" };
}

/** The ladder as a row of rungs, the current one lit. */
export function certaintyLadder(c: Certainty): HTMLElement {
  const wrap = el("div", "nv-certainty");
  wrap.appendChild(el("span", "nv-certainty-label", "certezza d'esistenza"));
  const row = el("span", "nv-certainty-rungs");
  for (const rung of LADDER) {
    const dot = el("span", "nv-rung", rung.replace("_", " "));
    if (rung === c.rung) dot.classList.add("nv-rung-on");
    row.appendChild(dot);
  }
  wrap.appendChild(row);
  const why = c.source === "qualia" ? (c.detail ?? t("nv.fromQualia"))
    : c.source === "field" ? t("nv.fromField")
    : t("nv.impliedByType");
  const note = el("span", "nv-certainty-why", why);
  if (c.source === "implied") note.classList.add("nv-implied");
  wrap.appendChild(note);
  return wrap;
}

// ── 3 · timeline ─────────────────────────────────────────────────────────────

/**
 * The narrated epochs on a temporal axis.
 *
 * Reads the epochs the scope touches and lays them out proportionally to their
 * own dates, so a long epoch looks long. Epochs without dates are still shown —
 * at the end, marked — because a study in progress has plenty of them and
 * dropping them would make the axis a lie by omission.
 */
/** Where an epoch ENDS — its own `end_time`, else where it starts (a moment). */
export function epochEnd(e: EmNode): number {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const raw = d["end_time"] ?? d["end"];
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : epochStart(e);
}

export interface TimelineSpans {
  /** the epochs in scope that CAN sit on an axis, oldest first */
  dated: EmNode[];
  /** …and the ones that cannot: named, never dropped */
  undated: EmNode[];
  min: number;
  max: number;
  span: number;
  what: string;
}

/**
 * The epochs of a scope, as an axis — the ONE computation behind both the
 * in-app timeline and its exported figure.
 *
 * Extracted rather than copied: a figure that placed the epochs differently
 * from the embed above it would be a picture of another study. What it does is
 * what the embed always did — the epochs the scope's units touch, else the
 * scope's own epochs; the undated ones set aside by name.
 */
export function timelineSpans(node: EmNode,
                              doc: EmDocument | null): TimelineSpans {
  const scope = scopeOf(node, doc);
  const index = indexOf(doc);
  const touched = new Map<string, EmNode>();
  for (const u of scope.units) {
    const eid = epochOf(u, doc);
    const e = eid ? index.get(eid) : undefined;
    if (e) touched.set(e.id, e);
  }
  const epochs = touched.size ? [...touched.values()] : scope.epochs;
  const dated = epochs.filter((e) => Number.isFinite(epochStart(e)))
    .sort((a, c) => epochStart(a) - epochStart(c));
  const undated = epochs.filter((e) => !Number.isFinite(epochStart(e)));
  const min = dated.length ? epochStart(dated[0]) : 0;
  const max = dated.length ? Math.max(...dated.map(epochEnd)) : 1;
  return { dated, undated, min, max, span: (max - min) || 1, what: scope.what };
}

export function timelineEmbed(node: EmNode, doc: EmDocument | null): HTMLElement {
  const b = box("timeline", nameOf(node), "nv-timeline");
  const spans = timelineSpans(node, doc);
  b.appendChild(el("div", "nv-embed-note",
                    t("nv.capTimeline", { what: spans.what })));

  const { dated, undated, min, span } = spans;
  if (!dated.length && !undated.length) {
    return nothingYet(b, t("nv.noEpochsHere"));
  }

  const axis = el("div", "nv-timeline-axis");
  const ends = epochEnd;

  for (const e of dated) {
    const bar = el("div", "nv-timeline-bar");
    const from = epochStart(e), to = ends(e);
    bar.style.marginLeft = `${((from - min) / span) * 100}%`;
    bar.style.width = `${Math.max(((to - from) / span) * 100, 4)}%`;
    const style = nodeStyle(String(e.node_type ?? "epoch"));
    bar.style.background = style.fill;
    bar.style.borderColor = style.border;
    bar.style.color = style.textColor;
    bar.title = `${nameOf(e)} — ${from} → ${to}`;
    bar.appendChild(el("span", "nv-timeline-name", nameOf(e)));
    bar.appendChild(el("span", "nv-timeline-dates", `${from} → ${to}`));
    axis.appendChild(bar);
  }
  b.appendChild(axis);

  if (undated.length) {
    const list = undated.map(nameOf).join(", ");
    b.appendChild(el("div", "nv-embed-note nv-implied",
      t("nv.undatedOffAxis", { list })));
  }
  return b;
}

// ── 4 · table — a live query over the em.json ────────────────────────────────

/**
 * A table computed at render time from the document in memory.
 *
 * The design's example — *the units of this activity with their dating* — is
 * the default, and it is deliberately a QUERY rather than a stored table: the
 * author points at a scope, and what the reader sees is whatever the graph says
 * now. A table typed into the prose would be a copy, and copies are what this
 * whole viewer exists not to make.
 *
 * `options.columns` narrows the columns when the author wants fewer.
 */
const COLUMNS: { key: string; labelKey: string;
                 read: (u: EmNode, doc: EmDocument | null) => string }[] = [
  { key: "name", labelKey: "nv.colUnit", read: (u) => nameOf(u) },
  { key: "type", labelKey: "nv.colType", read: (u) => String(u.node_type ?? "") },
  {
    key: "epoch", labelKey: "nv.colEpoch",
    read: (u, doc) => {
      const id = epochOf(u, doc);
      const e = id ? indexOf(doc).get(id) : undefined;
      return e ? nameOf(e) : "—";
    },
  },
  {
    key: "dating", labelKey: "nv.colDating",
    read: (u, doc) => {
      const id = epochOf(u, doc);
      const e = id ? indexOf(doc).get(id) : undefined;
      if (!e) return "—";
      const d = (e.data ?? {}) as Record<string, unknown>;
      const from = d["start_time"] ?? d["start"];
      const to = d["end_time"] ?? d["end"];
      return from === undefined && to === undefined ? "—" : `${from ?? "?"} → ${to ?? "?"}`;
    },
  },
  {
    key: "certainty", labelKey: "nv.colCertainty",
    read: (u, doc) => {
      const c = existenceCertainty(u, doc);
      if (!c) return "—";
      return c.source === "implied"
        ? `${c.rung.replace("_", " ")} (implicita)`
        : c.rung.replace("_", " ");
    },
  },
];

export function tableEmbed(node: EmNode, doc: EmDocument | null,
                           options: Record<string, unknown>): HTMLElement {
  const b = box("table", nameOf(node), "nv-table");
  const scope = scopeOf(node, doc);
  b.appendChild(el("div", "nv-embed-note",
                    t("nv.capLiveQuery", { what: scope.what })));
  if (!scope.units.length) {
    return nothingYet(b, t("nv.queryFindsNothing"));
  }

  const wanted = Array.isArray(options["columns"])
    ? new Set((options["columns"] as unknown[]).map(String))
    : null;
  const cols = wanted ? COLUMNS.filter((c) => wanted.has(c.key)) : COLUMNS;

  const table = el("table", "nv-table-grid");
  const head = el("tr");
  for (const c of cols) head.appendChild(el("th", undefined, t(c.labelKey)));
  table.appendChild(head);
  for (const u of scope.units) {
    const tr = el("tr");
    for (const c of cols) {
      const td = el("td", undefined, c.read(u, doc));
      if (c.key === "name") {
        const style = nodeStyle(String(u.node_type ?? ""));
        td.style.borderLeft = `3px solid ${style.border}`;
      }
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  b.appendChild(table);
  b.appendChild(el("div", "nv-embed-note",
    `${plural(scope.units.length, "nv.rowComputed", "nv.rowsComputed")} `
    + t("nv.fromMemory")));
  return b;
}

// ── 5 · paradata — the evidence chain, inline ────────────────────────────────

/**
 * **source → extractor → property → unit**, rendered as a chain.
 *
 * This is the embed the design calls the differentiator, and the reason is
 * structural rather than decorative: every tool can attach a footnote saying
 * *see Rossi 1987*; this shows the reasoning — which source, read by which
 * extraction, yielding which property, of which unit — **inside** the sentence
 * that relies on it. It archives nothing; it points.
 *
 * The chain is walked in whichever direction the `ref` allows, because an
 * author points at whatever they are talking about: a property, an extractor,
 * a source or the unit itself.
 *
 * If a link is missing — a source that was retracted, an extractor nobody
 * attached — the chain says so **in words** at the point where it breaks.
 * Silence there would be the one failure this embed cannot afford: a reader
 * would take an incomplete chain for a complete one.
 */
const PROP_LINKS = ["has_property"] as const;
const PROV_LINKS = ["has_data_provenance"] as const;
const SOURCE_LINKS = ["extracted_from", "combines"] as const;

export function paradataEmbed(node: EmNode, doc: EmDocument | null): HTMLElement {
  const b = box("paradata", nameOf(node), "nv-paradata");
  const index = indexOf(doc);
  const type = String(node.node_type ?? "");

  // Find the properties this embed is about, from wherever the author pointed.
  let properties: EmNode[] = [];
  let anchor: EmNode | null = null;
  if (type === "property") {
    properties = [node];
    anchor = index.get(incoming(doc, node.id, PROP_LINKS)[0] ?? "") ?? null;
  } else if (type === "extractor" || type === "combiner") {
    properties = incoming(doc, node.id, PROV_LINKS)
      .map((id) => index.get(id)).filter(Boolean) as EmNode[];
  } else if (type === "document" || type === "source" || type === "resource") {
    const args = incoming(doc, node.id, SOURCE_LINKS)
      .map((id) => index.get(id)).filter(Boolean) as EmNode[];
    for (const a of args) {
      for (const pid of incoming(doc, a.id, PROV_LINKS)) {
        const p = index.get(pid);
        if (p) properties.push(p);
      }
    }
  } else {
    anchor = node;
    properties = outgoing(doc, node.id, PROP_LINKS)
      .map((id) => index.get(id)).filter(Boolean) as EmNode[];
  }

  b.appendChild(el("div", "nv-embed-note",
    anchor ? t("nv.capChainOf", { name: nameOf(anchor) })
           : t("nv.capChain")));

  if (!properties.length) {
    return nothingYet(b,
      type === "document" || type === "source"
        ? t("nv.sourceUnused")
        : t("nv.noDocumentedProps"));
  }

  const chains = el("div", "nv-chains");
  for (const prop of properties) {
    const chain = el("div", "nv-chain");

    // unit ← property
    const unit = anchor
      ?? index.get(incoming(doc, prop.id, PROP_LINKS)[0] ?? "")
      ?? null;

    const args = outgoing(doc, prop.id, PROV_LINKS)
      .map((id) => index.get(id)).filter(Boolean) as EmNode[];

    if (!args.length) {
      chain.appendChild(link(prop, t("nv.roleProperty")));
      chain.appendChild(broken(t("nv.noExtraction")));
      if (unit) { chain.appendChild(arrow());
                  chain.appendChild(link(unit, t("nv.roleUnit"))); }
      chains.appendChild(chain);
      continue;
    }

    for (const arg of args) {
      const sources = outgoing(doc, arg.id, SOURCE_LINKS)
        .map((id) => index.get(id)).filter(Boolean) as EmNode[];
      if (sources.length) {
        for (const s of sources) {
          chain.appendChild(link(s, t("nv.roleSource")));
          chain.appendChild(arrow());
        }
      } else {
        chain.appendChild(broken(
          t("nv.citesNoSource", { name: nameOf(arg) })));
        chain.appendChild(arrow());
      }
      chain.appendChild(link(arg, String(arg.node_type ?? "extractor")));
      chain.appendChild(arrow());
    }
    chain.appendChild(link(prop, t("nv.roleProperty")));
    if (unit) {
      chain.appendChild(arrow());
      chain.appendChild(link(unit, t("nv.roleUnit")));
    }
    chains.appendChild(chain);
  }
  b.appendChild(chains);
  return b;
}

function link(node: EmNode, role: string): HTMLElement {
  const style = nodeStyle(String(node.node_type ?? ""));
  const item = el("span", "nv-chain-link");
  item.style.borderColor = style.border;
  item.style.background = style.fill;
  item.style.color = style.textColor;
  item.appendChild(el("span", "nv-chain-role", role));
  item.appendChild(el("span", "nv-chain-name", nameOf(node)));
  const value = (node.data ?? {}) as Record<string, unknown>;
  if (typeof value["value"] === "string" || typeof value["value"] === "number")
    item.appendChild(el("span", "nv-chain-value", String(value["value"])));
  item.title = `${node.node_type} — ${nameOf(node)}`;
  return item;
}

const arrow = (): HTMLElement => el("span", "nv-chain-arrow", "→");

/** A break in the chain, said out loud where it happens. */
const broken = (why: string): HTMLElement =>
  el("span", "nv-chain-broken", why);

// ── 6 · document / image via IIIF ────────────────────────────────────────────

/**
 * A document or image, with its picture when there is one.
 *
 * The thumbnail is a **size request** on the IIIF service — `/full/!240,240/…`
 * — which is the whole point of having adopted IIIF: no second copy of the
 * pixels, no thumbnail pipeline, and the same digest addressing the full image.
 * Click it and the reader gets the image at reading size.
 *
 * Without a configured IIIF service, or for a document that is not an image
 * (a PDF, a bibliographic entry), the card degrades to what it always was and
 * says why — it does not show a broken frame.
 */
export function documentEmbed(node: EmNode, base: string,
                              doc?: EmDocument | null): HTMLElement | null {
  if (!base || !isImageResource(node)) return null;
  const url = thumbnailUrl(node, base, 240);
  if (!url) return null;
  const fig = el("figure", "nv-doc-figure");
  const img = document.createElement("img");
  img.className = "nv-doc-thumb";
  img.loading = "lazy";
  img.alt = nameOf(node);
  img.src = url;
  // A thumbnail that 404s must not leave a broken-image glyph in a story.
  img.addEventListener("error", () => {
    fig.replaceChildren(el("figcaption", "nv-embed-note nv-implied",
      t("nv.imageServiceSilent")));
  });

  // DP-79 P5 · the image, LIVE: click the thumbnail and it opens at reading
  // size. A size request on the same IIIF service — no second copy of the
  // pixels, which is the whole reason IIIF was adopted.
  img.style.cursor = "zoom-in";
  img.title = t("nv.openReadingSize");
  img.addEventListener("click", (event) => {
    event.stopPropagation();
    openImage(node, base, doc ?? null);
  });
  fig.appendChild(img);

  // …and the regions somebody annotated on it, named. The annotator (DP-2D)
  // writes them as `annotation_region` nodes pointing at the resource; a story
  // that showed the picture without them would be hiding the reading of it.
  const regions = annotationsOn(node, doc ?? null);
  if (regions.length) {
    const list = el("div", "nv-embed-note",
      plural(regions.length, "nv.region", "nv.regions") + ": "
      + regions.map(nameOf).join(", "));
    fig.appendChild(list);
  }
  return fig;
}

/** The annotation regions drawn on this image (DP-2D), in graph order. */
export function annotationsOn(node: EmNode, doc: EmDocument | null): EmNode[] {
  const index = indexOf(doc);
  const out: EmNode[] = [];
  for (const id of incoming(doc, node.id, ["is_on_resource"])) {
    const region = index.get(id);
    if (region && String(region.node_type ?? "") === "annotation_region")
      out.push(region);
  }
  // a region may also name its resource in `data` rather than by an edge
  for (const candidate of nodesOf(doc)) {
    if (String(candidate.node_type ?? "") !== "annotation_region") continue;
    const data = (candidate.data ?? {}) as Record<string, unknown>;
    if (data["resource_id"] === node.id && !out.includes(candidate))
      out.push(candidate);
  }
  return out;
}

const RECT_KEYS = ["rect", "xywh", "region"] as const;

function rectOf(region: EmNode): [number, number, number, number] | null {
  const data = (region.data ?? {}) as Record<string, unknown>;
  for (const key of RECT_KEYS) {
    const raw = data[key];
    if (Array.isArray(raw) && raw.length === 4
        && raw.every((v) => typeof v === "number")) {
      return raw as [number, number, number, number];
    }
  }
  return null;
}

/**
 * Open the image at reading size, with its annotated regions listed.
 *
 * A lightbox rather than an embedded deep-zoom viewer, and the reason is
 * honesty about what is here: tiling needs OpenSeadragon (declared missing
 * since the IIIF layer was built), and a fake zoom that just loaded a bigger
 * JPEG while pretending to tile would be worse than saying so. What this DOES
 * do is a real IIIF size request — the image at the width of the screen — and a
 * real region request per annotation, which is the part IIIF makes free.
 *
 * Every region is a link to the SAME service with a `pct:` region, so clicking
 * one shows exactly what was annotated, cropped by the image server.
 */
export function openImage(node: EmNode, base: string,
                          doc: EmDocument | null): void {
  const overlay = el("div", "nv-lightbox");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", nameOf(node));
  overlay.tabIndex = -1;

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  const frame = el("div", "nv-lightbox-frame");
  const picture = document.createElement("img");
  picture.className = "nv-lightbox-img";
  picture.alt = nameOf(node);

  // The size has to be CLAMPED to the source, and that is why `info.json` is
  // fetched first. Asking an image server for a size larger than the original
  // is a **400** — measured on Cantaloupe, including the `!w,h` form — so a
  // lightbox that simply asked for the width of the screen showed a broken
  // frame on every image smaller than the monitor. `fittedUrl` does the
  // clamping; `max` is the answer while we do not know yet, and it is always
  // valid.
  picture.src = imageUrl(node, base, { size: "max" }) ?? "";
  const wanted = Math.min(2048, Math.max(640,
    Math.round((globalThis.innerWidth || 1200) * 0.9)));
  void fetchImageInfo(node, base).then((info) => {
    if (!info) return;
    const fitted = fittedUrl(node, base, wanted, info);
    if (fitted && fitted !== picture.src) picture.src = fitted;
  }).catch(() => { /* no info: `max` already works */ });

  picture.addEventListener("error", () => {
    picture.replaceWith(el("div", "nv-embed-note nv-implied",
      t("nv.imageServiceFailed")));
  });
  frame.appendChild(picture);

  const caption = el("div", "nv-lightbox-caption");
  caption.appendChild(el("strong", undefined, nameOf(node)));
  if (node.description)
    caption.appendChild(el("div", "nv-embed-note", String(node.description)));

  const regions = annotationsOn(node, doc);
  for (const region of regions) {
    const rect = rectOf(region);
    const line = el("div", "nv-lightbox-region");
    line.appendChild(el("span", "nv-chain-role", t("nv.roleRegion")));
    line.appendChild(el("span", undefined, nameOf(region)));
    const url = rect ? regionUrl(node, base, rect, "!600,600") : null;
    if (url) {
      const link = document.createElement("a");
      link.className = "nv-embed-link";
      link.href = url;
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      link.textContent = "vedi il ritaglio";
      line.appendChild(link);
    }
    caption.appendChild(line);
  }
  if (!regions.length)
    caption.appendChild(el("div", "nv-embed-note nv-implied",
      t("nv.noRegions")));

  const dismiss = el("button", "nv-lightbox-close", "✕") as HTMLButtonElement;
  dismiss.title = "Chiudi (Esc)";
  dismiss.addEventListener("click", close);

  frame.appendChild(caption);
  frame.appendChild(dismiss);
  overlay.appendChild(frame);
  document.body.appendChild(overlay);
  overlay.focus();
}

// ── 7 · un_scene (DP-29) ─────────────────────────────────────────────────────

/**
 * A composable Narrative-Unit scene.
 *
 * DP-29 is not in the datamodel yet, so this reads what a scene *would* be —
 * a node that composes other nodes — and otherwise renders a clean card naming
 * the reference. Declared rather than faked: an embed that invented a scene
 * would be the one thing this viewer must never do.
 */
export function unSceneEmbed(node: EmNode, doc: EmDocument | null): HTMLElement {
  const b = box("un_scene", nameOf(node), "nv-unscene");
  const parts = outgoing(doc, node.id,
    ["composes", "has_scene_part", "is_group_of"]);
  if (node.description)
    b.appendChild(el("div", "nv-embed-note", String(node.description)));
  if (!parts.length) {
    b.appendChild(el("div", "nv-embed-note nv-implied",
      t("nv.composableScene")));
    return b;
  }
  const index = indexOf(doc);
  const row = el("div", "nv-matrix-row");
  for (const id of parts) {
    const p = index.get(id);
    if (p) row.appendChild(unitChip(p));
  }
  b.appendChild(row);
  b.appendChild(el("div", "nv-embed-note",
    plural(parts.length, "nv.composedPart", "nv.composedParts")));
  return b;
}

// ── 8 · RMDoc — the 2D document that was PLACED in 3D ────────────────────────

/**
 * A representation model of a **document**: the spatialised 2D case.
 *
 * The domain correction that makes this its own card (E.D., DP-79 P3): RM and
 * RMSF express **3D** — they are geometry, and their embed is the interactive
 * stage, the same one `scene3d` uses. An **RMDoc** is the other thing: a
 * document (a section, an elevation, a historical photograph) that cannot sit
 * at (0,0,0) without a transformation, and is therefore *placed* — typically
 * with a POV or a camera sighting it.
 *
 * So its embed shows the **document**, with its IIIF picture when there is one,
 * and states what the placement is worth.
 *
 * And what is graded here is the **spatialisation, not the existence** — the
 * document certainly exists; what is more or less authoritative is where it has
 * been put. That is the `geometry` axis (`document_variant_styles`), and it is
 * why this card must NOT carry the existence ladder a stratigraphic unit gets:
 * showing "asserted" next to a photograph would say the photograph is
 * hypothetical, which is a different and false claim.
 */
const RM_3D_TYPES = new Set(["representation_model", "representation_model_sf"]);

export function isRmDoc(node: EmNode | null | undefined): boolean {
  return String(node?.node_type ?? "") === "representation_model_doc";
}

export function isRm3D(node: EmNode | null | undefined): boolean {
  return RM_3D_TYPES.has(String(node?.node_type ?? ""));
}

/** The rungs of the placement axis, in order of decreasing metric authority.
 *  Read from the visual rules rather than listed here — a rung added upstream
 *  needs no code change (invariant 1). */
export function spatialisationRungs(): string[] {
  const styles = (rules as unknown as {
    document_variant_styles?: Record<string, unknown>;
  }).document_variant_styles ?? {};
  const known = ["reality_based", "observable", "asserted", "symbolic"];
  return known.filter((k) => k in styles);
}

export function rmDocEmbed(node: EmNode, doc: EmDocument | null,
                           base: string): HTMLElement {
  const b = box("rm · documento spazializzato", nameOf(node), "nv-rmdoc");
  if (node.description)
    b.appendChild(el("div", "nv-embed-note", String(node.description)));

  // the picture: the document's own, or the one it is the RM of
  const index = indexOf(doc);
  const source = [node, ...outgoing(doc, node.id,
    ["has_linked_resource", "is_representation_of", "extracted_from"])
    .map((id) => index.get(id))
    .filter(Boolean) as EmNode[]];
  for (const candidate of source) {
    const figure = documentEmbed(candidate, base, doc);
    if (figure) { b.appendChild(figure); break; }
  }

  // …and what the placement is worth. NOT the existence — the document exists.
  const data = (node.data ?? {}) as Record<string, unknown>;
  const raw = String(data["geometry"] ?? data["certainty_class"] ?? "").trim();
  const rungs = spatialisationRungs();
  const current = QUALIA_TO_RUNG[raw.toLowerCase()] ?? raw;
  const wrap = el("div", "nv-certainty");
  wrap.appendChild(el("span", "nv-certainty-label", t("nv.placementAuthority")));
  const row = el("span", "nv-certainty-rungs");
  for (const rung of rungs) {
    const dot = el("span", "nv-rung", rung.replace("_", " "));
    if (rung === current) dot.classList.add("nv-rung-on");
    row.appendChild(dot);
  }
  wrap.appendChild(row);
  const note = el("span", "nv-certainty-why",
    rungs.includes(current)
      ? t("nv.placementWhy")
      : t("nv.placementUndeclared"));
  if (!rungs.includes(current)) note.classList.add("nv-implied");
  wrap.appendChild(note);
  b.appendChild(wrap);

  // the POV / camera that sights it, when the graph records one
  const pov = data["pov"] ?? data["camera"];
  if (pov && typeof pov === "object") {
    b.appendChild(el("div", "nv-embed-note",
      t("nv.recordedPov", { pov: JSON.stringify(pov) })));
  }
  return b;
}
