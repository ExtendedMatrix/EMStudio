/**
 * CATENA · human authorship with AI support, on NODES — the client reading of
 * `s3dgraphy.ai_validation` (connections 1.6.25), same names, same rules:
 *
 *   data.ai_assisted = {by, model?, prompt_ref?, fields?}   by = AuthorAINode id
 *   data.validated_by = a human AuthorNode with data.orcid   (never an AI)
 *   data.validated_at = ISO 8601 UTC
 *
 * A node with the marker and no `validated_by` is NOT VALIDATED: it stays among
 * the warnings (rule `ai`) and out of the exports until a person verifies it.
 * The node's author stays the person — the marker says the person had help.
 *
 * One addition, E.D.'s rule (2026-09-29) read literally: «ogni dato generato con
 * AI resta negli avvisi finché una persona non lo verifica». StratiMiner writes
 * whole chains whose extractor `has_author` an AuthorAINode and carries no
 * marker; the library's `unvalidated_ai` does not see those, this reader does
 * (`via: "has_author"`), and Verify clears them the same way.
 */
import type { DocumentStore } from "./model";
import type { EmDocument, EmNode } from "./types";
import { authorForIdentity, type SignerIdentity } from "./narrative-authorship";
import { isStale, originalOf, reviewRequested, TRANSLATION_TYPE } from "./translation";

export const AI_ASSISTED = "ai_assisted";
export const AI_GENERATED_ALIAS = "ai_generated";
export const VALIDATED_BY = "validated_by";
export const VALIDATED_AT = "validated_at";
/** dev27 · `{mode: orcid | node_password, attested_by?}` beside `validated_by` */
export const VALIDATED_AUTH = "validated_auth";
export const AI_AUTHOR_TYPE = "author_ai";
export const HUMAN_AUTHOR_TYPE = "author";

export interface AiMarker {
  by?: string;
  model?: string;
  prompt_ref?: string;
  fields?: string[];
}

const dataOf = (n: EmNode | undefined): Record<string, unknown> =>
  ((n?.data ?? {}) as Record<string, unknown>);

/** The node's AI marker, normalised, or null. Reads the narrative alias too. */
export function aiMarker(n: EmNode | undefined): AiMarker | null {
  const d = dataOf(n);
  const m = d[AI_ASSISTED];
  if (m && typeof m === "object") return { ...(m as AiMarker) };
  if (m) return {};
  if (d[AI_GENERATED_ALIAS]) {
    const out: AiMarker = {};
    if (d.authored_by) out.by = String(d.authored_by);
    if (d.prompt_ref) out.prompt_ref = String(d.prompt_ref);
    return out;
  }
  return null;
}

export const isValidated = (n: EmNode | undefined): boolean => !!dataOf(n)[VALIDATED_BY];

/** The AuthorAINode a node `has_author`, when it has one (StratiMiner). */
function aiAuthorOf(doc: EmDocument, id: string): string | null {
  const types = new Map(doc.graph.nodes.map((n) => [n.id, n.node_type]));
  const e = doc.graph.edges.find((x) => x.source === id && x.edge_type === "has_author"
    && types.get(x.target) === AI_AUTHOR_TYPE
    && !((x.attributes ?? {}) as Record<string, unknown>).removed);
  return e ? e.target : null;
}

export interface UnvalidatedRow {
  node: string;
  name: string;
  node_type: string;
  fields: string[] | null;
  by: string | null;
  model: string | null;
  /** `marker` = data.ai_assisted (the library's rule); `has_author` = an
   *  extractor authored by an AuthorAINode (StratiMiner), E.D.'s rule */
  via: "marker" | "has_author";
}

/** Every AI node no person has verified — `api.unvalidated_ai`, plus the
 *  AI-authored extractors. Narrative blocks are not here (their own rule). */
export function unvalidatedAi(doc: EmDocument): UnvalidatedRow[] {
  const out: UnvalidatedRow[] = [];
  for (const n of doc.graph.nodes) {
    if (dataOf(n).removed || isValidated(n)) continue;
    const m = aiMarker(n);
    if (m) {
      out.push({ node: n.id, name: String(n.name ?? ""), node_type: n.node_type,
                 fields: m.fields?.length ? [...m.fields] : null, by: m.by ?? null,
                 model: m.model ?? null, via: "marker" });
      continue;
    }
    if (n.node_type === "narrative") continue;
    const ai = aiAuthorOf(doc, n.id);
    if (ai) out.push({ node: n.id, name: String(n.name ?? ""), node_type: n.node_type,
                       fields: null, by: ai, model: null, via: "has_author" });
  }
  return out;
}

export function isUnvalidatedAi(doc: EmDocument, id: string): boolean {
  const n = doc.graph.nodes.find((x) => x.id === id);
  if (!n || isValidated(n)) return false;
  return !!aiMarker(n) || aiAuthorOf(doc, id) !== null;
}

/** Is the node AI-touched at all (validated or not)? For the chip. */
export function aiState(doc: EmDocument, id: string): "none" | "pending" | "verified" {
  const n = doc.graph.nodes.find((x) => x.id === id);
  if (!n) return "none";
  if (!aiMarker(n) && !aiAuthorOf(doc, id)) return "none";
  return isValidated(n) ? "verified" : "pending";
}

/** The AuthorAINode for a provider/model — found, or created in the caller's
 *  batch (the same shape the narrative's drafts use). */
export function aiAuthorFor(store: DocumentStore, provider: string, model: string): string {
  const name = model ? `${provider} · ${model}` : provider;
  const found = store.doc.graph.nodes.find((n) => n.node_type === AI_AUTHOR_TYPE
    && (String(dataOf(n).model ?? "") === model && String(dataOf(n).provider ?? "") === provider));
  if (found) return found.id;
  const id = store.newId();
  store.addNode({ id, node_type: AI_AUTHOR_TYPE, name, description: "",
                  data: { provider, model } } as EmNode);
  return id;
}

/** Write the marker (and clear a previous verification: new help, unchecked). */
export function markAiAssisted(store: DocumentStore, nodeId: string, m: AiMarker): void {
  const n = store.node(nodeId);
  if (!n || !m.by) return;
  const data = { ...dataOf(n) };
  const marker: AiMarker = { by: m.by };
  if (m.model) marker.model = m.model;
  if (m.prompt_ref) marker.prompt_ref = m.prompt_ref;
  if (m.fields?.length) marker.fields = [...new Set(m.fields)].sort();
  data[AI_ASSISTED] = marker;
  delete data[AI_GENERATED_ALIAS];
  delete data[VALIDATED_BY];
  delete data[VALIDATED_AT];
  store.updateNode(nodeId, { data });
}

// ── TRADUZIONI · what waits for a person, and why (dev26 `needs_review`) ────
//
// ONE vocabulary for every node, the library's: `ai` (AI content nobody
// verified), `review_requested` («da rivedere», asked by whoever made it, not
// signed yet), `stale` (a translation whose original changed: «da riallineare»,
// which NO signature closes — only a translation of the new text).

export type ReviewReason = "ai" | "review_requested" | "stale";

/** Why `id` waits for a person — `[]` when it does not. */
export function needsReview(doc: EmDocument, id: string): ReviewReason[] {
  const n = doc.graph.nodes.find((x) => x.id === id);
  if (!n || dataOf(n).removed) return [];
  const out: ReviewReason[] = [];
  if (isUnvalidatedAi(doc, id)) out.push("ai");
  if (reviewRequested(n) && !isValidated(n)) out.push("review_requested");
  if (n.node_type === TRANSLATION_TYPE && isStale(doc, n)) out.push("stale");
  return out;
}

export interface ReviewRow {
  node: string;
  name: string;
  node_type: string;
  reasons: ReviewReason[];
  /** a translation: the translated node, its field, the language, the method */
  of?: string;
  field?: string;
  lang?: string;
  method?: string;
  /** AI: the AuthorAINode and the model, and how it is known (the marker, or
   *  an extractor `has_author` an AuthorAINode — StratiMiner) */
  by?: string | null;
  model?: string | null;
  via?: "marker" | "has_author";
}

/** Everything that waits for a person — `api.to_review(graph)`, and the
 *  AI-authored extractors of `unvalidatedAi` (E.D.'s rule) with them. */
export function toReview(doc: EmDocument): ReviewRow[] {
  const out: ReviewRow[] = [];
  for (const n of doc.graph.nodes) {
    const reasons = needsReview(doc, n.id);
    if (!reasons.length) continue;
    const row: ReviewRow = { node: n.id, name: String(n.name ?? ""), node_type: n.node_type, reasons };
    if (n.node_type === TRANSLATION_TYPE) {
      const d = dataOf(n);
      row.of = originalOf(doc, n)?.id;
      row.field = String(d.field ?? "");
      row.lang = String(d.lang ?? "");
      row.method = String(d.method ?? "");
    }
    if (reasons.includes("ai")) {
      const m = aiMarker(n);
      row.by = m?.by ?? aiAuthorOf(doc, n.id);
      row.model = m?.model ?? null;
      row.via = m ? "marker" : "has_author";
    }
    out.push(row);
  }
  return out;
}

export interface VerifiedRow {
  node: string;
  name: string;
  node_type: string;
  /** what was verified: `ai` content, a requested `review`, or both */
  what: Array<"ai" | "review">;
  /** the AuthorNode that signed, and its ORCID iD */
  by: string;
  orcid: string | null;
  byName: string;
  at: string;
  /** dev27 · how the signer had entered (`validated_auth`), null when unsaid */
  auth?: { mode: "orcid" | "node_password"; attested_by?: string } | null;
}

/** The words for a signature's access mode — «verificata da ORCID», «attestata
 *  dal nodo fcn» — or "" when the signature says none. `t` is the caller's. */
export function authWords(auth: { mode?: string; attested_by?: string } | null | undefined,
                          t: (k: string, v?: Record<string, string>) => string): string {
  if (!auth?.mode) return "";
  if (auth.mode === "node_password") return t("sig.auth.node_password", { node: auth.attested_by ?? "" });
  if (auth.mode === "orcid") return t("sig.auth.orcid");
  return "";
}

/** What has been verified, by whom (ORCID) and when — the «Verificati» tab.
 *  Only what WAITED for somebody: a `validated_by` on a node that was never AI
 *  nor under review is not a verification this view can explain. */
export function verifiedRows(doc: EmDocument): VerifiedRow[] {
  const nodes = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  const out: VerifiedRow[] = [];
  for (const n of doc.graph.nodes) {
    const d = dataOf(n);
    if (d.removed || !d[VALIDATED_BY]) continue;
    const what: Array<"ai" | "review"> = [];
    if (aiMarker(n) || aiAuthorOf(doc, n.id)) what.push("ai");
    if (reviewRequested(n)) what.push("review");
    if (!what.length) continue;
    const by = String(d[VALIDATED_BY]);
    const a = nodes.get(by);
    const how = d[VALIDATED_AUTH] as { mode?: string; attested_by?: string } | undefined;
    out.push({ node: n.id, name: String(n.name ?? ""), node_type: n.node_type, what, by,
               orcid: a ? (String(dataOf(a).orcid ?? "") || null) : null,
               byName: String(a?.name ?? by), at: String(d[VALIDATED_AT] ?? ""),
               auth: how && (how.mode === "orcid" || how.mode === "node_password")
                 ? { mode: how.mode, attested_by: how.attested_by } : null });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at) || a.name.localeCompare(b.name));
}

/**
 * «Verifica» — a person signs what waited for them: AI content or a requested
 * review (`api.verify`): `validated_by` (their AuthorNode, found or created from
 * the identity, with its ORCID) and `validated_at`. ONE undo step for the whole
 * lot (a node, a chapter, a selection). A node that waits for neither is left
 * alone — and «da riallineare» is not closed by a signature: a node that waits
 * ONLY for that is not signed. Without an identity nothing is written: the
 * caller opens the identity.
 */
export function verifyNodesAs(store: DocumentStore, ids: string[], me: SignerIdentity | null,
                              at: string = new Date().toISOString().replace(/\.\d+Z$/, "Z")):
  { verified: string[] } | "needs-identity" {
  if (!me?.orcid) return "needs-identity";
  const todo = ids.filter((id) => needsReview(store.doc, id).some((r) => r === "ai" || r === "review_requested"));
  if (!todo.length) return { verified: [] };
  store.batch(() => {
    const author = authorForIdentity(store, me);
    for (const id of todo) {
      const n = store.node(id);
      if (!n) continue;
      // dev27 · the access mode beside the signature (s3Dgraphy `validated_auth`);
      // a re-signature without one drops the previous signer's
      const data: Record<string, unknown> = { ...dataOf(n), [VALIDATED_BY]: author, [VALIDATED_AT]: at };
      if (me.auth) data[VALIDATED_AUTH] = { ...me.auth };
      else delete data[VALIDATED_AUTH];
      store.updateNode(id, { data });
    }
  });
  return { verified: todo };
}
