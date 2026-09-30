/**
 * THE MAPPING EDITOR — authoring the JSON that importers apply.
 *
 * StratiMiner's twin, and the pairing is the design: StratiMiner turns a folder
 * of sources into a graph THROUGH a reviewable table; this turns a source's
 * shape into a **mapping file** that importers then apply, dynamically or baked.
 * One makes a graph, the other makes an instrument. Both are one-shot tools that
 * exist to produce an artefact and get out of the way — which is why this is a
 * floating tool under Tools ▸ and not a window you arrange a project around.
 *
 * The gesture: drop in a source (a table or an XML) → see every field with three
 * of its values → say for each what it MEANS → say how the fields connect →
 * export the JSON.
 *
 * ## What this module does not know
 *
 * Not one node type, not one edge type, not one CIDOC class is written in this
 * file. They all arrive in `state` from `api.mapping_*` over the bridge:
 *
 *   · the field list and its samples          → `mapping_source_fields`
 *   · the classes on offer, CIDOC-first        → `mapping_target_catalog`
 *   · the edges legal between two of them      → `mapping_allowed_edges`
 *   · whether the result is coherent           → `mapping_validate`
 *
 * That is not tidiness. A picker with its own list of types is a second
 * datamodel, and the single thing this editor exists to produce is a file that
 * agrees with the first — so `scripts/check-mapping-editor.mjs` reads this source
 * and fails if a type name appears in it.
 *
 * The one string this file DOES have to carry is the schema's own vocabulary
 * (`is_id`, `property_name`, `relations`, …): those are the mapping FORMAT, which
 * is what this module is a writer for.
 *
 * Pure module: no DOM queries outside the host it is given, no fetch. The caller
 * does the round trips and hands the answers back in `state`.
 */

import { t } from "./i18n";

// ── what the library told us ────────────────────────────────────────────────

export interface MappingField {
  name: string;
  /** XML only: the path this field lives at, relative to the record */
  source_path?: string;
  samples: string[];
  /** how many of the sampled records actually had a value */
  filled: number;
  seen: number;
}

export interface CidocTarget {
  cidoc: string;
  /** the EM node type that implements it, or null → CIDOC-direct */
  em_type: string | null;
  em_candidates: string[];
  label: string;
  extension: string;
  cidoc_direct: boolean;
}

export interface EdgeOption {
  edge_type: string;
  label: string;
  cidoc: string;
}

/** The catalogue GROUPED BY ONTOLOGY, as the library sends it.
 *
 *  Which class belongs to which ontology is the datamodel's answer, not this
 *  side's: CIDOC-CRM · CRMarchaeo · CRMdig · CRMgeo · CRMinf · HDT-O · PROV-O,
 *  each with the version the datamodel declares. A picker that grouped by its own
 *  rule would be a second opinion about the ontology somebody is committing to. */
export interface TargetGroup {
  ontology: string;
  version: string;
  count: number;
  targets: CidocTarget[];
}

export interface EdgeGroup {
  ontology: string;
  version: string;
  count: number;
  edges: EdgeOption[];
}

export interface Verdict {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

// ── what the author decided ─────────────────────────────────────────────────

/** The ROLE a field plays. Four, and they are the schema's own four — not a
 *  taxonomy invented here:
 *
 *   · `id`          → `is_id`: this field identifies the record
 *   · `description` → `is_description` + `target_id_column`
 *   · `property`    → `property_name`: a PropertyNode hung off the record
 *   · `relation`    → `is_relation`: the value NAMES another record (an edge)
 *
 *  …plus the empty role: not mapped. Which is the default, because a source has
 *  columns nobody wants and pretending otherwise is how mappings grow noise. */
export type FieldRole = "" | "id" | "description" | "property" | "relation";

export interface FieldChoice {
  role: FieldRole;
  /** the CIDOC class the author picked (the picker is CIDOC-first) */
  cidoc?: string;
  /** a property's name in the graph — defaults to the field's own name */
  property_name?: string;
}

export interface RelationDraft {
  source_column: string;
  target_column: string;
  edge_type: string;
}

export interface MappingEditorState {
  /** the source on screen */
  path: string;
  format: string;
  /** tables/sheets (a table source) — which one, and which exist */
  table?: string;
  tables?: string[];
  /** XML: which element is one RECORD, and the candidates the library found */
  recordPath?: string;
  recordPaths?: Array<{ path: string; count: number }>;
  fields: MappingField[];
  catalog: CidocTarget[];
  /** the same catalogue, grouped by ontology — what the picker draws */
  groups?: TargetGroup[];
  /** the legal edges for the relation being edited, grouped the same way */
  edgeGroups?: Record<string, EdgeGroup[]>;
  choices: Record<string, FieldChoice>;
  relations: RelationDraft[];
  /** the edges legal for the relation being edited, keyed `src→tgt` */
  edgeOptions: Record<string, EdgeOption[]>;
  /** `{extension: format}` — which files are mappable, from the library. Drives
   *  the native dialog's filter AND the browser's greying, so "can this be a
   *  source?" has one answer. */
  extensions?: Record<string, string>;
  /** THE FILE PICKER, when it is open. On the desktop this stays null and the OS
   *  dialog does the job; in a browser the path cannot come from
   *  `<input type=file>` (it withholds it by design), so this is a real
   *  filesystem browse served by the bridge — the same `/fs/list` the Storage
   *  window shows, with the sidebar Blender's File View has. */
  picker?: {
    listing: FsListing | null;
    loading: boolean;
    error: string;
    /** Home, the user folders, the volumes — computed by the bridge from the
     *  machine (`/fs/places`), never configured. */
    places: FsPlace[];
    /** the folders the bridge serves — Blender's "Bookmarks" */
    bookmarks: FsPlace[];
    /** `whole-disk` or `roots`: WHAT is reachable, so the panel can say why a
     *  place is greyed instead of letting a click 403 */
    scope: string;
    /** the folders visited in this session, most recent first */
    recent: string[];
    /** where we came from, for the ← button */
    history: string[];
    /** the name filter, and how the list is ordered */
    filter: string;
    sort: "name" | "date" | "size";
    /** the path bar's text while it is being typed */
    typed: string;
  } | null;
  name: string;
  /** the node type a PROPERTY column produces — the LIBRARY's answer
   *  (`api.mapping_property_node_type`), carried so that asking for the legal
   *  edges of a property end does not need a literal on this side */
  propertyType?: string;
  verdict: Verdict | null;
  /** the last apply, as the library reported it */
  applied: Record<string, unknown> | null;
  busy: string;
  note: string;
  /** MICRO-UN-POSTO · who filled the editor. File ▸ Importa ▸ Tabella con
   *  mappatura opens it empty (`file`); a row of the EMtree brings its auxiliary
   *  file (`aux`); StratiMiner brings its proposals (`stratiminer`: AI data, to
   *  be verified). One editor, three ways of filling it. */
  from?: { kind: "file" | "aux" | "stratiminer"; label?: string; auxId?: string };
  /** how the source is read: a mapping written here (the columns below), a
   *  mapping file, a mapping the registry knows, or none (an EM table, read as
   *  it is — and a folder of resources) */
  mappingKind?: MappingKind;
  mappingPath?: string;
  mappingName?: string;
  /** where it lands: a new graph, or the graph open now */
  target?: "new" | "this";
  /** the graph open now, by name — absent when there is none */
  hostLabel?: string;
  /** how it enters: ONE vocabulary for the whole application (`LANDINGS`) */
  landing?: Landing;
  /** a provisional apply on the graph open now, still to be written or removed */
  trial?: { injector: string; nodes: number } | null;
}

export type MappingKind = "authored" | "file" | "registry" | "none";
export const MAPPING_KINDS: readonly MappingKind[] = ["authored", "file", "registry", "none"];

/**
 * THE THREE WAYS A TABLE ENTERS A GRAPH — one vocabulary, used by the editor,
 * the EMtree and every message (`land.<key>`, it/en/de):
 *
 *  · `volatile` — «Provvisoria»: in the graph, in blue, out of the saved file
 *    until it is written in;
 *  · `baked` — «Scritta nel grafo»: written in, saved with the document;
 *  · `attached` — «Allegata come file ausiliario»: kept on the graph as a source
 *    with a life (re-read when the file changes, written in when agreed); its
 *    nodes are provisional until then. Only on a graph that exists.
 */
export type Landing = "volatile" | "baked" | "attached";
export const LANDINGS: readonly Landing[] = ["volatile", "baked", "attached"];

/** Why a landing cannot be chosen for a target, or "" when it can. */
export function landingRefusal(target: "new" | "this", landing: Landing,
                               hasHost: boolean): string {
  if (target === "this" && !hasHost) return "impmap.noGraph";
  if (landing === "attached" && target === "new") return "land.attachedNeedsGraph";
  return "";
}

export const EMPTY_STATE: MappingEditorState = {
  path: "", format: "", fields: [], catalog: [], choices: {}, relations: [],
  edgeOptions: {}, name: "", verdict: null, applied: null, busy: "", note: "",
  from: { kind: "file" }, mappingKind: "authored", mappingPath: "", mappingName: "",
  target: "new", landing: "baked", trial: null,
};

/** One row of a listing, in the shape `storage.ts` already returns (`FsEntry`).
 *  Redeclared structurally rather than imported so this module stays a leaf. */
export interface FsRow {
  name: string;
  type: "dir" | "file";
  path: string;
  ext: string;
  size: number;
  outside?: boolean;
}

export interface FsListing {
  roots: boolean;
  path: string;
  parent: string | null;
  entries: FsRow[];
}

/** One row of the picker's sidebar. `served: false` means the bridge is in
 *  roots-mode and this place has not been granted — the row is shown with the
 *  grant offered, because "why can I not open my own Documents?" deserves an
 *  answer and a button, not a 403. */
export interface FsPlace {
  label: string;
  path: string;
  kind: "home" | "user" | "volume" | "bookmark" | string;
  served: boolean;
}

export interface MappingEditorHandlers {
  /** OPEN THE PICKER: the OS dialog on the desktop, the bridge browse in a
   *  browser. Both end at a real path, which is the only thing the bridge can
   *  read a source from. */
  pickSource(): void;
  /** THE SYSTEM DIALOG, in a browser too. It reaches every corner of the
   *  machine — and hands back bytes, never a location — so the caller stages
   *  them and gets a path back. See `me.openWhy`. */
  openSystemFile(file: File): void;
  /** Browse into a directory (or, with no path, where the bridge starts). */
  browse(path?: string): void;
  /** Choose this file as the source. */
  chooseFile(path: string): void;
  closePicker(): void;
  /** Grant the bridge access to a folder (Blender's "add bookmark", and in
   *  roots-mode the only way to reach a place). */
  addRoot(path: string): void;
  /** the name filter / the sort order / the typed path — view state, so the
   *  caller keeps one copy of it */
  setPickerFilter(text: string): void;
  setPickerSort(sort: "name" | "date" | "size"): void;
  setPath(path: string): void;
  setTable(table: string): void;
  setRecordPath(path: string): void;
  setName(name: string): void;
  setChoice(field: string, choice: FieldChoice): void;
  addRelation(): void;
  setRelation(index: number, relation: RelationDraft): void;
  removeRelation(index: number): void;
  validate(): void;
  /** the three questions of the door (MICRO-UN-POSTO) */
  setMappingKind(kind: MappingKind): void;
  setMappingRef(value: string): void;
  pickMappingFile(): void;
  setTarget(target: "new" | "this"): void;
  setLanding(landing: Landing): void;
  /** ONE apply: the source, read with the mapping, lands where and how the
   *  person said */
  apply(): void;
  /** the provisional apply on the graph open now: write it in, or take it out */
  writeTrial(): void;
  dropTrial(): void;
  exportJson(): void;
  saveToRegistry(): void;
}

// ── the serialiser: choices → the mapping JSON ──────────────────────────────

/**
 * Build the mapping. THE function this module exists for, and the reason it is
 * separate from the rendering: it is pure, and `check-mapping-editor.mjs`
 * exercises it directly.
 *
 * What it deliberately does NOT do is resolve anything. A column carries the
 * CIDOC class the author picked and its role; turning `A2 Stratigraphic Volume
 * Unit` into `US`, or a property into its node type, is `mapping_normalize`'s
 * job on the library side. Resolving here would put a copy of the datamodel in
 * a UI, and the copy would be the one that goes stale.
 */
export function buildMapping(state: MappingEditorState): Record<string, unknown> {
  const columns: Record<string, Record<string, unknown>> = {};
  const idField = Object.entries(state.choices)
    .find(([, choice]) => choice.role === "id")?.[0];
  for (const field of state.fields) {
    const choice = state.choices[field.name];
    if (!choice || !choice.role) continue;         // not mapped: not in the file
    const column: Record<string, unknown> = {};
    if (field.source_path && field.source_path !== field.name) {
      column.source_path = field.source_path;
    } else if (state.format === "xml") {
      // an XML field IS its path, even when the path is just the tag: the
      // importer reads `source_path`, and leaving it out for the simple case
      // would make the mapping depend on a fallback
      column.source_path = field.source_path ?? field.name;
    }
    if (choice.cidoc) column.cidoc = choice.cidoc;
    switch (choice.role) {
      case "id":
        column.is_id = true;
        break;
      case "description":
        column.is_description = true;
        if (idField) column.target_id_column = idField;
        break;
      case "property":
        // the NAME only: which node type a property is, is the datamodel's
        // answer (`mapping_property_node_type`), filled in by normalisation
        column.property_name = choice.property_name?.trim() || field.name;
        break;
      case "relation":
        column.is_relation = true;
        break;
    }
    columns[field.name] = column;
  }
  const mapping: Record<string, unknown> = {
    name: state.name.trim() || "untitled-mapping",
    version: "1.0",
    source_settings: sourceSettings(state),
    column_mappings: columns,
  };
  const relations = state.relations
    .filter((r) => r.source_column && r.target_column && r.edge_type)
    .map((r) => ({ ...r }));
  if (relations.length) mapping.relations = relations;
  return mapping;
}

function sourceSettings(state: MappingEditorState): Record<string, unknown> {
  const settings: Record<string, unknown> = { format_type: state.format };
  if (state.format === "xml") {
    if (state.recordPath) settings.record_path = state.recordPath;
  } else if (state.table) {
    // a sheet is a sheet and a table is a table: the importers read different
    // keys, and writing both would be a guess about which one is meant
    if (state.format === "xlsx") settings.sheet_name = state.table;
    else settings.table_name = state.table;
  }
  return settings;
}

/** How many fields carry a role — the number the header shows, because "12 of
 *  47 mapped" is the state of the work and a count of columns is not. */
export function mappedCount(state: MappingEditorState): number {
  return Object.values(state.choices).filter((c) => c && c.role).length;
}

/** The fields that can be an edge's end: the ones with a role, since an unmapped
 *  field is not in the file the relation would refer to. */
export function relatableFields(state: MappingEditorState): string[] {
  return state.fields
    .filter((f) => state.choices[f.name]?.role)
    .map((f) => f.name);
}

/** The key under which the edges for one relation's pair are cached. */
export function edgeKey(sourceType: string, targetType: string): string {
  return `${sourceType || "?"}→${targetType || "?"}`;
}

/** The EM type a field will produce, as far as this side can tell: the CIDOC
 *  class's first candidate, from the catalog the library sent. Used to ASK for
 *  the legal edges — never to decide anything. */
export function typeOfField(state: MappingEditorState, field: string
                            ): string | null {
  const choice = state.choices[field];
  if (!choice) return null;
  if (choice.role === "property") return state.propertyType ?? null;
  const entry = state.catalog.find((c) => c.cidoc === choice.cidoc);
  return entry ? entry.em_type : null;
}

// ── the panel ───────────────────────────────────────────────────────────────

export function renderMappingEditor(host: HTMLElement,
                                    state: MappingEditorState,
                                    handlers: MappingEditorHandlers): void {
  const busy = state.busy !== "";
  host.textContent = "";
  const panel = document.createElement("div");
  panel.className = "me-panel";

  const intro = document.createElement("p");
  intro.className = "me-intro";
  intro.textContent = t("me.intro");
  panel.appendChild(intro);

  const from = fromBanner(state);
  if (from) panel.appendChild(from);
  panel.appendChild(sourceBox(state, handlers, busy));
  panel.appendChild(mappingBox(state, handlers, busy));
  if ((state.mappingKind ?? "authored") === "authored" && state.fields.length) {
    panel.appendChild(fieldsBox(state, handlers, busy));
    panel.appendChild(relationsBox(state, handlers, busy));
    panel.appendChild(outputBox(state, handlers, busy));
  }
  panel.appendChild(landingBox(state, handlers, busy));
  if (state.note) {
    const note = document.createElement("p");
    note.className = "me-note";
    note.textContent = state.note;
    panel.appendChild(note);
  }
  host.appendChild(panel);
}

function box(titleKey: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "me-box";
  const head = document.createElement("h4");
  head.textContent = t(titleKey);
  section.appendChild(head);
  return section;
}

function sourceBox(state: MappingEditorState, h: MappingEditorHandlers,
                   busy: boolean): HTMLElement {
  const section = box("me.source");
  const row = document.createElement("div");
  row.className = "me-row";
  const input = document.createElement("input");
  input.type = "text";
  input.value = state.path;
  input.dataset.field = "source-path";
  input.placeholder = t("me.pathPlaceholder");
  input.addEventListener("change", () => h.setPath(input.value));
  // TWO WAYS IN, and they are complementary rather than alternatives:
  //
  //  · Open…  — the SYSTEM dialog. Reaches anything on the machine, and what it
  //    returns is bytes: the caller stages them and works on a copy. This is the
  //    one for "the file is somewhere over there";
  //  · Browse… — the bridge's own filesystem, Blender-style. No copy, no size
  //    limit, and it is the one for a folder you work in every day.
  const open = document.createElement("button");
  open.textContent = t("me.open");
  open.title = t("me.openWhy");
  open.disabled = busy;
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.className = "me-hidden-file";
  const accept = Object.keys(state.extensions ?? {})
    .map((ext) => `.${ext}`).join(",");
  if (accept) fileInput.accept = accept;
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";                          // re-picking the same file fires
    if (file) h.openSystemFile(file);
  });
  open.addEventListener("click", () => fileInput.click());
  const browse = document.createElement("button");
  browse.textContent = t("me.browse");
  browse.title = t("me.browseWhy");
  browse.disabled = busy;
  browse.addEventListener("click", () => h.pickSource());
  const pick = document.createElement("button");
  pick.textContent = t("me.read");
  pick.disabled = busy || !state.path.trim();
  pick.addEventListener("click", () => h.chooseFile(state.path.trim()));
  row.append(input, open, browse, pick, fileInput);
  section.appendChild(row);
  if (state.picker) section.appendChild(pickerBox(state, h, busy));

  if (state.format) {
    const what = document.createElement("p");
    what.className = "me-muted";
    what.textContent = t("me.readAs", { format: state.format,
                                        n: String(state.fields.length) });
    section.appendChild(what);
  }
  // WHICH table, or WHICH element is a record — the one question a reader
  // cannot answer for the author (see `mapping_source_fields`)
  if (state.tables && state.tables.length > 1) {
    section.appendChild(pickerRow(
      t("me.table"), state.tables.map((name) => ({ value: name, label: name })),
      state.table ?? "", (value) => h.setTable(value), busy));
  }
  if (state.format === "xml" && state.recordPaths?.length) {
    section.appendChild(pickerRow(
      t("me.recordPath"),
      state.recordPaths.map((c) => ({ value: c.path,
                                      label: `${c.path} · ${c.count}` })),
      state.recordPath ?? "", (value) => h.setRecordPath(value), busy));
    const why = document.createElement("p");
    why.className = "me-muted";
    why.textContent = t("me.recordPathWhy");
    section.appendChild(why);
  }
  return section;
}

/**
 * THE FILE BROWSER — a real filesystem, served by the bridge.
 *
 * Why this exists at all: the bridge READS the source (sqlite3, openpyxl and the
 * XML parser all live there), so what it needs is a **path**. A browser's
 * `<input type="file">` withholds the path by design — it hands over bytes and a
 * bare name — so a picker built on it could not produce the one thing this tool
 * needs. The bridge's `/fs/list` can: it is the same filesystem browse the
 * Storage window shows, rooted in the folders the bridge was started with.
 *
 * On the desktop this never opens: the OS dialog is the better instrument and it
 * returns the same real path.
 */
function pickerBox(state: MappingEditorState, h: MappingEditorHandlers,
                   busy: boolean): HTMLElement {
  const picker = state.picker!;
  const section = document.createElement("div");
  section.className = "me-picker";

  // ── the bar: back · up · the PATH, typeable · close ──────────────────────
  const bar = document.createElement("div");
  bar.className = "me-picker-bar";
  const back = document.createElement("button");
  back.textContent = "←";
  back.title = t("me.pickerBack");
  back.disabled = busy || picker.history.length === 0;
  back.addEventListener("click", () => {
    const previous = picker.history[picker.history.length - 1];
    h.browse(previous || undefined);
  });
  const up = document.createElement("button");
  up.textContent = "↑";
  up.title = t("me.pickerUp");
  up.disabled = busy || !picker.listing || picker.listing.roots;
  up.addEventListener("click", () => h.browse(picker.listing?.parent ?? undefined));
  // The path bar is an INPUT, like Blender's: reading where you are is half of
  // it, typing where you want to go is the other half — and pasting a path from
  // a terminal is how anybody actually gets to a deep folder.
  const where = document.createElement("input");
  where.type = "text";
  where.className = "me-where";
  where.value = picker.typed
    || (picker.listing?.roots ? "" : (picker.listing?.path ?? ""));
  where.placeholder = t("me.pickerRoots");
  where.addEventListener("change", () => h.browse(where.value.trim() || undefined));
  where.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key === "Enter") {
      h.browse(where.value.trim() || undefined);
    }
  });
  const close = document.createElement("button");
  close.className = "me-x";
  close.textContent = "✕";
  close.addEventListener("click", () => h.closePicker());
  bar.append(back, up, where, close);
  section.appendChild(bar);

  const body = document.createElement("div");
  body.className = "me-picker-body";
  body.append(pickerSidebar(state, h, busy), pickerFiles(state, h, busy));
  section.appendChild(body);
  return section;
}

/** The sidebar: Places · Volumes · Bookmarks · Recent. The same four groups
 *  Blender's File View has, and for the same reason — a picker that starts at
 *  one folder makes you type your way out of it. */
function pickerSidebar(state: MappingEditorState, h: MappingEditorHandlers,
                       busy: boolean): HTMLElement {
  const picker = state.picker!;
  const side = document.createElement("div");
  side.className = "me-picker-side";

  const group = (labelKey: string, places: FsPlace[]): void => {
    if (!places.length) return;
    const head = document.createElement("div");
    head.className = "me-side-head";
    head.textContent = t(labelKey);
    side.appendChild(head);
    for (const place of places) {
      const row = document.createElement("button");
      row.className = "me-side-row";
      row.textContent = place.label;
      row.title = place.path;
      if (place.path === picker.listing?.path) row.classList.add("on");
      if (place.served) {
        row.disabled = busy;
        row.addEventListener("click", () => h.browse(place.path));
      } else {
        // roots-mode and this place has not been granted. Not hidden and not a
        // dead end: the row says what it needs and the button next to it does
        // it, because "why can I not open my own Documents?" deserves an answer.
        row.disabled = true;
        row.title = t("me.pickerNotServed");
        const grant = document.createElement("button");
        grant.className = "me-side-grant";
        grant.textContent = "+";
        grant.title = t("me.pickerGrant", { name: place.label });
        grant.disabled = busy;
        grant.addEventListener("click", () => h.addRoot(place.path));
        const pair = document.createElement("div");
        pair.className = "me-side-pair";
        pair.append(row, grant);
        side.appendChild(pair);
        continue;
      }
      side.appendChild(row);
    }
  };

  group("me.sidePlaces", picker.places.filter((p) => p.kind !== "volume"));
  group("me.sideVolumes", picker.places.filter((p) => p.kind === "volume"));
  // …and a bookmark that IS already a place is not listed twice. Granting
  // Documents makes it a served root, and before this the sidebar answered with
  // three identical rows called "Documents" (Places, Bookmarks, Recent) —
  // measured, and it reads as a bug in the sidebar rather than as three groups.
  const placed = new Set(picker.places.map((p) => p.path));
  group("me.sideBookmarks", picker.bookmarks.filter((b) => !placed.has(b.path)));
  group("me.sideRecent", picker.recent.map((path) => ({
    label: path.split("/").filter(Boolean).pop() ?? path,
    path, kind: "recent", served: true,
  })));

  // …and the way to ADD one: the current folder becomes a bookmark, which in
  // roots-mode is also the grant. Blender's ＋ over the bookmark list.
  const current = picker.listing?.roots ? "" : (picker.listing?.path ?? "");
  if (current) {
    const add = document.createElement("button");
    add.className = "me-side-add";
    add.textContent = t("me.pickerBookmark");
    add.title = t("me.pickerBookmarkWhy");
    add.disabled = busy;
    add.addEventListener("click", () => h.addRoot(current));
    side.appendChild(add);
  }
  const scope = document.createElement("p");
  scope.className = "me-side-scope";
  scope.textContent = picker.scope === "whole-disk"
    ? t("me.scopeAll") : t("me.scopeRoots");
  side.appendChild(scope);
  return side;
}

/** The file list: folders first, filtered by name, sorted by the clicked column
 *  — and only the mappable files enabled. */
function pickerFiles(state: MappingEditorState, h: MappingEditorHandlers,
                     busy: boolean): HTMLElement {
  const picker = state.picker!;
  const pane = document.createElement("div");
  pane.className = "me-picker-pane";

  const tools = document.createElement("div");
  tools.className = "me-picker-tools";
  const filter = document.createElement("input");
  filter.type = "text";
  filter.className = "me-filter";
  filter.value = picker.filter;
  filter.placeholder = t("me.pickerFilter");
  filter.addEventListener("input", () => h.setPickerFilter(filter.value));
  tools.appendChild(filter);
  for (const sort of ["name", "date", "size"] as const) {
    const button = document.createElement("button");
    button.textContent = t(`me.sort.${sort}`);
    button.className = picker.sort === sort ? "on" : "";
    button.disabled = busy;
    button.addEventListener("click", () => h.setPickerSort(sort));
    tools.appendChild(button);
  }
  pane.appendChild(tools);

  if (picker.error) {
    const error = document.createElement("p");
    error.className = "me-error";
    error.textContent = picker.error;
    pane.appendChild(error);
    return pane;
  }
  if (picker.loading || !picker.listing) {
    const wait = document.createElement("p");
    wait.className = "me-muted";
    wait.textContent = t("me.pickerLoading");
    pane.appendChild(wait);
    return pane;
  }

  const list = document.createElement("div");
  list.className = "me-picker-list";
  const known = state.extensions ?? {};
  const needle = picker.filter.trim().toLowerCase();
  const entries = picker.listing.entries
    .filter((e) => !needle || e.name.toLowerCase().includes(needle))
    .sort((a, b) => {
      // folders first, always: it is a hierarchy, and mixing them makes it a
      // list of names
      if ((a.type === "dir") !== (b.type === "dir")) {
        return a.type === "dir" ? -1 : 1;
      }
      if (picker.sort === "size") return (b.size ?? 0) - (a.size ?? 0);
      if (picker.sort === "date") {
        return ((b as { mtime?: number }).mtime ?? 0)
          - ((a as { mtime?: number }).mtime ?? 0);
      }
      return a.name.localeCompare(b.name);
    });
  for (const entry of entries) {
    const row = document.createElement("button");
    row.className = "me-picker-row";
    if (entry.type === "dir") {
      row.classList.add("dir");
      row.textContent = `▸ ${entry.name}`;
      row.disabled = busy || Boolean(entry.outside);
      if (entry.outside) row.title = t("me.pickerOutside");
      row.addEventListener("click", () => h.browse(entry.path));
    } else {
      // WHICH files are mappable is the library's answer (`extensions`), not a
      // list written here. Unmappable ones are shown and disabled rather than
      // hidden: "my file is not in the list" is a worse puzzle than "my file is
      // greyed out, and the tooltip says why".
      const format = known[(entry.ext || "").toLowerCase().replace(/^\./, "")];
      row.textContent = format ? `${entry.name} · ${format}` : entry.name;
      row.disabled = busy || !format;
      if (!format) row.title = t("me.pickerNotASource");
      row.addEventListener("click", () => h.chooseFile(entry.path));
    }
    list.appendChild(row);
  }
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "me-muted";
    empty.textContent = needle ? t("me.pickerNoMatch") : t("me.pickerEmpty");
    list.appendChild(empty);
  }
  pane.appendChild(list);
  return pane;
}

function pickerRow(label: string, options: Array<{ value: string; label: string }>,
                   current: string, onPick: (value: string) => void,
                   busy: boolean): HTMLElement {
  const row = document.createElement("label");
  row.className = "me-row";
  const span = document.createElement("span");
  span.textContent = label;
  const select = document.createElement("select");
  select.disabled = busy;
  for (const option of options) {
    const opt = document.createElement("option");
    opt.value = option.value;
    opt.textContent = option.label;
    select.appendChild(opt);
  }
  select.value = current;
  select.addEventListener("change", () => onPick(select.value));
  row.append(span, select);
  return row;
}

/** The field panel — one row per field, with its samples and its two choices.
 *  A table, because that is what a source is, and because the Shelf window's
 *  table established the shape (SHELF-B). */
function fieldsBox(state: MappingEditorState, h: MappingEditorHandlers,
                   busy: boolean): HTMLElement {
  const section = box("me.fields");
  const count = document.createElement("p");
  count.className = "me-muted";
  count.textContent = t("me.mappedCount", { n: String(mappedCount(state)),
                                            total: String(state.fields.length) });
  section.appendChild(count);

  const table = document.createElement("table");
  table.className = "me-table";
  const head = document.createElement("thead");
  head.innerHTML = `<tr><th>${t("me.field")}</th><th>${t("me.samples")}</th>` +
    `<th>${t("me.mapTo")}</th><th>${t("me.role")}</th></tr>`;
  const body = document.createElement("tbody");
  for (const field of state.fields) {
    body.appendChild(fieldRow(state, h, field, busy));
  }
  table.append(head, body);
  section.appendChild(table);
  return section;
}

const ROLES: FieldRole[] = ["", "id", "description", "property", "relation"];

function fieldRow(state: MappingEditorState, h: MappingEditorHandlers,
                  field: MappingField, busy: boolean): HTMLElement {
  const choice = state.choices[field.name] ?? { role: "" as FieldRole };
  const row = document.createElement("tr");
  row.className = choice.role ? "me-mapped" : "";

  const name = document.createElement("td");
  name.className = "me-field";
  name.textContent = field.name;
  if (field.source_path && field.source_path !== field.name) {
    const path = document.createElement("code");
    path.textContent = field.source_path;
    name.appendChild(path);
  }

  // THE SAMPLES. The reason this editor is usable at all: `d_interpretativa`
  // means nothing, and "Crollo del tetto" means everything.
  const samples = document.createElement("td");
  samples.className = "me-samples";
  samples.textContent = field.samples.filter((s) => s).join(" · ") || "—";
  samples.title = t("me.filled", { filled: String(field.filled),
                                   seen: String(field.seen) });
  if (!field.filled) samples.classList.add("me-empty");

  const target = document.createElement("td");
  const cidoc = document.createElement("select");
  cidoc.disabled = busy;
  const none = document.createElement("option");
  none.value = "";
  none.textContent = t("me.noClass");
  cidoc.appendChild(none);
  const targetOption = (entry: CidocTarget): HTMLOptionElement => {
    const option = document.createElement("option");
    option.value = entry.cidoc;
    // the CIDOC class is what the author picks; the EM type it resolves to is
    // shown beside it, because that is the thing that will be in the graph
    option.textContent = entry.cidoc_direct
      ? `${entry.cidoc} · ${t("me.cidocDirect")}`
      : `${entry.cidoc} → ${entry.em_type}`;
    return option;
  };
  // GROUPED BY ONTOLOGY when the library grouped them — CRMarchaeo's
  // stratigraphic classes are a different commitment from the CRM trunk's, and a
  // flat list of thirty-two says they are the same kind of choice. Flat is the
  // fallback for an older bridge, not a second layout to maintain.
  if (state.groups?.length) {
    for (const group of state.groups) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = group.version
        ? `${group.ontology} ${group.version} · ${group.count}`
        : `${group.ontology} · ${group.count}`;
      for (const entry of group.targets) optgroup.appendChild(targetOption(entry));
      cidoc.appendChild(optgroup);
    }
  } else {
    for (const entry of state.catalog) cidoc.appendChild(targetOption(entry));
  }
  cidoc.value = choice.cidoc ?? "";
  cidoc.addEventListener("change", () => h.setChoice(field.name,
    { ...choice, cidoc: cidoc.value || undefined }));
  target.appendChild(cidoc);
  const picked = state.catalog.find((c) => c.cidoc === choice.cidoc);
  if (picked?.cidoc_direct) {
    const badge = document.createElement("span");
    badge.className = "me-badge me-direct";
    badge.textContent = t("me.cidocDirect");
    badge.title = t("me.cidocDirectWhy");
    target.appendChild(badge);
  }

  const role = document.createElement("td");
  const roleSelect = document.createElement("select");
  roleSelect.disabled = busy;
  for (const value of ROLES) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value ? t(`me.role.${value}`) : t("me.role.none");
    roleSelect.appendChild(option);
  }
  roleSelect.value = choice.role;
  roleSelect.addEventListener("change", () => h.setChoice(field.name,
    { ...choice, role: roleSelect.value as FieldRole }));
  role.appendChild(roleSelect);
  if (choice.role === "property") {
    const propertyName = document.createElement("input");
    propertyName.type = "text";
    propertyName.className = "me-prop";
    propertyName.value = choice.property_name ?? field.name;
    propertyName.placeholder = t("me.propertyName");
    propertyName.addEventListener("change", () => h.setChoice(field.name,
      { ...choice, property_name: propertyName.value }));
    role.appendChild(propertyName);
  }

  row.append(name, samples, target, role);
  return row;
}

/** The relations — the same gesture as the canvas: pick two ends, pick the edge
 *  from what the datamodel allows between them. */
function relationsBox(state: MappingEditorState, h: MappingEditorHandlers,
                      busy: boolean): HTMLElement {
  const section = box("me.relations");
  const fields = relatableFields(state);
  if (fields.length < 2) {
    const hint = document.createElement("p");
    hint.className = "me-muted";
    hint.textContent = t("me.relationsNeedTwo");
    section.appendChild(hint);
    return section;
  }
  state.relations.forEach((relation, index) => {
    const row = document.createElement("div");
    row.className = "me-row";
    const source = fieldSelect(fields, relation.source_column, busy, (value) =>
      h.setRelation(index, { ...relation, source_column: value, edge_type: "" }));
    const target = fieldSelect(fields, relation.target_column, busy, (value) =>
      h.setRelation(index, { ...relation, target_column: value, edge_type: "" }));
    const key = edgeKey(typeOfField(state, relation.source_column) ?? "",
                        typeOfField(state, relation.target_column) ?? "");
    const options = state.edgeOptions[key] ?? [];
    const edge = document.createElement("select");
    edge.disabled = busy || !options.length;
    const none = document.createElement("option");
    none.value = "";
    none.textContent = options.length ? t("me.pickEdge") : t("me.noEdge");
    edge.appendChild(none);
    const edgeOption = (option: EdgeOption): HTMLOptionElement => {
      const item = document.createElement("option");
      item.value = option.edge_type;
      // the CIDOC property beside the EM edge: the same two faces the whole
      // editor is built on
      item.textContent = option.cidoc
        ? `${option.edge_type} · ${option.cidoc}`
        : option.edge_type;
      return item;
    };
    const grouped = state.edgeGroups?.[key];
    if (grouped?.length) {
      for (const group of grouped) {
        const optgroup = document.createElement("optgroup");
        optgroup.label = group.ontology === "unmapped"
          ? t("me.edgeUnmapped")
          : (group.version ? `${group.ontology} ${group.version}` : group.ontology);
        for (const option of group.edges) optgroup.appendChild(edgeOption(option));
        edge.appendChild(optgroup);
      }
    } else {
      for (const option of options) edge.appendChild(edgeOption(option));
    }
    edge.value = relation.edge_type;
    edge.addEventListener("change", () => h.setRelation(index,
      { ...relation, edge_type: edge.value }));
    const drop = document.createElement("button");
    drop.className = "me-x";
    drop.textContent = "✕";
    drop.disabled = busy;
    drop.addEventListener("click", () => h.removeRelation(index));
    row.append(source, arrow(), target, edge, drop);
    section.appendChild(row);
  });
  const add = document.createElement("button");
  add.textContent = t("me.addRelation");
  add.disabled = busy;
  add.addEventListener("click", () => h.addRelation());
  section.appendChild(add);
  return section;
}

function arrow(): HTMLElement {
  const span = document.createElement("span");
  span.className = "me-arrow";
  span.textContent = "→";
  return span;
}

function fieldSelect(fields: string[], current: string, busy: boolean,
                     onPick: (value: string) => void): HTMLElement {
  const select = document.createElement("select");
  select.disabled = busy;
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "—";
  select.appendChild(none);
  for (const field of fields) {
    const option = document.createElement("option");
    option.value = field;
    option.textContent = field;
    select.appendChild(option);
  }
  select.value = current;
  select.addEventListener("change", () => onPick(select.value));
  return select;
}

function outputBox(state: MappingEditorState, h: MappingEditorHandlers,
                   busy: boolean): HTMLElement {
  const section = box("me.output");
  const row = document.createElement("div");
  row.className = "me-row";
  const name = document.createElement("input");
  name.type = "text";
  name.value = state.name;
  name.placeholder = t("me.namePlaceholder");
  name.addEventListener("change", () => h.setName(name.value));
  const check = document.createElement("button");
  check.textContent = t("me.validate");
  check.disabled = busy;
  check.addEventListener("click", () => h.validate());
  row.append(name, check);
  section.appendChild(row);

  if (state.verdict) section.appendChild(verdictBox(state.verdict));

  const acts = document.createElement("div");
  acts.className = "me-row";
  const download = document.createElement("button");
  download.textContent = t("me.export");
  download.disabled = busy;
  download.addEventListener("click", () => h.exportJson());
  const save = document.createElement("button");
  save.textContent = t("me.saveRegistry");
  save.title = t("me.saveRegistryWhy");
  save.disabled = busy;
  save.addEventListener("click", () => h.saveToRegistry());
  acts.append(download, save);
  section.appendChild(acts);

  const preview = document.createElement("details");
  preview.className = "me-preview";
  const summary = document.createElement("summary");
  summary.textContent = t("me.preview");
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(buildMapping(state), null, 1);
  preview.append(summary, pre);
  section.appendChild(preview);
  return section;
}

function verdictBox(verdict: Verdict): HTMLElement {
  const box = document.createElement("div");
  box.className = "me-verdict " + (verdict.ok ? "ok" : "bad");
  const head = document.createElement("p");
  head.textContent = verdict.ok ? t("me.verdictOk") : t("me.verdictBad");
  box.appendChild(head);
  for (const [kind, lines] of [["error", verdict.errors],
                               ["warning", verdict.warnings]] as const) {
    for (const line of lines) {
      const item = document.createElement("p");
      item.className = `me-${kind}`;
      item.textContent = line;
      box.appendChild(item);
    }
  }
  return box;
}

// ── MICRO-UN-POSTO · the door: who filled it, how it is read, where it lands ──

function fromBanner(state: MappingEditorState): HTMLElement | null {
  const from = state.from;
  if (!from || from.kind === "file") return null;
  const p = document.createElement("p");
  p.className = `me-from me-from-${from.kind}`;
  p.dataset.from = from.kind;
  p.textContent = from.kind === "aux"
    ? t("me.fromAux", { name: from.label ?? "", graph: state.hostLabel ?? "" })
    : t("me.fromStratiMiner");
  return p;
}

function radio(name: string, value: string, checked: boolean, label: string,
               disabled: boolean, onPick: () => void, why?: string): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "me-radio" + (disabled ? " off" : "");
  const input = document.createElement("input");
  input.type = "radio";
  input.name = name;
  input.value = value;
  input.checked = checked;
  input.disabled = disabled;
  input.addEventListener("change", () => { if (input.checked) onPick(); });
  const span = document.createElement("span");
  span.textContent = label;
  wrap.append(input, span);
  if (why) wrap.title = why;
  return wrap;
}

function mappingBox(state: MappingEditorState, h: MappingEditorHandlers,
                    busy: boolean): HTMLElement {
  const section = box("me.mappingHead");
  section.dataset.box = "mapping";
  const kind = state.mappingKind ?? "authored";
  const row = document.createElement("div");
  row.className = "me-radios";
  for (const k of MAPPING_KINDS) {
    row.appendChild(radio("me-mapping", k, k === kind, t(`me.mapping.${k}`), busy,
                          () => h.setMappingKind(k)));
  }
  section.appendChild(row);
  const hint = document.createElement("p");
  hint.className = "me-muted";
  hint.textContent = t(`me.mapping.${kind}Why`);
  if (kind === "file" || kind === "registry") {
    const ref = document.createElement("div");
    ref.className = "me-row";
    const input = document.createElement("input");
    input.type = "text";
    input.dataset.field = "mapping-ref";
    input.value = (kind === "file" ? state.mappingPath : state.mappingName) ?? "";
    input.placeholder = t(kind === "file" ? "impmap.mappingFileHint" : "impmap.mappingRegistryHint");
    input.addEventListener("change", () => h.setMappingRef(input.value));
    ref.appendChild(input);
    if (kind === "file") {
      const choose = document.createElement("button");
      choose.textContent = t("impmap.choose");
      choose.disabled = busy;
      choose.addEventListener("click", () => h.pickMappingFile());
      ref.appendChild(choose);
    }
    section.appendChild(ref);
  } else if (kind === "authored" && !state.fields.length) {
    hint.textContent = t("me.mapping.authoredEmpty");
  }
  section.appendChild(hint);
  return section;
}

function landingBox(state: MappingEditorState, h: MappingEditorHandlers,
                    busy: boolean): HTMLElement {
  const section = box("me.landingHead");
  section.dataset.box = "landing";
  const hasHost = !!state.hostLabel;
  const target = state.target ?? "new";
  const landing = state.landing ?? "baked";
  const targets = document.createElement("div");
  targets.className = "me-radios";
  targets.appendChild(radio("me-target", "new", target === "new", t("impmap.targetNew"),
                            busy, () => h.setTarget("new"), t("impmap.targetNewWhy")));
  targets.appendChild(radio("me-target", "this", target === "this",
                            hasHost ? `${t("impmap.targetThis")} — ${state.hostLabel}` : t("impmap.targetThis"),
                            busy || !hasHost, () => h.setTarget("this"),
                            hasHost ? t("impmap.targetThisWhy") : t("impmap.noGraph")));
  section.appendChild(targets);
  const lands = document.createElement("div");
  lands.className = "me-radios me-landings";
  for (const l of LANDINGS) {
    const refused = landingRefusal(target, l, hasHost);
    lands.appendChild(radio("me-landing", l, l === landing, t(`land.${l}`),
                            busy || !!refused, () => h.setLanding(l),
                            refused ? t(refused) : t(`land.${l}Why`)));
  }
  section.appendChild(lands);
  const why = document.createElement("p");
  why.className = "me-muted";
  const refused = landingRefusal(target, landing, hasHost);
  why.textContent = refused ? t(refused) : t(`land.${landing}Why`);
  section.appendChild(why);

  const acts = document.createElement("div");
  acts.className = "me-row";
  const apply = document.createElement("button");
  apply.className = "primary";
  apply.dataset.action = "apply";
  apply.textContent = t("me.applyOne");
  const kind = state.mappingKind ?? "authored";
  apply.disabled = busy || !!refused || !state.path.trim()
    || (kind === "authored" && (!state.fields.length || state.verdict?.ok === false))
    || (kind === "file" && !state.mappingPath?.trim())
    || (kind === "registry" && !state.mappingName?.trim());
  apply.addEventListener("click", () => h.apply());
  acts.appendChild(apply);
  section.appendChild(acts);

  if (state.trial) {
    const trial = document.createElement("div");
    trial.className = "me-row me-trial";
    const p = document.createElement("span");
    p.className = "me-muted";
    p.textContent = t("land.trialOpen", { n: String(state.trial.nodes) });
    const write = document.createElement("button");
    write.dataset.action = "write-trial";
    write.textContent = t("land.writeIn");
    write.disabled = busy;
    write.addEventListener("click", () => h.writeTrial());
    const drop = document.createElement("button");
    drop.dataset.action = "drop-trial";
    drop.textContent = t("land.takeOut");
    drop.disabled = busy;
    drop.addEventListener("click", () => h.dropTrial());
    trial.append(p, write, drop);
    section.appendChild(trial);
  }

  if (state.applied) {
    const report = document.createElement("p");
    report.className = "me-muted";
    report.dataset.applied = "1";
    const a = state.applied as { landing?: string; rows?: number;
                                 nodes_added?: number; edges_added?: number };
    report.textContent = t("me.applied", {
      mode: a.landing ? t(`land.${a.landing}`) : "", rows: String(a.rows ?? 0),
      nodes: String(a.nodes_added ?? 0), edges: String(a.edges_added ?? 0) });
    section.appendChild(report);
  }
  return section;
}
