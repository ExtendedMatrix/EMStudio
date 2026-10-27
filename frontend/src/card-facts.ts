// MICRO-ARCHIVIO-3 · the facts of the card of what is chosen (§5 of the note
// «L'Archivio ripensato», decided by E.D. on 27 Oct 2026).
//
// ONE SELECTION, ONE CARD. A file in the File window, an entry of the Shelf, a
// node of the transformation Chain: the same card, whole in the «Viewer e
// scheda», compact in the Info tab of the File window. This module says WHAT
// the card says — the rights with where each comes from, the facts of an act,
// the three lines of the hover — and draws nothing: `main.ts` draws it, once,
// in two forms. Pure, so `check-card.mjs` reads it without the app behind it.
//
// The rights are read where they already live — the stamp beside the bytes,
// the rights a node of the graph carries (`has_author` / `has_license` /
// `has_embargo`), the delivery of the room, the graph's own defaults — and the
// card says which of these each value comes from. The first that speaks wins,
// in that order: what is said of THIS object before what it inherits.
import type { EmEdge, EmNode } from "./types";

/** Where a right was read. */
export type RightSource = "stamp" | "resource" | "room" | "graph";
export const RIGHT_SOURCES: readonly RightSource[] = ["stamp", "resource", "room", "graph"];

export interface RightSaid { value: string; source: RightSource }
export interface RightLine {
  key: "authors" | "licence" | "embargo";
  /** the value that holds, with its source; null when nobody says it */
  said: RightSaid | null;
  /** the others that speak too, under the one that holds (said in the tooltip) */
  others: RightSaid[];
}
export interface RightsFrom { authors?: string; licence?: string; embargo?: string }
export type RightsInput = Partial<Record<RightSource, RightsFrom | null | undefined>>;

/** The three rights of the card — authors, licence, embargo — each with its source. */
export function rightsOf(input: RightsInput): RightLine[] {
  return (["authors", "licence", "embargo"] as const).map((key) => {
    const all: RightSaid[] = [];
    for (const source of RIGHT_SOURCES) {
      const v = String(input[source]?.[key] ?? "").trim();
      if (v && !all.some((a) => a.value === v && a.source === source)) all.push({ value: v, source });
    }
    return { key, said: all[0] ?? null, others: all.slice(1) };
  });
}

/** The acts of the Chain: they have no preview, their card takes the whole Viewer. */
export function isActType(type: string | undefined): boolean {
  return type === "dtc_process" || type === "dtc_acquisition";
}
/** The nodes that have a card: the acts and what they consume and make. */
export function hasCard(type: string | undefined): boolean {
  return isActType(type) || type === "resource";
}

export interface Ref { id: string; name: string; path?: string }
export interface ActFacts {
  kind: string;
  name: string;
  technique: string;
  operator: string;
  tools: string[];
  parameters: Array<[string, string]>;
  date: string;
  inputs: Ref[];
  outputs: Ref[];
  /** the licence and embargo the act's stamp declared, if any */
  declared: RightsFrom;
}

const str = (v: unknown): string => (v == null ? "" : typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v));

function refOf(id: string, nodeOf: (id: string) => EmNode | undefined): Ref {
  const n = nodeOf(id);
  const path = n?.data?.path;
  return { id, name: str(n?.name) || id, ...(typeof path === "string" && path ? { path } : {}) };
}

/** Who did an act: the operator its stamp names, else the author the graph ties to it. */
function operatorOf(node: EmNode, edges: readonly EmEdge[], nodeOf: (id: string) => EmNode | undefined): string {
  const op = node.data?.operator as { label?: string; id?: string } | string | undefined;
  if (typeof op === "string" && op) return op;
  if (op && typeof op === "object" && (op.label || op.id)) return str(op.label || op.id);
  for (const e of edges)
    if (e.edge_type === "has_author" && e.source === node.id) {
      const a = nodeOf(e.target);
      if (a) return str(a.name) || a.id;
    }
  return "";
}

/** The tools and software of an act, «name version» each. */
function toolsOf(data: Record<string, unknown>): string[] {
  const one = (x: unknown): string => {
    if (!x) return "";
    if (typeof x === "string") return x;
    const o = x as { name?: unknown; version?: unknown };
    return [str(o.name), str(o.version)].filter(Boolean).join(" ");
  };
  const out = [one(data.tool), ...(Array.isArray(data.software) ? data.software.map(one) : [one(data.software)])];
  return out.filter((s, i) => s && out.indexOf(s) === i);
}

/** The facts of an act: type, operator, tool or software with its parameters,
 *  date, its inputs and outputs, its name. Read off the node and the chain's edges. */
export function actFacts(node: EmNode, edges: readonly EmEdge[], nodeOf: (id: string) => EmNode | undefined): ActFacts {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const params = (data.parameters && typeof data.parameters === "object" ? Object.entries(data.parameters as Record<string, unknown>) : [])
    .map(([k, v]) => [k, str(v)] as [string, string]);
  const inputs: Ref[] = [], outputs: Ref[] = [];
  for (const e of edges) {
    if (e.source !== node.id) continue;
    if (e.edge_type === "dtc_had_input" && !inputs.some((r) => r.id === e.target)) inputs.push(refOf(e.target, nodeOf));
    if (e.edge_type === "dtc_had_output" && !outputs.some((r) => r.id === e.target)) outputs.push(refOf(e.target, nodeOf));
  }
  const declared = (data.declared ?? {}) as { license?: string; embargo_until?: string };
  return {
    kind: str(data.dtc_kind),
    name: str(node.name),
    technique: str(data.technique),
    operator: operatorOf(node, edges, nodeOf),
    tools: toolsOf(data),
    parameters: params,
    date: str(data.created_at ?? data.at ?? data.date),
    inputs, outputs,
    declared: { licence: str(declared.license), embargo: str(declared.embargo_until) },
  };
}

/** The act that made a resource (`dtc_had_output` into it), if the chain has one. */
export function producerOf(id: string, edges: readonly EmEdge[], nodeOf: (id: string) => EmNode | undefined): EmNode | null {
  for (const e of edges)
    if (e.edge_type === "dtc_had_output" && e.target === id) {
      const p = nodeOf(e.source);
      if (p && isActType(p.node_type)) return p;
    }
  return null;
}

/** The acts that consumed a resource (`dtc_had_input` from them). */
export function consumersOf(id: string, edges: readonly EmEdge[], nodeOf: (id: string) => EmNode | undefined): Ref[] {
  const out: Ref[] = [];
  for (const e of edges)
    if (e.edge_type === "dtc_had_input" && e.target === id && !out.some((r) => r.id === e.source)) {
      const p = nodeOf(e.source);
      if (p && isActType(p.node_type)) out.push(refOf(e.source, nodeOf));
    }
  return out;
}

/** The three lines of the hover over a node of the Chain (§5, «strada C»):
 *  who, when, licence/embargo — of the act, or of the act that made the resource.
 *  The words are the caller's (`main.ts` passes `t`). */
export interface HoverWords {
  who: (v: string) => string;
  when: (v: string) => string;
  rights: (licence: string, embargo: string) => string;
  nobody: string;
  undated: string;
}
export function hoverLines(node: EmNode, edges: readonly EmEdge[], nodeOf: (id: string) => EmNode | undefined,
                           rights: RightLine[], words: HoverWords, readDate: (iso: string) => string = (s) => s): [string, string, string] {
  const act = isActType(node.node_type) ? node : producerOf(node.id, edges, nodeOf);
  const f = act ? actFacts(act, edges, nodeOf) : null;
  const lic = rights.find((r) => r.key === "licence")?.said?.value ?? f?.declared.licence ?? "";
  const emb = rights.find((r) => r.key === "embargo")?.said?.value ?? f?.declared.embargo ?? "";
  return [
    words.who(f?.operator || words.nobody),
    words.when(f?.date ? readDate(f.date) : words.undated),
    words.rights(lic, emb),
  ];
}
