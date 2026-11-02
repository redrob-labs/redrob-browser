//! Widevine, the DRM Netflix, Spotify, Disney+ and others play through.
//!
//! CEF's builds carry Widevine support but not the CDM itself: Chromium's
//! component updater downloads it into the profile's Chromium folder, as
//! Chrome does. `install()` asks for it right away instead of waiting for
//! the updater's first round, so protected video plays on the first visit.
//! Windows and macOS only; CEF on Linux has no Widevine.
//!
//! Needs: the app must not pass `--disable-component-update`, and
//! `root_cache_path` must be set (the CDM is kept there between starts).

use cef::*;

/// The Widevine CDM's component id in Chromium's component updater.
pub const COMPONENT_ID: &str = "oimompecagnajdejgnnjijobebaeigek";

/// Whether this platform gets Widevine from CEF.
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
    updater.update(Some(&id), ComponentUpdatePriority::FOREGROUND, Some(&mut done));
}

