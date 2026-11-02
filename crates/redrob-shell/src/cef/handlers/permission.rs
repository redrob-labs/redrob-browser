//! Site permissions: camera, microphone, screen sharing, location,
//! notifications, the clipboard and the rest Chromium asks about.
//!
//! A choice the person made for a site is answered at once. Otherwise the
//! window shows `Event::Permission` with Allow, Allow this time and Block,
//! like Chrome; Allow and Block are remembered for the site (the origin),
//! "this time" is not. Incognito remembers in memory only.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use cef::sys::{cef_media_access_permission_types_t as M, cef_permission_request_types_t as P};
use cef::*;

use crate::cdp::Event;
use crate::cef::Sink;
use crate::profile::SiteSettings;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Kind {
    Camera,
    Microphone,
    /// Sharing a screen, window or tab.
    Screen,
    Location,
    Notifications,
    Clipboard,
    Midi,
    /// Several files downloaded one after another.
    Downloads,
    Storage,
    Fonts,
    Windows,
    Idle,
    /// Open links of a kind (`registerProtocolHandler`, mailto:).
    Protocols,
    /// Edit files and folders (File System Access).
    Files,
    /// Take the keyboard (Escape, system keys) in fullscreen.
    Keyboard,
    /// Hide and take the mouse pointer.
    Pointer,
    /// Reach devices on the local network.
    LocalNetwork,
    /// Motion sensors.
    Sensors,
    /// Play protected content (identifies the device).
    ProtectedMedia,
    /// Virtual or augmented reality, hand tracking.
    Xr,
    /// Sign in with an identity provider.
    Identity,
    /// Install itself as an app.
    Install,
    /// Scroll and zoom a tab it captures.
    CapturedSurface,
    /// A permission with no name of its own here: the CEF bit.
    Other(u32),
}

impl Kind {
    /// The key a choice is saved under.
    pub fn key(self) -> String {
        let name = match self {
            Kind::Camera => "camera",
            Kind::Microphone => "microphone",
            Kind::Screen => "screen",
            Kind::Location => "location",
            Kind::Notifications => "notifications",
            Kind::Clipboard => "clipboard",
            Kind::Midi => "midi",
            Kind::Downloads => "downloads",
            Kind::Storage => "storage",
            Kind::Fonts => "fonts",
            Kind::Windows => "windows",
            Kind::Idle => "idle",
            Kind::Protocols => "protocols",
            Kind::Files => "files",
            Kind::Keyboard => "keyboard",
            Kind::Pointer => "pointer",
            Kind::LocalNetwork => "local_network",
            Kind::Sensors => "sensors",
            Kind::ProtectedMedia => "protected_media",
            Kind::Xr => "xr",
            Kind::Identity => "identity",
            Kind::Install => "install",
            Kind::CapturedSurface => "captured_surface",
            Kind::Other(bit) => return format!("permission.other.{bit}"),
        };
        format!("permission.{name}")
    }

    /// The kind saved under `key` ([`Kind::key`]).
    pub fn from_key(key: &str) -> Option<Kind> {
        const KINDS: [Kind; 24] = [
            Kind::Camera,
            Kind::Microphone,
            Kind::Screen,
            Kind::Location,
            Kind::Notifications,
            Kind::Clipboard,
            Kind::Midi,
            Kind::Downloads,
            Kind::Storage,
            Kind::Fonts,
            Kind::Windows,
            Kind::Idle,
            Kind::Protocols,
            Kind::Files,
            Kind::Keyboard,
            Kind::Pointer,
            Kind::LocalNetwork,
            Kind::Sensors,
            Kind::ProtectedMedia,
            Kind::Xr,
            Kind::Identity,
            Kind::Install,
            Kind::CapturedSurface,
            Kind::Other(0),
        ];
        if let Some(bit) = key
            .strip_prefix("permission.other.")
            .and_then(|b| b.parse().ok())
        {
            return Some(Kind::Other(bit));
        }
        KINDS.into_iter().find(|k| k.key() == key)
    }

    /// What the prompt says the site wants to do (English; ui.rs translates).
    pub fn label(self) -> &'static str {
        match self {
            Kind::Camera => "Use your camera",
            Kind::Microphone => "Use your microphone",
            Kind::Screen => "Share your screen",
            Kind::Location => "Know your location",
            Kind::Notifications => "Show notifications",
            Kind::Clipboard => "See text and images copied to the clipboard",
            Kind::Midi => "Control MIDI devices",
            Kind::Downloads => "Download multiple files",
            Kind::Storage => "Use cookies and data across sites",
            Kind::Fonts => "Use the fonts on your computer",
            Kind::Windows => "Manage windows on all your displays",
            Kind::Idle => "Know when you're actively using this device",
            Kind::Protocols => "Open a type of link",
            Kind::Files => "Edit files and folders on your device",
            Kind::Keyboard => "Use your keyboard",
            Kind::Pointer => "Use and move your mouse pointer",
            Kind::LocalNetwork => "Look for and connect to devices on your local network",
            Kind::Sensors => "Use your motion sensors",
            Kind::ProtectedMedia => "Play protected content",
            Kind::Xr => "Use your virtual reality device",
            Kind::Identity => "Sign you in with an identity service",
            Kind::Install => "Install itself as an app",
            Kind::CapturedSurface => "Scroll and zoom the tab you share",
            Kind::Other(_) => "Use another feature of your computer",
        }
    }
}

/// The kinds in a permission prompt's `requested_permissions`.
pub fn prompt_kinds(bits: u32) -> Vec<Kind> {
    let named = [
        (P::CEF_PERMISSION_TYPE_CAMERA_STREAM, Kind::Camera),
        (P::CEF_PERMISSION_TYPE_CAMERA_PAN_TILT_ZOOM, Kind::Camera),
        (P::CEF_PERMISSION_TYPE_MIC_STREAM, Kind::Microphone),
        (P::CEF_PERMISSION_TYPE_GEOLOCATION, Kind::Location),
        (P::CEF_PERMISSION_TYPE_NOTIFICATIONS, Kind::Notifications),
        (P::CEF_PERMISSION_TYPE_CLIPBOARD, Kind::Clipboard),
        (P::CEF_PERMISSION_TYPE_MIDI_SYSEX, Kind::Midi),
        (P::CEF_PERMISSION_TYPE_MULTIPLE_DOWNLOADS, Kind::Downloads),
        (P::CEF_PERMISSION_TYPE_STORAGE_ACCESS, Kind::Storage),
        (
            P::CEF_PERMISSION_TYPE_TOP_LEVEL_STORAGE_ACCESS,
            Kind::Storage,
        ),
        (P::CEF_PERMISSION_TYPE_LOCAL_FONTS, Kind::Fonts),
        (P::CEF_PERMISSION_TYPE_WINDOW_MANAGEMENT, Kind::Windows),
        (P::CEF_PERMISSION_TYPE_IDLE_DETECTION, Kind::Idle),
        (
            P::CEF_PERMISSION_TYPE_REGISTER_PROTOCOL_HANDLER,
            Kind::Protocols,
        ),
        (P::CEF_PERMISSION_TYPE_FILE_SYSTEM_ACCESS, Kind::Files),
        (P::CEF_PERMISSION_TYPE_KEYBOARD_LOCK, Kind::Keyboard),
        (P::CEF_PERMISSION_TYPE_POINTER_LOCK, Kind::Pointer),
        (
            P::CEF_PERMISSION_TYPE_LOCAL_NETWORK_ACCESS_DEPRECATED,
            Kind::LocalNetwork,
        ),
        (P::CEF_PERMISSION_TYPE_LOCAL_NETWORK, Kind::LocalNetwork),
        (P::CEF_PERMISSION_TYPE_LOOPBACK_NETWORK, Kind::LocalNetwork),
        (P::CEF_PERMISSION_TYPE_SENSORS, Kind::Sensors),
        (
            P::CEF_PERMISSION_TYPE_PROTECTED_MEDIA_IDENTIFIER,
            Kind::ProtectedMedia,
        ),
        (P::CEF_PERMISSION_TYPE_AR_SESSION, Kind::Xr),
        (P::CEF_PERMISSION_TYPE_VR_SESSION, Kind::Xr),
        (P::CEF_PERMISSION_TYPE_HAND_TRACKING, Kind::Xr),
        (P::CEF_PERMISSION_TYPE_IDENTITY_PROVIDER, Kind::Identity),
        (P::CEF_PERMISSION_TYPE_WEB_APP_INSTALLATION, Kind::Install),
        (
            P::CEF_PERMISSION_TYPE_CAPTURED_SURFACE_CONTROL,
            Kind::CapturedSurface,
        ),
    ];
    let mut out = Vec::new();
    for bit in (0..32).map(|i| 1u32 << i).filter(|b| bits & b != 0) {
        let kind = named
            .iter()
            .find(|(p, _)| *p as u32 == bit)
            .map(|(_, k)| *k)
            .unwrap_or(Kind::Other(bit));
        if !out.contains(&kind) {
            out.push(kind);
        }
    }
    out
}

/// The kinds in a media access request (`getUserMedia`, `getDisplayMedia`).
pub fn media_kinds(bits: u32) -> Vec<Kind> {
    let mut out = Vec::new();
    if bits & M::CEF_MEDIA_PERMISSION_DEVICE_VIDEO_CAPTURE as u32 != 0 {
        out.push(Kind::Camera);
    }
    if bits & M::CEF_MEDIA_PERMISSION_DEVICE_AUDIO_CAPTURE as u32 != 0 {
        out.push(Kind::Microphone);
    }
    let desktop = M::CEF_MEDIA_PERMISSION_DESKTOP_AUDIO_CAPTURE as u32
        | M::CEF_MEDIA_PERMISSION_DESKTOP_VIDEO_CAPTURE as u32;
    if bits & desktop != 0 {
        out.push(Kind::Screen);
    }
    out
}

/// Whether a media request shares a screen, window or tab
/// (`getDisplayMedia`) rather than a camera or microphone.
pub fn is_display_capture(bits: u32) -> bool {
    let desktop = M::CEF_MEDIA_PERMISSION_DESKTOP_AUDIO_CAPTURE as u32
        | M::CEF_MEDIA_PERMISSION_DESKTOP_VIDEO_CAPTURE as u32;
    bits & desktop != 0
}

/// The media bits of `requested` that `allowed` kinds cover.
pub fn media_bits(requested: u32, allowed: &[Kind]) -> u32 {
    let mut out = 0;
    let parts = [
        (M::CEF_MEDIA_PERMISSION_DEVICE_VIDEO_CAPTURE, Kind::Camera),
        (
            M::CEF_MEDIA_PERMISSION_DEVICE_AUDIO_CAPTURE,
            Kind::Microphone,
        ),
        (M::CEF_MEDIA_PERMISSION_DESKTOP_AUDIO_CAPTURE, Kind::Screen),
        (M::CEF_MEDIA_PERMISSION_DESKTOP_VIDEO_CAPTURE, Kind::Screen),
    ];
    for (bit, kind) in parts {
        if requested & bit as u32 != 0 && allowed.contains(&kind) {
            out |= bit as u32;
        }
    }
    out
}

/// What the person chose for each kind on a site, so far.
#[derive(Default, Debug, PartialEq)]
pub struct Known {
    pub allowed: Vec<Kind>,
    pub blocked: Vec<Kind>,
    pub undecided: Vec<Kind>,
}

pub fn known(sites: &SiteSettings, origin: &str, kinds: &[Kind]) -> Known {
    let mut k = Known::default();
    for &kind in kinds {
        match sites.get(origin, &kind.key()).as_deref() {
            Some("allow") => k.allowed.push(kind),
            Some("block") => k.blocked.push(kind),
            _ => k.undecided.push(kind),
        }
    }
    k
}

/// The person's answer to a prompt.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Answer {
    /// Allow, and remember it for the site.
    Allow,
    /// Allow until the page is closed; ask again next time.
    AllowOnce,
    /// Block, and remember it for the site.
    Block,
    /// Closed the prompt without choosing: deny, ask again next time.
    Dismiss,
}

enum Callback {
    Media {
        callback: MediaAccessCallback,
        requested: u32,
    },
    Prompt(PermissionPromptCallback),
}

/// A question for the person, carried by `Event::Permission`.
pub struct Prompt {
    pub origin: String,
    /// Only the kinds the person has not decided yet.
    pub kinds: Vec<Kind>,
    /// Kinds the site already has.
    already_allowed: Vec<Kind>,
    callback: Callback,
    sites: SiteSettings,
    open: Arc<AtomicBool>,
    pub prompt_id: u64,
}

impl Prompt {
    /// False once the page went away and Chromium took the prompt back.
    pub fn is_open(&self) -> bool {
        self.open.load(Ordering::Relaxed)
    }

    pub fn answer(self, answer: Answer) {
        if !self.open.swap(false, Ordering::Relaxed) {
            return;
        }
        let remembered = match answer {
            Answer::Allow => Some("allow"),
            Answer::Block => Some("block"),
            Answer::AllowOnce | Answer::Dismiss => None,
        };
        if let Some(v) = remembered {
            for k in &self.kinds {
                self.sites.set(&self.origin, &k.key(), Some(v));
            }
        }
        let allow = matches!(answer, Answer::Allow | Answer::AllowOnce);
        let mut allowed = self.already_allowed.clone();
        if allow {
            allowed.extend(&self.kinds);
        }
        match self.callback {
            Callback::Media {
                callback,
                requested,
            } => {
                let bits = media_bits(requested, &allowed);
                super::on_ui(move || {
                    if bits == 0 {
                        callback.cancel();
                    } else {
                        callback.cont(bits);
                    }
                });
            }
            Callback::Prompt(callback) => {
                let result = match answer {
                    Answer::Allow | Answer::AllowOnce => PermissionRequestResult::ACCEPT,
                    Answer::Block => PermissionRequestResult::DENY,
                    Answer::Dismiss => PermissionRequestResult::DISMISS,
                };
                super::on_ui(move || callback.cont(result));
            }
        }
    }
}

/// Open prompts by id, so a dismissal from Chromium can close them.
fn open_prompts() -> &'static std::sync::Mutex<std::collections::HashMap<u64, Arc<AtomicBool>>> {
    static OPEN: std::sync::OnceLock<
        std::sync::Mutex<std::collections::HashMap<u64, Arc<AtomicBool>>>,
    > = std::sync::OnceLock::new();
    OPEN.get_or_init(Default::default)
}

/// Ids for media prompts, which Chromium does not number; kept apart from
/// Chromium's prompt ids by the top bit.
fn next_media_id() -> u64 {
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1 << 63);
    NEXT.fetch_add(1, Ordering::Relaxed)
}

wrap_permission_handler! {
    struct Permissions {
        sink: Sink,
        sites: SiteSettings,
    }

    impl PermissionHandler {
        fn on_request_media_access_permission(
            &self,
            browser: Option<&mut Browser>,
            _frame: Option<&mut Frame>,
            requesting_origin: Option<&CefString>,
            requested_permissions: u32,
            callback: Option<&mut MediaAccessCallback>,
        ) -> ::std::os::raw::c_int {
            let (Some(browser), Some(callback)) = (browser, callback) else {
                return 0;
            };
            // Sharing a screen, window or tab: Chrome's own picker, which
            // asks which one (the window cannot list them).
            if is_display_capture(requested_permissions) && crate::cef::native::chrome_style() {
                return 0;
            }
            let Some(origin) = super::site_of(&super::arg(requesting_origin)) else {
                return 0;
            };
            let k = known(&self.sites, &origin, &media_kinds(requested_permissions));
            if k.undecided.is_empty() || !k.blocked.is_empty() {
                let bits = media_bits(requested_permissions, &k.allowed);
                // A blocked device turns the whole request down, as in Chrome.
                if bits == 0 || !k.blocked.is_empty() {
                    callback.cancel();
                } else {
                    callback.cont(bits);
                }
                return 1;
            }
            self.ask(
                browser.identifier(),
                next_media_id(),
                origin,
                k,
                Callback::Media {
                    callback: callback.clone(),
                    requested: requested_permissions,
                },
            );
            1
        }

        fn on_show_permission_prompt(
            &self,
            browser: Option<&mut Browser>,
            prompt_id: u64,
            requesting_origin: Option<&CefString>,
            requested_permissions: u32,
            callback: Option<&mut PermissionPromptCallback>,
        ) -> ::std::os::raw::c_int {
            let (Some(browser), Some(callback)) = (browser, callback) else {
                return 0;
            };
            let Some(origin) = super::site_of(&super::arg(requesting_origin)) else {
                return 0;
            };
            let k = known(&self.sites, &origin, &prompt_kinds(requested_permissions));
            if !k.blocked.is_empty() {
                callback.cont(PermissionRequestResult::DENY);
                return 1;
            }
            if k.undecided.is_empty() {
                callback.cont(PermissionRequestResult::ACCEPT);
                return 1;
            }
            self.ask(browser.identifier(), prompt_id, origin, k, Callback::Prompt(callback.clone()));
            1
        }

        fn on_dismiss_permission_prompt(
            &self,
            _browser: Option<&mut Browser>,
            prompt_id: u64,
            _result: PermissionRequestResult,
        ) {
            if let Some(open) = open_prompts().lock().ok().and_then(|mut o| o.remove(&prompt_id)) {
                open.store(false, Ordering::Relaxed);
            }
        }
    }
}

impl Permissions {
    fn ask(&self, browser_id: i32, prompt_id: u64, origin: String, k: Known, callback: Callback) {
        let open = Arc::new(AtomicBool::new(true));
        if let Ok(mut o) = open_prompts().lock() {
            o.retain(|_, v| v.load(Ordering::Relaxed));
            o.insert(prompt_id, open.clone());
        }
        let prompt = Prompt {
            origin,
            kinds: k.undecided,
            already_allowed: k.allowed,
            callback,
            sites: self.sites.clone(),
            open,
            prompt_id,
        };
        if self.sink.tab_of(browser_id).is_some() {
            self.sink.send(browser_id, Event::Permission(prompt));
        } else {
            // No tab to show it in: nobody can answer, so turn it down.
            prompt.answer(Answer::Dismiss);
        }
    }
}

/// The permission handler. `sites` is where choices are remembered: the
/// profile's (`SiteSettings::open`) or, for incognito, `SiteSettings::memory()`.
pub fn new(sink: Sink, sites: SiteSettings) -> PermissionHandler {
    Permissions::new(sink, sites)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_bits_name_their_kinds() {
        let bits = P::CEF_PERMISSION_TYPE_GEOLOCATION as u32
            | P::CEF_PERMISSION_TYPE_NOTIFICATIONS as u32
            | P::CEF_PERMISSION_TYPE_CLIPBOARD as u32;
        assert_eq!(
            prompt_kinds(bits),
            vec![Kind::Clipboard, Kind::Location, Kind::Notifications]
        );
        let cam = P::CEF_PERMISSION_TYPE_CAMERA_STREAM as u32
            | P::CEF_PERMISSION_TYPE_CAMERA_PAN_TILT_ZOOM as u32
            | P::CEF_PERMISSION_TYPE_MIC_STREAM as u32;
        assert_eq!(prompt_kinds(cam), vec![Kind::Camera, Kind::Microphone]);
        let ar = P::CEF_PERMISSION_TYPE_AR_SESSION as u32;
        assert_eq!(prompt_kinds(ar), vec![Kind::Other(ar)]);
    }

    #[test]
    fn media_bits_follow_the_allowed_kinds() {
        let v = M::CEF_MEDIA_PERMISSION_DEVICE_VIDEO_CAPTURE as u32;
        let a = M::CEF_MEDIA_PERMISSION_DEVICE_AUDIO_CAPTURE as u32;
        assert_eq!(media_kinds(v | a), vec![Kind::Camera, Kind::Microphone]);
        assert_eq!(media_bits(v | a, &[Kind::Camera]), v);
        assert_eq!(media_bits(v | a, &[Kind::Camera, Kind::Microphone]), v | a);
        assert_eq!(media_bits(a, &[Kind::Camera]), 0);
    }

    #[test]
    fn choices_are_remembered_per_site() {
        let sites = SiteSettings::memory();
        let kinds = [Kind::Camera, Kind::Location];
        assert_eq!(
            known(&sites, "https://a.example", &kinds).undecided,
            kinds.to_vec()
        );
        sites.set("https://a.example", &Kind::Camera.key(), Some("allow"));
        sites.set("https://a.example", &Kind::Location.key(), Some("block"));
        let k = known(&sites, "https://a.example", &kinds);
        assert_eq!(k.allowed, vec![Kind::Camera]);
        assert_eq!(k.blocked, vec![Kind::Location]);
        assert!(k.undecided.is_empty());
        // Another site starts fresh.
        assert_eq!(
            known(&sites, "https://b.example", &kinds).undecided.len(),
            2
        );
        for k in kinds {
            sites.set("https://a.example", &k.key(), None);
        }
        assert_eq!(
            known(&sites, "https://a.example", &kinds).undecided.len(),
            2
        );
    }
}
