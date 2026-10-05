/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

pub mod analytics;
pub mod api;
pub mod app;
mod clock;
pub mod config;
pub mod db;
pub mod error;
pub mod identity;
pub mod ids;
pub mod runtime;
pub mod services;
pub mod storage;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

pub use app::{AppState, build_router};
pub use runtime::{AppRuntime, ShutdownHandle};
