/**
 * COLLEGARE · the Inspector of a story — where the page's tools went.
 *
 * «In Scrivi la pagina è quella del lettore» (E.D., 29 set 2026): the ★, the
 * lane select, ▲▼✕, the author select and «Firmo come» used to sit IN the page,
 * between the lines a reader reads. They are here now, for the part selected on
 * the page:
 *
 *   · a CHAPTER: title, the lane it narrates, the signature («Firmo io», with
 *     the identity of the header — the signer IS the identity), ★ canonical,
 *     AI support («Chiedi una bozza», «Verifica il capitolo (n)»), move, delete;
 *   · a PARAGRAPH: its status (a person / AI to verify / AI ✓ with the ORCID),
 *     model and prompt, the nodes it mentions, Verifica;
 *   · an EMBED: its ref, «Come si vede» (the view types this node can be shown
 *     as), the caption, and «Fuori da EMStudio» — what it becomes in the reader,
 *     in DOCX/LaTeX, in Jupyter (`narrative-projection.ts`, the exporters' rules).
 *
 * Every control calls a hook, and every hook is one of the page's mutators
 * (`narrative-edit.ts`, `narrative-authorship.ts`): one gesture, one undo step.
 */
import { t } from "./i18n";
import { blockStatus } from "./narrative-authorship";
import { narrativesIn } from "./narrative";
import { mentionsIn, notebookKindOf, printKindOf } from "./narrative-projection";
import { narrativeViewTypeDescription } from "./rules";
import { QUERY_ORDERS, QUERY_SCOPES, QUERY_TYPES, queryOf } from "./narrative-query";
import type { EmDocument, EmNode } from "./types";

export interface NarrInspectorHooks {
  doc: EmDocument;
  narrativeId: string;
  chapter: number;
  block: number | null;
  lanes: { id: string; label: string }[];
  /** the identity of the header, or null («Firmo io» then asks for it) */
  identity: { orcid: string; label: string } | null;
  viewTypesFor(node: EmNode | undefined): string[];
  viewTypeLabel(vt: string): string;
  onRename(title: string): void;
  /** NARRATIVA-BLOCCHI p.1 · the story's title and subtitle (chapter -1) */
  onRenameNarrative(name: string): void;
  onSetDescription(text: string): void;
  /** NARRATIVA-BLOCCHI p.2 · a query block's question (scope, types, order) */
  onSetQuery(patch: Record<string, unknown>): void;
  onSetAnchor(anchor: string | null): void;
  onSignMe(): void;
  onToggleCanonical(): void;
  canGenerate(): boolean;
  generating(): boolean;
  onGenerate(): void;
  pending(): number;
  onVerifyChapter(): void;
  onMove(delta: number): void;
  onDelete(): void;
  onVerify(): void;
  onRetract(): void;
  onReveal(id: string): void;
  onSetViewType(vt: string): void;
  onSetCaption(caption: string): void;
  /** fase 4 · the map embed's own section (site_position and the 3D anchor) */
  mapSection?(host: HTMLElement, node: EmNode): void;
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function button(label: string, run: () => void, cls = "insp-btn"): HTMLButtonElement {
  const b = el("button", cls, label) as HTMLButtonElement;
  b.type = "button";
  b.addEventListener("click", run);
  return b;
}
function field(host: HTMLElement, label: string, value: Node | string): void {
  const row = el("div", "ninsp-f");
  row.appendChild(el("span", "ninsp-k", label));
  const v = el("span", "ninsp-v");
  v.append(value);
  row.appendChild(v);
  host.appendChild(row);
}
function section(host: HTMLElement, title?: string): HTMLElement {
  const s = el("section", "ninsp-s");
  if (title) s.appendChild(el("div", "ninsp-eyebrow", title));
  host.appendChild(s);
  return s;
}

/** A text field of the Inspector written on `change` (Enter or leaving it):
 *  one gesture, one undo step, through the same mutator as the page. */
function textField(host: HTMLElement, label: string, key: string, value: string,
                   commit: (v: string) => void, opts: { multiline?: boolean; placeholder?: string; title?: string } = {}): void {
  const l = el("label", "ninsp-l", label);
  const input = (opts.multiline ? document.createElement("textarea") : document.createElement("input")) as
    HTMLInputElement | HTMLTextAreaElement;
  input.className = "insp-name-input ninsp-head-input";
  input.dataset.nvset = key;
  input.value = value;
  if (opts.placeholder) input.placeholder = opts.placeholder;
  if (opts.title) input.title = opts.title;
  if (opts.multiline) (input as HTMLTextAreaElement).rows = 2;
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if ((e as KeyboardEvent).key === "Enter" && !(e as KeyboardEvent).shiftKey) {
      e.preventDefault();
      input.blur();
    }
  });
  input.addEventListener("change", () => commit(input.value));
  l.appendChild(input);
  host.appendChild(l);
}

/** NARRATIVA-BLOCCHI p.1 · the Inspector of the story itself: its title and
 *  subtitle, written here or in the page (the same field), and what is
 *  computed about it, said to be computed. */
function renderStoryInspector(root: HTMLElement, h: NarrInspectorHooks): void {
  const nr = narrativesIn(h.doc).find((n) => n.id === h.narrativeId);
  if (!nr) return;
  const wrap = el("div", "ninsp");
  root.appendChild(wrap);
  const head = el("div", "ninsp-head");
  head.appendChild(el("b", undefined, t("ninsp.story")));
  head.appendChild(el("div", "ninsp-dim", nr.name));
  wrap.appendChild(head);
  const s = section(wrap);
  textField(s, t("ninsp.storyTitle"), "story-title", nr.name, (v) => h.onRenameNarrative(v),
            { title: t("ninsp.storyTitleNote") });
  textField(s, t("ninsp.subtitle"), "story-subtitle", nr.description ?? "", (v) => h.onSetDescription(v),
            { multiline: true, placeholder: t("nv.addSubtitle") });
  const info = section(wrap, t("ninsp.computed"));
  if (nr.templateId) field(info, t("ninsp.template"), nr.templateId);
  field(info, t("ninsp.chapters"), String(nr.chapters.length));
  info.appendChild(el("p", "ninsp-note", t("nv.metaComputed")));
}

export function renderNarrativeInspector(root: HTMLElement, h: NarrInspectorHooks): void {
  root.textContent = "";
  if (h.chapter === -1) {
    renderStoryInspector(root, h);
    return;
  }
  const nr = narrativesIn(h.doc).find((n) => n.id === h.narrativeId);
  const ch = nr?.chapters[h.chapter];
  if (!nr || !ch) return;
  const index = new Map(h.doc.graph.nodes.map((n) => [n.id, n]));
  const nameOf = (id: string | undefined): string => {
    const n = id ? index.get(id) : undefined;
    return n ? String(n.name || n.id) : (id ?? "");
  };
  const block = h.block != null ? (ch.blocks ?? [])[h.block] : undefined;
  const wrap = el("div", "ninsp");
  root.appendChild(wrap);

  const head = el("div", "ninsp-head");
  const q = queryOf(block);
  const what = !block ? `${t("ninsp.chapter")} ${h.chapter + 1}`
    : block.block_type === "prose" ? t("ninsp.paragraph")
    : q ? `${t("nq.kindLabel")} · ${t(`nq.title.${q.query}`)}`
    : `Embed · ${h.viewTypeLabel(String(block.view_type ?? ""))}`;
  head.appendChild(el("b", undefined, what));
  head.appendChild(el("div", "ninsp-dim",
    `${nr.name} · ${ch.title}${h.block != null ? ` · ${h.block + 1}` : ""}`));
  wrap.appendChild(head);

  if (!block) {
    // ── the chapter ────────────────────────────────────────────────────────
    const s = section(wrap);
    // NARRATIVA-BLOCCHI p.1 · the title is written in the page AND here: one
    // field (`chapters[i].title`), one mutator (`renameChapter`), one undo step
    // per gesture — the Inspector shows it and writes it (AUDIT N9 left this
    // hook unconnected, «one place to edit»; E.D. asks for both)
    textField(s, t("ninsp.title"), "title", ch.title ?? "", (v) => { if (v.trim()) h.onRename(v.trim()); });
    const ll = el("label", "ninsp-l", t("ninsp.lane"));
    const ls = document.createElement("select");
    ls.dataset.nvset = "anchor";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = `— ${t("ninsp.noLane")}`;
    ls.appendChild(none);
    for (const lane of h.lanes) {
      const o = document.createElement("option");
      o.value = lane.id;
      o.textContent = lane.label;
      o.selected = lane.id === ch.anchor;
      ls.appendChild(o);
    }
    ls.addEventListener("change", () => h.onSetAnchor(ls.value || null));
    ll.appendChild(ls);
    s.appendChild(ll);
    // the signature: the identity of the header, nothing to pick
    const who = document.createDocumentFragment();
    who.append(ch.authored_by ? nameOf(ch.authored_by) : t("ninsp.nobody"), " ");
    const sign = button(t("ninsp.signMe"), h.onSignMe, "insp-btn ninsp-sign");
    sign.dataset.nvact = "sign";
    sign.title = h.identity ? t("ninsp.signAs", { who: h.identity.label }) : t("ninsp.needIdentity");
    who.append(sign);
    field(s, t("ninsp.signed"), who);
    const canon = button(ch.canonical ? `★ ${t("ninsp.canonical")}` : `☆ ${t("ninsp.makeCanonical")}`,
      h.onToggleCanonical);
    canon.dataset.nvact = "canon";
    s.appendChild(canon);
    s.appendChild(el("p", "ninsp-note", t("ninsp.canonicalNote")));

    const ai = section(wrap, t("ninsp.ai"));
    const pending = h.pending();
    if (pending) {
      ai.appendChild(el("p", "ninsp-dim", `▲ ${t("ninsp.toVerify", { n: String(pending) })}`));
      const va = button(t("ninsp.verifyChapter", { n: String(pending) }), h.onVerifyChapter);
      va.dataset.nvact = "verifyall";
      ai.appendChild(va);
    }
    const gen = button(h.generating() ? t("nv.generating") : t("ninsp.askDraft"), h.onGenerate);
    gen.dataset.nvact = "gen";
    gen.disabled = !h.canGenerate() || h.generating();
    if (!h.canGenerate()) gen.title = t("ninsp.draftNeedsLane");
    ai.appendChild(gen);
    ai.appendChild(el("p", "ninsp-note", t("ninsp.aiNote")));
  } else if (block.block_type === "prose") {
    // ── a paragraph ────────────────────────────────────────────────────────
    const s = section(wrap);
    const st = blockStatus(block);
    const status = el("span", `ninsp-tag ${st}`);
    if (st === "human") status.textContent = t("ninsp.byPerson");
    else if (st === "ai_draft") status.textContent = `AI · ${t("ninsp.toVerifyOne")}`;
    else {
      const v = index.get(block.validated_by ?? "");
      const orcid = (v?.data as Record<string, unknown> | undefined)?.orcid;
      status.textContent = `AI ✓ ${nameOf(block.validated_by)}${orcid ? ` · ORCID ${orcid}` : ""}`;
    }
    field(s, t("ninsp.status"), status);
    if (block.authored_by || block.prompt_ref) {
      const m = document.createDocumentFragment();
      m.append(nameOf(block.authored_by) || "—");
      const mv = (block.options ?? {})["model_version"];
      if (typeof mv === "string") m.append(` · ${mv}`);
      if (block.prompt_ref) {
        m.append(" · ");
        const pl = button("prompt", () => h.onReveal(block.prompt_ref!), "link");
        pl.disabled = !index.has(block.prompt_ref);
        m.append(pl);
      }
      field(s, t("ninsp.model"), m);
    }
    const cites = document.createDocumentFragment();
    const ids = mentionsIn(block.text);
    if (!ids.length) cites.append("—");
    ids.forEach((id, i) => {
      if (i) cites.append(" ");
      const l = button(nameOf(id), () => h.onReveal(id), "link");
      l.disabled = !index.has(id);
      cites.append(l);
    });
    field(s, t("ninsp.cites"), cites);
    if (st === "ai_draft") {
      const v = button(t("nv.verify"), h.onVerify, "insp-btn ninsp-verify");
      v.dataset.nvact = "verify";
      s.appendChild(v);
    } else if (st === "ai_endorsed") {
      s.appendChild(button(t("nv.retract"), h.onRetract));
    }
    s.appendChild(el("p", "ninsp-note", t("ninsp.mentionNote")));
  } else if (q) {
    // ── NARRATIVA-BLOCCHI p.2 · a block that asks the graph ────────────────
    const s = section(wrap);
    s.appendChild(el("p", "ninsp-note", t(`nq.what.${q.query}`)));
    const sl = el("label", "ninsp-l", t("nq.scopeLabel"));
    const ss = document.createElement("select");
    ss.dataset.nvset = "q-scope";
    for (const sc of QUERY_SCOPES) {
      const o = document.createElement("option");
      o.value = sc;
      o.textContent = t(`nq.scope.${sc}`);
      o.selected = sc === q.scope;
      ss.appendChild(o);
    }
    ss.addEventListener("change", () => h.onSetQuery({ scope: ss.value }));
    sl.appendChild(ss);
    s.appendChild(sl);
    const tl = el("div", "ninsp-l ninsp-q-types", t("nq.typesLabel"));
    const all = QUERY_TYPES[q.query];
    for (const ty of all) {
      const lab = el("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.nvset = `q-type-${ty}`;
      cb.checked = q.types.includes(ty);
      cb.addEventListener("change", () => {
        const next = all.filter((x) => (x === ty ? cb.checked : q.types.includes(x)));
        // every type again is the default: written as nothing
        h.onSetQuery({ types: next.length === all.length ? null : next });
      });
      lab.append(cb, ` ${t(`nq.type.${ty}`)}`);
      tl.appendChild(lab);
    }
    s.appendChild(tl);
    const ol = el("label", "ninsp-l", t("nq.orderLabel"));
    const os = document.createElement("select");
    os.dataset.nvset = "q-order";
    for (const od of QUERY_ORDERS[q.query]) {
      const o = document.createElement("option");
      o.value = od;
      o.textContent = t(`nq.order.${od}`);
      o.selected = od === q.order;
      os.appendChild(o);
    }
    os.addEventListener("change", () => h.onSetQuery({ order: os.value }));
    ol.appendChild(os);
    s.appendChild(ol);
    s.appendChild(el("p", "ninsp-note", t("nq.liveTitle")));
    const out = section(wrap, t("ninsp.outside"));
    const tbl = el("table", "ninsp-out");
    const row = (k: string, v: string): void => {
      const tr = el("tr");
      tr.append(el("td", undefined, k), el("td", undefined, v));
      tbl.appendChild(tr);
    };
    row(t("ninsp.reader"), t("ninsp.readerLive"));
    row("DOCX · LaTeX", t("nq.asStatic"));
    row("Jupyter", t("nq.asStatic"));
    out.appendChild(tbl);
  } else {
    // ── an embed ───────────────────────────────────────────────────────────
    const node = index.get(String(block.ref ?? ""));
    const s = section(wrap);
    const ref = document.createDocumentFragment();
    if (node) {
      ref.append(button(nameOf(node.id), () => h.onReveal(node.id), "link"));
      if (node.description) ref.append(el("span", "ninsp-dim", ` ${node.description}`));
    } else ref.append(el("span", "ninsp-tag warn", `${block.ref} · ${t("ninsp.unresolved")}`));
    field(s, "ref", ref);
    const vl = el("label", "ninsp-l", t("ninsp.shownAs"));
    const vs = document.createElement("select");
    vs.dataset.nvset = "vt";
    const allowed = h.viewTypesFor(node);
    const cur = String(block.view_type ?? "");
    for (const vt of allowed.includes(cur) || !cur ? allowed : [cur, ...allowed]) {
      const o = document.createElement("option");
      o.value = vt;
      o.textContent = h.viewTypeLabel(vt);
      o.title = narrativeViewTypeDescription(vt);
      o.selected = vt === cur;
      vs.appendChild(o);
    }
    vs.addEventListener("change", () => h.onSetViewType(vs.value));
    vl.appendChild(vs);
    s.appendChild(vl);
    const cl = el("label", "ninsp-l", t("ninsp.caption"));
    const ci = document.createElement("input");
    ci.className = "insp-name-input";
    ci.dataset.nvset = "cap";
    ci.value = String((block.options ?? {})["caption"] ?? "");
    ci.placeholder = node ? nameOf(node.id) : "";
    ci.addEventListener("change", () => h.onSetCaption(ci.value));
    cl.appendChild(ci);
    s.appendChild(cl);
    if (node && cur === "map" && h.mapSection) h.mapSection(wrap, node);
    // what it becomes outside EMStudio — the exporters' rules, embed by embed
    const out = section(wrap, t("ninsp.outside"));
    const tbl = el("table", "ninsp-out");
    const row = (k: string, v: string): void => {
      const tr = el("tr");
      tr.append(el("td", undefined, k), el("td", undefined, v));
      tbl.appendChild(tr);
    };
    row(t("ninsp.reader"), t("ninsp.readerLive"));
    const pk = printKindOf(cur);
    row("DOCX · LaTeX", pk === "citation" ? t("ninsp.asCitation")
      : pk === "figure-baked" ? t("ninsp.asBakedFigure") : t("ninsp.asFigure"));
    const nk = notebookKindOf(cur);
    row("Jupyter", nk === "link" ? t("ninsp.asLink") : nk === "cell" ? t("ninsp.asCell") : t("ninsp.asGenericCell"));
    out.appendChild(tbl);
  }

  const mv = section(wrap);
  mv.classList.add("ninsp-move");
  const up = button("▲", () => h.onMove(-1));
  up.dataset.nvact = "up";
  const down = button("▼", () => h.onMove(1));
  down.dataset.nvact = "down";
  const del = button(t("ninsp.delete"), h.onDelete);
  del.dataset.nvact = "del";
  mv.append(up, down, el("span", "ninsp-grow"), del);
}

/** «Nel racconto» for a node of the graph, with the story open: where it is
 *  cited already, and «Cita in «capitolo corrente»». Prepended to the node's
 *  own Inspector. */
export function renderCiteSection(root: HTMLElement, opts: {
  nodeName: string;
  citedIn: string[];
  chapterTitle: string;
  viewTypeLabel: string;
  onCite(): void;
}): void {
  const s = el("section", "ninsp-cite");
  s.appendChild(el("div", "ninsp-eyebrow", t("ninsp.inStory")));
  if (opts.citedIn.length)
    s.appendChild(el("p", "ninsp-dim", t("ninsp.citedIn", { list: opts.citedIn.map((c) => `«${c}»`).join(", ") })));
  const b = button(t("ninsp.citeIn", { chapter: opts.chapterTitle, vt: opts.viewTypeLabel }), opts.onCite);
  b.dataset.nvact = "cite";
  s.appendChild(b);
  root.prepend(s);
}
