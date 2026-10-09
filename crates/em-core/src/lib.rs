//! em-core — Extended Matrix editor core.
//!
//! Graph model, `.em.json` I/O, connection validation and the layout engine.
//! The EM language itself (node types, allowed connections, palette metadata)
//! is NOT hardcoded here: it is loaded at runtime from the s3Dgraphy JSON
//! datamodels, which remain the single versioned source of truth.
//!
//! Architecture: `docs/ARCHITECTURE.md`. Format: `docs/emjson-v1-draft.md`.

pub mod model;
pub mod emjson;
pub mod validation;
pub mod geometry;
pub mod layout;
mod layered;

pub use model::{Document, Edge, Graph, Layout, Node};
