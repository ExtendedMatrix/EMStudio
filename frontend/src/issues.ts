/**
 * STRUTTURA · ONE model of what needs attention NOW: `issues()`.
 *
 * Before tonight a warning lived in five places, each with its own count and its
 * own look: a pill that counted the LOG, a floating banner for the chronology,
 * a «⚠ Coherence» box in the inspector, orange labels on the canvas, a tab of
 * datamodel diagnostics. The desk's rule is three places for one model:
 *
 *   · COUNTED in one place — the status-bar pill («▲ n · ● m»);
 *   · MARKED where they are — a ▲ in the outliner, a «!» on the canvas node;
 *   · EXPLAINED in the inspector — for the selected node only.
 *
 * The LOG stays the log: the history of what happened. This is the state of
 * now, recomputed from the document on every change. (What the log OWES
 * somebody — its warn/error lines — is appended by the caller, `allIssues` in
 * main.ts, so a burst of log lines never recomputes the document.)
 *
 * Pure: every source that needs the store or the scene is HANDED IN by the
 * caller (`IssueSources`), so this module runs in node (`check-studio.mjs`).
 */
import type { EmDocument, EmNode } from "./types";

export type IssueSeverity = "warn" | "info";

export interface Issue {
  /** stable within one computation: rule + node + index */
  id: string;
  /** the node the issue is ABOUT; "" for a document-level issue */
  node: string;
  sev: IssueSeverity;
  /** a short machine word, filterable: chronology · datamodel · naming · … */
  rule: string;
  txt: string;
  /** a one-click fix, when there is one (e.g. «sort lanes by date») */
  action?: { label: string; run: () => void };
  /** CATENA · the same fix for MANY rows at once (the table's «Verifica tutti»):
   *  rows with the same `key` are fixed together, with the nodes they are about */
  bulk?: { key: string; label: (n: number) => string; run: (nodes: string[]) => void };
}

export interface IssueSources {
  doc: EmDocument | null;
  /** live nodes (tombstones filtered) */
  nodes: EmNode[];
  isUnit: (nodeType: string | undefined) => boolean;
  /** `store.epochCoherenceWarnings` per epoch */
  epochWarnings?: (epochId: string) => string[];
  /** `store.crossEpochWarnings` — document-level */
  crossEpoch?: string[];
  /** false when the lane stack is out of chronological order */
  lanesInOrder?: boolean;
  sortLanes?: { label: string; run: () => void };
  laneOrderText?: string;
  /** `documentDiagnostics` records, flattened */
  diagnostics?: Array<{ kind: string; nodeId: string; message: string }>;
  /** the socket check: is this edge type allowed between these node types? */
  edgeAllowed?: (edgeType: string, sourceType: string, targetType: string) => boolean | null;
  /** NAME1 statuses */
  names?: Map<string, { status: "ok" | "warn" | "dup"; reason?: string }>;
  /** CATENA · s3dgraphy `api.validate["info"]`, the client reading of
   *  `diagnostics.extraction_source_hints`: an extractor that reads a unit
   *  without a property of the name it feeds. A SUGGESTION, never a warning. */
  sourceHints?: Array<{ extractor: string; extractor_name: string; unit_name: string; property_name: string }>;
  /** CATENA · the AI nodes nobody verified (`ai-validation.unvalidatedAi`),
   *  and the verification that clears them */
  aiNodes?: Array<{ node: string; name: string; via: "marker" | "has_author"; fields: string[] | null }>;
  verifyAi?: { label: string; bulkLabel: (n: number) => string; run: (nodes: string[]) => void };
  /** i18n for the hint texts */
  t: (key: string, vars?: Record<string, string>) => string;
}

/** Edge types the socket check never judges: membership and bookkeeping that
 *  every node may carry, and the one generic fallback (reported as degraded). */
const SOCKET_EXEMPT = new Set(["generic_connection"]);

export function issues(src: IssueSources): Issue[] {
  const out: Issue[] = [];
  const { doc, nodes, t } = src;
  if (!doc) return out;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const name = (id: string): string => String(byId.get(id)?.name || id);
  const push = (i: Omit<Issue, "id">): void => {
    out.push({ ...i, id: `${i.rule}:${i.node}:${out.length}` });
  };

  // ── chronology (the banner's two halves, and the inspector's box) ─────────
  if (src.lanesInOrder === false)
    push({ node: "", sev: "warn", rule: "chronology",
           txt: src.laneOrderText ?? "lanes out of chronological order",
           action: src.sortLanes });
  for (const w of src.crossEpoch ?? [])
    push({ node: "", sev: "warn", rule: "chronology", txt: w });
  if (src.epochWarnings)
    for (const n of nodes)
      if (n.node_type === "EpochNode")
        for (const w of src.epochWarnings(n.id))
          push({ node: n.id, sev: "warn", rule: "chronology", txt: `${name(n.id)}: ${w}` });

  // ── the datamodel: diagnostics already computed, and the socket check ─────
  for (const d of src.diagnostics ?? [])
    push({ node: d.nodeId, sev: "warn", rule: "datamodel", txt: d.message });
  if (src.edgeAllowed)
    for (const e of doc.graph.edges ?? []) {
      const et = e.edge_type ?? "";
      if (!et || SOCKET_EXEMPT.has(et)) continue;
      const s = byId.get(e.source);
      const d = byId.get(e.target);
      if (!s || !d) continue;
      if (src.edgeAllowed(et, s.node_type, d.node_type) === false)
        push({ node: s.id, sev: "warn", rule: "datamodel",
               txt: t("issues.socket", { s: name(s.id), e: et, d: name(d.id), dt: d.node_type }) });
    }

  // ── naming (NAME1): a duplicate is a warning, a malformed name a hint ─────
  for (const [id, st] of src.names ?? [])
    if (byId.has(id) && st.status !== "ok")
      push({ node: id, sev: st.status === "dup" ? "warn" : "info", rule: "naming",
             txt: `${name(id)}: ${st.reason ?? t(st.status === "dup" ? "issues.nameDup" : "issues.nameWarn")}` });

  // ── hints that cost nothing: a unit with no property, an extractor with no
  //    author (the desk's two «suggerimenti») ───────────────────────────────
  const hasOut = new Map<string, Set<string>>();
  for (const e of doc.graph.edges ?? []) {
    const set = hasOut.get(e.source) ?? new Set<string>();
    set.add(e.edge_type ?? "");
    hasOut.set(e.source, set);
  }
  for (const n of nodes) {
    if (src.isUnit(n.node_type) && !hasOut.get(n.id)?.has("has_first_epoch"))
      push({ node: n.id, sev: "warn", rule: "epoch",
             txt: t("issues.noEpoch", { n: name(n.id) }) });
    if (src.isUnit(n.node_type) && !hasOut.get(n.id)?.has("has_property"))
      push({ node: n.id, sev: "info", rule: "paradata",
             txt: t("issues.noProps", { n: name(n.id) }) });
    if (n.node_type === "extractor" && !hasOut.get(n.id)?.has("has_author"))
      push({ node: n.id, sev: "info", rule: "author",
             txt: t("issues.noAuthor", { n: name(n.id) }) });
  }

  // ── CATENA · reading from a unit: a hint when the unit lacks the property ──
  for (const h of src.sourceHints ?? [])
    push({ node: h.extractor, sev: "info", rule: "paradata",
           txt: t("issues.sourceHint", { x: h.extractor_name, u: h.unit_name, p: h.property_name }) });

  // ── CATENA · a node made with AI support (or by an AI author) that no person
  //    verified: a warning, until somebody verifies it with their identity ──
  for (const a of src.aiNodes ?? []) {
    const v = src.verifyAi;
    push({ node: a.node, sev: "warn", rule: "ai",
           txt: t(a.via === "has_author" ? "issues.aiAuthor" : "issues.aiNode", { n: a.name || a.node }),
           ...(v ? { action: { label: v.label, run: () => v.run([a.node]) },
                     bulk: { key: "ai", label: v.bulkLabel, run: v.run } } : {}) });
  }

  // ── COLLEGARE · the story: an AI paragraph no person validated is a warning
  //    (rule `ai`, as for a node), until somebody signs it. One per chapter.
  for (const n of nodes) {
    if (n.node_type !== "narrative") continue;
    const chapters = ((n.data ?? {}) as { chapters?: { title?: string; blocks?: {
      block_type?: string; ai_generated?: boolean; validated_by?: string | null }[] }[] }).chapters ?? [];
    chapters.forEach((c) => {
      const k = (c.blocks ?? []).filter((b) =>
        (b.block_type ?? "prose") === "prose" && b.ai_generated && !b.validated_by).length;
      if (k) push({ node: n.id, sev: "warn", rule: "ai",
                    txt: t("issues.aiProse", { n: name(n.id), ch: String(c.title ?? ""), k: String(k) }) });
    });
  }
  return out;
}

/**
 * The unit an issue BELONGS to, for the outliner mark: the node itself when it
 * is a unit, else the unit whose paradata group holds it (an extractor, a
 * property), else nothing.
 */
export function unitOfIssue(doc: EmDocument, isUnit: (t: string | undefined) => boolean,
                            nodes: EmNode[]): (nodeId: string) => string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const groupOwner = new Map<string, string>();   // paradata group → unit
  const inGroup = new Map<string, string>();      // member → paradata group
  for (const e of doc.graph.edges ?? []) {
    if (e.edge_type === "has_paradata_nodegroup") groupOwner.set(e.target, e.source);
    else if (e.edge_type === "is_in_paradata_nodegroup") inGroup.set(e.source, e.target);
  }
  return (id: string): string | null => {
    const n = byId.get(id);
    if (!n) return null;
    if (isUnit(n.node_type)) return id;
    const g = inGroup.get(id);
    const u = g ? groupOwner.get(g) : undefined;
    return u && isUnit(byId.get(u)?.node_type) ? u : null;
  };
}
