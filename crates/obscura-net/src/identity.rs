//! The browser identity the engine presents by default: current stable Chrome
//! on the operating system the engine actually runs on.
//!
//! The User-Agent header, `navigator.userAgent`, `navigator.platform`,
//! `navigator.userAgentData` and the `sec-ch-ua*` client hints are all derived
//! from these values, so a site sees one consistent browser. Claiming Windows
//! from a Mac or Linux machine disagrees with fonts, TLS and timing, and some
//! sites (Google sign-in, Drive) treat that mismatch as a bot signal.

/// Major version of current stable Chrome (desktop stable 156, October 2026).
pub const CHROME_MAJOR: u32 = 156;

#[cfg(target_os = "macos")]
mod host {
    pub const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
    pub const NAVIGATOR_PLATFORM: &str = "MacIntel";
    pub const UA_PLATFORM: &str = "macOS";
    pub const UA_PLATFORM_VERSION: &str = "15.5.0";
}

#[cfg(target_os = "windows")]
mod host {
    pub const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
    pub const NAVIGATOR_PLATFORM: &str = "Win32";
    pub const UA_PLATFORM: &str = "Windows";
    pub const UA_PLATFORM_VERSION: &str = "19.0.0";
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod host {
    pub const USER_AGENT: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
    pub const NAVIGATOR_PLATFORM: &str = "Linux x86_64";
    pub const UA_PLATFORM: &str = "Linux";
    pub const UA_PLATFORM_VERSION: &str = "6.8.0";
}

/// Chrome's reduced User-Agent string for this OS.
pub const DEFAULT_USER_AGENT: &str = host::USER_AGENT;
/// `navigator.platform` for this OS.
pub const DEFAULT_NAVIGATOR_PLATFORM: &str = host::NAVIGATOR_PLATFORM;
/// `navigator.userAgentData.platform` and `sec-ch-ua-platform` for this OS.
pub const DEFAULT_UA_PLATFORM: &str = host::UA_PLATFORM;
/// High-entropy `platformVersion` for this OS.
pub const DEFAULT_UA_PLATFORM_VERSION: &str = host::UA_PLATFORM_VERSION;
/// `Browser.getVersion` product string.
pub const DEFAULT_PRODUCT: &str = "Chrome/156.0.0.0";
