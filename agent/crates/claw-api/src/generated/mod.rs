/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

pub mod audit;
pub use self::audit::*;
pub mod cockpit;
pub use self::cockpit::*;
pub mod common;
pub use self::common::*;
pub mod connections;
pub use self::connections::*;
pub mod dispatches;
pub use self::dispatches::*;
pub mod feedback;
pub use self::feedback::*;
pub mod recordings;
pub use self::recordings::*;
pub mod sessions;
pub use self::sessions::*;
pub mod settings;
pub use self::settings::*;
pub mod skills;
pub use self::skills::*;
pub mod system;
pub use self::system::*;
