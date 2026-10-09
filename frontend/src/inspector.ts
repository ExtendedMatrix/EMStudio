import { t } from "./i18n";
import type { DocumentStore } from "./model";
import { edgeStyle, nodeStyle } from "./palette";
import { dataGlyphLabel, glyphFor, glyphSvg } from "./glyphs";
import { activeTheme, canvasTheme } from "./theme";
import { classOf, conceptParts, isGroupType, isStratigraphicType, nodeElements, stratigraphicKindLabel, stratigraphicKindOf } from "./rules";
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
import { naturalFields, qualeOf, TRANSLATION_TYPE } from "./translation";

export interface InspectorCallbacks {
  onJump: (nodeId: string) => void;
  /** PROPRIETA · the verbs of a unit on its paradata group («Compact the
   *  properties», «Dissolve the group») that apply to it now */
  propertyGroupActions?: (nodeId: string) => Array<{ cmd: string; label: string; run: () => void }>;
  /** MICRO-UN-POSTO · open the site selector on the graph node */
  onSetSitePosition?: () => void;
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
  /** X1 · the gesture that lifts the block, when there is one here (connect) */
  commandsFix?: () => { label: string; run: () => void } | null;
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
}

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
  "font_style", "text_color", "label_color", "geometry", "yed_id", "graphml_id"]);

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
    const apply = (v: string): void => {
      const d = {
        ...((store.node(nodeId)?.data ?? {}) as Record<string, unknown>),
      };
      const val = v.trim();
      if (val === "") delete d.color;
      else d.color = val;
      store.updateNode(nodeId, { data: d });
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
  } else {
    nameRow.appendChild(nameInput);
  }
  root.appendChild(nameRow);
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
    desc.addEventListener("change", () =>
      store.updateNode(nodeId, { description: desc.value }),
    );
    root.appendChild(desc);
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
    valIn.addEventListener("change", () =>
      store.setPropertyValue(nodeId, valIn.value),
    );
    root.appendChild(valIn);
    // the value of a property IS its description in em.json: its languages
    if (cb.renderTextLanguages && naturalFields(node).includes("description"))
      cb.renderTextLanguages(root, nodeId, "description");
    // dev28 · an OBJECT quale (attribution) is compiled here, field by field
    renderQualeObject(root, store, node, cb);
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
      inp.addEventListener("change", () => {
        // authoring a bound is what makes its absolute_time_* PropertyNode
        // (F5: in the epoch's group, with has_property) — one undo step
        store.setEpochBound(nodeId, which, inp.value);
      });
      root.appendChild(inp);
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
        root.appendChild(el("h3", "insp-sect", "Phase"));
        const bar = el("div", "insp-actions");
        const mk = (id: string, label: string): void => {
          const b = el("button", "insp-btn", label) as HTMLButtonElement;
          if (id === cur) {
            b.disabled = true;
            b.textContent = `✓ ${label}`;
          }
          b.addEventListener("click", () => cb.onAssignEpoch(nodeId, id));
          bar.appendChild(b);
        };
        mk(topEpoch, `${store.node(topEpoch)?.name ?? "epoch"} (none)`);
        for (const ph of phases) mk(ph, store.node(ph)?.name ?? ph);
        root.appendChild(bar);
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

  // PROPRIETA · a unit's properties into its paradata group, and back
  if (nodeId && cb.propertyGroupActions && isStratigraphicType(node.node_type)) {
    const acts = cb.propertyGroupActions(nodeId);
    if (acts.length) {
      const bar = el("div", "insp-actions");
      for (const a of acts) {
        const b = el("button", "insp-btn", a.label) as HTMLButtonElement;
        b.dataset.cmd = a.cmd;
        b.addEventListener("click", () => a.run());
        bar.appendChild(b);
      }
      root.appendChild(bar);
    }
  }

  // CMD1 · the 3D arm. On a stratigraphic unit: model its proxy in Blender. On
  // a resource: import its mesh and bind it. The action lives HERE, on the node
  // it is about, because "model the proxy for this unit" is a sentence about a
  // unit — a global button would have to ask which one, which the selection
  // already answered.
  if (nodeId && cb.onCommand) {
    const verb = isStratigraphicType(node.node_type)
      ? "create_proxy_for_unit"
      : node.node_type === "resource"
        ? "import_geometry"
        : null;
    if (verb) {
      const blocked = cb.commandsBlocked?.() ?? null;
      const bar = el("div", "insp-actions");
      const b = document.createElement("button");
      b.className = "insp-btn" + (blocked ? " insp-btn-off" : "");
      b.textContent = verb === "create_proxy_for_unit" ? t("cmd.modelProxy") : t("cmd.importGeometry");
      b.title = blocked ? blocked : t("cmd.hint");
      b.disabled = !!blocked;
      b.setAttribute("aria-disabled", String(!!blocked));
      b.addEventListener("click", () => cb.onCommand!(verb, nodeId));
      bar.appendChild(b);
      root.appendChild(bar);
      // X1/Y3 · a button that cannot be pressed says WHY beside it, in words,
      // and offers the gesture that lifts the block when there is one here: the
      // reason used to live only in the tooltip, and the off button looked on
      // («the click does nothing, no message» — dev.17).
      if (blocked) {
        const why = el("div", "insp-blocked");
        why.appendChild(el("span", "", blocked));
        const fix = cb.commandsFix?.() ?? null;
        if (fix) {
          const go = el("button", "insp-btn insp-blocked-fix", fix.label) as HTMLButtonElement;
          go.addEventListener("click", () => fix.run());
          why.appendChild(go);
        }
        root.appendChild(why);
      }
    }
  }

  // I6 · «Open with…» — the same entries as the node's context menu
  const tools = nodeId && cb.openWith ? cb.openWith(nodeId) : [];
  if (tools.length) {
    root.appendChild(el("h3", "insp-sect", t("openWith.head")));
    const box = el("div", "insp-openwith");
    for (const x of tools) {
      const row = el("div", "insp-openwith-row");
      const b = el("button", "insp-btn" + (x.ok ? "" : " insp-btn-off"), x.label) as HTMLButtonElement;
      b.dataset.openwith = x.key;
      b.disabled = !x.ok;
      b.setAttribute("aria-disabled", String(!x.ok));
      b.addEventListener("click", () => x.run());
      row.appendChild(b);
      if (!x.ok && x.why) row.appendChild(el("span", "insp-openwith-why", x.why));
      box.appendChild(row);
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

    const field = (
      label: string, value: string, placeholder: string,
      commit: (v: string) => void, kind = "text",
    ): HTMLInputElement => {
      panel.appendChild(el("label", "insp-field-label", label));
      const input = document.createElement("input");
      input.className = "insp-name-input";
      input.type = kind;
      input.value = value;
      input.placeholder = placeholder;
      input.addEventListener("change", () => commit(input.value));
      panel.appendChild(input);
      return input;
    };

    // DEV29 B3 · the proposal is the GRAPH's licence when it declares one
    // (San Pietro: CC-BY-ND, and the button said «Apply CC-BY-SA-4.0»); the
    // default only when the graph says nothing
    const graphLicence = store.readGraphScope().license.trim();
    const proposed = graphLicence || "CC-BY-SA-4.0";
    field(t("insp.licence"), rights.license, proposed,
          (v) => store.setNodeRights(nodeId, { license: v }));
    if (!rights.license) {
      const suggest = el("button", "insp-btn",
                         graphLicence ? t("insp.applyGraphLicence", { lic: proposed })
                                      : t("insp.applyDefaultLicence")) as HTMLButtonElement;
      suggest.dataset.action = "apply-licence";
      suggest.dataset.licence = proposed;
      suggest.title = graphLicence ? t("insp.applyGraphLicenceTitle") : t("insp.applyDefaultLicenceTitle");
      suggest.addEventListener("click", () =>
        store.setNodeRights(nodeId, { license: proposed }));
      panel.appendChild(suggest);
    }

    const embargo = field(t("insp.embargoUntil"), rights.embargo, "2027-01-01",
                          (v) => store.setNodeRights(nodeId, { embargo: v }),
                          "date");
    field(t("insp.embargoReason"), rights.reason, t("insp.embargoReasonEg"),
          (v) => store.setNodeRights(nodeId, { reason: v, embargo: embargo.value }));

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
      store.setNodeRights(nodeId, {
        author: authorName.value.trim() || iD,
        orcid: iD,
      });
    };
    authorName.addEventListener("change", commitAuthor);
    authorOrcid.addEventListener("change", commitAuthor);
    panel.appendChild(authorName);
    panel.appendChild(authorOrcid);
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
    claim.addEventListener("click", () => {
      if (!me) return;
      store.setNodeRights(nodeId, {
        author: [me.name, me.surname].filter(Boolean).join(" ") || me.orcid,
        orcid: me.orcid,
      });
    });
    actions.appendChild(claim);
    if (rights.author || rights.license || rights.embargo) {
      const clear = el("button", "insp-btn",
                        t("insp.clearRights")) as HTMLButtonElement;
      clear.title = t("insp.clearRightsTitle");
      clear.addEventListener("click", () =>
        store.setNodeRights(nodeId, { author: "", license: "", embargo: "" }));
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
    if (rows.length) {
      const details = el("details", "insp-propagative") as HTMLDetailsElement;
      details.open = true;
      const sum = el("summary", "insp-sect-summary", "Propagative metadata");
      details.appendChild(sum);
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
        x.addEventListener("click", () => cb.onClearField!(nodeId!, `data.${k}`));
        dd.appendChild(x);
      }
      into.appendChild(dd);
    }
    if (dl.childElementCount) {
      root.appendChild(el("h3", "insp-sect", t("insp.dataSect")));
      root.appendChild(dl);
    }
    if (tech.childElementCount) {
      const det = document.createElement("details");
      det.className = "insp-tech";
      det.appendChild(el("summary", "", t("insp.techDetails", { n: String(tech.childElementCount / 2) })));
      det.appendChild(tech);
      root.appendChild(det);
    }
  }

  renderEditorialStamps(root, node as EmNode);

  // MULTIGRAPH · the graph-self node carries the graph-scope facts, and the
  // multigraph mode puts it ON the canvas — so selecting it must offer the site
  // position, not send the reader back to the no-selection Canvas panel to look
  // for it. Same renderer as that panel (renderSitePosition).
  // MICRO-UN-POSTO · and this is THE place of it: the other three show it and
  // open the same selector here.
  if (classOf(node.node_type) === "GraphNode")
    renderSitePosition(root, store, cb.onSetSitePosition, true);

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

  // Delete affordance is node-kind specific so nothing is ever orphaned:
  //  - a PHASE has "Delete phase" (re-homes its units/sub-phases) — added above.
  //  - a top-level EPOCH has "Delete epoch" (cascades sub-phases + swimlane +
  //    temporal PDG, un-attributes its units) — the generic "Delete node" would
  //    leave a phantom lane and orphan PDG.
  //  - anything else uses the generic "Delete node".
  const isPhaseNode =
    node.node_type === "EpochNode" && store.parentEpoch(nodeId) != null;
  const isTopEpoch = node.node_type === "EpochNode" && !isPhaseNode;
  if (isTopEpoch) {
    const danger = el("div", "insp-actions");
    const delEp = el("button", "insp-btn danger", "Delete epoch");
    delEp.addEventListener("click", () => cb.onDeleteEpoch(nodeId));
    danger.appendChild(delEp);
    root.appendChild(danger);
  } else if (!isPhaseNode) {
    const danger = el("div", "insp-actions");
    const delNode = el("button", "insp-btn danger", "Delete node");
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
function renderQualeObject(root: HTMLElement, store: DocumentStore, node: EmNode, cb: InspectorCallbacks): void {
  const q = qualeOf(node);
  if (!q?.schema || !Object.keys(q.schema).length) return;
  const data = (node.data ?? {}) as Record<string, unknown>;
  const texts = new Set(q.naturalLanguageFields ?? []);
  const box = el("div", "insp-quale-object");
  box.dataset.quale = q.id;
  box.appendChild(el("div", "insp-field-label", t("insp.qualeObject", { name: q.name })));
  for (const [key, what] of Object.entries(q.schema)) {
    const label = el("label", "insp-field-label", key.replace(/_/g, " "));
    label.title = what;
    box.appendChild(label);
    const write = (v: unknown): void => {
      if (v === "" || v === null || v === undefined) store.clearField(node.id, `data.${key}`);
      else store.setField(node.id, `data.${key}`, v);
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
      box.appendChild(sel);
    } else if (/^float 0-1/.test(what)) {
      const num = document.createElement("input");
      num.type = "number"; num.min = "0"; num.max = "1"; num.step = "0.05";
      num.className = "insp-name-input";
      num.dataset.field = `data.${key}`;
      num.value = typeof current === "number" ? String(current) : "";
      num.addEventListener("change", () => {
        const v = num.value === "" ? null : Math.min(1, Math.max(0, Number(num.value)));
        write(v === null || Number.isNaN(v) ? null : v);
      });
      box.appendChild(num);
    } else {
      const inp = document.createElement("input");
      inp.className = "insp-name-input";
      inp.dataset.field = `data.${key}`;
      inp.value = typeof current === "string" ? current : "";
      inp.placeholder = what;
      inp.addEventListener("change", () => write(inp.value.trim()));
      box.appendChild(inp);
    }
  }
  root.appendChild(box);
}
