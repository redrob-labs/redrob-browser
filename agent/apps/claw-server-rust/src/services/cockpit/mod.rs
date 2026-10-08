/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

mod activity;
mod query;
mod visual;

pub use activity::{RecordToolInput, TabActivityRecord, TabActivityService, ToolEvent};
pub use query::{
    CockpitQuery, LiveActivityState, LiveSessionFilters, LiveSessionProjection,
    LiveStateProjection, LiveTabProjection,
};
pub use visual::SessionVisualService;
