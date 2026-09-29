/**
 * COLLEGARE · the COVERAGE of a story: how much of the graph it rests on.
 *
 * The rules are `s3dgraphy.narrative.query`'s, and the Index asks the bridge for
 * them when there is one (`/narrative-report` → `api.narrative_report`). This
 * module is the OFFLINE path — the same three questions, answered in the page so
 * the Index works with no bridge and updates as you type:
 *
 *   · `citations`: every reference, embed AND `[[id]]` mention (a mention is a
 *     citation too, E.D. 29 set), a block that mentions a node twice cites it once;
 *   · `interpretiveCoverage`: per epoch, the narratives that touch it directly or
 *     through a member (`has_first_epoch` / `survive_in_epoch` / `is_in_epoch`);
 *   · `unexplainedReconstructions`: a representation model with a scene that no
 *     narrative cites — nor the unit it represents.
 *
 * Not a port for its own sake: `check-narrative-desk.mjs` runs s3Dgraphy on a
 * fixture and asserts these return the same rows. The day the library changes
 * a rule, that check is where it shows.
 */
import type { EmDocument, EmNode } from "./types";

const MENTION = /\[\[\s*([^[\]\n]+?)\s*\]\]/g;
const EPOCH_TYPES = ["EpochNode", "epoch"];
const EPOCH_LINKS = ["has_first_epoch", "survive_in_epoch", "is_in_epoch"];
const RECONSTRUCTION_TYPES = ["representation_model", "representation_model_sf"];
const SCENE_KEYS = ["scene_url", "url", "aton_scene", "scene"];
const MODEL_TO_UNIT = ["is_representation_model_of", "is_doc_representation_model_of", "is_sf_representation_model_of"];
const UNIT_TO_MODEL = ["has_representation_model", "has_representation_model_doc", "has_representation_model_sf"];
const MODEL_LINKS = ["has_linked_resource", ...MODEL_TO_UNIT];

export interface CitationRow {
  narrative_id: string;
  chapter: number;
  block: number;
  ref: string;
  view_type: string;
  kind: "embed" | "mention";
}

interface Block { block_type?: string; text?: string; ref?: string; view_type?: string }
interface Chapter { title?: string; anchor?: string; blocks?: Block[] }

function chaptersOf(n: EmNode): Chapter[] {
  const c = ((n.data ?? {}) as { chapters?: unknown }).chapters;
  return Array.isArray(c) ? (c.filter((x) => x && typeof x === "object") as Chapter[]) : [];
}

/** `query.mentions_in`: the ids a prose text mentions, once each. */
export function mentionIds(text: string | undefined): string[] {
  const out: string[] = [];
  for (const m of String(text ?? "").matchAll(MENTION)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** `query.citations`. */
export function citations(doc: EmDocument | null): CitationRow[] {
  const rows: CitationRow[] = [];
  for (const n of doc?.graph?.nodes ?? []) {
    if (n.node_type !== "narrative") continue;
    chaptersOf(n).forEach((ch, ci) => (ch.blocks ?? []).forEach((b, bi) => {
      if (!b || typeof b !== "object") return;
      if (b.block_type === "embed") {
        if (b.ref) rows.push({ narrative_id: n.id, chapter: ci, block: bi, ref: String(b.ref), view_type: String(b.view_type ?? ""), kind: "embed" });
      } else if ((b.block_type ?? "prose") === "prose") {
        for (const ref of mentionIds(b.text))
          rows.push({ narrative_id: n.id, chapter: ci, block: bi, ref, view_type: "", kind: "mention" });
      }
    }));
  }
  return rows;
}

function citedBy(doc: EmDocument | null): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const r of citations(doc)) {
    const s = out.get(r.ref) ?? new Set<string>();
    s.add(r.narrative_id);
    out.set(r.ref, s);
  }
  return out;
}

const pyCmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export interface CoverageRow {
  id: string;
  name: string;
  kind: "epoch";
  narratives: number;
  direct_citations: number;
  members: number;
  narrative_ids: string[];
}

/** The members of each epoch, by the links the library reads. */
export function epochMembers(doc: EmDocument | null): Map<string, Set<string>> {
  const members = new Map<string, Set<string>>();
  for (const e of doc?.graph?.edges ?? []) {
    if (!EPOCH_LINKS.includes(String(e.edge_type ?? ""))) continue;
    const s = members.get(e.target) ?? new Set<string>();
    s.add(e.source);
    members.set(e.target, s);
  }
  return members;
}

/** `query.interpretive_coverage(graph, kind="epoch")`. */
export function interpretiveCoverage(doc: EmDocument | null): CoverageRow[] {
  const cited = citedBy(doc);
  const members = epochMembers(doc);
  const rows: CoverageRow[] = [];
  for (const n of doc?.graph?.nodes ?? []) {
    if (!EPOCH_TYPES.includes(n.node_type)) continue;
    const touching = new Set(cited.get(n.id) ?? []);
    const direct = touching.size;
    for (const m of members.get(n.id) ?? []) for (const x of cited.get(m) ?? []) touching.add(x);
    rows.push({ id: n.id, name: String(n.name ?? n.id), kind: "epoch", narratives: touching.size,
                direct_citations: direct, members: (members.get(n.id) ?? new Set()).size,
                narrative_ids: [...touching].sort(pyCmp) });
  }
  return rows.sort((a, b) => a.narratives - b.narratives || pyCmp(a.name, b.name));
}

/** `query.unexplained_reconstructions`. */
export function unexplainedReconstructions(doc: EmDocument | null): { id: string; name: string; node_type: string; represents: string[] }[] {
  const nodes = doc?.graph?.nodes ?? [];
  const edges = doc?.graph?.edges ?? [];
  const index = new Map(nodes.map((n) => [n.id, n]));
  const cited = citedBy(doc);
  const hasSceneData = (n: EmNode | undefined): boolean => {
    const d = (n?.data ?? {}) as Record<string, unknown>;
    return SCENE_KEYS.some((k) => !!d[k]);
  };
  const represents = new Map<string, Set<string>>();
  for (const e of edges) {
    const k = String(e.edge_type ?? "");
    if (MODEL_TO_UNIT.includes(k)) (represents.get(e.source) ?? represents.set(e.source, new Set()).get(e.source)!).add(e.target);
    else if (UNIT_TO_MODEL.includes(k)) (represents.get(e.target) ?? represents.set(e.target, new Set()).get(e.target)!).add(e.source);
  }
  const rows: { id: string; name: string; node_type: string; represents: string[] }[] = [];
  for (const n of nodes) {
    if (!RECONSTRUCTION_TYPES.includes(n.node_type)) continue;
    const scene = hasSceneData(n) || edges.some((e) => e.source === n.id
      && MODEL_LINKS.includes(String(e.edge_type ?? "")) && hasSceneData(index.get(e.target)));
    if (!scene) continue;
    const touching = new Set(cited.get(n.id) ?? []);
    for (const u of represents.get(n.id) ?? []) for (const x of cited.get(u) ?? []) touching.add(x);
    if (touching.size) continue;
    rows.push({ id: n.id, name: String(n.name ?? n.id), node_type: n.node_type,
                represents: [...(represents.get(n.id) ?? [])].sort(pyCmp) });
  }
  return rows.sort((a, b) => pyCmp(a.name, b.name));
}

/**
 * What the Index shows, for ONE story: per epoch its UNITS (the members that
 * are stratigraphic) cited in this narrative over the total, and the ones «non
 * ancora nel racconto»; the documents cited over the documents; and the
 * unexplained reconstructions. «Cited» by the same rule (embed or mention).
 */
export interface StoryCoverage {
  epochs: { id: string; name: string; units: string[]; cited: string[]; hasChapter: boolean; narratives: number }[];
  docs: string[];
  docsCited: string[];
  unexplained: { id: string; name: string }[];
}
export function storyCoverage(doc: EmDocument | null, narrativeId: string,
                              isUnit: (t: string) => boolean): StoryCoverage {
  const nodes = doc?.graph?.nodes ?? [];
  const index = new Map(nodes.map((n) => [n.id, n]));
  const here = new Set(citations(doc).filter((r) => r.narrative_id === narrativeId).map((r) => r.ref));
  const narr = index.get(narrativeId);
  const anchors = new Set(narr ? chaptersOf(narr).map((c) => c.anchor).filter(Boolean) as string[] : []);
  const members = epochMembers(doc);
  const cov = new Map(interpretiveCoverage(doc).map((r) => [r.id, r]));
  const epochs = nodes.filter((n) => EPOCH_TYPES.includes(n.node_type)).map((e) => {
    const units = [...(members.get(e.id) ?? [])].filter((id) => isUnit(index.get(id)?.node_type ?? ""));
    return { id: e.id, name: String(e.name ?? e.id), units, cited: units.filter((u) => here.has(u)),
             hasChapter: anchors.has(e.id), narratives: cov.get(e.id)?.narratives ?? 0 };
  });
  const docs = nodes.filter((n) => n.node_type === "document").map((n) => n.id);
  return {
    epochs,
    docs,
    docsCited: docs.filter((d) => here.has(d)),
    unexplained: unexplainedReconstructions(doc).map((r) => ({ id: r.id, name: r.name })),
  };
}

/** What ONE chapter cites, as the Matrix marks it: embeds, mentions, and the
 *  owners of a cited property (a property is drawn on its unit). */
export function chapterCitedIds(doc: EmDocument | null, narrativeId: string, chapter: number): Set<string> {
  const refs = new Set(citations(doc).filter((r) => r.narrative_id === narrativeId && r.chapter === chapter).map((r) => r.ref));
  const out = new Set(refs);
  for (const e of doc?.graph?.edges ?? [])
    if (e.edge_type === "has_property" && refs.has(e.target)) out.add(e.source);
  return out;
}
