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
  /** CAMPAGNA · the CORRECTION of the row, in its own column: a menu (an epoch,
   *  a relation the datamodel admits between the two types), a field and a
   *  button (a new name), or one button («It's me», «+ property»). Data, not
   *  DOM: the table draws it, the caller's `run` writes through the store, so
   *  every correction is one undo step. */
  fix?: IssueFix;
}

export type IssueFix =
  | { kind: "pick"; placeholder: string; options: Array<{ value: string; label: string; group?: string }>;
      run: (value: string) => void }
  | { kind: "rename"; value: string; label: string; run: (value: string) => void }
  | { kind: "button"; label: string; run: () => void };

/** What the corrections are made with — the caller binds them to the store. */
export interface IssueFixers {
  /** `unit ──has_first_epoch──▶ epoch` */
  assignEpoch?: (unitId: string, epochId: string) => void;
  /** the signing identity as the extractor's author; null when none is declared
   *  (the button then opens the identity) */
  itsMe?: { label: string; run: (extractorId: string) => void };
  rename?: { label: string; run: (nodeId: string, name: string) => void };
  /** a degraded edge → the relation chosen (`reverse`: the arrow turned) */
  retype?: (edgeId: string, edgeType: string, reverse: boolean) => void;
  /** «+ property» for a unit with none */
  addProperty?: { label: string; run: (unitId: string) => void };
  /** the label of a relation (its datamodel name, in the interface language) */
  edgeLabel?: (edgeType: string) => string;
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
  /** AUDIT N5 · «Verifica la cronologia»: the remedy of every overlap and
   *  coherence row — the window that checks the deltas and corrects them */
  checkChronology?: { label: string; run: () => void };
  laneOrderText?: string;
  /** `documentDiagnostics` records, flattened — a degraded edge carries its
   *  id, its target and the relations the datamodel admits (`candidates`) */
  diagnostics?: Array<{ kind: string; nodeId: string; message: string; edgeId?: string; targetId?: string;
                        candidates?: string[]; reverse?: string[]; origin?: string }>;
  /** CAMPAGNA · the corrections, one per rule */
  fixers?: IssueFixers;
  /** CAMPAGNA · a node whose NAME is given by construction, not by a person (a
   *  continuity node is «continuity_node» wherever it is): no «duplicate name» */
  namedByConstruction?: (nodeType: string | undefined) => boolean;
  /** the socket check: is this edge type allowed between these node types? */
  edgeAllowed?: (edgeType: string, sourceType: string, targetType: string) => boolean | null;
  /** NAME1 statuses */
  names?: Map<string, { status: "ok" | "warn" | "dup"; reason?: string; outOfRule?: boolean; suggestion?: string }>;
  /** RIFINITURE · «Rinomina secondo la regola» for the extractors named before
   *  `<source>.<NN>`: one node, or many at once (one undo step) */
  renameRule?: { label: string; bulkLabel: (n: number) => string; run: (nodes: string[]) => void };
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
    push({ node: "", sev: "warn", rule: "chronology", txt: w,
           ...(src.checkChronology ? { action: src.checkChronology } : {}) });
  if (src.epochWarnings)
    for (const n of nodes)
      if (n.node_type === "EpochNode")
        for (const w of src.epochWarnings(n.id))
          push({ node: n.id, sev: "warn", rule: "chronology", txt: `${name(n.id)}: ${w}`,
                 ...(src.checkChronology ? { action: src.checkChronology } : {}) });

  const fx = src.fixers ?? {};
  const label = fx.edgeLabel ?? ((e: string) => e);
  // ── the datamodel: diagnostics already computed, and the socket check ─────
  for (const d of src.diagnostics ?? []) {
    // CAMPAGNA · a connection degraded to generic_connection: said with where it
    // came from (the GraphML edge, when the em.json kept its id), and corrected
    // with a relation the datamodel admits between the two types — either way
    // round, since a yEd arrow is only a line style
    if (d.edgeId && d.targetId && (d.candidates || d.reverse)) {
      const options = [
        ...(d.candidates ?? []).map((e) => ({ value: `${e}|`, label: label(e), group: t("issues.fixSameWay") })),
        ...(d.reverse ?? []).map((e) => ({ value: `${e}|rev`, label: `← ${label(e)}`, group: t("issues.fixReverse") })),
      ];
      const edgeId = d.edgeId;
      push({ node: d.nodeId, sev: "warn", rule: "datamodel",
             txt: t(d.origin ? "issues.degradedFrom" : "issues.degraded",
                    { s: name(d.nodeId), d: name(d.targetId), origin: d.origin ?? "" }),
             ...(fx.retype && options.length ? { fix: { kind: "pick" as const, placeholder: t("issues.fixRelation"), options,
                 run: (v: string) => { const [e, rev] = v.split("|"); fx.retype!(edgeId, e, rev === "rev"); } } } : {}) });
      continue;
    }
    push({ node: d.nodeId, sev: "warn", rule: "datamodel", txt: d.message });
  }
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

  // ── CAMPAGNA · the same `type` and `name` twice: units, documents and
  //    extractors. Properties are left out — they carry the same name BY
  //    CONSTRUCTION («Material» 55 times in TempluMare). The fix is a new name.
  const twins = new Map<string, string[]>();
  for (const n of nodes) {
    const nm = String(n.name ?? "").trim();
    if (!nm || !(src.isUnit(n.node_type) || n.node_type === "document" || n.node_type === "extractor")) continue;
    if (src.namedByConstruction?.(n.node_type)) continue;
    const k = `${n.node_type}\u0000${nm}`;
    (twins.get(k) ?? twins.set(k, []).get(k)!).push(n.id);
  }
  const dupNamed = new Set<string>();
  for (const ids of twins.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      dupNamed.add(id);
      const n = byId.get(id)!;
      push({ node: id, sev: "warn", rule: "dupname",
             txt: t("issues.dupName", { n: name(id), k: String(ids.length - 1), type: n.node_type,
                                        d: String(n.description ?? "").slice(0, 60) }),
             ...(fx.rename ? { fix: { kind: "rename" as const, value: String(n.name ?? ""), label: fx.rename.label,
                                      run: (v: string) => fx.rename!.run(id, v) } } : {}) });
    }
  }

  // ── naming (NAME1): a duplicate is a warning, a malformed name a hint ─────
  for (const [id, st] of src.names ?? []) {
    if (!byId.has(id) || st.status === "ok") continue;
    // the same type AND name is said once, by the rule above (with its fix)
    if (st.status === "dup" && dupNamed.has(id)) continue;
    // RIFINITURE · an extractor named before the rule: information, with the
    // rename one click away — never applied on its own
    if (st.outOfRule && st.status === "warn") {
      const r = src.renameRule;
      push({ node: id, sev: "info", rule: "naming",
             txt: t("issues.nameRule", { n: name(id), s: st.suggestion ?? "" }),
             ...(r ? { action: { label: r.label, run: () => r.run([id]) },
                       bulk: { key: "name-rule", label: r.bulkLabel, run: r.run } } : {}) });
      continue;
    }
    push({ node: id, sev: st.status === "dup" ? "warn" : "info", rule: "naming",
             txt: `${name(id)}: ${st.reason ?? t(st.status === "dup" ? "issues.nameDup" : "issues.nameWarn")}` });
  }

  // ── hints that cost nothing: a unit with no property, an extractor with no
  //    author (the desk's two «suggerimenti») ───────────────────────────────
  const hasOut = new Map<string, Set<string>>();
  for (const e of doc.graph.edges ?? []) {
    const set = hasOut.get(e.source) ?? new Set<string>();
    set.add(e.edge_type ?? "");
    hasOut.set(e.source, set);
  }
  const epochs = nodes.filter((n) => n.node_type === "EpochNode")
    .map((n) => ({ value: n.id, label: name(n.id) }));
  for (const n of nodes) {
    if (src.isUnit(n.node_type) && !hasOut.get(n.id)?.has("has_first_epoch"))
      push({ node: n.id, sev: "warn", rule: "epoch",
             txt: t("issues.noEpoch", { n: name(n.id) }),
             ...(fx.assignEpoch && epochs.length ? { fix: { kind: "pick" as const, placeholder: t("issues.fixEpoch"),
                 options: epochs, run: (v: string) => fx.assignEpoch!(n.id, v) } } : {}) });
    if (src.isUnit(n.node_type) && !hasOut.get(n.id)?.has("has_property"))
      push({ node: n.id, sev: "info", rule: "paradata",
             txt: t("issues.noProps", { n: name(n.id) }),
             ...(fx.addProperty ? { fix: { kind: "button" as const, label: fx.addProperty.label,
                                           run: () => fx.addProperty!.run(n.id) } } : {}) });
    if (n.node_type === "extractor" && !hasOut.get(n.id)?.has("has_author"))
      push({ node: n.id, sev: "info", rule: "author",
             txt: t("issues.noAuthor", { n: name(n.id) }),
             ...(fx.itsMe ? { fix: { kind: "button" as const, label: fx.itsMe.label,
                                     run: () => fx.itsMe!.run(n.id) } } : {}) });
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
