//! Update check. Once a day the window asks GitHub for the latest release of
//! redrob-labs/redrob-browser and, when it is newer, offers the package for
//! this platform.
//!
//! There is no separate update signature: the download comes from GitHub
//! over HTTPS, and the packages themselves are signed for the OS (Developer
//! ID and notarization on macOS, Authenticode on Windows). Only asset URLs
//! under this repository's releases are offered. `self_update` installs the
//! package in place after checking it against the release's `SHA256SUMS.txt`.

use std::time::Duration;

const LATEST: &str = "https://api.github.com/repos/redrob-labs/redrob-browser/releases/latest";
pub const DOWNLOAD_PREFIX: &str = "https://github.com/redrob-labs/redrob-browser/releases/download/";
/// Written over every asset by the org `release-publish.yml` workflow.
const SUMS_NAME: &str = "SHA256SUMS.txt";
pub const CHECK_EVERY_SECS: u64 = 24 * 60 * 60;

#[derive(Clone)]
pub struct Available {
    pub version: String,
    pub url: String,
    /// The release's `SHA256SUMS.txt`, when it has one.
    pub sums: Option<String>,
}

/// The part of the asset name that names this platform.
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
    let release: serde_json::Value = ureq::get(LATEST)
        .set("Accept", "application/vnd.github+json")
        .set("User-Agent", concat!("redrob-browser/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(20))
        .call()?
        .into_json()?;
    if release["draft"].as_bool() == Some(true) || release["prerelease"].as_bool() == Some(true) {
        return Ok(None);
    }
    let version = release["tag_name"].as_str().unwrap_or_default().trim_start_matches('v').to_string();
    if !newer(&version, env!("CARGO_PKG_VERSION")) {
        return Ok(None);
    }
    let wanted = format!("redrob-browser-{}-", platform());
    let assets = || release["assets"].as_array().into_iter().flatten();
    let url = assets()
        .filter(|a| a["name"].as_str().is_some_and(|n| n.starts_with(&wanted)))
        .filter_map(|a| a["browser_download_url"].as_str())
        .find(|u| u.starts_with(DOWNLOAD_PREFIX))
        .map(str::to_string);
    let sums = assets()
        .filter(|a| a["name"].as_str() == Some(SUMS_NAME))
        .filter_map(|a| a["browser_download_url"].as_str())
        .find(|u| u.starts_with(DOWNLOAD_PREFIX))
        .map(str::to_string);
    Ok(url.map(|url| Available { version, url, sums }))
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
