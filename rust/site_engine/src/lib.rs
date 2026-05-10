//! Pure workbench engine for the Andrea Bozzo static site.
//!
//! The browser owns fetching and rendering. This crate owns deterministic item
//! normalization, topic scoring, search ranking, and graph coordinates.

mod classify;
mod models;
mod simulation;
#[cfg(test)]
mod tests;
mod utils;
mod workbench;

use crate::models::SimState;
use wasm_bindgen::prelude::*;

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
