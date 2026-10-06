/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

pub mod ax_types;
pub mod diff;
pub mod refs;
pub mod render;
pub mod roles;

pub use ax_types::{AxNode, AxProperty, AxValue};
pub use diff::{
    DiffOptions, SnapshotDiff, SnapshotObservation, diff_snapshot_observations, diff_snapshots,
};
pub use refs::{DocumentId, RefEntry, RefMap};
pub use render::{
    IframeStitch, RenderOptions, RenderResult, SnapshotMode, SnapshotOptions,
    apply_snapshot_options, render_snapshot,
};
