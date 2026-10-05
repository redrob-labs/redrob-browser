/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

//! Guards refuse a dispatch outright.
//!
//! Page ownership is deliberately NOT among them, and must never be added back.
//! Ownership is a label that tells an agent whose tab it is looking at; it is not a
//! permission. See `effects::page_ownership_notice`.

pub mod browser_connected;
pub mod navigate_scheme;
