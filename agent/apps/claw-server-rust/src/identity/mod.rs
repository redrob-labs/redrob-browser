/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

mod client;
mod conversation;

pub use client::{ClientIdentity, ClientInfo, ProfileView, slugify_client_name};
pub use conversation::{
    ConversationIdentity, GenerateFunNameError, convo_id_belongs_to_slug, generate_fun_name,
};
