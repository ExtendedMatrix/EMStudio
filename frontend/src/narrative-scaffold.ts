// NARR1 (DP-82 / DP-79) — auto-scaffold a narrative FROM the graph on entering
// narrative mode. A convenience skeleton, standalone and offline: the rich
// s3Dgraphy `site_story` (build_narrative) stays the canonical scaffolder,
// reachable later as "regenerate full draft" via the bridge (seam in main.ts).
// This does NOT duplicate that semantics — it lays out a chapter per epoch so the
// author has somewhere to write.
//
// The narrative IS a NarrativeNode in em.json (a document edit — correct). We use
// the SAME mutators the editor uses (narrative-edit.ts) and the SAME epoch
// ordering the lanes use (store.topEpochIdsChrono), never a divergent copy.

import type { DocumentStore } from "./model";
import { narrativesIn } from "./narrative";
import { t } from "./i18n";
import { roleNode } from "./hdto";
import {
  addChapter,
  addEmbed,
  addProse,
  defaultViewType,
  editChapters,
  setChapterAnchor,
  toggleCanonical,
} from "./narrative-edit";
import { newQueryOptions, queryOf, QUERY_VIEW_TYPE, type QueryKind } from "./narrative-query";

/**
 * Prose the scaffolder writes — it reads as "not written yet", exactly as the
 * s3Dgraphy scaffolder's placeholders do.
 *
 * A FUNCTION and not a constant, and that is the distinction this whole module
 * turns on: what the scaffolder writes becomes **content in the em.json**, so it
 * is generated in the language of the moment and then belongs to the author. A
 * constant evaluated at module load would freeze whatever the locale was when the
 * bundle started, which is how "Introduzione" survived an app that had otherwise
 * gone English.
 */
const placeholder = (): string => t("scaffold.placeholder");

function siteName(store: DocumentStore): string {
  const g = store.doc.graph as Record<string, unknown>;
  return String((g.name as string) || (g.graph_id as string) || "Site");
}

function introText(store: DocumentStore): string {
  const bits = [`${siteName(store)} — ${placeholder()}`];
  // GEO1: the SITE POSITION (symbolic lon/lat, graph-scope) — NOT the shift.
  // The shift (geo_position) is the 3D anchor and may sit far from the site;
  // it is not "where the site is". Absent = say nothing (no fabricated point).
  const sp = store.readSitePosition();
  if (sp) bits.push(t("scaffold.position",
                      { lat: sp.lat.toFixed(4), lon: sp.lon.toFixed(4) }));
  return bits.join(" ");
}

/**
 * Build a default narrative from the graph, ONCE. Returns the new NarrativeNode
 * id, or null if a narrative already exists (idempotent — never re-scaffold, so a
 * written story is never disturbed). One undoable change (store.batch).
 *
 * Shape: a canonical/settled intro chapter (site data), then one chapter per
 * top-level epoch in chronological order (oldest first), each anchored to its
 * epoch and carrying the epoch's matrix-slice embed as a sensible default. Prose
 * is a placeholder.
 */
export function scaffoldNarrativeFromGraph(store: DocumentStore): string | null {
  if (narrativesIn(store.doc).length > 0) return null; // idempotent
  const nid = store.newId();
  return store.batch(() => {
    store.addNode({
      id: nid,
      name: `${siteName(store)} — narrative`,
      node_type: "narrative",
      description: "",
      data: { chapters: [], template_id: "ts_scaffold" },
    });
    // 0 · intro, marked canonical (settled) so a future regeneration leaves it.
    //
    // The title is CONTENT: generated now, in the current language, and after
    // that it is the author's — renaming it is an edit, and switching locale
    // later does NOT rewrite it (rewriting somebody's chapter title because they
    // changed the UI language would be an edit nobody asked for).
    addChapter(store, nid, t("scaffold.intro"));
    toggleCanonical(store, nid, 0); // false → true
    addProse(store, nid, 0, introText(store));
    // MICRO studio-luogo, part D · where the graph has a study, the intro cites
    // it: an embed of the study node, which the view draws as the HDT-O chain
    // (study, place, heritage, twin) read from the graph at render time — a
    // reference, not text copied. No study, no embed: nothing is made up.
    const study = roleNode(store.doc, "study");
    if (study) addEmbed(store, nid, 0, study.id, defaultViewType(study));
    // 1..n · one chapter per epoch, oldest first, anchored + default embed.
    store.topEpochIdsChrono().forEach((eid, i) => {
      addEpochChapterAt(store, nid, eid, i + 1);
    });
    // NARRATIVA-BLOCCHI p.3 · the standard blocks, where the story wants them
    addStandardBlocks(store, nid);
    return nid;
  });
}

/** The top-level epochs NOT yet described by a chapter (no chapter anchored to
 *  them), in chronological order — the data behind the "reintroduce" affordance. */
export function undescribedEpochs(
  store: DocumentStore,
  narrativeId: string,
): { id: string; name: string }[] {
  const narr = narrativesIn(store.doc).find((n) => n.id === narrativeId);
  const described = new Set(
    (narr?.chapters ?? []).map((c) => c.anchor).filter(Boolean) as string[],
  );
  return store
    .topEpochIdsChrono()
    .filter((eid) => !described.has(eid))
    .map((eid) => ({ id: eid, name: String(store.node(eid)?.name ?? eid) }));
}

/** Re-introduce an epoch: append a chapter anchored to it (default embed). One
 *  undoable change. Used by the "undescribed epochs → add chapter" affordance. */
export function addEpochChapter(
  store: DocumentStore,
  narrativeId: string,
  epochId: string,
): void {
  store.batch(() => {
    const narr = narrativesIn(store.doc).find((n) => n.id === narrativeId);
    addEpochChapterAt(store, narrativeId, epochId, (narr?.chapters ?? []).length);
  });
}

/** Add an epoch chapter at a KNOWN index (caller guarantees append position). */
function addEpochChapterAt(
  store: DocumentStore,
  narrativeId: string,
  epochId: string,
  index: number,
): void {
  const ep = store.node(epochId);
  if (!ep) return;
  addChapter(store, narrativeId, String(ep.name ?? epochId));
  setChapterAnchor(store, narrativeId, index, epochId);
  // default embed = the epoch's matrix slice (defaultViewType(EpochNode) → "matrix").
  addEmbed(store, narrativeId, index, epochId, defaultViewType(ep));
  addProse(store, narrativeId, index, placeholder());
}

// ── NARRATIVA-BLOCCHI p.3 · the standard blocks ──────────────────────────────
//
// Three blocks that ask the graph (`narrative-query.ts`), placed where a story
// of a site needs them: **Storia delle ricerche** opens the story (the first
// block of the first chapter), **Beni coinvolti** comes after the introduction
// (the end of the first chapter, after its prose and its study), the
// **Bibliografia** closes it (a last chapter of its own, settled ★ so a
// regeneration leaves it). A new story gets them from the scaffolder; an
// existing one only when somebody asks («Aggiungi i blocchi standard» in the
// Index) — and then only the ones it does not have.

/** The standard blocks a story does not have yet, in the order they go. */
export function missingStandardBlocks(store: DocumentStore, narrativeId: string): QueryKind[] {
  const narr = narrativesIn(store.doc).find((n) => n.id === narrativeId);
  if (!narr) return [];
  const have = new Set<string>();
  for (const c of narr.chapters) for (const b of c.blocks ?? []) {
    const q = queryOf(b);
    if (q) have.add(q.query);
  }
  return (["research_history", "heritage", "bibliography"] as QueryKind[]).filter((k) => !have.has(k));
}

/** Add the standard blocks a story lacks. One undo step; returns what was
 *  added. The ref is the graph-self node, made on demand (as the map's). */
export function addStandardBlocks(store: DocumentStore, narrativeId: string): QueryKind[] {
  const missing = missingStandardBlocks(store, narrativeId);
  if (!missing.length) return [];
  store.batch(() => {
    const gid = store.ensureGraphRootId();
    const block = (kind: QueryKind) => ({ block_type: "embed" as const, ref: gid,
                                          view_type: QUERY_VIEW_TYPE, options: newQueryOptions(kind) });
    editChapters(store, narrativeId, (cs) => {
      const opening = missing.filter((k) => k !== "bibliography");
      if (opening.length && !cs.length) cs.push({ title: t("scaffold.intro"), canonical: true, blocks: [] });
      if (opening.length) {
        const first = (cs[0].blocks ??= []);
        if (missing.includes("research_history")) first.unshift(block("research_history"));
        if (missing.includes("heritage")) first.push(block("heritage"));
      }
      if (missing.includes("bibliography"))
        cs.push({ title: t("nq.title.bibliography"), canonical: true, blocks: [block("bibliography")] });
    });
  });
  return missing;
}
