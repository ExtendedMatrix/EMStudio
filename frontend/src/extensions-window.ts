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
 * MICRO-PL22 (X2, REPOSITORY-NELLA-FINESTRA) · a section «Repository», as
 * Blender's: the repositories of this machine (an `index.json` by https, a
 * `file://` URL or a folder — the lab's NAS, D-13), each with its optional access
 * token (never shown back: «token impostato») and «controlla gli aggiornamenti
 * all'avvio»; «+ Aggiungi repository…»; one switch for the machine, «Consenti
 * l'accesso in rete» (off by default; off, a `file://` repository still works);
 * what the repositories offer, with «Installa» / «Aggiorna» — the archive
 * downloaded and checked against the index's `archive_hash` by the library, the
 * same two panels plus what comes with it (the requirements installed first,
 * the offers said, a tier C vocabulary fetched or not, and why); the ids an
 * index withdrew said beside what is installed.
 *
 * MICRO-PL23 (X3, AGGIORNAMENTI) · «Versioni» on an installed row: the data
 * versions side by side (each file keeps the one it declares, W-4) and the code
 * versions on disk under every source, «Usa questa» (an older code active again,
 * no download, loaded at the next start), «Rimuovi questa versione», «Rimuovi le
 * versioni vecchie del codice»; «Aggiorna tutto» over the updates the
 * repositories offer — one that would ask the trust again is listed first and
 * waits unless the person says yes to it too; «questo file usa stat 1.0.0, c'è
 * la 1.1.0: aggiorna la dichiarazione» (a major: «Che cosa cambia…», the
 * CHANGELOG); what a repository has only for other machines, said; «Pulisci…»
 * (what nothing in the register owns); the removal's second unticked box, the
 * plugin's own saved state.
 *
 * Nothing here knows `main.ts`: the host gives the dialogs, the file pickers, the
 * words. Every installation is the library's (W21); the window has none of its own.
 */
import type { DevInfo } from "./plugin-commands";
import {
  availableRows, formsOf, labelIn, licenceText, nameOfIri, passesFilter, problemText, rowKind, rowState, schemesOf, sizeText,
  type ExtArchive, type ExtAvailable, type ExtFilter, type ExtPlan, type ExtPreview, type ExtProblem, type ExtRemovalPlan,
  type ExtRepo, type ExtRow, type ExtensionsState, type ExtNewer, type ExtVersions, type ExtUpdate, type ExtReview,
  reviewsChangeProblems, updatesNeedingTrust,
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
  /** MICRO-PL22 · a folder chosen on the desktop (a repository on a NAS); absent on the web */
  pickRepoFolder?(): Promise<string | null>;
  /** MICRO-PL22 · the bridge answers the repositories' routes (level 85): null when it does, else why not */
  reposWhy?(): string | null;
  /** MICRO-PL23 · the answer «aggiorna la dichiarazione»: the open file declares the newer version (absent: no file) */
  redeclare?(n: ExtNewer): Promise<string | null>;
  /** MICRO-PL23 · the bridge answers the updates' routes (level 86): null when it does, else why not */
  updatesWhy?(): string | null;
  /** MICRO-PL24 · the bridge takes «Fidati delle revisioni» per repository (level 87): null when it does, else why not */
  reviewsWhy?(): string | null;
}

/** MICRO-PL24 (X4) · «rivisto da X il Y» (with the repository when known): a code someone named has read */
export function reviewedMark(doc: Document, t: ExtWindowHost["t"], rv: ExtReview | null | undefined): HTMLElement {
  const el = maker(doc);
  const m = el("span", "ext-verified ext-reviewed",
    rv?.repo ? t("ext.reviewedFrom", { by: rv.by, on: rv.on, r: rv.repo }) : t("ext.reviewedBy", { by: rv?.by ?? "?", on: rv?.on ?? "?" }));
  m.dataset.extReviewed = rv?.by ?? "1";
  if (rv?.as) m.title = rv.as === "editor" ? t("ext.reviewAsEditor") : rv.as.startsWith("curator:") ? t("ext.reviewAsCurator", { p: rv.as.slice(8) }) : rv.as;
  return m;
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
/** MICRO-PL23 · the rows whose «Versioni» are open */
const openVersions = new Set<string>();
export function versionsOpen(id: string): boolean { return openVersions.has(id); }
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
  // ── MICRO-PL23 · the file's packages with a newer version here ──
  if ((state.newer ?? []).length && host.fileName()) box.appendChild(newerBlock(doc, host, state, repaint));
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
  if (!fromNode) box.appendChild(repoSection());
  const dev = host.dev?.() ?? null;
  if (dev && !fromNode) box.appendChild(devSection(dev));
  if (state.dirs.extensions) {
    const d = el("p", "cw-hint ext-dirs", t("ext.dirs", { p: state.dirs.profiles ?? "", c: state.dirs.plugins ?? "" }));
    d.title = Object.entries(state.dirs).map(([k, v]) => `${k}: ${v}`).join("\n");
    // MICRO-PL23 · what nothing in the register owns
    if (!fromNode && !host.updatesWhy?.()) d.append(" ", btn(t("ext.clean"), "clean", () => void cleanFlow(doc, host, state, repaint), t("ext.cleanHint"), "cw-mini"));
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
    const facts = [r.id, r.version ? `v${r.version}` : "", sourceWord(t, r.source),
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
    // MICRO-PL22 · an index withdrew it: said beside it, never removed on its own
    for (const b of (state.blocked ?? []).filter((x) => x.id === r.id)) {
      const w = el("div", "cw-warn ext-blocked", problemText(b.problem, lang));
      w.dataset.extBlocked = b.repo;
      row.appendChild(w);
    }
    const upd = (state.updates ?? []).find((u) => u.id === r.id);
    if (upd) {
      const u = el("div", "ext-updated", t("ext.repoUpdate", { old: upd.installed, v: upd.version, r: upd.repo }));
      u.dataset.extUpdate = upd.version;
      row.appendChild(u);
    }
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
          code.verified ? reviewedMark(doc, t, code.reviewed)
            : el("span", "ext-unverified", isRepoSource(r.source) ? t("ext.unverifiedFrom", { r: r.source! }) : t("ext.unverified")),
          ` · ${t(code.active ? "ext.active" : "ext.inactive")}`);
      } else c.append(el("span", "cw-hint", t("ext.codeNotHere")));
      if (code.status === "installed" && code.active_version && code.active_version !== code.version) {
        const w = el("div", "cw-hint ext-active-other", t("ext.activeOther", { v: code.active_version }));
        w.dataset.extActiveOther = code.active_version;
        c.appendChild(w);
      }
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
    // MICRO-PL23 · «Versioni»: the versions side by side, going back, one removed
    if (r.registered !== false && !host.updatesWhy?.()) {
      const open = openVersions.has(r.id);
      const vb = btn(t(open ? "ext.versionsHide" : "ext.versionsShow"), "versions", () => {
        if (openVersions.has(r.id)) { openVersions.delete(r.id); repaint(); return; }
        openVersions.add(r.id);
        void state.loadVersions(r.id).then(repaint);
        repaint();
      }, t("ext.versionsHint"));
      vb.setAttribute("aria-expanded", String(open));
      acts.append(vb, " ");
    }
    if (r.registered !== false)
      acts.append(btn(t("ext.removeAll"), "remove-all", () => void removeFlow(doc, host, state, r, "all", repaint), undefined, "danger"));
    else acts.append(el("span", "cw-hint", t("ext.notRegistered")));
    row.appendChild(acts);
    if (openVersions.has(r.id)) row.appendChild(versionsEl(r));
    return row;
  }

  /** MICRO-PL23 · the versions of a row, side by side */
  function versionsEl(r: ExtRow): HTMLElement {
    const box = el("div", "ext-versions");
    box.dataset.extVersions = r.id;
    const v = state.versions?.[r.id];
    if (!v) { box.appendChild(el("p", "cw-hint", t("ext.loading"))); return box; }
    if ("error" in v) { box.appendChild(el("p", "cw-warn", v.error)); return box; }
    const vs = v as ExtVersions;
    if (vs.data.length) {
      box.appendChild(el("div", "ext-part-h", t("ext.versionsData")));
      for (const d of vs.data) {
        const line = el("div", "ext-version");
        line.dataset.extVersion = `data/${d.version}`;
        line.append(el("b", "", d.version), d.newest ? ` · ${t("ext.versionNewest")}` : "",
          d.installed_at ? ` · ${d.installed_at.replace("T", " ").replace("Z", " UTC")}` : "", " ");
        if (vs.data.length > 1)
          line.append(btn(t("ext.versionRemove"), "version-remove-data", () => void versionRemoveFlow(r, "data", d.version), t("ext.versionRemoveDataHint"), "cw-mini"));
        box.appendChild(line);
      }
      if (vs.data.length > 1) box.appendChild(el("p", "cw-hint", t("ext.versionsDataHint")));
    }
    if (vs.code.length) {
      box.appendChild(el("div", "ext-part-h", t("ext.versionsCode")));
      for (const c of vs.code) {
        const line = el("div", "ext-version");
        line.dataset.extVersion = `code/${c.source}/${c.version}`;
        if (c.active) line.dataset.extVersionActive = "1";
        line.append(el("b", "", c.version), ` · ${sourceWord(t, c.source)}`, c.active ? ` · ${t("ext.versionInUse")}` : "");
        if (c.wheels_skipped?.length) {
          const w = el("span", "cw-hint", ` · ${t("ext.wheelsOther", { n: String(c.wheels_skipped.length), p: c.platform ?? "" })}`);
          w.title = c.wheels_skipped.join("\n");
          line.append(w);
        }
        line.append(" ");
        if (!c.active && !c.registered) {
          line.append(btn(t("ext.versionUse"), "version-use", () => void useFlow(r, c.version, c.source), t("ext.versionUseHint"), "cw-mini"), " ",
            btn(t("ext.versionRemove"), "version-remove-code", () => void versionRemoveFlow(r, "code", c.version, c.source), undefined, "cw-mini"));
        }
        box.appendChild(line);
      }
      if (vs.code.filter((c) => !c.active && !c.registered).length > 1)
        box.appendChild(btn(t("ext.prune"), "prune", () => void pruneFlow(r), t("ext.pruneHint"), "cw-mini"));
    }
    return box;
  }

  async function useFlow(r: ExtRow, version: string, source: string): Promise<void> {
    let res = await state.useCode(r.id, version, { source });
    if (!res.ok && res.problems.some((p) => p.code === "code_trust_required_for")) {
      const body = el("div", "ext-trust-again");
      body.append(el("p", "cw-warn", failText(res, lang)), el("p", "", t("ext.powers")));
      const ans = await host.dialog({ title: t("ext.versionUseTitle", { id: r.id, v: version }), body, ok: t("ext.versionUseTrust"), kind: "ext-use-trust", danger: true });
      if (!ans.ok) return;
      res = await state.useCode(r.id, version, { source, trust: true });
    }
    if (!res.ok) { host.toast(failText(res, lang)); return; }
    const msg = res.j.used.warnings?.[0] ? problemText(res.j.used.warnings[0], lang) : t("ext.versionUsed", { id: r.id, v: version });
    host.toast(msg);
    host.log(msg);
    await state.refresh();
    await state.loadVersions(r.id);
    host.afterChange();
    repaint();
  }

  async function versionRemoveFlow(r: ExtRow, part: "code" | "data", version: string, source?: string): Promise<void> {
    const body = el("p", "", t(part === "data" ? "ext.versionRemoveDataWhat" : "ext.versionRemoveCodeWhat", { id: r.id, v: version }));
    const ans = await host.dialog({ title: t("ext.versionRemoveTitle", { id: r.id, v: version }), body, ok: t("ext.versionRemove"),
      kind: "ext-version-remove", danger: true });
    if (!ans.ok) return;
    const res = await state.remove(r.id, part, { version, source });
    if (!res.ok) { host.toast(failText(res, lang)); return; }
    const msg = t("ext.versionRemoved", { id: r.id, v: version });
    host.toast(msg);
    host.log(msg);
    await state.refresh();
    await state.loadVersions(r.id);
    host.afterChange();
    repaint();
  }

  async function pruneFlow(r: ExtRow): Promise<void> {
    const res = await state.prune(r.id);
    if (!res.ok) { host.toast(failText(res, lang)); return; }
    const msg = t("ext.pruned", { id: r.id, v: res.j.removed.code_removed.join(", ") || "—" });
    host.toast(msg);
    host.log(msg);
    await state.refresh();
    await state.loadVersions(r.id);
    repaint();
  }

  /** MICRO-PL23 · «Aggiorna tutto»: the ones that ask the trust again listed first */
  async function updateAllFlow(): Promise<void> {
    const chk = await state.checkUpdates(false);
    if (!chk.ok) { host.toast(failText(chk, lang)); return; }
    const ups = chk.j.check.updates;
    if (!ups.length) { host.toast(t("ext.updatesNone")); return; }
    const asking = updatesNeedingTrust(ups);
    const body = updateAllBody(doc, host, ups);
    let trust: string[] = [];
    if (asking.length) {
      const ans = await host.dialog({ title: t("ext.updateAllTitle"), body, ok: t("ext.updateAllOthers"), kind: "ext-update-all",
        choices: [{ key: "all", label: t("ext.updateAllTrust"), title: t("ext.powers") }] });
      if (!ans.ok) return;
      if (ans.choice === "all") trust = asking.map((u) => u.id);
    } else {
      const ans = await host.dialog({ title: t("ext.updateAllTitle"), body, ok: t("ext.updateAll"), kind: "ext-update-all" });
      if (!ans.ok) return;
    }
    host.toast(t("ext.updating"));
    const res = await state.updateAll(trust);
    if (!res.ok) { host.toast(failText(res, lang)); return; }
    const out = res.j.result;
    const msg = t("ext.updatedAll", { n: String(out.updated.length), w: String(out.needs_trust.length), f: String(out.failed.length) });
    host.toast(msg);
    host.log(msg);
    for (const u of out.updated) host.log(t("ext.updatedOne", { id: u.id, old: u.from, v: u.to }));
    for (const u of out.needs_trust) host.log(problemText(u.problem, lang));
    for (const f of out.failed) host.log(`${f.id}: ${f.problems.map((p) => problemText(p, lang)).join(" · ")}`);
    await state.refresh();
    await state.refreshRepos();
    host.afterChange();
    repaint();
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

  /** MICRO-PL22 (X2) · «Repository»: the switch, the repositories, what they offer */
  function repoSection(): HTMLElement {
    const sec = el("div", "ext-repos");
    sec.dataset.extRepos = String(state.repos?.length ?? -1);
    sec.appendChild(el("div", "ext-missing-h", t("ext.reposHead")));
    const why = host.reposWhy?.() ?? null;
    if (why || state.repos == null) {
      const w = el("p", "cw-hint", why ?? t("ext.reposLoading"));
      w.dataset.extReposWhy = "1";
      sec.appendChild(w);
      return sec;
    }
    // the switch, one for the machine
    const on = state.online?.on ?? false;
    const lab = el("label", "ext-online");
    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = on;
    cb.dataset.extOnline = "1";
    cb.disabled = state.online?.env != null;
    cb.onchange = () => void act(state.setOnline(cb.checked).then(async (r) => { await state.refreshRepos(); return r; }),
      t(cb.checked ? "ext.onlineOn" : "ext.onlineOff"));
    lab.append(cb, ` ${t("ext.online")}`);
    sec.appendChild(lab);
    sec.appendChild(el("p", "cw-hint", state.online?.env != null ? t("ext.onlineEnv", { v: state.online.env }) : t("ext.onlineHint")));
    // the repositories
    const tools = el("div", "cw-row ext-repo-tools");
    tools.append(btn(t("ext.repoAdd"), "repo-add", () => void addRepoFlow(doc, host, state, repaint), t("ext.repoAddHint")));
    if (state.repos.length)
      tools.append(" ", btn(t("ext.repoSyncAll"), "repo-sync-all", () => void syncFlow(), t("ext.repoSyncHint")));
    // MICRO-PL23 · «Aggiorna tutto»
    if ((state.updates ?? []).length && !host.updatesWhy?.())
      tools.append(" ", btn(t("ext.updateAllN", { n: String(state.updates.length) }), "update-all", () => void updateAllFlow(), t("ext.updateAllHint")));
    sec.appendChild(tools);
    if (!state.repos.length) sec.appendChild(el("p", "cw-hint", t("ext.reposNone")));
    for (const r of state.repos) sec.appendChild(repoRow(r));
    // what they offer
    const offered = availableRows(state.available ?? [], filter);
    if (state.repos.length) {
      const h = el("div", "ext-part-h ext-avail-h", t("ext.availHead", { n: String(offered.length) }));
      sec.appendChild(h);
      if (!offered.length) sec.appendChild(el("p", "cw-hint", t((state.available ?? []).length ? "ext.noneOfKind" : "ext.availNone")));
    }
    for (const a of offered) sec.appendChild(availRow(a));
    // MICRO-PL23 · what a repository has only for other machines: said, not offered
    for (const o of state.otherPlatforms ?? []) {
      const w = el("p", "cw-hint ext-other-platform", problemText(o.problem, lang));
      w.dataset.extOtherPlatform = `${o.repo}/${o.id}`;
      sec.appendChild(w);
    }
    return sec;
  }

  function repoRow(r: ExtRepo): HTMLElement {
    const row = el("div", "ext-row ext-repo");
    row.dataset.extRepo = r.name;
    const head = el("div", "ext-row-h");
    head.append(el("b", "ext-name", r.name), " ", el("span", "ext-kind", t(r.local ? "ext.repoLocal" : "ext.repoRemote")));
    if (r.has_token) head.append(" ", el("span", "ext-kind", t("ext.repoToken")));
    if (r.official) { const o = el("span", "ext-kind ext-official", t("ext.repoOfficialMark")); o.dataset.extRepoOfficial = "1"; head.append(" ", o); }
    if (!r.enabled) head.append(" ", el("span", "cw-hint", t("ext.repoDisabled")));
    row.appendChild(head);
    const facts = el("div", "ext-facts", r.url);
    facts.title = r.url;
    row.appendChild(facts);
    const st = r.synced_at ? t("ext.repoSynced", { n: String(r.entries ?? 0), at: r.synced_at.replace("T", " ").replace("Z", " UTC") })
      : t("ext.repoNever");
    const s = el("div", "cw-hint ext-repo-state", st);
    s.dataset.extRepoSynced = r.synced_at ? "1" : "0";
    row.appendChild(s);
    const probs = state.syncProblems?.[r.name] ?? (r.error ? [r.error] : []);
    for (const p of probs) { const w = el("p", "cw-warn", problemText(p, lang)); w.dataset.extRepoProblem = p.code; row.appendChild(w); }
    // MICRO-PL24 (X4) · whether its reviews count here: on for the official index, off for any other until the person says so
    if (!host.reviewsWhy?.()) {
      const lr = el("label", "ext-startup ext-trust-reviews");
      const cr = el("input");
      cr.type = "checkbox";
      cr.checked = !!r.trust_reviews;
      cr.dataset.extRepoReviews = r.name;
      cr.title = t("ext.repoTrustReviewsHint");
      cr.onchange = () => void act(state.updateRepo(r.name, { trust_reviews: cr.checked }).then(async (x) => {
        if (x.ok) for (const p of reviewsChangeProblems(x.j.repository.reviews)) host.log(problemText(p, lang));
        await state.refreshRepos(); await state.refresh?.(); return x;
      }), t(cr.checked ? "ext.repoTrustReviewsOn" : "ext.repoTrustReviewsOff", { r: r.name }));
      lr.append(cr, ` ${t("ext.repoTrustReviews")}`);
      row.appendChild(lr);
    }
    const acts = el("div", "cw-row ext-acts");
    acts.append(btn(t("ext.repoSync"), "repo-sync", () => void syncFlow(r.name), t("ext.repoSyncHint")), " ");
    const lab = el("label", "ext-startup");
    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = r.check_on_startup;
    cb.dataset.extRepoStartup = r.name;
    cb.onchange = () => void act(state.updateRepo(r.name, { check_on_startup: cb.checked }).then(async (x) => { await state.refreshRepos(); return x; }),
      t(cb.checked ? "ext.repoStartupOn" : "ext.repoStartupOff", { r: r.name }));
    lab.append(cb, ` ${t("ext.repoStartup")}`);
    acts.append(lab, " ");
    acts.append(btn(t(r.has_token ? "ext.repoTokenChange" : "ext.repoTokenSet"), "repo-token",
      () => void tokenFlow(doc, host, state, r, repaint)), " ");
    acts.append(btn(t("ext.repoRemove"), "repo-remove", () => void removeRepoFlow(doc, host, state, r, repaint), t("ext.repoRemoveHint"), "danger"));
    row.appendChild(acts);
    return row;
  }

  function availRow(a: ExtAvailable): HTMLElement {
    const kinds = Object.keys(a.sections ?? {});
    const kind = kinds.includes("code") && kinds.includes("data") ? "mixed" : kinds.includes("code") ? "plugin" : "community-package";
    const row = el("div", "ext-row ext-avail");
    row.dataset.extAvail = `${a.repo}/${a.id}`;
    row.dataset.extKind = kind;
    const head = el("div", "ext-row-h");
    head.append(el("b", "ext-name", labelIn(a.name as never, lang) || a.id), " ", el("span", `ext-kind ext-kind-${kind}`, t(`ext.kind.${kind}`)));
    row.appendChild(head);
    if (a.tagline) row.appendChild(el("div", "cw-hint", a.tagline));
    row.appendChild(el("div", "ext-facts", [a.id, `v${a.version}`, t("ext.source.repo", { r: a.repo }), licenceText(a.license),
      sizeText(a.archive_size)].filter(Boolean).join(" · ")));
    const st = a.update ? t("ext.availUpdate", { old: a.installed ?? "", v: a.version })
      : a.installed ? t("ext.availInstalled", { v: a.installed }) : "";
    if (st) { const x = el("div", a.update ? "ext-updated" : "cw-hint", st); x.dataset.extAvailState = a.update ? "update" : "installed"; row.appendChild(x); }
    const perms = Object.entries(a.permissions ?? {});
    if (perms.length) row.appendChild(el("div", "cw-hint", t("ext.availPerms", { p: perms.map(([k]) => k).join(", ") })));
    if (a.verified && a.reviewed) { const v = el("div", "cw-hint"); v.appendChild(reviewedMark(doc, t, { ...a.reviewed, repo: a.repo })); v.dataset.extAvailReviewed = a.reviewed.by; row.appendChild(v); }
    const acts = el("div", "cw-row ext-acts");
    if (!a.installed || a.update)
      acts.append(btn(t(a.update ? "ext.repoUpdateBtn" : "ext.install"), a.update ? "repo-update" : "repo-install",
        () => void installFromRepo(doc, host, state, a.repo, a.id, a.version, repaint)));
    row.appendChild(acts);
    return row;
  }

  async function syncFlow(name?: string): Promise<void> {
    host.toast(t("ext.repoSyncing"));
    const r = await state.syncRepos(name ? { name } : {});
    if (!r.ok) { host.toast(failText(r, lang)); return; }
    const okN = r.j.sync.repositories.filter((x) => x.ok).length, all = r.j.sync.repositories.length;
    const msg = t("ext.repoSyncedMsg", { ok: String(okN), n: String(all), u: String(r.j.sync.updates.length) });
    host.toast(msg);
    host.log(msg);
    for (const x of r.j.sync.repositories) for (const p of x.problems) host.log(`${x.name}: ${problemText(p, lang)}`);
    // MICRO-PL24 · a review arrived or withdrawn for what is installed
    for (const p of reviewsChangeProblems(r.j.sync.reviews)) host.log(problemText(p, lang));
    if (r.j.sync.reviews && (r.j.sync.reviews.verified.length || r.j.sync.reviews.withdrawn.length)) await state.refresh?.();
    repaint();
  }

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
  head.append(el("b", "", `${pv.name ?? pv.id} ${pv.version ?? ""}`), ` — ${isRepoSource(pv.source) ? t("ext.fromRepo", { r: pv.source! }) : t("ext.fromDisk")}`);
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
    h.append(" ", c.verified ? reviewedMark(doc, t, c.reviewed)
      : el("span", "ext-unverified", isRepoSource(pv.source) ? t("ext.unverifiedRepo", { r: pv.source! }) : t("ext.unverifiedDisk")));
    box.appendChild(h);
    // MICRO-PL18 (W15a) · asked only when it must be: the first time, or when
    // permissions, capabilities or source changed since the last trust
    const asks = c.trust_needed !== false;
    // MICRO-PL24 (X4) · a reviewed code: no question, and who read it said
    box.dataset.extTrust = c.verified ? "reviewed" : asks ? "asked" : "kept";
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
    if (c.verified) {
      const rv = c.reviewed;
      const k = el("div", "ext-panel-f ext-trust-reviewed", t("ext.trustReviewed", { by: rv?.by ?? "?", on: rv?.on ?? "?", r: rv?.repo ?? "—" }));
      k.dataset.extTrustReviewed = rv?.by ?? "1";
      box.appendChild(k);
    } else if (asks) box.appendChild(el("div", "ext-panel-f ext-powers", t("ext.powers")));
    else { const k = el("div", "ext-panel-f ext-trust-kept", t("ext.trustKept")); k.dataset.extTrustKept = "1"; box.appendChild(k); }
    body.appendChild(box);
  }
  for (const m of pv.requires?.missing ?? []) body.appendChild(el("p", "cw-warn", problemText(m, lang)));
  for (const o of pv.requires?.optional ?? []) body.appendChild(el("p", "cw-hint", problemText(o, lang)));
  return body;
}
/** MICRO-PL22 · a source that is a repository's name (not the disk, the profiles library, the node, dev) */
export function isRepoSource(source: string | undefined): boolean {
  return !!source && !["disk", "profiles", "node", "dev"].includes(source);
}
function sourceWord(t: ExtWindowHost["t"], source: string | undefined): string {
  if (source === "profiles") return t("ext.source.profiles");
  if (isRepoSource(source)) return t("ext.source.repo", { r: source! });
  return t("ext.source.disk");
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
  // MICRO-PL24 (X4) · a reviewed code was not asked about: no answer is sent for it (its trust is the review's)
  const trust = parts === "all" && !!p.code?.present && !p.code.verified;
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
export function removalBody(doc: Document, host: Pick<ExtWindowHost, "t" | "lang">, plan: ExtRemovalPlan, part: "all" | "code" | "data"): { body: HTMLElement; purge: () => boolean; purgeUserData: () => boolean } {
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
  // MICRO-PL23 · the plugin's own saved state (plugins-data/<id>): stays, unless ticked
  let ud: HTMLInputElement | null = null;
  const codeGoes = part === "code" || part === "all" || !!plan.data?.removes_code;
  if (plan.code && codeGoes && (part !== "code" || !plan.data)) {
    const lab = el("label", "ext-purge");
    ud = el("input");
    ud.type = "checkbox";
    ud.checked = false;
    ud.dataset.extPurgeUserData = "1";
    lab.append(ud, ` ${t("ext.userDataPurge")}`);
    body.appendChild(lab);
  }
  return { body, purge: () => !!cb?.checked, purgeUserData: () => !!ud?.checked };
}

/** MICRO-PL23 · what «Aggiorna tutto» will do: each update, the ones that ask the trust again first */
export function updateAllBody(doc: Document, host: Pick<ExtWindowHost, "t" | "lang">, ups: ExtUpdate[]): HTMLElement {
  const t = host.t;
  const el = maker(doc);
  const body = el("div", "ext-update-all");
  const asking = updatesNeedingTrust(ups);
  body.dataset.extUpdateAll = String(ups.length);
  if (asking.length) {
    body.appendChild(el("p", "cw-warn", t("ext.updateAllAsk")));
    for (const u of asking) {
      const li = el("div", "ext-version", t("ext.updateTrustLine", { id: u.id, old: u.installed, v: u.version, r: u.repo,
        c: (u.trust_changes ?? []).map((c) => t(`ext.trustChange.${c}`)).join(", ") }));
      li.dataset.extUpdateTrust = u.id;
      body.appendChild(li);
    }
  }
  const quiet = ups.filter((u) => !u.trust_needed);
  if (quiet.length) {
    body.appendChild(el("p", "", t("ext.updateAllQuiet")));
    for (const u of quiet) {
      const li = el("div", "ext-version", t(u.code_left_out ? "ext.updateLineData" : "ext.updateLine", { id: u.id, old: u.installed, v: u.version, r: u.repo }));
      li.dataset.extUpdateQuiet = u.id;
      if (u.verified && u.reviewed && !u.code_left_out) li.append(" · ", reviewedMark(doc, t, u.reviewed));
      body.appendChild(li);
    }
  }
  body.appendChild(el("p", "cw-hint", t("ext.updateAllBeside")));
  return body;
}

/** MICRO-PL23 · «questo file usa stat 1.0.0, c'è la 1.1.0» in the window */
export function newerBlock(doc: Document, host: ExtWindowHost, state: ExtensionsState, repaint: () => void): HTMLElement {
  const t = host.t, lang = host.lang();
  const el = maker(doc);
  const box = el("div", "ext-missing ext-newer");
  box.dataset.extNewer = String(state.newer.length);
  box.appendChild(el("div", "ext-missing-h", t("ext.newerHead", { f: host.fileName() ?? "—" })));
  for (const n of state.newer) {
    const r = el("div", "ext-missing-row");
    r.dataset.extNewerIri = n.iri;
    r.dataset.extNewerChange = n.change;
    r.append(problemText(n.problem, lang), " ");
    const b = (label: string, key: string, fn: () => void) => {
      const x = el("button", "cw-mini", label);
      x.type = "button";
      x.dataset.ext = key;
      x.onclick = fn;
      return x;
    };
    if (n.ask_content) r.append(b(t("ext.newerWhat"), "newer-what", () => void newerFlow(doc, host, state, n, repaint, true)), " ");
    if (host.redeclare) r.append(b(t("ext.newerRedeclare", { v: n.newest }), "redeclare", () => void newerFlow(doc, host, state, n, repaint, n.ask_content)));
    box.appendChild(r);
  }
  box.appendChild(el("p", "cw-hint", t("ext.newerHint")));
  return box;
}

/** what changes from the declared version to the newer (a major): the CHANGELOG, or that there is none */
export function changelogBody(doc: Document, host: Pick<ExtWindowHost, "t" | "lang">, n: ExtNewer): HTMLElement {
  const t = host.t, lang = host.lang();
  const el = maker(doc);
  const body = el("div", "ext-changelog");
  body.dataset.extChangelog = n.changelog ? n.changelog.sections.join(",") || "all" : "none";
  body.appendChild(el("p", "cw-warn", problemText(n.problem, lang)));
  if (n.changelog) {
    const pre = el("pre", "ext-changelog-text", n.changelog.text);
    body.appendChild(pre);
    if (n.changelog.truncated) body.appendChild(el("p", "cw-hint", t("ext.changelogCut")));
  } else body.appendChild(el("p", "cw-hint", t("ext.changelogNone", { id: n.name })));
  body.appendChild(el("p", "cw-hint", t("ext.newerKeep", { v: n.declared })));
  return body;
}

export async function newerFlow(doc: Document, host: ExtWindowHost, _state: ExtensionsState, n: ExtNewer, repaint: () => void, show: boolean): Promise<void> {
  const t = host.t;
  if (show) {
    const ans = await host.dialog({ title: t("ext.newerTitle", { id: n.name, old: n.declared, v: n.newest }), body: changelogBody(doc, host, n),
      ok: host.redeclare ? t("ext.newerRedeclare", { v: n.newest }) : null, kind: "ext-newer", cancel: t("ext.newerKeepBtn") });
    if (!ans.ok) return;
  }
  if (!host.redeclare) return;
  const err = await host.redeclare(n);
  if (err) { host.toast(err); return; }
  repaint();
}

/** MICRO-PL23 · «Pulisci…»: what nothing owns, said, then removed */
async function cleanFlow(doc: Document, host: ExtWindowHost, state: ExtensionsState, repaint: () => void): Promise<void> {
  const t = host.t, lang = host.lang();
  const el = maker(doc);
  const found = await state.clean(true);
  if (!found.ok) { host.toast(failText(found, lang)); return; }
  const c = found.j.clean;
  if (!c.count) { host.toast(t("ext.cleanNothing")); return; }
  const body = el("div", "ext-clean");
  body.dataset.extClean = String(c.count);
  body.appendChild(el("p", "", t("ext.cleanWhat", { n: String(c.count) })));
  const ul = el("ul", "ext-perms");
  for (const x of [...c.code, ...c.partial, ...c.archives]) ul.appendChild(el("li", "", x.path));
  body.appendChild(ul);
  body.appendChild(el("p", "cw-hint", t("ext.cleanKeeps")));
  const ans = await host.dialog({ title: t("ext.cleanTitle"), body, ok: t("ext.cleanOk"), kind: "ext-clean", danger: true });
  if (!ans.ok) return;
  const res = await state.clean(false);
  if (!res.ok) { host.toast(failText(res, lang)); return; }
  const msg = t("ext.cleaned", { n: String(res.j.clean.count) });
  host.toast(msg);
  host.log(msg);
  repaint();
}

async function removeFlow(doc: Document, host: ExtWindowHost, state: ExtensionsState, r: ExtRow, part: "all" | "code" | "data", repaint: () => void): Promise<void> {
  const t = host.t, lang = host.lang();
  const plan = await state.removalPlan(r.id);
  if (!plan.ok) { host.toast(failText(plan, lang)); return; }
  const { body, purge, purgeUserData } = removalBody(doc, host, plan.j.plan, part);
  const needs = part !== "code" && !!plan.j.plan.data?.required_by.length;
  const ans = await host.dialog({ title: t(`ext.removeTitle.${part}`), body, ok: t(`ext.removeOk.${part}`), kind: `ext-remove-${part}`, danger: true });
  if (!ans.ok) return;
  const res = await state.remove(r.id, part, { confirm: needs, purge: purge(), purgeUserData: purgeUserData() });
  if (!res.ok) { host.toast(failText(res, lang)); return; }
  const msg = t(`ext.removed.${part}`, { id: r.id });
  host.toast(msg);
  host.log(msg);
  await state.refresh();
  host.afterChange();
  repaint();
}

// ── MICRO-PL22 (X2) · the repositories' flows ──────────────────────────────

/** what comes with an entry of a repository: said under the two panels */
export function planBody(doc: Document, host: Pick<ExtWindowHost, "t" | "lang">, plan: ExtPlan,
                         repo: { name: string; archive_hash?: string; cached?: boolean } | undefined): HTMLElement {
  const t = host.t, lang = host.lang();
  const el = maker(doc);
  const box = el("div", "ext-plan");
  box.dataset.extPlan = String(plan.steps.length);
  if (repo) {
    const v = el("div", "cw-hint ext-verified", t("ext.repoVerified", { r: repo.name, h: String(repo.archive_hash ?? "").slice(7, 19) }));
    v.dataset.extArchiveVerified = "1";
    box.appendChild(v);
  }
  const deps = plan.steps.filter((s) => !s.requested);
  if (deps.length) {
    box.appendChild(el("div", "ext-panel-h", t("ext.planDeps")));
    const ul = el("ul", "ext-deps");
    for (const s of deps) {
      const li = el("li", "", t("ext.planDep", { id: s.id, v: s.version, r: s.repo }));
      li.dataset.extDep = s.id;
      if (s.sections.includes("code")) li.append(" · ", el("span", "ext-unverified", t("ext.planDepCode")));
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }
  for (const u of plan.unresolved) { const p = el("p", "cw-warn", problemText(u.problem, lang)); p.dataset.extUnresolved = u.id; box.appendChild(p); }
  for (const o of plan.offers) {
    const p = el("p", "cw-hint", o.repo ? t("ext.planOffer", { id: o.id, v: o.version ?? "", r: o.repo }) : t("ext.planOfferNone", { id: o.id }));
    p.dataset.extOffer = o.id;
    box.appendChild(p);
  }
  for (const c of plan.tier_c) {
    const p = el("p", c.will_fetch ? "cw-hint" : "cw-warn",
      t(c.will_fetch ? "ext.planTierC" : "ext.planTierCOff", { s: nameOfIri(c.scheme), v: c.version, u: c.url }));
    p.dataset.extTierC = c.will_fetch ? "fetch" : "stub";
    if (c.terms) p.title = c.terms;
    box.appendChild(p);
  }
  if (plan.cycle) box.appendChild(el("p", "cw-warn", t("ext.planCycle", { c: plan.cycle.join(" → ") })));
  return box;
}

/** preview from a repository → the two panels + what comes with it → install */
export async function installFromRepo(doc: Document, host: ExtWindowHost, state: ExtensionsState, repo: string, id: string,
                                      version: string | undefined, repaint: () => void): Promise<InstallAnswer> {
  const t = host.t, lang = host.lang();
  host.toast(t("ext.repoDownloading", { id, r: repo }));
  const pv = await state.previewFrom(repo, id, version);
  if (!pv.ok) { host.toast(t("ext.previewFailed", { why: failText(pv, lang) })); host.log(t("ext.previewFailed", { why: failText(pv, lang) })); return null; }
  const p = pv.j.preview;
  const body = confirmBody(doc, host, p);
  if (p.plan) body.appendChild(planBody(doc, host, p.plan, p.repository));
  const b = confirmButtons(p, t);
  const ok = p.plan?.cycle ? null : b.ok;
  const ans = await host.dialog({ title: t("ext.confirmTitleRepo", { r: repo }), body, ok, choices: ok ? b.choices : [],
    kind: "ext-install", cancel: ok ? undefined : t("ext.close") });
  if (!ans.ok) return null;
  const parts: "all" | "data" = ans.choice === "data" ? "data" : "all";
  // the answer to the trust question is the button pressed after seeing the
  // code's panel and the requirements listed with their code marked
  // MICRO-PL24 (X4) · a reviewed code was not asked about: no answer is sent for it (its trust is the review's)
  const trust = parts === "all" && !!p.code?.present && !p.code.verified;
  const r = await state.installFrom(repo, id, { version: p.version, parts, trust, withRequires: true, trustRequires: parts === "all" });
  if (!r.ok) { host.toast(t("ext.installFailed", { why: failText(r, lang) })); return null; }
  const res = r.j.result;
  const name = labelIn((res.installed?.name ?? id) as never, lang) || id;
  const msg = parts === "data" && p.code?.present ? t("ext.installedData", { n: name, v: res.installed?.version ?? "" })
    : t("ext.installedRepo", { n: name, v: res.installed?.version ?? "", r: repo });
  host.toast(msg);
  host.log(msg);
  for (const d of res.requires) host.log(t("ext.installedDep", { id: d.id, v: d.version, r: d.repo }));
  for (const c of res.tier_c) host.log(c.fetched ? t("ext.tierCFetched", { id: c.id, u: c.url ?? "" }) : problemText(c.problem ?? null, lang));
  for (const w of res.warnings ?? []) host.log(problemText(w, lang));
  await state.refresh();
  await state.refreshRepos();
  host.afterChange();
  repaint();
  return parts;
}

/** the form of «+ Aggiungi repository…» (exported for the checks) */
export function addRepoBody(doc: Document, host: Pick<ExtWindowHost, "t" | "pickRepoFolder">, officialUrl: string):
    { body: HTMLElement; values: () => { url: string; name: string; token: string; check_on_startup: boolean; trust_reviews?: boolean } } {
  const t = host.t;
  const el = maker(doc);
  const body = el("div", "ext-repo-form");
  body.dataset.extRepoForm = "1";
  const field = (label: string, input: HTMLInputElement, hint?: string) => {
    const l = el("label", "ext-field");
    l.append(el("span", "", label), input);
    body.appendChild(l);
    if (hint) body.appendChild(el("p", "cw-hint", hint));
  };
  const url = el("input"); url.type = "text"; url.placeholder = t("ext.repoUrlPh"); url.dataset.extRepoUrl = "1";
  const name = el("input"); name.type = "text"; name.placeholder = t("ext.repoNamePh"); name.dataset.extRepoName = "1";
  const token = el("input"); token.type = "password"; token.autocomplete = "off"; token.dataset.extRepoToken = "1";
  const start = el("input"); start.type = "checkbox"; start.checked = false; start.dataset.extRepoStartupNew = "1";
  field(t("ext.repoUrl"), url, t("ext.repoUrlHint"));
  const presets = el("div", "cw-row");
  if (officialUrl) {
    const o = el("button", "cw-mini", t("ext.repoOfficial"));
    o.type = "button";
    o.dataset.ext = "repo-official";
    o.title = officialUrl;
    o.onclick = () => { url.value = officialUrl; if (!name.value) name.value = "extendedmatrix"; };
    presets.appendChild(o);
  }
  if (host.pickRepoFolder) {
    const f = el("button", "cw-mini", t("ext.repoFolder"));
    f.type = "button";
    f.dataset.ext = "repo-folder";
    f.onclick = () => void host.pickRepoFolder!().then((p) => { if (p) url.value = p; });
    presets.append(" ", f);
  }
  body.appendChild(presets);
  field(t("ext.repoName"), name);
  field(t("ext.repoTokenLabel"), token, t("ext.repoTokenHint"));
  const l = el("label", "ext-startup");
  l.append(start, ` ${t("ext.repoStartup")}`);
  body.appendChild(l);
  body.appendChild(el("p", "cw-hint", t("ext.repoStartupHint")));
  // MICRO-PL24 (X4) · its reviews: unticked (the official index's count anyway, unless unticked after choosing it)
  const rev = el("input"); rev.type = "checkbox"; rev.checked = false; rev.dataset.extRepoReviewsNew = "1";
  let revTouched = false;
  rev.onchange = () => { revTouched = true; };
  const lr = el("label", "ext-startup");
  lr.append(rev, ` ${t("ext.repoTrustReviews")}`);
  body.appendChild(lr);
  body.appendChild(el("p", "cw-hint", t("ext.repoTrustReviewsHint")));
  const off = body.querySelector<HTMLButtonElement>("[data-ext='repo-official']");
  if (off) { const was = off.onclick; off.onclick = (e) => { (was as ((e: MouseEvent) => void) | null)?.(e); if (!revTouched) rev.checked = true; }; }
  return { body, values: () => ({ url: url.value.trim(), name: name.value.trim(), token: token.value, check_on_startup: start.checked,
    // ticked: yes; unticked by hand: no; never touched: the library's default (the official index only)
    trust_reviews: rev.checked ? true : revTouched ? false : undefined }) };
}

async function addRepoFlow(doc: Document, host: ExtWindowHost, state: ExtensionsState, repaint: () => void): Promise<void> {
  const t = host.t, lang = host.lang();
  const { body, values } = addRepoBody(doc, host, state.officialUrl);
  const ans = await host.dialog({ title: t("ext.repoAddTitle"), body, ok: t("ext.repoAddOk"), kind: "ext-repo-add" });
  if (!ans.ok) return;
  const v = values();
  if (!v.url) { host.toast(t("ext.repoUrlEmpty")); return; }
  const r = await state.addRepo({ url: v.url, name: v.name || undefined, token: v.token || undefined, check_on_startup: v.check_on_startup,
    ...(v.trust_reviews !== undefined && !host.reviewsWhy?.() ? { trust_reviews: v.trust_reviews } : {}) });
  if (!r.ok) { host.toast(failText(r, lang)); return; }
  const msg = t("ext.repoAdded", { r: r.j.repository.name, u: r.j.repository.url });
  host.toast(msg);
  host.log(msg);
  // read it once now: a file:// one always, an https one only with the switch on (said otherwise)
  const s = await state.syncRepos({ name: r.j.repository.name });
  if (s.ok) for (const x of s.j.sync.repositories) for (const p of x.problems) host.log(`${x.name}: ${problemText(p, lang)}`);
  repaint();
}

async function tokenFlow(doc: Document, host: ExtWindowHost, state: ExtensionsState, r: ExtRepo, repaint: () => void): Promise<void> {
  const t = host.t, lang = host.lang();
  const body = doc.createElement("div");
  const p = doc.createElement("p");
  p.textContent = t("ext.repoTokenAsk", { r: r.name });
  const input = doc.createElement("input");
  input.type = "password";
  input.autocomplete = "off";
  input.dataset.extRepoToken = "1";
  body.append(p, input);
  const hint = doc.createElement("p");
  hint.className = "cw-hint";
  hint.textContent = t("ext.repoTokenEmpty");
  body.appendChild(hint);
  const ans = await host.dialog({ title: t("ext.repoTokenTitle"), body, ok: t("ext.repoTokenOk"), kind: "ext-repo-token" });
  if (!ans.ok) return;
  const res = await state.updateRepo(r.name, { token: input.value || null });
  if (!res.ok) { host.toast(failText(res, lang)); return; }
  const msg = t(input.value ? "ext.repoTokenSaved" : "ext.repoTokenCleared", { r: r.name });
  host.toast(msg);
  host.log(msg);
  await state.refreshRepos();
  repaint();
}

async function removeRepoFlow(doc: Document, host: ExtWindowHost, state: ExtensionsState, r: ExtRepo, repaint: () => void): Promise<void> {
  const t = host.t, lang = host.lang();
  const body = doc.createElement("p");
  body.textContent = t("ext.repoRemoveWhat", { r: r.name });
  const ans = await host.dialog({ title: t("ext.repoRemoveTitle"), body, ok: t("ext.repoRemove"), kind: "ext-repo-remove", danger: true });
  if (!ans.ok) return;
  const res = await state.removeRepo(r.name);
  if (!res.ok) { host.toast(failText(res, lang)); return; }
  const msg = t("ext.repoRemoved", { r: r.name });
  host.toast(msg);
  host.log(msg);
  delete state.syncProblems[r.name];
  await state.refreshRepos();
  repaint();
}
