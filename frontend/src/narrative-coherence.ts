/**
 * MICRO-SEG24 C (21 Nov 2026) · the story against the Matrix, as it is now.
 *
 * A part that narrates an epoch or an activity, and a figure of one, were made
 * against the graph of that day. The graph moves: an activity is renamed,
 * deleted, moved to another epoch, split; an epoch is divided into sub-epochs;
 * the sections that follow the activities stop being in the Matrix's order; a
 * figure's content changes. Each is said QUIETLY (a notice, not an error), with,
 * where it can be done, a «Put it right» that the author presses — never applied
 * by itself.
 *
 * What the story saw is remembered in the narrative's own data,
 * `data.narrated_seen` — `{id: {name, kind, epoch?, members?, subs?}}` — written
 * when a part starts narrating something and when a notice is put right; a
 * figure keeps the signature of what it showed in `options.figure.sig`. A
 * binding with no record yet (a file from before) is one quiet line: «record
 * them now». Data keys of the narrative node: no schema or datamodel bump.
 *
 * Pure: no DOM, no store. The page applies a fix in ONE edit (one undo step).
 */
import { t } from "./i18n";
import { scopeOf } from "./narrative-embeds";
import { epochOfActivity, figureBlock, figureOf, figureSig, newFigureLabel, subEpochRows } from "./narrative-figures";
import { anchorsOf, flattenLanes, laneTree, setAnchorsOn } from "./narrative-lanes";
import type { EditableChapter } from "./narrative-edit";
import type { EmDocument, EmNode } from "./types";

export interface SeenRecord {
  name: string;
  kind: "epoch" | "activity" | "other";
  /** an activity's epoch */
  epoch?: string | null;
  /** an activity's units */
  members?: string[];
  /** an epoch's sub-epochs */
  subs?: string[];
}
export type SeenMap = Record<string, SeenRecord>;

export type FixKind = "relink" | "unlink" | "retitle" | "record" | "reorder" | "move"
  | "add_section" | "regenerate" | "insert_sub_epochs" | "record_all" | "remove_figure";

export interface CoherenceIssue {
  key: string;
  kind: "missing" | "renamed" | "moved" | "split" | "divided" | "order" | "figure_changed" | "unrecorded";
  chapter: number;
  block: number | null;
  ref: string;
  text: string;
  fix?: { kind: FixKind; label: string; arg?: string };
}

const live = (doc: EmDocument | null): EmNode[] =>
  (doc?.graph?.nodes ?? []).filter((n) => !((n.data ?? {}) as Record<string, unknown>).removed);
const liveEdges = (doc: EmDocument | null) => (doc?.graph?.edges ?? []).filter((e) => !(e as { removed?: unknown }).removed);
const isEpoch = (n?: EmNode | null): boolean => !!n && (n.node_type === "EpochNode" || n.node_type === "epoch");
const isActivity = (n?: EmNode | null): boolean => !!n && n.node_type === "ActivityNodeGroup";
const nameOf = (n: EmNode): string => String(n.name || n.id);

/** What the story sees of `id` today. */
export function seenRecord(doc: EmDocument | null, id: string): SeenRecord | null {
  const n = live(doc).find((x) => x.id === id);
  if (!n) return null;
  if (isActivity(n)) {
    const members = liveEdges(doc).filter((e) => e.edge_type === "is_in_activity" && e.target === id).map((e) => e.source).sort();
    return { name: nameOf(n), kind: "activity", epoch: epochOfActivity(id, doc), members };
  }
  if (isEpoch(n)) return { name: nameOf(n), kind: "epoch", subs: subEpochRows(doc, id).map((r) => r.id).sort() };
  return { name: nameOf(n), kind: "other" };
}

/** Remember what these ids are now (the narrative's `data`, mutated). */
export function recordSeen(data: Record<string, unknown>, doc: EmDocument | null, ids: readonly string[]): void {
  const seen = { ...((data.narrated_seen ?? {}) as SeenMap) };
  for (const id of ids) { const r = seenRecord(doc, id); if (r) seen[id] = r; }
  if (Object.keys(seen).length) data.narrated_seen = seen;
}

type Part = { chapter: number; block: number | null; title: string; ids: string[]; level: 0 | 1 | 2 };

function partsOf(chapters: readonly EditableChapter[]): Part[] {
  const out: Part[] = [];
  chapters.forEach((c, ci) => {
    out.push({ chapter: ci, block: null, title: String(c.title ?? ""), ids: anchorsOf(c as never), level: 0 });
    (c.blocks ?? []).forEach((b, bi) => {
      if (b.block_type !== "heading") return;
      out.push({ chapter: ci, block: bi, title: String(b.text ?? ""), ids: anchorsOf(b as never),
        level: ((b as { level?: number }).level ?? 1) >= 2 ? 2 : 1 });
    });
  });
  return out;
}

/** Every id the story narrates or shows in a figure. */
export function boundIds(chapters: readonly EditableChapter[]): string[] {
  const out: string[] = [];
  for (const p of partsOf(chapters)) for (const id of p.ids) if (!out.includes(id)) out.push(id);
  for (const c of chapters) for (const b of c.blocks ?? []) {
    const f = figureOf(b as never);
    if (f && b.ref && !out.includes(b.ref)) out.push(b.ref);
  }
  return out;
}

/** The runs of headings of `level` between [from, to) of a chapter's blocks:
 *  [start, end) each. */
function runsOf(blocks: EditableChapter["blocks"] & unknown[], from: number, to: number, level: 1 | 2): [number, number][] {
  const out: [number, number][] = [];
  const lv = (b: { level?: number }) => ((b.level ?? 1) >= 2 ? 2 : 1);
  for (let i = from; i < to; i++) {
    const b = blocks[i];
    if (b?.block_type !== "heading" || lv(b as never) !== level) continue;
    let end = i + 1;
    while (end < to) {
      const x = blocks[end];
      if (x?.block_type === "heading" && lv(x as never) <= level) break;
      end++;
    }
    out.push([i, end]);
  }
  return out;
}

/** The time rank of a heading: its first narrated id in the «Narrates» tree's
 *  order (oldest first, activities under their epoch); null when none ranks. */
function rankOf(b: unknown, rank: Map<string, number>): number | null {
  for (const id of anchorsOf(b as never)) if (rank.has(id)) return rank.get(id)!;
  return null;
}

/** The groups of sibling headings out of the Matrix's order: `[chapter,
 *  headingOfParent | null, level]`. */
function disorders(chapters: readonly EditableChapter[], rank: Map<string, number>): { chapter: number; parent: number | null; level: 1 | 2 }[] {
  const out: { chapter: number; parent: number | null; level: 1 | 2 }[] = [];
  const sorted = (runs: [number, number][], blocks: unknown[]): boolean => {
    const ks = runs.map(([s]) => rankOf(blocks[s], rank)).filter((k): k is number => k !== null);
    return ks.every((k, i) => i === 0 || ks[i - 1] <= k);
  };
  chapters.forEach((c, ci) => {
    const blocks = (c.blocks ?? []) as unknown[];
    const sections = runsOf(blocks as never, 0, blocks.length, 1);
    if (!sorted(sections, blocks)) out.push({ chapter: ci, parent: null, level: 1 });
    for (const [s, e] of sections) {
      const subs = runsOf(blocks as never, s + 1, e, 2);
      if (!sorted(subs, blocks)) out.push({ chapter: ci, parent: s, level: 2 });
    }
    // subsections before the first section of the chapter
    const first = sections.length ? sections[0][0] : blocks.length;
    const orphans = runsOf(blocks as never, 0, first, 2);
    if (!sorted(orphans, blocks)) out.push({ chapter: ci, parent: -1, level: 2 });
  });
  return out;
}

/** The notices, in reading order. */
export function coherenceIssues(doc: EmDocument | null, data: Record<string, unknown> | undefined): CoherenceIssue[] {
  const chapters = ((data ?? {}).chapters ?? []) as EditableChapter[];
  const seen = ((data ?? {}).narrated_seen ?? {}) as SeenMap;
  const nodes = live(doc);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: CoherenceIssue[] = [];
  const parts = partsOf(chapters);
  const where = (ci: number, bi: number | null): string => {
    const c = chapters[ci];
    if (bi === null) return String(c?.title || `#${ci + 1}`);
    return String((c?.blocks?.[bi] as { text?: string } | undefined)?.text || `${c?.title ?? ""} · ${bi + 1}`);
  };
  const narratedAnywhere = new Set(parts.flatMap((p) => p.ids));
  const done = new Set<string>();

  for (const p of parts) for (const id of p.ids) {
    const n = byId.get(id);
    const was = seen[id];
    const k = `${p.chapter}:${p.block}:${id}`;
    if (!n) {
      // a horizon of the container is not a node of the graph: not «missing»
      if (!was) continue;
      const cand = nodes.find((x) => x.id !== id && nameOf(x) === was.name
        && (was.kind === "epoch" ? isEpoch(x) : was.kind === "activity" ? isActivity(x) : true));
      out.push({ key: `missing:${k}`, kind: "missing", chapter: p.chapter, block: p.block, ref: id,
        text: t("nv.coh.missing", { name: was.name, where: where(p.chapter, p.block) }),
        fix: cand ? { kind: "relink", label: t("nv.coh.fix.relink", { name: nameOf(cand) }), arg: cand.id }
          : { kind: "unlink", label: t("nv.coh.fix.unlink") } });
      continue;
    }
    if (!was) continue;
    if (was.name !== nameOf(n) && !done.has(`renamed:${id}:${p.chapter}:${p.block}`)) {
      done.add(`renamed:${id}:${p.chapter}:${p.block}`);
      const titled = p.title.trim() === was.name.trim();
      out.push({ key: `renamed:${k}`, kind: "renamed", chapter: p.chapter, block: p.block, ref: id,
        text: t("nv.coh.renamed", { was: was.name, now: nameOf(n), where: where(p.chapter, p.block) }),
        fix: titled ? { kind: "retitle", label: t("nv.coh.fix.retitle", { name: nameOf(n) }) }
          : { kind: "record", label: t("nv.coh.fix.record") } });
    }
    if (was.kind === "activity" && isActivity(n)) {
      const now = epochOfActivity(id, doc);
      if ((was.epoch ?? null) !== now) {
        const from = was.epoch ? nameOf(byId.get(was.epoch) ?? { id: was.epoch } as EmNode) : t("nv.coh.noEpoch");
        const to = now ? nameOf(byId.get(now)!) : t("nv.coh.noEpoch");
        // a section can follow its activity into the chapter of the new epoch
        const target = p.block !== null && now
          ? chapters.findIndex((c, ci) => ci !== p.chapter && anchorsOf(c as never).includes(now)) : -1;
        out.push({ key: `moved:${k}`, kind: "moved", chapter: p.chapter, block: p.block, ref: id,
          text: t("nv.coh.moved", { name: nameOf(n), from, to, where: where(p.chapter, p.block) }),
          fix: target >= 0 ? { kind: "move", label: t("nv.coh.fix.move", { chapter: String(chapters[target].title ?? "") }), arg: String(target) }
            : { kind: "record", label: t("nv.coh.fix.record") } });
      }
      const members = new Set(liveEdges(doc).filter((e) => e.edge_type === "is_in_activity" && e.target === id).map((e) => e.source));
      const left = (was.members ?? []).filter((m) => byId.has(m) && !members.has(m));
      if (left.length) {
        const elsewhere = new Map<string, number>();
        for (const m of left) for (const e of liveEdges(doc))
          if (e.edge_type === "is_in_activity" && e.source === m && e.target !== id && isActivity(byId.get(e.target)))
            elsewhere.set(e.target, (elsewhere.get(e.target) ?? 0) + 1);
        const fresh = [...elsewhere.keys()].filter((a) => !narratedAnywhere.has(a));
        if (fresh.length) {
          const other = byId.get(fresh[0])!;
          out.push({ key: `split:${k}`, kind: "split", chapter: p.chapter, block: p.block, ref: id,
            text: t("nv.coh.split", { name: nameOf(n), n: String(left.length), other: fresh.map((a) => nameOf(byId.get(a)!)).join(", ") }),
            fix: { kind: "add_section", label: t("nv.coh.fix.addSection", { name: nameOf(other) }), arg: other.id } });
        }
      }
    }
    if (was.kind === "epoch" && isEpoch(n)) {
      const subs = subEpochRows(doc, id).map((r) => r.id);
      const added = subs.filter((s) => !(was.subs ?? []).includes(s));
      if (added.length && !done.has(`divided:${id}`)) {
        done.add(`divided:${id}`);
        const has = chapters.some((c) => (c.blocks ?? []).some((b) => b.ref === id && figureOf(b as never)?.kind === "sub_epochs"));
        out.push({ key: `divided:${k}`, kind: "divided", chapter: p.chapter, block: p.block, ref: id,
          text: t("nv.coh.divided", { name: nameOf(n), list: added.map((s) => nameOf(byId.get(s)!)).join(", ") }),
          fix: has ? { kind: "record", label: t("nv.coh.fix.record") }
            : { kind: "insert_sub_epochs", label: t("nv.coh.fix.subEpochs") } });
      }
    }
  }

  // the sections that follow activities, in the Matrix's order
  const rank = new Map(flattenLanes(laneTree(doc, "epochs")).map((it, i) => [it.id, i]));
  for (const d of disorders(chapters, rank)) {
    const at = d.parent !== null && d.parent >= 0 ? d.parent : null;
    out.push({ key: `order:${d.chapter}:${d.parent}:${d.level}`, kind: "order", chapter: d.chapter, block: at, ref: "",
      text: t(d.level === 1 ? "nv.coh.orderSections" : "nv.coh.orderSubsections", { where: where(d.chapter, at) }),
      fix: { kind: "reorder", label: t("nv.coh.fix.reorder"), arg: `${d.parent}:${d.level}` } });
  }

  // the figures whose content changed
  chapters.forEach((c, ci) => (c.blocks ?? []).forEach((b, bi) => {
    const f = figureOf(b as never);
    if (!f || !b.ref) return;
    const n = byId.get(b.ref);
    if (!n) {
      const was = seen[b.ref];
      const cand = was ? nodes.find((x) => nameOf(x) === was.name && x.id !== b.ref) : undefined;
      out.push({ key: `fmissing:${ci}:${bi}`, kind: "missing", chapter: ci, block: bi, ref: b.ref,
        text: t("nv.coh.figureMissing", { name: was?.name ?? b.ref }),
        fix: cand ? { kind: "relink", label: t("nv.coh.fix.relink", { name: nameOf(cand) }), arg: cand.id }
          : { kind: "remove_figure", label: t("nv.coh.fix.removeFigure") } });
      return;
    }
    // MICRO-SEG26 · a frozen view is frozen by design: it never «changed»
    if (f.kind !== "still" && f.sig && f.sig !== figureSig(n, doc, f.kind))
      out.push({ key: `figure:${ci}:${bi}`, kind: "figure_changed", chapter: ci, block: bi, ref: b.ref,
        text: t("nv.coh.figureChanged", { what: t(`nv.fig.cap.${f.kind}`, { name: nameOf(n) }) }),
        fix: { kind: "regenerate", label: t("nv.coh.fix.regenerate") } });
  }));

  // bindings never recorded (a file from before): one quiet line
  const unrecorded = boundIds(chapters).filter((id) => byId.has(id) && !seen[id]
    && (isEpoch(byId.get(id)) || isActivity(byId.get(id))));
  if (unrecorded.length)
    out.push({ key: "unrecorded", kind: "unrecorded", chapter: 0, block: null, ref: "",
      text: t("nv.coh.unrecorded", { n: String(unrecorded.length) }),
      fix: { kind: "record_all", label: t("nv.coh.fix.recordAll") } });
  return out;
}

/** Replace `from` with `to` wherever the story narrates or shows it. */
function relink(chapters: EditableChapter[], from: string, to: string): void {
  const swap = (target: Record<string, unknown>) => {
    const ids = anchorsOf(target as never);
    if (ids.includes(from)) setAnchorsOn(target, ids.map((x) => (x === from ? to : x)));
  };
  for (const c of chapters) {
    swap(c as unknown as Record<string, unknown>);
    for (const b of c.blocks ?? []) {
      if (b.block_type === "heading") {
        const o = { ...((b.options ?? {}) as Record<string, unknown>) };
        swap(o);
        b.options = o;
      } else if (b.block_type === "embed" && b.ref === from && figureOf(b as never)) b.ref = to;
    }
  }
}

/** Sort the runs of one group of siblings by the Matrix's order (the ones that
 *  narrate nothing keep their places). */
function reorder(chapter: EditableChapter, parent: number | null, level: 1 | 2, rank: Map<string, number>): void {
  const blocks = (chapter.blocks ?? []) as EditableChapter["blocks"] & unknown[];
  let from = 0, to = blocks.length;
  if (parent !== null && parent >= 0) {
    from = parent + 1;
    to = parent + 1;
    while (to < blocks.length && !(blocks[to]?.block_type === "heading" && (((blocks[to] as { level?: number }).level ?? 1) < 2))) to++;
  } else if (parent === -1) {
    const first = blocks.findIndex((b) => b?.block_type === "heading" && (((b as { level?: number }).level ?? 1) < 2));
    to = first < 0 ? blocks.length : first;
  }
  const runs = runsOf(blocks as never, from, to, level);
  if (runs.length < 2) return;
  const slices = runs.map(([s, e]) => blocks.slice(s, e));
  const ranked = slices.map((sl, i) => ({ sl, i, k: rankOf(sl[0], rank) }));
  const movable = ranked.filter((r) => r.k !== null).sort((a, b) => a.k! - b.k! || a.i - b.i);
  let m = 0;
  const next = ranked.map((r) => (r.k === null ? r.sl : movable[m++].sl));
  const start = runs[0][0], end = runs[runs.length - 1][1];
  const between = blocks.slice(start, end);
  // anything between runs that belongs to none (cannot happen: a run ends at
  // the next heading of its level) is kept after them
  const inRuns = new Set(runs.flatMap(([s, e]) => Array.from({ length: e - s }, (_, i) => s + i)));
  const loose = between.filter((_, i) => !inRuns.has(start + i));
  blocks.splice(start, end - start, ...next.flat(), ...loose);
}

/**
 * Apply a notice's «Put it right» to a COPY of the chapters and the data (the
 * page writes both in one edit). Records what was put right, so the notice
 * goes. Returns false when there was nothing to do.
 */
export function applyCoherenceFix(chapters: EditableChapter[], data: Record<string, unknown>,
                                  doc: EmDocument | null, issue: CoherenceIssue): boolean {
  const fix = issue.fix;
  if (!fix) return false;
  const n = (live(doc)).find((x) => x.id === issue.ref);
  switch (fix.kind) {
    case "relink": {
      if (!fix.arg) return false;
      relink(chapters, issue.ref, fix.arg);
      const seen = { ...((data.narrated_seen ?? {}) as SeenMap) };
      delete seen[issue.ref];
      data.narrated_seen = seen;
      recordSeen(data, doc, [fix.arg]);
      return true;
    }
    case "unlink": {
      const target = issue.block === null ? chapters[issue.chapter] as unknown as Record<string, unknown>
        : { ...((chapters[issue.chapter]?.blocks?.[issue.block]?.options ?? {}) as Record<string, unknown>) };
      if (!target) return false;
      setAnchorsOn(target, anchorsOf(target as never).filter((x) => x !== issue.ref));
      if (issue.block !== null) chapters[issue.chapter].blocks![issue.block].options = target;
      return true;
    }
    case "remove_figure":
      if (issue.block === null) return false;
      chapters[issue.chapter]?.blocks?.splice(issue.block, 1);
      return true;
    case "retitle": {
      if (!n) return false;
      if (issue.block === null) chapters[issue.chapter].title = String(n.name || n.id);
      else chapters[issue.chapter].blocks![issue.block].text = String(n.name || n.id);
      recordSeen(data, doc, [issue.ref]);
      return true;
    }
    case "record":
      recordSeen(data, doc, [issue.ref]);
      return true;
    case "record_all":
      recordSeen(data, doc, boundIds(chapters));
      return true;
    case "move": {
      const to = Number(fix.arg);
      if (issue.block === null || !chapters[to]) return false;
      const blocks = chapters[issue.chapter].blocks ?? [];
      const head = blocks[issue.block] as { level?: number };
      const level = (head?.level ?? 1) >= 2 ? 2 : 1;
      let end = issue.block + 1;
      while (end < blocks.length && !(blocks[end]?.block_type === "heading" && (((blocks[end] as { level?: number }).level ?? 1) >= 2 ? 2 : 1) <= level)) end++;
      const span = blocks.splice(issue.block, end - issue.block);
      (chapters[to].blocks ??= []).push(...span);
      recordSeen(data, doc, [issue.ref]);
      return true;
    }
    case "add_section": {
      const other = live(doc).find((x) => x.id === fix.arg);
      if (!other) return false;
      const c = chapters[issue.chapter];
      const blocks = (c.blocks ??= []);
      let at = blocks.length, level = 1;
      if (issue.block !== null) {
        const head = blocks[issue.block] as { level?: number };
        level = (head?.level ?? 1) >= 2 ? 2 : 1;
        at = issue.block + 1;
        while (at < blocks.length && !(blocks[at]?.block_type === "heading" && (((blocks[at] as { level?: number }).level ?? 1) >= 2 ? 2 : 1) <= level)) at++;
      }
      const options: Record<string, unknown> = {};
      setAnchorsOn(options, [other.id]);
      blocks.splice(at, 0, { block_type: "heading", level, text: String(other.name || other.id), options } as never);
      recordSeen(data, doc, [issue.ref, other.id]);
      return true;
    }
    case "insert_sub_epochs": {
      if (!n) return false;
      const c = chapters[issue.chapter];
      const blocks = (c.blocks ??= []);
      let at = blocks.length;
      if (issue.block !== null) {
        at = issue.block + 1;
        const level = ((blocks[issue.block] as { level?: number })?.level ?? 1) >= 2 ? 2 : 1;
        while (at < blocks.length && !(blocks[at]?.block_type === "heading" && (((blocks[at] as { level?: number }).level ?? 1) >= 2 ? 2 : 1) <= level)) at++;
      } else {
        const first = blocks.findIndex((b) => b.block_type === "heading");
        if (first >= 0) at = first;
      }
      blocks.splice(at, 0, figureBlock(n.id, "sub_epochs", newFigureLabel(chapters as never), figureSig(n, doc, "sub_epochs")) as never);
      recordSeen(data, doc, [issue.ref]);
      return true;
    }
    case "reorder": {
      const [p, l] = String(fix.arg ?? "").split(":");
      const parent = p === "null" ? null : Number(p);
      const rank = new Map(flattenLanes(laneTree(doc, "epochs")).map((it, i) => [it.id, i]));
      reorder(chapters[issue.chapter], parent, (Number(l) >= 2 ? 2 : 1), rank);
      return true;
    }
    case "regenerate": {
      if (issue.block === null || !n) return false;
      const b = chapters[issue.chapter]?.blocks?.[issue.block];
      const f = figureOf(b as never);
      if (!b || !f) return false;
      const opts = { ...((b.options ?? {}) as Record<string, unknown>) };
      opts.figure = { ...(opts.figure as Record<string, unknown>), sig: figureSig(n, doc, f.kind) };
      // a still of the old content would be printed: gone, taken again at export
      delete opts.still; delete opts.still_w; delete opts.still_h;
      b.options = opts;
      return true;
    }
  }
  return false;
}

/** For the check: the units an epoch's or an activity's Matrix shows. */
export const scopeUnits = (n: EmNode, doc: EmDocument | null): string[] => scopeOf(n, doc).units.map((u) => u.id);
