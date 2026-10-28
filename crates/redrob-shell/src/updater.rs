//! Update check. Once a day the window reads a signed manifest from the CDN
//! and, when a newer version exists, offers its download for this platform.
//!
//! The manifest is signed with the same Ed25519 key the Chromium-based
//! browser used for its Sparkle feed (repository secret
//! SPARKLE_ED_PRIVATE_KEY); only the public half is here. A manifest whose
//! signature does not verify is ignored.

use std::time::Duration;

use base64::Engine as _;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};

const MANIFEST: &str = "https://cdn.redrob.ai/browser/latest.json";
const PUBLIC_KEY_B64: &str = "5lWrkUbHu7MqrCIW4bmFzx1KUoIqx8ugydJSAcAZXlQ=";
pub const CHECK_EVERY_SECS: u64 = 24 * 60 * 60;

pub struct Available {
    pub version: String,
    pub url: String,
}

/// The platform key the manifest lists files under.
pub fn platform() -> &'static str {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => "macos-arm64",
        ("windows", _) => "windows-x64",
        ("linux", "aarch64") => "linux-arm64",
        _ => "linux-x64",
    }
}

/// Blocking: call from a background thread.
pub fn check() -> anyhow::Result<Option<Available>> {
    let body = ureq::get(MANIFEST).timeout(Duration::from_secs(20)).call()?.into_string()?;
    let sig_b64 = ureq::get(&format!("{MANIFEST}.sig")).timeout(Duration::from_secs(20)).call()?.into_string()?;
    let key_bytes: [u8; 32] = base64::engine::general_purpose::STANDARD
        .decode(PUBLIC_KEY_B64)?
        .try_into()
        .map_err(|_| anyhow::anyhow!("bad public key"))?;
    let key = VerifyingKey::from_bytes(&key_bytes)?;
    let sig_bytes: [u8; 64] = base64::engine::general_purpose::STANDARD
        .decode(sig_b64.trim())?
        .try_into()
        .map_err(|_| anyhow::anyhow!("bad signature"))?;
    key.verify(body.as_bytes(), &Signature::from_bytes(&sig_bytes))
        .map_err(|_| anyhow::anyhow!("the update manifest is not signed by Redrob"))?;

    let m: serde_json::Value = serde_json::from_str(&body)?;
    let version = m["version"].as_str().unwrap_or_default().to_string();
    if !newer(&version, env!("CARGO_PKG_VERSION")) {
        return Ok(None);
    }
    let url = m["files"][platform()]["url"].as_str().unwrap_or_default().to_string();
    if !url.starts_with("https://cdn.redrob.ai/browser/") {
        return Ok(None);
    }
    Ok(Some(Available { version, url }))
}

/// Dotted-number comparison; a pre-release suffix (`-rc.1`) is never newer
/// than the same release without one.
fn newer(candidate: &str, current: &str) -> bool {
    fn parts(v: &str) -> (Vec<u64>, bool) {
        let (core, pre) = v.split_once('-').map(|(c, _)| (c, true)).unwrap_or((v, false));
        (core.split('.').map(|p| p.parse().unwrap_or(0)).collect(), pre)
    }
    let (a, a_pre) = parts(candidate);
    let (b, b_pre) = parts(current);
    match a.cmp(&b) {
        std::cmp::Ordering::Greater => true,
        std::cmp::Ordering::Less => false,
        std::cmp::Ordering::Equal => b_pre && !a_pre,
    }
}
