/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

pub const INTERACTIVE_ROLES: &[&str] = &[
    "button",
    "link",
    "textbox",
    "searchbox",
    "textarea",
    "checkbox",
    "radio",
    "combobox",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "tab",
    "switch",
    "slider",
    "spinbutton",
    "option",
    "treeitem",
    "listbox",
    "DisclosureTriangle",
];

pub const SKIP_ROLES: &[&str] = &[
    "none",
    "presentation",
    "LineBreak",
    "InlineTextBox",
    "StaticText",
    "text",
];

pub const ROOT_ROLES: &[&str] = &["RootWebArea", "WebArea"];

pub const VALUE_ROLES: &[&str] = &["textbox", "searchbox", "textarea", "combobox", "spinbutton"];

#[must_use]
pub fn is_interactive_role(role: &str) -> bool {
    INTERACTIVE_ROLES.contains(&role)
}

#[must_use]
pub fn is_skip_role(role: &str) -> bool {
    SKIP_ROLES.contains(&role)
}

#[must_use]
pub fn is_root_role(role: &str) -> bool {
    ROOT_ROLES.contains(&role)
}

#[must_use]
pub fn is_value_role(role: &str) -> bool {
    VALUE_ROLES.contains(&role)
}
