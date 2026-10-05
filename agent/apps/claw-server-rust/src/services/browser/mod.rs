/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

mod connection;
mod tab_groups;
mod tab_registry;

pub use connection::{BrowserConnectionState, BrowserService};
pub use tab_groups::{TabGroupColor, color_for_slug, hex_for_slug};
pub use tab_registry::TabRegistry;
