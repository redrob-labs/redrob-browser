/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

mod manager;
mod session;
mod tab_ownership;
mod usage;

pub use manager::{RetainedGroupAction, RetainedGroupHook, RetirementCause, Sessions};
pub use session::Session;
pub use tab_ownership::{PageOwnership, TabGroup, TabGroupColor, TabGroupState, TitleSync};
