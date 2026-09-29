/**
 * S6 — the Log / Warnings tab.
 *
 * Two things live here, because the author needs them in the same place:
 *
 *  1. **What is wrong with the document.** The connection-resolution arc made
 *     these signals meaningful — a node whose type nothing recognises, a group
 *     with no EM role, an edge that had to degrade to `generic_connection`.
 *     They are the working list an author corrects the graph from.
 *  2. **What the app has been doing.** A verbose trail of loads, layouts,
 *     exports and sync events, so an unexpected state has a history behind it
 *     instead of being a mystery.
 *
 * A note on where the diagnostics come from. In EMTools the warnings are
 * produced by the s3Dgraphy importer and read off `graph.warnings`. EMStudio
 * parses the em.json itself — there is no Python importer in the browser — and
 * the em.json format does not carry a warnings section. So the same families
 * are DERIVED here from the document. They are computed from the same facts
 * the importer looks at, and grouped the same way, so the two tools tell the
 * author the same story.
 */

import { allowedEdgeTypes, GENERIC_EDGE, classOf } from "./rules";
import type { EmDocument } from "./types";

// ── activity log ──────────────────────────────────────────────────────────────

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  /** ms since the page loaded — a wall clock would be noise here. */
  at: number;
  /** SHIFT-A · the wall clock, for «Storia di questo nodo» (an hour, not an offset) */
  wall: number;
  /** SHIFT-A · the nodes the entry is ABOUT: the inspector's node history and
   *  the drawer's «solo la selezione» filter read them. Optional — most of the
   *  log (sync, loads) is about no node in particular. */
  ids?: string[];
}

/** Ring buffer. A session can emit a lot of sync traffic; keeping the last few
 *  hundred entries is what a log is for, holding all of them is a leak. */
const MAX_ENTRIES = 500;
const entries: LogEntry[] = [];
let listener: (() => void) | null = null;

function push(level: LogLevel, message: string, ids?: string[]): void {
  entries.push({
    level,
    message,
    at: Math.round(performance.now()),
    wall: Date.now(),
    ...(ids?.length ? { ids } : {}),
  });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  listener?.();
}

export const logInfo = (m: string, ids?: string[]): void => push("info", m, ids);
export const logWarn = (m: string, ids?: string[]): void => push("warn", m, ids);
export const logError = (m: string, ids?: string[]): void => push("error", m, ids);

export function logEntries(): readonly LogEntry[] {
  return entries;
}

export function clearLog(): void {
  entries.length = 0;
  listener?.();
}

/** Called whenever the log changes, so the panel can redraw if it is visible. */
export function onLogChange(fn: () => void): void {
  listener = fn;
}

// ── document diagnostics ──────────────────────────────────────────────────────

/** One warning, in the same shape s3Dgraphy publishes: `{kind, node_id,
 *  message}`. `nodeId` is the element to reveal when the reader clicks it —
 *  for an edge warning, its source, since an edge is not selectable on its own
 *  in most views and the source is where you need to look first. */
export interface DiagnosticRecord {
  kind: string;
  nodeId: string;
  message: string;
  edgeId?: string;
  targetId?: string;
  /** For a degraded edge: the relations the datamodel WOULD allow between its
   *  endpoints. Shown in the tooltip as information — re-typing an edge is the
   *  author's decision, made in the source graph, not a click here. */
  candidates?: string[];
}

export interface DiagnosticGroup {
  key: string;
  label: string;
  records: DiagnosticRecord[];
}

/** The warning-kind vocabulary. These strings are NOT local to EMStudio: they
 *  are the same spelling s3Dgraphy publishes in
 *  `edges/connection_resolver.WARNING_KINDS`, and the EMTools panel groups by.
 *  One vocabulary across the three tools — do not diverge it here.
 *  `unknown_node_type` is the one family EMStudio adds on its own: only a
 *  client reading a document with a newer datamodel can notice it. */
const KIND_UNTYPED_NODE = "untyped_node";
const KIND_UNCLASSIFIED_GROUP = "unclassified_group";
const KIND_DEGRADED_EDGE = "degraded_edge";
const KIND_UNKNOWN_NODE_TYPE = "unknown_node_type";

/** Node types that mean "this box carries no EM meaning". `Node` is the bare
 *  node the GraphML importer produces when a yEd shape matches nothing;
 *  `Group` is a box with no palette colour, hence no role. */
const UNTYPED_NODE_TYPE = "Node";
const ROLELESS_GROUP_TYPE = "Group";

function nameOf(id: string, name?: string): string {
  return name && name.trim() ? name.trim() : id;
}

/**
 * Derive the warning families from a loaded document.
 *
 * Nothing is guessed and nothing is corrected: this only reports what the
 * document itself says. Fixing it is the author's job, in the source graph.
 */
export function documentDiagnostics(doc: EmDocument | null): DiagnosticGroup[] {
  if (!doc?.graph) return [];
  const untyped: DiagnosticRecord[] = [];
  const unknown: DiagnosticRecord[] = [];
  const roleless: DiagnosticRecord[] = [];

  for (const n of doc.graph.nodes ?? []) {
    const t = n.node_type;
    if (!t || t === UNTYPED_NODE_TYPE) {
      untyped.push({
        kind: KIND_UNTYPED_NODE,
        nodeId: n.id,
        message:
          `${nameOf(n.id, n.name)} — no recognised EM type; it and its ` +
          `connections stay untyped`,
      });
    } else if (t === ROLELESS_GROUP_TYPE) {
      roleless.push({
        kind: KIND_UNCLASSIFIED_GROUP,
        nodeId: n.id,
        message:
          `${nameOf(n.id, n.name)} — group with no EM role (no palette ` +
          `colour): kept as an organisational box`,
      });
    } else if (classOf(t) === UNTYPED_NODE_TYPE) {
      // The document declares a type this build's datamodel has never heard
      // of. That is a version gap, not an authoring mistake — say so.
      unknown.push({
        kind: KIND_UNKNOWN_NODE_TYPE,
        nodeId: n.id,
        message:
          `${nameOf(n.id, n.name)} — node_type "${t}" is not in this build's ` +
          `datamodel; it renders untyped`,
      });
    }
  }

  const degraded: DiagnosticRecord[] = [];
  const byId = new Map((doc.graph.nodes ?? []).map((n) => [n.id, n]));
  for (const e of doc.graph.edges ?? []) {
    if (e.edge_type !== GENERIC_EDGE) continue;
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    degraded.push({
      kind: KIND_DEGRADED_EDGE,
      nodeId: e.source,
      edgeId: e.id,
      targetId: e.target,
      candidates: allowedEdgeTypes(s?.node_type, t?.node_type),
      message:
        `${nameOf(e.source, s?.name)} → ${nameOf(e.target, t?.name)} — ` +
        `degraded to ${GENERIC_EDGE}`,
    });
  }

  const groups: DiagnosticGroup[] = [
    { key: KIND_UNTYPED_NODE, label: "Nodes with no recognised EM type", records: untyped },
    { key: KIND_UNCLASSIFIED_GROUP, label: "Groups with no EM role", records: roleless },
    { key: KIND_DEGRADED_EDGE, label: "Connections degraded to generic_connection", records: degraded },
    { key: KIND_UNKNOWN_NODE_TYPE, label: "Node types this build does not know", records: unknown },
  ].filter((g) => g.records.length > 0);

  // Biggest problem first; ties keep declaration order so the panel does not
  // reshuffle between two loads of the same document.
  groups.sort((a, b) => b.records.length - a.records.length);
  return groups;
}

// ── version banner ────────────────────────────────────────────────────────────

/**
 * Which language version am I working with? Two versions are always in play:
 * the one the DOCUMENT declares, and the one this build READS with. Fields the
 * document does not declare are left out rather than shown empty — an absence
 * is information (a legacy file), not a blank to fill.
 */
export function versionBanner(doc: EmDocument | null): string {
  const parts: string[] = [];
  const header = (doc?.header ?? {}) as Record<string, unknown>;
  const schema = header["schema_version"];
  if (schema !== undefined && schema !== null && schema !== "")
    parts.push(`em.json schema ${String(schema)}`);
  const fmt = header["version"];
  if (fmt) parts.push(`format ${String(fmt)}`);
  const dm = header["datamodel_versions"] as Record<string, unknown> | undefined;
  if (dm?.["nodes"]) parts.push(`EM ${String(dm["nodes"])} (file)`);
  const sg = header["stratigraph_version"];
  if (sg) parts.push(`StratiGraph ${String(sg)}`);
  return parts.join(" · ");
}

// ── rendering ─────────────────────────────────────────────────────────────────

/** How many lines a family shows before collapsing. The point is that the
 *  author recognises the PROBLEM; the exhaustive list is one click away. */
const MAX_PER_GROUP = 10;

const LEVEL_MARK: Record<LogLevel, string> = {
  info: "·",
  warn: "!",
  error: "×",
};

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Groups the panel currently has expanded, kept across redraws so a redraw
 *  (a sync event, a new log line) does not collapse what the author opened. */
const expanded = new Set<string>();

/** What a warning line offers to do about the element it names. Supplied by
 *  main.ts, which owns selection and the viewport. */
export type RevealFn = (nodeId: string) => void;

export function renderLogPanel(
  container: HTMLElement,
  doc: EmDocument | null,
  readWithVersion: string,
  onReveal?: RevealFn,
): void {
  container.textContent = "";

  // — version banner —
  const banner = el("div", "log-banner");
  const declared = versionBanner(doc);
  banner.textContent = declared
    ? `${declared} — read with EM ${readWithVersion}`
    : `no version declared — read with EM ${readWithVersion}`;
  container.appendChild(banner);

  // — diagnostics —
  const groups = documentDiagnostics(doc);
  const diagHead = el("div", "log-section", groups.length
    ? `Document warnings (${groups.reduce((n, g) => n + g.records.length, 0)})`
    : "Document warnings (0)");
  container.appendChild(diagHead);

  if (!groups.length) {
    container.appendChild(
      el("div", "log-empty", doc ? "Nothing left unresolved." : "No document loaded."),
    );
  }

  for (const g of groups) {
    const box = el("div", "log-group");
    const head = el("button", "log-group-head");
    const open = expanded.has(g.key);
    head.textContent = `${open ? "▾" : "▸"} ${g.label} (${g.records.length})`;
    head.addEventListener("click", () => {
      if (expanded.has(g.key)) expanded.delete(g.key);
      else expanded.add(g.key);
      renderLogPanel(container, doc, readWithVersion, onReveal);
    });
    box.appendChild(head);
    if (open) {
      const list = el("ul", "log-list");
      for (const r of g.records.slice(0, MAX_PER_GROUP)) {
        const li = el("li", undefined, r.message);
        li.dataset.nodeId = r.nodeId;
        // The candidates are INFORMATION, not an action: which relation an edge
        // should have carried is an authorial decision, made in the source
        // graph. Showing them here saves the author a lookup, nothing more.
        const hints: string[] = [];
        if (r.candidates?.length)
          hints.push(`the datamodel allows: ${r.candidates.join(", ")}`);
        if (onReveal) {
          li.classList.add("log-clickable");
          li.tabIndex = 0;
          li.setAttribute("role", "button");
          hints.push("click to select and centre it");
          const reveal = () => onReveal(r.nodeId);
          li.addEventListener("click", reveal);
          li.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              reveal();
            }
          });
        }
        if (hints.length) li.title = hints.join(" — ");
        list.appendChild(li);
      }
      const hidden = g.records.length - MAX_PER_GROUP;
      if (hidden > 0) {
        // Never let a cap read as "that was all of them".
        list.appendChild(
          el("li", "log-more", `… and ${hidden} more of the same`),
        );
      }
      box.appendChild(list);
    }
    container.appendChild(box);
  }

  // — activity —
  const actHead = el("div", "log-section", `Activity (${entries.length})`);
  const clear = el("button", "log-clear", "clear");
  clear.addEventListener("click", () => clearLog());
  actHead.appendChild(clear);
  container.appendChild(actHead);

  const log = el("ul", "log-list log-activity");
  // Newest first: the thing that just happened is the thing being looked for.
  for (const e of [...entries].reverse()) {
    const li = el("li", `log-${e.level}`);
    li.textContent = `${LEVEL_MARK[e.level]} ${e.message}`;
    log.appendChild(li);
  }
  container.appendChild(log);
}
