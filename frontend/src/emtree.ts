/**
 * EMTree — the workspace: several graphs open at once, one of them active.
 *
 * EMStudio held exactly one document. This turns that one into **the active
 * slot** of a collection, and the change is deliberately shaped so nothing else
 * had to be rewritten: `main.ts` keeps its single module-level `store`, and this
 * module owns *which* store that is. Every consumer — canvas, Inspector, the
 * narrative view, export, Shelf — still reads "the graph" and gets the active one.
 *
 * **Why not a per-consumer graph parameter.** Threading a graph id through 232
 * call sites would have been a rewrite with 232 chances to leave one reading a
 * stale document. Keeping a single "active" pointer means there is exactly one
 * place where the answer to "which graph?" can be wrong, and it is here.
 *
 * **Modelled on EMtools' EM Tree**, so the two tools port mentally without a
 * translation table:
 *
 * | EMtools (`scene.em_tools`) | here |
 * |---|---|
 * | `graphml_files` (collection of file slots) | `slots` |
 * | `active_file_index` | `activeIndex` (and `activeId`, which is what the code uses) |
 * | `auxiliary_files` (per graph) | `GraphSlot.auxiliaryFiles` — **stub**, see below |
 *
 * ``activeId`` rather than an index is what the rest of the code uses: an index
 * silently points at a different graph after a remove, and that is the kind of
 * bug that shows up as "the wrong document saved over the right one".
 */

import type { DocumentStore } from "./model";
import type { ViewKind } from "./types";
import { getRecents, type RecentFile } from "./recent";

/**
 * A per-graph auxiliary file — **the place, not the feature** (ET1 P0).
 *
 * In EMtools an auxiliary file is a source hanging off a graph: an xlsx, a
 * pyArchInit database, an XML export. Two properties decide how they must be
 * treated here, and both are why this is a stub rather than an implementation:
 *
 * 1. **Aux content is VOLATILE.** It is mapped on the fly and must NOT end up in
 *    em.json unless the user explicitly **bakes** it — the temporary→persistent
 *    pattern the resource layer already has. An aux file that quietly persisted
 *    would put a copy of somebody's database inside a document they then share.
 * 2. **The sources are plural**: local files now; the StratiGraph Catalog, the
 *    HDT Catalog (ECCCH) and MinIO later. Each brings its own resolution and its
 *    own auth, so the shape here is deliberately minimal: what it is and where it
 *    came from, nothing about how to read it.
 *
 * AUX1 (2026-08-05) built the SECTION: the per-slot list, the five types, add /
 * remove / expand, and the volatile-vs-baked state. What is still missing is the
 * part that needs an importer:
 *
 * TODO(ET2): the MAPPING and the bake — turning an xlsx row or a pyArchInit
 *   record into nodes, and merging them into the active graph. No importer is
 *   wired: `s3dgraphy` has `mapped_xlsx_importer`, `pyarchinit_importer` and
 *   `unified_xlsx_importer`, and the bridge exposes `/import-em-data`, but that
 *   one BUILDS a document rather than merging into one — a bake is a merge, and
 *   inventing it here would be inventing the semantics of the merge too.
 * TODO(ET3): the non-local sources (StratiGraph Catalog, HDT Catalog, MinIO) +
 *   "promote to MinIO". `kind` is already the field that will say which.
 */
/**
 * What KIND of source an auxiliary file is — the five EMtools types
 * (`em_setup/properties.py::AuxiliaryFileProperties.file_type`), same tokens so
 * the two tools name the same thing the same way and a future exchange needs no
 * translation table.
 */
export type AuxFileType =
  | "emdb_xlsx"
  | "pyarchinit"
  | "dosco"
  | "source_list"
  | "resource_collection"
  // IMPMAP (2026-09-19) · the SIXTH, and the only one that is not a kind of
  // file: it is a file plus the DESCRIPTOR that says how to read it. The five
  // above each stand for a shape somebody agreed on once (an EMdb workbook, a
  // pyArchInit database); a partner's dataset has no such shape, it has a
  // mapping written beside it. Adding it as a type rather than widening the
  // hard-coded gate in `mapAux` is what keeps "which sources can be attached"
  // a list of types and not a condition in a function.
  | "mapped_source";

/** The five types with their labels and what they are for (shown in the UI). */
export const AUX_FILE_TYPES: {
  value: AuxFileType;
  label: string;
  hint: string;
  /** a folder rather than a file — the picker and the detail panel differ */
  folder?: boolean;
}[] = [
  {
    value: "emdb_xlsx",
    label: "EMdb Excel",
    hint: "Excel workbook in an EMdb format — units, epochs, claims.",
  },
  {
    value: "pyarchinit",
    label: "pyArchInit",
    hint: "pyArchInit database (SQLite/PostGIS): the excavation's own records.",
  },
  {
    value: "dosco",
    label: "DosCo",
    hint: "Documentation folder harvested for document files.",
    folder: true,
  },
  {
    value: "source_list",
    label: "Source list",
    hint: "Excel list of sources for document / extractor / combiner nodes.",
  },
  {
    value: "resource_collection",
    label: "Resource collection",
    hint: "Folder of multimodal resources (images, documents) linked to nodes.",
    folder: true,
  },
  {
    value: "mapped_source",
    label: "Mapped source",
    hint: "Any table or XML, read through a mapping file chosen on disk (or a registry mapping): the descriptor that lives beside the dataset.",
  },
];

export interface AuxiliaryFile {
  id: string;
  name: string;
  /** Where it lives. `local` is the only one P0 would accept. */
  kind: "local" | "catalog" | "hdt" | "minio";
  locator: string;
  /** Which of the five source kinds this is (AUX1). */
  fileType: AuxFileType;
  /**
   * False until a bake has written its content into the graph. Kept on the slot,
   * never in the document, precisely so that an un-baked aux cannot travel.
   */
  baked: boolean;
  /**
   * AUX2 · true once the source has been MAPPED: its nodes are in the in-memory
   * graph (visible on the canvas and in the EM-Data table, marked volatile in
   * blue) but not yet baked into em.json. `mapped && !baked` = volatile;
   * `baked` = persistent; neither = attached only.
   */
  mapped?: boolean;
  /**
   * Per-type options — a mapping name, a table choice, a resource folder.
   *
   * A free object and not a class per type on purpose: EMtools needs one Blender
   * property per option because its UI is declarative, while here the detail
   * panel is drawn from `AUX_FILE_TYPES` and the options a type actually uses are
   * whatever ET2's mapping ends up needing. Typing them now would be inventing
   * the mapping's shape before the mapping exists.
   */
  options?: Record<string, unknown>;
  /**
   * IMPMAP · what the last map actually did — kept because ONE of its numbers
   * has no other way of being seen.
   *
   * `unmatched` is the list of key values that matched no node in this graph. It
   * only exists when the source was attached (the graph is authoritative, the
   * table enriches), and it is the difference between a typo in the key column
   * and a unit still to be drawn. A count in a toast that has already faded is
   * not an answer to "which ones?", so the list stays on the row.
   */
  report?: AuxMapReport;
  /** open in the detail panel (view state, per session) */
  expanded?: boolean;
}

/** What a map returned: the counts, and the keys that found nothing. */
export interface AuxMapReport {
  rows: number;
  nodesAdded: number;
  edgesAdded: number;
  /** the key values that matched no node — empty unless the source was attached */
  unmatched: string[];
  unmatchedCount: number;
}

/**
 * View state that belongs to a graph rather than to the app.
 *
 * Carried per slot because otherwise switching tabs would silently throw away
 * work: `graphOverrides` holds the user's manual drags in Graph view, and losing
 * those on every switch is the first thing anyone would notice. Kept OUT of the
 * document — none of it is archival, and writing it to em.json would make a
 * camera position part of the language.
 */
export interface SlotViewState {
  view: ViewKind;
  /** Manual node drags in Graph view (id → position). */
  graphOverrides: Map<string, { x: number; y: number }>;
  /** Top-level epochs the user collapsed back into a single lane. */
  phasesCollapsed: Set<string>;
  /**
   * Where the camera was, per view — three numbers each.
   *
   * Carried per slot because the viewports are shared by view KIND, not by
   * document: a 215-node matrix and a 17-node one need very different pan and
   * zoom, so without this a switch leaves the incoming graph microscopic or off
   * screen entirely. `null` means "never shown yet" → fit it on arrival, which is
   * also what makes the first activation behave like an open.
   */
  camera: Partial<Record<ViewKind, { x: number; y: number; scale: number }>>;
}

export function emptyViewState(view: ViewKind = "matrix"): SlotViewState {
  return {
    view,
    graphOverrides: new Map(),
    phasesCollapsed: new Set(),
    camera: {},
  };
}

/**
 * F2 · One open FILE — the unit Save writes.
 *
 * A list BESIDE the slots, not deduced from `slot.path`: until today the only
 * trace of "which file does this graph come from" was a path on the slot, and
 * Save ignored it — it wrote every open graph into the active slot's file, so two
 * files opened together became two copies of one project. Now each slot names
 * its file (`GraphSlot.fileId`) and Save writes a file with ITS graphs.
 */
export interface OpenFile {
  id: string;
  /** absolute path on the desktop; null for a browser drop (it still has a name) */
  path: string | null;
  /** the file name shown in the tree */
  name: string;
  /** P3 · the revision this file is, per file (two files, two histories) */
  version: unknown;
  /** a change of WHICH graphs the file holds (a graph moved in or out): the
   *  graphs' own stores are not dirty, the file is */
  dirty: boolean;
  /**
   * The sections of graphs that are in the file but no longer open — written back
   * as they were. Closing a graph is not deleting it from its file: without this,
   * closing one graph of a two-graph project and saving would erase it on disk.
   * Keyed by graph id; `section` already carries its own `layout` (F4).
   */
  retained: Record<string, Record<string, unknown>>;
  /** the sections as last read or written, so a close can retain the ON-DISK
   *  version (closing discards unsaved edits, after asking) */
  onDisk: Record<string, Record<string, unknown>>;
}

/** The tail of a path a row can show: the last two folders and the name. */
export function pathTail(path: string | null, keep = 3): string {
  if (!path) return "";
  const parts = path.split(/[\\/]/).filter(Boolean);
  return (parts.length > keep ? "…/" : "/") + parts.slice(-keep).join("/");
}

/** One open graph. */
export interface GraphSlot {
  id: string;
  /**
   * FALLBACK label, used only while the document declares no `graph.name`
   * (POL3). The name shown in the tree is `slotLabel(slot)` — read from the
   * document — because the graph's name has exactly one home.
   *
   * Before, the slot carried its own `name` and renaming a row edited only that:
   * the Inspector's "Graph · dataset info" kept showing the old name, and the two
   * drifted apart with nothing to reconcile them. The earlier reasoning (a tab
   * label is not the document's name, so two copies of one graph can be told
   * apart) lost to the thing users actually do: they rename the graph, in
   * whichever of the two places they happen to be looking at.
   */
  fallbackName: string;
  /** Absolute path on desktop; null for a browser drop or a new graph.
   *  F2 · a MIRROR of its file's path, kept in step by `EMTree.assign`: the truth
   *  of which file a graph belongs to is `fileId`. */
  path: string | null;
  /** F2 · the open file this graph is saved into; null = «Senza file» (a new
   *  graph, a GraphML/StratiMiner/Blender import) until a Save As gives it one */
  fileId: string | null;
  /** DEV30 U1 · the folder the graph came from when it is not yet a file of its
   *  own (a GraphML imported on the desktop): its relative paths are read there. */
  sourceDir?: string | null;
  /** DEV30 V3 · a NEW graph as New made it (the «Epoch 1» seed, no hand on it
   *  yet): its signature at birth (`seedSignature` in main.ts). While it still
   *  matches, the slot is a seed — replaced by the next open, never saved. */
  seedSig?: string;
  /**
   * The slot's own store — **with its own undo stack**. This is what makes the
   * workspace more than "reopen the file": edits and history survive a switch.
   */
  store: DocumentStore;
  auxiliaryFiles: AuxiliaryFile[];
  viewState: SlotViewState;
}

/**
 * The name of the graph in a slot — **the document is the single source** (POL3).
 *
 * A function and not a stored field on purpose: a stored copy is a thing that can
 * be stale, and this one was. Everything that shows a graph's name (the tree, the
 * unsaved-changes prompt, the window title) goes through here, so there is no
 * second place to forget to update.
 */
export function slotLabel(slot: GraphSlot): string {
  const declared = String(
    (slot.store.doc.graph as Record<string, unknown>)["name"] ?? "",
  ).trim();
  return declared || slot.fallbackName;
}

/** The workspace. Pure state + queries; it renders nothing and touches no DOM. */
export class EMTree {
  slots: GraphSlot[] = [];
  /** F2 · the open files, in the order they were opened */
  files: OpenFile[] = [];
  private _activeId: string | null = null;

  // ── F2 · files ──────────────────────────────────────────────────────────────

  /** Register an open file (no graph yet: `assign` puts graphs in it). */
  addFile(path: string | null, name: string): OpenFile {
    const file: OpenFile = {
      id: crypto.randomUUID(), path, name: name || "untitled.em.json",
      version: null, dirty: false, retained: {}, onDisk: {},
    };
    this.files.push(file);
    return file;
  }

  file(id: string | null | undefined): OpenFile | null {
    return id ? this.files.find((f) => f.id === id) ?? null : null;
  }

  fileOf(slot: GraphSlot | null | undefined): OpenFile | null {
    return slot ? this.file(slot.fileId) : null;
  }

  /** The file ⌘S writes: the active graph's (null when it has none yet). */
  activeFile(): OpenFile | null {
    return this.fileOf(this.active());
  }

  /** The open graphs of a file (null = «Senza file»), in tree order. */
  slotsOf(fileId: string | null): GraphSlot[] {
    return this.slots.filter((s) => s.fileId === fileId);
  }

  /** Put a graph in a file (or in «Senza file» with null). The slot's `path`
   *  mirror follows. Moving between two files dirties BOTH files: each has a
   *  different set of graphs to write now. */
  assign(slotId: string, fileId: string | null): void {
    const slot = this.get(slotId);
    if (!slot) return;
    const from = this.file(slot.fileId);
    const to = this.file(fileId);
    if (from && from.id !== fileId) from.dirty = true;
    if (to && slot.fileId !== fileId) to.dirty = true;
    slot.fileId = to ? to.id : null;
    slot.path = to ? to.path : null;
  }

  /** A file got a (new) path — Save As. Its graphs' mirrors follow. */
  setFilePath(fileId: string, path: string, name: string): void {
    const file = this.file(fileId);
    if (!file) return;
    file.path = path;
    file.name = name;
    for (const s of this.slotsOf(fileId)) s.path = path;
  }

  /** Close a file: its graphs and the file go. Returns the id active afterwards. */
  removeFile(fileId: string): string | null {
    for (const s of this.slotsOf(fileId)) this.remove(s.id);
    this.files = this.files.filter((f) => f.id !== fileId);
    return this._activeId;
  }

  /** Unsaved: a graph of the file is dirty, or the file's set of graphs changed. */
  fileDirty(fileId: string | null): boolean {
    const file = this.file(fileId);
    return (!!file && file.dirty) || this.slotsOf(fileId).some((s) => s.store.dirty);
  }

  get activeId(): string | null {
    return this._activeId;
  }

  /** EMtools' `active_file_index`, for the mental port. −1 when nothing is open. */
  get activeIndex(): number {
    return this.slots.findIndex((s) => s.id === this._activeId);
  }

  active(): GraphSlot | null {
    return this.slots.find((s) => s.id === this._activeId) ?? null;
  }

  get(id: string): GraphSlot | null {
    return this.slots.find((s) => s.id === id) ?? null;
  }

  /**
   * Register a graph and make it active. Returns the new slot.
   *
   * Adding always activates, because every caller — Open, New, a drop,
   * StratiMiner — is a user asking to look at this graph now. A silent
   * background add would be a second way to be surprised by which document is on
   * screen.
   */
  add(store: DocumentStore, name: string, path: string | null = null,
      fileId: string | null = null): GraphSlot {
    const file = this.file(fileId);
    const slot: GraphSlot = {
      id: crypto.randomUUID(),
      fallbackName: name || "untitled",
      path: file ? file.path : path,
      fileId: file ? file.id : null,
      store,
      auxiliaryFiles: [],
      viewState: emptyViewState(),
    };
    this.slots.push(slot);
    this._activeId = slot.id;
    return slot;
  }

  /**
   * Drop a slot. Returns the id that is active afterwards (or null).
   *
   * Closing the active slot activates its NEIGHBOUR rather than clearing the
   * canvas: the user closed one graph, not the workspace.
   */
  remove(id: string): string | null {
    const index = this.slots.findIndex((s) => s.id === id);
    if (index === -1) return this._activeId;
    const wasActive = this._activeId === id;
    this.slots.splice(index, 1);
    if (wasActive) {
      const next = this.slots[index] ?? this.slots[index - 1] ?? null;
      this._activeId = next ? next.id : null;
    }
    return this._activeId;
  }

  /** Returns true when the active slot actually changed. */
  setActive(id: string): boolean {
    if (!this.slots.some((s) => s.id === id)) return false;
    if (this._activeId === id) return false;
    this._activeId = id;
    return true;
  }

  /**
   * Rename the graph in a slot. Writes the DOCUMENT, which is the only place the
   * name lives (POL3) — so the Inspector's Name field shows it immediately, and
   * so a rename is a document edit that has to be saved, like any other.
   *
   * Empty input keeps the current name; an unchanged name is a **no-op**, not a
   * rewrite: `updateGraphMeta` checkpoints and marks the document dirty, and
   * pressing Escape out of the inline editor must not do either of those.
   */
  rename(id: string, name: string): void {
    const slot = this.get(id);
    if (!slot) return;
    const next = name.trim();
    if (!next || next === slotLabel(slot)) return;
    slot.fallbackName = next; // stays in step for a doc that declares no name
    slot.store.updateGraphMeta({ name: next });
  }

  /** Any slot with unsaved changes? Used before a destructive action. */
  anyDirty(): boolean {
    return this.slots.some((s) => s.store.dirty) || this.files.some((f) => f.dirty);
  }
}

// ── the panel ─────────────────────────────────────────────────────────────────

export interface EMTreeHandlers {
  onActivate(id: string): void;
  onRemove(id: string): void;
  /** Add = the same Open… the toolbar uses; the tree does not duplicate it. */
  onOpen(): void;
  onNew(): void;
  /** QOL1 · open a recent file (reopenable only when it carries a path). */
  onOpenRecent?(r: RecentFile): void;
  /** Inline rename from the tree (POL1): double-click the name. */
  onRename(id: string, name: string): void;
  /** AUX1 — auxiliary files of the ACTIVE slot. The tree renders, main.ts acts. */
  onAuxAdd?(): void;
  onAuxRemove?(auxId: string): void;
  onAuxToggle?(auxId: string): void;
  onAuxTypeChange?(auxId: string, fileType: AuxFileType): void;
  onAuxBake?(auxId: string): void;
  /** AUX2 — map the source into the graph as volatile nodes (blue, unsaved). */
  onAuxMap?(auxId: string): void;
  /** AUX2 — remove the mapped (volatile) nodes from the graph. */
  onAuxUnmap?(auxId: string): void;
  /** AUX2 — a per-type option changed (mapping name, folder, toggle…). */
  onAuxOption?(auxId: string, key: string, value: string | boolean): void;
  /** AUDIT C · a story row opens that story (it was drawn and did nothing) */
  onOpenStory?(slotId: string, narrativeId: string): void;
  /** F2 · «Sposta in…»: carry a graph to another open file, or a new one */
  onMoveGraph?(slotId: string, anchor: HTMLElement): void;
  /** F2 · save ONE file with its graphs */
  onSaveFile?(fileId: string): void;
  /** F2 · close a file and its graphs (asks if it has unsaved work) */
  onCloseFile?(fileId: string): void;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * OVR1 · which face of the EMTree is showing — the slot LIST (default) or the
 * OVERVIEW dashboard. A module-level toggle, per session and not persisted: it
 * is how you are looking at the workspace, not part of any document. The
 * overview is a VIEW — it reads the graph-scope nodes and writes nothing.
 */
let overviewMode = false;

/**
 * OVR1 · the overview dashboard: one card per open graph, its high-level data
 * read from the GRAPH-SCOPE NODES (MIG1-A: author/licence/embargo + EM-ID on the
 * GraphNode) and the SITE POSITION (GEO1: `readSitePosition`). One source — the
 * nodes — never `graph.data`. Missing values read honestly (no EM-ID / not
 * positioned — from the dictionary), never a fabricated default. Clicking a card
 * activates that slot.
 */
function overviewSection(tree: EMTree, labels: (key: string) => string): string {
  if (!tree.slots.length)
    return `<p class="et-empty">${esc(labels("emtree.empty"))}</p>`;
  const rawLabels = tree.slots.map(slotLabel);
  const seen = new Map<string, number>();
  const cards = tree.slots.map((slot) => {
    const isActive = slot.id === tree.activeId;
    const gs = slot.store.readGraphScope();
    const site = slot.store.readSitePosition();
    const nodes = slot.store.doc.graph?.nodes?.length ?? 0;
    const edges = slot.store.doc.graph?.edges?.length ?? 0;
    let name = slotLabel(slot);
    if (rawLabels.filter((l) => l === name).length > 1) {
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      name = `${name} (${n})`;
    }
    const field = (label: string, value: string, missing: string): string =>
      `<div class="ov-field"><dt>${esc(label)}</dt><dd${value ? "" : ' class="ov-missing"'}>${
        esc(value || missing)
      }</dd></div>`;
    const author = gs.author
      ? gs.author + (gs.orcid ? ` · ${gs.orcid}` : "")
      : "";
    const siteText = site
      ? `${site.lat.toFixed(5)}, ${site.lon.toFixed(5)}`
      : "";
    return `
      <li class="ov-card${isActive ? " active" : ""}" data-id="${esc(slot.id)}">
        <button class="ov-pick" data-id="${esc(slot.id)}"
                title="${esc(slot.path ?? labels("emtree.noFile"))}">
          <div class="ov-head">
            <span class="ov-name">${esc(name)}${slot.store.dirty ? " •" : ""}</span>
            <span class="ov-emid${gs.em_id ? "" : " ov-missing"}">${
              esc(gs.em_id || labels("emtree.noEmId"))
            }</span>
          </div>
          <dl class="ov-fields">
            ${field(labels("emtree.ovAuthor"), author, "—")}
            ${field(labels("emtree.ovLicence"), gs.license, "—")}
            ${field(labels("emtree.ovEmbargo"), gs.embargo, "—")}
            ${field(labels("emtree.ovPosition"), siteText,
                    labels("emtree.ovUnplaced"))}
          </dl>
          <div class="ov-meta">${nodes} ${labels("emtree.nodes")} · ${edges} ${labels("emtree.edges")}</div>
        </button>
        <button class="et-close" data-close="${esc(slot.id)}"
                title="${esc(labels("emtree.close"))}">×</button>
      </li>`;
  }).join("");
  return `<ul class="ov-cards">${cards}</ul>`;
}

/**
 * The AUXILIARY FILES section of the ACTIVE slot — the EMtools section, reproposed.
 *
 * EMtools draws this as a `template_list` per graph with an active index, add /
 * remove buttons and a per-file detail panel when `expanded`
 * (`em_setup/ui.py`, ~line 950). Here the same thing without the Blender idiom:
 * a list of rows, each its own expander, so several can be open at once and the
 * panel needs no "active index" to be kept in step with the selection.
 *
 * For the ACTIVE slot only, and that is the point of the whole feature: an aux
 * file belongs to a graph, and the tree is where "which graph" is decided.
 *
 * Every row states whether it is **volatile** or **baked**, because that is the
 * invariant a user has to be able to see: nothing here is in the document until a
 * bake puts it there, so sharing an em.json does not share somebody's database.
 */
function auxSection(tree: EMTree, labels: (key: string) => string): string {
  const slot = tree.active();
  if (!slot) return "";
  const rows = slot.auxiliaryFiles.map((f) => {
    const type = AUX_FILE_TYPES.find((t) => t.value === f.fileType);
    const state = f.baked ? "baked" : f.mapped ? "volatile" : "attached";
    return `
      <li class="aux-row${f.expanded ? " open" : ""}" data-aux="${esc(f.id)}">
        <button class="aux-head" data-aux-toggle="${esc(f.id)}"
                title="${esc(type?.hint ?? "")}">
          <span class="aux-caret">${f.expanded ? "▾" : "▸"}</span>
          <span class="aux-name">${esc(f.name)}</span>
          <span class="aux-type">${esc(type?.label ?? f.fileType)}</span>
          <span class="aux-badge aux-${state}">${state}</span>
        </button>
        <button class="aux-del" data-aux-remove="${esc(f.id)}"
                title="Remove this auxiliary file (the document is untouched)">×</button>
        ${f.expanded ? auxDetail(f, labels) : ""}
      </li>`;
  }).join("");
  return `
    <div class="aux-sect">
      <div class="aux-sect-head">
        <span>Auxiliary files</span>
        <button data-et="aux-add" title="Attach a local file or folder to this graph">+ add</button>
      </div>
      ${slot.auxiliaryFiles.length
        ? `<ul class="aux-list">${rows}</ul>`
        : `<p class="aux-empty">${esc(labels("emtree.noAux"))} — sources attached
             to this graph, mapped on the fly. Nothing is written into the
             em.json until you bake it.</p>`}
    </div>`;
}

/**
 * The per-type options a source exposes — the SAME tokens EMtools uses
 * (`em_setup/properties.py::AuxiliaryFileProperties`), so the two tools name the
 * same option the same way. Rendered generically into the detail panel; the
 * value lives in `AuxiliaryFile.options[key]` and is written back via
 * `onAuxOption`. `mapping` selects a registry mapping (DP-61) for the xlsx types.
 */
type AuxOptSpec =
  | { key: string; label: string; kind: "text"; placeholder?: string }
  | { key: string; label: string; kind: "bool" }
  | { key: string; label: string; kind: "select"; options: string[] };

const AUX_OPTIONS: Record<AuxFileType, AuxOptSpec[]> = {
  emdb_xlsx: [
    { key: "mapping", label: "Mapping (emdb)", kind: "text", placeholder: "registry mapping name" },
  ],
  pyarchinit: [
    { key: "mapping", label: "Mapping (pyarchinit)", kind: "text", placeholder: "registry mapping name" },
    { key: "import_geometries", label: "Import geometries", kind: "bool" },
    { key: "geom_force_update", label: "Force geometry update", kind: "bool" },
  ],
  dosco: [
    { key: "overwrite_paths", label: "Overwrite existing paths", kind: "bool" },
    { key: "preserve_web_urls", label: "Preserve web URLs", kind: "bool" },
  ],
  source_list: [],
  // IMPMAP · a mapped source carries WHICH mapping, and that is its whole
  // configuration. Either a file (the ordinary case: the descriptor sits next to
  // the dataset) or a registry name, never both — the import dialog writes one of
  // the two and the bridge reads whichever it finds.
  mapped_source: [
    { key: "mappingPath", label: "Mapping file", kind: "text",
      placeholder: "a path to a *_mapping.json" },
    { key: "mappingName", label: "…or a registry mapping", kind: "text",
      placeholder: "a name the s3Dgraphy registry knows" },
  ],
  resource_collection: [
    { key: "thumbs_path", label: "Custom thumbnails folder", kind: "text" },
    { key: "scan_mode", label: "Scan mode", kind: "select", options: ["by_filename", "manual"] },
    { key: "target_node_types", label: "Target node types", kind: "text", placeholder: "e.g. US, SF" },
  ],
};

function auxOptionField(f: AuxiliaryFile, spec: AuxOptSpec): string {
  const v = (f.options ?? {})[spec.key];
  const id = esc(f.id);
  if (spec.kind === "bool") {
    return `<label class="aux-field aux-field-inline">
      <input type="checkbox" data-aux-opt="${id}" data-opt-key="${spec.key}"
             ${v ? "checked" : ""} />
      <span>${esc(spec.label)}</span></label>`;
  }
  if (spec.kind === "select") {
    return `<label class="aux-field"><span>${esc(spec.label)}</span>
      <select data-aux-opt="${id}" data-opt-key="${spec.key}">
        ${spec.options.map((o) =>
          `<option value="${esc(o)}"${String(v) === o ? " selected" : ""}>${esc(o)}</option>`).join("")}
      </select></label>`;
  }
  return `<label class="aux-field"><span>${esc(spec.label)}</span>
    <input type="text" data-aux-opt="${id}" data-opt-key="${spec.key}"
           value="${esc(String(v ?? ""))}" placeholder="${esc(spec.placeholder ?? "")}" /></label>`;
}

/** Why the map action carries a caveat for this type (bridge/mapping gaps). */
function auxMapNote(fileType: AuxFileType): string {
  switch (fileType) {
    case "emdb_xlsx":
      return "Maps via the bridge (/import-em-data) using an s3Dgraphy registry mapping (DP-61); its nodes enter the graph as volatile.";
    case "source_list":
      return "Maps into the Documents sheet. A dedicated source_list→Documents mapping is not yet in the s3Dgraphy registry (flagged) — mapped via the Documents columns for now.";
    case "pyarchinit":
      return "Needs a bridge endpoint for the pyArchInit importer (not yet exposed); flagged for the server side.";
    case "dosco":
      return "Harvests a documentation folder into document nodes — needs a bridge endpoint (flagged).";
    case "resource_collection":
      return "Scans a folder of resources (bridge /scan-resources) and links them — attach-as-volatile needs the endpoint wired (flagged).";
    case "mapped_source":
      return "Maps via the bridge (/mapping-apply) with the mapping named below, ONTO this graph: the units already here win, and a row whose key is not in the graph is listed as unmatched instead of creating a unit.";
  }
}

/**
 * IMPMAP · what the last map did, and above all WHAT IT DID NOT MATCH.
 *
 * Silence is the bug this renders away. Attaching a table to a graph skips every
 * row whose key is not in the graph — which is right, and which is also exactly
 * how a typo in the key column becomes invisible. The count goes in the toast;
 * the KEYS go here, where they can still be read an hour later.
 *
 * Nothing is drawn before a map: a row that has never been mapped has no report,
 * and an empty box saying "0 unmatched" would be a claim about a measurement
 * that never happened.
 */
function auxReport(f: AuxiliaryFile): string {
  const r = f.report;
  if (!r) return "";
  const counts = `${r.rows} row(s) read · ${r.nodesAdded} node(s) · ` +
    `${r.edgesAdded} edge(s)`;
  if (!r.unmatchedCount) {
    return `<p class="aux-hint aux-report">${esc(counts)} — every key found its node.</p>`;
  }
  // …capped, because a mismatched key COLUMN unmatches every row, and a panel
  // listing two thousand of them is a panel nobody scrolls to the end of. The
  // count above it is the whole number either way.
  const shown = r.unmatched.slice(0, 40);
  const rest = r.unmatchedCount - shown.length;
  return `
    <div class="aux-report aux-unmatched">
      <p class="aux-hint">${esc(counts)}</p>
      <p><b>${r.unmatchedCount}</b> key(s) matched no node in this graph —
         nothing was created for them:</p>
      <p class="aux-keys">${shown.map((k) => `<code>${esc(k)}</code>`).join(" ")}${
        rest > 0 ? ` <span class="aux-hint">…and ${rest} more</span>` : ""}</p>
      <p class="aux-hint">Either the key column has a typo, or those units are
         not drawn in this graph yet.</p>
    </div>`;
}

/** The per-file detail panel: type, locator, per-type options, map/bake/unmap. */
function auxDetail(f: AuxiliaryFile, labels: (key: string) => string): string {
  const type = AUX_FILE_TYPES.find((t) => t.value === f.fileType);
  const opts = AUX_OPTIONS[f.fileType] ?? [];
  return `
    <div class="aux-detail">
      <label class="aux-field">
        <span>Type</span>
        <select data-aux-type="${esc(f.id)}">
          ${AUX_FILE_TYPES.map((t) =>
            `<option value="${t.value}"${t.value === f.fileType ? " selected" : ""}
             >${esc(t.label)}</option>`).join("")}
        </select>
      </label>
      <p class="aux-hint">${esc(type?.hint ?? "")}</p>
      <label class="aux-field">
        <span>${type?.folder ? "Folder" : "Path"}</span>
        <input type="text" value="${esc(f.locator)}" readonly
               title="${esc(f.locator)}" />
      </label>
      ${opts.map((o) => auxOptionField(f, o)).join("")}
      <p class="aux-hint">${esc(auxMapNote(f.fileType))}</p>
      ${auxReport(f)}
      <div class="aux-actions">
        ${f.mapped
          ? `<button data-aux-unmap="${esc(f.id)}"
               title="${esc(labels("aux.actTakeOutWhy"))}">${esc(labels("aux.actTakeOut"))}</button>
             <button data-aux-bake="${esc(f.id)}"${f.baked ? " disabled" : ""}
               title="${esc(labels("aux.actWriteWhy"))}">${esc(labels("aux.actWrite"))}</button>`
          : `<button data-aux-map="${esc(f.id)}"
               title="${esc(labels("aux.actAttachWhy"))}">${esc(labels("aux.actAttach"))}</button>`}
        <span class="aux-hint">${esc(labels(f.baked
          ? "aux.stateBaked"
          : f.mapped ? "aux.stateVolatile" : "aux.stateIdle"))}</span>
      </div>
    </div>`;
}

/**
 * Render the tree into `host`.
 *
 * Rebuilt wholesale on each change, like the inspector: a handful of rows, and a
 * diffing scheme would be more code than the thing it saves.
 */
export function renderEMTree(host: HTMLElement, tree: EMTree,
                             handlers: EMTreeHandlers,
                             labels: (key: string) => string): void {
  // Two graphs can legitimately carry the same name (two copies of one dataset,
  // or two "untitled graph" from two News). The list still has to be a list, so
  // the ambiguity is resolved HERE, at draw time, and never stored: a suffix
  // computed from the current slots cannot go stale, whereas the old
  // "untitled graph 2" written into the slot survived every later rename.
  const rawLabels = tree.slots.map(slotLabel);
  const seen = new Map<string, number>();
  const displayNames = rawLabels.map((label) => {
    const total = rawLabels.filter((l) => l === label).length;
    if (total === 1) return label;
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    return `${label} (${n})`;
  });

  const slotRow = (slot: GraphSlot): string => {
    const i = tree.slots.indexOf(slot);
    const isActive = slot.id === tree.activeId;
    const nodes = slot.store.doc.graph?.nodes?.length ?? 0;
    const edges = slot.store.doc.graph?.edges?.length ?? 0;
    const aux = slot.auxiliaryFiles.length;
    // COLLEGARE · the graph's stories, under it: a narrative lives IN a graph
    const stories = (slot.store.doc.graph?.nodes ?? []).filter((n) => n.node_type === "narrative")
      .map((n) => {
        const ch = ((n.data ?? {}) as { chapters?: unknown[] }).chapters;
        return `<button type="button" class="et-story" data-story="${esc(n.id)}" data-slot="${esc(slot.id)}">❧ ${esc(String(n.name || n.id))}`
          + ` <span class="et-meta">${Array.isArray(ch) ? ch.length : 0} ${esc(labels("emtree.chapters"))}</span></button>`;
      }).join("");
    return `
      <li class="et-slot${isActive ? " active" : ""}" data-id="${esc(slot.id)}">
        <button class="et-pick" data-id="${esc(slot.id)}"
                title="${esc(slot.path ?? labels("emtree.noFile"))}">
          <span class="et-name">${esc(displayNames[i])}${slot.store.dirty ? " •" : ""}</span>
          <span class="et-meta">${nodes} ${labels("emtree.nodes")} · ${edges} ${labels("emtree.edges")}</span>
        </button>
        <button class="et-move" data-move="${esc(slot.id)}"
                title="${esc(labels("emtree.moveTitle"))}">⇄</button>
        <button class="et-close" data-close="${esc(slot.id)}"
                title="${esc(labels("emtree.close"))}">×</button>
        <!-- Aux files: the STUB. Shown as a count so the place is visible in the
             UI and nobody wonders where they would go; the list, the mapping and
             the bake are ET2. -->
        ${stories}
        <div class="et-aux">${aux === 0
          ? labels("emtree.noAux")
          : `${aux} ${labels("emtree.auxFiles")}`}</div>
      </li>`;
  };

  // F1 · TWO LEVELS: each open file is a group (its name, the tail of its path,
  // whether it has unsaved work), its graphs under it; the graphs that have no
  // file yet sit in «Senza file». The ACTIVE graph's file is marked: it is the
  // one ⌘S writes, and until today nothing on screen said which that was.
  const activeFileId = tree.active()?.fileId ?? null;
  const known = new Set(tree.files.map((f) => f.id));
  const groups = tree.files.map((file) => {
    const members = tree.slotsOf(file.id);
    const kept = Object.keys(file.retained).length;
    const isTarget = !!tree.active() && activeFileId === file.id;
    return `
      <li class="et-file${isTarget ? " et-file-active" : ""}" data-file="${esc(file.id)}">
        <div class="et-file-head" title="${esc(file.path ?? labels("emtree.fileNoPath"))}">
          <span class="et-file-icon">▤</span>
          <span class="et-file-name">${esc(file.name)}${tree.fileDirty(file.id) ? " •" : ""}</span>
          <span class="et-file-tail">${esc(file.path ? pathTail(file.path) : labels("emtree.fileNoPath"))}</span>
          ${isTarget ? `<span class="et-file-target" title="${esc(labels("emtree.saveTargetTitle"))}">${esc(labels("emtree.saveTarget"))}</span>` : ""}
          <button class="et-file-save" data-save-file="${esc(file.id)}"
                  title="${esc(labels("emtree.saveFileTitle"))}">${esc(labels("emtree.saveFile"))}</button>
          <button class="et-file-close" data-close-file="${esc(file.id)}"
                  title="${esc(labels("emtree.closeFileTitle"))}">×</button>
        </div>
        <ul class="et-slots">${members.map(slotRow).join("")}</ul>
        ${kept ? `<p class="et-retained">${esc(labels("emtree.retained").replace("{n}", String(kept)))}</p>` : ""}
      </li>`;
  });
  const loose = tree.slots.filter((s) => !s.fileId || !known.has(s.fileId));
  if (loose.length) {
    const isTarget = !!tree.active() && !activeFileId;
    groups.push(`
      <li class="et-file et-nofile${isTarget ? " et-file-active" : ""}" data-file="">
        <div class="et-file-head" title="${esc(labels("emtree.noFileGroupTitle"))}">
          <span class="et-file-icon">◌</span>
          <span class="et-file-name">${esc(labels("emtree.noFileGroup"))}</span>
          ${isTarget ? `<span class="et-file-target" title="${esc(labels("emtree.saveTargetNoneTitle"))}">${esc(labels("emtree.saveTargetNone"))}</span>` : ""}
        </div>
        <ul class="et-slots">${loose.map(slotRow).join("")}</ul>
      </li>`);
  }
  const rows = `<ul class="et-files">${groups.join("")}</ul>`;

  // OVR1 · a segmented toggle chooses the LIST (slots + aux) or the OVERVIEW
  // dashboard (cards from the graph-scope nodes). The overview only shows with
  // ≥1 slot; the toggle is hidden when the workspace is empty.
  const toggle = tree.slots.length
    ? `<div class="et-viewtoggle" role="tablist">
        <button data-et="et-mode-list" class="${overviewMode ? "" : "on"}">${
          esc(labels("emtree.viewList"))
        }</button>
        <button data-et="et-mode-overview" class="${overviewMode ? "on" : ""}">${
          esc(labels("emtree.viewOverview"))
        }</button>
      </div>`
    : "";

  const body = overviewMode
    ? overviewSection(tree, labels)
    : `${tree.slots.length
        ? rows
        : `<p class="et-empty">${esc(labels("emtree.empty"))}</p>`}
       ${auxSection(tree, labels)}
       <p class="et-todo">${esc(labels("emtree.auxNote"))}</p>`;

  // QOL1 · recent files (newest first). A path-less entry (a browser drop) is
  // shown but marked not-reopenable — the sandbox cannot reopen a file by path.
  const recents = getRecents();
  const recentBlock = recents.length
    ? `<div class="et-recents">
        <div class="et-recents-head">${esc(labels("emtree.recent"))}</div>
        <ul class="et-recent-list">
          ${recents.map((r, i) =>
            `<li><button class="et-recent${r.path ? "" : " et-recent-nofile"}"
                 data-recent="${i}" title="${esc(r.path ?? labels("emtree.noFile"))}">
               ${esc(r.name)}</button></li>`).join("")}
        </ul>
      </div>`
    : "";

  host.innerHTML = `
    <div class="et-panel">
      <p class="et-intro">${esc(labels("emtree.intro"))}</p>
      <div class="et-actions">
        <button data-et="et-new">${esc(labels("emtree.new"))}</button>
        <button data-et="et-open">${esc(labels("emtree.open"))}</button>
      </div>
      ${recentBlock}
      ${toggle}
      ${body}
    </div>`;

  host.querySelectorAll<HTMLButtonElement>(".et-recent").forEach((button) => {
    button.addEventListener("click", () => {
      const r = recents[Number(button.dataset.recent)];
      if (r) handlers.onOpenRecent?.(r);
    });
  });

  // OVR1 · toggle handlers: flip the mode and re-render this same panel (the
  // overview is view-only, so a re-render is all it takes).
  const setMode = (overview: boolean): void => {
    if (overviewMode === overview) return;
    overviewMode = overview;
    renderEMTree(host, tree, handlers, labels);
  };
  host.querySelector<HTMLButtonElement>('[data-et="et-mode-list"]')
    ?.addEventListener("click", () => setMode(false));
  host.querySelector<HTMLButtonElement>('[data-et="et-mode-overview"]')
    ?.addEventListener("click", () => setMode(true));
  // Overview cards activate their slot on click (same as a list row).
  host.querySelectorAll<HTMLButtonElement>(".ov-pick").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.id;
      if (id) handlers.onActivate(id);
    });
  });

  host.querySelectorAll<HTMLButtonElement>(".et-pick").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.id;
      if (id) handlers.onActivate(id);
    });
  });
  host.querySelectorAll<HTMLButtonElement>(".et-story").forEach((button) => {
    button.addEventListener("click", () => {
      const { slot, story } = button.dataset;
      if (slot && story) handlers.onOpenStory?.(slot, story);
    });
  });

  // Inline rename (POL1): double-click the name. Useful the moment you create a
  // graph, when "untitled graph 2" is the only thing telling it apart from
  // "untitled graph 3".
  //
  // On the NAME rather than a pencil button: the row is already a button (it
  // activates), and hanging a second control off it would crowd a list whose job
  // is to be scannable. Double-click is the outliner convention this tree is
  // modelled on.
  host.querySelectorAll<HTMLElement>(".et-name").forEach((label) => {
    label.addEventListener("dblclick", (event) => {
      event.stopPropagation(); // do not also activate the row
      const slotId = label.closest<HTMLElement>(".et-slot")?.dataset.id;
      if (!slotId) return;
      const slot = tree.get(slotId);
      if (!slot) return;

      const input = document.createElement("input");
      input.type = "text";
      input.className = "et-rename";
      // the GRAPH's name, not the disambiguated display name: editing a field
      // pre-filled with "untitled graph (2)" would write that suffix into the
      // document, and the suffix is a fact about the list, not about the graph
      input.value = slotLabel(slot);
      label.replaceWith(input);
      input.focus();
      input.select();

      let done = false;
      const commit = (keep: boolean): void => {
        if (done) return; // blur fires after Enter too
        done = true;
        // Escape passes the CURRENT name back: `rename` no-ops on an unchanged
        // name, so the round trip only re-renders the row (restoring the label
        // element) without checkpointing or dirtying the document.
        handlers.onRename(slotId, keep ? input.value : slotLabel(slot));
      };
      input.addEventListener("keydown", (keyEvent) => {
        if (keyEvent.key === "Enter") commit(true);
        else if (keyEvent.key === "Escape") commit(false);
        // Stop here: the app binds single letters as canvas shortcuts, and typing
        // a name should not also trigger them.
        keyEvent.stopPropagation();
      });
      input.addEventListener("blur", () => commit(true));
    });
  });
  // AUX1 · the auxiliary-files section of the active slot. `main.ts` owns the
  // actions (it has the file picker and the store); the tree only reports them.
  host.querySelector<HTMLButtonElement>('[data-et="aux-add"]')
    ?.addEventListener("click", () => handlers.onAuxAdd?.());
  host.querySelectorAll<HTMLElement>("[data-aux-toggle]").forEach((el) => {
    el.addEventListener("click", () =>
      handlers.onAuxToggle?.(el.dataset.auxToggle!));
  });
  host.querySelectorAll<HTMLElement>("[data-aux-remove]").forEach((el) => {
    el.addEventListener("click", (event) => {
      event.stopPropagation(); // the row header is a button too
      handlers.onAuxRemove?.(el.dataset.auxRemove!);
    });
  });
  host.querySelectorAll<HTMLSelectElement>("[data-aux-type]").forEach((el) => {
    el.addEventListener("change", () =>
      handlers.onAuxTypeChange?.(el.dataset.auxType!, el.value as AuxFileType));
  });
  host.querySelectorAll<HTMLButtonElement>("[data-aux-bake]").forEach((el) => {
    el.addEventListener("click", () => handlers.onAuxBake?.(el.dataset.auxBake!));
  });
  host.querySelectorAll<HTMLButtonElement>("[data-aux-map]").forEach((el) => {
    el.addEventListener("click", () => handlers.onAuxMap?.(el.dataset.auxMap!));
  });
  host.querySelectorAll<HTMLButtonElement>("[data-aux-unmap]").forEach((el) => {
    el.addEventListener("click", () => handlers.onAuxUnmap?.(el.dataset.auxUnmap!));
  });
  host.querySelectorAll<HTMLElement>("[data-aux-opt]").forEach((el) => {
    const commit = () => {
      const key = el.dataset.optKey!;
      const value =
        (el as HTMLInputElement).type === "checkbox"
          ? (el as HTMLInputElement).checked
          : (el as HTMLInputElement | HTMLSelectElement).value;
      handlers.onAuxOption?.(el.dataset.auxOpt!, key, value);
    };
    el.addEventListener("change", commit);
  });

  // F2 · per-graph «Sposta in…», per-file Save and close
  host.querySelectorAll<HTMLButtonElement>(".et-move").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = button.dataset.move;
      if (id) handlers.onMoveGraph?.(id, button);
    });
  });
  host.querySelectorAll<HTMLButtonElement>("[data-save-file]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handlers.onSaveFile?.(button.dataset.saveFile!);
    });
  });
  host.querySelectorAll<HTMLButtonElement>("[data-close-file]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handlers.onCloseFile?.(button.dataset.closeFile!);
    });
  });
  host.querySelectorAll<HTMLButtonElement>(".et-close").forEach((button) => {
    button.addEventListener("click", (event) => {
      // The row is a button too; without this the close also re-activates.
      event.stopPropagation();
      const id = button.dataset.close;
      if (id) handlers.onRemove(id);
    });
  });
  host.querySelector<HTMLButtonElement>('[data-et="et-open"]')
    ?.addEventListener("click", () => handlers.onOpen());
  host.querySelector<HTMLButtonElement>('[data-et="et-new"]')
    ?.addEventListener("click", () => handlers.onNew());
}
