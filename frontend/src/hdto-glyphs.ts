/**
 * MICRO-PULIZIA p.3 · the glyphs of the HDT-O nodes — a PENDING entry of
 * `em_visual_rules.2d_glyphs`, not a second set of rules.
 *
 * The Graph view now draws every node present, the HDT-O ones included, and
 * the datamodel (s3Dgraphy 1.6.x, vendored) describes no glyph for them: the
 * graph (HC16) was a bitmap (`icons2d/graph.svg`) and the study, the heritage
 * entity, the twin and the project were grey discs with nothing in them.
 * EMStudio does not write the vendored rules (ADR-001), so the drawings live
 * here, IN THE DATAMODEL'S OWN FORMAT — viewBox, aspect, layers with a closed
 * role — and `glyphs.ts` reads them only for a key the datamodel does not
 * have. The day s3Dgraphy carries these entries (the proposal is in the
 * report of 20 Oct 2026, ready to paste), the datamodel's win and this file
 * can go.
 *
 * The grammar follows the existing rules: the ornaments (author, licence,
 * embargo) are a grey pictogram (`ground`) inside a `#333333` circle (`ink`,
 * stroke 7 on a ~128 viewBox). The HDT-O layer is the same pictogram inside a
 * SQUARE plate — the frame says «a node of the cultural context», the
 * pictogram says which; the graph's plate is square like the others.
 *
 * Keyed by datamodel CLASS (the wire `node_type` is read from the registry),
 * so no type string is spelled here.
 */
import registry from "./assets/node_registry.generated.json";

interface RawLayer {
  d: string;
  role: string;
  fill?: string;
  stroke?: string;
  stroke_width?: number;
  line_cap?: string;
  line_join?: string;
}
export interface PendingGlyph {
  viewBox: [number, number, number, number];
  aspect: number;
  layers: RawLayer[];
  source: string;
}

const INK = "#333333";
const GROUND = "#6E6E6E";
/** the square plate: a white field, a #333333 border (the ornaments' ring, squared) */
const PLATE: RawLayer[] = [
  { d: "M18 4H110A14 14 0 0 1 124 18V110A14 14 0 0 1 110 124H18A14 14 0 0 1 4 110V18A14 14 0 0 1 18 4Z",
    role: "paper", fill: "#FFFFFF" },
  { d: "M18 4H110A14 14 0 0 1 124 18V110A14 14 0 0 1 110 124H18A14 14 0 0 1 4 110V18A14 14 0 0 1 18 4Z",
    role: "ink", stroke: INK, stroke_width: 7 },
];
const glyph = (layers: RawLayer[], what: string): PendingGlyph => ({
  viewBox: [0, 0, 128, 128], aspect: 1, layers: [...PLATE, ...layers],
  source: `EMStudio hdto-glyphs.ts (pending in em_visual_rules) · ${what}`,
});
const round = { line_cap: "round", line_join: "round" };
/** the graph's three nodes (graph.svg's drawing, on the 128 grid) */
const NODES = "M74 36A10 10 0 1 1 54 36A10 10 0 1 1 74 36Z"
  + "M46 92A10 10 0 1 1 26 92A10 10 0 1 1 46 92Z"
  + "M102 92A10 10 0 1 1 82 92A10 10 0 1 1 102 92Z";

/** class → glyph. HC16 the proposition set (the graph), HC2 the twin, HC1 the
 *  heritage entity, HC9 the study, HC13 the project. */
const BY_CLASS: Record<string, PendingGlyph> = {
  // HC16 · the graph: three nodes and their edges (the drawing of graph.svg)
  GraphNode: glyph([
    { d: "M64 46V64M64 64L42 86M64 64L86 86", role: "ground", stroke: GROUND, stroke_width: 7, ...round },
    // a layer is filled OR stroked (`drawGlyph`): the white of the three nodes,
    // then their ring
    { d: NODES, role: "paper", fill: "#FFFFFF" },
    { d: NODES, role: "ground", stroke: GROUND, stroke_width: 6 },
  ], "HC16 Heritage Proposition Set (em:EMGraph)"),
  // HC2 · the twin: the thing, and its digital copy beside it
  HDTNode: glyph([
    { d: "M20 62L41 42L62 62V96H20Z", role: "ground", fill: GROUND },
    { d: "M68 62L89 42L110 62V96H68Z", role: "ground", stroke: GROUND, stroke_width: 5, ...round },
    { d: "M78 76H100M78 86H100", role: "ground", stroke: GROUND, stroke_width: 4, ...round },
  ], "HC2 Heritage Digital Twin"),
  // HC1 · the heritage entity: a façade (pediment, three columns, steps)
  HeritageEntityNode: glyph([
    { d: "M22 48L64 24L106 48Z", role: "ground", fill: GROUND },
    { d: "M26 52H102V58H26Z", role: "ground", fill: GROUND },
    { d: "M33 62H43V90H33ZM59 62H69V90H59ZM85 62H95V90H85Z", role: "ground", fill: GROUND },
    { d: "M24 94H104V104H24Z", role: "ground", fill: GROUND },
  ], "HC1 Heritage Entity"),
  // HC9 · the study: a lens
  StudyNode: glyph([
    { d: "M84 54A26 26 0 1 1 32 54A26 26 0 1 1 84 54Z", role: "ground", stroke: GROUND, stroke_width: 8 },
    { d: "M78 74L102 98", role: "ground", stroke: GROUND, stroke_width: 13, ...round },
  ], "HC9 Study"),
  // HC13 · the project: a flag on its pole
  ProjectNode: glyph([
    { d: "M38 24V106", role: "ground", stroke: GROUND, stroke_width: 7, ...round },
    { d: "M42 28H98L85 46L98 64H42Z", role: "ground", fill: GROUND },
  ], "HC13 Project"),
  // MICRO-GEOREF-GRAFO · the georeference, a member of the graph's paradata group
  // beside the author, the licence and the embargo: their grammar (a grey
  // pictogram in a #333333 ring), a map's pin — the pictogram of icons2d/
  // geo_position.svg, drawn on the 128 grid. Pending in em_visual_rules like the others
  GeoPositionNode: {
    viewBox: [0, 0, 128, 128], aspect: 1, layers: [
      { d: "M64 22C46.3 22 32 36.3 32 54C32 76 64 108 64 108C64 108 96 76 96 54C96 36.3 81.7 22 64 22Z", role: "ground", fill: GROUND },
      { d: "M77 54A13 13 0 1 1 51 54A13 13 0 1 1 77 54Z", role: "paper", fill: "#FFFFFF" },
      { d: "M123 64A59 59 0 1 1 5 64A59 59 0 1 1 123 64Z", role: "ink", stroke: INK, stroke_width: 7 },
    ],
    source: "EMStudio hdto-glyphs.ts (pending in em_visual_rules) · GeoPositionNode (the graph's georeference)",
  },
};

const CLASSES = (registry as unknown as { node_types?: Record<string, { node_type?: string }> }).node_types ?? {};

/** node_type → its pending glyph (only the classes the registry knows). */
export const HDTO_GLYPHS: Readonly<Record<string, PendingGlyph>> = Object.fromEntries(
  Object.entries(BY_CLASS)
    .map(([cls, g]) => [CLASSES[cls]?.node_type, g] as const)
    .filter((e): e is readonly [string, PendingGlyph] => typeof e[0] === "string"),
);

/** the node types drawn with a pending HDT-O glyph */
export const HDTO_GLYPH_TYPES: ReadonlySet<string> = new Set(Object.keys(HDTO_GLYPHS));

/** the class each pending glyph is for (the report's table, the checks) */
export function hdtoGlyphTable(): { cls: string; nodeType: string | null; what: string }[] {
  return Object.entries(BY_CLASS).map(([cls, g]) => ({
    cls, nodeType: CLASSES[cls]?.node_type ?? null, what: g.source.split(" · ").pop() ?? "",
  }));
}
