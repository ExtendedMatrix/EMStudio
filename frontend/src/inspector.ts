import { numField } from "./num-field";
import { t } from "./i18n";
import type { DocumentStore } from "./model";
import { edgeStyle, nodeStyle } from "./palette";
import { dataGlyphLabel, glyphFor, glyphSvg } from "./glyphs";
import { activeTheme, canvasTheme } from "./theme";
import { classOf, conceptParts, isGroupType, isStratigraphicType, nodeElements, propertyLabel, stratigraphicKindLabel, stratigraphicKindOf, typeDescription, typeLabel } from "./rules";
import { BADGE_RULES, resolveEffective, sourceLabel } from "./funnel";
import type { AuthorityCandidate, EmEdge, EmNode } from "./types";
import { qualiaList } from "./vocab";
import { getSettings } from "./settings";
import { currentIdentity, orcidProblem } from "./identity";
import { acquisitionMembers, derivationChain, resourceUsages } from "./ingest";
import { renderResourcePanel } from "./resource-panel";
import { packagingLabel } from "./resources";
import { processLabel } from "./views/dtc";
import type { TwinSearchResult } from "./twins";
import { renderSitePosition } from "./study-panel";
import { linksOfGraph } from "./links";
import { chainCard, isChainNode } from "./hdto-card";
import { naturalFields, qualeOf, TRANSLATION_TYPE } from "./translation";
import { commitField, confirmOnMultiEnter, multiHint, multiKeyOf, type MultiScope } from "./multi-edit";
import type { ChronEntry, ChronStatus } from "./chron-bridge";

export interface InspectorCallbacks {
  onJump: (nodeId: string) => void;
  /** the rapporti of a node with units of OTHER graphs of the same file
   *  (`links.ts`, E.D. 11 Oct 2026), each with the gesture that goes there */
  crossGraphLinks?: (nodeId: string) => Array<{
    edgeType: string; out: boolean; graphName: string; nodeName: string;
    resolved: boolean; go: () => void;
  }>;
  /** the study codes of the other graphs open beside this one: a proposed
   *  code avoids them */
  otherStudyCodes?: () => string[];
  /** PROPRIETA · the verbs of a unit on its paradata group («Compact the
   *  properties», «Dissolve the group») that apply to it now */
  propertyGroupActions?: (nodeId: string) => Array<{ cmd: string; label: string; title?: string; run: () => void }>;
  /** MICRO-GLIFI-OVERLAY-CONTINUITA p.3 · «End in…» / «Survives until…» of a
   *  unit, and what its continuity says now */
  continuity?: (nodeId: string) => { cmd: string; label: string; state: string | null; run: (anchor?: HTMLElement) => void } | null;
  /** MICRO-SERVSF-FINE-ISTANZE p.2 · a BR's own section: its unit, the type of
   *  the end, the CIDOC class, the epoch and its rule, its own dating */
  endOfUnit?: (nodeId: string) => HTMLElement | null;
  /** MICRO-SERVSF-FINE-ISTANZE p.3 · the instances of an object in the epochs */
  epochInstances?: (nodeId: string) => HTMLElement | null;
  /** MICRO-UN-POSTO · open the site selector on the graph node */
  onSetSitePosition?: () => void;
  /** MICRO-GEOREF-GRAFO · the graph's georeference (and the map pin's proposal), under the site position */
  geoSections?: (host: HTMLElement) => void;
  onClose: () => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edge: EmEdge) => void;
  onToggleFold: (groupId: string) => void;
  onEnterGroup: (groupId: string) => void;
  /** create a phase (sub-epoch) inside this epoch */
  onAddPhase: (epochId: string) => void;
  /** toggle this epoch's phases between hidden (one lane) and shown (sub-bands) */
  onTogglePhases: (epochId: string) => void;
  /** whether this epoch's phases are currently shown as lane sub-bands */
  isPhasesVisible: (epochId: string) => boolean;
  /** delete a phase, prompting where to re-home its orphaned units */
  onDeletePhase: (phaseId: string) => void;
  /** delete a top-level epoch (cascades sub-phases, un-attributes its units) */
  onDeleteEpoch: (epochId: string) => void;
  /** move an (empty) epoch's swimlane up (-1) / down (+1), then relayout */
  onReorderEpoch: (epochId: string, dir: -1 | 1) => void;
  onReorderPhase: (phaseId: string, dir: -1 | 1) => void;
  /** attribute a unit to an epoch or one of its phases (retargets has_first_epoch) */
  onAssignEpoch: (nodeId: string, epochId: string) => void;
  /** pin/unpin a node's position (layout engine keeps pinned nodes in place) */
  onTogglePin: (nodeId: string) => void;
  isPinned: (nodeId: string) => boolean;
  /** Query em-bridge /resolve-authority for ranked offline candidates. Optional:
   *  when absent or on any failure the HDT-O authority field is plain free-text. */
  resolveAuthority?: (term: string, facet: string) => Promise<AuthorityCandidate[]>;
  /** Ask the twin register(s) which digital twins exist for a term. Optional:
   *  when absent the panel offers no search at all and a provisional twin can
   *  still be made — the register is a suggestion, never a precondition. */
  searchTwins?: (term: string) => Promise<TwinSearchResult>;
  /** CMD1 · send a 3D command to the connected host (Blender). Absent = the
   *  build has no command channel at all, and the actions are not drawn. */
  onCommand?: (verb: string, target: string) => void;
  /** CMD1 · may commands be sent right now? `null` = yes; a string is the
   *  reason they cannot be, shown in the tooltip of the disabled button. An
   *  action that is offered and then refused is worse than one greyed out. */
  commandsBlocked?: () => string | null;
  /** I6 · «Open with…»: the tools that know this node, off ones with why */
  openWith?: (nodeId: string) => { key: string; label: string; ok: boolean; why?: string; run: () => void }[];
  /** MICRO-PULIZIA p.6 · a command that cannot run here was pressed: say why */
  onBlocked?: (why: string) => void;
  /** X1 · the gesture that lifts the block, when there is one here: since
   *  MICRO-INSPECTOR-SEZIONI the way to the connection panel (`anchor` = the
   *  link pressed) */
  commandsFix?: () => { label: string; title?: string; run: (anchor?: HTMLElement) => void } | null;
  /** MICRO-INSPECTOR-SEZIONI p.3 · the node's start and end as s3Dgraphy's
   *  `Graph.chronology()` computes them (asked of the bridge, `chron-bridge`):
   *  the answer's state and this node's entry. Absent = no rows. */
  chronologyOf?: (nodeId: string) => { status: ChronStatus; entry: ChronEntry | null; stale: boolean };
  /** P4.1b · empty ONE field, through the act that leaves its tombstone. */
  onClearField?: (nodeId: string, field: string) => void;
  /** DOCUMENTATION · put this asset on the shelf — the study's explicit
   *  SELECTION from what the documentation holds. Absent = the build has no
   *  shelf, and the action is simply not drawn. */
  onAddToShelf?: (nodeId: string) => void;
  /** …and whether it is already there, so the button can say "on the shelf"
   *  instead of adding it twice. */
  isOnShelf?: (nodeId: string) => boolean;
  /** RISORSA-FILE · the files of a resource: shown in the drawing or folded */
  isResourceOpen?: (resId: string) => boolean;
  onToggleResourceFiles?: (resId: string) => void;
  /** …and replacing one of them makes a revision (absent = no bytes to read) */
  onReplaceFile?: (resId: string, fileId: string | null) => void;
  /** dev27 · «controlla» an address of a resource */
  onCheckAddress?: (resId: string, locator: string) => void;
  /** R2 · where this resource's bytes are (the one resolver), with its gestures */
  fileStateLine?: (resId: string) => HTMLElement | null;
  /** CAMPAGNA · a tileset resource opened in a Scene window */
  onOpenInScene?: (resId: string) => void;
  /** TRADUZIONI · draw the row of languages under a natural-language text
   *  (the marker of the datamodel decides which; `translation.naturalFields`) */
  renderTextLanguages?: (host: HTMLElement, nodeId: string, field: string) => void;
  /** …and a translation node opens its facing text */
  onOpenFacing?: (translationId: string) => void;
  /** MICRO-SPAZIO-3D-2 · the «Trasformazione» of a 3D object (a model, a unit's
   *  proxy, its shape): the caller draws it into `host`, false when the node has none */
  renderTransform?: (host: HTMLElement, nodeId: string) => boolean;
  /** MICRO-SPAZIO-3D-3 p.11 · a readable name over the technical one (a model
   *  without its level suffix), with its chip */
  readableName?: (nodeId: string) => { label: string; chip?: string | null; technical: string } | null;
  /** MICRO-SPAZIO-3D-3 p.10 · a model's versions: the mode, the version, the use */
  renderVersions?: (host: HTMLElement, nodeId: string) => boolean;
  /** MICRO-PROVA-DEV47 p.4 · the section «Alternativa» of a tileset or a container */
  renderAlternative?: (host: HTMLElement, nodeId: string) => boolean;
  /** MICRO tileset, shift e epoche · the section «Frame» of a tileset (its
   *  coordinates are a CRS minus a shift): false when the node has no tileset */
  renderFrame?: (host: HTMLElement, nodeId: string) => boolean;
  /** MICRO-SPAZIO-3D-3 p.6 · under «Model the proxy»: «Usa una forma abbozzata…» */
  renderSketchUse?: (host: HTMLElement, nodeId: string) => void;
  /** MICRO-PROVA-DEV47 p.5 · a unit's proxy: its file, «Elimina il proxy» */
  renderProxy?: (host: HTMLElement, nodeId: string) => boolean;
  /** MICRO-CRONO-MULTIPLA p.2 · the selection the active node belongs to (with
   *  ⌘/Alt held an edit goes to every selected node that has the field) and the
   *  Log line of such an edit. Absent = edits go to the active node only. */
  selection?: () => string[];
  logMulti?: (msg: string, ids: string[]) => void;
}

/** MICRO-CRONO-MULTIPLA p.2 · a field of the Inspector that can propagate: its
 *  `change` (and ⌘/Alt+Enter) confirms it for the active node or, the key held,
 *  for every selected node that `has` it; the hint goes right after the field. */
function bindMulti(
  scope: MultiScope | null,
  active: string,
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  field: string,
  has: (n: EmNode) => boolean,
  apply: (id: string, value: string) => void,
): void {
  input.dataset.multiField = field;
  const run = (): void => { commitField(scope, active, field, has, (id) => apply(id, input.value)); };
  input.addEventListener("change", run);
  confirmOnMultiEnter(input, run);
  const h = multiHint(scope, has);
  if (h) input.after(h);
}

/** MICRO-PULIZIA p.6 · «Open with…»'s icons, by tool (currentColor, 18 px):
 *  StratiField a recording sheet, Blender its eye-and-orbit, Heriverse a
 *  globe. Their names are tooltips and aria-labels. */
const OPEN_WITH_ICONS: Record<string, string> = {
  stratifield: `<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="2.5" width="11" height="13" rx="1.2"/><path d="M6.5 2.5v-1h5v1M6 7h6M6 9.8h6M6 12.6h3.5"/></svg>`,
  blender: `<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10" r="4.6"/><circle cx="10.5" cy="10" r="1.6"/><path d="M6.6 7.2 1.8 3.6M7.2 6.4H3.4M6.3 9.4 2 9.2"/></svg>`,
  heriverse: `<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="6.5"/><path d="M2.5 9h13M9 2.5c2 2 2.8 4.2 2.8 6.5S11 13.5 9 15.5M9 2.5C7 4.5 6.2 6.7 6.2 9S7 13.5 9 15.5"/></svg>`,
};

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Coerce a stored colour to the #rrggbb an <input type=color> requires, or
 *  null if it isn't a recognisable hex (so the swatch can fall back). */
function toHexColor(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s))
    return (
      "#" +
      s
        .slice(1)
        .split("")
        .map((c) => c + c)
        .join("")
    ).toLowerCase();
  return null;
}

/** AUDIT1 · the four editorial fields, in the order a reader wants them. */
const EDITORIAL_FIELDS = ["created_by", "created_at", "modified_by", "modified_at",
  "created_auth", "modified_auth"];

/** I3/S5 · identifiers: shown ONLY with Advanced › «Show node UUIDs», and then
 *  behind «Technical details» */
const ID_FIELDS = new Set(["graph_id", "original_id", "original_emid", "emid", "uuid", "node_id"]);
/** I3/S5 · machinery and the drawing inherited from yEd: behind «Technical
 *  details», closed — an archaeologist reads the unit, not its y_pos */
const TECH_FIELDS = new Set(["is_canonical", "y_pos", "x_pos", "shape", "fill_color", "border_style",
  "border_color", "border_width", "symbol", "width", "height", "font_family", "font_size",
  "font_style", "text_color", "label_color", "yed_id", "graphml_id",
  // MICRO-BADGE-PD-CRONOLOGIA · the yEd records the GraphML importer folded into
  // one document (`original_id`, `y_pos`…): the importer's memory, not a datum
  // anybody reads — the instances a reader sees are the view's (`paradata_instances`)
  "instances"]);

/** S5 · how the last hand had entered, as a phrase — never `{"mode":"orcid"}` */
function authPhrase(v: unknown): string {
  const o = (v && typeof v === "object" ? v : { mode: v }) as { mode?: unknown; attested_by?: unknown };
  if (o.mode === "orcid") return t("insp.authOrcid");
  if (o.mode === "node_password") return o.attested_by
    ? t("insp.authNodeBy", { node: String(o.attested_by) }) : t("insp.authNode");
  return o.mode ? String(o.mode) : "";
}

/**
 * AUDIT1 · the last hand on this node — created/modified, by whom and when.
 *
 * READ-ONLY, and deliberately at the bottom: it is a record, not a gate. It is
 * also not `has_author`, which is up in the paradata where interpretive
 * responsibility belongs; this is bookkeeping, taken automatically from the
 * session identity and the clock.
 *
 * A node with no stamps renders NOTHING — no "unknown", no empty rows. Absent
 * means nobody recorded it, and a blank field invites someone to fill it in by
 * hand, which is the one thing an automatic stamp must not become.
 */
function renderEditorialStamps(root: HTMLElement, node: EmNode): void {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const has = EDITORIAL_FIELDS.some((k) => data[k]);
  if (!has) return;

  const when = (v: unknown): string => {
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
  };
  const line = (label: string, byKey: string, atKey: string, authKey: string): HTMLElement | null => {
    const at = data[atKey];
    const by = data[byKey];
    if (!at && !by) return null;
    const how = data[authKey] ? authPhrase(data[authKey]) : "";
    const row = el("div", "insp-stamp-row");
    row.appendChild(el("span", "insp-stamp-label", label));
    row.appendChild(el("span", "insp-stamp-when", at ? when(at) : "—"));
    if (by) {
      const a = document.createElement("a");
      a.className = "insp-stamp-who";
      a.href = `https://orcid.org/${String(by)}`;
      a.target = "_blank";
      a.rel = "noreferrer noopener";
      a.textContent = String(by);
      a.title = "ORCID iD of the editor (automatic — not the interpretive author)";
      row.appendChild(a);
    }
    if (how) row.appendChild(el("span", "insp-stamp-how", how));
    return row;
  };

  const rows = [
    line("Created", "created_by", "created_at", "created_auth"),
    line("Modified", "modified_by", "modified_at", "modified_auth"),
  ].filter(Boolean) as HTMLElement[];
  if (!rows.length) return;
  root.appendChild(el("h3", "insp-sect", "Last hand (editorial)"));
  const box = el("div", "insp-stamps");
  for (const r of rows) box.appendChild(r);
  root.appendChild(box);
}

/** the time rows on screen, so an answer of the bridge repaints THEM and not
 *  the whole Inspector (a field being typed in keeps its focus) */
const timeBoxes = new Set<{ box: HTMLElement; paint: () => void }>();
/** MICRO-INSPECTOR-SEZIONI p.3 · the chronology answered: the time rows again */
export function repaintTimeRows(): void {
  for (const x of [...timeBoxes]) {
    if (!x.box.isConnected) { timeBoxes.delete(x); continue; }
    x.box.textContent = "";
    x.paint();
  }
}

/**
 * MICRO-INSPECTOR-SEZIONI p.3 · the node's TIME among its propagative
 * metadata: start and end as `Graph.chronology()` gives them, each with where
 * it comes from — written on the node, inherited from an epoch (or from the
 * parent of its sub-epoch), or computed from the relations (what the unit
 * contains, a TPQ/TAQ through `is_after`…). Nothing is computed here: the rule,
 * the source and the relation are s3Dgraphy's answer. A click on the
 * provenance goes to the node that gives it.
 */
function renderTimeRows(host: HTMLElement, store: DocumentStore,
                        c: { status: ChronStatus; entry: ChronEntry | null; stale: boolean },
                        onJump: (id: string) => void): void {
  const name = (id: string | null | undefined): string => (id ? String(store.node(id)?.name || id) : "?");
  const note = (text: string): void => {
    const row = el("div", "insp-prop-row insp-prop-time insp-prop-inherited");
    row.dataset.time = "none";
    row.append(el("span", "insp-prop-rule", t("insp.timeRule")), el("span", "insp-prop-value insp-dim", text));
    host.appendChild(row);
  };
  if (c.status === "idle" || c.status === "loading") { note(t("insp.time.loading")); return; }
  if (c.status === "off") { note(t("insp.time.off")); return; }
  if (c.status === "error") { note(t("insp.time.error")); return; }
  const e = c.entry;
  if (!e || (e.start == null && e.end == null)) { note(t("insp.time.noBound")); return; }
  for (const side of ["start", "end"] as const) {
    const v = side === "start" ? e.start : e.end;
    if (v == null) continue;
    const rule = side === "start" ? e.start_rule : e.end_rule;
    const src = side === "start" ? e.start_source : e.end_source;
    const rel = side === "start" ? e.start_relation : e.end_relation;
    let text: string;
    switch (rule) {
      case "written": text = t("insp.time.written"); break;
      case "epoch": text = t("insp.time.epoch", { epoch: name(src) }); break;
      case "sub_epoch": text = t("insp.time.subEpoch", { epoch: name(src) }); break;
      case "contained":
        text = t("insp.time.contained", { node: name(e.contained?.source ?? src) })
          + (e.contained?.original ? ` ← ${name(e.contained.original)}` : "");
        break;
      case "tpq": case "taq":
        text = t("insp.time.bound", { rule: t(`table.rule.${rule}`), rel: rel ?? "", node: name(src) });
        break;
      default: text = `${rule ?? "?"} · ${name(src)}`;
    }
    const own = rule === "written";
    const row = el("div", `insp-prop-row insp-prop-time${own ? " insp-prop-own" : " insp-prop-inherited"}`);
    row.dataset.time = side;
    row.dataset.rule = String(rule ?? "");
    row.append(el("span", "insp-prop-rule", t(side === "start" ? "insp.timeStart" : "insp.timeEnd")),
               el("span", "insp-prop-value", String(v)));
    const target = rule === "contained" ? (e.contained?.source ?? src) : src;
    const from = target && store.node(target)
      ? el("button", "insp-prop-source insp-link", text) as HTMLButtonElement
      : el("span", "insp-prop-source", text);
    from.title = t("insp.time.title", { rule: rule ?? "?", rel: rel ?? "—", node: name(target) })
      + (c.stale ? ` · ${t("table.chronStale")}` : "");
    if (from instanceof HTMLButtonElement) {
      from.type = "button";
      from.dataset.go = target!;
      from.addEventListener("click", () => onJump(target!));
    }
    row.appendChild(from);
    host.appendChild(row);
  }
}

export function renderInspector(
  root: HTMLElement,
  store: DocumentStore,
  nodeId: string | null,
  cb: InspectorCallbacks,
  selEdge: EmEdge | null = null,
): void {
  root.innerHTML = "";
  const node = nodeId ? store.node(nodeId) : undefined;
  if (selEdge && !nodeId) {
    // A connector is selected (no node): show its type + endpoints and a
    // Delete action, mirroring the per-node "Connections" rows.
    const es = edgeStyle(selEdge.edge_type);
    const nodeById = new Map(store.doc.graph.nodes.map((n) => [n.id, n]));
    const showId = getSettings().developer.showNodeIds;
    const nm = (id: string): string =>
      String(nodeById.get(id)?.name || (showId ? id : (nodeById.get(id)?.node_type ?? id)));
    const panel = el("div", "insp-canvas");
    panel.appendChild(el("div", "insp-section-title", "Connector"));
    const t = el("div", "insp-group-title", es.label);
    // I2 · the relation's colour is a bar beside the words, never the ink of
    // them: dark relation colours fell under AA on the dark theme
    t.style.setProperty("--rel", es.color);
    panel.appendChild(t);
    panel.appendChild(el("label", "insp-field-label", "From"));
    const from = el("button", "insp-link", `→ ${nm(selEdge.source)}`);
    from.addEventListener("click", () => cb.onJump(selEdge.source));
    panel.appendChild(from);
    panel.appendChild(el("label", "insp-field-label", "To"));
    const to = el("button", "insp-link", `→ ${nm(selEdge.target)}`);
    to.addEventListener("click", () => cb.onJump(selEdge.target));
    panel.appendChild(to);
    root.appendChild(panel);
    const danger = el("div", "insp-actions");
    const delE = el("button", "insp-btn danger", "Delete connector");
    delE.addEventListener("click", () => cb.onDeleteEdge(selEdge));
    danger.appendChild(delE);
    root.appendChild(danger);
    return;
  }
  if (!nodeId || !node) {
    // NOTHING SELECTED, and that is all this says now. Until the Study window
    // existed, this branch drew the whole per-graph study panel — a panel about
    // the graph, inside a window about nodes, ending with "select a node".
    // The panel moved to `study-panel.ts` and is shown by the Study window;
    // the inspector is the place for nodes again, and an empty one says so.
    root.appendChild(el("div", "insp-empty", t("insp.selectNode")));
    return;
  }
  const doc = store.doc;
  // MICRO-CRONO-MULTIPLA p.2 · where an edit can go with ⌘/Alt held
  const scope: MultiScope | null = cb.selection
    ? { store, active: nodeId, selection: cb.selection().filter((id) => !!store.node(id)), log: cb.logMulti }
    : null;
  /** a button whose click is an edit: the active node, or with the key the selection */
  const multiClick = (b: HTMLElement, field: string, has: (n: EmNode) => boolean, apply: (id: string) => void, hintAfter = true): void => {
    b.dataset.multiField = field;
    b.addEventListener("click", (e) => { commitField(scope, nodeId, field, has, apply, multiKeyOf(e)); });
    const h = hintAfter ? multiHint(scope, has) : null;
    if (h) b.after(h);
  };

  const head = el("div", "insp-head");
  const st = nodeStyle(node.node_type);
  // the genre of a unit, when the datamodel gives it one (1.6.12
  // `stratigraphic_kind`): «US · muraria», «US · di rivestimento», the label
  // from the translations' `stratigraphic_kinds`. The type and its glyph stay
  // the US's.
  const kindOf = stratigraphicKindOf(node);
  // DEV29 B3 · a resource says what it IS by its packaging — «File set», not
  // «resource» (and the name strip says it too)
  const pack = packagingLabel(node);
  const chip = el("span", "insp-chip",
    kindOf ? `${node.node_type} · ${stratigraphicKindLabel(kindOf)}` : pack ?? node.node_type);
  chip.style.background = st.fill;
  chip.style.color = st.textColor;
  chip.style.borderColor = st.border;
  // MICRO-SERVSF-FINE-ISTANZE p.1 · the chip says the type's name and, on
  // hover, its definition — the datamodel's (1.6.34: SF, RSF «Repositioned
  // Special Find», VSF; 1.6.35: serVSF), in the interface's language
  {
    const lab = typeLabel(node.node_type);
    chip.dataset.typeLabel = lab;
    chip.title = [lab !== node.node_type ? lab : "", typeDescription(node.node_type)].filter(Boolean).join("\n");
  }
  // G9 · the node's glyph, 16 px (frameless under 24), before its type — and
  // for a node whose glyph comes from its data, the name of that glyph
  {
    const g = glyphFor(node.node_type, node.data as Record<string, unknown> | undefined);
    if (g) {
      const ic = el("span", "insp-chip-glyph glyph-inline");
      const th = canvasTheme();
      ic.innerHTML = glyphSvg(g, { ink: th.labelInk, paper: th.canvasBg, dark: activeTheme() === "dark" }, 16);
      chip.prepend(ic);
      const dl = dataGlyphLabel(g.key);
      if (dl && !kindOf && !pack) chip.lastChild!.textContent = `${node.node_type} · ${dl}`;
    }
  }
  head.appendChild(chip);
  const close = el("button", "insp-close", "×");
  close.title = t("l.closeEsc");
  close.addEventListener("click", cb.onClose);
  head.appendChild(close);
  root.appendChild(head);

  // editable name
  const nameRow = el("div", "insp-name-row");
  const nameInput = document.createElement("input");
  nameInput.className = "insp-name-input";
  nameInput.value = String(node.name || "");
  nameInput.placeholder = node.id;
  nameInput.addEventListener("change", () =>
    store.updateNode(nodeId, { name: nameInput.value }),
  );

  // Colour swatch next to the name: a round colour-picker + a hex field you can
  // paste into. Shown for epochs (always) and any node that already carries a
  // colour (node.data.color — lifted from the s3dgraphy node attributes). Both
  // controls write node.data.color and stay in sync.
  const nodeData = (node.data ?? {}) as Record<string, unknown>;
  const hasColor =
    node.node_type === "EpochNode" || typeof nodeData.color === "string";
  if (hasColor) {
    const stored = typeof nodeData.color === "string" ? nodeData.color : "";
    const swatch = document.createElement("input");
    swatch.type = "color";
    swatch.className = "insp-color-swatch";
    swatch.value = toHexColor(stored) ?? "#cccccc";
    swatch.title = t("l.colourPick");
    const hex = document.createElement("input");
    hex.type = "text";
    hex.className = "insp-color-hex";
    hex.value = stored;
    hex.placeholder = "#RRGGBB";
    hex.title = t("l.colourHex");
    const hasColour = (n: EmNode): boolean =>
      n.node_type === "EpochNode" || typeof (n.data as Record<string, unknown> | undefined)?.color === "string";
    const apply = (v: string): void => {
      commitField(scope, nodeId, t("multi.f.colour"), hasColour, (id) => {
        const d = { ...((store.node(id)?.data ?? {}) as Record<string, unknown>) };
        const val = v.trim();
        if (val === "") delete d.color;
        else d.color = val;
        store.updateNode(id, { data: d });
      });
    };
    // AUDIT · the picker shows its colour live in the hex field, and WRITES once,
    // when it closes (`change`): on `input` every drag step was a store write and
    // a rebuild of the whole app under the open picker
    swatch.addEventListener("input", () => { hex.value = swatch.value; });
    swatch.addEventListener("change", () => {
      hex.value = swatch.value;
      apply(swatch.value);
    });
    hex.addEventListener("change", () => {
      const nm = toHexColor(hex.value);
      if (nm) swatch.value = nm;
      apply(hex.value);
    });
    nameRow.appendChild(swatch);
    nameRow.appendChild(nameInput);
    nameRow.appendChild(hex);
    hex.dataset.multiField = t("multi.f.colour");
    const ch = multiHint(scope, hasColour);
    root.appendChild(nameRow);
    if (ch) root.appendChild(ch);
  } else {
    nameRow.appendChild(nameInput);
    root.appendChild(nameRow);
  }
  // MICRO-SPAZIO-3D-3 p.11 · a model: its name without the level suffix, the
  // technical name (the field above) beneath, as for the properties
  const rn = cb.readableName?.(nodeId) ?? null;
  if (rn) {
    const lab = el("div", "insp-prop-label insp-rm-label", rn.label);
    if (rn.chip) lab.appendChild(el("span", "sol-chip", rn.chip));
    lab.appendChild(el("small", "prop-tech", rn.technical));
    root.appendChild(lab);
  }
  // MICRO-BADGE-PD · a property: its readable label over the technical name
  // the field above edits (`rules.propertyLabel`; a free name has none)
  if (node.node_type === "property") {
    const pl = propertyLabel(node);
    if (pl.term && pl.label !== pl.technical) {
      const lab = el("div", "insp-prop-label", pl.label);
      lab.appendChild(el("small", "prop-tech", pl.technical));
      lab.title = t("insp.propLabelTitle", { term: pl.term });
      root.appendChild(lab);
    }
  }
  // node UUID is developer-only noise — hidden unless the Developer setting is on
  if (getSettings().developer.showNodeIds)
    root.appendChild(el("div", "insp-id", node.id));

  // editable description — for a PropertyNode the value IS the description (EM
  // convention), so we skip the generic box and show a dedicated "Value" field
  // below instead (avoids two inputs bound to the same field).
  if (node.node_type !== "property") {
    const desc = document.createElement("textarea");
    desc.className = "insp-desc-input";
    desc.rows = 3;
    desc.placeholder = "description…";
    desc.value = String(node.description ?? "");
    root.appendChild(desc);
    bindMulti(scope, nodeId, desc, t("multi.f.description"), (n) => n.node_type !== "property",
      (id, v) => store.updateNode(id, { description: v }));
    if (cb.renderTextLanguages && naturalFields(node).includes("description"))
      cb.renderTextLanguages(root, nodeId, "description");
  }
  // TRADUZIONI · a translation is read and changed in its facing text
  if (node.node_type === TRANSLATION_TYPE && cb.onOpenFacing) {
    const bar = el("div", "insp-actions");
    const b = el("button", "insp-btn", t("issues.facing"));
    b.addEventListener("click", () => cb.onOpenFacing!(nodeId));
    bar.appendChild(b);
    root.appendChild(bar);
  }

  // 1.6.9 · the ELEMENTS OF THE NODE the datamodel declares beside name and
  // description (today `definition`, on StratigraphicNode and so on every
  // stratigraphic subtype). Read, not edited: the value is a CONCEPT of a
  // controlled vocabulary and EMStudio has no concept source to pick it from —
  // a free-text box would write labels without concepts, or invent URIs.
  const shownAbove = new Set<string>(kindOf ? ["stratigraphic_kind"] : []);
  for (const rule of nodeElements(node.node_type)) {
    // MICRO-SERVSF-FINE-ISTANZE p.2 · a BR's type is in its own section,
    // translated and editable
    if (rule.field === "end_reason" && cb.endOfUnit) continue;
    const key = (rule.em_json ?? `data.${rule.field}`).replace(/^data\./, "");
    const raw = ((node.data ?? {}) as Record<string, unknown>)[key];
    if (raw === undefined || raw === null || raw === "") continue;
    shownAbove.add(key);
    const labelKey = `insp.el.${rule.field}`;
    const title = t(labelKey);
    root.appendChild(el("div", "insp-field-label", title === labelKey ? rule.field : title));
    const row = el("div", "insp-element");
    if (rule.description) row.title = rule.description;
    if (rule.value === "concept") {
      const { concept, label } = conceptParts(raw);
      row.appendChild(el("span", "insp-element-label", label || t("insp.elNoLabel")));
      if (concept) {
        const a = document.createElement("a");
        a.className = "insp-element-concept";
        a.href = concept;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = concept;
        row.appendChild(a);
      } else {
        row.appendChild(el("span", "insp-element-note", t("insp.elLabelOnly")));
      }
    } else {
      // the genre reads in the active locale (translations `stratigraphic_kinds`),
      // any other value as the datamodel writes it
      row.appendChild(el("span", "insp-element-label",
        rule.field === "stratigraphic_kind" ? stratigraphicKindLabel(String(raw)) : String(raw)));
    }
    root.appendChild(row);
  }

  // PropertyNode value: the property's measured/asserted value, stored in
  // `description` (uniform with real EM data). For an epoch's absolute_time_*
  // property this mirrors back to the epoch's start_time/end_time, so editing
  // it here updates the Temporal bounds.
  if (node.node_type === "property") {
    const pdata = (node.data ?? {}) as Record<string, unknown>;
    root.appendChild(el("label", "insp-field-label", "Value"));
    const valIn = document.createElement("input");
    valIn.className = "insp-name-input";
    valIn.value = String(node.description ?? "");
    const ptype = String(pdata.property_type ?? "");
    valIn.placeholder =
      ptype.startsWith("absolute_time") ? "e.g. -27  (negative = BCE)" : "value…";
    root.appendChild(valIn);
    bindMulti(scope, nodeId, valIn, t("multi.f.value"), (n) => n.node_type === "property",
      (id, v) => store.setPropertyValue(id, v));
    // the value of a property IS its description in em.json: its languages
    if (cb.renderTextLanguages && naturalFields(node).includes("description"))
      cb.renderTextLanguages(root, nodeId, "description");
    // dev28 · an OBJECT quale (attribution) is compiled here, field by field
    renderQualeObject(root, store, node, cb, scope);
  }

  // DEV30 U3 · «Lock position» moved to the node's menu on the canvas, where
  // the layout is made (`togglePin` in main.ts): in the Inspector it read as a
  // property of the document, where it changed nothing.

  // epoch controls: reorder its swimlane + temporal bounds (start/end).
  // Bounds are EpochNode attributes (CIDOC P82a/P82b); the labels borrow the
  // qualia vocabulary's rationale/example so the meaning is explicit.
  if (node.node_type === "EpochNode") {
    const parentEpoch = store.parentEpoch(nodeId);
    const isPhase = parentEpoch != null;
    if (isPhase) {
      // a phase (sub-epoch) — show its parent, no swimlane reorder
      root.appendChild(el("div", "insp-field-label", "Phase of"));
      const row = el("div", "insp-link-row");
      const pb = el(
        "button",
        "insp-link",
        `→ ${store.node(parentEpoch)?.name || parentEpoch}`,
      );
      pb.addEventListener("click", () => cb.onJump(parentEpoch));
      row.appendChild(pb);
      root.appendChild(row);
      // POL1: phases move like epochs. They did not, which made the sub-band
      // stack feel frozen — the only way to change it was to date the phases.
      //
      // Disabled when the phase (or the sibling it would swap with) HAS a date:
      // the band stack is sorted on `start_time`, so the move would be undone
      // immediately. `store.canReorderPhase` owns that rule, so the button and
      // the action cannot disagree about when it is possible.
      const phBar = el("div", "insp-actions");
      const phUp = el("button", "insp-btn", "▲ Move up") as HTMLButtonElement;
      const phDown = el("button", "insp-btn", "▼ Move down") as HTMLButtonElement;
      for (const [b, dir] of [
        [phUp, -1],
        [phDown, 1],
      ] as const) {
        const can = store.canReorderPhase(nodeId, dir);
        b.disabled = !can;
        b.title = can
          ? `Move this phase ${dir < 0 ? "up (newer)" : "down (older)"}`
          : store.isDated(nodeId)
            ? "This phase is dated — its position follows its date. Change the " +
              "date to move it."
            : "No sibling phase in that direction";
        b.addEventListener("click", () => cb.onReorderPhase(nodeId, dir));
      }
      phBar.appendChild(phUp);
      phBar.appendChild(phDown);
      root.appendChild(phBar);

      const delBar = el("div", "insp-actions");
      const delPh = el("button", "insp-btn danger", "Delete phase") as HTMLButtonElement;
      delPh.title = t("l.removePhase");
      delPh.addEventListener("click", () => cb.onDeletePhase(nodeId));
      delBar.appendChild(delPh);
      root.appendChild(delBar);
    } else {
      // top-level epoch: reorder its swimlane — only allowed while empty (a
      // populated epoch can't move without risking upward-connection errors)
      const empty = store.isEpochEmpty(nodeId);
      const bar = el("div", "insp-actions");
      const up = el("button", "insp-btn", "▲ Move up") as HTMLButtonElement;
      const down = el("button", "insp-btn", "▼ Move down") as HTMLButtonElement;
      for (const [b, dir] of [
        [up, -1],
        [down, 1],
      ] as const) {
        b.disabled = !empty;
        b.title = empty
          ? `Move this epoch's swimlane ${dir < 0 ? "up (newer)" : "down (older)"}`
          : "Can't reorder a populated epoch (would risk upward connections)";
        b.addEventListener("click", () => cb.onReorderEpoch(nodeId, dir));
      }
      bar.appendChild(up);
      bar.appendChild(down);
      root.appendChild(bar);
    }

    root.appendChild(el("h3", "insp-sect", "Temporal bounds"));
    const qs = qualiaList();
    const mkField = (
      label: string,
      which: "start" | "end",
      key: string,
      qid: string,
    ): void => {
      root.appendChild(el("label", "insp-field-label", label));
      const inp = document.createElement("input");
      inp.className = "insp-name-input";
      const cur = ((node as EmNode).data ?? {}) as Record<string, unknown>;
      inp.value = cur[key] != null ? String(cur[key]) : "";
      inp.placeholder = "e.g. -27  (negative = BCE)";
      root.appendChild(inp);
      // authoring a bound is what makes its absolute_time_* PropertyNode
      // (F5: in the epoch's group, with has_property) — one undo step
      bindMulti(scope, nodeId, inp, label === "Start" ? t("multi.f.epochStart") : t("multi.f.epochEnd"),
        (n) => n.node_type === "EpochNode", (id, v) => store.setEpochBound(id, which, v));
      const q = qs.find((x) => x.id === qid);
      if (q?.rationale)
        root.appendChild(
          el("div", "insp-hint", q.example ? `${q.rationale} e.g. ${q.example}` : q.rationale),
        );
    };
    mkField("Start", "start", "start_time", "absolute_time_start");
    mkField("End", "end", "end_time", "absolute_time_end");

    // Temporal paradata: the absolute_time_start / absolute_time_end
    // PropertyNodes live in the epoch's ParadataNodeGroup (F5: made when a
    // bound is written, with has_property from the epoch). Double-click the box in the lane to
    // open the group and attach a provenance chain to either bound.
    root.appendChild(el("h3", "insp-sect", "Temporal paradata"));
    const pdgId = store.epochParadataGroup(nodeId);
    if (pdgId) {
      const props = store.doc.graph.edges
        .filter(
          (e) => e.edge_type === "is_in_paradata_nodegroup" && e.target === pdgId,
        )
        .map((e) => store.node(e.source))
        .filter((n): n is EmNode => !!n && n.node_type === "property");
      for (const p of props) {
        const v = p.description; // property value lives in description
        const row = el("div", "insp-link-row");
        const b = el(
          "button",
          "insp-link",
          `→ ${p.name || p.id}${v != null && v !== "" ? ` = ${v}` : ""}`,
        );
        b.addEventListener("click", () => cb.onJump(p.id));
        row.appendChild(b);
        root.appendChild(row);
      }
      root.appendChild(
        el("div", "insp-hint", "Double-click the box in the lane to open it."),
      );
    }

    // Phases (sub-epochs): ONLY a top-level epoch manages phases. A phase gets
    // no sub-epochs (E.D.: keep periodisation one level deep for now) — so the
    // whole section (list + "Add phase") is hidden on a phase; "Delete phase"
    // (above) stays.
    if (!isPhase) {
      root.appendChild(el("h3", "insp-sect", "Phases"));
      const phases = store.epochPhases(nodeId);
      for (const ph of phases) {
        const pn = store.node(ph);
        const pd = (pn?.data ?? {}) as Record<string, unknown>;
        const span =
          pd.start_time != null || pd.end_time != null
            ? `  (${pd.start_time ?? "?"}–${pd.end_time ?? "?"})`
            : "";
        const row = el("div", "insp-link-row");
        const b = el("button", "insp-link", `→ ${pn?.name || ph}${span}`);
        b.addEventListener("click", () => cb.onJump(ph));
        row.appendChild(b);
        const col =
          typeof pd.color === "string" && toHexColor(pd.color) ? pd.color : null;
        if (col) {
          const dot = el("span", "insp-phase-dot");
          (dot as HTMLElement).style.background = col as string;
          row.insertBefore(dot, b);
        }
        root.appendChild(row);
      }
      const pbar = el("div", "insp-actions");
      const addPh = el("button", "insp-btn", "+ Add phase") as HTMLButtonElement;
      addPh.title = t("l.addPhase");
      addPh.addEventListener("click", () => cb.onAddPhase(nodeId));
      pbar.appendChild(addPh);
      root.appendChild(pbar);
    }

    // STRUTTURA · the coherence warnings (start/end order, phases within the
    // parent span, …) are no longer a box of their own here: they are rows of
    // `issues()` (rule `chronology`), shown in the inspector's «Avvisi» section
    // at the top — one place that explains, for every kind of warning.

    // Phase bands (view state): its own section at the end. Bands show by
    // DEFAULT; this collapses/expands ALL of THIS epoch's phases at once, and
    // is reachable from the epoch OR any of its phases (always targets the
    // top-level epoch = the lane).
    let topEpoch = nodeId;
    const seenTop = new Set<string>();
    while (store.parentEpoch(topEpoch) && !seenTop.has(topEpoch)) {
      seenTop.add(topEpoch);
      topEpoch = store.parentEpoch(topEpoch)!;
    }
    if (store.epochPhases(topEpoch).length) {
      root.appendChild(el("h3", "insp-sect", "Phase bands"));
      const shown = cb.isPhasesVisible(topEpoch);
      const tog = el(
        "button",
        "insp-btn",
        shown ? "▾ Hide phase bands" : "▸ Show phase bands",
      ) as HTMLButtonElement;
      tog.title = shown
        ? "Collapse this epoch's phases back into a single lane"
        : "Split this epoch's lane into one sub-band per phase";
      tog.addEventListener("click", () => cb.onTogglePhases(topEpoch));
      const bar = el("div", "insp-actions");
      bar.appendChild(tog);
      root.appendChild(bar);
    }
  }

  // Phase attribution: for a unit whose epoch has phases, offer to move it to a
  // phase (or back to the epoch itself). Retargets its has_first_epoch. Shown
  // for any node that carries a has_first_epoch (stratigraphic / representation
  // units) whose epoch is phased.
  if (node.node_type !== "EpochNode") {
    const hfe = store.doc.graph.edges.find(
      (e) => e.edge_type === "has_first_epoch" && e.source === nodeId,
    );
    if (hfe) {
      const cur = hfe.target;
      const topEpoch = store.parentEpoch(cur) ?? cur;
      const phases = store.epochPhases(topEpoch);
      if (phases.length) {
        const samePhasedEpoch = (n: EmNode): boolean => {
          const f = store.doc.graph.edges.find((e) => e.edge_type === "has_first_epoch" && e.source === n.id)?.target;
          return !!f && (store.parentEpoch(f) ?? f) === topEpoch;
        };
        root.appendChild(el("h3", "insp-sect", "Phase"));
        const bar = el("div", "insp-actions");
        const mk = (id: string, label: string): void => {
          const b = el("button", "insp-btn", label) as HTMLButtonElement;
          if (id === cur) {
            b.disabled = true;
            b.textContent = `✓ ${label}`;
          }
          bar.appendChild(b);
          // with ⌘/Alt: every selected node created in this same epoch (its
          // phases are the choices); without, the active node as before
          b.dataset.multiField = t("multi.f.phase");
          b.addEventListener("click", (e) => {
            if (multiKeyOf(e) && (scope?.selection.length ?? 0) > 1)
              commitField(scope, nodeId, t("multi.f.phase"), samePhasedEpoch, (x) => store.setFirstEpoch([x], id), true);
            else cb.onAssignEpoch(nodeId, id);
          });
        };
        mk(topEpoch, `${store.node(topEpoch)?.name ?? "epoch"} (none)`);
        for (const ph of phases) mk(ph, store.node(ph)?.name ?? ph);
        root.appendChild(bar);
        const ph = multiHint(scope, samePhasedEpoch);
        if (ph) root.appendChild(ph);
      }
    }
  }

  // group actions
  if (isGroupType(node.node_type)) {
    const bar = el("div", "insp-actions");
    const fold = el(
      "button",
      "insp-btn",
      store.isFolded(nodeId) ? "Unfold group" : "Fold group",
    ) as HTMLButtonElement;
    fold.addEventListener("click", () => cb.onToggleFold(nodeId));
    bar.appendChild(fold);
    const enter = el("button", "insp-btn", "Enter group ▸") as HTMLButtonElement;
    enter.title = t("l.enterGroup");
    enter.addEventListener("click", () => cb.onEnterGroup(nodeId));
    bar.appendChild(enter);
    root.appendChild(bar);
  }

  // MICRO-GLIFI-OVERLAY-CONTINUITA p.3 · until when the unit lasts
  if (nodeId && cb.continuity) {
    const c = cb.continuity(nodeId);
    if (c) {
      root.appendChild(el("h3", "insp-sect", t("cont.sect")));
      if (c.state) root.appendChild(el("div", "insp-cont-state", c.state));
      const bar = el("div", "insp-actions");
      const b = el("button", "insp-btn", c.label) as HTMLButtonElement;
      b.dataset.cmd = c.cmd;
      b.addEventListener("click", () => c.run(b));
      bar.appendChild(b);
      root.appendChild(bar);
    }
  }

  if (nodeId && cb.endOfUnit && node.node_type === "BR") {
    const sec = cb.endOfUnit(nodeId);
    if (sec) root.appendChild(sec);
  }
  if (nodeId && cb.epochInstances && isStratigraphicType(node.node_type)) {
    const sec = cb.epochInstances(nodeId);
    if (sec) root.appendChild(sec);
  }

  // PROPRIETA · a unit's properties into its paradata group, and back.
  // MICRO-INSPECTOR-SEZIONI p.1 · a section of their own: the two verbs are
  // about the unit's paradata group, and drawn without a title they read as
  // part of «Continuity» (E.D., 25 Oct, SU020). The Inspector said nothing else
  // about the group, so the section opens with it: its name (a click enters the
  // drawing at it) and what it holds.
  if (nodeId && cb.propertyGroupActions && isStratigraphicType(node.node_type)) {
    const acts = cb.propertyGroupActions(nodeId);
    const gid = store.paradataGroupOf(nodeId);
    if (acts.length || gid) {
      const panel = el("div", "insp-pdgroup");
      panel.appendChild(el("h3", "insp-sect", t("pg.sect")));
      const line = el("div", "insp-pdgroup-state");
      if (gid) {
        const n = store.doc.graph.edges.filter((e) => e.edge_type === "is_in_paradata_nodegroup" && e.target === gid).length;
        const go = el("button", "insp-link", String(store.node(gid)?.name ?? gid)) as HTMLButtonElement;
        go.type = "button";
        go.dataset.go = gid;
        go.title = t("pg.goTitle");
        go.addEventListener("click", () => cb.onJump(gid));
        line.append(go, document.createTextNode(` · ${t(n === 1 ? "pg.memberOne" : "pg.members", { n: String(n) })}`));
      } else {
        line.textContent = t("pg.none");
      }
      panel.appendChild(line);
      if (acts.length) {
        const bar = el("div", "insp-actions");
        for (const a of acts) {
          const b = el("button", "insp-btn", a.label) as HTMLButtonElement;
          b.dataset.cmd = a.cmd;
          if (a.title) b.title = a.title;
          b.addEventListener("click", () => a.run());
          bar.appendChild(b);
        }
        panel.appendChild(bar);
      }
      root.appendChild(panel);
    }
  }

  // CMD1 · the 3D arm. On a resource: import its mesh and bind it. (On a
  // stratigraphic unit, «Model the proxy in Blender» lives in the «Proxy»
  // section below — MICRO-INSPECTOR-SEZIONI p.1.) The action lives HERE, on the
  // node it is about, because "model the proxy for this unit" is a sentence
  // about a unit — a global button would have to ask which one, which the
  // selection already answered.
  if (nodeId && cb.onCommand && node.node_type === "resource") commandRow(root, "import_geometry");
  function commandRow(host: HTMLElement, verb: "create_proxy_for_unit" | "import_geometry"): void {
    const blocked = cb.commandsBlocked?.() ?? null;
    const bar = el("div", "insp-actions");
    const b = document.createElement("button");
    b.className = "insp-btn" + (blocked ? " insp-btn-off" : "");
    b.textContent = verb === "create_proxy_for_unit" ? t("cmd.modelProxy") : t("cmd.importGeometry");
    b.title = blocked ? blocked : t(verb === "create_proxy_for_unit" ? "cmd.modelProxyHint" : "cmd.hint");
    b.disabled = !!blocked;
    b.dataset.cmd = verb;
    b.setAttribute("aria-disabled", String(!!blocked));
    b.addEventListener("click", () => cb.onCommand!(verb, nodeId!));
    bar.appendChild(b);
    host.appendChild(bar);
    if (verb === "create_proxy_for_unit" && cb.renderSketchUse) cb.renderSketchUse(host, nodeId!);
    // X1/Y3 · a button that cannot be pressed says WHY beside it, in words,
    // and offers the gesture that lifts the block when there is one here: the
    // reason used to live only in the tooltip, and the off button looked on
    // («the click does nothing, no message» — dev.17). MICRO-INSPECTOR-SEZIONI
    // p.1 · the gesture is a short way to where connections are made (the
    // connection panel), not «Connect to Blender» itself: connecting is not a
    // verb of a unit.
    if (blocked) {
      const why = el("div", "insp-blocked");
      why.appendChild(el("span", "", blocked));
      const fix = cb.commandsFix?.() ?? null;
      if (fix) {
        const go = el("button", "insp-link insp-blocked-fix", fix.label) as HTMLButtonElement;
        go.type = "button";
        if (fix.title) go.title = fix.title;
        go.addEventListener("click", () => fix.run(go));
        why.appendChild(go);
      }
      host.appendChild(why);
    }
  }

  // I6 · «Open with…» — the same entries as the node's context menu.
  // MICRO-PULIZIA p.6 · ONE ROW OF ICONS: the tool's name, and — for one that
  // cannot be reached from here — why, are the tooltip and what a screen reader
  // says; an unavailable tool is `aria-disabled` (still reached by Tab) and its
  // click says why instead of doing nothing. The sentences under each button
  // (three lines out of every node's Inspector) are gone.
  const tools = nodeId && cb.openWith ? cb.openWith(nodeId) : [];
  if (tools.length) {
    root.appendChild(el("h3", "insp-sect", t("openWith.head")));
    const box = el("div", "insp-openwith");
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", t("openWith.head"));
    for (const x of tools) {
      const b = el("button", "insp-openwith-btn" + (x.ok ? "" : " off")) as HTMLButtonElement;
      b.type = "button";
      b.dataset.openwith = x.key;
      b.innerHTML = OPEN_WITH_ICONS[x.key] ?? "";
      if (!b.innerHTML) b.textContent = x.label;
      const tip = x.ok ? x.label : `${x.label} — ${x.why ?? ""}`;
      b.title = tip;
      b.setAttribute("aria-label", tip);
      if (!x.ok) b.setAttribute("aria-disabled", "true");
      b.addEventListener("click", () => (x.ok ? x.run() : cb.onBlocked?.(x.why ?? x.label)));
      box.appendChild(b);
    }
    root.appendChild(box);
  }

  // ── DTC · the rights of THIS resource (licence / embargo / author) ─────────
  //
  // On a resource, because a resource is the thing that has bytes behind it and
  // the bytes are what somebody downloads. StratiGraph Server reads exactly these three
  // statements before serving an asset: while an embargo runs the file is for
  // the people working on the study, and the licence travels with it.
  //
  // Apposing and removing, deliberately — not a provenance editor. The full DTC
  // chain (who acquired what with which instrument) is a different surface; this
  // is the sentence somebody needs to say the day they upload a photograph.
  //
  // …e vale anche per un LOTTO (`dtc_acquisition`): è lo stesso atto, detto una
  // volta sopra N file. Il lettore (`s3dgraphy.rights`) risale la catena, quindi
  // ogni membro legge la licenza del lotto senza averne una copia. Senza questo
  // ramo la dichiarazione per lotto esisteva solo nel pannello di ingestione, e
  // un lotto già creato non era più modificabile da nessuna parte.
  if (nodeId && (node.node_type === "resource"
                 || node.node_type === "dtc_acquisition")) {
    const isLot = node.node_type === "dtc_acquisition";
    const rights = store.readNodeRights(nodeId);
    const panel = el("div", "insp-canvas");
    panel.appendChild(el("h3", "insp-sect",
      isLot ? t("insp.lotRights") : t("insp.resourceRights")));
    panel.appendChild(el("div", "insp-hint",
      isLot ? t("insp.lotRightsHint") : t("insp.resourceRightsHint")));

    // MICRO-CRONO-MULTIPLA p.2 · the rights go, with ⌘/Alt, to every selected
    // resource and lot (the nodes that have this panel)
    const hasRights = (n: EmNode): boolean => n.node_type === "resource" || n.node_type === "dtc_acquisition";
    const field = (
      label: string, value: string, placeholder: string,
      commit: (id: string, v: string) => void, kind = "text",
    ): HTMLInputElement => {
      panel.appendChild(el("label", "insp-field-label", label));
      const input = document.createElement("input");
      input.className = "insp-name-input";
      input.type = kind;
      input.value = value;
      input.placeholder = placeholder;
      panel.appendChild(input);
      bindMulti(scope, nodeId, input, label, hasRights, commit);
      return input;
    };

    // DEV29 B3 · the proposal is the GRAPH's licence when it declares one
    // (San Pietro: CC-BY-ND, and the button said «Apply CC-BY-SA-4.0»); the
    // default only when the graph says nothing
    const graphLicence = store.readGraphScope().license.trim();
    const proposed = graphLicence || "CC-BY-SA-4.0";
    field(t("insp.licence"), rights.license, proposed,
          (id, v) => store.setNodeRights(id, { license: v }));
    if (!rights.license) {
      const suggest = el("button", "insp-btn",
                         graphLicence ? t("insp.applyGraphLicence", { lic: proposed })
                                      : t("insp.applyDefaultLicence")) as HTMLButtonElement;
      suggest.dataset.action = "apply-licence";
      suggest.dataset.licence = proposed;
      suggest.title = graphLicence ? t("insp.applyGraphLicenceTitle") : t("insp.applyDefaultLicenceTitle");
      panel.appendChild(suggest);
      multiClick(suggest, t("insp.licence"), hasRights, (id) => store.setNodeRights(id, { license: proposed }));
    }

    const embargo = field(t("insp.embargoUntil"), rights.embargo, "2027-01-01",
                          (id, v) => store.setNodeRights(id, { embargo: v }),
                          "date");
    field(t("insp.embargoReason"), rights.reason, t("insp.embargoReasonEg"),
          (id, v) => store.setNodeRights(id, { reason: v, embargo: embargo.value }));

    // ── AUTORE ≠ ATTRIBUTORE ───────────────────────────────────────────────
    //
    // L'autore è chi HA FATTO il dato: può essere qualcun altro, può essere
    // assente, può essere morto. L'attributore è chi lo DICHIARA, adesso, ed è
    // chi sta alla tastiera. Un campo solo non saprebbe dire «questa foto è di
    // Bruno, e lo affermo io» — che è la frase normale per tutto ciò che si
    // cataloga dopo. Protocollo: `s3Dgraphy/docs/asset-dtc-protocol.md`.
    const me = currentIdentity();
    panel.appendChild(el("label", "insp-field-label", t("insp.author")));
    const authorName = document.createElement("input");
    authorName.className = "insp-name-input";
    authorName.value = rights.author;
    authorName.placeholder = t("insp.authorPlaceholder");
    const authorOrcid = document.createElement("input");
    authorOrcid.className = "insp-name-input";
    authorOrcid.value = rights.orcid;
    authorOrcid.placeholder = "0000-0000-0000-0000";
    const commitAuthor = (): void => {
      const iD = authorOrcid.value.trim();
      const problem = iD ? orcidProblem(iD) : null;
      if (problem) {
        // Said, not swallowed: an iD with a typo is not an identity, and
        // writing it anyway would put a person in the graph who does not exist.
        authorOrcid.title = t("insp.badOrcid", { why: problem });
        authorOrcid.classList.add("insp-input-bad");
        return;
      }
      authorOrcid.classList.remove("insp-input-bad");
      commitField(scope, nodeId, t("insp.author"), hasRights, (id) => store.setNodeRights(id, {
        author: authorName.value.trim() || iD,
        orcid: iD,
      }));
    };
    authorName.addEventListener("change", commitAuthor);
    authorOrcid.addEventListener("change", commitAuthor);
    confirmOnMultiEnter(authorName, commitAuthor);
    confirmOnMultiEnter(authorOrcid, commitAuthor);
    authorName.dataset.multiField = authorOrcid.dataset.multiField = t("insp.author");
    panel.appendChild(authorName);
    panel.appendChild(authorOrcid);
    { const h = multiHint(scope, hasRights); if (h) panel.appendChild(h); }
    panel.appendChild(el("div", "insp-hint", t("insp.authorOrcidHint")));

    // …e la firma dell'atto, in chiaro
    if (rights.attributedBy || rights.attributedAt) {
      const when = rights.attributedAt
        ? new Date(rights.attributedAt).toLocaleString()
        : "";
      panel.appendChild(el("div", "insp-hint",
        `Attribuito da ${rights.attributedBy || "?"}${when ? ` il ${when}` : ""}`));
    }

    const actions = el("div", "insp-actions");
    // THE SHELF IS A SELECTION. The documentation holds everything the study
    // ingested; the shelf is the handful you are working from, and it travels
    // with the em.json. Putting an asset on it is therefore a CHOICE somebody
    // makes here, not a side effect of having ingested the file.
    if (!isLot && cb.onAddToShelf) {
      const already = cb.isOnShelf?.(nodeId) ?? false;
      const shelve = el("button", "insp-btn",
                        already ? t("insp.onShelf") : t("insp.addToShelf"),
                       ) as HTMLButtonElement;
      shelve.disabled = already;
      shelve.title = already ? t("insp.onShelfTitle") : t("insp.addToShelfTitle");
      shelve.addEventListener("click", () => cb.onAddToShelf!(nodeId));
      actions.appendChild(shelve);
    }
    const claim = el("button", "insp-btn",
                     t("insp.iAmTheAuthor")) as HTMLButtonElement;
    claim.disabled = !me;
    claim.title = me ? t("insp.iAmTheAuthorTitle", { orcid: me.orcid })
                     : t("insp.noIdentity");
    if (me) multiClick(claim, t("insp.author"), hasRights, (id) => store.setNodeRights(id, {
      author: [me.name, me.surname].filter(Boolean).join(" ") || me.orcid,
      orcid: me.orcid,
    }), false);
    actions.appendChild(claim);
    if (rights.author || rights.license || rights.embargo) {
      const clear = el("button", "insp-btn",
                        t("insp.clearRights")) as HTMLButtonElement;
      clear.title = t("insp.clearRightsTitle");
      multiClick(clear, t("insp.clearRights"), hasRights,
        (id) => store.setNodeRights(id, { author: "", license: "", embargo: "" }), false);
      actions.appendChild(clear);
    }
    panel.appendChild(actions);
    root.appendChild(panel);
  }

  // ── USATA DA… · dove questo asset è in uso, e da cosa è stato fatto ────────
  //
  // La domanda da farsi PRIMA di sostituire un file: una foto citata da tre
  // unità e da un capitolo non è una foto che si scambia in silenzio. Vive qui,
  // nell'ispettore della risorsa, e non in una seconda scheda «uso»: è una
  // proprietà di questo oggetto, non un'altra vista dello studio.
  //
  // I diritti (licenza/embargo/autore) sono ESCLUSI dall'elenco — sono attaccati
  // al file, non sono usi del file, e stanno già nel riquadro qui sopra. La
  // catena DTC (chi l'ha prodotto, chi l'ha consumato) è invece mostrata, perché
  // è la risposta all'altra metà della domanda: da dove viene.
  if (nodeId && node.node_type === "resource") {
    const usages = resourceUsages(store, nodeId).filter((u) => u.role !== "rights");
    const chain = derivationChain(store, nodeId);
    if (usages.length || chain.madeBy.length || chain.usedBy.length) {
      const panel = el("div", "insp-canvas");
      panel.appendChild(el("h3", "insp-sect", t("insp.usedBy")));

      if (chain.madeBy.length) {
        panel.appendChild(el("div", "insp-hint", t("insp.producedBy")));
        for (const event of chain.madeBy) {
          // DEV29 B2 · the act by its technique, not «derivation of …»
          const evNode = store.node(event.id);
          const evName = (evNode && processLabel(evNode)) || event.name;
          const b = el("button", "insp-btn",
            `${event.tool ? `${evName} · ${event.tool}` : evName}`) as HTMLButtonElement;
          b.title = event.type === "dtc_acquisition"
            ? t("insp.theAcquisition") : t("insp.theDtcEvent");
          b.addEventListener("click", () => cb.onJump(event.id));
          panel.appendChild(b);
        }
      }

      const cited = usages.filter((u) => u.role === "reference" || u.role === "annotation");
      if (cited.length) {
        panel.appendChild(el("div", "insp-hint",
          t(cited.length === 1 ? "insp.citedByOne" : "insp.citedBy", { n: String(cited.length) })));
        for (const use of cited) {
          const b = el("button", "insp-btn",
            `${use.name} — ${use.edgeType}`) as HTMLButtonElement;
          b.addEventListener("click", () => cb.onJump(use.id));
          panel.appendChild(b);
        }
      } else {
        panel.appendChild(el("div", "insp-hint", t("insp.nobodyCitesIt")));
      }

      if (chain.usedBy.length) {
        panel.appendChild(el("div", "insp-hint", t("insp.usedAsInputBy")));
        for (const event of chain.usedBy) {
          const b = el("button", "insp-btn",
            `${event.tool ? `${event.name} · ${event.tool}` : event.name}`) as HTMLButtonElement;
          b.addEventListener("click", () => cb.onJump(event.id));
          panel.appendChild(b);
        }
      }
      root.appendChild(panel);
    }
  }

  // ── MICRO-SPAZIO-3D-2 · the transform of a 3D object, in the data ─────────
  let transformShown = false;
  if (nodeId && cb.renderTransform) {
    const panel = el("div", "insp-canvas insp-xf");
    panel.appendChild(el("h3", "insp-sect", t("xf.title")));
    const body = el("div");
    panel.appendChild(body);
    if (cb.renderTransform(body, nodeId)) { root.appendChild(panel); transformShown = true; }
  }

  // ── MICRO-PROVA-DEV47 p.5 · the unit's proxy, deletable ──
  // MICRO-INSPECTOR-SEZIONI p.1 · …and made: «Model the proxy in Blender» is a
  // verb on the proxy, so it is drawn here, under the proxy it would make (it
  // sat above, between «Continuity» and «Open with…»)
  if (nodeId && (cb.renderProxy || cb.onCommand)) {
    const panel = el("div", "insp-canvas insp-proxy");
    panel.appendChild(el("h3", "insp-sect", t("px.title")));
    const body = el("div");
    panel.appendChild(body);
    const has = cb.renderProxy?.(body, nodeId) ?? false;
    const unit = isStratigraphicType(node.node_type);
    if (unit && cb.onCommand) {
      if (!has) body.appendChild(el("div", "insp-hint", t("px.noneYet")));
      commandRow(body, "create_proxy_for_unit");
    }
    if (has || (unit && cb.onCommand)) root.appendChild(panel);
  }

  // ── MICRO-SPAZIO-3D-3 p.10 · a model's versions, the same selector as the Space's ──
  if (nodeId && cb.renderVersions) {
    const panel = el("div", "insp-canvas insp-ver");
    panel.appendChild(el("h3", "insp-sect", t("ver.title")));
    const body = el("div");
    panel.appendChild(body);
    if (cb.renderVersions(body, nodeId)) root.appendChild(panel);
  }
  // ── MICRO-PROVA-DEV47 p.4 · «Alternativa»: always there on a tileset, and on a container ──
  if (nodeId && cb.renderAlternative) {
    const panel = el("div", "insp-canvas insp-alt");
    panel.appendChild(el("h3", "insp-sect", t("alt.title")));
    const body = el("div");
    panel.appendChild(body);
    if (cb.renderAlternative(body, nodeId)) root.appendChild(panel);
  }
  // ── MICRO tileset, shift e epoche · «Frame»: a tileset's CRS and shift ──
  if (nodeId && cb.renderFrame) {
    const panel = el("div", "insp-canvas insp-frame");
    panel.appendChild(el("h3", "insp-sect", t("frm.title")));
    const body = el("div");
    panel.appendChild(body);
    if (cb.renderFrame(body, nodeId)) root.appendChild(panel);
  }

  // ── RISORSA-FILE · the files, the resources of a file, the revisions ─────
  if (nodeId && (node.node_type === "resource" || node.node_type === "resource_file")) {
    const panel = renderResourcePanel(store, nodeId, {
      onJump: cb.onJump,
      isOpen: (id) => cb.isResourceOpen?.(id) ?? false,
      onToggleFiles: (id) => cb.onToggleResourceFiles?.(id),
      onReplaceFile: cb.onReplaceFile,
      onOpenInScene: cb.onOpenInScene,
      onCheckAddress: cb.onCheckAddress,
    });
    if (panel) root.appendChild(panel);
    const where = cb.fileStateLine?.(nodeId);
    if (where) root.appendChild(where);
  }

  // ── il LOTTO · un'acquisizione, con i suoi membri ─────────────────────────
  //
  // Il nodo seriale visto dall'ispettore: quanti file ha portato dentro, e la
  // via per entrarci. I diritti del lotto si dichiarano nel riquadro DTC come
  // per una risorsa (l'atto è lo stesso), e ogni membro li EREDITA leggendo la
  // catena — non ne ha una copia.
  if (nodeId && node.node_type === "dtc_acquisition") {
    const members = acquisitionMembers(store, nodeId);
    const panel = el("div", "insp-canvas");
    panel.appendChild(el("h3", "insp-sect", t("insp.acquisitionLot")));
    panel.appendChild(el("div", "insp-hint",
      t("insp.acquisitionLotHint", { n: String(members.length) })));
    for (const member of members.slice(0, 12)) {
      const m = store.node(member);
      const b = el("button", "insp-btn", m?.name ?? member) as HTMLButtonElement;
      b.addEventListener("click", () => cb.onJump(member));
      panel.appendChild(b);
    }
    if (members.length > 12) {
      panel.appendChild(el("div", "insp-hint",
        t("insp.andMore", { n: String(members.length - 12) })));
    }
    root.appendChild(panel);
  }

  // FUNNEL1 · "Propagative metadata" — the value + provenance of each propagative
  // property (author/license/embargo), resolved Node → Activity → Epoch → Canvas
  // (first non-null, substitutive). Mirrors EMtools' draw_propagative_metadata:
  // it is a PRESENTATION of the resolver — nothing is written to em.json. Shown
  // for stratigraphic referents (the nodes that inherit down the funnel).
  if (nodeId && isStratigraphicType(node.node_type)) {
    const rows: { rule: string; value: string; src: string; own: boolean }[] = [];
    for (const rule of BADGE_RULES) {
      const eff = resolveEffective(store.doc, nodeId, rule);
      if (eff.value == null) continue;
      rows.push({
        rule,
        value: eff.value,
        src: sourceLabel(eff.source),
        own: eff.explicit,
      });
    }
    const chron = cb.chronologyOf?.(nodeId) ?? null;
    if (rows.length || chron) {
      // MICRO-PULIZIA p.6 · a section like the others (its triangle is theirs)
      root.appendChild(el("h3", "insp-sect", t("insp.propagative")));
      const details = el("div", "insp-propagative");
      for (const r of rows) {
        const row = el("div", `insp-prop-row${r.own ? " insp-prop-own" : " insp-prop-inherited"}`);
        row.appendChild(el("span", "insp-prop-rule", r.rule));
        row.appendChild(el("span", "insp-prop-value", r.value));
        // provenance: "proprio" when declared on the node, else "da Epoca …"
        const from = el("span", "insp-prop-source",
                        r.own ? t("insp.own") : r.src);
        from.title = r.own ? t("insp.ownTitle")
                           : t("insp.inheritedTitle", { src: r.src });
        row.appendChild(from);
        details.appendChild(row);
      }
      if (chron) {
        const box = el("div", "insp-time");
        box.dataset.node = nodeId;
        details.appendChild(box);
        renderTimeRows(box, store, chron, cb.onJump);
        const get = cb.chronologyOf!;
        timeBoxes.add({ box, paint: () => renderTimeRows(box, store, get(nodeId), cb.onJump) });
      }
      root.appendChild(details);
    }
  }

  // extra data fields (read-only)
  const data = (node as EmNode).data;
  if (data && Object.keys(data).length) {
    const dl = el("dl", "insp-data");
    const tech = el("dl", "insp-data");
    const showIds = getSettings().developer.showNodeIds;
    const typeLabel = String(node.node_type);
    for (const [k, v] of Object.entries(data)) {
      if (v === null || v === "" || v === undefined) continue;
      // I3 · said once: the genre is the chip and its element row above, and a
      // `label` that repeats the type or the name is not a second fact
      if (shownAbove.has(k)) continue;
      if (k === "label" && (String(v) === String(node.name ?? "") || /US \(or SU\)/.test(String(v))
          || String(v).toLowerCase() === typeLabel.toLowerCase())) continue;
      // I3 · an identifier exists for the developer only, and then out of the way
      if (ID_FIELDS.has(k) && !showIds) continue;
      const into = ID_FIELDS.has(k) || TECH_FIELDS.has(k) ? tech : dl;
      // AUDIT1 · the editorial stamps have their own block below — four raw
      // keys in the technical dump is not "shown", it is buried.
      if (EDITORIAL_FIELDS.includes(k)) continue;
      // P4.1b · the field clocks and the tombstones are machinery, not content:
      // they belong to the merge, and showing them here would bury the data
      if (k === "field_clocks" || k === "removed") continue;
      // MICRO-SPAZIO-3D-3 p.15 · the transform is the «Trasformazione» section's
      // nine fields above, not a raw JSON with its numbers written as strings
      if (k === "transform" && transformShown) continue;
      // MICRO-PULIZIA p.7 · a document's date is shown in «Dating of the
      // document» only (its property); the importer's copy is not a second fact
      if (k === "absolute_time_start" && node.node_type === "document") continue;
      // DEV29 B3 · a file set's members digest IS its checksum (s3Dgraphy dev29
      // A1 writes only `checksum`): the same sha256 twice is said once
      if (k === "members_digest" && v === (data as Record<string, unknown>).checksum) continue;
      into.appendChild(el("dt", undefined, k));
      const dd = el("dd");
      dd.appendChild(document.createTextNode(
        typeof v === "object" ? JSON.stringify(v) : String(v)));
      // P4.1b · emptying a field is an ACT and needs a gesture that performs it.
      // It goes through `clearField`, which leaves the field's TOMBSTONE — a key
      // simply deleted would look, on the other side, like a field they have and
      // you never did, and their value would come back.
      if (cb.onClearField) {
        const x = document.createElement("button");
        x.className = "insp-field-clear";
        x.textContent = "×";
        x.title = t("insp.clearField");
        // with ⌘/Alt: emptied on every selected node that has it written
        const hasK = (n: EmNode): boolean => {
          const w = ((n.data ?? {}) as Record<string, unknown>)[k];
          return w !== undefined && w !== null && w !== "";
        };
        x.dataset.multiField = k;
        x.addEventListener("click", (e) =>
          commitField(scope, nodeId!, t("multi.f.clear", { field: k }), hasK, (id) => cb.onClearField!(id, `data.${k}`), multiKeyOf(e)));
        dd.appendChild(x);
      }
      into.appendChild(dd);
    }
    // MICRO-PULIZIA p.6 · the whole of the data — the fields and the technical
    // details — under ONE triangle, «Data»: the technical ones under a small
    // heading of their own, no second triangle inside the first
    if (dl.childElementCount || tech.childElementCount) {
      const h = el("h3", "insp-sect", t("insp.dataSect"));
      h.dataset.sectData = "1";
      h.dataset.sect = "data";
      root.appendChild(h);
      if (dl.childElementCount) root.appendChild(dl);
    }
    if (tech.childElementCount) {
      const det = el("div", "insp-tech");
      det.appendChild(el("div", "insp-subhead", t("insp.techDetails", { n: String(tech.childElementCount / 2) })));
      det.appendChild(tech);
      root.appendChild(det);
    }
  }

  renderEditorialStamps(root, node as EmNode);

  // MICRO studio-luogo, part D · THE CHAIN, on the card of any of its nodes —
  // the study, its place, the HC1, the twin, the project: from which study, in
  // which place, of which heritage, with which twin. The same card the
  // narrative draws (hdto-card.ts); the Study window stays where it is edited.
  if (isChainNode(doc, node.id)) {
    const card = chainCard(doc, { focusId: node.id, onJump: cb.onJump });
    if (card) {
      root.appendChild(el("h3", "insp-sect", t("hdto.cardTitle")));
      root.appendChild(card);
    }
  }

  // MULTIGRAPH · the graph-self node carries the graph-scope facts, and the
  // multigraph mode puts it ON the canvas — so selecting it must offer the site
  // position, not send the reader back to the no-selection Canvas panel to look
  // for it. Same renderer as that panel (renderSitePosition).
  // MICRO-UN-POSTO · and this is THE place of it: the other three show it and
  // open the same selector here.
  if (classOf(node.node_type) === "GraphNode") {
    // MICRO-AUTORI-LAYOUT p.5 · the graph and its own paradata, all in one
    // place: what the Multigraph's node (or the graph's chip) selects
    const scope = store.readGraphScope();
    const g = doc.graph;
    root.appendChild(el("h3", "insp-sect", t("graphs.inspTitle")));
    const box = el("div", "insp-group");
    const links = linksOfGraph(doc);
    const rows: [string, string][] = [
      [t("graphs.inspName"), String(g.name ?? "")],
      [t("graphs.inspCode"), String((g as unknown as { code?: string }).code ?? scope.em_id ?? "")],
      [t("graphs.inspSize"), t("graphs.inspSizeV", { n: String(g.nodes.length), e: String(g.edges.length) })],
      [t("graphs.inspAuthor"), scope.author + (scope.orcid ? ` · ${scope.orcid}` : "")],
      [t("graphs.inspLicense"), scope.license],
      [t("graphs.inspEmbargo"), scope.embargo],
      [t("graphs.inspLinks"), links.length ? String(links.length) : ""],
    ];
    for (const [k, v] of rows) {
      if (!v) continue;
      const row = el("div", "insp-link-row");
      row.style.gap = "8px";
      row.appendChild(el("span", "insp-group-title", k));
      row.appendChild(el("span", "", v));
      box.appendChild(row);
    }
    root.appendChild(box);
    renderSitePosition(root, store, cb.onSetSitePosition, true);
    cb.geoSections?.(root);
  }

  // connections grouped by edge type and direction, deletable
  const groups = new Map<
    string,
    { edge: EmEdge; otherId: string; out: boolean }[]
  >();
  for (const e of doc.graph.edges) {
    let otherId: string, out: boolean;
    if (e.source === nodeId) {
      otherId = e.target;
      out = true;
    } else if (e.target === nodeId) {
      otherId = e.source;
      out = false;
    } else continue;
    const key = e.edge_type ?? "edge";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ edge: e, otherId, out });
  }
  if (groups.size) {
    root.appendChild(el("h3", "insp-sect", "Connections"));
    const nodeById = new Map(doc.graph.nodes.map((n) => [n.id, n]));
    for (const [type, list] of [...groups.entries()].sort()) {
      const es = edgeStyle(type);
      const g = el("div", "insp-group");
      const title = el(
        "div",
        "insp-group-title",
        `${es.label} (${list.length})`,
      );
      title.style.setProperty("--rel", es.color);   // I2 · a bar, not the ink
      g.appendChild(title);
      for (const { edge, otherId, out } of list) {
        const row = el("div", "insp-link-row");
        const b = el(
          "button",
          "insp-link",
          `${out ? "→" : "←"} ${nodeById.get(otherId)?.name || otherId}`,
        );
        b.title = `${otherId} [${nodeById.get(otherId)?.node_type ?? "?"}]`;
        b.addEventListener("click", () => cb.onJump(otherId));
        row.appendChild(b);
        const del = el("button", "insp-edge-del", "×");
        del.title = t("l.deleteConnection");
        del.addEventListener("click", () => cb.onDeleteEdge(edge));
        row.appendChild(del);
        g.appendChild(row);
      }
      root.appendChild(g);
    }
  }

  // the rapporti with units of the OTHER graphs of the same file (s3dgraphy
  // links, E.D. 11 Oct 2026): shown with the graph they are in, and a click
  // goes there — the graph comes in front and the unit is selected
  const across = cb.crossGraphLinks?.(nodeId) ?? [];
  if (across.length) {
    root.appendChild(el("h3", "insp-sect", t("insp.crossGraph")));
    const g = el("div", "insp-group");
    g.dataset.links = "across";
    for (const l of across) {
      const es = edgeStyle(l.edgeType);
      const row = el("div", "insp-link-row");
      const b = el("button", "insp-link",
        `${l.out ? "→" : "←"} ${es.label} · ${l.nodeName} — ${l.graphName}`);
      b.title = l.resolved ? t("insp.crossGraphGo", { graph: l.graphName })
        : t("insp.crossGraphMissing", { graph: l.graphName });
      if (!l.resolved) (b as HTMLButtonElement).disabled = true;
      else b.addEventListener("click", () => l.go());
      row.appendChild(b);
      g.appendChild(row);
    }
    root.appendChild(g);
  }

  // Delete affordance is node-kind specific so nothing is ever orphaned:
  //  - a PHASE has "Delete phase" (re-homes its units/sub-phases) — added above.
  //  - a top-level EPOCH has "Delete epoch" (cascades sub-phases + swimlane +
  //    temporal PDG, un-attributes its units) — the generic "Delete node" would
  //    leave a phantom lane and orphan PDG.
  //  - anything else uses the generic "Delete node".
  const isPhaseNode =
    node.node_type === "EpochNode" && store.parentEpoch(nodeId) != null;
  const isTopEpoch = node.node_type === "EpochNode" && !isPhaseNode;
  // MICRO-PULIZIA p.6 · the danger zone goes to the very end (after «History of
  // this node», which main.ts appends): marked so it can be found and moved
  if (isTopEpoch) {
    const danger = el("div", "insp-actions insp-danger-zone");
    const delEp = el("button", "insp-btn danger", t("insp.deleteEpoch"));
    delEp.addEventListener("click", () => cb.onDeleteEpoch(nodeId));
    danger.appendChild(delEp);
    root.appendChild(danger);
  } else if (!isPhaseNode) {
    const danger = el("div", "insp-actions insp-danger-zone");
    const delNode = el("button", "insp-btn danger", t("insp.deleteNode"));
    delNode.addEventListener("click", () => cb.onDeleteNode(nodeId));
    danger.appendChild(delNode);
    root.appendChild(danger);
  }
}

/**
 * dev28 (E.D., 1 Oct 2026, decision 16) · the fields of an OBJECT quale, read
 * from the datamodel (`schema`, qualia 1.6.6) — today `attribution`:
 * `attributed_to`, `attribution_type`, `confidence`, `note`. Whoever compiles
 * the attribution writes its note, and this is where EMStudio compiles it.
 *
 * Where it lives, measured: s3Dgraphy's `translation.field_text` (and its twin
 * here) reads `data.<key>` one level deep, and no writer stored the object
 * anywhere. So the fields sit on the property's own `data` under their schema
 * names: the note is `data.note`, translatable and tagged like every free text
 * (`natural_language_fields`), with the pills of the language row under it.
 * The kinds of input come from the schema's own words: `a | b | c` is a closed
 * list, `float 0-1` a number between 0 and 1, the rest a line of text.
 */
function renderQualeObject(root: HTMLElement, store: DocumentStore, node: EmNode, cb: InspectorCallbacks, scope: MultiScope | null = null): void {
  const q = qualeOf(node);
  if (!q?.schema || !Object.keys(q.schema).length) return;
  const data = (node.data ?? {}) as Record<string, unknown>;
  const texts = new Set(q.naturalLanguageFields ?? []);
  // MICRO-CRONO-MULTIPLA p.2 · with ⌘/Alt (Enter, a menu's choice, a slider let
  // go) every selected property of the same quale takes the value
  const sameQuale = (n: EmNode): boolean => qualeOf(n)?.id === q.id;
  const box = el("div", "insp-quale-object");
  box.dataset.quale = q.id;
  box.appendChild(el("div", "insp-field-label", t("insp.qualeObject", { name: q.name })));
  for (const [key, what] of Object.entries(q.schema)) {
    const label = el("label", "insp-field-label", key.replace(/_/g, " "));
    label.title = what;
    box.appendChild(label);
    const write = (v: unknown): void => {
      commitField(scope, node.id, key.replace(/_/g, " "), sameQuale, (id) => {
        if (v === "" || v === null || v === undefined) store.clearField(id, `data.${key}`);
        else store.setField(id, `data.${key}`, v);
      });
    };
    const current = data[key];
    const choices = / \| /.test(what) ? what.split("|").map((s) => s.trim()).filter(Boolean) : null;
    if (texts.has(key)) {
      const area = document.createElement("textarea");
      area.className = "insp-desc-input";
      area.dataset.field = `data.${key}`;
      area.value = typeof current === "string" ? current : "";
      area.placeholder = what;
      area.addEventListener("change", () => write(area.value.trim()));
      confirmOnMultiEnter(area, () => write(area.value.trim()));
      box.appendChild(area);
      if (cb.renderTextLanguages) cb.renderTextLanguages(box, node.id, `data.${key}`);
    } else if (choices) {
      const sel = document.createElement("select");
      sel.className = "insp-name-input";
      sel.dataset.field = `data.${key}`;
      for (const c of ["", ...choices]) {
        const o = document.createElement("option");
        o.value = c; o.textContent = c || "—";
        sel.appendChild(o);
      }
      sel.value = typeof current === "string" && choices.includes(current) ? current : "";
      sel.addEventListener("change", () => write(sel.value));
      confirmOnMultiEnter(sel, () => write(sel.value));
      box.appendChild(sel);
    } else if (/^float 0-1/.test(what)) {
      // MICRO-DOVE-CHI-MENU p.6 · the Inspector's numbers are Blender's
      // fields too: drag (Ctrl = by 0.05), click to type, Backspace = empty
      const num = numField({ value: typeof current === "number" ? current : null, unit: "plain", decimals: 2,
        min: 0, max: 1, nullable: true, defaultValue: null, field: `data.${key}`, commit: (v) => write(v) });
      num.classList.add("insp-name-input");
      box.appendChild(num);
    } else {
      const inp = document.createElement("input");
      inp.className = "insp-name-input";
      inp.dataset.field = `data.${key}`;
      inp.value = typeof current === "string" ? current : "";
      inp.placeholder = what;
      inp.addEventListener("change", () => write(inp.value.trim()));
      confirmOnMultiEnter(inp, () => write(inp.value.trim()));
      box.appendChild(inp);
    }
  }
  { const h = multiHint(scope, sameQuale); if (h) box.appendChild(h); }
  root.appendChild(box);
}
