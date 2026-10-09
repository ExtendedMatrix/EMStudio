//! em-core's copy of the visual rules is the vendored frontend file minus
//! `2d_glyphs`, and nothing else.
//!
//! `sync-datamodels.sh` writes both in one run; this is the check that nobody
//! edited one of them by hand, or synced one without the other. A difference in
//! any other key would mean the layout reads a rule the renderer does not — the
//! drift the compiled-in table exists to rule out (invariant 7).

use serde_json::Value;

const FRONTEND: &str = include_str!("../../../frontend/src/assets/em_visual_rules.json");
const CORE: &str = include_str!("../assets/em_visual_rules.core.json");

#[test]
fn core_rules_are_the_frontend_rules_without_the_glyph_paths() {
    let mut frontend: Value = serde_json::from_str(FRONTEND).expect("frontend rules parse");
    let core: Value = serde_json::from_str(CORE).expect("core rules parse");
    assert!(core.get("2d_glyphs").is_none(), "em-core's copy must not carry 2d_glyphs");
    frontend
        .as_object_mut()
        .expect("rules are an object")
        .remove("2d_glyphs");
    assert_eq!(frontend, core, "the two copies differ outside 2d_glyphs — re-run sync-datamodels.sh");
}

const FRONTEND_REGISTRY: &str = include_str!("../../../frontend/src/assets/node_registry.generated.json");
const CORE_REGISTRY: &str = include_str!("../assets/node_registry.generated.json");

/// G1 · the class hierarchy em-core classifies node types with is the one the
/// frontend's rings read (`filters.ts nodeCircle`), byte for byte.
#[test]
fn core_registry_is_the_frontend_registry() {
    assert_eq!(FRONTEND_REGISTRY, CORE_REGISTRY, "node_registry differs — re-run sync-datamodels.sh");
}
