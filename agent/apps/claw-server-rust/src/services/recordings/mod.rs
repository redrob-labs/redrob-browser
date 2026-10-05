/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

mod ingest;
mod live;
mod store;

pub use ingest::RecordingIngestService;
pub use live::{LiveBatch, LiveRecordingBus};
pub use store::{
    LegacyRecordedEvent, RECORDING_ORPHAN_TTL_MS, RecordedEvent, RecordingEventInput,
    RecordingStore, RetentionSweepResult, legacy_document_id,
};
