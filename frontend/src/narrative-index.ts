/**
 * COLLEGARE · the INDEX window of a story (`narrative-index`), the left column
 * of the Narrative space: what the story is, its chapters and what each still
 * needs, and — fase 5 — how much of the graph it rests on.
 *
 * It reads the same NarrativeNode the page renders (`narrativesIn`), and every
 * number it shows is derived now, from the document: nothing is cached, so a
 * paragraph verified in the page is off the «AI n» chip at the next paint.
 * A click on a chapter is NAVIGATION (the page's current chapter), never an
 * edit; the edits it offers go through the caller's hooks, i.e. the same
 * mutators the page uses (`narrative-edit.ts`).
 */
import { t } from "./i18n";
import { blockStatus, bylineOf } from "./narrative-authorship";
import type { EditableChapter } from "./narrative-edit";
import { isUnwrittenProse, narrativesIn } from "./narrative";
import type { EmDocument } from "./types";

export interface IndexHooks {
  narrativeId: string | null;
  current: number | null;
  onPick(chapter: number): void;
  /** absent → the Index is read-only (a window with no document) */
  onAddChapter?(): void;
  undescribedEpochs?(): { id: string; name: string }[];
  onAddEpochChapter?(epochId: string): void;
  onRegenerate?(): void;
  canRegenerate?(): boolean;
  /** fase 5 · the coverage section, drawn by its own module into this host */
  coverage?(host: HTMLElement): void;
  /** NARRATIVE-DESK · the story's find, at the head of the chapters: it
   *  filters them here and marks the prose on the page (`onQuery`) */
  query?: string;
  onQuery?(q: string): void;
}

/** Does a chapter match a find? Its title, and the text of its prose. */
export function chapterMatches(ch: { title?: string; blocks?: { block_type?: string; text?: string; caption?: string }[] },
                               q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if ((ch.title ?? "").toLowerCase().includes(needle)) return true;
  return (ch.blocks ?? []).some((b) =>
    `${b.text ?? ""} ${b.caption ?? ""}`.toLowerCase().includes(needle));
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** What a chapter still needs, counted from its blocks. */
export function chapterNeeds(ch: { blocks?: { block_type?: string; text?: string;
  ai_generated?: boolean; validated_by?: string | null }[] }): { ai: number; todo: boolean } {
  let ai = 0;
  let todo = false;
  for (const b of ch.blocks ?? []) {
    if (b.block_type !== "prose") continue;
    if (blockStatus(b) === "ai_draft") ai++;
    if (isUnwrittenProse(b.text)) todo = true;
  }
  return { ai, todo };
}

export function renderNarrativeIndex(host: HTMLElement, doc: EmDocument | null, hooks: IndexHooks): void {
  host.textContent = "";
  const all = narrativesIn(doc);
  const nr = all.find((n) => n.id === hooks.narrativeId) ?? all[0];
  const root = el("div", "nidx");
  host.appendChild(root);
  if (!nr) {
    root.appendChild(el("p", "nidx-empty", doc ? t("nidx.none") : t("nidx.noDoc")));
    return;
  }
  const head = el("div", "nidx-head");
  const eyebrow = el("div", "nidx-eyebrow", t("win.narrative"));
  if (nr.templateId) eyebrow.appendChild(el("span", "nidx-tag", nr.templateId));
  head.appendChild(eyebrow);
  head.appendChild(el("b", "nidx-title", nr.name));
  const { responsible, assisted } = bylineOf(doc, nr.id, nr.chapters as EditableChapter[]);
  const by = el("div", "nidx-by");
  by.appendChild(el("span", "nidx-dim", `${t("nv.curatedBy")} `));
  by.appendChild(document.createTextNode(responsible.map((a) => a.label).join(", ") || "—"));
  if (assisted.length) {
    by.appendChild(el("span", "nidx-dim", ` · ${t("nv.assistedBy")} `));
    by.appendChild(document.createTextNode(assisted.map((a) => a.label).join(", ")));
  }
  head.appendChild(by);
  root.appendChild(head);

  const index = new Map((doc?.graph?.nodes ?? []).map((n) => [n.id, n]));
  // the find: filters the rows in place (no repaint, so the caret stays), and
  // hands the query on for the page to mark
  const find = document.createElement("input");
  find.type = "search";
  find.autocomplete = "off";
  find.className = "nidx-search";
  find.placeholder = t("nidx.find");
  find.value = hooks.query ?? "";
  root.appendChild(find);
  const rows: { li: HTMLElement; ch: (typeof nr.chapters)[number] }[] = [];
  const none = el("p", "nidx-dim nidx-nohit", t("nidx.noHit"));
  const applyFind = (): void => {
    let shown = 0;
    for (const r of rows) {
      const hit = chapterMatches(r.ch as Parameters<typeof chapterMatches>[0], find.value);
      r.li.hidden = !hit;
      if (hit) shown++;
    }
    none.hidden = shown > 0;
  };
  find.addEventListener("input", () => {
    applyFind();
    hooks.onQuery?.(find.value);
  });
  const list = el("ol", "nidx-ch");
  nr.chapters.forEach((ch, i) => {
    const li = el("li");
    const b = el("button", "nidx-row" + (hooks.current === i ? " on" : "")) as HTMLButtonElement;
    b.type = "button";
    b.dataset.chapter = String(i);
    b.appendChild(el("span", "nidx-n", String(i + 1)));
    b.appendChild(el("span", "nidx-t", ch.title || t("nidx.untitled")));
    if (ch.canonical) {
      const star = el("span", "nidx-star", "★");
      star.title = t("nidx.canonical");
      b.appendChild(star);
    }
    b.appendChild(el("span", "nidx-grow"));
    const lane = ch.anchor ? index.get(ch.anchor) : undefined;
    if (lane) b.appendChild(el("span", "nidx-lane", String(lane.name ?? lane.id)));
    const needs = chapterNeeds(ch as Parameters<typeof chapterNeeds>[0]);
    if (needs.ai) b.appendChild(el("span", "nidx-tag ai", `AI ${needs.ai}`));
    if (needs.todo) b.appendChild(el("span", "nidx-tag todo", t("nidx.toWrite")));
    b.addEventListener("click", () => hooks.onPick(i));
    li.appendChild(b);
    list.appendChild(li);
    rows.push({ li, ch });
  });
  root.appendChild(list);
  root.appendChild(none);
  applyFind();

  if (hooks.onAddChapter) {
    const add = el("div", "nidx-add");
    const mk = (label: string, title: string, run: () => void, disabled = false): void => {
      const b = el("button", "nidx-btn", label) as HTMLButtonElement;
      b.type = "button";
      b.title = title;
      b.disabled = disabled;
      b.addEventListener("click", run);
      add.appendChild(b);
    };
    mk(`+ ${t("nidx.chapter")}`, t("nv.addChapterTitle"), () => hooks.onAddChapter?.());
    for (const ep of hooks.undescribedEpochs?.() ?? [])
      mk(`+ ${ep.name}`, t("nidx.epochChapter", { name: ep.name }), () => hooks.onAddEpochChapter?.(ep.id));
    if (hooks.onRegenerate)
      mk(`↻ ${t("nv.regenerate")}`, hooks.canRegenerate?.() ? t("nidx.regenerateTitle") : t("ai.regenerateUnavailable"),
        () => hooks.onRegenerate?.(), !hooks.canRegenerate?.());
    root.appendChild(add);
  }
  if (hooks.coverage) {
    const cov = el("div", "nidx-cov");
    root.appendChild(cov);
    hooks.coverage(cov);
  }
}
