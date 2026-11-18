/**
 * MICRO-U-VOCABOLARI-COME-FONT (E.D., 18 Nov 2026) · the vocabularies in the
 * page: what this machine has installed (asked of the bridge, never read from
 * the disk), the window «Vocabolari», the sign beside a controlled value in the
 * Inspector and the guided link «Collega a vocabolario…».
 *
 * Nothing here knows `main.ts`: the host (`VocabHost`) gives the bridge, the
 * file, the store's writes and the words. The logic of the double value is
 * `vocab-terms.ts`; the folder and the index are s3Dgraphy's
 * (`authorities.packages`, through the bridge's /vocab/* routes).
 */
import {
  RULE_MISSING, labelIn, qualeOf, sameText, termOf, valueLabel,
  type AlignedConcept, type ConceptEntry, type Term, type ValueLabel, type VocabSection, type VocabSummary,
} from "./vocab-terms";

/** what the bridge answers for one URI (/vocab/concepts) */
type Looked = { concept: ConceptEntry; vocab: VocabSummary; aligned?: AlignedConcept[] };

export interface Candidate {
  uri: string;
  label: string;
  lang: string;
  match: "exact" | "close";
  vocabulary: string;
  version?: string;
  attribution?: string;
  tier?: string;
  broader?: string[];
}

export interface VocabHost {
  t(key: string, vars?: Record<string, string>): string;
  /** the interface language (the label shown) */
  lang(): string;
  bridge(): Promise<string>;
  toast(msg: string): void;
  /** the open file's declaration and whether its terms travel in it */
  file(): { name: string; vocabularies: VocabSection | null } | null;
  setEmbed(on: boolean): void;
  /** the live nodes of the graph shown */
  nodes(): Array<{ id: string; node_type?: string; name?: unknown; description?: unknown; data?: Record<string, unknown> | null }>;
  /** write terms on nodes: ONE undo step, a line in the Log */
  link(nodeIds: string[], term: Term, message: string): void;
  /** the vocabularies changed (installed / removed): warnings and labels again */
  changed(): void;
  /** a .emvocab.zip chosen by the person, as bytes (null: none) */
  pickZip(doc: Document): Promise<Uint8Array | null>;
  /** any file chosen by the person (`accept` as an <input type=file>), as bytes (MICRO-PL02) */
  pickFile?(doc: Document, accept: string): Promise<Uint8Array | null>;
  /** open an address outside the page (a vocabulary's terms of use) */
  openExternal?(url: string): void;
  /** a line in the Log */
  log?(msg: string): void;
  /** the page's own dialog with a body of ours */
  dialog(o: { title: string; body: HTMLElement; ok: string; kind: string }): Promise<boolean>;
  /** the central catalogue's address (settings), default the release of ExtendedMatrix/vocabularies */
  catalogUrl(): string;
  /** the StratiGraph node's catalogue, when one is configured */
  nodeCatalogUrl(): string | null;
}

/** what the page knows of the machine's vocabularies */
export class VocabState {
  installed: VocabSummary[] | null = null;
  dir = "";
  error: string | null = null;
  /** MICRO-PL02 · the alignments installed here and the manager's last decisions */
  alignments: Array<{ name: string; rows: number; verified: number }> = [];
  log: Array<Record<string, unknown>> = [];
  private concepts = new Map<string, Looked | null>();
  private asking = new Set<string>();
  rev = 0;
  constructor(private host: VocabHost) {}

  installedIds(): Set<string> | null {
    return this.installed ? new Set(this.installed.filter((s) => s.status === "ready").map((s) => s.id)) : null;
  }
  installedMap(): Map<string, VocabSummary> {
    return new Map((this.installed ?? []).map((s) => [s.id, s]));
  }
  conceptMap(): Map<string, ConceptEntry> {
    const m = new Map<string, ConceptEntry>();
    for (const [k, v] of this.concepts) if (v) m.set(k, v.concept);
    return m;
  }
  lookup = (uri: string): Looked | null => this.concepts.get(uri) ?? null;

  private async get<T>(path: string): Promise<T | null> {
    try {
      const r = await fetch(`${await this.host.bridge()}${path}`, { cache: "no-store" });
      const j = await r.json() as T & { ok?: boolean; error?: string };
      if (!r.ok || j.ok === false) { this.error = j.error ?? `HTTP ${r.status}`; return null; }
      return j;
    } catch (e) { this.error = String(e); return null; }
  }
  async post<T>(path: string, body: unknown): Promise<T | null> {
    try {
      const r = await fetch(`${await this.host.bridge()}${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json() as T & { ok?: boolean; error?: string };
      if (!r.ok || j.ok === false) { this.error = j.error ?? `HTTP ${r.status}`; return null; }
      this.error = null;
      return j;
    } catch (e) { this.error = String(e); return null; }
  }

  async refresh(): Promise<void> {
    const j = await this.get<{ installed: VocabSummary[]; dir: string }>("/vocab/installed");
    if (j) { this.installed = j.installed; this.dir = j.dir; this.error = null; }
    if (j) {
      const a = await this.get<{ alignments: VocabState["alignments"] }>("/vocab/alignments");
      this.alignments = a?.alignments ?? [];
      const l = await this.get<{ log: VocabState["log"] }>("/vocab/log?limit=20");
      this.log = l?.log ?? [];
      this.error = null;
    }
    this.concepts.clear();
    this.rev++;
    await this.prefetch();
    this.host.changed();
  }

  /** the concepts of the terms on the graph shown, asked once */
  async prefetch(): Promise<void> {
    const want = [...new Set(this.host.nodes().map((n) => termOf(n)?.concept).filter((u): u is string => !!u))]
      .filter((u) => !this.concepts.has(u) && !this.asking.has(u));
    if (!want.length || !this.installed) return;
    want.forEach((u) => this.asking.add(u));
    for (let i = 0; i < want.length; i += 40) {
      const part = want.slice(i, i + 40);
      const j = await this.get<{ concepts: Record<string, Looked> }>(
        `/vocab/concepts?${part.map((u) => `uri=${encodeURIComponent(u)}`).join("&")}`);
      for (const u of part) { this.concepts.set(u, j?.concepts[u] ?? null); this.asking.delete(u); }
    }
    this.rev++;
    this.host.changed();
  }

  async search(text: string, lang: string, serves: string | null): Promise<Candidate[]> {
    const q = new URLSearchParams({ text, lang, limit: "12" });
    if (serves) q.set("serves", serves);
    const j = await this.get<{ candidates: Candidate[] }>(`/vocab/search?${q}`);
    return j?.candidates ?? [];
  }

  label(n: Parameters<typeof valueLabel>[0]): ValueLabel {
    return valueLabel(n, this.host.lang(), this.lookup, this.host.file()?.vocabularies ?? null);
  }
}

// ── the sign beside a value (Inspector) ─────────────────────────────────────

/** «◆ calcare · iccd-ra-materia» — or «◇ non controllato» with its gesture */
export function valueTermEl(doc: Document, host: VocabHost, state: VocabState,
                            node: Parameters<typeof valueLabel>[0] & { id: string },
                            controlled: boolean, openLink: (id: string) => void): HTMLElement | null {
  const t = host.t;
  const term = termOf(node);
  if (!term && !controlled) return null;
  const row = doc.createElement("div");
  row.className = "vt-row";
  row.dataset.valueTerm = node.id;
  const sign = doc.createElement("span");
  sign.className = "vt-sign";
  const words = doc.createElement("span");
  words.className = "vt-words";
  if (term) {
    const lab = state.label(node);
    row.dataset.state = lab.missingVocabulary ? "missing" : "linked";
    sign.textContent = "◆";
    words.textContent = lab.missingVocabulary
      ? t("vt.missing", { label: lab.text, v: term.vocabulary ?? "?" })
      : t("vt.linked", { label: lab.text, lang: lab.lang ?? "", v: lab.vocabulary ?? term.vocabulary ?? "" });
    row.title = [t("vt.code", { uri: term.concept }),
      term.label ? t("vt.written", { label: term.label, lang: term.lang || "?" }) : "",
      term.version ? t("vt.version", { v: term.version }) : "",
      lab.via ? t("vt.via", { v: lab.via.vocabulary, match: lab.via.match }) : "",
      lab.attribution ?? "", lab.via?.attribution ?? ""].filter(Boolean).join("\n");
    if (lab.via) row.dataset.via = lab.via.vocabulary;
    if (lab.attribution) {
      const a = doc.createElement("div");
      a.className = "vt-attr";
      a.textContent = lab.attribution;
      row.append(sign, words, a);
    } else row.append(sign, words);
  } else {
    row.dataset.state = "uncontrolled";
    sign.textContent = "◇";
    words.textContent = t("vt.uncontrolled");
    row.title = t("vt.uncontrolledTip");
    const b = doc.createElement("button");
    b.type = "button";
    b.className = "tv-act";
    b.dataset.vtLink = node.id;
    b.textContent = t("vt.link");
    b.addEventListener("click", () => openLink(node.id));
    row.append(sign, words, b);
  }
  return row;
}

// ── «Collega a vocabolario…» ────────────────────────────────────────────────

/** The guided link: the candidates the installed vocabularies propose for
 *  the text (exact before close, in the text's language), the person chooses
 *  one or refuses; for this value or for every value with the same text (how
 *  many, said). Nothing is written without that choice. */
export async function linkDialog(host: VocabHost, state: VocabState, nodeId: string,
                                 textLang: string): Promise<boolean> {
  const t = host.t;
  const nodes = host.nodes();
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  const text = String((node.data && "value" in (node.data ?? {}) ? node.data!.value : node.description) ?? "").trim();
  const same = sameText(nodes, node);
  const name = String(node.name ?? "");
  const cands = await state.search(text, textLang, qualeOf(name));
  const doc = document;
  const body = doc.createElement("div");
  body.className = "vl-body";
  body.dataset.vocabLink = nodeId;
  const lead = doc.createElement("p");
  lead.textContent = t("vl.lead", { name, text });
  body.appendChild(lead);
  if (!cands.length) {
    const p = doc.createElement("p");
    p.className = "vl-none";
    p.textContent = state.installed && state.installed.length ? t("vl.none") : t("vl.noneInstalled");
    body.appendChild(p);
    await host.dialog({ title: t("vl.title"), body, ok: t("vl.close"), kind: "vocab-link" });
    return false;
  }
  const list = doc.createElement("div");
  list.className = "vl-list";
  list.setAttribute("role", "radiogroup");
  cands.forEach((c, i) => {
    const lab = doc.createElement("label");
    lab.className = "vl-cand";
    lab.dataset.match = c.match;
    const r = doc.createElement("input");
    r.type = "radio"; r.name = "vl-cand"; r.value = String(i); r.dataset.vlCand = c.uri;
    if (i === 0) r.checked = true;
    const w = doc.createElement("span");
    w.className = "vl-w";
    w.textContent = `${c.label}${c.lang ? ` (${c.lang})` : ""}`;
    const m = doc.createElement("span");
    m.className = `vl-m ${c.match}`;
    m.textContent = t(`vl.match.${c.match}`);
    const v = doc.createElement("span");
    v.className = "vl-v";
    v.textContent = `${c.vocabulary} ${c.version ?? ""}`.trim();
    v.title = `${c.uri}\n${c.attribution ?? ""}`;
    lab.append(r, w, m, v);
    list.appendChild(lab);
  });
  body.appendChild(list);
  const scope = doc.createElement("div");
  scope.className = "vl-scope";
  const one = doc.createElement("label");
  const r1 = doc.createElement("input"); r1.type = "radio"; r1.name = "vl-scope"; r1.value = "one"; r1.checked = true;
  one.append(r1, ` ${t("vl.one")}`);
  const all = doc.createElement("label");
  const r2 = doc.createElement("input"); r2.type = "radio"; r2.name = "vl-scope"; r2.value = "all"; r2.dataset.vlAll = String(same.length);
  all.append(r2, ` ${t("vl.all", { n: String(same.length), text })}`);
  if (same.length < 2) { r2.disabled = true; all.classList.add("dim"); }
  scope.append(one, all);
  body.appendChild(scope);
  const note = doc.createElement("p");
  note.className = "vl-note";
  note.textContent = t("vl.note");
  body.appendChild(note);
  const ok = await host.dialog({ title: t("vl.title"), body, ok: t("vl.ok"), kind: "vocab-link" });
  if (!ok) return false;
  const pick = cands[Number(body.querySelector<HTMLInputElement>("input[name=vl-cand]:checked")?.value ?? 0)];
  const toAll = body.querySelector<HTMLInputElement>("input[name=vl-scope]:checked")?.value === "all";
  const ids = toAll ? same.map((n) => String(n.id)) : [nodeId];
  // an EXACT candidate is the same word: its language is the word's (a lone
  // «Limestone» says no language of its own); else the language guessed
  const lang = pick.match === "exact" && pick.lang ? pick.lang : textLang;
  const term: Term = { concept: pick.uri, label: text, lang, vocabulary: pick.vocabulary,
                       ...(pick.version ? { version: pick.version } : {}) };
  host.link(ids, term, t("vl.done", { n: String(ids.length), text, label: pick.label, v: pick.vocabulary }));
  return true;
}

// ── the window «Vocabolari» ─────────────────────────────────────────────────

const trTitle = (s: VocabSummary, lang: string): string =>
  (s.title && (s.title[lang] ?? s.title.en ?? Object.values(s.title)[0])) || s.id;

/** The window's content, rebuilt whole on every change. */
export function vocabContent(doc: Document, host: VocabHost, state: VocabState): HTMLElement {
  const t = host.t;
  const lang = host.lang();
  const root = doc.createElement("div");
  root.className = "voc-root";
  const h = (txt: string): HTMLElement => { const e = doc.createElement("h4"); e.className = "cw-sect"; e.textContent = txt; return e; };
  const btn = (txt: string, key: string, fn: () => void, tip = ""): HTMLButtonElement => {
    const b = doc.createElement("button");
    b.type = "button"; b.className = "tv-act"; b.textContent = txt; b.dataset.vw = key;
    if (tip) b.title = tip;
    b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
    return b;
  };
  const busy = async (fn: () => Promise<unknown>, done: string): Promise<void> => {
    const r = await fn();
    if (r) { host.toast(done); await state.refresh(); }
    else host.toast(t("vw.failed", { why: state.error ?? "?" }));
  };

  // — installed on this machine
  root.appendChild(h(t("vw.installed")));
  if (state.installed === null) {
    const p = doc.createElement("p");
    p.className = "voc-note";
    p.textContent = state.error ? t("vw.noBridge", { why: state.error }) : t("vw.asking");
    root.appendChild(p);
  } else if (!state.installed.length) {
    const p = doc.createElement("p");
    p.className = "voc-note";
    p.textContent = t("vw.none");
    root.appendChild(p);
  }
  for (const s of state.installed ?? []) {
    const card = doc.createElement("div");
    card.className = "voc-card";
    card.dataset.vocab = s.id;
    card.dataset.status = s.status ?? "";
    const title = doc.createElement("div");
    title.className = "voc-title";
    title.textContent = trTitle(s, lang);
    const meta = doc.createElement("div");
    meta.className = "voc-meta";
    meta.textContent = t("vw.meta", {
      id: s.id, v: s.version ?? "?", date: s.snapshot_date ?? "?",
      langs: (s.languages ?? []).length > 8 ? t("vw.nLangs", { n: String(s.languages!.length) }) : (s.languages ?? []).join(", "),
      tier: s.tier ?? "?", lic: s.license ?? "?" });
    const attr = doc.createElement("div");
    attr.className = "vt-attr";
    attr.textContent = s.attribution ?? "";
    card.append(title, meta, attr);
    // MICRO-PL02 · every version side by side, who brought each, who owns the scheme
    const vers = s.versions ?? [];
    if (vers.length > 1 || (s.carriers ?? []).length) {
      const v = doc.createElement("div");
      v.className = "voc-meta";
      v.dataset.vwVersions = String(vers.length || 1);
      v.textContent = t("vw.vocVersions", { list: versionsLine(s, t) });
      card.appendChild(v);
    }
    if (s.owner) {
      const o = doc.createElement("div");
      o.className = "voc-meta";
      o.dataset.vwOwner = s.owner;
      o.textContent = t("vw.owner", { who: whoName(s.owner, t) });
      card.appendChild(o);
    }
    if (s.orphan) {
      card.dataset.orphan = "1";
      const p = doc.createElement("p");
      p.className = "voc-note";
      p.textContent = t("vw.orphan", { who: (s.removed_carriers ?? []).map((c) => whoName(c, t)).join(", ") });
      card.appendChild(p);
    }
    if (s.status === "stub") {
      const p = doc.createElement("p");
      p.className = "voc-note";
      p.textContent = t("vw.stub");
      card.appendChild(p);
    }
    if (s.local_copy) {
      const p = doc.createElement("p");
      p.className = "voc-note";
      p.textContent = t("vw.localCopy");
      card.appendChild(p);
    }
    const acts = doc.createElement("div");
    acts.className = "voc-acts";
    if (s.status === "stub") {
      // tier C, phase 1: the source's terms page, then the file downloaded by hand (its digest checked)
      const page = s.fetch?.terms ?? s.fetch?.url;
      if (page && host.openExternal) acts.appendChild(btn(t("vw.openTerms"), "open-terms", () => host.openExternal!(page), page));
      acts.appendChild(btn(t("vw.fetchByHand"), "fetch-by-hand", () => void (async () => {
        const bytes = await (host.pickFile ? host.pickFile(doc, "*/*") : host.pickZip(doc));
        if (!bytes) return;
        await busy(() => state.post("/vocab/fetch-local", { id: s.id, version: s.version, file_b64: b64(bytes) }),
                   t("vw.fetched", { id: s.id }));
      })(), t("vw.fetchByHandTip")));
      acts.appendChild(btn(t("vw.fetchLocal"), "fetch-local", () => void busy(() => state.post("/vocab/fetch-local", { id: s.id }), t("vw.fetched", { id: s.id })), t("vw.fetchLocalTip")));
    }
    if (vers.length > 1)
      for (const v of vers)
        acts.appendChild(btn(t("vw.removeVersion", { v: v.version ?? "?" }), "remove-version",
          () => void busy(() => state.post("/vocab/remove", { id: s.id, version: v.version }), t("vw.removed", { id: `${s.id} ${v.version ?? ""}` }))));
    acts.appendChild(btn(t("vw.remove"), "remove", () => void busy(() => state.post("/vocab/remove", { id: s.id }), t("vw.removed", { id: s.id }))));
    card.appendChild(acts);
    root.appendChild(card);
  }

  // — install
  root.appendChild(h(t("vw.install")));
  const inst = doc.createElement("div");
  inst.className = "voc-acts";
  inst.appendChild(btn(t("vw.fromCentral"), "central", () => void installFromCatalog(host, state, host.catalogUrl()),
    host.catalogUrl()));
  const nodeCat = host.nodeCatalogUrl();
  if (nodeCat) inst.appendChild(btn(t("vw.fromNode"), "node", () => void installFromCatalog(host, state, nodeCat), nodeCat));
  inst.appendChild(btn(t("vw.fromFile"), "file", () => void (async () => {
    const bytes = await host.pickZip(doc);
    if (!bytes) return;
    // an .emvocab.zip, or a community package: the bridge hands its [[data.vocabularies]] to the manager
    const r = await state.post<InstallAnswer>("/vocab/install", { zip_b64: b64(bytes) });
    if (!r) { host.toast(t("vw.failed", { why: state.error ?? "?" })); return; }
    host.toast(r.extension ? t("vw.installedFrom", { n: String((r.installed as VocabSummary[]).length), pkg: r.extension })
                           : t("vw.installedOk"));
    sayWarnings(host, r.warnings);
    await state.refresh();
  })(), t("vw.fromFileTip")));
  inst.appendChild(btn(t("vw.updates"), "updates", () => void (async () => {
    const q = new URLSearchParams({ url: host.catalogUrl() });
    const r = await fetch(`${await host.bridge()}/vocab/updates?${q}`).then((x) => x.json(), () => null) as { updates?: Array<{ id: string; url: string; available: { version: string } }> } | null;
    if (!r?.updates) { host.toast(t("vw.failed", { why: state.error ?? "?" })); return; }
    if (!r.updates.length) { host.toast(t("vw.upToDate")); return; }
    for (const u of r.updates) await busy(() => state.post("/vocab/install", { url: u.url }), t("vw.updated", { id: u.id, v: u.available.version }));
  })()));
  root.appendChild(inst);

  // — alignments (MICRO-PL02): a label through a concept a person VERIFIED
  root.appendChild(h(t("vw.alignments")));
  const al = doc.createElement("div");
  al.className = "voc-alignments";
  if (!state.alignments.length) {
    const p = doc.createElement("p");
    p.className = "voc-note";
    p.textContent = t("vw.alignmentsNone");
    al.appendChild(p);
  }
  for (const a of state.alignments) {
    const row = doc.createElement("div");
    row.className = "voc-used";
    row.dataset.alignment = a.name;
    row.textContent = t("vw.alignment", { name: a.name, n: String(a.rows), v: String(a.verified) });
    row.appendChild(btn(t("vw.remove"), "remove-alignment", () => void busy(() => state.post("/vocab/alignments/remove", { name: a.name }), t("vw.removed", { id: a.name }))));
    al.appendChild(row);
  }
  const alActs = doc.createElement("div");
  alActs.className = "voc-acts";
  alActs.appendChild(btn(t("vw.alignmentsFromFile"), "alignments-file", () => void (async () => {
    const bytes = await (host.pickFile ? host.pickFile(doc, ".yaml,.yml,.json") : host.pickZip(doc));
    if (!bytes) return;
    await busy(() => state.post("/vocab/alignments/install", { file_b64: b64(bytes) }), t("vw.alignmentsOk"));
  })(), t("vw.alignmentsTip")));
  al.appendChild(alActs);
  root.appendChild(al);

  // — what the manager decided (duplicates, a copy replaced by its owner, a package gone)
  const said = state.log.filter((e) => e.kind === "duplicate_kept" || e.kind === "replaced_by_owner").slice(-5);
  if (said.length) {
    root.appendChild(h(t("vw.log")));
    for (const e of said) {
      const p = doc.createElement("p");
      p.className = "voc-note";
      p.dataset.vwLog = String(e.kind);
      p.textContent = String((lang.startsWith("it") ? e.message_it : e.message) ?? e.kind);
      root.appendChild(p);
    }
  }

  // — this file
  const file = host.file();
  root.appendChild(h(t("vw.thisFile", { name: file?.name ?? "—" })));
  const used = file?.vocabularies?.used ?? {};
  const have = state.installedIds();
  const ids = new Set<string>(Object.keys(used));
  for (const n of host.nodes()) { const tt = termOf(n); if (tt?.vocabulary) ids.add(tt.vocabulary); }
  if (!ids.size) {
    const p = doc.createElement("p");
    p.className = "voc-note";
    p.textContent = t("vw.fileNone");
    root.appendChild(p);
  }
  for (const id of [...ids].sort()) {
    const row = doc.createElement("div");
    row.className = "voc-used";
    row.dataset.used = id;
    const ok = have ? have.has(id) : null;
    row.dataset.state = ok === null ? "unknown" : ok ? "installed" : "missing";
    const d = used[id] as Record<string, unknown> | undefined;
    row.textContent = t(ok === false ? "vw.usedMissing" : "vw.used", {
      id, v: String((d?.versions_used as string[] | undefined)?.join(", ") ?? d?.version ?? ""),
      n: String(d?.concepts_used ?? "") });
    if (ok === false) row.appendChild(btn(t("vw.install1"), "install-missing", () => void installFromCatalog(host, state, host.catalogUrl(), id)));
    root.appendChild(row);
  }
  const emb = doc.createElement("label");
  emb.className = "voc-embed";
  const cb = doc.createElement("input");
  cb.type = "checkbox";
  cb.dataset.vw = "embed";
  cb.checked = !!file?.vocabularies?.embed;
  cb.disabled = !file;
  cb.addEventListener("change", () => host.setEmbed(cb.checked));
  emb.append(cb, ` ${t("vw.embed")}`);
  emb.title = t("vw.embedTip");
  root.appendChild(emb);
  return root;
}

async function installFromCatalog(host: VocabHost, state: VocabState, url: string, only?: string): Promise<void> {
  const t = host.t;
  const q = new URLSearchParams({ url });
  let r: { packages?: Array<{ id: string; url: string; version: string; tier?: string }>; error?: string } | null = null;
  try { r = await fetch(`${await host.bridge()}/vocab/catalog?${q}`).then((x) => x.json()); } catch (e) { r = { error: String(e) }; }
  if (!r?.packages) { host.toast(t("vw.failed", { why: r?.error ?? "?" })); return; }
  const want = r.packages.filter((p) => !only || p.id === only);
  if (!want.length) { host.toast(t("vw.notInCatalog", { id: only ?? "" })); return; }
  for (const p of want) {
    const got = await state.post<InstallAnswer>("/vocab/install", { url: p.url });
    host.toast(got ? t("vw.updated", { id: p.id, v: p.version }) : t("vw.failed", { why: state.error ?? "?" }));
    if (got) sayWarnings(host, got.warnings);
  }
  await state.refresh();
}

type InstallAnswer = { installed: VocabSummary | VocabSummary[]; extension?: string;
                       warnings?: Array<{ kind: string; message: string; message_it: string }> };

function b64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** a duplicate said where the person looks: a toast and a line in the Log, in the interface's language */
function sayWarnings(host: VocabHost, warnings: InstallAnswer["warnings"]): void {
  for (const w of warnings ?? []) {
    const msg = host.lang().startsWith("it") ? w.message_it : w.message;
    host.toast(msg);
    host.log?.(msg);
  }
}

/** who brought a vocabulary, in words: the central repository, a node, a package, the person, this machine */
export function whoName(c: string, t: VocabHost["t"]): string {
  if (c === "vocabularies") return t("vw.who.central");
  if (c === "user") return t("vw.who.user");
  if (c === "local") return t("vw.who.local");
  if (c.startsWith("node:")) return t("vw.who.node", { host: c.slice(5) });
  if (c.startsWith("extension:")) return c.slice(10);
  return c;
}

/** «0.1.0 (statuaria) · 0.2.0 (ritratti)» — s3dgraphy.vocabularies.versions_line */
export function versionsLine(s: VocabSummary, t: VocabHost["t"]): string {
  const rows = s.versions?.length ? s.versions : [s];
  return rows.map((v) => {
    const who = (v.carriers ?? []).map((c) => whoName(c, t)).join(", ");
    return who ? `${v.version ?? "?"} (${who})` : String(v.version ?? "?");
  }).join(" · ");
}

/** the label of a concept in the interface language, for whoever lists terms */
export function conceptLabel(c: ConceptEntry | null | undefined, lang: string): string | null {
  return labelIn(c ?? null, lang)?.[0] ?? labelIn(c ?? null, "en")?.[0] ?? null;
}

export { RULE_MISSING };
