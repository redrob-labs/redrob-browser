//! Widevine, the DRM Netflix, Spotify, Disney+ and others play through.
//!
//! CEF's builds carry Widevine support but not the CDM itself.
//!
//! Windows and macOS: Chromium's component updater downloads it into the
//! profile's Chromium folder, as Chrome does. `install()` asks for it right
//! away instead of waiting for the updater's first round, so protected
//! video plays on the first visit. Needs: the app must not pass
//! `--disable-component-update`, and `root_cache_path` must be set (the
//! CDM is kept there between starts).
//!
//! Linux: Chromium's updater downloads the CDM too, but Chromium loads a
//! CDM only when it starts (before its zygote forks), from the folder the
//! hint file in its user data folder names
//! (`WidevineCdm/latest-component-updated-widevine-cdm`, which the updater
//! writes). So a download plays only from the next start, and CEF exposes
//! no Widevine component to ask for it sooner. [`prepare`] points the hint
//! at a CDM already on the machine when the profile has none of its own:
//! Google Chrome's, or one Chrome or Chromium downloaded. Protected media
//! then plays on the first start.

use std::path::{Path, PathBuf};

use cef::*;

/// The Widevine CDM's component id in Chromium's component updater.
pub const COMPONENT_ID: &str = "oimompecagnajdejgnnjijobebaeigek";

/// Whether this platform gets Widevine from CEF's component updater.
pub const SUPPORTED: bool = cfg!(any(target_os = "windows", target_os = "macos"));

wrap_component_update_callback! {
    struct Installed {}

    impl ComponentUpdateCallback {
        fn on_complete(&self, _component_id: Option<&CefString>, error: ComponentUpdateError) {
            if error != ComponentUpdateError::default() {
                eprintln!("redrob-browser: Widevine CDM update: {:?}", error);
            }
        }
    }
}

/// Fetch or update the Widevine CDM. Call on CEF's UI thread once CEF
/// started (`BrowserProcessHandler::on_context_initialized`).
pub fn install() {
    if !SUPPORTED {
        return;
    }
    let Some(updater) = component_updater_get() else {
        return;
    };
    let id = CefString::from(COMPONENT_ID);
    if updater.component_by_id(Some(&id)).is_none() {
        eprintln!("redrob-browser: this CEF build has no Widevine component");
        return;
    }
    let mut done = Installed::new();
    updater.update(
        Some(&id),
        ComponentUpdatePriority::FOREGROUND,
        Some(&mut done),
    );
}

/// The CDM's folder for this machine inside a `WidevineCdm` folder.
fn platform_dir() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "linux_arm64"
    } else {
        "linux_x64"
    }
}

/// Whether `dir` holds a Widevine CDM Chromium can load here.
pub fn is_cdm(dir: &Path) -> bool {
    dir.join("manifest.json").is_file()
        && dir
            .join("_platform_specific")
            .join(platform_dir())
            .join("libwidevinecdm.so")
            .is_file()
}

/// The CDM a Chrome or Chromium profile folder's hint names.
fn hinted(user_data: &Path) -> Option<PathBuf> {
    let hint = std::fs::read_to_string(
        user_data
            .join("WidevineCdm")
            .join("latest-component-updated-widevine-cdm"),
    )
    .ok()?;
    let v: serde_json::Value = serde_json::from_str(&hint).ok()?;
    Some(PathBuf::from(v["Path"].as_str()?))
}

/// A Widevine CDM on this machine: `REDROB_WIDEVINE_CDM`, an installed
/// Google Chrome's, then one Chrome or Chromium downloaded into its profile.
pub fn find(home: &Path, config: &Path) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(d) = std::env::var_os("REDROB_WIDEVINE_CDM") {
        candidates.push(PathBuf::from(d));
    }
    for c in ["chrome", "chrome-beta", "chrome-unstable"] {
        candidates.push(Path::new("/opt/google").join(c).join("WidevineCdm"));
    }
    for p in [
        "google-chrome",
        "google-chrome-beta",
        "google-chrome-unstable",
        "chromium",
    ] {
        candidates.extend(hinted(&config.join(p)));
    }
    // Flatpak Chrome keeps its profile in its own folder.
    candidates.extend(hinted(
        &home.join(".var/app/com.google.Chrome/config/google-chrome"),
    ));
    candidates.into_iter().find(|d| is_cdm(d))
}

/// Linux: when the profile has no CDM of its own, point Chromium at one on
/// the machine, through the hint file in `root` (its user data folder).
/// Call before Chromium starts.
pub fn prepare(root: &Path) {
    if !cfg!(target_os = "linux") {
        return;
    }
    let dir = root.join("WidevineCdm");
    let hint = dir.join("latest-component-updated-widevine-cdm");
    // The updater's own download (or one named before), kept current by it.
    if hinted(root).is_some_and(|d| is_cdm(&d)) {
        return;
    }
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_default();
    let config = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .unwrap_or_else(|| home.join(".config"));
    let Some(cdm) = find(&home, &config) else {
        eprintln!(
            "redrob-browser: no Widevine CDM yet; protected media plays once Chromium downloaded it, from the next start"
        );
        return;
    };
    let body = serde_json::json!({ "Path": cdm.to_string_lossy() }).to_string();
    if std::fs::create_dir_all(&dir)
        .and_then(|_| std::fs::write(&hint, body))
        .is_err()
    {
        eprintln!("redrob-browser: could not write {}", hint.display());
    }
}
