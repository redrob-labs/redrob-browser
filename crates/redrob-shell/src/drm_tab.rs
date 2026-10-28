//! Protected video (docs/DRM.md).
//!
//! The engine has no vendor DRM module. When a page asks for Widevine,
//! PlayReady or FairPlay, the engine rejects it and reports it through the
//! `redrobDrm` binding; the window then shows a bar on that tab offering to
//! open the page where it can play: a protected tab (the OS web view, in the
//! `redrob-browser-protected` program; Windows and macOS) or the default
//! browser.

use std::collections::HashMap;

use crate::i18n::{t, tf};
use crate::model::TabId;

/// Whether this build can open a protected tab.
pub const PROTECTED_TAB: bool = cfg!(any(target_os = "windows", target_os = "macos"));

#[derive(Default)]
pub struct Offers {
    /// Tabs whose page asked for DRM, with the key system it asked for.
    by_tab: HashMap<TabId, String>,
}

pub enum Choice {
    None,
    /// Show this message under the toolbar.
    Notice(String),
}

impl Offers {
    pub fn requested(&mut self, tab: TabId, key_system: String) {
        self.by_tab.insert(tab, key_system);
    }

    /// The tab left the page, or closed.
    pub fn clear(&mut self, tab: TabId) {
        self.by_tab.remove(&tab);
    }

    /// Draw the bar for the tab on screen, if its page asked for DRM.
    pub fn bar(&mut self, ui: &mut egui::Ui, tab: Option<TabId>, url: &str) -> Choice {
        let Some(tab) = tab else { return Choice::None };
        if !self.by_tab.contains_key(&tab) {
            return Choice::None;
        }
        let mut choice = Choice::None;
        let mut dismiss = false;
        ui.horizontal(|ui| {
            ui.label(t("This video is protected. Open it where it can play?"));
            if PROTECTED_TAB && ui.small_button(t("Open in a protected tab")).clicked() {
                dismiss = true;
                if let Err(e) = open_protected(url) {
                    choice = Choice::Notice(tf("Could not open a protected tab: {0}", &[&e]));
                }
            }
            if ui.small_button(t("Open in your default browser")).clicked() {
                dismiss = true;
                if let Err(e) = open_default(url) {
                    choice = Choice::Notice(tf("Could not open your default browser: {0}", &[&e]));
                }
            }
            if ui.small_button(t("Not now")).clicked() {
                dismiss = true;
            }
        });
        if dismiss {
            self.by_tab.remove(&tab);
        }
        choice
    }
}

/// Only http(s) pages leave the window: never a file or script URL.
fn web_url(url: &str) -> anyhow::Result<String> {
    let u = url::Url::parse(url)?;
    if !matches!(u.scheme(), "http" | "https") {
        anyhow::bail!("not a web page: {}", u.scheme());
    }
    Ok(u.to_string())
}

/// Start `redrob-browser-protected <url> <lang>` from next to this program.
fn open_protected(url: &str) -> anyhow::Result<()> {
    let url = web_url(url)?;
    let name = if cfg!(windows) { "redrob-browser-protected.exe" } else { "redrob-browser-protected" };
    let exe = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join(name)))
        .unwrap_or_else(|| std::path::PathBuf::from(name));
    std::process::Command::new(&exe)
        .arg(url)
        .arg(crate::i18n::code(crate::i18n::current()))
        .stdin(std::process::Stdio::null())
        .spawn()
        .map_err(|e| anyhow::anyhow!("{}: {e}", exe.display()))?;
    Ok(())
}

/// The person's default browser. `open` passes the URL as one argument
/// (xdg-open, open, or PowerShell's Start-Process), never through a shell line.
fn open_default(url: &str) -> anyhow::Result<()> {
    let url = web_url(url)?;
    open::that_detached(url)?;
    Ok(())
}
