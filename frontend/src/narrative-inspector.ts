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

export function renderNarrativeInspector(root: HTMLElement, h: NarrInspectorHooks): void {
  root.textContent = "";
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
  const what = !block ? `${t("ninsp.chapter")} ${h.chapter + 1}`
    : block.block_type === "prose" ? t("ninsp.paragraph")
    : `Embed · ${h.viewTypeLabel(String(block.view_type ?? ""))}`;
  head.appendChild(el("b", undefined, what));
  head.appendChild(el("div", "ninsp-dim",
    `${nr.name} · ${ch.title}${h.block != null ? ` · ${h.block + 1}` : ""}`));
  wrap.appendChild(head);

  if (!block) {
    // ── the chapter ────────────────────────────────────────────────────────
    const s = section(wrap);
    // AUDIT N9 · the title is written IN THE PAGE (the chapter's heading); the
    // Inspector SHOWS it — one place to edit, not two
    const lt = el("div", "ninsp-l", t("ninsp.title"));
    const ti = el("b", "ninsp-title", ch.title ?? "");
    ti.dataset.nvset = "title";
    ti.title = t("ninsp.titleInPage");
    lt.appendChild(ti);
    s.appendChild(lt);
    void h.onRename;
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
