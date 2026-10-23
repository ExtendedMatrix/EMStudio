// MICRO-GLIFI-OVERLAY-CONTINUITA p.5 · the PLATE of a node — the wash and ring of
// a selection, the hover, the peers' ring, the volatile ring, the click — has
// the shape of what is drawn. For a glyph that is the glyph's rect, never the
// node's box (a square glyph in a 90 × 32 box had a rectangular plate: E.D.,
// as the graph's glyph before 20 Oct). In the liquid Graph it is the disc.
//
// `drawnGlyphRect` repeats the renderer's choice of aspect (the path glyph's,
// else the declared one, the document's sheet); `plateOf` is the one every
// plate is drawn from. Pure but for the datamodel the two read.
import { glyphFor } from "./glyphs";
import { visibleBoxOf, type Scene, type SceneNode } from "./scene";
import { DOC_SHEET_ASPECT, glyphAspect, glyphRectOf, type Box } from "./shape-geom";

/** the rect a node's glyph is DRAWN in (renderer.ts), or null when it is not a glyph */
export function drawnGlyphRect(n: SceneNode): Box | null {
  const type = n.node.node_type;
  const data = n.node.data as Record<string, unknown> | undefined;
  if (type === "document") return glyphRectOf(n, DOC_SHEET_ASPECT);
  if (type === "property") return null; // the annotation fills its box
  const a = glyphFor(type, data)?.aspect ?? glyphAspect(type, data);
  return a ? glyphRectOf(n, a) : null;
}

export interface Plate extends Box { round: boolean }

/** the plate of a node in a scene: a disc in the liquid Graph, else what is drawn */
export function plateOf(scene: Scene | null | undefined, n: SceneNode): Plate {
  if (scene && "liquid" in scene && (scene as { liquid?: unknown }).liquid)
    return { x: n.x, y: n.y, w: n.w, h: n.w, round: true };
  return { ...visibleBoxOf(n), round: false };
}
