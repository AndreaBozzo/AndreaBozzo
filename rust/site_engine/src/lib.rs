//! Pure workbench engine for the Andrea Bozzo static site.
//!
//! Contract boundary:
//! - JavaScript owns fetching, UI state, DOM/canvas rendering, analytics, and
//!   the no-WASM fallback.
//! - Rust owns deterministic workbench derivation: item normalization, query
//!   parsing/ranking, topic counts, graph edges/coordinates, and layout ticks.
//! - Rust must be optional. If this bundle is missing or incompatible, the site
//!   should stay useful through the JavaScript fallback.

mod classify;
mod models;
mod query;
mod simulation;
#[cfg(test)]
mod tests;
mod utils;
mod workbench;

use crate::models::SimState;
use wasm_bindgen::prelude::*;

const WORKBENCH_ENGINE_CONTRACT: &str = r#"{
  "name": "site_engine",
  "schemaVersion": 1,
  "role": "optional deterministic workbench engine",
  "jsOwns": ["fetching", "UI state", "DOM rendering", "canvas drawing", "fallback behavior"],
  "rustOwns": ["normalization", "query parsing", "ranking", "topic counts", "graph derivation", "layout ticks"],
  "exports": ["build_workbench", "tick_layout", "workbench_engine_contract"]
}"#;

#[wasm_bindgen]
pub fn workbench_engine_contract() -> String {
    WORKBENCH_ENGINE_CONTRACT.to_string()
}

#[wasm_bindgen]
pub fn build_workbench(payload_json: &str) -> String {
    serde_json::to_string(&workbench::build(workbench::parse_payload(payload_json)))
        .unwrap_or_else(|_| "{}".to_string())
}

#[wasm_bindgen]
pub fn tick_layout(state_json: &str) -> String {
    let state: SimState = serde_json::from_str(state_json).unwrap_or_default();
    serde_json::to_string(&simulation::simulate(state)).unwrap_or_else(|_| "{}".to_string())
}
