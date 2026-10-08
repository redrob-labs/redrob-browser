/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

mod manifest;
mod reconciler;
mod types;

pub use reconciler::{SkillReconciler, resolve_agent_skill_target};
pub use types::{SkillEnvironment, SkillReconcileOutcome, SkillSpec, SkillWarning, TargetPlatform};
