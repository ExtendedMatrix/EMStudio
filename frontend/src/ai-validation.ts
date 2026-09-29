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

export const AI_ASSISTED = "ai_assisted";
export const AI_GENERATED_ALIAS = "ai_generated";
export const VALIDATED_BY = "validated_by";
export const VALIDATED_AT = "validated_at";
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

/**
 * «Verifica» — a person verifies AI nodes: `validated_by` (their AuthorNode,
 * found or created from the identity, with its ORCID) and `validated_at`. ONE
 * undo step for the whole lot (a node, a chapter, a selection). A node that is
 * not AI-touched is left alone (a verification of nothing reads as a statement).
 * Without an identity nothing is written: the caller opens the identity.
 */
export function verifyNodesAs(store: DocumentStore, ids: string[], me: SignerIdentity | null,
                              at: string = new Date().toISOString().replace(/\.\d+Z$/, "Z")):
  { verified: string[] } | "needs-identity" {
  if (!me?.orcid) return "needs-identity";
  const todo = ids.filter((id) => isUnvalidatedAi(store.doc, id));
  if (!todo.length) return { verified: [] };
  store.batch(() => {
    const author = authorForIdentity(store, me);
    for (const id of todo) {
      const n = store.node(id);
      if (!n) continue;
      store.updateNode(id, { data: { ...dataOf(n), [VALIDATED_BY]: author, [VALIDATED_AT]: at } });
    }
  });
  return { verified: todo };
}
