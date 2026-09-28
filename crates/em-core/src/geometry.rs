//! Per-node-type box geometry, read from the s3Dgraphy visual rules.
//!
//! Until EM1 every leaf node got the same box — `default_node_w × default_node_h`
//! (90×32) — whatever its type. That was fine while every type was drawn as a
//! full-box shape, and stopped being fine when BR became a black rhombus at 0.7×
//! height: the drawing was 22×22 and the box it reserved (and the box the click
//! answered to) was still 90×32.
//!
//! # Why the table is COMPILED IN, from the vendored datamodel
//!
//! `lib.rs` promises that the EM language is not hardcoded here, and it is not:
//! this module hardcodes no type and no number, it reads
//! `frontend/src/assets/em_visual_rules.json` — the pinned vendored copy that
//! `frontend/scripts/sync-datamodels.sh` refreshes from s3Dgraphy (ADR-001), the
//! same file `palette.ts` and the renderer read — through the copy the same
//! script writes for this crate, `assets/em_visual_rules.core.json`, which is
//! that file without `2d_glyphs` (MICRO-cronologia § 6).
//!
//! Compile time rather than runtime for one reason, and it is the determinism
//! contract (invariant 7): the same document must lay out identically in the CLI,
//! in WASM and on the desktop. A table passed in by each caller would make that
//! true only as long as three callers agreed; a table baked from one file makes it
//! true by construction. The WASM delivery could not read the file at runtime
//! anyway — it is a single inlined binary with no filesystem.
//!
//! If the vendored file moves, this crate stops compiling. That is the intended
//! failure: loud, at build time, instead of a layout that silently drifts.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// The vendored visual rules. See the module docs for why this is `include_str!`.
///
/// em-core's OWN copy, written by `sync-datamodels.sh` from the vendored
/// frontend file with the `2d_glyphs` block removed: the pictograms as vector
/// paths (~62 KB) are the renderer's, and the layout reads none of them. The two
/// copies coincide apart from that block — `tests/visual_rules_core.rs`.
const VISUAL_RULES_JSON: &str =
    include_str!("../assets/em_visual_rules.core.json");

/// How one node type's box differs from the default box.
///
/// Deliberately only the two things the visual rules state about the SHAPE's
/// extent — nothing about how the shape looks, which is the renderer's business:
///
/// * `scale` ← `style.shape_scale` (BR: 0.7). A marker is punctuation, not a unit.
/// * `square` ← `style.shape_bbox == "square"` (BR). Without it a diamond in a
///   90×32 box is a flattened lozenge; with it the rhombus is equilateral.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct TypeBox {
    pub scale: f64,
    /// The box is HEIGHT-DRIVEN: its height is the node height and its width is
    /// that height times [`TypeBox::aspect`]. (Named `square` since EM1, when the
    /// only aspect was 1.0; EM3 generalised it and kept the field name because it
    /// is what the visual rules call it — `shape_bbox: "square"`.)
    pub square: bool,
    /// Width / height of the DRAWING, for a height-driven box. 1.0 = square.
    ///
    /// A STATIC number from the datamodel (`2d_render_glyph_types.aspect`), never
    /// measured from a loaded image: an aspect read off `naturalWidth` would make
    /// the layout depend on when a bitmap finished decoding, so the same document
    /// could lay out two different ways and a box would jump under the user.
    pub aspect: f64,
}

impl Default for TypeBox {
    fn default() -> Self {
        Self { scale: 1.0, square: false, aspect: 1.0 }
    }
}

impl TypeBox {
    /// Apply to a default box. Returns `(w, h)`.
    ///
    /// `square` takes the SMALLER side, never the larger: a box that grew would
    /// overlap its neighbours and claim clicks that belong to them.
    pub fn apply(&self, w: f64, h: f64) -> (f64, f64) {
        let (mut bw, mut bh) = (w * self.scale, h * self.scale);
        if self.square {
            // height-driven: the HEIGHT is the box, the width follows the aspect.
            // `min` and not `h` alone so the box can never grow past the space it
            // was given — a box that grew would overlap its neighbours and claim
            // clicks that belong to them.
            let side = bw.min(bh);
            bh = side;
            bw = side * self.aspect;
        }
        (bw, bh)
    }

    /// True when this is the default box — nothing to do.
    pub fn is_identity(&self) -> bool {
        self.scale == 1.0 && !self.square
    }

    /// Same box with a different aspect (EM3): the glyph list says WHICH types are
    /// height-driven, the aspect table says how wide each one is.
    pub fn with_aspect(self, aspect: f64) -> Self {
        Self { aspect, ..self }
    }
}

/// `node_type` → box geometry, for the types that declare one.
pub type TypeBoxes = BTreeMap<String, TypeBox>;

/// Node data key that makes a single node a glyph regardless of its type (EM2).
///
/// A DTC node picks its glyph per NODE from `data.dtc_kind` — a plain `link` is a
/// chain, a `link` with a kind is a photograph, a mesh, a laser scan. So this one
/// cannot be answered from the type table and is checked on the node itself; see
/// [`glyph_box`].
pub const GLYPH_BY_DATA_KEY: &str = "dtc_kind";

/// The box of a node that draws as a centred square glyph: square, full size.
///
/// EM2 reuses EM1's mechanism rather than adding a second one — a glyph type is
/// simply a type whose bounding box is square, exactly like BR, only without BR's
/// 0.7 shrink. The consequence is what EM2 is for: the right edge of the box lands
/// on the right edge of the glyph, so the connect handle (anchored there) touches
/// the glyph instead of floating in an empty margin.
pub const fn glyph_box() -> TypeBox {
    TypeBox { scale: 1.0, square: true, aspect: 1.0 }
}

/// Parse a visual-rules document into a box table.
///
/// Two sources inside the same file, both data:
///
/// * `node_styles.<abbr>.style` → `shape_scale` / `shape_bbox` (EM1, BR);
/// * `2d_render_glyph_types.types` → the node types drawn as a centred square
///   glyph (EM2), which get [`glyph_box`].
///
/// Only entries that actually say something are kept, so a lookup miss and an
/// identity entry are the same thing and callers need no special case.
///
/// NB the two blocks are keyed differently in the datamodel and that is
/// deliberate: `node_styles` uses the short abbreviation (`BR`, `EXT`), the glyph
/// list uses the runtime `node_type` (`extractor`). This engine knows node types
/// and not abbreviations, which is why the glyph list is the one it can read at
/// all — see the `_comment` on that block.
pub fn type_boxes_from_json(json: &str) -> TypeBoxes {
    let mut out = TypeBoxes::new();
    let Ok(doc) = serde_json::from_str::<serde_json::Value>(json) else {
        // A malformed vendored file is a build/vendoring problem, not a reason to
        // refuse to lay out: fall back to uniform boxes, which is the behaviour
        // this table replaces.
        return out;
    };
    if let Some(styles) = doc.get("node_styles").and_then(|v| v.as_object()) {
        for (node_type, entry) in styles {
            let Some(style) = entry.get("style") else { continue };
            let scale = style
                .get("shape_scale")
                .and_then(|v| v.as_f64())
                .filter(|s| *s > 0.0 && *s <= 1.0)
                .unwrap_or(1.0);
            let square = style.get("shape_bbox").and_then(|v| v.as_str()) == Some("square");
            let tb = TypeBox { scale, square, aspect: 1.0 };
            if !tb.is_identity() {
                out.insert(node_type.clone(), tb);
            }
        }
    }
    let glyphs = doc.get("2d_render_glyph_types");
    let aspects = glyphs.and_then(|g| g.get("aspect")).and_then(|v| v.as_object());
    if let Some(types) = glyphs.and_then(|g| g.get("types")).and_then(|v| v.as_array()) {
        for t in types.iter().filter_map(|v| v.as_str()) {
            // A type that also declares shape geometry keeps it: the explicit
            // per-style declaration is the more specific statement.
            out.entry(t.to_string())
                .or_insert_with(|| glyph_box().with_aspect(aspect_of(aspects, t)));
        }
    }
    out
}

/// The declared aspect of one glyph, or 1.0 (square) when it declares none.
///
/// Guarded, because an aspect of 0 or a negative number would collapse the box to
/// nothing and a huge one would let a glyph swallow its neighbours: a malformed
/// value falls back to square rather than to a shape nobody can click.
fn aspect_of(aspects: Option<&serde_json::Map<String, serde_json::Value>>, key: &str) -> f64 {
    aspects
        .and_then(|m| m.get(key))
        .and_then(|v| v.as_f64())
        .filter(|a| *a >= 0.2 && *a <= 5.0)
        .unwrap_or(1.0)
}

/// The aspect table, for the callers that resolve a glyph per NODE (a `dtc_kind`).
pub fn glyph_aspect(kind: &str) -> f64 {
    let doc: serde_json::Value = match serde_json::from_str(VISUAL_RULES_JSON) {
        Ok(v) => v,
        Err(_) => return 1.0,
    };
    let aspects = doc
        .get("2d_render_glyph_types")
        .and_then(|g| g.get("aspect"))
        .and_then(|v| v.as_object())
        .cloned();
    aspect_of(aspects.as_ref(), kind)
}

/// The table for the vendored datamodel — what every delivery uses.
pub fn type_boxes() -> TypeBoxes {
    type_boxes_from_json(VISUAL_RULES_JSON)
}

/// The box for a node type: its own if it declares one, else the default.
pub fn box_for(boxes: &TypeBoxes, node_type: &str, w: f64, h: f64) -> (f64, f64) {
    match boxes.get(node_type) {
        Some(tb) => tb.apply(w, h),
        None => (w, h),
    }
}

/// The box for a NODE: its type's, unless the node itself carries a glyph.
///
/// `glyph_by_data` is the per-node escape hatch EM2 needs for the DTC profile
/// (`data.dtc_kind`): those nodes draw a glyph although their type does not say
/// so, and a node drawn as a glyph must get the glyph's square box or the connect
/// handle drifts away from it again.
///
/// The node's own glyph WINS over the type table, because it is the more specific
/// statement — and in practice the only types it applies to (`link`,
/// `dtc_process`) declare no box geometry at all.
pub fn box_for_node(
    boxes: &TypeBoxes,
    node_type: &str,
    glyph_kind: Option<&str>,
    w: f64,
    h: f64,
) -> (f64, f64) {
    if let Some(kind) = glyph_kind {
        // the kind names the drawing, so the kind also names its aspect (EM3);
        // every DTC glyph is square today, so this is 1.0 in practice — the
        // mechanism is here so a non-square kind does not need a code change
        return glyph_box().with_aspect(glyph_aspect(kind)).apply(w, h);
    }
    box_for(boxes, node_type, w, h)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_vendored_rules_are_readable_and_declare_br() {
        let boxes = type_boxes();
        // BR is the type EM1 exists for. If this fails, either the vendored copy
        // moved or the visual rules stopped declaring the marker's geometry —
        // both are worth failing a build over, because the alternative is a
        // 90×32 click target around a 22 px rhombus.
        let br = boxes.get("BR").expect("BR must declare a box in em_visual_rules");
        assert_eq!(br.scale, 0.7);
        assert!(br.square);
    }

    #[test]
    fn a_square_box_takes_the_smaller_side() {
        let (w, h) = TypeBox { scale: 0.7, square: true, aspect: 1.0 }.apply(90.0, 32.0);
        assert_eq!((w, h), (22.4, 22.4));
        // and never grows: 32*0.7 = 22.4 < 90*0.7 = 63
        assert!(w <= 90.0 && h <= 32.0);
    }

    #[test]
    fn an_undeclared_type_keeps_the_default_box() {
        let boxes = type_boxes();
        assert_eq!(box_for(&boxes, "US", 90.0, 32.0), (90.0, 32.0));
        assert_eq!(box_for(&boxes, "not_a_type", 90.0, 32.0), (90.0, 32.0));
    }

    #[test]
    fn scale_alone_does_not_square_the_box() {
        let (w, h) = TypeBox { scale: 0.5, square: false, aspect: 1.0 }.apply(90.0, 32.0);
        assert_eq!((w, h), (45.0, 16.0));
    }

    #[test]
    fn the_glyph_types_get_a_square_box_the_same_way_br_does() {
        let boxes = type_boxes();
        // EM2: every type the renderer draws as a centred glyph must be square,
        // so the right edge of the box IS the right edge of the glyph and the
        // connect handle lands on it. `extractor` is E.D.'s reported case.
        for t in ["extractor", "combiner", "author", "license", "narrative"] {
            let tb = boxes
                .get(t)
                .unwrap_or_else(|| panic!("{t} must be a declared glyph type"));
            assert!(tb.square, "{t} must have a HEIGHT-DRIVEN box");
            assert_eq!(tb.scale, 1.0, "{t} is full size — only BR shrinks");
            // the height is the node height for all of them; the width is the
            // height × the declared aspect (EM3), which is 1.0 for the square ones
            assert_eq!(box_for(&boxes, t, 90.0, 32.0).1, 32.0);
        }
        // the two genuinely square ones still come out 32×32
        for t in ["extractor", "combiner"] {
            assert_eq!(box_for(&boxes, t, 90.0, 32.0), (32.0, 32.0));
        }
    }

    #[test]
    fn the_types_with_custom_geometry_stay_rectangular() {
        let boxes = type_boxes();
        // `document` is a sheet with a folded corner and `property` a bracketed
        // text annotation: neither is square, and squaring them would crush the
        // text they exist to carry. US and the two voids are shapes, not glyphs.
        for t in ["document", "property", "US", "USN", "USNt"] {
            assert_eq!(
                box_for(&boxes, t, 90.0, 32.0),
                (90.0, 32.0),
                "{t} must keep the default rectangular box"
            );
        }
    }

    #[test]
    fn a_node_carrying_a_dtc_kind_is_a_glyph_whatever_its_type_says() {
        let boxes = type_boxes();
        // A plain `link` is a chain drawn in its box…
        assert_eq!(box_for_node(&boxes, "link", None, 90.0, 32.0), (90.0, 32.0));
        // …the same `link` with a DTC kind draws a photograph/mesh/laser-scan
        // glyph, so it takes the glyph box even though its TYPE says nothing. All
        // eleven DTC glyphs are square after the POL4 autocrop, hence 32×32.
        assert_eq!(
            box_for_node(&boxes, "link", Some("photo"), 90.0, 32.0),
            (32.0, 32.0)
        );
    }

    #[test]
    fn the_box_width_comes_from_static_geometry_never_from_an_image() {
        // The determinism requirement, generalised in EM3: the HEIGHT is the node
        // height (a number the engine already owns) and the WIDTH is that height
        // times a STATIC aspect from the datamodel. Nothing here reads a file,
        // decodes a bitmap or asks an <img> for `naturalWidth`, so the box cannot
        // change when an icon finishes loading — the layout is identical before
        // and after the image arrives, and identical across two runs.
        let square = glyph_box();
        assert_eq!(square.apply(90.0, 32.0), (32.0, 32.0));
        assert_eq!(square.apply(120.0, 40.0), (40.0, 40.0));

        // a NON-square glyph: same height, narrower box. author was 0.875 (448/512,
        // measured on the WRONG file — the Font Awesome silhouette); em_visual_rules
        // 1.6.18 corrected it to 0.984, the pictogram's 126×128 (NIGHT-GLIFI).
        let boxes = type_boxes();
        let (w, h) = box_for(&boxes, "author", 90.0, 32.0);
        assert_eq!(h, 32.0, "the height is the node height for every glyph");
        assert!((w - 31.488).abs() < 1e-9, "0.984 × 32 = 31.488 — the width follows the drawing");
        // …and every glyph keeps the SAME height, which is E.D.'s rule
        for t in ["extractor", "author", "license", "narrative"] {
            assert_eq!(box_for(&boxes, t, 90.0, 32.0).1, 32.0);
        }

        // a malformed aspect must not collapse or explode the box
        assert_eq!(glyph_box().with_aspect(0.0).apply(90.0, 32.0).0, 0.0);
        assert_eq!(aspect_of(None, "whatever"), 1.0);
        let bad: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(r#"{"x": 0, "y": 99, "z": "wide"}"#).unwrap();
        for k in ["x", "y", "z", "absent"] {
            assert_eq!(aspect_of(Some(&bad), k), 1.0, "{k} must fall back to square");
        }
    }

    #[test]
    fn the_declared_aspects_are_the_ones_the_engine_uses() {
        // The table is data; this pins the two ends together so a datamodel edit
        // that mistypes a key shows up as a failing test and not as a wrong box.
        let boxes = type_boxes();
        for (t, expect_w) in [
            ("extractor", 32.0),   // 1.000 × 32
            ("combiner", 32.0),    // 1.000 × 32
            ("author", 31.488),    // 0.984 × 32 (was 0.875 until rules 1.6.18)
            ("author_ai", 31.488), // 0.984 × 32
            ("license", 31.264),   // 0.977 × 32
            ("embargo", 31.744),   // 0.992 × 32
            ("narrative", 31.392), // 0.981 × 32
        ] {
            let (w, h) = box_for(&boxes, t, 90.0, 32.0);
            assert!((w - expect_w).abs() < 1e-9, "{t}: width {w}, expected {expect_w}");
            assert_eq!(h, 32.0);
        }
    }

    #[test]
    fn a_malformed_or_empty_rules_file_degrades_to_uniform_boxes() {
        assert!(type_boxes_from_json("not json").is_empty());
        assert!(type_boxes_from_json("{}").is_empty());
        // an out-of-range scale is ignored rather than trusted
        let t = type_boxes_from_json(
            r#"{"node_styles":{"X":{"style":{"shape_scale":0}}}}"#,
        );
        assert!(t.is_empty(), "a zero scale would collapse the node to nothing");
    }
}
