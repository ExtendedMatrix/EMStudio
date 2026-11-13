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
  /** NARRATIVE-DESK · «Firmo io» when nobody is responsible for the story (the
   *  identity of the header); absent → read-only */
  onSignMe?(): void;
  signTitle?: string;
  /** absent → the Index is read-only (a window with no document) */
  onAddChapter?(): void;
  undescribedEpochs?(): { id: string; name: string }[];
  onAddEpochChapter?(epochId: string): void;
  /** NARRATIVA-BLOCCHI p.3 · the standard blocks the story lacks (names), and
   *  the gesture that adds them */
  standardMissing?(): string[];
  onAddStandard?(): void;
  onRegenerate?(): void;
  canRegenerate?(): boolean;
  /** fase 5 · the coverage section, drawn by its own module into this host */
  coverage?(host: HTMLElement): void;
  /** NARRATIVE-DESK · the story's find, at the head of the chapters: it
   *  filters them here and marks the prose on the page (`onQuery`) */
  query?: string;
  onQuery?(q: string): void;
  /** MICRO-NARRATIVE-MODULI p.10 · a chapter dragged in the list (`to` = the
   *  index it goes before) */
  onMoveChapter?(from: number, to: number): void;
  /** p.15 · a lane's label with its epoch («II A.D. › VAct.03 …») */
  laneLabel?(id: string): string;
  /** p.9 · the «+ Aggiungi…» menu, drawn by the caller under its button */
  onAddMenu?(anchor: HTMLElement): void;
  /** p.9 · the coverage section open (remembered by the caller) */
  coverageOpen?: boolean;
  onCoverageToggle?(open: boolean): void;
}

const CHAPTER_DRAG = "application/x-em-chapter";

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
  const title = el("b", "nidx-title", nr.name);
  title.title = t("nidx.titleWhere");
  head.appendChild(title);
  const { responsible, assisted } = bylineOf(doc, nr.id, nr.chapters as EditableChapter[]);
  const by = el("div", "nidx-by");
  by.title = t("nidx.bylineComputed");
  by.appendChild(el("span", "nidx-dim", `${t("nv.curatedBy")} `));
  by.appendChild(document.createTextNode(responsible.map((a) => a.label).join(", ") || "—"));
  if (!responsible.length && hooks.onSignMe) {
    const sign = el("button", "nidx-sign", t("ninsp.signMe")) as HTMLButtonElement;
    sign.type = "button";
    sign.dataset.nidxact = "sign";
    if (hooks.signTitle) sign.title = hooks.signTitle;
    sign.addEventListener("click", () => hooks.onSignMe?.());
    by.appendChild(sign);
  }
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
    // MICRO-PULIZIA p.8 · the badges in a box of their own: the title keeps
    // its width (never one letter per line beside a long lane), the box goes
    // under it when the row is narrow, and the lane's name is shortened with
    // an ellipsis — the whole name in its tooltip
    const meta = el("span", "nidx-meta");
    const lane = ch.anchor ? index.get(ch.anchor) : undefined;
    // the lane's chip only when it says something the title does not
    const laneName = lane ? (hooks.laneLabel?.(lane.id) ?? String(lane.name ?? lane.id)) : "";
    if (lane && String(lane.name ?? lane.id) !== (ch.title ?? "")) {
      const chip = el("span", "nidx-lane", laneName);
      chip.title = laneName;
      meta.appendChild(chip);
    }
    const needs = chapterNeeds(ch as Parameters<typeof chapterNeeds>[0]);
    if (needs.ai) {
      const ai = el("span", "nidx-tag ai", `AI ${needs.ai}`);
      ai.title = t("nidx.aiComputed");
      meta.appendChild(ai);
    }
    if (needs.todo) {
      const todo = el("span", "nidx-tag todo", t("nidx.toWrite"));
      todo.title = t("nidx.todoComputed");
      meta.appendChild(todo);
    }
    if (meta.childElementCount) b.appendChild(meta);
    b.addEventListener("click", () => hooks.onPick(i));
    li.appendChild(b);
    // p.10 · dragged in the list: a line where it falls, the drop moves it
    if (hooks.onMoveChapter) {
      li.draggable = true;
      li.dataset.chapter = String(i);
      li.title = t("nv.dragChapter");
      li.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData(CHAPTER_DRAG, String(i));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        li.classList.add("nidx-dragging");
      });
      li.addEventListener("dragend", () => li.classList.remove("nidx-dragging"));
      const target = (e: DragEvent): number => {
        const r = li.getBoundingClientRect();
        return e.clientY > r.top + r.height / 2 ? i + 1 : i;
      };
      li.addEventListener("dragover", (e) => {
        if (!(e.dataTransfer?.types ?? []).includes(CHAPTER_DRAG)) return;
        e.preventDefault();
        const after = target(e) > i;
        li.classList.toggle("nidx-drop-before", !after);
        li.classList.toggle("nidx-drop-after", after);
      });
      li.addEventListener("dragleave", () => li.classList.remove("nidx-drop-before", "nidx-drop-after"));
      li.addEventListener("drop", (e) => {
        const raw = e.dataTransfer?.getData(CHAPTER_DRAG);
        li.classList.remove("nidx-drop-before", "nidx-drop-after");
        if (!raw) return;
        e.preventDefault();
        hooks.onMoveChapter?.(Number(raw), target(e));
      });
    }
    list.appendChild(li);
    rows.push({ li, ch });
  });
  root.appendChild(list);
  root.appendChild(none);
  applyFind();

  // MICRO-NARRATIVE-MODULI p.9 (E.D., 13 Nov 2026: «la finestra è confusa») ·
  // the Index is the list of the chapters; what can be ADDED is behind ONE
  // «+ Aggiungi…» (a chapter, the standard blocks, a chapter for an epoch not
  // told yet), drawn by the caller under the button
  if (hooks.onAddMenu) {
    const add = el("div", "nidx-add");
    const b = el("button", "nidx-btn nidx-addmenu", `+ ${t("nidx.addMenu")}`) as HTMLButtonElement;
    b.type = "button";
    b.dataset.nidxact = "add";
    b.title = t("nidx.addMenuTitle");
    b.addEventListener("click", (e) => { e.stopPropagation(); hooks.onAddMenu?.(b); });
    add.appendChild(b);
    root.appendChild(add);
  }
  // p.9 · the coverage is a section of its own, CLOSED by default: its rows
  // are drawn only when it is opened (a count per line; the chips one level
  // further, row by row)
  if (hooks.coverage) {
    const det = document.createElement("details");
    det.className = "nidx-cov";
    det.open = !!hooks.coverageOpen;
    const sum = el("summary", "nidx-cov-sum", t("nidx.coverage"));
    sum.dataset.nidxact = "coverage";
    det.appendChild(sum);
    const body = el("div", "nidx-cov-body");
    det.appendChild(body);
    if (det.open) hooks.coverage(body);
    det.addEventListener("toggle", () => {
      hooks.onCoverageToggle?.(det.open);
      if (det.open && !body.childElementCount) hooks.coverage!(body);
    });
    root.appendChild(det);
  }
}
