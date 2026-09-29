// Node list view (outliner): the node groups on top — with inline
// fold/unfold and explode (isolate) controls — then the filterable table of
// every node (name / type / description); click selects and centres.
import { nodeStyle } from "./palette";
import { isGroupType, isStratigraphicType } from "./rules";
import type { EmDocument, EmNode } from "./types";
import { liveNodes } from "./crdt";
import { buildOutline, epochSpan, type OutlineUnit } from "./outline";
import { t } from "./i18n";
import { glyphFor, glyphSvg } from "./glyphs";
import { activeTheme, canvasTheme } from "./theme";

/** SHIFT-A fase 6b · a row's mark: the node's GLYPH, inline, when the datamodel
 *  draws it from paths (extractor, combiner, the ornaments, the DTC kinds) —
 *  the same paths as the canvas — else the coloured dot of its style. */
function rowMark(n: EmNode): HTMLElement {
  const g = glyphFor(n.node_type, n.data as Record<string, unknown> | undefined);
  const el = document.createElement("span");
  if (g) {
    const th = canvasTheme();
    el.className = "nl-dot nl-glyph glyph-inline";
    el.innerHTML = glyphSvg(g, { ink: th.labelInk, paper: th.canvasBg, dark: activeTheme() === "dark" });
    return el;
  }
  const st = nodeStyle(n.node_type);
  el.className = "nl-dot";
  el.style.background = st.fill;
  el.style.borderColor = st.border;
  return el;
}

export interface NodeListApi {
  refresh: () => void;
  setSelected: (id: string | null) => void;
}

export interface NodeListCallbacks {
  isFolded: (id: string) => boolean;
  onToggleFold: (id: string) => void;
  onExplode: (id: string) => void;
  /** fold/unfold the given group ids in one undo step (used per nodegroup type) */
  onFoldGroups: (ids: string[], folded: boolean) => void;
  /** true when the node physically contains others (is_part_of members) */
  isContainer: (id: string) => boolean;
  /** STUDIO · the WARNINGS on a node (not the hints): a row carries a discreet
   *  ▲ when there are any, and its tooltip says what they are. Absent = none. */
  warningsOf?: (id: string) => string[];
}

export function buildNodeList(
  root: HTMLElement,
  getDoc: () => EmDocument | null,
  onPick: (id: string) => void,
  groupCb: NodeListCallbacks,
): NodeListApi {
  root.innerHTML = "";
  const filter = document.createElement("input");
  filter.type = "search";
  filter.placeholder = t("outliner.search");
  filter.setAttribute("aria-label", t("outliner.search"));
  filter.className = "nl-filter";
  root.appendChild(filter);
  const count = document.createElement("div");
  count.className = "nl-count";
  root.appendChild(count);
  const listEl = document.createElement("div");
  listEl.className = "nl-rows";
  root.appendChild(listEl);

  let selected: string | null = null;
  const rows = new Map<string, HTMLElement>();

  // ---- section disclosure (OUT1) -------------------------------------------
  // A LIST affordance, and nothing more: it shows/hides the rows of one section
  // of the outliner. It is NOT the fold/explode of a nodegroup (`onFoldGroups`,
  // `onToggleFold`, `onExplode`), which act on the GRAPH — those keep their own
  // glyphs inside the rows, and a click on them must not travel up to the header
  // (each stops its propagation below).
  const COLLAPSE_KEY = "emstudio.outliner.collapsed";
  const collapsed = new Set<string>(
    (() => {
      try {
        const raw = localStorage.getItem(COLLAPSE_KEY);
        // STUDIO · on a first run the list opens on the EPOCHS: the groups and
        // the flat list of every node are there, one click away, folded
        if (raw == null) return ["groups", "nodes"];
        return Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    })() as string[],
  );
  const persist = (): void => {
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed]));
    } catch {
      /* private mode / quota — the state simply does not survive the session */
    }
  };

  /**
   * Build a section header and return the container its rows go into.
   *
   * Toggling hides the BODY in place — it does not rebuild the list. That keeps
   * two promises: the filter above is untouched (a collapsed section stays
   * collapsed while you type, and expanding it shows the filtered rows), and
   * nothing under the pointer reflows during the gesture, since the click acts
   * on a body BELOW the header it was aimed at.
   */
  const section = (
    key: string,
    label: string,
    cls: string,
  ): { head: HTMLElement; body: HTMLElement; label: HTMLElement } => {
    const head = document.createElement("div");
    head.className = cls;
    const disc = document.createElement("button");
    disc.className = "nl-disc";
    const lbl = document.createElement("span");
    lbl.textContent = label;
    const body = document.createElement("div");
    body.className = "nl-sect-body";
    const apply = (): void => {
      const off = collapsed.has(key);
      disc.textContent = off ? "▸" : "▾";
      disc.title = off ? "Expand this section" : "Collapse this section";
      disc.setAttribute("aria-expanded", off ? "false" : "true");
      body.classList.toggle("hidden", off);
    };
    const toggle = (ev: Event): void => {
      ev.stopPropagation();
      if (collapsed.has(key)) collapsed.delete(key);
      else collapsed.add(key);
      persist();
      apply();
    };
    disc.addEventListener("click", toggle);
    // the whole heading is the target (a 10px triangle is a poor one), but only
    // where it is not one of the group controls sitting in the same row
    head.addEventListener("click", toggle);
    head.appendChild(disc);
    head.appendChild(lbl);
    apply();
    return { head, body, label: lbl };
  };

  const rebuild = (): void => {
    listEl.innerHTML = "";
    rows.clear();
    const doc = getDoc();
    if (!doc) {
      count.textContent = "";
      // AUDIT N6 · an empty Outliner says so
      const p = document.createElement("p");
      p.className = "win-empty nl-empty";
      p.textContent = t("empty.outliner");
      listEl.appendChild(p);
      return;
    }
    const q = filter.value.trim().toLowerCase();
    const match = (s: unknown): boolean =>
      String(s ?? "")
        .toLowerCase()
        .includes(q);
    const matches = (n: (typeof doc.graph.nodes)[number]): boolean =>
      !q || match(n.name) || match(n.id) || match(n.node_type) || match(n.description);

    // ---- STUDIO · the units BY EPOCH (newest on top), containers indented ----
    //
    // The desk's outliner (`drawUnits`): an epoch heading with its span in mono
    // on the right, the units born in it beneath, and what a container holds
    // indented under the container. The shape is `outline.ts`'s; this draws it.
    const outline = buildOutline(doc, liveNodes(doc.graph as never) as unknown as EmNode[],
                                 isStratigraphicType, q ? matches : undefined);
    const unitRow = (u: OutlineUnit): HTMLElement => {
      const n = u.node;
      const row = document.createElement("button");
      row.className = "nl-row nl-unit" + (n.id === selected ? " selected" : "");
      row.style.paddingLeft = `${14 + u.depth * 16}px`;
      row.appendChild(rowMark(n));
      const name = document.createElement("b");
      name.className = "nl-uname";
      name.textContent = String(n.name || n.id);
      row.appendChild(name);
      const desc = document.createElement("span");
      desc.className = "nl-udesc";
      desc.textContent = String(n.description ?? "");
      row.appendChild(desc);
      const warns = groupCb.warningsOf?.(n.id) ?? [];
      if (warns.length) {
        const mark = document.createElement("span");
        mark.className = "nl-wmark";
        mark.textContent = "▲";
        mark.title = warns.join("\n");
        mark.setAttribute("aria-label", t("issues.section", { n: String(warns.length) }));
        row.appendChild(mark);
      }
      row.title = `${n.id} [${n.node_type}]`;
      row.addEventListener("click", () => onPick(n.id));
      row.draggable = true;
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData("application/x-em-node-id", n.id);
        e.dataTransfer?.setData("text/plain", String(n.name || n.id));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
      });
      // the FIRST row of a node wins the selection highlight: a unit appears
      // once here and once more in the flat list below
      if (!rows.has(n.id)) rows.set(n.id, row);
      return row;
    };
    for (const ep of outline.epochs) {
      const sec = section(`epoch:${ep.node.id}`, String(ep.node.name || ep.node.id),
                          "nl-sect nl-epoch" + (ep.depth ? " nl-subepoch" : ""));
      sec.head.style.paddingLeft = `${6 + ep.depth * 14}px`;
      const span = document.createElement("span");
      span.className = "nl-span";
      span.textContent = epochSpan(ep.node);
      sec.head.appendChild(span);
      sec.label.addEventListener("click", (ev) => {
        // the NAME of an epoch is a node you can select; the triangle and the
        // rest of the heading fold the section
        ev.stopPropagation();
        onPick(ep.node.id);
      });
      sec.label.classList.add("nl-epoch-name");
      listEl.appendChild(sec.head);
      listEl.appendChild(sec.body);
      for (const u of ep.units) sec.body.appendChild(unitRow(u));
    }
    if (outline.unplaced.length) {
      const sec = section("epoch:none", t("outliner.noEpoch"), "nl-sect nl-epoch");
      listEl.appendChild(sec.head);
      listEl.appendChild(sec.body);
      for (const u of outline.unplaced) sec.body.appendChild(unitRow(u));
    }

    // ---- groups section (fold / explode inline) ----
    // node groups by type PLUS stratigraphic containers (is_part_of members)
    // P4.5 · the same live view the canvas draws: a tombstoned node is gone
    // from every surface, and still in the document for the merge
    const visible = liveNodes(doc.graph as never) as unknown as typeof doc.graph.nodes;
    const groups = visible
      .filter(
        (n) =>
          (isGroupType(n.node_type) || groupCb.isContainer(n.id)) && matches(n),
      )
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
    if (groups.length) {
      // bucket by node_type so fold/unfold-all acts on each nodegroup TYPE in
      // unison (was paradata-only). Containers (is_part_of) bucket by their
      // stratigraphic type. Friendly label: drop the "NodeGroup" suffix.
      const label = (t: string): string =>
        t.endsWith("NodeGroup") ? t.slice(0, -"NodeGroup".length) : t;
      const buckets = new Map<string, typeof groups>();
      for (const g of groups) {
        const arr = buckets.get(g.node_type) ?? [];
        arr.push(g);
        buckets.set(g.node_type, arr);
      }
      const top = section(
        "groups",
        t("outliner.groups", { n: String(groups.length) }),
        "nl-sect nl-sect-groups",
      );
      listEl.appendChild(top.head);
      listEl.appendChild(top.body);
      for (const [type, gs] of [...buckets.entries()].sort()) {
        const ids = gs.map((g) => g.id);
        const sec = section(
          `type:${type}`,
          `${label(type)} (${gs.length})`,
          "nl-sect nl-gtype",
        );
        const th = sec.head;
        const foldAll = document.createElement("button");
        foldAll.className = "nl-icon";
        foldAll.textContent = "⊟";
        foldAll.title = `Fold all ${label(type)} groups`;
        // GRAPH verb inside a LIST heading: stop it here, or folding the groups
        // in the scene would also collapse the section you were looking at.
        foldAll.addEventListener("click", (ev) => {
          ev.stopPropagation();
          groupCb.onFoldGroups(ids, true);
        });
        th.appendChild(foldAll);
        const unfoldAll = document.createElement("button");
        unfoldAll.className = "nl-icon";
        unfoldAll.textContent = "⊞";
        unfoldAll.title = `Unfold all ${label(type)} groups`;
        unfoldAll.addEventListener("click", (ev) => {
          ev.stopPropagation();
          groupCb.onFoldGroups(ids, false);
        });
        th.appendChild(unfoldAll);
        top.body.appendChild(th);
        top.body.appendChild(sec.body);
        for (const g of gs) {
          const row = document.createElement("div");
          row.className = "nl-grow";
          const fold = document.createElement("button");
          fold.className = "nl-icon";
          const folded = groupCb.isFolded(g.id);
          fold.textContent = folded ? "▸" : "▾";
          fold.title = folded ? "Unfold group" : "Fold group";
          fold.addEventListener("click", (ev) => {
            ev.stopPropagation();
            groupCb.onToggleFold(g.id);
          });
          row.appendChild(fold);
          const name = document.createElement("button");
          name.className = "nl-gname";
          name.textContent = String(g.name || g.id);
          name.title = `${g.id} [${g.node_type}]`;
          name.addEventListener("click", () => onPick(g.id));
          row.appendChild(name);
          const explode = document.createElement("button");
          explode.className = "nl-icon";
          explode.textContent = "⤢";
          explode.title = "Explode: isolate the group contents";
          explode.addEventListener("click", (ev) => {
            ev.stopPropagation();
            groupCb.onExplode(g.id);
          });
          row.appendChild(explode);
          sec.body.appendChild(row);
          if (!rows.has(g.id)) rows.set(g.id, row);
        }
      }
    }

    const nodes = visible
      .filter((n) => !isGroupType(n.node_type) && matches(n))
      .sort((a, b) =>
        String(a.name || a.id).localeCompare(String(b.name || b.id)),
      );
    count.textContent = `${nodes.length + groups.length} / ${visible.length} nodes`;
    // The Nodes heading is now ALWAYS there, where before it only appeared when
    // there were groups above it: a collapsed section whose heading disappears
    // takes its rows out of reach, and the way back would be gone with it.
    const nodesSec = section("nodes", t("outliner.allNodes", { n: String(nodes.length) }), "nl-sect");
    listEl.appendChild(nodesSec.head);
    listEl.appendChild(nodesSec.body);
    for (const n of nodes) {
      const row = document.createElement("button");
      row.className = "nl-row" + (n.id === selected ? " selected" : "");
      row.appendChild(rowMark(n));
      const body = document.createElement("span");
      body.className = "nl-body";
      const name = document.createElement("b");
      name.textContent = String(n.name || n.id);
      const type = document.createElement("small");
      type.textContent = ` ${n.node_type}`;
      const desc = document.createElement("span");
      desc.className = "nl-desc";
      desc.textContent = String(n.description ?? "");
      body.appendChild(name);
      body.appendChild(type);
      body.appendChild(document.createElement("br"));
      body.appendChild(desc);
      row.appendChild(body);
      row.addEventListener("click", () => onPick(n.id));
      // Drag-to-embed (N3): a row is the handle for dropping this node into a
      // narrative chapter. The canvas cannot be the drag source — the narrative
      // view is an overlay OVER it, so the two never share the screen — and
      // this list is the graph's other face, always visible beside the story.
      row.draggable = true;
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData("application/x-em-node-id", n.id);
        e.dataTransfer?.setData("text/plain", String(n.name || n.id));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
      });
      nodesSec.body.appendChild(row);
      if (!rows.has(n.id)) rows.set(n.id, row);
    }
  };

  filter.addEventListener("input", rebuild);

  return {
    refresh: rebuild,
    setSelected(id: string | null): void {
      if (selected && rows.get(selected)) rows.get(selected)!.classList.remove("selected");
      selected = id;
      const row = id ? rows.get(id) : null;
      if (row) {
        row.classList.add("selected");
        // OUT1 · a selection arriving from the canvas must be VISIBLE: if its
        // section is collapsed, open it through the header's own button so the
        // triangle and the stored state stay in step (scrolling to a hidden row
        // would silently do nothing).
        const hiddenBody = row.closest(".nl-sect-body.hidden");
        if (hiddenBody)
          (hiddenBody.previousElementSibling?.querySelector(
            ".nl-disc",
          ) as HTMLButtonElement | null)?.click();
        row.scrollIntoView({ block: "nearest" });
      }
    },
  };
}
