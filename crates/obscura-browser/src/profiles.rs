pub struct BrowserProfile {
    pub user_agent: &'static str,
    pub platform: &'static str,
    pub ua_platform: &'static str,
    pub ua_platform_version: &'static str,
}

/// Current stable Chrome on each desktop OS. `OBSCURA_PROFILE=<index>` pins
/// one; the default is the profile for the OS the engine runs on, so the UA,
/// `navigator.platform`, `userAgentData` and `sec-ch-ua*` match the machine.
pub static PROFILES: &[BrowserProfile] = &[
    BrowserProfile {
        user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
        platform: "Win32",
        ua_platform: "Windows",
        ua_platform_version: "19.0.0",
    },
    BrowserProfile {
        user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
        platform: "MacIntel",
        ua_platform: "macOS",
        ua_platform_version: "15.5.0",
    },
    BrowserProfile {
        user_agent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
        platform: "Linux x86_64",
        ua_platform: "Linux",
        ua_platform_version: "6.8.0",
    },
];

/// The profile for the OS this engine runs on.
pub fn host_profile() -> &'static BrowserProfile {
    PROFILES
        .iter()
        .find(|profile| profile.user_agent == obscura_net::identity::DEFAULT_USER_AGENT)
        .unwrap_or(&PROFILES[0])
}

pub fn random_profile() -> &'static BrowserProfile {
    let idx = (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos() as usize)
        % PROFILES.len();
    &PROFILES[idx]
}

/// Pick the profile for a new browser context.
///
/// The default is the host OS profile, a single stable identity. Cycling through different browser
/// identities from one address is itself a bot signal (a real address maps to a
/// stable device), and the rotated profile does not yet carry a matching TLS or
/// timezone fingerprint, so rotation is opt-in:
///   OBSCURA_PROFILE=<index>   pin a specific profile from PROFILES
///   OBSCURA_ROTATE_PROFILE=1  pick a random profile per context
pub fn select_profile() -> &'static BrowserProfile {
    if let Some(idx) = std::env::var("OBSCURA_PROFILE")
        .ok()
        .as_deref()
        .map(str::trim)
        .and_then(|s| s.parse::<usize>().ok())
    {
        if idx < PROFILES.len() {
            return &PROFILES[idx];
        }
    }
    if env_enabled("OBSCURA_ROTATE_PROFILE") {
        return random_profile();
    }
    host_profile()
}

fn env_enabled(key: &str) -> bool {
    matches!(
        std::env::var(key)
            .ok()
            .as_deref()
            .map(str::trim)
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("1") | Some("true") | Some("yes") | Some("on")
    )
}
