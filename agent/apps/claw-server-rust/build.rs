/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

fn main() {
    println!("cargo:rerun-if-env-changed=CLAW_POSTHOG_KEY");
    let Some(key) = std::env::var_os("CLAW_POSTHOG_KEY").and_then(|value| value.into_string().ok())
    else {
        return;
    };
    let mut encoded = String::with_capacity(key.len() * 2);
    let hex = b"0123456789abcdef";
    for byte in key.bytes() {
        encoded.push(char::from(hex[usize::from(byte >> 4)]));
        encoded.push(char::from(hex[usize::from(byte & 0x0f)]));
    }
    println!("cargo:rustc-env=CLAW_POSTHOG_KEY_MARKER=browseros-claw-posthog-key={encoded};");
}
