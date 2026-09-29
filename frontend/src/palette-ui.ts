// Node palette, generated from the EM visual rules + node class registry —
// the palette is data-driven, EMStudio never hardcodes the EM language.
// Icons are the official s3Dgraphy 2D assets (JSON_config/src/2D), inlined
// at build time; types without an official icon fall back to a drawn swatch.
import { nodeStyle } from "./palette";
import {
  dtcAuthoringKinds,
  hdtoAuthoringTypes,
  isGroupType,
  nodeLabel,
  typeDescription,
} from "./rules";

import { dtcGlyphUrl, iconUrlFor } from "./icons";
import { dtcGlyphName } from "./rules";

/**
 * SHIFT-A · the small picture of a type, for the «Aggiungi» menu and any list
 * that names types: a group is its container box, a type with an official 2D
 * icon is that icon, a DTC item its kind's glyph, anything else a drawn swatch.
 */
export function typeIconElement(nodeType: string, kind?: string): HTMLElement {
  if (isGroupType(nodeType)) return groupSwatch(nodeType);
  const url = kind ? dtcGlyphUrl(dtcGlyphName(kind)) : iconUrlFor(nodeType);
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    return img;
  }
  return swatch(nodeType);
}

export interface Section {
  label: string;
  types: string[];
}

/**
 * MIME carried by a palette item being dragged onto the canvas (DND1).
 *
 * A CUSTOM type, not `text/plain`: the window-level file-drop handler and the
 * narrative embed drop both inspect `dataTransfer.types`, and they have to be
 * able to tell "a node type from the palette" from "a file" and from "an
 * existing node id" (`application/x-em-node-id`) without reading the payload —
 * during `dragover` the payload is not readable at all.
 */
export const PALETTE_MIME = "application/x-em-node-type";

/** What a dragged palette item carries — the same triple `onPick` receives. */
export interface PaletteDragPayload {
  nodeType: string;
  kind?: string;
  isResource?: boolean;
}

// Authoring surface, EM 1.5/1.6: stratigraphic units first, then series,
// paradata chain, groups, context/metadata nodes. Exported so the
// drag-to-connect "create node" menu offers the same taxonomy.
export const SECTIONS: Section[] = [
  {
    label: "Stratigraphic",
    // POL5/POL6: the two VOIDS sit side by side on purpose — `USN` is the
    // negative/destructive one (a cut, an erosion surface; displayed `US-`) and
    // `USNt` the neutral one (a risparmio: window, door, niche, room). They were
    // one type until 2026-08-04, and the palette is where the difference has to
    // be visible or nobody will use the right one. Order: the negativa first,
    // because it is the one an excavator reaches for.
    types: ["US", "USVn", "USVs", "USD", "TSU", "USN", "USNt", "SE", "BR"],
  },
  { label: "Special finds", types: ["SF", "VSF", "RSF"] },
  { label: "Series", types: ["serSU", "serUSVn", "serUSVs", "serUSD"] },
  {
    label: "Paradata",
    types: ["property", "extractor", "combiner", "document"],
  },
  {
    label: "Groups",
    types: [
      "ActivityNodeGroup",
      "ParadataNodeGroup",
      "TimeBranchNodeGroup",
      "LocationNodeGroup",
    ],
  },
  {
    // `EpochNode` is deliberately ABSENT (POL1, 2026-08-04). An epoch is a
    // swimlane, not a node you drop somewhere: it is created with the `+` in
    // Matrix view, which also gives it a chronological slot. Offering it here too
    // meant two gestures for one thing — and the palette gesture had to be
    // special-cased into "actually, add a lane at the top", which is not what a
    // palette click looks like it does.
    //
    // This list is the AUTHORING SURFACE, not the datamodel: the datamodel still
    // declares EpochNode (invariant 1), and the app still creates, renders and
    // validates epochs. What changed is only what the palette offers.
    label: "Context",
    types: ["author", "author_ai", "resource", "license", "embargo"],
  },
];

/**
 * Verbose hover card for a palette item (POL3): the human label in bold, the
 * TECHNICAL node_type dimmed beside it, the datamodel description below.
 *
 * Reuses the app's own `#tooltip` element and its `.tt-type` / `.tt-desc`
 * classes — the same card the canvas shows on node hover. A second tooltip
 * styled by hand would drift from it, and `title=` cannot be styled at all
 * (the technical name has to read as secondary, not as part of the sentence).
 *
 * NB @lang: the datamodel's `label`/`description` are single-language today
 * (mostly English, some Italian). Translating them is DP-63 — extend the
 * datamodel with CIDOC-style `@lang` variants, then AI-translate + validate,
 * exactly as the UI strings were. Deliberately NOT done here: putting node
 * labels into `i18n.ts` would create a second source for the EM language
 * (invariant 1) and it would be the wrong one.
 */
function attachHoverCard(
  el: HTMLElement,
  label: string,
  nodeType: string,
  description: string,
): void {
  const tip = document.getElementById("tooltip");
  if (!tip) return;
  const place = (e: MouseEvent): void => {
    tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 380) + "px";
    tip.style.top = e.clientY + 14 + "px";
  };
  el.addEventListener("mouseenter", (e) => {
    tip.innerHTML = `<b></b> <span class="tt-type"></span><br><span class="tt-desc"></span>`;
    (tip.children[0] as HTMLElement).textContent = label;
    // only when it says something the label doesn't: for a type whose label IS
    // the code ("US"), repeating it dimmed underneath is noise
    (tip.children[1] as HTMLElement).textContent =
      label === nodeType ? "" : nodeType;
    (tip.children[3] as HTMLElement).textContent = description;
    place(e);
    tip.classList.remove("hidden");
  });
  el.addEventListener("mousemove", place);
  el.addEventListener("mouseleave", () => tip.classList.add("hidden"));
  // a drag starting here leaves no mouseleave behind → the card would follow the
  // drag around and sit over the canvas the user is dropping onto
  el.addEventListener("dragstart", () => tip.classList.add("hidden"));
}

function swatch(nodeType: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  c.width = 26 * dpr;
  c.height = 16 * dpr;
  c.style.width = "26px";
  c.style.height = "16px";
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const st = nodeStyle(nodeType);
  // tiny generic swatch: rounded rect is fine at this size except for the
  // strongly-shaped types where the real silhouette reads better
  ctx.beginPath();
  switch (st.shape) {
    case "hexagon":
      ctx.moveTo(5, 1);
      ctx.lineTo(21, 1);
      ctx.lineTo(25, 8);
      ctx.lineTo(21, 15);
      ctx.lineTo(5, 15);
      ctx.lineTo(1, 8);
      ctx.closePath();
      break;
    case "octagon":
      ctx.moveTo(5, 1);
      ctx.lineTo(21, 1);
      ctx.lineTo(25, 5);
      ctx.lineTo(25, 11);
      ctx.lineTo(21, 15);
      ctx.lineTo(5, 15);
      ctx.lineTo(1, 11);
      ctx.lineTo(1, 5);
      ctx.closePath();
      break;
    case "ellipse":
    case "circle":
      ctx.ellipse(13, 8, 12, 7, 0, 0, Math.PI * 2);
      break;
    case "diamond":
      ctx.moveTo(13, 1);
      ctx.lineTo(25, 8);
      ctx.lineTo(13, 15);
      ctx.lineTo(1, 8);
      ctx.closePath();
      break;
    case "parallelogram":
      ctx.moveTo(5, 1);
      ctx.lineTo(25, 1);
      ctx.lineTo(21, 15);
      ctx.lineTo(1, 15);
      ctx.closePath();
      break;
    case "triangle":
      ctx.moveTo(13, 1);
      ctx.lineTo(25, 15);
      ctx.lineTo(1, 15);
      ctx.closePath();
      break;
    case "corner_brackets": {
      // POL4 · four L ticks, no continuous edge; unclosed on purpose so the fill
      // below paints nothing (a filled corner would invent the surface a
      // negative unit does not have)
      const t = 4.5;
      ctx.moveTo(1, 1 + t); ctx.lineTo(1, 1); ctx.lineTo(1 + t, 1);
      ctx.moveTo(25 - t, 1); ctx.lineTo(25, 1); ctx.lineTo(25, 1 + t);
      ctx.moveTo(25, 15 - t); ctx.lineTo(25, 15); ctx.lineTo(25 - t, 15);
      ctx.moveTo(1 + t, 15); ctx.lineTo(1, 15); ctx.lineTo(1, 15 - t);
      break;
    }
    default:
      ctx.roundRect(1, 1, 24, 14, 3);
  }
  ctx.fillStyle = st.fill;
  ctx.fill();
  ctx.strokeStyle = st.border;
  // border weight tracks the visual-rules border_width (data-driven) so the
  // thick EM frame reads in the swatch too, clamped to this tiny 26×16 canvas.
  ctx.lineWidth = Math.min(2.4, Math.max(1.4, st.borderWidth * 0.6));
  if (st.borderStyle === "dashed") ctx.setLineDash([3, 2]);
  else if (st.borderStyle === "dotted") ctx.setLineDash([1.5, 1.5]);
  ctx.stroke();
  return c;
}

// NodeGroups (Activity/Paradata/TimeBranch/Location) are CONTAINERS, not
// node shapes — the generic swatch drew them as anonymous rectangles. Draw
// them as the canonical EM/yEd group box: a dashed coloured container with a
// title tab in the top-left corner. Colours come straight from the visual
// rules (never hardcoded): Activity=purple, Paradata/TimeBranch=grey,
// Location=black/light.
function groupSwatch(nodeType: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  c.width = 26 * dpr;
  c.height = 16 * dpr;
  c.style.width = "26px";
  c.style.height = "16px";
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const st = nodeStyle(nodeType);
  const x = 1.5,
    y = 2.5,
    w = 23,
    h = 12,
    r = 2.5;
  // container body
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = st.fill;
  ctx.fill();
  ctx.strokeStyle = st.border;
  ctx.lineWidth = 1.4;
  ctx.setLineDash(st.borderStyle === "dotted" ? [1.5, 1.5] : [3, 2]);
  ctx.stroke();
  // title tab → the canonical group colour (em_visual_rules label_background:
  // Activity cyan, Paradata peach, TimeBranch green, Location light-grey);
  // falls back to the border colour if a group has no tab colour.
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.roundRect(x, y, 13, 4.5, [r, r, 0, 0]);
  ctx.fillStyle = st.labelBackground ?? st.border;
  ctx.fill();
  // thin outline on the tab so pale tabs stay visible on the white body
  ctx.lineWidth = 0.8;
  ctx.setLineDash([]);
  ctx.strokeStyle = st.border;
  ctx.stroke();
  return c;
}

/**
 * WIN3 · the left panel is PER-MODE. In the DTC projection the stratigraphic
 * types are the wrong offer — what you place there are the DTC chunks — so the
 * palette mounts the DTC layer alone, open. Everywhere else it mounts the full
 * authoring surface. Drag & drop (DND1) is untouched: the filter only hides
 * buttons, it never builds a second kind of item.
 */
export interface PaletteOptions {
  /** the canvas projection the palette is being built for */
  mode?: string;
}

export function buildPalette(
  root: HTMLElement,
  onPick: (nodeType: string, kind?: string, isResource?: boolean) => void,
  paletteOpts: PaletteOptions = {},
): { setActive: (activeKey: string | null) => void } {
  root.innerHTML = "";
  const dtcOnly = paletteOpts.mode === "dtc";
  // keyed by a display key: node_type for plain items, `${nodeType}:${kind}` for
  // the DTC by-kind items (so several DTC items share a node_type without colliding).
  const buttons = new Map<string, HTMLButtonElement>();
  // WIN3 · every item registers its searchable text here, so the filter box is a
  // single pass over what was actually mounted (no second source of truth for
  // "what is in the palette").
  const searchable: { btn: HTMLButtonElement; text: string }[] = [];

  const makeItem = (
    t: string,
    parent: HTMLElement,
    opts?: {
      display?: string;
      iconUrl?: string | null;
      onClick?: () => void;
      key?: string;
      kind?: string;
      isResource?: boolean;
    },
  ): void => {
    const b = document.createElement("button");
    b.className = "pal-item";
    // The human label from the datamodel, never the raw node_type (POL3): the
    // palette is the authoring surface of the EM language, so it must say what
    // the language says. `nodeLabel` falls back to the node_type when a class
    // declares no label, so an unlabelled type still reads as itself.
    const display = opts?.display ?? nodeLabel(t);
    const description = typeDescription(t);
    attachHoverCard(b, display, t, description);
    // name AND type: an archaeologist searches "USV", a developer "virtual"
    searchable.push({ btn: b, text: `${display} ${t} ${opts?.kind ?? ""}`.toLowerCase() });
    // Drag ALONGSIDE the click (DND1): a `<button>` is not draggable by
    // default, which is the whole reason no `dragstart` ever fired here. The
    // click-to-arm → click-the-canvas gesture is untouched; both instantiate.
    b.draggable = true;
    b.addEventListener("dragstart", (e) => {
      const payload: PaletteDragPayload = {
        nodeType: t,
        kind: opts?.kind,
        isResource: opts?.isResource,
      };
      e.dataTransfer?.setData(PALETTE_MIME, JSON.stringify(payload));
      // text/plain so dragging into a text field degrades to the label instead
      // of nothing; the canvas never reads it.
      e.dataTransfer?.setData("text/plain", display);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
    });
    const iconUrl = opts?.iconUrl !== undefined ? opts.iconUrl : iconUrlFor(t);
    if (isGroupType(t)) {
      // groups render as canonical coloured container boxes, not swatches
      b.appendChild(groupSwatch(t));
    } else if (iconUrl) {
      const img = document.createElement("img");
      img.src = iconUrl;
      img.className = "pal-icon";
      img.alt = t;
      b.appendChild(img);
    } else {
      b.appendChild(swatch(t));
    }
    const span = document.createElement("span");
    span.textContent = display;
    b.appendChild(span);
    b.addEventListener("click", opts?.onClick ?? (() => onPick(t)));
    parent.appendChild(b);
    buttons.set(opts?.key ?? t, b);
  };

  /**
   * A collapsible section. ONE mechanism for all of them (POL1).
   *
   * Before, only HDT-O and DTC collapsed and the six stratigraphic sections were
   * plain headings — so the palette taught two different things about what a
   * heading is. `startOpen` is the only difference that remains: the stratigraphic
   * surface is what the tool is for and opens expanded, the advanced layers stay
   * folded until asked for.
   *
   * The open/closed state is per session and not persisted: a palette that
   * remembered being collapsed would greet a returning user with an empty-looking
   * sidebar and no clue why.
   */
  const collapsibleSection = (
    label: string,
    title: string,
    fill: (wrap: HTMLElement) => void,
    startOpen: boolean,
  ): void => {
    const toggle = document.createElement("button");
    toggle.className = "pal-sect pal-sect-toggle";
    const wrap = document.createElement("div");
    wrap.className = "pal-sect-wrap";
    let open = startOpen;
    const paint = (): void => {
      toggle.textContent = `${open ? "▾" : "▸"} ${label}`;
      wrap.style.display = open ? "" : "none";
      toggle.setAttribute("aria-expanded", String(open));
    };
    if (title) toggle.title = title;
    toggle.addEventListener("click", () => {
      open = !open;
      paint();
    });
    root.appendChild(toggle);
    root.appendChild(wrap);
    fill(wrap);
    paint();
  };

  // ── WIN3 · filter / search, above everything it filters ────────────────────
  const filterBox = document.createElement("input");
  filterBox.type = "search";
  filterBox.className = "pal-filter";
  filterBox.placeholder = "Filtra i tipi…";
  filterBox.title =
    "Filtra le voci del pannello per nome o tipo. Le voci filtrate restano " +
    "trascinabili sul canvas.";
  root.appendChild(filterBox);
  const applyFilter = (): void => {
    const q = filterBox.value.trim().toLowerCase();
    for (const { btn, text } of searchable)
      btn.classList.toggle("pal-hidden", !!q && !text.includes(q));
    // a section whose every item is filtered out is noise → hide the section,
    // and open the ones that still have a match so the hit is visible without
    // a second click.
    for (const sect of root.querySelectorAll<HTMLElement>(".pal-sect-wrap")) {
      const shown = [...sect.querySelectorAll(".pal-item")].filter(
        (b) => !b.classList.contains("pal-hidden"),
      ).length;
      const toggle = sect.previousElementSibling as HTMLButtonElement | null;
      const empty = q !== "" && shown === 0;
      sect.classList.toggle("pal-hidden", empty);
      toggle?.classList.toggle("pal-hidden", empty);
      // open a folded section that has a match, through its OWN toggle — the
      // open/closed state lives in the closure, and a second copy of it here is
      // how a panel starts lying about what it shows.
      if (q && shown > 0 && toggle?.getAttribute("aria-expanded") === "false")
        toggle.click();
    }
  };
  filterBox.addEventListener("input", applyFilter);

  if (!dtcOnly)
    for (const section of SECTIONS) {
      collapsibleSection(
        section.label,
        "",
        (wrap) => {
          for (const t of section.types) makeItem(t, wrap);
        },
        true,
      );
    }

  // The gated advanced layers use the same mechanism, folded by default.
  const gatedSection = (
    label: string,
    title: string,
    fill: (wrap: HTMLElement) => void,
  ): void => collapsibleSection(label, title, fill, false);

  // Gated HDT-O authoring layer (ECHOES D7.1). Types from the datamodel's
  // `hdto_nodes` section; items show the human label.
  const hdtoTypes = dtcOnly ? [] : hdtoAuthoringTypes();
  if (hdtoTypes.length)
    gatedSection(
      "HDT-O (advanced)",
      "Heritage Digital Twin authoring (ECHOES D7.1) — gated; the stratigraphic palette is unaffected.",
      (wrap) => {
        for (const t of hdtoTypes) makeItem(t, wrap, { display: nodeLabel(t) });
      },
    );

  // Gated DTC authoring layer (ECHOES). One item per (input/process/output) ×
  // specific kind, read data-driven from `dtc_kinds`; each shows its label + the
  // per-kind glyph. Creating a node sets node.data.dtc_kind (via onPick's 2nd arg).
  const dtcKinds = dtcAuthoringKinds();
  if (dtcKinds.length)
    (dtcOnly
      ? (label: string, title: string, fill: (wrap: HTMLElement) => void): void =>
          collapsibleSection(label, title, fill, true)
      : gatedSection)(
      dtcOnly ? "DTC" : "DTC (advanced)",
      "Digital Twin Chain authoring (ECHOES) — provenance that produces documents; gated, the stratigraphic palette is unaffected.",
      (wrap) => {
        for (const d of dtcKinds)
          makeItem(d.nodeType, wrap, {
            display: d.label,
            iconUrl: dtcGlyphUrl(d.glyph),
            onClick: () => onPick(d.nodeType, d.kind, d.isResource),
            key: `${d.nodeType}:${d.kind}`,
            // the drag has to carry the kind too, or a dragged DTC item would
            // land as a bare chunk without its glyph/P2_has_type
            kind: d.kind,
            isResource: d.isResource,
          });
      },
    );

  return {
    setActive(activeKey: string | null): void {
      for (const [k, b] of buttons)
        b.classList.toggle("active", k === activeKey);
    },
  };
}
