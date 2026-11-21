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
 * question. A section «Cartella di sviluppo» (beta; behind «Funzioni sperimentali»
 * until MICRO-COR11)
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
 * MICRO-PL27 (X7, PLUGIN-SUL-NODO) · on the web, under the node's packages, the
 * section «Plugin del nodo» (node-plugins.ts, given by the host): the node's
 * cage proved or not, its plugins, on or off in this room, their commands.
 *
 * Nothing here knows `main.ts`: the host gives the dialogs, the file pickers, the
 * words. Every installation is the library's (W21); the window has none of its own.
 */
import { floating } from "./floating";
import type { DevInfo } from "./plugin-commands";
import { codeCounts, repoHost, whereOf, type WhereCommand, type WherePanel, type WherePlace } from "./extensions-where";
import {
  availableRows, formsOf, labelIn, licenceText, nameOfIri, problemText, rowKind, rowState, schemesOf, sizeText,
  type ExtArchive, type ExtAvailable, type ExtFilter, type ExtPlan, type ExtPreview, type ExtProblem, type ExtRemovalPlan,
  type ExtRepo, type ExtRow, type ExtSigned, type ExtensionsState, type ExtNewer, type ExtVersions, type ExtUpdate, type ExtReview,
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
  /** MICRO-PL18 (W15a) · the plugins' development folder; absent or null: no section */
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
  /** MICRO-PL28 · the bridge takes a repository's signing keys (level 89): null when it does, else why not */
  signWhy?(): string | null;
  /** MICRO-PL27 (X7) · on the web: the section «Plugin del nodo» (null: none to draw) */
  nodePlugins?(doc: Document): HTMLElement | null;
  /** MICRO-SEG08 · the plugin of this extension as loaded NOW (its commands, its panels); null: not loaded */
  loadedFacts?(id: string): { commands: WhereCommand[]; panels: WherePanel[] } | null;
  /** MICRO-SEG08 · «Mostrami»: the page goes to that place (opens the menu, the workspace, lights the tool) */
  showWhere?(p: WherePlace, extId: string): void;
  /** MICRO-SEG08 · «Come si costruisce un'estensione»: the manual's guide */
  openGuide?(): void;
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

/** MICRO-PL28 (X8) · «firmato dalla chiave K di R»: who published these bytes (not who read the code) */
export function signedMark(doc: Document, t: ExtWindowHost["t"], s: Partial<ExtSigned> & { key_id: string }): HTMLElement {
  const el = maker(doc);
  const m = el("span", "ext-signed", s.repos?.length ? t("ext.signedBy", { k: s.key_id, r: s.repos.join(", ") }) : t("ext.signedKey", { k: s.key_id }));
  m.dataset.extSigned = s.key_id;
  m.title = t("ext.signedHint");
  return m;
}

/** MICRO-PL28 · the keys a person pasted: one per line starting with «RW» (a .pub file's comment line skipped);
 *  text with no such line is sent whole, so the library says why it is not a key */
export function keysOf(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const keys = lines.filter((l) => l.startsWith("RW"));
  return keys.length ? keys : lines.length ? [text.trim()] : [];
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

/** the filter of the list, kept while the page lives: the kind (chips), what is shown, the search */
let filter: ExtFilter = "all";
/** MICRO-SEG08 · «Tutte · Installate · Aggiornamenti» */
export type ExtShow = "all" | "installed" | "updates";
let show: ExtShow = "all";
let search = "";
/** MICRO-PL23 · the rows whose «Versioni» are open */
const openVersions = new Set<string>();
/** MICRO-SEG08 · the rows the person opened or closed (absent: the default) */
const openRows = new Map<string, boolean>();
/** MICRO-SEG08 · the repositories' panel, the development folder: open or not */
let reposOpen = false;
let devOpen = false;
export function versionsOpen(id: string): boolean { return openVersions.has(id); }
export function extensionsFilter(): ExtFilter { return filter; }
export function setExtensionsFilter(f: ExtFilter): void { filter = f; }
export function extensionsShow(): ExtShow { return show; }
export function setExtensionsShow(s: ExtShow): void { show = s; }
export function setExtensionsSearch(q: string): void { search = q; }
export function setRowOpen(id: string, open: boolean): void { openRows.set(id, open); }
export function setReposOpen(open: boolean): void { reposOpen = open; }
export function extensionsSig(): string { return JSON.stringify([filter, show, search, [...openRows], reposOpen, devOpen, [...openVersions], [...facts.keys()]]); }

/** MICRO-SEG08 · what the code declares, when the register does not keep it:
 *  read once from the archive it came from (a preview: nothing written) */
interface ExtFacts { commands: WhereCommand[]; panels: WherePanel[]; codeLicense?: string; dataLicense?: string; hosts?: string[] }
const facts = new Map<string, ExtFacts | "asking" | "none">();
export function extensionFacts(key: string): ExtFacts | "asking" | "none" | undefined { return facts.get(key); }

type El = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => HTMLElementTagNameMap[K];
function maker(doc: Document): El {
  return (tag, cls, text) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
}

/** one line of the list: an installed extension, or one a repository offers that is not here */
interface Entry { id: string; row: ExtRow | null; avail: ExtAvailable | null; group: string }

/** the kind of what a repository offers */
function availKind(a: ExtAvailable): "community-package" | "plugin" | "mixed" {
  const s = Object.keys(a.sections ?? {});
  return s.includes("code") && s.includes("data") ? "mixed" : s.includes("code") ? "plugin" : "community-package";
}
function kindPasses(kind: string, f: ExtFilter): boolean {
  if (f === "all") return true;
  if (f === "mixed") return kind === "mixed";
  if (f === "packages") return kind === "community-package" || kind === "mixed";
  return kind === "plugin" || kind === "mixed";
}

/** The page «Preferenze ▸ Estensioni» (MICRO-SEG08; the window «Estensioni»
 *  before), rebuilt whole on every change (a few rows). */
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
  const tn = (key: string, n: number, vars: Record<string, string> = {}): string => t(`${key}.${n === 1 ? "one" : "other"}`, { n: String(n), ...vars });
  const box = el("div", "cw-body ext-body ext-page");
  box.dataset.extWindow = "1";
  const fromNode = state.from === "node";
  const repos = state.repos ?? [];
  const reposWhy = host.reposWhy?.() ?? null;
  const official = repos.find((r) => r.official) ?? null;
  const orderedRepos = official ? [official, ...repos.filter((r) => r !== official)] : repos;

  // ── the head: title, the repositories' selector, install from disk ──
  const head = el("div", "ext-head");
  const h1 = el("div", "ext-head-row");
  h1.append(el("h3", "ext-title", t("ext.title")), el("span", "ext-sub", t("ext.subtitle")), el("span", "ext-grow"));
  if (!fromNode) {
    h1.appendChild(repoSelector());
    if (!state.unavailable) {
      h1.appendChild(btn(t("ext.installZip"), "install-zip", () => void installFlow(doc, host, state, false, repaint), t("ext.installZipHint")));
      if (host.canPickFolder())
        h1.appendChild(btn(t("ext.installFolder"), "install-folder", () => void installFlow(doc, host, state, true, repaint), t("ext.installFolderHint")));
    }
  }
  head.appendChild(h1);
  if (fromNode) {
    const p = el("p", "cw-hint", t("ext.fromNode"));
    p.dataset.extFromNode = "1";
    head.appendChild(p);
  }
  // the search, what to show, the kinds
  const h2 = el("div", "ext-head-row");
  const sl = el("label", "ext-search");
  const si = el("input");
  si.type = "search";
  si.placeholder = t("ext.searchPh");
  si.setAttribute("aria-label", t("ext.searchPh"));
  si.value = search;
  si.dataset.extSearch = "1";
  si.oninput = () => { search = si.value; repaint(); };
  sl.append(el("span", "ext-search-ic", "⌕"), si);
  const seg = el("div", "ext-seg");
  seg.setAttribute("role", "group");
  seg.setAttribute("aria-label", t("ext.showLabel"));
  for (const s of ["all", "installed", "updates"] as const) {
    const b = el("button", "", t(`ext.show.${s}`));
    b.type = "button";
    b.dataset.extShow = s;
    b.setAttribute("aria-pressed", String(show === s));
    b.onclick = () => { show = s; repaint(); };
    seg.appendChild(b);
  }
  const chips = el("div", "ext-chips ext-filter");
  for (const f of ["packages", "plugins", "mixed"] as const) {
    const b = el("button", "ext-chip", t(`ext.filter.${f}`));
    b.type = "button";
    b.dataset.extFilter = f;
    b.title = t(`ext.filter.${f}Hint`);
    b.setAttribute("aria-pressed", String(filter === f));
    b.onclick = () => { filter = filter === f ? "all" : f; repaint(); };
    chips.appendChild(b);
  }
  h2.append(sl, seg, chips);
  head.appendChild(h2);
  box.appendChild(head);
  if (!fromNode && !state.unavailable) dropToInstall(doc, box, host, state, repaint);
  if (!fromNode) box.appendChild(reposPanel());

  const scroll = el("div", "ext-scroll");
  box.appendChild(scroll);
  // MICRO-PL27 (X7) · on the web, the plugins of the node (the host draws them: node-plugins.ts)
  const nodePlugins = (): void => {
    const sec = host.nodePlugins?.(doc) ?? null;
    if (sec) scroll.appendChild(sec);
  };
  if (state.unavailable) {
    const p = el("p", "cw-warn", t("ext.noBridge"));
    p.dataset.extNoBridge = "1";
    scroll.appendChild(p);
    nodePlugins();
    return box;
  }
  if (state.error && !state.rows) scroll.appendChild(el("p", "cw-warn", state.error));
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
    scroll.appendChild(miss);
  }
  // ── MICRO-PL23 · the file's packages with a newer version here ──
  if ((state.newer ?? []).length && host.fileName()) scroll.appendChild(newerBlock(doc, host, state, repaint));

  // ── the list: one line per extension, grouped by the repository it comes from ──
  const entries = entriesOf();
  const list = el("div", "ext-list");
  const shown = entries.filter(passes);
  list.dataset.extList = String(shown.filter((e) => e.row).length);
  if (!state.rows) list.appendChild(el("p", "cw-hint", t("ext.loading")));
  else if (!shown.length) list.appendChild(el("p", "cw-hint", t(entries.length ? "ext.noneOfKind" : "ext.none")));
  const used = new Set((state.overlay?.profiles ?? []).filter((p) => p.declared).map((p) => p.name));
  const groups = [...new Set(shown.map((e) => e.group))].sort((a, b) => groupRank(a) - groupRank(b));
  for (const g of groups) {
    list.appendChild(groupHead(g));
    for (const e of shown.filter((x) => x.group === g)) list.appendChild(entryEl(e, used.has(e.row?.data?.name ?? e.id)));
  }
  // MICRO-PL23 · what a repository has only for other machines: said, not offered
  for (const o of state.otherPlatforms ?? []) {
    const w = el("p", "cw-hint ext-other-platform", problemText(o.problem, lang));
    w.dataset.extOtherPlatform = `${o.repo}/${o.id}`;
    list.appendChild(w);
  }
  scroll.appendChild(list);
  if (fromNode) nodePlugins();
  const dev = host.dev?.() ?? null;
  if (dev && !fromNode) scroll.appendChild(devSection(dev));
  if (!fromNode) box.appendChild(statusBar());
  return box;

  // ── the entries ──
  function entriesOf(): Entry[] {
    const out: Entry[] = [];
    const avail = state.available ?? [];
    for (const r of state.rows ?? []) {
      const a = avail.find((x) => x.id === r.id && x.repo === r.source) ?? avail.find((x) => x.id === r.id) ?? null;
      out.push({ id: r.id, row: r, avail: a, group: isRepoSource(r.source) ? r.source! : "" });
    }
    const have = new Set(out.map((e) => e.id));
    for (const a of availableRows(avail, "all")) if (!have.has(a.id) && !a.installed) { out.push({ id: a.id, row: null, avail: a, group: a.repo }); have.add(a.id); }
    return out;
  }
  function kindOf(e: Entry): "community-package" | "plugin" | "mixed" { return e.row ? rowKind(e.row) : availKind(e.avail!); }
  function updateOf(e: Entry): ExtUpdate | null { return (state.updates ?? []).find((u) => u.id === e.id) ?? null; }
  function passes(e: Entry): boolean {
    if (!kindPasses(kindOf(e), filter)) return false;
    if (show === "installed" && !e.row) return false;
    if (show === "updates" && !updateOf(e) && !e.avail?.update) return false;
    const q = search.trim().toLowerCase();
    if (q) {
      const name = labelIn((e.row?.name ?? e.avail?.name) as Record<string, string> | string | undefined, lang);
      if (![e.id, name, e.avail?.tagline ?? "", e.avail?.maintainer ?? ""].some((s) => s.toLowerCase().includes(q))) return false;
    }
    return true;
  }
  function groupRank(g: string): number {
    if (!g) return 1e6;
    const i = orderedRepos.findIndex((r) => r.name === g);
    return i < 0 ? 1e5 : i;
  }
  function groupHead(g: string): HTMLElement {
    const h = el("div", "ext-eyebrow ext-group-h");
    h.dataset.extGroup = g || "local";
    const r = repos.find((x) => x.name === g);
    h.appendChild(el("span", "", !g ? t("ext.groupLocal") : r?.official ? t("ext.groupOfficial") : t("ext.groupRepo", { r: g })));
    if (r) {
      const bits = [r.signed && r.keys?.length ? t("ext.groupSigned", { k: r.keys.map((k) => k.key_id).join(", ") }) : t("ext.groupUnsigned"),
        r.synced_at ? t("ext.groupChecked", { at: shortTime(r.synced_at) }) : t("ext.repoNever")];
      if (!r.enabled) bits.push(t("ext.repoPaused"));
      h.appendChild(el("span", "ext-mono ext-group-facts", bits.join(" · ")));
    }
    return h;
  }

  /** one extension: the line (name, version, kind, who, size; its true state and ONE action), then, opened, two columns */
  function entryEl(e: Entry, usedHere: boolean): HTMLElement {
    const r = e.row, a = e.avail;
    const kind = kindOf(e);
    const sec = el("section", "ext-row");
    if (r) sec.dataset.extId = r.id;
    else sec.dataset.extAvail = `${a!.repo}/${a!.id}`;
    sec.dataset.extKind = kind;
    const st = r ? rowState(r) : null;
    const upd = r ? updateOf(e) : null;
    const attention = !r || !!upd || (st != null && st.key !== "ext.state.active");
    const open = openRows.get(e.id) ?? ((state.rows ?? []).length + (state.available ?? []).filter((x) => !x.installed).length <= 1 || (!!r && attention));
    sec.dataset.extOpen = open ? "1" : "0";
    // ── the line ──
    const line = el("div", "ext-row-h");
    const tw = el("button", "ext-tw", open ? "▾" : "▸");
    tw.type = "button";
    tw.dataset.extToggle = e.id;
    tw.setAttribute("aria-expanded", String(open));
    const name = labelIn((r?.name ?? a?.name) as Record<string, string> | string | undefined, lang) || e.id;
    tw.setAttribute("aria-label", t(open ? "ext.collapse" : "ext.expand", { n: name }));
    tw.onclick = () => { openRows.set(e.id, !open); repaint(); };
    const idBox = el("div", "ext-row-id");
    const title = el("div", "ext-row-title");
    title.append(el("b", "ext-name", name), el("span", "ext-mono ext-ver", r?.version ?? a?.version ?? ""),
      el("span", `ext-kind ext-kind-${kind}`, t(`ext.kind.${kind}`)));
    if (usedHere) { const u = el("span", "ext-used", t("ext.usedHere")); u.dataset.extUsed = "1"; title.append(u); }
    idBox.appendChild(title);
    const sub = [a?.tagline ?? "", a?.maintainer ?? "", sizeText(a?.archive_size)].filter(Boolean).join(" · ");
    idBox.appendChild(el("div", "ext-row-sub", sub || (r ? sourceWord(t, r.source) : "")));
    const right = el("div", "ext-row-state");
    let stEl: HTMLElement;
    let primary: HTMLButtonElement | null = null;
    if (!r) {
      stEl = el("span", "ext-state ext-absent", a!.update ? t("ext.st.update", { old: a!.installed ?? "", v: a!.version }) : t("ext.st.notInstalled"));
      stEl.dataset.extAvailState = a!.update ? "update" : "absent";
      if (!fromNode) primary = btn(t("ext.install"), "repo-install", () => void installFromRepo(doc, host, state, a!.repo, a!.id, a!.version, repaint), undefined, "primary");
    } else {
      const key = st!.key.split(".").pop()!;
      const words = upd ? t("ext.st.update", { old: upd.installed, v: upd.version })
        : key === "codeOut" ? t(r.data?.status === "installed" ? "ext.st.dataOnly" : "ext.st.codeOut")
        : key === "codeOff" ? t("ext.st.codeOff") : key === "pending" ? t("ext.st.pending") : key === "incomplete" ? t("ext.st.incomplete")
        : t("ext.st.installed");
      stEl = el("span", `ext-state ext-${key}${upd ? " ext-has-update" : ""}`, words);
      stEl.dataset.extState = key;
      if (upd) { stEl.dataset.extUpdate = upd.version; stEl.title = t("ext.repoUpdate", { old: upd.installed, v: upd.version, r: upd.repo }); }
      else if (st!.problem) stEl.title = problemText(st!.problem, lang);
      if (!fromNode) {
        if (upd && !host.updatesWhy?.()) primary = btn(t("ext.repoUpdateBtn"), "repo-update", () => void installFromRepo(doc, host, state, upd.repo, r.id, upd.version, repaint), undefined, "primary");
        else if (r.code && (r.code.status === "not_installed" || r.code.pending))
          primary = btn(t("ext.installCode"), "install-code", () => void installCodeFlow(doc, host, state, r, repaint), t("ext.installCodeHint"), "primary");
        else if (r.code?.status === "installed" && !r.code.active)
          primary = btn(t("ext.enable"), "enable", () => void act(state.enable(r.id), t("ext.enabled", { id: r.id })), undefined, "primary");
      }
    }
    right.appendChild(stEl);
    if (primary) right.appendChild(primary);
    line.append(tw, idBox, right);
    sec.appendChild(line);
    // ── opened: what it contains, where you find it, the other gestures ──
    const body = el("div", "ext-row-b");
    body.hidden = !open;
    const cols = el("div", "ext-cols");
    const f = r ? factsFor(r, open) : null;
    cols.append(containsCol(e, f), whereCol(e, f));
    body.appendChild(cols);
    if (r && !fromNode) body.appendChild(actsOf(r, primary?.dataset.ext ?? ""));
    else if (r && fromNode) { /* the node's packages are the administrator's */ }
    if (r && openVersions.has(r.id)) body.appendChild(versionsEl(r));
    sec.appendChild(body);
    return sec;
  }

  /** the facts of an installed extension's code: the plugin as loaded, the register, else its archive read once */
  function factsFor(r: ExtRow, wanted: boolean): ExtFacts | "asking" | "none" {
    const loaded = host.loadedFacts?.(r.id) ?? null;
    if (loaded) return { commands: loaded.commands, panels: loaded.panels };
    if (r.code?.commands?.length) return { commands: r.code.commands as WhereCommand[], panels: [] };
    if (!r.code || r.code.status === "absent") return { commands: [], panels: [] };
    const key = `${r.id}@${r.code.version ?? r.version ?? ""}`;
    const got = facts.get(key);
    if (got) return got;
    const origin = r.code.installable_from || r.origin;
    if (!wanted || !origin || state.from === "node") return "none";
    facts.set(key, "asking");
    void state.preview({ path: origin, name: origin }).then((pv) => {
      if (!pv.ok || !pv.j.preview.code?.present) { facts.set(key, "none"); repaint(); return; }
      const c = pv.j.preview.code as NonNullable<ExtPreview["code"]> & { panels?: WherePanel[] };
      facts.set(key, { commands: (c.commands ?? []) as WhereCommand[], panels: c.panels ?? [], codeLicense: c.license, hosts: c.hosts,
        dataLicense: pv.j.preview.data?.summary?.license ?? undefined });
      repaint();
    }).catch(() => { facts.set(key, "none"); repaint(); });
    return "asking";
  }

  /** the licences of the two parts: the archive's own words when read, else the row's list (data first, code last) */
  function licences(e: Entry, f: ExtFacts | "asking" | "none" | null): { data: string; code: string } {
    const all = (Array.isArray(e.row?.license ?? e.avail?.license) ? (e.row?.license ?? e.avail?.license) as string[]
      : [e.row?.license ?? e.avail?.license].filter(Boolean) as string[]);
    const ff = f && typeof f === "object" ? f : null;
    const two = all.length === 2 && kindOf(e) === "mixed";
    return { data: licenceText(ff?.dataLicense ?? (two ? all[0] : all)), code: licenceText(ff?.codeLicense ?? (two ? all[1] : all)) };
  }

  /** MICRO-SEG20 · code signed by its repository and not reviewed: one sentence with the step that is missing */
  function unreviewedSigned(repo: string): HTMLElement {
    const m = el("span", "ext-unverified ext-unreviewed", t("ext.signedUnreviewed", { r: repo }));
    m.dataset.extUnreviewed = repo;
    m.title = t("ext.signedUnreviewedHint", { r: repo });
    return m;
  }

  /** «Cosa contiene»: the data, the code, what it asks */
  function containsCol(e: Entry, f: ExtFacts | "asking" | "none" | null): HTMLElement {
    const r = e.row, a = e.avail;
    const col = el("div", "ext-col ext-contains");
    col.appendChild(el("div", "ext-eyebrow", t("ext.contains")));
    const lic = licences(e, f);
    const kind = kindOf(e);
    // ── the data ──
    const dataHere = r?.data?.status === "installed";
    const dataThere = dataHere || (!!a && !!(a.sections ?? {}).data) || (!r && kind !== "plugin");
    if (dataThere) {
      const d = el("div", "ext-part ext-data");
      d.dataset.extPart = "data";
      const hd = el("div", "ext-part-line");
      hd.append(el("span", dataHere ? "ext-dot on" : "ext-dot", dataHere ? "●" : "○"), el("span", "ext-part-h", t("ext.data")),
        el("span", "ext-part-facts", [lic.data, t("ext.dataEverywhere")].filter(Boolean).join(" · ")));
      d.appendChild(hd);
      const inner = el("div", "ext-part-body");
      if (dataHere) inner.appendChild(el("div", "", t("ext.versions", { v: (r!.data!.versions ?? [r!.data!.version]).filter(Boolean).join(" · ") })));
      const voc = vocabNames(e);
      if (voc.length) {
        const v = el("div", "", tn("ext.c.vocabs", voc.length, { list: voc.join(", ") }));
        v.title = (r?.data?.carried_vocabularies ?? []).map((x) => `${x.scheme} ${x.version}`).join("\n");
        if (dataHere) v.append(" ", btn(t("ext.openVocab"), "open-vocab", () => host.openVocabularies(), undefined, "cw-mini"));
        inner.appendChild(v);
      }
      if (dataHere) {
        const iri = r!.data!.iri;
        const schemes = schemesOf(state.overlay, lang).filter((x) => x.profile === iri);
        if (iri) inner.appendChild(el("div", "", schemes.length ? tn("ext.c.profileSchemes", schemes.length) : t("ext.c.profile")));
        for (const sc of schemes) {
          const ln = el("div", "cw-hint ext-scheme");
          ln.dataset.extScheme = sc.id;
          // MICRO-SEG20 · a ramp says its stops; a scheme says its property, or no parentheses at all
          ln.append(sc.ramp != null ? tn("ext.schemeRamp", sc.ramp, { s: sc.name })
            : sc.property ? t("ext.scheme", { s: sc.name, p: sc.property }) : t("ext.schemeNoProp", { s: sc.name }), " ");
          if (sc.ramp != null) ln.dataset.extSchemeRamp = String(sc.ramp);
          else if (sc.emc && host.importScheme && host.fileName())
            ln.append(btn(t("ext.schemeImport"), "scheme-import", () => host.importScheme!(sc.name, sc.emc), t("ext.schemeImportHint"), "cw-mini"));
          else if (!sc.emc) ln.append(el("span", "cw-warn", t("ext.schemeBad")));
          inner.appendChild(ln);
        }
        const added = host.formsAdded?.() ?? new Set<string>();
        for (const fm of formsOf(state.overlay, lang).filter((x) => x.profile === iri)) {
          const ln = fm.def
            ? el("div", "cw-hint ext-form", t(added.has(fm.def.header.id) ? "ext.formAdded" : "ext.formReady", { s: fm.name })
                + " · " + t("ext.formVerified", { d: String(fm.def.header.digest ?? "").slice(7, 19) }))
            : el("div", "cw-warn ext-form", t("ext.formRefused", { s: fm.name, why: fm.problems.map((p) =>
                p.code === "form_unverified" ? t("ext.formUnverified") : problemText(p, lang)).join(" · ") }));
          ln.dataset.extForm = fm.def ? "added" : (fm.problems[0]?.code ?? "refused");
          inner.appendChild(ln);
        }
      }
      d.appendChild(inner);
      col.appendChild(d);
    }
    // ── the code ──
    const code = r?.code;
    const codeThere = (!!code && code.status !== "absent") || (!r && !!a && !!(a.sections ?? {}).code);
    if (codeThere) {
      const c = el("div", "ext-part ext-code");
      c.dataset.extPart = "code";
      if (code) c.dataset.extCode = code.status;
      const on = code?.status === "installed" && !!code.active;
      const hosts = (f && typeof f === "object" && f.hosts) || code?.hosts || ((a?.sections?.code as { hosts?: string[] } | undefined)?.hosts) || [];
      const hd = el("div", "ext-part-line");
      hd.append(el("span", on ? "ext-dot on" : "ext-dot", on ? "●" : "○"), el("span", "ext-part-h", t("ext.code")),
        el("span", "ext-part-facts", [lic.code, "Python", hosts.map(hostWord).join(t("ext.and"))].filter(Boolean).join(" · ")));
      c.appendChild(hd);
      const inner = el("div", "ext-part-body");
      if (f && typeof f === "object" && (f.commands.length || f.panels.length)) {
        const counts = codeCounts(f.commands, f.panels).map((x) => tn(`ext.c.${x.kind}`, x.n));
        const cl = el("div", "", counts.join(", "));
        cl.dataset.extCounts = String(f.commands.length);
        inner.appendChild(cl);
      }
      if (code?.status === "installed") {
        const s = el("div", "");
        s.append(`${t("ext.versions", { v: (code.versions ?? [code.version]).filter(Boolean).join(" · ") })} · `,
          code.verified ? reviewedMark(doc, t, code.reviewed)
            // MICRO-SEG20 · signed and not reviewed: the step that is missing is said, not «not verified»
            // beside «signed by the key …» (the signature says who published the bytes, a review who read them)
            : r!.signed?.key_id ? unreviewedSigned(r!.signed.repos?.length ? r!.signed.repos.join(", ") : (r!.source ?? ""))
            : el("span", "ext-unverified", isRepoSource(r!.source) ? t("ext.unverifiedFrom", { r: r!.source! }) : t("ext.unverified")),
          ` · ${t(code.active ? "ext.active" : "ext.inactive")}`);
        inner.appendChild(s);
        if (code.active_version && code.active_version !== code.version) {
          const w = el("div", "cw-hint ext-active-other", t("ext.activeOther", { v: code.active_version }));
          w.dataset.extActiveOther = code.active_version;
          inner.appendChild(w);
        }
      } else if (code) inner.appendChild(el("div", "cw-hint", t("ext.codeNotHere")));
      else if (a?.verified && a.reviewed) { const v = el("div", ""); v.appendChild(reviewedMark(doc, t, { ...a.reviewed, repo: a.repo })); v.dataset.extAvailReviewed = a.reviewed.by; inner.appendChild(v); }
      c.appendChild(inner);
      col.appendChild(c);
    }
    // MICRO-PL28 (X8) · who published these bytes
    if (r?.signed?.key_id) { const sg = el("div", "cw-hint"); sg.appendChild(signedMark(doc, t, r.signed)); col.appendChild(sg); }
    else if (!r && a?.signed && a.signed_by) { const sg = el("div", "cw-hint"); sg.appendChild(signedMark(doc, t, { key_id: a.signed_by, repos: [a.repo] })); col.appendChild(sg); }
    // ── what it asks ──
    const perms = Object.entries(code?.permissions ?? a?.permissions ?? {});
    const caps = code?.capabilities ?? ((a?.sections?.code as { capabilities?: string[] } | undefined)?.capabilities) ?? [];
    if (perms.length || caps.length) {
      const k = el("div", "ext-part ext-asks");
      k.appendChild(el("div", "ext-part-h", t("ext.asks")));
      if (perms.length) {
        const ul = el("ul", "ext-perms");
        for (const [p, why] of perms) { const li = el("li", "", `${p} — «${why}»`); li.dataset.extPerm = p; ul.appendChild(li); }
        k.appendChild(ul);
      }
      if (caps.length) k.appendChild(el("div", "cw-hint", t("ext.can", { c: caps.map((x) => capWord(t, x)).join(", ") })));
      col.appendChild(k);
    }
    // the library's own sentences: why the state, the requirements, a withdrawal
    if (r) {
      const st = rowState(r);
      if (st.problem) { const w = el("p", "cw-hint ext-why", problemText(st.problem, lang)); w.dataset.extWhy = st.key.split(".").pop()!; col.appendChild(w); }
      for (const p of r.requires_optional ?? []) col.appendChild(el("p", "cw-hint", problemText(p, lang)));
      for (const b of (state.blocked ?? []).filter((x) => x.id === r.id)) {
        const w = el("p", "cw-warn ext-blocked", problemText(b.problem, lang));
        w.dataset.extBlocked = b.repo;
        col.appendChild(w);
      }
    }
    return col;
  }

  function vocabNames(e: Entry): string[] {
    const fromRow = (e.row?.data?.carried_vocabularies ?? []).map((v) => nameOfIri(v.scheme));
    if (fromRow.length) return fromRow;
    const d = (e.avail?.sections?.data ?? null) as { vocabularies?: Array<{ scheme: string }> } | null;
    return (d?.vocabularies ?? []).map((v) => nameOfIri(v.scheme));
  }

  /** «Dove la trovi»: each place of the interface, from the slots the manifest declares */
  function whereCol(e: Entry, f: ExtFacts | "asking" | "none" | null): HTMLElement {
    const r = e.row;
    const col = el("div", "ext-col ext-where");
    const hd = el("div", "ext-where-h");
    hd.appendChild(el("span", "ext-eyebrow", t("ext.where")));
    col.appendChild(hd);
    const codeActive = r?.code?.status === "installed" && !!r.code.active && !!host.loadedFacts?.(r.id);
    const ff = f && typeof f === "object" ? f : { commands: [], panels: [] };
    const places = whereOf({ commands: ff.commands, panels: ff.panels, vocabularies: vocabNames(e),
      codeActive, dataActive: r?.data?.status === "installed", lang, pluginId: r?.code?.module || e.id, extensionName: labelIn((e.row?.name ?? e.avail?.name) as Record<string, string> | string | undefined, lang) || e.id });
    if (places.some((p) => !p.active)) hd.appendChild(el("span", "ext-where-legend", t(r?.code?.status === "installed" ? "ext.w.legendRestart" : "ext.w.legend")));
    const grid = el("div", "ext-where-grid");
    grid.dataset.extWhere = String(places.length);
    for (const p of places) {
      const a = el("div", `ext-w-place${p.active ? " on" : ""}`);
      a.dataset.extWherePlace = p.kind;
      a.dataset.extWhereActive = p.active ? "1" : "0";
      a.textContent = `${p.active ? "●" : "○"} ${p.kind === "panel" ? t(`ext.w.panel.${p.place ?? "sidebar"}`, { tab: p.tab ?? "" }) : t(`ext.w.${p.kind}`)}`;
      const b = el("div", "ext-w-what");
      b.dataset.extWhereWhat = p.kind;
      const names = el("b", "", p.names.join(", "));
      if (p.kind === "python") {
        b.appendChild(el("code", "ext-mono", p.code ?? ""));
        if (p.more) b.append(" ", el("span", "cw-hint", tn("ext.w.pythonMore", p.more)));
      } else if (p.kind === "vocab") b.append(names, " ", t("ext.w.vocabWhat"));
      else if (p.kind === "door") b.append(t("ext.w.doorWhat"), " ", names, p.folders ? ` — ${t("ext.w.doorFolder")}` : "");
      else if (p.kind === "section") b.append(t("ext.w.sectionWhat"), " ", names);
      else b.appendChild(names);
      if (p.active && host.showWhere && !fromNode) {
        const sb = btn(t("ext.w.show"), "show-where", () => host.showWhere!(p, e.id), t("ext.w.showHint"), "cw-mini ext-showme");
        sb.dataset.extShowWhere = p.kind;
        b.append(" ", sb);
      }
      grid.append(a, b);
    }
    col.appendChild(grid);
    if (f === "asking") { const p = el("p", "cw-hint", t("ext.w.reading")); p.dataset.extWhereLoading = "1"; col.appendChild(p); }
    else if (!r && e.avail?.sections?.code) col.appendChild(el("p", "cw-hint", t("ext.w.afterPreview")));
    else if (f === "none" && r?.code && r.code.status !== "absent") col.appendChild(el("p", "cw-hint", t("ext.w.unknown")));
    return col;
  }

  /** the other gestures of an installed extension (the one action is on its line) */
  function actsOf(r: ExtRow, primaryKey: string): HTMLElement {
    const code = r.code;
    const acts = el("div", "cw-row ext-acts");
    if (code?.status === "installed" && code.active)
      acts.append(btn(t("ext.disable"), "disable", () => void act(state.disable(r.id), t("ext.disabled", { id: r.id }))));
    if (code && (code.status === "not_installed" || code.pending) && primaryKey !== "install-code")
      acts.append(btn(t("ext.installCode"), "install-code", () => void installCodeFlow(doc, host, state, r, repaint), t("ext.installCodeHint")));
    if (code?.status === "installed" && r.data?.status === "installed")
      acts.append(btn(t("ext.removeCode"), "remove-code", () => void removeFlow(doc, host, state, r, "code", repaint)));
    if (r.data?.status === "installed" && code?.status !== "absent" && r.registered !== false)
      acts.append(btn(t("ext.removeData"), "remove-data", () => void removeFlow(doc, host, state, r, "data", repaint)));
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
      acts.append(vb);
    }
    if (r.registered !== false)
      acts.append(btn(t("ext.removeAll"), "remove-all", () => void removeFlow(doc, host, state, r, "all", repaint), undefined, "danger"));
    else acts.append(el("span", "cw-hint", t("ext.notRegistered")));
    acts.appendChild(el("span", "ext-grow"));
    acts.appendChild(el("span", "cw-hint ext-mono", [r.id, sourceWord(t, r.source)].join(" · ")));
    return acts;
  }

  /** MICRO-PL23 · the versions of a row, side by side */
  function versionsEl(r: ExtRow): HTMLElement {
    const vbox = el("div", "ext-versions");
    vbox.dataset.extVersions = r.id;
    const v = state.versions?.[r.id];
    if (!v) { vbox.appendChild(el("p", "cw-hint", t("ext.loading"))); return vbox; }
    if ("error" in v) { vbox.appendChild(el("p", "cw-warn", v.error)); return vbox; }
    const vs = v as ExtVersions;
    if (vs.data.length) {
      vbox.appendChild(el("div", "ext-part-h", t("ext.versionsData")));
      for (const d of vs.data) {
        const line = el("div", "ext-version");
        line.dataset.extVersion = `data/${d.version}`;
        line.append(el("b", "", d.version), d.newest ? ` · ${t("ext.versionNewest")}` : "",
          d.installed_at ? ` · ${d.installed_at.replace("T", " ").replace("Z", " UTC")}` : "", " ");
        if (vs.data.length > 1)
          line.append(btn(t("ext.versionRemove"), "version-remove-data", () => void versionRemoveFlow(r, "data", d.version), t("ext.versionRemoveDataHint"), "cw-mini"));
        vbox.appendChild(line);
      }
      if (vs.data.length > 1) vbox.appendChild(el("p", "cw-hint", t("ext.versionsDataHint")));
    }
    if (vs.code.length) {
      vbox.appendChild(el("div", "ext-part-h", t("ext.versionsCode")));
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
        vbox.appendChild(line);
      }
      if (vs.code.filter((c) => !c.active && !c.registered).length > 1)
        vbox.appendChild(btn(t("ext.prune"), "prune", () => void pruneFlow(r), t("ext.pruneHint"), "cw-mini"));
    }
    return vbox;
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

  /** the line at the bottom: repositories active, extensions, updates; «Aggiorna tutto», «Pulisci…», the guide */
  function statusBar(): HTMLElement {
    const bar = el("div", "ext-status ext-dirs");
    const active = repos.filter((r) => r.enabled).length;
    const ups = (state.updates ?? []).length;
    bar.append(el("span", "", tn("ext.sb.repos", active)), el("span", "", tn("ext.sb.exts", (state.rows ?? []).length)), el("span", "", tn("ext.sb.updates", ups)));
    if (ups && !host.updatesWhy?.()) bar.append(btn(t("ext.updateAllN", { n: String(ups) }), "update-all", () => void updateAllFlow(), t("ext.updateAllHint"), "cw-mini"));
    if (state.dirs.extensions && !host.updatesWhy?.()) {
      const c = btn(t("ext.clean"), "clean", () => void cleanFlow(doc, host, state, repaint), t("ext.cleanHint"), "cw-mini");
      bar.append(c);
    }
    if (state.dirs.extensions) {
      const d = el("span", "ext-folders", t("ext.folders"));
      d.title = t("ext.dirs", { p: state.dirs.profiles ?? "", c: state.dirs.plugins ?? "" }) + "\n" + Object.entries(state.dirs).map(([k, v]) => `${k}: ${v}`).join("\n");
      bar.append(d);
    }
    bar.append(el("span", "ext-grow"));
    if (host.openGuide) {
      const g = btn(t("ext.guide"), "guide", () => host.openGuide!(), undefined, "link");
      bar.append(g);
    }
    return bar;
  }

  /** the selector of the repositories: the active one (the official first), «+ N altri»; it opens the panel */
  function repoSelector(): HTMLElement {
    const enabled = orderedRepos.filter((r) => r.enabled);
    const first = enabled[0] ?? null;
    const b = el("button", "ext-repo-sel");
    b.type = "button";
    b.dataset.ext = "repos";
    b.setAttribute("aria-expanded", String(reposOpen));
    b.setAttribute("aria-haspopup", "dialog");
    b.title = t("ext.reposSelHint");
    const probs = first ? (state.syncProblems?.[first.name] ?? (first.error ? [first.error] : [])) : [];
    const dot = el("span", `ext-repo-dot${!first ? " off" : probs.length ? " warn" : ""}`);
    dot.setAttribute("aria-hidden", "true");
    b.append(dot, el("b", "", reposWhy ? t("ext.reposHead") : first ? repoHost(first.url) : state.repos == null ? "…" : t("ext.reposNoneShort")));
    if (first?.official) { const o = el("span", "ext-badge-official", t("ext.repoOfficialMark")); b.append(o); }
    if (enabled.length > 1 || first) b.append(el("span", "ext-sub", t("ext.reposMore", { n: String(Math.max(0, enabled.length - 1)) })));
    b.append(el("span", "ext-caret", reposOpen ? "▴" : "▾"));
    b.onclick = () => { reposOpen = !reposOpen; repaint(); };
    return b;
  }

  /** MICRO-SEG08 · the panel «Repository» (board 2): the official first, pausable not removable; the others; add one */
  function reposPanel(): HTMLElement {
    const sec = el("div", "ext-repos");
    sec.dataset.extRepos = String(state.repos?.length ?? -1);
    sec.setAttribute("role", "dialog");
    sec.setAttribute("aria-label", t("ext.reposHead"));
    sec.hidden = !reposOpen;
    // MICRO-SEG13 · a press outside, Esc, the selector again close it; an address
    // being typed in it keeps it open (a work window)
    if (reposOpen) floating(sec, {
      work: true, name: "ext-repos",
      close: () => { reposOpen = false; repaint(); },
      opener: () => sec.ownerDocument.querySelector<HTMLElement>("[data-ext=repos]"),
      openerSel: "[data-ext=repos]",
    });
    const hd = el("div", "ext-repos-h");
    const hl = el("div", "ext-repos-hl");
    hl.append(el("b", "ext-missing-h", t("ext.reposHead")), el("span", "cw-hint", t("ext.reposLead")));
    hd.appendChild(hl);
    const x = el("button", "modal-x ext-repos-x", "✕");
    x.type = "button";
    x.setAttribute("aria-label", t("ext.close"));
    x.dataset.ext = "repos-close";
    x.onclick = () => { reposOpen = false; repaint(); };
    hd.appendChild(x);
    sec.appendChild(hd);
    if (reposWhy || state.repos == null) {
      const w = el("p", "cw-hint ext-repos-pad", reposWhy ?? t("ext.reposLoading"));
      w.dataset.extReposWhy = "1";
      sec.appendChild(w);
      return sec;
    }
    // the switch, one for the machine
    const on = state.online?.on ?? false;
    const lab = el("label", "ext-online ext-repos-pad");
    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = on;
    cb.dataset.extOnline = "1";
    cb.disabled = state.online?.env != null;
    cb.onchange = () => void act(state.setOnline(cb.checked).then(async (r) => { await state.refreshRepos(); return r; }),
      t(cb.checked ? "ext.onlineOn" : "ext.onlineOff"));
    lab.append(cb, ` ${t("ext.online")}`);
    const ol = el("div", "ext-repos-online");
    ol.append(lab, el("p", "cw-hint", state.online?.env != null ? t("ext.onlineEnv", { v: state.online.env }) : t("ext.onlineHint")));
    if (repos.length) ol.appendChild(btn(t("ext.repoSyncAll"), "repo-sync-all", () => void syncFlow(), t("ext.repoSyncHint"), "cw-mini"));
    sec.appendChild(ol);
    const listBox = el("div", "ext-repos-list");
    if (!official && state.officialUrl) listBox.appendChild(officialAbsent());
    if (!repos.length) listBox.appendChild(el("p", "cw-hint ext-repos-pad", t("ext.reposNone")));
    for (const r of orderedRepos) listBox.appendChild(repoRow(r));
    sec.appendChild(listBox);
    sec.appendChild(addForm());
    return sec;
  }

  /** the official repository not yet on this machine: first, unticked; ticked, it is added */
  function officialAbsent(): HTMLElement {
    const row = el("div", "ext-repo ext-repo-official-absent");
    row.dataset.extRepo = "extendedmatrix";
    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = false;
    cb.dataset.extRepoEnabled = "extendedmatrix";
    cb.setAttribute("aria-label", t("ext.repoUseOfficial"));
    cb.onchange = () => void (async () => {
      const r = await state.addRepo({ url: state.officialUrl, name: "extendedmatrix", ...(!host.reviewsWhy?.() ? { trust_reviews: true } : {}) });
      if (!r.ok) { host.toast(failText(r, lang)); return; }
      host.log(t("ext.repoAdded", { r: r.j.repository.name, u: r.j.repository.url }));
      await state.syncRepos({ name: r.j.repository.name });
      repaint();
    })();
    const mid = el("div", "ext-repo-mid");
    const t1 = el("div", "ext-repo-t");
    t1.append(el("b", "", t("ext.repoOfficialName")), el("span", "ext-badge-official", t("ext.repoOfficialMark")));
    mid.append(t1, el("span", "ext-mono ext-repo-url", state.officialUrl), el("span", "cw-hint", t("ext.repoOfficialAbsent")));
    row.append(cb, mid, el("span", ""));
    return row;
  }

  function repoRow(r: ExtRepo): HTMLElement {
    const row = el("div", "ext-repo");
    row.dataset.extRepo = r.name;
    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = r.enabled;
    cb.dataset.extRepoEnabled = r.name;
    cb.setAttribute("aria-label", t(r.official ? "ext.repoUseOfficial" : "ext.repoUse", { r: r.name }));
    cb.onchange = () => void act(state.updateRepo(r.name, { enabled: cb.checked }).then(async (x) => { await state.refreshRepos(); return x; }),
      t(cb.checked ? "ext.repoResumed" : "ext.repoPausedMsg", { r: r.name }));
    const mid = el("div", "ext-repo-mid");
    const head = el("div", "ext-repo-t ext-row-h");
    head.append(el("b", "ext-name", r.official ? t("ext.repoOfficialName") : r.name));
    if (r.official) { const o = el("span", "ext-badge-official", t("ext.repoOfficialMark")); o.dataset.extRepoOfficial = "1"; head.append(o); }
    head.append(el("span", "ext-kind", t(r.local ? "ext.repoLocal" : "ext.repoRemote")));
    if (r.has_token) head.append(el("span", "ext-kind", t("ext.repoToken")));
    // MICRO-PL28 (X8) · a signed repository: its index taken only signed, its archives opened only signed
    if (r.signed && r.keys?.length) {
      const sg = el("span", "ext-signed-ok", t("ext.repoSigned", { k: r.keys.map((k) => k.key_id).join(", ") }));
      sg.dataset.extRepoSigned = r.signed_by ?? "keys";
      sg.title = t("ext.repoSignedHint");
      head.append(sg);
    }
    if (!r.enabled) head.append(el("span", "cw-hint", t("ext.repoDisabled")));
    mid.appendChild(head);
    const url = el("span", "ext-mono ext-repo-url ext-facts", r.url);
    url.title = r.url;
    mid.appendChild(url);
    const st = r.synced_at ? t("ext.repoSynced", { n: String(r.entries ?? 0), at: r.synced_at.replace("T", " ").replace("Z", " UTC") })
      : t("ext.repoNever");
    const s = el("span", "cw-hint ext-repo-state", r.official ? `${st} · ${t("ext.repoOfficialRule")}` : st);
    s.dataset.extRepoSynced = r.synced_at ? "1" : "0";
    mid.appendChild(s);
    if (!(r.signed && r.keys?.length)) { const w = el("span", "ext-unsigned", t("ext.repoUnsigned")); w.dataset.extRepoUnsigned = "1"; mid.appendChild(w); }
    const probs = state.syncProblems?.[r.name] ?? (r.error ? [r.error] : []);
    for (const p of probs) { const w = el("p", "cw-warn", problemText(p, lang)); w.dataset.extRepoProblem = p.code; mid.appendChild(w); }
    // «Modifica»: the details of this repository, in place
    const more = el("div", "ext-repo-more");
    more.hidden = !openRows.get(`repo:${r.name}`);
    // MICRO-PL24 (X4) · whether its reviews count here
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
      more.appendChild(lr);
    }
    const lab = el("label", "ext-startup");
    const sc = el("input");
    sc.type = "checkbox";
    sc.checked = r.check_on_startup;
    sc.dataset.extRepoStartup = r.name;
    sc.onchange = () => void act(state.updateRepo(r.name, { check_on_startup: sc.checked }).then(async (x) => { await state.refreshRepos(); return x; }),
      t(sc.checked ? "ext.repoStartupOn" : "ext.repoStartupOff", { r: r.name }));
    lab.append(sc, ` ${t("ext.repoStartup")}`);
    more.appendChild(lab);
    const mb = el("div", "cw-row");
    mb.append(btn(t(r.has_token ? "ext.repoTokenChange" : "ext.repoTokenSet"), "repo-token", () => void tokenFlow(doc, host, state, r, repaint), undefined, "cw-mini"));
    if (!host.signWhy?.())
      mb.append(btn(t(r.keys?.length ? "ext.repoKeysChange" : "ext.repoKeysSet"), "repo-keys", () => void keysFlow(doc, host, state, r, repaint), t("ext.repoKeysHint"), "cw-mini"));
    more.appendChild(mb);
    mid.appendChild(more);
    const acts = el("div", "ext-repo-acts");
    acts.append(btn(t("ext.repoCheckNow"), "repo-sync", () => void syncFlow(r.name), t("ext.repoSyncHint")));
    const eb = btn(t("ext.repoEdit"), "repo-edit", () => { openRows.set(`repo:${r.name}`, more.hidden); repaint(); });
    eb.setAttribute("aria-expanded", String(!more.hidden));
    acts.append(eb);
    if (!r.official) acts.append(btn(t("ext.repoRemove"), "repo-remove", () => void removeRepoFlow(doc, host, state, r, repaint), t("ext.repoRemoveHint"), "danger"));
    row.append(cb, mid, acts);
    return row;
  }

  /** «Aggiungi un repository»: an address (https, file://, a folder) and an optional token, never shown again */
  function addForm(): HTMLElement {
    const f = el("div", "ext-repo-add");
    f.appendChild(el("div", "ext-eyebrow", t("ext.repoAddHead")));
    const ul = el("label", "ext-field");
    const url = el("input");
    url.type = "text";
    url.placeholder = t("ext.repoUrlPh");
    url.dataset.extRepoUrlInline = "1";
    ul.append(el("span", "", t("ext.repoUrlShort")), url);
    const tl = el("label", "ext-field");
    const tok = el("input");
    tok.type = "password";
    tok.autocomplete = "off";
    tok.dataset.extRepoTokenInline = "1";
    tl.append(el("span", "", t("ext.repoTokenShort")), tok);
    f.append(ul, tl);
    const row = el("div", "ext-repo-add-acts");
    if (host.pickRepoFolder)
      row.append(btn(t("ext.repoFolder"), "repo-folder", () => void host.pickRepoFolder!().then((p) => { if (p) url.value = p; })));
    row.append(btn(t("ext.repoAddMore"), "repo-add", () => void addRepoFlow(doc, host, state, repaint), t("ext.repoAddHint")));
    row.append(el("span", "ext-grow"));
    row.append(btn(t("ext.repoAddOk"), "repo-add-inline", () => void (async () => {
      const u = url.value.trim();
      if (!u) { host.toast(t("ext.repoUrlEmpty")); return; }
      const r = await state.addRepo({ url: u, token: tok.value || undefined });
      if (!r.ok) { host.toast(failText(r, lang)); return; }
      const msg = t("ext.repoAdded", { r: r.j.repository.name, u: r.j.repository.url });
      host.toast(msg);
      host.log(msg);
      const s = await state.syncRepos({ name: r.j.repository.name });
      if (s.ok) for (const x of s.j.sync.repositories) for (const p of x.problems) host.log(`${x.name}: ${problemText(p, lang)}`);
      repaint();
    })(), undefined, "primary"));
    f.appendChild(row);
    return f;
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

  /** MICRO-PL18 (W15a) · «Cartella di sviluppo» · beta, a line that opens */
  function devSection(dev: ExtDevHost): HTMLElement {
    const sec = el("section", "ext-row ext-dev");
    sec.dataset.extDev = "1";
    const line = el("div", "ext-row-h");
    const tw = el("button", "ext-tw", devOpen ? "▾" : "▸");
    tw.type = "button";
    tw.dataset.extToggle = "dev";
    tw.setAttribute("aria-expanded", String(devOpen));
    tw.setAttribute("aria-label", t(devOpen ? "ext.collapse" : "ext.expand", { n: t("ext.devHead") }));
    tw.onclick = () => { devOpen = !devOpen; repaint(); };
    const n = dev.info?.plugins?.length ?? 0;
    const title = el("div", "ext-row-title");
    title.append(el("b", "ext-name", t("ext.devHead")), el("span", "ext-badge-official", t("ext.beta")),
      el("span", "ext-row-sub", `${tn("ext.devLoaded", n)} · `), el("span", "ext-unverified", t("ext.devMark")));
    line.append(tw, title);
    sec.appendChild(line);
    const body = el("div", "ext-row-b ext-dev-b");
    body.hidden = !devOpen;
    sec.appendChild(body);
    body.appendChild(el("p", "cw-hint", t("ext.devHint")));
    if (dev.why) { const w = el("p", "cw-warn", dev.why); w.dataset.extDevWhy = "1"; body.appendChild(w); return sec; }
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
    body.appendChild(row);
    if (info?.env) body.appendChild(el("p", "cw-hint", t("ext.devEnv")));
    if (info?.setting && !info.exists) {
      const w = el("p", "cw-warn", t("ext.devMissing", { p: info.setting }));
      w.dataset.extDevMissing = "1";
      body.appendChild(w);
    }
    const listed = info?.plugins ?? [];
    if (info?.exists && !listed.length) body.appendChild(el("p", "cw-hint", t("ext.devNone")));
    for (const p of listed) {
      const got = dev.loaded.find((x) => x.id === p.id);
      const r = el("div", "ext-dev-row");
      r.dataset.extDevId = p.id;
      r.dataset.extDevState = got?.state ?? "absent";
      const hd = el("div", "ext-row-title");
      hd.append(el("b", "ext-name", p.id), el("span", "ext-mono ext-ver", p.version ?? ""), el("span", "ext-unverified", t("ext.devMark")));
      r.appendChild(hd);
      r.appendChild(el("div", "ext-facts ext-mono", p.dev_folder));
      const st = got?.state ?? "absent";
      r.appendChild(el("div", `ext-state ext-${st === "loaded" ? "active" : "incomplete"}`, t(`ext.devState.${st}`)));
      const lng = lang.startsWith("it") ? "it" : "en";
      for (const pr of (got?.problems ?? p.problems ?? [])) r.appendChild(el("p", "cw-warn", pr[lng]));
      for (const nn of (got?.notes ?? p.warnings ?? [])) r.appendChild(el("p", "cw-hint", nn[lng]));
      if (got) {
        const acts = el("div", "cw-row ext-acts");
        acts.appendChild(btn(t("ext.devReload"), "dev-reload", () => void dev.reload(p.id).then((e) => say(e, t("ext.devReloaded", { id: p.id }))), t("ext.devReloadHint")));
        r.appendChild(acts);
      }
      body.appendChild(r);
    }
    return sec;
  }
}

/** «00:12» of today, else the date: when a repository was read */
function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return d.toDateString() === now.toDateString() ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function hostWord(h: string): string {
  return ({ emstudio: "EMStudio", blender: "Blender", node: "StratiGraph" } as Record<string, string>)[h] ?? h;
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
  // MICRO-PL28 (X8) · signed: who published these bytes; the library's sentence says it is not a review
  const sig = pv.signature;
  if (sig?.status === "signed" && sig.key_id) {
    const sg = el("div", "ext-signed-line");
    sg.dataset.extSignature = "signed";
    sg.appendChild(signedMark(doc, t, { key_id: sig.key_id, repos: sig.repos }));
    sg.append(" — ", t("ext.signedNotReview"));
    body.appendChild(sg);
  }
  for (const w of pv.warnings ?? []) if (w.code !== "sign_signed") body.appendChild(el("p", "cw-hint", problemText(w, lang)));
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
    const sg = pv.signature?.status === "signed" && pv.signature.key_id ? pv.signature : null;
    h.append(" ", c.verified ? reviewedMark(doc, t, c.reviewed)
      // MICRO-SEG20 · signed: «not reviewed», the missing step — never «NOT VERIFIED» under «signed by the key …»
      : sg ? el("span", "ext-unverified ext-unreviewed", t("ext.signedUnreviewedRepo", { r: sg.repos?.length ? sg.repos.join(", ") : (pv.source ?? "") }))
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

/** MICRO-COR05 E12 · the archive chosen in the page, as the bridge reads it:
 *  its bytes in base64, with its name */
export async function archiveOfFile(f: File): Promise<ExtArchive> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { zip_b64: btoa(bin), name: f.name };
}

/** MICRO-COR05 E12 · an archive DROPPED on the window installs as «Install
 *  .zip…» does (preview, confirmation, install). In a browser the page's own
 *  drop gives the file; on the desktop the system's drop gives a path, and the
 *  shell hands it to the window as `em-ext-archive` (main.ts). */
function dropToInstall(doc: Document, box: HTMLElement, host: ExtWindowHost, state: ExtensionsState, repaint: () => void): void {
  const take = (a: ExtArchive): void => { void installArchive(doc, host, state, a, repaint); };
  box.addEventListener("dragover", (e) => {
    if (!(e.dataTransfer?.types ?? []).includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    box.classList.add("drop-target");
  });
  box.addEventListener("dragleave", () => box.classList.remove("drop-target"));
  box.addEventListener("drop", (e) => {
    box.classList.remove("drop-target");
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    // the window took it: the page's loader must not read it as an em.json
    e.preventDefault();
    e.stopPropagation();
    if (!/\.zip$/i.test(f.name)) { host.toast(host.t("ext.dropNotZip", { name: f.name })); return; }
    void archiveOfFile(f).then(take);
  });
  box.addEventListener("em-ext-archive", (e) => {
    const a = (e as CustomEvent<ExtArchive>).detail;
    if (a) take(a);
  });
}

async function installFlow(doc: Document, host: ExtWindowHost, state: ExtensionsState, folder: boolean, repaint: () => void): Promise<void> {
  const a = await host.pickArchive(doc, folder);
  if (!a) return;
  await installArchive(doc, host, state, a, repaint);
}

/** preview → confirmation → install (the buttons, and an archive dropped on the window) */
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
  // MICRO-SEG08 · an extension that came from a repository takes its code from the repository
  // again: the archive checked against the index (and its signature), the source kept — never
  // «da disco» because the cached archive was read by path (measured on Geofisica, 21 Nov)
  if (isRepoSource(r.source) && !host.reposWhy?.() && state.repos == null) await state.refreshRepos();
  if (isRepoSource(r.source) && !host.reposWhy?.() && (state.repos ?? []).some((x) => x.name === r.source && x.enabled)) {
    const pv = await state.previewFrom(r.source!, r.id, r.version);
    if (pv.ok && pv.j.preview.code?.present) {
      const p = { ...pv.j.preview, data: undefined };
      const body = confirmBody(doc, host, p as ExtPreview);
      if (pv.j.preview.plan) body.appendChild(planBody(doc, host, pv.j.preview.plan, pv.j.preview.repository));
      const ans = await host.dialog({ title: t("ext.codeTitle"), body, ok: t("ext.installCodeOk"), kind: "ext-install-code" });
      if (!ans.ok) return;
      const res = await state.installFrom(r.source!, r.id, { version: pv.j.preview.version, parts: "all",
        trust: !pv.j.preview.code.verified, withRequires: true, trustRequires: true });
      if (!res.ok) { host.toast(t("ext.installFailed", { why: failText(res, lang) })); return; }
      const code = res.j.result.installed?.code;
      const msg = code?.status === "installed" ? t("ext.codeInstalled", { id: r.id, v: code.version ?? "" })
        : `${r.id}: ${problemText(code?.reason ?? null, lang)}`;
      host.toast(msg);
      host.log(msg);
      await state.refresh();
      await state.refreshRepos();
      host.afterChange();
      repaint();
      return;
    }
  }
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
                         repo: { name: string; archive_hash?: string; cached?: boolean; signed?: { key_id: string } | null } | undefined): HTMLElement {
  const t = host.t, lang = host.lang();
  const el = maker(doc);
  const box = el("div", "ext-plan");
  box.dataset.extPlan = String(plan.steps.length);
  if (repo) {
    const v = el("div", "cw-hint ext-verified", t("ext.repoVerified", { r: repo.name, h: String(repo.archive_hash ?? "").slice(7, 19) }));
    v.dataset.extArchiveVerified = "1";
    box.appendChild(v);
    // MICRO-PL28 (X8) · and signed by the repository's key, over that archive_hash
    if (repo.signed?.key_id) {
      const s = el("div", "cw-hint ext-signed", t("ext.repoSignedVerified", { r: repo.name, k: repo.signed.key_id }));
      s.dataset.extArchiveSigned = repo.signed.key_id;
      box.appendChild(s);
    }
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
export function addRepoBody(doc: Document, host: Pick<ExtWindowHost, "t" | "pickRepoFolder" | "signWhy">, officialUrl: string):
    { body: HTMLElement; values: () => { url: string; name: string; token: string; check_on_startup: boolean; trust_reviews?: boolean; keys: string[] } } {
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
  // MICRO-PL28 (X8) · its minisign public key, given by whoever runs it (as the URL): with it, signed or refused
  const key = el("textarea");
  key.rows = 2;
  key.placeholder = "RW…";
  key.spellcheck = false;
  key.dataset.extRepoKeyNew = "1";
  if (!host.signWhy?.()) {
    const lk = el("label", "ext-field");
    lk.append(el("span", "", t("ext.repoKeyLabel")), key);
    body.appendChild(lk);
    body.appendChild(el("p", "cw-hint", t("ext.repoKeyHint")));
  }
  const off = body.querySelector<HTMLButtonElement>("[data-ext='repo-official']");
  if (off) { const was = off.onclick; off.onclick = (e) => { (was as ((e: MouseEvent) => void) | null)?.(e); if (!revTouched) rev.checked = true; }; }
  return { body, values: () => ({ url: url.value.trim(), name: name.value.trim(), token: token.value, check_on_startup: start.checked,
    keys: keysOf(key.value),
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
    ...(v.trust_reviews !== undefined && !host.reviewsWhy?.() ? { trust_reviews: v.trust_reviews } : {}),
    ...(v.keys.length && !host.signWhy?.() ? { keys: v.keys } : {}) });
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

/** MICRO-PL28 (X8) · «Chiavi di firma…»: the repository's public keys, replaced (none: no longer signed) */
async function keysFlow(doc: Document, host: ExtWindowHost, state: ExtensionsState, r: ExtRepo, repaint: () => void): Promise<void> {
  const t = host.t, lang = host.lang();
  const body = doc.createElement("div");
  const p = doc.createElement("p");
  p.textContent = t("ext.repoKeysAsk", { r: r.name });
  const input = doc.createElement("textarea");
  input.rows = 3;
  input.spellcheck = false;
  input.placeholder = "RW…";
  input.value = (r.keys ?? []).map((k) => k.key).join("\n");
  input.dataset.extRepoKeys = r.name;
  const hint = doc.createElement("p");
  hint.className = "cw-hint";
  hint.textContent = t("ext.repoKeysEmpty");
  body.append(p, input, hint);
  const ans = await host.dialog({ title: t("ext.repoKeysTitle"), body, ok: t("ext.repoKeysOk"), kind: "ext-repo-keys" });
  if (!ans.ok) return;
  const keys = keysOf(input.value);
  const res = await state.updateRepo(r.name, { keys });
  if (!res.ok) { host.toast(failText(res, lang)); return; }
  const got = res.j.repository;
  const msg = got.keys?.length ? t("ext.repoKeysSaved", { r: r.name, k: got.keys.map((k) => k.key_id).join(", ") })
    : t("ext.repoKeysCleared", { r: r.name });
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
