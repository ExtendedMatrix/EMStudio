// LEGENDA · what the edges and the nodes on a canvas MEAN, beside the canvas.
//
// The connector legend lived in the graph window's resources panel, next to the
// node palette, and left with it (SHIFT-A fase 2, `0352519`). It comes back
// where it is needed (E.D., 1 ott 2026): a floating box in the bottom-left corner
// of a graph window, opened from its header, and showing ONLY what that window
// draws. The full language — every `edge_style`, every glyph and shape — is a
// separate thing for someone studying it: Help ▸ Legenda EM (`showLegendModal`).
//
// Two rules keep it honest:
//  · a line sample is stroked by the renderer's own `strokeEdge`, on a short
//    straight route: colour, dash, width and arrowhead cannot drift from the
//    canvas, because there is only one piece of code that draws them;
//  · the labels come from the datamodel (`edgeLabel`, `typeLabel`), never from
//    `i18n.ts` — the UI dictionary only names the box and its controls.
//
// The recovered part of the old code is the reading of the scene
// (`renderLegendInto`: one entry per edge type in `s.edges`, sorted); the
// CSS swatch it drew with is gone, replaced by the canvas stroke.
import edgeConnections from "./assets/s3Dgraphy_connections_datamodel.json";
import { glyphKeys } from "./glyphs";
import { t } from "./i18n";
import { styledEdgeTypes, styledNodeTypes } from "./palette";
import { strokeEdge } from "./renderer";
import { nodeStyle } from "./palette";
import { edgeLabel, stratigraphicKindLabel, stratigraphicKindLetter, stratigraphicKindOf, stratigraphicKinds, typeLabel } from "./rules";
import type { Scene } from "./scene";
import { typeIconElement } from "./type-icons";

export interface LegendEntry {
  /** edge_type, or node_type */
  type: string;
  /** a DTC item's kind (`data.dtc_kind`), which picks its own glyph */
  kind?: string;
  /** a US's genre (`data.stratigraphic_kind`): the same glyph, a decorator */
  genre?: string;
  count: number;
}

export interface LegendContent {
  edges: LegendEntry[];
  nodes: LegendEntry[];
}

/**
 * What a window SHOWS, read off the scene it paints.
 *
 * «Present in the view» is decided by the scene, not by the document: the
 * projection (Matrix or Graph, or the hypergraph context), the filters and the
 * circles of detail have all been applied when the scene is built
 * (`filteredView()` → `buildScenes`), so an edge type the circles hide has no
 * edge here and no line in the legend. On top of that the SAME `edgeVisible`
 * predicate the renderer skips edges with. Folded nodes (`collapsed`) are not
 * drawn as nodes, so they are not counted; a document drawn several times
 * (Master/Instance) is ONE node.
 */
export function legendContent(
  scene: Scene | null,
  edgeVisible: (edgeType: string | undefined) => boolean = () => true,
): LegendContent {
  if (!scene) return { edges: [], nodes: [] };
  const edges = new Map<string, number>();
  for (const e of scene.edges) {
    const type = e.edge.edge_type ?? "generic_connection";
    if (!edgeVisible(e.edge.edge_type)) continue;
    edges.set(type, (edges.get(type) ?? 0) + 1);
  }
  const nodes = new Map<string, LegendEntry>();
  const seen = new Set<string>();
  for (const n of scene.nodes) {
    if (n.collapsed) continue;
    const id = n.instanceOf ?? n.id;
    if (seen.has(id)) continue;
    seen.add(id);
    const type = n.node.node_type ?? "unknown";
    const k = (n.node.data as Record<string, unknown> | undefined)?.["dtc_kind"];
    const kind = typeof k === "string" ? k : undefined;
    const genre = stratigraphicKindOf(n.node) ?? undefined;
    const key = kind ? `${type}|${kind}` : genre ? `${type}|genre:${genre}` : type;
    const hit = nodes.get(key);
    if (hit) hit.count++;
    else nodes.set(key, { type, kind, genre, count: 1 });
  }
  return {
    edges: [...edges].map(([type, count]) => ({ type, count }))
      .sort((a, b) => edgeLabel(a.type).localeCompare(edgeLabel(b.type))),
    nodes: [...nodes.values()]
      .sort((a, b) => nodeEntryLabel(a).localeCompare(nodeEntryLabel(b))),
  };
}

/** The legend's label of a node entry: the datamodel's, the DTC kind, or the
 *  type with its genre («US · muraria»). */
function nodeEntryLabel(e: { type: string; kind?: string; genre?: string }): string {
  if (e.genre) return `${typeLabel(e.type)} · ${stratigraphicKindLabel(e.genre)}`;
  return e.kind ?? typeLabel(e.type);
}

/** Every relation of the language: the connections datamodel's edge types and
 *  every `edge_style` the visual rules declare (a style with no edge type is
 *  still language someone may meet in a file). */
export function allEdgeTypes(): string[] {
  const s = new Set<string>([
    ...Object.keys((edgeConnections as { edge_types: Record<string, unknown> }).edge_types),
    ...styledEdgeTypes(),
  ]);
  return [...s].sort((a, b) => edgeLabel(a).localeCompare(edgeLabel(b)));
}

/** Every node type the visual rules draw (a shape, a glyph, a group box), as
 *  node_types (`styledNodeTypes`: the rules key a few by a short name, `PROP`
 *  for `property`), then every DTC kind the datamodel draws from paths. */
export function allNodeEntries(): { type: string; kind?: string; genre?: string }[] {
  const out: { type: string; kind?: string; genre?: string }[] = styledNodeTypes().map((type) => ({ type }));
  // the genres of a US, right after it: the same glyph with its decorator
  if (out.some((e) => e.type === "US"))
    out.push(...stratigraphicKinds().map((genre) => ({ type: "US", genre })));
  const kinds: { type: string; kind?: string }[] = glyphKeys()
    .filter((k) => k.startsWith("dtc:"))
    .map((k) => ({ type: "dtc", kind: k.slice(4) }));
  const byLabel = (a: { type: string; kind?: string }, b: { type: string; kind?: string }): number =>
    nodeEntryLabel(a).localeCompare(nodeEntryLabel(b));
  return [...out.sort(byLabel), ...kinds.sort(byLabel)];
}

/** A line sample: a small canvas, stroked by the renderer's own `strokeEdge`. */
export function edgeSample(edgeType: string, w = 44, h = 12): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.className = "gl-sample";
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  cv.style.width = `${w}px`;
  cv.style.height = `${h}px`;
  const ctx = cv.getContext?.("2d");
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    strokeEdge(ctx, { pts: [{ x: 2, y: h / 2 }, { x: w - 2, y: h / 2 }], bridges: [[]] }, edgeType, {
      k: 1, arrowSize: 6, bridgeR: 0,
    });
  }
  return cv;
}

export interface LegendPanelOpts {
  /** the edge type picked on this window, or null */
  highlight: string | null;
  /** a click on an edge entry: the caller toggles its highlight */
  onPick: (edgeType: string) => void;
  /** is the «Nodes» section open (per window) */
  nodesOpen: boolean;
  onNodesToggle: (open: boolean) => void;
  onClose: () => void;
}

/** The floating box of ONE graph window: its edges, then (folded) its nodes. */
export function buildLegendPanel(c: LegendContent, o: LegendPanelOpts): HTMLElement {
  const box = document.createElement("div");
  box.className = "graph-legend";
  box.setAttribute("role", "region");
  box.setAttribute("aria-label", t("legend.title"));
  const head = document.createElement("div");
  head.className = "gl-head";
  const title = document.createElement("span");
  title.className = "gl-title";
  title.textContent = t("legend.relations");
  const close = document.createElement("button");
  close.type = "button";
  close.className = "gl-close";
  close.textContent = "×";
  close.title = t("legend.close");
  close.addEventListener("click", (e) => {
    e.stopPropagation();
    o.onClose();
  });
  head.append(title, close);
  box.appendChild(head);

  const list = document.createElement("div");
  list.className = "gl-list";
  if (!c.edges.length) {
    const none = document.createElement("div");
    none.className = "gl-empty";
    none.textContent = t("legend.noEdges");
    list.appendChild(none);
  }
  for (const e of c.edges) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "gl-item" + (o.highlight === e.type ? " on" : "");
    b.dataset.edgeType = e.type;
    b.setAttribute("aria-pressed", String(o.highlight === e.type));
    b.title = e.type;
    b.appendChild(edgeSample(e.type));
    const lab = document.createElement("span");
    lab.className = "gl-label";
    lab.textContent = edgeLabel(e.type);
    const n = document.createElement("span");
    n.className = "gl-count";
    n.textContent = String(e.count);
    b.append(lab, n);
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      o.onPick(e.type);
    });
    list.appendChild(b);
  }
  box.appendChild(list);
  if (o.highlight && !c.edges.some((e) => e.type === o.highlight)) box.dataset.stale = "1";

  if (c.nodes.length) {
    const det = document.createElement("details");
    det.className = "gl-nodes";
    det.open = o.nodesOpen;
    const sum = document.createElement("summary");
    sum.textContent = `${t("legend.nodes")} · ${c.nodes.length}`;
    det.appendChild(sum);
    for (const e of c.nodes) det.appendChild(nodeRow(e, e.count));
    det.addEventListener("toggle", () => o.onNodesToggle(det.open));
    box.appendChild(det);
  }
  // a gesture inside the box is not a gesture on the canvas underneath
  for (const ev of ["pointerdown", "wheel", "dblclick", "contextmenu"])
    box.addEventListener(ev, (e) => e.stopPropagation());
  return box;
}

function nodeRow(e: { type: string; kind?: string; genre?: string }, count?: number): HTMLElement {
  const row = document.createElement("div");
  row.className = "gl-node";
  row.title = e.kind ? `${e.type} · ${e.kind}` : e.genre
    ? t("legend.genre", { letter: stratigraphicKindLetter(e.genre), type: e.type, genre: stratigraphicKindLabel(e.genre) })
    : e.type;
  const ic = document.createElement("span");
  ic.className = "gl-icon";
  ic.appendChild(typeIconElement(e.type, e.kind));
  if (e.genre) {
    // the decorator as the canvas draws it: its letter, in the border's colour
    const g = document.createElement("span");
    g.className = "gl-genre";
    g.dataset.genre = e.genre;
    g.textContent = stratigraphicKindLetter(e.genre);
    g.style.color = nodeStyle(e.type).border;
    ic.appendChild(g);
  }
  const lab = document.createElement("span");
  lab.className = "gl-label";
  lab.textContent = nodeEntryLabel(e);
  row.append(ic, lab);
  if (count != null) {
    const n = document.createElement("span");
    n.className = "gl-count";
    n.textContent = String(count);
    row.appendChild(n);
  }
  return row;
}

/**
 * Help ▸ Legenda EM: the WHOLE language, for someone studying it — every
 * relation with its sample, every node type with its glyph or shape — in a
 * modal with a search over label and datamodel name.
 */
export function showLegendModal(): void {
  document.querySelector(".modal.em-legend")?.remove();
  const modal = document.createElement("div");
  modal.className = "modal em-legend";
  const card = document.createElement("div");
  card.className = "modal-card";
  const head = document.createElement("div");
  head.className = "modal-head";
  head.textContent = t("legend.full");
  const body = document.createElement("div");
  body.className = "modal-body";
  const search = document.createElement("input");
  search.type = "search";
  search.className = "gl-search";
  search.placeholder = t("legend.search");
  body.appendChild(search);

  const rows: { el: HTMLElement; text: string }[] = [];
  const section = (title: string): HTMLElement => {
    const h = document.createElement("div");
    h.className = "gl-sect";
    h.textContent = title;
    body.appendChild(h);
    const grid = document.createElement("div");
    grid.className = "gl-grid";
    body.appendChild(grid);
    return grid;
  };
  const eg = section(t("legend.relations"));
  for (const type of allEdgeTypes()) {
    const row = document.createElement("div");
    row.className = "gl-item";
    row.title = type;
    row.appendChild(edgeSample(type));
    const lab = document.createElement("span");
    lab.className = "gl-label";
    lab.textContent = edgeLabel(type);
    const code = document.createElement("code");
    code.className = "gl-code";
    code.textContent = type;
    row.append(lab, code);
    eg.appendChild(row);
    rows.push({ el: row, text: `${edgeLabel(type)} ${type}`.toLowerCase() });
  }
  const ng = section(t("legend.nodes"));
  for (const e of allNodeEntries()) {
    const row = nodeRow(e);
    const code = document.createElement("code");
    code.className = "gl-code";
    code.textContent = e.kind ?? (e.genre ? `${e.type} · ${e.genre}` : e.type);
    row.appendChild(code);
    ng.appendChild(row);
    rows.push({ el: row, text: `${nodeEntryLabel(e)} ${e.type} ${e.kind ?? ""} ${e.genre ?? ""}`.toLowerCase() });
  }
  const none = document.createElement("div");
  none.className = "gl-empty hidden";
  none.textContent = t("legend.noMatch");
  body.appendChild(none);
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    for (const r of rows) {
      const hit = !q || r.text.includes(q);
      r.el.classList.toggle("hidden", !hit);
      if (hit) shown++;
    }
    none.classList.toggle("hidden", shown > 0);
  });

  const foot = document.createElement("div");
  foot.className = "modal-foot";
  const ok = document.createElement("button");
  ok.className = "primary";
  ok.textContent = t("legend.close");
  const closeModal = (): void => {
    modal.remove();
    document.removeEventListener("keydown", onKey, true);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeModal();
    }
  };
  ok.onclick = closeModal;
  foot.appendChild(ok);
  card.append(head, body, foot);
  modal.appendChild(card);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(modal);
  search.focus();
}
