// dev27 · WHERE THE TEXT LIVES (E.D. 2026-10-01, «il testo, la risorsa e la
// selezione»; s3Dgraphy docs «Where the text lives»).
//
//   DocumentNode  = the WORK: its fields describe it, they hold none of its text;
//   ResourceNode  = a manifestation (a PDF, a page online), the text is in the
//                   file; its data.lang is the language of the CONTENT;
//   ExtractorNode = the SELECTION: the passage's original words in its
//                   description, with its own data.lang; where it reads is an
//                   AnnotationRegionNode on the resource (region2d + page, or a
//                   passage with offsets).
//
// So the passages of a document are its extractors, reached directly
// (`extracted_from` → the document) or through a region on the document or on
// one of its resources (`extracted_from` → region `is_on_resource` → it).
// PURE: reads the document, writes nothing.

import type { EmDocument, EmEdge, EmNode } from "./types";
import { nodeLanguage, workingLanguage } from "./translation";

export interface Passage {
  extractor: EmNode;
  /** the region it reads, when it reads a place */
  region: EmNode | null;
  /** the resource the region is on (or the document itself) */
  on: EmNode | null;
  /** region2d: the page; passage: the characters */
  page: number | null;
  geometry: string | null;
  /** the passage's own words, and their language (node, else study) */
  text: string;
  lang: string | null;
}

const dataOf = (n: EmNode | undefined | null): Record<string, unknown> =>
  ((n?.data ?? {}) as Record<string, unknown>);
const live = (e: EmEdge): boolean =>
  !((e.attributes as Record<string, unknown> | undefined)?.removed);

/** The resources a document is manifested by (`has_linked_resource`). */
export function manifestationsOf(doc: EmDocument, docId: string): EmNode[] {
  const ids = new Set(doc.graph.edges.filter((e) => live(e) && e.edge_type === "has_linked_resource"
    && e.source === docId).map((e) => e.target));
  return doc.graph.nodes.filter((n) => ids.has(n.id) && n.node_type === "resource");
}

/** Every passage that reads `docId`: directly, or through a region on it or on
 *  one of its resources. Stable order: by extractor name, then id. */
export function passagesOf(doc: EmDocument, docId: string): Passage[] {
  const byId = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  const targets = new Set<string>([docId, ...manifestationsOf(doc, docId).map((r) => r.id)]);
  const regionOn = new Map<string, string>();
  for (const e of doc.graph.edges)
    if (live(e) && e.edge_type === "is_on_resource" && targets.has(e.target)) regionOn.set(e.source, e.target);
  const out: Passage[] = [];
  const seen = new Set<string>();
  for (const e of doc.graph.edges) {
    if (!live(e) || e.edge_type !== "extracted_from") continue;
    const ex = byId.get(e.source);
    if (!ex || ex.node_type !== "extractor" || dataOf(ex).removed) continue;
    let region: EmNode | null = null;
    let on: EmNode | null = null;
    if (e.target === docId) on = byId.get(docId) ?? null;
    else if (regionOn.has(e.target)) {
      region = byId.get(e.target) ?? null;
      on = byId.get(regionOn.get(e.target)!) ?? null;
    } else continue;
    const key = `${ex.id}|${region?.id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rd = dataOf(region);
    out.push({
      extractor: ex, region, on,
      page: typeof rd.page === "number" ? rd.page : null,
      geometry: typeof rd.geometry_kind === "string" ? rd.geometry_kind : (region ? "region2d" : null),
      text: String(ex.description ?? ""),
      lang: nodeLanguage(ex) || workingLanguage(doc),
    });
  }
  return out.sort((a, b) => String(a.extractor.name ?? "").localeCompare(String(b.extractor.name ?? ""))
    || a.extractor.id.localeCompare(b.extractor.id));
}
