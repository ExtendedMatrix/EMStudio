/**
 * MICRO-PL09-ESTENSIONI-IN-EMSTUDIO (W6, E.D. 18 Nov 2026) · the window
 * «Estensioni» (Strumenti ▸ Estensioni…, beside «Colori…» and «Vocabolari…»).
 *
 * One window for the two kinds (SPEC-pacchetto §15.2, W2-6): community packages
 * («Pacchetto di comunità» in the interface, «EM Profile» in the specification,
 * D-4), plugins, and the mixed package that carries both (§16). A filter as in
 * Blender: Tutte · Pacchetti di comunità · Plugin. For each: kind, version(s),
 * source (phase 1: «da disco»), licences, requirements, state — and for the code
 * «da disco, non verificato» (W15a), its permissions with their reason (D-14),
 * whether it is active.
 *
 * Installing (SPEC §16.6, W3-6): the archive is PREVIEWED first (nothing
 * written), then one confirmation with two panels — «Dati» (vocabularies with
 * licence and tier, what the package adds, «Nessun codice: si legge in ogni
 * strumento») and «Codice» (NOT VERIFIED, from disk, its permissions and why,
 * what it can do, where it appears, «Un plugin Python ha i poteri del tuo utente
 * sulla macchina») — and three answers for a mixed package: «Installa tutto»,
 * «Solo i dati» (D-18), «Annulla». The answer to the trust question is the
 * choice made there; the library never asks (`extensions.install(trust=…)`).
 *
 * Removing (§16.5): «Rimuovi il codice», «Rimuovi i dati», «Rimuovi il
 * pacchetto» — what each does is said before (`removal_plan`): the code that
 * goes with the data, who requires them, and the vocabularies nobody else
 * carries, which STAY unless the unticked box says otherwise (D-19).
 *
 * MICRO-PL18 (W15a, FIDUCIA DA DISCO) · the question is asked for the CODE
 * only, and again only when its permissions, capabilities or source changed
 * since the last trust (SPEC-plugin §17.3): an update that keeps them shows
 * «codice aggiornato 0.1.0 → 0.2.0 · nessuna nuova domanda» instead of the
 * question. With «Funzioni sperimentali» on, a section «Cartella di sviluppo»
 * (`plugins_dev_dir`): the folder of this machine whose plugins load where they
 * are — never installed, never asked, marked «sviluppo, non verificato» — and
 * «Ricarica» for one whose files changed.
 *
 * Nothing here knows `main.ts`: the host gives the dialogs, the file pickers, the
 * words. Every installation is the library's (W21); the window has none of its own.
 */
import type { DevInfo } from "./plugin-commands";
import {
  formsOf, labelIn, licenceText, nameOfIri, passesFilter, problemText, rowKind, rowState, schemesOf,
  type ExtArchive, type ExtFilter, type ExtPreview, type ExtProblem, type ExtRemovalPlan, type ExtRow, type ExtensionsState,
} from "./extensions-state";

export interface ExtWindowHost {
  t(key: string, vars?: Record<string, string>): string;
  lang(): string;
  toast(msg: string): void;
  log(msg: string): void;
  /** the page's dialog: a body of ours, OK, more answers (`choices`), danger */
  dialog(o: { title: string; body: HTMLElement; ok: string | null; kind: string; danger?: boolean;
              choices?: Array<{ key: string; label: string; title?: string }>; cancel?: string }): Promise<{ ok: boolean; choice?: string }>;
  /** an archive chosen by the person: a zip (or, on the desktop, a folder) */
  pickArchive(doc: Document, folder: boolean): Promise<ExtArchive | null>;
  /** the desktop can choose a folder (the browser only files) */
  canPickFolder(): boolean;
  /** the open file's name (null: none) */
  fileName(): string | null;
  /** the window «Vocabolari» (where the vocabularies a package brought live) */
  openVocabularies(): void;
  /** the machine's extensions changed: the overlay of the document again */
  afterChange(): void;
  /** a package's colour scheme taken into the open file (MICRO-T: one step) */
  importScheme?(name: string, emc: unknown): void;
  /** the forms of the packages added to the sheets (their ids) */
  formsAdded?(): ReadonlySet<string>;
  /** MICRO-PL18 (W15a) · the plugins' development folder; absent or null with «Funzioni sperimentali» off */
  dev?(): ExtDevHost | null;
}

/** MICRO-PL18 · what the section «Cartella di sviluppo» needs from the page */
export interface ExtDevHost {
  /** the bridge knows the development folder (null: not asked yet, or an old bridge) */
  info: DevInfo | null;
  /** why the folder cannot be used here (an old bridge, no secret): null when it can */
  why: string | null;
  /** the plugins of the folder as the bridge loaded them */
  loaded: Array<{ id: string; version: string; state: string; problems: Array<{ code: string; en: string; it: string }>;
    notes?: Array<{ code: string; en: string; it: string }> }>;
  /** set the folder (null clears); the error's words, or null */
  setDir(path: string | null): Promise<string | null>;
  /** the desktop's folder picker (absent on the web: the path is typed) */
  pickDir?(): Promise<string | null>;
  /** read a plugin of the folder again; the error's words, or null */
  reload(id: string): Promise<string | null>;
}

/** the filter of the list, kept while the page lives */
let filter: ExtFilter = "all";
export function extensionsFilter(): ExtFilter { return filter; }
export function setExtensionsFilter(f: ExtFilter): void { filter = f; }

type El = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => HTMLElementTagNameMap[K];
function maker(doc: Document): El {
  return (tag, cls, text) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
}

/** The window's content, rebuilt whole on every change (a few rows). */
export function extensionsContent(doc: Document, host: ExtWindowHost, state: ExtensionsState, repaint: () => void): HTMLElement {
  const t = host.t, lang = host.lang();
  const el = maker(doc);
  const btn = (label: string, key: string, fn: () => void, title?: string, cls = ""): HTMLButtonElement => {
    const b = el("button", cls, label);
    b.type = "button";
    b.dataset.ext = key;
    if (title) b.title = title;
    b.onclick = fn;
    return b;
  };
  const box = el("div", "cw-body ext-body");
  box.dataset.extWindow = "1";
  // ── install from disk ──
  const fromNode = state.from === "node";
  if (fromNode) {
    const p = el("p", "cw-hint", t("ext.fromNode"));
    p.dataset.extFromNode = "1";
    box.appendChild(p);
  } else {
    const top = el("div", "cw-row ext-top");
    top.append(btn(t("ext.installZip"), "install-zip", () => void installFlow(doc, host, state, false, repaint), t("ext.installZipHint")));
    if (host.canPickFolder())
      top.append(" ", btn(t("ext.installFolder"), "install-folder", () => void installFlow(doc, host, state, true, repaint), t("ext.installFolderHint")));
    box.appendChild(top);
    box.appendChild(el("p", "cw-hint", t("ext.phase1")));
  }
  if (state.unavailable) {
    const p = el("p", "cw-warn", t("ext.noBridge"));
    p.dataset.extNoBridge = "1";
    box.appendChild(p);
    return box;
  }
  if (state.error && !state.rows) box.appendChild(el("p", "cw-warn", state.error));
  // ── the file's packages that are not here ──
  if (state.missing.length) {
    const miss = el("div", "ext-missing");
    miss.dataset.extMissing = String(state.missing.length);
    miss.appendChild(el("div", "ext-missing-h", t("ext.missingHead", { f: host.fileName() ?? "—" })));
    for (const m of state.missing) {
      const r = el("div", "ext-missing-row");
      r.dataset.extMissingIri = m.iri;
      r.append(el("b", "", nameOfIri(m.iri)), ` ${m.version || ""}`);
      r.title = m.iri;
      miss.appendChild(r);
    }
    miss.appendChild(el("p", "cw-hint", t("ext.missingHint")));
    box.appendChild(miss);
  }
  // ── the filter ──
  const seg = el("div", "col-modes cw-modes ext-filter");
  for (const f of ["all", "packages", "plugins"] as const) {
    const b = el("button", "", t(`ext.filter.${f}`));
    b.type = "button";
    b.dataset.extFilter = f;
    b.setAttribute("aria-pressed", String(filter === f));
    b.onclick = () => { filter = f; repaint(); };
    seg.appendChild(b);
  }
  box.appendChild(seg);
  // ── the list ──
  const rows = (state.rows ?? []).filter((r) => passesFilter(r, filter));
  const list = el("div", "ext-list");
  list.dataset.extList = String(rows.length);
  if (!state.rows) list.appendChild(el("p", "cw-hint", t("ext.loading")));
  else if (!rows.length) list.appendChild(el("p", "cw-hint", t(state.rows.length ? "ext.noneOfKind" : "ext.none")));
  const used = new Set((state.overlay?.profiles ?? []).filter((p) => p.declared).map((p) => p.name));
  for (const r of rows) list.appendChild(rowEl(r, used.has(r.data?.name ?? r.id)));
  box.appendChild(list);
  const dev = host.dev?.() ?? null;
  if (dev && !fromNode) box.appendChild(devSection(dev));
  if (state.dirs.extensions) {
    const d = el("p", "cw-hint ext-dirs", t("ext.dirs", { p: state.dirs.profiles ?? "", c: state.dirs.plugins ?? "" }));
    d.title = Object.entries(state.dirs).map(([k, v]) => `${k}: ${v}`).join("\n");
    box.appendChild(d);
  }
  return box;

  function rowEl(r: ExtRow, usedHere: boolean): HTMLElement {
    const kind = rowKind(r);
    const row = el("div", "ext-row");
    row.dataset.extId = r.id;
    row.dataset.extKind = kind;
    const head = el("div", "ext-row-h");
    const name = labelIn(r.name as Record<string, string> | string | undefined, lang) || r.id;
    head.append(el("b", "ext-name", name), " ", el("span", `ext-kind ext-kind-${kind}`, t(`ext.kind.${kind}`)));
    if (usedHere) { const u = el("span", "ext-used", t("ext.usedHere")); u.dataset.extUsed = "1"; head.append(" ", u); }
    row.appendChild(head);
    const facts = [r.id, r.version ? `v${r.version}` : "", t(`ext.source.${r.source === "profiles" ? "profiles" : "disk"}`),
      licenceText(r.license)].filter(Boolean).join(" · ");
    row.appendChild(el("div", "ext-facts", facts));
    // the state in words
    const st = rowState(r);
    // the library's sentence when there is one («codice non installato: scelta
    // dell'utente (solo i dati)»), else the state in a word
    const stEl = el("div", `ext-state ext-${st.key.split(".").pop()}`, st.problem ? problemText(st.problem, lang) : t(st.key));
    stEl.dataset.extState = st.key.split(".").pop()!;
    row.appendChild(stEl);
    for (const p of r.requires_optional ?? []) row.appendChild(el("div", "cw-hint", problemText(p, lang)));
    // the data
    if (r.data && r.data.status === "installed") {
      const d = el("div", "ext-part ext-data");
      d.dataset.extPart = "data";
      const vers = (r.data.versions ?? [r.data.version]).filter(Boolean).join(" · ");
      d.append(el("span", "ext-part-h", t("ext.data")), ` ${t("ext.versions", { v: vers })}`);
      const voc = r.data.carried_vocabularies ?? [];
      if (voc.length) {
        const v = el("div", "cw-hint", tn("ext.vocabCarried", voc.length));
        v.title = voc.map((x) => `${x.scheme} ${x.version}`).join("\n");
        const go = btn(t("ext.openVocab"), "open-vocab", () => host.openVocabularies(), undefined, "cw-mini");
        v.append(" ", go);
        d.appendChild(v);
      }
      // what the package brings that the page reads: its colour schemes, its sheets
      const iri = r.data.iri;
      for (const sc of schemesOf(state.overlay, lang).filter((x) => x.profile === iri)) {
        const line = el("div", "cw-hint ext-scheme");
        line.dataset.extScheme = sc.id;
        line.append(t("ext.scheme", { s: sc.name, p: sc.property }), " ");
        if (sc.emc && host.importScheme && host.fileName())
          line.append(btn(t("ext.schemeImport"), "scheme-import", () => host.importScheme!(sc.name, sc.emc), t("ext.schemeImportHint"), "cw-mini"));
        else if (!sc.emc) line.append(el("span", "cw-warn", t("ext.schemeBad")));
        d.appendChild(line);
      }
      const added = host.formsAdded?.() ?? new Set<string>();
      for (const f of formsOf(state.overlay, lang).filter((x) => x.profile === iri)) {
        const line = f.def
          ? el("div", "cw-hint ext-form", t(added.has(f.def.header.id) ? "ext.formAdded" : "ext.formReady", { s: f.name })
              + " · " + t("ext.formVerified", { d: String(f.def.header.digest ?? "").slice(7, 19) }))
          : el("div", "cw-warn ext-form", t("ext.formRefused", { s: f.name, why: f.problems.map((p) =>
              p.code === "form_unverified" ? t("ext.formUnverified") : problemText(p, lang)).join(" · ") }));
        line.dataset.extForm = f.def ? "added" : (f.problems[0]?.code ?? "refused");
        d.appendChild(line);
      }
      row.appendChild(d);
    }
    // the code
    const code = r.code;
    if (code && code.status !== "absent") {
      const c = el("div", "ext-part ext-code");
      c.dataset.extPart = "code";
      c.dataset.extCode = code.status;
      c.append(el("span", "ext-part-h", t("ext.code")), " ");
      if (code.status === "installed") {
        c.append(`${t("ext.versions", { v: (code.versions ?? [code.version]).filter(Boolean).join(" · ") })} · `,
          el("span", "ext-unverified", t("ext.unverified")), ` · ${t(code.active ? "ext.active" : "ext.inactive")}`);
      } else c.append(el("span", "cw-hint", t("ext.codeNotHere")));
      const perms = Object.entries(code.permissions ?? {});
      if (perms.length) {
        const ul = el("ul", "ext-perms");
        for (const [k, why] of perms) { const li = el("li", "", `${k} — «${why}»`); li.dataset.extPerm = k; ul.appendChild(li); }
        c.appendChild(ul);
      }
      row.appendChild(c);
    }
    // the actions (none on the node's list: its packages are the administrator's)
    if (fromNode) return row;
    const acts = el("div", "cw-row ext-acts");
    if (code?.status === "installed") {
      acts.append(code.active
        ? btn(t("ext.disable"), "disable", () => void act(state.disable(r.id), t("ext.disabled", { id: r.id })))
        : btn(t("ext.enable"), "enable", () => void act(state.enable(r.id), t("ext.enabled", { id: r.id }))), " ");
    }
    if (code && (code.status === "not_installed" || code.pending))
      acts.append(btn(t("ext.installCode"), "install-code", () => void installCodeFlow(doc, host, state, r, repaint), t("ext.installCodeHint")), " ");
    if (code?.status === "installed" && r.data?.status === "installed")
      acts.append(btn(t("ext.removeCode"), "remove-code", () => void removeFlow(doc, host, state, r, "code", repaint)), " ");
    if (r.data?.status === "installed" && code?.status !== "absent" && r.registered !== false)
      acts.append(btn(t("ext.removeData"), "remove-data", () => void removeFlow(doc, host, state, r, "data", repaint)), " ");
    if (r.registered !== false)
      acts.append(btn(t("ext.removeAll"), "remove-all", () => void removeFlow(doc, host, state, r, "all", repaint), undefined, "danger"));
    else acts.append(el("span", "cw-hint", t("ext.notRegistered")));
    row.appendChild(acts);
    return row;
  }

  async function act(p: Promise<{ ok: true } | { ok: false; error: string; problems: ExtProblem[] }>, done: string): Promise<void> {
    const r = await p;
    if (!r.ok) { host.toast(failText(r, lang)); return; }
    host.toast(done);
    host.log(done);
    await state.refresh();
    host.afterChange();
  }

  function tn(key: string, n: number): string { return t(`${key}.${n === 1 ? "one" : "other"}`, { n: String(n) }); }

  /** MICRO-PL18 (W15a) · «Cartella di sviluppo» — only with «Funzioni sperimentali» */
  function devSection(dev: ExtDevHost): HTMLElement {
    const sec = el("div", "ext-dev");
    sec.dataset.extDev = "1";
    const h = el("div", "ext-missing-h", t("ext.devHead"));
    h.append(" ", el("span", "ext-unverified", t("ext.devMark")));
    sec.appendChild(h);
    sec.appendChild(el("p", "cw-hint", t("ext.devHint")));
    if (dev.why) { const w = el("p", "cw-warn", dev.why); w.dataset.extDevWhy = "1"; sec.appendChild(w); return sec; }
    const info = dev.info;
    const say = (err: string | null, ok: string): void => {
      if (err) { host.toast(err); return; }
      host.toast(ok);
      host.log(ok);
      repaint();
    };
    const row = el("div", "cw-row ext-dev-dir");
    const input = el("input", "ext-dev-input");
    input.type = "text";
    input.value = info?.setting ?? "";
    input.placeholder = t("ext.devPlaceholder");
    input.dataset.extDevInput = "1";
    input.disabled = !!info?.env;
    row.append(input, " ");
    if (!info?.env) {
      row.append(btn(t("ext.devUse"), "dev-use", () => {
        const v = input.value.trim();
        void dev.setDir(v || null).then((e) => say(e, v ? t("ext.devSet", { p: v }) : t("ext.devCleared")));
      }), " ");
      if (dev.pickDir) row.append(btn(t("ext.devPick"), "dev-pick", () => {
        void dev.pickDir!().then((p) => { if (p) void dev.setDir(p).then((e) => say(e, t("ext.devSet", { p }))); });
      }), " ");
      if (info?.setting) row.append(btn(t("ext.devClear"), "dev-clear", () => void dev.setDir(null).then((e) => say(e, t("ext.devCleared")))));
    }
    sec.appendChild(row);
    if (info?.env) sec.appendChild(el("p", "cw-hint", t("ext.devEnv")));
    if (info?.setting && !info.exists) {
      const w = el("p", "cw-warn", t("ext.devMissing", { p: info.setting }));
      w.dataset.extDevMissing = "1";
      sec.appendChild(w);
    }
    const listed = info?.plugins ?? [];
    if (info?.exists && !listed.length) sec.appendChild(el("p", "cw-hint", t("ext.devNone")));
    for (const p of listed) {
      const got = dev.loaded.find((x) => x.id === p.id);
      const r = el("div", "ext-row ext-dev-row");
      r.dataset.extDevId = p.id;
      r.dataset.extDevState = got?.state ?? "absent";
      const head = el("div", "ext-row-h");
      head.append(el("b", "ext-name", p.id), ` ${p.version ? `v${p.version}` : ""} · `, el("span", "ext-unverified", t("ext.devMark")));
      r.appendChild(head);
      r.appendChild(el("div", "ext-facts", p.dev_folder));
      const st = got?.state ?? "absent";
      const stEl = el("div", `ext-state ext-${st === "loaded" ? "ready" : "incomplete"}`, t(`ext.devState.${st}`));
      r.appendChild(stEl);
      const lng = lang.startsWith("it") ? "it" : "en";
      for (const pr of (got?.problems ?? p.problems ?? [])) r.appendChild(el("p", "cw-warn", pr[lng]));
      for (const n of (got?.notes ?? p.warnings ?? [])) r.appendChild(el("p", "cw-hint", n[lng]));
      if (got) {
        const acts = el("div", "cw-row ext-acts");
        acts.appendChild(btn(t("ext.devReload"), "dev-reload", () => void dev.reload(p.id).then((e) => say(e, t("ext.devReloaded", { id: p.id }))), t("ext.devReloadHint")));
        r.appendChild(acts);
      }
      sec.appendChild(r);
    }
    return sec;
  }
}

function failText(r: { error: string; problems: ExtProblem[] }, lang: string): string {
  return r.problems.length ? r.problems.map((p) => problemText(p, lang)).join(" · ") : r.error;
}

// ── installing: preview, the two panels, the three answers ─────────────────

/** the confirmation's body: the head, then «Dati» and «Codice» one over the other */
export function confirmBody(doc: Document, host: Pick<ExtWindowHost, "t" | "lang">, pv: ExtPreview): HTMLElement {
  const t = host.t, lang = host.lang();
  const el = maker(doc);
  const body = el("div", "ext-confirm");
  body.dataset.extConfirm = pv.kind ?? "";
  const head = el("div", "ext-confirm-h");
  head.append(el("b", "", `${pv.name ?? pv.id} ${pv.version ?? ""}`), ` — ${t("ext.fromDisk")}`);
  body.appendChild(head);
  const sub = [pv.tagline, pv.maintainer ? t("ext.maintainer", { m: pv.maintainer }) : "", licenceText(pv.license)].filter(Boolean).join(" · ");
  if (sub) body.appendChild(el("div", "cw-hint", sub));
  for (const e of pv.errors ?? []) { const p = el("p", "cw-warn", problemText(e, lang)); p.dataset.extError = e.code; body.appendChild(p); }
  for (const w of pv.warnings ?? []) body.appendChild(el("p", "cw-hint", problemText(w, lang)));
  // ── Dati ──
  const d = pv.data;
  if (d?.present) {
    const box = el("div", "ext-panel ext-panel-data");
    box.dataset.extPanel = "data";
    box.appendChild(el("div", "ext-panel-h", t("ext.panelData", { v: d.version ?? "" })));
    const s = d.summary ?? {};
    const voc = s.vocabularies ?? [];
    if (voc.length) {
      const ul = el("ul", "ext-voc");
      for (const v of voc) {
        const li = el("li", "", t("ext.vocabLine", { name: nameOfIri(v.scheme), v: v.version ?? "", lic: licenceText(v.license), tier: v.fascia ?? "?" }));
        li.dataset.extTier = v.fascia ?? "";
        li.title = v.scheme;
        ul.appendChild(li);
      }
      box.appendChild(ul);
    }
    const counts: string[] = [];
    const add = (n: number | undefined, key: string) => { if (n) counts.push(t(`${key}.${n === 1 ? "one" : "other"}`, { n: String(n) })); };
    add(s.qualia, "ext.cnt.qualia");
    add(s.extractors, "ext.cnt.extractors");
    add(s.landmark_sets, "ext.cnt.landmarks");
    add(s.combiners, "ext.cnt.combiners");
    add(s.forms, "ext.cnt.forms");
    add(s.color_schemes, "ext.cnt.colours");
    add(s.document_types, "ext.cnt.documents");
    add(s.file_types, "ext.cnt.files");
    if (counts.length) box.appendChild(el("div", "", counts.join(", ") + (s.primitives?.length ? ` (${s.primitives.join(", ")})` : "")));
    const parts = Object.entries(s.parts ?? {});
    if (parts.length) box.appendChild(el("div", "cw-hint", t("ext.partsLic", { p: parts.map(([k, v]) => `${k} ${v.license ?? ""}`).join(", ") })));
    if (d.update === "new_version") box.appendChild(el("div", "cw-hint", t("ext.besides")));
    if (d.update === "unchanged") box.appendChild(el("div", "cw-hint", t("ext.unchanged")));
    for (const e of d.errors ?? []) box.appendChild(el("p", "cw-warn", problemText(e, lang)));
    box.appendChild(el("div", "ext-panel-f", t("ext.noCode")));
    body.appendChild(box);
  }
  // ── Codice ──
  const c = pv.code;
  if (c?.present) {
    const box = el("div", "ext-panel ext-panel-code");
    box.dataset.extPanel = "code";
    const h = el("div", "ext-panel-h", t("ext.panelCode", { m: c.module ?? "", v: c.version ?? "" }));
    h.append(" ", el("span", "ext-unverified", t("ext.unverifiedDisk")));
    box.appendChild(h);
    // MICRO-PL18 (W15a) · asked only when it must be: the first time, or when
    // permissions, capabilities or source changed since the last trust
    const asks = c.trust_needed !== false;
    box.dataset.extTrust = asks ? "asked" : "kept";
    if (c.updated) { const u = el("div", "ext-updated", problemText(c.updated, lang)); u.dataset.extUpdated = "1"; box.appendChild(u); }
    const perms = Object.entries(c.permissions ?? {});
    box.appendChild(el("div", "", perms.length ? t("ext.permissions") : t("ext.noPermissions")));
    if (perms.length) {
      const ul = el("ul", "ext-perms");
      for (const [k, why] of perms) { const li = el("li", "", `${k} — «${why}»`); li.dataset.extPerm = k; ul.appendChild(li); }
      box.appendChild(ul);
    }
    if (c.capabilities?.length) box.appendChild(el("div", "", t("ext.can", { c: c.capabilities.map((x) => capWord(t, x)).join(", ") })));
    const where = [...new Set((c.commands ?? []).flatMap((x) => x.in ?? []))];
    if (where.length) box.appendChild(el("div", "", t("ext.appears", { w: where.map((x) => slotWord(t, x)).join(", ") })));
    if (c.trust_question) box.appendChild(el("p", "cw-warn", problemText(c.trust_question, lang)));
    if (c.module_collision) box.appendChild(el("p", "cw-warn", problemText(c.module_collision, lang)));
    for (const e of c.errors ?? []) { const p = el("p", "cw-warn", problemText(e, lang)); p.dataset.extCodeError = e.code; box.appendChild(p); }
    if (c.update === "unchanged") box.appendChild(el("div", "cw-hint", t("ext.unchanged")));
    if (asks) box.appendChild(el("div", "ext-panel-f ext-powers", t("ext.powers")));
    else { const k = el("div", "ext-panel-f ext-trust-kept", t("ext.trustKept")); k.dataset.extTrustKept = "1"; box.appendChild(k); }
    body.appendChild(box);
  }
  for (const m of pv.requires?.missing ?? []) body.appendChild(el("p", "cw-warn", problemText(m, lang)));
  for (const o of pv.requires?.optional ?? []) body.appendChild(el("p", "cw-hint", problemText(o, lang)));
  return body;
}
function capWord(t: ExtWindowHost["t"], cap: string): string {
  const k = `ext.cap.${cap}`;
  const w = t(k);
  return w === k ? cap : w;
}
function slotWord(t: ExtWindowHost["t"], slot: string): string {
  const base = slot.replace(/@\d+$/, "");
  const k = `ext.slot.${base}`;
  const w = t(k);
  return w === k ? base : w;
}

/** what the person answered: install everything, the data only, nothing */
export type InstallAnswer = "all" | "data" | null;
/** the buttons of the confirmation, by what the archive carries and can install */
export function confirmButtons(pv: ExtPreview, t: ExtWindowHost["t"]): { ok: string | null; choices: Array<{ key: string; label: string; title?: string }> } {
  const data = !!pv.data?.present && pv.data.installable !== false;
  const code = !!pv.code?.present && pv.code.installable !== false;
  if (!pv.ok && !data) return { ok: null, choices: [] };
  if (data && code) return { ok: t("ext.installAll"), choices: [{ key: "data", label: t("ext.dataOnly"), title: t("ext.dataOnlyHint") }] };
  return { ok: t("ext.install"), choices: [] };
}

async function installFlow(doc: Document, host: ExtWindowHost, state: ExtensionsState, folder: boolean, repaint: () => void): Promise<void> {
  const a = await host.pickArchive(doc, folder);
  if (!a) return;
  await installArchive(doc, host, state, a, repaint);
}

/** preview → confirmation → install (exported: the drop of an archive on the window) */
export async function installArchive(doc: Document, host: ExtWindowHost, state: ExtensionsState, a: ExtArchive, repaint: () => void): Promise<InstallAnswer> {
  const t = host.t, lang = host.lang();
  const pv = await state.preview(a);
  if (!pv.ok) { host.toast(t("ext.previewFailed", { why: failText(pv, lang) })); return null; }
  const p = pv.j.preview;
  const b = confirmButtons(p, t);
  const ans = await host.dialog({ title: t("ext.confirmTitle"), body: confirmBody(doc, host, p), ok: b.ok, choices: b.choices,
    kind: "ext-install", cancel: b.ok ? undefined : t("ext.close") });
  if (!ans.ok) return null;
  const parts: "all" | "data" = ans.choice === "data" ? "data" : "all";
  // the answer to the trust question is the button pressed: «Installa tutto»
  // (or «Installa» of a plugin) after seeing the code's panel
  const trust = parts === "all" && !!p.code?.present;
  const r = await state.install(a, parts, trust);
  if (!r.ok) { host.toast(t("ext.installFailed", { why: failText(r, lang) })); return null; }
  const row = r.j.installed;
  const name = labelIn(row.name as never, lang) || row.id;
  const msg = parts === "data" && p.code?.present ? t("ext.installedData", { n: name, v: row.version ?? "" })
    : t("ext.installed", { n: name, v: row.version ?? "" });
  host.toast(msg);
  host.log(msg);
  for (const w of row.warnings ?? []) host.log(problemText(w, lang));
  await state.refresh();
  host.afterChange();
  repaint();
  return parts;
}

async function installCodeFlow(doc: Document, host: ExtWindowHost, state: ExtensionsState, r: ExtRow, repaint: () => void): Promise<void> {
  const t = host.t, lang = host.lang();
  // the code's panel again, from the archive it came from: the same question
  const origin = r.code?.installable_from || r.origin;
  let a: ExtArchive | null = origin ? { path: origin, name: origin } : null;
  let pv = a ? await state.preview(a) : null;
  if (!pv || !pv.ok) {
    host.toast(t("ext.askArchive", { id: r.id }));
    a = await host.pickArchive(doc, false);
    if (!a) return;
    pv = await state.preview(a);
    if (!pv.ok) { host.toast(t("ext.previewFailed", { why: failText(pv, lang) })); return; }
  }
  const p = { ...pv.j.preview, data: undefined };
  const ans = await host.dialog({ title: t("ext.codeTitle"), body: confirmBody(doc, host, p as ExtPreview), ok: t("ext.installCodeOk"), kind: "ext-install-code" });
  if (!ans.ok) return;
  const res = await state.installCode(a!, true);
  if (!res.ok) { host.toast(t("ext.installFailed", { why: failText(res, lang) })); return; }
  const code = res.j.installed.code;
  const msg = code?.status === "installed" ? t("ext.codeInstalled", { id: r.id, v: code.version ?? "" })
    : `${r.id}: ${problemText(code?.reason ?? null, lang)}`;
  host.toast(msg);
  host.log(msg);
  await state.refresh();
  host.afterChange();
  repaint();
}

/** the removal's body: what goes, what stays, the unticked box of the vocabularies */
export function removalBody(doc: Document, host: Pick<ExtWindowHost, "t" | "lang">, plan: ExtRemovalPlan, part: "all" | "code" | "data"): { body: HTMLElement; purge: () => boolean } {
  const t = host.t, lang = host.lang();
  const el = maker(doc);
  const body = el("div", "ext-remove");
  body.dataset.extRemove = part;
  body.appendChild(el("p", "", t(`ext.removeWhat.${part}`, { id: plan.id })));
  if (part !== "code" && plan.data?.removes_code && plan.data.notice) body.appendChild(el("p", "cw-warn", problemText(plan.data.notice, lang)));
  if (part !== "code" && plan.data?.confirm) { const p = el("p", "cw-warn", problemText(plan.data.confirm, lang)); p.dataset.extRequiredBy = plan.data.required_by.join(","); body.appendChild(p); }
  let cb: HTMLInputElement | null = null;
  if (part !== "code" && plan.vocabularies_only_here.length) {
    body.appendChild(el("p", "", t("ext.vocabStay")));
    const lab = el("label", "ext-purge");
    cb = el("input");
    cb.type = "checkbox";
    cb.checked = false;
    cb.dataset.extPurge = "1";
    lab.append(cb, ` ${t("ext.vocabPurge", { v: plan.vocabularies_only_here.map((v) => labelIn(v.title as never, lang) || v.id).join(", ") })}`);
    body.appendChild(lab);
  }
  return { body, purge: () => !!cb?.checked };
}

async function removeFlow(doc: Document, host: ExtWindowHost, state: ExtensionsState, r: ExtRow, part: "all" | "code" | "data", repaint: () => void): Promise<void> {
  const t = host.t, lang = host.lang();
  const plan = await state.removalPlan(r.id);
  if (!plan.ok) { host.toast(failText(plan, lang)); return; }
  const { body, purge } = removalBody(doc, host, plan.j.plan, part);
  const needs = part !== "code" && !!plan.j.plan.data?.required_by.length;
  const ans = await host.dialog({ title: t(`ext.removeTitle.${part}`), body, ok: t(`ext.removeOk.${part}`), kind: `ext-remove-${part}`, danger: true });
  if (!ans.ok) return;
  const res = await state.remove(r.id, part, { confirm: needs, purge: purge() });
  if (!res.ok) { host.toast(failText(res, lang)); return; }
  const msg = t(`ext.removed.${part}`, { id: r.id });
  host.toast(msg);
  host.log(msg);
  await state.refresh();
  host.afterChange();
  repaint();
}
