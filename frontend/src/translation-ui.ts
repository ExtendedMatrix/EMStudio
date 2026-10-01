/**
 * TRADUZIONI · the two surfaces of a translation: the ROW of languages under a
 * text, and the FACING TEXT where a translation is made, checked and realigned.
 *
 * The experience is the desk's (scrivania v13, «le traduzioni»); the code is
 * not — the prototype held translations in a list of its own, here they are the
 * library's nodes, read and written by `translation.ts` and `ai-validation.ts`.
 *
 *   · the ROW: the original's language («originale», and «from the study» when
 *     the node declares none), one pill per translation with its state — ✓
 *     verified, ◐ to review, ✦ AI to verify, ↻ to realign — and «+ translate».
 *     The original's language is DECLARED from its pill (`data.lang`, undo).
 *   · the FACING TEXT: the original on the left, read only, in its language;
 *     the translation on the right; the method (by hand, from an edition — the
 *     edition's DocumentNode becomes the `extracted_from` edge —, or AI through
 *     the AI channel EMStudio already has); «ask for a review», always on for
 *     AI; the translator is the active identity, and without one the identity
 *     opens and nothing is saved anonymous; «Verify and sign» when the
 *     translation waits for a person; «to realign» when the original changed,
 *     with the old and the new original side by side — closed only by updating
 *     the translation, never by a signature.
 *
 * Every string is a key (`tr.*`); the DOM is built with nodes, not markup, so
 * no text from the graph is ever parsed as HTML.
 */
import { t } from "./i18n";
import type { DocumentStore } from "./model";
import type { EmNode } from "./types";
import type { SignerIdentity } from "./narrative-authorship";
import { markAiAssisted, needsReview, type ReviewReason } from "./ai-validation";
import {
  addTranslation, checkTranslation, COMMON_LANGUAGES, declareNodeLanguage, editionOf, fieldText, isLanguageTag,
  languageName, originalLanguage, originalOf, sameLanguage, textDigest, textIn, TranslationError,
  translationState, translationsOf, translatorsOf, unreconciledVocabulary, updateTranslation,
  type TranslationMethod, type TranslationState,
} from "./translation";

/** What the surfaces need from the app — injected, so this module never
 *  imports `main.ts` (the shell's rule). */
export interface TranslationUi {
  store: () => DocumentStore | null;
  /** the interface language */
  locale: () => string;
  /** «show the texts in…» (the setting; it starts from the interface language) */
  displayLang: () => string;
  /** the active identity, or null */
  me: () => SignerIdentity | null;
  /** open the identity panel; `then` runs once an identity exists */
  openIdentity: (then?: () => void) => void;
  aiReady: () => Promise<boolean>;
  askAiThen: (run: () => void) => void;
  proposeAi: (text: string, from: string, to: string) =>
    Promise<{ ok: true; text: string; provider: string; model: string } | { ok: false; why: string }>;
  aiAuthorFor: (store: DocumentStore, provider: string, model: string) => string;
  authorFor: (store: DocumentStore, me: SignerIdentity) => string;
  /** «✓ Verify»: the app's act (it asks the identity, logs, refreshes) */
  verify: (ids: string[]) => void;
  /** after an act: the log line, the undo toast, the refresh */
  done: (msg: string, ids: string[]) => void;
  /** the past values of a field this session still holds (newest first) */
  pastValues: (nodeId: string, field: string) => string[];
}

const STATE_ICON: Record<TranslationState, string> = { verified: "✓", review: "◐", ai: "✦", stale: "↻", plain: "" };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const dataOf = (n: EmNode | undefined): Record<string, unknown> => ((n?.data ?? {}) as Record<string, unknown>);
const langLabel = (ui: TranslationUi, tag: string): string => `${tag} · ${languageName(tag, ui.locale())}`;
const stateLabel = (s: TranslationState): string => t(`tr.st.${s}`);
const methodLabel = (m: string): string => t(`tr.m.${m}`) === `tr.m.${m}` ? m : t(`tr.m.${m}`);

function languageSelect(ui: TranslationUi, value: string | null, opts: { exclude?: string | null; none?: string; aria: string }): HTMLSelectElement {
  const sel = el("select", "tr-lang-select");
  sel.setAttribute("aria-label", opts.aria);
  if (opts.none !== undefined) {
    const o = el("option", undefined, opts.none);
    o.value = "";
    sel.appendChild(o);
  }
  const tags = [...COMMON_LANGUAGES];
  if (value && !tags.some((x) => sameLanguage(x, value))) tags.unshift(value);
  for (const tag of tags) {
    if (opts.exclude && sameLanguage(tag, opts.exclude)) continue;
    const o = el("option", undefined, langLabel(ui, tag));
    o.value = tag;
    if (value && sameLanguage(tag, value)) o.selected = true;
    sel.appendChild(o);
  }
  const other = el("option", undefined, t("tr.otherLang"));
  other.value = "__other";
  sel.appendChild(other);
  return sel;
}

/** A select that may answer «other…»: then a tag is asked, and refused unless
 *  it is one (never guessed). Resolves to the tag, "" (none), or null (cancel). */
function readLanguage(sel: HTMLSelectElement): string | null {
  if (sel.value !== "__other") return sel.value;
  const typed = (window.prompt(t("tr.typeTag")) ?? "").trim();
  if (!typed) return null;
  if (!isLanguageTag(typed)) { window.alert(t("tr.err.lang")); return null; }
  return typed;
}

// ── the row ──────────────────────────────────────────────────────────────────

/**
 * The row of languages under one text field of one node. Drawn by the
 * inspector (description, a property's value) and by the Doc window.
 */
export function renderLanguageRow(host: HTMLElement, ui: TranslationUi, nodeId: string, field: string): void {
  const store = ui.store();
  const node = store?.node(nodeId);
  if (!store || !node) return;
  const doc = store.doc;
  const row = el("div", "tr-row");
  row.dataset.trField = field;
  row.dataset.trNode = nodeId;
  const o = originalLanguage(doc, node);

  // the original — its pill declares the language
  const orig = el("button", "tr-pill orig");
  orig.type = "button";
  orig.dataset.trOrig = "1";
  orig.textContent = o.lang
    ? `${o.lang} · ${t("tr.original")}${o.from === "study" ? ` · ${t("tr.fromStudy")}` : ""}`
    : `? · ${t("tr.noLang")}`;
  orig.title = o.lang
    ? t(o.from === "study" ? "tr.origTitleStudy" : "tr.origTitle", { lang: langLabel(ui, o.lang) })
    : t("tr.noLangTitle");
  if (!o.lang) orig.classList.add("missing");
  orig.addEventListener("click", () => {
    const sel = languageSelect(ui, o.from === "node" ? o.lang : null,
      { none: o.from === "node" ? t("tr.withdraw") : t("tr.declare"), aria: t("tr.origLangAria") });
    sel.classList.add("tr-declare");
    orig.replaceWith(sel);
    sel.focus();
    const finish = (): void => {
      const v = readLanguage(sel);
      if (v === null) { ui.done("", []); return; }
      const st = ui.store();
      if (!st) return;
      if (v === "" && o.from !== "node") { ui.done("", []); return; }
      declareNodeLanguage(st, nodeId, v || null);
      ui.done(v ? t("tr.langDeclared", { n: String(node.name ?? nodeId), lang: langLabel(ui, v) })
                : t("tr.langWithdrawn", { n: String(node.name ?? nodeId) }), [nodeId]);
    };
    sel.addEventListener("change", finish);
    sel.addEventListener("blur", () => { if (sel.isConnected) ui.done("", []); });
  });
  row.appendChild(orig);

  // one pill per translation
  for (const tr of translationsOf(doc, nodeId, field)) {
    const s = translationState(doc, tr);
    const d = dataOf(tr);
    const pill = el("button", `tr-pill st-${s}`);
    pill.type = "button";
    pill.dataset.trPill = String(d.lang ?? "");
    pill.dataset.trState = s;
    pill.textContent = String(d.lang ?? "?");
    if (STATE_ICON[s]) pill.appendChild(el("span", "tr-ico", ` ${STATE_ICON[s]}`));
    const who = translatorsOf(doc, tr).map((a) => String(a.name ?? a.id)).join(", ");
    pill.title = t("tr.pillTitle", { lang: langLabel(ui, String(d.lang ?? "")), state: stateLabel(s),
                                     method: methodLabel(String(d.method ?? "")), who: who || "—" });
    pill.addEventListener("click", () => openFacingText(ui, nodeId, field, tr.id));
    row.appendChild(pill);
  }

  const add = el("button", "tr-pill add", t("tr.translate"));
  add.type = "button";
  add.dataset.trAdd = "1";
  add.title = t("tr.translateTitle");
  add.addEventListener("click", () => openFacingText(ui, nodeId, field, null));
  row.appendChild(add);
  host.appendChild(row);

  if (unreconciledVocabulary(node)) host.appendChild(el("div", "tr-note", t("tr.vocabNote")));

  // «show the texts in…»: the translation, marked, where there is one
  const want = ui.displayLang();
  if (want && o.lang && !sameLanguage(want, o.lang)) {
    const shown = textIn(doc, nodeId, field, want);
    if (!shown.original && shown.text) {
      const box = el("div", "tr-shown");
      box.dataset.trShown = String(shown.lang ?? "");
      box.lang = String(shown.lang ?? "");
      const mark = el("div", "tr-shown-mark", t("tr.shownFrom", { from: o.lang, mark: reasonMark(shown.reasons) }));
      box.append(mark, el("div", "tr-shown-text", shown.text));
      host.appendChild(box);
    }
  }
}

function reasonMark(reasons: ReviewReason[]): string {
  if (reasons.includes("stale")) return `↻ ${t("tr.st.stale")}`;
  if (reasons.includes("ai")) return `✦ ${t("tr.st.ai")}`;
  if (reasons.includes("review_requested")) return `◐ ${t("tr.st.review")}`;
  return "✓";
}

// ── the facing text ──────────────────────────────────────────────────────────

interface Draft {
  lang: string;
  text: string;
  method: TranslationMethod;
  edition: string;
  review: boolean;
  provider?: string;
  model?: string;
}

/**
 * Open the facing text of `field` of `nodeId`: on an existing translation
 * (`tid`), or to make a new one (`tid` null; `lang` proposes the language).
 * Returns the dialog element (the probes read it).
 */
export function openFacingText(ui: TranslationUi, nodeId: string, field: string, tid: string | null,
                               opts: { lang?: string } = {}): HTMLElement | null {
  const store = ui.store();
  const node = store?.node(nodeId);
  if (!store || !node) return null;
  document.querySelector(".ff-veil")?.remove();
  const before = document.activeElement as HTMLElement | null;

  const existing = tid ? store.node(tid) : undefined;
  const first = (): Draft => {
    if (existing) {
      const d = dataOf(existing);
      return { lang: String(d.lang ?? ""), text: String(d.text ?? ""), method: (d.method as TranslationMethod) ?? "manual",
               edition: editionOf(store.doc, existing)?.id ?? "", review: d.review_requested === true };
    }
    const o = originalLanguage(store.doc, node).lang;
    const lang = opts.lang ?? [ui.displayLang(), ui.locale(), "en", "it"].find((l) => l && !sameLanguage(l, o)) ?? "";
    return { lang, text: "", method: "manual", edition: "", review: false };
  };
  let draft = first();
  let current = existing;

  const veil = el("div", "ff-veil");
  const card = el("div", "ff-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", t("tr.facing"));
  card.tabIndex = -1;
  veil.appendChild(card);
  document.body.appendChild(veil);

  const close = (): void => {
    veil.remove();
    document.removeEventListener("keydown", onKey, true);
    before?.focus?.();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
  };
  document.addEventListener("keydown", onKey, true);
  veil.addEventListener("pointerdown", (e) => { if (e.target === veil) close(); });

  const render = (): void => {
    const st = ui.store();
    const n = st?.node(nodeId);
    if (!st || !n) { close(); return; }
    current = tid ? st.node(tid) : undefined;
    const doc = st.doc;
    const o = originalLanguage(doc, n);
    const reasons = current ? needsReview(doc, current.id) : [];
    const state = current ? translationState(doc, current) : null;
    card.textContent = "";

    const h = el("h3", undefined, `${String(n.name ?? nodeId)} · ${t("tr.facing")}`);
    card.appendChild(h);
    card.appendChild(el("div", "ff-what", t("tr.facingWhat")));

    const cols = el("div", "ff-cols");
    // the original, read only
    const left = el("div", "ff-col");
    const lh = el("div", "ff-hd");
    lh.appendChild(el("b", undefined, t("tr.colOriginal")));
    const origSel = languageSelect(ui, o.from === "node" ? o.lang : null,
      { none: o.from === "study" ? `${o.lang} · ${t("tr.fromStudy")}` : t("tr.noLang"), aria: t("tr.origLangAria") });
    origSel.dataset.ffOrig = "1";
    if (current) { origSel.disabled = true; origSel.title = t("tr.origLockedTitle"); }
    origSel.addEventListener("change", () => {
      const v = readLanguage(origSel);
      if (v === null) { render(); return; }
      declareNodeLanguage(st, nodeId, v || null);
      ui.done(v ? t("tr.langDeclared", { n: String(n.name ?? nodeId), lang: langLabel(ui, v) })
                : t("tr.langWithdrawn", { n: String(n.name ?? nodeId) }), [nodeId]);
      if (draft.lang && v && sameLanguage(draft.lang, v)) draft.lang = "";
      render();
    });
    lh.appendChild(origSel);
    left.appendChild(lh);
    const origText = fieldText(n, field) ?? "";
    if (state === "stale" && current) {
      // the original that was translated, and the one of today
      const old = ui.pastValues(nodeId, field).find((v) => textDigest(v) === dataOf(current).source_digest);
      left.appendChild(el("div", "ff-label", t("tr.staleOld")));
      const ob = el("div", "ff-text old", old ?? t("tr.staleOldGone", { d: String(dataOf(current).source_digest ?? "").slice(0, 19) + "…" }));
      ob.dataset.ffOld = old ? "1" : "0";
      if (o.lang) ob.lang = o.lang;
      left.appendChild(ob);
      left.appendChild(el("div", "ff-label", t("tr.staleNew")));
    }
    const ot = el("div", "ff-text", origText);
    ot.dataset.ffOriginal = "1";
    if (o.lang) ot.lang = o.lang;
    left.appendChild(ot);
    cols.appendChild(left);

    // the translation
    const right = el("div", "ff-col");
    const rh = el("div", "ff-hd");
    rh.appendChild(el("b", undefined, t("tr.colTranslation")));
    const langSel = languageSelect(ui, draft.lang || null, { exclude: o.lang, none: "—", aria: t("tr.transLangAria") });
    langSel.dataset.ffLang = "1";
    if (current) { langSel.disabled = true; langSel.title = t("tr.langLockedTitle"); }
    langSel.addEventListener("change", () => {
      const v = readLanguage(langSel);
      if (v !== null) draft.lang = v;
      render();
    });
    rh.appendChild(langSel);
    if (state) {
      const badge = el("span", `ff-badge st-${state}`, `${STATE_ICON[state]} ${stateLabel(state)}`.trim());
      badge.dataset.ffState = state;
      rh.appendChild(badge);
    }
    right.appendChild(rh);
    const ta = el("textarea", "ff-input");
    ta.dataset.ffText = "1";
    ta.placeholder = t("tr.writeHere");
    ta.value = draft.text;
    if (draft.lang) ta.lang = draft.lang;
    ta.addEventListener("input", () => { draft.text = ta.value; });
    right.appendChild(ta);
    cols.appendChild(right);
    card.appendChild(cols);

    // the method
    const meth = el("div", "ff-row ff-method");
    meth.appendChild(el("span", "ff-k", t("tr.method")));
    const seg = el("div", "seg");
    seg.setAttribute("role", "group");
    for (const m of ["manual", "edition", "ai"] as const) {
      const b = el("button", undefined, methodLabel(m));
      b.type = "button";
      b.dataset.ffMethod = m;
      b.setAttribute("aria-pressed", String(draft.method === m));
      if (current) b.disabled = draft.method !== m;
      b.addEventListener("click", () => { draft.method = m; if (m === "ai") draft.review = true; render(); });
      seg.appendChild(b);
    }
    meth.appendChild(seg);
    if (draft.method === "edition") {
      const eds = doc.graph.nodes.filter((x) => x.node_type === "document" && x.id !== nodeId && !dataOf(x).removed);
      if (!eds.length) meth.appendChild(el("span", "ff-d", t("tr.noEditions")));
      else {
        const es = el("select", "ff-edition");
        es.dataset.ffEdition = "1";
        es.setAttribute("aria-label", t("tr.edition"));
        es.disabled = !!current;
        const p = el("option", undefined, t("tr.editionPick"));
        p.value = "";
        es.appendChild(p);
        for (const d of eds) {
          const op = el("option", undefined, `${String(d.name ?? d.id)}${d.description ? ` — ${String(d.description).slice(0, 60)}` : ""}`);
          op.value = d.id;
          if (d.id === draft.edition) op.selected = true;
          es.appendChild(op);
        }
        es.addEventListener("change", () => { draft.edition = es.value; });
        meth.appendChild(es);
      }
    }
    if (draft.method === "ai") {
      const ask = el("button", "ghost", t("tr.aiPropose"));
      ask.type = "button";
      ask.dataset.ffAi = "1";
      ask.disabled = !o.lang || !draft.lang;
      ask.title = !o.lang ? t("tr.err.no-source-lang") : "";
      ask.addEventListener("click", () => { void proposeWithAi(ask); });
      meth.appendChild(ask);
    }
    card.appendChild(meth);

    // review, translator, verification
    const who = el("div", "ff-row ff-who");
    const lab = el("label", "ff-check");
    const cb = el("input");
    cb.type = "checkbox";
    cb.dataset.ffReview = "1";
    cb.checked = draft.method === "ai" || draft.review;
    cb.disabled = draft.method === "ai";
    lab.title = t(draft.method === "ai" ? "tr.askReviewAi" : "tr.askReviewTitle");
    cb.addEventListener("change", () => { draft.review = cb.checked; });
    lab.append(cb, document.createTextNode(` ${t("tr.askReview")}`));
    who.appendChild(lab);
    const me = ui.me();
    const tl = el("span", "ff-translator");
    tl.dataset.ffTranslator = me ? me.orcid : "";
    const names = current ? translatorsOf(doc, current).filter((a) => a.node_type === "author").map((a) => String(a.name ?? a.id)) : [];
    tl.appendChild(document.createTextNode(`${t("tr.translator")}: `));
    if (names.length) tl.appendChild(el("b", undefined, names.join(", ")));
    else if (me) tl.appendChild(el("b", undefined, `${me.label} (${me.orcid})`));
    else {
      const idb = el("button", "link", t("tr.whoAreYou"));
      idb.type = "button";
      idb.dataset.ffIdentity = "1";
      idb.addEventListener("click", () => ui.openIdentity(() => render()));
      tl.appendChild(idb);
    }
    if (current && dataOf(current).created_at) tl.appendChild(document.createTextNode(` · ${String(dataOf(current).created_at).slice(0, 10)}`));
    who.appendChild(tl);
    if (current && dataOf(current).validated_by) {
      const vb = st.node(String(dataOf(current).validated_by));
      const orcid = String(dataOf(vb).orcid ?? "");
      const v = el("span", "ff-verified", t("tr.verifiedBy", { who: `${String(vb?.name ?? "")}${orcid ? ` (${orcid})` : ""}`,
                                                              at: String(dataOf(current).validated_at ?? "").slice(0, 16).replace("T", " ") }));
      v.dataset.ffVerified = orcid;
      who.appendChild(v);
    }
    card.appendChild(who);
    if (state === "stale") card.appendChild(el("div", "ff-stale", t("tr.staleWhy")));
    else if (current && draft.method === "ai" && reasons.includes("ai")) card.appendChild(el("div", "ff-d", t("tr.aiWaits")));

    // the acts
    const acts = el("div", "ff-acts");
    if (current && reasons.some((r) => r === "ai" || r === "review_requested")) {
      const vb = el("button", "ghost", t("tr.verifySign"));
      vb.type = "button";
      vb.dataset.ffVerify = "1";
      vb.addEventListener("click", () => {
        if (!ui.me()) { ui.openIdentity(() => render()); return; }
        ui.verify([current!.id]);
        render();
      });
      acts.appendChild(vb);
    }
    const cl = el("button", "ghost", t("tr.close"));
    cl.type = "button";
    cl.dataset.ffClose = "1";
    cl.addEventListener("click", close);
    acts.appendChild(cl);
    const save = el("button", "primary", current ? (state === "stale" ? t("tr.realign") : t("tr.saveChanges")) : t("tr.add"));
    save.type = "button";
    save.dataset.ffSave = "1";
    save.addEventListener("click", () => saveDraft());
    acts.appendChild(save);
    card.appendChild(acts);
    card.focus();
  };

  const proposeWithAi = async (btn: HTMLButtonElement): Promise<void> => {
    const st = ui.store();
    const n = st?.node(nodeId);
    if (!st || !n) return;
    if (!(await ui.aiReady())) { ui.askAiThen(() => openFacingText(ui, nodeId, field, tid, { lang: draft.lang })); close(); return; }
    const o = originalLanguage(st.doc, n).lang;
    if (!o || !draft.lang) return;
    btn.disabled = true;
    btn.textContent = t("tr.aiAsking");
    const r = await ui.proposeAi(fieldText(n, field) ?? "", o, draft.lang);
    if (!veil.isConnected) return;
    if (!r.ok) { window.alert(t("tr.aiFailed", { why: r.why })); render(); return; }
    draft = { ...draft, text: r.text, method: "ai", review: true, provider: r.provider, model: r.model };
    render();
  };

  const saveDraft = (): void => {
    const st = ui.store();
    if (!st) return;
    const me = ui.me();
    // the translator IS the active identity: without one, the identity — and
    // nothing saved anonymous
    if (!me) { ui.openIdentity(() => render()); return; }
    const n = st.node(nodeId);
    try {
      if (current) {
        const wasStale = translationState(st.doc, current) === "stale";
        st.batch(() => {
          const author = ui.authorFor(st, me);
          updateTranslation(st, current!.id, draft.text, { review: draft.method === "ai" ? undefined : draft.review, by: author });
        });
        ui.done(t(wasStale ? "tr.realigned" : "tr.updated", { n: String(n?.name ?? nodeId), lang: draft.lang }), [nodeId, current.id]);
      } else {
        if (!draft.lang) throw new TranslationError("lang", "no language");
        // asked BEFORE the batch: a refusal must not leave the translator's
        // AuthorNode behind
        checkTranslation(st.doc, nodeId, field, draft.lang, draft.text, {
          method: draft.method, edition: draft.method === "edition" ? draft.edition || undefined : undefined });
        let made = "";
        st.batch(() => {
          const author = ui.authorFor(st, me);
          const ai = draft.method === "ai" ? ui.aiAuthorFor(st, draft.provider ?? "", draft.model ?? "") : undefined;
          made = addTranslation(st, nodeId, field, draft.lang, draft.text, {
            by: author, method: draft.method, edition: draft.method === "edition" ? draft.edition || undefined : undefined,
            review: draft.method === "ai" ? false : draft.review, ai, model: draft.model || undefined,
          }, markAiAssisted);
        });
        tid = made;
        ui.done(t("tr.saved", { n: String(n?.name ?? nodeId), lang: draft.lang }), [nodeId, made]);
      }
      draft = first();
      render();
    } catch (e) {
      // a refusal inside the batch: the batch threw before writing anything
      // the store keeps; the reason is said in the interface's words
      const code = e instanceof TranslationError ? e.code : "";
      window.alert(code ? t(`tr.err.${code}`) : String(e));
    }
  };

  render();
  return veil;
}

/** The node a translation belongs to — for a caller that only has the id. */
export function openFacingForTranslation(ui: TranslationUi, tid: string): HTMLElement | null {
  const st = ui.store();
  const tnode = st?.node(tid);
  if (!st || !tnode) return null;
  const of = originalOf(st.doc, tnode);
  if (!of) return null;
  return openFacingText(ui, of.id, String(dataOf(tnode).field ?? "description"), tid);
}
