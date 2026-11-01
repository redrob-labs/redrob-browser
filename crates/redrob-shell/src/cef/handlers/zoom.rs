//! Page zoom: Ctrl +, Ctrl -, Ctrl 0, in Chrome's steps, remembered per
//! site like Chrome (every page of a site opens at the site's zoom).
//!
//! Chromium's zoom level is a power of 1.2: level `l` is `1.2^l` times 100%.

use cef::*;

use crate::profile::SiteSettings;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Step {
    In,
    Out,
    Reset,
}

/// Chrome's zoom presets, in percent.
pub const PRESETS: [u32; 17] = [
    25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500,
];

const KEY: &str = "zoom";

pub fn percent_of(level: f64) -> u32 {
    (1.2f64.powf(level) * 100.0).round() as u32
}

pub fn level_of(percent: u32) -> f64 {
    (percent as f64 / 100.0).ln() / 1.2f64.ln()
}

/// The preset one step from `percent`.
pub fn next(percent: u32, step: Step) -> u32 {
    match step {
        Step::Reset => 100,
        Step::In => PRESETS
            .iter()
            .copied()
            .find(|&p| p > percent)
            .unwrap_or(*PRESETS.last().expect("presets")),
        Step::Out => PRESETS
            .iter()
            .rev()
            .copied()
            .find(|&p| p < percent)
            .unwrap_or(PRESETS[0]),
    }
}

/// The site's saved zoom, in percent (100 when none).
pub fn saved(sites: &SiteSettings, url: &str) -> u32 {
    super::site_of(url)
        .and_then(|o| sites.get(&o, KEY))
        .and_then(|v| v.parse().ok())
        .filter(|p| (PRESETS[0]..=*PRESETS.last().expect("presets")).contains(p))
        .unwrap_or(100)
}

fn save(sites: &SiteSettings, url: &str, percent: u32) {
    if let Some(o) = super::site_of(url) {
        let v = percent.to_string();
        sites.set(&o, KEY, (percent != 100).then_some(v.as_str()));
    }
}

fn page_url(browser: &Browser) -> String {
    browser
        .main_frame()
        .map(|f| super::text(&f.url()))
        .unwrap_or_default()
}

fn apply(browser: &Browser, percent: u32) {
    if let Some(h) = browser.host() {
        h.set_zoom_level(level_of(percent));
    }
}

/// Zoom `browser` one step and remember it for the page's site. Returns the
/// new percent.
pub fn step(browser: &Browser, step: Step, sites: &SiteSettings) -> u32 {
    let current = browser
        .host()
        .map(|h| percent_of(h.zoom_level()))
        .unwrap_or(100);
    let p = next(current, step);
    apply(browser, p);
    save(sites, &page_url(browser), p);
    p
}

/// Give a page its site's zoom. The client calls this when the main frame's
/// address changes (`DisplayHandler::on_address_change`) and returns the
/// percent for `Event::Zoom`.
pub fn restore(browser: &Browser, url: &str, sites: &SiteSettings) -> u32 {
    let p = saved(sites, url);
    let current = browser
        .host()
        .map(|h| percent_of(h.zoom_level()))
        .unwrap_or(100);
    if current != p {
        apply(browser, p);
    }
    p
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn levels_and_percents_agree() {
        assert_eq!(percent_of(0.0), 100);
        assert_eq!(percent_of(1.0), 120);
        assert_eq!(percent_of(-1.0), 83);
        for p in PRESETS {
            assert_eq!(percent_of(level_of(p)), p);
        }
    }

    #[test]
    fn steps_follow_chromes_presets() {
        assert_eq!(next(100, Step::In), 110);
        assert_eq!(next(100, Step::Out), 90);
        assert_eq!(next(500, Step::In), 500);
        assert_eq!(next(25, Step::Out), 25);
        assert_eq!(next(115, Step::In), 125);
        assert_eq!(next(115, Step::Out), 110);
        assert_eq!(next(175, Step::Reset), 100);
    }

    #[test]
    fn zoom_is_remembered_per_site() {
        let sites = SiteSettings::memory();
        assert_eq!(saved(&sites, "https://a.example/x"), 100);
        save(&sites, "https://a.example/x", 125);
        assert_eq!(saved(&sites, "https://a.example/other/page"), 125);
        assert_eq!(saved(&sites, "https://b.example/"), 100);
        save(&sites, "https://a.example/", 100);
        assert_eq!(sites.get("https://a.example", KEY), None);
        sites.set("https://c.example", KEY, Some("9000"));
        assert_eq!(saved(&sites, "https://c.example/"), 100);
    }
}
