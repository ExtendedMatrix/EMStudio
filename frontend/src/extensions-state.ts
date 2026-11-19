/**
 * MICRO-PL09-ESTENSIONI-IN-EMSTUDIO (W6, E.D. 18 Nov 2026) · what the page
 * knows of this machine's extensions — community packages, plugins and mixed
 * packages — and of the packages' overlay the open document reads.
 *
 * The page never reads the folders: it asks the bridge (`tools/em_extensions.py`
 * over `s3dgraphy.extensions`, W21, and `s3dgraphy.profiles`, W1). The library
 * installs; the window asks (SPEC-pacchetto §16.3, §16.6). Phase 1: from disk.
 *
 * What a package ADDS to the page at runtime (SPEC-pacchetto §11.2, REPORT G13)
 * is computed here from the overlay, as plain data: its qualia (`qualiaOf`,
 * given to `vocab.ts`), its interface strings (`stringsOf`, given to `i18n.ts`),
 * the labels of its types, its colour schemes, its compiled forms. Nothing here
 * knows `main.ts`.
 *
 * `header.profiles` (REPORT G6): the save keeps what the file declared and
 * adds the package of every prefix the content uses (`declareProfiles`, the
 * twin of `s3dgraphy.profiles.declare`); the opening says what is missing
 * (`missingProfiles`) and never refuses the file.
 */
import { emcDocument, type Emc } from "./space-colours";
import type { Qualia } from "./vocab";

/** a problem as the library writes it: the sentence in English and Italian */
export interface ExtProblem { code: string; level: "error" | "warning" | string; where?: string; en: string; it: string }

export interface ExtCodeSection {
  status: "installed" | "not_installed" | "absent" | "removed" | string;
  version?: string;
  versions?: string[];
  entry?: string;
  module?: string;
  hosts?: string[];
  permissions?: Record<string, string>;
  capabilities?: string[];
  commands?: Array<{ id: string; label?: Record<string, string> | string; in?: string[]; writes?: boolean }>;
  active?: boolean;
  verified?: boolean;
  trusted?: unknown;
  reason?: ExtProblem | null;
  inactive_reason?: ExtProblem | null;
  pending?: { version?: string; reason?: ExtProblem } | null;
  installable_from?: string | null;
}
export interface ExtDataSection {
  status: "installed" | "absent" | "removed" | string;
  version?: string;
  versions?: string[];
  name?: string;
  iri?: string;
  path?: string;
  carried_vocabularies?: Array<{ scheme: string; version: string }>;
}
/** one row of the register (`installed()`), or a data-only package the profile library installed alone */
export interface ExtRow {
  id: string;
  name?: string | Record<string, string>;
  version?: string;
  kind?: "community-package" | "plugin" | "mixed" | string;
  source?: string;
  origin?: string;
  archive_hash?: string;
  license?: string[] | string;
  installed_at?: string;
  updated_at?: string;
  registered?: boolean;
  incomplete?: boolean;
  requires_missing?: ExtProblem[];
  requires_optional?: ExtProblem[];
  data?: ExtDataSection;
  code?: ExtCodeSection;
}

/** the two panels of the confirmation (`extensions.preview`) */
export interface ExtPreview {
  id: string; name?: string; version?: string; kind?: string; tagline?: string; maintainer?: string;
  license?: string[]; source?: string; origin?: string; archive_hash?: string; platform?: string;
  installed?: boolean; ok?: boolean;
  warnings?: ExtProblem[]; errors?: ExtProblem[];
  data?: {
    present: boolean; version?: string; installable?: boolean; update?: string;
    summary?: {
      vocabularies?: Array<{ scheme: string; version?: string; license?: string; fascia?: string; path?: string; pointer?: string }>;
      qualia?: number; extractors?: number; primitives?: string[]; landmark_sets?: number; combiners?: number;
      forms?: number; color_schemes?: number; document_types?: number; file_types?: number;
      parts?: Record<string, { license?: string }>; license?: string;
    };
    errors?: ExtProblem[]; warnings?: ExtProblem[];
  };
  code?: {
    present: boolean; version?: string; entry?: string; module?: string; hosts?: string[]; platforms?: string[];
    wheels?: string[]; permissions?: Record<string, string>; capabilities?: string[];
    commands?: ExtCodeSection["commands"]; license?: string; source?: string; verified?: boolean;
    update?: string; trust_needed?: boolean; trust_changes?: string[]; errors?: ExtProblem[]; installable?: boolean;
    module_collision?: ExtProblem | null; trust_question?: ExtProblem | null;
    /** MICRO-PL18 · «codice aggiornato 0.1.0 → 0.2.0» (an update of the code) */
    updated?: ExtProblem | null;
  };
  requires?: { missing?: ExtProblem[]; optional?: ExtProblem[]; cycle?: string[] | null };
}

// ── MICRO-PL22 (X2) · the repositories of this machine ──────────────────────

/** a repository as the bridge gives it: never the token, only whether there is one */
export interface ExtRepo {
  name: string; url: string; enabled: boolean; check_on_startup: boolean; has_token: boolean; local: boolean;
  added_at?: string; synced_at?: string | null; entries?: number | null; error?: ExtProblem | null;
}
/** «Consenti l'accesso in rete»: the machine's switch, and the environment that wins over it */
export interface ExtOnline { on: boolean; setting: boolean; env: string | null }
/** one id offered by one repository (its newest version), with what this machine has */
export interface ExtAvailable {
  repo: string; id: string; version: string; versions: string[]; name?: string | Record<string, string>;
  tagline?: string; type?: string; license?: string[] | string; maintainer?: string; archive_size?: number;
  permissions?: Record<string, string>; reviewed?: unknown; requires?: { extensions?: Array<{ id: string; version?: string; part?: string; optional?: boolean }> };
  sections?: Record<string, unknown>; installed: string | null; update: boolean; same_source: boolean;
}
export interface ExtBlocked { repo: string; id: string; reason?: string; reason_it?: string; problem: ExtProblem }
export interface ExtUpdate { id: string; repo: string; installed: string; version: string }
/** what installing from a repository brings: the requirements first, the offers said, tier C */
export interface ExtPlan {
  repo: string; id: string; version: string; ok: boolean; online_access: boolean; cycle: string[] | null;
  steps: Array<{ repo: string; id: string; version: string; type?: string; name?: unknown; requested: boolean; archive_size?: number; sections: string[] }>;
  unresolved: Array<{ id: string; range: string; part: string; for: string; problem: ExtProblem }>;
  offers: Array<{ id: string; range: string; part: string; repo: string | null; version: string | null }>;
  tier_c: Array<{ id: string; scheme: string; version: string; url: string; terms?: string; will_fetch: boolean }>;
}
export interface ExtSyncAnswer {
  repositories: Array<{ name: string; ok: boolean; entries: number | null; problems: ExtProblem[] }>;
  updates: ExtUpdate[]; online_access: boolean;
}
export interface ExtRepoResult {
  installed: (ExtRow & { status?: string; warnings?: ExtProblem[] }) | null;
  requires: Array<{ id: string; version: string; repo: string; status: string; code?: string }>;
  tier_c: Array<{ id: string; version: string; fetched: boolean; url?: string; problem?: ExtProblem }>;
  unresolved: ExtPlan["unresolved"]; offers: ExtPlan["offers"]; warnings: ExtProblem[]; repo: string;
}
/** the size of an archive in words a person reads */
export function sizeText(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
/** what the window shows of a repository's list: the updates first, then by name */
export function availableRows(av: ExtAvailable[], only: "all" | "packages" | "plugins"): ExtAvailable[] {
  const kindOf = (a: ExtAvailable) => {
    const s = Object.keys(a.sections ?? {});
    return s.includes("code") && s.includes("data") ? "mixed" : s.includes("code") ? "plugin" : "community-package";
  };
  return av.filter((a) => only === "all" || (only === "plugins" ? kindOf(a) !== "community-package" : kindOf(a) !== "plugin"))
    .sort((a, b) => Number(b.update) - Number(a.update) || a.id.localeCompare(b.id) || a.repo.localeCompare(b.repo));
}

/** what a removal would do, said before (`extensions.removal_plan`) */
export interface ExtRemovalPlan {
  id: string;
  code: { versions: string[] } | null;
  data: { versions: string[]; required_by: string[]; removes_code: boolean; notice?: ExtProblem; confirm?: ExtProblem } | null;
  vocabularies_only_here: Array<{ id: string; version?: string; title?: Record<string, string> | string; scheme?: string }>;
}

/** a package's entry in the overlay */
export interface OverlayProfile {
  name: string; iri: string; prefix: string; version: string;
  title?: Record<string, string> | string; lifecycle?: string; example?: boolean; languages?: string[];
  path?: string | null; declared?: boolean;
}
export interface OverlayQuale {
  id: string; label?: Record<string, string> | string; description?: Record<string, string> | string;
  data_type?: string; units?: string[]; values?: string[]; origin?: string; profile?: string;
  mapping?: { iri?: string }; vocabulary?: string;
}
export interface OverlayDoc {
  profiles: OverlayProfile[];
  qualia: Record<string, OverlayQuale>;
  extractor_types: Record<string, { id: string; label?: Record<string, string> | string; geometry?: unknown; origin?: string }>;
  document_types: Record<string, { id: string; label?: Record<string, string> | string; origin?: string }>;
  combiner_types: Record<string, { id: string; label?: Record<string, string> | string; operation?: string; produces?: string }>;
  file_types: Record<string, unknown>;
  landmark_sets: Record<string, unknown>;
  forms: Record<string, { id: string; source?: string; compiled?: string; digest?: string; origin?: string; profile?: string;
    label?: Record<string, string> | string; compiled_doc?: unknown;
    /** MICRO-PL11 (bridge 80): the compiled definition verified (file digest, content digest, id, version) */
    verified?: boolean; compiled_problems?: ExtProblem[]; vocabularies?: unknown[] }>;
  color_schemes: Record<string, { id?: string; property?: string; path?: string; file?: string; origin?: string; profile?: string;
    label?: Record<string, string> | string; doc?: unknown }>;
  visual_rules: Record<string, unknown>;
  qualia_vocabularies: unknown[];
  problems: ExtProblem[];
  strings?: Record<string, string>;
  strings_en?: Record<string, string>;
}
export interface DeclaredProfile { iri: string; version: string }

/** the label of a package's multilingual field in `lang` (then English, then any) */
export function labelIn(v: Record<string, string> | string | undefined | null, lang: string): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  const base = lang.split("-")[0];
  return v[lang] ?? v[base] ?? v.en ?? Object.values(v)[0] ?? "";
}
/** a problem in the page's language (Italian for «it», English otherwise: the library writes the two) */
export function problemText(p: ExtProblem | null | undefined, lang: string): string {
  if (!p) return "";
  return lang.startsWith("it") ? p.it || p.en : p.en || p.it;
}

/** what kind a row is, for the filter «Tutte · Pacchetti di comunità · Plugin» */
export type ExtFilter = "all" | "packages" | "plugins";
export function rowKind(r: ExtRow): "community-package" | "plugin" | "mixed" {
  if (r.kind === "plugin" || r.kind === "mixed" || r.kind === "community-package") return r.kind;
  return r.code && r.code.status !== "absent" && r.data?.status !== "installed" ? "plugin" : "community-package";
}
export function passesFilter(r: ExtRow, f: ExtFilter): boolean {
  const k = rowKind(r);
  if (f === "all") return true;
  if (f === "packages") return k === "community-package" || k === "mixed";
  return k === "plugin" || k === "mixed";
}

/** the state of a row in one line of words: the keys the window translates */
export function rowState(r: ExtRow): { key: string; problem?: ExtProblem | null } {
  const code = r.code;
  if (r.incomplete) return { key: "ext.state.incomplete", problem: r.requires_missing?.[0] ?? null };
  if (code && code.status === "installed" && !code.active)
    return { key: "ext.state.codeOff", problem: code.inactive_reason ?? null };
  if (code && code.status === "not_installed") return { key: "ext.state.codeOut", problem: code.reason ?? null };
  if (code?.pending) return { key: "ext.state.pending", problem: code.pending.reason ?? null };
  return { key: "ext.state.active" };
}

/** the licences of a row, as text */
export function licenceText(l: string[] | string | undefined): string {
  const list = Array.isArray(l) ? l : l ? [l] : [];
  return list.map((x) => x.replace(/^SPDX:/, "")).join(", ");
}

// ── what the overlay adds to the page ───────────────────────────────────────

/** a package's qualia as the page's catalogue lists them (`vocab.ts`): in a
 *  category of their own, named after the package; the node's `name` is the
 *  label in the page's language, `property_type` the prefixed id */
export function qualiaOf(ov: OverlayDoc | null, lang: string): Qualia[] {
  if (!ov) return [];
  const byIri = new Map(ov.profiles.map((p) => [p.iri, p]));
  const out: Qualia[] = [];
  for (const q of Object.values(ov.qualia ?? {})) {
    const prof = (q.profile && byIri.get(q.profile)) || ov.profiles.find((p) => q.id.startsWith(`${p.prefix}:`));
    const title = prof ? labelIn(prof.title, lang) || prof.name : "";
    out.push({
      id: q.id,
      name: labelIn(q.label, lang) || q.id,
      category: `package:${prof?.name ?? "?"}`,
      categoryLabel: title || q.id.split(":")[0],
      categoryDescription: prof ? `${prof.name} ${prof.version}` : undefined,
      subcategory: prof?.prefix ?? "",
      subcategoryLabel: prof ? `${prof.name} ${prof.version}` : "",
      description: labelIn(q.description, lang) || undefined,
      dataType: q.data_type,
      units: q.units,
      values: q.values,
      ...(q.mapping?.iri ? { mappings: { cidoc_crm: q.mapping.iri } } : {}),
    });
  }
  return out;
}

/** the interface strings of the packages, per language: the page's language
 *  and English (a key the language lacks falls back to English) */
export function stringsOf(ov: OverlayDoc | null, lang: string): Record<string, Record<string, string>> {
  if (!ov) return {};
  const out: Record<string, Record<string, string>> = {};
  if (ov.strings) out[lang] = { ...ov.strings };
  if (ov.strings_en) out.en = { ...ov.strings_en };
  else if (lang === "en" && ov.strings) out.en = { ...ov.strings };
  return out;
}

/** the label of a package's type (quale, extractor, document, combiner) in `lang`, or null */
export function typeLabel(ov: OverlayDoc | null, typeId: string, lang: string): string | null {
  if (!ov || !typeId) return null;
  for (const k of ["qualia", "extractor_types", "document_types", "combiner_types"] as const) {
    const e = (ov[k] as Record<string, { label?: Record<string, string> | string }>)[typeId];
    if (e) return labelIn(e.label, lang) || null;
  }
  return null;
}

/** a package's colour schemes as the file's presentation takes them (MICRO-T,
 *  EM Tools' .emc): a package writes `{property, color_mapping: {code: "#hex"}}`
 *  (SPEC-pacchetto §9: keyed by the term's CODE, so it holds in every language),
 *  turned into the .emc's linear colours; an .emc already in EM Tools' form is
 *  taken as it is. `emc` null: the file is not a scheme (said). */
export interface PackageScheme { id: string; name: string; property: string; profile: string; emc: Emc | null }
export function schemesOf(ov: OverlayDoc | null, lang: string): PackageScheme[] {
  if (!ov) return [];
  const out: PackageScheme[] = [];
  for (const [id, c] of Object.entries(ov.color_schemes ?? {})) {
    const doc = c.doc as Record<string, unknown> | undefined;
    let emc: Emc | null = null;
    const meta = doc?.metadata as Record<string, unknown> | undefined;
    if (doc && meta && typeof meta.property_name === "string" && doc.color_mapping && typeof doc.color_mapping === "object") emc = doc as unknown as Emc;
    else if (doc && doc.color_mapping && typeof doc.color_mapping === "object") {
      const hex = Object.fromEntries(Object.entries(doc.color_mapping as Record<string, unknown>)
        .filter(([, v]) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) as Array<[string, string]>);
      const prop = String(doc.property ?? c.property ?? "");
      if (prop && Object.keys(hex).length) emc = emcDocument(prop, hex, "", { source: c.origin ?? id });
    }
    out.push({ id, name: labelIn(c.label, lang) || String(doc?.name ?? id), property: String(c.property ?? doc?.property ?? ""),
               profile: c.profile ?? "", emc });
  }
  return out;
}

/** a package's sheets: a compiled definition the bridge VERIFIED (MICRO-PL11:
 *  the file is the one the manifest names, its content what the compiler
 *  produced, its id and version the manifest's) is added to the vendored ones;
 *  one that is not verified is not offered, and the window says why — never
 *  guessed, never taken on trust (a bridge before 80 does not verify: not offered) */
export interface PackageForm {
  id: string; name: string; profile: string;
  def: { header: { id: string; version?: string; digest?: string } } | null;
  problems: ExtProblem[];
}
export function formsOf(ov: OverlayDoc | null, lang: string): PackageForm[] {
  if (!ov) return [];
  return Object.entries(ov.forms ?? {}).map(([id, f]) => {
    const d = f.compiled_doc as { header?: { id?: unknown; version?: unknown } } | undefined;
    const shaped = !!d && typeof d === "object" && !!d.header && typeof d.header.id === "string";
    const ok = shaped && f.verified === true;
    const problems = f.compiled_problems?.length ? f.compiled_problems
      : ok ? [] : [{ code: "form_unverified", level: "error", where: `forms ${id}`, en: "", it: "" }];  // said by the window (ext.formUnverified)
    const title = (d as { header?: { standard?: { title?: Record<string, string> } } } | undefined)?.header?.standard?.title;
    return { id, name: labelIn(f.label, lang) || (ok ? labelIn(title, lang) : "") || id, profile: f.profile ?? "",
             def: ok ? d as { header: { id: string; version?: string; digest?: string } } : null, problems };
  });
}

/** the vocabularies of the verified sheets (their package's own schemes), for
 *  `sheet.setRuntimeVocabularies`: one file per scheme */
export function formVocabulariesOf(ov: OverlayDoc | null): Array<{ scheme: string; concepts: unknown[] }> {
  const out = new Map<string, { scheme: string; concepts: unknown[] }>();
  for (const f of Object.values(ov?.forms ?? {})) {
    if (f.verified !== true) continue;
    for (const v of (f.vocabularies ?? []) as Array<{ scheme?: unknown; concepts?: unknown }>) {
      if (v && typeof v.scheme === "string" && Array.isArray(v.concepts) && !out.has(v.scheme))
        out.set(v.scheme, v as { scheme: string; concepts: unknown[] });
    }
  }
  return [...out.values()];
}

// ── header.profiles ─────────────────────────────────────────────────────────

/** a package's own name: «stat:larghezza_biorbitale» → «stat» (s3dgraphy `_OWN_RE`) */
const OWN_RE = /^([a-z][a-z0-9]{1,15}):[a-z][a-z0-9_]*(\/[A-Za-z0-9_.-]+)?$/;
export function prefixOf(v: unknown): string | null {
  const m = OWN_RE.exec(String(v ?? ""));
  return m ? m[1] : null;
}
interface NodeLike { node_type?: string; name?: unknown; data?: Record<string, unknown> | null }
interface EdgeLike { edge_type?: string }
/** the prefixes the content uses: a node's type, `data.em_kind`, `data.landmark.set`,
 *  a property's name or `property_type`, an edge's type (`profiles.prefixes_used`) */
export function prefixesUsed(graphs: Array<{ nodes?: NodeLike[]; edges?: EdgeLike[] }>): string[] {
  const found = new Set<string>();
  const see = (v: unknown) => { const p = prefixOf(v); if (p) found.add(p); };
  for (const g of graphs) {
    for (const n of g.nodes ?? []) {
      const d = (n.data && typeof n.data === "object" ? n.data : {}) as Record<string, unknown>;
      see(n.node_type);
      see(d.em_kind);
      const lm = d.landmark as Record<string, unknown> | undefined;
      if (lm && typeof lm === "object") see(lm.set);
      if (n.node_type === "property") { see(n.name); see(d.property_type); }
    }
    for (const e of g.edges ?? []) see(e.edge_type);
  }
  return [...found].sort();
}
/** what a file declared, normalised and without twins (`profiles._declared`) */
export function declaredOf(v: unknown): DeclaredProfile[] {
  const out: DeclaredProfile[] = [];
  for (const e of Array.isArray(v) ? v : []) {
    if (!e || typeof e !== "object" || !(e as { iri?: unknown }).iri) continue;
    const d = { iri: String((e as { iri: unknown }).iri), version: String((e as { version?: unknown }).version ?? "") };
    if (!out.some((x) => x.iri === d.iri && x.version === d.version)) out.push(d);
  }
  return out;
}
/** `header.profiles` for a save: what the file declared (kept, even when not
 *  installed here — never dropped), plus the package of every prefix the content
 *  uses that no declaration covers, from the overlay the page reads (the newest
 *  installed, as the library's `declare`). `[]`: nothing to write. */
export function declareProfiles(declared: unknown, graphs: Array<{ nodes?: NodeLike[]; edges?: EdgeLike[] }>,
                                active: OverlayProfile[]): DeclaredProfile[] {
  const out = declaredOf(declared);
  const used = prefixesUsed(graphs);
  if (!used.length) return out;
  const covered = new Set<string>();
  for (const e of out) for (const p of active) if (p.iri === e.iri) covered.add(p.prefix);
  for (const prefix of used) {
    if (covered.has(prefix)) continue;
    const p = active.find((x) => x.prefix === prefix);
    if (p) { out.push({ iri: p.iri, version: p.version }); covered.add(prefix); }
  }
  return out;
}
/** the declared packages this machine has not: the opening says them */
export function missingProfiles(missing: Array<{ iri: string; version?: string }> | null): DeclaredProfile[] {
  return missing ? declaredOf(missing) : [];
}
/** a package's short name from its IRI: «…/profile/esempio-statuaria» → «esempio-statuaria» */
export function nameOfIri(iri: string): string {
  return iri.replace(/\/+$/, "").split("/").pop() || iri;
}

// ── the state, asked of the bridge ──────────────────────────────────────────

export interface ExtArchive {
  /** a path on this machine (the desktop's picker) */
  path?: string;
  /** or the bytes of a file chosen in the page, with its name */
  zip_b64?: string;
  name: string;
}

export interface ExtStateHost {
  bridge(): Promise<string>;
  /** the StratiGraph node's base (`<hub>`), when one is configured: the READ
   *  routes are asked there (`<hub>/v1/extensions/installed`, `/v1/profiles/*`)
   *  when the bridge does not answer — the web page; the node's packages are the
   *  administrator's, nothing is installed from the page (W10) */
  nodeBase?(): string | null;
  lang(): string;
  /** the overlay changed: the page adds what it brings (qualia, strings…) */
  overlayChanged(ov: OverlayDoc | null): void;
  /** the installed extensions changed */
  changed(): void;
}

export class ExtensionsState {
  rows: ExtRow[] | null = null;
  platform = "";
  dirs: Record<string, string> = {};
  error: string | null = null;
  /** the bridge has no /extensions/* (older than level 78, or no bridge: the web) */
  unavailable = false;
  /** where the read routes answered last: the bridge, or the node (read only) */
  from: "bridge" | "node" = "bridge";
  overlay: OverlayDoc | null = null;
  /** the packages the open document declares and this machine has not */
  missing: DeclaredProfile[] = [];
  /** the declaration the overlay was asked for (the same → not asked again) */
  private overlayKey = "";
  rev = 0;
  /** MICRO-PL22 · the repositories (null: not asked yet, or a bridge before 85) */
  repos: ExtRepo[] | null = null;
  online: ExtOnline | null = null;
  officialUrl = "";
  available: ExtAvailable[] = [];
  blocked: ExtBlocked[] = [];
  updates: ExtUpdate[] = [];
  /** the last sync's problems, by repository (said in the window until the next) */
  syncProblems: Record<string, ExtProblem[]> = {};
  constructor(private host: ExtStateHost) {}

  private async call<T>(path: string, body?: unknown): Promise<{ ok: true; j: T } | { ok: false; error: string; problems: ExtProblem[]; status: number }> {
    const ask = async (base: string) => {
      const r = await fetch(`${base}${path}`, body === undefined ? { cache: "no-store" }
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({})) as T & { ok?: boolean; error?: string; problems?: ExtProblem[] };
      return { r, j };
    };
    const reading = body === undefined || path === "/profiles/overlay";
    let got: { r: Response; j: T & { ok?: boolean; error?: string; problems?: ExtProblem[] } };
    try {
      got = await ask(await this.host.bridge());
      if (reading) this.from = "bridge";
    } catch (e) {
      const node = reading ? this.host.nodeBase?.() : null;
      if (!node) { this.unavailable = true; return { ok: false, error: String(e), problems: [], status: 0 }; }
      try { got = await ask(`${node.replace(/\/$/, "")}/v1`); this.from = "node"; }
      catch (e2) { this.unavailable = true; return { ok: false, error: String(e2), problems: [], status: 0 }; }
    }
    const { r, j } = got;
    if (r.status === 404 && !j.error?.includes("extensions")) this.unavailable = true;
    if (!r.ok || j.ok === false) return { ok: false, error: j.error ?? `HTTP ${r.status}`, problems: j.problems ?? [], status: r.status };
    this.unavailable = false;
    return { ok: true, j };
  }

  async refresh(): Promise<void> {
    const r = await this.call<{ extensions: ExtRow[]; platform: string; dirs: Record<string, string> }>("/extensions/installed");
    if (r.ok) { this.rows = r.j.extensions; this.platform = r.j.platform; this.dirs = r.j.dirs; this.error = null; }
    else { this.error = r.error; if (this.unavailable) this.rows = null; }
    this.rev++;
    this.host.changed();
  }

  /** the overlay of what the document declares (+ the packages installed here) */
  async loadOverlay(declared: DeclaredProfile[], force = false): Promise<void> {
    const key = JSON.stringify([declared, this.host.lang(), this.rev]);
    if (!force && key === this.overlayKey) return;
    this.overlayKey = key;
    const r = await this.call<{ overlay: OverlayDoc; missing: Array<{ iri: string; version?: string }>; problems: ExtProblem[] }>(
      "/profiles/overlay", { declared, lang: this.host.lang() });
    if (r.ok) { this.overlay = r.j.overlay; this.missing = missingProfiles(r.j.missing); }
    else { this.overlay = null; this.missing = []; }
    this.host.overlayChanged(this.overlay);
  }

  /** MICRO-PL22 · the repositories and what they offer (cached indexes: no network) */
  async refreshRepos(): Promise<void> {
    const r = await this.call<{ repositories: ExtRepo[]; online: ExtOnline; official_url: string }>("/extensions/repos");
    if (!r.ok) { this.repos = null; this.rev++; this.host.changed(); return; }
    this.repos = r.j.repositories;
    this.online = r.j.online;
    this.officialUrl = r.j.official_url;
    const a = await this.call<{ available: ExtAvailable[]; blocked: ExtBlocked[]; updates: ExtUpdate[] }>("/extensions/available");
    if (a.ok) { this.available = a.j.available; this.blocked = a.j.blocked; this.updates = a.j.updates; }
    this.rev++;
    this.host.changed();
  }
  async syncRepos(o: { name?: string; startup?: boolean } = {}) {
    const r = await this.call<{ sync: ExtSyncAnswer }>("/extensions/repos/sync", o);
    if (r.ok) for (const x of r.j.sync.repositories) this.syncProblems[x.name] = x.problems;
    await this.refreshRepos();
    return r;
  }
  setOnline(on: boolean) { return this.call<{ online: ExtOnline }>("/extensions/online", { on }); }
  addRepo(o: { url: string; name?: string; token?: string; check_on_startup?: boolean }) {
    return this.call<{ repository: ExtRepo }>("/extensions/repos/add", o);
  }
  updateRepo(name: string, changes: { url?: string; token?: string | null; enabled?: boolean; check_on_startup?: boolean }) {
    return this.call<{ repository: ExtRepo }>("/extensions/repos/update", { name, ...changes });
  }
  removeRepo(name: string) { return this.call<{ removed: boolean }>("/extensions/repos/remove", { name }); }
  previewFrom(repo: string, id: string, version?: string) {
    return this.call<{ preview: ExtPreview & { repository?: { name: string; url?: string; archive_hash?: string; reviewed?: unknown; cached?: boolean }; plan?: ExtPlan } }>(
      "/extensions/repos/preview", { repo, id, version });
  }
  installFrom(repo: string, id: string, o: { version?: string; parts: "all" | "data"; trust: boolean; withRequires: boolean; trustRequires: boolean }) {
    return this.call<{ result: ExtRepoResult }>("/extensions/repos/install", { repo, id, version: o.version, parts: o.parts,
      trust: o.trust, with_requires: o.withRequires, trust_requires: o.trustRequires });
  }
  preview(a: ExtArchive) { return this.call<{ preview: ExtPreview }>("/extensions/preview", a); }
  install(a: ExtArchive, parts: "all" | "data", trust: boolean) {
    return this.call<{ installed: ExtRow & { status?: Record<string, string>; warnings?: ExtProblem[] } }>("/extensions/install", { ...a, parts, trust });
  }
  installCode(ref: { id: string } | ExtArchive, trust: boolean) {
    return this.call<{ installed: ExtRow }>("/extensions/install-code", { ...ref, trust });
  }
  enable(id: string, version?: string) { return this.call<{ enabled: unknown }>("/extensions/enable", { id, version }); }
  disable(id: string) { return this.call<{ disabled: boolean }>("/extensions/disable", { id }); }
  removalPlan(id: string) { return this.call<{ plan: ExtRemovalPlan }>(`/extensions/removal-plan?id=${encodeURIComponent(id)}`); }
  remove(id: string, part: "all" | "code" | "data", o: { version?: string; confirm?: boolean; purge?: boolean } = {}) {
    return this.call<{ removed: Record<string, unknown> }>("/extensions/remove",
      { id, part, version: o.version, confirm: !!o.confirm, purge_vocabularies: !!o.purge });
  }
}
