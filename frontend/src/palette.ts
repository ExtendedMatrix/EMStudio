// Palette driven by s3Dgraphy's em_visual_rules.json — EMStudio never
// hardcodes the EM language (ARCHITECTURE.md §6). The asset is a verbatim
// copy of s3dgraphy/JSON_config/em_visual_rules.json; refresh it when the
// datamodel bumps.
import rules from "./assets/em_visual_rules.json";
import { canvasTheme } from "./theme";

export interface NodeStyle {
  shape: string;
  fill: string;
  border: string;
  borderStyle: "solid" | "dashed" | "dotted";
  /** stroke width (px, world units) — thick coloured frame like the EM icons */
  borderWidth: number;
  /** group title-tab / header colour (em_visual_rules `label_background`);
   *  undefined for non-group nodes */
  labelBackground?: string;
  textColor: string;
  /** label placement from the visual rules: "over" | "top_left" | "center" */
  labelPosition: string;
  /**
   * Fraction of the node box the SHAPE fills (`shape_scale`, POL4). 1 = the whole
   * box, which is what every type but BR wants.
   *
   * A drawing-only shrink: the box itself still comes from em-core, so a scaled
   * shape is smaller than its own hit area. That is why this is a fraction in the
   * visual rules and not a size — a size would be a claim about layout, and layout
   * is the engine's (invariant 7).
   */
  shapeScale: number;
  /**
   * `"square"` when the shape's bounding box must be square — the drawing takes
   * `min(w, h)` on both axes (POL5, BR).
   *
   * Without it a `diamond` in a 90×32 box is a flattened lozenge, not a rhombus;
   * BR's silhouette is the language's continuity marker and it has to stay
   * equilateral. In the rules and not in a renderer for the usual reason: it is a
   * fact about how the EM language looks.
   */
  shapeBox?: "square";
}

export interface EdgeStyle {
  color: string;
  dash: number[];
  width: number;
  label: string;
}

interface RawNodeStyle {
  label_position?: string;
  style?: {
    fill_color?: string;
    border_color?: string;
    border_style?: string;
    border_width?: number;
    shape?: string;
    shape_scale?: number;
    shape_bbox?: string;
    label_background?: string;
  };
}

interface RawEdgeStyle {
  style?: { color?: string; line_style?: string; width?: number };
  label?: string;
}

// runtime node_type → visual-rules key (short names). Stratigraphic types
// (US, USVn, serSU…) match 1:1 and need no alias.
const NODE_ALIAS: Record<string, string> = {
  property: "PROP",
  combiner: "COMB",
  extractor: "EXT",
  document: "DOC",
  EpochNode: "EP",
  epoch: "EP",
  // group containers resolve to their own runtime-name keys (em_visual_rules
  // now carries canonical grey-box + coloured title-tab styles for each);
  // the legacy ANG/GRAPH aliases stay only for other consumers.
  author: "AUTH",
  author_ai: "AUTH_AI",
  link: "LINK",
  geo_position: "GEO",
  semantic_shape: "SS",
  representation_model: "RM",
  representation_model_doc: "RMDoc",
  representation_model_sf: "RMSF",
  license: "LIC",
  embargo: "EMB",
  narrative: "NARR",
  graph: "GRAPH",
};

const LINE_DASH: Record<string, number[]> = {
  solid: [],
  dashed: [7, 4],
  dotted: [2, 3],
  "dashed-dotted": [8, 3, 2, 3],
};

const nodeStyles = (rules as { node_styles: Record<string, RawNodeStyle> })
  .node_styles;
const edgeStyles = (rules as { edge_style: Record<string, RawEdgeStyle> })
  .edge_style;

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length < 6) return 1;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const nodeCache = new Map<string, NodeStyle>();

/** LEGENDA · every node type the visual rules style, as a node_type: a rules
 *  key reached through `NODE_ALIAS` is given by its FIRST alias (`PROP` →
 *  `property`), the others are node_types already. `unknown` is not a type. */
export function styledNodeTypes(): string[] {
  const back = new Map<string, string>();
  for (const [nt, key] of Object.entries(NODE_ALIAS)) if (!back.has(key)) back.set(key, nt);
  return Object.keys(nodeStyles).filter((k) => k !== "unknown").map((k) => back.get(k) ?? k);
}

/** LEGENDA · every edge type the visual rules give an `edge_style`. */
export function styledEdgeTypes(): string[] {
  return Object.keys(edgeStyles ?? {});
}

export function nodeStyle(nodeType?: string): NodeStyle {
  const key = nodeType ?? "unknown";
  const hit = nodeCache.get(key);
  if (hit) return hit;
  const rulesKey = NODE_ALIAS[key] ?? key;
  const raw = nodeStyles[rulesKey] ?? nodeStyles["unknown"];
  const s = raw?.style ?? {};
  const fill = s.fill_color ?? "#FFFFFF";
  const style: NodeStyle = {
    shape: s.shape ?? "rectangle",
    fill,
    border: s.border_color ?? "#333333",
    borderStyle: (s.border_style as NodeStyle["borderStyle"]) ?? "solid",
    // thick coloured frame like the historical EM icons; from the visual
    // rules when present, else a bold default ("tanto per iniziare").
    borderWidth: s.border_width ?? 2.6,
    labelBackground: s.label_background,
    textColor: luminance(fill) > 0.45 ? "#1a1a1a" : "#f5f5f5",
    labelPosition: raw?.label_position ?? "over",
    shapeScale: s.shape_scale ?? 1,
    shapeBox: s.shape_bbox === "square" ? "square" : undefined,
  };
  nodeCache.set(key, style);
  return style;
}

// Edge types missing from the datamodel get quiet structural defaults;
// is_after is the stratigraphic sequence and stays prominent.
const EDGE_FALLBACK: Record<string, EdgeStyle> = {
  is_after: { color: "#2b2b2b", dash: [], width: 1.6, label: "Is After" },
  is_in_paradata_nodegroup: {
    color: "#c9a86a",
    dash: [3, 3],
    width: 1,
    label: "In Paradata Group",
  },
  has_paradata_nodegroup: {
    color: "#c9a86a",
    dash: [3, 3],
    width: 1,
    label: "Has Paradata Group",
  },
  is_part_of: { color: "#9aa7b5", dash: [5, 3], width: 1, label: "Part Of" },
  extracted_from: {
    color: "#5a7fb5",
    dash: [4, 3],
    width: 1,
    label: "Extracted From",
  },
  combines: { color: "#b5975a", dash: [4, 3], width: 1, label: "Combines" },
  has_property: {
    color: "#7a7a7a",
    dash: [4, 3],
    width: 1,
    label: "Has Property",
  },
  has_linked_resource: {
    color: "#cc7832",
    dash: [2, 3],
    width: 1,
    label: "Linked Resource",
  },
};

const edgeCache = new Map<string, EdgeStyle>();

export function edgeStyle(edgeType?: string): EdgeStyle {
  const key = edgeType ?? "generic";
  const hit = edgeCache.get(key);
  if (hit) return hit;
  const raw = edgeStyles?.[key];
  let style: EdgeStyle;
  if (raw?.style) {
    style = {
      color: raw.style.color ?? "#888888",
      dash: LINE_DASH[raw.style.line_style ?? "solid"] ?? [],
      width: (raw.style.width ?? 1.5) * 0.75,
      label: raw.label ?? key,
    };
  } else {
    style =
      EDGE_FALLBACK[key] ?? {
        color: "#999999",
        dash: [4, 3],
        width: 1,
        label: key,
      };
  }
  edgeCache.set(key, style);
  return style;
}

/**
 * CONN-NIGHT · the CONNECTOR INK for an edge type, from the active theme.
 *
 * Colour is themed (dark ink in light, light ink in dark — like `labelOn`), the
 * dash PATTERN stays per edge-type in {@link edgeStyle} (geometry, not colour).
 * One family map, here: the provenance family (data-provenance / property /
 * extraction / documentation) is ochre; everything else — the generic
 * connector, `is_after`, and every other type with its own dash — is the
 * continuous ink. Renderers read THIS, not the literal hex in `edgeStyle`.
 */
const PROVENANCE_EDGES = new Set([
  "has_data_provenance",
  "has_property",
  "extracted_from",
  "has_documentation",
  // BUGS-UI · a node's link to its paradata group is the same statement as
  // `has_property` one level up ("this is what I know about this node, and how
  // I know it"), so it carries the provenance ink rather than reading as a
  // structural connector.
  "has_paradata_nodegroup",
]);

export function edgeInk(edgeType?: string): string {
  const t = canvasTheme();
  return PROVENANCE_EDGES.has(edgeType ?? "") ? t.edgeProvenance : t.edgeInk;
}

/**
 * EM 1.6 document variants — the `geometry` axis (Q-C).
 *
 * Two independent things are drawn on a document's border, and conflating them
 * is what made this wrong before:
 *
 *   WIDTH  = the canonical / use-instance role. Thick (>= 3.0) is the document
 *            drawn at its own moment of creation; thin is a repetition of it
 *            somewhere in the argument.
 *   COLOUR = the geometry category — the metric authority of the placement of
 *            its RM: reality_based / observable / asserted / symbolic, plus
 *            `em_based` aside as a provenance statement.
 *
 * A canonical document with no geometry gets `canonical_unknown` (thick BLACK:
 * classified as canonical, NOT yet classified on the axis). A document with no
 * RM at all — a PDF article, a bibliography — simply has no geometry, and there
 * is nothing to colour: it falls to `default`.
 *
 * Every colour and width comes from `em_visual_rules.document_variant_styles`;
 * nothing here is hardcoded, so adding a rung upstream needs no code change.
 */
const VARIANT_LEGACY: Record<string, string> = {
  // pre-1.6 `certainty_class` spellings, still read off older documents
  direct: "reality_based",
  reconstructed: "observable",
  hypothetical: "asserted",
};

const CANONICAL_UNKNOWN = "canonical_unknown";
const VARIANT_DEFAULT = "default";

function variantStyles(): Record<
  string,
  { border_color?: string; border_width?: number }
> {
  return (
    (
      rules as unknown as {
        document_variant_styles?: Record<
          string,
          { border_color?: string; border_width?: number }
        >;
      }
    ).document_variant_styles ?? {}
  );
}

/** The style-lookup key for a document — the TS mirror of s3Dgraphy's
 *  `DocumentNode.variant_style_key()`. Geometry wins; a canonical document
 *  without one is `canonical_unknown`; anything else is `default`. */
export function documentVariantKey(
  data: Record<string, unknown> | undefined,
  isCanonical: boolean,
): string {
  const styles = variantStyles();
  const raw =
    (typeof data?.["geometry"] === "string"
      ? (data["geometry"] as string)
      : undefined) ??
    // legacy: the axis used to live under `certainty_class`
    (typeof data?.["certainty_class"] === "string"
      ? (data["certainty_class"] as string)
      : undefined);
  if (raw) {
    const key = VARIANT_LEGACY[raw] ?? raw;
    // `canonical_unknown` and `default` are STYLE keys, never geometry values
    // (cleanup E) — a document declaring one as its geometry is not making a
    // statement about metric authority.
    if (key !== CANONICAL_UNKNOWN && key !== VARIANT_DEFAULT && styles[key])
      return key;
  }
  return isCanonical ? CANONICAL_UNKNOWN : VARIANT_DEFAULT;
}

export function documentVariant(
  data?: Record<string, unknown>,
  isCanonical = false,
): { color: string; width: number; key: string } {
  const styles = variantStyles();
  const key = documentVariantKey(data, isCanonical);
  const st = styles[key] ?? styles[VARIANT_DEFAULT];
  return {
    key,
    color: st?.border_color ?? "#000000",
    // The datamodel's own widths: 4.0 for every canonical variant, 1.0 for the
    // use-instance default. That IS the canonical/instance signal.
    width: st?.border_width ?? (isCanonical ? 4 : 1),
  };
}

/** Edge types considered part of the stratigraphic backbone. */
export const SEQUENCE_EDGES = new Set([
  "is_after",
  "is_before",
  "changed_from",
  "has_same_time",
]);
